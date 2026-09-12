/* Domain types.

   Type-only. Nothing here emits code, and the `import type` below matters:
   with verbatimModuleSyntax a plain `import * as THREE` used only in type
   positions would still be emitted, giving the pure modules a runtime
   dependency on three.js and breaking the headless golden tests. */

import type * as THREE from 'three';

/* Ore and rock as they are declared in the tables in config.ts. */
export interface Ore {
  id: string;
  name: string;
  color: number;
  host: number;
  hard: number;
  wt: number;
  value: number;
  min: number;
  chance: number;
  glow: number;
  /* How many crystal shards blocks.ts scatters on the face. Nothing to do with
     the Core Shards that went with the chart in W9 - this one is a particle
     count and it stays. */
  shards: number;
  tone: number;
}

export interface Rock {
  id: string;
  name: string;
  color: number;
  hard: number;
  wt: number;
  value: number;
  glow: number;
}

/* Anything DEF can hold, keyed by block id. */
export type Material = Ore | Rock;

/* What blockAt() returns. Four shapes come out of it — a rock, an ore, the
   planet core and bedrock — and they do not all carry the same fields, so the
   ore-only ones are optional. A discriminated union would be tidier on paper
   but forces narrowing at every call site for no runtime gain.

   `hard` is Infinity for bedrock. */
export interface Block {
  id: string;
  name: string;
  color: number;
  hard: number;
  wt: number;
  value: number;
  glow: number;
  host?: number;
  shards?: number;
  tone?: number;
  ore?: boolean;
  core?: boolean;
  /* Breaking this hurts instead of paying. Hazards never enter cargo. */
  hazard?: boolean;
  /* Breaking this pays something other than ore, and never enters cargo. */
  cache?: boolean;
  /* Rock with visible mineral in it: the thing the flecks were always
     hinting at, and now actually worth stopping for. */
  seam?: boolean;
  /* The one buried artefact on this planet. */
  relic?: boolean;
  /* Cut stone: a wall, not a deposit.

     Breaking it puts NOTHING in the hold, and that flag is load-bearing rather
     than tidy. Every other block in the world either has a DEF entry or is
     caught by a branch above the cargo one, and an id that reaches `g.cargo`
     without a DEF entry crashes the manifest on `DEF[id].value` - which is
     exactly what cutting into an Anchor hall used to do. */
  spoil?: boolean;
  /* A sealed crate holding a device you do not own yet. A flag and not the
     device's name: every crate is the same block, and `findHere()` in world.ts
     says which one this cell holds. See the note in blockAt. */
  find?: boolean;
}

export type UpgradeKey =
  | 'drill' | 'cargo' | 'thrust' | 'tank' | 'cool' | 'scan' | 'scrub' | 'auto'
  | 'bomb' | 'laser' | 'hull' | 'magnet' | 'survey' | 'drone' | 'reactor';

export type SupplyKey = 'coolant' | 'patch' | 'cell' | 'overdrive' | 'bulwark' | 'pulse';

/* A consumable bought at the pad and spent underground.

   Upgrades and supplies answer the same threats on different axes: an upgrade
   raises the ceiling on every future run, a supply buys one more minute on
   THIS run. That is the whole decision - bank toward the permanent thing, or
   spend now because the core is forty metres away and you are nearly out. */
export interface Supply {
  key: SupplyKey;
  name: string;
  /* the four-letter label on the kit button, which is 60 px wide */
  icon: string;
  cost: number;
  /* carrying more than a handful turns a decision into a stockpile */
  max: number;
  blurb: string;
  /* shown on the button when the supply would currently do nothing */
  idle: string;
}

export type Kit = Record<SupplyKey, number>;

/* Personal bests. The game had no goal between "buy the next upgrade" and
   "break the core", which on a phone is a long way apart. These are always
   present, always visible, and cost nothing to pursue. */
export interface Best {
  depth: number;   /* deepest metre ever reached, on any planet */
  haul: number;    /* most valuable single sale */
  /* Seconds from landing on a world to breaking its core, and how many worlds
     have been broken. A collection that does not decay, which POLISH.md asks
     every game for and this one only half had. */
  fastest?: number;
  worlds?: number;
}

/* A planet's personality.

   Every field is a multiplier applied to something layered ON TOP of world
   generation - pocket and cave frequency, hazard damage, how fast soak builds.
   None of them touches `rnd(x, d, planet)`, which is the ore stream, because a
   trait that shifted the ore would rebalance every depth at once and would be
   invisible in a diff. See the additive-only test in test/blocks.test.mjs. */
export interface Trait {
  id: string;
  name: string;
  /* one line, shown on the launch screen and in the pause menu */
  blurb: string;
  gas?: number;
  gasDamage?: number;
  geode?: number;
  cave?: number;
  soak?: number;
  /* M11: the half of a trait that changes a rule rather than a density. Every
     one is optional and every one defaults to "no change", so a trait that
     wants to be pure weather still can be. */
  cleanBonus?: number;   /* extra on the sale for surfacing with a full hull */
  blastR?: number;       /* multiplier on the seismic charge's radius */
  reach?: number;        /* multiplier on how far the lamp's light carries */
  payout?: number;       /* multiplier on what the refinery pays per haul */
  heatUp?: number;       /* multiplier on this world's heat line - under 1 is shallower */
  hard?: number;         /* multiplier on how hard this world's rock is to cut */
}

export interface Upgrade {
  key: UpgradeKey;
  name: string;
  base: number;
  mul: number;
  max: number;
  /* only the drill has named tiers */
  tiers?: string[];
  effect: (l: number) => string;
  /* The mineral this upgrade is built out of, required from MAT_FROM_LEVEL up.
     Its depth is the real gate: you cannot buy the thing until you have been
     where it lives. */
  mat: string;
  /* Which counter of the Outfitter this sits on. */
  group: 'rig' | 'survival' | 'instruments' | 'ordnance';
  /* Deepest metre ever reached before this appears on the shelf at all. Zero
     for the opening kit. A shop that shows everything at once on the first run
     is a wall of numbers; a shop that grows is a reason to go deeper. */
  unlock: number;
}

/* What a purchase costs beyond credits: mineral id -> count. */
export type MatCost = { id: string; need: number } | null;

/* Cargo counts keyed by block id. Every read is guarded with `|| 0`, which is
   why this is a partial record rather than a total one. */
export type Cargo = Record<string, number>;

/* Ore left lying in the world: cell key -> block id. Not a Cargo, which counts
   units of a material; this names a material at a place, one per cell. */
export type Drops = Record<string, string>;

/* One buried artefact per planet, and the permanent thing it gives you.

   This is the game's second objective. Credits buy the ladder and reset their
   own relevance every time you can afford the next rung; a relic is kept
   forever and never has to be bought again, so the question "what have I got"
   finally has an answer that is not a number that will look small next week.

   `apply` is a plain multiplier or offset read by the derived stats in
   state.ts, rather than a callback, so a perk cannot do anything the tests
   cannot see. */
export interface Relic {
  id: string;
  name: string;
  /* one line, shown when you break it and again in the log */
  blurb: string;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

/* g.mode gates input and the frame loop. */
export type Mode = 'play' | 'shop' | 'manifest' | 'pause' | 'event' | 'fly'
                 | 'title' | 'intro' | 'arrive' | 'map' | 'ballast';

/* Chewing through one block. */
export interface Dig {
  x: number;
  d: number;
  /* The direction that started the cut. Letting go or turning away stops the
     drill, and that is tested against this rather than against the ship's
     rounded position: the position test disagreed with itself whenever the
     ship sat between two rows, which cancelled the dig on the frame after it
     started and left the ship pressed against rock doing nothing. */
  dir: Dir;
  t: number;
  total: number;
  block: Block;
  stage: number;
  spark: number;
}

/* Autopilot flying the spline home. */
export interface Flight {
  curve: THREE.CatmullRomCurve3;
  len: number;
  u: number;
  dur: number;
  t: number;
  last: THREE.Vector3;
}

/* The persisted save. Fields are optional because an older or truncated blob
   is still fed through load(), which defaults every one of them. */
export interface SaveV2 {
  planet?: number;
  credits?: number;
  shards?: number;
  up?: Partial<Record<UpgradeKey, number>>;
  dug?: string[];
  cargo?: Cargo;
  weight?: number;
  px?: number;
  pd?: number;
  kit?: Partial<Kit>;
  stock?: Cargo;
  rubble?: string[];
  best?: Partial<Best>;
  drops?: Drops;
  damage?: Cargo;
  charge?: number;
  relics?: string[];
  relicsTaken?: number[];
  drive?: string[];
  won?: boolean;
  world?: number;
  trait?: string;
  coreOff?: number;
  rich?: number;
}

/* The pre-v2 save. `beacon` was the old name for the autopilot upgrade and no
   longer exists in g.up, which is why it is declared here and nowhere else. */
export interface SaveV1 {
  planet?: number;
  credits?: number;
  shards?: number;
  dug?: string[];
  up?: Partial<Record<UpgradeKey, number>> & { beacon?: number };
}
