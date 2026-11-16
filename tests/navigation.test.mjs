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
let bridgeMessageListener;
const bridgeChrome = {
  runtime: { sendMessage: (message) => { messages.push(message); return Promise.resolve(); }, onMessage: { addListener(listener) { bridgeMessageListener = listener; } } }
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
let registeredScripts = [];
let failScriptChange = false;
const scriptCalls = [];
const chrome = {
  action: {
    getBadgeText: async ({ tabId }) => counts.get(tabId) || "",
    setBadgeText: async ({ tabId, text }) => counts.set(tabId, text)
  },
  storage: {
    local: { get: async () => ({ settings }) },
    onChanged: on("settingsChanged")
  },
  scripting: {
    getRegisteredContentScripts: async () => registeredScripts,
    unregisterContentScripts: async () => { scriptCalls.push("unregister"); registeredScripts = []; },
    registerContentScripts: async (scripts) => {
      scriptCalls.push("register");
      if (failScriptChange) throw new Error("Registration failed");
      registeredScripts = scripts;
    },
    updateContentScripts: async (scripts) => {
      scriptCalls.push("update");
      if (failScriptChange) throw new Error("Update failed");
      registeredScripts = scripts;
    }
  },
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
vm.runInNewContext(workerSource, { chrome, console: { log() {}, warn() {} }, URL, Date, Promise, Map, Set, Number });
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

// Status queries reflect the current document, independent of the saved settings.
page.Event = class { constructor(type) { this.type = type; } };
page.CustomEvent = page.Event;
page.window.dispatchEvent = (event) => pageListeners.get(event.type)?.(event);
let pageState;
bridgeMessageListener({ type: "get-page-state" }, {}, (value) => { pageState = value; });
assert.equal(pageState.guarded, false);
page.HTMLFormElement = class { submit() {} };
page.HTMLButtonElement = class {};
page.HTMLInputElement = class {};
page.Window = class {};
page.document.addEventListener = () => {};
page.document.querySelector = () => null;
const policySource = await readFile(new URL("../src/policy.js", import.meta.url), "utf8");
const guardSource = await readFile(new URL("../src/guard.js", import.meta.url), "utf8");
vm.runInNewContext(policySource, page);
vm.runInNewContext(guardSource, page);
const guardedOpen = page.window.open;
bridgeMessageListener({ type: "get-page-state" }, {}, (value) => { pageState = value; });
assert.equal(pageState.guarded, true);
assert.equal(page.window.open, guardedOpen);
assert.equal(page.window.open("https://example.com/"), null);

// Count one blocked gesture, not each pointer/mouse/touch event in its chain.
const guardedLink = new Anchor("https://example.com/link");
guardedLink.getAttribute = () => "_blank";
const blockedCount = () => messages.filter((message) => message.type === "blocked").length;
function dispatchPointer(type, overrides = {}) {
  const event = {
    type, isTrusted: true, button: 0, detail: 1, defaultPrevented: false,
    composedPath: () => [guardedLink],
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.stopped = true; },
    ...overrides
  };
  pageListeners.get(type)(event);
  return event;
}
let before = blockedCount();
for (const sequence of [["pointerdown", "mousedown", "click"], ["pointerdown", "click"], ["pointerdown", "touchstart", "click"]]) {
  for (const type of sequence) {
    const event = dispatchPointer(type);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.stopped, true);
  }
  assert.equal(blockedCount(), ++before);
}
// Keyboard and synthetic clicks, and separate script requests, are still distinct.
dispatchPointer("pointerdown");
assert.equal(blockedCount(), ++before);
for (const overrides of [{ detail: 0 }, { detail: 0 }, { isTrusted: false }, { isTrusted: false }]) {
  dispatchPointer("click", overrides);
  assert.equal(blockedCount(), ++before);
}
page.window.open("https://example.com/one");
page.window.open("https://example.com/two");
assert.equal(blockedCount(), before + 2);
const explicit = dispatchPointer("pointerdown", { ctrlKey: true });
assert.equal(explicit.defaultPrevented, false);
assert.equal(blockedCount(), before + 2);

// Reload synchronization must use fresh storage and preserve a guard on failure.
settings = { enabled: true, allowedHosts: ["other.com"], showNotifications: true };
const syncProtection = () => new Promise((resolve) => {
  assert.equal(workerMessages[1]({ type: "sync-protection" }, {}, resolve), true);
});
assert.equal((await syncProtection()).ok, true);
assert.deepEqual(Array.from(registeredScripts[0].excludeMatches), ["*://other.com/*"]);
const previousScripts = registeredScripts;
scriptCalls.length = 0;
settings = { ...settings, allowedHosts: ["another.com"] };
failScriptChange = true;
assert.equal((await syncProtection()).ok, false);
assert.deepEqual(scriptCalls, ["update"]);
assert.equal(registeredScripts, previousScripts);
failScriptChange = false;
assert.equal((await syncProtection()).ok, true);
assert.deepEqual(Array.from(registeredScripts[0].excludeMatches), ["*://another.com/*"]);

// Saving a notice preference must never touch script registration, even if updates fail.
const previousSettings = settings;
settings = { ...settings, showNotifications: false };
scriptCalls.length = 0;
failScriptChange = true;
listeners.settingsChanged({ settings: { oldValue: previousSettings, newValue: settings } }, "local");
await flush();
assert.deepEqual(scriptCalls, []);
assert.ok(registeredScripts.length);
failScriptChange = false;

// Disabling removes the guard; enabling registers it again without an unregister gap.
settings = { ...settings, enabled: false };
assert.equal((await syncProtection()).ok, true);
assert.equal(registeredScripts.length, 0);
settings = { ...settings, enabled: true };
scriptCalls.length = 0;
failScriptChange = true;
assert.equal((await syncProtection()).ok, false);
assert.equal(registeredScripts.length, 0);
failScriptChange = false;
assert.equal((await syncProtection()).ok, true);
assert.deepEqual(scriptCalls, ["register", "register"]);

// A reset must run after increments already queued for the previous page.
let finishOldRead;
const originalRead = chrome.action.getBadgeText;
counts.set(1, "4");
chrome.action.getBadgeText = async () => new Promise((resolve) => { finishOldRead = () => resolve("4"); });
workerMessages[0]({ type: "blocked" }, { tab: { id: 1 }, frameId: 0 });
await flush();
listeners.updated(1, { status: "loading" });
finishOldRead();
await flush();
assert.equal(counts.get(1), "");
chrome.action.getBadgeText = originalRead;
workerMessages[0]({ type: "blocked" }, { tab: { id: 1 }, frameId: 0 });
await flush();
assert.equal(counts.get(1), "1");

console.log("navigation tests passed");
