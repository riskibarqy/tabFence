(() => {
  "use strict";

  const SETTINGS_KEY = "settings";
  const defaults = { enabled: true, allowedHosts: [], showNotifications: true };
  const enabledInput = document.querySelector("#enabled");
  const siteInput = document.querySelector("#site");
  const noticeInput = document.querySelector("#show-notice");
  const hostLabel = document.querySelector("#site-host");
  const status = document.querySelector("#status");
  const statusDetail = document.querySelector("#status-detail");
  const count = document.querySelector("#count");
  const notice = document.querySelector("#notice");
  const reloadButton = document.querySelector("#reload");
  let settings = { ...defaults };
  let tab;
  let host = "";
  let supported = false;
  let guarded = null;
  let ready = false;
  let busy = false;

  function showNotice(message, error = false) {
    notice.hidden = false;
    notice.dataset.error = String(error);
    notice.textContent = message;
  }

  function setBusy(value) {
    busy = value;
    enabledInput.disabled = !ready || busy;
    siteInput.disabled = !ready || !supported || busy;
    noticeInput.disabled = !ready || busy;
    reloadButton.disabled = !ready || busy;
  }

  function render() {
    enabledInput.checked = settings.enabled;
    siteInput.checked = settings.allowedHosts.includes(host);
    noticeInput.checked = settings.showNotifications;
    const desired = settings.enabled && !siteInput.checked;
    const needsReload = supported && (guarded === null || guarded !== desired);
    reloadButton.hidden = !needsReload;

    if (!supported) {
      status.dataset.state = "unavailable";
      status.textContent = "Unavailable on this page";
      statusDetail.textContent = "TabFence works on regular websites, not browser pages or extension stores.";
    } else if (needsReload) {
      status.dataset.state = "reload";
      status.textContent = "Reload required";
      statusDetail.textContent = guarded === null
        ? "Protection could not be confirmed. Reload to retry. If this persists, check TabFence's site access in your browser."
        : guarded
          ? "Protection is still active on this page. Reload to apply your choice."
          : "Protection is not active on this page yet. Reload to apply your choice.";
    } else if (!settings.enabled) {
      status.dataset.state = "paused";
      status.textContent = "Protection is off";
      statusDetail.textContent = "Protection is disabled for all sites. Turn it on to block website-opened tabs and windows.";
    } else if (siteInput.checked) {
      status.dataset.state = "paused";
      status.textContent = "Paused on this site";
      statusDetail.textContent = "This site can open tabs and windows. Other sites remain protected.";
    } else {
      status.dataset.state = "protected";
      status.textContent = "Protected";
      statusDetail.textContent = "Website-opened tabs and windows are blocked. You choose when to open a new tab.";
    }
    setBusy(busy);
  }

  async function init() {
    const [tabs, stored] = await Promise.all([
      chrome.tabs.query({ active: true, lastFocusedWindow: true }),
      chrome.storage.local.get(SETTINGS_KEY)
    ]);
    settings = { ...defaults, ...stored[SETTINGS_KEY] };
    tab = tabs[0];
    try {
      const url = new URL(tab?.url || "");
      host = url.hostname.toLowerCase();
      supported = ["http:", "https:"].includes(url.protocol) && Boolean(host)
        && host !== "chromewebstore.google.com"
        && !(host === "chrome.google.com" && url.pathname.startsWith("/webstore"));
    } catch {
      supported = false;
    }
    hostLabel.textContent = supported ? host : "This page";
    if (supported) {
      count.hidden = false;
      count.textContent = "Reading block count...";
      await Promise.all([
        chrome.tabs.sendMessage(tab.id, { type: "get-page-state" }, { frameId: 0 })
          .then((state) => { guarded = typeof state?.guarded === "boolean" ? state.guarded : null; })
          .catch(() => { guarded = null; }),
        chrome.runtime.sendMessage({ type: "get-count", tabId: tab.id })
          .then((result) => {
            count.textContent = Number.isInteger(result?.count) && result.count >= 0
              ? `${result.count} ${result.count === 1 ? "attempt" : "attempts"} blocked since this page loaded`
              : "Block count unavailable";
          })
          .catch(() => { count.textContent = "Block count unavailable"; })
      ]);
    }
    ready = true;
    render();
  }

  async function updateSettings(input) {
    if (!ready || busy) return;
    const checked = input.checked;
    setBusy(true);
    showNotice("Saving...");
    try {
      const stored = await chrome.storage.local.get(SETTINGS_KEY);
      const next = { ...defaults, ...stored[SETTINGS_KEY] };
      if (input === enabledInput) next.enabled = checked;
      else if (input === noticeInput) next.showNotifications = checked;
      else {
        const hosts = new Set(next.allowedHosts);
        if (checked) hosts.add(host);
        else hosts.delete(host);
        next.allowedHosts = [...hosts].sort();
      }
      // Commit UI state only after persistence succeeds, so failed saves roll back.
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      settings = next;
      showNotice(input === noticeInput ? "Block notice preference saved." : "Settings saved.");
    } catch {
      showNotice("Could not save settings. Your change was not applied. Try again.", true);
    } finally {
      busy = false;
      render();
    }
  }

  enabledInput.addEventListener("change", () => updateSettings(enabledInput));
  siteInput.addEventListener("change", () => updateSettings(siteInput));
  noticeInput.addEventListener("change", () => updateSettings(noticeInput));

  reloadButton.addEventListener("click", async () => {
    if (!ready || busy || !supported) return;
    setBusy(true);
    showNotice("Applying settings and reloading...");
    try {
      // Wait for document-start registration before starting a new document.
      const result = await chrome.runtime.sendMessage({ type: "sync-protection" });
      if (!result?.ok) throw new Error("Guard registration failed");
      const current = await chrome.tabs.get(tab.id);
      if (current.url !== tab.url) {
        showNotice("This tab has changed. Reopen TabFence before reloading.", true);
        return;
      }
      await chrome.tabs.reload(tab.id);
      window.close();
    } catch {
      showNotice("Could not apply settings and reload. Please try again.", true);
    } finally {
      busy = false;
      render();
    }
  });

  init().catch(() => {
    hostLabel.textContent = "This page";
    status.dataset.state = "error";
    status.textContent = "Settings unavailable";
    statusDetail.textContent = "Reopen TabFence to try again. Protection status could not be checked.";
    showNotice("Could not load settings. No changes were made.", true);
    setBusy(false);
  });
})();
