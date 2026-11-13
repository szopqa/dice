# Dice Roller

A tiny dice-rolling website. Plain HTML, CSS and JavaScript — no dependencies, no build step.

## Structure

```
index.html       markup
css/styles.css   styles (design tokens at the top, light + dark theme)
js/dice.js       pure dice logic (no DOM)
js/main.js       UI wiring
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
