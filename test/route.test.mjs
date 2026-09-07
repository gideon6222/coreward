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
  H.g.planet = 0;
  H.g.dug = new Set();
  for (let d = 0; d <= 10; d++)
    for (let x = H.START_X - 1; x <= H.START_X + 1; x++) H.g.dug.add(H.key(x, d));
  H.g.px = H.START_X - 1;
  H.g.pd = 10;
}

/* An L-shaped tunnel: straight down, then across. Only one route exists. */
function elbow() {
  H.g.planet = 0;
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
  H.g.planet = 0;
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
  H.g.planet = 0;
  H.g.dug = new Set([H.key(H.START_X, 50)]);
  H.g.px = H.START_X;
  H.g.pd = 50;
  assert.equal(H.findRoute(), null, 'a sealed pocket must not produce a route');
});

test('no route when already at the pad', () => {
  H.g.planet = 0;
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
