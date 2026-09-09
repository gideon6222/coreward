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

/* ---------- flight ----------

   The ship used to hop cell to cell on a fixed timer, which made every metre a
   discrete decision and the world read like a spreadsheet. It flies now.

   The two numbers that decide how it feels are how fast thrust reaches top
   speed and how fast the ship coasts to a stop. Both are exponential, so
   neither depends on frame rate, and both are deliberately fast: this is a
   game played with a thumb on a d-pad, and anything that reads as momentum
   also reads as the controls being late.

   FLY_ACCEL 18 means roughly a fifth of a second to top speed. FLY_DRAG 9
   means letting go coasts about three quarters of a cell - enough to feel like
   a ship rather than a cursor, short enough that stopping in a one-cell
   corridor is never a struggle. There is a test on that distance. */
export const FLY_ACCEL = 18;
export const FLY_DRAG = 9;

/* Half-width of the ship for collision, in cells. Comfortably under half a
   cell so a one-cell tunnel is roomy rather than a squeeze, and so the corner
   of a diagonal opening is passable without a wall-slide system. */
export const SHIP_R = 0.34;

/* How hard the ship is pulled onto the centre line of the block it is
   drilling. Without it a tunnel dug on the wobble drifts off the grid, and the
   drill visibly misses the rock it is cutting. */
export const DIG_ALIGN = 14;

/* How hard the ship is drawn onto the lane it is not travelling along.

   Free flight let the ship sit between two rows, where its 0.34 radius touches
   both. The cell the collision reported then disagreed with the cell
   `Math.round()` said was ahead, and the drill refused to start - the ship
   pressed against rock doing nothing. Lanes remove the ambiguity rather than
   patching around it, and they are what "on a grid, but not stuck on one"
   actually means: momentum along the lane, no wobble across it.

   18 closes half the offset in about 39 ms - roughly a third of a cell of
   travel at top speed, so a turn reads as an arc rather than a snap, and you
   are lined up before you arrive at whatever you turned toward. It is a true
   per-second rate used as exp(-rate*dt), not a legacy per-frame fraction, so
   it does not go through asExpRate(). */
export const LANE_PULL = 18;

/* How far off the centre line the ship may be and still start a dig. Inside
   this the lane the ship is in and the cell the collision stopped it on are
   the same cell, which is the whole point of lanes; outside it the pull is
   still bringing the ship in and drilling would aim at rock it is not
   touching. At LANE_PULL the gap is crossed in under a tenth of a second. */
export const DIG_ALIGNED = 0.22;

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

/* ---------- how far you can see ----------

   Playtest: *"can you also make the light upgrade more important? I can see
   all of the blocks on screen, so it doesnt seem very beneficial."*

   He was right, and the reason is that the Scanner only ever changed the
   LAMP's radius while the camera framed a fixed eighteen rows. Everything on
   screen was already inside the lit circle at every level, so the upgrade
   bought a slightly warmer wall and nothing else.

   The framing now belongs to the Scanner. At level 0 the camera sits close and
   you are working in a pocket of light; every level widens it, and the last
   one shows appreciably more world than the game ever did before. Because the
   camera lerps toward its target, buying a level is a slow zoom out - the
   upgrade is a thing that visibly happens to you rather than a number.

   Curved rather than linear: the first two levels are worth the most, which is
   when the player is deciding whether the Scanner is worth buying at all. */
export const ZOOM_MIN = 0.82;   /* level 0 */
export const ZOOM_MAX = 1.22;   /* level 9, well wider than the old framing */
export function zoomForScan(level: number): number {
  const t = clamp01(level / 9);
  return ZOOM_MIN + (ZOOM_MAX - ZOOM_MIN) * (1 - Math.pow(1 - t, 1.7));
}

/* ---------- depth ----------
   One ramp drives ambient light, sun, rim, fog and the CSS sky. Tying
   atmosphere to a game variable is the cheapest mood in the game. */
export const DEPTH_RAMP = 72;       /* metres to reach full darkness */
export const AMBIENT_SURFACE = 1.30;
/* The floor the ambient settles to deep down, and the exponent that gets it
   there. Both arrived with the move from Lambert to MeshStandardMaterial.

   Standard is physically based in a way Lambert is not: it adds a specular
   lobe, so every light in the scene now contributes a highlight as well as a
   diffuse term, and the old values read as a bright, flat, plastic wash. The
   fix is not simply "turn it down" - it is that ambient has to fall away much
   FASTER than it used to, because ambient is the one light that reaches every
   surface equally and is therefore the exact opposite of what a lamp in a dark
   hole should look like.

   Squared rather than linear, so the drop happens in the first third of the
   descent where the player can feel it, instead of dribbling away over the
   whole ramp. */
export const AMBIENT_DEEP = 0.10;
export const LIGHT_FALL_POW = 2;

export const FOG_SURFACE = 0.016;
/* Left where it was, and here is why raising it is a trap.

   FogExp2 measures distance from the CAMERA, and this camera sits twenty-odd
   units back on Z looking at a flat plane - so every block in the world is
   almost exactly as far away as every other one. Turning fog up does not fade
   the far edges of the frame, it puts an even grey wash over the whole
   picture. Tried it at 0.040 and the entire scene went flat blue.

   The thing that actually falls off with distance in the XY plane is the
   LAMP, because it is a point light sitting on the ship. That is the lever. */
export const FOG_GAIN = 0.010;

/* How much faster the fog COLOUR reaches its deep value than the sky does.

   The fog colour was the sky's horizon colour, which is correct at the surface
   and badly wrong ten metres under it: at 40 m it was still #3b7196, a bright
   blue, and it was painting that blue over every distant surface in the game.
   The sky can keep its gradual ramp - it is the sky - but fog underground is
   the colour of unlit rock, and it should get there almost immediately. */
export const FOG_COLOR_RUSH = 2.4;

/* How sharply the lamp's pool ends. Higher is a tighter circle with a faster
   edge, which is what makes the rock past it read as out of reach rather than
   as merely dimmer. */
export const LAMP_DECAY = 1.75;
/* Raised with the ambient drop. The pool has to do more of the work now that
   there is much less fill light to sit on top of, or the same change reads as
   "the game got dark" rather than as "the lamp is the light". */
export const LAMP_INTENSITY = 44;
/* The cold key light that gives unlit rock its shape. Nearly gone underground:
   at depth the only blue left in the frame should be something glowing. */
export const RIM_SURFACE = 0.42;
export const RIM_DEEP = 0.03;

/* ---------- propagated light ----------

   A point light in three.js does not know the rock is there. It falls off with
   distance and nothing else, so a side tunnel you have never opened was lit
   exactly as brightly as the shaft you are flying down, and being underground
   read as "the picture got darker" rather than as "I can only see where my
   lamp reaches".

   The solver in light.ts fixes that on the grid: it floods light through open
   cells only and hands back, per cell, how much of the lamp survives getting
   there. These are the numbers that decide what that looks like. See
   lightmap.ts for how the grid reaches the shader.

   Everything below is a MULTIPLIER on the lighting three already computes,
   clamped to at most 1. It can darken and it can never brighten, which is
   what lets it sit on top of lighting that was calibrated by eye without
   invalidating any of it. */

/* How fast light dies per unit of DETOUR - not per unit of distance. A cell
   the light had to travel two extra cells to reach keeps exp(-2 * this).
   Distance falloff is the pool below; this is purely what the geometry costs.
   Raise it and corners go black; lower it and the rock stops mattering. */
export const LM_ATT = 0.78;
/* What it costs to slip diagonally past a single rock corner. Without a cost,
   light turning a corner arrives as a clean diagonal edge, which reads as a
   rendering artefact rather than as a shadow. */
export const LM_PINCH = 0.9;
/* How much of a lit rock face carries into the rock behind it, per cell, and
   how far that goes at all.

   Playtest: *"rocks to the sides of the tunnel should be a bit brighter and
   gradually dim, so around 3 layers should be visible but start bright and dim
   quickly by the third. Rocks any further than that should be almost
   completely black."*

   Read those as what ends up on SCREEN, which is after LM_CONTRAST squares the
   multiplier - so the per-cell fraction has to be the square root of the step
   you want to see. 0.62 gives roughly 1.0, 0.38, 0.15, 0.06 on screen: a wall,
   two clearly readable layers behind it, a third that is nearly gone, and
   nothing at all past that. */
export const LM_SEEP = 0.62;
export const LM_SEEP_STEPS = 3;
/* How fast a cell eases to its new value. Breaking a block changes the light
   over a whole region at once, and a hard cut there reads as a glitch; this is
   fast enough that it still feels caused by the drill. */
export const LM_SMOOTH = asExpRate(11);

/* What a cell the lamp never reaches is multiplied by. Not zero: at zero the
   unopened rock is a black rectangle with no shape in it at all, and the
   player loses the ability to read the band they are digging through. */
/* Two per cent, not four, and the difference is not subtle: this multiplies
   the light three has ALREADY computed, and the lamp is a point light at
   intensity 44. Four per cent of that reads as mid-grey rock a few cells from
   the ship, which is how "unreachable" came out looking like "slightly dim".
   Anything reachable is carried by the bounce above; this is only what a cell
   with no path to it at all keeps, and it wants to be nearly nothing. */
export const LM_FLOOR_DEEP = 0.02;
/* Where daylight stops and the lamp is all there is, in metres. Read from the
   CELL's depth rather than the ship's, so the top of a shaft still glows when
   you are twenty metres below it. */
export const LM_DARK_START = 2;
export const LM_DARK_RAMP = 12;

/* The pool, evaluated per pixel from the ship's exact position rather than
   from its cell - which is what stops the light stepping as you fly.

   Cubed, so it holds near full brightness across most of the radius and then
   ends: that reads as a lamp with a reach, where a linear ramp reads as a
   picture with a gradient over it. The radius is the Scanner's, so the upgrade
   buys reach in the propagated light as well as in the point light. */
/* Playtest: *"I like how you have this part set up but would like it to fade
   more gradually and see further forward, rather than just an even circle
   around the ship."*

   Cubed was a lamp with a hard edge, which was right when the pool was the
   only thing describing reach. It is not any more - the flood and the shadow
   fan do that - so this can go back to being a falloff rather than a boundary. */
export const LM_POOL_POW = 1.6;
/* How much further the light reaches AHEAD than to the side, as a fraction of
   the radius. 0.85 makes the lit area an egg pointing the way the drill points
   rather than a circle with a bright half. */
export const LM_FORWARD = 0.85;
export const LM_RANGE_MULT = 1.1;
/* Headroom so the middle of the pool saturates instead of asymptoting. */
export const LM_GAIN = 1.15;

/* The curve the whole multiplier is put through before it is applied, and the
   reason it exists is gamma.

   `coreReach` is a linear fraction of the lamp, and it multiplies light that
   is still linear - but what the player sees is that number sRGB-encoded,
   which lifts the dark end enormously. Six per cent of the lamp is not six per
   cent of a pixel: it comes out at roughly a third of full brightness, which
   is why an early version of this looked like a grey wash over everything even
   though the field underneath it was correct.

   Squaring it puts the falloff back where the eye expects. Not a fudge - the
   alternative is to keep every constant here honest and then hand the result
   to a display that disagrees. */
export const LM_CONTRAST = 2.0;

/* Glow - emissive rock, ore crystals and their haloes - is dimmed by the light
   field too, but on a much gentler curve than a surface.

   Ore glowing through unlit rock is the find-the-vein mechanic and must not be
   switched off. But at full strength it was the loudest thing on screen at any
   depth, so a vein five cells inside the mass read as clearly as one you were
   about to break into - which is the "you shouldn't be able to see the mineral
   type" half of the same playtest note.

   The square root keeps a vein one or two cells in bright and pushes a distant
   one down to a smudge; the floor is what stops it vanishing entirely. */
export const LM_GLOW_FLOOR = 0.04;
export const LM_GLOW_POW = 0.7;

/* These two are the dial if ore becomes hard to FIND rather than merely hard
   to see through rock. Raising the floor brings distant veins back; lowering
   the exponent brings back the middle distance. A vein one or two cells in
   still sits around 0.4 to 0.6 at these values, which is what the mechanic
   actually needs - the rest was decoration that happened to be the loudest
   thing on screen. */

/* ---------- the lamp as a direction, and its shadows ----------

   Playtest: *"I want the light to be coming from the front of the ship, so if
   I am facing down, the whole tunnel down is lit up but dims behind me. I also
   want sharp shadows to show for crossing tunnels."*

   Two separate things, and they are separate in the shader too. The lobe below
   is about where the lamp POINTS. The shadow map in light.ts is about what is
   in the way. */

/* The bounce.

   Direct light is the beam: pointed, and stopped dead by anything in the way.
   On its own that is unplayable - the shaft behind you is the way home, and a
   game that erases the way home is punishing rather than atmospheric. So there
   is a second, omnidirectional, unshadowed term at this fraction of the beam,
   standing in for light bouncing off the tunnel around you.

   The two are combined with max(), not multiplied. Multiplying is what the
   first attempt did, and a cell that was both behind the ship and in shadow
   came out at the product of two floors - four per cent of four per cent -
   which is black. Whichever of "the beam reaches here" and "some light bounces
   here" is larger is the honest answer.

   Crucially it is still multiplied by the flood, so this brightens tunnels you
   have opened and never the solid rock you have not. */
export const LM_INDIRECT = 0.22;
/* The bounce gets its own reach, longer than the beam's and with a much
   gentler curve.

   Playtest: *"I want light behind the ship to have more of an ambient glow
   rather than that sharp beam look from the front. I also want it to extend
   back a little further and fade out more gradually."* Sharing the beam's pool
   meant the glow behind the ship ended exactly where the beam did, with the
   same hard edge - which is the one thing it must not do, because the whole
   job of the bounce is to be the soft part. */
/* The air in a tunnel keeps far more ambient light than a rock face does, and
   the two are deliberately different numbers.

   Playtest: *"tunnels behind the ship should get light that is dispersed ... as
   the light from the front of the ship passes a branching tunnel, it should
   cast a shadow ... but the tunnel still has ambient light."* A tunnel is a
   space full of dust with light bouncing around in it from every wall; a rock
   face is a surface, and a surface the beam is not on is simply dark. Sharing
   one bounce figure between them made every branch read as a hole. */
export const LM_AIR_AMBIENT = 0.62;
export const LM_BOUNCE_RANGE = 1.7;   /* multiple of the beam's reach */
export const LM_BOUNCE_POW = 1.25;    /* against the beam's 3: a long fade */
/* How tightly the beam narrows to the front. Higher is a spotlight, lower is a
   bare bulb with a reflector behind it. */
export const LM_FOCUS = 1.7;
/* Within this many cells the lamp is omnidirectional, because a real lamp
   lights its own surroundings whichever way it is aimed - and because the ship
   would otherwise sit in a hard-edged half-disc of its own shadow. */
export const LM_OMNI_NEAR = 0.7;
export const LM_OMNI_FAR = 2.8;

/* How far the shadow edge is smeared, in cells. Small on purpose - Gideon
   asked for sharp - but not zero, or the edge aliases into stair steps as the
   ship moves. */
export const LM_SHADOW_SOFT = 0.07;
/* Rays in the shadow fan. 512 over a full turn is one ray every 0.7 degrees,
   which at the far edge of the biggest lamp in the game is about a third of a
   cell - finer than the shadow needs to be, and still only a few thousand grid
   steps a frame. */
export const LM_RAYS = 512;

/* Light in the air of an open tunnel - see the haze in lightmap.ts. Warm,
   because the lamp is, and weak: this is the glow around a light source in
   dusty air, and the moment it reads as a solid colour the tunnel stops
   looking empty and starts looking filled in. */
export const LM_HAZE = 0.52;
export const LM_HAZE_COLOR = 0xffb46a;
/* How far the glow in a tunnel spills onto the rock at its edge. Zero.

   It was 0.5, to stop wall bulges reading as unlit rock inside a glowing
   shaft. That was the wrong fix for that problem - moving the haze quad in
   FRONT of the terrain solved it properly a version later - and it caused a
   worse one: every rock cell touching open air took half the tunnel's glow as
   an additive wash, so a warm circle bled out over the rock faces around the
   ship and softened the very shadow edges the ray fan exists to draw.

   Gideon: *"it looks the tunnel light is still showing in a circle around the
   ship and shows on the face of the rocks, making the sharp shadows not quite
   look right."*

   Kept as a constant rather than deleted because it is exactly the dial to
   reach for if a wall bulge ever reads as a hole in the glow again. The half
   texel of bilinear softening at an open/solid boundary is doing that job on
   its own now. */
export const LM_HAZE_SPILL = 0;

/* ---------- the vignette ----------
   How much of the frame stays clear, and how black the edge goes. Deep, the
   clear area is not much more than the lamp's pool and the corners are close
   to solid - which is what makes the tight framing read as "this is as far as
   the light reaches" rather than as "the camera is too close". */
export const VIGNETTE_CLEAR_SURFACE = 44;   /* per cent of the radius */
export const VIGNETTE_CLEAR_DEEP = 14;
export const VIGNETTE_EDGE_SURFACE = 0.55;  /* alpha at the corners */
export const VIGNETTE_EDGE_DEEP = 0.97;

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

/* ---------- power cells ----------

   One shared meter for every piece of ordnance. It trickles back underground
   and fills at the pad, which is deliberately both: the trickle means a long
   descent is never completely without an answer, and the refill gives the pad
   a reason to exist beyond selling.

   Four is small on purpose. A meter you can spend twice is a decision; a meter
   you can spend eight times is a second drill. */
export const CHARGE_MAX = 4;
export const CHARGE_SECONDS = 42;   /* seconds underground per point */

export function chargeAfter(charge: number, dt: number, atPad: boolean, bonus = 0): number {
  const cap = CHARGE_MAX + bonus;
  if (atPad) return cap;
  return Math.min(cap, charge + dt / CHARGE_SECONDS);
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
