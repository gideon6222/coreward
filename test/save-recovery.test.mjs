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
const NOT_IN_DEF = ['core', 'bedrock', 'relic', 'part', '(empty)', 'nonsense'];

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
