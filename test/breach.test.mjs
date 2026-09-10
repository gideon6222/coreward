/* The ninety seconds after a core comes apart.

   The rules that must hold whatever the clock gets tuned to: it always ends,
   it always ends in exactly one of two ways, and the way it ends can cost you
   a hold but never a run. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

test('the collapse front rises from the core to the surface over the clock', () => {
  for (const leg of [0, 1, 4, 9]) {
    const b = H.newBreach(leg);
    assert.equal(H.collapseDepth(b), H.coreDepth(leg), `leg ${leg}: it starts at the core`);
    b.t = b.dur / 2;
    const half = H.collapseDepth(b);
    assert.ok(half > 0 && half < H.coreDepth(leg), `leg ${leg}: halfway is somewhere in between`);
    b.t = b.dur;
    assert.equal(H.collapseDepth(b), 0, `leg ${leg}: it ends at the surface`);
    /* Monotonic, because it is the timer the player is reading. */
    let last = Infinity;
    for (let t = 0; t <= b.dur; t += 3) {
      b.t = t;
      const d = H.collapseDepth(b);
      assert.ok(d <= last, `leg ${leg}: the front went back down at ${t}s`);
      last = d;
    }
  }
});

test('it ends, and in exactly one of two ways', () => {
  /* Left alone it fails. */
  const a = H.newBreach(0);
  for (let i = 0; i < 400 && !a.failed && !a.done; i++) H.stepBreach(a, 0.5, false);
  assert.ok(a.failed && !a.done, 'a breach nobody escapes must fail');

  /* Reached, it is done, and the failure never fires afterwards. */
  const b = H.newBreach(0);
  H.stepBreach(b, 5, false);
  H.stepBreach(b, 0, true);
  assert.ok(b.done && !b.failed, 'reaching the surface must end it clean');
  for (let i = 0; i < 400; i++) H.stepBreach(b, 0.5, false);
  assert.ok(b.done && !b.failed, 'a finished breach must stay finished');
});

test('the clock is long enough to climb out of any world it can start in', () => {
  /* The claim that makes it fair: at the stock climb rate, with no drilling at
     all, the ship must reach the surface from the core with time to spare. If
     this ever fails the breach has become a wall rather than a chase. */
  H.setWorld(0);
  const climb = H.coreDepth(0) / H.S.speed();
  assert.ok(climb < H.BREACH_SECONDS * 0.4,
    `leg 0 takes ${climb.toFixed(0)}s to climb against a ${H.BREACH_SECONDS}s clock - ` +
    'under half of it has to be free for drilling and mistakes');
});

test('tremors come far more often than the ordinary clock, and keep coming', () => {
  const b = H.newBreach(0);
  let fires = 0;
  for (let t = 0; t < b.dur && !b.failed; t += 0.25) {
    if (H.stepBreach(b, 0.25, false).tremor) fires++;
  }
  assert.ok(fires >= 8, `only ${fires} tremors in ${b.dur}s - the breach has to feel like one`);
  const ordinary = b.dur / H.TREMOR_EVERY;
  assert.ok(fires > ordinary * 2,
    `${fires} tremors against ${ordinary.toFixed(1)} on the ordinary clock - not enough of a change to read as one`);
});

test('the grade runs from nothing to everything and never overshoots', () => {
  const b = H.newBreach(0);
  assert.equal(H.breachHeat(b), 0);
  b.t = b.dur;
  assert.equal(H.breachHeat(b), 1);
  b.t = b.dur * 3;
  assert.equal(H.breachHeat(b), 1, 'a grade that goes past 1 blows out the whole picture');
});

test('everything at or below the front is gone, and nothing above it is', () => {
  const b = H.newBreach(0);
  b.t = b.dur / 2;
  const front = H.collapseDepth(b);
  assert.ok(H.swallowed(b, front), 'the front itself is gone');
  assert.ok(H.swallowed(b, front + 5), 'below the front is gone');
  assert.ok(!H.swallowed(b, front - 1), 'above the front is not');
});
