import { W, coreDepth } from './config';

/* The Jump Drive: the reason to be doing any of this.

   Playtest: *"have an overall goal besides just digging for resources."*

   The honest answer to "why am I doing this" was that the number goes up.
   `CRAFT.md` names why that is thin: *"Money is a rung: every amount you earn
   makes the last amount irrelevant, so 'what have I got' is always a number
   that will look small next week. A collection is the opposite."*

   So: five components, one per trait, each buried on a world of that trait
   only. With all five you can reach the Heart of the Drift, and breaking the
   Heart's core ends the game.

   THE TRAIT IS THE GATE, and that is the whole design. You need a Searing
   world for the Thermal Core, so you go to the chart and pick one, and you
   accept what a Searing world costs. `CRAFT.md`: *"gate an upgrade behind a
   place, not a price"* - applied to the whole game rather than to one shop row.

   MISSABLE, BUT NEVER FATAL. A component left in the ground goes with the
   planet when its core breaks, which is what makes it worth looking for rather
   than something you collect eventually. But another world of that trait is at
   most two legs away - see the chart test that walks two hundred legs - so a
   mistake is a detour and never a dead save. A permanently unwinnable game is
   the one outcome this must not have, and it is the easy one to build by
   accident. */

export interface Part {
  id: string;
  name: string;
  /* the trait of the world it is buried on */
  trait: string;
  blurb: string;
}

export const PARTS: Part[] = [
  { id: 'spine', name: 'Guidance Spine', trait: 'stable',
    blurb: 'Cut from the quietest rock there is. It knows which way is out.' },
  { id: 'injector', name: 'Plasma Injector', trait: 'volatile',
    blurb: 'Grown in a gas pocket, and it has never once been calm.' },
  { id: 'resonator', name: 'Void Resonator', trait: 'hollow',
    blurb: 'It was hollow before anyone hollowed it. It answers to empty space.' },
  { id: 'prism', name: 'Lattice Prism', trait: 'crystalline',
    blurb: 'A single crystal the size of a fist, and every face is a mirror.' },
  { id: 'thermal', name: 'Thermal Core', trait: 'searing',
    blurb: 'Still warm. It has been still warm for four hundred thousand years.' }
];

export const DRIVE_SLOTS = PARTS.length;

export const PART_OF: Record<string, Part> = {};
for (const p of PARTS) PART_OF[p.id] = p;

/* Which component a world of this trait holds. One each, so the trait on a
   chart card tells you exactly what is down there. */
export function partFor(trait: string): string | null {
  const p = PARTS.find((x) => x.trait === trait);
  return p ? p.id : null;
}

export function partName(id: string): string {
  return PART_OF[id] ? PART_OF[id].name : id;
}

/* Where it is buried.

   DEEPER than the relic, always. The relic sits below the halfway mark; this
   sits in the bottom third, so a world that holds a component is a world you
   have to commit to rather than one you can skim. Its own hash, unrelated to
   the relic's, or the two would sit in the same column on every planet - see
   the note in CLAUDE.md on rolling every new generator on its own offset. */
export function partAt(leg: number, coreOff: number): { x: number; d: number } {
  const cd = coreDepth(leg) + coreOff;
  const lo = Math.floor(cd * 0.66);
  const span = Math.max(1, cd - 5 - lo);
  const hx = Math.imul(leg + 101, 2246822519) >>> 0;
  const hd = Math.imul(leg + 59, 3266489917) ^ Math.imul(leg + 7, 668265263);
  return {
    x: 1 + (hx % (W - 2)),
    d: lo + ((hd >>> 4) % span)
  };
}

export function driveHas(held: string[], id: string) { return held.includes(id); }

/* Complete when every slot is filled. Reads the list rather than a count, so a
   duplicate can never finish the drive - which matters because the same trait
   comes round on the chart every couple of legs. */
export function driveComplete(held: string[]) {
  return PARTS.every((p) => held.includes(p.id));
}

/* The five colours the slots are drawn in, and the colour of the component
   block itself. Kept here rather than in config so the whole goal is one
   file to read. */
export const PART_COLOR = 0x9ffcff;
export const PART_HOST = 0x1d2a33;

/* ---------- the Heart of the Drift ----------

   What the five components are for, and the only ending the game has.

   It is a world like any other except in three ways: you can only reach it
   with a complete drive, its core is far deeper than the ladder would put it,
   and breaking that core finishes the game rather than opening another chart.

   `HEART_WORLD` is deliberately outside the range the chart draws from, so it
   can never turn up as an ordinary destination - a player stumbling onto the
   Heart with two components would be handed the ending's world and none of its
   meaning. */
export const HEART_WORLD = 9999;
export const HEART_TRAIT = 'searing';
/* Metres added to the leg's baseline. The Heart is a commitment: it is roughly
   half again as deep as the deepest world the chart will ever offer. */
export const HEART_CORE_OFF = 120;
export const HEART_RICH = 1.6;

export function isHeart(world: number) { return world === HEART_WORLD; }
