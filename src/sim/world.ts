import { W, START_X, ORES, DEF, baseRock, coreDepth, hardMult, valueMult,
         GEODE, GAS, CACHE, BLOOM, BLOOM_MAX, RUBBLE, RUBBLE_HARD, SEAM, SEAM_CHANCE, TREMOR_SAFE_RADIUS,
         RELIC_COLOR, RELIC_HOST, relicAt, relicFor,
         CAVE_MIN_DEPTH, caveChanceOn, gasChanceOn, geodeChanceOn, SUPPLIES, traitOf } from './config';
import { key, mixHex, rnd } from './util';
import { regionAt, REGION_COUNT } from './region';
import { vaultCells, anchorHere, WORKED_HARD, SEALED_HARD } from './vaults';
import { isCollapsed, hardScale, isAwake, UNREST_BANDS } from './unrest';
import { g , coreM, valueM, worldTrait} from './state';
import { partAt, partFor, partName, PART_COLOR, PART_HOST } from './drive';
import { findMap, cacheSupply, FIND_COLOR, FIND_HOST, FIND_HARD, type Find } from './finds';
import type { Block, SupplyKey } from '../types';

/* The crates buried on the world you are standing on, cached.

   `blockAt` is called for every cell of every rebuilt chunk, so the map cannot
   be rebuilt inside it. The cache key is everything the map is a function of:
   the leg, where the core is, and how many devices are in hand - that last one
   is what makes the crate vanish the instant it is opened rather than on the
   next world. A list length is enough because the list only ever grows. */
let fcKey = '';
let fcMap: Map<string, Find> = new Map();
export function findCells(): Map<string, Find> {
  const cd = coreM();
  const k = g.planet + '|' + cd + '|' + g.found.length;
  if (k !== fcKey) { fcKey = k; fcMap = findMap(g.planet, cd, g.found); }
  return fcMap;
}

/* Which device the crate at this cell holds, or null if there is no crate
   there. The break handlers ask this instead of reading a field off the block -
   see the note in blockAt. */
export function findHere(x: number, d: number): Find | null {
  return findCells().get(x + ',' + d) || null;
}

/* ---------- the authored rooms ----------

   Built once and kept. Unlike the find crates this does not key on anything:
   there is one world now and the rooms in it never move. Lighting an Anchor
   changes what a cell LOOKS like and not where it is, so the stamp is
   computed on the first cell that asks for it and never again. */
let vcMap: Map<string, string> | null = null;
export function vaultMap(): Map<string, string> {
  if (!vcMap) vcMap = vaultCells();
  return vcMap;
}
export function resetVaults() { vcMap = null; }

/* Whether sealed stone will cut.

   The Cutting Laser is the key, and it is the key because it already exists:
   Hollow Knight's rule is that each key opens a few locks, and a new device
   invented purely to open doors would be a key that opens exactly one. Having
   FOUND it is enough - the laser's own charge is not spent on stone. */
export const canCutSealed = () => g.found.includes('laser');

export function blockAt(x: number, d: number): Block | null {
  if (d < 0 || x < 0 || x >= W) return null;
  if (g.dug.has(key(x, d))) return null;
  /* Ground that has come down.

     Checked before anything else that can generate, including the relic and
     the drive component, because a collapsed region is not a kind of rock with
     things in it - it is closed. A relic showing through fallen ground you
     cannot enter would be the worst possible read: a prize you can see and
     have no way to be told why you cannot reach.

     Unbreakable, like bedrock. A bomb does not open it either, which is the
     point: the only thing that opens a fallen region is the Ballast. */
  /* The region, asked ONCE. It is five seeded hashes deep and three separate
     things below want it - whether the ground is shut, how angry it is, and
     which trait it has - and blockAt runs for every cell of a 21-column
     streaming window on every rebuild. Three lookups was three times the
     hashing for one answer that cannot change between them. */
  const reg = regionAt(x, d);
  if (g.ground.collapsed.length && isCollapsed(g.ground, reg)) {
    return { id: 'fallen', name: 'Fallen Ground', color: 0x24222a, host: 0x181720,
             hard: Infinity, wt: 0, value: 0, glow: 0.02 };
  }
  const cd = coreM();
  if (d > cd) return { id: 'bedrock', name: 'Bedrock', color: 0x1a1820, hard: Infinity, wt: 0, value: 0, glow: 0.02 };
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, host: 0x4a3a20, hard: 26 * hardMult(), wt: 0, value: 0, glow: 0.9, shards: 8, tone: 10, ore: true, core: true };
  /* The trait of THIS CELL, not of the world. Hardness, caves, gas and geodes
     are all properties of the ground you are cutting, so they answer to the
     region the cell is in - which is what makes a region somewhere you can
     walk into rather than a label on a save. */
  const tr = traitOf(reg);
  /* And how angry this region is, which closes the rock up as it rises.

     Small, and deliberately the least visible thing Unrest does: a hardness
     multiplier is the most expensive-but-invisible change that can be made to
     a mining game, so it does nothing at all below the third band and reaches
     about a third more drilling at the top. You notice the tremors first. */
  const hm = hardMult() * (tr.hard ?? 1) * hardScale(g.ground.unrest[reg]);

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


  /* A schematic crate, on the same footing as the relic and the component and
     for the same reason: it is one cell carrying a whole verb, and it must not
     lose a coin flip to a cave. AFTER those two, so if a crate hashes onto the
     relic's cell the relic wins and the crate is simply on the next world -
     which the design already permits, because a device is never lost.

     No roll of its own: the position is a hash of the leg and the device, so
     it consumes nothing from the ore stream. See finds.ts.

     ONE id for all seven, and the device is NOT a field on the block.

     The obvious shape - `id: 'find:laser'` with the key on the payload - broke
     the golden snapshot in two ways at once, and both were the test being
     right. Seven ids need seven legend characters, and a payload that varies
     cell to cell within one id is exactly the drift the snapshot's payload
     assertion exists to catch. So the crate is one block and `findHere()` says
     what is inside it, which is also why there is only one instanced pool for
     them rather than seven. */
  if (findCells().has(x + ',' + d)) {
    return { id: 'schematic', name: 'Sealed Crate', color: FIND_COLOR, host: FIND_HOST,
             glow: 1.0, shards: 9, tone: 9, hard: FIND_HARD * hm, wt: 0, value: 0,
             ore: true, find: true };
  }

  /* Rubble, and it goes BEFORE the authored rooms rather than after them.

     Found by a test: a tunnel cut through a hall wall and then closed up by
     W8's waking ground came back as WORKED STONE, because the stamp was
     checked first and the stamp still says there is a wall there. Coherent, in
     a way - the hall reseals - and wrong twice over. The planet does not
     rebuild somebody else's masonry, it fills the hole with spoil; and worked
     stone is twice the hardness of the band while rubble is a fraction of it,
     so the reseal was quietly harder to get back through than the wall had
     been the first time.

     Hardness rides on the band it sits in; weight and value are the flat DEF
     numbers, because haulValue() looks those up by id and cannot know what
     depth a given unit came from. */
  if (g.rubble.has(key(x, d))) {
    /* Coloured as broken pieces of whatever band it sits in rather than as one
       fixed grey. A neutral fill dropped into the scoria zone looked like
       sandstone boulders in a lava tube; half-blended it reads as the local
       rock, shattered - identifiable as fill without leaving the palette.
       Free: the pool is keyed by block id but the shade rides on the instance. */
    const band = baseRock(d, g.planet, x);
    return { id: RUBBLE.id, name: RUBBLE.name, glow: RUBBLE.glow,
             color: mixHex(band.color, RUBBLE.color, 0.5),
             hard: band.hard * hm * RUBBLE_HARD, wt: RUBBLE.wt, value: RUBBLE.value, ore: false };
  }


  /* ---------- an authored room ----------

     AFTER the three singletons, so a room that happens to be stamped over the
     relic, a drive component or a crate does not swallow it - those are one
     cell each on the whole planet and losing one is losing a whole thing. A
     crate embedded in a room's wall reads perfectly well; a crate that does not
     exist reads as nothing at all.

     BEFORE everything that generates, because a room is authored and the rock
     it is cut into is not. Nothing in a room is a coin flip. */
  const vch = vaultMap().get(x + ',' + d);
  if (vch) {
    if (vch === '.') return null;
    if (vch === 'A') {
      /* The Anchor itself, and it is the one block in the game that cannot be
         cut at all - not by the drill, not by a charge, not by the laser.

         That is the whole ritual. You break into the hall, you cross it, you
         cut one block of the plinth, and then you are STANDING NEXT TO the
         thing rather than having mined it. `CRAFT.md`: make the moment a
         place, not a pickup. The lighting happens in the frame loop, on
         proximity - see lightHere(). */
      const lit = g.ground.lit.includes(anchorHere(x, d));
      /* `ore: true` and it is not ore. That flag is what blocks.ts reads to
         decide between "pebbles on a rock face" and "crystal shards with a
         halo", and a monument wants the second one - the first build had none
         of it and the Anchor rendered as a flat teal tile on a plinth.

         Safe, because the only thing `ore` otherwise does is decide what goes
         into the hold when a block breaks, and this block cannot break. */
      return { id: lit ? 'anchorlit' : 'anchor', name: lit ? 'Anchor · lit' : 'Anchor',
               color: lit ? 0x9effd4 : 0x2f6f5e, host: 0x16241f,
               glow: lit ? 1.0 : 0.30, shards: 10, tone: lit ? 10 : 6,
               ore: true, hard: Infinity, wt: 0, value: 0 };
    }
    if (vch === '=') {
      /* The locked door you can see. Unbreakable until the laser is FOUND,
         and then merely very hard - which is the whole of the ability gate,
         and it costs no new world at all. */
      return { id: 'sealed', name: 'Sealed Stone', color: 0x5ad0e0, host: 0x1d2a33,
               glow: 0.34,
               hard: canCutSealed() ? baseRock(d, g.planet, x).hard * hm * SEALED_HARD : Infinity,
               wt: 0, value: 0 };
    }
    if (vch === '#') {
      /* Off the LOCAL BAND, like the rubble below it and unlike the flat
         numbers the singletons use. A room at 300 m has to be harder than the
         same room at 40 m for the same reason everything else down there is -
         a fixed hardness would make the deepest halls the cheapest walls in
         the game, which is exactly backwards. */
      /* A little self-lit, unlike every rock in the game. Cut stone at the edge
         of the lamp's reach was going black with the rock around it, which
         threw away the one moment the room has to say "somebody built this"
         before you are all the way inside it. */
      return { id: 'worked', name: 'Worked Stone', color: 0x8a7f63, host: 0x2c2a24,
               glow: 0.13, hard: baseRock(d, g.planet, x).hard * hm * WORKED_HARD,
               wt: 0.4, value: 1 };
    }
    if (vch === 'r') {
      const band = baseRock(d, g.planet, x);
      return { id: RUBBLE.id, name: RUBBLE.name, glow: RUBBLE.glow,
               color: mixHex(band.color, RUBBLE.color, 0.5),
               hard: band.hard * hm * RUBBLE_HARD, wt: RUBBLE.wt, value: RUBBLE.value, ore: false };
    }
    if (vch === 'o') {
      return { id: CACHE.id, name: CACHE.name, color: CACHE.color, host: CACHE.host, glow: CACHE.glow,
               shards: CACHE.shards, tone: CACHE.tone, hard: CACHE.hard * hm, wt: CACHE.wt,
               value: CACHE.value, ore: true, cache: true };
    }
    if (vch === '*') {
      return { id: GEODE.id, name: GEODE.name, color: GEODE.color, host: GEODE.host, glow: GEODE.glow,
               shards: GEODE.shards, tone: GEODE.tone, hard: GEODE.hard * hm, wt: GEODE.wt,
               value: GEODE.value, ore: true };
    }
  }

  /* Caves, in 2x2 blobs so they read as open ground rather than confetti.
     Evaluated on a coarse grid and with its own seed offset, so adding them
     leaves every ore and rock roll exactly where it was. */
  if (d >= CAVE_MIN_DEPTH &&
      rnd(Math.floor(x / 2), Math.floor(d / 2), 77) < caveChanceOn(d, tr)) {
    return null;
  }

  const r = rnd(x, d, g.planet);

  /* Pockets are checked before ore and on their own seed, so they are rare
     enough to be an event rather than a resource. Gas first: it is the one you
     do not want, and it should not be crowded out by a geode roll. */
  const pr = rnd(x + 313, d + 977, g.planet + 41);
  if (d >= GAS.min && pr < gasChanceOn(tr)) {
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
  /* A Bloom, on its own seed and only once the planet has answered.

     Rolled AFTER gas, caches and geodes and on a separate hash, so turning it
     on moves nothing that was already there - which is the invariant the
     frozen baseline defends, and the reason this is a fourth pocket rather
     than a twelfth entry in the ore ladder. An ore would have had to be the
     deepest thing in the game to keep the ladder's subset property, and the
     whole point of a Bloom is that it grows in the shallow ground you thought
     was finished.

     Its own offset: 11, 23, 41, 77, 91, 131, 137, 173, 211, 257, 311, 313,
     421, 601, 619, 977 and 1013 are taken. */
  if (isAwake(g.ground) && d >= BLOOM.min && d < BLOOM_MAX &&
      rnd(x + 149, d + 683, g.planet + 643) < BLOOM.chance) {
    return { id: BLOOM.id, name: BLOOM.name, color: BLOOM.color, host: BLOOM.host,
             glow: BLOOM.glow, shards: BLOOM.shards, tone: BLOOM.tone,
             hard: BLOOM.hard * hm, wt: BLOOM.wt, value: BLOOM.value, ore: true };
  }
  if (d >= GEODE.min && pr > 1 - geodeChanceOn(tr)) {
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
  const b = baseRock(d, g.planet, x);

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
  for (const k in g.cargo) {
    /* Anything the sale table does not know about is worth nothing rather than
       fatal. DEF covers every ore, rock, geode, gas pocket, cache, seam and
       rubble - but the core, the bedrock, a relic and a drive component are
       built inline in blockAt() and are not in it, so a single one of those
       reaching the hold turned every call to this into
       "Cannot read properties of undefined (reading 'value')".

       This is called from updateHUD, which runs every frame, so that is not a
       bad sale - it is a save that cannot be loaded. The econ probe hit exactly
       this by digging into a core, and the game deserves the same guard. */
    const def = DEF[k];
    const n = g.cargo[k];
    /* And a count that is not a real number contributes nothing rather than
       turning the whole haul into NaN, which the HUD then prints. Found by the
       test below rather than by a player, which is the right order. */
    if (def && Number.isFinite(n)) v += n * def.value;
  }
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
    /* Something you have never held, while there is anything left you have
       never held. The weighted roll below is what a cache always did and is
       what it goes back to once the kit is complete - at that point the
       question is which consumable you WANT, not which one you have seen.

       This is what makes the kit a discovery without adding a second hunt to
       the world: caches were already buried on every world and already handed
       over consumables, and the only thing missing was the consequence. See
       the note on supplies in finds.ts. */
    const fallback: SupplyKey = r2 < 0.42 ? 'cell' : r2 < 0.8 ? 'patch' : 'coolant';
    const id = cacheSupply(SUPPLIES.map((s2) => s2.key), g.foundKit, fallback) as SupplyKey;
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
export function planCollapse(want: number, rand: () => number): string[] {
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

/* ---------- the ground closing behind you ----------

   W8's second half, and the one that makes a MAP go stale rather than a
   resource. Once the planet has answered, tunnels in restless ground fill in
   while you are away, so the shaft you cut last night is not necessarily there
   this morning - and the route home is computed from the tunnels you cut.

   Terraria's Hardmode is the sourced device: edit the world the player already
   has rather than building more of it. This is the cheapest possible version
   and it is aimed at the one thing in this game that a player genuinely owns.

   Four things keep it from taking a run, and `CRAFT.md` is absolute that it
   must not:

   1. it only ever runs WHILE DOCKED - see the caller
   2. it fills with RUBBLE, which is diggable, not with rock
   3. it never touches the ground around the pad, so the way down always
      starts open
   4. and it is proportional to how angry the region is, so quiet ground stays
      exactly as you left it for ever */

/* How much of a region's tunnels close per return, at maximum Unrest. A tenth:
   a shaft you keep using is re-cut as you use it and stays open, and one you
   abandoned is gone in a dozen runs. */
export const CLOSE_RATE = 0.10;

/* And the ground that never closes. Eight metres of the pad's own column, so
   leaving is never something you have to dig out of. */
export const CLOSE_SAFE = 8;

export function planClose(rand: () => number): string[] {
  if (!isAwake(g.ground)) return [];
  const floor = UNREST_BANDS[1].at;

  /* Bucketed by region first, because the share closing is a property of the
     region and not of the planet - which is the whole reason Unrest is per
     region at all. */
  const pools: string[][] = [];
  for (let i = 0; i < REGION_COUNT; i++) pools.push([]);
  for (const k of g.dug) {
    const c = k.split(',');
    const x = +c[0], d = +c[1];
    if (d < 0) continue;
    if (Math.abs(x - START_X) <= 1 && d <= CLOSE_SAFE) continue;
    pools[regionAt(x, d)].push(k);
  }

  const taken: string[] = [];
  for (let i = 0; i < REGION_COUNT; i++) {
    const u = g.ground.unrest[i];
    if (u <= floor || !pools[i].length) continue;
    const share = CLOSE_RATE * ((u - floor) / (1 - floor));
    const want = Math.floor(pools[i].length * share);
    if (want <= 0) continue;
    const pool = pools[i];
    for (let j = pool.length - 1; j > 0; j--) {
      const n = Math.floor(rand() * (j + 1));
      const t = pool[j]; pool[j] = pool[n]; pool[n] = t;
    }
    for (const k of pool.slice(0, want)) taken.push(k);
  }
  for (const k of taken) { g.rubble.add(k); g.dug.delete(k); }
  return taken;
}

/* shortest route home through already dug tunnels, breadth first */
/* How many cells of flying it is from here to the pad.

   The real route through tunnel, not the depth: a shaft you have wandered
   sideways in is longer than the metre reading, and the difference is exactly
   the margin the Point of No Return is measured against.

   Falls back to the depth plus one when there is no route at all, which means
   you are sealed in and would have to cut your way out. That is a LOWER bound
   on the real cost rather than an honest one - but the alternative is
   declaring you stranded the moment a tremor closes a tunnel you could open
   again with two cells of drilling, and a warning that cries wolf is a warning
   nobody reads. */
export function climbCells(): number {
  const r = findRoute();
  if (r) return r.length - 1;
  return Math.max(0, Math.round(g.pd) + 1);
}

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
