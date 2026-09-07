# Coreward

3D planet-mining PWA. Dig toward a planet core, sell ore at the surface pad, buy
upgrades, break the core and the planet explodes, launch to a harder planet. Fuel
and heat are the two pressures pushing you back up.

Live: **https://gideon6222.github.io/coreward/**
Repo: github.com/gideon6222/coreward
Target device: Samsung S26 Ultra, Chrome, portrait, installed to the home screen.

## Stack

Static GitHub Pages PWA. **No build step, no bundler, no package.json, no
node_modules.** The files in this repo are exactly what the browser fetches.

- three.js **0.166.0**, loaded as an ES module from jsdelivr via an importmap in
  `index.html`. Nothing else is imported.
- ES modules in the browser (`<script type="module" src="app.js">`).
- Audio is 100% synthesised at runtime with Web Audio. No mp3, no wav, no samples.
- Icon is SVG. There are no binary assets anywhere in this repo, by design.

### Files

| File | What it is |
|---|---|
| `index.html` | Shell: all CSS, the HUD, d-pad, modals, importmap, error overlay |
| `app.js` | The entire game: world gen, mining, economy, three.js scene, loop |
| `audio.js` | Synthesised score and SFX, split out so it can be retuned alone |
| `sw.js` | Service worker, cache-first offline |
| `manifest.webmanifest` | PWA manifest, fullscreen + portrait |
| `icon.svg` | App icon |

`app.js` is ~1070 lines and holds everything. `audio.js` exports `sfx`,
`audioInit`, `setAudio`, `audioState`, `setDepth` and is the only module boundary
that currently exists.

## Deploy

GitHub Pages serves **`main` at the repo root**. There is no workflow, no build,
no `gh-pages` branch. Commit and push to `main` and the live site updates.

**Every deploy must bump the cache constant in `sw.js`:**

```js
const CACHE = 'coreward-v5';   // <- increment this on EVERY change
```

The service worker is cache-first. If you ship without bumping it, installed PWAs
keep serving the old build and it will look like your change did nothing. Also add
any new file to the `ASSETS` array in `sw.js`, or it won't be available offline.

## Tests

Phase 0 safety net for the Vite/TypeScript migration. **Zero dependencies** - no
`package.json`, no `node_modules`. Uses the built-in node test runner.

```
node --test test/blocks.test.mjs test/stats.test.mjs test/route.test.mjs
```

Node is installed at `C:\Program Files\nodejs\node.exe` but is **not on PATH**,
so from Git Bash use the full path in quotes, or add it to PATH once.

`test/harness.mjs` does not import `app.js` - importing it would immediately touch
`document` and build a WebGLRenderer. Instead it reads the real `app.js` source,
slices it at the `/* ============ three ============ */` banner, strips the two
`import` lines and evaluates the pure prelude. **The tests therefore run against
shipping code, not a copy of it, and `app.js` needs no modification.** If that
banner is ever renamed, update `MARKER` in the harness.

Baselines live in `test/baseline/*.json`. To re-record one deliberately, delete
the file and re-run.

Two things the harness handles that a naive snapshot gets wrong:

- **`Infinity` is encoded, not stringified.** Bedrock has `hard: Infinity`, and
  `JSON.stringify` turns that into `null`, so a round-tripped snapshot would
  silently lose it and still compare equal to itself. Non-finite numbers are
  written as `"__Infinity__"`, and bedrock is *additionally* asserted directly on
  the live value.
- **Pathfinding has two tiers.** `findRoute()` is a BFS whose neighbour order is
  an array literal in `app.js`; when several shortest paths tie, that order alone
  picks the winner. The *contract* tests assert only what matters - the path is
  connected, passes through no solid rock, and matches the length found by an
  independent BFS that deliberately uses a different neighbour order. The exact
  path is pinned separately in `route-canary`. **If only the canary fails, the
  change is safe: re-record it.** If a contract test fails too, pathfinding is
  genuinely broken.

These cover pure functions only. Hit-stop, camera lerps and the autopilot spline
live in the frame loop and **cannot** be covered here - the side-by-side check on
the phone is the real test for those.

## Hard constraints

- **No binary files, ever.** The GitHub connector used to push here cannot commit
  binaries, so audio must stay synthesised and images must stay SVG. This is
  treated as a feature: zero load cost, works offline.
- **AudioContext needs a real user gesture.** `audioInit()` is wired to the first
  `pointerdown`/`keydown`; Chrome blocks it otherwise.
- **three.js 0.166 is physically based.** Old tutorial light values render nearly
  black. Working set is documented in the notes repo; the live values are ambient
  1.6 in the open falling to ~0.2 deep, directional 1.5 faded out below the
  surface, player point light intensity 30 with decay 1.25.
- **Portrait aspect is ~0.46.** Only 6-7 of the 9 world columns fit horizontally.
  Camera distance is solved from a target row count (13) and panned within clamped
  limits; see `resize()` and the camera block in `frame()`.
- **Errors are caught by the `#err` overlay** in `index.html` and printed to
  screen. On a phone with no devtools this is the only way to see a stack trace.
  It works today because the inline `window.onerror` handler is registered
  *before* the module script loads. Vite rewrites that region of `index.html`, so
  any migration must keep the overlay catching a module that fails to load, and
  must be verified by deliberately breaking an import once and confirming the
  overlay still shows it.

## Save data

`localStorage`, keys `coreward.v2` (game, with a migration path from the older
`coreward.v1`) and `coreward.audio` (music/sfx toggles). "RESTART PROGRESS" in the
pause menu clears both.

## Feel rules that the game currently depends on

These are load-bearing, not decoration. Changing them changes how it plays.

- **Hit-stop.** `freeze` pauses the *simulation* for 35 ms on rock and 75 ms on
  ore. Camera and UI keep running off a separate raw delta (`raw` vs `dt` in
  `frame()`). Do not collapse those two deltas.
- **Three feedback channels per action:** particles in the block's own colour,
  a pitched sound, screen shake, plus a squash on the ship.
- **Pitch is randomised** on repeated sounds (playback rate 0.7-1.3) so drilling
  does not become irritating.
- **Autopilot flies a Catmull-Rom spline** over a breadth-first shortest route
  through dug tunnels, with ease-in-out. Stepping cell to cell reads as a
  fast-forward, which was rejected in playtest.
- **Fake bloom** is a 64px radial-gradient canvas texture on additive sprites.
  Pulse by animating sprite *scale*, not opacity, since the material is shared.
- **Sky is a CSS gradient** on `#game`, updated from game state ~8x/sec. The
  renderer runs with `alpha: true` and no scene background.

## Notes repo

Design lessons and playtest feedback live in a **separate repo, `../gamedev-notes`**
(`C:\dev\gamedev-notes`):

- **`CRAFT.md`** - design and technical lessons that carry across games. Read it
  before designing anything.
- **`PLAYTESTS.md`** - what Gideon actually said about the game, dated, in his own
  words. Complaints are the most valuable entries.

`pre-vite` tags the last commit of the original no-build-step version
(`83a862a`), pushed to the remote. Pages serves one branch and there is no
preview deploy, so that tag is the way back if a migrated build breaks on device.

Both are append-only. Add a dated entry, never rewrite history. Write to them
before ending a session that changed anything about how the game feels.
