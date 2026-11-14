import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSound, silentWavDataUri } from "../js/sound.js";

function makeAC({ state = "suspended", resume } = {}) {
  const log = { ctxs: [], starts: [], buffers: [], connected: [], resumes: 0 };
  class AC {
    constructor() {
      log.ctxs.push(this);
      this.state = state;
      this.currentTime = 1;
      this.sampleRate = 8000;
      this.destination = { dest: true };
    }
    resume() {
      log.resumes++;
      return resume ? resume(this) : Promise.resolve();
    }
    createOscillator() { return node(); }
    createGain() { return node(); }
    createBufferSource() {
      const n = node();
      n.connect = (d) => log.connected.push(d);
      return n;
    }
    createBuffer(ch, len) {
      const b = { ch, len, getChannelData: () => new Float32Array(len) };
      log.buffers.push(b);
      return b;
    }
  }
  function node() {
    return {
      connect() {}, stop() {}, type: "",
      start(t) { log.starts.push(t); },
      frequency: { setValueAtTime() {} },
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
    };
  }
  return { AC, log };
}

function decode(uri) {
  return Buffer.from(uri.slice("data:audio/wav;base64,".length), "base64");
}

describe("mobile-sound-haptics-shake", () => {
  it("AC-22: isRunning is true only when a context exists and is running", () => {
    const a = makeAC({ state: "suspended" });
    const snd = createSound({ AudioContext: a.AC, Audio: undefined, navigator: {} });
    assert.equal(snd.isRunning(), false);
    snd.unlock();
    assert.equal(snd.isRunning(), false);
    a.log.ctxs[0].state = "running";
    assert.equal(snd.isRunning(), true);
  });

  it("AC-1: unlock creates one context, resumes, plays 1-sample buffer to destination", () => {
    const { AC, log } = makeAC();
    const s = createSound({ AudioContext: AC, Audio: undefined, navigator: {} });
    s.unlock();
    assert.equal(log.ctxs.length, 1);
    assert.equal(log.resumes, 1);
    assert.equal(log.buffers[0].len, 1);
    assert.equal(log.connected[0], log.ctxs[0].destination);
    assert.equal(log.starts.length, 1);
    s.unlock();
    assert.equal(log.ctxs.length, 1);
  });

  it("AC-2: silent unlock touches nothing", () => {
    const { AC, log } = makeAC();
    let audios = 0;
    let touched = 0;
    const nav = { get audioSession() { touched++; return { type: "auto" }; } };
    const s = createSound({
      isSilent: true, AudioContext: AC, Audio: class { constructor() { audios++; } }, navigator: nav,
    });
    s.unlock();
    assert.equal(log.ctxs.length, 0);
    assert.equal(audios, 0);
    assert.equal(touched, 0);
  });

  it("AC-3: sets audioSession.type to playback; tolerates missing audioSession", () => {
    const { AC } = makeAC();
    const nav = { audioSession: { type: "auto" } };
    createSound({ AudioContext: AC, navigator: nav }).unlock();
    assert.equal(nav.audioSession.type, "playback");
    assert.doesNotThrow(() => createSound({ AudioContext: AC, navigator: {} }).unlock());
  });

  it("AC-4: creates one silent Audio element, plays it, swallows rejection", async () => {
    const { AC } = makeAC();
    const els = [];
    class A {
      constructor() { els.push(this); this.plays = 0; }
      play() { this.plays++; return Promise.reject(new Error("blocked")); }
    }
    const s = createSound({ AudioContext: AC, Audio: A, navigator: {} });
    s.unlock();
    s.unlock();
    await new Promise((r) => setImmediate(r));
    assert.equal(els.length, 1);
    assert.equal(els[0].src, silentWavDataUri());
    assert.equal(els[0].plays, 1);
  });

  it("AC-5: silentWavDataUri is a small valid silent PCM WAV", () => {
    const uri = silentWavDataUri();
    assert.ok(uri.startsWith("data:audio/wav;base64,"));
    const b = decode(uri);
    assert.ok(b.length < 1024);
    assert.equal(b.toString("ascii", 0, 4), "RIFF");
    assert.equal(b.toString("ascii", 8, 12), "WAVE");
    assert.equal(b.toString("ascii", 12, 16), "fmt ");
    assert.equal(b.readUInt16LE(20), 1);
    assert.equal(b.readUInt16LE(22), 1);
    const bits = b.readUInt16LE(34);
    assert.equal(b.toString("ascii", 36, 40), "data");
    const len = b.readUInt32LE(40);
    assert.equal(44 + len, b.length);
    const silence = bits === 8 ? 128 : 0;
    for (let i = 44; i < b.length; i += bits / 8) {
      const v = bits === 8 ? b[i] : b.readInt16LE(i);
      assert.equal(v, silence);
    }
  });

  it("AC-6: suspended context defers nodes until resume resolves; running starts synchronously", async () => {
    let release;
    const { AC, log } = makeAC({
      resume: (c) => new Promise((r) => { release = () => { c.state = "running"; c.currentTime = 5; r(); }; }),
    });
    const s = createSound({ AudioContext: AC, now: () => 0 });
    s.playRattle();
    assert.equal(log.starts.length, 0);
    release();
    await new Promise((r) => setImmediate(r));
    assert.ok(log.starts.length > 0);
    assert.ok(log.starts.every((t) => t >= 5));

    const run = makeAC({ state: "running" });
    const s2 = createSound({ AudioContext: run.AC });
    s2.playShout();
    assert.equal(run.log.starts.length, 3);
    s2.playBig();
    assert.ok(run.log.starts.length > 3);
  });

  it("AC-6: pending sound does not play if setSilent(true) before resume resolves", async () => {
    let release;
    const { AC, log } = makeAC({
      resume: (c) => new Promise((r) => { release = () => { c.state = "running"; r(); }; }),
    });
    const s = createSound({ AudioContext: AC, now: () => 0 });
    s.playRattle();
    s.setSilent(true);
    release();
    await new Promise((r) => setImmediate(r));
    assert.equal(log.starts.length, 0);
  });

  it("AC-7: sound is dropped when resume resolves more than 250 ms late", async () => {
    let t = 0;
    let release;
    const { AC, log } = makeAC({ resume: () => new Promise((r) => { release = r; }) });
    const s = createSound({ AudioContext: AC, now: () => t });
    s.playRattle();
    t = 251;
    release();
    await new Promise((r) => setImmediate(r));
    assert.equal(log.starts.length, 0);

    t = 0;
    s.playRattle();
    t = 250;
    release();
    await new Promise((r) => setImmediate(r));
    assert.ok(log.starts.length > 0);
  });

  it("AC-8: resumeIfNeeded resumes suspended/interrupted, no-ops otherwise, replaces closed ctx", () => {
    const { AC, log } = makeAC();
    const s = createSound({ AudioContext: AC });
    s.resumeIfNeeded();
    assert.equal(log.ctxs.length, 0);
    s.unlock();
    const before = log.resumes;
    s.resumeIfNeeded();
    assert.equal(log.resumes, before + 1);
    log.ctxs[0].state = "interrupted";
    s.resumeIfNeeded();
    assert.equal(log.resumes, before + 2);
    log.ctxs[0].state = "closed";
    s.resumeIfNeeded();
    assert.equal(log.ctxs.length, 1);
    s.unlock();
    assert.equal(log.ctxs.length, 2);

    const sil = makeAC();
    const s2 = createSound({ isSilent: true, AudioContext: sil.AC });
    s2.resumeIfNeeded();
    assert.equal(sil.log.ctxs.length, 0);
  });

  it("AC-9: never throws without globals or with throwing stubs", async () => {
    const all = (s) => {
      s.unlock(); s.resumeIfNeeded(); s.playRattle(); s.playShout(); s.playBig();
    };
    assert.doesNotThrow(() => all(createSound({ AudioContext: undefined, Audio: undefined, navigator: undefined })));

    const boom = () => { throw new Error("boom"); };
    class BadAC { constructor() { boom(); } }
    assert.doesNotThrow(() => all(createSound({ AudioContext: BadAC, Audio: BadAC, navigator: {} })));

    class BadMethods {
      constructor() { this.state = "suspended"; this.currentTime = 0; this.destination = {}; }
      resume() { boom(); }
      createBuffer() { boom(); }
      createBufferSource() { boom(); }
      createOscillator() { boom(); }
      createGain() { boom(); }
      play() { boom(); }
    }
    const nav = { get audioSession() { return boom(); } };
    assert.doesNotThrow(() => all(createSound({ AudioContext: BadMethods, Audio: BadMethods, navigator: nav })));

    class RejectAC extends BadMethods {
      resume() { return Promise.reject(new Error("no")); }
    }
    assert.doesNotThrow(() => all(createSound({ AudioContext: RejectAC })));
    await new Promise((r) => setImmediate(r));
  });
});
