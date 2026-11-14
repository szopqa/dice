import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { loadShake, saveShake } from "../js/ui/storage.js";

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

describe("mobile-sound-haptics-shake", () => {
  it("AC-20: loadShake defaults false, true when '1'", () => {
    stub(memory());
    assert.equal(loadShake(), false);
    stub(memory({ "catan-dice:shake": "1" }));
    assert.equal(loadShake(), true);
  });

  it("AC-20: saveShake writes '1'/'0'", () => {
    const m = memory();
    stub(m);
    saveShake(true); assert.equal(m.data["catan-dice:shake"], "1");
    saveShake(false); assert.equal(m.data["catan-dice:shake"], "0");
  });

  it("AC-20: throwing localStorage yields defaults without throwing", () => {
    const boom = () => { throw new Error("denied"); };
    stub({ getItem: boom, setItem: boom, removeItem: boom });
    assert.equal(loadShake(), false);
    assert.doesNotThrow(() => { saveShake(true); });
  });
});
