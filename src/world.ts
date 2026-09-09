import { W, START_X, ORES, DEF, baseRock, coreDepth, hardMult, valueMult,
         GEODE, GAS, CACHE, RUBBLE, RUBBLE_HARD, SEAM, SEAM_CHANCE, TREMOR_SAFE_RADIUS,
         RELIC_COLOR, RELIC_HOST, relicAt, relicFor,
         CAVE_MIN_DEPTH, caveChanceOn, gasChanceOn, geodeChanceOn } from './config';
import { key, mixHex } from './util';
import { g , coreM, valueM, worldTrait} from './state';
import { partAt, partFor, partName, PART_COLOR, PART_HOST } from './drive';
import type { Block, SupplyKey } from './types';

export function rnd(x: number, y: number, p: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(p | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function blockAt(x: number, d: number): Block | null {
  if (d < 0 || x < 0 || x >= W) return null;
  if (g.dug.has(key(x, d))) return null;
  const cd = coreM();
  if (d > cd) return { id: 'bedrock', name: 'Bedrock', color: 0x1a1820, hard: Infinity, wt: 0, value: 0, glow: 0.02 };
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, host: 0x4a3a20, hard: 26 * hardMult(g.planet), wt: 0, value: 0, glow: 0.9, shards: 8, tone: 10, ore: true, core: true };
  const hm = hardMult(g.planet);

  /* The relic, before anything that could hide it. It is one cell on the whole
     planet and it must not lose a coin flip to a cave. */
  const rl = relicAt(g.planet, g.coreOff);
  if (x === rl.x && d === rl.d && !g.relicsTaken.includes(g.planet)) {
    return { id: 'relic', name: relicFor(g.planet).name, color: RELIC_COLOR, host: RELIC_HOST,
             glow: 0.95, shards: 9, tone: 10, hard: 9 * hm, wt: 0, value: 0,
             ore: true, relic: true };
  }

  /* The Jump Drive component, on the same footing as the relic and for the
     same reason: it is one cell on the whole planet, so nothing is allowed to
     overwrite it. Deeper than the relic, and only on a world whose trait holds
     one - see drive.ts.

     No roll of its own because it needs none: the position is a hash of the
     leg, not a sample of the world's noise, so it consumes nothing from the
     ore stream. That is the trap CLAUDE.md warns about, avoided by not rolling
     at all rather than by rolling carefully. */
  const pid = partFor(g.trait);
  if (pid && !g.drive.includes(pid)) {
    const pa = partAt(g.planet, g.coreOff);
    if (x === pa.x && d === pa.d) {
      return { id: 'part', name: partName(pid), color: PART_COLOR, host: PART_HOST,
               glow: 1.0, shards: 10, tone: 10, hard: 13 * hm, wt: 0, value: 0,
               ore: true, part: true };
    }
  }


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
      rnd(Math.floor(x / 2), Math.floor(d / 2), g.planet + 77) < caveChanceOn(d, worldTrait())) {
    return null;
  }

  const r = rnd(x, d, g.planet);

  /* Pockets are checked before ore and on their own seed, so they are rare
     enough to be an event rather than a resource. Gas first: it is the one you
     do not want, and it should not be crowded out by a geode roll. */
  const pr = rnd(x + 313, d + 977, g.planet + 41);
  if (d >= GAS.min && pr < gasChanceOn(worldTrait())) {
    return { id: GAS.id, name: GAS.name, color: GAS.color, host: GAS.host, glow: GAS.glow,
             shards: GAS.shards, tone: GAS.tone, hard: GAS.hard * hm, wt: GAS.wt,
             value: GAS.value, ore: true, hazard: true };
  }
  /* Carved out of the middle of the same roll gas and geodes use, so caches
     are independent of both and, like them, only ever overwrite - the ore
     stream underneath is untouched. */
  if (d >= CACHE.min && pr > 0.5 && pr < 0.5 + CACHE.chance) {
    return { id: CACHE.id, name: CACHE.name, color: CACHE.color, host: CACHE.host, glow: CACHE.glow,
             shards: CACHE.shards, tone: CACHE.tone, hard: CACHE.hard * hm, wt: CACHE.wt,
             value: CACHE.value, ore: true, cache: true };
  }
  if (d >= GEODE.min && pr > 1 - geodeChanceOn(worldTrait())) {
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

  /* A seam: the same cells that already had mineral flecks scattered on their
     face. Its own seed offset, checked only after every ore roll has failed,
     so it can only ever replace plain rock.

     Coloured as the band lifted toward the seam's own sandy tone, the same
     trick rubble uses - it has to belong to the wall it is in while still
     being the thing your eye goes to. Hardness stays the band's: finding one
     should not also be a chore. */
  if (rnd(x + 61, d + 17, g.planet) < SEAM_CHANCE) {
    return { id: SEAM.id, name: SEAM.name, glow: SEAM.glow,
             /* Only a fifth of the way toward the seam tone. The body has to
                stay recognisably its own band; the flecks are what the eye is
                meant to catch. A stronger blend turned every wall sandy. */
             color: mixHex(b.color, SEAM.color, 0.2),
             hard: b.hard * hm, wt: SEAM.wt, value: SEAM.value, ore: false, seam: true };
  }

  return { id: b.id, name: b.name, color: b.color, glow: b.glow, hard: b.hard * hm, wt: b.wt, value: b.value, ore: false };
}

export const haulValue = () => {
  let v = 0;
  for (const k in g.cargo) v += g.cargo[k] * DEF[k].value;
  return Math.round(v * valueM());
};

/* ---------- cache contents ----------

   Rolled from the cell's own coordinates rather than from Math.random, so a
   given cache on a given planet always holds the same thing. That is the same
   discipline as the rest of generation and it buys two concrete things: the
   reward is testable, and it cannot be re-rolled by closing the tab at the
   right moment.

   The weighting is deliberate. Supplies most often, because a consumable you
   did not buy is the most interesting thing to be handed - it changes what
   this run can attempt. Minerals second, and always the deepest kind the depth
   allows, because after the mineral gate the thing most likely to be blocking
   you is two emerald rather than any amount of money. Credits last and least:
   money is the one reward the game already hands out constantly. */
export type CachePrize =
  | { kind: 'supply'; id: SupplyKey }
  | { kind: 'mineral'; id: string; n: number }
  | { kind: 'credits'; n: number };

export function cachePrize(x: number, d: number): CachePrize {
  const r = rnd(x + 601, d + 149, g.planet + 91);
  const r2 = rnd(x + 907, d + 313, g.planet + 137);

  if (r < 0.55) {
    /* Coolant is the dearest thing on the shelf, so it is the rarest find. */
    const id: SupplyKey = r2 < 0.42 ? 'cell' : r2 < 0.8 ? 'patch' : 'coolant';
    return { kind: 'supply', id };
  }

  if (r < 0.86) {
    /* the deepest three minerals this depth can hold, so a deep cache is
       worth more than a shallow one without needing a separate table */
    const reachable = ORES.filter((o) => o.min <= d);
    const pick = reachable.slice(0, 3);
    const o = (pick.length ? pick : reachable)[Math.floor(r2 * Math.max(1, pick.length)) % Math.max(1, pick.length)];
    if (!o) return { kind: 'credits', n: 500 };
    return { kind: 'mineral', id: o.id, n: 3 + Math.floor(r2 * 4) };
  }

  return { kind: 'credits', n: Math.round((400 + d * 22) * valueM()) };
}

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
        if (nx < 0 || nx >= W || nd < -3 || nd > coreM()) continue;
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
