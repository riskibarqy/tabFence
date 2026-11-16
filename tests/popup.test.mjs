import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../popup/popup.js", import.meta.url), "utf8");
const html = await readFile(new URL("../popup/popup.html", import.meta.url), "utf8");
const flush = () => new Promise((resolve) => setImmediate(resolve));

async function popup(options = {}) {
  const elements = new Map();
  for (const id of ["enabled", "site", "show-notice", "site-host", "status", "status-detail", "count", "notice", "reload"]) {
    elements.set(id, {
      checked: false, disabled: true, hidden: true, textContent: "", dataset: {},
      listeners: {},
      addEventListener(type, listener) { this.listeners[type] = listener; }
    });
  }
  const stored = { enabled: true, allowedHosts: [], showNotifications: true, ...options.settings };
  const calls = [];
  let closed = false;
  let failSave = options.failSave;
  let releaseSave;
  const tab = { id: 7, url: options.url || "https://example.com/article" };
  const chrome = {
    storage: { local: {
      async get() {
        if (options.failLoad) throw new Error("Storage unavailable");
        return { settings: structuredClone(stored) };
      },
      async set({ settings }) {
        calls.push("save");
        if (options.delaySave) await new Promise((resolve) => { releaseSave = resolve; });
        if (failSave) throw new Error("Write failed");
        Object.assign(stored, structuredClone(settings));
      }
    } },
    tabs: {
      query: async () => options.noTab ? [] : [tab],
      async sendMessage(id, message, target) {
        calls.push(["page-state", id, message.type, target.frameId]);
        if (options.noBridge) throw new Error("No receiver");
        return { guarded: options.guarded ?? true };
      },
      get: async () => ({ ...tab, url: options.currentUrl || tab.url }),
      reload: async (id) => {
        calls.push(["reload", id]);
        if (options.failReload) throw new Error("Tab closed");
      }
    },
    runtime: { async sendMessage(message) {
      if (message.type === "get-count") {
        if (options.failCount) throw new Error("No count");
        return { count: options.count ?? 3 };
      }
      assert.equal(message.type, "sync-protection");
      calls.push("sync");
      return { ok: !options.failSync };
    } }
  };
  const window = { close() { closed = true; } };
  vm.runInNewContext(source, {
    chrome, window, URL, document: { querySelector: (selector) => elements.get(selector.slice(1)) }
  });
  await flush();
  const get = (id) => elements.get(id);
  return {
    get, stored, calls, isClosed: () => closed,
    allowSave: () => { failSave = false; },
    releaseSave: () => releaseSave(),
    async change(id, checked) {
      const element = get(id);
      assert.equal(element.disabled, false, `${id} should be enabled`);
      element.checked = checked;
      await element.listeners.change();
    },
    async reload() { await get("reload").listeners.click(); }
  };
}

const active = await popup();
assert.equal(active.get("status").textContent, "Protected");
assert.equal(active.get("site-host").textContent, "example.com");
assert.equal(active.get("reload").hidden, true);
assert.match(active.get("count").textContent, /3 attempts blocked since this page loaded/);
assert.deepEqual(active.calls[0], ["page-state", 7, "get-page-state", 0]);
await active.change("site", true);
assert.deepEqual(active.stored.allowedHosts, ["example.com"]);
assert.equal(active.get("status").textContent, "Reload required");
assert.match(active.get("status-detail").textContent, /still active/);
assert.equal(active.get("reload").hidden, false);
await active.reload();
assert.deepEqual(active.calls.slice(-2), ["sync", ["reload", 7]]);
assert.equal(active.isClosed(), true);

for (const [options, expected] of [
  [{ guarded: false, settings: { allowedHosts: ["example.com"] } }, "Paused on this site"],
  [{ guarded: false, settings: { enabled: false } }, "Protection is off"],
  [{ guarded: false }, "Reload required"],
  [{ settings: { enabled: false } }, "Reload required"],
  [{ noBridge: true }, "Reload required"]
]) {
  const ui = await popup(options);
  assert.equal(ui.get("status").textContent, expected);
}

const paused = await popup({ guarded: false, settings: { allowedHosts: ["example.com", "other.com"] } });
await paused.change("site", false);
assert.deepEqual(paused.stored.allowedHosts, ["other.com"]);
assert.equal(paused.get("status").textContent, "Reload required");
assert.match(paused.get("status-detail").textContent, /not active/);

for (const id of ["enabled", "site", "show-notice"]) {
  const ui = await popup({ failSave: true });
  const original = ui.get(id).checked;
  await ui.change(id, !original);
  assert.equal(ui.get(id).checked, original);
  assert.equal(ui.get(id).disabled, false);
  assert.equal(ui.get("notice").dataset.error, "true");
  assert.match(ui.get("notice").textContent, /not applied/);
  ui.allowSave();
  await ui.change(id, !original);
  assert.equal(ui.get(id).checked, !original);
  assert.equal(ui.get("notice").dataset.error, "false");
}

const pending = await popup({ delaySave: true });
const saving = pending.change("site", true);
await flush();
assert.equal(pending.get("enabled").disabled, true);
assert.equal(pending.get("site").disabled, true);
assert.equal(pending.get("show-notice").disabled, true);
assert.equal(pending.get("reload").disabled, true);
pending.releaseSave();
await saving;
assert.equal(pending.get("site").disabled, false);

// Updating one preference must preserve settings changed elsewhere since popup opened.
const fresh = await popup();
fresh.stored.allowedHosts = ["other.com"];
await fresh.change("show-notice", false);
assert.deepEqual(fresh.stored.allowedHosts, ["other.com"]);
assert.equal(fresh.stored.showNotifications, false);
assert.equal(fresh.get("reload").hidden, true);

for (const url of ["chrome://extensions", "file:///tmp/test.html", "https://chromewebstore.google.com/detail/test", "https://chrome.google.com/webstore/detail/test"]) {
  const ui = await popup({ url });
  assert.equal(ui.get("status").textContent, "Unavailable on this page");
  assert.equal(ui.get("site").disabled, true);
  assert.equal(ui.get("count").hidden, true);
  assert.equal(ui.get("reload").hidden, true);
}
const missingTab = await popup({ noTab: true });
assert.equal(missingTab.get("status").textContent, "Unavailable on this page");

const loadFailure = await popup({ failLoad: true });
assert.equal(loadFailure.get("status").textContent, "Settings unavailable");
for (const id of ["enabled", "site", "show-notice", "reload"]) assert.equal(loadFailure.get(id).disabled, true);
const countFailure = await popup({ failCount: true });
assert.equal(countFailure.get("status").textContent, "Protected");
assert.equal(countFailure.get("count").textContent, "Block count unavailable");
const one = await popup({ count: 1 });
assert.match(one.get("count").textContent, /^1 attempt blocked/);

for (const options of [{ failSync: true }, { currentUrl: "https://other.com/" }, { failReload: true }]) {
  const ui = await popup({ guarded: false, ...options });
  await ui.reload();
  assert.equal(ui.isClosed(), false);
  assert.equal(ui.get("notice").dataset.error, "true");
  assert.equal(ui.get("reload").disabled, false);
  if (!options.failReload) assert.equal(ui.calls.some((call) => Array.isArray(call) && call[0] === "reload"), false);
}

assert.match(html, /id="notice"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html, /id="site"[^>]*aria-describedby="site-help"/);
assert.match(html, /Ordinary clicks that open new tabs or windows are blocked/);
console.log("popup tests passed");
