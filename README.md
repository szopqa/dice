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

Upload the folder as-is to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3…).
