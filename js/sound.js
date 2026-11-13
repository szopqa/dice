// Synthesized retro sounds via Web Audio. No audio files.
// The AudioContext is created lazily on first non-silent play.

export function createSound({ isSilent = false } = {}) {
  let silent = !!isSilent;
  let ctx = null;

  function getCtx() {
    if (silent) return null;
    try {
      if (!ctx) {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended" && typeof ctx.resume === "function") {
        const p = ctx.resume();
        if (p && typeof p.catch === "function") p.catch(() => {});
      }
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(c, type, freq, start, dur, vol = 0.15) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(c, start, dur, vol = 0.12) {
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    const gain = c.createGain();
    src.buffer = buf;
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(gain);
    gain.connect(c.destination);
    src.start(start);
  }

  function run(fn) {
    const c = getCtx();
    if (!c) return;
    try {
      fn(c, c.currentTime);
    } catch {
      // sound must never break the game
    }
  }

  return {
    setSilent(v) {
      silent = !!v;
    },
    isSilent() {
      return silent;
    },
    playRattle() {
      run((c, t) => {
        for (let i = 0; i < 7; i++) noise(c, t + i * 0.07 + Math.random() * 0.02, 0.05, 0.1);
      });
    },
    playShout() {
      run((c, t) => {
        [440, 554, 659].forEach((f, i) => tone(c, "square", f, t + i * 0.07, 0.12));
      });
    },
    playBig() {
      run((c, t) => {
        [262, 330, 392, 523, 659, 784].forEach((f, i) => tone(c, "square", f, t + i * 0.08, 0.14));
        tone(c, "triangle", 131, t, 0.6, 0.2);
        noise(c, t + 0.48, 0.25, 0.1);
      });
    },
  };
}
