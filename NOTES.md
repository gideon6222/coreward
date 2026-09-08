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
- The **draw-call budget of 70** comes from a mobile rule of thumb of roughly
  fifty to a hundred, not from anything enforced. Measured at the worst case it
  currently sits at 50.
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
  cheap and the sky is the blocker.
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
