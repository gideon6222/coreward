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
- **Play Stage 4 and find out which half of it lands.** Pockets, caves,
  supplies and traits all shipped on modelling, not on play. The specific
  unknowns: does a gas pocket read as a surprise or as an ambush, is a geode
  worth the detour it is priced to justify, does a Hollow planet feel fast or
  feel empty, and does anyone actually buy a Coolant Flush rather than banking
  the 1,500 toward the rig.
- **The heat zone still has one tooth below 70 m.** Gas and geodes gave the
  0-70 m stretch something to think about, but past the heat line soak is again
  the only pressure. A hazard that only exists deep - something that punishes
  standing still rather than dwelling - is the obvious next addition.
- **Traits do not yet change how you *equip*, only how the ground behaves.** A
  trait that changed what is worth buying at the pad, rather than what the rock
  does, would be a different kind of variety and would make the supply shelf
  matter more.

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
