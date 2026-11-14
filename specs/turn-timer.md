# Turn timer and nag

## Goal
At the table, a Catan turn can drag on while everyone waits for the current player. This feature adds an optional per-turn countdown to the game screen. It is off by default. When it is on, a small m:ss countdown runs for the player whose turn it is. It pulses during the final 10 seconds. When it reaches zero, the app shouts "TICK TOCK, <name>!" using the existing shout banner, the shout sound (unless Silent is on) and the shout haptic pattern. A third icon toggle (⏱️) sits next to the existing Sound 🔊 and Shake 🫨 toggles, and its setting is saved in localStorage like theirs. The project keeps its existing rules. All timer decisions (remaining time, warning phase, when to nag, resets, pause) live in a pure module, `js/timer.js`. Time is injected as a number, so `node --test` covers the module without real clocks. There are no dependencies, no DOM tests, and the UI is English only.

## Out of scope
- Choosing the duration or warning window in the UI. Both are code constants (`TIMER_DEFAULTS`).
- Per-player durations, time banks, chess-clock totals, statistics on turn length, and penalties.
- Counting the build/trade phase separately from the roll. In this app a turn changes when the dice are rolled (catan-dice AC-5), so the timer covers the whole span between two rolls.
- Persisting the remaining time across reloads. Only the on/off setting is saved.
- Running the countdown in the background, notifications, and wake lock.
- New sounds, audio files, or new haptic patterns. The nag reuses `playShout()` and `HAPTIC_PATTERNS.shout`.
- Changes to dice, game state, event rules, shake detection, or the deploy workflow.
- DOM/browser test automation. UI ACs are checked by hand.
- Localization. The nag text is English only.

## Acceptance criteria

### Timer logic (pure-testable, `node --test`, `js/timer.js`)
The state is an immutable plain object (see Technical notes). Every function takes the current time as `now` (ms, a monotonic number from the caller) and returns a new object. Nothing in the module reads a clock.

- AC-1 (pure-testable): Given `t = startTurn(createTimer(), 1000)` with the defaults (60 000 ms), when `remainingMs(t, 16000)` is called, then it returns `45000`. `remainingMs(t, 61000)` and `remainingMs(t, 999999)` both return `0`, so the value never goes negative. Given an idle timer (`createTimer()` or `stopTimer(t)`), `remainingMs` returns `null`.
- AC-2 (pure-testable): Given a started timer, when `timerPhase(t, now)` is called, then it returns `"running"` while remaining > 10 000 ms, `"warning"` while 0 < remaining ≤ 10 000 ms (exactly 10 000 counts as `"warning"`, 10 001 as `"running"`), and `"expired"` at remaining 0. It returns `"idle"` for an idle timer.
- AC-3 (pure-testable): Given a started timer, when `tickTimer(t, now)` is called repeatedly with increasing `now`, then it returns `{ state, nag }`, where `nag` is `true` on exactly one call: the first call at which remaining is 0. This holds even if a single call jumps from well before expiry to far past it. Every earlier and later call returns `nag: false`. After `startTurn` is called again, the next expiry nags once again. Ticking an idle timer always returns `nag: false` and leaves the state unchanged.
- AC-4 (pure-testable): Given a timer started at 0 and paused with `pauseTimer(t, 20000)`, when `resumeTimer(t, 500000)` is called, then `remainingMs(t, 500000)` is `40000`, so time spent paused does not count. While paused, `remainingMs` stays at `40000` for any `now`, and `tickTimer` never returns `nag: true`, even if the frozen remaining is 0. Pausing an idle or already-paused timer, and resuming a timer that is not paused, return the state unchanged.
- AC-5 (pure-testable): When `resetForTurn(t, { enabled, rollCount }, now)` is called, then it returns a running timer with the full duration and `nagged` cleared if `enabled === true` and `rollCount >= 1`. Otherwise it returns an idle timer. This is the single reset rule. `main.js` calls it after every roll reveal, re-roll reveal, undo, turn shift, toggle-on, and page load (see AC-11).
- AC-6 (pure-testable): When `formatRemaining(ms)` is called, then it returns `m:ss`, with seconds rounded up: `60000 → "1:00"`, `59001 → "1:00"`, `59000 → "0:59"`, `9500 → "0:10"`, `1 → "0:01"`, `0 → "0:00"`. A negative or non-finite input returns `"0:00"`.
- AC-7 (pure-testable): When `nagText("Anna")` is called, then it returns exactly `"TICK TOCK, Anna!"`. The name is inserted as given, with no case change.
- AC-8 (pure-testable): Given a `now` that is `NaN`, `undefined`, or lower than the timer's `startedAt` (the clock went backwards), when any timer function is called, then it does not throw. A non-finite `now` makes the time-dependent transitions (`startTurn`, `pauseTimer`, `resumeTimer`, `tickTimer`, and the start branch of `resetForTurn`) return the state unchanged (and `tickTimer` returns `nag: false`); `stopTimer` and the idle branch of `resetForTurn` do not use `now` and still return an idle timer. A backwards `now` is treated as zero elapsed time, so `remainingMs` returns the full duration.

### Persistence (pure-testable, `node --test`, `js/ui/storage.js`)
- AC-9 (pure-testable): Given a stub `localStorage`, when `loadTimer()` is called, then it returns `false` when `catan-dice:timer` is absent or `"0"`, and `true` when it is `"1"`. `saveTimer(v)` writes `"1"`/`"0"`. A throwing `localStorage` makes `loadTimer()` return `false` without throwing, and makes `saveTimer` a no-op.

### UI (manual QA, `index.html`, `css/styles.css`, `js/main.js`)
- AC-10 (manual QA): Given the game screen at a 360×640 viewport, then a third icon toggle (⏱️) sits next to Sound and Shake to roll. It has `aria-label="Turn timer"`, `aria-pressed="true"` only when the timer is on, and a tap target of at least 44×44 CSS px. It is off on first visit, and its state survives a reload. All catan-dice AC-26 and mobile-sound-haptics-shake AC-21 layout conditions still hold (everything visible without scrolling, no horizontal scroll), and turning the timer on or off does not shift the layout.
- AC-11 (manual QA): Given the timer is on and at least one roll exists, then a countdown in `m:ss` format is shown near the "<name>'s turn" / "Next:" lines and counts down from `1:00`. It restarts from `1:00` when a roll or re-roll is revealed (after the tumble, or immediately under reduced motion; tap or shake), after Undo when rolls remain, and after ◀/▶. While the dice tumble, the countdown is stopped and cannot nag. Before the first roll, and after Undo removes the last roll, no countdown is shown and nothing runs. New game stops it.
- AC-12 (manual QA): Given a running countdown, when remaining reaches 10 s or less, then the countdown pulses in the accent/warning style until it is reset or expires. Given `prefers-reduced-motion: reduce`, it changes to the warning colour without any pulse animation.
- AC-13 (manual QA): Given the countdown reaches `0:00` on the game screen, then exactly once for that turn: the shout banner (the same style as `"shout"` events, not the big shake/flash) shows `TICK TOCK, <name>!` with `players[turn]`; `playShout()` plays unless Silent is on (in silent mode no sound plays and no `AudioContext` is created); and `haptics.shout()` vibrates on Android (iPhone feels nothing). The countdown then stays at `0:00` in the expired style without nagging again, until one of the AC-11 resets happens.
- AC-14 (manual QA): Given a running countdown, when the page becomes hidden (`visibilitychange` → hidden, or `pagehide`) and is shown again any time later, then the countdown resumes from the same remaining time it had when hidden. No nag fires while hidden, and none fires in a burst on return.
- AC-15 (manual QA): Given the timer is on and a game with at least one roll, when the page reloads (including the Start game reload, which has zero rolls and so shows no countdown), then the countdown starts fresh from `1:00` and no nag fires on load.
- AC-16 (manual QA): Given the countdown is running (including in the warning or expired phase), when the toggle is turned off, then the countdown disappears at once, any pulse stops, and no nag fires later. Given the toggle is turned on mid-turn with at least one roll, the countdown starts from `1:00`.

## Technical notes

**Files**
- `js/timer.js` (new, pure, no DOM, no clock reads). Exports:
  - `TIMER_DEFAULTS = { durationMs: 60000, warnMs: 10000 }`
  - `createTimer({ durationMs, warnMs } = TIMER_DEFAULTS)`
  - `startTurn(t, now)`, `stopTimer(t)`, `pauseTimer(t, now)`, `resumeTimer(t, now)`
  - `remainingMs(t, now)`, `timerPhase(t, now)`, `tickTimer(t, now)`
  - `resetForTurn(t, { enabled, rollCount }, now)`
  - `formatRemaining(ms)`, `nagText(name)`

  The state shape is `{ status: "idle" | "running" | "paused", durationMs, warnMs, startedAt: number | null, elapsedMs: number, nagged: boolean }`. Remaining is `durationMs − (elapsedMs + (status === "running" ? max(0, now − startedAt) : 0))`, clamped to `[0, durationMs]`. Pausing folds the running span into `elapsedMs`. `tickTimer` sets `nagged: true` when it returns `nag: true`.
- `js/ui/storage.js` (modify): add `KEYS.timer = "catan-dice:timer"`, `loadTimer`, and `saveTimer`, with values `"1"`/`"0"` and a default of off. This matches the `loadShake`/`saveShake` pattern.
- `js/main.js` (modify):
  - Hold `timer` state, plus a `setInterval` of about 250 ms that runs only while the timer is running. Each tick calls `tickTimer(timer, performance.now())`, updates the countdown text and phase class, and on `nag` calls the nag path.
  - The nag path is `showBanner({ text: nagText(game.players[game.turn]) }, false)`, `sound.playShout()` (already a no-op when silent), and `haptics.shout()`. Do not use `haptics.land()`, because its iOS `switchTick` fallback is meant only for gesture rolls.
  - In `rollWith`, call `stopTimer`. In `reveal`, call `resetForTurn`. `updateGame` (Undo, ◀/▶) calls `resetForTurn` with the new `game.rolls.length`. `newGame` calls `stopTimer`. On load, call `resetForTurn` with `loadTimer()`.
  - Extend the existing `visibilitychange`/`pagehide` handlers with `pauseTimer`/`resumeTimer`.
  - Add a `toggleTimer` that follows `toggleSilent`: flip, save, re-sync, then render.
- `index.html` (modify): add a `<button class="btn btn--toggle" id="timer-toggle" aria-label="Turn timer" aria-pressed="false">⏱️</button>` after `#shake`. Add a countdown element (e.g. `<p id="timer" class="timer">`) in the turn area. It is not `aria-live`, because per-second announcements would spam screen readers; the nag is announced through the existing `aria-live` banner.
- `css/styles.css` (modify): the second controls row now holds New game + 3 icon toggles, which matches the 3-toggle layout from the original mobile spec. Give `.timer` a reserved `min-height` and use `visibility: hidden` when idle, so the layout does not jump. Add `.timer--warning` (with a pulse keyframe, disabled under `prefers-reduced-motion`) and `.timer--expired`.
- Tests: `test/timer.test.js` (AC-1 to AC-8) and `test/turn-timer-storage.test.js` (AC-9), with cases wrapped in `describe("turn-timer", …)` and titles starting with the AC id, for example `it("AC-3: nags exactly once per expiry")`. Existing tests stay unchanged.
- `README.md`: mention the third toggle and the `catan-dice:timer` key in Usage.

**Decisions**
- Duration is 60 s. The warning/pulse window is the final 10 s. There is one nag per turn, at 0.
- The timer only runs once at least one roll exists. Before the first roll the table is still getting ready, and catan-dice AC-27/mobile AC-30 already reload into a zero-roll game.
- Re-roll resets the timer. A re-roll means the previous roll was redone, so the current player has not had a fair turn yet.
- Undo resets the timer for the restored player. Undo to zero rolls returns to the pre-first-roll idle state.
- The timer pauses while the page is hidden and resumes with the remaining time it had. It neither catches up nor nags in the background. Browsers throttle timers in hidden tabs anyway.
- After a reload the countdown starts fresh from the full duration, because the remaining time is not persisted.
- The timer is independent of Sound, Shake, and reduced motion. Silent only suppresses the nag sound. The banner and the Android vibration still happen.

**Edge cases**
- A nag cannot overlap a roll banner. The timer is stopped during the tumble and restarts at reveal, and a roll banner lasts about 1.9 s against a 60 s countdown.
- A nag is not a user gesture. On iOS, after the phone was locked, `sound.needsUnlock()` may be true and `playShout()` may be silent or dropped (mobile AC-7). This is acceptable; the banner still shows.
- While `confirm()` (New game) is open, JS is blocked, so the interval does not run. When the dialog closes, the next tick evaluates normally, and the nag can fire at once if the countdown expired while the dialog was open. Cancel keeps the game.
- Names render via `textContent`. `nagText` does no escaping, and the banner uses `textContent`.
- `performance.now()` is monotonic, but AC-8 still guards against a backwards or `NaN` `now`.
- Shake-triggered rolls reset the timer the same way as tapped rolls, because both go through `rollWith`/`reveal`.

## Open questions
- NON-BLOCKING: Should the nag repeat while the player keeps stalling (e.g. every 30 s after 0)? Assumption: no, one nag per turn. A repeating shout would get annoying at a real table. To add repeats later, change `tickTimer`.
- NON-BLOCKING: Is 60 s the right duration, given that the app's "turn" spans the previous player's build/trade phase plus the current roll? Assumption: 60 s, as suggested. It is a single constant (`TIMER_DEFAULTS.durationMs`) that can be tuned during QA without touching tests other than AC-1/AC-2/AC-6 fixtures.
- NON-BLOCKING: Toggle icon. Assumption: ⏱️ in both states, with state conveyed by `aria-pressed` and the existing `.btn--toggle` pressed styling. The Shake toggle works the same way.
- NON-BLOCKING: AC ids collide across specs (catan-dice uses AC-1 to AC-29, and mobile-sound-haptics-shake goes up to AC-35). Assumption: as in the mobile spec, this spec's tests live in their own files under `describe("turn-timer", …)`.
- NON-BLOCKING: Fit of a third icon toggle at 360 px. Assumption: it fits, since the original mobile spec already laid out New game + 3 icon toggles before the Haptics toggle was removed. If it does not fit during AC-10 QA, shrink New game's label, not the 44 px targets.
