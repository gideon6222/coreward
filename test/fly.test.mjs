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

/* ---------- lanes ----------

   Free flight fixed how the ship reads and broke how it aims. These are the
   tests for the fix, and the first one is the bug: it asserts the ambiguity
   that made the drill refuse to start, so that if lanes are ever removed the
   suite says what actually goes wrong rather than just going red. */

const LANE = 18;          /* LANE_PULL */
const ALIGNED = 0.22;     /* DIG_ALIGNED */

test('off a lane the ship touches two rows at once, which is the whole bug', () => {
  /* Row 5 is open at column 5, row 6 is solid. The ship sits at 5.40: its
     radius reaches to 5.74, inside row 6, while Math.round says row 5.

     So the collision reports being stopped by (5, 6) and the ship's rounded
     position says the cell ahead is (5, 5). Those two disagreeing is what
     cancelled the dig on the frame after it started - forever, because the
     collision kept re-reporting it. */
  /* Close enough that one frame at this speed actually reaches column 5 - far
     enough back and the ship simply has not arrived, which would make this
     pass for the wrong reason. */
  const o = H.moveAndCollide(4.2, 5.4, 6, 0, 1 / 60, R, world('5,6'));
  assert.ok(o.hitX, 'the ship never reached the wall, so nothing was tested');
  assert.deepEqual(o.hitX, { x: 5, y: 6 }, 'expected the off-lane row to be what stops it');
  assert.notEqual(o.hitX.y, Math.round(5.4),
    'the precondition for the bug is gone; this test no longer tests anything');
});

test('the lane pull centres the ship and does not overshoot', () => {
  for (const start of [5.49, 5.4, 5.2, 4.8, 4.6, 4.51]) {
    let y = start;
    const lane = Math.round(start);
    let prev = Math.abs(y - lane);
    for (let i = 0; i < 60; i++) {
      y += H.laneVel(y, LANE, 1 / 60) * (1 / 60);
      const off = Math.abs(y - lane);
      assert.ok(off <= prev + 1e-12, 'moved away from its lane, from ' + prev + ' to ' + off);
      prev = off;
    }
    assert.ok(Math.abs(y - lane) < 1e-4, 'never settled, ended ' + y + ' from lane ' + lane);
  }
});

test('the lane pull is settled inside a tenth of a second', () => {
  /* The dig gate waits for alignment, so how long that takes IS how long the
     drill hesitates after a turn. Anything past about a tenth of a second
     would read as the controls being late. */
  let y = 5.49;
  let frames = 0;
  while (Math.abs(y - 5) > ALIGNED && frames < 600) {
    y += H.laneVel(y, LANE, 1 / 60) * (1 / 60);
    frames++;
  }
  assert.ok(frames > 0, 'the worst case starts already aligned; the gate is not being tested');
  assert.ok(frames / 60 < 0.1,
    'takes ' + (frames / 60).toFixed(3) + 's to line up, which reads as lag');
});

test('the lane pull does not depend on frame rate', () => {
  const after = (fps) => {
    let y = 5.45;
    for (let i = 0; i < fps; i++) y += H.laneVel(y, LANE, 1 / fps) * (1 / fps);
    return y;
  };
  assert.ok(Math.abs(after(30) - after(240)) < 1e-6,
    'lane pull differs with frame rate: ' + after(30) + ' vs ' + after(240));
});

test('on a lane, the cell that stops the ship is the cell the lane points at', () => {
  /* The property lanes exist to guarantee, swept over every offset that used
     to break it. Fly right along row 5 toward a solid column, from a start
     anywhere in the row, and once the pull has settled the collision can only
     ever report the row the ship is actually in. */
  const solid = world('8,5', '8,6', '8,4');
  for (const start of [4.51, 4.7, 5, 5.3, 5.49]) {
    let x = 2, y = start, vx = 0, vy = 0;
    let checked = 0;
    for (let i = 0; i < 240; i++) {
      vx = H.thrust(vx, 1, 8, 18, 9, 1 / 60);
      vy = H.thrust(vy, 0, 8, 18, 9, 1 / 60);
      vy += H.laneVel(y, LANE, 1 / 60);
      const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, solid);
      x = o.x; y = o.y; vx = o.vx; vy = o.vy;
      /* Only claimed once aligned, which is exactly the gate the game uses. */
      if (o.hitX && Math.abs(y - Math.round(y)) < ALIGNED) {
        assert.equal(o.hitX.y, Math.round(y),
          'from ' + start + ': stopped by row ' + o.hitX.y + ' while in row ' + Math.round(y));
        checked++;
      }
    }
    assert.ok(checked > 0, 'from ' + start + ': never reached the wall, so nothing was checked');
  }
});

test('a blocked lane ejects the ship rather than pulling it into rock', () => {
  /* Hugging a floor at 5.6, the nearest lane is row 6 - which is solid. The
     pull is a velocity, so the collision gets to veto it; the ship must end up
     settled in the open row instead of embedded in the floor. */
  const solid = (cx, cy) => cy >= 6;
  let x = 2, y = 5.6, vx = 0, vy = 0;
  for (let i = 0; i < 240; i++) {
    vx = H.thrust(vx, 1, 8, 18, 9, 1 / 60);
    vy = H.thrust(vy, 0, 8, 18, 9, 1 / 60);
    vy += H.laneVel(y, LANE, 1 / 60);
    const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, solid);
    x = o.x; y = o.y; vx = o.vx; vy = o.vy;
    assert.ok(y < 5.5 + 1e-9, 'the pull dragged the ship into the floor, to ' + y);
  }
  assert.ok(Math.abs(y - 5) < ALIGNED,
    'should have settled in the open lane, ended at ' + y);
});

test('letting go eases to a stop and never reverses', () => {
  /* Playtest: "very bouncy when you change direction or stop... I want it to
     ease into a stop."

     The bounce was a lane pull applied while COASTING. The nearest lane is as
     often behind the ship as in front of it, so releasing near a cell edge
     hauled the ship backwards against its own momentum - which is the one thing
     a coast must never do. Releasing is now drag alone.

     Asserted as monotonic travel rather than as a final position, because that
     is the actual complaint: not where it ends up, but that it stops going
     forwards and comes back. Started at .42 and .61 of a cell, either side of a
     boundary, so a pull would be pulling opposite ways on the two axes. */
  let x = 3.42, y = 5.61, vx = 6, vy = 2;
  let px = x, py = y;
  for (let i = 0; i < 180; i++) {
    vx = H.thrust(vx, 0, 8, 18, 9, 1 / 60);
    vy = H.thrust(vy, 0, 8, 18, 9, 1 / 60);
    const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, OPEN);
    x = o.x; y = o.y; vx = o.vx; vy = o.vy;
    assert.ok(x >= px - 1e-12, 'reversed on x at frame ' + i + ': ' + px + ' -> ' + x);
    assert.ok(y >= py - 1e-12, 'reversed on y at frame ' + i + ': ' + py + ' -> ' + y);
    px = x; py = y;
  }
  /* and it did actually come to rest rather than still drifting */
  assert.ok(Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01, 'never settled');
});

test('the lane pull is assigned, not added, so it cannot overshoot', () => {
  /* The other half of the bounce. `vy += laneVel(...)` stacks a correction on
     top of a velocity already carrying the ship toward the line, so the pair
     overshoots and gets corrected back - an oscillation across the lane for as
     long as you hold a direction.

     Assigned, the perpendicular velocity IS the exponential approach, so the
     ship can only ever converge. Asserted as "never crosses the line it is
     approaching", which is what overshoot means and what a player sees. */
  for (const start of [5.49, 5.3, 4.7, 4.51]) {
    let y = start, vy = start > 5 ? -3 : 3;   /* already moving toward lane 5 */
    const side = Math.sign(start - 5);
    for (let i = 0; i < 240; i++) {
      vy = H.laneVel(y, LANE, 1 / 60);
      const o = H.moveAndCollide(3, y, 0, vy, 1 / 60, R, OPEN);
      y = o.y; vy = o.vy;
      const nowSide = Math.sign(y - 5);
      assert.ok(nowSide === side || nowSide === 0,
        'from ' + start + ': overshot the lane to ' + y);
    }
    assert.ok(Math.abs(y - 5) < 1e-4, 'from ' + start + ': never settled, at ' + y);
  }
});

test('lanes do not cost the coast that makes flight feel like flight', () => {
  /* The lane pull acts across the direction of travel, so it must not shorten
     the coast along it. Same assertion as the free-flight coast test, run with
     the pull switched on. */
  const top = 7;
  let x = 3, y = 5, vx = top, vy = 0, d = 0;
  for (let i = 0; i < 600; i++) {
    vx = H.thrust(vx, 0, top, 18, 9, 1 / 60);
    vy = H.thrust(vy, 0, top, 18, 9, 1 / 60);
    const px = x;
    vx += H.laneVel(x, LANE, 1 / 60);
    vy += H.laneVel(y, LANE, 1 / 60);
    const o = H.moveAndCollide(x, y, vx, vy, 1 / 60, R, OPEN);
    x = o.x; y = o.y; vx = o.vx; vy = o.vy;
    d += Math.abs(x - px);
  }
  assert.ok(d > 0.35 && d < 1.6, 'coasts ' + d.toFixed(2) + ' cells after release');
});
