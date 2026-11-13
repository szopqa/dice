# Catan Dice

## Goal
Replace the generic dice roller with a single-purpose site for playing Catan at the table. Players type in their names and set the turn order, then roll two dice. The site shows the sum in large type and says whose turn is next. The point is to be more fun than existing dice sites: a retro tumble animation, arcade-style shouts ("DOUBLE COMBO!", "COMBO BREAKER!!"), a big robber effect on every 7, and comments when unusual things happen. Event rules live in one declarative list, so adding a new event means adding one entry. Day to day the site stays very simple: plain HTML/CSS/native ES modules, no dependencies, no build step, sounds synthesized with the Web Audio API, a silent-mode switch, and state saved in localStorage. It deploys to GitHub Pages through a GitHub Actions workflow.

## Out of scope
- Games other than Catan, dice other than 2d6, and the Cities & Knights event die.
- Accounts, multiplayer sync and networking. One device sits on the table.
- Roll statistics, histograms and charts.
- Audio files, external fonts, CDNs and any npm dependency, including devDependencies.
- DOM/browser test automation. UI ACs are checked by hand (QA). Only pure modules are covered by `node --test`.
- Adding or removing players in the middle of a game. To do that, start a new game.
- Shuffling or randomizing the player order automatically.
- Localization. The UI is English only.

## Acceptance criteria

### Dice (pure, `js/dice.js`)
- AC-1: Given an injected `randomUint32` source, when `rollPair(randomUint32)` is called, then it returns `[a, b]`, where each value is the deterministic result of the existing rejection-sampling mapping onto 1–6. Given no source, when it is called 10,000 times, then every value is an integer from 1 to 6 and all six faces appear (the default source is `crypto.getRandomValues`).

### Game state (pure, `js/game.js`)
- AC-2: Given 2–6 names, when `createGame(names)` is called, then it returns `{ version: 1, players, turn: 0, rolls: [] }`, with each name trimmed and the order preserved.
- AC-3: Given fewer than 2 or more than 6 names, any name that is empty after trimming, any name longer than 20 characters, or duplicate names (case-insensitive, after trimming), when `validateNames(names)` is called, then it returns `{ ok: false, error: <human-readable string> }`, and `createGame` throws with the same message.
- AC-4: Given a list and an index, when `moveItem(list, index, -1 | +1)` is called, then it returns a new array with that item swapped with its neighbour. Moving the first item up or the last item down returns an unchanged copy. The input array is never mutated.
- AC-5: Given a game whose `turn` is `t`, when `applyRoll(game, [a, b])` is called, then the returned game has a new last roll `{ dice: [a, b], sum: a + b, player: t }` and `turn === (t + 1) % players.length`. The input game is not mutated.
- AC-6: Given a game with at least one roll, when `rerollLast(game, [a, b])` is called, then the last roll is replaced by `{ dice: [a, b], sum: a + b, player: <same player as the replaced roll> }`. The number of rolls and `turn` stay the same. Given no rolls, it returns the game unchanged.
- AC-7: Given a game with at least one roll, when `undoLast(game)` is called, then the last roll is removed and `turn` becomes that roll's `player`. Given no rolls, it returns the game unchanged.
- AC-8: Given any game, when `shiftTurn(game, +1 | -1)` is called, then `turn` moves forward or back by one and wraps at both ends (0 ↔ n-1). `rolls` stays the same.
- AC-9: Given a game, when `deserialize(serialize(game))` is called, then the result deep-equals the game. Given malformed JSON, a wrong `version`, a player count outside 2–6, a `turn` out of range, or a roll with invalid dice or player index, `deserialize` returns `null` and does not throw.

### Events (pure, `js/events.js`)
`evaluateEvents(game, rules = RULES)` treats `game.rolls.at(-1)` as the roll that just happened. It returns `{ main, secondary, effect }`, where `main` and `secondary` are each `{ id, level, text }` or `null`, and `effect` is one of `"big" | "shout" | "comment" | "none"`.

- AC-10: Given a last roll with sum 7, when events are evaluated, then an event with `id: "seven"` and `level: "big"` fires. It fires on every 7, regardless of history.
- AC-11: Given that the last `k ≥ 2` rolls all have the same sum (and the roll before them, if there is one, has a different sum), when events are evaluated, then `id: "combo"` fires with `level: "shout"`. Its text is exactly `DOUBLE COMBO!` (k=2), `TRIPLE COMBO!` (3), `SUPER COMBO!` (4), `HYPER COMBO!` (5), `BRUTAL COMBO!` (6), `MASTER COMBO!` (7), or `ULTRA COMBO x<k>!` (k ≥ 8, e.g. `ULTRA COMBO x8!`).
- AC-12: Given that the previous roll ended a run of ≥2 equal sums and the last roll's sum is different, when events are evaluated, then `id: "combo-breaker"` fires with `level: "shout"` and text `COMBO BREAKER!!`. Given that the previous run had length 1, it does not fire.
- AC-13: Given a last roll of `[1,1]`, `id: "snake-eyes"` fires. Given `[6,6]`, `id: "boxcars"` fires. Both have `level: "shout"`.
- AC-14: Given a last roll with equal dice other than `[1,1]` or `[6,6]`, `id: "doubles"` fires with `level: "comment"`. It does not fire for `[1,1]` or `[6,6]`.
- AC-15: Given that the last N rolls (counted back to the most recent 7, or to the start of the game) contain no 7, `id: "drought"` fires with `level: "comment"` and text containing N, when N is a positive multiple of 10 (10, 20, …). It does not fire at N = 9 or 11.
- AC-16: Given a last roll of 7 by player P, and P's previous roll in history (their most recent earlier roll, whatever other players rolled in between) was also 7, `id: "serial-robber"` fires with `level: "big"` and text containing P's name. It does not fire if P's previous roll was not 7, or if P has no previous roll.
- AC-17: Given that several rules fire, then `main` is the event with the highest `priority`, `secondary` is the next highest (or `null`), ties go to the rule listed earlier in the rules array, and `effect` is the highest `level` among all fired events (big > shout > comment). Given that no rules fire, `main` and `secondary` are `null` and `effect` is `"none"`. Example: sums `[7, 7]` from two different players → main `combo` "DOUBLE COMBO!", secondary `seven`, effect `"big"`.
- AC-18: Given a custom rules array passed as the second argument containing `{ id: "x", priority: 1, level: "comment", test: () => true, message: () => "hi" }`, when events are evaluated, then `main` is `{ id: "x", level: "comment", text: "hi" }`. This shows that a rule is a single entry and that the evaluator has no hard-coded rule logic.
- AC-19: Given rolls with sums `[8, 8]` (a DOUBLE COMBO), when `rerollLast` replaces the last roll with a sum of 5 and events are evaluated, then neither `combo` nor `combo-breaker` fires. The replaced roll does not count toward streaks.

### Tooling and deploy
- AC-20: Given a fresh clone with no `node_modules`, when `npm test` runs, then it runs `node --test` and every test passes. `package.json` has no `dependencies` or `devDependencies` key, or has both empty.
- AC-21: Given a syntax error in any `.js` file under `js/`, `test/` or `scripts/`, when `npm run lint` runs, then it exits non-zero and names the file. Given valid files, it exits 0.
- AC-22: Given `.github/workflows/pages.yml`, then it triggers on push to `main` (plus `workflow_dispatch`), sets `permissions: pages: write, id-token: write, contents: read`, runs `npm test`, uploads the repo root with `actions/upload-pages-artifact` (`path: .`), and deploys with `actions/deploy-pages` to the `github-pages` environment.

### UI (manual QA, `index.html`, `css/styles.css`, `js/main.js`, `js/sound.js`)
- AC-23: Given no saved game, when the page loads, then the setup screen shows 4 name fields (pre-filled with the last game's names if any are saved), "Add player" (disabled at 6), a remove button per row (disabled at 2), and ▲/▼ buttons per row that reorder the list. After a move, keyboard focus stays on the moved row's button. "Start game" shows the `validateNames` error inline and does not start while the input is invalid.
- AC-24: Given the game screen, when "Roll" is tapped, then both dice tumble for about 0.8–1.2 s and then show their faces. The sum appears in the largest text on the screen. A line reads "<roller> rolled <sum>". The turn indicator shows the next player ("Next: <name>"). Roll, Re-roll and Undo are disabled while the animation plays.
- AC-25: Given a roll whose `effect` is `"big"`, when the dice are revealed, then the screen shakes, flashes, and shows the `main` text as a large animated banner. Given `"shout"`, the banner shows with no shake or flash. Given `"comment"`, only a small comment line shows. A non-null `secondary` always shows as the small comment line. Given `prefers-reduced-motion: reduce`, there is no shake, flash or tumble (the dice update with a short fade of 200 ms or less), but the banner text still shows.
- AC-26: Given the game screen, then Re-roll (disabled when there are no rolls), ◀ / ▶ (change whose turn it is), Undo last roll (disabled when there are no rolls), New game, and the Silent toggle are all visible without scrolling at a 360×640 viewport. Every interactive control has a tap target of at least 44×44 CSS px, and there is no horizontal scroll.
- AC-27: Given a game in progress, when the page reloads, then the game screen comes back with the same players, order, current turn, roll history, and the last roll's dice and sum displayed (no animation, no shout). Given corrupt saved data, the setup screen shows and nothing throws.
- AC-28: Given the game screen, when "New game" is tapped, then a confirm dialog appears. Cancel keeps the game unchanged. Confirm clears the saved game and opens the setup screen pre-filled with the previous names in their previous order.
- AC-29: Given Silent is off, when a roll happens, then a synthesized rattle plays, and a distinct sound plays for shout-level and big-level effects. Given Silent is on, nothing plays, and no `AudioContext` is created if none exists yet. The Silent setting survives a reload.

## Technical notes

**Files**
- `js/dice.js` (modify): keep `rollDie` rejection sampling but add an optional `randomUint32` parameter. The default reads one `Uint32` from `crypto.getRandomValues`. Add `rollPair(randomUint32?)`. `rollDice` and `sum` may stay. No DOM.
- `js/game.js` (new, pure): `validateNames`, `createGame`, `moveItem`, `applyRoll`, `rerollLast`, `undoLast`, `shiftTurn`, `serialize`, `deserialize`. Every function is immutable (returns new objects). It does not use the RNG: callers pass dice in.
- `js/events.js` (new, pure): exports `RULES` and `evaluateEvents`. Rule shape: `{ id, priority, level, test(ctx) => boolean, message(ctx) => string }`, with `ctx = { rolls, players, last }`. Shared helpers (trailing same-sum run length, rolls since the last 7, a player's previous roll) live here as exported functions so rules stay one-liners.
- `js/sound.js` (new, browser only, not unit-tested): Web Audio oscillator/noise sounds (`roll`, `shout`, `big`). The `AudioContext` is created lazily on the first non-silent play inside a user gesture, and resumed if it is suspended (iOS). `play()` returns immediately when silent.
- `js/main.js` (rewrite): screen switching (setup / game), rendering, animation timing, localStorage I/O wrapped in try/catch (private mode or quota errors must not break the page), and the `matchMedia('(prefers-reduced-motion: reduce)')` check.
- `index.html`, `css/styles.css` (rewrite): two `<section>` screens. Keep the token structure and light/dark themes, restyled toward retro arcade: chunky dice with pips, bold display font from the system stack, a high-contrast accent, and banner keyframes. Shout and comment regions use `aria-live="polite"`. Title: "Catan Dice".
- `package.json` (new): `"private": true`, `"type": "module"`, scripts `test: "node --test"` and `lint: "node scripts/lint.js"`. `node --check` accepts only one file per invocation, so `scripts/lint.js` (zero-dep) walks `js/`, `test/` and `scripts/` and spawns `node --check <file>` for each one. The workflow needs no `npm install`/`npm ci`, since there are no deps and no lockfile.
- `test/*.test.js` (new): picked up by `node --test`'s default discovery. Test titles start with the AC id (`it("AC-11: ...")`).
- `.github/workflows/pages.yml` (new). `README.md`: update the description, structure, `npm test`/`npm run lint`, and the deploy steps (enable Pages → Source: GitHub Actions).

**Rule priorities (higher wins)**

| id | priority | level |
|---|---|---|
| serial-robber | 100 | big |
| combo | 90 | shout |
| combo-breaker | 80 | shout |
| seven | 70 | big |
| snake-eyes | 60 | shout |
| boxcars | 60 | shout |
| doubles | 30 | comment |
| drought | 20 | comment |

Seven always produces the big effect through the `effect` = max-level rule, even when combo or combo-breaker takes the main banner.

**Persistence**: the `localStorage` keys are `catan-dice:game` (the `serialize` output) and `catan-dice:silent` (`"1"`/`"0"`). Save after every state change (roll, re-roll, undo, turn shift, start). On confirm, New game removes `catan-dice:game` but keeps the names in memory to pre-fill setup. Pre-fill after a reload falls back to a separate `catan-dice:last-names` key, which is written at game start.

**Edge cases**
- Double-tapping Roll must not produce two rolls. Buttons are disabled during the animation.
- Re-roll and Undo after a reload act on the restored history.
- The undo stack is the roll history itself, so Undo can be repeated back to zero rolls.
- Turn shifts are not part of the history, so Undo does not revert them. Undo sets `turn` from the removed roll.
- Names render via `textContent`, never `innerHTML`.
- `ctx.last.player` indexes into `players`. The player list is fixed for the whole game, so indices stay valid.
- The repo root is published as-is, so `specs/`, `test/`, `.claude/` and `package.json` become publicly readable on Pages. They contain no secrets.

## Open questions
- NON-BLOCKING: Duplicate player names. Assumption: rejected, case-insensitive (AC-3), because "Next: Anna" would otherwise be ambiguous.
- NON-BLOCKING: Default number of empty name rows on first visit. Assumption: 4 (typical Catan table). Range 2–6.
- NON-BLOCKING: Drought threshold and repetition. Assumption: fires at every 10 consecutive non-7 rolls (10, 20, …) instead of on every roll after 10, to avoid spam.
- NON-BLOCKING: Should the Pages workflow gate deploy on `npm test`? Assumption: yes. It costs nothing with zero deps, and a red build blocks a broken deploy.
- NON-BLOCKING: Publishing the whole repo root also exposes `.claude/`, `specs/` and `test/`. Assumption: acceptable, as decided ("deploy repo root"). If not, upload a `site/` subset instead.
- NON-BLOCKING: Exact shout copy beyond the combo texts (seven, serial robber, snake eyes, boxcars, doubles, drought) is left to the implementer. Tests assert `id`, `level`, and the required substrings only.
