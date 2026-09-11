/* The map, and the index behind it.

   The map screen itself is canvas and cannot be tested here, so what is tested
   is the part that decides what it draws: which tiles a position reveals,
   whether the fast index agrees with the list it indexes, and whether the
   coarse grid is fine enough that every region on the planet can actually be
   painted.

   The last one is the real claim. The wash is drawn one four-metre tile at a
   time and each tile is coloured from the region at its CENTRE, so a region
   narrower than a tile would exist in the world and never once appear on the
   map - a whole place you could stand in and never see drawn. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

/* Every test here writes to the one shared game state, so each one puts it
   back. Leaving `seen` populated would let a later test pass on a previous
   test's tiles. */
function withCleanSeen(fn) {
  const seen = H.g.seen.slice();
  const marks = H.g.marks.slice();
  H.g.seen = [];
  H.g.marks = [];
  H.resetSeen();
  try { fn(); } finally {
    H.g.seen = seen;
    H.g.marks = marks;
    H.resetSeen();
  }
}

test('a position reveals a disc of tiles, not a square', () => {
  /* A square of revealed map around a ship that has flown in a straight line
     reads as a corridor with corners on it. The claim that can fail: the
     corner of the bounding box is NOT revealed while the edge midpoints are. */
  const x = 30, d = 60, reach = 8;
  const got = new Set(H.tilesSeen(x, d, reach));
  assert.ok(got.has(H.mapKey(x, d)), 'the tile you are standing in must be revealed');
  assert.ok(got.has(H.mapKey(x, d - reach)), 'the tile straight above must be revealed');
  assert.ok(got.has(H.mapKey(x + reach, d)), 'the tile straight across must be revealed');
  /* The far corner of the square is reach * 1.41 away, comfortably outside. */
  assert.ok(!got.has(H.mapKey(x + reach, d + reach)),
    'the corner of the bounding square is outside the lamp and must stay dark');
});

test('the reveal is clamped to the world it is a map of', () => {
  /* Against the left wall, at the surface, with a generous lamp. Nothing may
     come back off the edge: a tile at x = -1 draws off the left of the canvas
     and a tile above the surface draws over the sky. */
  for (const k of H.tilesSeen(0, 0, 10)) {
    const [tx, ty] = k.split(',').map(Number);
    assert.ok(tx >= 0, `tile column ${tx} is off the left of the world`);
    assert.ok(ty >= 0, `tile row ${ty} is above the surface`);
    assert.ok(tx * H.MAP_TILE < H.W, `tile column ${tx} is off the right of the world`);
  }
  for (const k of H.tilesSeen(H.W - 1, 40, 10)) {
    const tx = Number(k.split(',')[0]);
    assert.ok(tx * H.MAP_TILE < H.W, `tile column ${tx} is off the right of the world`);
  }
});

test('a better Scanner fills the map faster', () => {
  /* The quiet second reason to buy one, and it has to be strictly true or the
     upgrade does nothing for exploration. Taken away from every edge so the
     clamping above cannot be what makes the numbers differ. */
  const small = H.tilesSeen(30, 100, 4).length;
  const big = H.tilesSeen(30, 100, 12).length;
  assert.ok(big > small, `reach 12 revealed ${big} tiles, reach 4 revealed ${small}`);
});

test('the index and the list it indexes cannot drift apart', () => {
  withCleanSeen(() => {
    H.markSeen(['1,1', '2,2', '1,1']);
    assert.equal(H.g.seen.length, 2, 'markSeen must not store a tile twice');

    /* The failure this exists for: a load replaces `seen` wholesale, and an
       index built from the OLD list then believes every tile in the new one is
       already recorded, so nothing is ever written again. The rebuild is what
       stops that, and without it this assertion fails. */
    H.g.seen = ['9,9'];
    H.resetSeen();
    H.markSeen(['1,1', '9,9']);
    assert.deepEqual(H.g.seen.sort(), ['1,1', '9,9'],
      'after a wholesale replacement the index must be rebuilt from the new list');
  });
});

test('a discovery is marked once per cell, and the kinds stay apart', () => {
  withCleanSeen(() => {
    H.addMark('c', 12, 80);
    H.addMark('c', 12, 80);
    assert.equal(H.g.marks.length, 1, 'a cache re-opened by a bomb must not stack marks');
    H.addMark('f', 12, 80);
    assert.equal(H.g.marks.length, 2, 'a device and a cache in one cell are two marks');
    assert.deepEqual(H.g.marks, ['c,12,80', 'f,12,80']);
  });
});

test('every region is wide enough and deep enough to be drawn on the map', () => {
  /* Sampled the way the map samples: one region lookup at the centre of each
     four-metre tile, across the whole world. Any region that never comes back
     is a place that exists in the rock and is invisible on the map. */
  const drawn = new Set();
  for (let ty = 0; ty * H.MAP_TILE < H.WORLD_DEPTH; ty++) {
    for (let tx = 0; tx * H.MAP_TILE < H.W; tx++) {
      drawn.add(H.regionAt(tx * H.MAP_TILE + H.MAP_TILE / 2, ty * H.MAP_TILE + H.MAP_TILE / 2));
    }
  }
  for (let i = 0; i < H.REGION_COUNT; i++) {
    assert.ok(drawn.has(i),
      `${H.regionName(i)} never appears at a tile centre - it can never be painted on the map`);
  }
});

test('a flight down the shaft leaves an unbroken trail on the map', () => {
  /* The sampling claim, and the one that decides whether the map has holes in
     it. The loop records on the climb timer - about every 0.35 s - so at full
     speed the samples are a few cells apart, and the lamp's radius has to be
     wide enough to close the gap between them.

     Driven at worse than the worst case the game can produce: the fastest
     thrust against a lamp smaller than any that exists.

     A stock Scanner is light() 8 and the recorder uses 70% of it, so the real
     smallest reach is 5.6 - no trait reduces it, crystalline is the only one
     that touches reach and it raises it. Top thrust is 3.0 + 9 * 0.7 = 9.3
     cells a second against a 0.35 s timer, so the ship covers at most 3.3
     cells between samples. Tested at reach 4 over steps of 4. */
    const reach = 4;
    const step = 4;
    const rows = new Set();
    for (let d = 10; d < 120; d += step) {
      for (const k of H.tilesSeen(30, d, reach)) rows.add(Number(k.split(',')[1]));
    }
    const sorted = Array.from(rows).sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) {
      assert.equal(sorted[i], sorted[i - 1] + 1,
        `the trail skips tile row ${sorted[i - 1] + 1} - the map would have a hole in it`);
    }
});
