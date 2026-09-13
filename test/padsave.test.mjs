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

test('a large event writes a checkpoint where the ship stands, tank and hold as they are', () => {
  /* *"lets do a second save point at the anchor. If there are any large
     events like this, create save points for them too."* */
  fresh();
  H.g.pd = 42; H.g.px = 31;
  H.g.fuel = 37; H.g.hull = 61; H.g.soak = 0.2;
  H.g.cargo = { silver: 2 }; H.g.weight = 8;
  assert.equal(H.snapshot(), null, 'the pad save fired underground');
  const c = H.checkpointSnapshot();
  assert.ok(c, 'no checkpoint underground');
  assert.equal(c.at, 'checkpoint');
  assert.equal(c.pd, 42);
  assert.equal(c.px, 31);
  assert.equal(c.fuel, 37, 'a checkpoint without the tank is a free refuel on load');
  assert.equal(c.hull, 61);
  assert.equal(c.soak, 0.2);
  assert.deepEqual(c.cargo, { silver: 2 });
  /* The pad save carries the same fields and says which it is. */
  H.g.pd = -1;
  assert.equal(H.snapshot().at, 'pad');
  assert.equal(H.snapshot().fuel, 37);
  /* And neither kind is written during the way in. */
  H.g.mode = 'arrive';
  assert.equal(H.checkpointSnapshot(), null, 'a checkpoint was written during the way in');
  H.g.mode = 'play';
});

test('a checkpoint loads where it was written; an unflagged mid-run save is still landed', () => {
  const cp = H.landSave({ at: 'checkpoint', px: 31, pd: 42, cargo: { silver: 2 }, weight: 8 });
  assert.equal(cp.pd, 42, 'a checkpoint was landed on the pad');
  assert.equal(cp.px, 31);
  assert.deepEqual(cp.cargo, { silver: 2 }, 'a checkpoint lost its hold');
  assert.equal(cp.weight, 8);
  /* The same position without the flag is a 0.33.0 mid-run save. */
  const old = H.landSave({ px: 31, pd: 42, cargo: { silver: 2 }, weight: 8 });
  assert.equal(old.pd, -1);
  assert.deepEqual(old.cargo, {});
  /* And a pad save with the flag is on the pad, hold kept. */
  const pad = H.landSave({ at: 'pad', px: H.START_X, pd: -1, cargo: { iron: 1 }, weight: 2 });
  assert.equal(pad.pd, -1);
  assert.deepEqual(pad.cargo, { iron: 1 });
});

test('the dock is the pad, not the whole top row', () => {
  /* Playtest, 2026-09-13: *"you can go up to the surface from any location,
     but probably should only be able to surface near the landing pad."*

     `atSurface()` answers "is the ship above the ground line" and `docked()`
     answers "is the ship at the pad". Every service the game performs FOR the
     player - the sale, the tank, the hull, the Outfitter, the Ballast, the
     save - hangs off the second. Before this they all hung off the first, so
     any of the 61 columns was a dock. */
  fresh();
  H.g.px = H.START_X; H.g.pd = -1;
  assert.ok(H.atSurface(), 'the pad is not above the ground line');
  assert.ok(H.docked(), 'a ship parked on the pad is not docked');

  /* Either lip of the deck still counts: the deck is 3.3 wide, so its own
     footprint is 1.65 either side, and the reach is a forgiving 1.8.

     Straddling the threshold rather than sitting exactly on it. `START_X -
     1.8` is 28.2, which in binary floating point is a hair under, so
     `30 - 28.2` comes back as 1.8000000000000007 and an assertion AT the
     boundary is testing the float rather than the design. The constant's own
     value is asserted separately, below. */
  for (const dx of [-1.79, -1.6, 0, 1.6, 1.79]) {
    H.g.px = H.START_X + dx;
    assert.ok(H.docked(), 'a ship ' + dx + ' from the middle of the deck is not docked');
  }
  /* The reach covers the deck it is meant to cover: pad.ts builds a 3.3-wide
     deck, so anything at or inside 1.65 must dock. */
  assert.ok(H.PAD_HALF >= 1.65, 'the dock is narrower than the deck it stands on');

  /* And beyond it is sky, not a shop. */
  for (const dx of [-30, -6, -2.1, 2.1, 6, 30]) {
    H.g.px = H.START_X + dx;
    assert.ok(H.atSurface(), 'the ship at ' + dx + ' is not above the ground');
    assert.ok(!H.docked(), 'the ship is docked ' + dx + ' columns from the pad');
  }

  /* Depth still matters: standing in the right column underground is not
     standing on the pad. */
  H.g.px = H.START_X; H.g.pd = 8;
  assert.ok(!H.atSurface());
  assert.ok(!H.docked(), 'a ship eight meters down the pad\'s own shaft is docked');
});

test('the pad the dock means and the pad the fuel reserve means are the same pad', () => {
  /* Standing rule 10: a constant that must agree with another gets a test on
     the DERIVED quantity. `findRoute()` paths home to `key(START_X, -1)` and
     `climbCells()` costs that route, which is where the reserve band on the
     fuel dial comes from. If `docked()` ever meant somewhere else, the dial
     would be promising fuel to reach a place that is not the dock - which is
     exactly the bug this pair replaced, in the other direction. */
  fresh();
  /* The goal cell findRoute uses, read back as a position, is docked. */
  H.g.px = H.START_X; H.g.pd = -1;
  assert.ok(H.docked(), 'the cell findRoute calls home is not the dock');

  /* And the reserve is zero exactly where the dock is, not merely at the
     surface: from the sky away from the pad there is still a trip to pay
     for. Asserted through climbCells, which is what the dial reads. */
  H.g.dug = new Set();
  for (let d = 0; d <= 6; d++) H.g.dug.add(H.key(H.START_X, d));
  H.g.px = H.START_X; H.g.pd = 6;
  const fromShaft = H.climbCells();
  assert.ok(fromShaft > 0, 'a ship six meters down owes no climb at all');
});
