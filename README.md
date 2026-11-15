# Catan Dice

A retro-arcade 2d6 dice site for playing Catan: turn order, tumbling dice, combo shouts and a big robber effect on every 7. Plain HTML, CSS and JavaScript — no dependencies, no build step.

## Structure

```
index.html          setup + game screens
css/styles.css      styles (design tokens at the top, arcade dark + light theme)
js/dice.js          pure dice logic (rollPair)
js/game.js          pure game state (players, turns, rolls, serialize)
js/events.js        declarative event rules + evaluator
js/sound.js         synthesized Web Audio sounds, silent mode
js/haptics.js       vibration patterns + iOS switch fallback
js/shake.js         shake detector, motion support/permission
js/main.js          UI wiring (screens, animation, persistence)
js/ui/              UI helpers (localStorage wrapper, CSS-pip dice drawing)
test/               node --test unit tests for the pure modules
specs/              feature specs
```

## Usage

Enter 2-6 player names (reorder with the arrows), press Start game, then ROLL (or press the Space or Enter key to roll from the keyboard). the triangles change whose turn it is (to fix a wrong roller, press ◀ until the right player shows and roll again), and the three buttons next to New game control Sound (🔊/🔇), Shake to roll (🫨) and the Turn timer duration (⏱️). State is saved in localStorage (`catan-dice:game`, `catan-dice:silent`, the shake setting, `catan-dice:timer`, `catan-dice:names`).

Pressing Start game reloads the page on purpose. On iOS, typing names leaves an "Undo Typing" entry in Safari's undo history, so shaking the phone would open the Shake to Undo dialog instead of rolling. Web pages can't disable that, so the page reloads (the game is restored without animation) to clear the history.

### Sound, haptics and shake

- **Sound**: unlocked on the first tap/key press (needed on phones), and re-created on the next tap after the page was hidden (phone locked or app backgrounded). On iPhone it plays on the media channel, so the ring/silent switch does not mute it.
- **Haptics**: always on. They fire when the dice land (not on press): a short tick, with stronger patterns for shouts and 7s, via the Vibration API (Android). iPhone has no Vibration API, so only an experimental tick on tapped rolls (iOS 18+) is attempted; there is none on shake rolls.
- **Shake to roll**: off by default; shaking the phone rolls like the Roll button. It needs a motion sensor and **HTTPS** (or localhost), so it works on GitHub Pages. For testing on a phone over Tailscale, use `tailscale serve` to get an HTTPS URL. On iOS the toggle asks for motion permission; if denied, re-enable it in Safari settings.
- **Turn timer**: off by default (⏱️ cycle button: each press steps off → 1 → 2 → 3 min → off). Once at least one roll exists, a `m:ss` countdown runs for the current player. It restarts after every roll and ◀/▶, pulses in the last 10 s, and at 0:00 shouts "TICK TOCK, <name>!" once (banner, shout sound unless Silent, Android vibration). It pauses while the dice tumble or the page is hidden, and starts fresh after a reload. Only the selected duration is saved (`catan-dice:timer`, in seconds; an old `1` still means 1 minute).

## Test and lint

```sh
npm test
npm run lint
```

## Run locally

The JS uses native ES modules, which browsers won't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Deploy

The site is deployed to GitHub Pages by `.github/workflows/pages.yml` on every push to `main` (or manually via "Run workflow"). The workflow runs `npm test` first, then publishes the repo root.

One-time setup: in the repository go to Settings → Pages → Source and choose **GitHub Actions**.

The site is then served at https://szopqa.github.io/dice/
