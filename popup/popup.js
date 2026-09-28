(() => {
  "use strict";

  const SETTINGS_KEY = "settings";
  const enabledInput = document.querySelector("#enabled");
  const siteInput = document.querySelector("#site");
  const siteLabel = document.querySelector("#site-label");
  const count = document.querySelector("#count");
  const notice = document.querySelector("#notice");
  let host = "";
  let settings = { enabled: true, allowedHosts: [] };

  function save() {
    return chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }

  function showNotice(message) {
    notice.hidden = false;
    notice.textContent = message;
  }

  async function init() {
    const [tab, stored] = await Promise.all([
      chrome.tabs.query({ active: true, lastFocusedWindow: true }),
      chrome.storage.local.get(SETTINGS_KEY)
    ]);
    settings = { ...settings, ...(stored[SETTINGS_KEY] || {}) };
    enabledInput.checked = settings.enabled;

    try {
      host = new URL(tab[0]?.url || "").hostname.toLowerCase();
    } catch {
      host = "";
    }

    if (!host || !/^https?:$/.test(new URL(tab[0].url).protocol)) {
      siteInput.disabled = true;
      showNotice("Site controls unavailable on this page.");
    } else {
      siteLabel.textContent = `Allow ${host}`;
      siteInput.checked = settings.allowedHosts.includes(host);
      chrome.runtime.sendMessage({ type: "get-count", tabId: tab[0].id }).then(({ count: value }) => {
        count.textContent = `${value} blocked here`;
      }).catch(() => {});
    }
  }

  enabledInput.addEventListener("change", async () => {
    settings.enabled = enabledInput.checked;
    try {
      await save();
      showNotice("Reload this tab to apply the change.");
    } catch {
      showNotice("Could not save TabFence settings.");
    }
  });

  siteInput.addEventListener("change", async () => {
    const hosts = new Set(settings.allowedHosts);
    if (siteInput.checked) hosts.add(host);
    else hosts.delete(host);
    settings.allowedHosts = [...hosts].sort();
    try {
      await save();
      showNotice("Reload this tab to apply the change.");
    } catch {
      showNotice("Could not save TabFence settings.");
    }
  });

  init().catch(() => showNotice("Could not load TabFence settings."));
})();
