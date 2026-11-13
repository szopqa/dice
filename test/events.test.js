import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateEvents, RULES } from "../js/events.js";

const PLAYERS = ["Anna", "Ben", "Cy"];
const D = { 2: [1, 1], 3: [1, 2], 4: [1, 3], 5: [2, 3], 6: [2, 4], 7: [3, 4], 8: [3, 5], 9: [4, 5], 10: [4, 6], 12: [6, 6] };
// Build a game from sums; players rotate unless [sum, player] is given.
function g(...specs) {
  const rolls = specs.map((s, i) => {
    const [sum, player] = Array.isArray(s) ? s : [s, i % PLAYERS.length];
    const dice = Array.isArray(sum) ? sum : D[sum];
    return { dice, sum: dice[0] + dice[1], player };
  });
  return { version: 1, players: PLAYERS, turn: 0, rolls };
}
const ids = (game) => {
  const e = evaluateEvents(game);
  return [e.main?.id, e.secondary?.id];
};
const fires = (game, id) => RULES.find((r) => r.id === id).test({ rolls: game.rolls, players: game.players, last: game.rolls.at(-1) });

test("AC-10: seven fires big on every 7", () => {
  const e = evaluateEvents(g(7));
  assert.equal(e.main.id, "seven");
  assert.equal(e.main.level, "big");
  assert.ok(fires(g(7, 8, 7), "seven"));
  assert.ok(!fires(g(8), "seven"));
});

test("AC-11: combo texts by run length", () => {
  const names = { 2: "DOUBLE COMBO!", 3: "TRIPLE COMBO!", 4: "SUPER COMBO!", 5: "HYPER COMBO!", 6: "BRUTAL COMBO!", 7: "MASTER COMBO!", 8: "ULTRA COMBO x8!", 9: "ULTRA COMBO x9!" };
  for (const [k, text] of Object.entries(names)) {
    const e = evaluateEvents(g(5, ...Array(Number(k)).fill(8)));
    assert.equal(e.main.id, "combo");
    assert.equal(e.main.level, "shout");
    assert.equal(e.main.text, text);
  }
  assert.ok(!fires(g(8), "combo"));
  assert.ok(!fires(g(8, 9), "combo"));
});

test("AC-12: combo-breaker after run of >=2 only", () => {
  const e = evaluateEvents(g(8, 8, 5));
  assert.equal(e.main.id, "combo-breaker");
  assert.equal(e.main.level, "shout");
  assert.equal(e.main.text, "COMBO BREAKER!!");
  assert.ok(!fires(g(8, 5), "combo-breaker"));
  assert.ok(!fires(g(8, 8), "combo-breaker"));
  assert.ok(!fires(g(8, 8, 5, 4), "combo-breaker"));
});

test("AC-13: snake eyes and boxcars", () => {
  const s = evaluateEvents(g(8, 2));
  assert.equal(s.main.id, "snake-eyes");
  assert.equal(s.main.level, "shout");
  const b = evaluateEvents(g(8, 12));
  assert.equal(b.main.id, "boxcars");
  assert.equal(b.main.level, "shout");
  assert.ok(!fires(g(12), "snake-eyes"));
});

test("AC-14: doubles is a comment, not for 1-1 or 6-6", () => {
  const e = evaluateEvents(g(8, [[3, 3], 1]));
  assert.equal(e.main.id, "doubles");
  assert.equal(e.main.level, "comment");
  assert.ok(!fires(g(2), "doubles"));
  assert.ok(!fires(g(12), "doubles"));
  assert.ok(!fires(g(8), "doubles"));
});

test("AC-15: drought fires at multiples of 10 only", () => {
  const run = (n, prefix = []) => g(...prefix, ...Array(n).fill(9).map((s, i) => [s, i % 3]));
  const sevenThenNon = (n) => g(7, ...Array(n).fill(9));
  for (const n of [9, 11]) {
    assert.ok(!fires(run(n), "drought"));
    assert.ok(!fires(sevenThenNon(n), "drought"));
  }
  for (const n of [10, 20]) {
    assert.ok(fires(run(n), "drought"));
    assert.ok(fires(sevenThenNon(n), "drought"));
    assert.equal(evaluateEvents(run(n)).secondary?.id ?? evaluateEvents(run(n)).main.id, "drought");
  }
  const e = evaluateEvents(g(7, ...[3, 4, 5, 6, 8, 9, 10, 4, 5, 6].map((s) => s)));
  const d = RULES.find((r) => r.id === "drought");
  assert.equal(d.level, "comment");
  assert.ok(d.message({ rolls: run(10).rolls, players: PLAYERS, last: null }).includes("10"));
  assert.ok(e);
});

test("AC-16: serial robber on repeat 7 by same player", () => {
  const game = g([7, 0], [8, 1], [9, 2], [7, 0]);
  const e = evaluateEvents(game);
  assert.equal(e.main.id, "serial-robber");
  assert.equal(e.main.level, "big");
  assert.ok(e.main.text.includes("Anna"));
  assert.ok(!fires(g([7, 0], [7, 1]), "serial-robber"));
  assert.ok(!fires(g([7, 0], [8, 0], [7, 0]), "serial-robber"));
  assert.ok(!fires(g([7, 0]), "serial-robber"));
});

test("AC-17: priority, tie order, effect, and none", () => {
  const e = evaluateEvents(g([7, 0], [7, 1]));
  assert.equal(e.main.id, "combo");
  assert.equal(e.main.text, "DOUBLE COMBO!");
  assert.equal(e.secondary.id, "seven");
  assert.equal(e.effect, "big");

  const none = evaluateEvents(g(8, 9));
  assert.deepEqual(none, { main: null, secondary: null, effect: "none" });

  // tie: snake-eyes (60) listed before boxcars (60) -> earlier wins
  const mk = (id) => ({ id, priority: 5, level: "comment", test: () => true, message: () => id });
  const t = evaluateEvents(g(8), [mk("a"), mk("b")]);
  assert.equal(t.main.id, "a");
  assert.equal(t.secondary.id, "b");

  assert.equal(evaluateEvents(g(8, 12)).effect, "shout");
  assert.equal(evaluateEvents(g(8, [[3, 3], 1])).effect, "comment");
  assert.deepEqual(ids(g(8, 12)), ["boxcars", undefined]);
});

test("AC-18: custom rules array drives evaluation", () => {
  const rules = [{ id: "x", priority: 1, level: "comment", test: () => true, message: () => "hi" }];
  const e = evaluateEvents(g(8), rules);
  assert.deepEqual(e.main, { id: "x", level: "comment", text: "hi" });
  assert.equal(e.secondary, null);
  assert.equal(e.effect, "comment");
});

test("AC-19: rerolled last roll does not count toward streaks", () => {
  const before = g(8, 8);
  assert.equal(evaluateEvents(before).main.text, "DOUBLE COMBO!");
  // simulate rerollLast: replace the last roll, same player
  const last = before.rolls.at(-1);
  const after = { ...before, rolls: [...before.rolls.slice(0, -1), { dice: [2, 3], sum: 5, player: last.player }] };
  assert.ok(!fires(after, "combo"));
  assert.ok(!fires(after, "combo-breaker"));
  const e = evaluateEvents(after);
  assert.notEqual(e.main?.id, "combo");
  assert.notEqual(e.main?.id, "combo-breaker");
});
