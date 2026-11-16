const GUARD_ID = "tabfence-guard";
const SETTINGS_KEY = "settings";
const badgeQueues = new Map();
const explicitGestures = new Map();
const contextLinks = new Map();
const handledTargetIds = new Set();
const EXPLICIT_GESTURE_TTL_MS = 1500;
const CONTEXT_LINK_TTL_MS = 30000;
const DEBUG = "[TabFence debug-202603]";
let settingsCache;
let registrationSync = Promise.resolve();

async function setBadge(tabId, count) {
  await chrome.action.setBadgeText({ tabId, text: count ? String(count) : "" });
}

function updateBadge(tabId, count) {
  const previous = badgeQueues.get(tabId) || Promise.resolve();
  const next = previous
    .then(async () => {
      const nextCount = count ?? ((Number.parseInt(await chrome.action.getBadgeText({ tabId }), 10) || 0) + 1);
      await setBadge(tabId, nextCount);
    })
    .catch(() => {});
  badgeQueues.set(tabId, next);
}

async function loadSettings() {
  if (settingsCache) return settingsCache;
  const { [SETTINGS_KEY]: stored = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  settingsCache = { enabled: true, allowedHosts: [], showNotifications: true, ...stored };
  return settingsCache;
}

async function syncGuardRegistration() {
  const settings = await loadSettings();

  const [registered] = await chrome.scripting.getRegisteredContentScripts({ ids: [GUARD_ID] });
  if (!settings.enabled) {
    if (registered) await chrome.scripting.unregisterContentScripts({ ids: [GUARD_ID] });
    console.log("[TabFence debug-202603]", "guard disabled");
    return;
  }

  const scripts = [
    {
      id: GUARD_ID,
      matches: ["http://*/*", "https://*/*"],
      excludeMatches: settings.allowedHosts.map((host) => `*://${host}/*`),
      js: ["src/policy.js", "src/guard.js"],
      runAt: "document_start",
      allFrames: true,
      matchOriginAsFallback: true,
      world: "MAIN",
      persistAcrossSessions: true
    }
  ];
  // Updating in place preserves the previous guard if the browser rejects a change.
  if (registered) await chrome.scripting.updateContentScripts(scripts);
  else await chrome.scripting.registerContentScripts(scripts);
  console.log("[TabFence debug-202603]", "guard registered", settings.allowedHosts.length);
}

function scheduleGuardSync() {
  registrationSync = registrationSync.catch(() => {}).then(syncGuardRegistration);
  return registrationSync;
}

chrome.runtime.onInstalled.addListener(() => scheduleGuardSync().catch(() => {}));
chrome.runtime.onStartup.addListener(() => scheduleGuardSync().catch(() => {}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[SETTINGS_KEY]) return;
  const { oldValue = {}, newValue = {} } = changes[SETTINGS_KEY];
  settingsCache = { enabled: true, allowedHosts: [], showNotifications: true, ...newValue };
  if ((oldValue.enabled ?? true) === settingsCache.enabled &&
      JSON.stringify(oldValue.allowedHosts || []) === JSON.stringify(settingsCache.allowedHosts)) return;
  scheduleGuardSync().catch((error) => console.warn(DEBUG, "guard sync failed", error));
});

async function showBlockedNotice(tabId) {
  const settings = await loadSettings();
  if (settings.showNotifications) {
    chrome.tabs.sendMessage(tabId, { type: "show-blocked-notice" }, { frameId: 0 }).catch(() => {});
  }
}

function gestureKey(tabId, frameId) {
  return `${tabId}:${frameId}`;
}

function consumeExplicitGesture(tabId, frameId) {
  const key = gestureKey(tabId, frameId);
  const expiresAt = explicitGestures.get(key) || 0;
  explicitGestures.delete(key);
  return expiresAt > Date.now();
}

function consumeExplicitGestureForTab(tabId) {
  for (const [key, expiresAt] of explicitGestures) {
    if (!key.startsWith(`${tabId}:`)) continue;
    explicitGestures.delete(key);
    if (expiresAt > Date.now()) return true;
  }
  return false;
}

function hasContextLink(tabId) {
  for (const [key, link] of contextLinks) {
    if (key.startsWith(`${tabId}:`) && link.expiresAt > Date.now()) return true;
  }
  return false;
}

function consumeContextLink(tabId, frameId, url) {
  const key = gestureKey(tabId, frameId);
  const link = contextLinks.get(key);
  if (!link || link.url !== url || link.expiresAt <= Date.now()) return false;
  contextLinks.delete(key);
  return true;
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "explicit-new-tab-gesture" && sender.tab?.id) {
    for (const [key, expiresAt] of explicitGestures) {
      if (expiresAt <= Date.now()) explicitGestures.delete(key);
    }
    explicitGestures.set(gestureKey(sender.tab.id, sender.frameId), Date.now() + EXPLICIT_GESTURE_TTL_MS);
    return;
  }

  if (message.type === "context-link" && sender.tab?.id && typeof message.url === "string" && /^https?:\/\//i.test(message.url)) {
    for (const [key, link] of contextLinks) {
      if (link.expiresAt <= Date.now()) contextLinks.delete(key);
    }
    contextLinks.set(gestureKey(sender.tab.id, sender.frameId), {
      url: message.url,
      expiresAt: Date.now() + CONTEXT_LINK_TTL_MS
    });
    return;
  }

  if (message.type === "blocked" && sender.tab?.id) {
    console.log(DEBUG, "badge increment", sender.tab.id);
    updateBadge(sender.tab.id);
    showBlockedNotice(sender.tab.id).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "sync-protection") {
    settingsCache = undefined;
    scheduleGuardSync().then(
      () => sendResponse({ ok: true }),
      () => sendResponse({ ok: false })
    );
    return true;
  }
  if (message.type !== "get-count" || !Number.isInteger(message.tabId)) return;
  chrome.action
    .getBadgeText({ tabId: message.tabId })
    .then((text) => sendResponse({ count: Number.parseInt(text, 10) || 0 }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") updateBadge(tabId, 0);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  badgeQueues.delete(tabId);
  handledTargetIds.delete(tabId);
  for (const key of explicitGestures.keys()) {
    if (key.startsWith(`${tabId}:`)) explicitGestures.delete(key);
  }
  for (const key of contextLinks.keys()) {
    if (key.startsWith(`${tabId}:`)) contextLinks.delete(key);
  }
});

async function sourceIsProtected(tabId) {
  const settings = await loadSettings();
  if (!settings.enabled) return false;

  try {
    const tab = await chrome.tabs.get(tabId);
    const url = new URL(tab.url);
    return ["http:", "https:"].includes(url.protocol) && !settings.allowedHosts.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function closeWebsiteCreatedTarget(targetTabId, sourceTabId, explicitGesture) {
  if (handledTargetIds.has(targetTabId)) return;
  handledTargetIds.add(targetTabId);
  if (explicitGesture()) {
    console.log(DEBUG, "allowed explicit new-tab gesture", targetTabId);
    return;
  }
  if (!(await sourceIsProtected(sourceTabId))) return;

  console.log(DEBUG, "closed website-created target", targetTabId);
  updateBadge(sourceTabId);
  showBlockedNotice(sourceTabId).catch(() => {});
  chrome.tabs.remove(targetTabId).catch(() => {});
}

// Only popup windows need this fallback; ordinary browser-created tabs must stay open.
chrome.tabs.onCreated.addListener(async (tab) => {
  if (!Number.isInteger(tab.openerTabId)) return;
  try {
    if ((await chrome.windows.get(tab.windowId)).type !== "popup") return;
    // ponytail: Without a native menu-selection signal, defer popup cleanup to URL-checked navigation.
    if (hasContextLink(tab.openerTabId)) return;
    await closeWebsiteCreatedTarget(tab.id, tab.openerTabId, () => consumeExplicitGestureForTab(tab.openerTabId));
  } catch {
    // The window may have closed before its type was available.
  }
});

chrome.webNavigation.onCreatedNavigationTarget.addListener(async (details) => {
  if (!/^https?:\/\//i.test(details.url)) return;
  try {
    const tab = await chrome.tabs.get(details.tabId);
    if (tab.openerTabId !== details.sourceTabId) return;
    await closeWebsiteCreatedTarget(details.tabId, details.sourceTabId, () =>
      consumeExplicitGesture(details.sourceTabId, details.sourceFrameId) ||
      consumeContextLink(details.sourceTabId, details.sourceFrameId, details.url)
    );
  } catch {
    // The target may have closed before it could be inspected.
  }
});
