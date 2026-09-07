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

/* Every smoothing rate in the game was hand-tuned against the old lerp while
   running at 60 fps. This converts one of those numbers to the exponential
   rate that covers the same fraction of the distance in one 60 fps frame, so
   the fix is invisible at 60 fps and only changes what happens away from it.

   Written as a conversion rather than as recomputed literals on purpose: the
   number the reader sees is still the one that was tuned by eye. */
export const asExpRate = (tunedAt60: number) => -60 * Math.log(1 - tunedAt60 / 60);

/* ---------- camera ----------
   Exponential smoothing. The numbers inside asExpRate() are the originals,
   tuned by eye at 60 fps; see the note on asExpRate above. Vertical follow is
   slightly tighter than horizontal, which used to be written as `k + 1` at the
   call site and is a deliberate choice worth naming: the ship moves down far
   more than it moves sideways, so the axis it travels on should lag less. */
export const CAM_FOLLOW_PLAY = asExpRate(6);
export const CAM_FOLLOW_PLAY_Y = asExpRate(7);
export const CAM_FOLLOW_FLY = asExpRate(11);   /* tighter while the autopilot flies */
export const CAM_FOLLOW_FLY_Y = asExpRate(12);
export const CAM_ZOOM_RATE = asExpRate(4);

/* the same conversion for the smaller smoothings inside the frame loop */
export const CAM_BOOST_DECAY = asExpRate(4);
export const BANK_INTO_MOVE = asExpRate(8);
export const BANK_SETTLE = asExpRate(6);
export const FACE_TURN_RATE = asExpRate(14);
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

/* Exponential smoothing toward a target. `rate` is per second, and the result
   genuinely does not depend on frame rate: two 8 ms steps land exactly where
   one 16 ms step lands.

   It used to be `min(1, dt * rate)`, which does not have that property - one
   100 ms step covered 60% of the distance where ten 10 ms steps covered 46%.
   Combined with the frame loop's 50 ms delta cap, a stuttering frame made the
   camera snap rather than merely lag. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}


/* ---------- tremor clock ----------

   Pulled out of the frame loop as a pure reducer, because otherwise the only
   way to watch it run is to sit in the unstable band for thirty-four seconds
   with a renderer attached - and the rhythm IS the mechanic, so it deserves to
   be checkable in milliseconds.

   `t` counts down to the next tremor and `warn` counts down the rumble before
   it lands. Both go to zero the moment the ship leaves the band, so climbing
   out is a real reprieve rather than a pause.

   The depth the band starts at lives in config.ts with the rest of what the
   world IS. The rhythm lives here with the rest of how it feels. */
export const TREMOR_FIRST = 34;    /* seconds in the band before the first one */
export const TREMOR_EVERY = 27;    /* and the rhythm after that */
export const TREMOR_JITTER = 8;
export const TREMOR_WARN = 2.6;    /* seconds of rumble before it lands */

export interface TremorClock { t: number; warn: number }
export interface TremorTick {
  t: number;
  warn: number;
  warned: boolean;   /* true on the one frame the rumble starts */
  fired: boolean;    /* true on the one frame the ground moves */
  shake: number;     /* 0 while quiet, ramping to 1 as it lands */
}

export function tremorTick(
  c: TremorClock, dt: number, inBand: boolean, nextGap: () => number
): TremorTick {
  if (!inBand) return { t: 0, warn: 0, warned: false, fired: false, shake: 0 };

  let t = c.t <= 0 ? TREMOR_FIRST : c.t;
  let warn = Math.max(0, c.warn);
  const alreadyWarning = warn > 0;

  t -= dt;

  /* Landing is checked first. A frame long enough to step over the whole
     warning window would otherwise arm the rumble and fire on the same tick,
     and then arm it a second time on the next one - two warnings for one
     tremor. Reporting `warned` here keeps the sound paired with the shake even
     when the warning never got a chance to run. */
  if (t <= 0) return { t: nextGap(), warn: 0, warned: !alreadyWarning, fired: true, shake: 1 };

  if (t <= TREMOR_WARN && !alreadyWarning) warn = TREMOR_WARN;
  /* warn is armed at TREMOR_WARN when t is already below it, so warn >= t
     always holds and warn cannot reach zero before the tremor lands. */
  if (warn > 0) warn = Math.max(0, warn - dt);

  return {
    t, warn,
    warned: warn > 0 && !alreadyWarning,
    fired: false,
    shake: warn > 0 ? clamp01(1 - warn / TREMOR_WARN) : 0
  };
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

/* ---------- heat soak ----------
   Depth alone made heat a place rather than a clock: at a safe-enough depth you
   could sit forever, so the only question was "how deep", never "how long".
   Soak builds while you are below HEAT_DEPTH and bleeds off above it, and it
   multiplies the damage depth is already doing.

   That turns lingering into the gamble. One quick dip is nearly free; parking
   on a rich vein is what kills you, and the choice to stay one more block is
   the decision the loop was missing. */
export const SOAK_RISE = 1 / 40;    /* deep-seconds from cold to fully soaked */
export const SOAK_FALL = 1 / 14;    /* shallow-seconds back to cold, faster */
export const SOAK_MAX_MULT = 2.5;   /* damage multiplier when fully soaked */

/* How far into the hot zone you are, 0 at the boundary and 1 well inside it.
   Drives the world going ember: rock, sky, fog and dust all shift together so
   crossing the line is a change you see rather than a number you read. Shorter
   than the soak ramp on purpose - the world should announce the zone
   immediately, while the danger itself builds over time. */
export const HEAT_TINT_RAMP = 26;
export const heatT = (pd: number) => clamp01((pd - HEAT_DEPTH) / HEAT_TINT_RAMP);

/* `rise` is the planet's soak multiplier (Searing runs hot). Only the build
   side scales - bleeding off at the surface is the same everywhere, because a
   trait that also slowed recovery would punish twice for one idea. */
export function soakAfter(soak: number, pd: number, dt: number, rise = 1): number {
  const rate = pd > HEAT_DEPTH ? SOAK_RISE * rise : -SOAK_FALL;
  return clamp01(soak + rate * dt);
}

/* Hull loss per second at a given depth, after the cooling rig's shield and
   scaled by how long you have been down there. Zero above HEAT_DEPTH. */
export function heatDamagePerSecond(pd: number, shield: number, soak = 0): number {
  if (pd <= HEAT_DEPTH) return 0;
  const ex = (pd - HEAT_DEPTH) / HEAT_RAMP;
  const escalation = 1 + clamp01(soak) * (SOAK_MAX_MULT - 1);
  return Math.pow(ex, HEAT_EXPONENT) * HEAT_RATE * (1 - shield) * escalation;
}
