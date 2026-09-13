/* The pad save.

   Playtest, 2026-09-12: *"I want a quick save to be done at the launch pad
   so that if someone exits out of the game, they start back at the launch
   pad, don't lose too much progress, but can't abuse the system."*

   Three claims, and every one of them is a claim about state rather than
   about a disk, so they are made against the pure pair: `snapshot`, which
   is what would be written, and `landSave`, which is where a loaded save
   puts the ship. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

function fresh() {
  H.setWorld(0);
  H.g.ground = H.newGround();
  H.g.mode = 'play';
  H.g.px = H.START_X;
  H.g.pd = -1;
  H.g.cargo = {};
  H.g.weight = 0;
}

test('the save is taken on the pad, and nowhere else', () => {
  fresh();
  assert.ok(H.snapshot(), 'a ship on the pad in play did not save');

  /* Hovering over the pad still counts - the HUD's own "docked" line. */
  H.g.pd = H.PAD_REACH;
  assert.ok(H.snapshot(), 'a ship at the surface threshold did not save');

  /* One row down is a run in progress, and a run in progress is not saved -
     that is the whole mechanism. */
  for (const pd of [0, 0.4, 5, 90, 400]) {
    H.g.pd = pd;
    assert.equal(H.snapshot(), null, 'the game saved with the ship at ' + pd + ' m');
  }
});

test('the way in never writes a save', () => {
  /* The intro puts a ship on the pad twenty-four metres up and brings it
     down; a save taken during that would be a fresh game that had somehow
     already been played, and a returning player shown the intro. */
  fresh();
  for (const mode of ['title', 'intro', 'arrive']) {
    H.g.mode = mode;
    assert.equal(H.snapshot(), null, 'the game saved during ' + mode);
  }
  H.g.mode = 'play';
  assert.ok(H.snapshot());
});

test('the snapshot is what the ship has, with the position on the pad', () => {
  fresh();
  H.g.credits = 1234;
  H.g.cargo = { iron: 2 };
  H.g.weight = 4;
  const s = H.snapshot();
  assert.equal(s.credits, 1234);
  assert.deepEqual(s.cargo, { iron: 2 }, 'a hold on the pad is part of the save - it has not been sold yet');
  assert.ok(s.pd <= H.PAD_REACH);
  assert.equal(s.px, H.START_X);
});

test('a mid-run save from an older version lands on the pad with the hold dropped', () => {
  /* 0.33.0 and earlier saved wherever the ship was. Loading one of those
     literally would be the free ride home the pad save exists to refuse, so
     the ship is landed and the hold DROPPED: not kept, not sold. */
  const at = H.landSave({ px: 12, pd: 90, cargo: { silver: 3, iron: 8 }, weight: 30 });
  assert.equal(at.pd, -1, 'a mid-run save loaded ' + at.pd + ' m down');
  assert.equal(at.px, H.START_X);
  assert.deepEqual(at.cargo, {}, 'the hold came home with the ship');
  assert.equal(at.weight, 0);

  /* A save taken on the pad is loaded as it is, hold included: it was on the
     pad, it is allowed to be there. */
  const pad = H.landSave({ px: H.START_X, pd: -1, cargo: { silver: 3 }, weight: 9 });
  assert.equal(pad.pd, -1);
  assert.deepEqual(pad.cargo, { silver: 3 });
  assert.equal(pad.weight, 9);

  /* And a save with no position at all - older than positions - is on the
     pad. */
  const none = H.landSave({});
  assert.equal(none.pd, -1);
  assert.equal(none.px, H.START_X);
});

test('quitting mid-run costs exactly what dying does', () => {
  /* *"can't abuse the system."* The two ways out of a bad run must cost the
     same, or the cheaper one is the one everybody takes. Dying clears the
     hold and puts the ship on the pad (die() in actions.ts); the pad save
     never wrote the run in the first place. Both leave: the credits, the
     rig, the tunnels dug on EARLIER runs, and no hold. The one difference
     is that dying also records a loss, which is in the run log and not in
     the world. */
  fresh();
  H.g.credits = 500;
  H.g.dug = new Set(['30,1', '30,2']);
  const onPad = H.snapshot();
  /* Off the pad: dig, fill the hold, get into trouble. */
  H.g.pd = 40;
  H.g.dug.add('30,40');
  H.g.cargo = { gold: 4 };
  H.g.weight = 20;
  assert.equal(H.snapshot(), null, 'the run in progress was saved');
  /* What a quit restores is the last thing written: */
  assert.deepEqual(onPad.cargo, {});
  assert.equal(onPad.credits, 500);
  assert.ok(!onPad.dug.includes('30,40'), 'a tunnel from the abandoned run survived');
  assert.ok(onPad.dug.includes('30,2'), 'a tunnel from an earlier run was lost');
});
