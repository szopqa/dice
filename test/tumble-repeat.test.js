import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../js/main.js", import.meta.url), "utf8");

test("AC-24: clearEffects removes the land class so later rolls tumble", () => {
  const body = src.match(/function clearEffects\(\) \{([\s\S]*?)\n\}/)[1];
  assert.match(body, /el\.dice\.forEach\(\(d\) => d\.classList\.remove\("land"\)\)/);
});
