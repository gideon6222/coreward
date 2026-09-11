/* Devices you dig up, as opposed to ladders you buy.

   Playtest: *"I want most of the upgrades to be hidden for now and unlock
   later in the game, possibly after unlocking new planets. and introduce some
   of the other power ups later as you make it further into the first planet
   ... you only unlock certain upgrades by finding them initially, the game
   hints at what it does and you now own it, then you can upgrade it at the
   shop."*

   That is a complete mechanism, stated. This is it.

   ---------- the split, which was already in the data ----------

   Fifteen upgrades divide in two, and the line was not invented for this
   round - it was sitting in `effect(0)` the whole time, which is why it is the
   right one.

   Seven upgrades print `Not installed` at level zero. Those are DEVICES the
   ship does not have. The other eight do not, because they are ladders on gear
   the ship is already wearing: a bigger tank, a thicker hull, a better drill.
   You cannot "discover" a bigger fuel tank; you can absolutely discover a
   cutting laser in a crate.

   So the Outfitter sells the eight ladders, depth-gated exactly as before, and
   the seven devices are not for sale at any price until the rock gives one up.
   That is *"most of the upgrades are hidden for now"*, hidden for a reason the
   player can say out loud rather than because a number has not gone up yet.

   ---------- where they are ----------

   Buried the way the relic and the drive component are: a HASHED CELL, not a
   roll against the ore stream. Two reasons, both learned here already. A roll
   can lose a coin flip to a cave, and the one crate on the planet that carries
   a whole verb must not be deletable by weather. And a new roll consumes from
   a stream another generator is using unless it gets its own offset, which is
   the trap CLAUDE.md names - avoided here by not rolling at all.

   Offset 257 is this module's, alongside caves on 77, pockets on 41, quakes on
   173 and breach tremors on 211.

   ---------- missable, but never lost ----------

   The relic's rule is *"missable, but never fatal"*: leave it, break the core,
   and it goes with the planet forever. A device does NOT follow that rule, and
   the difference is deliberate.

   A relic is a trophy, and losing one is a story you tell. A device is a VERB -
   the charge, the laser, the drone - and a save that can permanently lack a
   verb is a save that got quietly worse while nobody was looking. So the
   candidate list is simply "everything not yet found whose leg has come": miss
   one, and it is on the next world at a new position. The cost of missing it is
   a world, which is real, and is the right size of punishment. */

import { W, coreDepth } from './config';
import type { UpgradeKey } from '../types';

export interface Find {
  key: UpgradeKey;
  /* What the banner says at the moment it comes out of the rock. One line,
     present tense, what it DOES - not what it is made of. The research is
     consistent that the fiction does the explaining and the shop row needs no
     further words. */
  blurb: string;
  /* The earliest leg this can be buried on. Spreads the seven across the first
     three worlds instead of dumping them all in the opening shaft. */
  from: number;
  /* The shallowest metre it can be buried at - the same depth the row already
     used as its shop gate, so the device is found in the neighbourhood of the
     problem it answers rather than five minutes before. */
  below: number;
}

/* Ordered shallowest first, which is also the order they are met. */
export const FINDS: Find[] = [
  { key: 'magnet',  from: 0, below: 20,
    blurb: 'Pulls loose ore toward the ship instead of making you fetch it.' },
  { key: 'survey',  from: 0, below: 35,
    blurb: 'Reads ore through solid rock, so you can dig at something.' },
  { key: 'bomb',    from: 0, below: 40,
    blurb: 'Breaks a pocket of cells at once. Runs on the power meter.' },
  { key: 'reactor', from: 1, below: 50,
    blurb: 'More power, and it comes back faster. Both weapons run off it.' },
  { key: 'drone',   from: 1, below: 60,
    blurb: 'Mends the hull slowly while you are underground.' },
  { key: 'auto',    from: 2, below: 65,
    blurb: 'Flies you back to the surface on its own, and cheaply.' },
  { key: 'laser',   from: 2, below: 90,
    blurb: 'Cuts a straight shaft ahead of you. Expensive in power.' }
];

export const FIND_OF: Record<string, Find> = {};
for (const f of FINDS) FIND_OF[f.key] = f;

/* The set of keys that are found rather than sold. Exported as a set because
   every caller is asking "is this one of them", never iterating. */
export const FOUND_KEYS = new Set<UpgradeKey>(FINDS.map((f) => f.key));

/* ---------- what is buried on THIS world ----------

   Everything unfound whose leg has come and whose depth fits inside the world,
   shallowest first, capped. The cap is what stops a late world that has been
   skipped through turning into a crate hunt: four is already more buried
   singletons than the relic and the component put together.

   `found` is the player's list. Pure in, pure out: no state import, so the
   tests can ask what a hypothetical save would see. */
export const FINDS_PER_WORLD = 4;

export function findsOn(leg: number, coreDepthHere: number, found: string[]): Find[] {
  return FINDS
    .filter((f) => leg >= f.from && !found.includes(f.key) && f.below <= coreDepthHere - 3)
    .slice(0, FINDS_PER_WORLD);
}

/* ---------- where one sits ----------

   Its own hash per device AND per leg, so the crate is somewhere new on each
   world and two devices on one world are never in the same column. The
   constants are the odd 32-bit multipliers the rest of this repo uses for
   position hashes; the device's index is folded in so `magnet` and `survey` on
   the same leg cannot collide by construction.

   Depth is drawn from the band between the device's own `below` and three
   metres clear of the core, so it is always inside the world and never inside
   bedrock. */
export function findAt(f: Find, leg: number, coreDepthHere: number): { x: number; d: number } {
  const i = FINDS.indexOf(f) + 1;
  const lo = Math.max(1, f.below);
  const span = Math.max(1, coreDepthHere - 3 - lo);
  const hx = Math.imul(leg * 31 + i + 257, 2654435761) >>> 0;
  const hd = Math.imul(leg * 17 + i * 101 + 257, 1597334677) >>> 0;
  return {
    x: 1 + (hx % (W - 2)),
    d: lo + (hd % span)
  };
}

/* Everything buried on a world, as cells, with the device each cell holds.

   One call rather than a loop at the call site, because `blockAt` runs per cell
   per frame and the thing it needs is a lookup, not a list. The caller caches
   this per world - see `findCells` in world.ts. */
export function findMap(leg: number, coreDepthHere: number, found: string[]): Map<string, Find> {
  const m = new Map<string, Find>();
  for (const f of findsOn(leg, coreDepthHere, found)) {
    const p = findAt(f, leg, coreDepthHere);
    /* No collision nudge here, deliberately, and it was written and then cut.

       Folding the device's index into both hashes already separates them: a
       sweep of 13,176 placements across six hundred legs and every holding
       state produced zero collisions, so the nudge never once fired. That
       makes it dead code by rule 12 - but the reason it had to GO rather than
       stay as insurance is sharper than that. A nudge silently repairs a
       collision, which means `findMap` would keep returning one cell per
       device however bad the hash got, and the test that asserts exactly that
       would keep passing while the thing it protects rotted. The test is the
       insurance; the nudge would have been a blindfold over it. */
    m.set(p.x + ',' + p.d, f);
  }
  return m;
}

/* The block a schematic cell is.

   Green, and the one green in the game: `#00ff41` is the Matrix phosphor, and
   the research is emphatic that it is a monochrome identity rather than one
   neon among several. In the ground it has no competition, so it can simply be
   the colour that means "this is information, not ore" - which is exactly what
   a crate holding a device is.

   Hard enough to be a commitment and not so hard it is a chore: between a geode
   and the relic. */
export const FIND_COLOR = 0x00ff41;
export const FIND_HOST = 0x102818;
export const FIND_HARD = 10;
