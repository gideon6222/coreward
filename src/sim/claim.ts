/* The Claim - the second thing you can lose.

   Every pressure in this game points at the ship. Fuel, heat, hull and tremors
   are all answered by the same reflex, which is to fly up, and the worst thing
   that can happen is a tow that costs a slice of one haul. That is why "it
   feels free" survived a reprice: the price was never the problem, the absence
   of a second thing to lose was.

   So there is a claim on the surface - a refinery, a fuel derrick and a store
   shed standing beside the pad - and cutting the world apart shakes the ground
   it is standing on. You cannot fly it to safety. It is the system your depth
   endangers while you are not touching it, which is the mechanism the best game
   in this genre uses to stop mining being a treadmill.

   Three rules hold the whole design together:

   1. **Your own digging causes it.** Not time spent, not depth reached - cells
      removed below the stability line. Heat already charges for dwelling, and
      two systems charging for the same verb is one system with extra steps.
   2. **A quake is spent, not survived.** It damages the structures AND leaves
      the world richer, because the world is being broken open and that is worth
      something. Depth has to be a bet. Pure downside would just make going
      deeper worse, which is the thing this is trying to fix.
   3. **Damage is a discount, never a wall.** A damaged refinery pays less, a
      damaged derrick refuels slower, a damaged shed loses some of what is in
      it. None of them can end a run and none of them can make a save
      unwinnable. `CRAFT.md`: never let a hazard take the run. */

import { ORES, coreDepth } from './config';
import { rnd } from './util';
import type { Cargo } from '../types';

/* ---------- where the world starts to give ---------- */

/* A fraction of the world's own core depth rather than a fixed metre, so this
   moves with the ladder and with M5's per-leg thresholds instead of having to
   be re-tuned beside them. 0.45 puts leg 0's line at 50 m: shallower than the
   heat line at 70, because the Claim has to be MET before it can be a
   pressure, and the measured play never went past 78 m. */
export const STABILITY_FRACTION = 0.45;

export function stabilityLine(core: number): number {
  return Math.round(core * STABILITY_FRACTION);
}

/* What repairs the refinery is the shallowest ore that only exists BELOW the
   line, derived rather than named, so it stays true when the depths move.
   `CRAFT.md`: gate an upgrade behind a place, not a price - the thing that
   fixes the surface is only found in the place that breaks it.

   ORES is ordered deepest-first, so this walks from the shallow end. */
export function repairOre(core: number): string {
  const line = stabilityLine(core);
  for (let i = ORES.length - 1; i >= 0; i--) if (ORES[i].min >= line) return ORES[i].id;
  return ORES[0].id;
}

/* ---------- the numbers ---------- */

export const STRAIN_PER_CELL = 0.004;   /* at the line itself */
export const STRAIN_AT_CORE = 2.0;      /* multiplier by the time you reach the core */
export const QUAKE_AT = 1;              /* strain fires a quake here */
export const STRAIN_AFTER = 0.35;       /* and drops back to here, not to zero */
export const RICH_PER_QUAKE = 0.04;     /* a shaken world pays 4% more */

export const DAMAGE_MIN = 12;
export const DAMAGE_MAX = 30;
/* Exposure per structure. The derrick is a tower and takes the most, the shed
   is low and squat and takes the least. This is the only asymmetry between
   them and it is what makes repairing in an order a decision. */
export const EXPOSURE = { refinery: 1.0, derrick: 1.25, shed: 0.75 };

export const PAYOUT_PENALTY = 0.35;     /* a wrecked refinery pays 65% */
export const REFUEL_PENALTY = 0.4;      /* a wrecked derrick refuels at 60% */
export const SHED_MULT = 1.4;           /* stored ore is worth this at the breach */
export const SHED_LOSS = 0.2;           /* a wrecked shed loses this much per quake */

export const REPAIR_CREDITS = 900;
export const REPAIR_UNITS = 4;

/* ---------- state ---------- */

export type Structure = 'refinery' | 'derrick' | 'shed';

export interface ClaimState {
  strain: number;
  refinery: number;
  derrick: number;
  shed: number;
  stored: Cargo;
  quakes: number;
}

export function newClaim(): ClaimState {
  return { strain: 0, refinery: 100, derrick: 100, shed: 100, stored: {}, quakes: 0 };
}

/* A save from before the Claim existed has none, and a world entered before it
   existed must not suddenly be half-wrecked. Both start intact. */
export function loadClaim(raw: unknown): ClaimState {
  const c = newClaim();
  if (!raw || typeof raw !== 'object') return c;
  const s = raw as Partial<ClaimState>;
  if (typeof s.strain === 'number') c.strain = clamp01(s.strain);
  for (const k of ['refinery', 'derrick', 'shed'] as Structure[]) {
    if (typeof s[k] === 'number') c[k] = Math.max(0, Math.min(100, s[k] as number));
  }
  if (s.stored && typeof s.stored === 'object') c.stored = { ...s.stored };
  if (typeof s.quakes === 'number') c.quakes = s.quakes;
  return c;
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ---------- strain ---------- */

/* Zero above the line, and rising with how far below it the cell was, to
   STRAIN_AT_CORE times the base at the core itself. Linear, because the player
   has to be able to feel the relationship: twice as deep, twice the shake. */
export function strainPerCell(d: number, core: number): number {
  const line = stabilityLine(core);
  if (d <= line) return 0;
  const span = Math.max(1, core - line);
  const f = Math.min(1, (d - line) / span);
  return STRAIN_PER_CELL * (1 + f * (STRAIN_AT_CORE - 1));
}

/* Returns the new strain and whether that cell was the one that set it off.
   Pure, so the golden can walk a whole world through it. */
export function afterCell(strain: number, d: number, core: number): { strain: number; quake: boolean } {
  const next = strain + strainPerCell(d, core);
  if (next < QUAKE_AT) return { strain: next, quake: false };
  return { strain: STRAIN_AFTER, quake: true };
}

/* ---------- quakes ---------- */

/* Seeded on its own offset. `CLAUDE.md`'s first invariant: anything new that
   generates content must roll on its own seed offset, or it consumes a roll
   that ore generation was using and every value at every depth shifts. 77, 41,
   91 and 137 are taken; this is 173. */
export const QUAKE_SEED = 173;

export function quakeDamage(planet: number, quakeIndex: number): Record<Structure, number> {
  const out = {} as Record<Structure, number>;
  let i = 0;
  for (const k of ['refinery', 'derrick', 'shed'] as Structure[]) {
    const r = rnd(quakeIndex * 7 + i++, quakeIndex * 31, planet + QUAKE_SEED);
    out[k] = Math.round((DAMAGE_MIN + r * (DAMAGE_MAX - DAMAGE_MIN)) * EXPOSURE[k]);
  }
  return out;
}

/* Apply one quake in place and report what it did, so the presentation layer
   can shake the right things without recomputing any of it. */
export function applyQuake(c: ClaimState, planet: number): { damage: Record<Structure, number>; shedLost: number } {
  const damage = quakeDamage(planet, c.quakes);
  for (const k of ['refinery', 'derrick', 'shed'] as Structure[]) {
    c[k] = Math.max(0, c[k] - damage[k]);
  }
  /* The shed spills in proportion to how wrecked it already is, so the first
     quake costs almost nothing stored and the fourth costs a lot. */
  const lost = SHED_LOSS * (1 - c.shed / 100);
  let shedLost = 0;
  if (lost > 0) {
    for (const k in c.stored) {
      const drop = Math.floor(c.stored[k] * lost);
      if (drop > 0) { c.stored[k] -= drop; shedLost += drop; }
      if (c.stored[k] <= 0) delete c.stored[k];
    }
  }
  c.quakes++;
  return { damage, shedLost };
}

/* ---------- what damage costs ---------- */

export function payoutMult(c: ClaimState): number {
  return 1 - PAYOUT_PENALTY * (1 - c.refinery / 100);
}

export function refuelMult(c: ClaimState): number {
  return 1 - REFUEL_PENALTY * (1 - c.derrick / 100);
}

/* ---------- repair ---------- */

export function repairCost(c: ClaimState, which: Structure): { credits: number; units: number } {
  const missing = (100 - c[which]) / 100;
  return {
    credits: Math.round(REPAIR_CREDITS * missing),
    units: Math.max(1, Math.round(REPAIR_UNITS * missing))
  };
}

/* Returns true if it happened. The caller owns the wallet and the stock; this
   only ever reports what a repair would take and puts the structure back. */
export function repaired(c: ClaimState, which: Structure): void {
  c[which] = 100;
}
