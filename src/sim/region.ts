/* The world is one planet, and the planet has places in it.

   Playtest: *"I want to stay on one plannet for much longer ... I want the
   entire game to be based around one planet ... I dont want to just try to dig
   to the bottom."*

   ---------- what this replaces, and why it is nearly free ----------

   Twelve palettes and five traits already described twelve places with
   different rock, different colour and different rules. They were spent one at
   a time, on twelve WORLDS you visited and left. Spent instead on twelve
   REGIONS of one world they are most of a large, varied planet for almost no
   new code - the palette applies to a patch of ground rather than to a save
   slot, and a trait bends the rules of somewhere you can walk to rather than
   of a visit you chose from a menu.

   That is the single biggest lever in this round and it was already in the
   repository.

   ---------- the shape ----------

   Four depth bands by three lateral thirds. Twelve, which is exactly the
   number of palettes, and the two axes are the point: a grid that was only
   deep would still be a game about digging down, and one that was only wide
   would have nothing under it. You have to go sideways AND down to have seen
   the planet.

   Deliberately a GRID rather than seeded blobs. A region has to be somewhere
   you can describe to yourself - "the hot ground under the east" - and a map
   has to be able to draw it. Voronoi cells look better in a screenshot and are
   worse at both.

   The boundaries wander, though, for the same reason the rock strata do: a
   dead straight line across sixty-one columns is the most artificial thing a
   generator can draw. */

import { rnd } from './util';
import { W } from './config';

/* Four down, three across. */
export const REGION_ROWS = 4;
export const REGION_COLS = 3;
export const REGION_COUNT = REGION_ROWS * REGION_COLS;

/* How deep the world goes. One fixed number now rather than 58 + 48 a leg:
   there are no legs. Chosen so the ore ladder that was spread over eight
   planets - Solmarrow starts at 372 m - all fits inside one world with the
   deepest band meaning something. */
export const WORLD_DEPTH = 452;

/* How far a region boundary wanders, in metres and in columns. Same argument
   as BAND_WANDER: seeded, small, and enough that no edge in the world is a
   ruled line. */
const ROW_WANDER = 7;
const COL_WANDER = 3;

/* Which of the four depth bands a metre is in. */
export function regionRow(x: number, d: number): number {
  const band = WORLD_DEPTH / REGION_ROWS;
  for (let r = 1; r < REGION_ROWS; r++) {
    const edge = r * band + (rnd(x + r * 131, r * 29 + 613, 977) - 0.5) * 2 * ROW_WANDER;
    if (d < edge) return r - 1;
  }
  return REGION_ROWS - 1;
}

/* And which lateral third a column is in. */
export function regionCol(x: number, d: number): number {
  const span = W / REGION_COLS;
  for (let c = 1; c < REGION_COLS; c++) {
    const edge = c * span + (rnd(d + c * 211, c * 47 + 307, 1013) - 0.5) * 2 * COL_WANDER;
    if (x < edge) return c - 1;
  }
  return REGION_COLS - 1;
}

/* The region index at a cell, 0 to 11. Row-major, so 0-2 is the shallow
   ground west to east and 9-11 is the deep. */
export function regionAt(x: number, d: number): number {
  return regionRow(x, d) * REGION_COLS + regionCol(x, d);
}

/* Names, because a place you cannot say the name of is not a place.

   The twelve planet names became the twelve regions, which is the same
   conversion the palettes went through and keeps everything that was already
   written about how they look. The first one is where the pad is. */
export const REGION_NAMES = [
  'Verdax', 'Rustmoor', 'Cryon',
  'Ashvault', 'Kryllon', 'Tessivar',
  'Obrinth', 'Palewell', 'Serrik',
  'Vantomir', 'Halcyne', 'Dross'
];

export const regionName = (i: number) => REGION_NAMES[i] || REGION_NAMES[0];

/* Which trait a region has.

   Hand-assigned rather than cycled, because the layout is a design and not an
   arithmetic accident. Two rules hold it:

   1. THE SHALLOW MIDDLE IS STABLE. That is where the pad is and where the
      first hour happens, and a tutorial region whose gas is doubled is a
      tutorial nobody finishes.
   2. EVERY TRAIT APPEARS AT LEAST TWICE, at different depths, so learning what
      Volatile ground does is knowledge that pays off somewhere else - which is
      the sourced "each key opens a few locks" applied to understanding rather
      than to tools. */
export const REGION_TRAIT = [
  /* shallow: west, the pad, east */
  'hollow',      'stable',      'crystalline',
  /* upper middle */
  'volatile',    'hollow',      'stable',
  /* lower middle */
  'crystalline', 'searing',     'volatile',
  /* the deep */
  'searing',     'crystalline', 'searing'
];

/* ---------- what you have seen ----------

   The map needs two different things and they want two different resolutions.

   The TUNNELS are drawn from `g.dug`, which is exact, already saved, and is
   the thing a player actually recognises - "that is the shaft I cut last
   Tuesday". Nothing new is needed for those.

   Behind them is the dimmer wash of ground you have merely been NEAR, which is
   what turns a map from a diagram of your own tunnels into a picture of a
   place with unexplored parts. That does not need to be exact: at one entry
   per cell a fully explored world would be 27,572 of them, and at four by four
   it is 1,808 - a hundred and thirteen rows of sixteen, which is more than
   enough resolution on a screen where the whole world is 340 pixels wide.

   The lamp's reach decides what counts as near, so a better Scanner fills the
   map faster, which is a quiet second reason to buy one. */
export const MAP_TILE = 4;

export const mapKey = (x: number, d: number) =>
  Math.floor(x / MAP_TILE) + ',' + Math.floor(d / MAP_TILE);

/* Every tile within `reach` of a point. Returned rather than applied so the
   pure core never touches the save directly and a test can ask what a position
   would reveal without revealing it. */
export function tilesSeen(x: number, d: number, reach: number): string[] {
  const out: string[] = [];
  const r = Math.max(1, Math.round(reach));
  for (let dx = -r; dx <= r; dx += 1) {
    for (let dd = -r; dd <= r; dd += 1) {
      const cx = x + dx, cd = d + dd;
      if (cx < 0 || cx >= W || cd < -1) continue;
      /* A circle, not a square: a square of revealed map around a ship that
         has flown in a straight line reads as a corridor with corners on it. */
      if (dx * dx + dd * dd > r * r) continue;
      const k = mapKey(cx, Math.max(0, cd));
      if (out.indexOf(k) < 0) out.push(k);
    }
  }
  return out;
}
