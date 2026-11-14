import { test } from "node:test";
import assert from "node:assert/strict";
import { createHaptics, HAPTIC_PATTERNS } from "../js/haptics.js";

function stub() {
  const calls = [];
  return { calls, vibrate: (p) => (calls.push(p), true) };
}

test("AC-10: vibrate receives the matching pattern when enabled", () => {
  const nav = stub();
  const h = createHaptics({ navigator: nav });
  h.tick();
  h.shout();
  h.big();
  assert.deepEqual(nav.calls, [HAPTIC_PATTERNS.tick, HAPTIC_PATTERNS.shout, HAPTIC_PATTERNS.big]);
});

test("AC-10: disabled initially or via setEnabled calls neither vibrate nor switchTick", () => {
  for (const mk of [
    (nav, st) => createHaptics({ enabled: false, navigator: nav, switchTick: st }),
    (nav, st) => {
      const h = createHaptics({ navigator: nav, switchTick: st });
      h.setEnabled(false);
      return h;
    },
  ]) {
    const nav = stub();
    let ticks = 0;
    const h = mk(nav, () => ticks++);
    h.tick();
    h.shout();
    h.big();
    assert.equal(nav.calls.length, 0);
    assert.equal(ticks, 0);
    assert.equal(h.isEnabled(), false);
  }
  let ticks = 0;
  createHaptics({ enabled: false, navigator: {}, switchTick: () => ticks++ }).tick();
  assert.equal(ticks, 0);
});

test("AC-11: switchTick used for tick only when vibrate is missing", () => {
  let ticks = 0;
  const h = createHaptics({ navigator: {}, switchTick: () => ticks++ });
  h.tick();
  assert.equal(ticks, 1);
  h.shout();
  h.big();
  assert.equal(ticks, 1);

  const nav = stub();
  let t2 = 0;
  const h2 = createHaptics({ navigator: nav, switchTick: () => t2++ });
  h2.tick();
  h2.shout();
  h2.big();
  assert.equal(t2, 0);
});

test("AC-12: never throws with undefined navigator or failing vibrate", () => {
  const variants = [
    { navigator: undefined, switchTick: null },
    { navigator: { vibrate: () => { throw new Error("x"); } } },
    { navigator: { vibrate: () => false } },
    { navigator: {}, switchTick: () => { throw new Error("y"); } },
  ];
  for (const v of variants) {
    const h = createHaptics(v);
    assert.doesNotThrow(() => {
      h.tick();
      h.shout();
      h.big();
    });
  }
});
