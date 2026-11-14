// Turn timer logic. Pure module: no DOM, no clock reads. Time is injected as `now` (ms).
//
// State: { status: "idle" | "running" | "paused", durationMs, warnMs,
//          startedAt: number | null, elapsedMs: number, nagged: boolean }
// All functions are immutable: they return new objects and never mutate input.

export const TIMER_DEFAULTS = { durationMs: 60000, warnMs: 10000 };

// Selectable durations in ms, in cycle order: positive whole seconds. Off (0) is implicit:
// it comes before the first entry and after the last, and is never listed.
export const TIMER_STEPS = Object.freeze([60000, 120000, 180000]);

const isNum = (n) => typeof n === "number" && Number.isFinite(n);

export function createTimer(opts) {
  const { durationMs, warnMs } = opts ?? {};
  return {
    status: "idle",
    durationMs: durationMs ?? TIMER_DEFAULTS.durationMs,
    warnMs: warnMs ?? TIMER_DEFAULTS.warnMs,
    startedAt: null,
    elapsedMs: 0,
    nagged: false,
  };
}

export function startTurn(t, now) {
  if (!isNum(now)) return t;
  return { ...t, status: "running", startedAt: now, elapsedMs: 0, nagged: false };
}

export function stopTimer(t) {
  return { ...t, status: "idle", startedAt: null, elapsedMs: 0, nagged: false };
}

export function pauseTimer(t, now) {
  if (t.status !== "running" || !isNum(now)) return t;
  return { ...t, status: "paused", startedAt: null, elapsedMs: t.elapsedMs + Math.max(0, now - t.startedAt) };
}

export function resumeTimer(t, now) {
  if (t.status !== "paused" || !isNum(now)) return t;
  return { ...t, status: "running", startedAt: now };
}

/** Remaining ms in [0, durationMs], or null when idle. */
export function remainingMs(t, now) {
  if (t.status === "idle") return null;
  const running = t.status === "running" && isNum(now) ? Math.max(0, now - t.startedAt) : 0;
  const left = t.durationMs - (t.elapsedMs + running);
  return Math.min(t.durationMs, Math.max(0, left));
}

export function timerPhase(t, now) {
  const left = remainingMs(t, now);
  if (left === null) return "idle";
  if (left === 0) return "expired";
  return left <= t.warnMs ? "warning" : "running";
}

/** Returns { state, nag }; nag is true once, at the first tick where remaining is 0. */
export function tickTimer(t, now) {
  if (t.status !== "running" || t.nagged || !isNum(now)) return { state: t, nag: false };
  if (remainingMs(t, now) !== 0) return { state: t, nag: false };
  return { state: { ...t, nagged: true }, nag: true };
}

/** The single reset rule: running with the full duration if one is selected and a roll exists, else idle. */
export function resetForTurn(t, { durationMs, rollCount } = {}, now) {
  if (isNum(durationMs) && durationMs > 0 && rollCount >= 1) {
    if (!isNum(now)) return t;
    return startTurn({ ...t, durationMs }, now);
  }
  return stopTimer(t);
}

/** Next duration in the cycle: 0 -> steps[0] -> ... -> last -> 0. Unknown values give 0 (off). */
export function nextStep(currentMs, steps = TIMER_STEPS) {
  if (currentMs === 0) return steps.length ? steps[0] : 0;
  const i = steps.indexOf(currentMs);
  if (i < 0 || i + 1 >= steps.length) return 0;
  return steps[i + 1];
}

/** Button label for a selected duration: { text, aria }. */
export function timerLabel(ms) {
  if (!isNum(ms) || ms <= 0) return { text: "⏱️ Off", aria: "Turn timer: off" };
  const sec = Math.round(ms / 1000);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (sec % 60 === 0) return { text: `⏱️ ${sec / 60} min`, aria: `Turn timer: ${plural(sec / 60, "minute")}` };
  return { text: `⏱️ ${sec} s`, aria: `Turn timer: ${plural(sec, "second")}` };
}

export function formatRemaining(ms) {
  if (!isNum(ms) || ms <= 0) return "0:00";
  const total = Math.ceil(ms / 1000);
  const s = total % 60;
  return `${Math.floor(total / 60)}:${String(s).padStart(2, "0")}`;
}

export function nagText(name) {
  return `TICK TOCK, ${name}!`;
}
