import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createShakeDetector,
  shouldRollOnShake,
  motionSupport,
  requestMotionPermission,
} from "../js/shake.js";

// Sample with the given delta from gravity (along x).
const s = (delta, t) => ({ x: 9.81 + delta, y: 0, z: 0, t });
const calm = (t) => s(0, t);

describe("mobile-sound-haptics-shake", () => {
  it("AC-13: returns true exactly on the 3rd peak within 800 ms", () => {
    const d = createShakeDetector();
    const out = [calm(0), s(20, 100), calm(200), s(20, 300), calm(400), s(20, 500)].map((x) => d.push(x));
    assert.deepEqual(out, [false, false, false, false, false, true]);
  });

  it("AC-14: 2 peaks, slow peaks, sustained stretch, small motion never trigger", () => {
    let d = createShakeDetector();
    const run = (samples) => samples.map((x) => d.push(x));
    assert.ok(!run([s(20, 0), calm(100), s(20, 200), calm(300)]).includes(true));
    d = createShakeDetector();
    assert.ok(!run([s(20, 0), calm(100), s(20, 500), calm(600), s(20, 1000), calm(1100)]).includes(true));
    d = createShakeDetector();
    const sustained = Array.from({ length: 30 }, (_, i) => s(20, i * 10));
    assert.ok(!run(sustained).includes(true));
    d = createShakeDetector();
    const small = [];
    for (let i = 0; i < 20; i++) small.push(s(i % 2 ? 14 : 0, i * 20));
    assert.ok(!run(small).includes(true));
  });

  it("AC-15: cooldown suppresses and discards peaks; later shake triggers again", () => {
    const d = createShakeDetector();
    const shake = (t0) => [s(20, t0), calm(t0 + 50), s(20, t0 + 100), calm(t0 + 150), s(20, t0 + 200)].map((x) => d.push(x));
    assert.equal(shake(0).at(-1), true);
    // Peaks inside cooldown (T = 200): none return true.
    const during = [];
    for (let t = 300; t < 1700; t += 100) during.push(d.push(t % 200 ? calm(t) : s(20, t)));
    assert.ok(!during.includes(true));
    // Those peaks don't count: a single peak after cooldown is not enough.
    assert.equal(d.push(calm(1800)), false);
    assert.equal(d.push(s(20, 1850)), false);
    assert.equal(shake(2000).at(-1), true);
  });

  it("AC-16: invalid samples are ignored without changing state", () => {
    const d = createShakeDetector();
    assert.equal(d.push(s(20, 100)), false);
    assert.equal(d.push(calm(200)), false);
    const bad = [
      { x: null, y: 0, z: 0, t: 250 },
      { x: NaN, y: 0, z: 0, t: 250 },
      { x: 30, y: 0, z: 0 },
      s(20, 50), // t went backwards
      undefined,
      null,
    ];
    for (const b of bad) assert.equal(d.push(b), false);
    assert.equal(d.push(s(20, 300)), false);
    assert.equal(d.push(calm(400)), false);
    assert.equal(d.push(s(20, 500)), true);
  });

  it("AC-17: shouldRollOnShake gates on enabled, game screen, not animating", () => {
    assert.equal(shouldRollOnShake({ enabled: true, screen: "game", animating: false }), true);
    assert.equal(shouldRollOnShake({ enabled: false, screen: "game", animating: false }), false);
    assert.equal(shouldRollOnShake({ enabled: true, screen: "setup", animating: false }), false);
    assert.equal(shouldRollOnShake({ enabled: true, screen: "game", animating: true }), false);
    assert.equal(shouldRollOnShake({ enabled: true, screen: "game" }), false);
  });

  it("AC-18: motionSupport reports unsupported, insecure, ok", () => {
    assert.equal(motionSupport({ DeviceMotionEvent: undefined, isSecureContext: true }), "unsupported");
    assert.equal(motionSupport({ DeviceMotionEvent: {}, isSecureContext: false }), "insecure");
    assert.equal(motionSupport({ DeviceMotionEvent: {}, isSecureContext: true }), "ok");
  });

  it("AC-19: requestMotionPermission resolves per platform and calls synchronously", async () => {
    assert.equal(await requestMotionPermission({ DeviceMotionEvent: undefined, isSecureContext: true }), "unsupported");
    assert.equal(await requestMotionPermission({ DeviceMotionEvent: {}, isSecureContext: false }), "insecure");
    assert.equal(await requestMotionPermission({ DeviceMotionEvent: {}, isSecureContext: true }), "granted");
    let called = 0;
    const mk = (fn) => ({ DeviceMotionEvent: { requestPermission: () => (called++, fn()) }, isSecureContext: true });
    const p = requestMotionPermission(mk(() => Promise.resolve("granted")));
    assert.equal(called, 1);
    assert.equal(await p, "granted");
    assert.equal(await requestMotionPermission(mk(() => Promise.resolve("denied"))), "denied");
    assert.equal(await requestMotionPermission(mk(() => Promise.reject(new Error("no")))), "error");
    assert.equal(await requestMotionPermission(mk(() => { throw new Error("sync"); })), "error");
  });
});
