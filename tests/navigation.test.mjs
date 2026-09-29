import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const bridgeSource = await readFile(new URL("../src/bridge.js", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../src/service-worker.js", import.meta.url), "utf8");

class Anchor {
  constructor(href) { this.href = href; }
}

const pageListeners = new Map();
const messages = [];
const bridgeChrome = {
  runtime: { sendMessage: (message) => { messages.push(message); return Promise.resolve(); }, onMessage: { addListener() {} } }
};
const page = {
  chrome: bridgeChrome,
  window: { addEventListener: (type, listener) => pageListeners.set(type, listener) },
  document: {}, location: { hostname: "example.com" }, HTMLAnchorElement: Anchor,
  console: { log() {}, warn() {} }, clearTimeout, setTimeout
};
page.globalThis = page;
vm.runInNewContext(bridgeSource, page);
const down = pageListeners.get("pointerdown");
const link = new Anchor("https://example.org");
const gesture = (isTrusted, path) => ({ isTrusted, button: 1, composedPath: () => path });
pageListeners.get("tabfence:explicit-new-tab-gesture")?.({ isTrusted: false });
down(gesture(false, [link]));
down(gesture(true, [{}]));
assert.equal(messages.filter((message) => message.type === "explicit-new-tab-gesture").length, 0);
down(gesture(true, [link]));
assert.equal(messages.filter((message) => message.type === "explicit-new-tab-gesture").length, 1);
const contextmenu = pageListeners.get("contextmenu");
assert.equal(typeof contextmenu, "function");
contextmenu({ isTrusted: false, composedPath: () => [link] });
assert.equal(messages.filter((message) => message.type === "context-link").length, 0);
contextmenu({ isTrusted: true, composedPath: () => [link] });
assert.equal(messages.find((message) => message.type === "context-link")?.url, link.href);

const listeners = {};
const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
const removed = [];
const counts = new Map();
const workerMessages = [];
let windowType = "popup";
let settings = { enabled: true, allowedHosts: [] };
let sourceUrl = "https://example.com/";
const chrome = {
  action: {
    getBadgeText: async ({ tabId }) => counts.get(tabId) || "",
    setBadgeText: async ({ tabId, text }) => counts.set(tabId, text)
  },
  storage: {
    local: { get: async () => ({ settings }) },
    onChanged: on("settingsChanged")
  },
  scripting: { unregisterContentScripts: async () => {}, registerContentScripts: async () => {} },
  runtime: { onInstalled: on("installed"), onStartup: on("startup"), onMessage: { addListener: (fn) => workerMessages.push(fn) } },
  tabs: {
    get: async (id) => id === 1 ? { url: sourceUrl } : { openerTabId: id === 8 ? undefined : 1 },
    remove: async (id) => { removed.push(id); },
    sendMessage: async () => {},
    onCreated: on("created"), onRemoved: on("removed"), onUpdated: on("updated")
  },
  webNavigation: { onCreatedNavigationTarget: on("target") },
  windows: { get: async () => ({ type: windowType }) }
};
vm.runInNewContext(workerSource, { chrome, console: { log() {} }, URL, Date, Promise, Map, Set, Number });
const flush = async () => { await new Promise((resolve) => setImmediate(resolve)); };
listeners.created({ id: 2, openerTabId: 1, windowId: 43 });
listeners.target({ tabId: 2, sourceTabId: 1, sourceFrameId: 0, url: "https://ads.example/" });
await flush();
assert.deepEqual(removed, [2]);
assert.equal(counts.get(1), "1");

workerMessages.forEach((fn) => fn({ type: "explicit-new-tab-gesture" }, { tab: { id: 1 }, frameId: 0 }));
listeners.target({ tabId: 5, sourceTabId: 1, sourceFrameId: 0, url: "https://example.org/" });
listeners.created({ id: 5, openerTabId: 1 });
await flush();
assert.deepEqual(removed, [2]);

const rightClickMessage = messages.find((message) => message.type === "context-link");
workerMessages.forEach((fn) => fn(rightClickMessage, { tab: { id: 1 }, frameId: 0 }));
windowType = "normal";
listeners.created({ id: 9, openerTabId: 1, windowId: 42 });
listeners.target({ tabId: 9, sourceTabId: 1, sourceFrameId: 0, url: link.href });
await flush();
assert.deepEqual(removed, [2]);

workerMessages.forEach((fn) => fn(rightClickMessage, { tab: { id: 1 }, frameId: 0 }));
windowType = "popup";
listeners.created({ id: 10, openerTabId: 1, windowId: 43 });
listeners.target({ tabId: 10, sourceTabId: 1, sourceFrameId: 0, url: link.href });
await flush();
assert.deepEqual(removed, [2]);

workerMessages.forEach((fn) => fn(rightClickMessage, { tab: { id: 1 }, frameId: 0 }));
listeners.created({ id: 11, openerTabId: 1, windowId: 43 });
listeners.target({ tabId: 11, sourceTabId: 1, sourceFrameId: 0, url: "https://ad.example/" });
await flush();
assert.deepEqual(removed, [2, 11]);

windowType = "normal";
listeners.created({ id: 7, openerTabId: 1, windowId: 42 });
listeners.target({ tabId: 8, sourceTabId: 1, sourceFrameId: 0, url: "https://www.google.com/" });
await flush();
assert.deepEqual(removed, [2, 11]);
windowType = "popup";

settings = { enabled: true, allowedHosts: ["example.com"] };
listeners.settingsChanged({ settings: { newValue: settings } }, "local");
listeners.created({ id: 3, openerTabId: 1 });
await flush();
assert.deepEqual(removed, [2, 11]);

settings = { enabled: true, allowedHosts: [] };
listeners.settingsChanged({ settings: { newValue: settings } }, "local");
sourceUrl = "chrome://extensions";
listeners.created({ id: 6, openerTabId: 1 });
await flush();
assert.deepEqual(removed, [2, 11]);
sourceUrl = "https://example.com/";

settings = { enabled: false, allowedHosts: [] };
listeners.settingsChanged({ settings: { newValue: settings } }, "local");
listeners.created({ id: 4, openerTabId: 1 });
await flush();
assert.deepEqual(removed, [2, 11]);

console.log("navigation tests passed");
