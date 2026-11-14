// Synthesized retro sounds via Web Audio. No audio files.
// The AudioContext is created lazily on first non-silent play.

const STALE_MS = 250;

// Tiny silent PCM WAV (8 kHz, mono, 8-bit, 100 samples) as a data: URI.
// Played once from a gesture so iOS moves the page to the playback channel.
export function silentWavDataUri() {
  const n = 100;
  const bytes = new Uint8Array(44 + n);
  const dv = new DataView(bytes.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) bytes[o + i] = t.charCodeAt(i); };
  str(0, "RIFF"); dv.setUint32(4, 36 + n, true); str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, "data"); dv.setUint32(40, n, true);
  bytes.fill(128, 44); // 8-bit unsigned PCM: 128 is silence
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(bin);
}

export function createSound({
  isSilent = false,
  AudioContext: ACDep,
  Audio: AudioDep,
  navigator: navDep,
  now: nowDep,
} = {}) {
  let silent = !!isSilent;
  let ctx = null;
  let audioEl = null;

  const getAC = () => ACDep || globalThis.AudioContext || globalThis.webkitAudioContext;
  const getAudio = () => AudioDep || globalThis.Audio;
  const getNav = () => (navDep !== undefined ? navDep : globalThis.navigator);
  const now = () => {
    if (typeof nowDep === "function") return nowDep();
    return globalThis.performance && typeof globalThis.performance.now === "function"
      ? globalThis.performance.now()
      : Date.now();
  };
  const swallow = (p) => {
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  function getCtx() {
    if (silent) return null;
    try {
      if (ctx && ctx.state === "closed") ctx = null;
      if (!ctx) {
        const AC = getAC();
        if (!AC) return null;
        ctx = new AC();
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
    try {
      const c = getCtx();
      if (!c) return;
      if (c.state === "running") {
        fn(c, c.currentTime);
        return;
      }
      const t0 = now();
      const p = typeof c.resume === "function" ? c.resume() : null;
      if (p && typeof p.then === "function") {
        p.then(
          () => {
            try {
              if (silent || now() - t0 > STALE_MS) return;
              fn(c, c.currentTime);
            } catch {
              // sound must never break the game
            }
          },
          () => {},
        );
      } else {
        fn(c, c.currentTime);
      }
    } catch {
      // sound must never break the game
    }
  }

  function unlock() {
    if (silent) return;
    try {
      const nav = getNav();
      if (nav && "audioSession" in nav && nav.audioSession) nav.audioSession.type = "playback";
    } catch {
      // ignore
    }
    try {
      const c = getCtx();
      if (c) {
        if (c.state !== "running" && typeof c.resume === "function") swallow(c.resume());
        const buf = c.createBuffer(1, 1, c.sampleRate || 22050);
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(c.destination);
        src.start(0);
      }
    } catch {
      // ignore
    }
    try {
      if (!audioEl) {
        const A = getAudio();
        if (A) {
          audioEl = new A();
          audioEl.src = silentWavDataUri();
          swallow(audioEl.play());
        }
      }
    } catch {
      // ignore
    }
  }

  function resumeIfNeeded() {
    if (silent || !ctx) return;
    try {
      if (ctx.state === "closed") {
        ctx = null;
      } else if (ctx.state !== "running" && typeof ctx.resume === "function") {
        swallow(ctx.resume());
      }
    } catch {
      // ignore
    }
  }

  return {
    setSilent(v) {
      silent = !!v;
    },
    isSilent() {
      return silent;
    },
    unlock,
    resumeIfNeeded,
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
