/* Devices you dig up.

   The claims worth making here are the ones that are cheap to get wrong and
   expensive to discover in play: that the first world holds exactly the three
   it is supposed to, that a crate never lands outside the world, that missing
   one does not lose it, and that the shop genuinely refuses to sell what has
   not been found. The last one is the whole feature, so it gets a test that
   fails loudly rather than an assertion about a filter. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

test('the found list and the sellable list are exactly the fifteen upgrades', () => {
  const keys = H.UPGRADES.map((u) => u.key);
  for (const f of H.FINDS) {
    assert.ok(keys.includes(f.key), f.key + ' is buried but is not an upgrade');
  }
  assert.equal(new Set(H.FINDS.map((f) => f.key)).size, H.FINDS.length,
    'a device is buried twice');
});

/* The rule that decided the split, asserted rather than described.

   This is the one that stops somebody adding a sixteenth upgrade and guessing
   which pile it belongs in: a device is a thing the ship does not have, and
   `effect(0)` is where the game already said so. If a new upgrade reads "Not
   installed" at level zero it must be found, and if it does not, it must be
   sold. */
test('every device reads Not installed at level zero, and nothing else does', () => {
  for (const u of H.UPGRADES) {
    const absent = /not installed/i.test(u.effect(0));
    const found = H.FOUND_KEYS.has(u.key);
    assert.equal(found, absent,
      u.key + ': effect(0) is "' + u.effect(0) + '" but it is ' +
      (found ? 'found in the world' : 'sold at the shop') +
      ' - the two have to agree, see finds.ts');
  }
});

test('the one world buries four crates at a time, shallowest first, and every device is on it', () => {
  /* ONE WORLD. Until R9c each device was gated to a leg of the old planet
     chain, the chain went in W9, and the leg stayed at zero for ever - so
     only the magnet and the bomb were ever buried and the Cutting Laser, the
     key to three of the nine Anchors, did not exist. The probe found it by
     never getting past six.

     Now the cap does the spreading: four crates at a time, the shallowest
     unfound ones, and the next appears as one is found. */
  const core = H.coreDepth(0);
  const on = H.findsOn(0, core, []);
  assert.equal(on.length, 4, 'an empty hand sees ' + on.length + ' crates, not 4');
  assert.deepEqual(on.map((f) => f.key), ['magnet', 'bomb', 'survey', 'reactor']);
  for (const f of on) {
    assert.ok(f.below < core,
      f.key + ' is buried at ' + f.below + ' m on a world whose core is at ' + core);
  }
  /* And every one of the seven is reachable on this world by finding the
     ones above it. */
  const held = [];
  while (true) {
    const next = H.findsOn(0, core, held);
    if (!next.length) break;
    held.push(next[0].key);
  }
  assert.deepEqual(held, H.FINDS.map((f) => f.key),
    'digging up whatever is offered, shallowest first, yields ' + held.join(', '));
});

/* Six hundred legs, not twelve. These two are property tests over a hash, and
   a hash is exactly the kind of thing that is fine for the first dozen inputs
   and wrong on the hundredth. */
const LEGS = 600;

test('a device is never buried outside the world it is on', () => {
  for (let leg = 0; leg < LEGS; leg++) {
    const core = H.coreDepth(leg);
    for (const f of H.findsOn(leg, core, [])) {
      const p = H.findAt(f, leg, core);
      assert.ok(p.d >= f.below, f.key + ' on leg ' + leg + ' is at ' + p.d + ' m, above its own ' + f.below);
      assert.ok(p.d < core, f.key + ' on leg ' + leg + ' is at ' + p.d + ' m, at or below the core at ' + core);
      assert.ok(p.x >= 1 && p.x <= H.W - 2,
        f.key + ' on leg ' + leg + ' is in column ' + p.x + ', outside 1..' + (H.W - 2));
    }
  }
});

/* Two claims, and the second is the one that can actually fail.

   Every device gets its own cell - which `findMap` guarantees with a nudge, so
   on its own this asserts that the nudge works and nothing else. The claim
   with teeth is the one after it: the nudge should almost never fire. Round
   six removed the nudge for exactly this reason and round seven put it back,
   because moving every device's depth made collisions inevitable rather than
   absent - across thirteen thousand placements two overlapping bands will
   share a cell, and that is the birthday problem, not a bad hash. */
test('two devices on one world are never in the same cell', () => {
  for (let leg = 0; leg < LEGS; leg++) {
    const core = H.coreDepth(leg);
    for (let n = 0; n <= H.FINDS.length; n++) {
      const held = H.FINDS.slice(0, n).map((f) => f.key);
      const m = H.findMap(leg, core, held);
      const on = H.findsOn(leg, core, held);
      assert.equal(m.size, on.length,
        'leg ' + leg + ' with ' + n + ' in hand buries ' + on.length +
        ' devices into ' + m.size + ' cells');
    }
  }
});

test('the collision nudge almost never has to fire', () => {
  H.resetFindNudges();
  for (let leg = 0; leg < LEGS; leg++) {
    const core = H.coreDepth(leg);
    for (let n = 0; n <= H.FINDS.length; n++) {
      H.findMap(leg, core, H.FINDS.slice(0, n).map((f) => f.key));
    }
  }
  /* Thirteen thousand placements. A handful of nudged metres is the birthday
     problem; hundreds would mean the hash had stopped separating devices, and
     no assertion about the repaired POSITIONS could ever tell you that. */
  const n = H.findNudges();
  assert.ok(n < 12, 'the nudge moved devices ' + n + ' metres across the sweep, ' +
    'which means the position hash has stopped separating them');
});

/* Missable, but never lost - the rule that separates a device from a relic.
   With one world "never lost" means: whatever is unfound is still a
   candidate, however the rest were found. */
test('a device left in the ground is still there whatever else was found', () => {
  const core = H.coreDepth(0);
  for (const skip of H.FINDS) {
    const held = H.FINDS.filter((f) => f !== skip).map((f) => f.key);
    const on = H.findsOn(0, core, held);
    assert.deepEqual(on.map((f) => f.key), [skip.key],
      skip.key + ' was skipped and is not the one crate left - a device must never be lost');
  }
});

test('a device already in hand is never buried again', () => {
  const core = H.coreDepth(3);
  const all = H.findsOn(3, core, []);
  assert.ok(all.length > 0);
  const held = [all[0].key];
  const rest = H.findsOn(3, core, held);
  assert.ok(!rest.some((f) => f.key === held[0]),
    held[0] + ' is in hand and is still buried on the same world');
});

/* The cap enforces the order the devices are met in no matter how the player
   plays, and it self-corrects, because clearing the backlog is what opens
   the next rung. So the claim is about a player who digs: take everything
   offered, and the set completes in ascending depth order, the laser last. */
test('a player who digs up what is offered meets every device shallowest first, the laser last', () => {
  const held = [];
  const core = H.coreDepth(0);
  for (let round = 0; round < 8; round++) {
    for (const f of H.findsOn(0, core, held)) held.push(f.key);
  }
  assert.equal(held.length, H.FINDS.length,
    'a digging player holds ' + held.length + ' of ' + H.FINDS.length + ': ' + held.join(', '));
  const depths = held.map((k) => H.FIND_OF[k].below);
  for (let i = 1; i < depths.length; i++) {
    assert.ok(depths[i] >= depths[i - 1], 'devices are met out of depth order: ' + held.join(' -> '));
  }
  assert.equal(held[held.length - 1], 'laser', 'the key to the sealed halls is not the last thing met');
  /* The laser is not on the world until enough of the others are in hand -
     that is the cap, not a gate - and it IS on the world once they are. */
  const before = H.findsOn(0, core, []);
  assert.ok(!before.some((f) => f.key === 'laser'), 'the laser is buried for a player who has found nothing');
  const after = H.findsOn(0, core, held.slice(0, 3));
  assert.ok(after.some((f) => f.key === 'laser'), 'three devices in hand and the laser is still not buried');
});

/* The cap, against a LITERAL rather than against the constant.

   Written against `H.FINDS_PER_WORLD` first, which made it vacuous: raising
   the cap to 99 moved the goalpost with it and the test still passed. A test
   whose expectation is imported from the thing under test asserts only that
   the code equals itself. */
test('no world ever buries more than four devices', () => {
  for (let leg = 0; leg < LEGS; leg++) {
    assert.ok(H.findsOn(leg, H.coreDepth(leg), []).length <= 4,
      'leg ' + leg + ' buries more than four devices');
  }
  /* And the cap actually BINDS, or it is a limit on nothing. An empty hand
     has seven candidates and must yield four. */
  const core = H.coreDepth(0);
  const pool = H.FINDS.filter((f) => f.below <= core - 3);
  assert.ok(pool.length > 4, 'only ' + pool.length + ' candidates, so the cap never bites');
  assert.equal(H.findsOn(0, core, []).length, 4);
});

/* ---------- the shop gate, which is the point of the whole thing ---------- */

test('the Outfitter will not stock a device that has not been found', () => {
  /* Deep enough that every depth gate in the game is open. */
  const deep = 9999;
  const none = H.shelfStock(deep, []).map((u) => u.key);
  for (const f of H.FINDS) {
    assert.ok(!none.includes(f.key),
      f.key + ' is on the shelf of a player who has never found one');
  }
  /* And the eight ladders ARE there, or the gate has eaten the shop. */
  const sold = H.UPGRADES.filter((u) => !H.FOUND_KEYS.has(u.key)).map((u) => u.key);
  for (const k of sold) {
    assert.ok(none.includes(k), k + ' is sold at the shop but is not on the shelf');
  }
});

test('finding one puts exactly that one on the shelf', () => {
  const deep = 9999;
  const before = H.shelfStock(deep, []).length;
  const after = H.shelfStock(deep, ['laser']);
  assert.equal(after.length, before + 1);
  assert.ok(after.some((u) => u.key === 'laser'));
  assert.ok(!after.some((u) => u.key === 'bomb'),
    'finding the laser also stocked the charge');
});

/* A new player's shop, which is the number he was complaining about: fifteen
   cases in a portrait frame. */
test('a new player sees at most six rows in the Outfitter', () => {
  const rows = H.shelfStock(0, []);
  assert.ok(rows.length <= 6,
    'a first-run shelf has ' + rows.length + ' rows: ' + rows.map((u) => u.key).join(', '));
  /* And never zero, or the first dock is an empty room. */
  assert.ok(rows.length >= 3, 'a first-run shelf has only ' + rows.length + ' rows');
});

/* The depth gate still bites on the eight that are sold, so this round did not
   quietly delete the progression it was built on top of. */
test('the depth gate still holds for the upgrades that are sold', () => {
  for (const u of H.UPGRADES) {
    if (H.FOUND_KEYS.has(u.key) || u.unlock === 0) continue;
    const shallow = H.shelfStock(u.unlock - 1, []).map((x) => x.key);
    const deep = H.shelfStock(u.unlock, []).map((x) => x.key);
    assert.ok(deep.includes(u.key), u.key + ' is missing at its own unlock depth');
    /* It may still show as the single teaser, which is by design - what must
       not happen is it showing as BUYABLE. */
    if (shallow.includes(u.key)) {
      assert.equal(H.shelfState(u, 0, 1e9, {}, u.unlock - 1).state, 'sealed',
        u.key + ' is buyable one metre above its own unlock depth');
    }
  }
});

/* ---------- the kit, which is found rather than bought ---------- */

test('a cache hands over something you have never held, while there is one', () => {
  const order = H.SUPPLIES.map((s) => s.key);
  /* Nothing held: the first in table order. */
  assert.equal(H.cacheSupply(order, [], 'cell'), order[0]);
  /* Hold the first two: the third. */
  assert.equal(H.cacheSupply(order, order.slice(0, 2), 'cell'), order[2]);
  /* Hold everything: back to the weighted roll the cache always used, because
     at that point the question is which one you WANT. */
  assert.equal(H.cacheSupply(order, order.slice(), 'patch'), 'patch');
  assert.equal(H.cacheSupply(order, order.slice(), 'coolant'), 'coolant');
});

test('opening caches fills the kit in a finite number of caches', () => {
  const order = H.SUPPLIES.map((s) => s.key);
  const held = [];
  for (let i = 0; i < order.length; i++) {
    const got = H.cacheSupply(order, held, 'cell');
    assert.ok(!held.includes(got), 'a cache handed over a duplicate while something was still unknown');
    held.push(got);
  }
  assert.equal(held.length, order.length, 'the kit never completes');
  /* And the order is the table's, which is cheapest-and-plainest first: a
     first-hour player meets the Fuel Cell before the Bulwark Field. */
  assert.deepEqual(held, order);
});

test('the six consumables are not all cheap, which is why they are gated', () => {
  /* The reason this became a discovery at all: a Bulwark Field absorbs three
     impacts outright and was on sale next to a price from the first minute.
     Asserted so a future repricing cannot quietly make the gate pointless. */
  const bul = H.SUPPLY_OF.bulwark;
  const hull = H.UPGRADES.find((u) => u.key === 'hull');
  assert.ok(bul.cost > H.costOf(hull, 0),
    'the Bulwark Field is cheaper than the first rung of the ladder it stands in for');
});
