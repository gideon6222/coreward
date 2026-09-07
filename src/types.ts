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
}

export type UpgradeKey =
  | 'drill' | 'cargo' | 'thrust' | 'tank' | 'cool' | 'scan' | 'tow' | 'auto';

export interface Upgrade {
  key: UpgradeKey;
  name: string;
  base: number;
  mul: number;
  max: number;
  /* only the drill has named tiers */
  tiers?: string[];
  effect: (l: number) => string;
}

/* Cargo counts keyed by block id. Every read is guarded with `|| 0`, which is
   why this is a partial record rather than a total one. */
export type Cargo = Record<string, number>;

export type Dir = 'up' | 'down' | 'left' | 'right';

/* g.mode gates input and the frame loop. */
export type Mode = 'play' | 'shop' | 'manifest' | 'pause' | 'event' | 'fly' | 'boom';

/* Sliding between two cells. */
export interface Move {
  x: number;
  d: number;
  fx: number;
  fd: number;
  t: number;
  total: number;
}

/* Chewing through one block. */
export interface Dig {
  x: number;
  d: number;
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
