import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TIMER_DEFAULTS, createTimer, startTurn, stopTimer, pauseTimer, resumeTimer,
  remainingMs, timerPhase, tickTimer, resetForTurn, formatRemaining, nagText,
  TIMER_STEPS, nextStep, timerLabel,
} from "../js/timer.js";

describe("turn-timer", () => {
  it("AC-1: remainingMs counts down, clamps at 0, null when idle", () => {
    assert.deepEqual(TIMER_DEFAULTS, { durationMs: 60000, warnMs: 10000 });
    const t = startTurn(createTimer(), 1000);
    assert.equal(remainingMs(t, 16000), 45000);
    assert.equal(remainingMs(t, 61000), 0);
    assert.equal(remainingMs(t, 999999), 0);
    assert.equal(remainingMs(createTimer(), 5), null);
    assert.equal(remainingMs(stopTimer(t), 5), null);
  });

  it("AC-2: timerPhase running / warning / expired / idle", () => {
    const t = startTurn(createTimer(), 0);
    assert.equal(timerPhase(t, 49999), "running"); // 10001 left
    assert.equal(timerPhase(t, 50000), "warning"); // 10000 left
    assert.equal(timerPhase(t, 59999), "warning");
    assert.equal(timerPhase(t, 60000), "expired");
    assert.equal(timerPhase(createTimer(), 0), "idle");
  });

  it("AC-3: nags exactly once per expiry", () => {
    let t = startTurn(createTimer(), 0);
    let r = tickTimer(t, 30000);
    assert.equal(r.nag, false);
    r = tickTimer(r.state, 59999);
    assert.equal(r.nag, false);
    r = tickTimer(r.state, 60000);
    assert.equal(r.nag, true);
    assert.equal(r.state.nagged, true);
    r = tickTimer(r.state, 61000);
    assert.equal(r.nag, false);
    r = tickTimer(r.state, 100000);
    assert.equal(r.nag, false);
    // restart nags again
    t = startTurn(r.state, 200000);
    assert.equal(tickTimer(t, 230000).nag, false);
    assert.equal(tickTimer(t, 260000).nag, true);
  });

  it("AC-3: a single jump far past expiry nags once; idle never nags", () => {
    const t = startTurn(createTimer(), 0);
    const r = tickTimer(t, 10_000_000);
    assert.equal(r.nag, true);
    assert.equal(tickTimer(r.state, 20_000_000).nag, false);
    const idle = createTimer();
    const ri = tickTimer(idle, 10_000_000);
    assert.equal(ri.nag, false);
    assert.equal(ri.state, idle);
  });

  it("AC-4: pause freezes remaining and resume excludes paused time", () => {
    const t0 = startTurn(createTimer(), 0);
    const p = pauseTimer(t0, 20000);
    assert.equal(remainingMs(p, 20000), 40000);
    assert.equal(remainingMs(p, 400000), 40000);
    const r = resumeTimer(p, 500000);
    assert.equal(remainingMs(r, 500000), 40000);
    assert.equal(remainingMs(r, 510000), 30000);
  });

  it("AC-4: paused timer never nags, even at frozen zero", () => {
    const t0 = startTurn(createTimer(), 0);
    const p = pauseTimer(t0, 90000); // elapsed beyond duration
    assert.equal(remainingMs(p, 90000), 0);
    assert.equal(tickTimer(p, 999999).nag, false);
  });

  it("AC-4: invalid pause/resume return state unchanged", () => {
    const idle = createTimer();
    assert.equal(pauseTimer(idle, 5), idle);
    assert.equal(resumeTimer(idle, 5), idle);
    const running = startTurn(idle, 0);
    assert.equal(resumeTimer(running, 5), running);
    const paused = pauseTimer(running, 10);
    assert.equal(pauseTimer(paused, 20), paused);
  });

  it("AC-5: resetForTurn runs only when a duration is selected and rollCount >= 1", () => {
    let t = createTimer();
    t = tickTimer(startTurn(t, 0), 70000).state; // nagged
    const a = resetForTurn(t, { durationMs: 60000, rollCount: 1 }, 100000);
    assert.equal(a.status, "running");
    assert.equal(a.nagged, false);
    assert.equal(remainingMs(a, 100000), 60000);
    const bads = [
      { durationMs: 0, rollCount: 3 }, { durationMs: null, rollCount: 3 }, { durationMs: NaN, rollCount: 3 },
      { durationMs: -1, rollCount: 3 }, { durationMs: "60000", rollCount: 3 }, { durationMs: 60000, rollCount: 0 },
      { durationMs: undefined, rollCount: 2 },
    ];
    for (const arg of bads) {
      const b = resetForTurn(startTurn(createTimer(), 0), arg, 100000);
      assert.equal(b.status, "idle");
      assert.equal(remainingMs(b, 100000), null);
    }
  });

  it("AC-5: resets a paused timer to a fresh running turn", () => {
    const paused = pauseTimer(startTurn(createTimer(), 0), 30000);
    const r = resetForTurn(paused, { durationMs: 60000, rollCount: 1 }, 40000);
    assert.equal(r.status, "running");
    assert.equal(remainingMs(r, 40000), 60000);
  });

  it("AC-6: formatRemaining rounds seconds up", () => {
    assert.equal(formatRemaining(60000), "1:00");
    assert.equal(formatRemaining(59001), "1:00");
    assert.equal(formatRemaining(59000), "0:59");
    assert.equal(formatRemaining(9500), "0:10");
    assert.equal(formatRemaining(1), "0:01");
    assert.equal(formatRemaining(0), "0:00");
    assert.equal(formatRemaining(-5), "0:00");
    assert.equal(formatRemaining(NaN), "0:00");
    assert.equal(formatRemaining(Infinity), "0:00");
  });

  it("AC-7: nagText inserts the name as given", () => {
    assert.equal(nagText("Anna"), "TICK TOCK, Anna!");
    assert.equal(nagText("bEn"), "TICK TOCK, bEn!");
  });

  it("AC-8: non-finite now never throws and leaves state unchanged", () => {
    const t = startTurn(createTimer(), 1000);
    for (const bad of [NaN, undefined]) {
      assert.equal(startTurn(t, bad), t);
      assert.equal(pauseTimer(t, bad), t);
      assert.equal(resumeTimer(t, bad), t);
      const r = tickTimer(t, bad);
      assert.equal(r.nag, false);
      assert.equal(r.state, t);
      assert.doesNotThrow(() => remainingMs(t, bad));
      assert.doesNotThrow(() => timerPhase(t, bad));
      assert.doesNotThrow(() => resetForTurn(t, { durationMs: 60000, rollCount: 1 }, bad));
      assert.equal(resetForTurn(t, { durationMs: 120000, rollCount: 1 }, bad), t);
      assert.equal(resetForTurn(t, { durationMs: 0, rollCount: 1 }, bad).status, "idle");
    }
  });

  it("AC-8: backwards now counts as zero elapsed", () => {
    const t = startTurn(createTimer(), 5000);
    assert.equal(remainingMs(t, 1000), 60000);
    assert.equal(timerPhase(t, 1000), "running");
    assert.equal(tickTimer(t, 1000).nag, false);
    assert.equal(remainingMs(pauseTimer(t, 1000), 1000), 60000);
    assert.doesNotThrow(() => createTimer(null));
    assert.equal(createTimer(null).durationMs, 60000);
  });

  it("AC-2: phase boundaries hold for 120 s and 180 s", () => {
    for (const d of [120000, 180000]) {
      const t = startTurn(createTimer({ durationMs: d }), 0);
      assert.equal(timerPhase(t, d - 10001), "running");
      assert.equal(timerPhase(t, d - 10000), "warning");
      assert.equal(timerPhase(t, d), "expired");
      assert.equal(timerPhase(t, 0), "running");
    }
  });

  it("AC-21: warning is the final 10 s for every duration; a 5 s step starts in warning", () => {
    for (const d of TIMER_STEPS) {
      const t = resetForTurn(createTimer(), { durationMs: d, rollCount: 1 }, 0);
      assert.equal(t.warnMs, 10000);
      assert.equal(timerPhase(t, d - 10001), "running");
      assert.equal(timerPhase(t, d - 10000), "warning");
    }
    const t = resetForTurn(createTimer(), { durationMs: 5000, rollCount: 1 }, 0);
    assert.equal(timerPhase(t, 0), "warning");
  });

  it("AC-6: formatRemaining handles 2 and 3 minutes", () => {
    assert.equal(formatRemaining(120000), "2:00");
    assert.equal(formatRemaining(180000), "3:00");
  });

  it("AC-17: default cycle off -> 60 -> 120 -> 180 -> off", () => {
    assert.deepEqual([...TIMER_STEPS], [60000, 120000, 180000]);
    assert.ok(Object.isFrozen(TIMER_STEPS));
    assert.equal(nextStep(0), 60000);
    assert.equal(nextStep(60000), 120000);
    assert.equal(nextStep(120000), 180000);
    assert.equal(nextStep(180000), 0);
  });

  it("AC-18: custom list order and wrap; unknown/null/NaN/negative/legacy current -> off; empty list -> off", () => {
    const steps = [30000, 45000];
    assert.equal(nextStep(0, steps), 30000);
    assert.equal(nextStep(30000, steps), 45000);
    assert.equal(nextStep(45000, steps), 0);
    for (const bad of [90000, null, undefined, NaN, -60000, 1, "60000"]) assert.equal(nextStep(bad), 0);
    assert.equal(nextStep(0, []), 0);
    assert.equal(nextStep(60000, []), 0);
  });

  it("AC-19: timerLabel text and aria for off, 1/2/3 min, and a non-minute step", () => {
    assert.deepEqual(timerLabel(0), { text: "⏱️ Off", aria: "Turn timer: off" });
    assert.deepEqual(timerLabel(null), { text: "⏱️ Off", aria: "Turn timer: off" });
    assert.deepEqual(timerLabel(60000), { text: "⏱️ 1 min", aria: "Turn timer: 1 minute" });
    assert.deepEqual(timerLabel(120000), { text: "⏱️ 2 min", aria: "Turn timer: 2 minutes" });
    assert.deepEqual(timerLabel(180000), { text: "⏱️ 3 min", aria: "Turn timer: 3 minutes" });
    assert.deepEqual(timerLabel(90000), { text: "⏱️ 90 s", aria: "Turn timer: 90 seconds" });
    assert.deepEqual(timerLabel(1000), { text: "⏱️ 1 s", aria: "Turn timer: 1 second" });
  });

  it("AC-20: resetForTurn with a new duration restarts a running/expired+nagged timer at full new duration", () => {
    const running = startTurn(createTimer(), 0);
    const a = resetForTurn(running, { durationMs: 120000, rollCount: 1 }, 37000);
    assert.equal(a.durationMs, 120000);
    assert.equal(remainingMs(a, 37000), 120000);
    const nagged = tickTimer(running, 70000).state;
    assert.equal(nagged.nagged, true);
    const b = resetForTurn(nagged, { durationMs: 180000, rollCount: 2 }, 80000);
    assert.equal(b.nagged, false);
    assert.equal(b.status, "running");
    assert.equal(remainingMs(b, 80000), 180000);
    assert.equal(tickTimer(b, 80000 + 180000).nag, true);
  });
});
