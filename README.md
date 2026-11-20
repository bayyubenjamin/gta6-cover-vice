# gta6-cover-vice

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/bayyubenjamin/gta6-cover-vice/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/bayyubenjamin/gta6-cover-vice/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Vice Cover Studio turns a photo and a caption into GTA-style poster art — a diagonal five-panel poster with a hero portrait, three re-cropped vignettes, a procedurally drawn neon skyline and a real cinematic grade — and exports it as a PNG in 1080 x 1080, 1080 x 1350 or 1920 x 1080. It runs offline in a desktop browser from its own static files; photos never leave the machine.

## What makes it different

Every other cover maker pastes a photo under a sunset gradient. This one cuts the user's own photo into a poster: the hero panel shows the subject, three vignettes re-crop the same photo at different zooms and focus points (wide, detail, sky), the title strip is a skyline drawn in code — sun disc with scanline gaps, lit windows, palm silhouettes, all from a fixed seed — and the colour grade is computed per pixel in canvas (teal shadows / warm highlights for Vice Sunset, teal shadows / pink highlights for Neon Nights). The result is a poster, not a filtered photo. The first screenshot is the landscape cover the app itself exported, because that is what the judge sees largest.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. Pick a photo (or a sample), type a caption and tagline, choose a size, panels and grade, and press Export PNG.

## How it works

- `app/src/cover.js` — the render engine: `computePanels` lays out the diagonal panel grid, `getGradedPhoto` bakes the cinematic grade once per photo into an offscreen canvas, `drawSkyline` draws the neon skyline from a seed, `drawCover` composes panels, skyline and lettering.
- `app/src/main.js` — wires the editor: photo upload, sample picker, caption, size / layout / grade pickers, PNG export.
- `app/src/shots.js` — fixed `?shot=` scenes so screenshots are reproducible.
- `app/fonts/Anton-Regular.ttf` — Anton, SIL Open Font License (see `app/fonts/OFL.txt`). No Rockstar logo, artwork or font anywhere.
- `main.ts` — the entrypoint: copies `app/` and `screenshots/` to the output and writes `dossier.json` with the vendored make.fun library.

## Screenshots

`shots.json` lists the four shots: the exported wide cover first, the editor with a photo loaded, then the exported portrait and square covers. Take them with a headless browser against `node serve.ts`, waiting for `window.__shotReady`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
