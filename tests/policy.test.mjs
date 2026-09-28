import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../src/policy.js", import.meta.url), "utf8");
const context = {};
context.globalThis = context;
vm.runInNewContext(source, context);

const { isBlankAnchor, shouldBlockBlankAnchor } = context.TabFencePolicy;
const blank = { target: "_blank", href: "https://example.com" };
const leftClick = { isTrusted: true, button: 0, defaultPrevented: false };

assert.equal(isBlankAnchor(blank), true);
assert.equal(shouldBlockBlankAnchor(leftClick, blank), true);
assert.equal(shouldBlockBlankAnchor({ ...leftClick, ctrlKey: true }, blank), false);
assert.equal(shouldBlockBlankAnchor({ ...leftClick, metaKey: true }, blank), false);
assert.equal(shouldBlockBlankAnchor({ ...leftClick, button: 1 }, blank), false);
assert.equal(shouldBlockBlankAnchor({ ...leftClick, isTrusted: false }, blank), true);
assert.equal(shouldBlockBlankAnchor(leftClick, { target: "", href: "https://example.com" }), false);

console.log("policy tests passed");
