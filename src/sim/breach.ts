/* The breach - the ninety seconds after a core comes apart.

   Breaking a core was the most cinematic beat in the game and it was a modal
   dialog with a button on it. You destroyed a world and the game asked you
   where you would like to go next.

   Now the world starts coming apart from the bottom and you have to climb out
   of it. The chart opens when you reach the pad, not when the core breaks.

   Three rules, and the third is the one that keeps it fair:

   1. **The clock is the world, not a number.** The rules here expose how far
      the collapse has risen; the presentation draws that as the shaft filling
      from below. `CRAFT.md`: make failure a shape.
   2. **The route you cut is the route that closes.** Collapse propagates
      upward through dug cells, so a long clever tunnel is a long way home.
   3. **It can cost you the hold, never the run.** Miss the clock and you are
      towed for the usual cut and the world still breaks. There is no state
      here that can strand a save, and the collapse still runs through
      planCollapse(), which reverts any set that would seal the ship in. */

import { coreDepth } from './config';

/* Ninety seconds. Leg 0's core is at 58 m and a stock ship climbs at 3 m/s, so
   the bare climb is twenty seconds - the other seventy are for the drilling,
   the wrong turns and the two mistakes you are allowed. It is the number most
   likely to be wrong and it is one constant. */
/* Scaled to the world rather than fixed at ninety seconds.

   Ninety was measured against a 58-metre planet: climb out in about forty
   seconds and half the clock is left for mistakes. Against 452 metres the
   climb alone is 151 seconds and the clock was a formality you could not beat
   from the bottom.

   Expressed as the climb plus the same margin it always had, so the rule -
   under half of it goes on getting out - survives the world changing size. */
export const BREACH_SECONDS = 340;

/* Tremors every six to nine seconds instead of every twenty-seven. Frequency
   teaches and severity punishes (`CRAFT.md`), and this is the one moment in
   the game that is allowed to do both at once, because it is ninety seconds
   long and it ends with you either out or towed. */
export const BREACH_TREMOR_EVERY = 6;
export const BREACH_TREMOR_JITTER = 3;

export interface BreachState {
  t: number;           /* seconds elapsed */
  dur: number;         /* seconds allowed */
  from: number;        /* the depth the collapse started at */
  next: number;        /* seconds until the next tremor */
  done: boolean;       /* reached the pad */
  failed: boolean;     /* ran out of clock */
}

export function newBreach(leg: number): BreachState {
  return {
    t: 0, dur: BREACH_SECONDS, from: coreDepth(leg),
    next: 2.5, done: false, failed: false
  };
}

/* How far up the world has already come apart, in metres. Linear in the clock
   and anchored at the core, so at t = dur the collapse has reached the
   surface - which is what makes the clock legible without a number on it: the
   thing rising behind you IS the timer. */
export function collapseDepth(b: BreachState): number {
  const u = Math.min(1, b.t / b.dur);
  return Math.round(b.from * (1 - u));
}

/* 0 at the core, 1 at the surface. The presentation grades the world on this:
   ember ambient, the lamp cutting to emergency red, dust thickening. One
   number driving one grade, rather than five effects each with their own
   curve. */
export function breachHeat(b: BreachState): number {
  return Math.min(1, b.t / b.dur);
}

/* Advance the clock. Returns whether a tremor should fire on this tick, which
   the caller turns into a real collapse - this module never touches the world.

   `atSurface` ends it in the caller's terms rather than by reading a position
   out of some other module, which keeps this pure and keeps the definition of
   "home" in one place. */
export function stepBreach(b: BreachState, dt: number, atSurface: boolean): { tremor: boolean } {
  if (b.done || b.failed) return { tremor: false };
  if (atSurface) { b.done = true; return { tremor: false } }
  b.t += dt;
  if (b.t >= b.dur) { b.failed = true; return { tremor: false }; }
  b.next -= dt;
  if (b.next > 0) return { tremor: false };
  /* Deterministic spacing with a seeded wobble supplied by the caller is
     overkill here: the gap is short enough that the rhythm is what is felt,
     and a fixed cadence with a small step is reproducible by construction. */
  b.next = BREACH_TREMOR_EVERY + (b.t % BREACH_TREMOR_JITTER);
  return { tremor: true };
}

/* Anything at or below the collapse front is gone. The caller uses this to
   decide which of the ship's own tunnels have closed behind it. */
export function swallowed(b: BreachState, d: number): boolean {
  return d >= collapseDepth(b);
}
