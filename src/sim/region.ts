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
