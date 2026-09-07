/* World generation must be bit-identical after the migration.
   rnd() is a pure seeded hash, so every cell of every planet is reproducible. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();
const PLANETS = [0, 1, 2, 3, 4, 5];

/* stable id -> char map, sorted so it never depends on iteration order */
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALL_IDS = [
  ...H.ORES.map((o) => o.id), ...H.ROCKS.map((r) => r.id),
  H.GEODE.id, H.GAS.id, H.CACHE.id, H.RUBBLE.id, H.SEAM.id,
  'core', 'bedrock', '(empty)'
].sort();
const CHAR = new Map(ALL_IDS.map((id, i) => [id, ALPHA[i]]));
assert.ok(ALL_IDS.length <= ALPHA.length, 'ran out of snapshot characters');

/* A cell's payload is determined by (planet, id, colour). It used to be just
   (planet, id) - every numeric field was constant per id or scaled by
   hardMult - but seams and rubble take the colour of the band they sit in, so
   one id now legitimately has several payloads.

   The snapshot stores one payload per distinct id+colour plus a per-cell id
   grid, and the builder ASSERTS that assumption on every cell rather than
   trusting it. Widening the key rather than dropping the assertion: the point
   of it is to catch a field that starts varying by something nobody expected. */
function snapshot(p) {
  H.g.planet = p;
  H.g.dug = new Set();
  const cd = H.coreDepth(p);
  const defs = {};
  const counts = {};
  let grid = '';
  for (let d = -1; d <= cd + 1; d++) {
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      const id = b ? b.id : '(empty)';
      grid += CHAR.get(id);
      counts[id] = (counts[id] || 0) + 1;
      if (!b) continue;
      const payload = { ...b };
      const dk = id + ':' + b.color;
      if (!(dk in defs)) defs[dk] = payload;
      else assert.deepEqual(payload, defs[dk],
        'blockAt payload for "' + dk + '" varies within planet ' + p + ' at (' + x + ',' + d + ')');
    }
  }
  return { planet: p, coreDepth: cd, cols: H.W, rowsFrom: -1, rowsTo: cd + 1, counts, defs, grid };
}

test('world generation is unchanged for planets 0-5', () => {
  assertGolden('blocks', PLANETS.map(snapshot));
});

/* Infinity does not survive JSON, so bedrock gets its own explicit assertion
   on the live value rather than relying on the snapshot round-trip. */
test('bedrock hardness is Infinity (asserted directly, not via snapshot)', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  const below = H.blockAt(H.START_X, H.coreDepth(0) + 1);
  assert.equal(below.id, 'bedrock');
  assert.equal(below.hard, Infinity);
  assert.ok(!Number.isFinite(below.hard));
  assert.equal(below.wt, 0);
  assert.equal(below.value, 0);
  for (const p of PLANETS) {
    H.g.planet = p;
    const b = H.blockAt(0, H.coreDepth(p) + 5);
    assert.equal(b.hard, Infinity, 'bedrock on planet ' + p + ' must stay unbreakable');
  }
});

test('the core sits exactly at coreDepth and is breakable', () => {
  for (const p of PLANETS) {
    H.g.planet = p;
    H.g.dug = new Set();
    const cd = H.coreDepth(p);
    const core = H.blockAt(H.START_X, cd);
    assert.equal(core.id, 'core', 'planet ' + p);
    assert.equal(core.core, true);
    assert.ok(Number.isFinite(core.hard) && core.hard > 0, 'core must be breakable on planet ' + p);
    assert.equal(core.hard, 26 * H.hardMult(p));
  }
});

test('dug cells read as empty', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  const k = H.key(4, 5);
  assert.notEqual(H.blockAt(4, 5), null, 'cell should start solid');
  H.g.dug.add(k);
  assert.equal(H.blockAt(4, 5), null, 'dug cell should read empty');
  H.g.dug = new Set();
});

/* ---------- pockets and caves ----------

   These were added on their own seed offsets specifically so that adding them
   could not reshuffle the ore stream. The frozen snapshot below is the world
   as it stood the moment before they existed, and the test asserts the only
   legal difference: a cell either kept its old id, or a cave/gas/geode
   overwrote it. Anything else means a new generation feature perturbed the
   rolls underneath it, which silently rebalances every depth at once.

   Freeze, do not re-record, unless you are deliberately rebalancing ore. */
const PRE = JSON.parse(
  readFileSync(new URL('./baseline/blocks-preadditive.json', import.meta.url), 'utf8'));
/* Everything allowed to sit on top of the ore stream. Adding an entry here is
   a deliberate act and should come with a diff you have read: it says "this
   new feature overwrites cells", which is fine, as opposed to "this new
   feature moved the ore around", which is not. */
const OVERWRITERS = new Set(['(empty)', H.GAS.id, H.GEODE.id, H.CACHE.id, 'relic']);

/* Extending the ore ladder downward is the other legal change, and it is a
   NARROWER claim than the one above, so it is stated narrowly rather than by
   dropping the new ids into OVERWRITERS.

   blockAt() takes the first ORES entry whose depth gate is met, and every
   entry's spawn chance is strictly lower than the one after it. So a new
   deepest ore can only ever claim cells the ore directly above it held -
   never rock, never a shallower ore, never anything at a depth it does not
   reach. That subset property is asserted separately in stats.test.mjs; this
   map is what it buys. */
const LADDER_EXTENSION = { coreite: new Set(['umbrite', 'solmarrow']) };

/* Seams are the same shape of claim: they are rolled on their own seed and
   checked only after every ore roll has failed, so a seam can only ever
   replace PLAIN ROCK - never ore, never a pocket, never the core. Stated as a
   rule rather than as an OVERWRITERS entry for the same reason as the ladder:
   "rock may become a seam" is narrower and therefore worth more than "seams
   may replace anything". */
for (const r of H.ROCKS) LADDER_EXTENSION[r.id] = new Set(['seam']);

test('pockets and caves only overwrite cells, never reshuffle the ore stream', () => {
  /* Two different kinds of legal change, counted apart.

     A pocket or a cave dropping onto the world has to stay rare - that is what
     "an event, not terrain" means, and the ceiling below is what enforces it.
     A ladder extension or a seam is a different claim entirely: it converts a
     whole category wholesale and is SUPPOSED to be common. Counting them
     together meant seams tripped the pocket ceiling, which would have read as
     "pockets have gone wrong" for a change that had nothing to do with them. */
  let same = 0, overwritten = 0, extended = 0;
  for (const snap of PRE) {
    H.g.planet = snap.planet;
    H.g.dug = new Set();
    let i = 0;
    for (let d = snap.rowsFrom; d <= snap.rowsTo; d++) {
      for (let x = 0; x < snap.cols; x++, i++) {
        const was = snap.legend[snap.grid[i]];
        const b = H.blockAt(x, d);
        const now = b ? b.id : '(empty)';
        const at = 'planet ' + snap.planet + ' (' + x + ',' + d + ')';
        if (now === was) { same++; continue; }
        const ladder = LADDER_EXTENSION[was];
        if (ladder && ladder.has(now)) extended++;
        else if (OVERWRITERS.has(now)) overwritten++;
        else assert.fail(
          at + ': ' + was + ' became ' + now + ', which is neither a pocket, a cave, ' +
          'nor a legal extension of the ore ladder - something perturbed the ore rolls');
        assert.ok(was !== 'core' && was !== 'bedrock',
          at + ': ' + was + ' must never be overwritten');
      }
    }
    assert.equal(i, snap.grid.length, 'planet ' + snap.planet + ' grid length drifted');
  }
  const total = same + overwritten + extended;
  /* guard against the test passing because nothing generates any more */
  assert.ok(overwritten > 200, 'pockets and caves generated almost nothing: ' + overwritten);
  assert.ok(overwritten / total < 0.12,
    'pockets and caves now rewrite ' + Math.round(1000 * overwritten / total) / 10 +
    '% of the world - they are meant to be events, not terrain');
  assert.ok(extended > 200, 'the ladder and seam extensions generated almost nothing');
  assert.ok(extended / total < 0.45,
    'category conversions now cover ' + Math.round(1000 * extended / total) / 10 +
    '% of the world - at that point the thing being converted is the exception');
});

test('caves stay below CAVE_MIN_DEPTH and never eat the core', () => {
  for (const p of PLANETS) {
    H.g.planet = p;
    H.g.dug = new Set();
    const cd = H.coreDepth(p);
    for (let d = 0; d < H.CAVE_MIN_DEPTH; d++)
      for (let x = 0; x < H.W; x++)
        assert.notEqual(H.blockAt(x, d), null,
          'planet ' + p + ': a cave opened at ' + d + ' m, above CAVE_MIN_DEPTH');
    for (let x = 0; x < H.W; x++) {
      assert.equal(H.blockAt(x, cd).id, 'core', 'planet ' + p + ': core row must survive caves');
      assert.equal(H.blockAt(x, cd + 1).id, 'bedrock', 'planet ' + p + ': floor must survive caves');
    }
  }
  assert.ok(H.caveChance(H.CAVE_MIN_DEPTH) < H.caveChance(200),
    'caves should open up with depth');
  assert.ok(H.caveChance(100000) <= 0.09, 'cave chance must stay capped or the ground dissolves');
});

/* A gas pocket has to give way faster than whatever surrounds it. The bang
   only reads as a surprise if the block breaks early - if it were the tougher
   block you would feel it coming and it would just be a tax. */
test('gas breaks faster than the rock it hides in, and pays nothing', () => {
  for (let d = H.GAS.min; d <= 300; d++)
    assert.ok(H.GAS.hard < H.baseRock(d).hard,
      'gas (' + H.GAS.hard + ') is not softer than ' + H.baseRock(d).id +
      ' (' + H.baseRock(d).hard + ') at ' + d + ' m');
  assert.equal(H.GAS.value, 0, 'gas must never be worth credits');
  assert.equal(H.GAS.wt, 0, 'gas must never take cargo weight');
  assert.ok(H.GAS_HULL_DAMAGE > 0 && H.GAS_HULL_DAMAGE < H.HULL_MAX / 3,
    'gas should hurt without being a one-hit kill: ' + H.GAS_HULL_DAMAGE + ' of ' + H.HULL_MAX);
  assert.ok(H.GAS_SOAK > 0 && H.GAS_SOAK <= 0.5, 'the soak spike is the real bite');
});

/* A geode is the payoff for going sideways instead of straight down, so it has
   to beat anything you could have reached by simply digging deeper at the
   depth where it starts appearing. */
test('a geode outvalues every ore available at its depth', () => {
  for (const o of H.ORES) {
    if (o.min > H.GEODE.min) continue;
    assert.ok(H.GEODE.value > o.value * 3,
      'geode (' + H.GEODE.value + ') barely beats ' + o.id + ' (' + o.value + ') at ' +
      H.GEODE.min + ' m, so there is no reason to go looking for one');
  }
  assert.ok(H.GEODE.wt <= 5, 'a geode must be light enough that you never leave one behind');
  assert.ok(H.GEODE.glow > Math.max(...H.ORES.map((o) => o.glow)),
    'a geode has to out-shine every ore or you will never spot one across a cave');
});

/* ---------- planet traits ----------

   The additive-only test above runs with traits applied, so its passing is
   also the proof that no trait perturbs the ore stream. If a future trait
   reaches into `rnd(x, d, planet)` it fails there, not here. */

function census(p) {
  H.g.planet = p;
  H.g.dug = new Set();
  const cd = H.coreDepth(p);
  let cells = 0, gas = 0, geo = 0, cave = 0;
  for (let d = 0; d < cd; d++) for (let x = 0; x < H.W; x++) {
    cells++;
    const b = H.blockAt(x, d);
    if (!b) cave++;
    else if (b.id === H.GAS.id) gas++;
    else if (b.id === H.GEODE.id) geo++;
  }
  const pct = (n) => 100 * n / cells;
  return { cells, gas: pct(gas), geode: pct(geo), cave: pct(cave), minable: pct(cells - cave - gas) };
}

const WIDE = Array.from({ length: 40 }, (_, i) => i);

test('planet 0 is Stable and every later planet has a real trait', () => {
  assert.equal(H.traitOf(0).id, 'stable', 'Verdax is where you learn what normal feels like');
  for (const p of WIDE.slice(1))
    assert.notEqual(H.traitOf(p).id, 'stable', 'planet ' + p + ' fell back to Stable');
  for (const p of WIDE)
    assert.equal(H.traitOf(p), H.traitOf(p), 'traitOf must be pure');
});

test('every trait actually occurs, and none dominates the ladder', () => {
  const seen = new Map();
  for (const p of WIDE.slice(1)) {
    const id = H.traitOf(p).id;
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const t of H.TRAITS) {
    if (t.id === 'stable') continue;
    const n = seen.get(t.id) || 0;
    assert.ok(n > 0, t.id + ' never appears in the first 40 planets - it is dead content');
    assert.ok(n < WIDE.length * 0.55,
      t.id + ' takes ' + n + ' of 39 planets, so the ladder is mostly one trait');
  }
});

test('every trait is described and does something', () => {
  const ids = new Set();
  for (const t of H.TRAITS) {
    assert.ok(!ids.has(t.id), 'duplicate trait id ' + t.id);
    ids.add(t.id);
    assert.equal(H.TRAIT_OF[t.id], t);
    assert.ok(t.blurb.length > 20 && t.blurb.length < 110,
      t.id + ' blurb must fit one line on the launch screen');
    const knobs = [t.gas, t.gasDamage, t.geode, t.cave, t.soak].filter((v) => v !== undefined);
    if (t.id === 'stable') assert.equal(knobs.length, 0, 'Stable must be the baseline');
    else assert.ok(knobs.length > 0, t.id + ' changes nothing, so it is a label not a trait');
    for (const v of knobs) assert.ok(v > 1 && v <= 3.5, t.id + ' multiplier ' + v + ' is out of range');
  }
});

test('a trait bends its own rate without turning a pocket into terrain', () => {
  const stable = census(0);
  assert.ok(stable.gas < 1.5 && stable.geode < 1.5,
    'a Stable planet must stay quiet: ' + JSON.stringify(stable));

  for (const p of WIDE.slice(1, 16)) {
    const c = census(p);
    const t = H.traitOf(p);
    for (const [name, pct] of [['gas', c.gas], ['geode', c.geode]]) {
      assert.ok(pct > 0.15, 'planet ' + p + ' (' + t.id + '): ' + name + ' at ' +
        pct.toFixed(2) + '% is too rare to ever be met');
      assert.ok(pct < 3.5, 'planet ' + p + ' (' + t.id + '): ' + name + ' at ' +
        pct.toFixed(2) + '% is terrain, not an event');
    }
    /* Hollow trades material for speed. Past a point it stops being a trade. */
    assert.ok(c.minable > 80, 'planet ' + p + ' (' + t.id + ') is only ' +
      c.minable.toFixed(1) + '% minable - there is nothing left to dig for');
    assert.ok(c.cave < H.CAVE_CHANCE_CAP * 100 + 1,
      'planet ' + p + ' cave fraction ' + c.cave.toFixed(1) + '% broke the cap');
  }

  /* the flagship effects must be visible against Stable, or the trait is a
     name rather than a change the player can feel */
  const volatilePlanet = WIDE.slice(1).find((p) => H.traitOf(p).id === 'volatile');
  const crystalPlanet = WIDE.slice(1).find((p) => H.traitOf(p).id === 'crystalline');
  const hollowPlanet = WIDE.slice(1).find((p) => H.traitOf(p).id === 'hollow');
  assert.ok(census(volatilePlanet).gas > stable.gas * 1.8, 'Volatile is not volatile');
  assert.ok(census(crystalPlanet).geode > stable.geode * 2.5, 'Crystalline is not crystalline');
  assert.ok(census(hollowPlanet).cave > stable.cave * 1.8, 'Hollow is not hollow');
});

test('trait-adjusted rates stay inside their caps at any depth', () => {
  for (const p of WIDE) {
    for (const d of [26, 60, 120, 400, 5000]) {
      assert.ok(H.caveChanceOn(d, p) <= H.CAVE_CHANCE_CAP + 1e-9,
        'cave chance broke the cap on planet ' + p + ' at ' + d + ' m');
      assert.ok(H.caveChanceOn(d, p) > 0);
    }
    assert.ok(H.gasChanceOn(p) <= 0.06 && H.gasChanceOn(p) >= H.GAS.chance);
    assert.ok(H.geodeChanceOn(p) <= 0.06 && H.geodeChanceOn(p) >= H.GEODE.chance);
  }
});

test('out of bounds and above surface read as empty', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  assert.equal(H.blockAt(-1, 5), null);
  assert.equal(H.blockAt(H.W, 5), null);
  assert.equal(H.blockAt(4, -1), null);
});

test('rnd() is a pure deterministic hash', () => {
  const a = H.rnd(13, 41, 2);
  const b = H.rnd(13, 41, 2);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1, 'rnd must stay in [0,1)');
  assert.notEqual(H.rnd(13, 41, 2), H.rnd(13, 41, 3), 'planet must seed the hash');
  const seen = new Set();
  for (let x = 0; x < 40; x++) for (let d = 0; d < 40; d++) seen.add(H.rnd(x, d, 0));
  assert.ok(seen.size > 1500, 'hash is collapsing: only ' + seen.size + ' distinct values in 1600');
});

/* ---------- tremors and rubble ----------

   A collapsed cell has to regenerate as rubble rather than as whatever was
   originally there, or a tremor becomes an ore respawn and the deepest vein in
   the game can be farmed forever from one spot. */

test('a collapsed cell comes back as rubble, never as the ore it held', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  H.g.rubble = new Set();

  /* find a cell that generates something valuable */
  let found = null;
  for (let d = 56; d < 110 && !found; d++)
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      if (b && b.ore && b.value > 500) { found = [x, d, b]; break; }
    }
  assert.ok(found, 'expected some valuable ore on planet 0');
  const [x, d, original] = found;

  const k = H.key(x, d);
  H.g.dug.add(k);
  assert.equal(H.blockAt(x, d), null, 'mined cell should be empty');

  /* a tremor fills it back in */
  H.g.dug.delete(k);
  H.g.rubble.add(k);
  const now = H.blockAt(x, d);
  assert.equal(now.id, 'rubble', 'a collapsed ore cell must not come back as ore');
  assert.ok(now.value < original.value / 10,
    'rubble must be worth almost nothing, or collapsing is a payday');
  assert.equal(now.ore, false);

  /* hardness rides on the band it sits in, and is easier than that band */
  assert.ok(now.hard < H.baseRock(d).hard * H.hardMult(0),
    'clearing rubble should be easier than cutting fresh rock');
  assert.ok(now.hard > 0);

  /* clearing it again wins: dug beats rubble, so no cleanup is needed */
  H.g.dug.add(k);
  assert.equal(H.blockAt(x, d), null, 're-cleared rubble must read as empty');
  H.g.dug = new Set();
  H.g.rubble = new Set();
});

test('rubble never appears on its own, only where something put it', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  H.g.rubble = new Set();
  for (let d = 0; d < H.coreDepth(0); d++)
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      assert.notEqual(b && b.id, 'rubble', 'rubble generated at (' + x + ',' + d + ')');
    }
});

test('the tremor band is reachable on the planet everyone starts on', () => {
  assert.ok(H.TREMOR_DEPTH > H.HEAT_DEPTH,
    'tremors must be a THIRD band, not a second thing happening at the heat line');
  assert.ok(H.TREMOR_DEPTH < H.coreDepth(0) - 15,
    'the unstable band would be unreachable or vestigial on planet 0: ' +
    H.TREMOR_DEPTH + ' against a core at ' + H.coreDepth(0));
});

test('a tremor takes more of the tunnel the deeper you are, but stays bounded', () => {
  let prev = 0;
  for (let d = H.TREMOR_DEPTH; d < 600; d += 5) {
    const n = H.tremorCells(d);
    assert.ok(n >= prev, 'collapse size went backwards at ' + d + ' m');
    assert.ok(n >= 1 && n <= 12, n + ' cells at ' + d + ' m is outside any sane range');
    prev = n;
  }
  assert.ok(H.tremorCells(600) > H.tremorCells(H.TREMOR_DEPTH),
    'depth should make tremors worse or the band has no gradient');
  assert.ok(H.TREMOR_SAFE_RADIUS >= 2, 'a tremor must never land next to the ship');
  assert.ok(H.TREMOR_WARN > 1.5, 'the player needs time to read the warning');
  assert.ok(H.TREMOR_FIRST > H.TREMOR_EVERY,
    'the first tremor should come later than the rhythm that follows, so ' +
    'arriving in the band is not immediately punished');
});

test('rubble is coloured as the band it sits in, not one fixed grey', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  H.g.rubble = new Set();
  const at = (d) => {
    H.g.rubble = new Set([H.key(3, d)]);
    return H.blockAt(3, d);
  };
  /* dirt at 5 m against scoria at 90 m: two very different bands */
  const shallow = at(5), deep = at(90);
  assert.notEqual(shallow.color, deep.color,
    'rubble is one flat colour everywhere, so it reads as imported rock');

  /* and it sits between the band and the neutral fill rather than being either.
     Kept above coreDepth(0): bedrock is resolved before rubble is, correctly,
     since there is no tunnel down there to collapse. */
  for (const d of [5, 30, 60, 90, 108]) {
    const b = at(d);
    const band = H.baseRock(d).color;
    assert.notEqual(b.color, band, 'rubble at ' + d + ' m is indistinguishable from fresh rock');
    assert.notEqual(b.color, H.RUBBLE.color, 'rubble at ' + d + ' m ignored its band');
    assert.equal(b.color, H.mixHex(band, H.RUBBLE.color, 0.5));
  }

  /* and it never overrides the two things that are not tunnel */
  const cd = H.coreDepth(0);
  H.g.rubble = new Set([H.key(3, cd), H.key(3, cd + 1)]);
  assert.equal(H.blockAt(3, cd).id, 'core', 'rubble must not overwrite the core');
  assert.equal(H.blockAt(3, cd + 1).id, 'bedrock', 'rubble must not overwrite bedrock');
  H.g.rubble = new Set();
});

test('mixHex blends channels and stays inside 24 bits', () => {
  assert.equal(H.mixHex(0x000000, 0xffffff, 0), 0x000000);
  assert.equal(H.mixHex(0x000000, 0xffffff, 1), 0xffffff);
  assert.equal(H.mixHex(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(H.mixHex(0xff0000, 0x0000ff, 0.5), 0x800080);
  for (const t of [0, 0.13, 0.5, 0.87, 1]) {
    const v = H.mixHex(0x6b2a18, 0x6d6459, t);
    assert.ok(v >= 0 && v <= 0xffffff, 'mixHex escaped 24 bits at t=' + t);
    assert.equal(v, Math.round(v), 'mixHex produced a non-integer colour');
  }
});

/* ---------- supply caches ----------

   The discovery moment. A cache pays in something other than ore, which means
   it never touches the hold - so a full hold is never a reason to leave one in
   the ground, and the prize is never in competition with cargo weight. */

test('a cache is rare enough to be a surprise and common enough to be met', () => {
  for (const p of PLANETS) {
    H.g.planet = p;
    H.g.dug = new Set();
    H.g.rubble = new Set();
    const cd = H.coreDepth(p);
    let n = 0, cells = 0;
    for (let d = 0; d < cd; d++) for (let x = 0; x < H.W; x++) {
      cells++;
      const b = H.blockAt(x, d);
      if (b && b.cache) {
        n++;
        assert.ok(d >= H.CACHE.min, 'a cache appeared at ' + d + ' m, above its floor');
        assert.equal(b.wt, 0, 'a cache must never cost cargo weight');
        assert.equal(b.value, 0, 'a cache pays through its contents, not as ore');
      }
    }
    /* A whole planet dug out end to end holds a handful. A run touches a
       fraction of that, which is the point. */
    assert.ok(n >= 2, 'planet ' + p + ' has only ' + n + ' caches - most runs would never see one');
    assert.ok(n < cells * 0.012, 'planet ' + p + ' has ' + n + ' caches, which is terrain');
  }
});

test('what a cache holds is fixed by where it is, not by when you open it', () => {
  H.g.planet = 0;
  const a = H.cachePrize(4, 61);
  const b = H.cachePrize(4, 61);
  assert.deepEqual(a, b, 'the same cache rolled differently twice');
  /* and it is not the same everywhere */
  const seen = new Set();
  for (let d = 20; d < 200; d += 3)
    for (let x = 0; x < H.W; x += 3) seen.add(JSON.stringify(H.cachePrize(x, d)));
  assert.ok(seen.size > 20, 'cache contents barely vary: only ' + seen.size + ' outcomes');
});

test('every cache prize is something the game can actually give you', () => {
  H.g.planet = 0;
  const kinds = { supply: 0, mineral: 0, credits: 0 };
  for (let d = H.CACHE.min; d < 280; d++)
    for (let x = 0; x < H.W; x++) {
      const p = H.cachePrize(x, d);
      kinds[p.kind]++;
      if (p.kind === 'supply') {
        assert.ok(H.SUPPLY_OF[p.id], 'unknown supply in a cache: ' + p.id);
      } else if (p.kind === 'mineral') {
        const ore = H.DEF[p.id];
        assert.ok(ore && H.isOre(ore), 'unknown mineral in a cache: ' + p.id);
        assert.ok(ore.min <= d,
          'a cache at ' + d + ' m held ' + p.id + ', which only exists at ' + ore.min + ' m');
        assert.ok(p.n >= 3 && p.n <= 6, 'cache mineral count out of range: ' + p.n);
      } else {
        assert.ok(p.n > 0 && Number.isFinite(p.n), 'bad credit prize: ' + p.n);
      }
    }

  /* Supplies most often - a consumable you did not buy changes what the run
     can attempt, which is the most interesting thing to be handed. Money
     least, because money is what the game already pays constantly. */
  const total = kinds.supply + kinds.mineral + kinds.credits;
  assert.ok(kinds.supply / total > 0.45, 'supplies should be the common find');
  assert.ok(kinds.credits / total < 0.25, 'money should be the rare, dull find');
  assert.ok(kinds.mineral > 0 && kinds.credits > 0, 'every prize kind must be reachable');
});

test('a deep cache holds deeper minerals than a shallow one', () => {
  H.g.planet = 0;
  const deepestAt = (d) => {
    let best = 0;
    for (let x = 0; x < H.W; x++) {
      const p = H.cachePrize(x, d);
      if (p.kind === 'mineral') best = Math.max(best, H.DEF[p.id].min);
    }
    return best;
  };
  assert.ok(deepestAt(160) > deepestAt(30),
    'depth should change what a cache is worth, or every cache is the same cache');
});
