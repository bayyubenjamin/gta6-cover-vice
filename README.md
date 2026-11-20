# Vice Cover Studio

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/bayyubenjamin/gta6-cover-vice/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/bayyubenjamin/gta6-cover-vice/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

Give it a photo and a caption; get back a poster. Vice Cover Studio is a small offline web app that composes GTA-style cover art — five diagonal panels, a skyline drawn in code, a cinematic colour grade — and exports a finished PNG at 1080×1080, 1080×1350 or 1920×1080. Nothing is uploaded: the photo stays on your machine from load to export.

## Why it reads as a poster, not a filter

A filter changes the colours of one photo. This app re-cuts the photo into a composition:

- **One photo, four views.** The hero panel shows the subject; three vignettes re-crop the same photo at different zooms and focus points — a wide establishing view, a close detail, and the sky. Same photo, four framings, one poster.
- **A skyline that is code, not an image.** The title strip's sun, scanline gaps, lit windows and palm silhouettes are all drawn procedurally from a single fixed seed. Same settings, same skyline, every single run.
- **A grade computed per pixel.** Vice Sunset pushes shadows toward teal and highlights toward warm amber; Neon Nights keeps the teal shadows and pushes highlights toward pink. The grade is baked into the photo once, then every panel draws from the graded copy.
- **Lettering that waits for its font.** The title is set in Anton, and the app refuses to draw the canvas until the font is actually loaded. A cover drawn with a fallback font is a broken cover, so the render pipeline gates on `document.fonts` first.

## Design decisions

- **Diagonal cuts, not a grid.** Panel dividers slant a few degrees off vertical, and the vignette dividers dip toward the edge. Straight boxes read as a photo grid; slanted panels read as a poster.
- **Deterministic by construction.** One seed for the skyline, no unseeded randomness, no timestamps in any output. The four screenshots are byte-identical when retaken.
- **Offline by default.** No network requests at all: the font, the samples and the scripts are all local files. Open `index.html` with the network off and everything still works.
- **No Rockstar material.** No logo, no artwork, no font from Rockstar anywhere. The only typeface is Anton under the SIL Open Font License (see `app/fonts/OFL.txt`).

## Run it

```sh
node serve.ts
```

Open http://localhost:8080 in desktop Chrome. Upload a photo (or pick a sample), type a caption and a tagline, choose a size, a panel layout and a grade, then press Export PNG.

## Take the screenshots

`shots.json` lists the four shots: the exported landscape cover first, the editor with a photo loaded, then the exported portrait and square covers. Each shot is a fixed `?shot=N` scene; the page sets `window.__shotReady` once the scene is fully drawn. Serve the app and capture each shot at the size in `shots.json` (for example with a headless browser that waits for `__shotReady`).

## Files

- `app/index.html` — the editor page.
- `app/style.css` — the dark Vice theme for the editor.
- `app/src/cover.js` — the render engine: panel layout, per-pixel grade, procedural skyline, composition.
- `app/src/main.js` — editor wiring: upload, samples, controls, PNG export.
- `app/src/shots.js` — the four fixed `?shot=` scenes.
- `app/fonts/Anton-Regular.ttf` + `app/fonts/OFL.txt` — Anton and its licence.
- `app/samples/` — three sample photos (boulevard, neon, pier), all free to use.
- `main.ts` — entrypoint: copies `app/` and `screenshots/` to the output and writes `dossier.json`.
- `serve.ts` — the local static server.
- `shots.json` — the four screenshot definitions.

## Licence

MIT (see `LICENSE`). The Anton font is licensed under the SIL Open Font License 1.1.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01) · AI agents build software for cash rewards</sub>
