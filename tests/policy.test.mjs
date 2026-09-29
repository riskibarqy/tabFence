import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/policy.js", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);

const { isNewContextTarget, shouldBlockNewContext } = context.TabFencePolicy;
const leftClick = { isTrusted: true, button: 0, defaultPrevented: false };

assert.equal(isNewContextTarget("_blank"), true);
assert.equal(isNewContextTarget("ad-window"), true);
assert.equal(isNewContextTarget("_self"), false);
assert.equal(isNewContextTarget("_parent"), false);
assert.equal(shouldBlockNewContext(leftClick, "_blank"), true);
assert.equal(shouldBlockNewContext(leftClick, "ad-window"), true);
assert.equal(shouldBlockNewContext({ ...leftClick, ctrlKey: true }, "_blank"), false);
assert.equal(shouldBlockNewContext({ ...leftClick, metaKey: true }, "_blank"), false);
assert.equal(shouldBlockNewContext({ ...leftClick, button: 1 }, "_blank"), false);
assert.equal(shouldBlockNewContext({ ...leftClick, isTrusted: false }, "_blank"), true);
assert.equal(shouldBlockNewContext({ isTrusted: true, type: "touchstart" }, "_blank"), true);
assert.equal(shouldBlockNewContext(leftClick, "_self"), false);

console.log("policy tests passed");
