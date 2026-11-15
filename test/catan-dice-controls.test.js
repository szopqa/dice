import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as game from "../js/game.js";
import { applyRoll, shiftTurn, createGame, serialize, VERSION } from "../js/game.js";
import { evaluateEvents } from "../js/events.js";
import { loadGame, KEYS } from "../js/ui/storage.js";

const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function stub(impl) {
  Object.defineProperty(globalThis, "localStorage", { value: impl, configurable: true, writable: true });
}
function memory(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
  };
}
afterEach(() => {
  if (original) Object.defineProperty(globalThis, "localStorage", original);
  else delete globalThis.localStorage;
});

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

describe("catan-dice", () => {
  it("AC-30: index.html has no Undo or Re-roll button; roll, prev, next, new-game and silent remain", () => {
    const html = read("index.html");
    assert.doesNotMatch(html, /id="reroll"/);
    assert.doesNotMatch(html, /id="undo"/);
    assert.doesNotMatch(html, /re-?roll|undo/i);
    for (const id of ["roll", "prev", "next", "new-game", "silent"]) {
      assert.match(html, new RegExp(`id="${id}"`));
    }
  });

  it("AC-30: main.js does not look up or wire reroll/undo", () => {
    const js = read("js/main.js");
    for (const s of ['"reroll"', '"undo"', "rerollLast", "undoLast"]) {
      assert.ok(!js.includes(s), s);
    }
  });

  it("AC-31: game.js exports no way to remove or replace a roll", () => {
    assert.ok(!("rerollLast" in game));
    assert.ok(!("undoLast" in game));
    let g = createGame(["A", "B", "C"]);
    g = applyRoll(applyRoll(g, [3, 5]), [1, 2]);
    const snap = structuredClone(g.rolls);
    assert.deepEqual(shiftTurn(g, -1).rolls, snap);
    assert.deepEqual(shiftTurn(g, 1).rolls, snap);
    const next = applyRoll(g, [4, 4]);
    assert.deepEqual(next.rolls.slice(0, snap.length), snap);
    assert.equal(next.rolls.length, snap.length + 1);
  });

  it("AC-32: shifting back and rolling appends a normal roll attributed to the shown player", () => {
    let g = applyRoll(applyRoll(createGame(["A", "B", "C"]), [3, 5]), [3, 5]);
    const before = structuredClone(g.rolls);
    g = shiftTurn(g, -1);
    assert.equal(g.turn, 1);
    g = applyRoll(g, [3, 5]);
    assert.equal(g.rolls.length, 3);
    assert.equal(g.rolls[2].player, 1);
    assert.equal(g.turn, 2);
    assert.deepEqual(g.rolls.slice(0, 2), before);
    assert.equal(evaluateEvents(g).main.text, "TRIPLE COMBO!");
  });

  it("AC-32: events use the full history, e.g. serial robber across a corrected roll", () => {
    let g = createGame(["A", "B", "C"]);
    g = applyRoll(g, [2, 3]); // A
    g = applyRoll(g, [3, 4]); // B rolls 7
    g = shiftTurn(g, -1); // back to B
    g = applyRoll(g, [3, 4]); // B rolls 7 again
    const e = evaluateEvents(g);
    assert.equal(e.main.id, "serial-robber");
    assert.match(e.main.text, /B/);
  });

  it("AC-33: games saved after a Re-roll or Undo load unchanged", () => {
    const afterUndo = '{"version":1,"players":["A","B","C"],"turn":1,"rolls":[{"dice":[1,2],"sum":3,"player":0},{"dice":[3,4],"sum":7,"player":2}]}';
    const afterReroll = '{"version":1,"players":["A","B","C"],"turn":2,"rolls":[{"dice":[1,2],"sum":3,"player":0},{"dice":[6,6],"sum":12,"player":1}]}';
    const expectedUndo = {
      version: 1, players: ["A", "B", "C"], turn: 1,
      rolls: [{ dice: [1, 2], sum: 3, player: 0 }, { dice: [3, 4], sum: 7, player: 2 }],
    };
    const expectedReroll = {
      version: 1, players: ["A", "B", "C"], turn: 2,
      rolls: [{ dice: [1, 2], sum: 3, player: 0 }, { dice: [6, 6], sum: 12, player: 1 }],
    };
    for (const [text, expected] of [[afterUndo, expectedUndo], [afterReroll, expectedReroll]]) {
      stub(memory({ "catan-dice:game": text }));
      const loaded = loadGame();
      assert.deepEqual(loaded, expected);
      assert.equal(serialize(loaded), text);
    }
  });

  it("AC-33: save format is unchanged", () => {
    assert.equal(VERSION, 1);
    assert.equal(KEYS.game, "catan-dice:game");
  });
});
