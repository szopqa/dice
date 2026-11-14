import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TIMER_STEPS } from "../js/timer.js";
import { loadTimer, saveTimer, KEYS } from "../js/ui/storage.js";

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

describe("turn-timer", () => {
  it("AC-9: key is catan-dice:timer", () => {
    assert.equal(KEYS.timer, "catan-dice:timer");
  });

  const K = "catan-dice:timer";

  it('AC-9: absent, "" and "0" load as off', () => {
    stub(memory()); assert.equal(loadTimer(), 0);
    stub(memory({ [K]: "" })); assert.equal(loadTimer(), 0);
    stub(memory({ [K]: "0" })); assert.equal(loadTimer(), 0);
  });

  it('AC-9: "60"/"120"/"180" load as ms', () => {
    for (const s of [60, 120, 180]) {
      stub(memory({ [K]: String(s) }));
      assert.equal(loadTimer(), s * 1000);
    }
  });

  it('AC-9: legacy "1" loads as 60000', () => {
    stub(memory({ [K]: "1" }));
    assert.equal(loadTimer(), 60000);
  });

  it('AC-9: "abc", "-5", "1.5", "90", "2" load as off', () => {
    for (const v of ["abc", "-5", "1.5", "90", "2"]) {
      stub(memory({ [K]: v }));
      assert.equal(loadTimer(), 0, v);
    }
  });

  it("AC-9: saveTimer writes seconds and round-trips every step", () => {
    const m = memory();
    stub(m);
    saveTimer(0); assert.equal(m.data[K], "0");
    saveTimer(NaN); assert.equal(m.data[K], "0");
    for (const ms of TIMER_STEPS) {
      saveTimer(ms);
      assert.equal(m.data[K], String(ms / 1000));
      assert.equal(loadTimer(), ms);
    }
  });

  it("AC-9: throwing localStorage -> off, save is a no-op", () => {
    const boom = () => { throw new Error("denied"); };
    stub({ getItem: boom, setItem: boom, removeItem: boom });
    assert.equal(loadTimer(), 0);
    assert.doesNotThrow(() => { saveTimer(60000); });
  });

  it("AC-18: loadTimer follows a custom list (removed step -> off; legacy 1 -> off when 60 s unlisted)", () => {
    const steps = [30000, 120000];
    stub(memory({ [K]: "30" })); assert.equal(loadTimer(steps), 30000);
    stub(memory({ [K]: "120" })); assert.equal(loadTimer(steps), 120000);
    stub(memory({ [K]: "180" })); assert.equal(loadTimer(steps), 0);
    stub(memory({ [K]: "1" })); assert.equal(loadTimer(steps), 0);
  });
});
