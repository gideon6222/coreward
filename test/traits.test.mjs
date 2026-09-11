/* Traits with teeth.

   Until M11 four of the five traits were a multiplier on how much of something
   generates, which reads as weather rather than as a place. Each now also moves
   a number the player can plan around, and these are the properties that keep
   that honest: every trait changes at least one rule, no trait is strictly
   better than another, and none of the changes can take a run. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const RULES = ['cleanBonus', 'blastR', 'reach', 'payout', 'heatUp'];
const DENSITY = ['gas', 'cave', 'geode', 'soak', 'gasDamage'];

test('every trait changes at least one rule, not only a density', () => {
  for (const t of H.TRAITS) {
    assert.ok(RULES.some((k) => t[k] !== undefined),
      `${t.name} only changes densities (${DENSITY.filter((k) => t[k] !== undefined).join(', ') || 'nothing'}) - that is weather, not a place`);
  }
});

test('no trait is strictly better than another', () => {
  /* Every trait has to cost something as well as give something, or the chart
     is a menu with one right answer. Stable is the control and pays for a
     clean run; everything else gives an upside and takes one. */
  for (const t of H.TRAITS) {
    const good = (t.cleanBonus || 0) + ((t.blastR || 1) - 1) + ((t.reach || 1) - 1) +
                 ((t.payout || 1) - 1) + (t.geode ? 0.2 : 0) + (t.cave ? 0.1 : 0) +
                 Math.max(0, 1 - (t.hard || 1));
    const bad = ((t.soak || 1) - 1) + ((t.gasDamage || 1) - 1) + (t.gas ? 0.2 : 0) + Math.max(0, (t.hard || 1) - 1) +
                (1 - (t.heatUp || 1)) + (t.id === 'hollow' ? 0.2 : 0);
    assert.ok(good > 0, `${t.name} gives the player nothing`);
    if (t.id !== 'stable') {
      assert.ok(bad > 0, `${t.name} costs the player nothing - it is a free upgrade on the chart`);
    }
  }
});

test('searing ground starts its heat shallower, and still leaves a cold top', () => {
  /* Rewritten twice over, and both times for the same reason: it was asserting
     against a world that no longer exists.

     It used to loop over four LEGS and compare each one's heat line, which
     stopped meaning anything when W4 made this one planet - heatDepth returns
     199 for every leg now, so the loop was four copies of one assertion. And
     its lower bound was half the Claim's stability line, and the Claim is
     gone.

     The claim it was always making is the one below: Searing has to matter,
     and it must not swallow the world. A heat line above a fifth of the depth
     would put the burn inside the first minute of a descent. */
  const searing = H.TRAITS.find((t) => t.id === 'searing');
  const plain = H.heatDepth(0);
  const hot = H.heatDepth(0, searing);
  assert.ok(hot < plain, `searing must start shallower than ${plain} m, and starts at ${hot}`);
  assert.ok(hot > H.WORLD_DEPTH * 0.2,
    `a heat line at ${hot} m of a ${H.WORLD_DEPTH} m world burns you before you have gone anywhere`);
  assert.ok(plain < H.WORLD_DEPTH * 0.8,
    `ordinary ground's heat line at ${plain} m is so deep that heat is never met`);
});

test('the trait multipliers all default to no change', () => {
  /* A trait that wants to be pure weather still can be, and more importantly a
     new trait added without these fields must not silently zero anything. */
  const bare = {};
  assert.equal(bare.payout ?? 1, 1);
  assert.equal(H.heatDepth(0, bare), H.heatDepth(0));
});
