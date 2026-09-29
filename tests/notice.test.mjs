import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bridge, worker, popup] = await Promise.all([
  readFile(new URL("../src/bridge.js", import.meta.url), "utf8"),
  readFile(new URL("../src/service-worker.js", import.meta.url), "utf8"),
  readFile(new URL("../popup/popup.html", import.meta.url), "utf8")
]);

assert.match(bridge, /show-blocked-notice/);
assert.match(bridge, /role="status"/);
assert.match(worker, /showNotifications/);
assert.match(popup, /id="show-notice"/);
console.log("notice tests passed");
