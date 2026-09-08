/* The lighting solver.

   These are the assertions that make the lighting mean something. The whole
   pitch of the feature is "you can only see where your lamp can actually
   get to", and every one of the tests below is a way that promise can quietly
   stop being true while the screen still looks broadly plausible:

     - open air comes out at full brightness, or distance masquerades as
       occlusion and the entire world reads as fogged
     - a detour costs, or a side branch is as bright as the shaft and there
       was no point solving anything
     - rock fades rather than cutting to black at the first wall
     - and the one that matters most: light never passes THROUGH rock into
       open air on the far side. A shadow that leaks is worse than no shadow,
       because the player is reading it as information.

   The solver is pure, so all of this runs under node with no renderer. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const OPTS = { att: H.LM_ATT, pinch: H.LM_PINCH, seep: H.LM_SEEP, seepSteps: H.LM_SEEP_STEPS };

/* Build a grid from rows of text. '#' is rock, anything else is open. */
function grid(rows) {
  const h = rows.length, w = rows[0].length;
  const solid = new Uint8Array(w * h);
  for (let j = 0; j < h; j++) {
    assert.equal(rows[j].length, w, 'ragged test grid');
    for (let i = 0; i < w; i++) if (rows[j][i] === '#') solid[j * w + i] = 1;
  }
  return { solid, w, h };
}

function solve(rows, si, sj, opts = OPTS) {
  const { solid, w, h } = grid(rows);
  const out = new Float32Array(w * h);
  H.solveVis(solid, w, h, si, sj, opts, out);
  return { at: (i, j) => out[j * w + i], out, w, h };
}

test('open air is at full brightness, however far away', () => {
  const open = Array.from({ length: 9 }, () => '.'.repeat(9));
  const r = solve(open, 4, 4);
  for (let j = 0; j < 9; j++) {
    for (let i = 0; i < 9; i++) {
      /* Not "close to 1" - exactly 1. Any shortfall here is the octile
         baseline disagreeing with the eight-way step costs, and it would show
         up in the game as a permanent haze over open ground. */
      assert.ok(r.at(i, j) > 0.9999, `open cell ${i},${j} came out at ${r.at(i, j)}`);
    }
  }
});

test('a shaft is lit all the way down and the rock beside it catches the light', () => {
  const rows = [
    '###.###',
    '###.###',
    '###.###',
    '###.###',
    '###.###',
    '###.###'
  ];
  const r = solve(rows, 3, 0);
  /* the shaft itself, six cells of it */
  for (let j = 0; j < 6; j++) assert.ok(r.at(3, j) > 0.9999, `shaft row ${j}`);
  /* the wall either side of it is lit */
  assert.ok(r.at(2, 3) > 0.5, 'tunnel wall is lit');
  assert.ok(r.at(4, 3) > 0.5, 'tunnel wall is lit');
});

test('rock fades into the mass instead of cutting to black at the first wall', () => {
  const rows = Array.from({ length: 9 }, (_, j) => (j === 4 ? '.'.repeat(9) : '#'.repeat(9)));
  const r = solve(rows, 4, 4);
  const one = r.at(4, 3), two = r.at(4, 2), three = r.at(4, 1), four = r.at(4, 0);
  assert.ok(one > two && two > three && three > four, 'each cell in is darker than the last');
  /* The face of the wall is not dimmed at all - it is pointing at the lamp.
     Everything behind it is the seep, which is a fixed fraction per cell, so
     the fourth cell is under a tenth however the first one came out. */
  assert.ok(one > 0.6, 'the wall of the tunnel is clearly lit');
  assert.ok(two < 0.55, 'one cell behind the wall has already dropped by half');
  assert.ok(three < 0.25, 'three cells in is nearly dark');
  assert.ok(four < 0.1, 'four cells in is dark');
});

test('a side branch is dimmer than open air the same distance away', () => {
  /* A vertical shaft with a branch running left off the bottom of it. The
     branch's far end is four cells from the source as the crow flies and six
     along the tunnel, and the difference is the whole point of the solver. */
  const rows = [
    '#####',
    '###.#',
    '###.#',
    '###.#',
    '#...#',
    '#####'
  ];
  const r = solve(rows, 3, 1);
  const branchEnd = r.at(1, 4);
  assert.ok(branchEnd < 0.75, `round the corner should cost: got ${branchEnd}`);

  /* The same cell in a world with nothing in the way. */
  const open = solve(Array.from({ length: 6 }, () => '.'.repeat(5)), 3, 1);
  assert.ok(open.at(1, 4) > 0.9999);
  assert.ok(branchEnd < open.at(1, 4), 'the detour has to cost something');
});

test('a straight corridor invents no occlusion', () => {
  /* Nothing is in the way, so nothing is occluded, however long the corridor
     gets. The far end of it going dark is the DISTANCE falloff, and that is
     the shader's job - it is computed per pixel from the ship's exact
     position, because this grid cannot move smoothly and the ship can. */
  const rows = [
    '#########',
    '.........',
    '#########'
  ];
  const r = solve(rows, 0, 1);
  for (let i = 0; i < 9; i++) assert.ok(r.at(i, 1) > 0.9999, `corridor cell ${i}`);
});

test('light does not leak through a wall into the chamber behind it', () => {
  /* Two open cells with exactly one cell of rock between them. This is the
     assertion the whole design turns on: rock is relaxed but never expanded,
     so a lit wall cannot pass light on to open air on its far side. Get it
     wrong and every sealed pocket in the game glows faintly, which tells the
     player there is something there before they have dug to it. */
  const rows = [
    '#####',
    '#.#.#',
    '#####'
  ];
  const r = solve(rows, 1, 1);
  assert.ok(r.at(1, 1) > 0.9999, 'the source cell is lit');
  assert.ok(r.at(2, 1) > 0.4, 'the wall between them is lit on the near side');
  assert.equal(r.at(3, 1), 0, 'the sealed cell gets nothing at all');
});

test('light does not squeeze through a diagonal crack', () => {
  /* The two cells touch only at a corner, with rock on both sides of the gap.
     Eight-way movement would walk straight through that corner; a lamp does
     not. The far cell may only be reached the long way round, and here there
     is no long way round. */
  const rows = [
    '####',
    '#.##',
    '##.#',
    '####'
  ];
  const r = solve(rows, 1, 1);
  assert.equal(r.at(2, 2), 0, 'the diagonal neighbour is not reachable');
});

test('grazing one corner costs but is allowed', () => {
  /* One rock corner rather than two. Light does get round, and it arrives
     dimmed - without the cost it arrives at full strength and the corner
     produces a hard diagonal edge that reads as a rendering fault. */
  const rows = [
    '....',
    '.#..',
    '....'
  ];
  const r = solve(rows, 0, 0);
  const past = r.at(2, 2);
  assert.ok(past > 0, 'it does get round');
  assert.ok(past < 0.85, `grazing a corner should cost: got ${past}`);
});

test('the field is symmetric when the world is', () => {
  const rows = [
    '##...##',
    '##...##',
    '..#.#..',
    '#######'
  ];
  const r = solve(rows, 3, 1);
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 3; i++) {
      const a = r.at(i, j), b = r.at(6 - i, j);
      assert.ok(Math.abs(a - b) < 1e-6, `asymmetry at ${i},${j}: ${a} vs ${b}`);
    }
  }
});

test('a source outside the grid lights nothing rather than throwing', () => {
  const rows = ['...', '...', '...'];
  const r = solve(rows, -1, 1);
  for (let n = 0; n < r.out.length; n++) assert.equal(r.out[n], 0);
});

test('octile distance is the eight-way shortest path', () => {
  assert.equal(H.octile(0, 0), 0);
  assert.equal(H.octile(3, 0), 3);
  assert.ok(Math.abs(H.octile(3, 3) - 3 * Math.SQRT2) < 1e-9);
  /* four across and one down is three straight steps plus one diagonal */
  assert.ok(Math.abs(H.octile(4, 1) - (3 + Math.SQRT2)) < 1e-9);
  assert.equal(H.octile(-3, 0), 3);
});

/* ---------- scrolling the window ---------- */

/* The grid follows the ship, so every solved value has to move with it. This
   is index arithmetic against a flat array, which is exactly the kind of code
   that is off by one row for a week without anything failing - it just shows
   up as the light smearing behind you as you dig. */

const field = (rows, cols) => Float32Array.from(rows.flatMap((v) => Array(cols).fill(v)));
const rowsOf = (a, cols) => Array.from({ length: a.length / cols }, (_, j) => a[j * cols]);

test('descending scrolls the field up and clears what comes in from below', () => {
  const a = field([1, 2, 3, 4, 5], 3);
  H.shiftField(a, 3, 5, 2);
  assert.deepEqual(rowsOf(a, 3), [3, 4, 5, 0, 0]);
});

test('rising scrolls it the other way', () => {
  const a = field([1, 2, 3, 4, 5], 3);
  H.shiftField(a, 3, 5, -2);
  assert.deepEqual(rowsOf(a, 3), [0, 0, 1, 2, 3]);
});

test('standing still leaves it exactly alone', () => {
  const a = field([1, 2, 3, 4, 5], 3);
  H.shiftField(a, 3, 5, 0);
  assert.deepEqual(rowsOf(a, 3), [1, 2, 3, 4, 5]);
});

test('a jump longer than the window keeps nothing', () => {
  /* Launching to a new planet, or a tow back to the pad. Carrying one stale
     row across a move that large is worse than carrying none. */
  const a = field([1, 2, 3, 4, 5], 3);
  H.shiftField(a, 3, 5, 9);
  assert.deepEqual(rowsOf(a, 3), [0, 0, 0, 0, 0]);
  const b = field([1, 2, 3, 4, 5], 3);
  H.shiftField(b, 3, 5, -9);
  assert.deepEqual(rowsOf(b, 3), [0, 0, 0, 0, 0]);
});

test('every column of a shifted row moves together', () => {
  const a = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  H.shiftField(a, 3, 3, 1);
  assert.deepEqual(Array.from(a), [4, 5, 6, 7, 8, 9, 0, 0, 0]);
});
