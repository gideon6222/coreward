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

The smoke test now enforces a draw-call budget, counted by wrapping the GL
context. Mutation-tested: reverting to per-block meshes fails it and nothing
else. (It was 70 at the time; see the budgets section for why it is 150 now and
what a draw call actually costs.)

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

## Rock as one surface, not stacked boxes (2026-09-07)

Playtest: "some of the sides on the cubes dont match up so you can still see
gaps and makes them look hollow... make cubes that touch look more like a solid
piece instead of clipping into each other."

**The root cause was per-cell independence.** Each cell had its own baked
displacement, its own quarter-turn rotation and its own 1.03-1.12 scale, so two
neighbours disagreed about where their shared boundary was. Their front faces
landed at different depths, the nearer one's side wall became visible, and every
cell read as a separate hollow box. Overlap hid the sky but could never make
them one surface - that was the wrong tool for the job.

**The fix is world-position displacement in the vertex shader**, which is the
custom-shader technique CRAFT listed as untried. Cells are plain unit cubes at
integer positions with no rotation and no scale, and each vertex is displaced by
a hash of its WORLD position. Two cells sharing a boundary vertex evaluate the
same world coordinate, so they compute the same displacement and the surface is
continuous **by construction** - there is no gap to hide and no overlap needed.

Three things fall out of it:

- **Never rotate or scale a cell instance again.** The agreement between
  neighbours depends on vertices landing on exactly the same world coordinates.
  Any per-instance rotation or scale breaks it and the seams come straight back.
- The vertex key is `floor(world * 2 + 0.5)`; vertices sit on a 0.5 grid, so that
  is a stable integer both neighbours agree on.
- `flatShading` derives normals from screen-space derivatives of the final
  position, so lighting follows the displaced surface for free. No normal
  recalculation.

Variety improved as a side effect: it used to be 64 rotations of one shape, and
it is now a noise field that never repeats.

**Dust was rendering in front of the rock.** Motes sat at z = 0..2 while the rock
face is at about +0.5, so they read as specks on the lens floating over solid
stone. They now sit at z = -0.7..-1.3, between the rock and the backdrop, so they
only show through tunnels the player has actually dug.

Still free: the draw-call budget test passes unchanged. Same shared cube, same
instancing, the displacement is per-vertex on the GPU.

## Crystal glow that spreads instead of tinting cells (2026-09-07)

Playtest: "it looks like the glow of the crystals affect the full cubes next to
them... make it so the glow isnt isolated to the full cube, and spreads and
fades out more naturally."

**The per-cell colour bleed was the wrong mechanism** and this is the second time
that instinct has caused a problem. Instance colour is uniform across an entire
cell, so tinting a neighbour toward its ore produced hard square patches of
purple and gold rather than a glow. Anything that needs to fade across a
boundary cannot be per-instance data.

Removed entirely. The glow is now only the additive haloes, whose radial falloff
has no idea where cell boundaries are.

**Two quads per vein instead of one.** A single gradient falls off too fast to
reach the neighbouring rock, which is exactly what tempted me into the per-cell
tint originally. A tight bright core plus a wide dim bloom at 2.9x the size
gives a much longer, softer tail. Additive blending just sums, so the second
quad is nearly free, and since opacity is a shared material property the bloom
is dimmed by scaling its instance **colour** to 0.30 instead.

Still one draw call: they are extra instances in the same InstancedMesh, and the
draw-call budget test confirms it.

## Stage 4: pockets and caves (2026-09-07)

The complaint this answers is the one from the heat-soak playtest: "heat is
currently the only thing that punishes dwell time, so lingering-is-the-gamble
has exactly one tooth." Between 0 m and 70 m the ground had no opinion about
you at all. Three additions, all of them terrain rather than systems, because
terrain is the cheapest variety per byte in a game whose world is a hash.

**Gas pockets** (from 34 m, ~1% of cells). No cargo, no credits: 26 hull and a
+0.3 soak spike. The soak is the part that actually bites, because soak
multiplies every point of heat damage for the rest of the trip, so a gas hit at
40 m is a bill you pay at 90 m. Deliberately *softer* than every rock band it
can appear in (1.8 against stone's 2.4, granite's 5, scoria's 7, basalt's 9) -
it has to give way early, or you would feel it coming and it would just be a
tax rather than a surprise. There is a test asserting that ordering, because
the first draft shipped at 2.5, which is harder than stone, and the tell was
backwards without anyone noticing.

**Geodes** (from 52 m, ~0.7%). 6,200 credits at 4 kg, which is the best value
density in the game and roughly half a hold in one block. This is the reason
the world was widened to 13 columns: it is the first thing that pays for going
sideways rather than straight down. It works without a scanner upgrade because
ore haloes are additive sprites and are not lamp-lit, so a geode advertises
itself across a dark screen; Scanner Array extends how much of the surroundings
you can read, which is now a real upgrade rather than a nicety.

**Caves** (from 26 m, 3% rising to a 9% cap). 2x2 blobs on a coarse grid, so
they read as open ground rather than confetti. Free travel, nothing to mine,
and soak keeps building while you cross one. `findRoute` treats them as
passable because it tests `blockAt`, so a cave that happens to line up with
your tunnel becomes an autopilot shortcut - unplanned, and the best thing about
them.

### The seed discipline, and the test that enforces it

Caves roll on `planet + 77` against a coarse `(x/2, d/2)` grid; pockets roll on
`planet + 41` against `(x + 313, d + 977)`. Neither touches `rnd(x, d, planet)`,
which is the ore stream. That is not a stylistic choice: if a new feature
consumed the same roll, every ore at every depth on every planet would shift,
which silently rebalances the whole game and looks in a diff like nothing at
all.

`test/baseline/blocks-preadditive.json` is the world frozen at the moment
before pockets existed, with its own id legend so it survives future alphabet
changes. The test asserts the only legal difference: a cell either kept its id,
or a cave/gas/geode overwrote it. It also asserts the change covers more than
200 cells and less than 12% of the world, so it cannot pass by generating
nothing. **Do not re-record that file.** Re-recording it is exactly the mistake
it exists to catch.

### Reading the hazard on a phone screen

Gas started at 0x9bd94a with the standard ore treatment: dark host, bright
crystal shards. On screen that is an emerald - same hue family, and emerald
starts at 78 m so the two share depths. Confusing the punishment with the
payout is the worst mistake this game's palette could make.

Fixed by changing the *form*, not just the hue. A gas pocket is the only cell
in the game whose **body** is emissive rather than its crystals, so it reads as
a lit slab where every ore reads as dark rock with sparks in it. Free: emissive
is a per-pool material property, and pools are already keyed by block id.

First pass set that emissive to 0.26 and the pockets out-shone the geodes,
which tells the player to look at the thing they must not touch. Dropped to
0.15. The payout has to be the brightest object in the frame; the hazard only
has to be unmistakable.

Surface bump was also split: gas 0.10 (a bubble, so the smoothest thing in the
ground) against geode 0.34 (a cracked shell, the roughest).

### Tow messages now name their cause

`tow()` hardcoded "your hull buckled in the heat", which became a lie the
moment something other than heat could empty the hull. `R.hullCause` records
which one it was. The same pass replaced a literal `70` in the frame loop with
`HEAT_DEPTH`; it had already drifted apart from the rock band once.

## Stage 4: supplies (2026-09-07)

Upgrades raise the ceiling on every future run. Supplies buy one more minute on
*this* one. Before this the shop only sold the first kind, so a run had exactly
one shape: dig until a bar runs out, then leave. Now there is a second question
at the pad - bank toward the ladder, or spend so that tonight's descent reaches
the core.

Three of them, each answering a pressure that already existed:

- **Coolant Flush** (1,500, carry 2) - soak back to zero. The dearest, because
  soak is the only pressure with no permanent answer: the cooling rig caps at a
  72% shield deliberately, so past a certain depth the clock always wins. A
  flush is the one way to restart that clock.
- **Hull Patch** (850, carry 3) - +45 hull, less than half of max on purpose.
  A patch that nearly full-heals removes the reason to surface.
- **Fuel Cell** (600, carry 3) - +55 fuel against a 90 base tank. A top-up, not
  a spare tank.

Stack limits are small so stocking up cannot replace deciding.

### Spending one has to be safe to mis-tap

The kit sits bottom-**left**, mirroring the d-pad: movement is the right thumb,
supplies are the left, so a spend never fights with steering. Same 60 px module
as a d-pad key.

`useSupply` refuses rather than spending when the item would do nothing - a
full tank, an intact hull, no soak - and says why. A consumable silently burnt
for no effect is the kind of thing a player never forgives, and these buttons
live next to the controls on a phone. Three states: hidden when you own none
(an empty slot is clutter, and the shop is where you learn these exist), dim
when owned but useless right now, lit when it would help. In practice that
means the button that can save you is the one that is bright, which turned out
to be better feedback than the count.

Nothing is usable at the pad, because the pad already refuels, repairs and
cools for free. The buttons hide up there for the same reason.

### Labels, not icons

First pass used ❄ ✚ ⛽. The first two render monochrome and the fuel pump
renders as a colour emoji, so the row looked broken rather than designed. Four
letters at 60 px - COOL / HULL / FUEL - are unambiguous, need no learning, and
match the shop rows. Border colour still carries the category.

### What the tests hold

`test/baseline/supplies.json` freezes the table. Beyond that the assertions are
about the two kinds of purchase staying on different axes: no supply may fully
solve what it patches, coolant must stay the dearest and dearer than the first
Cooling Rig level (or the rig is pointless), and a full kit must cost more than
three levels of cooling (or stocking up stops competing with the ladder).

The smoke test walks the whole chain against the real build - buy at the pad,
descend, mis-tap a supply that has nothing to do and keep it, then spend one
that does and watch the bar move. Every step of that lives in a different
module, so nothing else covers the seam.

One trap worth remembering: seeding credits through `localStorage` and
reloading does not work, because the game saves on `visibilitychange`, which
fires during the reload and writes the live state straight back over the seed.
Freeze `Storage.prototype.setItem` for that key on the outgoing page first.
This has now cost time twice.

## Stage 4: planet traits (2026-09-07)

Planets differed by three numbers that all climbed together - deeper core,
harder rock, better prices. That is a difficulty slider, not variety: every
planet was the last one with the dial turned up, so the ladder gave you nothing
new to learn. Traits make each one a different question.

- **Stable** - the baseline, and always Verdax. A trait on the first planet
  would just read as "the game is like this" to someone who has never seen one
  bite.
- **Volatile** - gas 2.2x as common and 35% more damage. The ground is hostile.
- **Hollow** - caves 2.4x. Roughly 12-14% of the crust is open air against
  Verdax's 4.6%, so it is fast to cross and there is 8 points less to mine.
- **Crystalline** - geodes 3x. Digging sideways finally pays properly.
- **Searing** - soak builds 60% faster. Depth costs the same; dwelling costs
  much more.

`traitOf(p)` is a hash of the planet index, so a planet is the same every time
you reach it and the golden tests stay reproducible. Which trait lands where is
therefore silent to change, which is why `test/baseline/traits.json` snapshots
the assignment for the first 24 planets.

### The rule that keeps traits safe

**Every trait multiplies something layered over generation - pocket and cave
frequency, hazard damage, soak rate - and never `rnd(x, d, planet)`.** A trait
that shifted the ore stream would rebalance every depth on every planet at
once, and would look in a diff like a one-line change.

This is enforced rather than remembered: the additive-only test runs with
traits applied, so it fails the moment a trait reaches into the ore roll. That
also ruled out the trait I wanted most, a planet where heat starts fifteen
metres higher. `HEAT_DEPTH` is welded to the scoria band, the sky, the fog and
the ambient tint - the whole "four things land on the same metre" fix from the
first heat playtest - and making the band planet-aware changes block ids.
Searing gets at the same idea from the soak side for none of that cost.

Rates are capped after the multiply (`CAVE_CHANCE_CAP` 0.17, pockets 0.06),
because cave chance already climbs with depth and 2.4x on top of it dissolves
the deep ground into open air. There is a test asserting a planet never drops
below 80% minable.

### Where the player meets it

The name chip, because it is the only always-visible place a planet is named
and a modifier you must open a menu to remember is one you play without. Stable
is left unlabelled. The pause menu carries the full sentence, and the launch
screen after a core break sells the next planet with it, which is the moment
the information is actually worth reading.

## Heat as its own channel (2026-09-07)

Playtest, after Stage 4: *"I think hull damage and heat should be separated
slightly... right now it is kind of hard to tell that the heat is what damages
the hull, especially now that there are other things that can cause damage."*

He is describing a bug in the display rather than a preference. There was one
red vignette driven by `max(hull danger, soak)`, so heat and a failing hull lit
the same red at the same edges. That was survivable while heat was the only
thing that emptied the hull. Gas pockets made it wrong: a pocket taking 26 hull
lit the identical warning, so the screen said "heat" for something that was not
heat.

Three signals now, none shared with any other kind of damage:

**An ember stripe inside the hull bar**, right-anchored, width = soak. The
gauge lives on the bar it is eating, so the causation is the layout rather than
something the player has to be told. First attempt made it a full-height fill
and at 70% soak it covered the hull level entirely - the gauge was hiding the
thing it explains. Seven pixels of nineteen along the bottom keeps both legible.

**The hull bar's own label**, which reads `HULL` normally and `HULL -3.4/s`
while heat is flowing. This turned out to be the load-bearing one. A flush
takes it from `-1.7/s` to `-0.7/s` in front of you, which is the clearest
possible statement of what fifteen hundred credits just bought - no bar
communicates that.

**Ember edges instead of red.** `#heat` is now orange and keyed only to heat,
holding a floor the moment you cross the line (damage starts there whether or
not you have soaked yet) and fading to a residue above it. A new red `#alarm`
carries low hull, whatever emptied it. Two colours, two meanings.

Plus a one-shot toast at the metre it begins, with two metres of hysteresis so
hovering on the line cannot spam it.

An accident worth keeping: a gas pocket's +0.3 soak spike was previously
invisible, and now shows as a small ember stub appearing above the heat line
with no rate label. That reads as "you are carrying heat now, and it will cost
you when you go deeper", which is exactly what it does.

### A test-writing trap this exposed twice

`useSupply` changes game state synchronously; the bars are only repainted by
the next `updateHUD`. Sampling a bar width once, immediately after a spend, can
land in that gap. It did - and only under the load of the full suite, passing
every time in isolation. Both the supply test and the new heat test now poll.
The rule at the top of `e2e/smoke.spec.ts` about waiting on state rather than
wall-clock time extends to this: wait for the state you asserted to be
*rendered*, not just set.

## Smoothing is frame-rate independent now (2026-09-07)

`approach()` used `min(1, dt * rate)`, the lerp everyone writes. One 100 ms
step covered 60% of the distance where ten 10 ms steps covered 46%, so camera
lag genuinely differed with frame rate - and because the frame loop caps its
delta at 50 ms, a stuttering frame made the camera **snap** rather than merely
lag behind. Four more smoothings in the loop had the same bug written inline:
the zoom-boost decay, both banking lerps and the ship's turn.

All of them now go through `approach()`, which is `1 - exp(-rate * dt)`.

The reason this could be changed without a phone check, which the old note said
it needed: every tuned rate goes through `asExpRate(n)`, which returns the
exponential rate covering exactly the fraction `n` covered in one 60 fps frame.
At 60 fps the output is bit-identical to before; only the off-60 behaviour
moves, and it moves toward correct. The baseline records those fractions -
0.1, 0.116667, 0.183333, 0.2, 0.066667 - rather than the raw constants, so the
equivalence is legible in the file rather than argued in a comment.

Two side benefits. `asExpRate(6)` keeps the number that was actually tuned by
eye visible in the source instead of replacing it with 6.3216. And the `k + 1`
idiom at the camera call site became `CAM_FOLLOW_PLAY_Y`, which names a real
choice: the ship travels down far more than sideways, so the axis it moves
along should lag less.

## Minerals: the depth ladder and the upgrade ladder now need each other (2026-09-07)

The single biggest structural weakness, and the one the research pass named:
**Coreward had one resource.** Nine ores, five rocks, geodes - and every one of
them converted to the same number. Where you dug never mattered, only how long.
Compare SteamWorld Dig, whose whole spine is "find a wall you cannot break,
upgrade, get past it", or Dome Keeper, where the author's verdict is that three
resources are what create decisions and one creates none.

Past level three, an upgrade now also costs the mineral it is built out of:

    Cargo Hold    copper     4 m
    Drill Bit     iron      11 m
    Tow Insurance iron      11 m
    Thrusters     silver    22 m
    Fuel Tank     gold      36 m
    Scanner Array amethyst  56 m
    Cooling Rig   emerald   78 m
    Autopilot     ruby     105 m

**The Cooling Rig is the one that carries the design.** Emerald starts at 78 m,
which is eight metres INSIDE the heat zone. You have to survive a heat run
without the protection in order to buy the protection. That is the wall this
game did not have: everything below 70 m was previously reachable on day one
given enough patience, because patience was the only currency. There is a test
asserting that emerald stays below `HEAT_DEPTH` and that no upgrade except
cooling and autopilot forces that trip.

### Why this creates a choice rather than a chore

Because cargo is weight-limited. Six emerald is 51 kg of a 60 kg starting hold,
and every kilo of it is a kilo not spent on something worth more per kilo. The
question at depth stops being "is this worth more than what I am carrying" and
becomes "am I here for money or for the rig". Weight went from a soft cap to
the thing the whole economy turns on.

Selling banks the minerals **and** pays the credits. That is not a double
payment - the upgrade wants minerals *on top of* a credit price - and it avoids
a keep/sell UI, which on a phone would be four extra taps per run.

### Numbers

Requirement is `2 + (level - 4) * 2`, so 2/4/6/8/10/12 across levels 4-9: 42 to
max a nine-level tree. Against spawn chances that is roughly four to nine
hundred-cell runs of the relevant band per tree, which is a project rather than
a grind. Levels 1-3 stay pure credits, so the opening hour is untouched and a
new player never meets this system before they understand the old one.

### Two things that had to be right

**Old saves.** A save from before this existed has no stock and has already
bought levels that would now have cost materials. `grandfatherStock()` grants
exactly what those levels would have needed and not one unit more, so a
mid-game save is not stranded behind a wall it already walked through, and the
next level is still earned. Tested both ways.

**Telling the player where to go.** "6 Emerald" is useless without "from 78 m".
The shop row turns amber and appends the depth the moment you cannot afford it,
and the manifest grew a vault listing everything banked in depth order. That
turns the manifest from a receipt into a plan, which is the point.

### Deliberately not done

Geodes could act as a wildcard, substituting for any required mineral at some
rate - it would give the windfall a second identity and soften the worst case
of the gate. Left out because the gate needs to be *felt* before it is
softened, and because it wants a second button on every shop row. Revisit after
a playtest.

## Tremors: the deep game's second tooth (2026-09-07)

The open thread said it plainly: below 70 m, soak was the only pressure, and
soak is attrition. Attrition charges you for time and nothing else, so the deep
game had one question and the answer was always "leave a bit sooner". The
research pass on Dome Keeper named the shape that is missing - its tension is a
**recurring event on a rhythm**, not a drain, and every mining session becomes
a bet against the next one.

Past 85 m the ground periodically shifts and fills in part of the tunnel you
dug. It never touches where you are standing. It takes the way **out**.

That turns depth from a number you push into a commitment. The further down you
are when one lands, the worse your route home gets and the more of your
remaining fuel goes on re-digging it - and because the clock resets the moment
you leave the band, climbing out is a real reprieve rather than a pause.

85 m puts the band below the heat line, so the world now reads in three:
quiet, hot, unstable. It also leaves a 25 m window on planet 0, whose core sits
at 110 - the CRAFT lesson about content bands that are unreachable on the
planet everyone starts on, applied before rather than after.

### Rubble, and why a collapse cannot be farmed

A collapsed cell regenerates as **rubble**, not as whatever was there before.
Refilling with the original block would make a tremor an ore respawn, and the
richest vein on the planet could be farmed forever from one spot. Rubble is
cheap to clear (0.55x the local band) and nearly worthless, so digging out
costs time and fuel and pays almost nothing.

It is coloured as a half-blend of the band it sits in. A single neutral grey
looked like sandstone boulders dropped into a lava tube; blended it reads as
the local rock, shattered. That needed `mixHex` in util.ts rather than the
existing `lerpHex` in materials.ts, because materials.ts imports three.js and
world generation must not - the bundle guard's entire premise is that the pure
layer stays pure.

`g.rubble` is runtime state, not generation, so none of this touches the ore
stream and the additive-only test stayed green throughout.

### The guarantee, and where it lives

**A tremor may cost you time, fuel and patience. It must never take the run.**
After choosing cells, the collapse is applied and `findRoute()` is re-run; if
the ship can no longer reach the pad, the whole thing is reverted and the
tremor is spent as noise.

That is in `planCollapse()` in world.ts rather than in actions.ts, because the
guarantee is the entire difference between a mechanic and a rage-quit and it
has to be testable without a renderer. It is now asserted across forty tunnel
shapes and two hundred and forty collapses.

Writing those tests caught two things worth recording. The first fixture dug
past `coreDepth`, where `findRoute` refuses to path - so every collapse
reverted and three tests passed while checking nothing. The fixture now asserts
its own depth, and the guarantee test counts cells actually collapsed so it
cannot pass by doing nothing. **A safety property tested against a case that
cannot trigger it is worse than no test, because it reads as covered.**

### The rhythm lives in feel.ts as a reducer

`tremorTick()` is pure: clock in, clock out, plus `warned` / `fired` / `shake`.
The frame loop just applies the result.

This was not tidiness. The Browser pane stops `requestAnimationFrame` entirely
when it is hidden, so there is no way to watch a thirty-four-second timer run -
the only visual confirmation possible was seeding rubble into a save and
looking at it. Extracting the clock made the rhythm checkable in milliseconds,
and it immediately found a real bug: a frame long enough to step over the whole
warning window armed the rumble and fired on the same tick, then armed it again
on the next - two warnings for one tremor. Unreachable at 60 fps, but the loop
caps its delta at 50 ms precisely because frames are not always 60 fps.

**When a mechanic is a clock, the clock is the part to extract.**

## Adaptive music: the score learns what depth means (2026-09-07)

The score already moved with depth - the lowpass closed, the wind and drone
rose, the lead pulled back. But it only knew one number. Everything the game
had grown since (a heat line, an unstable band, being in trouble) was silent.

Three vertical layers now, mixed by state rather than started and stopped. The
research constraint for vertical remixing is that every layer must share one
tempo, key and harmony so a layer can arrive mid-phrase with nothing to line
up; the score is generated in A minor over i-VI-III-VII on one scheduler, so
that came for free.

**Heat** - a tritone against the drone's A, the most unsettled interval that
still sits inside the key. Silent above 70 m and mixed in by how far past it
you are, so the hot zone has a sound and not only a colour.

**Unstable** - scheduled thuds on beats 3 and 6 of each bar below 85 m: two
detuned sines sliding down under filtered grit. Off the downbeat on purpose;
on it, it would read as part of the score, and between beats it reads as
something else in the room. Held content would have been ambience - only a
rhythm reads as movement.

**Danger** - a high tremolo triangle, mixed against whichever of a failing hull
or a full heat soak is worse. Routed **past `musicLP` straight to the bus**,
because everything else gets darker as you descend and that is exactly when
this needs to be heard.

The time constants are uneven on purpose. Heat and the unstable band fade over
about a second and a half, because they are places and a place should arrive
rather than switch on. Danger snaps in over a quarter second and leaves lazily:
late is useless for an alarm, and one that vanishes the instant you patch the
hull teaches you nothing about how close it was.

`setMood()` is called once a frame and only assigns. The ramps happen in
`tick()`, sixteen times slower, because `setTargetAtTime` sixty times a second
on the same parameter is both pointless and audibly steppy.

### Testing something you cannot listen to

If `setMood()` stopped being called, or a layer were wired to the wrong bus,
the game would sound flatter and every existing check would still pass. The
smoke test wraps `AudioParam.setTargetAtTime`, seeds the ship at 96 m - past
both bands - and asserts the exact target values the layers ask for.

That couples the test to `setTargetAtTime` being the ramp used, which is a
deliberate trade against exposing the audio graph on `window` purely so a test
can read it. It also catches the failure that matters most: a throw inside the
scheduler would take the whole `setInterval` down and silence the score, and
the page-error listener turns that into a red test.

## Supply caches: the discovery moment (2026-09-07)

The research finding this answers, from the Dome Keeper design dive: routine
mining goes stale without discovery, and "a touch of surprise" during a descent
is what a resource loop is missing when every cell is worth a predictable
number. Gas and geodes made a descent differ from the last one in what it
**costs**. A cache makes one differ in what it **hands you**.

Rare - about one every couple of runs - because a surprise you can plan around
is a resource, and this is not meant to be a resource.

**Contents are rolled from the cell's own coordinates**, not from
`Math.random`. Same discipline as the rest of generation, and it buys two
concrete things: the reward is testable, and it cannot be re-rolled by closing
the tab at the right moment.

The weighting: supplies 55%, minerals 31%, credits 14%.

- **Supplies most often**, because a consumable you did not buy is the most
  interesting thing to be handed - it changes what this run can attempt rather
  than what the next one can afford. Coolant is the rarest of the three,
  matching its price on the shelf.
- **Minerals second, and always the deepest kind the depth allows.** After the
  mineral gate the thing most likely to be blocking you is two emerald rather
  than any amount of money, so this is the reward that can actually unstick a
  run. It also means a deep cache is worth more than a shallow one without
  needing a second table.
- **Credits last and least.** Money is the one reward the game already hands
  out constantly.

A cache pays in something other than ore, so it never enters the hold. A full
hold is therefore never a reason to leave one in the ground, and the prize is
never competing with cargo weight.

### Applying the hazard-readability lesson on purpose

The gas pocket taught this the hard way: hue alone is not enough separation,
and the fix is to change the **form**. So a cache is pink - nothing else in the
ground is, and a thing left behind by people should not look like something the
planet grew - but more importantly its contents are flat parallel-faced slabs
where every ore is a pointed crystal. At thirty pixels the parallel faces are
what separate man-made from mineral, and they survive the fact that pink and
amethyst's purple are neighbours.

That cost one new geometry and one branch in `poolFor`; the pool system already
keys on block id.

## A goal that is yours: the deepest-reach marker (2026-09-07)

Between "buy the next upgrade" and "break the core" there was nothing, and on a
phone those two are a long way apart. The game had no notion of a run at all -
you dug, you sold, you dug again, and nothing ever said whether that one went
well.

Two personal bests are kept now, deepest metre and best single sale, and the
deepest one is drawn **into the world**: a faint cyan rule across the rock at
the depth you had reached before this run started. Descending past it is the
one moment in a descent that is purely yours. The core is a fixed target the
game set; this is the target you set.

Details that make it work:

- **The line is frozen at the record you HAD when you left the pad**, not at
  `g.best.depth`, which updates live as you descend. A line that retreats ahead
  of you is not a line you can cross.
- **It fades out over about fourteen metres once you are past it.** It has said
  what it had to say; leaving it at full strength turns a moment into scenery.
- **`crossedMark()` returns the line's depth, not a boolean.** At the instant
  of crossing the ship is at 62-point-something, so reporting the ship's depth
  would announce the record as the number it just beat: "New deepest reach ·
  62 m" when 62 was the old one. It now reads "New record · deeper than 62 m".
- **The latch lives in mark.ts, not at the call site.** The caller is a frame
  loop, and "remember to reset this" is how a one-shot becomes a spam. There is
  a smoke test counting the announcement against the real build.
- **The first sale of a save is not a best haul**, it is just the first sale.

Two draw calls, both additive and depth-write-free, so the line reads as light
on the rock rather than as an object embedded in it.

### A test-writing note

The e2e initialised its counter before `page.reload()`, which wipes the page's
globals - so the increment ran against `undefined` and produced `NaN`. That
surfaces as "expected 1, received NaN", which reads like a claim about the
game rather than about the test. **Anything a test installs on the page has to
be installed after the last reload**, or through `addInitScript`, which
survives one.

## The headlight, and making an invisible upgrade visible (2026-09-07)

The lamp was a point light. It lit the rock, but the ship showed no sign of
being the thing doing the lighting, so at this scale it read as a glowing
object rather than as a machine. And the Scanner Array only ever changed
`lamp.distance` - the most invisible purchase on the shelf, and one you had to
take on trust.

A volumetric cone now throws from the drill in whatever direction the ship
faces, parented to `rig` so it swings for free, and its length tracks
`S.light()`. Buying a Scanner level is something you can see.

The fade costs nothing: under additive blending black **is** transparent, so
vertex colours running white at the apex to black at the mouth give the falloff
without a texture, an alpha channel or a second draw call.

Three attempts, and the wrong turns are the useful part:

**Do not rotate the cone.** `ConeGeometry` already has its apex at +y and its
mouth at -y, which is exactly a beam pointing the way the drill points. The
first version rotated it 180 degrees on the assumption that cones "point up",
which put the wide end at the ship: a funnel, not a headlight.

**FrontSide, not DoubleSide.** Additive blending draws both walls of an open
cone on top of each other at the silhouette, which turns the edges into two
bright outlines and the whole thing into a solid grey trapezoid.

**Draw it in FRONT of the rock, at z = 0.62.** At z = 0 the cone sits inside
the block volume and the terrain occludes it - which meant a headlight with
nowhere to shine, because the ship spends almost all its time in a one-cell
tunnel. Pushed forward it reads as light falling ON the wall ahead, which is
what a beam looks like from this camera anyway. The ore halos have always
worked exactly this way; the rule was already in the codebase and I did not
apply it until the effect failed.

Length is mapped to one-to-two cone lengths rather than proportionally to the
lamp radius: at max Scanner a proportional beam is eight cells long and stops
reading as a beam at all.

## Umbrite, Solmarrow, and six more planets (2026-09-07)

The ore ladder stopped at coreite, 185 m. Planet 5's core sits at 285. That is
a hundred metres of the deepest and most dangerous ground in the game with
nothing new in it - the CRAFT note about unreachable content bands turned
inside out: not content you cannot reach, but ground you can reach that has no
content.

**Umbrite** at 210 m (54,000, 18 kg) and **Solmarrow** at 245 m (132,000,
21 kg), continuing the roughly 2.4x-per-band value curve that ruby, magmite and
coreite already followed. Both gated the way coreite is: effectively planet 4
and planet 5.

Planet names went from six to twelve. The list cycles with a numeric suffix, so
the seventh planet used to be "Verdax 2" - which says "you have seen
everything" at exactly the point the game is asking for more of your time.

### Why adding a deepest ore is safe, and how that is now enforced

`blockAt()` walks ORES in order and takes the first entry whose depth gate is
met. Because **every entry's spawn chance is strictly lower than the one after
it**, a deeper ore's cells are a strict subset of the cells the next one up
would have claimed. So a new deepest ore only ever converts the ore directly
above it - never rock, never a shallower ore, never anything at a depth it does
not reach.

The measured diff is exactly that: planets 0-2 unchanged, and on planets 3-5
only coreite becomes umbrite or solmarrow. Nothing else moved.

That is a **narrower** claim than "this feature overwrites cells", so it is
stated narrowly. Rather than dropping the two ids into `OVERWRITERS` - which
would have let any ore replace anything and quietly gutted the additive-only
test - there is a `LADDER_EXTENSION` map saying "coreite may become umbrite or
solmarrow", plus a test in stats.test.mjs asserting the chance ordering that
makes it true. Break the ordering and the additive test stops meaning what it
says, so the ordering now has its own assertion.

There is also a test that no stretch longer than 45 m of reachable ground is
without a new ore, and that the last stretch before planet 5's core is not
either. That is the check that would have caught this a month ago.

## Parallax rock behind the tunnels (2026-09-07)

Underground there was one flat backdrop plane and nothing else, so a tunnel
read as a hole cut in a wall rather than as a space with anything behind it.
Two layers of dark angular chunks now scroll at fractions of the camera's
motion - which is the whole of parallax: something further away moves less.

Two `InstancedMesh` layers, two draw calls, no lighting and no shader work.
They are `MeshBasicMaterial` and dark on purpose, so the scene fog tints them
toward the depth colour and they go ember below the heat line along with
everything else without knowing anything about heat. Positions come from
`rnd`, so a planet's background is as reproducible as its ore, and each layer
wraps into a 46 m window around the camera - a fixed instance count no matter
how deep the ship goes, and the wrap happens twenty-plus metres off screen so
nothing pops.

Three things went wrong, all of them worth keeping:

**The backdrop plane is opaque, and it was in front of them.** The first
version put the layers at z -3.2 and -6.0, behind a 60x400 unlit plane at
-1.4. They rendered perfectly into nothing - invisible even when I coloured
them pure red to check. They have to sit behind the drifting dust (z -0.7 to
-1.3) and in front of the backdrop, which at -1.4 left a tenth of a unit; the
backdrop moved to -3.2 to make room. **When something new is invisible, check
what is already in that slice of z before touching its colour.**

**z is for occlusion here, not for the effect.** The parallax comes entirely
from the offset maths, so the layers can sit a fraction of a unit apart and
still read as far apart.

**Rectangles read as rectangles.** `PlaneGeometry` slabs, however rotated and
scaled, looked like UI panels behind the level - in a world made entirely of
chipped angular rock that is the one silhouette that says "not part of this".
A jittered six-sided disc reads as a chunk. Same lesson as the gas pocket and
the supply cache, for the third time: **silhouette carries more than colour**.

Faded in over the first six metres rather than switched on at a depth
threshold, because a hard toggle pops in the corner of your eye every time you
leave the pad.

## Making the drill tier visible, and where that failed (2026-09-07)

Same argument as the headlight: the Drill Bit is the most-bought upgrade in the
game, it has ten named tiers from Steel to Godcore, and every one of them
looked identical. An upgrade you cannot see is one you buy on trust.

The auger is now repainted per tier - dull metals first, so early progress
looks like better tools rather than like magic, with the emissive only really
arriving from Plasma on.

**And it does not read.** At play scale the ship is about thirty pixels and the
auger is about eight of them, mostly behind the hull. Screenshots at level 0
and level 9 are indistinguishable. That is exactly the trap the ship model's
own comment warns about - *"detail here means silhouette rather than surface"* -
and I walked into it anyway, having read that comment while writing the
headlight two hours earlier.

What does read is the **spark**. There are a dozen a second, they sit at the
contact point, and they are the only part of the drill big enough to carry
anything. So the continuous drilling spray now uses the drill's colour rather
than the rock's - break sprays keep the block colour, because that is ore
identity and it matters more - and both the count and the speed climb with the
tier.

Colour alone was not enough there either: Steel and Godcore are both pale, so
the hue is legible side by side and forgettable on its own. A drill throwing
three times the sparks twice as hard is legible on its own. **When a change has
to be noticeable from memory rather than from comparison, change the amount,
not the shade.**

The auger repaint stayed. It costs nothing and it is correct; it is simply not
the part doing the work.

## The drill never refuses any more (2026-09-07)

Playtest: *"can you also make it so I can always dig but if the hull is full,
just leave the resources floating in place for me to pick up later."*

He is describing the worst kind of wall. A full hold stopped the drill dead and
showed a number. It did not ask the player to decide anything; it just stopped
them doing the thing the game is about, and the only response available was a
round trip.

Now the drill always cuts. Ore that will not fit is left at the cell it came
from and bobs there until you fly back through with room. Plain rock is spoil
and is thrown away - a tunnel full of glowing dirt would be noise rather than a
decision, and the value of rock is not what anyone is protecting.

One `InstancedMesh` with per-instance colour, one draw call, positions derived
from `g.drops` (cell key -> block id) so the whole field persists in the save
for free. Capped at ninety so a save cannot grow without bound.

Pickup happens on **arrival at a cell**, not continuously: a drop lives at a
cell and the ship moves cell to cell, so there is no in-between state where a
partial overlap would mean anything.

The "hold full" toast fires once a trip rather than once a block, which is the
difference between information and nagging.

### What this quietly changes

Cargo capacity used to be a hard stop. It is now a **rate limit on value per
trip** with the surplus banked in place, which is a much better shape: the
decision moves from "do I have to go back now" to "is it worth coming back for
that". It also makes the coming ordnance work - a bomb clearing thirteen cells
into a full hold would otherwise have been unusable.

`Drops` got its own type rather than reusing `Cargo`. Cargo counts units of a
material; this names a material at a place, one per cell. They are both
`Record<string, ...>` and confusing them typechecks silently.

## Seams: the texture stops being decoration (2026-09-07)

Playtest: *"I like the sections of texture you added to the regular blocks. can
you make it so most regular dirt and rock give you a very small amount of
resource, and those textured areas give you more?"*

Rock used to be a uniform trickle - every cell paid a little and weighed a lot,
so the hold filled with granite and the decision the cargo cap exists to force
never happened. Now plain rock is nearly weightless and nearly worthless: it is
what you cut through, not what you carry. The value is concentrated into
**seams**, worth about as much per kilo as iron at nearly twice the weight per
unit, so a seam is both good cargo and expensive in hold space - passing one up
is a decision rather than an oversight.

**The tell was already on screen.** Decorative flecks were scattered by
`rnd(x + 61, d + 17, planet)`. `blockAt` now uses that same roll to decide
which cells *are* seams, so the texture and the payout agree by construction
rather than by being kept in step. A test asserts the measured share has not
drifted from `SEAM_CHANCE`, because the day those two disagree the game is
lying to the player about where the money is.

**A third was far too many.** At the original 30% the screen did not say "some
of this rock has mineral in it", it said "the rock is made of mineral" - every
wall went sandy and the bands lost their identity. A sixth reads as a find. The
body blend also came down from 45% toward the seam tone to 20%: the cell has to
stay recognisably its own band, and the flecks are what the eye is meant to
catch.

Rock values are fractional now (0.6 / 1.0 / 1.6 / 2.2 / 3.0). Five bands have
to stay strictly ordered *and* stay well under a seam in value per kilo, and
with weights that small there is no room to do both in whole numbers.

### Two things this broke in the tests, both worth keeping

**The snapshot assumed one payload per block id.** It had been true - every
field was constant per id or scaled by `hardMult`. Seams take the colour of the
band they sit in, so one id legitimately has five payloads. The key widened to
id+colour rather than the assertion being dropped: the point of it is to catch
a field that starts varying by something nobody expected, which is exactly what
just happened.

**The additive-only test counted two different claims as one.** A pocket or a
cave dropping onto the world has to stay rare - that is what "an event, not
terrain" means. A ladder extension or a seam converts a whole category
wholesale and is *supposed* to be common. Counted together, seams tripped the
12% pocket ceiling, which would have read as "pockets have gone wrong" for a
change that had nothing to do with them. They are counted apart now, with a
ceiling each.

## The Scanner finally has a job (2026-09-07)

Playtest: *"can you also make the light upgrade more important? I can see all
of the blocks on screen, so it doesnt seem very beneficial."*

Exactly right, and the reason is structural rather than a matter of degree: the
Scanner only ever changed the **lamp's radius**, while the camera framed a
fixed eighteen rows. Everything on screen was already inside the lit circle at
every level, so the upgrade bought a slightly warmer wall.

The framing belongs to the Scanner now. Level 0 frames 74% of the old view -
you work in a pocket - and level 9 frames 110%, more world than the game has
ever shown. The curve is front-loaded, because the first two levels are when
the player is deciding whether the Scanner is worth buying at all and a linear
ramp would make that first purchase feel like nothing.

Applied in the frame loop rather than in `resize()`, so the camera's existing
lerp turns a purchase into a zoom rather than a jump cut.

**His other suggestion came for free.** He also proposed making distant blocks
hard to identify without the upgrade. With a tight camera at low Scanner the
lamp no longer covers the frame, so the edges genuinely fall into darkness -
and because ore haloes are additive and unlit, you can still see that something
is *there* without being able to tell what. That is a better version of the
idea than either of us specified, and it is what the existing lighting does
once the framing stops covering for it.

There is a test asserting the lit radius grows faster than the framing at every
level. If the view ever outran the light, an upgrade would be buying darkness.

## The Outfitter becomes a place, and ordnance (2026-09-07)

Three requests in one tranche, because they only make sense together: a shop
that reads as somewhere you dock, stock that unlocks with depth, and two
abilities to put on the new shelf.

### The station

A sticky header band - OUTFITTER / Surface Station / the planet's name, credits
on the right - over four named counters: Drilling Rig, Life Support,
Instruments, Ordnance. It was a list with a heading; it is meant to feel like
arriving somewhere.

The first attempt gave `#upgrades` its own `overflow-y`, which quietly cut the
shelves off at the fold: Life Support appeared to contain one item and the
Ordnance counter appeared not to exist. One scroll region for the whole sheet
with the header `position: sticky` inside it is both simpler and right.

### Sealed stock

Each upgrade has an `unlock` depth checked against `g.best.depth`. Below it the
row is **still there** - named, dimmed, with the depth where the price would
be. Hiding it would hide the fact that there is an Ordnance counter at all, and
that is most of the reason to keep going down. Tow at 25 m, Cooling at 55,
Autopilot at 65, the Seismic Charge at 40 and the Cutting Laser at 90.

### Two abilities, one meter

**Seismic Charge** clears a diamond around the cell you are facing (13/25/41
cells) for 2 power. **Cutting Laser** cuts a line ahead (5/7/9 cells) for 1.
Both run off one Power Cell meter that trickles back underground - one point
every 42 seconds - and fills at the pad. That combination is the whole balance:
the trickle means a long descent is never completely without an answer, the
refill gives the pad a reason to exist beyond selling, and a cap of four means
a meter you can spend twice is a decision rather than a second drill.

They matter more the deeper you are, which is the right shape and came free:
they ignore hardness, so their value scales with exactly the thing that makes
drilling slow.

The ordnance buttons sit on the **right**, above the d-pad, while supplies stay
bottom-left. Ordnance is aimed - what it does depends on which way you face -
so it belongs under the thumb that decides that.

`breakCells()` is one routine both abilities hand a list to. Everything that
makes breaking a block complicated - hazards, caches, a full hold, spoil -
already had a home in the frame loop for the one cell being drilled, so this is
the same rules applied to many at once rather than a second set of them. Two
cells it refuses outright: bedrock, and the planet core, which is a planet's
climax and has to be drilled by hand rather than deleted from four metres away.

### Two design bugs the tests caught before I did

**The charge was strictly worse than the laser.** At radius 1 it cleared five
cells for two power while the laser cleared five for one - and it unlocks
earlier and costs half as much, so the moment you owned both the charge was
pointless. Radius is `l + 1` now, and there is a test asserting the charge
beats the laser per point of power at *every* level, with the laser keeping
reach instead.

**The laser's mineral gate did nothing.** It wanted silver, from 22 m, behind a
90 m depth gate - so one of the two walls was decoration. A test now asserts
every gated upgrade's mineral lives within 30 m of its unlock depth. Ruby, at
105 m, fixes it and is the better fiction for a laser anyway.

## Relics: the secret, and the larger point (2026-09-07)

Playtest: *"can you also think about a larger point to the game, or secondary
objective?"* and *"other abilities and secrets that can be found"*.

Those are the same question. Coreward's only reward was credits, and credits
are a rung: every one you earn makes the last one irrelevant, so the answer to
"what have I got" is always a number that will look small next week. The core
shards were closer, but they only ever did one thing.

**One relic is buried on every planet**, below the halfway mark, in no
particular column, marked on nothing. It grants a permanent perk - the drill
hits 10% harder, the hold carries 15% more, heat does 15% less, one more power
cell - and it is kept forever. Past the named eight, every relic is another
stacking Assay Charter, so the ladder never runs out of a reason to look.

**It is the only thing in the game you can miss permanently.** Break the core
with the relic still in the ground and it goes with the planet. That is what
makes it worth looking for rather than something you will pick up eventually.

### Turning a lottery into a search

One cell on a planet with nothing marking it is not a secret, it is a lottery.
The Scanner's lamp radius is the search radius: within it, a small mote drifts
off the ship in the relic's bearing and brightens as you close.

That gives the Scanner its **third** job - light, framing, and now finding -
and it is the one that makes maxing it worth it. Between 8 m and 30 m of search
radius is the difference between finding a relic by luck and finding one on
purpose. Three separate reasons to buy one upgrade, all of them felt.

### Perks are data, not callbacks

Each perk is read by a named derived stat in state.ts - `fuelUse()`,
`heatTake()`, `gasTake()`, `powerCap()`, `saleBonus()` - rather than being a
function the relic runs. A perk cannot then do anything a test cannot see, and
there is a test that walks every relic, applies it alone, and asserts the stat
it claims to move actually moves. A perk that is described and never read is
exactly the failure that is easiest to ship and hardest to notice.

### A float that nearly trained a bad habit

Adding the Salvage Rights perk turned `towCut` into
`0.5 - 8*0.05 - 0`, which in binary floating point is 0.09999999999999998. The
golden baseline duly recorded a tow cut of 9.999999999999998%. True, useless,
and precisely the kind of diff that teaches you to re-record without reading -
which is the one habit these baselines cannot survive. Rounded before clamping.

## Free flight (2026-09-07)

Playtest: *"can you make the ship feel more like it is free to fly not on a
grid? still make it easy and intuitive to control but don't keep it stuck on
the grid."*

The ship hopped cell to cell on a fixed timer. Every metre was a discrete
decision resolved by a lerp, which is why the world read like a spreadsheet
however good the rock looked. It has a velocity now: thrust toward whatever is
held, coast when nothing is, push out of anything solid.

`src/fly.ts` is pure, so the part that can actually go wrong is testable
without a renderer - and the tests are the ones that matter: tunnelling through
a wall at speed, catching on a corner, creeping into a block by leaning on it,
getting wedged in a dead end, and thrust that does not depend on frame rate.
Substepping rather than a swept test; at ten cells a second it almost never
costs more than two iterations, and it is a tenth of the code.

**Digging has no "is there a block in front of me" test any more.** The
collision reports the cell that stopped the ship on each axis, and that cell is
what the drill points at. Two things that used to be separate - where the ship
is and what it is allowed to dig - are now the same fact, so they cannot
disagree. Only the axis being pushed on can start a dig, or scraping along a
ceiling while flying sideways would begin drilling the ceiling.

### Three things the grid was doing for free

**Selling.** It happened on arriving in the pad's cell. There are no cell
arrivals any more, so it is an edge trigger on being at the surface at all -
which also means it fires however slowly the ship drifts up onto the pad.

**Momentum through a break.** Breaking a block used to schedule a step into it.
Velocity is held at zero while drilling, so without a replacement the ship
restarts from a standstill after every block - and at a fifth of a second to
top speed, digging a shaft becomes a stutter. The ship now keeps its facing
velocity through the break. This is the one thing about the grid worth keeping.

**Staying on the grid.** The world is still built on cells, so a tunnel dug
while drifting would wander off it and the drill would visibly miss the rock.
While drilling, the ship is pulled onto the block's centre line.

### The numbers

`FLY_ACCEL 18` is about a fifth of a second to top speed; `FLY_DRAG 9` coasts
roughly three quarters of a cell after release. Both deliberately fast: this is
played with a thumb on a d-pad, and anything that reads as momentum also reads
as the controls being late. There is a test on the coast distance, because that
single number is most of what "free to fly" feels like.

## Blocks remember being half cut (2026-09-07)

Letting go mid-block threw the work away, so the only way to change your mind
about a wall was to have not started it. The drill stops on release now and the
rock keeps its damage; the cracks are drawn back on from the stored value and
seeded from the cell, so a half-cut block *looks* half cut rather than the
memory being a number in a save file.

**Stored as a fraction, not as seconds.** With seconds, buying a better drill
shrinks the total while the stored number stays put - a wall you had half cut
would silently become nearly whole, which is the exact opposite of what an
upgrade should do. There is a pure test for it that also asserts the two
interpretations genuinely differ in the case being tested, because a test where
both readings agree proves nothing.

## The Outfitter is a place you dock at (2026-09-07)

It was a card on a translucent backdrop. Half the world visible underneath says
"you are still out there" however the card is styled, so the game is hidden
entirely now: a viewport at the top looking out on the sky of the planet you
are above, a fascia with the dock number and the planet, counters scrolling
under it, UNDOCK fixed at the bottom.

All gradients and repeating stripes rather than images. A station interior is
mostly flat panels, seams and warning tape, which is what CSS is already good
at and costs nothing to ship.

An earlier attempt gave `#upgrades` its own `overflow-y`, which cut the shelves
off at the fold - Life Support looked like it held one item and the Ordnance
counter appeared not to exist. One scroll region, header outside it.

## Assets: what was worth importing, and what was not (2026-09-07)

Playtest: *"can you find where to get free assets for the game automatically
and improve the ship, pad, and anything else that could easily benefit from
pre-made assets?"*

**Where to get them.** Kenney (kenney.nl, CC0, ~40k assets, one consistent
style) is the best source for game-ready 3D and UI. Quaternius is CC0 and
game-ready. Poly Pizza and Icosa archive the old Google Poly library, mostly
CC-BY so attribution is required. Poly Haven is CC0 but photoreal, which is the
wrong register here. Kenney's downloads go through a session redirect rather
than a stable zip URL, so they are not fetchable unattended; Google Fonts is.

**What was installed: the font.** Chakra Petch, OFL, two weights of the latin
subset self-hosted at 20 KB, added to the Workbox glob so the installed app
does not fall back to a system face offline. This was the clear win - the UI is
mostly numbers under a thumb, and a condensed technical face where 8, 6 and 0
are never confusable at 10 px changes every screen in the game.

**What was not: 3D models, and this is a judgement worth recording.** The ship
is about thirty pixels tall in play. The drill-tier experiment already proved
what that means: repainting the auger per tier was correct, invisible, and had
to be replaced with a change to the spark *count* to read at all. A downloaded
model would arrive with its own topology, normals and sense of scale next to
terrain that is flat-shaded low-poly on a hand-tuned palette, and the join
would show in the first frame. It would also cost `GLTFLoader`, an async fetch
and a precache entry, to buy surface detail at a distance nothing here is
viewed from.

The pad was rebuilt from primitives instead - splayed legs, stays, a gantry
with a service rail, hazard chevrons, a landing collar. It is the one object
that is stationary, close to the camera and looked at while nothing else is
happening, which makes it the only place in this game where surface detail
earns its keep.

**The rule this leaves behind:** import assets for things the player reads at
their real size - type, UI, sound - and model in code for anything that is
thirty pixels tall and judged on silhouette.

## Budgets: which limits are real and which are mine

Asked directly, so recorded here.

**Nothing in this game is near a platform limit.** Every budget in the repo is
one I set, and they are drift detectors rather than ceilings:

- `bundle-budget.json` (~546 KB total, 71 KB of it game code) is a per-chunk
  size guard with 1% and 12% tolerances. It exists because a module split once
  silently dropped a line and the only evidence was a 7 KB shrink. Re-record it
  deliberately with `npm run size:update` whenever a commit adds a system.
- **The draw-call budget is 150, and the rule of thumb it used to come from was
  wrong.** Measured 2026-09-08 by adding sub-pixel meshes to the real worst-case
  scene and timing whole frames through the tick seam, which isolates call
  overhead from fill rate: **5.0 us per draw call**, linear from 79 to 2,519
  calls (0.64 / 0.75 / 1.19 / 1.88 / 3.66 / 7.27 / 12.88 ms). The game's 60
  calls cost 0.64 ms - under 4% of a 60 fps frame - and it would take about
  **3,200** to miss 60 fps on this desktop, the high hundreds at worst on a
  phone.

  The old 70 was roughly 2% of the real ceiling. The budget exists to catch
  instancing silently breaking, which measured 207 back when the world was much
  smaller, so 150 catches that decisively while leaving room for features to
  land without a budget edit. **The thing to be alarmed by is a jump, not a
  number.**

  What actually costs something on a phone is fill rate: the move to PBR terrain
  was 0.098 ms/frame at an unchanged draw count, which is more than a hundred
  extra draw calls would have been.
- `MAX_DROPS`, `MAX_CELLS`, `MAX_HALOS` and friends size instanced buffers,
  which have to be allocated up front. They bound memory, not a quota.

**The only real platform limit in play is `localStorage`, about 5 MB per origin
in Chrome.** A fully dug planet 5 save - every cell of a 13 x 110 world in
`dug`, 300 rubble cells, everything maxed - serialises to 12.5 KB. A normal
save is under 1 KB. That is roughly 0.25% of the quota at its absolute worst,
so the save can grow by two orders of magnitude before it is worth a thought.

Device memory is not a factor either: three.js plus this game is a few tens of
megabytes against the several hundred a Chrome tab gets on a modern phone.

## Lanes: on the grid, but not stuck on it (2026-09-07)

Playtest: *"I tested the ships free movement and it has a few issues. If you
down line up quite right, it can cause some bugs like flipping around or not
mining. Can you make the movements follow a grid again but make them feel
smoother and not feel like you are stuck on a grid?"*

He named the symptom, the cause and the fix in one sentence again. "If you
don't line up quite right" is the whole diagnosis.

### The bug, which was two facts allowed to disagree

Free flight let the ship sit anywhere. Its radius is 0.34, so parked at
`pd = 5.40` it spans 5.06 to 5.74 and touches **rows 5 and 6 at once** - while
`Math.round(5.40)` says row 5. The collision reported whichever of the two was
solid; the dig logic reconstructed the direction from the rounded position.
Those are different facts about the same ship, and off a lane they disagreed.

What that produced, both reported:

- **"Not mining."** `startDig` fired off the collision's cell. On the very next
  frame the stop test rebuilt the direction from `Math.round()`, got a diagonal,
  and cancelled the cut. The collision then re-reported the same wall, so it
  restarted and re-cancelled forever: ship pressed against rock, drill
  stuttering, depth frozen.
- **Snagging on your own shaft.** At `px = 6.4` in a one-cell shaft the ship
  overlaps column 7, so the *wall it dug past* blocks it. It cannot descend and
  it cannot drill. That is a hard deadlock reachable by ordinary play.

### The fix is lanes, not a patch on either symptom

Travel freely along the axis you are pushing on; be drawn continuously onto the
centre line of the other one. `laneVel()` in `fly.ts` returns that correction
**as a velocity**, so it goes through the same collision as everything else and
can never seat the ship inside rock - a blocked lane ejects it into the free one
instead. With nothing held, both axes pull, so letting go parks you in a cell.

Momentum, acceleration and the coast are all untouched; there is a test
asserting the coast distance is the same with the pull switched on. What is gone
is the wobble across the lane, which was never doing anything for feel and was
the sole source of the ambiguity.

Then the two facts were collapsed into one, in both directions:

- The dig **target** comes from the lane (`step()`), never from the collision.
  The collision says *that* the ship was stopped; the lane says *which* cell is
  ahead.
- The dig **stop** test compares against `R.digging.dir`, the direction the cut
  started in, which is now stored on the `Dig`. Nothing is reconstructed, so
  nothing can disagree.
- A dig only starts once the ship is within `DIG_ALIGNED` of the line. Mid-turn
  it is not aimed at anything yet. That is under a tenth of a second, and there
  is a test on it, because that delay is felt directly as drill lag.

### The flipping was a gimbal, and it was one line

`rig.rotation.z` is the facing and `rig.rotation.y` is the bank, on the same
object. Under three.js's default `XYZ` order the facing composes first and the
bank then rotates the already-turned ship about the **world** vertical. Facing
down that is a roll about the drill, which is what a bank should be. Facing left
or right the ship's long axis lies along world X, so the same rotation swings its
nose at the camera - it visibly flips out of the screen plane, and worst at
speed, because the bank is driven by velocity.

`rig.rotation.order = 'ZYX'` composes the other way: the bank applies in the
ship's own frame and the facing turns the result, so it is a roll about the drill
in every facing. The bank input was also wrong - it read `R.vx` regardless of
facing, so flying left or right banked the ship for going *fast* rather than for
going sideways. It now reads whichever axis the ship is not pointing along.

### Why the whole suite stayed green through all of this

**Every existing test seeded the ship exactly on a cell centre.** 124 golden
tests, 17 smoke tests, and not one of them could reach the bug, because the bug
only exists off a lane. The new e2e test seeds `px: 6.4` deliberately - the
comment says not to tidy it to 6, because that is precisely what would silently
retire the test.

Verified by reintroducing the bug rather than by trusting it: with `LANE_PULL`
set to 0, five of the seven new golden tests fail and the e2e test fails on
"the ship never got past its own shaft".

## Real rock: the first texture (2026-09-07)

Playtest: *"I also want you to use premade assets to improve the game. Use them
to add more dimension to the game, better textures, better look and feel
overall."*

Asked once before and answered with a font and a reasoned no on 3D models. The
no was about *models*, and it still holds - the ship is thirty pixels tall. It
was never an argument against **textures**, which the rule at the top of
`ASSETS.md` has always put on the import side, and this is the game's biggest
surface by a wide margin.

**ambientCG Rock035, CC0, normal map only, 384 x 384 WebP, 46 KB.** The colour
map from the same download stayed on disk deliberately: a normal map carries no
colour, so every block keeps the exact palette hue it had and gains a surface.
Importing the colour would have dropped a photograph into a hand-palette
flat-shaded world.

**Sampled on world XY, not the cube's UVs.** Per cell, the detail restarts at
every boundary and the wall reads as a stack of identical boxes - the same
lesson the seams and the glow both taught. `vNormalMapUv` is an ordinary
varying, so it is reassigned in the existing displacement injection, where the
world position is already in hand. Everything downstream is stock three:
`perturbNormal2Arb` builds its frame from screen-space derivatives, so flat
shading needs no tangent attribute.

**One tile per four cells, and the size follows from that.** A cell is about 118
physical pixels on an S26 Ultra at the pixel ratio cap of 2, so four cells is
~470 px and 384 is native. 1K would have been three quarters of a megabyte to
display at a third of its resolution.

**`normalScale` is 2.6, which is measured and looks wrong.** At 0.45 the effect
was invisible; at 3.0 it read clearly with the facets entirely intact. Spreading
one tile over four cells means only the map's low-frequency component survives,
so it takes a large multiplier to see anything. Verified by building with the
map off and comparing the same seeded frame at 40 m. **This is the number to
change**, and it wants judging on the phone - the whole effect is in how the
lamp rakes across the surface as the ship moves, which a static desktop
screenshot understates.

**Costs, measured.** 46 KB on the wire against 161 KB of gzipped code and HTML,
so a 29% bigger download - and it is cached like three.js is, because Vite
hashes it and Workbox precaches it. `webp` had to be added to the Workbox glob,
exactly as `woff2` did. Draw calls are unchanged at 50: a normal map is a
texture on a material that already existed. The three.js chunk grew 0.51%,
which is real - enabling `normalMap` pulls its shader chunks past tree-shaking.

**The size guard now watches assets too.** It only looked at `.js`, and the game
had just gained its first shipped binary. A texture regenerated at the wrong
resolution is a one-character mistake that lands on every player's mobile data
and that nothing else in the repo would notice, so `rock-normal.webp` is in
`bundle-budget.json` at a 0.5% tolerance - tighter than any code chunk, because
it only ever changes on purpose.

## The headless tick seam (2026-09-07)

`frame()` asked what time it was and did the work in one function, so the only
way to reach anything was to fly there in real time. That is most of why the
deep game went three sessions untested: a test that costs a minute of wall clock
does not get written, so ordnance, relics, the mineral gate and tremors were all
shipped on modelling rather than on evidence.

It splits now. `frame(now)` computes a delta and calls rAF; `tick(raw, draw)`
does everything else and never asks what time it is. Behind `?debug`,
`window.__cw` exposes `tick`, `advance`, `stopClock` and the state objects.

**Measured, on a real GPU:** 0.239 ms per tick simulating, 0.534 ms drawing.
Twenty simulated seconds of digging runs in 396 ms - **51x real time** - and
lands at 58.6 m. Three identical runs from the same state give identical results
to six decimal places.

Three things that make it work rather than merely exist:

- **Only the last step draws.** Nothing in `renderer.render()` feeds back into
  game state, so drawing every step buys nothing; the numbers above say it is
  69% of the cost even with a GPU, and a headless browser on a software
  rasteriser is far worse. Drawing the final step keeps draw calls and instance
  counts honest for whatever the caller asserts next.
- **`stopClock()` first.** Real frames keep arriving otherwise, and the run
  becomes a mix of real deltas and fixed ones - so how many got in depends on
  how fast the machine booted the bundle.
- **The step is fixed at 1/60, not taken from elapsed time.** Same call, same
  run, any machine.

One thing had to change to make it deterministic: the halo, pad-light and beam
pulses read `performance.now()` directly. They run off an accumulated `clock`
now. At 60 fps that is identical; driven headless, the old version pulsed for
the wall-clock duration of the loop rather than for the game time simulated.

### The first tremor anyone has ever seen fire

Tremors start at 85 m and fire every ~27 s, so proving one happens was a minute
of held d-pad and had never been done. It is a 2.6 s test now - and writing it
found something worth keeping.

**The first version dug a shaft one cell wide and saw no tremor at all.** That
was the game being right: `planCollapse()` re-runs the pathfinder and reverts
the whole collapse if the ship can no longer reach the pad, and in a one-wide
corridor *every* candidate cell severs the only route home. Every tremor fired
and every one was correctly spent as noise.

The fixture now digs three columns and asserts its own precondition, because a
fixture that cannot reach the behaviour it names reads as coverage and is worse
than no test at all.

## The e2e port was someone else's game (2026-09-07)

Half the smoke suite started failing with `ERR_CONNECTION_REFUSED`, a different
half each run, while every test passed in isolation. It was not flake and it was
not this repo: **Captain Run's suite was running at the same moment on the same
machine, and both games used Vite's default port 4173.** With Playwright's
`reuseExistingServer` on locally, Coreward's tests adopted Captain Run's server -
pointing this game's assertions at another game's build - and then lost it when
that run finished and tore it down.

Coreward is on **4319** for tests and **4318** for the interactive preview now.
Two different ports on purpose: opening the game to look at it can no longer
disturb a test run, which is how the whole thing started.

Worth knowing for next time, because several games run here at once: the
diagnosis is one command, and it names the repo -
`Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Select ProcessId, CommandLine`.

## Real bloom: measured, built, and reverted (2026-09-07)

Asked for as part of the look-and-feel pass, and it was the clearest item on the
"skipped because of the old restrictions" list - the original reasons were "a
library and a pass", two-thirds of which was the no-build-step era rather than
judgement. It is built, it works, and it is not in the game. Both halves of that
are worth writing down, because the reason it is out is not the reason anyone
expected.

**Performance was never the problem.** `EffectComposer` + `UnrealBloomPass` at
half resolution, measured with the new tick seam by flipping the pass on and off
inside one page at pixel ratio 2 in a portrait viewport, sat at **0.096 ms per
frame** - 0.357 ms without, 0.453 ms with. That is 27% of a number that is 2% of
a 60 fps budget. Bundle cost was 4.4 KB gzipped. Nothing there argues against
shipping it.

**The blocker is the sky.** The renderer runs `alpha: true` with no scene
background and a CSS gradient behind the canvas, which is why the sky is free and
why it can be updated eight times a second by writing one string. A composer
renders into its own render target, so:

- the sky went **black**, because the target is opaque and there is nothing
  behind it any more;
- the palette shifted - brown rock to grey, the cyan pad beam to green.

`OutputPass` is genuinely required and fixes the colour-space half of that (the
renderer's linear-to-sRGB conversion never happens when a composer owns the
output). It does nothing for the alpha. `RenderPass.clearAlpha = 0` does not
rescue it either: the bloom composite is additive and alpha is destroyed inside
the chain, which was verified rather than assumed.

**So bloom needs the sky moved into the scene first** - a fullscreen gradient
quad fed the same two colours the CSS gradient gets. That is maybe forty lines,
but it sits underneath the fog, the ambient falloff and the vignette, all of
which are calibrated by eye against three.js 0.166 and none of which can be
checked anywhere but on the phone. That deserves to be its own deliberate change
with its own screenshot pass, not a side effect of adding a glow.

The code is not kept, because dead code that "just needs one more thing" is how a
repo fills up. The measurements above are the part worth keeping, and the next
attempt starts at the sky rather than at the pass.

**Meanwhile the fake bloom stays and is still the right call for this game:** the
additive halo quads cost one draw call, they are under per-object control, and
they are what makes an ore vein magnetic across a dark chamber.

## The bouncy stop, and the bug it was hiding (2026-09-07)

Playtest: *"The ship looks very bouncy when you change direction or stop. Can
you find a smoother way to have it align with the grid, or not make it align
until you change direction? I want it to ease into a stop."*

Two faults in the lane pull added the session before, and a third underneath
them that it had been masking.

**It added instead of assigning.** `R.vy += laneVel(...)` stacked a correction
on top of a velocity that was frequently already carrying the ship toward the
line, so the two together overshot, got corrected, and overshot again. That is a
spring with no damping term, and ringing is what "bouncy" means. Assigned, the
perpendicular velocity *is* the exponential approach and cannot overshoot: the
value is exactly the speed that lands on the line.

**It ran while coasting.** With nothing held, both axes were pulled to their
nearest lane. The nearest lane is as often *behind* the ship as ahead of it, so
letting go near a cell boundary hauled the ship backwards against its own
momentum. Releasing is now drag and nothing else. The ship rests wherever it
rests, and the next direction pressed aligns it on the way - which is exactly
the "don't align until you change direction" he asked for, and costs nothing,
because alignment only has to be true by the time the drill fires.

### The third fault, which two sessions of tests could not see

`DIG_ALIGN` holds the ship on the centre line of the cut. It did that by writing
`g.px`/`g.pd` **directly** - so the collision never sees it - and it aligned
whichever axis did not already match. For a dig that is always the wrong axis:
the target cell is one step *ahead*, so the mismatched axis is the direction of
the cut. Drilling down from 49 walked the ship to 49.58, well inside the cell at
50.

It was invisible because the coasting lane pull aimed the ship at the nearest
lane on release and the collision ejected it back out of the wall. So the
symptom was not "the ship is inside a rock", it was **a jerk out of the wall
after every single block** - part of what "bouncy" was describing.

Now keyed off `R.digging.dir`, the direction the cut started in, which the dig
already stores for the stop test. There is an e2e test asserting the ship never
gets past 49.2 while drilling down, verified by putting the bug back.

**The general lesson: two bugs can hide each other, so when a fix makes a
different test fail, suspect a mask before a regression.** The interruption test
started failing on the depth readout - because 49.58 rounds to "50 m" - which
looked like the fix breaking digging and was the fix revealing a defect.

## The run log (2026-09-07)

Playtest: *"is there a way for you to add some kind of log to see how fast
certain things drain, if the cost is worth the benefit, or if certain abilities
don't really seem to be necessary? ... I would only want to do it if it has very
little impact on the game running and is actually helpful."*

He set both acceptance criteria, and the second is the harder one.

**Very little impact: measured, not asserted.** Every counter is a `+=` on a
flat object of numbers - no arrays, no strings, nothing allocated per frame,
nothing that grows. `summarise()` runs on the button press and never in the
loop. Measured with the tick seam at the deep worst case: **0.345 ms/frame with
it against a 0.357 ms baseline without**, samples 0.338-0.350. The cost is below
the noise floor of the measurement.

**Actually helpful: rates and ratios, not counters.** Nobody balances a game
against "fuel burned". The three questions he asked map to three answers:

- *how fast things drain* - fuel/s split by what spent it, hull/s split by what
  took it, and how long a full tank or hull lasts at that rate. The tank figure
  divides by the DRILLING burn rate specifically, not the run average, because
  drilling is the job that empties it.
- *is a cost worth it* - credits per minute and per metre, and where the time in
  a run actually goes.
- *is an ability necessary* - an unused one reads **"never used"** with a note
  saying what that implies. A zero the eye skips past is the most valuable
  reading in the panel: it means the thing does not need tuning.

Two columns, this run and all time. All time is what balance is decided on; this
run is what makes the panel worth opening mid-game. The all-time column merges
the live run into a throwaway copy rather than writing it back, or docking would
count it twice.

**One metric had to be rewritten immediately.** It reported "98.5% of blocks
paid", which was accurate and worthless: since plain dirt started paying a token
amount, `value > 0` is true of almost everything. It counts against
`DROP_MIN_VALUE` now - the game's own existing line for "worth coming back for".
A ratio that is always ~100% is measuring the wrong set.

`npm test` also now discovers `test/**/*.test.mjs` rather than listing files by
name. The telemetry suite was written, passed, and was not being run at all,
because adding a file to `test/` joined nothing.

## The v0.9.4 deploy that never happened (2026-09-08)

Playtest: *"It's not automatically updating to the new version on my phone for
some reason. I've restarted it multiple times now."*

His phone was right and there was nothing wrong with it. **CI failed on e34e2b1,
so the deploy job was skipped and the live site was still on v0.9.3.** He was
restarting an app that had nothing new to fetch.

The PWA side is fine and was never the problem: `registerType: 'autoUpdate'`
with `skipWaiting` and `clientsClaim` picks up a new build on the next open or
the one after. Worth confirming rather than assuming, given the same session had
just lost an hour to a stale service worker locally - but that was `vite
preview`, not the phone.

**The process failure is mine.** "Push straight to main, say it is pushed, do
not poll the live site" is right, and it does not mean "do not look at whether
the gate passed". Those got conflated. Checking is one unauthenticated call:

```bash
curl -s "https://api.github.com/repos/gideon6222/coreward/actions/runs?per_page=3"
```

And when it has failed, the logs need auth but the **annotations do not** -
`/check-runs/<job_id>/annotations` returns the actual assertion text, which is
how the cause below was found without signing in.

### What actually failed, and why it only failed there

`heat reads as its own channel on the hull bar` polled for the soak gauge to
pass 25% of its width and reached **24.4582%** before the test timed out. It
passes locally every time, including with `CI=true`.

Soak accrues in **game time**. The CI runner has no GPU, falls back to
SwiftShader, and the frame loop clamps its delta - so the game advances in slow
motion and thirty seconds of wall clock is not thirty seconds of play. The test
was obeying the "wait on game state, never on wall-clock time" rule and still
lost, because the state it waited on is itself measured in a clock it was not
driving.

Fixed by putting it on the tick seam that landed the same session: `advance(60)`
is sixty game-seconds on any machine. **13.6 s and machine-dependent to 2.8 s
and deterministic.** This is the first test converted; every other wall-clock
poll in the suite is a candidate.

Two structural things came out of it:

- **The poll window and the test timeout were both 30 s**, so the poll could
  never use its budget: the test died first and reported "test timeout
  exceeded" instead of "soak reached 24.46 of 25". The real message was one
  layer down. The suite timeout is 60 s now, deliberately longer than
  `DEEP_ENOUGH`.
- A green local suite says nothing about a machine an order of magnitude slower
  at software WebGL. The seam is the answer to that, not bigger timeouts.

## The realism pass, part one: the rock (2026-09-08)

Playtest: *"the game looks a little cartoonie. can you update the graphics to
look more realistic and detailed? make the dirt and rocks look more like
realistic minerals, make the colors and textures more gritty."*

**Lambert to MeshStandardMaterial is the change that mattered**, and it is not
mainly about the maps. Lambert has no roughness channel at all: every surface
scatters light identically, so however much relief is layered on top the eye
reads one moulded material. Rock is defined as much by catching light UNEVENLY
as by its shape.

Three maps now, all greyscale or data, all sampled on world position so the
detail runs continuously through a wall instead of restarting in every block:

- **grit** (greyscale colour x AO) multiplies the palette. Greyscale on purpose:
  the photograph supplies grain and pitting, the hand-tuned band colour still
  decides what kind of rock it is.
- **normal**, from the previous session.
- **roughness**, which is most of what separates stone from plastic.

The procedural canvas grain is gone. It was right while nothing could be
imported, but noise has no bedding, no fracture and no sense of pressure, so it
reads as speckle on plastic.

### Two texture bugs that both presented as "the lighting looks wrong"

**The grit map had a mean of 34/255.** It was multiplying the palette down to
13% and then being sRGB-decoded on top of that, so the rock had almost no
albedo left and the whole image was lit by specular and ambient - a grey-blue
wash with the band colours gone. A map that MODULATES has to be centred high;
it is now mean 164 over a 132-255 range.

**The roughness map had a mean of 176/255**, so with a 0.95 base the effective
roughness was ~0.65 - glossy enough for the blue rim light to sheen every
surface in the game. Now mean 210 over 173-255 with the base at 1.0, so the map
alone governs.

Both were found by measuring the files, not by staring at the render. **Compressing
each map's range also made them smaller**: grit went 28.6 KB to 13.3 KB and
roughness 18.8 KB to 9.1 KB, because there is less entropy in a narrow band. The
whole texture set is 68 KB.

`sharp` applies operations in ITS OWN internal order, not call order - so
`.normalise().linear()` silently ran the normalise last and undid the remap. The
fix is a `.raw()` buffer between the two passes.

### Fog was painting the underground with the sky

The fog colour was the sky's horizon colour lerped by depth, which is correct at
the surface and badly wrong under it: at 40 m it was still **#3b7196**, a bright
blue, washed over every distant surface. The sky keeps its gradual ramp - it is
the sky - but fog only ever tints what is underground, so it gets its own
`FOG_COLOR_RUSH` and is fully underground-coloured before halfway down.

### The lighting is recalibrated, and the SHAPE changed, not just the values

Standard adds a specular lobe, so every light now contributes a highlight as
well as diffuse. Turning things down is not enough: **the ambient had to fall
away much faster**, because ambient is the one light that reaches every surface
equally, which is the exact opposite of a lamp in a dark hole. It is squared
now rather than linear, so the drop lands in the first third of the descent
where it can be felt. Surface 1.30, deep floor 0.10, rim 0.42 to 0.03, lamp
raised 30 to 44 to carry the work the fill light stopped doing.

The snapshot was re-recorded deliberately after reading the diff, and three
INTENT tests were added alongside it, because the numbers will drift again and
the shape must not: the fill is gone before the bottom of the ramp, the lamp
outguns the deep fill by a large factor, and fog reaches its underground colour
before the sky does.

**Cost, measured at the deep worst case: 0.443 ms/frame against 0.345 for
Lambert** - about 28% more, and 2.7% of a 60 fps budget. 55 draw calls of a 70
budget. Affordable with a lot of room, and instancing is why: the shader runs
per pixel, so the block count never enters into it.

## The realism pass, part two: the ship (2026-09-08)

Playtest: *"change the ship to look less bubbly and cartoonish... make it so
upgrades to the ship show visual changes."*

Three things were doing the "bubbly", and none of them was the amount of detail:
a **sphere** for a canopy (a sphere has no orientation and no facets, so it
reads as a bubble at any size), **bright saturated cyan**, and the fact that
every part was a cylinder. It is a faceted wedge canopy, gunmetal with one worn
ochre accent, and chamfered blocks with exposed struts now.

### The ship has its own lighting layer, and that is the load-bearing part

The ship rendered as a **white blob** whatever colour its hull was painted, and
it took an embarrassing number of passes to find out why: the lamp is a point
light sitting ON the ship, so the ship was about four times closer to it than
the rock it was lighting. Every albedo arrived saturated.

Worse than the look: the ship's brightness moved with `S.light()`, so **buying a
Scanner level changed how the ship looked** - a gameplay upgrade reaching into
art direction by accident.

The ship is on layer 1 now. Ambient and rim reach it, the lamp and the sun do
not, and it carries one small warm key light of its own. It therefore looks the
same at ten metres and at ninety, which is what lets its material read as metal
at all.

**Two dead ends worth recording, because both looked like the answer.** Lowering
metalness did nothing on its own - a metal with no environment has no diffuse
term either, so it is specular hotspots and black. And the procedural env map
that fixed *that* then needed its own colour space set, or the reflection comes
back about four times too bright. Both are in CRAFT.

The diagnosis was only settled by measuring: hiding the ship entirely, then
reading back actual pixels with `gl.readPixels` and recolouring materials one at
a time. The mesh everything had been blamed on turned out to be a small cap at
the top; the pale mass was the *steel* parts, and their values were warm
mid-greys - "white" was mostly the contrast against very dark rock.

### Upgrades bolt on hardware

Every upgrade adds something to the OUTLINE, because at thirty pixels the
silhouette is the only thing that reads - the drill-tier repaint already proved
that the expensive way. Tanks stick out sideways, radiators break the top edge,
the sensor mast and dish break it again, the cargo pod squares off the back, and
the drill itself grows with its tier. Thresholds are spread across each ladder
rather than bunched at the top, so the early purchases are the visible ones.

**They are instanced.** The first version bolted on thirteen separate meshes and
took the worst case from 55 to **67 draw calls against a budget of 70** - three
from failing CI, for what is four copies of two shapes. One InstancedMesh per
KIND, with `count` as the upgrade lever, brought it to 60 and made the count
stop moving with how upgraded the ship is.

## The Outfitter is a room (2026-09-08)

Playtest: *"can you rearrange how the shop is layed out? make it look like a
full room where upgrades have a physical model associated with it instead of a
list of upgrades"* and *"when you upgrade thrusters and it starts to change the
way they look, it also changes the way that they look when you're actually
playing."*

`src/station.ts` is a second three.js scene: a hangar bay with the ship parked
on a deck and the upgrades racked around it in lit display cases. Tap a case,
get a card with the level, effect, price and mineral gate; buy from there. The
scrolling shelf list is gone, along with the painted CSS window it sat under.

**Two decisions carry the whole thing, and both are about there being ONE set of
objects rather than two.**

*The ship in the room is the ship.* `player` is reparented out of the game scene
into the station scene - three removes an object from its old parent when it is
added to a new one, so that is the entire mechanism. The machine on the deck is
wearing exactly the hardware it will undock with, and buying something changes
the thing you are looking at. A copy would be a second source of truth and would
drift inside a single session.

*The parts in the cases are the parts.* `HW` is exported from ship.ts and used by
both, so the model on the pedestal is not a picture of the upgrade - it is the
upgrade. That is what makes the answer to his question structural rather than a
promise: there is no second set of art that CAN disagree.

There is an e2e test on exactly that guarantee: buy tanks in the room, undock,
and count the instances the ship is drawing underground.

### The room is tall because the phone is

Portrait is ~0.46 aspect, so at a 46 degree vertical field the horizontal one is
only ~22 degrees: eight units back shows 6.8 units of height and barely 3.1 of
width. The first version was a hangar laid out sideways - the obvious shape -
and most of it was off the edges of the screen. The cases are in two vertical
columns flanking the ship now, which is both what fits and what a parts wall in
a workshop actually looks like.

### Four bugs, and the third is the one that would have shipped

- **`mustEl` caught the dead `#vSky`** the moment the old markup went. The error
  overlay did its job.
- **The ship was invisible in the room.** It is on its own layer so the game's
  lamp cannot blow it out, and that decision follows it: without enabling
  `SHIP_LAYER` on the station camera and lights, the camera does not render it
  and the lights do not reach it. It presented as an empty docking clamp.
- **A tap in the same tick the room opened did nothing.** A raycast reads world
  matrices, and those are only refreshed by a render - so before the first frame
  every bay was still at the identity matrix and the ray missed everything. It
  worked the instant one frame had gone by, which is exactly the kind of bug
  that reproduces on a fast tap and nowhere else. `pickBay` calls
  `updateMatrixWorld(true)` first now. **Found by a test, not by playing.**
- **The parked ship kept burning its engines**, because the thruster animation
  is downstream of the branch that returns for a docked ship, so whatever the
  flames were doing on the way in is what they kept doing.

### Smaller things worth keeping

The station gets `scene.background`; the game deliberately has none so its CSS
sky shows through, which in the room showed as a band of planet-coloured sky
above the back wall. A scene background is per-scene, so setting one here does
not disturb that.

Supplies became three chips on one line. As a stacked list they were a third of
the screen, and they are consumables with a count and a price and nothing else
to say - the room should keep the space.

## Reading the room without tapping it (2026-09-08)

Playtest: *"can you label each upgrade so that it is easy to tell what it is
without clicking on it, and doing something to visually show that certain
upgrades aren't available or you don't have enough money to purchase it by
dimming it."*

**Labels are canvas plates on the plinths**, not HTML floating over the room. A
label that belongs to the case turns and moves with it the way a museum label
does; HTML would hover in front of everything and stop the room being a room.

**Their size was decided by the screen, not by taste.** At this camera the
visible width is about 3.5 world units across 375 CSS pixels, so a 0.66-unit
plate is roughly 70 px. That is a six-character word and nothing more - which is
why the plates read DRILL and THRUST rather than "Drill Bit" and "Thrusters".
The full name is in the card the moment you tap.

**Four states, each said three ways** - the strip of light along the plinth, the
plate's second line, and how far the alcove is shuttered - so it reads at a
glance and also survives being colour-blind, which a colour-only code would not:

| | strip | line | alcove |
|---|---|---|---|
| ready | cyan | the price | clear |
| short | amber | what is missing | smoked |
| sealed | off | the depth | smoked harder |
| max | green | MAX | clear |

**The part is never dimmed by touching its material**, because those materials
are shared with the hull - dimming a case would dim the same part bolted to the
ship parked in the middle of the room. A smoked panel in front does the job and
keeps the one-set-of-objects promise the room is built on.

### The decision is pure, and the ordering is the design

`shelfState()` lives in config.ts and is unit tested, because which state wins
when several apply is judgement, not drawing. Sealed beats everything: quoting a
price for something no amount of money can buy is a lie, and the depth IS the
price. Maxed beats affordability. And when you cannot afford it the MINERAL is
named ahead of the credits, because credits are what the loop pays constantly
and a mineral you have never seen is the thing actually stopping you.

**One of those tests was passing for the wrong reason.** "A depth lock beats
being able to pay" used a rich player, and a rich player reads as sealed whether
the depth check runs first or last - so it proved nothing about the ordering. A
mutation of that ordering was caught by a different test entirely, which is how
it surfaced. It tests broke-and-sealed now, which is the case where the two
orderings genuinely disagree: the wrong one says "short" and sends the player
off to earn money for something money cannot buy.

### Two small ones

The state strip was first placed at the plinth lip, which is *inside* the
plinth's own top slab, so it rendered perfectly into the middle of a solid box.

A run of the e2e suite reported nine failures that were all my own fault: I
started Playwright while a backgrounded `npm run build` was still writing
`dist/`, so it was testing a half-written bundle. Every one passed on a clean
run. **Do not start the smoke tests while a build is in flight.**

## Light that travels down the tunnel (2026-09-08)

Gideon: *"Instead of seeing a cone of light, I want the light to look like it
actually spreading from the ship. When a tunnel is dug down or to the side,
light should fill those tunnels and spread to nearby rocks, but areas that are
multiple rocks deep should be very dark."*

The lamp was a `PointLight`, and a point light does not know the rock is there.
It falls off with distance and nothing else, so a side branch the player had
never opened was lit exactly as brightly as the shaft they were flying down.
Being underground read as "the picture got darker" rather than as "I can only
see where my lamp reaches" - and there was no way to tune that away, because the
information simply was not in the renderer.

**`src/light.ts` is a real solver, and it is pure.** A Dijkstra flood over the
cell grid where light travels through OPEN cells only, eight-way, diagonals
costing `sqrt(2)` and refused entirely when both corners are rock. What each
cell stores is not brightness but VISIBILITY:
`exp(-att * (pathLength - octileDistance))` - how much longer the light's actual
path was than a clear run through open air. Open space therefore comes out at
exactly 1 and only geometry can take anything away.

Getting the baseline right matters more than it sounds. Subtracting Euclidean
distance instead of octile puts a permanent, ever-thickening haze over open
ground, because eight-way steps do not add up to a straight line. There is a
test that asserts every cell of an empty grid comes back at exactly 1.

**Distance falloff is deliberately NOT in the grid.** It is computed per pixel
in the shader from the ship's exact position. The grid cannot move smoothly and
the ship can; leave the pool in the grid and it steps a whole metre at a time as
you fly. That split - geometry on the CPU, distance on the GPU - is most of why
this feels like lighting rather than like a tilemap.

**Rock is relaxed but never expanded.** A wall beside a lit tunnel is lit, and
light stops there. Letting rock pass light on leaks about a third of the lamp
through a one-cell wall, so every sealed pocket in the game would glow faintly
and tell the player it was there before they dug to it. The fade INTO the mass
is a separate seep pass that only ever writes to rock, so it cannot leak into
open air either. Three cells at 0.32 gives 0.32, 0.10, 0.03 - a gradient, not a
cliff at the first wall.

**It reaches the shader as a 15x36 texture.** `LinearFilter`, so light fades
across a rock face instead of stepping at cell edges; 2 KB, re-uploaded once a
frame. The solve itself only runs when the ship changes cell or the terrain
changes shape, which `blocks.rebuild()` already knows about - one
`markLightDirty()` there covers digging, tremors and planet changes without any
of them having to remember.

The injection multiplies `reflectedLight` after `<lights_fragment_end>` and
leaves `totalEmissiveRadiance` alone, so **ore keeps glowing in the dark** -
which in a mining game is the whole find-the-ore mechanic. It is clamped to at
most 1, so it can only ever darken: every lighting value in `feel.ts` is still
the ceiling it was calibrated to be.

**Lighting surfaces turned out to be only half of it.** A dug cell contains no
geometry, so there is nothing in it to light and a tunnel still read as an empty
slot. The fix is one additive quad across the frame sampling a SECOND channel of
the same texture, non-zero only where a cell is open: the void near the ship
glows, the far end of a branch stays black. One draw call, and it is the single
change that made the whole feature read.

**The headlight cone is gone.** It was a shape drawn where light was *supposed*
to be - it pointed the way the drill pointed, ended at a hard mouth, and went
through solid rock as happily as through air. Once light actually propagates the
cone contradicts the thing next to it. The one job it was uniquely good at,
giving the Scanner a silhouette, moved to the size of the lamp's own glow, which
sits BEHIND the ship: in front, an additive quad centred on the lamp washes over
the hull and the ship renders as a bright blob with no facets, which is the
exact fault the render layers were added to fix arriving by another route.

**Cost, measured rather than assumed:** 69 draw calls against a budget of 150,
0.76 ms per tick including render, at 50 m with a shaft and a branch dug. The
solve is a few hundred cells and does not run most frames.

**Two shader traps came out of this, and both are now in CRAFT.md.** A material
has exactly one `onBeforeCompile`, so assigning it silently deletes whatever was
already there - everything now goes through `chainCompile` in `src/shader.ts`.
And `Material.clone()` copies neither that nor `customProgramCacheKey`, so the
drilled block - the only cloned material in the game - came back as stock three
with no displacement and no light. Both are guarded by an e2e test that reads
the compiled shaders back out of WebGL, which is the only layer that can see the
difference: the material is fine, it is the compile that lost it.

**One tuning note for the phone.** These numbers were set on a desktop against a
375x812 viewport, which is the right size but the wrong screen. `LM_FLOOR_DEEP`
is the first thing to raise if unopened rock reads as a black rectangle rather
than as rock; `LM_ATT` is the first thing to lower if turning a corner is
disorienting rather than atmospheric.

## The lamp gets a direction, and corners get an edge (2026-09-08)

Gideon, on the first version: *"I want the light to be coming from the front of
the ship, so if I am facing down, the whole tunnel down is lit up but dims
behind me. I also want sharp shadows to show for crossing tunnels ... a
realistic feeling angled shadow that fills more and more of the tunnel as I get
further away."*

Both were things the flood could not express, and for the same reason: a flood
that turns a corner arrives from that corner in every direction at once. It has
no notion of a straight line, so it has no notion of an edge.

**A second solver, in the same pure module.** `castShadows()` fans 512 rays out
from the lamp by grid DDA and records, per angle, how far light gets before
something stops it. That one-dimensional map goes to the shader as a 512-texel
texture; a fragment is in shadow if it is further from the lamp than the
occluder on its own bearing. Sharp by construction, and the wedge behind a
corner widens with distance for free, because that is what a fan of rays does.

It runs **every frame**, not on cell changes, because the entire point is that
the shadow moves as the ship does. A few thousand grid steps: it does not show
up in a measurement.

The one thing it has to get right is which side of a wall it records. The FAR
side, not the near side - a rock face is the surface the lamp is falling on and
has to stay lit, and shadow starts behind it. Recording the near side puts every
rock face in the game into its own shadow.

**The lobe is per-pixel, from the ship's smoothed facing.** Local forward is -Y
and `FACE_ANGLE.down` is zero, so grid-space forward is `(sin, cos)` of
`rig.rotation.z`. Taken after the facing update in the frame rather than before,
or the beam trails the ship round every corner. Omnidirectional within about
three cells, because a real lamp lights its own surroundings whichever way it is
aimed - without that the ship sits in a hard-edged half-disc of its own shadow.

**Beam and bounce, combined with max().** The first attempt multiplied a
"how much survives behind the ship" floor by a "how much survives in shadow"
floor, and anywhere that was both came out at the product - four per cent of
four per cent, which is black. That erases the shaft you came down, which is the
way home. Now there is one omnidirectional, unshadowed bounce term at 0.22 of
the beam, and the answer is whichever of the two is larger. Both are still gated
by the flood, so it lights tunnels you have opened and never solid rock.

**The grey wash, and why it was not what it looked like.** After all of the
above the world still read as a flat grey rather than as dark, and the obvious
suspects - the lamp's intensity, ambient, the fog, the parallax, the backdrop -
were all measured and all innocent. Two real causes:

- **Gamma.** The multiplier scales LINEAR light and the result is then
  sRGB-encoded, so six per cent of the lamp displays at about a third of full
  brightness. `LM_CONTRAST` squares the multiplier before it is applied, which
  puts the falloff back where the eye expects it.
- **A uniform that was declared and never supplied.** `inject()` listed the
  uniforms it passed through by hand, and the shadow fan's three were added to
  the DECL and to the haze but not to that list. GLSL gives a missing sampler
  texture unit zero and a missing vector all zeroes, so the terrain compiled,
  ran, and ignored every shadow in the game - while the haze, which listed its
  uniforms in a different place, worked perfectly. Half the feature working is
  the worst possible symptom, because it looks like a tuning problem.

  `inject()` now loops over the uniform object instead of naming keys, the haze
  spreads the same object, and there is an e2e test that pulls the `uniform ...
  uLmX;` declarations out of the compiled fragment shader and fails on any the
  material does not supply. Mutation-tested by dropping one.

**Rock was cutting through the glow in the tunnels**, which Gideon spotted and
which had a boring cause: the displacement shader pushes rock vertices a fifth
of a cell forward, so tunnel walls bulge to z 0.7 and drew over a haze quad that
was sitting behind the terrain at -0.55. The haze moved in front of everything
instead - it adds nothing on rock anyway, because its channel is zero there -
and the ship moved with it, because an additive quad centred on the lamp washes
the hull flat if the ship is behind it. The stack is now rock 0.7, haze 0.74,
glow 0.80, ship 0.95, and it is written down in CLAUDE.md because the next thing
that wants a z will have to fit into it.

**Cost:** 48 draw calls of 150 and 0.73 ms a tick, measured at 20 m in a
crossing corridor. The fan and the extra texture fetch are not measurable
against the rest.

## Four notes from the phone, and one that was a real bug (2026-09-08)

Gideon, on v0.12.1: *"each block shows that angled shadow. that should only
show on actual branched off tunnels ... I want light behind the ship to have
more of an ambient glow rather than that sharp beam look ... rocks to the sides
of the tunnel should be a bit brighter and gradually dim, so around 3 layers
should be visible ... rocks any further than that should be almost completely
black ... you shouldn't be able to see the mineral type or color."*

**The per-block shadow was shadow acne, and the cause is worth keeping.** The
fan recorded where each ray happened to LEAVE the wall cell it hit. Per ray
that is exactly right - a point inside the cell is always between entry and
exit. But the shader does not sample one ray: it interpolates between the two
nearest, and those two may have clipped quite different parts of the wall, or
missed it. So parts of a cell come out beyond their own occluder and go dark.
Measured, it was thirteen per cent of every wall face, and on screen that is a
hard diagonal across every block in the frame.

The fix is to record the distance to the farthest CORNER of that cell, which is
large enough and smooth enough across the cell that no fragment of it can fall
behind. The rule the fan exists to express was always "the first wall is lit",
and a wall is a whole cell.

**The test for it took three goes**, and the two failures are the interesting
part. The first sampled cell centres, which pass either way. The second used a
nearest-ray lookup, which cannot see the artefact at all - the artefact only
exists once two rays are blended. The one that works interpolates exactly as
the shader does and asserts a RATIO across a wall face: under five per cent
lit-face-in-shadow passes, the old rule gives thirteen. Mutation-tested.

**A grep-and-replace destroyed `src/light.ts` mid-session.** A `cp` from a
backup path that did not exist truncated the file to zero bytes, and the fix
had not been committed. Recovered from HEAD and reapplied by hand. This is the
second time this session that shell file juggling for a two-line experiment
cost real work; the first was `git checkout -- src/loop.ts` in an earlier one.
Use the editing tools for source, and if an experiment needs the file swapped,
swap it with an edit that can be swapped back.

**Two tests asserted on a value nobody sees.** Both the golden "rock fades into
the mass" and the e2e "four cells into solid rock" were written against the raw
light field. The shader squares that field before applying it, so the raw value
and the displayed one differ by a lot at the dark end - and both tests failed
the moment the rock gradient was retuned to exactly what the playtest asked
for. A test that fails when the code becomes more correct is a test aimed at
the wrong layer. Both now assert on the post-contrast value and read in the
same units the playtest note did.

**The rest was tuning, all of it in feel.ts:**

- Seep 0.32 to 0.62. Read as what lands on screen - which is after the contrast
  squares it - that is 1.0, 0.38, 0.15, 0.06: a wall, two readable layers, a
  third that is nearly gone, nothing past it.
- The bounce got its own falloff, 1.7x the beam's reach on a much gentler
  curve. Sharing the beam's pool meant the glow behind the ship ended exactly
  where the beam did, with the same hard edge, which is the one thing the soft
  half must not do.
- Glow - emissive rock, ore crystals, haloes - now goes through `coreGlow()`, a
  square-root curve over a small floor, rather than being exempt. Ore glowing
  through unlit rock is the find-the-vein mechanic and must not switch off, but
  at full strength a vein five cells inside the mass read as clearly as one you
  were about to break into. `LM_GLOW_FLOOR` and `LM_GLOW_POW` are the dial if it
  has gone too far the other way.
- The haze channel gives solid cells half their value instead of zero, so the
  glow in a tunnel spills onto the lip of its walls. That is what "the rocks
  still stick up past the fog" turned out to be: the displacement pushes wall
  vertices a fifth of a cell into the tunnel, and those bulges sat in a lit
  shaft with no light on them.

**Cost unchanged:** 56 draw calls of 150, 0.83 ms a tick.

## The build that went red and sat there (2026-09-08)

Gideon: *"Are you still working on this? It doesn't look like it is updating on
my phone?"* - which is the worst way to find out a deploy failed.

**What actually broke.** The lighting commit went red on CI and the smoke job
took the two deploy jobs down with it. The failing test was
`a block remembers how far through it you were`, and it had nothing to do with
lighting on its face: it drives the drill by holding a real d-pad for 600 ms at
a time and counting bursts. The frame loop clamps its delta, so a burst of 600
milliseconds of WALL CLOCK delivers some smaller, unknown amount of GAME time -
and how much depends on how heavy a frame currently is. Under SwiftShader on a
CI runner, the extra per-frame cost of a shadow fan and a heavier fragment
shader was enough that thirty bursts stopped adding up to the 2.5 seconds of
granite the test needed.

The failure message said the damage was being thrown away when the drill stops.
That was not true and was not close, which is the real cost of a wall-clock
test: it fails in the vocabulary of the feature, pointing at code that is fine.

It is on the tick seam now - fixed 0.3 s bursts, deterministic on any machine,
four seconds instead of twenty-five. Mutation-tested by disabling the damage
write, which is what it claims to catch. **The rule was already in PIPELINE.md**
- wait on game state, never on wall-clock time - and this test predates it.
Worth a sweep for the others.

**How it reached him.** I said "pushed, CI running, I'll confirm" and left a
background poll to do the confirming. That poll hit the unauthenticated GitHub
API every 15 seconds, burned the 60-an-hour budget, started getting rate-limit
JSON instead of run status, and then printed **nothing at all** and exited
zero. Silence read as "still running".

Two things to keep: poll a remote API at 30 seconds or slower, and **a check
that cannot determine the answer has to fail loudly** - printing nothing is
indistinguishable from "not finished" and from "green". Both are in PIPELINE.md
now.

**And one bug I introduced while investigating.** Making `updateLight` skip its
work on ticks that do not draw looked free - nothing below that line is read by
anything but a shader. It is not free: it silently turned the smoothing rate
into "per drawn frame", and under the headless seam that is one step per half
second of game time, so the field chased a target it never caught. The fix is
to carry the skipped time rather than drop it - exponential smoothing composes
over an interval, so handing the drawing tick the whole gap gives the same
answer as never having skipped. Caught by the lighting test asserting the cell
the ship sits in was fully lit; it was at 82 per cent and still climbing.

## Two lights, not one (2026-09-08)

Gideon, after the third pass: *"I think I am explaining what I want wrong.
there should basically be two types of light. one will be the light in the
tunnels, which will disperse and spread through all of the connected tunnels
... the second type of light I want is on the rock faces and separate from the
tunnel light."*

He was not explaining it wrong. He had been describing two lights from the
first message and I had been building one, so every note about the shadow read
as a bug in the shadow rather than as a bug in where the shadow was applied.

**The whole fix is a fork.** The terms are shared - flood, pool, beam lobe,
bounce - and the two lights differ in exactly one thing:

    ROCK   flood x pool x lobe                    (no shadow, ever)
    AIR    flood x pool x lobe x shadow           (or ambient, whichever wins)

A rock face is lit by being NEAR a lit tunnel. That is a property of the rock,
not of the sightline to it, and running the ray fan over it was what put a hard
diagonal across every block in the frame. The acne fix in the previous session
was real and necessary, but it could only ever clean up a shadow that had no
business being on walls in the first place - which is why "we are still getting
angle shadows from the blocks" survived it.

The air is the opposite: it is lit by light arriving ALONG the tunnel, and a
corner in the way is exactly what stops it. That is where the fan belongs, and
it is the only place it now runs.

**The two also want different ambient, by a lot.** Sharing one bounce figure
made every branch read as a hole. A tunnel is a space full of dust with light
bouncing off every wall in it; a rock face the beam is not on is simply dark.
`LM_AIR_AMBIENT` is 0.62 against the rock's 0.22, and that difference is what
lets a branch the beam cannot see into still read as somewhere you could go.

**The pool stopped being a boundary.** Cubed was right when the pool was the
only thing describing reach; the flood and the fan do that now, so it went to
1.6 and gained a forward stretch - reach divided by `1 + 0.85 * max(0, ahead)`,
which makes the lit area an egg pointing where the drill points rather than a
circle with a bright half. That was the other half of his note: *"fade more
gradually and see further forward, rather than just an even circle."*

**Cost:** 48 draw calls of 150, 0.68 ms a tick - cheaper than the fused version,
because the rock path no longer samples the shadow texture at all.

**The lesson worth keeping is not technical.** Three rounds of notes all
pointed at the same structural mistake, and I read each one as a tuning
request: acne, then gradient, then "still getting angle shadows". The tell was
that the same complaint kept coming back after a fix that genuinely worked. **A
note that survives a correct fix is a note about a different thing** - and the
fourth message, where he said he was explaining it wrong, was him doing my job
for me.

## The ship was never on its own lighting layer (2026-09-08)

Gideon: *"the ship is very bright. I want it to look more like light is coming
from the ship, rather than being shined on the ship."*

The hull is dark gunmetal and it was rendering at 255,255,246. I darkened it
three times, took the ship off the sun, and cut its key light to a seventh, and
the render did not move. **That is the signature of a constant term drowning the
one you are adjusting**, and it took far too long to stop tuning and go looking
for it.

Two constants, as it turned out.

**Object3D.layers does not stop a light reaching an object.** Layers decide what
a CAMERA draws. three collects a scene lights once and hands all of them to
every lit material; there is no per-object light filtering in the forward
renderer. The comment in scene.ts had been claiming otherwise since the realism
pass and it was simply false. The lamp is a point light of intensity 44 sitting
ON the ship, and it had been lighting it all along.

Measured, once I thought to: mean ship brightness 199 of 255 with the lamp on,
72 with it off, everything else identical. That is the whole complaint.

The fix is two passes - the world without the ship, then the ship alone with the
lamp momentarily at zero, autoClear off so the depth buffer survives. It costs
no extra draw calls, because the same objects are drawn either way. It does cost
about 0.4 ms in this browser, and it needed renderer.info.autoReset = false with
a manual reset, or the draw-call guard would have been measuring the ship pass
alone - thirty of a hundred and fifty - and passing for the wrong reason.

**The metal environment map was decoding two and a half times too bright**,
because a CanvasTexture defaults to NoColorSpace and the gradient is sRGB. That
matters more than it sounds: a metal has almost no diffuse term, so with a dark
albedo the environment IS the visible brightness. It is why the hull ignored
being repainted even after the lamp was dealt with. **If a metal will not
respond to its own colour, look at the environment first.**

**What the ship looks like now.** Nearly black hull, a lit canopy, two cyan
running lights, and - new - two headlamp housings on the nose with fully
emissive lenses. That last one was an oversight from the lighting work: the glow
that stands in for the lamp had to move BEHIND the hull to stop washing it flat,
which left the machine lighting the entire cave with nothing on it that looked
like a lamp. Emissive answers to no light in the scene, so they are as bright at
ninety metres as at one, which is exactly what makes them read as the source.

## Panels that are made of something (2026-09-08)

Same note, second half: *"can you see what you can do to make the buttons,
gauges, ship, and landing pad match the more gritty and realistic look?"*

The HUD was translucent blue-black glass with 9-13 px corners - a clean sci-fi
overlay, which is a good look and the wrong one when the world underneath it is
photographed rock. The controls were the only part of the screen with no
material at all.

One plate does all of it: a rolled-steel gradient, a 3-4 px corner, a bright top
edge and a dark bottom one, and a generated grain over the top. grain.ts draws
64 px of fine speckle plus a coarse mottle plus a horizontal streak - the streak
is what gives it a rolling direction, without which noise reads as television
static rather than as metal. Deterministic hash rather than Math.random, so two
screenshots a day apart are comparable. Zero bytes on the wire.

First attempt had the grain at alpha 74 and it looked like static. **The tell is
that you notice the texture before you notice the panel**; it wants to be felt
and not seen. 26 is right.

The other change worth keeping is the pressed state. It used to flood cyan,
which was the loudest thing on screen at exactly the moment a thumb was covering
it. It now inverts its bevel and drops a pixel: a physical control does not glow
when you touch it.

The pad went from Lambert to Standard with the terrain own grit map, the metal
environment, and generated hazard striping - diagonal bars scuffed with
scratches and dirt, drawn for the same reason the pad is built from primitives
rather than imported: a downloaded decal arrives with its own resolution and its
own idea of how worn "worn" is, and the join to hand-tuned flat-shaded geometry
shows in the first frame. It also takes the propagated light now, so it goes
dark as you drop below it instead of staying lit in a hole.

68 draw calls of 150, and that number is honest again.

## Gauges, not progress bars (2026-09-08)

Gideon: *"the Fuel, Hull, and Cargo bars still seem kind of out of place. Can
you make them look more in theme with a space ship or scifi. Maybe Matrix
themed? They can also be rearranged or turned into realistic gauges."*

A progress bar says "something is loading". These are three of the four things
you read while flying, so they should look like readings.

Four changes, none of which is a picture:

- **Segmented fill.** A repeating gradient punches opaque gaps through
  everything under it, so the fill reads as a bargraph rather than as a liquid
  level. A second, faint pass paints GHOST segments in the unlit half, which is
  the difference between a gauge at zero and a gauge that is switched off.
- **Scanlines and a glass sheen**, so it reads as a lit display behind glass.
  The first version also had a vignette, which was fighting the sheen: centred
  below the gauge it darkened the TOP, exactly where the sheen was.
- **A number.** Fuel especially - a bar tells you roughly where you are, and
  fuel is the one reading that decides whether to turn round.
- **Readout windows.** The label and the value sit in their own small dark
  panels rather than floating over the segments. A lit bargraph is a terrible
  background for small type, and a gauge at 90% would have put white text on a
  bright fill exactly when you most need to read it.

**The rearranging was the part I would not have done unprompted, and it was
the biggest single win.** Three gauges sharing 375 px left about twenty pixels
of actual bargraph between the label and the value - the instrument was mostly
captions. Fuel and hull now share a row at double the width and cargo sits
underneath at full width, where its longer readout fits. He offered the option
in the same sentence as the theme, which is worth noticing: **a note that
includes "or you could rearrange it" is permission to change the layout, not
just the paint.**

The channel colour is one custom property per gauge and the fill, glow, ghost
cells and caption bloom all derive from it, so a fourth gauge is one line.

## Two brass dials instead of three bars (2026-09-08)

Gideon: *"Instead of having what looks like status bars at the top for these,
can you make them look more like analog gauge? Have the fuel gauge toward the
bottom left that looks like a cars fuel gauge with a tac. Inside that, have a
weight gauge ... then add an indicator for hull health ... Stylize them to look
like old mining or diving gauges/equipment."*

The bars had just been redone as segmented instrument readouts and they were
still wrong, and the reason is worth writing down: **they were at the top of
the screen, which is the one place you are not looking while flying.** The three
readings that decide what you do next were the furthest thing from the action.
Making them prettier could never fix that. The corner beside the left thumb
could.

**Two dials, three readings.** The big one carries fuel on the main scale, drill
load on the outer ring like a tachometer, and cargo on a sub-dial let into its
face. The small one is hull, with heat soak as a sector eating DOWN from the
full end of the scale - the same relationship the old bar had, where soak and
hull advance from opposite ends because they are not the same quantity.

**SVG, and `pathLength="100"` is the whole trick.** It renormalises a path so
its length is exactly 100 whatever the real geometry, which makes "show 62 per
cent" into `stroke-dasharray: 62 100` with nothing needing to know the radius.
It is also the reason the heat assertion survived the bars being deleted: the
drawn fraction IS the first number of the dash array, so a test can read the
rendered value off the shape the player is looking at.

**Ticks are generated.** Thirty hand-placed lines of SVG is thirty chances to be
half a degree out, and all of it would have to be redone for the second dial.
Four lines of trigonometry instead.

**The needles have mass.** Each one eases toward its reading rather than
snapping, and that single detail is most of what separates an analog gauge from
a bar with a pointer on it. Fuel is heavily damped because it only ever falls
slowly; the load needle is quick because it is showing something that changes in
a tenth of a second. `R.load` is new - the drill while cutting, the thrusters
while firing - and it exists only because the panel wanted a needle for it.

**Three test breakages, all the same shape.** The soak assertion read a bar
width; the fuel assertion read a bar width; the hull label read `innerText`.
All three were reading the old presentation rather than the reading itself, and
`innerText` in particular fails on an SVG `<text>` with "Node is not an
HTMLElement", which reads like a broken selector rather than a changed element
type. **A test that names an implementation detail of the view breaks every
time the view changes, and it breaks in a way that does not say why.** The
replacements read the dash array, the printed percentage and `textContent` -
all things the player can see.

## The last thing that ignored the light field (2026-09-08)

Gideon: *"there still appears to be a circle of light that surrounds the ship on
the tunnel level of the light ... this makes it look like light is clipping
through the rock."*

`lampGlow` - two additive sprites centred on the ship, standing in for "there is
a lamp here". It predates the propagated light entirely, and additive quads know
nothing about geometry, so it painted a soft circle over whatever was behind it,
solid rock included. Every other source in the frame had been brought under the
light field over three sessions; this one was never revisited because it was
doing its original job perfectly well.

**It is gone, and nothing replaces it.** The propagated light already puts light
in the tunnel and the emissive lens housings on the nose are the visible source.
The only thing lost was the Scanner's silhouette - the halo used to grow with
the upgrade - and that moved to the lenses, which is the more honest version
anyway: a bigger lamp rather than a bigger smudge. They are a third of a cell
across and sit on the hull, so they cannot paint over anything.

**The lesson is about the sequence, not the sprite.** A fake put in before the
real system exists does not announce itself when the real system arrives - it
keeps working, and it keeps being the one thing in the frame obeying different
rules. The cone went when the light started propagating; this halo survived two
more rounds of "the lighting still looks wrong" because it was small enough to
read as part of the ship. **When a lighting model lands, audit everything that
emits light, not just the thing being replaced.**

Also this round: the fuel dial lost its outer tachometer ring. *"dont want the
gas gauge to have the blue bar that goes up when the moving or digging."* It was
asked for one round earlier and it was wrong in practice for a reason worth
keeping: **a gauge you check under pressure should not be moving for reasons
unrelated to the check.** Fuel is the reading that decides whether to turn round,
and a second arc sweeping round it every time you touch the d-pad turns a
glance into a parse.

## The circle was mine, twice (2026-09-08)

Gideon, after the halo sprite was deleted: *"it looks the tunnel light is still
showing in a circle around the ship and shows on the face of the rocks, making
the sharp shadows not quite look right."*

Two different things had been making the same shape, and I fixed the first and
assumed it was the only one. The second was `LM_HAZE_SPILL`.

It was 0.5: every solid cell touching open air took half the tunnel's glow into
the haze channel. I added it to stop wall bulges reading as unlit rock inside a
glowing shaft - and that was the wrong fix for that problem, because moving the
haze quad in FRONT of the terrain solved it properly one version later. The
spill stayed, and what it actually did was paint an additive warm wash over
every rock face near the ship: a circle, over the rock, softening the very
shadow edges the ray fan exists to draw.

At zero, the glow is exactly the shape of the tunnel - a clean cross at a
junction - and the half texel of bilinear softening at an open/solid boundary
handles the bulges on its own.

**The lesson is about leaving a fix in after its cause is gone.** The spill was
correct when it was written. It became wrong the moment the depth ordering
changed, and nothing failed - it just quietly became the largest thing in the
frame that ignored geometry. **When you replace the reason for a workaround,
delete the workaround in the same commit,** or it becomes indistinguishable
from a deliberate choice.

Kept as a constant at zero rather than deleted, because it is exactly the dial
to reach for if a wall bulge ever reads as a hole in the glow again.

## The circle was the texture filter (2026-09-08)

Third time asked, third different cause, and this was the real one.

Round one it was a halo sprite. Round two it was a deliberate half-cell spill.
Both were genuinely making a circle, both were removed, and the circle was
still there: *"it looks like we are still getting the circle of tunnel light
coming from the ship and it looks like it bleeds through the rock still."*

**I stopped guessing and printed the air channel across the ship's row:**

    0   0   0   0   0   0   0 255   0   0   0   0   0   0   0

One texel. That is the whole tunnel - the grid is one texel per CELL and a
tunnel is one cell wide. Sampled with `LinearFilter`, a one-texel spike ramps
to zero only at the NEIGHBOURING texel's centre, which is a full cell into the
rock in every direction. A one-cell corridor was painting a three-cell soft
blob. The data was perfect; the filter was the bug.

**The fix separates brightness from shape.** R stays the eased light value; G
becomes a hard openness bit, 255 or 0. The shader multiplies them and puts the
mask through `smoothstep(0.5, 0.98)`, which is not a fudge factor: bilinear
leaves exactly 0.5 at a cell boundary and 1.0 at a cell centre, so
re-normalising that range lands the glow precisely inside the open cell -
brightest down the middle, gone AT the rock face.

They had to be separate channels. Sharpening the old combined value would have
crushed every dim tunnel to black, because "dim" and "outside the tunnel" were
the same number.

**The lesson is about how long it took.** Two rounds were spent removing things
that were genuinely causing a circle, which made each removal feel like
progress and each remaining circle feel like "not quite enough". The thing that
actually ended it was reading the buffer instead of reasoning about the
picture - fifteen numbers, one call, and the answer was unambiguous. **When a
symptom survives two correct fixes, stop fixing and start measuring.**

## Resolution, not filtering (2026-09-08)

Gideon, with two screenshots and a red circle round the artefact: *"that helped
but we are still getting this overlapping rounded look. do you know what is
causing this?"*

Same family as the last one and a bigger cause. The light grid held **one texel
per cell**, and `LinearFilter` interpolates between the CENTRES of neighbouring
texels - so every boundary in the lighting was a soft ramp a full cell wide. A
single rock face could be half lit with a rounded edge curving across it, and
what the player was reading was the shape of the light grid rather than the
shape of the rock.

**One toggle proved it.** Switching the texture to `NearestFilter` made the
blobs vanish instantly and replaced them with hard rectangles. Neither is right,
but the pair of them says exactly where the problem lives.

**The fix is a finer texture holding the same per-cell values.** Each cell now
fills a 3x3 block of texels, so bilinear has nothing to interpolate until it
reaches the one-texel seam at a cell boundary: the transition is a third of a
cell instead of a whole one, too tight to read as a blob and too soft to read
as a step, and it sits exactly on the cell edge - which is where the rock's own
edges are.

The solve is untouched and still per cell. This is a fill loop and a 19 KB
upload instead of a 2 KB one; the frame cost went from 0.83 ms to 0.88 ms.

**Four rounds on one symptom, three genuinely different causes**: a halo
sprite, a deliberate spill, and then the sampling itself twice - once for the
air mask, once for the whole field. Every fix was correct and every one left
some of the circle behind, which is the most misleading shape a bug can have.
The thing that ended it both times was reading the buffer or flipping one
renderer setting, not reasoning about the picture.

**And a test lesson.** The e2e that reads the light field indexed the texture as
one texel per cell and broke on the resolution change. It now derives the ratio
from `image.width`, because that ratio has changed once and will change again.
**A test that hard-codes a layout it did not choose breaks every time the layout
moves, and it breaks without saying why.**

## What to do next

Nothing here is committed to; they are the live threads.

**Free flight is the change most likely to need tuning**, and it is tuned
entirely by two numbers. If the ship feels floaty, raise `FLY_DRAG`. If it
feels late off the mark, raise `FLY_ACCEL`. If it feels like it fights a
one-cell corridor, lower `SHIP_R`. Everything else about the movement is
downstream of those three.

- **Does digging still feel deliberate?** The drill now stops on release and
  the ship carries momentum into a broken cell. That should read as smoother,
  but it is also less committal, and dig-stop-dig may turn out to be a tic
  rather than a decision.
- **Is the dark too dark?** Ambient is nearly gone underground and the vignette
  goes almost solid at the corners. The intended read is "this is as far as the
  light reaches"; the failure mode is "I cannot see what I am doing", and the
  fix for that is `VIGNETTE_EDGE_DEEP` before anything else.
- **Ordnance, relics and the mineral gate are all still unplayed**, three
  sessions on. Everything in the previous two lists still stands - but the tick
  seam means they can now at least be *tested* without playing to them, which is
  the first time that has been true.
- **Bloom wants the sky in the scene first.** See the section above; the pass is
  cheap and the sky is the blocker. It is worth more now than it was: with the
  propagated light crushing everything the lamp cannot reach, the frame has real
  contrast for a bloom to work with rather than a uniform mid-grey.
- **The propagated light has not been on the phone yet.** `LM_FLOOR_DEEP` and
  `LM_ATT` are the two dials; see the section above for which way each goes.
- **Relics have no ending.** The collection never completes, because the perks
  repeat past the eighth. An ending is a promise about how long the game is, so
  it wants saying out loud before it gets built.

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

---

# M1, 2026-09-10 - the economy, measured

`scripts/econ.mjs` (`npm run econ`) drives the real pure layer - the shipping generator,
ore table, prices, hardness, fuel and heat rules - through a scripted player, for three
play styles across five corridor offsets, and reports the run and the minute at which each
upgrade is first bought. It models only what lives in the frame loop: a straight reused
shaft, a corridor at the bottom, and every broken block going into the hold, which is what
the game really does. No tremors, gas or caches.

Five offsets rather than one because the first version reported eight consecutive run
payouts of 142, 275, 537, 452, 2029, 170, 192 and 3708, which is `CRAFT.md`'s 25% layout
swing showing up as a 40x one.

**Baseline, planet 0, core at 110 m, heat at 70 m, tremors at 85 m, 20 runs per style:**

| Style | Run 1 pays | Every ladder started by | Median hold use | Payout spread | Rungs in 20 runs |
|---|---|---|---|---|---|
| cautious | 114 cr | minute 5.8 | 11% | 84 - 3,708 | 11 |
| greedy | 311 cr | minute 16.1 | 14% | 200 - 7,448 | 19 |
| optimal | 3,140 cr | minute 4.0 | 14% | 1,196 - 11,059 | 75 |

**Four findings, in the order they matter.**

**1. Every ladder in the shop is started inside the first four to sixteen minutes, whatever
you do.** An optimal player has a rung of all fifteen by minute four. That is the whole of
*"I can afford upgrades pretty early on for fuel and cooling so neither is a risk"*, and it
is worse than the complaint: it is not two ladders, it is all of them.

**2. The hold is 11 to 14 per cent full when a run ends.** The weight cap is what `CRAFT.md`
names as the thing that turns "which is worth more" into a decision, and it has never once
bound in any simulated run at any style. The cap is not badly tuned, the mechanic is absent.
Cargo Hold is also the first thing every style buys, so the game's opening move is to enlarge
a container that was never full.

**3. The spread between styles is enormous, which is the good news.** Optimal earns 27x
cautious on run one and ends with 75 rungs against 11. `CRAFT.md` warns that when every style
scores the same the finding is that the game has no decision in it - the opposite is true
here. The decision exists and the game never tells you it does, and nothing punishes the
cautious answer.

**4. Depth is not gated by time, it is gated by behaviour.** A greedy player reaches the core
depth at 109 m by minute seven. Five sessions of play have never passed about 78 m. Nothing
in the game asks you to go down, so a careful player never does, and the entire second half
sits behind that.

**What this changes in the plan.** M3 keeps its shape and gets its numbers from here. M4 is
promoted from a refinement to a missing mechanic: a cap that never binds is not a decision.
And the summary table at the top of `PLAN.md`, which said one hold from 20-35 m pays 1,223
credits, is an upper bound rather than a measurement - it assumed a hold of pure ore. The real
run-one payout is 114 to 311 credits because most of what you cut is in the way rather than
worth money. The conclusion is unchanged and the reason is better: the ladders are cheap
against income that arrives in one or two runs regardless.

## M1 corrected, same day - three of five seeds were mining an empty planet

The first M1 table above is wrong and is left in place because the correction is the
interesting part.

`OFFSETS` in `econ.mjs` was `[0, 7, 13, 21, 29]`, chosen as "spread out" without checking
what they were spread across. **The world is `W = 13` cells wide** and `blockAt()` returns
null outside it, so offsets 13, 21 and 29 put the shaft entirely outside the planet and 0 put
it against the left wall with half the corridor out of bounds. Three of five seeds mined
nothing, returned nothing, and were averaged in as poor worlds. Every median in the first
report was computed over that.

Found by adding the Claim's deep-cell counter in M2 and seeing `deepCellsPerRun: 0` for a
style whose own run table clearly showed it working at 109 m. The contradiction between two
columns of the same report is what exposed it; neither column alone looked wrong.

**Corrected baseline, shafts at x = 2, 4, 6, 8, 10 around the pad at START_X = 6:**

| Style | Run 1 pays | Every ladder started by | Median hold use | Payout spread | Rungs in 20 runs | Deep cells per run | Quakes in 20 runs |
|---|---|---|---|---|---|---|---|
| cautious | 143 cr | minute 10.9 | 7% | 132 - 3,961 | 19 | 22 | 1 |
| greedy | 394 cr | minute 16.1 | 12% | 118 - 7,565 | 50 | 24 | 4 |
| optimal | 1,189 cr | minute 5.3 | 5% | 616 - 18,846 | 64 | 2 |

**Every M1 conclusion survives, and two get stronger.** The hold is 5 to 12 per cent full
rather than 11 to 14, so the weight cap is even further from binding. Rungs bought in twenty
runs went from 11/19/75 to 19/50/64, so the shop empties faster than the first report said,
not slower. Every ladder is still started inside five to sixteen minutes at every style.

**And the Claim's first measurement, which is what M2 needed:** a run takes 22 to 24 cells out
from below the stability line at 50 m, and a quake needs about 170 of them, so a quake arrives
every seven or eight deep runs. That is too rare to teach the mechanic - `CRAFT.md` wants a
frequency that teaches and a severity that punishes, and this is rare AND mild. It is left as
it is until M5, because M5 moves the stability line from 50 m to 26 m on leg 0, after which
nearly every cell a player removes is below it. The retune happens there with this probe, not
by guessing twice.

## M2's yard, and what the film actually showed

The three structures are on the pad, the damage lean and settle read clearly across four
frames, and the strain lamp works. **The framing does not.** The surface camera is composed on
the ship and the pad, so the refinery sits at the left edge, the shed is behind the platform
and the derrick's lattice competes with the pad's own ladder twenty pixels away. The winch
house and jib were added specifically to separate those two silhouettes and they help, but the
real problem is that nothing pulled the camera back to include a yard that did not exist when
the shot was composed.

`CRAFT.md`: re-shoot after any change to a length, because framing calibrated on old
dimensions is wrong. The surface just got wider. That is M9's job and it is written down there
rather than fixed in a hurry here, because it is a camera change and camera changes in this
game have historically needed their own pass.

Also decided here, against the plan: **the structures are modelled in code, not imported.** The
asset hunt recommended Kenney's station kits for the pad and the yard. `pad.ts` already carries
an older and better argument for the opposite - an imported kit brings its own topology,
normals and scale next to flat-shaded low-poly terrain with a hand-tuned palette, and the join
shows in the first frame. Same rule, same game, and the existing decision wins. The import
budget goes to the mineral surfaces in M7, where a normal map genuinely cannot be hand-written.

---

# M3 and M4, 2026-09-10 - the prices, and the two constraints that never bound

M3 and M4 turned out to be one change, and the probe is what showed it.

**The prices.** Every ladder was 1.8x to 2.3x a rung on a base of 100 to 1,400, so the whole
shop was affordable in the first few minutes and the top rungs were unreachable for the whole
game. They are now 1.5x to 1.6x on bases priced against the depth each ladder unlocks at:
Drill 340, Cargo 320, Thrusters 300, Scanner 700, Fuel Tank 1,100, Magnet 1,200, Tow 1,500,
Survey 2,600, Charge 3,000, Hull 3,400, Reactor 4,400, Cooling 5,000, Drone 5,600, Autopilot
6,400, Laser 12,500. Consumables moved up with them, because two design tests immediately and
correctly caught a Coolant Flush at 1,500 standing in front of a 5,000 Cooling Rig.

**The two constraints.** M1 measured the hold at 5 to 12 per cent full when a run ended. The
reason was not the cap: it was that a corridor stops when the FUEL runs out. So the question
was how much a tank can cut, which nothing in the game states anywhere. Measured, at level 0:

| | Before | After |
|---|---|---|
| Cells one tank cuts at 20 m | ~90 | ~90 |
| Cells one tank cuts at 50 m | 26 | ~60 |
| Ore-free rock that gets you | 66 kg at 20 m, 10 kg at 50 m | under the cap at both |
| Hold at level 0 | 60 kg, +45 a rung, 465 at max | 45 kg, +10 a rung, 135 at max |

`FUEL_DIG_PER_HARDNESS` was 0.09, so a granite cell at 50 m cost four times a dirt cell at
20 m. The hold filled itself with weightless dirt in the shallows - granite is 0.25 kg a cell
against amethyst at 7 - and the tank ran dry before the hold was a quarter full in the deep.
**Neither constraint bound at the depth it was supposed to.** At 0.035, and with the hold
brought down to something a tank can actually fill, they swap over around the middle of the
world: a corridor of dirt runs the tank out, a corridor of ore overflows the hold, and which
one you are in is the decision.

**Measured after, 30 runs a style:** hold use 19 / 40 / 18 per cent against 7 / 12 / 5 before,
and rungs bought in thirty runs 13 / 43 / 34 against 19 / 50 / 64. Greedy is still fast, and
that is left alone deliberately: `CRAFT.md` wants the greedy option to be genuinely better and
genuinely near the edge, and greedy is the style that takes the tows. The next lever if it is
still too fast after a playtest is the ore value curve itself, which is a bigger change and
should not be made twice.

`test/econ.test.mjs` is the gate: a poor corridor empties the tank, a rich seam overflows the
hold, a ladder that unlocks deeper costs more to start, every multiplier is between 1.3 and
1.65, and no consumable undercuts the rung it stands in for. Five goldens were re-recorded and
each diff was read: `stats` moved only the cargo ladder, `feel` only the two fuel constants,
`feel-curves` only the dig-fuel curve, `upgrades` only base, mul and the derived costs, and
`supplies` only the six prices.

Two e2e tests failed on `'56.0 / 60 KG'` and `toBeLessThanOrEqual(60)`. They now read the cap
out of the game, which is what they should always have done - a test that restates a constant
only proves you can type it twice.

---

# M5, 2026-09-10 - the world has a shape now, and every world has the same one

Planet 0's core sat at 110 m with heat at 70 and tremors at 85, and five sessions of playtest
notes never went past about 78 m. The chart, the traits, the Jump Drive, the Heart and the
crossing were all behind a dive that had never happened.

**The depths stopped being metres and became fractions of each world's own core.**

| | Was | Now |
|---|---|---|
| Core | `110 + 35 * leg` | `58 + 48 * leg` - 58, 106, 154, 202, **250** at leg 4 |
| Heat line | a global 70 m | `0.66 * core` - 38 m on leg 0 |
| Tremor line | a global 85 m | `0.76 * core` - 44 m on leg 0 |
| Rock bands | fixed 10 / 45 / 70 / 120 | `0.09 / 0.39 / heat / 1.05` of the core |
| Heat ramp | a fixed 50 m | the world's own heat zone |

Leg 4 lands on 250 m, exactly where the old ladder put it, so **the deep game is unchanged and
only the distance to your first sight of it moved.** Leg 0 is now a whole world in one
session: heat at 38, tremors at 44, a core at 58, and a crossing after it.

**HEAT_FRACTION is 0.66 rather than the 0.55 the plan proposed**, and the reason is the ore
ladder. At 0.55 leg 0's heat line landed at 32 m, four metres above gold, so the Fuel Tank -
which every player needs from the first run - would have demanded a trip into the heat to buy
it. Only the rows you buy BECAUSE you go deep may ask for a mineral from down there. The heat
zone is now the bottom third of every world, which is also easier to say out loud than any
pair of metres.

**Five things this broke that were worth breaking.**

1. **Cooling unlocked at 55 m and wanted emerald from 78.** On a world ending at 58 the shop
   offered a rig that could not be paid for. It unlocks at 78 now - emerald's own depth - so
   the row opens on exactly the world where its mineral exists.
2. **The Scanner wanted amethyst from 56 m**, below every heat line, for an opening-kit row.
   It takes copper now.
3. **The heat curve did nothing on leg 0.** `HEAT_RAMP` was a fixed 50 m against a 20 m zone,
   so hull loss never got past a fifth of its curve and the readout was blank one metre above
   the core. Scaled to the zone, every world runs the same arc from warm at the line to leave
   now at the core.
4. **`blocks-preadditive.json` is still frozen and still passes.** Its test gained two narrow
   rules - a rock may become a different rock, and a cell may become the core or the bedrock
   where the world got shorter - and one new assertion that is stronger than what it replaced:
   the set of cells holding ORE is identical to the frozen world. That is the property the
   file exists to defend, and it is now stated directly instead of implied.
5. **A test measuring luck.** `with a second route open, the same collapse goes ahead` passed
   on one seed for months and failed the day the world got shallower, because that shuffle
   picks a set that would seal the ship and is correctly reverted whole. It now runs twelve
   seeds and asserts that redundancy makes a collapse possible and that every outcome still
   gets you home.

**The tremor collapse is seeded.** `planCollapse()` no longer has a `Math.random` default at
all, and the game passes a stream seeded on the leg, the tremor count and the depth. That was
the one event a replay could not reproduce.

**Old saves.** A save whose ship is below its world's new core is put back on the pad on load.
Nothing else is touched.

**Measured after, 25 runs a style:** hold use 40 / 36 / 19 per cent against 7 / 12 / 5 before
any of this round, quakes in twenty runs 3 / 5 / 5 against 0 / 0 / 5, and the payout spread
tightened from 84-3,708 to 152-1,274 for a cautious player. All three styles now meet the
Claim, which none of them did when it was written.

---

# M6, 2026-09-10 - the breach

Breaking a core was the most cinematic beat in the game and it was a modal dialog with a
button on it. You destroyed a world and the game asked where you would like to go next.

`src/sim/breach.ts` is ninety seconds of climbing out of a world that is closing from the
bottom. The collapse front rises linearly from the core to the surface over the clock, so the
thing behind you IS the timer - no number, and `CRAFT.md`'s "make failure a shape". Tremors
fire every six to nine seconds instead of every twenty-seven, through the same
`planCollapse()`, which still reverts any set that would seal the ship in. The chart opens
when you reach the pad, not when the core breaks. Miss the clock and you are towed for the
usual cut and the world still breaks: it can cost you the hold, never the run.

One number grades the whole thing. `breachHeat()` runs 0 to 1 over the clock and the sky, the
fog and the dust warm on it exactly as they already do for the heat zone - taken as a max
rather than added, so a breach that starts inside the heat zone does not double-expose the
picture.

**Filmed, and the sheet is the answer.** Frame 0 is 56 m down and dark with the hull draining;
frame 1 is the whole world glowing ember with the ship climbing a lit shaft; frame 2 is 1 m
and cool again; frame 3 is the chart. That is the sequence the plan asked for.

The clock is generous - a stock climb from leg 0's core is twenty seconds against ninety - and
that is asserted rather than left to chance: `the clock is long enough to climb out of any
world it can start in` fails if the bare climb ever passes 40% of it. The pressure is meant to
come from the tremors and from whatever you still want to cut on the way, not from the
distance.

Six design tests, all properties: the front only ever rises, it ends in exactly one of two
ways and stays ended, the grade never overshoots 1, and everything at or below the front is
gone while nothing above it is.

---

# M7, 2026-09-10 - the UV bug, and an honest stop on the mineral surfaces

**The technique this round was supposed to introduce turned out to be a bug fix.**
`src/materials.ts` set `vec2 rockUv = wpos.xy` for every face of every cell. That is correct
only for a face pointing at the camera. A tunnel floor or ceiling has its extent in X and Z
and was being sampled with (x, y), where y barely changes across the whole face - so one axis
of texture variation collapsed and the surface read as a flat band rather than stone. Every
horizontal tunnel, every cavern floor and every ledge underside in the game was smeared, and
it stayed invisible for as long as play was a straight vertical shaft.

The fix picks the projection plane per face from the box's own unperturbed normal:
`abs(normal)` chooses between `wpos.xy`, `wpos.zy` and `wpos.xz`. This is triplanar mapping's
right-sized form for this geometry - the terrain is a flat-shaded box with hard ninety-degree
edges, so there is no seam for a three-way blend to hide and no need for whiteout normal
blending. **Zero bundle, zero draw calls, no extra texture fetches**, a handful of scalar
compares at vertex frequency. The e2e tests that read the compiled shaders back out of WebGL
still pass, which is what proves the injection is intact.

**The mineral surfaces stopped short, and here is exactly where.** The asset scout's shortlist
is good and `assets.py get ambientcg Granite002A` fetches correctly now that the Kenney search
bug is fixed. What does not work is the conversion step: the fetched maps are 342 KB and
507 KB of 1K JPEG, and `npx sharp-cli` produced a 342-byte WebP from them - a solid colour -
whichever combination of resize and quality flags was used. Rather than wire a broken texture
in or spend the milestone on a converter, the fetch was reverted and this is written down.

What is needed before the six surfaces land: a working JPEG-to-WebP downscale to 384 px, and
about 55 KB of bundle for each pair against a 752 KB total. Both are known quantities.
`bodyMat` is already built per block id in `blocks.ts`, so per-band maps need no material
restructuring when the conversion works.

**`assets/CREDITS.md` exists now**, backfilled from the commits that added the four textures
and two fonts. Three of the four rows cannot name their exact ambientCG id: those maps were
imported before the credits file existed and their commits describe what the maps are without
saying which material they came from. All are CC0 from ambientCG, which is what matters for
shipping, and the file says so plainly rather than inventing ids.

---

# M8, 2026-09-10 - haptics, the debrief and the record book

Three `POLISH.md` lines this game had never had.

**Haptics.** There was not one `navigator.vibrate` call in six versions, so every event in the
game fired three of the four channels POLISH asks for. `src/haptics.ts` is the whole API and
it is deliberately small: named events rather than durations at the call sites, so the
vocabulary lives in one place. A cut is 12 ms, ore 22, damage two quick taps, a surface quake
90-60-45, a core coming apart 120-50-80-40-60. Past about 60 ms a phone buzzes rather than
taps, which reads as a notification rather than as the game, so only the two events that ARE
interruptions are allowed to be long. Absent on iOS Safari and it simply no-ops; a toggle sits
beside the audio ones and persists; every call is wrapped, because a vibrate on a page that
has never been tapped throws in some builds.

**The debrief.** A run used to end with "Sold haul for X", which says what happened and
nothing about what to do next. It now reads `◈ 4,120 · best 47 m · Hull Plating in 1,180` -
what it paid, how it stood against the record that run could have broken, and **the cheapest
thing on the shelf you still cannot afford**, which is the sentence that sends you back down.
POLISH names exactly this: a reason to play again in five minutes is a run that ended one
decision short. One toast rather than a modal on purpose - a run ends every couple of minutes
and a screen you have to dismiss that often stops being information.

**The record book.** The pause sheet already had deepest and best haul. It now also carries
the fastest core, how many worlds have been broken, and the Jump Drive at n / 5. `R.worldT`
counts from landing to the core breaking, which is the only new state any of it needed.

---

# M9, 2026-09-10 - the surface, re-shot

M2 recorded that the Claim's three structures were half outside the frame, because the surface
camera was composed on the ship and the pad before there was a yard to include. `CRAFT.md`:
re-shoot after any change to a length, since framing calibrated on old dimensions is wrong.
The surface got wider.

`CAM_SURFACE_BACK` (3.2) and `CAM_SURFACE_LIFT` (1.15) are the whole fix. They are driven off
depth rather than off a mode flag, so the camera eases back as the ship rises and eases in as
it falls, and they are clamped to the top eight metres so **not one underground framing
constant moves** - those were calibrated over five sessions of lighting work and are the last
thing that should be disturbed by a change about the surface.

**What the sheet shows now**, honestly: all three structures stand clear of the dirt line, the
lean and the settle read across the four damage steps, and there is headroom above the derrick.
What it still does not show is a good composition - the yard is cramped against the pad and the
derrick's lattice still competes with the pad's own ladder twenty pixels away, even with the
winch house on top of it. Spreading them apart is the obvious next move and it does not fit:
the frame is portrait and anything further out leaves it. That wants art direction rather than
another constant, and it is the first thing to look at when the next visual pass runs.

---

# M10 and M11, 2026-09-10 - a chart that changes daily, and traits that change a rule

**M10, the daily Drift.** `chartFor(leg, day)` takes the day - days since the epoch in UTC, so
it turns over at one instant for everyone and never half-turns across a timezone - and folds
it into the world identities. The places on offer are different tomorrow, which is a reason to
open the game again that costs nothing to run and nothing to store.

**What the date deliberately does not touch is the trait rotation.** A player who needs a
Searing world for the Thermal Core must never wait more than one leg for one, and hanging that
on the calendar would make the goal strandable on the wrong day. Five tests hold the line: the
worlds change day to day, the kinds never do, every trait still appears within one leg on
every day tested, the same day and leg always give the same chart, and the day boundary is UTC
and turns over exactly once. `driftDay()` takes an injectable `now`, because a test that reads
the real clock fails one day in a thousand.

**M11, traits with teeth.** Four of the five traits were a multiplier on how much of something
generates - more gas, more caves, more geodes, faster soak - which reads as weather rather than
as a place. There was nothing a player could DO differently on a Volatile world.

| Trait | Was | Also does now |
|---|---|---|
| Stable | nothing at all | pays 15% more for surfacing with a whole hull |
| Volatile | more gas, harder hits | the seismic charge reaches 40% further |
| Hollow | more caves | the lamp carries 35% further |
| Crystalline | more geodes | the refinery pays 18% more, and the rock is 20% harder |
| Searing | soak builds faster | the heat line starts 14% shallower, and the rock cuts 16% easier |

**Two of those rows were written by a test.** `no trait is strictly better than another` first
failed on Crystalline, which had geodes AND a better price for no cost, making it the only
right answer on the chart - hence the harder rock. It then failed on Searing, which had two
costs and no upside, which is a world nobody would ever pick - hence the softer rock. Neither
was noticed by reading the table; both were caught within seconds of the rule being stated as
an assertion.

The blocks golden moved by exactly one thing: `hard` values on Searing and Crystalline legs,
scaled by 0.84 and 1.2. No block id changed anywhere.

---

# 2026-09-10, the intro's heading - a fix verified in one scene and shipped as general

Playtest: *"the ship flies backwards in the into scene, can you make it fly with the drill
facing forward, the direction it is flying."* This is the second time this game has been told
its ship is pointing the wrong way. Round three fixed it for the crossing and the landing.

**Measured rather than eyeballed, and the maths said it was already right.** With
`CRUISE_PITCH` at -1.16 and the roll at PI, the drill's world vector is (0, +0.40, -0.92).
The camera sits at z +6.2 looking at -12, so -Z is the direction of travel: the drill WAS
pointing forward, by 0.917 of a unit vector.

What it was also doing was sitting a quarter of a right angle nose-UP, which fires the flare
down the screen. The eye reads a ship climbing while the worlds stream past saying it is going
forward - **two directions at once, which is the exact fault the broadside version had.** The
round-three note in this file describes that fault precisely and the fix was applied to the
crossing, where it was verified, and never to the showcase.

`CRUISE_PITCH` is now a square `-PI/2`, so the drill is exactly on the travel axis, and the
three-quarter view comes from where the CAMERA stands - (0.92, 0.62, 6.2) looking slightly
left and down - rather than from tipping the ship away from its own heading. That is the right
place for it. Pointing a ship off its heading to make it photograph better is a lie the picture
tells about the physics, and this game has now been caught telling it twice.

The first attempt at the camera put the ship half outside the frame, which the filmstrip
showed immediately and which no amount of reading the diff would have.

**The landing cut.** Two scenes have to be joined - the crossing has its own camera, its own
scale and its own sky - and no amount of matching makes two renderers agree frame to frame.
What works is what film does with a cut it cannot hide: put something bright over it. The
landing already ends with the destination's sky washing out the frame, so a white flash now
starts in that wash and holds across the swap, and `SETTLE_FROM` went from 5.5 to 9.5 with
`SETTLE_MAX` from 2.0 to 3.2 - the descent onto the pad is now long enough to watch. The half
he could not see was always there and was over before the flash had faded.

---

# 2026-09-10, the asset pipeline actually works now

The blocker recorded in M7 - "the fetch works and the conversion does not" - is solved, and
the solution is a different tool rather than a fix to the old one. **Python Pillow**, which is
already on this machine:

```
python -c "from PIL import Image; im=Image.open(SRC).convert('RGB'); \
  im.resize((384,384), Image.LANCZOS).save(DST, format='WEBP', quality=75, method=6)"
```

Verified end to end on a real ambientCG file rather than a synthetic one: `Ground110`'s 1K
normal map (2.28 MB JPEG) becomes a 384x384 WebP of 38,688 bytes with a luminance standard
deviation of 14.8 and a range of 63 to 210 - a real image, next to the archive's own measured
baseline of about 45 KB for a 384 px normal. `sharp-cli` was not diagnosed and is not claimed
fixed; a working tool was found instead, which was the actual ask.

**Every conversion is now checked for variance before it is wired in**, and the first pass
proved why: ambientCG `Metal038`, the scratched steel picked for the ship hull, converted to a
462-byte file with a standard deviation of 0.4. That is a real file and very nearly flat - the
source has almost no relief, so it was the wrong pick rather than a broken conversion. It was
dropped. Without the check it would have shipped as an invisible improvement.

**A surface per band.** Every rock band shared one normal and one roughness map, so dirt at
four metres and basalt at fifty were the same surface in a different colour - and colour is the
one thing this game deliberately does not use to tell materials apart, because twelve palettes
already spend it. `Ground110` is the loose soil at the top of the world, `Gravel043` the stone
band under it, and granite, scoria and basalt keep `Rock035`. `bodyMat` was already built per
block id, so this needed no restructuring: `rockRelief()` takes the band and looks it up, and
anything unnamed falls through to stone rather than to nothing.

The bundle went from 761 KB to 886 KB, deliberately, and the four new files each have their
own budget line.

---

# 2026-09-10, imported ship hardware - and what it cost, named

Playtest: *"change the ship and part models to look more realistic ... make it so each
upgraded part changes the look as its upgraded. uses pre-made assets like models and textures
for the different ship parts."*

This repo has imported a ship mesh twice and reverted it twice, both times with measurements:
the ship is about thirty pixels in play, a repainted drill tier "did not read" and had to
become spark COUNT instead, and a downloaded mesh arrives with its own topology, normals and
sense of scale next to flat-shaded terrain on a hand-tuned palette. **Neither finding is
overturned here.** What changed is the screen: the hangar is where the ship sits large, static
and lit while nothing else is happening, which is the pad's own argument for importing detail.

So imported hardware goes on the HARDPOINTS - a drill collar at the nose from Kenney's
`turret_single`, generator blocks either side of the stern from `machine_generator` and
`machine_generatorLarge` - and the hull stays coded, so the ship you look at is still the ship
you fly. Each piece appears at its own tier, which is the answer to the drill tiers that "did
not read" when they were only repainted: a purchase is a new OBJECT on the ship, not a
slightly different colour on an old one.

Three rules hold it to the house style: the kit's materials and colour atlas are discarded and
replaced with the project's own convention, the loader is dynamic, and a missing file leaves
the coded part visible rather than throwing.

**What it cost, and the guard is why the number is here.** Everything ran through
`gltf-transform optimize --texture-compress webp` first: 26.7 KB to 9.3 KB for the hull,
39 KB to 11 KB for the turret. Then the size guard failed twice in a row, correctly, and both
failures were real:

1. **`three` grew 17%** because `manualChunks` names anything under `node_modules/three` as
   the vendor chunk, which swallowed the dynamically imported GLTFLoader whole - 82 KB into
   the chunk every first paint waits on, defeating the entire point of importing it lazily.
   `three/examples` is now excluded from that rule.
2. **`three` still grew 7.8%** afterwards, because GLTFLoader shares core three utilities that
   rollup then hoists into the common chunk. That one is unavoidable and is accepted
   deliberately: **37.6 KB on the critical chunk**, plus a 45 KB GLTFLoader chunk that only
   loads when the shop is opened, plus 40 KB of models. Total 971.6 KB from 886.5.

The 1% tolerance on the `three` chunk is what made both of these visible. It is the tightest
budget in the file and it has now earned itself twice.

---

# 2026-09-10, the Outfitter reorganised

Playtest: *"reorganize the shop so they are layed out more intuitively"* and *"make it feel
more like a space station with different colors textures and lights."*

**The shelf was sorted in table order**, so a drill sat next to a cooling rig sat next to a
scanner. The four groups the whole design is built on - rig, survival, instruments, ordnance -
were invisible in the room that exists to show them. Deep Rock Galactic's Space Rig is the
sourced reference: every function at a separate, named place rather than on one wall of
terminals. Sorting by group and heading each band is that idea at the scale a portrait phone
can hold.

Each band gets a lit header in its own colour and an emissive rule running the width of the
room - amber for the rig, red for survival, cyan for instruments, violet for ordnance, each
chosen from what that colour already means elsewhere in this game. An unlit plane carrying a
colour reads as a lit fitting for a fraction of what a real light costs, which is the whole
technique.

**Four placements were needed and the filmstrip found every fault.**

1. The overflow rack hung at the TOP of the room, which was fine while the shelf order meant
   nothing. Sorted by group, the slot order IS the reading order, and the room read ordnance,
   rig, survival, instruments. The rack moved below the columns.
2. A wide banner across the middle read well in the abstract and was unreadable in the game:
   the ship stands in the centre and two columns of cases stand in front, so the sheet showed
   SURVIVAL as "URVIVAL".
3. Moved left and it went off the edge - "R" and "N1".
4. Moved back in and it was still clipped by the left column, because it was BEHIND the
   shelf. A header is signage: what it labels may be behind it and nothing may be in front of
   it. At z -0.55, in front of the cases, all four read.

And then the label was truncated - INSTRUMENTS as INSTRUMEN - which is **this repo's own
round-two lesson arriving again**: `drawPlate()` drew at a fixed size with no width limit and
"SALVAGE MAGNET" ran off its plate, and the fix recorded then was to measure and shrink rather
than to shorten the name. The header now measures and steps the size down until it fits.

## Round seven, 2026-09-10: the frozen world was re-recorded

`test/baseline/blocks-preadditive.json` became `test/baseline/blocks-frozen.json`,
and its contents were re-recorded for the first time since it was made.

That file's own note always said it could be re-recorded for exactly one reason:
a deliberate ore rebalance. Round seven is that - the ladder spread from five
worlds to eight, the deep tier went from 0.40-2.10% down to 0.12-0.30%, and
total density fell from 10% to 7.5%.

**The diff was read before the file was replaced**, which is the part that
matters. Of 15,639 cells across planets 0-5:

| change | cells |
|---|---|
| rock band changed | 11,053 (already licensed as rock-for-rock since M5) |
| one ore became another | 841 |
| stopped being ore | 574 |
| started being ore | 368 |

So about six per cent of cells changed ore status, against a density cut of a
quarter. Nothing in it was a surprise.

The name went with it because the name had stopped being true: the file no
longer predates caves, gas and geodes, it is simply the world as it stood after
round seven. **The test's meaning is unchanged** - a new feature may overwrite
cells and may not move the ore underneath them - and that property does not care
which fixed point it is measured from.

Two assertions inside it had to change with the re-record, and both for the same
reason: they counted pockets and seams by looking at the DIFF, and the frozen
world now contains both, so the diff is correctly zero. A count of zero would
have read as "pockets have stopped generating". They count the world directly
now, which is what they always meant.

## Round eight, W5, 2026-09-11: the map, and three constructs that proved nothing

The Survey screen landed. What is worth keeping out of it is not the canvas
work - it is that **three separate checks in this milestone reported success
while proving nothing**, and all three were caught the same way: by deleting
the thing they were supposed to be watching and seeing whether they noticed.

**1. The recorder that ran once.** The map records what the lamp has shown you
on the climb timer. Written as `if (R.climbT <= 0) { record }` sitting next to
the timer rather than inside it, and the timer is reset to 0.35 in the same
frame it expires - so the condition is true on the first frame of the session
and never again. The map filled in at the pad and nowhere else, which looks
exactly like a map you simply have not explored yet. The e2e catches it by
asserting the SPAN of the trail, not its size: a one-shot recorder leaves three
tile rows and a working one leaves ten over a 40 m descent.

**2. The pixel count that the graph paper answered.** The first version of the
screen test counted "pixels that are not the background". Then unexplored
ground gained a survey grid - drawn over the whole canvas on purpose - and the
count stopped meaning anything: a map that had drawn nothing but its own lines
would have passed. The second version counted the wash by colour and was no
better, because three 50 m rules are wide, coloured, and clear the threshold on
their own. Both were verified by deleting the wash, and the second one still
passed. What works is a DIFFERENCE: a surveyed tile against an unsurveyed one,
at the same scale on the same canvas, with tunnel cells excluded so the tunnels
cannot answer for the wash.

**3. The tunnel check that was reading the ship.** Sampling dug cells and
taking the brightest one passed with every tunnel deleted, because the ship
marker is drawn on top of a dug cell by definition and one amber dot was the
maximum. The median cannot be moved by the two or three cells a marker covers.

The through-line is the one this repo keeps relearning: **a measurement taken
over a whole picture can be satisfied by the wrong part of the picture.** The
fix is never a bigger threshold, it is a narrower question.

### Two bugs found on the way, neither of them in the map

`hardReset()` - the button that says TAP AGAIN TO WIPE EVERYTHING - never wiped
`found`, `foundKit` or `seenOre`. It zeroed `g.up`, so the devices came back at
tier zero and stayed on the Outfitter's shelf: a fresh save that had somehow
already done the finding. Fixed with the map's own lists.

And the Set that indexes `g.seen` started life in `loop.ts` while the list it
indexes lives in `state.ts`. Moving it next to the list is not tidying - `load()`
replaces the list wholesale, and an index in another module has no way to know
that happened. It now rebuilds on every load and on a wipe, and there is a unit
test that fails if the rebuild is removed.

## Round eight, W6, 2026-09-11: the Claim becomes the planet

Three buildings became one machine, and a discount became a stake.

**What was wrong with the Claim** was not the mechanism, it was the object.
Cutting deep rock shook a refinery, a derrick and a shed, and the damage was
three discounts: a worse sale price, a shorter tank, some spillage. The
research names that exact pattern as Deep Rock's rig - organisationally rich,
in no jeopardy at all - and it was three meters, three repair prices and three
silhouettes for one idea.

**Unrest is per region, and that is the one change to the plan.** The milestone
said "a planet-wide meter". A single planet-wide number is a second fuel gauge:
it goes up, you cannot point at where, and there is nothing to do about it. Per
region it gives the map something to show, makes "work this place out and go
somewhere else" a real move, and means an Anchor pushing its own region back
(W7) is a thing you can see happen.

**The numbers were set against a campaign, not by feel.** 0.0007 a cell at the
surface times up to 2.5 at the floor puts a region at Grinding after about ten
runs of working it, which the unit test asserts as a band rather than as a
literal. The Ballast drains a full tank in twenty-five minutes of digging at
ordinary Unrest and fourteen at high - never urgent inside a three-minute run,
always present across an evening.

**Feeding is ranked, not priced.** Ore value spans forty to a hundred and
ninety-six thousand credits. A value-weighted feed would make one Solmarrow
worth six hundred Copper and the decision would stop existing - you would tip
in the one deep rock and never think about it again. Scored on the ore's TONE,
its rank on the ladder, the spread is ten to one and a pile of Copper is still
an answer.

### Four things found by looking at it

1. **A machine that was rendering perfectly, behind the HUD.** The Ballast was
   placed where the old refinery stood, at -2.2 world units. The camera is 17.7
   back at 52 degrees on a 0.46 aspect, so the visible world is about eight
   units across and the action buttons own the left sixteen to thirty-two per
   cent of it - which is exactly where the machine was. Twenty minutes went on
   shader theories before the arithmetic. It is on the right now.
2. **A sight glass that could not be seen.** The fluid was modelled inside its
   tube, which is where fluid goes. The tube is opaque and goes through the
   opaque pass first; the fluid is additive with `depthWrite` off, and an
   additive surface behind an opaque one is depth-rejected before it ever
   blends. The tube is the dark backing now and the fluid is the lit face over
   it, which is also how a real sight glass reads.
3. **An alarm that was on for most of the normal range.** Both the panel's bar
   and the HUD button read `< BALLAST_SAFE`, and BALLAST_SAFE is 0.7 - the
   threshold for SHORING a fallen region, nothing to do with danger. A tank at
   a perfectly ordinary 60% drew red and the button pulsed. `BALLAST_LOW` is
   0.35, about three runs of warning.
4. **A gradient painted on the wrong element.** The Unrest bar had a
   green-to-red gradient on its FILL, so a calm planet drew a little rainbow
   with red in it compressed into 18% of the track. The colour IS the reading:
   it is the band's own colour, flat.

### And two tests that had always been asserting about a world that is gone

`a searing world moves its heat line up but never above the surface` looped
over four LEGS. W4 made this one planet, so `heatDepth` returns 199 for every
one of them and the loop was four copies of one assertion; its lower bound was
half the Claim's stability line, and the Claim no longer exists. It now asserts
what it always meant: Searing starts shallower, and not so shallow that the
burn is inside the first minute.

`boots without hitting the error overlay` asserted the HUD chip reads "Verdax".
That was a fact about a planet you flew to. The chip names the REGION now,
because a chip that says the same word for a whole game says nothing - and it
is derived from the pad's own region rather than typed out, because the region
boundaries wander.

## Round eight, W7, 2026-09-11: the first authored content in a generated world

Everything in this planet had been rolled until now. W7 stamps hand-drawn rooms
into it, and authored content fails differently from generated content: a
generator fails by producing something WRONG, and a stamp fails by producing
something INCOMPLETE. Half a room. A wall with nothing behind it. A door across
the only way down.

So the tests are mostly about wholeness, and three of them earned their keep:

- **every Anchor hall is inside its own region, corner to corner.** The region
  boundaries wander by up to seven metres and three columns, so a room eleven
  cells wide placed at a region's nominal centre is a claim about insets, and
  "far enough" is exactly the sort of claim that is wrong by two.
- **every hall is shut.** Checked on the stamped world, not on the template: a
  clip or an overlap is where a room loses a wall, and a hall with a gap in it
  is one an ordinary shaft wanders into without the player noticing they
  arrived anywhere.
- **a locked door never locks the planet.** With nothing found at all, flood
  the whole world through everything that is not unbreakable and check the
  bottom is still reachable. Region 4's sealed hall sits directly under the pad
  at 135 m, and the shaft does run into it - you go round, six columns over,
  which is a good moment. It would not have been a good moment if it had been
  the only way down.

### A test that restated the implementation, and passed with the rule deleted

The overlap test re-derived the stamp's own drop rule and then asserted the
rule had been applied. Deleting the drop rule entirely left it green.

The fix was to make placement *reportable*: `vaultPlan()` returns the rooms
that are actually in the world, and the test asks whether every room on that
list is stamped cell-for-cell as its template says, and whether any two of them
overlap. Both read the OUTPUT. Neither can be satisfied by the code being
self-consistent.

The first attempt at that rewrite had its own bug and the test caught it
immediately: it identified "was this room placed" by whether the room's centre
cell was stamped - which is true of a room that was DROPPED for overlapping an
Anchor, because the Anchor's own hall covers that cell. It reported a room that
does not exist as having lost its walls.

### Two mutations that passed, and the claims that were missing

Sealing all nine halls passed. Putting sealed stone into the ordinary hall's
wall passed. Neither is caught by any test above and both are the same failure:
**the player meets the locked door before they have met the mechanic.** A door
you cannot open is only a promise if you already know what doors are. So: the
shallowest Anchor in the world is never sealed, at least half of them are open,
and an unsealed hall contains no sealed stone anywhere.

### Three things only the screenshot could find

1. **The Anchor rendered as a flat teal tile.** `blocks.ts` decides between
   "pebbles on a rock face" and "crystal shards" on `b.ore`, and a monument is
   not ore. Flagging it fixed the look and immediately broke an e2e that counts
   what materials the shallow world holds - correctly, and the fix is the
   `notOre` list that already existed for crates and pockets.
2. **The Anchor was in shadow, and the lighting was right.** The plinth was a
   ring of worked stone on all four sides, so the light field did exactly what
   it should with an enclosed cell and left the brightest object in the game a
   dull smudge. It is a niche now - walls either side, floor underneath, open
   above - which takes the lamp and is a better piece of architecture anyway.
3. **Lighting one did not redraw it.** The block's ID changes from `anchor` to
   `anchorlit`, and the instanced pools are keyed by id, so nothing in the
   world knew the cell had to move pools. The monument stayed dark until the
   streaming window happened to rebuild - which is when you cross a row, so the
   thing you were looking at changed several seconds later for no reason.

### And one number worth keeping

Worked stone's `ROCK_BUMP` is 0.03 against 0.16-0.40 for every rock in the
game. That single number is the whole visual read: every surface in this world
is broken, and cut stone is not. No new texture, no new material.

## Round eight, W9, 2026-09-11: one ending, and the removal of the other

The Vault is a fifteen-by-thirteen chamber at the middle column of the deepest
band, behind a seal that nothing in the game opens until all nine Anchors are
lit. Two shells on purpose: the outer one is ordinary worked stone, so finding
it reads exactly like finding any other room and the player already knows what
that language means; the inner one is the difference between a locked door and
an ending. Sealed stone waits for a TOOL you might find by accident. This waits
for the whole errand.

**The bigger half of W9 was a deletion.** The navigation chart, `chart.ts`,
`drive.ts`, the crossing, `breach.ts`, the Core Shards, the five jump-drive
components and the Planet Core are gone - about 1,300 lines and ninety call
sites. They were the ending of a game about a chain of planets, and round eight
made this one planet with one centre. Two objectives is worse than either.

Three things that fell out of it and are worth keeping:

**The drill ladder got legible again.** `S.drill()` was
`(1 + level * 0.95) * (1 + shards * 0.08) * relic`, and shards came from
destroying planets. With no planets to destroy it is `(1 + level * 0.95) *
relic` - and the re-recorded stats golden matched the old `shards0` row
exactly, which is what every fresh save always had.

**`transit.ts` was two files wearing one name.** Half of it was the crossing
and half was the title screen's showcase, landing and launch. Deleting the file
took the title screen with it and the typechecker found it in seconds; the fix
was to cut the crossing out and leave the rest, with a note at the seam saying
what used to be there.

**`part` stays in the golden's OVERWRITERS list forever.** There are no drive
components any more, but the FROZEN baseline still has them, and an overwriter
LEAVING a cell is as legal as one arriving. Removing the id would have read
every one of those cells as "the ore stream moved".

### The bug the fixture found

`wake()` checked whether the planet had already woken and not whether it was
TIME, so the FIRST Anchor of nine set the flag and the entire second act - the
permanent Unrest step, the closing ground, the Blooms - fired in the first ten
minutes.

It survived W8's whole test pass because every fixture lit the early Anchors
through the state directly and only the last one through the real path, so the
first call `wake()` ever saw was always the fifth. It surfaced building W9,
where a fixture lights eight and the ninth goes through `anchorLit` - and the
wrong card came up.

**A fixture that skips the early steps of a sequence cannot test the guard on
the first one.** The test that exists now walks the count up from zero.

## Round eight, W10 (in progress), 2026-09-11: the phone pass

Three things done so far, and the first one is why the pass exists.

**A crash, found by looking at a screen.** Cutting into an Anchor hall put
`worked` stone in the hold, and `buildManifest` sorts by `DEF[id].value` -
there is no `DEF['worked']`. The game ran, the manifest opened, and then it did
not, depending on whether you had been through a wall since the last time you
looked. No test had it: every fixture that cut stone never opened the manifest,
and every fixture that opened the manifest never cut stone.

The fix is a `spoil` flag on the three cut-stone blocks, and the rule it
encodes is the right one anyway: you are getting THROUGH a wall, not mining it.
The test that holds it is wider than the bug - it sweeps the world and asserts
that anything which can reach the hold has a DEF entry behind it.

**Two stale strings.** The pause sheet still named a PLANET and said "Core at
452 m"; the relic line still said "one on every planet". It names the region
now and reads "you are at 99 m of 452", and the old chart-era wording is gone
from every screen a player can reach.

**The draw-call fixture was measuring the easy case again.** It sat in a plain
shaft at 300 m, which is three or four block ids; round eight added six. It
sits in a sealed Anchor hall at 306 m now, on a woken planet with a region
down and the laser aboard - worked stone, sealed stone, the Anchor, rubble and
fallen ground in one window. **86 draw calls of 150.**

### And one finding from the long play that is not fixed

`scripts/longplay.mjs` drives a whole campaign through the shipping loop. It
plays badly on purpose, and from run 22 it stopped making progress entirely:
one Anchor lit, three regions down, the Ballast pinned at zero, 18 credits, and
nothing changing for the next six runs.

Most of that is the probe being a bad player. But it is pointing at something
real: **the unit test proves a SINGLE collapse leaves a planet you can come
back from, and says nothing about three.** With three regions down and no
income, there is no path back - shoring costs 45% of a Ballast you cannot fill
because the ore is in the ground you cannot reach.

That is the next thing to look at, and it is a balance question rather than a
bug: either collapses need a floor (a planet stops at N regions down), or the
Ballast needs a trickle that does not depend on ore, or shoring needs to be
payable in something a stranded player still has.

## Round eight, W10 continued, 2026-09-12: what the long play was actually hiding

The probe from yesterday stalled with one Anchor lit after thirty-eight runs
and four simulated hours. I filed that as a balance question. **It was three
separate bugs, and only one of them was balance.**

### The one that mattered: a lit Anchor plugged its own column

Three Anchors share each of the three columns they live in - x = 10, 31 and 50 -
and an Anchor is a single cell in the middle of its own hall with `hard:
Infinity`, because the ritual is that you cannot mine your way to the
objective.

Left unbreakable AFTER lighting, the shallowest one in a column became a
permanent plug. **Six of the nine were unreachable by digging down their own
column**, and each one stopped a metre above the Anchor above it: 94 m for the
two under (10,95), 42 m for the two under (31,43), 47 m for the two under
(50,48). The probe was not playing badly; it was walled in.

A lit Anchor is cuttable now - three times the band, so moving a monument is a
decision - and the ritual is untouched, because an unlit one is still
uncuttable and lights the moment you are beside it.

The test that found it is the one worth keeping: **`every Anchor lights by
digging down its own column`** puts the ship over each of the nine in turn,
digs, and asserts it lights. Nine descents and two minutes of suite time,
which is why it has its own `setTimeout`. Reverting the fix reproduces all six
failures with the same six depths.

### The balance one: the cascade had no bottom

A planet nobody feeds lost its first region after sixteen minutes of digging
and its third after **twenty-six** - because a collapse restarted the tank a
quarter full and the drain never eased, so the punishment for losing a region
was landing you closer to losing another.

Two changes at the root rather than a fence at the end: a collapse leaves the
Ballast HALF full (the punishment is the region, not the clock), and each
fallen region eases the drain by half again (there is less ground standing to
hold down). The gaps are 16, 13 and 17 minutes now - even, and each one a real
window to react in.

Plus the two fences: **never a region holding an Anchor nobody has lit**, and
**never more than three at once.** Both were found by the long play and neither
is visible from a single step.

### And the test that should have existed first

`a planet run to the bottom of its own spiral still has a way forward` steps
the pure system sixty times and asserts the terminal state is actionable. It
runs in a millisecond and asks the same question the browser probe took four
simulated hours to answer.

**A test that steps a system once proves the step. It cannot prove the
sequence.** Anything with feedback in it - a meter that costs you the means to
refill it - needs a loop.

### The probe's own two bugs, for the record

It held the d-pad for `|dx| * 2 + 4` seconds to move `dx` columns, which at
three cells a second is eighteen cells of overshoot; and it dug down for a
fixed two minutes every run, ran the tank dry and banked nothing, while the
Ballast drained on schedule. Both looked exactly like balance problems.

A bad player is a useful probe. An incoherent one is noise. It flies to a
CONDITION now, and it turns back when the game says `danger` - which is the
one warning the game shouts at you.

---

# Handover, 2026-09-12: round eight is closed

Everything below was only in the session that built W5 to W10. It is written
here so a cold session can carry on from the repo alone.

## Where the game is

Version **0.31.0**. Round eight (W1-W10 in `PLAN.md`) is complete. The gate is
green: **291 unit tests, 41 e2e, typecheck, build, size guard**.

**There is no `scripts/check.ps1` in this repo**, whatever a habit from the
Godot games suggests. The gate here is **`npm run check`** - typecheck (app and
e2e), `npm test`, build, `npm run size`, `npx playwright test`. It takes four
to nine minutes. The e2e suite runs against `dist/`, so always build before
running Playwright on its own, or it tests the previous build.

## The shape of the game now, in one paragraph

One planet, 61 columns by 452 metres, twelve regions (four depth bands by three
lateral thirds) each with their own palette and trait. You dig, sell at the pad,
buy upgrades, and hunt nine Anchors in hand-authored halls of cut stone.
Lighting one calms its region, draws the whole region onto the Survey map, and
gives the Ballast a permanent tier. The fifth wakes the planet. The ninth opens
the Vault at the centre, which is the end. There is no core, no chart and no
jump drive - they were deleted in W9.

## Every number that was tuned, and what it was tuned against

Do not change one of these without the measurement beside it.

| constant | value | measured against |
|---|---|---|
| `UNREST_PER_CELL` | 0.0007 | ~10 runs of 60 cells in one region reaches Grinding |
| `UNREST_AT_FLOOR` | 2.5 | a cell at 452 m against one at the surface |
| `WAKE_AT` | 5 of 9 | leaves a whole second act after it |
| `WAKE_STEP` | 0.12 | a twelfth of the meter: Calm stops being calm, no band jumped |
| `WAKE_CUT_MULT` | 1.35 | felt over the ten runs after, not on the day |
| `BALLAST_DRAIN` | 0.001/s | a full tank is **26 min of digging at 0.3 Unrest, 14 at 0.8** |
| `BALLAST_AFTER_COLLAPSE` | 0.5 | was 0.25, and at 0.25 the 2nd loss came 4 min after the 1st |
| `BALLAST_DOWN_RELIEF` | 0.5 | **neglect loses regions at minute 16, 29, 46 - gaps 16/13/17** |
| `BALLAST_SAFE` / `BALLAST_SHORE_COST` | 0.7 / 0.45 | shoring is the biggest single spend in the game |
| `BALLAST_LOW` | 0.35 | about three runs of warning. NOT the same line as `BALLAST_SAFE` |
| `BALLAST_PER_UNIT` | 0.008 x ore `tone` | rank, not value: value spans 40 to 196,000 |
| `MAX_COLLAPSED` | 3 | found by the long play; the cascade had no bottom |
| `CLOSE_RATE` / `CLOSE_SAFE` | 0.10 / 8 m | a shaft you use is re-cut; one you abandon goes in a dozen runs |
| `WORKED_HARD` / `SEALED_HARD` / `VAULT_WALL_HARD` | 2.1 / 4.4 / 6.0 | multiples of the LOCAL BAND, never flat |
| lit Anchor hardness | band x 3 | moving a monument should be a decision |
| `BLOOM` | min 4, max 226, chance 0.009 | bounded at halfway so it never overwrites Solmarrow |
| `ROCK_BUMP.worked` | 0.03 | against 0.16-0.40 for rock. The whole visual read of cut stone |

## Where things are in the world

Seeded, so these are facts about the current seeds and they move if any offset
changes. Tests derive them. **Never type one of these into a test.**

- Anchors: Verdax (10,95), Rustmoor (31,43), Cryon (50,48), Ashvault (10,188),
  **Kryllon (31,135) sealed**, Tessivar (50,192), **Obrinth (10,284) sealed**,
  Palewell (31,255), **Serrik (50,306) sealed**
- The Vault: (30,405), 15x13, the only hand-placed room
- 23 rooms and 1,764 authored cells, 5.8% of the planet
- Kryllon's sealed hall sits directly across the main shaft at 135 m. That is
  deliberate, and `a locked door never locks the planet` is the test that keeps
  it survivable: you go round it, six columns over.

**Seed offsets taken: 13, 41, 91, 137, 601, 619, 643, 883, 977, 1013**, plus the
older 11, 23, 77, 131, 173, 211, 257, 311, 313 and 421. Anything new that
generates must take a fresh one, or it consumes a roll the ore stream was using
and every value at every depth shifts.

## Performance

**86 draw calls of 150** in the worst window round eight can build: a sealed
Anchor hall at 306 m, on a woken planet, with a region down and the laser
aboard - worked stone, sealed stone, the Anchor, rubble and fallen ground all in
one frame. The fixture in `stays inside the draw-call budget while underground`
finds that hall rather than naming it.

The `index` chunk is 210.8 KB, and its budget was re-recorded at W7 after
reading the growth: W5's map, W6's Unrest and Ballast, W7's vaults.

## What the long play proved, and what it did not

`node scripts/longplay.mjs`, with `npm run preview -- --port 4319` up.

**Proved** - the first half hour is healthy. Runs land at about three minutes of
game time, which is what the design says a run should be. The Ballast can be
kept full out of banked ore once income arrives. Unrest reaches 0.05 mean and
0.11 peak at thirty minutes. The money curve climbs to about 23,000 by run 11
with no wall in it.

**Found** - the two bugs that mattered, both now fenced by tests.

**NOT proved** - that a campaign can be played through to the Vault. The probe
has never lit more than one Anchor, and every stall traced to its own policy
rather than the game: an eighteen-cell lateral overshoot, no fuel policy at all,
a climb that gave up because it was in danger, and then a stop condition that
fired before the first slice whenever the ship was already deep. Its own header
says all of this. **The game's reachability is proved by `every Anchor lights by
digging down its own column` in the smoke suite, not by this probe.**

## The traps this session walked into, so the next one does not

1. **A test that re-derives the rule it tests passes with the rule deleted.**
   The room-overlap test rebuilt the placer's own drop rule and then asserted it
   had been applied. `vaultPlan()` exists so a test can read the OUTPUT instead.
2. **A fixture that skips the early steps cannot test the guard on the first
   one.** `wake()` had no threshold check - the FIRST Anchor of nine woke the
   planet - and it survived a whole milestone because every fixture lit four
   Anchors through the state and only the fifth through the real path.
3. **An id that can reach `g.cargo` must have a `DEF` entry.** Cut stone did
   not, and the manifest threw on `DEF[id].value`. It is flagged `spoil` now,
   and a sweep test holds the general rule rather than the three ids.
4. **A block whose id changes with state needs an explicit redraw.** The
   instanced pools are keyed by block id. The Anchor, the Vault seal and the
   Bloom all change id from game state and all force a rebuild at the moment
   they do.
5. **Two thresholds that happen to share a value are two constants.**
   `BALLAST_SAFE` (the shoring price) was also driving the low-fuel alarm, so a
   perfectly ordinary 60% tank drew red and the HUD button pulsed.
6. **An additive mesh inside an opaque one is depth-rejected, not blended.** The
   Ballast's sight glass drew nothing at all until the fluid moved in FRONT of
   the tube instead of inside it.
7. **A 3D object can be rendering perfectly and be behind the HUD.** The Ballast
   was at 16-32% across, which is the action-button column. The camera shows
   about eight world units across on this aspect; do that arithmetic before
   theorising about shaders.
8. **Re-recording a golden is fine; re-recording it without reading the diff is
   not.** `test/baseline/blocks.json` was re-recorded six times this round, and
   every time the diff was printed as counts-per-id first and read.
   `blocks-frozen.json` was NOT touched at any point.
9. **`part` stays in the golden's `OVERWRITERS` list for ever.** There are no
   drive components any more, but the frozen baseline still contains them, and
   an overwriter LEAVING a cell is as legal as one arriving. Removing the id
   reads every one of those cells as "the ore stream moved".

## What to do next, in order

1. **Play it.** Round eight is a lot of work with no human minute in it, and the
   probe cannot answer the questions that matter: does hunting Anchors feel like
   a hunt or like a checklist, is the map worth opening, does the Ballast read as
   a stake or as a chore, and does the fifth Anchor land.
2. **The first hour.** Nothing in round eight touched the first-run intro, and it
   still introduces a game about flying between planets. `src/sim/intro.ts` and
   `src/titleui.ts` have not been read since W4. This is R9a in `PLAN.md`.
3. **Ship it.** `/ship` walks `POLISH.md`; the deploy is GitHub Pages and
   `WEB.md` has the recipe.
4. **Then the rest of round nine**, whose milestones are at the bottom of
   `PLAN.md`.
