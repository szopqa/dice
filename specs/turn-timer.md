# Turn timer and nag

## Goal
At the table, a Catan turn can drag on while everyone waits for the current player. This feature adds an optional per-turn countdown to the game screen. It is off by default. When it is on, a small m:ss countdown runs for the player whose turn it is. It pulses during the final 10 seconds. When it reaches zero, the app shouts "TICK TOCK, <name>!" using the existing shout banner, the shout sound (unless Silent is on) and the shout haptic pattern. A third icon button (⏱️) sits next to the existing Sound 🔊 and Shake 🫨 toggles. Each press cycles the turn duration through a list of steps (default: off → 1 minute → 2 minutes → 3 minutes → off), the button shows the selected duration, and the selection is saved in localStorage. The project keeps its existing rules. All timer decisions (remaining time, warning phase, when to nag, resets, pause, next step) live in a pure module, `js/timer.js`. Time is injected as a number, so `node --test` covers the module without real clocks. There are no dependencies, no DOM tests, and the UI is English only.

## Out of scope
- A settings UI for editing the list of steps. The list is a single code constant that maintainers edit (`TIMER_STEPS`). The warning window is also a code constant (`TIMER_DEFAULTS`).
- Per-player durations, time banks, chess-clock totals, statistics on turn length, and penalties.
- Counting the build/trade phase separately from the roll. In this app a turn changes when the dice are rolled (catan-dice AC-5), so the timer covers the whole span between two rolls.
- Persisting the remaining time across reloads. Only the selected duration (or off) is saved.
- Running the countdown in the background, notifications, and wake lock.
- New sounds, audio files, or new haptic patterns. The nag reuses `playShout()` and `HAPTIC_PATTERNS.shout`.
- Changes to dice, game state, event rules, shake detection, or the deploy workflow.
- DOM/browser test automation. UI ACs are checked by hand.
- Localization. The nag text is English only.

## Acceptance criteria

### Timer logic (pure-testable, `node --test`, `js/timer.js`)
The state is an immutable plain object (see Technical notes). Every function takes the current time as `now` (ms, a monotonic number from the caller) and returns a new object. Nothing in the module reads a clock. The duration is part of the timer state and is passed in by the caller; the "defaults" below mean a 60 000 ms duration and a 10 000 ms warning window.

- AC-1 (pure-testable): Given `t = startTurn(createTimer(), 1000)` with the defaults (60 000 ms), when `remainingMs(t, 16000)` is called, then it returns `45000`. `remainingMs(t, 61000)` and `remainingMs(t, 999999)` both return `0`, so the value never goes negative. Given an idle timer (`createTimer()` or `stopTimer(t)`), `remainingMs` returns `null`.
- AC-2 (pure-testable): Given a started timer, when `timerPhase(t, now)` is called, then it returns `"running"` while remaining > 10 000 ms, `"warning"` while 0 < remaining ≤ 10 000 ms (exactly 10 000 counts as `"warning"`, 10 001 as `"running"`), and `"expired"` at remaining 0. It returns `"idle"` for an idle timer. This holds for every duration (see AC-21).
- AC-3 (pure-testable): Given a started timer, when `tickTimer(t, now)` is called repeatedly with increasing `now`, then it returns `{ state, nag }`, where `nag` is `true` on exactly one call: the first call at which remaining is 0. This holds even if a single call jumps from well before expiry to far past it. Every earlier and later call returns `nag: false`. After `startTurn` is called again, the next expiry nags once again. Ticking an idle timer always returns `nag: false` and leaves the state unchanged.
- AC-4 (pure-testable): Given a timer started at 0 and paused with `pauseTimer(t, 20000)`, when `resumeTimer(t, 500000)` is called, then `remainingMs(t, 500000)` is `40000`, so time spent paused does not count. While paused, `remainingMs` stays at `40000` for any `now`, and `tickTimer` never returns `nag: true`, even if the frozen remaining is 0. Pausing an idle or already-paused timer, and resuming a timer that is not paused, return the state unchanged.
- AC-5 (pure-testable): When `resetForTurn(t, { durationMs, rollCount }, now)` is called, then it returns a running timer with the full `durationMs` and `nagged` cleared if `durationMs > 0` (a duration is selected) and `rollCount >= 1`. Otherwise (off, i.e. `durationMs` is 0, `null` or invalid, or no rolls yet) it returns an idle timer. This is the single reset rule. `main.js` calls it after every roll reveal, turn shift, duration change, and page load (see AC-11, AC-20).
- AC-6 (pure-testable): When `formatRemaining(ms)` is called, then it returns `m:ss`, with seconds rounded up: `60000 → "1:00"`, `59001 → "1:00"`, `59000 → "0:59"`, `9500 → "0:10"`, `1 → "0:01"`, `0 → "0:00"`. A negative or non-finite input returns `"0:00"`. Durations above one minute work the same way: `180000 → "3:00"`, `120000 → "2:00"`.
- AC-7 (pure-testable): When `nagText("Anna")` is called, then it returns exactly `"TICK TOCK, Anna!"`. The name is inserted as given, with no case change.
- AC-8 (pure-testable): Given a `now` that is `NaN`, `undefined`, or lower than the timer's `startedAt` (the clock went backwards), when any timer function is called, then it does not throw. A non-finite `now` makes the time-dependent transitions (`startTurn`, `pauseTimer`, `resumeTimer`, `tickTimer`, and the start branch of `resetForTurn`) return the state unchanged (and `tickTimer` returns `nag: false`); `stopTimer` and the idle branch of `resetForTurn` do not use `now` and still return an idle timer. A backwards `now` is treated as zero elapsed time, so `remainingMs` returns the full duration.

### Duration steps (pure-testable, `node --test`)
- AC-17 (pure-testable): Given the default step list (off, 60 s, 120 s, 180 s), when the next step is requested starting from off, then it returns 60 s; from 60 s it returns 120 s; from 120 s it returns 180 s; and from 180 s it returns off. Repeated presses therefore cycle endlessly in that order.
- AC-18 (pure-testable): Given any list of steps, when the next step is requested, then the result follows that list's order and wraps from its last entry back to off. Changing the list in one place (the constant) changes the cycle, the button label (AC-19) and which saved values are valid (AC-9), with no other code change. Given a current value that is not in the list (unknown, `null`, `NaN`, negative, a legacy value), then the next step is off.

### Persistence (pure-testable, `node --test`, `js/ui/storage.js`)
- AC-9 (pure-testable): Given a stub `localStorage`, when `loadTimer()` is called, then it returns the saved duration in ms (or `0` for off). The key is still `catan-dice:timer`; `saveTimer(durationMs)` writes the selected duration in whole seconds (`"0"` for off, `"60"`, `"120"`, `"180"`). Loading rules:
  - absent, `"0"`, or an empty string → off;
  - a value that matches a step in the list (e.g. `"120"` → 120 000 ms) → that duration;
  - the legacy toggle value `"1"` (old "on") → 60 000 ms (1 minute), as long as 60 s is a step in the list (otherwise off, like any other value not in the list);
  - anything else (non-numeric, negative, fractional, a number that is not in the list, e.g. `"abc"`, `"-5"`, `"90"`, `"2"`) → off.

  A throwing `localStorage` makes `loadTimer()` return off without throwing, and makes `saveTimer` a no-op. A save followed by a load round-trips for every step in the list.

### UI (manual QA, `index.html`, `css/styles.css`, `js/main.js`)
- AC-10 (manual QA): Given the game screen at a 360×640 viewport, then a third icon button (⏱️) sits next to Sound and Shake to roll. It is a cycle button, not an on/off toggle, so it has no `aria-pressed`. It has a tap target of at least 44×44 CSS px, and it keeps the `⏱️` icon. It is off on first visit, and its selected duration survives a reload. All catan-dice AC-26 and mobile-sound-haptics-shake AC-21 layout conditions still hold (everything visible without scrolling, no horizontal scroll), and changing the duration does not shift the layout (the button width is the same for every step).
- AC-11 (manual QA): Given a duration is selected and at least one roll exists, then a countdown in `m:ss` format is shown near the "<name>'s turn" / "Next:" lines and counts down from the selected duration (`1:00`, `2:00` or `3:00`). It restarts from the selected duration when a roll is revealed (after the tumble, or immediately under reduced motion; tap or shake), and after ◀/▶. While the dice tumble, the countdown is stopped and cannot nag. Before the first roll, no countdown is shown and nothing runs. New game stops it.
- AC-12 (manual QA): Given a running countdown, when remaining reaches 10 s or less, then the countdown pulses in the accent/warning style until it is reset or expires. Given `prefers-reduced-motion: reduce`, it changes to the warning colour without any pulse animation.
- AC-13 (manual QA): Given the countdown reaches `0:00` on the game screen, then exactly once for that turn: the shout banner (the same style as `"shout"` events, not the big shake/flash) shows `TICK TOCK, <name>!` with `players[turn]`; `playShout()` plays unless Silent is on (in silent mode no sound plays and no `AudioContext` is created); and `haptics.shout()` vibrates on Android (iPhone feels nothing). The countdown then stays at `0:00` in the expired style without nagging again, until one of the AC-11 resets happens.
- AC-14 (manual QA): Given a running countdown, when the page becomes hidden (`visibilitychange` → hidden, or `pagehide`) and is shown again any time later, then the countdown resumes from the same remaining time it had when hidden. No nag fires while hidden, and none fires in a burst on return.
- AC-15 (manual QA): Given a duration is selected and a game with at least one roll, when the page reloads (including the Start game reload, which has zero rolls and so shows no countdown), then the countdown starts fresh from the saved duration (not from a default of `1:00`) and no nag fires on load.
- AC-16 (manual QA): Given the countdown is running (including in the warning or expired phase), when the button is pressed until the timer is off, then the countdown disappears at once, any pulse stops, and no nag fires later. Pressing it from a running countdown to the next step is covered by AC-20.
- AC-19 (manual QA): Given the cycle button, then the selected duration is visible on the button itself at a glance: it shows `⏱️ Off`, `⏱️ 1 min`, `⏱️ 2 min` or `⏱️ 3 min` (labels follow the step list). Its `aria-label` always names the current setting, e.g. `Turn timer: off` or `Turn timer: 2 minutes`, and it is updated on every press and on load. The first-visit state is `Off`.
- AC-20 (manual QA): Given the timer has a duration selected and at least one roll exists, when the button is pressed to a new non-off duration, then the countdown restarts at once from the new full duration (e.g. pressed from 1 min at `0:23` remaining gives `2:00`), including from the warning or expired phase (the pulse stops, and the new countdown can nag once). Given no roll exists yet, pressing only changes the saved selection and no countdown appears. Given the dice are tumbling, pressing changes the selection and the countdown starts from the new duration at reveal. Pressing from off to a duration with at least one roll starts the countdown from that duration.
- AC-21 (pure-testable): Given any selected duration (1, 2 or 3 minutes, or any step in the list), when remaining is 10 000 ms or less, then the phase is `"warning"`; above 10 000 ms it is `"running"`. The pulse in AC-12 therefore always covers the final 10 s, and never starts earlier for longer durations. If a step is 10 s or shorter, the countdown starts in the warning phase (assumed, see open questions).

## Technical notes
See `specs/turn-timer.adr.md` for the decision record and the task plan. The duration cycle (AC-5, AC-9..AC-11, AC-15..AC-21) is described below.

**Files**
- `js/timer.js` (pure, no DOM, no clock reads). Exports:
  - `TIMER_DEFAULTS = { durationMs: 60000, warnMs: 10000 }` (the default timer for `createTimer()` and the warning window used for every duration)
  - `TIMER_STEPS = [60000, 120000, 180000]` (frozen; durations in ms, each a positive whole number of seconds, in cycle order). Off is implicit: it always comes before the first entry and after the last one, and it is never listed.
  - `createTimer({ durationMs, warnMs } = TIMER_DEFAULTS)`
  - `startTurn(t, now)`, `stopTimer(t)`, `pauseTimer(t, now)`, `resumeTimer(t, now)`
  - `remainingMs(t, now)`, `timerPhase(t, now)`, `tickTimer(t, now)`
  - `resetForTurn(t, { durationMs, rollCount }, now)`: if `durationMs` is a finite number > 0 and `rollCount >= 1`, it returns a running timer whose `durationMs` is the given one (AC-5, AC-20); otherwise it returns `stopTimer(t)`. If `now` is non-finite, the start branch returns `t` unchanged, without adopting the new duration (AC-8).
  - `nextStep(currentMs, steps = TIMER_STEPS)`: `0` → `steps[0]`; `steps[i]` → `steps[i + 1]`, or `0` after the last entry; any other value (including `null`, `NaN`, negative numbers, and values not in the list) → `0` (AC-17, AC-18). An empty list always gives `0`.
  - `timerLabel(ms)`: returns `{ text, aria }` for the button. `0` or an invalid value gives `{ text: "⏱️ Off", aria: "Turn timer: off" }`. Whole minutes give `"⏱️ N min"` / `"Turn timer: N minute(s)"`, and other whole seconds give `"⏱️ N s"` / `"Turn timer: N second(s)"` (AC-19, AC-18).
  - `formatRemaining(ms)`, `nagText(name)`

  The state shape is `{ status: "idle" | "running" | "paused", durationMs, warnMs, startedAt: number | null, elapsedMs: number, nagged: boolean }`. Remaining is `durationMs − (elapsedMs + (status === "running" ? max(0, now − startedAt) : 0))`, clamped to `[0, durationMs]`. Pausing folds the running span into `elapsedMs`. `tickTimer` sets `nagged: true` when it returns `nag: true`. `warnMs` stays 10 000 for every duration (AC-21).
- `js/ui/storage.js` (modify): `KEYS.timer = "catan-dice:timer"` (unchanged). It imports `TIMER_STEPS` from `../timer.js`. `loadTimer(steps = TIMER_STEPS)` returns ms (`0` for off) and `saveTimer(durationMs)` writes whole seconds, both per AC-9. A strict digits-only parse means `"-5"`, `"1.5"`, `" 60"` and `"abc"` are off. The legacy `"1"` is read as 60 s and then validated against the list like any other value. Nothing is written on load: a legacy `"1"` is replaced by seconds on the next press.
- `js/main.js` (modify):
  - Hold `timer` state and `timerMs` (the selected duration, `0` for off, from `store.loadTimer()`), plus a `setInterval` of about 250 ms that runs only while the timer is running and has not nagged. Each tick calls `tickTimer(timer, performance.now())`, updates the countdown text and phase class, and on `nag` calls the nag path.
  - The nag path is `showBanner({ text: nagText(game.players[game.turn]) }, false)`, `sound.playShout()` (already a no-op when silent), and `haptics.shout()`. Do not use `haptics.land()`, because its iOS `switchTick` fallback is meant only for gesture rolls.
  - In `rollWith`, call `stopTimer`. In `reveal`, call `resetForTurn`. `updateGame` (◀/▶) calls `resetForTurn` with the new `game.rolls.length`. `newGame` calls `stopTimer`. On load, call `resetForTurn` with the loaded duration. Every `resetForTurn` call passes `{ durationMs: timerMs, rollCount: game.rolls.length }`. While the dice tumble, the reset keeps the timer stopped, so `reveal` starts it with whatever `timerMs` is selected at that moment (AC-20).
  - Extend the existing `visibilitychange`/`pagehide` handlers with `pauseTimer`/`resumeTimer`.
  - The button handler `cycleTimer` does `timerMs = nextStep(timerMs)`, `saveTimer(timerMs)`, renders the label and `aria-label` from `timerLabel(timerMs)`, then calls `resetForTurn`. The same label render runs on load (from `renderToggles`). The button has no `aria-pressed`.
- `index.html` (modify): the `#timer-toggle` button after `#shake`, with class `btn--cycle` instead of `btn--toggle`, no `aria-pressed`, initial text `⏱️ Off` and `aria-label="Turn timer: off"`. A countdown element (`<p id="timer" class="timer">`) sits in the turn area. The countdown is not `aria-live`, because per-second announcements would spam screen readers; the nag is announced through the existing `aria-live` banner.
- `css/styles.css` (modify): the second controls row holds New game, two `var(--tap)` (48 px) icon toggles, and the cycle button. `.btn--cycle` has a fixed flex basis, wide enough for the longest default label (`⏱️ 3 min`), a `min-height` of `var(--tap)`, and `white-space: nowrap`, so the width is the same for every step (AC-10). Give `.timer` a reserved `min-height` and use `visibility: hidden` when idle, so the layout does not jump. Add `.timer--warning` (with a pulse keyframe, disabled under `prefers-reduced-motion`) and `.timer--expired`.
- Tests: `test/timer.test.js` (AC-1 to AC-8, AC-17, AC-18, AC-21, plus the pure parts of AC-19 via `timerLabel` and AC-20 via `resetForTurn`) and `test/turn-timer-storage.test.js` (AC-9, plus AC-18 for a custom list passed to `loadTimer`). Cases are wrapped in `describe("turn-timer", …)`, with titles starting with the AC id, for example `it("AC-3: nags exactly once per expiry")`. Existing tests stay unchanged except where the ACs above changed (the `enabled` → `durationMs` change in AC-5/AC-8, and the boolean → seconds change in AC-9).
- `README.md`: mention the third button, its cycle, and the `catan-dice:timer` key (seconds) in Usage.

**Decisions**
- Default step list is off, 60 s, 120 s, 180 s. The warning/pulse window is the final 10 s for every duration. There is one nag per turn, at 0.
- The timer only runs once at least one roll exists. Before the first roll the table is still getting ready, and catan-dice AC-27/mobile AC-30 already reload into a zero-roll game.
- Shifting the turn with ◀/▶ resets the timer for the newly shown player. A roll made after shifting back is a normal roll and resets it like any other (catan-dice Amendment 1 removed Undo and Re-roll).
- The timer pauses while the page is hidden and resumes with the remaining time it had. It neither catches up nor nags in the background. Browsers throttle timers in hidden tabs anyway.
- After a reload the countdown starts fresh from the full selected duration, because the remaining time is not persisted.
- The timer is independent of Sound, Shake, and reduced motion. Silent only suppresses the nag sound. The banner and the Android vibration still happen.

**Edge cases**
- A nag cannot overlap a roll banner. The timer is stopped during the tumble and restarts at reveal, and a roll banner lasts about 1.9 s against a countdown of a minute or more.
- A nag is not a user gesture. On iOS, after the phone was locked, `sound.needsUnlock()` may be true and `playShout()` may be silent or dropped (mobile AC-7). This is acceptable; the banner still shows.
- While `confirm()` (New game) is open, JS is blocked, so the interval does not run. When the dialog closes, the next tick evaluates normally, and the nag can fire at once if the countdown expired while the dialog was open. Cancel keeps the game.
- Names render via `textContent`. `nagText` does no escaping, and the banner uses `textContent`.
- `performance.now()` is monotonic, but AC-8 still guards against a backwards or `NaN` `now`.
- Shake-triggered rolls reset the timer the same way as tapped rolls, because both go through `rollWith`/`reveal`.

## Open questions
- NON-BLOCKING: Storage format of the selected duration. Assumed: the same key `catan-dice:timer` now holds whole seconds (`"0"`, `"60"`, `"120"`, `"180"`). The legacy `"1"` can never be a real step (1 s), so it unambiguously means old "on" and maps to 1 minute (as long as 60 s is in the list). A saved value that is not in the current step list loads as off, so maintainers removing a step safely turns off users who had it.
- NON-BLOCKING: Should the nag repeat while the player keeps stalling (e.g. every 30 s after 0)? Assumed: no, one nag per turn. A repeating shout would get annoying at a real table.
- NON-BLOCKING: Is the 1/2/3 minute range right, given that the app's "turn" spans the previous player's build/trade phase plus the current roll? Assumed: yes, as requested; the list is a single constant.
- NON-BLOCKING: Button label wording. Assumed: `⏱️ Off`, `⏱️ 1 min`, `⏱️ 2 min`, `⏱️ 3 min` visible, and `Turn timer: <setting>` as the accessible label. If it does not fit at 360 px, shorten the visible text (e.g. `1m`), not the 44 px target.
- NON-BLOCKING: A configured step of 10 s or less. Assumed: allowed; the countdown starts in the warning phase. No validation beyond AC-18's "invalid values are off".
- NON-BLOCKING: AC ids collide across specs (catan-dice uses AC-1 to AC-29, and mobile-sound-haptics-shake goes up to AC-35). Assumed: this spec's tests live in their own files under `describe("turn-timer", …)`.
- NON-BLOCKING: Fit of a third icon button at 360 px. Assumed: it fits, as in the original mobile spec layout. If it does not, shrink New game's label, not the 44 px targets.
