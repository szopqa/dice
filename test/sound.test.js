import { test } from "node:test";
import assert from "node:assert/strict";
import { createSound } from "../js/sound.js";

function stubAC() {
  const state = { count: 0 };
  const node = () => ({
    connect() {}, start() {}, stop() {}, type: "",
    frequency: { setValueAtTime() {} },
    gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
  });
  globalThis.AudioContext = class {
    constructor() { state.count++; this.state = "suspended"; this.currentTime = 0; this.sampleRate = 8000; this.destination = {}; }
    resume() { state.resumed = true; return Promise.resolve(); }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createBufferSource() { return node(); }
    createBuffer() { return { getChannelData: () => new Float32Array(10) }; }
  };
  return state;
}

test("AC-29: silent mode never constructs an AudioContext", () => {
  const state = stubAC();
  const s = createSound({ isSilent: true });
  s.playRattle(); s.playShout(); s.playBig();
  assert.equal(state.count, 0);
  delete globalThis.AudioContext;
});

test("AC-29: non-silent play lazily creates one context and resumes it", () => {
  const state = stubAC();
  const s = createSound();
  assert.equal(state.count, 0);
  s.playRattle(); s.playShout(); s.playBig();
  assert.equal(state.count, 1);
  assert.ok(state.resumed);
  s.setSilent(true);
  assert.equal(s.isSilent(), true);
  delete globalThis.AudioContext;
});

test("AC-29: does not throw without AudioContext", () => {
  delete globalThis.AudioContext;
  const s = createSound();
  s.playRattle(); s.playShout(); s.playBig();
});
