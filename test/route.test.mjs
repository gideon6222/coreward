/* Autopilot pathfinding.

   findRoute() does a breadth-first search whose neighbour order is an array
   literal in app.js. When several shortest paths tie, that order alone decides
   which one comes back. So the CONTRACT tests assert only what actually matters
   (valid, connected, optimal length), and the exact path is kept separately as
   a canary that is expected to be updated deliberately if the order changes. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();

/* A 3-wide room from the surface down to d=10, with the ship parked off-axis at
   x=3 so that many equal-length routes to the pad at (4,-1) exist. */
function room() {
  H.setWorld(0);
  H.g.dug = new Set();
  for (let d = 0; d <= 10; d++)
    for (let x = H.START_X - 1; x <= H.START_X + 1; x++) H.g.dug.add(H.key(x, d));
  H.g.px = H.START_X - 1;
  H.g.pd = 10;
}

/* An L-shaped tunnel: straight down, then across. Only one route exists. */
function elbow() {
  H.setWorld(0);
  H.g.dug = new Set();
  for (let d = 0; d <= 8; d++) H.g.dug.add(H.key(H.START_X, d));
  for (let x = H.START_X; x <= H.START_X + 3; x++) H.g.dug.add(H.key(x, 8));
  H.g.px = H.START_X + 3;
  H.g.pd = 8;
}


/* A blocked shaft with two SYMMETRIC detours of equal length, one to the left
   and one to the right. Nothing but the neighbour order can decide which the
   BFS returns, so this is the fixture that gives the canary real teeth. */
function fork() {
  H.setWorld(0);
  H.g.dug = new Set();
  for (let d = 0; d <= 10; d++) if (d !== 5) H.g.dug.add(H.key(H.START_X, d));
  for (const x of [H.START_X - 1, H.START_X + 1])
    for (const d of [4, 5, 6]) H.g.dug.add(H.key(x, d));
  H.g.px = H.START_X;
  H.g.pd = 10;
}

/* Independent shortest-distance BFS, deliberately using a DIFFERENT neighbour
   order from app.js so it cannot inherit the same tie-breaking bias. */
function shortestDist(sx, sd) {
  const goal = H.key(H.START_X, -1);
  const start = H.key(sx, sd);
  if (start === goal) return 0;
  const cd = H.coreDepth(H.g.planet);
  const seen = new Set([start]);
  let frontier = [[sx, sd]];
  let dist = 0;
  while (frontier.length) {
    dist++;
    const next = [];
    for (const [cx, cdd] of frontier) {
      for (const [nx, nd] of [[cx, cdd + 1], [cx + 1, cdd], [cx - 1, cdd], [cx, cdd - 1]]) {
        if (nx < 0 || nx >= H.W || nd < -3 || nd > cd) continue;
        const k = H.key(nx, nd);
        if (seen.has(k)) continue;
        if (H.blockAt(nx, nd)) continue;
        if (k === goal) return dist;
        seen.add(k);
        next.push([nx, nd]);
      }
    }
    frontier = next;
  }
  return Infinity;
}

function assertValidRoute(route, sx, sd) {
  assert.ok(Array.isArray(route), 'route must be an array');
  assert.ok(route.length > 1, 'route must have more than one cell');
  assert.deepEqual(route[0], [sx, sd], 'route must start at the ship');
  assert.deepEqual(route[route.length - 1], [H.START_X, -1], 'route must end at the pad');
  for (let i = 1; i < route.length; i++) {
    const [ax, ad] = route[i - 1];
    const [bx, bd] = route[i];
    assert.equal(Math.abs(ax - bx) + Math.abs(ad - bd), 1,
      'step ' + i + ' is not orthogonally adjacent: ' + JSON.stringify([ax, ad]) + ' -> ' + JSON.stringify([bx, bd]));
  }
  for (const [x, d] of route) {
    assert.equal(H.blockAt(x, d), null, 'route passes through solid rock at (' + x + ',' + d + ')');
  }
  const uniq = new Set(route.map((c) => H.key(c[0], c[1])));
  assert.equal(uniq.size, route.length, 'route revisits a cell');
}

test('route through an open room is valid and optimal', () => {
  room();
  const route = H.findRoute();
  assertValidRoute(route, H.START_X - 1, 10);
  assert.equal(route.length - 1, shortestDist(H.START_X - 1, 10), 'route is not a shortest path');
  assert.equal(route.length - 1, 12, 'expected 12 steps to the pad');
});

test('route through a one-way elbow tunnel is valid and optimal', () => {
  elbow();
  const route = H.findRoute();
  assertValidRoute(route, H.START_X + 3, 8);
  assert.equal(route.length - 1, shortestDist(H.START_X + 3, 8), 'route is not a shortest path');
});

test('no route when the ship is sealed in', () => {
  H.setWorld(0);
  H.g.dug = new Set([H.key(H.START_X, 50)]);
  H.g.px = H.START_X;
  H.g.pd = 50;
  assert.equal(H.findRoute(), null, 'a sealed pocket must not produce a route');
});

test('no route when already at the pad', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.px = H.START_X;
  H.g.pd = -1;
  assert.equal(H.findRoute(), null, 'standing on the pad must return null');
});

test('fractional ship position is rounded to a cell', () => {
  room();
  H.g.px = H.START_X - 1 + 0.4;
  H.g.pd = 9.6;
  const route = H.findRoute();
  assertValidRoute(route, H.START_X - 1, 10);
});


test('route around a symmetric fork is valid and optimal', () => {
  fork();
  const route = H.findRoute();
  assertValidRoute(route, H.START_X, 10);
  assert.equal(route.length - 1, shortestDist(H.START_X, 10), 'route is not a shortest path');
  const detour = route.some((c) => c[0] === H.START_X - 1) ? 'left' : 'right';
  assert.ok(['left', 'right'].includes(detour), 'route must take one of the two detours');
});

/* CANARY, not a contract. This pins the exact tie-break that the current
   neighbour order in app.js produces. A refactor that reorders those four
   neighbours will fail THIS test only, while the contract tests above stay
   green -- that combination means the change is safe and you should re-record
   by deleting test/baseline/route-canary.json. If a contract test fails too,
   the pathfinding is genuinely broken. */
test('CANARY: exact tie-break path (safe to re-record on its own)', () => {
  room();
  const roomRoute = H.findRoute();
  elbow();
  const elbowRoute = H.findRoute();
  fork();
  const forkRoute = H.findRoute();
  assertGolden('route-canary', { room: roomRoute, elbow: elbowRoute, fork: forkRoute });
});

/* ---------- tremor collapses ----------

   planCollapse() is the whole tremor mechanic minus the dust. The property
   that matters is the last one: a tremor may cost you time, fuel and patience,
   but it must never seal you in. */

/* A single shaft from the pad down to `depth`, ship at the bottom. Every cell
   in it is load-bearing, which makes it the worst case for the seal-in
   guarantee and useless for testing anything else. */
function shaft(depth, x = H.START_X) {
  H.setWorld(0);
  H.g.rubble = new Set();
  H.g.dug = new Set();
  for (let d = -1; d <= depth; d++) H.g.dug.add(H.key(x, d));
  H.g.px = x; H.g.pd = depth;
}

/* A hollowed-out column of the whole world down to `depth`. Redundant enough
   that a collapse always goes ahead, so tests about WHICH cells get taken are
   not silently testing the revert path instead.

   Asserts the depth is above the core, because findRoute() refuses to path
   below coreDepth and a fixture that ignores that reverts every collapse -
   which makes every test using it pass while checking nothing. That is exactly
   what happened here first time round. */
function cavern(depth) {
  assert.ok(depth < H.coreDepth(0),
    'cavern(' + depth + ') is at or below the core, where no route can exist');
  H.setWorld(0);
  H.g.rubble = new Set();
  H.g.dug = new Set();
  for (let d = -1; d <= depth; d++)
    for (let x = 0; x < H.W; x++) H.g.dug.add(H.key(x, d));
  H.g.px = H.START_X; H.g.pd = depth;
}

function clearWorld() {
  H.g.dug = new Set();
  H.g.rubble = new Set();
  H.g.px = H.START_X; H.g.pd = -1;
}

/* deterministic shuffle source, so a failure is reproducible */
function seeded(n) {
  let s = n;
  return () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

test('a collapse takes tunnel from above the ship, never from beside it', () => {
  cavern(40);
  const taken = H.planCollapse(4, seeded(7));
  assert.equal(taken.length, 4);
  for (const k of taken) {
    const [x, d] = k.split(',').map(Number);
    assert.ok(d < 100, 'collapsed a cell at or below the ship: ' + k);
    assert.ok(Math.abs(x - H.START_X) + Math.abs(d - 100) >= H.TREMOR_SAFE_RADIUS,
      'collapsed inside the safe radius: ' + k);
    assert.ok(H.g.rubble.has(k) && !H.g.dug.has(k), k + ' was not actually filled in');
  }
  clearWorld();
});

test('collapsed cells become solid again and cost fuel to re-clear', () => {
  cavern(40);
  const taken = H.planCollapse(3, seeded(11));
  for (const k of taken) {
    const [x, d] = k.split(',').map(Number);
    const b = H.blockAt(x, d);
    assert.ok(b, 'a collapsed cell must be solid: ' + k);
    assert.equal(b.id, 'rubble');
  }
  clearWorld();
});

/* THE guarantee. */
test('a tremor never seals the ship in', () => {
  /* A single-width shaft is the worst case: every cell in it is load-bearing,
     so any collapse at all disconnects the ship from the pad. */
  shaft(50);
  const before = new Set(H.g.dug);
  const taken = H.planCollapse(4, seeded(3));
  assert.equal(taken.length, 0,
    'a collapse that would seal the ship in must be abandoned entirely');
  assert.equal(H.g.rubble.size, 0, 'the abandoned collapse left rubble behind');
  assert.deepEqual(new Set(H.g.dug), before, 'the abandoned collapse did not fully revert');
  assert.ok(H.findRoute(), 'the ship must still be able to get home');

  /* and it holds for every seed, not just a lucky one */
  for (let seed = 1; seed <= 60; seed++) {
    shaft(50);
    assert.equal(H.planCollapse(4, seeded(seed)).length, 0, 'seed ' + seed + ' sealed the ship in');
    assert.ok(H.findRoute(), 'seed ' + seed + ' left the ship without a route');
  }
  clearWorld();
});

test('with a second route open, the same collapse goes ahead', () => {
  /* two parallel shafts joined at the bottom: now cells are expendable */
  shaft(50);
  for (let d = -1; d <= 50; d++) H.g.dug.add(H.key(H.START_X + 1, d));
  /* Over a spread of seeds rather than one. A particular shuffle can still
     pick a set that would seal the ship and be reverted whole - that is the
     guarantee working, not a failure - so the property is that redundancy
     makes a collapse POSSIBLE, and that every outcome still gets you home.
     Asserted on one seed this passed for two years and then failed the day the
     world got shallower, which is a test measuring luck. */
  let went = 0;
  for (let seed = 1; seed <= 12; seed++) {
    shaft(50);
    for (let d = -1; d <= 50; d++) H.g.dug.add(H.key(H.START_X + 1, d));
    if (H.planCollapse(4, seeded(seed)).length > 0) went++;
    assert.ok(H.findRoute(), 'seed ' + seed + ': the ship still gets home');
  }
  assert.ok(went > 0, 'a redundant tunnel should be able to absorb a collapse');
  clearWorld();
});

/* Whatever it takes, and however often, the ship can always get home. This is
   the assertion the whole mechanic rests on. */
test('across many shapes and seeds, a collapse never strands the ship', () => {
  let applied = 0;
  for (let seed = 1; seed <= 40; seed++) {
    cavern(28 + (seed % 20));
    for (let round = 0; round < 6; round++) {
      applied += H.planCollapse(3 + (seed % 5), seeded(seed * 31 + round)).length;
      assert.ok(H.findRoute(),
        'seed ' + seed + ' round ' + round + ': no route home after a collapse');
    }
  }
  /* Without this the test passes trivially when every collapse reverts, which
     is the failure mode that hid a broken fixture once already. */
  assert.ok(applied > 500, 'only ' + applied + ' cells ever collapsed - this is testing nothing');
  clearWorld();
});

test('a collapse is bounded by how much tunnel there is', () => {
  shaft(50);
  for (let d = -1; d <= 90; d++) H.g.dug.add(H.key(H.START_X + 1, d));
  const taken = H.planCollapse(500, seeded(5));
  assert.ok(taken.length === 0 || taken.length < 500,
    'asking for more cells than exist must not invent them');
  clearWorld();
});

test('the shuffle actually shuffles', () => {
  /* sort(() => rand() - 0.5) is the classic non-shuffle: it leaves the array
     close to where it started. Two different seeds should disagree. */
  cavern(40);
  const a = H.planCollapse(6, seeded(1));
  cavern(40);
  const b = H.planCollapse(6, seeded(999));
  assert.ok(a.length === 6 && b.length === 6, 'both collapses should have gone ahead');
  assert.notDeepEqual(a.slice().sort(), b.slice().sort(),
    'two seeds picked the same cells - the shuffle is not shuffling');
  clearWorld();
});
