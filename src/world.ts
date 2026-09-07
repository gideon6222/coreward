import { W, START_X, ORES, DEF, baseRock, coreDepth, hardMult, valueMult,
         GEODE, GAS, RUBBLE, RUBBLE_HARD, TREMOR_SAFE_RADIUS,
         CAVE_MIN_DEPTH, caveChanceOn, gasChanceOn, geodeChanceOn } from './config';
import { key, mixHex } from './util';
import { g } from './state';
import type { Block } from './types';

export function rnd(x: number, y: number, p: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(p | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function blockAt(x: number, d: number): Block | null {
  if (d < 0 || x < 0 || x >= W) return null;
  if (g.dug.has(key(x, d))) return null;
  const cd = coreDepth(g.planet);
  if (d > cd) return { id: 'bedrock', name: 'Bedrock', color: 0x1a1820, hard: Infinity, wt: 0, value: 0, glow: 0.02 };
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, host: 0x4a3a20, hard: 26 * hardMult(g.planet), wt: 0, value: 0, glow: 0.9, shards: 8, tone: 10, ore: true, core: true };
  const hm = hardMult(g.planet);

  /* Checked before generation, and only after `dug`, so a cell you have
     re-cleared stays clear. Hardness rides on the band it sits in; weight and
     value are the flat DEF numbers, because haulValue() looks those up by id
     and cannot know what depth a given unit came from. */
  if (g.rubble.has(key(x, d))) {
    /* Coloured as broken pieces of whatever band it sits in rather than as one
       fixed grey. A neutral fill dropped into the scoria zone looked like
       sandstone boulders in a lava tube; half-blended it reads as the local
       rock, shattered - identifiable as fill without leaving the palette.
       Free: the pool is keyed by block id but the shade rides on the instance. */
    const band = baseRock(d);
    return { id: RUBBLE.id, name: RUBBLE.name, glow: RUBBLE.glow,
             color: mixHex(band.color, RUBBLE.color, 0.5),
             hard: band.hard * hm * RUBBLE_HARD, wt: RUBBLE.wt, value: RUBBLE.value, ore: false };
  }

  /* Caves, in 2x2 blobs so they read as open ground rather than confetti.
     Evaluated on a coarse grid and with its own seed offset, so adding them
     leaves every ore and rock roll exactly where it was. */
  if (d >= CAVE_MIN_DEPTH &&
      rnd(Math.floor(x / 2), Math.floor(d / 2), g.planet + 77) < caveChanceOn(d, g.planet)) {
    return null;
  }

  const r = rnd(x, d, g.planet);

  /* Pockets are checked before ore and on their own seed, so they are rare
     enough to be an event rather than a resource. Gas first: it is the one you
     do not want, and it should not be crowded out by a geode roll. */
  const pr = rnd(x + 313, d + 977, g.planet + 41);
  if (d >= GAS.min && pr < gasChanceOn(g.planet)) {
    return { id: GAS.id, name: GAS.name, color: GAS.color, host: GAS.host, glow: GAS.glow,
             shards: GAS.shards, tone: GAS.tone, hard: GAS.hard * hm, wt: GAS.wt,
             value: GAS.value, ore: true, hazard: true };
  }
  if (d >= GEODE.min && pr > 1 - geodeChanceOn(g.planet)) {
    return { id: GEODE.id, name: GEODE.name, color: GEODE.color, host: GEODE.host, glow: GEODE.glow,
             shards: GEODE.shards, tone: GEODE.tone, hard: GEODE.hard * hm, wt: GEODE.wt,
             value: GEODE.value, ore: true };
  }

  for (const o of ORES) {
    if (d >= o.min && r < o.chance) {
      return { id: o.id, name: o.name, color: o.color, host: o.host, glow: o.glow, shards: o.shards, tone: o.tone,
               hard: o.hard * hm, wt: o.wt, value: o.value, ore: true };
    }
  }
  const b = baseRock(d);
  return { id: b.id, name: b.name, color: b.color, glow: b.glow, hard: b.hard * hm, wt: b.wt, value: b.value, ore: false };
}

export const haulValue = () => {
  let v = 0;
  for (const k in g.cargo) v += g.cargo[k] * DEF[k].value;
  return Math.round(v * valueMult(g.planet));
};

/* ---------- collapse ----------

   Chooses which cells a tremor fills in, applies it, and guarantees the result
   is survivable. Lives here rather than in actions.ts because the guarantee is
   the whole design and it has to be testable without a renderer.

   The guarantee: after the collapse, `findRoute()` must still find open tunnel
   from the ship to the pad. If it cannot, the entire collapse is reverted and
   the tremor is spent as noise. A tremor takes time, fuel and patience. It
   must never take the run.

   Candidates are dug cells ABOVE the ship and outside the safe radius. Above,
   because what a collapse threatens is the way out; filling in dead ends below
   you would be a light show rather than a mechanic. */
export function planCollapse(want: number, rand: () => number = Math.random): string[] {
  const sx = Math.round(g.px), sd = Math.round(g.pd);
  const pool: string[] = [];
  for (const k of g.dug) {
    const c = k.split(',');
    const x = +c[0], d = +c[1];
    if (d < 0 || d > sd - 1) continue;
    if (Math.abs(x - sx) + Math.abs(d - sd) < TREMOR_SAFE_RADIUS) continue;
    pool.push(k);
  }
  if (!pool.length) return [];

  /* Shuffled so a tremor does not always eat the same end of the tunnel.
     Fisher-Yates rather than sort(() => rand() - 0.5), which is not a shuffle
     and is biased toward leaving the array roughly where it started. */
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }

  const taken = pool.slice(0, want);
  for (const k of taken) { g.rubble.add(k); g.dug.delete(k); }

  if (!findRoute()) {
    for (const k of taken) { g.rubble.delete(k); g.dug.add(k); }
    return [];
  }
  return taken;
}

/* shortest route home through already dug tunnels, breadth first */
export function findRoute() {
  const sx = Math.round(g.px), sd = Math.round(g.pd);
  const goal = key(START_X, -1);
  const start = key(sx, sd);
  if (start === goal) return null;
  const prev = new Map();
  const seen = new Set([start]);
  let queue = [[sx, sd]];
  let found = false;
  let guard = 0;
  while (queue.length && !found && guard < 40000) {
    const next = [];
    for (const cell of queue) {
      const cx = cell[0], cd = cell[1];
      const around = [[cx, cd - 1], [cx - 1, cd], [cx + 1, cd], [cx, cd + 1]];
      for (const n of around) {
        guard++;
        const nx = n[0], nd = n[1];
        if (nx < 0 || nx >= W || nd < -3 || nd > coreDepth(g.planet)) continue;
        const k = key(nx, nd);
        if (seen.has(k)) continue;
        if (blockAt(nx, nd)) continue;
        seen.add(k);
        prev.set(k, cell);
        if (k === goal) { found = true; break; }
        next.push(n);
      }
      if (found) break;
    }
    queue = next;
  }
  if (!found) return null;
  const route = [];
  let cur = [START_X, -1];
  while (cur) {
    route.push(cur);
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) break;
    cur = p;
  }
  route.reverse();
  return route.length > 1 ? route : null;
}
