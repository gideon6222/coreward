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
- **A draw-call budget in the smoke test.** `renderer.info` exposes draw calls
  and triangle counts. A change that quietly doubles them is invisible on a
  desktop and matters on a phone.

## Not done, and deliberately

- **No branch previews.** GitHub Pages serves one site per repo. The accepted
  trade is: merge to `main`, check the stamp, revert if wrong. To test a branch
  on the phone, run `npm run preview -- --host 0.0.0.0` and open the PC's LAN
  address — no service worker over plain http, so that will not test offline
  behaviour, but it is fine for checking feel.
