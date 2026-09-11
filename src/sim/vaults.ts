/* The Anchors, and the rooms they are in.

   Playtest: *"find more secrets, random caves, and other things to make the
   planet feel mysterious and intriguing ... I dont want to just try to dig to
   the bottom."*

   ---------- what the research settled ----------

   Dome Keeper's own developer made this exact pivot and said why. The original
   win condition was "reach the bottom of the map"; Rene Habermann called it
   *"seriously flawed"* and replaced it with searching for a special underground
   location and recovering something from it. This is that, and it is not a
   guess.

   The other finding is about how authored mystery survives procedural
   generation, and there is only one answer that works: **hand-authored room
   templates dropped at seeded slots.** Spelunky stitches rooms; Noita drops
   hand-placed structures into generated terrain. Animal Well's layered secrecy
   is seven years of hand placement and does not translate at all.

   And the named failure mode is templates you start to recognise. So the
   library is small but most of it is RARE - a first playthrough sees a
   fraction - and the three kinds are deliberately different in what they are
   worth, including one that is worth nothing.

   ---------- the five kinds ----------

     ANCHOR      nine of them, one in each region of the top three rows. The
                 objective
     SEALED      an Anchor you can see through a wall you cannot cut. The
                 "locked door with no visible key", and the key is a device
                 that is buried somewhere else
     EXPEDITION  somebody was here first. Their shaft, their spoil, their
                 supply crate, and the place they stopped. No text
     VEIN        worked stone around something worth having
     QUIET       a room with nothing in it at all, which is what makes the
                 ones that do matter

   ---------- how a room is written ----------

   As characters, because a room is a drawing and a drawing should be legible
   in the file it lives in. Anything that is not one of these is untouched
   ground, and the generator fills it as usual:

     #   worked stone - hard, cut, and unmistakably not rock
     =   sealed stone - unbreakable until you have the Cutting Laser
     .   open air. The room
     A   the Anchor
     o   a supply crate
     *   a pocket worth having
     r   rubble - somebody else's spoil

   Every template is the same size, which costs a few spaces in the source and
   saves the stamping code from ever having to think about it. */

import { rnd } from './util';
import { W } from './config';
import { REGION_COLS, REGION_ROWS, WORLD_DEPTH, regionAt } from './region';

export const VAULT_W = 11;
export const VAULT_H = 9;

export interface Vault {
  id: string;
  kind: 'anchor' | 'expedition' | 'vein' | 'quiet';
  rows: string[];
}

/* ---------- the Anchor halls ----------

   Two versions of the same room, and the difference is one character.

   The NICHE in the middle is the point. The chamber opens as one space, and
   the Anchor stands in a shallow recess at the centre of it, walled either side
   and floored underneath but OPEN ABOVE - so arriving is not the same act as
   reaching it: you break in, you cross the room, and you drop into the recess.
   A monument you can fly down to is worth more than a block you happen to
   drill.

   Open above and not boxed in, and that is a lighting decision as much as a
   design one. The first version sealed the Anchor on all four sides, and the
   light field did exactly what it should with a cell enclosed by stone: it
   left it in shadow. The brightest object in the game rendered as a dull teal
   smudge, correctly. A recess takes the lamp. */
const ANCHOR_HALL: Vault = {
  id: 'anchor-hall', kind: 'anchor',
  rows: [
    '  #######  ',
    ' ##.....## ',
    ' #.......# ',
    ' #..#.#..# ',
    ' #..#A#..# ',
    ' #..###..# ',
    ' #.......# ',
    ' ##.....## ',
    '  #######  '
  ]
};

/* The same hall with a skin you cannot cut.

   This is the sourced device that makes a map worth coming back to: Hollow
   Knight's rule is that a new tool opens things you have ALREADY SEEN and
   could not pass, and backtracking with it is itself content at no cost in new
   world. The wall is visibly different and the room behind it is visibly
   there. */
const SEALED_HALL: Vault = {
  id: 'sealed-hall', kind: 'anchor',
  rows: [
    '  =======  ',
    ' ==.....== ',
    ' =.......= ',
    ' =..#.#..= ',
    ' =..#A#..= ',
    ' =..###..= ',
    ' =.......= ',
    ' ==.....== ',
    '  =======  '
  ]
};

/* ---------- the rooms that are not the objective ---------- */

/* Somebody was here first, and the room says so without a word.

   A shaft that comes in from above and stops. Spoil piled where they worked.
   One crate they did not carry out. The research is explicit that this is how
   an environment tells a story in a game with no dialogue, and that it stops
   working the moment a note explains it. */
const EXPEDITION: Vault = {
  id: 'expedition', kind: 'expedition',
  rows: [
    '     .     ',
    '     .     ',
    '  ####.### ',
    ' ##r...r.# ',
    ' #..o.....#',
    ' #.r....r.#',
    ' ##......## ',
    '  ###..###  ',
    '    ###     '
  ]
};

/* Worked stone around something worth having. The one room that pays. */
const VEIN_ROOM: Vault = {
  id: 'vein-room', kind: 'vein',
  rows: [
    '   #####   ',
    '  ##...##  ',
    ' ##.***.## ',
    ' #..***..# ',
    ' #...*...# ',
    ' #.......# ',
    ' ##.....## ',
    '  ##...##  ',
    '   #####   '
  ]
};

/* And the one that does not.

   The deliberate emptiness, and it is load-bearing. If every worked room in
   the planet held something, finding worked stone would be a reward rather
   than a question, and the moment of "what is this" would be over before you
   were through the wall. There have to be rooms that are just rooms. */
const QUIET_ROOM: Vault = {
  id: 'quiet-room', kind: 'quiet',
  rows: [
    '  #######  ',
    ' #.......# ',
    ' #.......# ',
    ' #.......# ',
    ' #.......# ',
    ' #.......# ',
    ' #.......# ',
    ' #.......# ',
    '  #######  '
  ]
};

/* The pool the seeded slots draw from, and the weights are the design.

   Quiet is the most common single kind on purpose - see the note on it - and
   the expedition is rare enough that meeting one is an event rather than a
   furnishing. */
const WILD: Vault[] = [
  QUIET_ROOM, QUIET_ROOM, QUIET_ROOM,
  EXPEDITION, EXPEDITION,
  VEIN_ROOM, VEIN_ROOM
];

export const VAULTS: Vault[] = [ANCHOR_HALL, SEALED_HALL, EXPEDITION, VEIN_ROOM, QUIET_ROOM];

/* ---------- where the Anchors are ----------

   Nine, one in each region of the top three rows. The bottom row holds none,
   because the bottom row is where the Vault is and the deep has to be worth
   reaching for its own reason rather than for a tenth of the same errand.

   Spread WIDE as much as deep, which is the whole point: a grid that was only
   deep would still be a game about digging down. You have to cross the planet
   to light them all. */
export const ANCHOR_COUNT = (REGION_ROWS - 1) * REGION_COLS;

/* The rows an Anchor can be in. Also the rows it cannot: REGION_ROWS - 1. */
export const ANCHOR_ROWS = REGION_ROWS - 1;

export const anchorRegions = (): number[] => {
  const out: number[] = [];
  for (let i = 0; i < ANCHOR_COUNT; i++) out.push(i);
  return out;
};

/* Its own seed offset, like everything else that generates. 11, 23, 41, 77,
   91, 131, 137, 173, 211, 257, 311, 313, 421, 977 and 1013 are taken. */
const ANCHOR_SEED = 601;
const SLOT_SEED = 619;

/* The centre of the Anchor hall in region `r`.

   Seeded inside the region's NOMINAL box, inset far enough that the wandering
   boundaries cannot push the room across one. The insets are the wanders
   themselves plus half the room, so the whole hall is inside its own region
   even at the worst boundary offset - which a test checks, because "far enough"
   is exactly the kind of claim that is wrong by two. */
export function anchorAt(r: number): { x: number; d: number } {
  const row = Math.floor(r / REGION_COLS), col = r % REGION_COLS;
  const band = WORLD_DEPTH / REGION_ROWS;
  const span = W / REGION_COLS;

  /* 7 is ROW_WANDER and 3 is COL_WANDER from region.ts, plus half the room,
     plus one for luck. Written out rather than imported because region.ts
     keeps them private and a room that fits is a stronger statement than a
     room that tracks a constant. */
  const dPad = 7 + VAULT_H / 2 + 1;
  const xPad = 3 + VAULT_W / 2 + 1;
  const d0 = row * band + dPad, d1 = (row + 1) * band - dPad;
  const x0 = Math.max(xPad, col * span + xPad);
  const x1 = Math.min(W - 1 - xPad, (col + 1) * span - xPad);

  const d = Math.round(d0 + rnd(r * 13, r * 29 + 7, ANCHOR_SEED) * (d1 - d0));
  const x = Math.round(x0 + rnd(r * 17 + 5, r * 31, ANCHOR_SEED + 1) * (x1 - x0));
  return { x, d };
}

/* Whether region `r`'s Anchor is behind a wall you cannot cut yet.

   A third of them, spread so that the first one you are likely to meet is not
   one of them: region 0 to 2 is the shallow row and the shallow row is where
   the mechanic is learned. Fixed rather than seeded, because "how many locked
   doors are open at once" is a pacing decision and the research's named
   failure mode is too many unexplained hooks at the same time. */
const SEALED_REGIONS = new Set([4, 6, 8]);

export const anchorSealed = (r: number) => SEALED_REGIONS.has(r);

export const anchorVault = (r: number): Vault => anchorSealed(r) ? SEALED_HALL : ANCHOR_HALL;

/* ---------- the seeded slots ----------

   Sixteen rooms that are not Anchors, scattered over a world of 27,572 cells.
   That is about four per cent of the planet's cells inside worked stone, which
   is rare enough that the first one is a surprise and common enough that a
   long campaign meets several.

   Placed on a coarse lattice rather than by rejection sampling, because a
   lattice cannot fail to terminate and a seeded world has to generate the same
   rooms every time it is asked. */
export const WILD_SLOTS = 16;

export function wildSlot(i: number): { x: number; d: number; vault: Vault } {
  /* Spread down the world by index so they cannot all hash into one band, and
     jittered inside their share so they are not a ladder. */
  const share = (WORLD_DEPTH - 40) / WILD_SLOTS;
  const d = Math.round(24 + i * share + rnd(i * 7, i * 19, SLOT_SEED) * (share - VAULT_H - 2));
  const xPad = VAULT_W / 2 + 1;
  const x = Math.round(xPad + rnd(i * 23 + 3, i * 11, SLOT_SEED + 1) * (W - 1 - xPad * 2));
  const vault = WILD[Math.floor(rnd(i * 5, i * 37, SLOT_SEED + 2) * WILD.length) % WILD.length];
  return { x, d, vault };
}

/* ---------- the stamp ----------

   Every authored cell in the world, keyed by cell, built once.

   Built rather than queried per cell: a lookup that had to test 25 rooms for
   every one of the 735 cells a streaming rebuild touches would be 18,000 box
   tests a rebuild. This is 25 rooms times 99 cells, once, and then a Map get.

   Anchors are stamped FIRST and a wild room that would overlap one is dropped
   entirely rather than clipped. A half-stamped room is a wall with no room
   behind it, which is the worst thing this system could produce: the player
   goes through it and finds nothing, and the language of worked stone stops
   meaning anything. */
export interface Placed { x: number; d: number; vault: Vault }

/* Which rooms are actually in the world, in stamping order.

   Split out from the stamp itself because "was this room placed" is otherwise
   only answerable by re-deriving the drop rule, and a test that re-derives the
   rule it is testing passes with the rule deleted. Asked for a list, a test can
   check the RESULT: that every room on it is stamped whole, and that no two of
   them overlap. */
export function vaultPlan(): Placed[] {
  const out: Placed[] = [];
  for (let r = 0; r < ANCHOR_COUNT; r++) {
    const a = anchorAt(r);
    out.push({ x: a.x, d: a.d, vault: anchorVault(r) });
  }
  for (let i = 0; i < WILD_SLOTS; i++) {
    const s = wildSlot(i);
    /* Rooms are VAULT_W apart before they can touch, and a whole room's
       clearance either way is the cheapest correct test. Dropped entirely
       rather than clipped: a half-stamped room is a wall with no room behind
       it, and that is the worst thing this system could produce. */
    if (out.some((t) => Math.abs(t.x - s.x) < VAULT_W && Math.abs(t.d - s.d) < VAULT_H)) continue;
    out.push(s);
  }
  return out;
}

export function vaultCells(): Map<string, string> {
  const out = new Map<string, string>();
  for (const p of vaultPlan()) {
    const x0 = p.x - (VAULT_W - 1) / 2, d0 = p.d - (VAULT_H - 1) / 2;
    for (let ry = 0; ry < VAULT_H; ry++) {
      const row = p.vault.rows[ry];
      for (let rx = 0; rx < VAULT_W; rx++) {
        const ch = row[rx];
        if (!ch || ch === ' ') continue;
        const x = x0 + rx, d = d0 + ry;
        if (x < 0 || x >= W || d < 1 || d >= WORLD_DEPTH) continue;
        out.set(x + ',' + d, ch);
      }
    }
  }
  return out;
}

/* Every Anchor cell, keyed by cell. Built once.

   Asked by blockAt for every cell of a streaming rebuild AND by the frame loop
   for the ship's four neighbours, so a nine-entry linear scan would be eighteen
   seeded hashes a frame and six thousand a rebuild for an answer that never
   changes. */
let acMap: Map<string, number> | null = null;
export function anchorCells(): Map<string, number> {
  if (!acMap) {
    acMap = new Map();
    for (let r = 0; r < ANCHOR_COUNT; r++) {
      const a = anchorAt(r);
      acMap.set(a.x + ',' + a.d, r);
    }
  }
  return acMap;
}

/* Which region's Anchor is at this cell, or -1. */
export function anchorHere(x: number, d: number): number {
  const r = anchorCells().get(x + ',' + d);
  return r === undefined ? -1 : r;
}

/* And whether one is within reach of a cell, which is how an Anchor is lit:
   by standing next to it, not by mining it. Returns the region, or -1. */
export function anchorNear(x: number, d: number): number {
  const m = anchorCells();
  for (const n of [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const r = m.get((x + n[0]) + ',' + (d + n[1]));
    if (r !== undefined) return r;
  }
  return -1;
}

/* And the region an Anchor belongs to, which is where its position was drawn
   from - stated as a function so the rest of the game never assumes the index
   and the region are the same number, in case the bottom row ever gets one. */
export const anchorRegion = (r: number) => r;

/* Whether the Anchor for a region is actually inside it. Used by the test, and
   worth exporting rather than recomputing: the insets above are a claim and
   this is how the claim is checked. */
export function anchorInRegion(r: number): boolean {
  const a = anchorAt(r);
  for (const dx of [-(VAULT_W - 1) / 2, 0, (VAULT_W - 1) / 2]) {
    for (const dd of [-(VAULT_H - 1) / 2, 0, (VAULT_H - 1) / 2]) {
      if (regionAt(a.x + dx, a.d + dd) !== r) return false;
    }
  }
  return true;
}

/* ---------- how hard worked stone is ----------

   Both as multiples of the local band, so a room at 300 m is harder than the
   same room at 40 m for the same reason everything else down there is.

   Worked stone is a wall you are MEANT to get through, so it is about twice
   the rock around it - long enough that breaking in is a decision about fuel
   and short enough that it is never the reason a run ends. Sealed stone, once
   the laser makes it cuttable at all, is four times: the door stays a door
   even after you have the key. */
export const WORKED_HARD = 2.1;
export const SEALED_HARD = 4.4;
