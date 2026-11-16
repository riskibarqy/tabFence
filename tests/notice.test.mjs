import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const [bridge, worker, popup] = await Promise.all([
  readFile(new URL("../src/bridge.js", import.meta.url), "utf8"),
  readFile(new URL("../src/service-worker.js", import.meta.url), "utf8"),
  readFile(new URL("../popup/popup.html", import.meta.url), "utf8")
]);

assert.match(bridge, /show-blocked-notice/);
assert.match(bridge, /role="status"/);
assert.match(worker, /showNotifications/);
assert.match(popup, /id="show-notice"/);
let messageListener;
let toast;
let dismiss;
let timeout;
let cancelled = false;
const shadow = {
  innerHTML: "",
  querySelector: () => ({ addEventListener: (_type, listener) => { dismiss = listener; } })
};
vm.runInNewContext(bridge, {
  chrome: { runtime: {
    sendMessage: async () => {},
    onMessage: { addListener: (listener) => { messageListener = listener; } }
  } },
  window: { addEventListener() {} },
  document: {
    getElementById: () => toast,
    createElement: () => ({
      attachShadow: () => shadow,
      remove: () => { toast = null; }
    }),
    body: { append: (element) => { toast = element; } }
  },
  setTimeout: (callback, delay) => { timeout = { callback, delay }; return 1; },
  clearTimeout: () => { cancelled = true; }
});
messageListener({ type: "show-blocked-notice" });
assert.ok(toast);
assert.match(shadow.innerHTML, /Pause on this site/);
assert.match(shadow.innerHTML, /Ctrl\/Cmd-click/);
assert.equal(timeout.delay, 10000);
const originalToast = toast;
messageListener({ type: "show-blocked-notice" });
assert.equal(toast, originalToast);
dismiss();
assert.equal(toast, null);
assert.equal(cancelled, true);
messageListener({ type: "show-blocked-notice" });
assert.ok(toast);
timeout.callback();
assert.equal(toast, null);
console.log("notice tests passed");
