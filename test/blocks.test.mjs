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
  H.GEODE.id, H.GAS.id, 'core', 'bedrock', '(empty)'
].sort();
const CHAR = new Map(ALL_IDS.map((id, i) => [id, ALPHA[i]]));
assert.ok(ALL_IDS.length <= ALPHA.length, 'ran out of snapshot characters');

/* A cell's full payload is determined by (planet, id): every numeric field is
   either constant per id or base * hardMult(planet). The snapshot stores one
   payload per distinct id plus a per-cell id grid, and the builder ASSERTS that
   assumption on every cell rather than trusting it. */
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
      if (!(id in defs)) defs[id] = payload;
      else assert.deepEqual(payload, defs[id],
        'blockAt payload for "' + id + '" varies within planet ' + p + ' at (' + x + ',' + d + ')');
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
const OVERWRITERS = new Set(['(empty)', H.GAS.id, H.GEODE.id]);

test('pockets and caves only overwrite cells, never reshuffle the ore stream', () => {
  let same = 0, changed = 0;
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
        changed++;
        assert.ok(OVERWRITERS.has(now),
          at + ': ' + was + ' became ' + now + ', which is not a pocket or a cave - ' +
          'something perturbed the ore rolls');
        assert.ok(was !== 'core' && was !== 'bedrock',
          at + ': ' + was + ' must never be overwritten');
      }
    }
    assert.equal(i, snap.grid.length, 'planet ' + snap.planet + ' grid length drifted');
  }
  /* guard against the test passing because nothing generates any more */
  assert.ok(changed > 200, 'pockets and caves generated almost nothing: ' + changed);
  assert.ok(changed / (same + changed) < 0.12,
    'pockets and caves now rewrite ' + Math.round(1000 * changed / (same + changed)) / 10 +
    '% of the world - they are meant to be events, not terrain');
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

test('pockets stay rare enough to read as events', () => {
  for (const p of PLANETS) {
    H.g.planet = p;
    H.g.dug = new Set();
    const cd = H.coreDepth(p);
    let cells = 0, gas = 0, geo = 0;
    for (let d = 0; d < cd; d++) for (let x = 0; x < H.W; x++) {
      cells++;
      const b = H.blockAt(x, d);
      if (b && b.id === H.GAS.id) gas++;
      else if (b && b.id === H.GEODE.id) geo++;
    }
    for (const [name, n] of [['gas', gas], ['geode', geo]]) {
      const pct = 100 * n / cells;
      assert.ok(pct > 0.15, 'planet ' + p + ': ' + name + ' is at ' + pct.toFixed(2) +
        '% - too rare to ever be met');
      assert.ok(pct < 2.5, 'planet ' + p + ': ' + name + ' is at ' + pct.toFixed(2) +
        '% - common enough to be terrain rather than an event');
    }
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
