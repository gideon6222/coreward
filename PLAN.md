# Coreward — the plan

Round four, written 2026-09-10 against v0.24.0. **The plan, not a history.** Rewrite in place
as things land; the changelog is where the record goes. Rounds one to three are in the
appendix at the bottom, shipped.

This file was `DESIGN.md` until 2026-09-09. It is `PLAN.md` because that is the name
`INDEX.md` tells a resuming session to open.

---

## Summary

**Fantasy:** a contracted driller working the Verdax Drift, cutting a world apart from the
inside to buy his way out of it.
**Loop:** dive, cut, fill the hold, climb out before the world takes it back, sell, buy one
rung, go deeper.
**Engine:** web, three.js. Decided 2026-09-10 on measurement rather than habit: the game runs
well on the S26 Ultra installed as a PWA, the only platform limit it has met is 400x larger
than it needs, and a Godot rewrite is 12,716 lines of working game thrown away for a benefit
you have said you do not want yet.
**Reference:** none. Original. Genre neighbours are Motherload, SteamWorld Dig 1 and 2, Dome
Keeper and Mr. Driller, researched 2026-09-10 and cited where a mechanism is borrowed.
**New technique:** per-face axis-selected UV projection on the rock (a right-sized triplanar).
Fixes a real bug and is the first thing that will make caverns look like stone.
**What you keep:** one relic per planet, the five Jump Drive components, and the record book.

### The three faults, measured

Everything below is derived from the shipped game, through the same bundle the golden tests
use. The probes are in the milestone list so they become permanent.

**Fault 1 — everything at stake is the ship.** Fuel, heat, hull and tremors all threaten one
object, and the worst outcome is a tow that costs a percentage of one haul. There is nothing
you can lose that you are not holding. Dome Keeper's designer names this exactly: depth is
worth something when it is dangerous to a system you are *not* touching. Coreward has no
second system. This is why *"it feels free"* survived a reprice: the price was never the
problem, the absence of a second thing to lose was.

**Fault 2 — the first sale defuses the first hour.** Measured, planet 0, no upgrades:

| Band | Ore cells per 1,000 | Value per kg | One 60 kg hold |
|---|---|---|---|
| 5–20 m | 57 | 11.1 | 666 cr |
| 20–35 m | 45 | 20.4 | 1,223 cr |
| 35–50 m | 45 | 36.0 | 2,161 cr |
| 50–70 m | 41 | 78.4 | 4,703 cr |
| 70–85 m | 27 | 115.3 | 6,916 cr |
| 85–110 m | 55 | 162.8 | 9,770 cr |

That table is an upper bound: it prices a hold of pure ore. **M1 has since measured the real
thing** and it is worse rather than better — a first run pays 114 to 311 credits because most
of what you cut is in the way rather than worth money, and yet *every ladder in the shop is
started inside the first four to sixteen minutes whatever style you play*. The M1 section in
`NOTES.md` has the table.

Against that, the first rung of every ladder: Thrusters 100, Cargo 110, Drill 130, Scanner
140, Fuel Tank 480, Cooling 1,000. **The first hold you ever sell buys four upgrades**, and
the two that answer the game's two pressures cost less than a second hold. There is no point
in the opening where you want something you cannot have, which is the whole of *"I can afford
upgrades pretty early on for fuel and cooling so neither is a risk."*

**Fault 3 — half the game is behind a wall you have never reached.** Planet 0's core is at
**110 m**. Heat starts at 70, tremors at 85. Across five sessions every note you have written
has been about the first sixty metres and the surface. So the chart, the traits, the Jump
Drive, the Heart, the crossing and the twelve palettes — everything built in rounds one to
three — sits behind one 110 m dive that has never happened. It is not undiscovered content,
it is unplayed content, and the fix is not to build more of it.

### What this round does about them

1. **A second system: the Claim.** Something at the surface that depth threatens and the ship
   cannot protect. Section below.
2. **An economy measured rather than assumed**, with a probe that reports the run at which
   each upgrade is bought and a test that fails when the opening goes free again.
3. **The first world compressed** so heat, tremors, a core break, the chart and a crossing all
   happen in the first session, and the hazard depths scale per world instead of sitting on
   global constants.
4. **An art pass that starts with a bug**: the rock's texture projection is wrong on every
   face that is not facing the camera, which is every floor, ceiling and cavern wall.
5. **The things POLISH.md asks for that this game has never had**: haptics, a run debrief, a
   record book.

### Your asks, expanded

Numbered because you asked for the whole game overhauled, and these are the standing ones
that this round finally answers rather than works around.

1. *"it feels free"* / *"there isn't really a risk or reward yet"* → the Claim, plus a
   measured opening. Fault 1 and 2.
2. *"think about a larger point to the game, or secondary objective"* → the record book and
   the Claim's ledger, on top of the relics and the drive that already exist.
3. *"make the graphics look more realistic and detailed, more gritty"* → the UV fix, then the
   imported mineral surfaces, then a second normal-mapped surface on the ship.
4. *"make it so upgrades show visual changes on the ship"* → extended to the Claim, which
   visibly grows and visibly breaks.
5. *"use pre-made assets wherever you can"* → the asset table below, with the misses named.
6. *"add a log to see how fast things drain and whether the cost is worth the benefit"* → the
   telemetry panel gets the two questions it cannot currently answer: what a run was worth per
   minute, and which upgrade paid for itself.
7. *"is there a way to see how far I have gone"* (implied by the depth marker you asked for)
   → the record book, kept across worlds.

### My additions, marked as mine

- **The core breach becomes an escape.** Breaking a core currently opens a menu. It should
  start the world coming apart around you with the shaft collapsing behind you, and the chart
  should open once you are out. The best moment in the game is currently a dialog box.
- **Ore has a shape on the ground.** Fault 2's real cause is that every kilo is the same
  decision. Heavy-and-cheap versus light-and-dear only matters when the hold is nearly full,
  so the hold should fill sooner and the manifest should let you dump a mineral by name.
- **A reason to come back tomorrow**: the Drift's worlds are seeded from a daily seed as well
  as the run seed, so the chart's offer changes day to day.
---

## Systems

### 1. The Claim — the second thing you can lose

**The idea in one line.** You do not own the ship, you own a claim on the surface: a
refinery, a fuel derrick and a store shed standing beside the pad. Cutting the world apart
shakes the ground it stands on.

**Why this and not another hazard.** Every pressure in the game today points at the ship, so
every one of them is answered by the same reflex, which is to fly up. A system you are not
touching is the mechanism the best game in this genre uses to stop mining being a treadmill,
and it is the missing half of *"it feels free"*. It also gives credits a second place to go,
which matters because a purely geometric upgrade ladder makes every amount you earn
irrelevant to the amount before it.

**State it owns** (`src/sim/claim.ts`, saved per world, cleared on a core break):

| Field | What it is |
|---|---|
| `strain` | 0–1, how far the world has been pushed. Rises with cells removed below the stability line |
| `integrity` | 0–100 on each of three structures: refinery, derrick, shed |
| `stored` | ore left in the shed rather than sold, at a better price later |

**Rules.**

- **Strain rises from your own digging, below the stability line only.** Per cell removed,
  scaled by how far below the line it is. Dwelling costs nothing on its own — heat already
  charges for that, and two systems charging for the same verb is one system.
- **Strain is spent, not survived.** At 1.0 a surface quake fires: each structure rolls
  against its own exposure and takes damage, strain drops to 0.35, and the world is a little
  richer afterwards (`rich` rises 4%). The world is being broken open, and that is worth
  something. *This is the bet: a shaken world pays more.*
- **Damage is a discount, never a wall.** A damaged refinery pays less per kilo. A damaged
  derrick refuels slower. A damaged shed loses a fraction of what is stored. None of them
  stops a run, and none of them can make a save unwinnable, per `CRAFT.md`.
- **Repair costs credits and one deep material.** The material for repairing the refinery is
  found below the stability line, so the thing that fixes the surface is only found in the
  place that breaks it. `CRAFT.md`: gate an upgrade behind a place, not a price.
- **The shed is the greed dial you hold yourself.** Store ore instead of selling and it is
  worth 1.4x at the end of the world, if the shed is still standing when you break the core.

**Numbers, first pass, to be replaced by whatever the probe says.** Strain per cell at the
line 0.004, doubling by the core; quake at 1.0; refinery damage 12–30; refinery payout
penalty 0.35 x damage fraction; repair 900 cr plus 4 units of the deep material; shed
multiplier 1.4 and shed loss 20% of stored per quake at full damage.

**The test.** `test_claim`: strain is monotonic in cells removed and zero above the line; a
quake never reduces payout below 0.5x; the repair material's generation depth is below the
stability line at every leg; and the invariance test `CRAFT.md` asks for — same world, same
digging, different starting bank, same strain.

**How it is shown.** The Claim is geometry on the pad you fly past every time you surface, and
it is the only place the gauge lives. No new HUD element: `CRAFT.md` says a HUD is a claim
about what the player should think about, and this is a thing you should think about when you
are up, not while you are cutting. A quake is a shot: the camera shakes at the surface, dust
comes off the structures, and one of them is visibly bent afterwards.

---

### 2. The economy, measured

**The fault, restated in one number.** The first hold you sell pays 1,223 credits. The first
rung of Thrusters, Cargo, Drill and Scanner together cost 480.

**The rebuild.**

- **Price every pressure-answering upgrade against the depth where its pressure begins**, not
  against the first haul. Fuel Tank and Cooling Rig rung 1 land at roughly three holds from
  the band where fuel and heat first bite, not one.
- **Flatten the multiplier and lengthen the ladder.** A 2.0x step means the last rung costs
  more than the first eight together, which is why maxing is 245,000 credits and nobody will
  ever see it. 1.55x is already recorded here as hyper-inflationary. Target 1.35–1.45 with
  more rungs and a real top.
- **Give credits a sink that is not a rung**: Claim repair, shed storage, and transit fuel.
- **The rule the shop obeys**: everything unlocked, plus exactly one teaser, the shallowest
  thing still out of reach. Already the rule, now asserted at every leg rather than at one.

**The tool, and this is the milestone that matters.** `scripts/econ.mjs`: run a scripted
player through the pure layer — dive to the best band reachable, fill, climb, sell, buy the
best affordable rung, repeat — and report the run number and the wall-clock minute at which
each upgrade is bought, for three play styles (cautious, greedy, optimal). `CRAFT.md`:
measure a progression by simulating play, never by dividing a late price by early income.

**The test.** `test_econ`: the first sale buys at most one rung; Fuel Tank and Cooling are not
affordable before 60% of the depth where their pressure starts; every upgrade is bought by
leg 6 under the optimal style; and the spread between cautious and greedy is at least 25%,
because when every style scores the same, the finding is that the game has no decision in it.

---

### 3. The first world, compressed

**The fault.** Planet 0's core is at 110 m with heat at 70 and tremors at 85, and five
sessions of play have never gone past about 78 m. Everything from the chart onward is
unplayed rather than unbuilt.

**The change.** The three thresholds stop being global constants and become functions of the
leg, anchored to that world's core:

| | Now | Proposed leg 0 | Relation |
|---|---|---|---|
| Core | 110 m | 58 m | `core(leg) = 58 + 28 * leg` |
| Heat line | 70 m | 32 m | `heat = round(0.55 * core)` |
| Tremor line | 85 m | 44 m | `tremor = round(0.76 * core)` |

So the first world teaches heat at 32 m, teaches tremors at 44 m, and ends at 58 m — a core
break, a chart, a crossing and a trait inside the first session. Leg 1's core is at 86 m, and
by leg 4 the numbers are where they are today.

**The invariant survives, as a relation instead of a constant.** `GRANITE_TO_SCORIA ===
HEAT_DEPTH` becomes `graniteToScoria(leg) === heatDepth(leg)`, and the test asserts it at
every leg rather than at one. The four things that land on the same metre still land on the
same metre.

**Existing saves.** The depths are written into the save the first time a world is entered, so
the world you are standing on keeps the numbers it was generated with. A save cannot end up
with its ship below a core that moved.

---

### 4. Breaking the core becomes the best moment instead of a dialog

Today: the core breaks, a modal opens, you pick the next world. The most cinematic beat in the
game is a box with a button.

**The breach.** The core cracks, and the world starts coming apart from the bottom up:

1. A hard shake, the lamp cuts to emergency red, and the ambient goes to ember.
2. **Ninety seconds on the clock**, shown as the shaft filling from below rather than as a
   number. Tremors every 6–9 s instead of every 27.
3. Collapse propagates upward through dug cells behind you, so the route you cut is the route
   that closes. The pathfinder guarantee stays: `CRAFT.md` says never let a hazard take the
   run, so the collapse can never seal the last open route to the surface, and there is a test.
4. Reach the pad and the transit plays as it does now, with the world breaking apart behind
   you rather than receding intact.
5. Fail to reach it and you are towed for the usual cut — you lose the hold, not the run, and
   the world still breaks.

**Why it earns its cost.** It is one clock, reusing the tremor system, the collapse system,
the tow and the transit, and it converts the moment the game is named after into something you
survive. It also makes the shed a real decision: everything stored is sold at the breach.

---

### 5. The hold becomes a decision

`CRAFT.md`: a weight cap is what turns "which is worth more" into a decision — but only in the
minutes when it binds. Today the hold is 60 kg and the ore that fills it is chosen for you by
what you happened to fly through.

- **Dump by mineral from the manifest.** One tap on a row jettisons that mineral. It is the
  action the manifest has been describing for four versions without offering.
- **Widen the weight spread** so heavy-and-cheap genuinely competes with light-and-dear. Keep
  the value spread on a premium under 2x per the recorded measurement, and put the variety in
  weight instead.
- **The hold fills sooner and the climb is where you pay for it**, which is Motherload's
  weight-versus-fuel tradeoff, the one mechanism in that game everybody remembers.

---

### 6. Everything POLISH.md asks for that this game has never had

- **Haptics.** There is not one `navigator.vibrate` call in the repo. Android Chrome supports
  it, it is three lines behind a settings toggle, and `POLISH.md` requires every action to
  fire visual, audio, camera and haptic together. Cutting a block, a strike, a quake, a
  purchase, a tow.
- **A run debrief.** A run currently ends by folding numbers into a total. It should show what
  the run paid, the depth reached against the record, what was left on the ground, and the one
  thing you were closest to affording — `POLISH.md`'s "a run that ended one decision short".
- **A record book.** Deepest metre, best haul, fastest core, worlds broken, relics held,
  components carried. A collection that does not decay, kept across worlds, reachable from the
  pause screen beside the patch notes.
- **The tremor roll gets seeded.** `planCollapse()` takes `rand: () => number = Math.random`
  and the shipping game takes the default, so the one event a replay cannot reproduce is the
  one that decides whether the way out is open. It moves onto the world's seeded stream.

---

## Presentation

### The rock, starting with a bug

`src/materials.ts:198` sets `vec2 rockUv = wpos.xy` for **every face of every cell**. That is
correct only for faces pointing at the camera. A tunnel floor or ceiling has its extent in X
and Z and is being sampled with (x, y), so one whole axis of texture variation collapses and
the surface reads as a flat band rather than stone. Every horizontal tunnel, every cavern
floor and every ledge underside in the game is currently smeared.

**The fix is the round's new technique**: pick the projection plane per face in the vertex
shader from the box's own normal — `abs(normal)` decides between `wpos.xy`, `wpos.zy` and
`wpos.xz`. This is triplanar mapping's right-sized form for this geometry: the terrain is a
flat-shaded box with hard 90-degree edges, so there is no seam for a three-way blend to hide,
and a full blend would triple the texture fetches for nothing. Cost: 0 KB of bundle, 0 draw
calls, a handful of scalar compares at vertex frequency. Sources are in the research note;
the canonical ones are GPU Gems 3 chapter 1 and Ben Golus on triplanar normal mapping.

Filmed on a horizontal tunnel and a cavern before and after, because a texture artefact under
a moving lamp does not show in a still.

### The rest of the art pass

- **More mineral surfaces**, normal and roughness only, never colour, so twelve palettes keep
  deciding colour. Table below.
- **A normal map on the hull.** The ship is the object on screen for the entire game at full
  size, and it is the one large surface with no relief on it. `CRAFT.md`: "cartoony" means
  under-lit and under-textured, and a normal map on the largest surface does more than a model
  swap.
- **The Claim as geometry**, built from imported industrial props rather than modelled, since
  it stands at full size on screen every time you surface and it is exactly what the assets
  rule is for.
- **The breach as a grade**: ember ambient, red lamp, dust density up, the vignette closing.
  One palette shift driven by one number, not five separate effects.

---

---

## Assets

Hunted 2026-09-10 against `ASSETS.md`. The rule is a measurement, not a preference: import
what the player reads at its real size, model in code what is judged on silhouette at thirty
pixels. Everything below is CC0 or OFL unless stated, and every import is **normal and
roughness only, never a colour map**, because twelve palettes keep deciding colour.

### The budget decision that comes first

There is **no glTF loader in the bundle today** — the ship, the pad and every prop are coded.
The first model import therefore costs `GLTFLoader` once, roughly 15 to 20 KB minified and
gzipped, before a single model's bytes. Today's totals: 747.2 KB overall, and the `index`
chunk is already at 151.1 KB against a 144.4 KB budget, drifting +4.61%.

**So the loader and the props are lazy-loaded, not bundled.** They are surface geometry, and
the surface is not the first thing on screen: the game is interactive before the pad's
detail arrives, the loader lands in its own chunk, and the size guard gets a new budget line
for it rather than a raised one on `index`. If that proves awkward, the fallback is to keep
the Claim coded and spend the import budget only on textures, which cost no loader at all.

### Surfaces — the textures, which need no loader

| Need | Source | Id | Licence | Fetch | Into |
|---|---|---|---|---|---|
| Granite | ambientCG | `Granite002A` | CC0 | `python assets.py get ambientcg Granite002A --res 1K --maps NormalGL,Roughness` | `src/textures/` |
| Basalt, and obsidian by reuse | ambientCG | `Rock035` | CC0 | `python assets.py get ambientcg Rock035 --res 1K --maps NormalGL,Roughness` | `src/textures/` |
| Ice | ambientCG | `Snow006` | CC0 | `python assets.py get ambientcg Snow006 --res 1K --maps NormalGL,Roughness` | `src/textures/` |
| Sandstone | ambientCG | `Rock029` | CC0 | `python assets.py get ambientcg Rock029 --res 1K --maps NormalGL,Roughness` | `src/textures/` |
| Marble | Poly Haven | `marble_cliff_05` | CC0 | `python assets.py get polyhaven marble_cliff_05 --res 1k` | `src/textures/` |
| Crystal, and salt by reuse | ambientCG | `Onyx006` | CC0 | `python assets.py get ambientcg Onyx006 --res 1K --maps NormalGL,Roughness` | `src/textures/` |

Each becomes a WebP pair and a palette-driven material variant through the existing
`src/materials.ts` path. No new code path, no loader, and they are the reason the UV fix goes
first: a better normal map projected wrong is still smeared.

### Props and the ship

| Need | Verdict |
|---|---|
| **The drill ship** | **Stays coded.** Nothing CC0 is a purpose-built mining vessel at a sane size, and this is the hero object on screen for the whole game. The search is the answer, not a redirection |
| **The landing pad and the Claim** | Import. On screen at full size every time you surface, which is exactly what the rule is for. Kenney `factory-kit` (crates, pipes, catwalks), `space-station-kit` (antennae, panels, lights), `modular-space-kit` (platform tiles) |
| **Drill tier, visibly** | PolyPizza `8uBbH7Dvmb`, Kay Lousberg's Drill, CC0, 1,198 tris, as the nose attachment that changes per tier |
| **Thruster and plating tiers** | Kenney `space-kit` parts, **only if** the zip turns out to contain glTF. It is an unversioned Kenney pack, which historically means OBJ or FBX, and nothing here converts those |

**Verify before relying on any of them**: only the versioned zips (`factory-kit_3.0`,
`city-kit-industrial_2.0`, `modular-space-kit_1.0`) are likely to be current-format re-exports.
The milestone opens the zip and looks before the plan promises anything.

**This shortlist is provisional, and here is why.** The hunt found that
`gamedev-notes/scripts/assets.py` could not search Kenney at all: its listing regex matched
only double-quoted links, and Kenney's pages emit single quotes — measured at 55 single-quoted
against 6 double-quoted on one category page, so about a tenth of the library was visible and
the rest was reported as absent. It is fixed now, and the very first re-run surfaced
**`modular-cave-kit`**, which nothing in the original shortlist knew existed and which is the
most obviously relevant pack in the library to a game made of caves. M2 re-runs the search
before importing anything.

Every imported mesh has its baked atlas stripped at load and a `MeshStandardMaterial` coloured
from the palette assigned instead, roughness about 0.8 and metallic 0 unless the piece is meant
to read as bare metal. That keeps a Kenney crate and the coded ship under one lighting model.

### Interface

| Need | Source | Id | Licence | Note |
|---|---|---|---|---|
| HUD frames, gauge and bar plates | Kenney | `ui-pack-sci-fi` | CC0 | 768 KB zip, a handful of sprites reach `dist/` |
| Ten icons | Lucide | `fuel`, `flame`, `package`, `coins`, `drill`, `zap`, `bomb`, `radar`, `anchor`, `rocket` | ISC | One stroke family, tinted by `currentColor`, so the palette still decides. There is no tow-truck glyph, `anchor` is the tow |
| Display face | Google Fonts | `Orbitron` 700/900 | OFL-1.1 | Wide, geometric, industrial |
| Numerals | Google Fonts | `Share Tech Mono` 400 | OFL-1.1 | A readout face for the gauges, about 20 KB |

Both faces join the existing two in the Workbox precache glob, or an installed app falls back
to a system face offline.

### Sound

Eight CC0 sounds from Freesound, fetched as HQ OGG previews: drilling loop `634322`, rock
break `524312`, ore pickup `646673`, thruster loop `347576`, hull damage `682736`, tremor
rumble `483287`, purchase click `839832`, alarm `584287`.

These replace the synthesised **effects**, where a produced sample is simply better. **The
music stays synthesised**, and this is now a measured answer rather than an inherited one: the
scout searched OpenGameArt and Freesound for a bed, a tension layer and a danger layer at one
tempo and key, and no CC0 library indexes stems as a matched set. The score mixes live by
depth, danger and zone off one scheduler, and nothing available can do that.

### The misses, plainly

- No distinct CC0 basalt, obsidian or salt scan. Handled by reusing one normal map and
  separating them in code by roughness and palette.
- No CC0 drill ship worth importing. The ship stays code.
- No CC0 layered music stems anywhere searched. The score stays code.
- `assets/CREDITS.md` does not exist in this repo yet, and the four textures already in
  `src/textures/` are not recorded anywhere. `POLISH.md` requires it. M7 writes it and
  backfills those four.

---

## Tests and tools

| Layer | What is added |
|---|---|
| Probes | `scripts/econ.mjs` (three play styles, run-by-run purchase report), `scripts/claim.mjs` (strain per style over a world) |
| Golden | Claim strain and quake sequence for a fixed seed; the per-leg threshold table |
| Design | `test_econ` and `test_claim` above; the per-leg `granite === heat` relation at every leg |
| Boundary | `test/sim-boundary.test.mjs` already guards `src/sim`; `claim.ts` goes inside it |
| Smoke | The breach: core break, clock, collapse behind, reach the pad, chart opens. And the tow path out of a failed breach |
| Filmstrip | New scenarios `breach`, `quake`, `cavern` (the UV fix), `debrief` |
| Phone | The six questions in `TESTING.md` after the breach lands, because it is the one new thing that is all motion |

---

## Polish budget

`POLISH.md` lines this round pays for, and where:

- First sixty seconds, a win in the first minute → M3 (economy) and M5 (compressed world).
- Haptics on every action → M8.
- Ambient motion in the idle state → the Claim's structures, M2.
- The shop is a place with the real object in it → already true; the Claim extends it, M2.
- A run that ended one decision short → the debrief, M8.
- A meta-goal that does not decay → the record book, M8.
- Every screen looked at as a picture at the phone's aspect → M9, before the ship.

---

## Milestones

### Phase 1: the faults

- [x] **M1 — Measure before changing anything.** `scripts/econ.mjs` and the three play styles,
      reporting the run at which each upgrade is bought. No behaviour change. The report goes
      in `NOTES.md` and is the baseline every later number is argued against.
      **Done 2026-09-10.** Three findings the plan did not have: the hold is 11-14% full when
      a run ends so the weight cap has never once bound, every ladder is started inside four
      to sixteen minutes at every style, and depth is gated by behaviour rather than by time
      (a greedy player is at 109 m by minute seven).
- [x] **M2 — The Claim, as a place.** `src/sim/claim.ts`, strain, quakes, three structures,
      repair, the shed. `test_claim`, the strain golden, a filmed quake. The geometry comes
      with the first model import this repo has ever done, so this milestone also opens the
      Kenney zips to check they contain glTF at all, puts `GLTFLoader` and the props in a
      lazy chunk rather than in `index`, and adds a budget line for that chunk. If the zips
      turn out to be OBJ or FBX, the Claim is coded and the milestone still lands.
- [x] **M3 — The economy rebuilt on M1's numbers.** New curve, pressure-priced rungs, credits
      sink. `test_econ`. The probe report before and after, in `NOTES.md`.
- [x] **M4 — The hold as a decision.** Dump by mineral, widened weight spread, manifest tap.
      Promoted by M1 from a refinement to a missing mechanic: a cap that never binds is not a
      decision, and Cargo Hold is currently the first thing every style buys.
- [x] **M5 — The first world compressed.** Per-leg thresholds, save migration, the invariant as
      a relation asserted at every leg.
- [x] **M6 — The breach.** The clock, the collapse behind you, the tow path, the chart after.
      Filmed. This is the one to send a video of.

### Phase 2: the look

- [~] **M7 — The UV fix and the mineral surfaces.** The new technique, then the six imported
      normal and roughness pairs, then the hull normal. Filmed on a cavern, before and after.
      Writes `assets/CREDITS.md`, which this repo has never had, and backfills the four
      textures already in `src/textures/` that are recorded nowhere.
      **UV fix and CREDITS.md done 2026-09-10. The six surfaces are not in:** the fetch
      works, the JPEG-to-WebP downscale does not (sharp-cli returned a 342-byte solid
      colour). See the M7 section in `NOTES.md` for what is needed.
- [x] **M8 — Haptics, the debrief and the record book.** The three POLISH lines this game has
      never had, in one pass because they are all "what happens when a run ends".
- [x] **M9 — The screens as pictures.** Every screen at 460x996, the shop, the chart, the
      debrief, the record book, the pause sheet. Fix what the picture shows.

### Phase 3: what it becomes

- [x] **M10 — The daily Drift.** The chart's offer seeded by the date as well as the run, so
      there is a reason to open it tomorrow.
- [x] **M11 — Trait signatures with teeth.** Each trait changes a rule, not only the picture:
      Hollow's caverns carry light and hide long falls, Volatile's gas answers the bomb,
      Crystalline's veins pay on a chain, Searing raises the heat line, Stable pays a premium
      for a clean run.

---

## Second month

The Drift keeps generating worlds after the Heart, so the endgame is already open-ended. What
it wants next, in rough order: a second ship hull with different arithmetic rather than bigger
numbers, so the choice is a shape and not a rung; contracts that ask for a named mineral by a
named depth and pay in Claim repairs; and a wreck to find, which is somebody else's Claim,
abandoned, with their ledger still in it.

---

## Open decisions I made for you

Each is reversible, each has an alternative, and each goes into `NOTES.md` when it lands.

1. **The Claim is per world and does not travel.** The alternative is one Claim carried
   across the whole Drift, which makes the arc longer but means one bad world can sour ten.
2. **A quake makes the world richer.** The alternative is pure downside, which would make
   depth simply worse and is the thing this round is trying to fix.
3. **The breach clock is 90 seconds.** Long enough to climb 58 m at level 0 thrust with room
   for two mistakes. It is the number most likely to be wrong and it is one constant.
4. **The compressed thresholds keep today's numbers by leg 4** rather than rescaling the whole
   ladder, so nothing about the deep game changes, only when you first meet it.
5. **Web, not Godot.** Decided 2026-09-10 on the measurements in the summary.

---

# Round five: the Outfitter as a gas station

Written 2026-09-10 against v0.26.0, from his own design brief:

> *"like a 3d futuristic gas station. the ship parks at the gas station, it has a retro neon
> feel with the lights. anything neon should feel like it is actually coming from an object or
> light in the room, not an overlay. the shop is similar to a gas station store. there is a
> display case that is also a counter. in the display case are important and expensive
> upgrades. behind the counter on the wall are the more standard upgrades."*

He designed the room. This is how it gets built.

## What is wrong with what is there

**The plinths are a control that does nothing.** They were built to filter the shelf, the
filtering was cut in the same commit for a real reason, and four lit, labelled,
tappable-looking objects shipped anyway. `POLISH.md`: every state names a visible action. He
found it in the first minute. Two attempts to wire them back up broke three different smoke
tests, all of which were written when every case was always on the shelf - which is the signal
that the grouping is the wrong mechanism, not that the tests are wrong.

**The neon is a decal.** `MeshBasicMaterial` planes with an additive halo, at a fixed z in
front of the room. Lit rectangles, not lit fittings. His read of it is exactly right.

## The build

### R1. Neon that is a fitting

The sourced recipe has four ingredients and the room has one:

- a **tube**, not a plane - a thin cylinder, so it has a lit side and a shaded side
- an **emissive material** on that tube
- a **housing** it sits in: a shallow channel of ordinary metal, lit by the room's own lights.
  This is the missing ingredient and it is the whole reason the current version reads as a
  sticker - the eye needs "normally lit" beside "self-lit" in one glance to believe the second
- a **real light** at the tube, short range and colour-matched, which is what actually puts
  colour on the wall behind it

For the softness a bloom pass would give: a **radial-gradient canvas texture** flush against
the wall behind the tube, additive and depth-write-free - not a hard-edged colour plane, and on
the wall rather than in front of the sign. That is the difference between a halo and a light
pool.

**Light budget.** The three.js forum's practical figure is about ten fixed point lights against
a typical uniform ceiling near fifteen, and a forward renderer pays for every light on every
shaded fragment. So six to eight short-range lights, **no shadows** - a point-light shadow is
six cube faces - with `visible` and `intensity` toggled rather than lights added and removed,
which avoids shader recompiles, and `layers` keeping each fitting's light off geometry it has
no business touching. This game already uses `SHIP_LAYER` for exactly that. **Measured on the
phone before it is called done**: none of those are mobile numbers.

### R2. The forecourt

Portrait decides the composition. The sourced vocabulary is canopy, illuminated fascia band,
totem sign, pump island, bollards, wet forecourt - and in a tall narrow frame **the canopy is
the one element that reads badly**, so it is implied by the fascia band rather than modelled.

- an **illuminated fascia band** across the top of frame, the element canopy makers call the
  most visible part of the whole structure
- a **totem sign** standing tall at one side with the dock name and the world on it
- a **pump island** the ship is parked at, at eye level
- **bollards** and a nozzle at the near edge
- the **wet forecourt** filling the bottom third

### R3. The counter and the wall

His split, and it is better than the one it replaces because it is how a real shop works:

- **A display case that is also a counter** in the foreground, holding the **expensive**
  upgrades, each individually spot-lit under glass with the down-light cone already built.
  Individual light reads as precious.
- **The wall behind the counter** holds the **standard** upgrades: a repeating rack washed by
  one strip rather than lit per item. Repetition plus flat light reads as stock.

A split by PRICE, not by category - which retires the four-group filtering that has been
fighting this room since it was added. Nothing has to be tapped to reveal anything: both tiers
are on screen at once. The clutter was never the count, it was fifteen things competing for one
lighting setup.

### R4. The ship parks at the pump

The docking collar becomes a pump: a housing, a hose to the ship's existing hardpoint, a
nozzle, and a readout that ticks while the tank fills, reusing the canvas-plate code the prices
already use. A reskin of geometry that exists rather than a new system.

### R5. Wet ground without a reflection pass

The Half-Life: Blue Shift trick, still used on mobile: duplicate the geometry, flip it in Y
under the floor, darken it, blend it under a semi-transparent floor plane. **Only the neon
fittings and the ship get mirrored** - a handful of meshes, not the room - with a
normal-mapped floor at low roughness so the lights streak across it.

## Milestones

- [ ] **R1 Neon as fittings** - tube, housing, one short-range light each, gradient pools on
      the wall. Replaces `neonBar` everywhere. Frame cost measured on the phone
- [ ] **R2 The forecourt** - fascia band, totem, pump island, bollards, floor
- [ ] **R3 The counter and the wall** - expensive under glass and spot-lit, standard on a
      repeating rack behind. Retires the plinths and the group filtering
- [ ] **R4 The pump** - hose, nozzle, ticking readout
- [ ] **R5 Wet ground** - mirrored fittings and ship under a translucent floor
- [ ] **R6 The phone pass** - all of it judged at 1080x2340 rather than on a contact sheet,
      which is where the last three rounds of this room went wrong

---


---

# Round six: you find the gear, then the shop fits it

Written 2026-09-10 against v0.27.0, from his own brief on the 0.27.0 build:

> *"the neon lights look more like lights now which I like. it looks like the
> description of the upgrade is cutting into the bottom upgrades in the cases.
> also the ship is in front of the hull upgrade. For the neon, I was hoping for
> more of a mix of cyberpunk, matrix, and steam punk. also for the 3 different
> neon lights at the bottom, this normally signifies different categories of
> gear. can you expand on my design ideas and feel, research how to give this
> whole 3d space that feel, and find a way to split the upgrades into
> categories, that aren't all shown at once. I want most of the upgrades to be
> hidden for now and unlock later in the game, possibly after unlocking new
> planets. and introduce some of the other power ups later as you make it
> further into the first planet. find a way to make new items appearing feel
> natural and an intuitive way to scroll or swap through upgrades. I also want
> them to be explained in game. so you only unlock certain upgrades by finding
> them initially, the game hints at what it does and you now own it, then you
> can upgrade it at the shop."*

Standing rule 9: **when he names a mechanism, build that mechanism.** He named
one, completely, in the last two sentences. Everything below is downstream of
it.

## The two faults he can see

Both are composition, not code, and both come from the same cause: the room is
framed for the whole canvas and the canvas is not what the player can see.

1. **The card cuts into the counter.** The tray is an HTML overlay held to the
   bottom of the screen; the counter row is drawn in world space with no
   knowledge that the bottom of the frame is spoken for. Measured, not guessed -
   see S1.
2. **The ship stands in front of the wall rack.** The ship is at z 0.9 and the
   rack at z -2.15, with nine cases behind a machine parked in the middle of
   the room. This is unfixable by nudging: with a 22 degree horizontal field
   there is no "beside the ship" in portrait. The ship and the shelf must stop
   sharing a shot.

## What the research changed

Four findings, and two of them overturned what I was about to build.

**The Matrix green is exclusive, and that is the whole point of it.** Phosphor
green near `#00FF41` on near-black is a MONOCHROME grade, not one neon among
several. A surface that goes Matrix goes green-and-black only; put it beside
cyan and magenta and both identities cancel into mud. So Matrix is not a
department colour, which is what I had planned. It is **one terminal**, kept
strictly monochrome, with code falling down it.

**Gesture-only navigation is missed by most people.** NN/g measured a 21% drop
in task completion for hidden navigation and roughly half the discoverability
of visible navigation. So the aisle swipe ships with a visible dot row AND
arrows from the first commit, not as a later affordance. A swipe nobody finds is
a shop with one aisle.

**Discovery does not pause the game.** Subnautica, Valheim and Hades all do this
the same way - a short non-blocking banner at the moment of pickup, play
continues, and the shop entry itself carries no further explanation because the
fiction already did it. This game's own grammar pauses for a relic and a drive
component, and those stay: a relic is the END of a search. A schematic is a
thing you are about to USE, so it must not stop the hand that is about to use
it.

**Glow without bloom has a real technique.** A fresnel-style "fake glow" shader
on a smooth proxy mesh around the neon prop, not an emissive material on the
prop itself. It needs smooth normals, so it is an added cylinder around the
tube rather than anything baked onto the low-poly edges. This is a forward-
renderer shader, not a post pass, which is the constraint it has to satisfy.

## The mechanism: seven devices are found, not bought

The fifteen upgrades split cleanly in two, and the split is **already in the
data** - it was not invented for this round, which is why it is the right one.

Seven upgrades read `Not installed` at level zero. Those are devices the ship
does not have. Eight do not, because they are ladders on gear the ship is
already wearing - a bigger tank, a thicker hull, a better drill.

So:

| | what it is | how you get it |
|---|---|---|
| **drill, cargo, thrust, tank, scan, tow, hull, cool** | ladders on gear you already have | the Outfitter sells them, depth-gated as now |
| **magnet, survey, bomb, laser, auto, drone, reactor** | devices you do not have | **found in the ground**, then the Outfitter improves them |

Nothing about the second column is buyable until it is found. That is "most of
the upgrades are hidden for now", and it is hidden for a reason the player can
state: *I have not found one yet.*

### Where they are, and when

One per device, buried like the relic and the drive component are - a hashed
cell on the world rather than a roll against the ore stream, so a schematic
never loses a coin flip to a cave and never eats a roll another generator was
using. Its own seed offset, 257, registered with the rest.

Two gates decide what can be down there: the **leg** it first appears on and the
**depth** it is buried below, which is the `unlock` depth the row already had.

| device | from leg | below | what the first world holds |
|---|---|---|---|
| Salvage Magnet | 0 | 20 m | yes |
| Deep Survey | 0 | 35 m | yes |
| Seismic Charge | 0 | 40 m | yes |
| Reactor Core | 1 | 50 m | |
| Repair Drone | 1 | 60 m | |
| Autopilot | 2 | 65 m | |
| Cutting Laser | 2 | 90 m | |

Leg 0's core is at 58 m, so the first planet holds exactly three of them, at 20,
35 and 40 metres - which is his *"introduce some of the other power ups later as
you make it further into the first planet"*, arriving at three separate moments
of one descent rather than all at the surface. Everything past that arrives with
a new world, which is his *"possibly after unlocking new planets."*

**Missable, but never lost.** Leave one in the ground, break the core, and it
comes back on the next world at a new position, because the candidate list is
"everything not yet found whose leg has come". That is deliberately kinder than
the relic. A relic is a trophy and losing one is a story; a device is a verb,
and a save that can permanently lack a verb is a save that got worse by
accident.

### The moment itself

A crate in the rock, lit, obviously not ore. Break it and a banner slides in for
four seconds carrying three things and nothing else: what it is, one line of
what it does, and that it is fitted. No tap, no pause, no modal - the drill keeps
turning. Then it is on the ship, at level one, for free, and the Outfitter has a
new row.

The free first rung is the reward for the dig. It is worth 33,300 credits across
all seven, spread over hours, and it is paid for by the fact that none of those
seven can be bought at all until the rock gives them up.

## The room: four aisles, one at a time

Four departments, each with its own bay in the room, its own sign, and its own
camera station. Swipe or tap an arrow to move along the forecourt; the camera
glides. Never more than five cases in a shot.

| aisle | holds | lit in |
|---|---|---|
| **RIG** | drill, cargo, thrust, magnet | brass amber |
| **LIFE** | tank, hull, tow, cool, drone | hot magenta |
| **SURVEY** | scan, survey, auto | cyan |
| **ORDNANCE** | bomb, laser, reactor | violet |

Ordnance is **entirely** found. Until you dig up your first charge, that aisle
is dark and unlit and the swipe passes it by - and the first time you dock after
finding one, the shop opens on that aisle with its sign coming up. A whole
department lighting for the first time is a better reward than a row appearing
in a list.

This is also the honest answer to his read of the three console bars: *"this
normally signifies different categories of gear."* He is right that coloured
lights in a row mean categories, and the room was using them for claim strain,
depth and stock. The bars become the aisle indicator - one per department, in
the department's colour, the current one burning and the rest idle - which is
both the dot row the research demands and a fitting rather than an overlay.

**The ship stops sharing a shot with the shelf.** It is parked at the pump, and
the pump is the forecourt station at one end of the sweep. Buying something cuts
the camera to it for a beat so you see the part go on, then returns. That is a
better feedback moment than a static ship behind the stock, and it is what
finally kills the occlusion instead of nudging it.

## The look: one identity per role

The blend rule, and it is the finding that makes the three styles survive being
in one room: **do not mix them on a surface, give each a job.**

- **Steampunk is the room.** Brass, copper and riveted iron are what the
  building is made of - the counter, the pump, the pipe runs, the gauges with
  real needles, the valve wheels. It reads through silhouette and albedo and
  costs no lights at all, which is why it can be everywhere.
- **Cyberpunk is the light.** Magenta and cyan, the sourced pair, rationed
  against a warm brass base - accents that cut through, never a wash. Two or
  three of the seven lights are warm filament practicals, two or three are the
  cool signage accents.
- **Matrix is the information, on exactly one surface.** The terminal behind the
  counter: phosphor green on black, monochrome, code falling down it, drawn to a
  canvas at twelve frames a second with scanlines in the texture. Nothing else
  in the room is allowed that green.

And the tubes get the fresnel proxy, because an emissive material with no bloom
behind it is a bright line and this renderer will never have bloom.

## Milestones

- [x] **S1 The two faults** - the tray's height measured on the phone and the
      room framed above it; ship and shelf separated by composition
- [x] **S2 `sim/finds.ts`** - seven devices, hashed positions on offset 257, the
      block, the break, the banner, the save field, the tests
- [x] **S3 The shop sells what you own** - `shelfStock` gains the found gate,
      departments become the layout, ordnance starts dark
- [x] **S4 The aisles** - camera stations, swipe, dot row AND arrows, the dark
      aisle. The cut-to-the-ship on a purchase was CUT: the ship is a station of
      its own at the end of the run, and moving the camera under the player
      every time they buy a rung is a thing that is charming once and irritating
      the fourth time
- [x] **S5 The look** - brass and rivets, rationed magenta and cyan, one Matrix
      terminal, fresnel proxies on the tubes. Six measured corrections, every
      one of them found by a screenshot rather than by the numbers - see the
      note below
- [ ] **S6 The phone pass** - judged at 1080x2340, with the light count measured

## S7: the kit becomes a discovery too

From his read of 0.28.0:

> *"The 6 upgrades at the bottom feel out of place and are too big of an
> advantage to just purchase. Can you remove all 6 of the upgrades from the
> bottom of the page. Make it so you have to find them as you dig, then after
> you find them, you can upgrade them. They will only show up in the shop after
> they are found. A secret display case at the bottom of the screen pops open
> and shows all of the upgrades you have collected and lets you purchase the
> upgrades there."*

Both halves right, and the second is the sharper one. A Bulwark Field absorbs
three impacts outright and was on sale to a first-hour player for money they
would have in ten minutes.

**The mechanism was already in the ground.** Supply caches have been buried on
every world since the game had caches, and opening one already handed over a
consumable. The only thing missing was the consequence: the first one of a kind
you are given is the one that teaches the Outfitter it exists. So a cache now
prefers something you have never held, and the kit fills in as a by-product of
playing rather than as a second hunt - deliberately softer than the devices'
gate, because two gates of the same hardness would make the first hour a
scavenger list.

**The drawer.** A brass front in the counter with a handle, which drops on a
hinge while a lit shelf slides out. Three things make it read as a drawer
rather than a panel that appears: the front hinges rather than fading, the
shelf slides while it does, and the inside is dark until it opens. One drawer,
moved to whichever counter is in frame, for the same reason there are two
roaming lights rather than eight.

- [x] **S7** - the kit is found, not bought, and lives in a drawer

### What the measurements missed again, and what caught it

Three faults, three different detectors, and the pattern is the same as S1-S5.

**Two rows of three does not fit.** Measured: the drawer has 117 px of band
between the counter cases and the tray, and two rows of crates with plates want
about 160. They overlapped each other and ran under the tray. One row of six,
read by coloured lid and four-letter code, with the card expanding whichever
one you tap.

**The counter's light and the drawer wanted the same sixty pixels.** The strip
was on the counter's front lip, which is where a drawer is; the brass front
came out with a bright coloured bar through the middle of its label. It moved
under the counter TOP, which is where the light is on a real display counter
anyway - lit glass above, dark drawers below.

**A fitting's brightness is a function of its distance from the lens.** The
same tube and the same settings read as a neat lit line on a wall four metres
back and as a full-width glare at the counter: 3.2 units at that distance is
about 880 screen pixels, wider than the phone. Fittings take a `glow` scale
now.

And three bugs that only a running browser could show: a circular import
between `ui.ts` and `input.ts` that presented as "Cannot access 'k' before
initialization" with the shop simply never opening; a projection 97 px out
because the station camera is not a child of the station scene, so updating the
scene leaves the camera's matrix stale; and a test helper calling `advance()`,
which stops the clock and never gives it back - the game froze with the mode
still 'play' and the key still held, which is about as misleading as a symptom
gets, and is the trap already written down beside `startClock`.

## What the numbers missed, and the screenshots caught

Worth writing down, because it is the same lesson twice and it is about the
harness rather than about the room.

A measurement harness was built for S1 that projects every case into screen
pixels and compares it against the tray. It found the real fault immediately -
the room was composed for the whole canvas while the tray covered 40% of it -
and it was right about that. Then it passed a layout in which two of the five
plates were half off the edges of the screen.

**A case is not a point.** The harness measured projected CENTRES against a
24-pixel margin. The plates are 136 pixels wide and the outer centres were 133
pixels from the middle, so both hung over the edge while every centre was
comfortably inside. The same blind spot passed a Matrix terminal a third of
which was off the left edge.

Five more things only the screenshot could say: the light pool under the
counter was sized off the tube's LENGTH in both axes and threw a pink fog over
the whole counter; the imported wall panels are a metre tall and sit on the
deck, so the rack and the sign floated in pure black with nothing for a light
to land on; the ambient was left at a workshop's 1.15 and drowned every neon in
the room; the selection panel behind each case was a hard-edged rectangle
visible on all five at once; and the aisle name was printed by the DOM directly
on top of the 3D sign already saying it.

The rule this earns: **a harness that measures positions cannot judge a
composition.** Keep both. The numbers say what is provably wrong and the
picture says what is actually wrong, and this round needed six passes of the
second after the first had gone green.

---

# Round seven: fuel is the game, and a prize is rare

Written 2026-09-10 against v0.29.0, from his own brief:

> *"I dont want towing to be a thing. if you run out of gas, you should game
> over. I want digging to cost a much larger amount of fuel than just flying, so
> that when you get close to running out of fuel, you have a better chance of
> getting back safely. when you get close to running out, make it obvious that
> you are in danger and make the fuel flash red. I want there to be way less
> special resources to show up so it actually feels like a prize when you get
> one. you only start seeing new resources when you get really deep and even
> then they are rare."*

Four asks, and three of them are one system: **fuel has never actually been a
constraint, and the tow is why nobody noticed.**

## What is measured, before anything is designed

### 1. Fuel stops binding exactly when the stakes rise

A full tank, against cells of the hardest rock at that depth, at a player
plausibly kitted for the leg:

| leg | core | tank | fuel per cell of basalt | climb home | **cells a tank buys** |
|---|---|---|---|---|---|
| 0 | 58 m | 90 | 5.02 | 15 (17%) | **14** |
| 5 | 298 m | 250 | 1.05 | 41 (16%) | **199** |
| 11 | 586 m | 450 | 0.53 | 50 (11%) | **760** |

The Drill divides the cost of a cell and the Tank multiplies the supply, and
the two compound. By the end of the ladder a tank is seven hundred and sixty
cells of the hardest rock in the game, which is not a resource, it is a
formality. His *"digging should cost a much larger amount of fuel than just
flying"* is the right instinct aimed at the wrong half: **per cell, digging
already costs six times a metre of flight. What it does not do is stay
expensive.**

The fix is not a bigger number. It is to charge fuel per CELL rather than per
SECOND, so the Drill buys speed and never efficiency.

### 2. The climb home was always affordable, and never shown

The rightmost column above is the good news: getting out costs 11 to 17% of a
tank from the deepest cell in the world, at every stage of the game. His
instinct - *"you have a better chance of getting back safely"* - is already
true and has never once been communicated, because a tow meant it did not
matter.

That is what makes death fair enough to ship. The gauge can tell you exactly
what the climb costs, because the game can compute it.

### 3. The rarest thing in the game is the fourth most common

`chance` in the ore table is not a probability, it is a cumulative threshold:
`blockAt` walks ORES deepest-first and takes the first whose `chance` the roll
falls under. So each ore's real share is the gap to the next one up - and the
deepest ore, tested first, keeps its whole number.

Measured, per cell, at depth:

| depth | total ore | what is in it |
|---|---|---|
| 10 m | **10.0%** | copper 10.00 |
| 60 m | **10.0%** | amethyst 5.50, gold 0.50, silver 1.00, iron 1.50, copper 1.50 |
| 250 m | **10.0%** | **solmarrow 2.10**, umbrite 0.50, coreite 0.40, magmite 0.80, ruby 0.40, emerald 0.60, amethyst 0.70, gold 0.50, silver 1.00, iron 1.50, copper 1.50 |

Three things are wrong and all three are his complaint:

- **One cell in ten is ore, at every depth in the game.** Going deeper never
  makes a find rarer or commoner, it only changes which one. There is no
  scarcity curve at all.
- **Solmarrow is worth 132,000 and turns up at 2.10%** - four times as often as
  Umbrite at 54,000, five times as often as Coreite. The whole deep tier is
  ordered backwards.
- **Adding a deeper ore steals from the one above it** rather than adding
  density, which is why the table has quietly flattened as it grew.

### 4. Every world shows you almost everything

`coreDepth(leg) = 58 + leg * 48`, and the ore gates are at 4, 11, 22, 36, 56,
78, 105, 145, 185, 210, 245 m. So the first world, 58 m deep, already contains
copper, iron, silver, gold AND amethyst. Five of the eleven materials in the
game are on the tutorial planet. *"You only start seeing new resources when you
get really deep"* is not a change of degree; it is the opposite of what the
table does now.

## What the research settles

**Nobody wipes the save.** Not one comparable game destroys its meta-progression
on a single failed run - permadeath modes wipe a *run* or a *character*, never
the unlocks. The penalty that reads as real stakes without producing quitting
is consistently: **the run's take is lost in full, and nothing permanent is
touched.** SteamWorld Dig takes half your gold and drops your loot; Deep Rock
leaves you 25% of a failed mission; Subnautica takes only what you were
carrying.

So **"game over" here means the hold, the run and the ship - and nothing else.**
Credits already banked, every upgrade level, every relic, every drive component
and the world itself all survive. That is already harsher than any of the games
above, and it is where I am drawing the line: taking the upgrade ladder would be
the one decision no shipped game in this genre makes.

Two findings underneath it are worth more than the verdict:

**Motherload does exactly what he asked for.** Run the tank dry and the digger
explodes - game over, no rescue. And *Super Motherload* sells the rescue back as
a premium panic button: a cheap teleporter that can malfunction and kill you,
and an expensive one that always works. Coreward has been shipping the sequel's
panic button as the default outcome.

**Which means the Fuel Cell is promoted, not replaced.** The consumable that
burns 35 fuel straight into the tank has been a minor convenience. With no tow
it becomes the thing that saves your life - and it is now something you have to
find first. No new mechanic needed; an existing one stops being decoration.

**The Point of No Return is the name for what he described.** It is the aviation
term for the moment you no longer carry the fuel to return, and the design
commentary is explicit that *it only works as tension if the player can compute
it*. That is the piece Coreward is missing - not a bigger fuel cost, a visible
reserve.

**The warning has sourced numbers.** One continuously escalating cue per
resource rather than two discrete pops (Deep Rock keeps oxygen and health on
different sound identities so they can never be confused). Dead Space switches
colour at 75 / 50 / 25%. Subnautica's first oxygen warning is at about 40%
remaining. Haptics belong only in the last seconds - a constant buzz goes numb.
And the hard limit: **never more than three flashes a second, under 25% of the
screen, no sequence longer than five seconds** (WCAG and the Game Accessibility
Guidelines agree).

**Rarity should come from depth, not from a low roll.** The one sourced
mechanism is Motherload's: a material does not exist above its floor depth, so a
player who does not go deep never rolls for it at all. That avoids the failure
mode where a rare thing "could have dropped an hour ago" and the hunt becomes
grinding. And the moment itself wants the withheld-then-revealed treatment: a
distinct sound and colour beat at the reveal, not a background particle nobody
catches.

---

# The build

## F1. Fuel is charged by the cell, not by the second

The measurement says the ratio is not the problem - per cell, drilling already
costs six times a metre of flight. The problem is that the ratio **decays**: the
Drill divides the cost of a cell, the Tank multiplies the supply, and by leg 11
a tank is 760 cells of basalt.

So fuel is charged against PROGRESS THROUGH THE CELL rather than against time
spent drilling:

```
FUEL_PER_CELL(hard) = FUEL_CELL_BASE + hard * FUEL_CELL_PER_HARD
```

billed pro-rata as the cell is chewed, so a half-dug block costs half. **The
Drill now buys speed and never efficiency**, which is what keeps the constraint
alive at every level. A partial dig is charged fairly, which the per-second
model also did and which a charge-on-break model would not.

Flying is untouched: 0.8 a second, and the whole point.

## F2. The reserve is on the dial

`fuelHome()` walks the actual route back with the existing BFS - not the depth,
because a tunnel is not a straight line - and converts it to fuel at the ship's
current speed. From that, one ratio: `fuel / fuelHome`.

- **above 2.2** clear
- **2.2 to 1.5** amber, and the readout names it
- **1.5 to 1.0** red, pulsing at 2 Hz, an escalating tone, a vignette
- **below 1.0** you can no longer get home, and everything says so

The dial gets a **red band that MOVES**: the reserve you need is drawn on the
fuel gauge and grows as you descend, so you watch the arc you cannot spend eat
into the tank. That is the Point of No Return made visible, which the research
says is the only way it works at all.

Flash rate 2 Hz, the vignette under a quarter of the screen, no sequence past
five seconds - the accessibility limits are hard numbers and they are cheap to
respect.

## F3. Running dry kills you

Both zeroes kill now, fuel and hull. The ship is lost with everything in the
hold. A proper death - the ship breaks up, the screen goes, and a card says what
happened and how deep.

**Tow Insurance is deleted.** It is an upgrade whose entire subject no longer
exists. Anyone who bought a level gets **every credit they spent on it back**,
once, on load - which is the honest thing to do about deleting something
somebody paid for.

In its place, on the same axis the round is about: **the Scrubber**, which cuts
the fuel a cell costs. The survival group gets a real ladder on the game's new
central resource, and the shelf keeps fifteen rows.

## F4. Ore, re-tabled

Rarity comes from depth first, as the research says, and from the roll second.

The ladder spans **eight worlds instead of five**, so a new material arrives
roughly every planet: copper and iron on the tutorial world, and Solmarrow not
until 372 m, which is planet 7. And the deep tier's shares are inverted back the
right way round, so the most valuable thing in the game stops being the fourth
most common.

Total ore density drops from a flat 10% to about 5%, and the top four materials
go from 0.4-2.1% to 0.10-0.25%.

That halves mining income, so **the values and the ladder are re-tuned against
the econ probe rather than guessed** - which is what it is for.

## F5. A first find is an event

The first time you ever cut a given material, the game stops for a beat and
tells you what it is and what it is worth, with the banner the devices and
supplies already use. Withheld, then revealed, then a sting that is not the
ordinary collect sound.

After that it is just ore. The prize is the discovery, not the pickup.

## Milestones

- [x] **F1** fuel per cell, drill buys speed not efficiency, measured at every leg
- [x] **F2** `fuelHome`, the moving reserve band, the escalating warning, the red dial
- [x] **F3** death replaces the tow; Tow Insurance deleted and refunded; the Scrubber
- [x] **F4** the ore table: eight worlds, rarity ordering fixed, density halved
- [x] **F5** the first-find reveal
- [x] **F6** the economy re-tuned against the probe, goldens re-recorded with the diffs read

## What the probe says afterwards

| style | first upgrade | minutes to all ladders | payout spread |
|---|---|---|---|
| cautious | 1.4 min | 13.7 | 183 - 894 |
| greedy | 2.3 min | **21.4** | **0 - 563** |
| optimal | 1.0 min | 8.1 | 381 - 6841 |

Greedy loses the ship twice in twenty-four runs and takes half as long again to
get every ladder started. That is the whole round in one row: digging past your
reserve is now the thing that costs you, and the cautious player is no longer
the one being punished for it by a tow fee.

## What had to move with it, and why

The ore rebalance was not a table edit. Halving the ore doubled every mineral
gate without anybody choosing to - maxing the tree wanted 72 iron, about sixteen
hundred-cell runs of nothing but looking - so the requirement now grows by one a
rung and stops at four. Five upgrades changed which mineral they are built from,
because gold and amethyst went below the first world's core and an opening row
cannot ask for something that is not there yet. Prices were re-ordered so a row
that unseals deeper still costs more.

And the frozen world reference was re-recorded for the first time since it was
made - the one thing its own note always said would require it. The diff was
read first: of 15,639 cells, 11,053 changed rock band (already licensed), 841
changed ore, 574 stopped being ore and 368 started, against a deliberate density
cut from 10% to 7.5%.


---

# Round eight: one world, and a reason to be in it

Written 2026-09-10 against v0.30.0, from his own brief:

> *"I like how a lot of it is feeling but it still feels like there is a main
> component missing. can you redesign how the main overall objective works? I
> want to stay on one plannet for much longer. find more secrets, random caves,
> and other things to make the planet feel mysterious and intriguing. I want the
> entire game to be based around one planet ... I dont want to just try to dig to
> the bottom. can you fully redesign the main objective into something closer to
> dome keeper but unique. I want to remove the buildings or redesign them
> visually and their purpose. redesign the ship to look more steam punk and
> unique. redesign the blocks for a more interesting stylized feel."*

## What is actually there today, before anything is designed

An honest inventory, because most of this round is deciding what to keep.

| system | what it is | fate |
|---|---|---|
| fly and dig | 13 columns, a fixed side camera, one block at a time | **keep** |
| fuel as life | run dry and the ship is lost; the climb home is drawn on the dial | **keep** - this is round seven and it works |
| heat / gas / tremors | a heat line at 66% of the core, gas pockets, quakes that collapse tunnels | **keep**, re-tuned to a bigger world |
| ore ladder | 11 materials gated over eight planets' worth of depth | **becomes strata** |
| 15 upgrades, 6 consumables, 7 devices | the shop, the drawer, the crates in the ground | **keep** |
| **the star chart** | pick a destination, fly between planets | **cut** |
| **planet traits** | 5 traits that bend hazard rates and rules | **becomes regions** |
| **12 palettes** | a colour identity per planet: rock, fog, haze, growth | **becomes strata** |
| **coreDepth(leg)** | 58 + 48 per leg; the world gets deeper each hop | **cut** - one fixed, much larger world |
| **the Jump Drive** | 5 components, one per trait, across many worlds | **cut, and replaced** |
| **relics** | one buried artefact per planet, a permanent perk | **becomes one per region** |
| **the Heart** | the final world; breaking its core wins | **becomes the thing under this world** |
| **the claim** | 3 surface buildings that accrue strain; damage is a discount | **cut, and replaced** |
| caves | 2x2 blobs, 3-9% below 26 m | **kept and massively expanded** |
| geodes, gas pockets, caches | one-cell events on their own seeds | **keep** |

## Two facts about the code that shape what is cheap and what is not

**The multi-planet structure can fold inward.** Twelve palettes, five traits and a
per-leg core depth are already a description of twelve different places with
different rules and different rock. They were spent on twelve worlds you visit
one at a time. Spent instead on twelve REGIONS of one world, they are most of a
large, varied planet for almost no new code - the palette applies to a depth
band rather than a save slot, and a trait bends the rules of a region rather
than of a visit.

That is the single biggest lever in this round and it is nearly free.

**There is no map. Of anything.** Not of the tunnels you have dug, not of where
you have been, not of what you have found. That is survivable in a game whose
world is 58 metres of straight-down and fatal in one that is meant to be wide
and mysterious. Whatever else this round does, it has to answer that.

**The world is 13 columns wide, and widening it is NOT just a constant.** The
generator is fine - `rnd(x, d, planet)` is seeded per cell, so columns 0-12
generate exactly as they do now and anything added is new ground, which the code
already says in a comment. The RENDERER is the problem: `syncBlocks` streams a
window of rows around the ship (`row - 13` to `row + 15`) and then walks
`for (let x = 0; x < W; x++)` - the full width, every rebuild - and every
instanced pool is allocated at `WINDOW_ROWS * W`.

So at 60 columns each of about eighteen pools allocates 1,740 instances instead
of 377, and every rebuild touches five times the cells. The streaming window has
to gain a horizontal axis: a column range around `g.px`, a rebuild triggered by
crossing a column as well as a row, and `MAX_CELLS` sized off the window rather
than off `W`. That is contained, it is real work, and it is much cheaper to find
now than halfway through the build.

**The ship is coded primitives.** A box hull, a cone cowl, four struts, two
fins, a cylinder auger, a cone cab. Nothing is imported and nothing is fixed in
place by geometry, so a redesign is a rewrite of one file rather than an asset
hunt.


# What the research settled

**Dome Keeper's own developer made this exact pivot, and said why.** The
original win condition was "reach the bottom of the map." René Habermann called
it *"seriously flawed"* and wrote, in February 2022:

> *"I'm mostly thinking about searching a special underground location and to
> recover something from it. So you'd still need to dig down, but it's not sure
> where to and it will also need some time to recover."*

That shipped as Relic Hunt mode. **"I dont want to just try to dig to the
bottom" is the same conclusion the designer of the game he is pointing at
reached about his own game.** This round is not a guess.

**And the criticism to design against is specific.** Dome Keeper's content
ceiling is about ten hours - "at the ten-hour mark many players will have seen
the breadth of its unlocks" - and Eurogamer's read is that its two phases feel
*divided*, competing for attention rather than fusing. So: do not alternate
mining and something-else. **Fuse them.** Coreward already has the material for
that, and it is not combat.

Five devices make one map last, and four of them survive procedural generation:

- **Ability gating.** Hollow Knight's rule is "each key only opens a few locks" -
  new tools open things you have already SEEN and could not pass. Backtracking
  with a new tool is itself content, and it costs no new world.
- **World-state flags.** A region marked sealed, collapsed or active changes
  meaning without changing its geometry.
- **A world-changing event that recolours the map you already have.** Terraria's
  Hardmode retroactively edits the existing world rather than generating new
  space. The research calls this the strongest procgen-friendly longevity device
  there is, and it is nearly free.
- **Authored set-pieces dropped into procgen.** Spelunky stitches hand-made room
  templates; Noita drops hand-placed structures into a generated world. This is
  the one way to get authored mystery into a seeded world.
- **Knowledge as the unlock** (Outer Wilds) - needs a journal to work at all.

The one that does **not** translate is Animal Well's layered secrecy: it is
seven years of hand placement. It needs procedural *slots* for authored content
instead, which is the Noita answer above.

**And the failure modes are named.** Mystery becomes emptiness when templates
repeat often enough to be recognised, when there is no map to track partial
progress against, or when too many unexplained hooks are open at once. Animal
Well's author: *"it can be overwhelming to walk into a room and see six doors."*

**A base earns stakes two ways.** Dome Keeper's dome can be damaged and lost.
Subnautica's base has an *internal* failure mode - it consumes power and most
bases are lost to their own hull integrity, not to attack. Deep Rock's rig is
the anti-pattern: organisationally rich, in no jeopardy at all, which is what
the current three buildings are. SteamWorld Dig adds the third thing worth
stealing: the town visibly grows at underground milestones, so progress reads
from the surface without opening a menu.

---

# The design

## The planet is not a resource. It is a ruin, and it is waking up.

One world. You are not the first here, and the thing you are standing on is not
inert.

### The objective: the Lattice

Buried across the whole planet - spread **wide** as much as deep - are
**Anchors**: parts of a structure that predates you and is still, barely,
running. There are nine.

Lighting an Anchor does three things, and the third is the point:

1. it pushes the **Unrest** back in its region
2. it reveals that region on your map
3. **it wakes the planet a little more**

The ninth opens the Vault at the centre, which is the end of the game.

This is the recovery pivot, and it is not a race down a line: an Anchor's
location is not known in advance, several are behind things you cannot open
yet, and the map is how you hunt.

### The pressure: Unrest, and it is the planet

Dome Keeper alternates digging with fighting, and its own reviews call that
division its weakness. Coreward already has the material for a version that
**fuses**: cutting the world raises strain and the ground answers with tremors.

So strain grows up into **Unrest**, and it belongs to the planet rather than to
a building. Everything you cut raises it. It drives the tremors that already
exist, and past thresholds it does worse. **There is no second phase** - the
pressure is applied to the thing you are already doing, which is the fusion the
research says Dome Keeper never got.

And it is the mystery, not a meter with a monster behind it. The rules are
withheld: you learn what Unrest does by watching it, the way Rain World teaches
its hazards.

### The surface: one thing, with a stake

The refinery, the derrick and the store shed are cut. Three buildings whose
damage was three discounts is exactly Deep Rock's rig - rich-looking, no
jeopardy - and he is right that it is not a system.

In their place, **the Ballast**: a steampunk pressure-station standing over the
pad, and the only thing holding the planet quiet.

- **It decays on its own**, faster as Unrest rises. That is Subnautica's
  internal failure mode, which is the one that actually kills bases.
- **You feed it ore.** Not spend - feed. The hold is now two decisions: what is
  worth money and what is worth keeping the ground still.
- **If it empties, a region collapses.** Not a discount: you lose access to
  somewhere until you re-stabilise. That is Dome Keeper's stake.
- **It visibly grows a tier with every Anchor lit.** That is SteamWorld Dig's
  legible progress - the surface tells you how far through the game you are
  without a menu.

### The world: regions, not planets

Twelve palettes and five traits already describe twelve places with different
rock and different rules. They were spent one at a time on twelve worlds. Spent
instead on **regions of one world** - laid out across width as well as depth -
they are most of a large, varied planet for almost no new code.

Volatile ground riddled with gas. Hollow ground that is more cave than rock.
Crystalline seams. The Searing deep. Each with its own palette, its own rules,
its own Anchor.

### The mystery: authored rooms in a seeded world

The Noita and Spelunky answer, which is the only one that works in procgen: a
small library of **hand-authored vault templates** dropped at seeded, rare,
region-appropriate slots. Worked stone rather than generated rock, so you know
one when you see one.

- **sealed vaults** you can see through and cannot open until you have the tool -
  the locked door with no visible key
- **the previous expedition**, told without text: their equipment, their
  tunnels, where they stopped
- **the deep quiet**: rooms that contain nothing at all, which is what makes the
  ones that do matter

Against the named failure mode - templates you start to recognise - the library
is small but the *contents* are seeded, and most of them are rare enough that a
first playthrough sees a fraction.

### The map, which is not optional

There is no map in this game of anything. That is survivable in 58 metres of
straight-down and fatal in a world meant to be wide and mysterious - and every
mystery device the research names needs one to work.

So: a map that fills in as you dig, marks what you have found, marks what you
have found *and not understood*, and shows Unrest by region. It is the journal
too, because "not yet understood" has to read as a tracked goal rather than as
confusion.

### The event that recolours everything

The single strongest longevity device the research found, and it costs almost
no content: at a threshold - the fifth Anchor - **the planet answers.** Unrest
steps permanently, a hazard appears in ground you thought you knew, and
something new grows in old rock.

The map you have filled in becomes unfamiliar. Terraria does this with
Hardmode, and it is the cheapest possible way to make a known world strange
again.

## What this does to the session

Sessions stay what they are: dive, dig, return, spend - self-contained, no
penalty for leaving, which the mobile-pacing research is firm about. The
campaign - map coverage, Anchors, Ballast tier, Unrest - persists quietly
between them and is re-stated in one line when you come back, because the
research is equally firm that a phone game must never ask you to remember where
you were.


# The look

## The ship, designed at thirty pixels

The research is blunt about this and it overturns how I would have gone at it.
**At 30 px only things that break the OUTLINE survive.** Rivets, gauges, valve
dials, portholes, individual pipes and brass-versus-iron all vanish - a 2-3 px
brass trim band is not a colour, it is noise. Brass only reads at play scale if
it covers a whole hull panel.

What survives the squint test, in order of efficiency:

- **a chimney or stack** - a vertical cylinder breaking the roofline is the
  single most efficient steampunk signal there is, because it changes the
  outline rather than the surface
- **a boiler bulge** - a barrel-shaped body segment distinct from a flat hull
- **asymmetry** - steampunk craft are almost never symmetric front-to-back the
  way sci-fi ships are, and a symmetric hull reads as "generic vehicle"
- **one big spoked wheel**, if it is 15-20% of ship height or more
- **negative space** - an open under-frame, a gap between hull and a jutting
  pipe. Gaps read as strongly as filled shape at distance and cost nothing

And the rule that decides the rest: **one dominant feature, not several.** The
TF2 principle - one unmistakable shape cue, everything else deliberately plain
so the eye lands on the one thing.

So the ship is designed twice, on purpose, which is what the two scales
deserve:

- **the silhouette**, authored at 30 px against the tunnel and judged blurred:
  an off-centre stack, a boiler bulge under the cab, an open under-frame, the
  auger still leading. Asymmetric front-to-back.
- **the greeble**, which only exists because the Outfitter shows the ship at
  full screen: rivet rows, a brass boiler band, a pressure gauge on the flank,
  a valve wheel, a porthole cab.

And it is TESTED at 30 px rather than judged in the shop, which is where every
previous ship pass in this repo went wrong - the drill tier that "did not read"
and had to become spark count was this same mistake.

## The blocks: break the grid, not the texture

The complaint is that blocks feel plain, and the instinct is to add texture.
The sourced answer is the opposite: **vary the geometry and the phase, not the
surface.** Four changes, and three of them are free at runtime.

**Per-instance rotation and scale jitter.** A quarter-turn snap (90, 180, 270 -
which keeps normals and UVs sane on a cube) and a 10-20% scale wobble, written
into the instance matrix once at generation. Zero draw calls, zero per-frame
cost, and it is the standard fix for "obviously a grid".

**Two or three chamfered block meshes per material, swapped by index.** A
bevelled cube stops reading as a cube, and the cost is in the source mesh
rather than in the shader. There is no CC0 kit for this - a bevelled cube is
cheaper to model than a licence is to vet - so it is a handful of lines of
geometry.

**Irregular band boundaries.** Right now a rock band changes at an exact
horizontal metre, which is the most artificial line in the game. A seeded
offset per column turns every stratum boundary into a ragged seam, and Deep
Rock's own technique is exactly this shape: define the large forms irregularly,
then let surface variation fill in. Large-scale irregularity does more than any
amount of per-block noise.

**Sparse decals for cracks, veins and moss**, in one instanced batch rather
than in the shader - placed irregularly and rarely, because uniform decoration
reads as texture and rare decoration reads as detail.

Skipped, deliberately: vertex displacement and true face-blending between
neighbours. They want either a compute step or per-vertex neighbour lookups,
and they buy the least per unit of cost of anything on the list.

## Reading a dark tunnel with no post-processing

Ranked by what they buy per unit of cost, which is the only ranking that
matters with no bloom, no SSAO and no colour grading:

1. **Baked ambient occlusion at the seams**, darkened into the per-instance
   colour the bands already use. One bake, no runtime cost, and it is the
   single cheapest thing that makes a wall look solid rather than printed.
2. **Rim light as a shader term**, not a pass - one dot product of view against
   normal in the forward shader. It puts a lit contour on the edge of every
   block and on the ship, which is the half of bloom that actually matters
   here.
3. **Fog**, which the game already has, tuned per stratum.
4. **Value separation**: the tunnel dark, the rock mid, the ore and the ship
   bright. Value carries the read; hue count does not.

## The one number to respect

Mobile GPUs are commonly cited as struggling past about **100 draw calls**, and
this game's budget is already 150. That is a ceiling to stay under, not a
target to grow into - so the decals ride one instanced batch, the block
variants ride the pools that already exist, and nothing in this section adds a
draw call.


## Milestones

Ordered so each one ships and is playable, and so the two that are pure
presentation come early - they are the ones you can judge fastest, and they are
independent of the objective work.

- [x] **W1 The ship, designed at thirty pixels.** Silhouette first: an
      off-centre stack, a boiler bulge, an open under-frame, asymmetric
      front-to-back, the auger still leading. Judged blurred at 30 px against
      the tunnel, not in the shop. Then the greeble - rivets, a brass band, a
      pressure gauge, a valve wheel - which exists only for the Outfitter.
      *Cost: one file rewritten. No new systems.*

- [x] **W2 The blocks.** Per-instance quarter-turn and scale jitter; two or
      three chamfered mesh variants per material; ragged stratum boundaries
      instead of straight horizontal lines; sparse crack and vein decals in one
      instanced batch; baked seam AO folded into the per-instance colour; a rim
      term in the forward shader. *Cost: no new draw calls, and the ragged
      boundaries are rock-for-rock, which the frozen baseline already permits.*

- [x] **W3 The world gets wide.** `W` from 13 to about 61, and the streaming
      window gains a horizontal axis - a column range around the ship, a rebuild
      on crossing a column, and `MAX_CELLS` sized off the window rather than off
      `W`. **This is the one piece of work that is invisible from the outside
      and is not optional**: at 61 columns the instance buffers go from 2.3 MB
      to 10.6 MB and every rebuild touches five times the cells. Measured, not
      estimated.

- [x] **W4 Regions.** The twelve palettes and five traits stop being planets and
      become regions of one world, in width and depth. `coreDepth(leg)` and the
      chart go. One fixed world about 450 m deep.

- [x] **W5 The map.** Fills in as you dig, marks finds, marks the
      not-yet-understood, shows Unrest per region. Nothing else in this round
      works without it.

      *Done.* A Survey screen on a canvas: the ground you have had a lamp on,
      washed in each region's own rock colour four cells to a tile; your own
      tunnels exact over the top of it; the pad, the ship and every device and
      cache you have pulled out of the rock; region names over their own ground,
      and three question marks over ground you have never entered. A survey
      grid and a 50 m ruler are drawn across the WHOLE world and not only the
      explored part, so unsurveyed ground reads as empty squares on a chart
      rather than as a hole in the screen. Vertical drag to scroll, CENTRE ON
      SHIP to get back, and a surveyed percentage, which is the partial-progress
      readout the research says procedural mystery needs to avoid reading as
      emptiness. Unrest per region is the one piece deferred: it lands with
      Unrest itself in W6.

- [x] **W6 Unrest and the Ballast.** Strain grows into a planet-wide meter that
      everything you cut raises; the Ballast decays against it, is fed with ore,
      collapses a region if it empties, and grows a tier per Anchor. The three
      old buildings are cut.

      *Done.* Unrest is PER REGION rather than planet-wide, which was the one
      real change to the plan: a single number would have been a second fuel
      gauge, and twelve of them give the map something to show and make
      abandoning worked-out ground a move. Everything you cut raises it, a cell
      at the floor costing two and a half times one at the surface. Past the
      second band tremors fire above the depth line and up to three times as
      often; past the third the rock closes up about a third. None of it is
      stated anywhere - the map shows a bar under a place's name and nothing
      says what the colours mean.

      The refinery, derrick and shed are gone, and so are `claim.ts`,
      `claimyard.ts` and `claimsigns.ts`. In their place one machine: a riveted
      pressure vessel with a sight glass for the level, a dial whose needle is
      the planet's Unrest, a stack that vents faster as it climbs, and nine
      collars that stack one per Anchor. It drains while you dig, you feed it
      banked ore at the pad, and when it empties a region comes down - tunnels
      filled in, ground unbreakable, and it waits at the door rather than
      landing on somebody who is still underground. Shoring one back costs 45%
      of the tank and never restores the tunnels.

- [x] **W7 Anchors, and vaults.** Nine Anchors across the regions. A small
      library of authored vault templates dropped at seeded rare slots -
      sealed ones you can see and not open, the previous expedition, and empty
      ones so the full ones mean something.

      *Done.* Nine Anchors, one in each region of the top three rows - the
      deepest row holds none, because that row is the Vault's. Each stands in
      a hand-authored hall of worked stone: a chamber you have to cut into, and
      a niche in the middle of it. The Anchor cannot be mined at all; you fly
      down to it and it lights. Lighting one pushes its region's Unrest back,
      draws the whole region onto your map, and gives the Ballast a permanent
      tier - a collar on the machine at the pad.

      Three of the nine are behind SEALED stone, which nothing cuts until you
      have found the Cutting Laser somewhere else. That is Hollow Knight's rule
      applied for free: a tool that opens something you have already seen.

      Sixteen more rooms at seeded slots, drawn from a pool that is mostly
      EMPTY on purpose - if every worked room held something, worked stone
      would be a reward rather than a question. The rest are the previous
      expedition (their shaft, their spoil, the crate they left) and a worked
      chamber round a pocket.

      Five characters of authored world, 1,602 cells of it, 5.8% of the planet.
      The whole library is legible as drawings in `src/sim/vaults.ts`.

- [x] **W8 The planet answers.** At the fifth Anchor, Unrest steps permanently,
      a hazard appears in ground you already know, and something new grows in
      old rock. The cheapest possible way to make a mapped world strange again.

      *Done.* Five of nine, and three things fire at once. Every region gains a
      permanent floor in Unrest and every cell cut from then on costs 35% more.
      Tunnels in restless ground CLOSE while you are docked - filling with
      rubble, never rock, never the pad's own shaft, and proportional to how
      angry that region is, so quiet ground stays exactly as you left it for
      ever. And Blooms start generating from 4 m down to the halfway line,
      worth more per kilo than anything in the upper half - because waking the
      planet has to be something a player chooses, not a punishment for playing
      well.

      The hazard is aimed at the one thing in this game a player actually owns:
      the shape they cut. The route home is computed from it.

- [x] **W9 The Vault.** The ninth Anchor opens the centre, and that is the end
      of the game. Other planets are what comes after, later.

      *Done.* A fifteen-by-thirteen chamber at the middle column of the deepest
      band - the one place on this world that can be described without a map.
      Two shells: ordinary worked stone, so finding it reads like finding any
      other room, and inside it a seal that NOTHING cuts until all nine Anchors
      are lit. The ninth puts the centre on your map and opens the seal; flying
      down to the core ends the game, and the game does not end the session -
      the planet is handed back with everything still in it.

      **And the old ending went with it.** The navigation chart, the jump drive
      and its five components, the crossing between worlds, the breach, the
      Core Shards and the Planet Core itself are all deleted - 1,300 lines and
      ninety call sites. Round eight made this one planet; leaving a second
      objective in it would have been worse than either.

- [x] **W10 The phone pass**, and a long play of the whole thing rather than of
      any one milestone.

      *Done, with one thing left open and named.* Every screen shot at
      1080x2340 and looked at, which found a crash: cutting into an Anchor hall
      put `worked` stone in the hold and the manifest threw on a material with
      no DEF entry. Draw calls measured in the worst window round eight can
      build - a sealed hall at 306 m on a woken planet with a region down -
      at 86 of 150. Version 0.31.0 with the round's changelog in the player's
      words. `CLAUDE.md` rewritten to describe the game this actually is.

      The long play found the two that mattered: a lit Anchor was an
      unbreakable plug in its own column, so six of the nine were unreachable
      by digging down to them; and the collapse cascade had no bottom. Both are
      fixed, and both now have tests that fail without the fix.

      **Open:** no automated run has played a campaign through to the Vault.
      Every piece is proved separately - `every Anchor lights by digging down
      its own column` covers all nine - but the probe has never lit more than
      one, and each stall has turned out to be its own policy rather than the
      game. Its limits are written into its own header. A human play is the
      next thing this needs, not another probe fix.

## What I am deliberately not doing

**Not adding combat.** Dome Keeper's own reviews say its two phases feel
divided; the fusion here is that the pressure applies to digging itself. Adding
a second verb would import the exact criticism the research warns about.

**Not hand-authoring a secret world.** Animal Well is seven years of hand
placement and does not survive procgen. Authored templates in seeded slots is
the version that does.

**Not keeping the star chart.** It is a good screen for a game about visiting
places and this is now a game about one place. It comes back if the sequel does.

## The honest risk

This is the largest change the game has had - it replaces the objective, the
world's shape, the surface, and two art passes. **W3 and W4 together break every
golden test in the repo**, because they change what the world IS. That is
expected and manageable, but it means the middle of this round will have a
stretch where the suite is red by design, and I will re-record with the diffs
read rather than fixing them one at a time.

If you would rather have it in smaller bites, the natural split is **W1-W2 first
as a look pass you can judge in a day**, then the objective work as its own
round.

# Appendix: rounds one to three, as planned and shipped

Kept because the reasoning is why the game is shaped the way it is. Everything below has
shipped; the milestone list at the top is the live one.

The ask, in his words:

> "can you write out a plan to expand the game, add additional upgrades and power ups, make
> each planet feel and look different, have an overall goal besides just digging for
> resources, have the ship actually look like it is flying between planets."

Five things, and they are not five separate features. Four of them are the same feature seen
from different sides, which is what this plan is mostly about.

---

## What the game is now, and what is actually missing

The loop works. Fly down, cut rock, fill a 60 kg hold, come back up, sell, buy a rung of a
ladder, go deeper. Heat at 70 m and tremors at 85 m give depth a price. Relics give one
permanent keepsake per planet. Breaking a core destroys the planet and moves you to the next
one, which is harder and richer.

What is missing is not content. It is that **nothing above the run has a shape**:

- **Planet N+1 is the only place you can go.** There is no choice at the top level, so the
  traits — Volatile, Hollow, Crystalline, Searing — are flavour that happens *to* you rather
  than anything you can seek out or avoid. A trait you cannot choose is a weather report.
- **The planets differ by numbers, not by looking different.** Sky colours change; the rock,
  the fog, the dust and the silhouette do not. Every world is the same cave with the tint
  moved.
- **There is no reason to stop.** Shards accumulate, credits accumulate, and the honest
  answer to "why am I doing this" is "the number goes up". `CRAFT.md`: *"Money is a rung:
  every amount you earn makes the last amount irrelevant."*
- **Leaving a planet is a modal dialog.** The single most cinematic beat in the game — you
  just destroyed a world — is a box with a button.

So the plan is one arc: **give the top level a map, a goal, and a journey**, and make the
worlds on that map worth telling apart.

---

## The spine: The Drift, the Jump Drive, and the Heart

The fiction is already there and unused. You are a contracted driller working the **Verdax
Drift**. The plan makes the Drift a place you are trying to get *out* of.

**The goal: build a Jump Drive and reach the Heart of the Drift.**

The Jump Drive takes **five components**. Each one is buried on a world of a particular
trait, and only on that trait:

| Component | Found on | Trait |
|---|---|---|
| Guidance Spine | a Stable world | `stable` |
| Plasma Injector | a Volatile world | `volatile` |
| Void Resonator | a Hollow world | `hollow` |
| Lattice Prism | a Crystalline world | `crystalline` |
| Thermal Core | a Searing world | `searing` |

With all five aboard, the chart opens a route to **The Heart** — one final world, harder than
anything before it, whose core ends the game.

Why this shape and not a longer story:

- **It makes the trait the decision.** You need a Searing world, so you go looking for one on
  the chart and accept what a Searing world costs you. That is `CRAFT.md`'s *"gate an upgrade
  behind a place, not a price"* applied to the whole game rather than to one shop row.
- **It is a collection, so its value does not decay.** Three of five is a real answer to
  "what have I got".
- **It is missable, and that is the point.** Break the core with the component still in the
  ground and it is gone with the planet. `CRAFT.md`: *"Make the best reward missable."*
  Crucially it is **recoverable but costly** — another world of that trait will come round on
  the chart — so a mistake is a detour, never a dead run. A permanently unwinnable save is
  the one outcome this must not have.
- **It ends.** And after it ends, the Drift stays open: the chart keeps generating worlds, so
  the endless game people are already playing is still there, now with a completed thing
  behind it.

The component is a **second buried object**, generated like the relic and deliberately deeper
than it, with its own finder cue. It is not a relic and does not use the relic's slot: the
relic is a perk you keep, the component is a key you spend.

---

## The chart: choosing where to go

After a core breaks, instead of a modal announcing planet N+1, you get **the chart** — two or
three candidate worlds, each showing:

- name and trait, with the trait's blurb
- depth to core
- whether it is known to hold a Jump Drive component you still need
- a **transit cost in fuel**, from how far it is

Two or three, never one, and never a good option beside a bad one. `CRAFT.md`: *"Two upside
gates beat a good gate and a bad gate."* A shallow Hollow world with nothing you need against
a deep Searing world holding the Thermal Core is a real question, and the answer changes
depending on what you have.

The chart is deterministic from a seed, so a save is reproducible and the golden tests can
assert its properties — in particular the one that matters: **every trait you still need must
keep appearing**, or the run can strand itself.

---

## The transit: actually flying there

The chart choice hands off to a real sequence, not a dialog:

1. the ship lifts off the pad and climbs out of the atmosphere
2. the planet you just broke recedes behind you, in pieces
3. a starfield with real parallax, the drive lit and running
4. the destination swells, its own colour and its own sky
5. the ship descends through cloud and settles onto the new pad

It is a scene, and it is where the goal gets restated: the Jump Drive's five slots are on
screen during the crossing, so every journey shows you how close you are. Skippable after the
first time — a cutscene you cannot skip becomes a tax on the twentieth playthrough — but
worth watching once.

No minigame in it. `CRAFT.md` is clear that a mechanic which cannot be failed or optimised is
a rhythm, not a decision, and a transit minigame would be exactly that.

---

## Making the worlds look different

Right now a planet is a pair of sky colours. It should be a **palette**, applied everywhere at
once, so a world reads as somewhere else before you have dug a metre:

- **rock**: each world gets its own band colours for the shallow, middle and deep rock
- **atmosphere**: fog colour and density, haze tint, dust colour and thickness
- **sky and backdrop**: the gradient it already has, plus the parallax silhouette behind the
  tunnels
- **signature**: one thing per trait you can see from the surface —
  - *Volatile*: gas venting from the rock face, and the air is dirty
  - *Hollow*: huge open caverns, and light carries much further in them
  - *Crystalline*: crystal formations that catch the lamp and glow through rock
  - *Searing*: veins of lit magma in the deep rock, and the air shimmers
  - *Stable*: clean, cold, quiet — the control against which the others read

`CRAFT.md`: *"A threshold the player cannot see is not a mechanic"* — the same argument
applies to a whole world. Four coordinated signals, not one tint.

---

## Upgrades and power-ups

Ten upgrades now, in four groups. The gaps are specific rather than general.

**New permanent upgrades:**

| Upgrade | Group | What it answers |
|---|---|---|
| **Hull Plating** | survival | Hull is a flat 100 forever. The only survival stat with no ladder. |
| **Salvage Magnet** | rig | Ore left on the ground when the hold filled has to be re-approached one cell at a time. |
| **Deep Survey** | instruments | Ore through rock at a radius — distinct from Scanner, which is light and framing. Also points at the buried component. |
| **Repair Drone** | survival | Slow hull repair underground: turns a bad run into a long one instead of a tow. |
| **Reactor** | ordnance | Power cell ceiling and trickle rate. Ordnance currently has no ladder of its own. |

**New consumables**, on the other axis — one run, never a ceiling:

| Kit | What it does |
|---|---|
| **Overdrive** | 20 s of much faster drilling |
| **Bulwark** | absorbs the next two hull hits outright |
| **Pulse** | lights up every ore in a wide radius for 30 s, through rock |

And **field power-ups**: caches already exist as a discovery moment, and they should
sometimes hand you a *temporary* effect rather than goods — aimed, per `CRAFT.md`, at the
bottleneck you are actually in.

---

## Status

- **1. Planet identity** — shipped in 0.17.0. Twelve palettes, applied to rock, fog, haze,
  dust and the silhouettes at once. Ore keeps its own colour everywhere.
- **2. The chart and the transit** — shipped in 0.18.0.
- **3. The Jump Drive and the Heart** — shipped in 0.18.0. Components generate, are collected,
  are tracked in the manifest, and the Heart appears on the chart once the drive is complete.
- **4. Upgrades** — shipped in 0.19.0. Hull Plating, Salvage Magnet, Deep Survey, Repair
  Drone and Reactor Core, taking the shop from ten cases to fifteen. Three of the five had
  their material changed by a test before they landed: `hull` wanted iron from 11 m behind a
  45 m seal, which is CRAFT.md's *"two gates on one thing means one of them is decoration"*,
  and `drone` wanted emerald from inside the heat zone for something you buy before reaching
  it.
- **5. Consumables** — shipped in 0.19.0. Overdrive, Bulwark Field and Survey Pulse. The kit
  had three items and all three UNDID something (heat, damage, an empty tank); these buy a
  window in which the ship is better than it is, which is the axis that was missing. Bulwark
  counts impacts rather than seconds because heat soak is a drain and would eat a timer before
  the thing it exists to stop ever arrived.

- **6. Per-trait ambience** — shipped in 0.20.0. A palette is a still image; two worlds
  painted differently still behaved identically. Each trait now emits something of its own in
  the air — gas out of the walls, embers from below, glints, falling grit — and Stable emits
  nothing at all, which is what makes the others read. The timing is a pure reducer for the
  same reason everything else is: the preview browser stops `requestAnimationFrame` when
  hidden, so anything on a timer cannot be tested by eye there.

**Still open:** caches that sometimes hand you a temporary effect instead of goods, aimed at
whatever bottleneck the player is actually in.

**Wanting a playtest before anything else is built on them:** the chart's shallow/poor against
deep/rich balance, which is the central new decision and was tuned by one person looking at it;
the nine-second crossing, which may be four seconds too long by the twentieth planet; and
whether the per-trait ambience is dense enough to tell a Volatile world from a Stable one while
flying past.

Two things changed shape while building, both worth recording:

**The leg and the world had to be split.** `g.planet` was doing two jobs — difficulty ladder
and identity — and a chart offering three worlds at the same leg needs those to be different
numbers. `g.world`, `g.trait`, `g.coreOff` and `g.rich` are the chart's answer, and they all
default to the pre-chart behaviour so old saves load unchanged.

**The trait had to be stored rather than hashed.** `traitOf()` returns Stable only for planet
zero, so a Guidance Spine gated behind a Stable world would have been unobtainable for the
whole game. The chart is now the authority on what a world is, which is where that decision
belonged anyway.

---

## The way in: a title screen and a first-run intro

The ask:

> "can you create an intro screen? if it is the first time starting, make a little intro going
> through the story and objective. if the game has already been started by the player before,
> can you just have a start screen that has normal first screen options like, new game,
> continue, settings, notes."

The game currently boots straight into a ship on a pad, which was fine when the whole of it
was "dig down, sell, upgrade". It is not fine now: there is a Jump Drive to assemble and a
Heart to reach, and **nothing anywhere tells the player either of those things exists** until
they break their first core, which is an hour in.

### What the intro is for, and what it must not be

`CRAFT.md`: *"DO NOT INVENT A SYMBOL FOR SOMETHING YOU CAN SHOW."* The rule was written about
HUD elements and it applies exactly here — an intro that is paragraphs of fiction over a black
screen is the same mistake in a different costume. The game already owns a starfield, twelve
painted worlds, a ship, and a planet coming apart in pieces. The intro should be those things,
with one line of text over each.

Three hard requirements, all of them learned already this session:

- **Skippable, always.** A cutscene you cannot skip is a tax on every replay. The crossing
  needed this and shipped without it once.
- **It must state the OBJECTIVE, not just the mood.** "Five pieces of a jump drive, one buried
  on each kind of world" is the sentence the player needs; the rest is flavour.
- **It must not block the tests.** Every one of the 24 e2e specs boots into play and starts
  driving. A screen in front of that breaks all of them at once, and the fix is a dismissal in
  the shared `beforeEach` rather than a bypass flag — so the title is exercised on every run
  instead of being the one path nothing covers.

### The shape

**First run** (no save in `localStorage`): the intro plays immediately. Six beats over a live
3D scene, auto-advancing, tap to go faster, SKIP in the corner throughout. It ends by starting
a new game.

**Every run after** (a save exists): a title screen over the same live scene.

| | |
|---|---|
| **CONTINUE** | straight back in, and the default |
| **NEW GAME** | confirms first — it wipes credits, upgrades, shards and relics — then replays the intro |
| **SETTINGS** | the existing pause sheet: audio, restart, build stamp |
| **NOTES** | the same sheet with what's-new already open |

Settings and Notes **reuse the pause modal rather than duplicating it.** It is already the
settings screen — audio toggles, restart progress, version, run log, what's new, build stamp —
and a second copy of those controls is a second place for them to drift. It changes its
heading and its close button depending on where it was opened from, and nothing else.

### Two things it gets for free

**The AudioContext gesture.** `audioInit()` currently rides on the first `pointerdown`
anywhere, which means the first tap of the game is silent. A title screen is a tap before
anything is at stake, which is the correct place for it.

**A reason for the showcase scene to exist.** `transit.ts` already has a starfield at three
depths, palette-painted planets, the ship, and debris. The title and the intro drive the same
scene rather than a second one — so a world in the intro is drawn by exactly the code that
draws it in the crossing.

---

## Round two: the way in, the shop, and how to actually see this stuff

The ask, in his words:

> "for the intro can you make it less like a slide show and more like the ship is flying past
> planets. when the intro ends, have it fly to the planet. if you hit continue, have the ship
> take off and fly to the planet the player is currently at. If there is no saved game, make
> sure the continue button is greyed out. Also dont explain the whole story of the game. Make
> it feel more mysterious."
>
> "can you also revamp the shop? some of the words are cut off and it feels a bit cluttered. I
> want future upgrades that dont unlock until later to be hidden."
>
> "I want you to find a good way to play test and trouble shoot the game ... if there are any
> rules keeping you from doing something that could be beneficial, make sure the rule is
> actually needed ... use pre-made assets whenever you can."

---

### 0. First, a way to SEE motion - because I currently cannot

This comes first because everything else depends on it. "Less like a slide show" is a
judgement about **movement**, and every tool I have produces **stills**. I have been approving
animation by looking at single frames and reasoning about the code in between, which is
exactly the habit that cost four rounds on the lighting artefact.

**The filmstrip harness** (`scripts/filmstrip.mjs`): drive the built game under Playwright,
advance GAME time deterministically through `advance()`, screenshot at fixed intervals, and
composite the frames into **one contact-sheet PNG**. A whole sequence then becomes a single
image I can actually look at.

- Deterministic, because it runs on the tick seam - a slow machine changes nothing.
- Named scenarios (`intro`, `continue`, `crossing`, `shop`) so a repro is a command rather
  than a paragraph of set-up.
- Console errors collected and printed with the sheet. Three separate bugs this session were
  sitting in the console and were found by eye instead.

*Challenges.* Compositing without a new dependency - `sharp` is not in the repo and ASSETS.md
says to install it in a scratch directory rather than depend on it. The answer is to composite
**in the browser**: hand the screenshot buffers back into the page as data URLs, draw them into
a canvas grid, read one PNG out. No dependency, and the page is already open.

The second challenge is the one that keeps biting: under the dev server a dynamic `import()`
resolves to a **different module instance** than the one the loop is running, so the harness
drives everything through the `?debug` seam and never through an import.

---

### 1. The intro: a flight, not a slide show

It is currently six discrete *shots*, each easing its planet in from nothing. That is a slide
show with a dissolve, and it is a fair description of what is wrong with it.

**The rework:** one continuous flight. Planets sit along a line ahead of the ship, the ship
moves forward at a constant rate, and each world approaches, passes to one side and falls
behind. Captions fade over the top, **decoupled from the visuals**, so text changes without
anything cutting.

**The landing.** The intro and CONTINUE end on the same shared sequence: the destination grows
until it fills the frame, the ship pitches toward it, atmosphere washes the screen out, and the
game is there. Shared deliberately - "fly to the planet" is the same event either way, and two
copies would drift.

- **Intro** = flythrough, then land on Verdax.
- **CONTINUE** = take off, then land on the world you are actually on.
- **No save** = CONTINUE greyed and inert, not hidden. He asked for greyed and he is right: an
  absent button tells a new player nothing, a greyed one says "this is where your game will be".

**Mysterious, not explanatory.** One of the six beats explains the core loop, which the player
is about to be taught by playing it. Cutting to five, shorter, and dropping that beat. What
must survive is the *objective* - five pieces, one per kind of world - because it is the thing
the game otherwise never says. Mystery is withholding the explanation, not the goal.

*Challenges.* The existing test asserts the intro names the jump drive, five, the Heart, and
where the pieces are. A shorter script may drop a word, and the test has to be re-aimed at
*the objective survives* rather than *these four strings appear* - the literal-versus-property
mistake, which I have already made twice this session.

---

### 2. The shop: fewer things, bigger, nothing cut off

Three faults, and only one of them is layout.

**Words cut off** has an exact cause: `drawPlate()` calls `fillText` at a fixed 62 px with no
width limit on a 512 px plate, and "SALVAGE MAGNET" does not fit. Measure and shrink to fit,
rather than shortening the names.

**Cluttered** is the count. The shop went from ten cases to fifteen without the room changing,
and five of the fifteen are things you cannot buy yet.

**Hiding locked upgrades** runs straight into a rule:

> `CRAFT.md`: *"Locking shop stock behind 'deepest ever reached' is the cheapest structural
> progression available, and it should be shown, not hidden: a row that says 'Sealed until
> 90 m' is a reason to go deeper. A hidden row is nothing at all."*

**That rule is right about the next gate and wrong about all of them.** A case reading "Sealed
until 90 m" when your best is 78 m is a reason to go deeper. The same case when your best is
12 m is furniture: it cannot be planned toward, it is five rungs away, and it is one of five
crowding a phone screen. The rule was written at ten upgrades and two gates; at fifteen and six
it stopped being true and nobody noticed, because it was being applied rather than measured.

**Correction: show the NEXT sealed upgrade, hide the rest.** That keeps everything the rule was
defending and removes the clutter. `CRAFT.md` gets updated rather than worked around.

**Layout.** With the far cases gone the count is dynamic - about eight early, fifteen late - so
the room lays out from the count rather than from a fixed table: two columns while eight or
fewer fit, the back rack added above that. Fewer cases also means each can be bigger, which is
most of what makes a plate readable.

---

### 3. Pre-made assets, where the rule says to use them

ASSETS.md's rule is a **measurement**, not a preference: *"Import what the player reads at its
real size. Model in code anything that is thirty pixels tall and judged on silhouette"* - and,
added later, *"over about two hundred pixels and permanently on screen, import."*

Applying it rather than skipping it: **the planets in the intro and the crossing are two to six
hundred pixels tall and on screen for the whole sequence.** They are untextured spheres, which
is a large part of why the intro reads as coloured balls sliding about. That is squarely on the
import side of a rule I have been half-reading.

**One rock normal map from ambientCG**, about 45 KB, on the planet sphere - and, per the rule
that lets a photographed texture into a stylised game at all, **the normal only, never the
colour map.** Each world keeps its palette colour and gains relief and a real terminator.

*Challenges.* The download is a 9 MB zip for one 45 KB file and `sharp` is not a dependency -
both already solved in ASSETS.md, via a scratch directory and `npx`.

**Audio stays synthesised**, and not out of habit: ASSETS.md records that both CC0 audio
libraries need a browser session or an API key and are unavailable unattended, and this score
mixes by depth, danger and zone off one scheduler, which a recording cannot do.

---

### 4. Rules that were wrong, and are being corrected

- **`CRAFT.md`, sealed shop rows.** Show the next one, not all of them.
- **`CLAUDE.md`, "the only binary assets are two woff2 font files".** Stale - there are three
  WebP textures in `src/textures/`, imported through the bundler. A rule that misdescribes the
  repo teaches the next session something false about what is allowed.

---

## Round three: point the ship where it is going, land it, and dress the rock

The ask:

> "can you make it look like the ship is actually flying toward the planets rather than always
> facing us in the intro and flying scenes? it should point the drill end toward what it is
> flying to. when the screen cuts from the ship flying to it being on the planet, and you have
> a short landing sequence before the player can take control of the ship? I want the ship to
> be shown lowering itself onto the landing pad right before the player takes over. I also
> want the actual dirt and rocks to change color and texture with each planet. add additional
> details like moss patches, frost, plants, oil."

---

### 1. Fly nose-first, not broadside

Right now the flight sets `rig.rotation.z = PI` and leaves it there, which points the drill up
the screen. The ship is flying "up" past worlds that are receding into the distance - two
different directions at once, and the eye reads the one it can measure, so the ship looks like
it is holding station while the scenery slides by.

**The drill has to point at the thing it is going to.** In practice that is a three-quarter
rear view: the ship seen from behind and slightly above, drill into the screen, drive toward
the camera. Which is also better-looking, because the thrusters are the lit end and they end
up facing us.

The geometry: at rotation zero the drill points at the floor - local `-Y`, because
`FACE_ANGLE.down` is 0 - so pointing it into the screen means taking `-Y` to `-Z`.

*Challenges.* `rig.rotation` is an Euler in XYZ order and it is the same node the game and the
station use, so the flight has to set it and put it back rather than assume a resting value.
And "into the screen" is not one fixed angle once the ship starts turning toward a world it is
about to land on - the descent has to rotate from the cruise attitude to a nose-down one, or
the ship arrives flying sideways into a planet. Verified on a filmstrip, because an orientation
is exactly the thing a still frame can lie about.

---

### 2. Land the thing before handing it over

At the moment the descent fills the screen with the planet's surface, flashes, and the next
frame is a ship parked on a pad with the HUD up. The arrival is asserted rather than shown.

**A short settle, in the game's own scene.** The ship comes in above the pad with the drive
lit, drops the last few metres under thrust, touches down, the gear takes the weight, dust goes
up - and *then* the controls come alive.

- A mode of its own (`settle`), because during it the d-pad must do nothing. A player who can
  fly during a landing animation will, and then the animation is fighting them.
- Two seconds at most. It happens on every crossing and every CONTINUE, and the second time
  you see it, it is a wait.
- It reuses the drop the game already has: the ship eases from a few metres up to the pad on
  the same `approach()` smoothing everything else uses, so it looks like the game rather than
  like a cutscene bolted to it.

*Challenges.* Input has to be locked without freezing the frame loop - the world still has to
render. The e2e polls for mode `play` as the signal that the way in has finished, so a new mode
in front of it lands on every spec at once; that is the third time this session, and the
answer is the same as before, drive it on the tick seam rather than the wall clock. And
`goSurface()` currently teleports the ship to the pad, so the settle has to run *after* it and
own the ship's position for its duration.

---

### 3. The ground itself, per world

The palettes tint rock colour. That is one channel, and it is why every world still reads as
the same stone under a different light.

**Three more channels, all per palette:**

| | |
|---|---|
| **roughness** | ice is smooth and catches the lamp; ash is matte and eats it |
| **relief** | how hard the normal map bites - weathered against sharp |
| **growth** | what lives, settles or leaks on the rock face |

The growth is the visible one, and it is the ask: **moss patches, frost, plants, oil**, plus
ash drifts and salt crusts to fill the twelve. One signature per world, scattered on a fraction
of rock faces, so a world is recognisable from a single wall rather than from the horizon.

Placed like the seam flecks already are - small instanced quads at `z 0.5`, in front of the
rock face and behind everything else - because that geometry is already proven and already
inside the draw budget. **One instanced mesh for all of it, not one per world**, so it is a
single extra draw call; the count at 96 m is 66 of 150.

*Challenges, and the first one is the one that eats a day if it is got wrong.*

**Every roll must be on its own seed offset.** `CLAUDE.md` is explicit: consuming an existing
roll shifts every ore at every depth on every planet, and the diff looks like three lines.
Growth rolls on `(x + 91, d + 29, planet + 131)` and touches nothing else.

**It must not change a single block id.** Growth is decoration drawn on top of a cell, not a
cell type, so `test/baseline/blocks-preadditive.json` stays green - and that is the proof, not
the intention.

**Depth bands.** Moss and plants belong near the surface where the damp is; frost belongs
anywhere on a cold world; oil seeps deep. A growth that ignores depth is wallpaper.

---

## Order of work

Each slice ships on its own: typecheck, golden tests, build, size guard, e2e, CI, deploy.
Nothing sits half-finished on `main`.

1. **Planet identity.** Palettes, atmosphere, per-trait signatures. Pure data plus rendering,
   no rules change, so it is the safest large visible change and it makes everything after it
   look better.
2. **The chart and the transit.** Choosing where to go, and flying there. Replaces the modal.
3. **The Jump Drive and the Heart.** Components, progress, the final world, the ending.
4. **Upgrades and power-ups.** Independent of the other three, so it lands last and can be
   tuned against the finished shape.

The risk to watch across all four is the one `CLAUDE.md` already names: **world generation is
a pure seeded hash, and anything new that generates content must roll on its own seed
offset.** Components, signatures and caverns all generate, and all three will silently shift
every ore in the game if they consume an existing roll.
