# Catan Dice

A retro-arcade 2d6 dice site for playing Catan: turn order, tumbling dice, combo shouts and a big robber effect on every 7. Plain HTML, CSS and JavaScript — no dependencies, no build step.

## Structure

```
index.html          setup + game screens
css/styles.css      styles (design tokens at the top, arcade dark + light theme)
js/dice.js          pure dice logic (rollPair)
js/game.js          pure game state (players, turns, rolls, undo, serialize)
js/events.js        declarative event rules + evaluator
js/sound.js         synthesized Web Audio sounds, silent mode
js/main.js          UI wiring (screens, animation, persistence)
js/ui/              UI helpers (localStorage wrapper, CSS-pip dice drawing)
test/               node --test unit tests for the pure modules
specs/              feature specs
```

## Usage

Enter 2-6 player names (reorder with the arrows), press Start game, then ROLL (or press the Space or Enter key to roll from the keyboard). Re-roll replaces the last roll, the triangles change whose turn it is, Undo removes the last roll, and Sound toggles silent mode. State is saved in localStorage (`catan-dice:game`, `catan-dice:silent`, `catan-dice:names`).

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
