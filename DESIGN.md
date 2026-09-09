# Coreward — the expansion plan

Written 2026-09-09, against v0.16.0. **The plan, not a history.** Rewrite in place as
things land; the changelog is where the record goes.

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
