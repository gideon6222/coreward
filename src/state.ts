import { HULL_MAX, SAVE_KEY, OLD_KEY, START_X, UPGRADES, matTotalFor,
         bombRadius, laserRange } from './config';
import { CHARGE_MAX } from './feel';
import type { Best, Cargo, Dir, Drops, Kit, Mode, UpgradeKey, SaveV1, SaveV2 } from './types';

/* The whole game state. One mutable singleton, read by nearly every module. */
export const g: {
  planet: number; credits: number; shards: number;
  up: Record<UpgradeKey, number>;
  kit: Kit;
  dug: Set<string>;
  /* Cells a tremor filled back in. They read as rubble rather than as what was
     originally generated there, which is what stops a collapse from being an
     ore respawn. `dug` takes precedence, so clearing one needs no cleanup. */
  rubble: Set<string>;
  px: number; pd: number;
  face: Dir;
  fuel: number; hull: number; soak: number;
  /* the shared ordnance meter; see chargeAfter in feel.ts */
  charge: number;
  cargo: Cargo; weight: number;
  /* Minerals banked at the pad, spent on upgrades alongside credits. Counts
     only - the credits for the same ore were already paid on the same sale. */
  stock: Cargo;
  /* Relic PERKS collected, across every planet ever visited. The one list in
     the save that only ever grows. */
  relics: string[];
  /* Which planets have had their relic taken.

     Tracked separately from `relics`, and that separation is load-bearing:
     past the named eight every planet grants the same stacking charter, so
     asking "do I already have this perk" would have answered yes for every
     planet from the ninth onward and quietly stopped generating relics for the
     rest of the game. The perk is what you own; this is what you have done. */
  relicsTaken: number[];
  /* Ore dug with a full hold, left at the cell it came from. Keyed by cell,
     so a cell can only ever hold one - which it can, because breaking a block
     empties the cell it was in. */
  drops: Drops;
  best: Best;
  mode: Mode;
} = {
  planet: 0, credits: 0, shards: 0,
  up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0, bomb: 0, laser: 0 },
  kit: { coolant: 0, patch: 0, cell: 0 },
  dug: new Set<string>(),
  rubble: new Set<string>(),
  px: START_X, pd: -1,
  face: 'down',
  fuel: 90, hull: HULL_MAX, soak: 0, charge: CHARGE_MAX,
  cargo: {}, weight: 0, stock: {}, drops: {}, relics: [], relicsTaken: [],
  best: { depth: 0, haul: 0 },
  mode: 'play'
};

/* Whether a relic perk has been collected. Relics past the named eight all
   grant the same stacking charter, so this counts rather than tests. */
export const relic = (id: string) => g.relics.includes(id);
export const relicCount = (id: string) => g.relics.filter((r) => r === id).length;

export const S = {
  drill: () => (1 + g.up.drill * 0.95) * (1 + g.shards * 0.08) * (relic('drum') ? 1.1 : 1),
  cargoCap: () => Math.round((60 + g.up.cargo * 45) * (relic('weave') ? 1.15 : 1)),
  speed: () => 3.0 + g.up.thrust * 0.7,
  fuelCap: () => 90 + g.up.tank * 40,
  /* the multipliers relics add, read by the frame loop and by feel.ts */
  fuelUse: () => (relic('recyc') ? 0.85 : 1),
  heatTake: () => (relic('lattice') ? 0.85 : 1),
  gasTake: () => (relic('damper') ? 0.67 : 1),
  powerCap: () => (relic('coupler') ? 1 : 0),
  saleBonus: () => 1 + relicCount('assay') * 0.04,
  /* capped below 1 on purpose - a fully upgraded rig buys time, it does
     not make deep water safe. See the soak note in feel.ts. */
  shield: () => Math.min(0.72, g.up.cool * 0.09),
  light: () => 8 + g.up.scan * 2.4 + (relic('eye') ? 3 : 0),
  /* Rounded before clamping. 0.5 - 8*0.05 is 0.09999999999999998 in binary
     floating point, which showed up in the golden baseline as a cut of
     9.999999999999998% - true, useless, and the kind of diff that trains you
     to re-record without reading. */
  towCut: () => Math.max(0.05,
    Math.round((0.5 - g.up.tow * 0.05 - (relic('rights') ? 0.1 : 0)) * 1000) / 1000),
  autoRate: () => (g.up.auto === 0 ? 0 : 0.55 - (g.up.auto - 1) * 0.075),
  bombR: () => bombRadius(g.up.bomb),
  laserLen: () => laserRange(g.up.laser)
};

/* A save written before minerals existed has no stock, and its owner has
   already bought levels that would now have cost materials. Charging them
   retroactively would strand a mid-game save behind a wall it already passed,
   so grant exactly what those levels would have needed - nothing more, so the
   next level is still earned. */
export function grandfatherStock(): Cargo {
  const out: Cargo = {};
  for (const u of UPGRADES) {
    const owed = matTotalFor(u, g.up[u.key]);
    if (owed) out[u.mat] = (out[u.mat] || 0) + owed;
  }
  return out;
}

/* ============ save ============ */
export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      planet: g.planet, credits: g.credits, shards: g.shards, up: g.up,
      dug: Array.from(g.dug), cargo: g.cargo, weight: g.weight, px: g.px, pd: g.pd,
      kit: g.kit, stock: g.stock, rubble: Array.from(g.rubble), best: g.best,
      drops: g.drops, charge: g.charge, relics: g.relics, relicsTaken: g.relicsTaken
    }));
  } catch (e) { /* ignore */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      g.planet = s.planet || 0; g.credits = s.credits || 0; g.shards = s.shards || 0;
      Object.assign(g.up, s.up || {});
      Object.assign(g.kit, s.kit || {});
      Object.assign(g.best, s.best || {});
      g.dug = new Set(s.dug || []);
      g.rubble = new Set(s.rubble || []);
      g.drops = s.drops || {};
      if (typeof s.charge === 'number') g.charge = s.charge;
      g.relics = Array.isArray(s.relics) ? s.relics.slice() : [];
      g.relicsTaken = Array.isArray(s.relicsTaken) ? s.relicsTaken.slice() : [];
      g.cargo = s.cargo || {}; g.weight = s.weight || 0;
      g.stock = s.stock || grandfatherStock();
      if (typeof s.px === 'number') g.px = s.px;
      if (typeof s.pd === 'number') g.pd = s.pd;
      return;
    }
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return;
    const s = JSON.parse(old);
    g.planet = s.planet || 0;
    g.shards = s.shards || 0;
    g.credits = Math.round((s.credits || 0) * 4);
    g.dug = new Set(s.dug || []);
    const o = s.up || {};
    g.up.drill = o.drill || 0; g.up.cargo = o.cargo || 0; g.up.thrust = o.thrust || 0;
    g.up.tank = o.tank || 0; g.up.cool = o.cool || 0; g.up.scan = o.scan || 0;
    g.up.auto = Math.min(6, o.beacon || 0);
    g.stock = grandfatherStock();
    save();
  } catch (e) { /* corrupt save, start fresh */ }
}
