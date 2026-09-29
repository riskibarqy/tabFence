import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = await readFile(new URL("../src/service-worker.js", import.meta.url), "utf8");

assert.match(worker, /id: GUARD_ID,[\s\S]*allFrames: true/);
assert.match(worker, /allFrames: true,[\s\S]*matchOriginAsFallback: true/);
assert.match(worker, /explicit-new-tab-gesture/);
assert.match(worker, /chrome\.tabs\.onCreated\.addListener/);
assert.match(worker, /chrome\.tabs\.remove\(targetTabId\)/);
console.log("registration tests passed");
