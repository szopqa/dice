import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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
});
