/* Three visuals tiers, and they cost in order.

   `INDEX.md` standing rule 18: every game ships low, medium and high, and
   `test\test_visuals.gd` is what proves it on the Godot side. This game had one
   fixed setting until 2026-09-13 and nothing ever said so, because the doctor's
   tier check looks for a Godot `src\game\visuals.gd` and this is a web game.
   That is the shape of failure the framework exists to prevent: a rule nothing
   looks at. This file is the thing that looks.

   It asserts the SHAPE - three tiers, ordered, each one cheaper than the next,
   none of them changing what the game IS - and deliberately not the numbers,
   which are a design choice and will move the first time a phone reading
   disagrees with them. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModule } from './harness.mjs';

const V = await loadModule('src/visuals.ts');

test('there are exactly three tiers, named low, medium and high', () => {
  assert.deepEqual(V.TIERS, ['low', 'medium', 'high']);
  for (const t of V.TIERS) {
    assert.ok(V.TIER[t], `the table has no entry for ${t}, so the picker would set a tier that does nothing`);
  }
});

test('each tier costs more than the one below it', () => {
  const costs = V.TIERS.map((t) => V.tierCost(t));
  for (let i = 1; i < costs.length; i++) {
    assert.ok(costs[i] > costs[i - 1],
      `${V.TIERS[i]} (${costs[i]}) does not cost more than ${V.TIERS[i - 1]} (${costs[i - 1]}), ` +
      'so choosing a lower tier buys nothing');
  }
});

test('every lever moves the right way, or not at all', () => {
  /* Ordered by cost is not enough on its own: one lever going the wrong way
     can be hidden by another going further the right way, and the player who
     picked low would get a more expensive frame in that dimension. */
  const [lo, mid, hi] = V.TIERS.map((t) => V.TIER[t]);
  for (const [name, a, b, c] of [
    ['dpr', lo.dpr, mid.dpr, hi.dpr],
    ['dust', lo.dust, mid.dust, hi.dust],
    ['growth', lo.growth, mid.growth, hi.growth]
  ]) {
    assert.ok(a <= b && b <= c, `${name} is not ordered across the tiers: ${a}, ${b}, ${c}`);
  }
  assert.ok(!(hi.relief === false && lo.relief === true),
    'low has rock relief and high does not, which is backwards');
});

test('no tier changes what the game is, only what it costs', () => {
  /* DEVICE.md: "Every tier must render the same game: the same rules, the same
     reach, the same reads. A tier changes what things cost, never what they
     are." The mechanical half of that claim is that the table cannot carry a
     field which is a rule - so the set of keys is asserted, and adding a
     `lampReach` or an `oreValue` here fails this test rather than shipping
     three different games. */
  const keys = Object.keys(V.TIER.low).sort();
  assert.deepEqual(keys, ['dpr', 'dust', 'growth', 'relief'],
    'the tier table grew a field - check it is a COST and not a rule before widening this list');
  for (const t of V.TIERS) {
    assert.deepEqual(Object.keys(V.TIER[t]).sort(), keys, `${t} does not carry the same fields as low`);
  }
});

test('growth thins as a fraction, and never to nothing', () => {
  /* A tier that grows no plants at all is a tier that renders a different
     world, and zero would also make the thinning unfalsifiable. */
  for (const t of V.TIERS) {
    const gr = V.TIER[t].growth;
    assert.ok(gr > 0 && gr <= 1, `${t} has a growth density of ${gr}, which is not a fraction of the band's own chance`);
  }
});

test('the default is a tier that exists, and is not the most expensive one', () => {
  assert.ok(V.TIERS.includes(V.DEFAULT_TIER));
  assert.notEqual(V.DEFAULT_TIER, 'high',
    'defaulting to high makes the feature invisible to every player who already has the game');
});
