import { test } from "node:test";
import assert from "node:assert/strict";
import { nextPlayerIndex } from "../js/ui/turn.js";

test("AC-24: next player is turn + 1", () => {
  assert.equal(nextPlayerIndex(0, 4), 1);
  assert.equal(nextPlayerIndex(2, 4), 3);
});

test("AC-24: next player wraps around to the first", () => {
  assert.equal(nextPlayerIndex(3, 4), 0);
  assert.equal(nextPlayerIndex(1, 2), 0);
});
