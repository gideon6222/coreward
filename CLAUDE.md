# Coreward

3D planet-mining PWA. Fly a drill ship down toward a planet core, sell ore at the surface pad,
buy upgrades, break the core and the planet explodes, launch to a harder planet.

Live: **https://gideon6222.github.io/coreward/**
Repo: github.com/gideon6222/coreward
Target: Samsung S26 Ultra, Chrome, portrait, installed to the home screen.
Current version: see `src/changelog.ts` — that file is the player-facing history.

**The shared knowledge base is `../gamedev-notes`** (`C:\dev\gamedev-notes`). Read
`PIPELINE.md` there for the stack, shipping and the measured limits; `CRAFT.md` for design
lessons; `ASSETS.md` before importing anything. **This file is only for what is true of
Coreward specifically** — anything general belongs in the notes repo, not duplicated here.

---

## Stack

The standard stack from `PIPELINE.md`. Coreward-specific pins and choices:

- **three.js pinned to exactly `0.166.0`**, with `@types/three` at the same version. Not a
  caret range: the lighting values below are calibrated to it, and three ships no
  declarations of its own.
- **Audio is 100% synthesised at runtime.** Kept that way because it is genuinely better
  here, not because of any restriction — the score has layers that mix by depth, danger and
  zone off one scheduler, which a recording cannot do.
- **The only binary assets are two `woff2` font files** in `public/fonts/`. The old "no
  binaries, ever" rule was a limitation of a tool that is no longer used. `woff2` is in the
  Workbox glob so the installed app does not fall back to a system face offline.

### Files

| Path | What it is |
|---|---|
| `index.html` | Shell: all CSS, HUD, d-pad, kit and ordnance buttons, the station screen, error overlay, SW registration |
| `src/main.ts` | Boot sequence only |
| `src/types.ts` | Domain types. Type-only, emits nothing |
| `src/env.d.ts` | Ambient declarations for the Vite `define` build stamp |
| `src/config.ts` | Tuning constants and pure functions over them. Imports only types |
| `src/util.ts` | `key`, `clamp`, `mixHex`. Imports nothing |
| `src/runtime.ts` | `R`, the mutable loop state that crosses modules. Imports nothing |
| `src/state.ts` | `g`, derived stats `S`, relic perks, save/load |
| `src/light.ts` | **Pure.** The lighting solvers: the flood through open cells and the shadow ray fan |
| `src/lightmap.ts` | The solved field as a texture, the shader injection, and the haze quad |
| `src/shader.ts` | `chainCompile`, the one way anything patches a stock three shader |
| `src/feel.ts` | Every number that decides how it *feels*, plus the pure reducers (`tremorTick`, `chargeAfter`, `soakAfter`) |
| `src/world.ts` | Generation, `blockAt`, `findRoute`, `planCollapse`, `cachePrize` |
| `src/fly.ts` | **Pure.** Collision and thrust. No renderer, fully unit-tested |
| `src/scene.ts` | Renderer, camera, lights, fog, backdrop, `resize()` |
| `src/materials.ts` | Shared geometry and materials, rock displacement shader, procedural textures |
| `src/blocks.ts` | Instanced terrain, pools keyed by block id, haloes, `beginDig`/`dropBlock` |
| `src/ship.ts` | The drill ship, headlight cone, drill tiers |
| `src/pad.ts` | The landing platform |
| `src/drops.ts` | Ore left lying where it fell |
| `src/relic.ts` | The buried relic and its proximity finder |
| `src/mark.ts` | The deepest-reach marker line |
| `src/beam.ts` | The cutting laser's visible cut |
| `src/parallax.ts` | Distant rock behind the tunnels |
| `src/particles.ts` | Sprays, dust, stars, sun |
| `src/audio.ts` | The whole audio graph, score and effects |
| `src/ui.ts` | The `ui` element map, HUD, station screen, manifest, patch notes |
| `src/input.ts` | All d-pad, keyboard and button wiring |
| `src/actions.ts` | Sell, tow, autopilot, ordnance, supplies, tremor, `stopDigging` |
| `src/loop.ts` | `frame()`. The one big function |
| `src/changelog.ts` | Version and the player-facing what's-new list |

**Import direction is one-way and load-bearing:** types → config → util → runtime → state →
feel/fly/world/light → shader → lightmap → renderer modules → ui → actions → loop. `actions.ts`
deliberately does *not* import from `loop.ts`; `FACE_VEC` is duplicated there instead, because a cycle that only works
because of when each binding happens to be read is a trap for whoever moves a call next.

---

## Invariants

Things that will silently break the game if changed without understanding them.

**World generation is a pure seeded hash.** `rnd(x, d, planet)` decides every cell. Anything
new that generates content **must roll on its own seed offset** — caves on `planet + 77`,
pockets on `planet + 41`, seams on `(x + 61, d + 17)`. Consuming the ore roll shifts every
value at every depth on every planet, and the diff looks like three lines.

**`test/baseline/blocks-preadditive.json` is frozen and must never be re-recorded.** It is the
world as it stood before pockets existed, with its own id legend, and the test asserts the only
legal difference: a cell kept its id, or a known overwriter replaced it. Re-recording it is
exactly the mistake it exists to catch.

**`GRANITE_TO_SCORIA === HEAT_DEPTH`, both 70.** Four things land on that metre: the rock band
changes, the sky and fog warm, the hull starts draining, the vignette builds. A test asserts the
two constants stay equal because they drifted apart silently once.

**`ORES` is ordered deepest-first, and each entry's `chance` is strictly lower than the next.**
That is what makes adding a new deepest ore convert only the ore directly above it rather than
reshuffling every band. There is a test.

**Per-cell maps carry no planet in their keys.** `dug`, `rubble`, `damage` and `drops` must all
be cleared together on a planet change, or the new world inherits the old one's holes.

**Every shader injection goes through `chainCompile`, and never through a bare assignment
to `onBeforeCompile`.** A material has exactly one of those, so an assignment silently
discards whatever was already there - and the result renders perfectly, just wrong.
Relatedly, **`Material.clone()` drops `onBeforeCompile` and `customProgramCacheKey`
entirely**: the drilled block is the only cloned material in the game and it has to have
its displacement and its lighting re-applied by hand. There is an e2e test that reads the
compiled shaders back out of WebGL and fails if any rock program has lost the light.

**Every uniform the lighting shader declares must be supplied by `inject()`, which is why
that loops over `U` rather than listing names.** GLSL gives a missing sampler texture unit
zero and a missing vector all zeroes, so the shader compiles, runs, and silently ignores that
part of the model - the shadow fan shipped inert on the terrain for exactly this reason while
the haze, which listed its uniforms by hand, worked. The haze now spreads `U` too. There is an
e2e test that reads the declarations out of the compiled shader and fails on any that nothing
supplies.

**`Object3D.layers` does NOT stop a light reaching an object, and the world is drawn in two
passes because of it.** Layers decide what a CAMERA draws; three collects a scene's lights once
and every lit material gets all of them. Putting the ship on `SHIP_LAYER` and leaving the lamp
off that layer excluded exactly nothing for three versions - the intensity-44 lamp sitting on
the ship was lighting it the whole time, which is why the hull rendered white however dark it
was painted. `renderWorld()` in scene.ts draws the world without the ship, then the ship alone
with the lamp momentarily at zero. `renderer.info.autoReset` is off and reset by hand there, or
the draw-call guard measures only the second pass.

**There are TWO lights and they must not be fused.** `coreReach()` lights rock faces:
flood x pool x lobe, and **never the shadow fan**. `coreReachAir()` lights the air in a tunnel:
the same terms plus the fan, over a much higher ambient. A rock face is lit by being near a lit
tunnel, which is a property of the rock; the air in a tunnel is lit by light arriving along it,
which a corner can block. Fusing them put hard-edged shadow wedges across every rock face in
the frame, and no amount of fixing the fan could remove a shadow that was never meant to be
there.

**The propagated light only ever darkens.** `coreLit()` is clamped to at most 1, so every
lighting value in `feel.ts` is still the ceiling it was calibrated to be. If the world ever
needs to be brighter, that is a change to the lights, not to the lightmap.

**The shadow fan records the distance to the farthest CORNER of the first wall cell it hits,
not where the ray leaves it.** The fan is sampled by angle and interpolated between rays, so a
fragment's occluder is a blend of two rays that may have clipped different parts of a wall;
with the exit distance, roughly an eighth of every wall face falls beyond its own occluder and
goes dark - a hard diagonal cut across every block in the frame, which reads as every rock
shadowing itself. There is a test that samples across a wall face and fails above five per
cent.

**The old rule, still true underneath it:** the fan records the FAR side of the first wall, not
the near side. A rock
face is the surface the lamp is falling on and has to stay lit; shadow starts behind it.
Recording the near side puts every rock face in the game into its own shadow.

**Rock is relaxed but never expanded by the solver.** That one line in `light.ts` is what
stops light passing through a wall into the chamber behind it. Without it every sealed
pocket glows faintly and tells the player it is there before they have dug to it.

**Bedrock and the planet core are unbreakable by ordnance.** The core is a planet's climax and
has to be drilled by hand.

**A tremor must never take the run.** `planCollapse()` applies the collapse, re-runs
`findRoute()`, and reverts entirely if the ship can no longer reach the pad.

**The error overlay is in `<head>`**, above the module script. Vite hoists the entry, so a
handler in `<body>` is registered too late. After changing the head, verify by deliberately
breaking an import.

**`AudioContext` needs a real user gesture.** `audioInit()` is on the first
`pointerdown`/`keydown`. The graph is built atomically and published only when complete, so one
null check narrows every node.

---

**Anything given `asMetal()` gets its colour almost entirely from the environment map.** A
metal has no diffuse term to speak of, so with a dark albedo the env IS the visible brightness -
painting the hull darker three times running changed nothing until the env's missing
`colorSpace` was fixed. If a metal object will not respond to its own colour, look at the
environment before anything else.

## Numbers that are calibrated, not chosen

**Lighting, for three.js 0.166.** Ambient 1.75 at the surface falling by 1.62 with depth; sun
1.5 fading out below the surface; rim 0.5 falling by 0.44; lamp a point light at intensity 30,
range `S.light()`, **decay 1.75**. Old tutorial values render nearly black under 0.166's
physically based lighting.

**The z stack: rock to 0.7, haze 0.74, lamp glow 0.80, ship 0.95.** The displacement shader
pushes rock vertices a fifth of a cell forward, so a tunnel wall bulges to z 0.7; the haze has
to clear that or those bulges draw over it as chips of lit rock floating in the fog. The ship
in turn has to clear the haze, or an additive quad centred on its own lamp washes the hull
flat.

**Propagated light.** Attenuation 0.78 per unit of DETOUR - not per unit of distance;
distance is the pool, evaluated per pixel from the ship's exact position so it does not step
as you fly. Rock seeps 0.32 per cell for three cells. Unreached cells settle to 0.06 of the
light they would otherwise get, which is dark enough to read as unreachable and light enough
to keep the rock's shape. Daylight gives out between 2 m and 14 m, read from each CELL's own
depth rather than the ship's, so the top of a shaft still glows from ninety metres down.
Rock seeps 0.62 per cell for three cells, which is 1.0, 0.38, 0.15, 0.06 once the contrast
below is applied - a wall, two readable layers and a third that is nearly gone. **Any threshold
about how dark something looks belongs on the post-contrast value**: two tests were written
against the raw field and both failed the moment the seep was retuned to exactly what a
playtest asked for, which is the wrong way round for a test to behave.

The multiplier is then SQUARED (`LM_CONTRAST`) before it is applied, because it multiplies
linear light that is about to be sRGB-encoded: six per cent of the lamp displays as roughly a
third of full brightness, which is how an early version came out as a grey wash over a field
that was numerically correct.

**Beam and bounce, combined with max() and never multiplied.** Direct light is the lobe times
the shadow; the bounce is a flat 0.22, omnidirectional and unshadowed, and both are gated by
the flood. Multiplied, somewhere both behind the ship and in shadow lands on the product of
two floors and goes black - which erases the shaft you came down. The bounce also has its OWN
falloff, 1.7x the beam's reach on a much gentler curve: sharing the beam's pool made the glow
behind the ship end exactly where the beam did, with the same hard edge, which is the one thing
the soft half must not do.

**Glow is dimmed on its own curve, not the surface one.** Ore glowing through unlit rock is the
find-the-vein mechanic and must not switch off, so emissive and the ore haloes go through
`coreGlow()` - a square-root curve over a small floor - rather than `coreLit()`. `LM_GLOW_FLOOR`
and `LM_GLOW_POW` are the dial if ore becomes hard to find rather than merely hard to see
through rock.

**Framing.** 18 rows solved into a camera distance in `resize()`, then multiplied by
`zoomForScan(g.up.scan)` — 0.82 at Scanner 0 up to 1.22 at 9. The Scanner *is* the framing;
that is most of what makes it worth buying. There is a test asserting the lit radius grows
faster than the frame, so an upgrade can never buy darkness.

**Portrait aspect is ~0.46.** The world is 13 columns wide and only 7–8 fit, which is
deliberate: which way to dig is a real choice rather than a formality.

**Flight.** `FLY_ACCEL 18` (~0.2 s to top speed), `FLY_DRAG 9` (~0.75 cells of coast),
`SHIP_R 0.34`. If flight needs tuning, it is these three and nothing else.

**Bands.** Heat at 70 m, tremors at 85 m, cave systems from 26 m, gas from 34 m, geodes from
52 m, caches from 20 m, relics below the halfway mark of each planet.

---

## Save data

`localStorage`, keys `coreward.v2` (game, with a migration from `coreward.v1`) and
`coreward.audio` (toggles). "RESTART PROGRESS" clears both. Typical save 339 bytes, worst case
measured 12.5 KB against a ~5 MB quota — size is not a consideration.

Old saves are handled forward, not broken: `grandfatherStock()` grants exactly the materials a
pre-materials save already paid for, and every new field defaults.

**Seeding a save from the console does not work naively** — the game saves on
`visibilitychange`, so the outgoing page writes live state back over the seed on reload. Freeze
`Storage.prototype.setItem` for that key first.

---

## Feel

The numbers live in `src/feel.ts` and are pinned two ways by `test/feel.test.mjs`: a snapshot
that fixes the values, and separate assertions on *intent* — ore lands heavier than rock, the
core is the biggest shake in the game, hit-stop stays in the range that reads as weight. The
intent tests survive a retune; the snapshot does not.

If you retune anything there, re-record the baseline and **check it on the phone**. A desktop
cannot tell you whether hit-stop still lands.

- **Hit-stop** pauses the *simulation* for 35 ms on rock, 75 ms on ore. Camera and UI keep
  running off `raw` rather than `dt`. Do not collapse those two deltas.
- **All smoothing is `1 - exp(-rate * dt)`** via `approach()`, and every rate goes through
  `asExpRate(n)` so it covers the same fraction per 60 fps frame as the number that was
  originally tuned by eye. The baseline records those fractions, which is the proof the fix
  changed nothing at 60 fps.
- **Three feedback channels per action**: particles in the block's colour, a pitched sound,
  screen shake, plus a squash on the ship.
- **Autopilot flies a Catmull-Rom spline** over a breadth-first shortest route. Stepping cell
  to cell read as a fast-forward and was rejected in playtest.
- **Fake bloom** is a 64px radial-gradient canvas texture on additive instanced quads. Pulse
  by animating *scale*, not opacity — the material is shared.
- **Sky is a CSS gradient** on `#game`, updated ~8×/sec. The renderer runs `alpha: true` with
  no scene background.

---

## Local development

```
npm install
npm run dev        # vite dev server, no service worker
npm run build      # production build into dist/
npm run typecheck  # tsc --noEmit, app and e2e
npm test           # golden tests, ~1.2 s
npm run e2e        # Playwright against the built game
npm run size       # bundle drift guard
npm run size:update
npm run preview    # serve dist/ exactly as Pages will
```

Node is at `C:\Program Files\nodejs` and is on the user PATH, so a **new** terminal has it.

Service workers are off in `vite dev` on purpose. The in-app Claude browser cannot register
one at all, so any PWA check has to happen in real Chrome or on the phone — and that browser
also stops `requestAnimationFrame` when its pane is hidden, so anything on a timer must be
tested through a pure reducer rather than by watching it.
