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

- [ ] **M1 — Measure before changing anything.** `scripts/econ.mjs` and the three play styles,
      reporting the run at which each upgrade is bought. No behaviour change. The report goes
      in `NOTES.md` and is the baseline every later number is argued against.
- [ ] **M2 — The Claim, as a place.** `src/sim/claim.ts`, strain, quakes, three structures,
      repair, the shed. `test_claim`, the strain golden, a filmed quake. The geometry comes
      with the first model import this repo has ever done, so this milestone also opens the
      Kenney zips to check they contain glTF at all, puts `GLTFLoader` and the props in a
      lazy chunk rather than in `index`, and adds a budget line for that chunk. If the zips
      turn out to be OBJ or FBX, the Claim is coded and the milestone still lands.
- [ ] **M3 — The economy rebuilt on M1's numbers.** New curve, pressure-priced rungs, credits
      sink. `test_econ`. The probe report before and after, in `NOTES.md`.
- [ ] **M4 — The hold as a decision.** Dump by mineral, widened weight spread, manifest tap.
- [ ] **M5 — The first world compressed.** Per-leg thresholds, save migration, the invariant as
      a relation asserted at every leg.
- [ ] **M6 — The breach.** The clock, the collapse behind you, the tow path, the chart after.
      Filmed. This is the one to send a video of.

### Phase 2: the look

- [ ] **M7 — The UV fix and the mineral surfaces.** The new technique, then the six imported
      normal and roughness pairs, then the hull normal. Filmed on a cavern, before and after.
      Writes `assets/CREDITS.md`, which this repo has never had, and backfills the four
      textures already in `src/textures/` that are recorded nowhere.
- [ ] **M8 — Haptics, the debrief and the record book.** The three POLISH lines this game has
      never had, in one pass because they are all "what happens when a run ends".
- [ ] **M9 — The screens as pictures.** Every screen at 460x996, the shop, the chart, the
      debrief, the record book, the pause sheet. Fix what the picture shows.

### Phase 3: what it becomes

- [ ] **M10 — The daily Drift.** The chart's offer seeded by the date as well as the run, so
      there is a reason to open it tomorrow.
- [ ] **M11 — Trait signatures with teeth.** Each trait changes a rule, not only the picture:
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
