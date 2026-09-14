/* ---------- three visuals tiers ----------

   `INDEX.md` standing rule 18: every game ships low, medium and high, and the
   doctor WARNs on a game without them. This one had exactly one setting - a
   pixel ratio capped at 2 and antialias on, fixed for every device - and it
   had never been caught, because the doctor's tier check looks for a Godot
   `src\game\visuals.gd` and this is a web game. A rule nothing looks at is
   the failure the whole framework exists to prevent, so it is written down
   here with a test that does look.

   The tiers are what a phone one generation back needs. `DEVICE.md` measured
   an Adreno 730 against an Adreno 840 on the Godot template: the same cost at
   a cheap load (the frame is overhead, not shading) and 1.33x to 1.42x for
   real drawing. This game is fill-rate bound rather than draw-call bound - 86
   draw calls of a 150 budget, with PBR terrain over the whole screen - so the
   lever that matters most is how many pixels get shaded, which is the pixel
   ratio, and it is first in the table for that reason.

   WHAT A TIER MAY CHANGE. `DEVICE.md`: *"Every tier must render the same game:
   the same rules, the same reach, the same reads. A tier changes what things
   cost, never what they are."* So no tier changes the lamp's reach, what is
   diggable, what an ore is worth, or how far you can see a vein - all of those
   are the game. Density, resolution and relief are not.

   ANTIALIAS IS DELIBERATELY NOT IN THE TABLE. It is a WebGL context attribute,
   fixed when the context is created, so putting it on a tier would mean a
   setting that needs a reload - which `POLISH.md` names as the single most
   common prototype tell. Everything below applies live. */

export type Tier = 'low' | 'medium' | 'high';
export const TIERS: Tier[] = ['low', 'medium', 'high'];

export interface TierSpec {
  /* The cap on devicePixelRatio. The phone reports 2.625; high already capped
     at 2, and low at 1 is a quarter of the fragments of high. */
  dpr: number;
  /* Motes in the air. A full-screen additive point field is pure fill. */
  dust: number;
  /* How much of the growth actually grows, as a fraction of each band's own
     chance. Applied to the CELL's stable roll, so a lower tier grows a strict
     SUBSET of the same patches in the same places - it never moves one, and it
     cannot pop, which an instance-pool cap would have done: the pool ceiling is
     700 against a real density of about 240 per kind, and lowering it below
     that is a patch that silently fails to draw. */
  growth: number;
  /* Vertex displacement on the rock. Off is flat-shaded rock with the same
     lightmap and the same colors - the read is identical, the relief is not. */
  relief: boolean;
}

export const TIER: Record<Tier, TierSpec> = {
  low:    { dpr: 1.0, dust: 420,  growth: 0.34, relief: false },
  medium: { dpr: 1.5, dust: 900,  growth: 0.62, relief: true },
  high:   { dpr: 2.0, dust: 1400, growth: 1.0,  relief: true }
};

/* A single number per tier, for the ordering test. It is not a prediction of
   milliseconds - nothing here has been measured on a phone yet, and a number
   that pretends otherwise is the kind of thing rule 7 refuses. It is a
   relative cost in the one currency that dominates a fill-bound frame: shaded
   fragments, which go as the SQUARE of the pixel ratio, plus the two counts
   that are drawn on top of them. */
export function tierCost(t: Tier): number {
  const s = TIER[t];
  return s.dpr * s.dpr * 100 + s.dust / 40 + s.growth * 18 + (s.relief ? 12 : 0);
}

const KEY = 'coreward.visuals';

/* The default is MEDIUM, not high.

   High is what this game did before tiers existed, so defaulting to it would
   make the feature invisible to everyone who already has the game installed -
   and the phone it is aimed at is his S26, where medium's 1.5x pixel ratio on
   a 1080-wide canvas is already more than the panel resolves at arm's length.
   A player who wants the extra can ask for it; a player on an older phone gets
   a game that runs. */
export const DEFAULT_TIER: Tier = 'medium';

let current: Tier = DEFAULT_TIER;

export function loadTier(): Tier {
  try {
    const v = localStorage.getItem(KEY);
    if (v && (TIERS as string[]).includes(v)) current = v as Tier;
  } catch { /* private mode */ }
  return current;
}

export function tier(): Tier { return current; }
export function spec(): TierSpec { return TIER[current]; }

/* Set the tier and remember it. Returns whether it actually changed, so the
   caller can skip the rebuild when a control re-reports the value it has. */
export function setTier(t: Tier): boolean {
  if (t === current) return false;
  current = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
  return true;
}

/* Applying a tier to the renderer lives in `visualsapply.ts`, NOT here.

   This file must stay importable without pulling in three.js: `test/visuals.ts`
   loads it to assert the three tiers exist and cost in order, and a single
   import of `./scene` from here drags the whole renderer (and its .webp
   textures, which the test bundler has no loader for) into a table of six
   numbers. Same reason `src/sim` has a wall around it. */
