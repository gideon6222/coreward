# Coreward — the expansion plan

Written 2026-09-09, against v0.16.0. **The plan, not a history.** Rewrite in place as
things land; the changelog is where the record goes.

This file was `DESIGN.md` until 2026-09-09. It is `PLAN.md` because that is the name
`INDEX.md` tells a resuming session to open, and nothing pointed at the old name from
anywhere, so three rounds of plan sat where the process could not find them.

## Milestones

The first unticked box is where work resumes.

- [x] **1. Planet identity** - twelve palettes on rock, fog, haze, dust and silhouette (0.17.0)
- [x] **2. The chart and the transit** - choosing where to go, and flying there (0.18.0)
- [x] **3. The Jump Drive and the Heart** - components, the manifest, the final world (0.18.0)
- [x] **4. Upgrades** - five more, taking the shop to fifteen cases (0.19.0)
- [x] **5. Consumables** - Overdrive, Bulwark Field, Survey Pulse (0.19.0)
- [x] **6. Per-trait ambience** - each world emits something of its own (0.20.0)
- [x] **Round two** - the title screen and first-run intro (0.21.0), flying in (0.22.0), three
      ways in and a shop that fits (0.23.0)
- [x] **Round three** - nose-first flight, a real touchdown, ground per world (0.24.0)
- [x] **Framework conformance** - the pure modules moved to `src/sim/` and the wall is a test
      rather than a comment. See `CLAUDE.md` under Files
- [ ] **A playtest, before anything is built on top of these three.** The shallow-versus-deep
      balance on the chart, tuned by one person looking at it. The nine-second crossing, which
      may be four seconds too long by the twentieth planet. Whether the per-trait ambience is
      dense enough to tell a Volatile world from a Stable one while flying past
- [ ] **Seed the tremor collapse.** `planCollapse()` takes `rand: () => number = Math.random`
      and the shipping game takes the default, so the one thing a replay cannot reproduce is
      the collapse that decides whether the way out is still open. The tests already inject a
      seeded stream; the game does not. INDEX.md standing rule: nothing that affects state
      rolls an unseeded die
- [ ] **Caches that hand out a temporary effect** instead of goods, aimed at whatever
      bottleneck the player is actually in

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
