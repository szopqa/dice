import { test } from "node:test";
import assert from "node:assert/strict";
import { rollPair, rollDie, rollDice, sum } from "../js/dice.js";

function seq(values) {
  let i = 0;
  return () => values[i++];
}

test("AC-1: rollPair maps injected uint32 values deterministically", () => {
  assert.deepEqual(rollPair(seq([0, 5])), [1, 6]);
  assert.deepEqual(rollPair(seq([7, 2 ** 32 - 5])), [2, 6]);
});

test("AC-1: rollPair rejects values at or above the bias limit", () => {
  // limit for 6 sides is 2**32 - 4; 2**32-1 and 2**32-4 are rejected
  assert.deepEqual(rollPair(seq([2 ** 32 - 1, 2 ** 32 - 4, 2, 3])), [3, 4]);
});

test("AC-1: default source yields integers 1-6 and all faces over 10,000 rolls", () => {
  const seen = new Set();
  for (let i = 0; i < 10000; i++) {
    for (const v of rollPair()) {
      assert.ok(Number.isInteger(v) && v >= 1 && v <= 6);
      seen.add(v);
    }
  }
  assert.equal(seen.size, 6);
});

test("AC-1: rollDie, rollDice and sum still work", () => {
  assert.equal(rollDie(6, seq([8])), 3);
  assert.equal(rollDice(3, 6).length, 3);
  assert.equal(sum([1, 2, 3]), 6);
});
