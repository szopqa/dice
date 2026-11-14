// Turn timer logic. Pure module: no DOM, no clock reads. Time is injected as `now` (ms).
//
// State: { status: "idle" | "running" | "paused", durationMs, warnMs,
//          startedAt: number | null, elapsedMs: number, nagged: boolean }
// All functions are immutable: they return new objects and never mutate input.

export const TIMER_DEFAULTS = { durationMs: 60000, warnMs: 10000 };

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

/** The single reset rule: running with full duration if enabled and a roll exists, else idle. */
export function resetForTurn(t, { enabled, rollCount } = {}, now) {
  if (enabled === true && rollCount >= 1) return startTurn(t, now);
  return stopTimer(t);
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
