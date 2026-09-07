# Coreward

Dig toward a planet's core, sell ore at the surface pad, buy upgrades, break the
core and the planet tears itself apart, then launch to a harder one. Fuel and
heat are the two pressures pushing you back up.

**Play: https://gideon6222.github.io/coreward/**

A 3D installable web game — three.js, no server, works offline. Built for a
phone in portrait.

## Install it

Open the link in Chrome on Android and choose "Add to home screen". It runs
fullscreen, keeps your save on the device, and works with no signal.

Progress lives in the browser's local storage, so clearing site data for
`gideon6222.github.io` wipes your credits, upgrades, core shards and every
tunnel you have dug.

## Controls

The d-pad digs and flies. Hold a direction to keep going.

- Touch the landing pad to sell your haul automatically
- **SHOP** is only available at the surface
- **AUTOPILOT** appears underground once you have bought it, and flies the
  shortest route home through tunnels you have already dug
- Run out of fuel or hull and a salvage rig tows you home for a cut of the haul.
  Tow Insurance lowers the cut

## Working on it

```
npm install
npm run dev        # dev server
npm test           # golden tests
npm run typecheck  # tsc --noEmit
npm run build      # production build into dist/
npm run preview    # serve dist/ exactly as GitHub Pages will
```

Push to `main` and GitHub Actions typechecks, tests, builds and deploys. A
failing test cannot reach the live site.

The pause menu shows the commit and build time of whatever is actually running,
which is the quickest way to tell whether a phone has picked up a deploy.

## For whoever works on this next

**Read [CLAUDE.md](CLAUDE.md) first.** It covers the stack, the deploy flow, the
constraints that are not obvious from the code, and — most importantly — the
handful of feel rules that are load-bearing rather than decorative. Changing
them changes how the game plays.

Design and technical lessons that carry across games live in a separate repo,
[gamedev-notes](https://github.com/gideon6222/gamedev-notes):

- `CRAFT.md` — what worked and what did not, dated. Read before designing
- `PLAYTESTS.md` — what the player actually said, in their words. The
  complaints are the valuable part

Both are append-only. Add a dated entry; never rewrite history.
