import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
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

  it("AC-9: loadTimer is false when absent or '0', true when '1'", () => {
    stub(memory());
    assert.equal(loadTimer(), false);
    stub(memory({ "catan-dice:timer": "0" }));
    assert.equal(loadTimer(), false);
    stub(memory({ "catan-dice:timer": "1" }));
    assert.equal(loadTimer(), true);
  });

  it("AC-9: saveTimer writes '1'/'0'", () => {
    const m = memory();
    stub(m);
    saveTimer(true); assert.equal(m.data["catan-dice:timer"], "1");
    saveTimer(false); assert.equal(m.data["catan-dice:timer"], "0");
  });

  it("AC-9: throwing localStorage yields false and saveTimer is a no-op", () => {
    const boom = () => { throw new Error("denied"); };
    stub({ getItem: boom, setItem: boom, removeItem: boom });
    assert.equal(loadTimer(), false);
    assert.doesNotThrow(() => { saveTimer(true); });
  });
});
