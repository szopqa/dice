# Mobile sound fix, haptics and shake to roll

## Goal
On phones, the Catan Dice site plays no sound, whether Silent is on or off. The main cause is iOS: Web Audio is routed through the ringer channel, so the hardware mute switch silences it, and a context that is not created and resumed inside a user gesture stays suspended. Sounds that are scheduled later (the shout/big sound after the ~1 s tumble), or after the app comes back from the background, are lost too. This feature fixes audio on iPhone and Android with three changes: it unlocks the context on the first gesture, it moves the page to the media/playback channel, and it schedules sounds only after `resume()` resolves. It also adds two optional features. **Haptics** uses the Vibration API: a tick on roll and stronger patterns for shout/big events, with an iOS 18+ best-effort tick on the roll tap only. **Shake to roll** uses DeviceMotion: shaking the phone triggers the same roll as the Roll button. Each feature has its own persisted toggle in the existing controls area. The project keeps its existing rules: zero dependencies, no build step, and all decision logic in pure modules tested with `node --test`.

## Out of scope
- Audio files of any kind. The silent unlock clip is generated in JS as a `data:` URI.
- Vibration patterns for the 7 and shout events on iPhone. iOS Safari has no Vibration API, so **on iPhone the only possible haptic is the tick on the Roll/Re-roll tap**. No haptic plays on iPhone for 7, shout, or shake-triggered rolls.
- Shake to roll in browsers without DeviceMotion, on non-HTTPS origins, or on desktop.
- Per-event haptic or sound customization, volume control, and custom shake sensitivity in the UI. The detector's parameters are code constants.
- Changes to dice, game, event rules, or the deploy workflow.
- DOM/browser test automation. UI and device behaviour is checked by hand.
- PWA/home-screen install, wake lock, and keeping audio alive in the background.

## Acceptance criteria

### Sound unlock and scheduling (pure-testable, `js/sound.js`)
`createSound` gains optional injectable dependencies (`AudioContext` constructor, `Audio` constructor, `navigator`, `now()`), which default to the globals. This lets node tests stub them. The existing `catan-dice` AC-29 tests must keep passing unchanged.

- AC-1: Given sound is not silent and a stub `AudioContext`, when `unlock()` is called, then exactly one context is created, `resume()` is called on it, and a buffer source with a 1-sample buffer is connected to `destination` and started. Calling `unlock()` again does not create a second context.
- AC-2: Given sound is silent, when `unlock()` is called, then no `AudioContext` is constructed, no `Audio` element is created, and `navigator.audioSession` is not touched.
- AC-3: Given a non-silent sound and a stub `navigator.audioSession` object, when `unlock()` is called, then `navigator.audioSession.type === "playback"`. Given a navigator without `audioSession`, `unlock()` does not throw.
- AC-4: Given a non-silent sound and a stub `Audio` constructor, when `unlock()` is called for the first time, then one element is created with `src === silentWavDataUri()` and `play()` is called on it. A rejected `play()` promise is swallowed (no unhandled rejection). Later `unlock()` calls do not create another element.
- AC-5: When `silentWavDataUri()` is called, then it returns a string starting with `data:audio/wav;base64,`. Its decoded bytes form a valid PCM WAV (`RIFF`…`WAVE`, a `fmt ` chunk with format 1 and 1 channel, then a `data` chunk) in which every sample is silence, and the total decoded size is under 1 KB.
- AC-6: Given a context whose `state` is `"suspended"`, when `playRattle()` (or `playShout`/`playBig`) is called, then no node is started before the `resume()` promise resolves. After it resolves, nodes start at times ≥ the context's `currentTime` at resolution. Given a context whose `state` is `"running"`, the same call starts nodes synchronously, with no gesture required. This is the path the delayed shout/big sound takes after the tumble.
- AC-7: Given a suspended context, when `resume()` resolves more than 250 ms after the play call (measured with the injected `now()`), then that sound is dropped and not played late.
- AC-8: Given a non-silent sound with an existing context in state `"suspended"` or `"interrupted"`, when `resumeIfNeeded()` is called (the `visibilitychange`-to-visible handler), then `resume()` is called. Given silent mode or no context yet, no context is created. Given a context in state `"closed"`, it is discarded, and the next `unlock()` creates a new one.
- AC-9: Given no `AudioContext`, no `Audio`, and no `navigator` (all undefined), or given stubs whose methods throw, when `unlock()`, `resumeIfNeeded()` and every `play*()` method are called, then none of them throws.

### Haptics (pure, `js/haptics.js`)
`createHaptics({ enabled = true, navigator = globalThis.navigator, switchTick = null })` returns `{ tick(), shout(), big(), setEnabled(v), isEnabled() }`. It also exports `HAPTIC_PATTERNS = { tick: 15, shout: [40, 60, 40], big: [120, 60, 120, 60, 250] }`.

- AC-10: Given haptics enabled and a stub `navigator.vibrate`, when `tick()`, `shout()` and `big()` are called, then `vibrate` receives `HAPTIC_PATTERNS.tick`, `.shout` and `.big` respectively. Given haptics disabled (initially or via `setEnabled(false)`), none of the calls invokes `vibrate` or `switchTick`.
- AC-11: Given haptics enabled, no `navigator.vibrate`, and an injected `switchTick` function (the iOS fallback), when `tick()` is called, then `switchTick` is called once. `shout()` and `big()` call nothing. Given `navigator.vibrate` exists, `switchTick` is never called.
- AC-12: Given `navigator` is undefined, or `vibrate` throws or returns `false`, when any haptics method is called, then it does not throw.

### Shake detection and gating (pure, `js/shake.js`)
`createShakeDetector({ threshold = 15, peaks = 3, windowMs = 800, cooldownMs = 1500 } = {})` returns `{ push(sample) => boolean, reset() }`. `sample = { x, y, z, t }` holds `accelerationIncludingGravity` in m/s², with `t` in ms. A sample's *delta* is `|sqrt(x²+y²+z²) − 9.81|`. A *peak* is a sample whose delta is ≥ `threshold` while the previous accepted sample's delta was < `threshold` (rising edge).

- AC-13: Given a fresh detector, when samples are pushed that contain 3 peaks within 800 ms, then `push` returns `true` on the sample that produces the 3rd peak, and `false` for every sample before it.
- AC-14: Given a fresh detector, when the pushed samples contain only 2 peaks, or 3 peaks spread over more than 800 ms, or one sustained over-threshold stretch of many samples (which counts as one peak), or only motion with delta < 15, then `push` never returns `true`.
- AC-15: Given a detector that just returned `true` at time T, when samples with any number of peaks are pushed with `t < T + 1500`, then `push` returns `false`, and those peaks do not count toward the next detection. A fresh 3-peak shake that starts after `T + 1500` returns `true` again.
- AC-16: Given samples with `null`/`NaN` axes, a missing `t`, or `t` lower than the previous accepted sample, when they are pushed, then they are ignored (return `false`, do not change state) and nothing throws.
- AC-17: When `shouldRollOnShake({ enabled, screen, animating })` is called, then it returns `true` only for `enabled === true && screen === "game" && animating === false`.
- AC-18: When `motionSupport({ DeviceMotionEvent, isSecureContext })` is called, then it returns `"unsupported"` if `DeviceMotionEvent` is undefined, `"insecure"` if `isSecureContext` is false, and `"ok"` otherwise.
- AC-19: When `requestMotionPermission({ DeviceMotionEvent, isSecureContext })` is called, then it resolves `"unsupported"` / `"insecure"` as in AC-18. It resolves `"granted"` when `DeviceMotionEvent.requestPermission` is absent (Android) or resolves `"granted"`. It resolves `"denied"` when `requestPermission` resolves anything else (an explicit user deny), and `"error"` when it rejects or throws synchronously (e.g. NotAllowedError because no user gesture was active) — callers treat `"error"` as "try again on the next gesture", not as a saved deny. When `requestPermission` exists, it is invoked synchronously, before `requestMotionPermission` returns, so that iOS still sees the user gesture.

### Persistence (pure-testable, `js/ui/storage.js`)
- AC-20: Given a stub `localStorage`, `loadHaptics()` returns `true` when `catan-dice:haptics` is absent and `false` when it is `"0"`. `loadShake()` returns `false` when `catan-dice:shake` is absent and `true` when it is `"1"`. `saveHaptics(v)` / `saveShake(v)` write `"1"`/`"0"`. A throwing `localStorage` makes the loaders return their defaults without throwing.

### UI and devices (manual QA)
- AC-21: Given the game screen at a 360×640 viewport, then the controls area shows three compact icon toggles: Sound, Haptics and Shake to roll. Each has a fixed `aria-label` (`"Sound"`, `"Haptics"`, `"Shake to roll"`), `aria-pressed="true"` when that feature is on, and a tap target ≥ 44×44 CSS px. All `catan-dice` AC-26 conditions still hold (everything visible without scrolling, no horizontal scroll), including the settings hint line.
- AC-22 (manual, main.js wiring): Given any page state, when the first `pointerup`/`touchend`/`click`/`keydown` happens (not `pointerdown`, which is not a user activation for touch in Safari) anywhere (listened on `document`, capture phase), then `sound.unlock()` runs synchronously in that handler, before the Roll handler, if sound is on. The listeners stay attached for the whole session; each gesture calls `unlock()` only while `sound.needsUnlock()` is true — sound on and either the context is not running or the silent clip has not yet played (so it is a no-op once fully unlocked, and a later tap can re-unlock after iOS suspends the context in the background). Turning Sound on via its toggle calls `unlock()` in that tap. When the document becomes visible again, `resumeIfNeeded()` runs.
- AC-23 (manual, iPhone Safari, iOS 16.4+, ring/silent switch set to silent): Given Sound on, when Roll is tapped first after load, then the rattle is audible. The shout/big sound after the tumble is audible. After backgrounding the tab and returning, the next roll is audible. Given Sound off, nothing plays.
- AC-24 (manual, Android Chrome): Given Sound on, when Roll is tapped first after load, then the rattle is audible, the shout/big sound after the tumble is audible, and sound still works after switching apps and returning.
- AC-25 (manual, Android Chrome): Given Haptics on, when Roll or Re-roll is tapped, then a short tick is felt at roll start. A shout-level result adds the shout pattern at reveal, and a big-level result (7 / serial robber) adds the stronger big pattern at reveal. Given Haptics off, nothing is felt. The setting survives a reload. Haptics is independent of Sound.
- AC-26 (manual, iPhone Safari iOS 18+): Given Haptics on, when Roll or Re-roll is tapped (or Space/Enter is pressed), then a system haptic tick is felt. This comes from programmatically clicking the `<label>` of a visually hidden `<input type="checkbox" switch>` inside the gesture. No haptic is felt for 7/shout or for shake-triggered rolls. Given Haptics off, nothing is felt. The hidden switch is never visible, is not reachable with Tab, is hidden from assistive tech, and keyboard focus stays on the control that was activated.
- AC-27 (manual, iPhone + Android): Given Shake to roll is off and the device supports motion on HTTPS, when its toggle is tapped, then on iOS 13+ the system motion-permission prompt appears from that tap. If granted (or no prompt is needed), the toggle turns on and is persisted, and the same tap unlocks audio if sound is on. If denied, the toggle stays off, and the hint line shows a short message saying motion access was denied and can be re-enabled in Safari settings. Given `motionSupport` is not `"ok"`, the toggle has `aria-disabled="true"`, and tapping it shows a hint (needs a motion sensor / HTTPS) without changing state.
- AC-28 (manual, iPhone + Android): Given Shake to roll is on and the game screen is idle, when the phone is shaken firmly, then exactly one roll happens. It is identical to tapping Roll: tumble, rattle, events, sound, Android haptics, and save. Shakes are ignored while the dice animate, on the setup screen, while the toggle is off, and within the detector cooldown. Gentle handling (picking the phone up, walking) does not roll.
- AC-29 (manual): Given Shake to roll was saved on, when the page reloads, then on Android motion listening resumes immediately. On iOS (where permission must be requested in a gesture), `requestMotionPermission` is called on the first user gesture. If that resolves `"denied"`, the toggle switches off, is persisted off, and shows the denial hint.

## Technical notes

**Files**
- `js/sound.js` (modify): add the dependency injection described above, plus `unlock()`, `resumeIfNeeded()`, and exported `silentWavDataUri()` (for example 8 kHz, mono, 8-bit or 16-bit, ~100 samples, base64 via `btoa`, which exists in Node 16+ and browsers). Rework `run()` so that if `ctx.state !== "running"`, it calls `resume()` and schedules `fn(c, c.currentTime)` in `.then`, subject to the 250 ms staleness rule (AC-7). Otherwise it schedules synchronously. `getCtx()` must still return `null` when silent (keeps `catan-dice` AC-29). Keep the existing `{ isSilent }` option and `setSilent`/`isSilent`.
- `js/haptics.js` (new, pure, no DOM): as specified. All calls are wrapped in try/catch.
- `js/shake.js` (new, pure, no DOM): `createShakeDetector`, `shouldRollOnShake`, `motionSupport`, `requestMotionPermission`, plus exported default constants. Peaks are kept as a list of timestamps and pruned to `windowMs`. On detection, the peak list is cleared and `cooldownUntil = t + cooldownMs` is set. Samples during cooldown update only the "previous delta" (so a spike continuing past cooldown is not a new rising edge) and are not counted.
- `js/ui/storage.js` (modify): add `KEYS.haptics = "catan-dice:haptics"` and `KEYS.shake = "catan-dice:shake"`, plus `loadHaptics`/`saveHaptics`/`loadShake`/`saveShake`. Values are `"1"`/`"0"`, with defaults haptics ON and shake OFF.
- `js/main.js` (modify):
  - Wire the first-gesture unlock (AC-22) and `visibilitychange`.
  - Add the three toggles, plus a `#settings-hint` line (`aria-live="polite"`, cleared after ~4 s or on the next toggle).
  - Haptics calls: `tick()` at the start of `rollWith`, `shout()`/`big()` next to `playOutcome`.
  - iOS switch fallback: `switchTick = () => { label.click(); restore focus }`, passed only when `navigator.vibrate` is missing.
  - Register a `devicemotion` listener while shake is on. It feeds `event.accelerationIncludingGravity` with `event.timeStamp` (or `performance.now()`) into the detector. On `true` plus `shouldRollOnShake(...)`, it calls `roll()`.
  - Remove the listener when the toggle is turned off.
- `index.html` (modify): replace the wide `🔊 Sound` button in the second controls row with three icon toggles next to New game (suggested icons: 🔊/🔇, 📳, 🫨/📱 — implementer's choice; text is in `aria-label`). Add the `#settings-hint` paragraph and the hidden `<label><input type="checkbox" switch tabindex="-1"></label>` with `aria-hidden="true"`. Hide it by off-screen clipping, not `display:none`, because a display-none control may not produce the haptic.
- `css/styles.css` (modify): `.btn--icon` toggles at 44×44 minimum. The second row becomes `New game` (flex: 1) + 3 fixed-width icon buttons. The hint uses small text with reserved `min-height` so the layout does not jump. Use a visually-hidden utility for the switch.
- Tests: new files `test/haptics.test.js` and `test/shake.test.js`, plus new cases for sound/storage (see the open question on AC-id collisions). Titles start with the AC id from this spec.

**Data shapes**
- Motion sample: `{ x: number|null, y: number|null, z: number|null, t: number }`.
- `motionSupport` / `requestMotionPermission` results: `"ok" | "unsupported" | "insecure"` and `"granted" | "denied" | "unsupported" | "insecure"`.

**Edge cases**
- A shake-triggered roll is not a user gesture. Audio only plays if it was already unlocked (by an earlier tap, or by the shake toggle tap). The iOS switch tick never fires on a shake roll. Android `navigator.vibrate` needs sticky user activation, which any earlier tap provides. After a reload with shake already on, an Android user who shakes before touching the screen gets a silent roll with no vibration. This is acceptable.
- Silent mode never constructs an `AudioContext` and never plays the silent HTML clip, including on the first gesture.
- When Sound is turned off while a resumed-later sound is pending, the pending sound is still dropped if it is stale (AC-7). It must also not play if `silent` is true at resolution time (check `silent` inside the `.then`).
- The Roll click's gesture handler runs after the document capture-phase unlock. The context may still be `"suspended"` at that moment, and AC-6 covers this.
- iOS Safari can report the non-standard state `"interrupted"` (for example during a phone call). Treat any state other than `"running"`/`"closed"` as resumable.
- A shake while `confirm()` (New game) is open: JS is blocked, so no roll happens. After the dialog closes, normal gating applies.
- Reduced motion does not disable haptics or shake. Those are separate user choices.
- `devicemotion` can fire at 60–100 Hz. The handler must do no allocation-heavy work and no DOM work unless a shake is detected.

## Open questions
- NON-BLOCKING: AC ids collide with `specs/catan-dice.md` (both have AC-1…AC-29), so a test titled `"AC-5: …"` is ambiguous across specs. Assumption: tests for this spec live in their own files (`test/haptics.test.js`, `test/shake.test.js`, `test/mobile-sound.test.js`, `test/mobile-storage.test.js`) and wrap their cases in `describe("mobile-sound-haptics-shake", …)`. Titles still start with the AC id. Existing `catan-dice` tests stay unchanged.
- NON-BLOCKING: Sound toggle semantics change. Today the button means "Silent" (`aria-pressed="true"` = muted). Assumption: all three icon toggles use pressed = feature on. The Sound button's `aria-pressed` is therefore `!silent`, and the `catan-dice:silent` storage key and its values are unchanged, so no migration is needed. `catan-dice` AC-26's "Silent toggle" is satisfied by the Sound toggle.
- NON-BLOCKING: Silent HTML `<audio>` clip: one-shot or looped. Assumption: one-shot (`loop = false`), played once on the first unlock and always alongside `audioSession.type = "playback"` when available. A looping element can surface Now Playing / lock-screen media controls and costs battery. If AC-23 fails on a real iPhone with only a one-shot clip, switch to a looped clip that is paused on `visibilitychange` to hidden.
- NON-BLOCKING: Shake thresholds (15 m/s² delta, 3 peaks in 800 ms, 1.5 s cooldown) are starting values. Assumption: tune by hand during AC-28 QA, changing only the default constants. The tests for AC-13–AC-15 use the defaults, so update them if the defaults change.
- NON-BLOCKING: Whether iOS remembers the motion permission across page loads varies by iOS version. Assumption: AC-29's request on the first gesture handles both cases. If permission is already granted, `requestPermission` resolves `"granted"` without a prompt.
- NON-BLOCKING: Whether the Haptics toggle shows on devices with neither `navigator.vibrate` nor `<input switch>` support (for example iOS < 17.4 or Firefox desktop). Assumption: it stays visible and works as a no-op, which keeps the layout identical everywhere. Haptics is best-effort and has no failure hint.
- NON-BLOCKING: Haptic pattern values (`15`, `[40,60,40]`, `[120,60,120,60,250]`). Assumption: as listed. Tune during AC-25 QA by changing only `HAPTIC_PATTERNS`.

## Amendment 1 (2026-11-14, device feedback)
Feedback from testing on a real iPhone. Where this section conflicts with anything above, this section wins.

- **Haptics are always on.** Remove the Haptics toggle from the UI and the `catan-dice:haptics` storage key (`loadHaptics`/`saveHaptics` removed). AC-21 now means **two** icon toggles: Sound and Shake to roll. AC-20 now covers only `loadShake`/`saveShake`. `createHaptics` keeps its `enabled`/`setEnabled` API (AC-10 unchanged), but the app always creates it enabled. AC-25/AC-26 no longer say "Given Haptics on".
- AC-30: **iOS Shake to Undo.** On iOS, typing player names on the setup screen leaves an "Undo Typing" entry in Safari's undo history, so shaking the phone opens the system "Undo Typing" dialog instead of rolling. Web pages can't turn Shake to Undo off, so the app must leave no undo history behind. Given setup is valid, when "Start game" is tapped, the game is saved (as today), focus is blurred, and the page reloads (`location.reload()`). The game screen comes back through the existing restore path (catan-dice AC-27): no animation, no shout. The setup screen is the only place with text inputs, so the game screen never has typing history. The name pre-fill still works (`catan-dice:names`). Shake permission and audio unlock after the reload follow the existing first-gesture paths (AC-22, AC-29).
- AC-31: **Sound after lock/unlock.** iOS can leave the AudioContext "running" but silent after the phone is locked and unlocked or the app is backgrounded. The media-channel `<audio>` session can also be lost, which brings the mute switch back. Given the document becomes hidden (`visibilitychange` → hidden, or `pagehide`), the sound module is marked stale: `markStale()` makes `needsUnlock()` true and clears the silent clip's played flag. On the next `unlock()` while stale, the module closes the old context (`close()`, errors swallowed), creates a new AudioContext, plays the 1-sample buffer, sets `audioSession.type = "playback"` again, and replays the silent clip. `resumeIfNeeded()` on becoming visible stays as it is. Node-testable: after `markStale()`, `unlock()` creates a second context, calls `close()` on the first, and plays the clip again. When silent, `markStale()` + `unlock()` creates nothing.
- AC-32 (manual, iPhone): Given Sound on and a game in progress, when the phone is locked, unlocked, and the next roll is tapped, then the rattle and the result sounds play, including with the mute switch on.

## Amendment 2 (2026-11-14, haptics timing)
Where this section conflicts with anything above, it wins.

- AC-33: **Haptics fire when the dice land, not on press.** Remove the roll-start tick. `js/haptics.js` gains `land(effect)`, where `effect` is one of `"none" | "comment" | "shout" | "big"`.
  - When `navigator.vibrate` exists, it vibrates once with `HAPTIC_PATTERNS.big` for `"big"`, `.shout` for `"shout"`, and `.tick` otherwise.
  - When `vibrate` is missing, it calls `switchTick()` once (whatever the effect).
  - When disabled, it does nothing, and it never throws.
  - `tick()`/`shout()`/`big()` stay as they are.
  - Node-testable.
- AC-34 (wiring): at reveal (end of tumble, or immediately under reduced motion), `main.js` calls `haptics.land(events.effect)` exactly once per roll, re-roll and shake roll. Nothing vibrates at roll start.
  - The iOS `switchTick` passed to `createHaptics` no longer requires being inside the gesture handler. It fires when the current roll was started by a tap or key (a `rollFromGesture` flag set in the gesture path), and is skipped for shake-triggered rolls.
  - This is an experiment: WebKit may not honour a programmatic switch toggle ~1 s after the tap.
  - Focus restore/blur as in AC-26 still applies.
- AC-35 (manual): on Android, a landing vibration is felt on tap and shake rolls, with stronger patterns on shout/big. On iPhone iOS 18+, check whether a tick is felt when tapped dice land. If not, the fallback (decided with the user) is to restore the tick on tap for iPhone only.
