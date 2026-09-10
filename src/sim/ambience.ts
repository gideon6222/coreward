import type { Trait } from '../types';

/* What a world DOES, as opposed to what colour it is.

   The palettes gave every planet its own rock, fog and air, and that carries
   identity from the surface down - but a palette is a still image. Two worlds
   painted differently still behave identically, and the traits that were
   supposed to make them behave differently are mostly buried in generation
   rates the player never sees directly: a Volatile world has more gas pockets,
   which you learn by hitting one.

   This is the trait made visible in the air. Each world emits something of its
   own, continuously, in the space the player is flying through:

     volatile     gas venting out of the rock, sour green
     searing      embers rising from the deep, and more of them the deeper you go
     crystalline  cold glints catching the lamp
     hollow       grit falling through the empty space above you
     stable       nothing at all, which is what makes it the control

   Stable emitting nothing is deliberate and is the reason the others read.
   `CRAFT.md`: a level-zero effect that already does something means the first
   real one buys nothing you did not have - the same argument applies to a
   baseline you are meant to measure the others against.

   THE TIMING IS PURE and lives here; the particles are the frame loop's job.
   That split is the same one the whole codebase uses, and it is what lets a
   test assert that a Searing world emits more at depth than at the surface
   without standing up a renderer. It also sidesteps the trap the notes call
   out: the preview browser stops requestAnimationFrame when hidden, so
   anything on a timer has to be testable through a reducer rather than by
   watching it. */

export interface Emission {
  /* offset from the ship, in cells */
  dx: number; dy: number;
  color: number;
  count: number;
  power: number;
  life: number;
}

/* Accumulated time-to-next-emission. Carried by the caller so this module
   holds no state of its own and a test can drive it deterministically. */
export interface AmbState { t: number; }

export const newAmbState = (): AmbState => ({ t: 0 });

/* Seconds between emissions for each trait at the surface, and how much faster
   that gets at depth. A rate rather than a per-frame chance, so the effect does
   not thin out when the frame rate drops - which is exactly when the player is
   deepest and the air is meant to be thickest. */
const RATE: Record<string, { every: number; deepen: number }> = {
  volatile: { every: 1.15, deepen: 0.55 },
  searing: { every: 0.85, deepen: 0.30 },
  crystalline: { every: 1.40, deepen: 0.70 },
  hollow: { every: 1.00, deepen: 0.80 },
  stable: { every: 0, deepen: 0 }
};

/* Where a world's emission comes from and what it looks like. `r` is a random
   in 0..1 supplied by the caller, so the whole function stays pure and a test
   can pin a value rather than run it a thousand times and hope. */
function shapeFor(trait: string, depth: number, r1: number, r2: number): Emission | null {
  switch (trait) {
    case 'volatile':
      /* Out of the walls, either side, at about the ship's own level. A hazard
         colour deliberately close to the gas pocket's, because it is the same
         stuff - the world is telling you what it is full of. */
      return { dx: (r1 < 0.5 ? -1 : 1) * (2.5 + r2 * 3), dy: (r1 - 0.5) * 5,
               color: 0xb8e04a, count: 5, power: 1.4, life: 1.5 };
    case 'searing':
      /* Rising from BELOW, always, so the deep reads as the source. */
      return { dx: (r1 - 0.5) * 9, dy: -4 - r2 * 4,
               color: 0xff6a18, count: 3, power: 2.2, life: 2.2 };
    case 'crystalline':
      return { dx: (r1 - 0.5) * 9, dy: (r2 - 0.5) * 8,
               color: 0x9ffcff, count: 2, power: 0.8, life: 1.1 };
    case 'hollow':
      /* Falling from above: grit off a ceiling you cannot see. */
      return { dx: (r1 - 0.5) * 9, dy: 4 + r2 * 4,
               color: 0xa89880, count: 3, power: 0.5, life: 1.8 };
    default:
      return null;
  }
}

/* Advance the clock and return what to emit, if anything.

   Returns at most one emission per call on purpose. A frame that has been
   stalled for a second should not dump a second's worth of particles into one
   frame - the effect is ambience, and ambience that arrives in clumps reads as
   a bug in the renderer rather than as weather. */
export function ambienceTick(
  st: AmbState, trait: Trait, depth: number, dt: number, r1: number, r2: number
): Emission | null {
  const rate = RATE[trait.id];
  if (!rate || rate.every <= 0) return null;
  /* Nothing at the surface on any world: this is what the air underground is
     like, and the pad is not underground. */
  if (depth < 3) { st.t = 0; return null; }

  st.t += dt;
  /* Deeper is more often, bottoming out at `deepen` of the surface interval so
     a very deep world cannot emit every frame. */
  const f = Math.max(rate.deepen, 1 - depth / 260 * (1 - rate.deepen));
  const every = rate.every * f;
  if (st.t < every) return null;
  st.t = 0;
  return shapeFor(trait.id, depth, r1, r2);
}
