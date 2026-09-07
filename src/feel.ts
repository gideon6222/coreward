/* Game feel: the numbers and curves that decide how the game *feels* rather
   than what it does.

   These were literals scattered through frame(), which meant the one part of
   the codebase CRAFT.md calls load-bearing was also the only part no test
   touched. A refactor could have changed hit-stop from 75 ms to 35 ms and
   every gate would still have been green.

   Nothing here is arbitrary. The values come from a playtest pass documented in
   the notes repo, and changing one changes how the game plays. If you change
   one deliberately, re-record the golden baseline AND check it on the phone —
   these are exactly the things a desktop cannot tell you about. */

/* ---------- hit-stop ----------
   Freezing the simulation on an impact is the highest value-per-line effect in
   the game. The same animation with and without the pause feels like a
   different game. Scale the freeze to how significant the event is. */
export const FREEZE_ORE = 0.075;   /* 75 ms, a valuable strike */
export const FREEZE_ROCK = 0.035;  /* 35 ms, common rock */

/* ---------- screen shake ----------
   Every value is a peak that then decays; they are applied with Math.max so a
   bigger event overrides a smaller one already in flight. */
export const SHAKE_CRACK = 0.045;   /* a crack stage while drilling */
export const SHAKE_ROCK = 0.09;     /* breaking common rock */
export const SHAKE_ORE = 0.22;      /* breaking ore */
export const SHAKE_LANDING = 0.25;  /* autopilot touching down */
export const SHAKE_TOW = 0.5;       /* the salvage rig grabbing you */
export const SHAKE_BOOM = 1.4;      /* the planet core giving way */
export const SHAKE_DECAY = 1.4;     /* units per second, linear to zero */

/* ---------- ship squash ----------
   A squash on the ship is the third feedback channel alongside particles and
   sound. Decay is per frame, not per second, which is why it is a multiplier. */
export const SQUASH_DIG = 0.55;     /* starting to drill */
export const SQUASH_BREAK = 0.8;    /* the block giving way */
export const SQUASH_DECAY = 0.88;
export const SQUASH_SCALE = 0.16;   /* how much squash distorts the ship */

/* ---------- camera ----------
   Exponential smoothing, framed per second so it is frame-rate independent. */
export const CAM_FOLLOW_PLAY = 6;
export const CAM_FOLLOW_FLY = 11;   /* tighter while the autopilot flies */
export const CAM_ZOOM_RATE = 4;
export const CAM_Y_OFFSET = 0.8;    /* look slightly below the ship */

/* ---------- depth ----------
   One ramp drives ambient light, sun, rim, fog and the CSS sky. Tying
   atmosphere to a game variable is the cheapest mood in the game. */
export const DEPTH_RAMP = 72;       /* metres to reach full darkness */
export const AMBIENT_SURFACE = 1.75;
export const AMBIENT_FALLOFF = 1.55;
export const FOG_SURFACE = 0.02;
export const FOG_GAIN = 0.028;

/* Progress from surface (0) to fully deep (1). */
export const depthT = (pd: number) => clamp01((pd + 2) / DEPTH_RAMP);

/* ---------- curves ---------- */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/* Ease in and out. The autopilot flies a spline through this rather than at a
   constant rate: high speed alone does not read as motion, acceleration does.
   Stepping linearly was rejected in playtest as looking like a fast-forward. */
export function easeInOut(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}

/* Frame-rate independent approach toward a target. `rate` is per second. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * Math.min(1, dt * rate);
}

/* ---------- costs and damage ---------- */

export const FUEL_PER_MOVE = 0.8;           /* per second while flying */
export const FUEL_DIG_BASE = 1.0;           /* per second while drilling */
export const FUEL_DIG_PER_HARDNESS = 0.09;
export const HULL_REGEN = 30;               /* per second, at the surface */
export const HEAT_DEPTH = 70;               /* metres before heat begins */
export const HEAT_RAMP = 50;
export const HEAT_EXPONENT = 1.3;
export const HEAT_RATE = 4.5;

export const digFuelPerSecond = (hardness: number) =>
  FUEL_DIG_BASE + hardness * FUEL_DIG_PER_HARDNESS;

/* Hull loss per second at a given depth, after the cooling rig's shield.
   Zero above HEAT_DEPTH, then accelerating. */
export function heatDamagePerSecond(pd: number, shield: number): number {
  if (pd <= HEAT_DEPTH) return 0;
  const ex = (pd - HEAT_DEPTH) / HEAT_RAMP;
  return Math.pow(ex, HEAT_EXPONENT) * HEAT_RATE * (1 - shield);
}
