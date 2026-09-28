const GUARD_ID = "tabfence-guard";
const SETTINGS_KEY = "settings";
const badgeQueues = new Map();
let registrationSync = Promise.resolve();

async function setBadge(tabId, count) {
  await chrome.action.setBadgeText({ tabId, text: count ? String(count) : "" });
}

function incrementBadge(tabId) {
  const previous = badgeQueues.get(tabId) || Promise.resolve();
  const next = previous
    .then(async () => {
      const text = await chrome.action.getBadgeText({ tabId });
      await setBadge(tabId, (Number.parseInt(text, 10) || 0) + 1);
    })
    .catch(() => {});
  badgeQueues.set(tabId, next);
}

async function syncGuardRegistration() {
  const { [SETTINGS_KEY]: stored = {} } = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = { enabled: true, allowedHosts: [], ...stored };

  await chrome.scripting.unregisterContentScripts({ ids: [GUARD_ID] }).catch(() => {});
  if (!settings.enabled) return;

  await chrome.scripting.registerContentScripts([
    {
      id: GUARD_ID,
      matches: ["http://*/*", "https://*/*"],
      excludeMatches: settings.allowedHosts.map((host) => `*://${host}/*`),
      js: ["src/policy.js", "src/guard.js"],
      runAt: "document_start",
      world: "MAIN",
      persistAcrossSessions: true
    }
  ]);
}

function scheduleGuardSync() {
  registrationSync = registrationSync.catch(() => {}).then(syncGuardRegistration);
  return registrationSync;
}

chrome.runtime.onInstalled.addListener(() => scheduleGuardSync().catch(() => {}));
chrome.runtime.onStartup.addListener(() => scheduleGuardSync().catch(() => {}));
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes[SETTINGS_KEY]) scheduleGuardSync().catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "blocked" && sender.tab?.id) incrementBadge(sender.tab.id);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "get-count" || !Number.isInteger(message.tabId)) return;
  chrome.action
    .getBadgeText({ tabId: message.tabId })
    .then((text) => sendResponse({ count: Number.parseInt(text, 10) || 0 }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === "loading") setBadge(tabId, 0);
});

chrome.tabs.onRemoved.addListener((tabId) => badgeQueues.delete(tabId));
