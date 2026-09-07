# Coreward — game notes

Decisions specific to this game, and what to do next in it. Technical setup,
constraints and the feel rules live in [CLAUDE.md](CLAUDE.md) — read that first.

---

## Read this before following the phone-game-studio skill

**This repo no longer matches that skill's defaults, and following them here
will waste your time.**

The skill describes the stack every *new* game should start on: five files at
the repo root, no build step, an importmap, and a hand-written `sw.js` whose
`CACHE` constant you bump on every deploy. That was Coreward until
2026-09-06, and it is still the right way to start a new game.

Coreward outgrew it. What is true here now:

| The skill says | This repo |
|---|---|
| Five files at the root, no build | Vite build, 16 modules under `src/` |
| Bump `CACHE` in `sw.js` each deploy | **No hand-written `sw.js`.** Workbox generates it; there is nothing to bump |
| "Change did nothing" → check cache version | → check the **build stamp** in the pause menu |
| Push files, done | Push to `main`; CI gates on typecheck, 33 golden tests, 7 smoke tests and a bundle-size guard, then deploys |
| `node --check app.js` before pushing | `npm run typecheck && npm test && npm run e2e` |

If you change anything here, run the gate locally first. CI will catch you
anyway, but it is slower.

---

## What this game is

Dig toward a planet's core, sell ore at the surface pad, buy upgrades, break the
core and the planet explodes, launch to a harder planet. Fuel and heat are the
two pressures pushing you back up.

## Decisions worth not re-litigating

- **No return button.** An escape hatch with an invisible cost read as a free
  teleport. Running dry gets you towed home for a cut of the haul instead, Tow
  Insurance reduces the cut, and Autopilot is a separate expensive unlock. This
  was the player's redesign and it is better than the original.
- **Cargo is weight-based, not slot-based.** Counting units meant dirt and
  rubies took the same space, so choosing between them was not a real choice.
- **The autopilot flies a spline over a shortest path**, not the breadcrumb
  trail it dug. Retracing was slower *and* read as a fast-forward.
- **The score is a written 32-beat theme**, not randomised pentatonic notes.
  Randomness is musically valid and still sounds like UI beeps, because without
  repetition there is no phrase to latch onto.

Full reasoning for all four is in `../gamedev-notes/PLAYTESTS.md`.

## Content changes and the golden tests

Adding an ore, retuning a price or changing planet scaling **will fail the
golden tests**. That is the system working, not a problem. The workflow:

1. Make the change
2. `npm test` fails and prints the first differing line
3. Read the diff and confirm it is what you intended
4. Delete the affected file in `test/baseline/` and re-run to re-record
5. Commit the new baseline alongside the change

Never re-record without reading the diff. The whole value is in step 3.

## Stage 1 of the overhaul (2026-09-06)

**Heat soak.** Depth alone made heat a *place* rather than a clock — at a safe
depth you could sit forever, so the only question was "how deep", never "how
long". `g.soak` now builds while below `HEAT_DEPTH` and bleeds off above it
(faster than it builds, so a dip in and out stays cheap), and multiplies heat
damage up to 2.5x. Lingering is the gamble now.

**Cooling can no longer be bought away.** Shield was 0.1/level capped at 0.9 —
near immunity. Now 0.09/level capped at **0.72**, so a maxed rig buys time
rather than safety. Combined with soak, a fully upgraded ship at the core still
loses hull.

**Both counters repriced against the depth where their threat starts**, which is
the lesson from the original playtest complaint ("I can afford upgrades pretty
early on for fuel and cooling so neither is a risk"). Fuel tank 200 -> 480,
cooling 300 -> 1000 with a shallower multiplier so the ladder stays climbable.

Survival at the core (110 m), hull 100:

| cooling | cold | fully soaked |
|---|---|---|
| none | 30 s | 12 s |
| L3 (27%) | 41 s | 16 s |
| L5 (45%) | 54 s | 22 s |
| L8 (72%) | 106 s | 42 s |

**Making the line visible.** First playtest of the soak said the mechanic was
good but "it doesn't seem very obvious that there is a distinct line". It was
not: the rock band changed at 60 m while heat started at 70 m, so nothing on
screen marked the real boundary.

Now four signals land on the same metre:

- **Scoria**, a new smouldering rock, starts at exactly `HEAT_DEPTH`. There is a
  test asserting those two numbers stay equal - if they drift apart again the
  world stops explaining itself.
- **The world turns ember.** Sky, fog, ambient light and drifting dust all warm
  together over ~26 m, which is shorter than the 40 s soak ramp on purpose: the
  world should say "you are somewhere dangerous" before the hull says "and it is
  costing you".
- Hull starts draining, and the vignette builds with it.

Measured crossing: sky goes rgb(25,48,66) at 66 m to rgb(80,22,14) at 86 m,
hull 100% to 95%.

Also fixed while in there: basalt started at 130 m while planet 0's core sits at
110, so the deepest rock in the game was unreachable on the first planet. Bands
are now dirt 10 / stone 45 / granite 70 / scoria 120 / basalt.

**This balance is a first pass and wants playtest feedback**, not more theory.
The intended shape is: fuel first to reach depth, then cooling to survive it.

## Stage 2: instanced terrain (2026-09-06)

Every block used to be its own Group of Meshes, and because the per-block shade
jitter is continuous almost every one got its own material and therefore its own
draw call. Measured on the live game: **80 at the surface, 207 underground**,
against a mobile guideline of about 50.

Terrain is now drawn with `InstancedMesh`, pooled **by block id**. Per-instance
matrices carry position and rotation jitter, per-instance colours carry the
shade. Pools are keyed by id rather than by glow because emissive cannot vary
per instance and each id has exactly one correct emissive - that is what keeps
scoria smouldering.

**Result: 207 -> 35 underground, 80 -> 46 at the surface.** Both inside the
guideline, and underground is now cheaper than the surface.

The block being drilled is the one exception: it stays a real Group built by
`makeBlock()`, because the dig animation scales it, jitters it and parents crack
decals to it. There is only ever one at a time, so the entire feel code is
untouched and essentially all of the win is kept. `beginDig()` promotes a cell
out of the instanced pools when drilling starts.

A trap worth remembering: an ore cell is a dull host block with bright crystals
in it, so the body and the shards need **different** emissive. Giving the host
the ore's glow lit the whole cube like a lamp and the amethyst came out as flat
purple squares. Caught by looking at a screenshot, not by a test.

The smoke test now enforces a draw-call budget of 70, counted by wrapping the GL
context. Mutation-tested: reverting to per-block meshes fails it and nothing
else.

## A bigger-feeling world (2026-09-06)

Playtest asked for the world to feel bigger: smaller ship, smaller blocks, more
on screen. Both levers pull the same way and Stage 2 is what made them
affordable.

- **World width 9 -> 13 columns.** Only about 8 fit on a portrait screen, so the
  rest is lateral room: which way to dig at a given depth is now a choice.
- **Framed rows 13 -> 18.** This is what actually shrinks everything on screen.
- **Streaming window 21 -> 29 rows**, so terrain does not pop in at the edges.
  377 cells streamed, up from 189.
- **Ship rebuilt smaller** (`rig.scale` 0.82) with a silhouette that survives it:
  tapered nose, swept fins instead of round pods, a dark ring separating the
  canopy from the hull. At thirty-odd pixels, shape reads and surface detail
  does not.

**Widening is purely additive.** `rnd()` is seeded on (x, d, planet), so columns
0-8 generate exactly as before - verified by re-checking all 10,827 cells of the
old baseline against the new code, zero mismatches. Existing saves keep their
world and their tunnels.

Draw calls went 35 -> 56 against the budget of 70, for twice the cells. The
likely driver is ore haloes, which are still one sprite each and there are now
more of them visible. That lever has since been pulled - see the terrain entry below.

A test fixture lesson: the pathfinding fixtures hardcoded x=4, the old
`START_X`, so widening the world broke a *contract* test rather than just the
canary. They are now written relative to `START_X`, and there is an assertion
that the pad stays centred. Fixtures that hardcode a derived constant will break
on the day it changes.

## Making it read as rock, not blocks (2026-09-06)

Playtest: "make it feel like we are digging through dirt and rock more
realistically rather than blocks". Three things were causing the blocky read,
and fixing all three cost nothing in draw calls because they are per-instance
data and shared geometry.

- **The cube.** Every cell was an identical 0.97 box. Now it is a subdivided box
  with every vertex displaced by a deterministic hash, so faces are uneven and
  corners are chipped. One shared geometry, so instancing is untouched.
- **The grid alignment.** Jitter was +/-0.045 rad, far too small to break the
  read. Chunks now take **quarter-turns on all three axes** - 64 orientations of
  the same shape, which stops every cell looking identical - plus a small extra
  jitter. Quarter-turns rather than free rotation so a roughly cubic chunk still
  packs against its neighbours.
- **The seams.** 0.97 left 0.03 of gap showing exactly where the grid was.
  Chunks are now 1.0 and scale to 1.03-1.12, so neighbours interlock. Overlapping
  solids do not z-fight; coplanar faces do, and this removes them.

Two more free wins. **Each block type gets its own chunk shape** - dirt is lumpy
and rounded at 3 subdivisions, basalt is angular and chipped - which costs
nothing because every type already had its own instanced pool. And the tonal
spread between neighbouring chunks widened from 0.84-1.14 to 0.76-1.22, which is
what turns a flat grey surface into mottled stone.

**Ore haloes are now one draw call instead of one each.** They were Sprites,
which was fine at 189 streamed cells and became the largest single cost at 377.
The trick: this camera never rotates, it only pans, so a quad in the XY plane
always faces it and Sprite billboarding is unnecessary. Instanced quads with
per-instance matrix (position and pulse scale) and colour.

Draw calls through the whole sequence: **207 before instancing, 35 after, 56
after widening the world, 66 with per-type chunks, 37 once the haloes were
consolidated.** Budget is 70, so there is real headroom for Stage 3 again.

## Sealing the seams (2026-09-07)

Playtest: "I can see light from the background in between them." Two causes, one
of them mine from the day before.

**The chunk displacement was pulling faces inward.** It displaced vertices in
both directions, so a face could sit *inside* the 1.0 cell by up to 0.125 for
basalt, while neighbours only overlapped by 0.03. Two neighbours both pulled in
opened a slit, and terrain is a single layer of chunks, so the sky gradient
showed straight through. It was worse in harder rock because those have a larger
bump.

Fixed by displacing **outward only** on whichever axes a vertex is already
extreme on. Every chunk now provably contains the full unit cell - verified by
checking that no vertex's largest coordinate falls below 0.5, across all five
rock types - so chunks tile with no gap at any bump size and any instance scale
above 1.0 is genuine overlap.

**A backdrop behind the terrain**, because chunks alone cannot help where a
block is genuinely missing: a dug side tunnel or the edge of the streamed window
still exposed sky, which made underground read as cut-outs floating in daylight.
It is one static plane, 60 wide against a 13-column world so it never needs to
follow the camera, with its top edge at y=0.5 - exactly the top of the terrain
layer, so it hides behind the first row and never covers sky, stars or the pad.
Unlit and dark, so fog tints it to whatever the depth colour is and it goes
ember below the heat line with everything else. One draw call, set once.

## Stage 3: atmosphere, the free half (2026-09-07)

Both changes ride on data already being written, so the draw-call count did not
move at all.

**Fake ambient occlusion.** Each chunk counts its open orthogonal neighbours and
darkens if it is buried: fully enclosed rock renders at 0.72, rock at a tunnel
edge at 1.0. This is what makes a tunnel read as *carved into* something rather
than as a gap between floating blocks. Deliberately gentle - a realistic falloff
would black out a fresh planet entirely, since nothing is dug yet. The world
edge counts as solid, or there would be a bright rim down both sides of the map.

**Vertex colours baked into the chunk geometry**, one of the techniques CRAFT
listed as untried. Upward-facing vertices are brightened and undersides
darkened, so every chunk reads as a lump with a lit top and a shaded belly
rather than a cluster of flat facets. It lives in the one shared geometry and
multiplies with the per-instance colour.

One trap: enabling `vertexColors` on a material whose geometry has no colour
attribute renders it black. Only the chunk geometries carry one - crystal shards
are octahedra and haloes are quads - so `mat()` takes a flag and the pools set
it per geometry.

## Stage 3 finished (2026-09-07)

**Shadows were considered and rejected, with a reason.** The lamp sits at z=+1.7,
the camera at z=+22, the terrain in a single layer at z=0. The light is on the
*same side* as the camera, so every shadow a chunk casts falls directly behind
it and is hidden by the chunk itself. Shadow mapping would have cost a whole
extra render pass to produce almost nothing visible. Do not reach for it later
without changing that geometry first.

What was done instead:

- **Ore bleeds light into the rock it sits in.** The four-neighbour scan that
  already computes AO now also collects the colour of any adjacent bright ore
  and tints the rock toward it. Only ores with glow >= 0.2 - dull copper and
  iron would just muddy the stone. Free, and it stops a vein looking like a
  sticker on the rock face.
- **The vignette closes in with depth.** Clear area shrinks 42% -> 22% and the
  edge darkens as you descend, so deep feels enclosed rather than merely dark.
  CSS only, updated on the same slow tick as the sky.
- **Denser debris.** The particle ring buffer is one Points draw whatever the
  count, so more debris per strike is free: 30 -> 52 on ore, 13 -> 24 on rock,
  drifting haze 140 -> 260 motes.

Draw-call budget test still passes, so the whole of Stage 3 came in at no
rendering cost.

## What to do next

Nothing here is committed to; they are the live threads.

- **Fix `approach()` to be frame-rate independent.** It uses
  `min(1, dt * rate)`, so camera lag differs with frame rate and a stuttering
  frame makes the camera snap rather than lag. Correct form is
  `1 - exp(-rate * dt)`. There is a test pinning current behaviour, so changing
  it is a deliberate act. **Changes how the camera feels — phone check.**
- **Re-tune Stage 1 against actual play.** The soak rates, the 0.72 shield cap
  and the new prices are a first pass derived from modelling, not from playing.
  The open questions: does the descent past 70 m feel like a decision, is
  cooling worth saving for, and does the tow fire often enough to create tension
  without becoming routine?
- **Content past the mid-game.** Nine ores and six planet names cycle; nobody
  has played deep enough to know whether the late game holds up.
- **Stage 4: variety.** Events, consumables, run modifiers - the recorded reason
  players quit this genre, and what would give the heat zone more than one reason
  to exist.
- **Stage 4: variety.** Events, consumables, run modifiers - the recorded reason
  players quit this genre is predictability, and it is also what gives the heat
  zone more than one reason to exist.

## How changes get shipped

**Push straight to `main`.** CI is the gate: typecheck, golden tests, then smoke
tests that boot the real built artifact and check the frame loop advances,
digging and selling work, every panel opens and the stamp is populated. A build
that fails any of it cannot deploy - the previous version stays up.

Then check it on the phone. Expect the first open to show the old build; close
it fully and open again. The stamp in the pause menu is the source of truth.

Do **not** poll the live site to confirm the deploy landed. CI's smoke tests
already ran against that exact artifact, so the confirmation is re-verifying
what is already verified, and the polling loop is the most expensive part of
the whole cycle. Push, say it is pushed, move on.

If something plays badly: `git revert <sha>` and push. CI redeploys the previous
state in about two minutes.

This is deliberately not gated on a pre-merge preview. It costs less, it works
from anywhere rather than only on the home wifi, and the safety net exists
precisely so that shipping first is safe. The residual risk is a change that
passes CI and still feels wrong, which is what the phone check is for.

To preview a branch on the phone anyway - useful for something risky or purely
visual - run `npm run preview -- --host 0.0.0.0` and open the PC's LAN address.
No service worker over plain http, so it will not test offline behaviour, but it
is fine for checking feel. Requires being on the same wifi.
