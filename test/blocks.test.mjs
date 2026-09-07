/* World generation must be bit-identical after the migration.
   rnd() is a pure seeded hash, so every cell of every planet is reproducible. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();
const PLANETS = [0, 1, 2, 3, 4, 5];

/* stable id -> char map, sorted so it never depends on iteration order */
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALL_IDS = [
  ...H.ORES.map((o) => o.id), ...H.ROCKS.map((r) => r.id), 'core', 'bedrock', '(empty)'
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

test('dug cells read as empty and are the only source of emptiness below 0', () => {
  H.g.planet = 0;
  H.g.dug = new Set();
  const k = H.key(4, 5);
  assert.notEqual(H.blockAt(4, 5), null, 'cell should start solid');
  H.g.dug.add(k);
  assert.equal(H.blockAt(4, 5), null, 'dug cell should read empty');
  H.g.dug = new Set();
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
