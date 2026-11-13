import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateNames, createGame, moveItem, applyRoll, rerollLast, undoLast,
  shiftTurn, serialize, deserialize,
} from "../js/game.js";

const g3 = () => createGame(["A", "B", "C"]);

test("AC-2: createGame trims names, keeps order, starts empty", () => {
  assert.deepEqual(createGame([" Anna ", "Bob"]), {
    version: 1, players: ["Anna", "Bob"], turn: 0, rolls: [],
  });
  assert.equal(createGame(["a", "b", "c", "d", "e", "f"]).players.length, 6);
});

test("AC-3: validateNames rejects bad input and createGame throws same message", () => {
  const bad = [
    ["A"],
    ["a", "b", "c", "d", "e", "f", "g"],
    ["A", "  "],
    ["A", ""],
    ["A", "x".repeat(21)],
    ["Anna", " anna "],
  ];
  for (const names of bad) {
    const v = validateNames(names);
    assert.equal(v.ok, false);
    assert.equal(typeof v.error, "string");
    assert.ok(v.error.length > 0);
    assert.throws(() => createGame(names), { message: v.error });
  }
  assert.deepEqual(validateNames(["A", "x".repeat(20)]), { ok: true });
});

test("AC-4: moveItem swaps neighbours without mutating", () => {
  const list = ["a", "b", "c"];
  assert.deepEqual(moveItem(list, 1, -1), ["b", "a", "c"]);
  assert.deepEqual(moveItem(list, 1, 1), ["a", "c", "b"]);
  const up = moveItem(list, 0, -1);
  const down = moveItem(list, 2, 1);
  assert.deepEqual(up, list);
  assert.deepEqual(down, list);
  assert.notEqual(up, list);
  assert.deepEqual(list, ["a", "b", "c"]);
});

test("AC-5: applyRoll appends roll, advances turn with wrap, is immutable", () => {
  const g = g3();
  const snap = structuredClone(g);
  const g1 = applyRoll(g, [3, 4]);
  assert.deepEqual(g, snap);
  assert.deepEqual(g1.rolls, [{ dice: [3, 4], sum: 7, player: 0 }]);
  assert.equal(g1.turn, 1);
  const g3r = applyRoll(applyRoll(g1, [1, 1]), [2, 2]);
  assert.equal(g3r.turn, 0);
  assert.equal(g3r.rolls[2].player, 2);
});

test("AC-6: rerollLast replaces last roll keeping player and turn", () => {
  const g = applyRoll(applyRoll(g3(), [1, 2]), [3, 4]);
  const snap = structuredClone(g);
  const r = rerollLast(g, [6, 6]);
  assert.deepEqual(g, snap);
  assert.equal(r.rolls.length, 2);
  assert.deepEqual(r.rolls[1], { dice: [6, 6], sum: 12, player: 1 });
  assert.equal(r.turn, g.turn);
  const empty = g3();
  assert.equal(rerollLast(empty, [1, 1]), empty);
});

test("AC-7: undoLast removes last roll and restores turn", () => {
  const g = applyRoll(applyRoll(g3(), [1, 2]), [3, 4]);
  const snap = structuredClone(g);
  const u = undoLast(g);
  assert.deepEqual(g, snap);
  assert.equal(u.rolls.length, 1);
  assert.equal(u.turn, 1);
  assert.equal(undoLast(u).turn, 0);
  const empty = g3();
  assert.equal(undoLast(empty), empty);
});

test("AC-8: shiftTurn wraps both ways and keeps rolls", () => {
  const g = applyRoll(g3(), [1, 2]);
  assert.equal(shiftTurn(g, 1).turn, 2);
  assert.equal(shiftTurn(shiftTurn(shiftTurn(g, 1), 1), 1).turn, 1);
  assert.equal(shiftTurn(g3(), -1).turn, 2);
  assert.deepEqual(shiftTurn(g, 1).rolls, g.rolls);
  assert.equal(g.turn, 1);
});

test("AC-9: serialize/deserialize round-trips and rejects malformed data", () => {
  const g = applyRoll(applyRoll(g3(), [1, 2]), [3, 4]);
  assert.deepEqual(deserialize(serialize(g)), g);
  const bad = (patch) => deserialize(JSON.stringify({ ...g, ...patch }));
  assert.equal(deserialize("{nope"), null);
  assert.equal(deserialize("null"), null);
  assert.equal(deserialize(undefined), null);
  assert.equal(bad({ version: 2 }), null);
  assert.equal(bad({ players: ["A"] }), null);
  assert.equal(bad({ players: ["a", "b", "c", "d", "e", "f", "g"] }), null);
  assert.equal(bad({ players: ["A", ""], rolls: [] }), null);
  assert.equal(bad({ players: ["A", "  "], rolls: [] }), null);
  assert.equal(bad({ players: ["A", "a"], rolls: [] }), null);
  assert.equal(bad({ turn: 3 }), null);
  assert.equal(bad({ turn: -1 }), null);
  assert.equal(bad({ rolls: [{ dice: [0, 3], sum: 3, player: 0 }] }), null);
  assert.equal(bad({ rolls: [{ dice: [1, 7], sum: 8, player: 0 }] }), null);
  assert.equal(bad({ rolls: [{ dice: [1, 2], sum: 3, player: 5 }] }), null);
  assert.equal(bad({ rolls: [{ dice: [1, 2], sum: 3 }] }), null);
});
