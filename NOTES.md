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
more of them visible. **That is the next optimisation lever if Stage 3 needs
headroom**: consolidating them into a single instanced or Points draw. Not done
yet because the pulse animates each halo's scale, which a shared draw would need
a small custom shader to preserve.

A test fixture lesson: the pathfinding fixtures hardcoded x=4, the old
`START_X`, so widening the world broke a *contract* test rather than just the
canary. They are now written relative to `START_X`, and there is an assertion
that the pad stays centred. Fixtures that hardcode a derived constant will break
on the day it changes.

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
- **Stage 3: atmosphere.** Stage 2 freed the draw-call budget; spend it. Real
  shadows, a wider view, denser debris, better ore reads.
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
