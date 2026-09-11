/* A save must never be able to make the game unstartable.

   `updateHUD` runs every frame and calls `haulValue`, so anything in the cargo
   that the sale table does not know about is not a bad sale - it is a boot
   crash, on every load, with no way out on a phone. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

/* Every id that blockAt() can return but DEF does not carry, because they are
   built inline: they are the ones that can poison a hold. */
const NOT_IN_DEF = ['core', 'bedrock', 'relic', 'part', 'schematic', '(empty)', 'nonsense'];

test('a hold holding something unsellable is worth less, not fatal', () => {
  H.setWorld(0);
  for (const id of NOT_IN_DEF) {
    H.g.cargo = { iron: 3, [id]: 1 };
    H.g.weight = 20;
    assert.doesNotThrow(() => H.haulValue(), `a hold containing "${id}" threw`);
    const v = H.haulValue();
    assert.ok(Number.isFinite(v) && v >= 0, `a hold containing "${id}" valued at ${v}`);
  }
});

test('the unsellable thing is worth exactly nothing, not something', () => {
  H.setWorld(0);
  H.g.cargo = { iron: 3 };
  const clean = H.haulValue();
  H.g.cargo = { iron: 3, core: 1, relic: 2 };
  assert.equal(H.haulValue(), clean,
    'an unsellable id changed the price of the haul, so it is being counted as something');
});

test('an empty and a corrupt hold both value at zero rather than NaN', () => {
  H.setWorld(0);
  H.g.cargo = {};
  assert.equal(H.haulValue(), 0);
  H.g.cargo = { iron: NaN };
  assert.ok(Number.isFinite(H.haulValue()) || H.haulValue() === 0,
    'a NaN count produced a NaN price, which renders as NaN on the HUD');
});


/* ---------- the grandfather clause ----------

   Round six stopped the Outfitter selling the seven devices and buried them in
   the world instead. Every save in existence was written before that, so it
   can be carrying a level-three Cutting Laser and no `found` list at all -
   and loading that literally takes a device somebody paid 12,500 credits for
   off their ship and puts it back in the ground.

   This is the test that decides whether the version is safe to ship, so it
   loads a REAL pre-round-six save rather than asserting on the clause. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

test('a save that bought its devices keeps them, and can still upgrade them', () => {
  store.set('coreward.v2', JSON.stringify({
    planet: 5, credits: 413, best: { depth: 300 },
    up: { drill: 4, cargo: 3, laser: 3, bomb: 2, auto: 1, magnet: 2,
          survey: 0, drone: 0, reactor: 0 }
    /* No `found` key at all, which is what every save written before today
       looks like. */
  }));
  H.load();
  for (const k of ['laser', 'bomb', 'auto', 'magnet']) {
    assert.ok(H.g.found.includes(k), k + ' was bought and paid for and is not in the found list');
    assert.ok(H.g.up[k] > 0, k + ' lost the level it was bought at');
  }
  /* And the ones never bought stay unfound, or the clause has quietly handed
     the whole feature to every existing player. */
  for (const k of ['survey', 'drone', 'reactor']) {
    assert.ok(!H.g.found.includes(k), k + ' was never bought but counts as found');
  }
  const shelf = H.shelfStock(H.g.best.depth, H.g.found).map((u) => u.key);
  assert.ok(shelf.includes('laser'), 'a paid-for laser is not on the shelf to be upgraded');
  assert.ok(!shelf.includes('drone'), 'an unfound drone is on the shelf');
});

test('a v1 save carrying a beacon keeps its autopilot', () => {
  store.clear();
  store.set('coreward.v1', JSON.stringify({ planet: 1, credits: 100, up: { beacon: 3 } }));
  H.load();
  assert.ok(H.g.up.auto > 0, 'a v1 beacon did not become an autopilot');
  assert.ok(H.g.found.includes('auto'), 'a v1 beacon became an autopilot nobody is allowed to upgrade');
});


test('a save from before the kit was a discovery can still buy all six', () => {
  store.clear();
  store.set('coreward.v2', JSON.stringify({
    planet: 2, credits: 5000, best: { depth: 120 },
    up: {}, kit: { coolant: 0, patch: 2, cell: 0, overdrive: 0, bulwark: 0, pulse: 0 }
    /* No `foundKit` key, which is what every save written before today looks
       like. */
  }));
  H.load();
  /* Every one of them, not only the two still in the hold. A consumable is
     SPENT, so "do you hold one" is the wrong question - somebody who bought
     three Hull Patches and used all three has held one, and telling them the
     Outfitter has never heard of it would be taking something away. */
  for (const sup of H.SUPPLIES) {
    assert.ok(H.g.foundKit.includes(sup.key),
      sup.key + ' was buyable in the save that was loaded and is now unknown');
  }
});

test('a new save knows no consumables at all', () => {
  store.clear();
  store.set('coreward.v2', JSON.stringify({ planet: 0, credits: 0, foundKit: [] }));
  H.load();
  assert.equal(H.g.foundKit.length, 0, 'a save that knows nothing was given something');
});
