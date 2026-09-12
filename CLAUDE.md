# Coreward

3D planet-mining PWA. **One planet**, 61 columns wide and 452 metres deep, divided into twelve
regions with their own rock and their own rules. Fly a drill ship down, sell ore at the surface
pad, buy upgrades, and hunt the nine ANCHORS buried across the world - each one calms its
region, draws it onto your map and strengthens the Ballast. The ninth opens the Vault at the
centre, and that is the end.

Round eight replaced the objective. It used to be a chain of planets you broke the core of and
left; there is no core, no chart and no jump drive any more.

Live: **https://gideon6222.github.io/coreward/**
Repo: github.com/gideon6222/coreward
Target: Samsung S26 Ultra, Chrome, portrait, installed to the home screen.
Current version: see `src/changelog.ts` — that file is the player-facing history.

@../gamedev-notes/INDEX.md

The shared knowledge base is `C:\dev\gamedev-notes` (`INDEX.md` above). For this web game
read `WEB.md` there for the stack, shipping and the measured limits, `CRAFT.md` for design,
`ASSETS.md` before importing anything, and `techniques/three-js-traps.md` and
`techniques/coreward-*.md` for the deep write-ups that came out of this game. **This file is
only for what is true of Coreward specifically.** Record general lessons with
`/record-lesson`, never by editing the notes' topic files from here.

---

## Stack

The standard web stack from `WEB.md` in the notes. Coreward-specific pins and choices:

- **three.js pinned to exactly `0.166.0`**, with `@types/three` at the same version. Not a
  caret range: the lighting values below are calibrated to it, and three ships no
  declarations of its own.
- **Audio is 100% synthesised at runtime.** Kept that way because it is genuinely better
  here, not because of any restriction — the score has layers that mix by depth, danger and
  zone off one scheduler, which a recording cannot do.
- **Binary assets are imported when the rule in `ASSETS.md` says to, and that rule is a
  MEASUREMENT: import what the player reads at its real size.** This line used to claim the
  only binaries were two `woff2` fonts, which stopped being true the day the rock textures
  landed and was still being repeated afterwards - a rule that misdescribes the repo teaches
  the next session something false about what is allowed.

  What is actually here: two `woff2` faces in `public/fonts/` (in the Workbox glob, or the
  installed app falls back to a system face offline), and four WebP maps in `src/textures/`
  imported through the bundler so they are hashed and precached - three rock maps for the
  terrain and one normal map for the planets in the intro and the crossing. Every one is a
  **normal or roughness map and never a colour map**, which is what lets a photographed
  texture into a flat-shaded game at all: the palette keeps deciding colour and the import
  only adds relief.

  The one thing still synthesised on principle is **audio**, and it is a reason rather than a
  habit - both CC0 libraries need a browser session or an API key and cannot be fetched
  unattended, and this score mixes by depth, danger and zone off one scheduler in a way a
  recording cannot.

### Files

**`src/sim/` is the simulation and has no renderer in it** (INDEX.md standing rule 2). It is
what `test/pure-entry.ts` bundles for the goldens, so it must keep running under node with no
three.js, no DOM and no audio context. `test/sim-boundary.test.mjs` enforces that by reading
the files: no three, nothing but `import type` crossing out of the directory, no renderer or
input globals, and no unseeded roll. Persistence is deliberately inside the wall, the same way
`save.gd` sits in `src/sim/` in the Godot games. Everything else in `src/` is presentation and
may import freely from `src/sim/`, never the other way.

| Path | What it is |
|---|---|
| `index.html` | Shell: all CSS, HUD, d-pad, kit and ordnance buttons, the station screen, error overlay, SW registration |
| `src/main.ts` | Boot sequence only |
| `src/types.ts` | Domain types. Type-only, emits nothing |
| `src/env.d.ts` | Ambient declarations for the Vite `define` build stamp |
| `src/sim/config.ts` | Tuning constants and pure functions over them. Imports only types |
| `src/sim/util.ts` | `key`, `clamp`, `mixHex`. Imports nothing |
| `src/sim/runtime.ts` | `R`, the mutable loop state that crosses modules. Imports nothing |
| `src/sim/state.ts` | `g`, derived stats `S`, relic perks, save/load |
| `src/sim/telemetry.ts` | The run log: numbers to balance against, accumulated as `+=` and summarised only when a panel opens |
| `src/sim/light.ts` | The lighting solvers: the flood through open cells and the shadow ray fan |
| `src/lightmap.ts` | The solved field as a texture, the shader injection, and the haze quad |
| `src/shader.ts` | `chainCompile`, the one way anything patches a stock three shader |
| `src/sim/feel.ts` | Every number that decides how it *feels*, plus the pure reducers (`tremorTick`, `chargeAfter`, `soakAfter`) |
| `src/sim/world.ts` | Generation, `blockAt`, `findRoute`, `planCollapse`, `cachePrize` |
| `src/sim/fly.ts` | Collision, thrust, and the hull's facing geometry (`FACE_ANGLE`, `headingFor`). No renderer, fully unit-tested |
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
| `src/particles.ts` | Sprays, stars, sun |
| `src/dust.ts` | The lit mote field. World-anchored, wraps around the ship |
| `src/audio.ts` | The whole audio graph, score and effects |
| `src/ui.ts` | The `ui` element map, HUD, station screen, manifest, patch notes |
| `src/input.ts` | All d-pad, keyboard and button wiring |
| `src/actions.ts` | Sell, autopilot, ordnance, supplies, tremor, `stopDigging`, the Anchor / wake / Vault moments |
| `src/loop.ts` | `frame()`. The one big function |
| `src/sim/ambience.ts` | What a world DOES in the air: per-trait emission timing |
| `src/sim/intro.ts` | The first-run intro: its beats, their shots and their timing |
| `src/titleui.ts` | The title screen and the intro, wired to the DOM |
| `src/sim/region.ts` | The twelve regions, their names and traits, and the map's coarse tile grid |
| `src/sim/vaults.ts` | The nine Anchors, the authored room templates, and the Vault at the centre |
| `src/sim/unrest.ts` | Unrest per region, the Ballast, collapse, the wake at the fifth Anchor |
| `src/collapse.ts` | What a collapse and a shoring do to the world; the ground closing behind you |
| `src/mapui.ts` | The Survey screen, on a canvas |
| `src/ballast.ts` | The Ballast on the pad. Sight glass, dial, stack, tier collars |
| `src/transit.ts` | The title screen's showcase, landing and launch. Its own scene |
| `src/changelog.ts` | Version and the player-facing what's-new list |

**Import direction is one-way and load-bearing:** types → `src/sim` (config → util → runtime →
state → region/unrest/vaults/feel/fly/world/light/ambience/intro) → shader → lightmap → renderer
modules → ui → actions → loop. `actions.ts`
deliberately does *not* import from `loop.ts`; `FACE_VEC` is duplicated there instead, because a cycle that only works
because of when each binding happens to be read is a trap for whoever moves a call next.

---

## Invariants

Things that will silently break the game if changed without understanding them.

**World generation is a pure seeded hash.** `rnd(x, d, planet)` decides every cell. Anything
new that generates content **must roll on its own seed offset** — caves on `planet + 77`,
pockets on `planet + 41`, seams on `(x + 61, d + 17)`. Consuming the ore roll shifts every
value at every depth on every planet, and the diff looks like three lines.

**`test/baseline/blocks-frozen.json` is frozen and is re-recorded only for a deliberate ore
rebalance** - once so far, in round seven, with the diff read first and written down. It is the
world as it stood before pockets existed, with its own id legend, and the test asserts the only
legal difference: a cell kept its id, or a known overwriter replaced it. Re-recording it is
exactly the mistake it exists to catch.

**`GRANITE_TO_SCORIA === HEAT_DEPTH`, both 70.** Four things land on that metre: the rock band
changes, the sky and fog warm, the hull starts draining, the vignette builds. A test asserts the
two constants stay equal because they drifted apart silently once.

**`ORES` is ordered deepest-first, and each entry's `chance` is strictly lower than the next.**
That is what makes adding a new deepest ore convert only the ore directly above it rather than
reshuffling every band. There is a test.

**`g.planet` and `g.world` are both zero and both vestigial.** They were the LEG and the
IDENTITY of a world on the chart, back when the game was a chain of planets. There is one
planet now; they survive because they seed the generator and because the frozen baseline is
recorded against them, and `setWorld(p)` still exists for the tests that walk the old
snapshots. **Nothing new should read either of them** - `regionAt(x, d)` is the question you
actually want, and `traitAt` / `paletteAt` / `worldTrait()` all go through it.

**Unrest is PER REGION, and `tier` is derived from `lit`.** `g.ground.unrest` is twelve
numbers; a single planet-wide figure would be a second fuel gauge - it rises, you cannot point
at where, and there is nothing to do about it. And the number of Anchors lit is
`g.ground.lit.length`, never a stored count: two numbers that must agree is one number with a
bug in it. `woke` IS stored, because the wake applies a one-off step to every region and the
flag is the record that the step has been paid.

**Anything that can reach `g.cargo` must have a `DEF` entry.** The manifest, the debrief and
the sale all look materials up by id. Cut stone does not have one and is flagged `spoil`
instead, which is why breaking a wall puts nothing in the hold. This shipped as a crash: the
game ran, the manifest opened, and then it did not, depending on whether you had cut through
an Anchor hall since you last looked. There is a test that sweeps the world for it.

**A collapse has two fences and both were found by a long play, not a unit test.** It never
takes a region holding an Anchor nobody has lit, and never more than `MAX_COLLAPSED` at once.
Without them the cascade has no bottom: each collapse removes ground you earned in, which
makes the Ballast harder to fill, which takes the next region.

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

**Every upgrade needs a display case, and station.ts throws at boot if it does not have one.**
`SLOTS` in station.ts is a hand-placed list and `UPGRADES` is a one-line addition in config.ts
a long way from it. The index used to wrap with `i % SLOTS.length`, which put four cases
*inside* four others where they were invisible and could not be tapped. The e2e asserts one
case per upgrade against `UPGRADES.length` rather than a literal, because the literal version
of that test said 10, failed for the wrong reason, and would have been "fixed" by editing the
number.

**Bedrock is unbreakable by ordnance.** (The planet core it used to share this note with is
gone - see the top of the file.) The rest still holds, and so do the four blocks that joined
it: the Anchor and the Vault core cannot be cut at all, and sealed stone and the Vault seal
cannot until the laser is found and the ninth Anchor is lit respectively. The old note read:
The core is a planet's climax and
has to be drilled by hand.

**A tremor must never take the run.** `planCollapse()` applies the collapse, re-runs
`findRoute()`, and reverts entirely if the ship can no longer reach the pad.

**The game boots into a screen, and the e2e crosses it rather than bypassing it.** `main.ts`
does all of its setup first and then shows the title (a save exists) or the intro (none), so
starting is hiding a div rather than loading anything. The shared `beforeEach` in the e2e
dismisses whichever appeared, and every spec that navigates itself calls `enterGame(page)`
after its own `goto`. **Do not add a bypass flag for this** - a flag would make the one path
every player takes the one path nothing exercises.

**The pause sheet doubles as the title's Settings screen**, changing only its heading and its
close button. It is already the settings screen - audio, restart, version, run log, what's
new, build stamp - and a second copy would be a second place for those to drift. `showTitle()`
puts the wording back, or the next in-game pause is still headed "Settings" with a BACK button.

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

**Dust motes are anchored in the WORLD and wrapped around the ship, never parented to it.**
The field this replaced did `dust.position.set(px, py, 0)` every frame with a slow spin, and
that single line is why it never read as dust: a cloud that travels with you cannot move past
you, so a hundred metres of diving leaves the same motes in the same places. Wrapping costs a
modulo and does more than any amount of extra geometry. They are also lit by `coreAir` on a
hard curve (`DUST_LIT_POW`), which is what makes the beam read as a volume rather than a
gradient - a flat-lit mote field is just noise over the picture. They sit BEHIND the terrain
(z -0.55 to -1.25) so a mote only ever shows down a tunnel that has actually been dug, and they
fade out at the surface on the same ramp as the haze, or specks hang in the daylight over the
pad.

**The shadow fan records where a ray MEETS a wall, and that value has to be continuous in
angle.** The fan is sampled by bearing and interpolated, so anything constant across a whole
cell makes occlusion-against-angle a staircase - one plateau per wall cell - and each plateau
draws as its own cone. A single point lamp then renders as several separate beams, which is
exactly what a playtest called: *"it looks like you are creating the shadows by sending out
multiple cone shape beams ... since the light should be coming from one location it shouldn't
be split into more than one beam."* The entry distance is `(wall - lamp) / cos(angle)`, smooth
in angle, and jumps only at a real silhouette corner. **The old far-corner rule existed because
rock used to sample this fan; it does not any more** (`coreReach` has no shadow term), so that
justification is dead and re-adopting it brings the cones back. There is a test that sweeps
adjacent rays across a flat wall and fails on a jump over a seventh of a cell - it reads 0.033
correct against 0.293 for the old rule.

**The haze is an additive quad through a HARD per-cell mask, so its value must vary across
that mask or it draws flat cards.** This is the single most expensive thing in the file: five
playtest rounds of *"there is a circle of light around the ship"*, four correct fixes to things
that were not the cause. `LM_AIR_AMBIENT` is the bounce's share of the light in air, and the
bounce is omnidirectional with a long reach and a gentle curve - at 0.62 every open cell in the
connected tunnel network landed on nearly the same number, and a near-constant value through a
hard stencil does not read as fog. It reads as flat orange cards, one per cell, with
cell-aligned edges and 45-degree corners where they meet. It showed *approaching* a branch and
not at one because level with the branch you are inside its card; four cells above you see it
edge-on beside the shaft's, as a trapezoid. It is 0.20; above about 0.28 the cards return,
below about 0.05 a branch the beam has passed becomes a hole again. **Anything that raises the
floor under the air - a new ambient term, a bigger bounce, a wider glow - has to be checked for
this, and checked by hiding the haze quad rather than by reasoning about the shader.** There is
a test on the property, and there was none on any haze constant for the whole five rounds.

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
npm run check      # THE GATE before any commit touching src/ or test/:
                   # typecheck, tests, build, size, e2e, in the order that fails fastest
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
