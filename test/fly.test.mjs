/* Free flight: the collision half.

   The frame loop only feeds this a direction and reads back a position, so
   everything that can actually go wrong - tunnelling through a wall at speed,
   catching on a corner, failing to report what stopped you - is in here and
   testable without a renderer. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();
const R = 0.34;

/* A world where a set of named cells is solid and everything else is open. */
const world = (...cells) => {
  const set = new Set(cells);
  return (cx, cy) => set.has(cx + ',' + cy);
};
const OPEN = () => false;

test('a ship in open space just moves', () => {
  const o = H.moveAndCollide(3, 3, 2, 0, 0.5, R, OPEN);
  assert.ok(Math.abs(o.x - 4) < 1e-9, 'x should be 3 + 2*0.5');
  assert.equal(o.y, 3);
  assert.equal(o.hitX, null);
  assert.equal(o.hitY, null);
});

test('a wall stops the ship and reports which cell did it', () => {
  /* solid at column 5; the ship approaches from the left */
  const o = H.moveAndCollide(3, 3, 6, 0, 1, R, world('5,3'));
  assert.ok(o.hitX, 'the wall should have been reported');
  assert.deepEqual(o.hitX, { x: 5, y: 3 });
  assert.equal(o.vx, 0, 'hitting a wall must kill the velocity into it');
  /* parked just clear of the face at 4.5 */
  assert.ok(o.x < 4.5 - R && o.x > 4.5 - R - 0.01,
    'ship should rest against the face, at ' + o.x);
});

test('the ship cannot be pushed inside a block by resting on it', () => {
  /* run many frames of continuous thrust into the same wall */
  let x = 3, vx = 0;
  const solid = world('5,3');
  for (let i = 0; i < 400; i++) {
    vx = H.thrust(vx, 1, 8, 18, 9, 1 / 60);
    const o = H.moveAndCollide(x, 3, vx, 0, 1 / 60, R, solid);
    x = o.x; vx = o.vx;
  }
  assert.ok(x < 4.5 - R + 1e-3, 'the ship crept into the wall, ending at ' + x);
  assert.ok(x > 4.5 - R - 0.02, 'the ship drifted away from the wall it is pressing on');
});

test('a fast ship cannot tunnel through a thin wall', () => {
  /* Started close enough that every speed here reaches the wall inside one
     frame - the first version began four cells away and the slow cases simply
     did not arrive, so it was asserting that a ship which had not moved far
     enough had not tunnelled. */
  for (const speed of [20, 60, 200, 1000, 5000]) {
    const o = H.moveAndCollide(4, 3, speed, 0, 1 / 60, R, world('5,3'));
    assert.ok(o.hitX, 'tunnelled straight through at ' + speed + ' cells/s');
    assert.ok(o.x < 4.5 - R + 1e-3, 'ended up inside or past the wall at ' + speed);
    assert.equal(o.vx, 0, 'kept its velocity through a wall at ' + speed);
  }

  /* and a single frame of a very long stall does not teleport past one either */
  const slow = H.moveAndCollide(4, 3, 8, 0, 0.5, R, world('5,3'));
  assert.ok(slow.hitX && slow.x < 4.5 - R + 1e-3, 'tunnelled during a long frame');
});

test('axes resolve separately, so the ship slides along a wall', () => {
  /* a floor below, and the ship pushing down and to the right */
  const o = H.moveAndCollide(3, 3, 4, 4, 0.1, R, world('3,4', '4,4', '5,4'));
  assert.ok(o.hitY, 'the floor should have stopped the descent');
  assert.equal(o.vy, 0);
  assert.ok(o.vx > 0, 'a floor must not stop sideways movement');
  assert.ok(o.x > 3, 'the ship should have slid along the floor');
});

test('a corridor one cell wide is passable end to end', () => {
  /* walls above and below row 3, open along it */
  const solid = (cx, cy) => cy !== 3;
  let x = 2, y = 3, vx = 0, vy = 0;
  for (let i = 0; i < 600; i++) {
    vx = H.thrust(vx, 1, 8, 18, 9, 1 / 60);
    vy = H.thrust(vy, 0, 8, 18, 9, 1 / 60);
    const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, solid);
    x = o.x; y = o.y; vx = o.vx; vy = o.vy;
    assert.ok(Math.abs(y - 3) < 0.5, 'the ship left the corridor at ' + y);
  }
  assert.ok(x > 20, 'the ship only travelled to ' + x + ' in ten seconds of a clear run');
});

test('a ship wedged in a dead end does not jitter or escape', () => {
  /* closed on every side but the way in */
  const solid = (cx, cy) => !(cy === 3 && cx <= 4);
  let x = 4, y = 3, vx = 0, vy = 0;
  for (let i = 0; i < 300; i++) {
    vx = H.thrust(vx, 1, 8, 18, 9, 1 / 60);
    vy = H.thrust(vy, 1, 8, 18, 9, 1 / 60);
    const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, solid);
    x = o.x; y = o.y; vx = o.vx; vy = o.vy;
    assert.ok(x <= 4.5 - R + 1e-3 && Math.abs(y - 3) < 0.5,
      'escaped the dead end to (' + x + ', ' + y + ')');
  }
});

test('thrust settles at the top speed and does not depend on frame rate', () => {
  const top = 7;
  let v = 0;
  for (let i = 0; i < 600; i++) v = H.thrust(v, 1, top, 18, 9, 1 / 60);
  assert.ok(Math.abs(v - top) < 1e-6, 'settled at ' + v + ' rather than ' + top);

  /* one second of thrust, at three different frame rates */
  const after = (fps) => {
    let x = 0;
    for (let i = 0; i < fps; i++) x = H.thrust(x, 1, top, 18, 9, 1 / fps);
    return x;
  };
  assert.ok(Math.abs(after(30) - after(240)) < 1e-6,
    'thrust differs with frame rate: ' + after(30) + ' vs ' + after(240));

  /* and coasting stops, at the same rate however it is sampled */
  const coast = (fps) => {
    let x = top;
    for (let i = 0; i < fps; i++) x = H.thrust(x, 0, top, 18, 9, 1 / fps);
    return x;
  };
  assert.ok(coast(60) < 0.01, 'a second of coasting should be a near stop, got ' + coast(60));
  assert.ok(Math.abs(coast(30) - coast(240)) < 1e-6, 'drag differs with frame rate');
});

test('the ship stops quickly enough to feel controlled', () => {
  /* Distance travelled coasting from top speed. Much past a cell and the ship
     reads as ice; much under and letting go feels like hitting a brake. */
  const top = 7;
  let v = top, d = 0;
  for (let i = 0; i < 600; i++) { v = H.thrust(v, 0, top, 18, 9, 1 / 60); d += v / 60; }
  assert.ok(d > 0.35 && d < 1.6, 'coasts ' + d.toFixed(2) + ' cells after release');
});
