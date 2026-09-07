import { HULL_MAX, SAVE_KEY, OLD_KEY, START_X, UPGRADES, matTotalFor } from './config';
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
  cargo: Cargo; weight: number;
  /* Minerals banked at the pad, spent on upgrades alongside credits. Counts
     only - the credits for the same ore were already paid on the same sale. */
  stock: Cargo;
  /* Ore dug with a full hold, left at the cell it came from. Keyed by cell,
     so a cell can only ever hold one - which it can, because breaking a block
     empties the cell it was in. */
  drops: Drops;
  best: Best;
  mode: Mode;
} = {
  planet: 0, credits: 0, shards: 0,
  up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 },
  kit: { coolant: 0, patch: 0, cell: 0 },
  dug: new Set<string>(),
  rubble: new Set<string>(),
  px: START_X, pd: -1,
  face: 'down',
  fuel: 90, hull: HULL_MAX, soak: 0,
  cargo: {}, weight: 0, stock: {}, drops: {},
  best: { depth: 0, haul: 0 },
  mode: 'play'
};

export const S = {
  drill: () => (1 + g.up.drill * 0.95) * (1 + g.shards * 0.08),
  cargoCap: () => 60 + g.up.cargo * 45,
  speed: () => 3.0 + g.up.thrust * 0.7,
  fuelCap: () => 90 + g.up.tank * 40,
  /* capped below 1 on purpose - a fully upgraded rig buys time, it does
     not make deep water safe. See the soak note in feel.ts. */
  shield: () => Math.min(0.72, g.up.cool * 0.09),
  light: () => 8 + g.up.scan * 2.4,
  towCut: () => Math.max(0.1, 0.5 - g.up.tow * 0.05),
  autoRate: () => (g.up.auto === 0 ? 0 : 0.55 - (g.up.auto - 1) * 0.075)
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
      drops: g.drops
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
