import { TRAITS, planetName, PLANET_COUNT } from './config';

/* The navigation chart: where you can go next.

   Until now there was exactly one answer - planet N+1 - which meant the five
   traits were weather rather than anywhere you had chosen to be. A trait you
   cannot seek out cannot be part of a plan, and the Jump Drive (see
   `drive.ts`) is entirely a plan about traits.

   So a broken core opens a survey of three worlds and you pick one.

   WHAT VARIES BETWEEN CANDIDATES, and what does not:

     trait      the real question. Searing costs you hull, Hollow is quick and
                poor, Crystalline pays sideways digging. It also decides which
                Jump Drive component is buried there
     depth      how far down the core is, as an offset on the leg's baseline
     richness   what the ore is worth, moving WITH depth, never against it
     fuel       what the crossing costs to make

     NOT the layout. The rock is generated from the leg, so all three
     candidates are the same cave. That is deliberate: making them different
     caves would mean generating three worlds to show a menu, and the choice is
     about what KIND of place it is, not about memorising a map you have not
     seen.

   Depth and richness move together on purpose. `CRAFT.md`: *"Two upside gates
   beat a good gate and a bad gate."* A shallow poor world against a deep rich
   one has no correct answer - it depends on your hull, your fuel, and which
   component you still need - whereas shallow-and-rich against deep-and-poor
   would just be a right answer and a wrong one. */

export interface Destination {
  /* identity only: the name and the palette it is drawn in */
  world: number;
  /* which trait this world has. STORED rather than hashed from the world id,
     because the chart is the thing that decides what is out there - and
     because `traitOf` can never return Stable for anything but the very first
     planet, which would make the Guidance Spine unobtainable. */
  trait: string;
  /* metres added to the leg's baseline core depth */
  coreOff: number;
  /* multiplier on what ore is worth here */
  rich: number;
  /* what the crossing costs, in fuel */
  fuel: number;
}

/* A cheap deterministic hash. The chart has to be the same every time you
   reach a given leg, or a save reloaded mid-choice offers different worlds. */
function h(n: number): number {
  let x = Math.imul(n ^ 0x9e3779b9, 2654435761);
  x = Math.imul(x ^ (x >>> 15), 1274126177);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export const CHART_SIZE = 3;

/* The three shapes a candidate can take. Index 0 is always the shallow one and
   index 2 always the deep one, so the chart reads consistently: the player
   learns that the right-hand world is the committing one. */
const SHAPES = [
  { coreOff: -18, rich: 0.92, fuel: 10 },
  { coreOff: 0, rich: 1.0, fuel: 16 },
  { coreOff: 34, rich: 1.28, fuel: 24 }
];

/* Traits rotate by three per leg over the five of them.

   Three per leg from a five-cycle with a step of three, and gcd(3,5) = 1, so
   any two consecutive legs show six consecutive positions in the cycle and
   therefore every trait. That is the property the run depends on: a player who
   needs a Searing world for the Thermal Core must never have to wait more than
   one leg for one to appear, or the goal can strand the game. There is a test
   that walks two hundred legs and asserts it. */
/* The day, as a number, for the daily Drift.

   The chart's IDENTITIES rotate with the date so the worlds on offer are
   different tomorrow - a reason to open the game again that costs nothing to
   run and nothing to store. What does NOT move is the trait rotation: a player
   who needs a Searing world for the Thermal Core must never wait more than one
   leg for one, and hanging that on the calendar would make the goal strandable
   on the wrong day. The date changes what the places are called and what the
   rock is like; it never changes which kinds are on offer.

   Days since the epoch in UTC, so it turns over at the same instant for
   everyone and never half-turns over across a timezone. Injectable, because a
   test that reads the real clock is a test that fails one day in a thousand. */
export function driftDay(now = Date.now()): number {
  return Math.floor(now / 86400000);
}

export function chartFor(leg: number, day = driftDay()): Destination[] {
  const n = TRAITS.length;
  const out: Destination[] = [];
  for (let k = 0; k < CHART_SIZE; k++) {
    const trait = TRAITS[(leg * CHART_SIZE + k) % n];
    const s = SHAPES[k];
    /* Identity is independent of the trait, so a Searing world is not always
       called the same thing - the chart should feel like a map of somewhere,
       not a menu of five options wearing hats. */
    const world = Math.floor(h(leg * 31 + k * 7 + day * 977) * PLANET_COUNT * 4) + leg;
    out.push({ world, trait: trait.id, coreOff: s.coreOff, rich: s.rich, fuel: s.fuel });
  }
  return out;
}

/* A one-line description for the chart card. */
export function destLine(d: Destination, baseCore: number): string {
  return planetName(d.world) + ' · core at ' + (baseCore + d.coreOff) + ' m';
}
