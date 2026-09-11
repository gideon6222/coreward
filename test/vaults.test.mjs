/* The Anchors, and the rooms they are in.

   This is the first authored content in a world that has been entirely
   generated until now, and authored content fails differently: a generator
   fails by producing something wrong, and a stamp fails by producing something
   INCOMPLETE - half a room, a wall with nothing behind it, a door across the
   only way down.

   So the properties here are mostly about wholeness:

   1. every Anchor is inside its own region, room and all
   2. no room overlaps another, and none is clipped by the edge of the world
   3. every hall is actually sealed by its own walls - you break in
   4. a locked door never locks the planet: with no key at all, every depth is
      still reachable
   5. and the key is never behind the door it opens */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();
const VAULT = H.vaultCells();

/* ---------- where they are ---------- */

test('there are nine Anchors and none of them is in the deepest row', () => {
  assert.equal(H.ANCHOR_COUNT, 9);
  const band = H.WORLD_DEPTH / H.REGION_ROWS;
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    assert.ok(a.d < band * (H.REGION_ROWS - 1),
      `${H.regionName(r)}'s Anchor is at ${a.d} m, inside the row the Vault owns`);
  }
});

test('every Anchor hall is inside its own region, corner to corner', () => {
  /* The insets in anchorAt are a claim about how far a wandering region
     boundary can move, and "far enough" is exactly the sort of claim that is
     wrong by two. Checked at the room's corners, not at its centre - a centre
     that is inside proves nothing about a room eleven cells wide. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    assert.ok(H.anchorInRegion(r),
      `${H.regionName(r)}'s Anchor hall crosses out of its own region`);
  }
});

test('the Anchors are spread across the planet, not stacked in a column', () => {
  /* "Spread wide as much as deep" is the design's own wording and the whole
     reason the world got to 61 columns. A set of Anchors that all sat near the
     pad would be the old game with extra steps. */
  const xs = [], ds = [];
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    xs.push(a.x); ds.push(a.d);
  }
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanD = Math.max(...ds) - Math.min(...ds);
  assert.ok(spanX > H.W * 0.5,
    `the Anchors span ${spanX} of ${H.W} columns - they are not spread wide`);
  assert.ok(spanD > H.WORLD_DEPTH * 0.4,
    `the Anchors span ${spanD} m of ${H.WORLD_DEPTH} - they are not spread deep`);
});

/* ---------- wholeness ---------- */

test('no room is clipped by the edge of the world', () => {
  /* A clipped room is a wall with no room behind it, which is the worst thing
     this system can produce: the player cuts through worked stone and finds
     rock. Checked as "every stamped cell is in bounds", which the stamp
     enforces by dropping cells - so this is really checking that no room was
     PLACED anywhere it would have to be dropped from. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    const half = (H.VAULT_W - 1) / 2;
    assert.ok(a.x - half >= 0 && a.x + half < H.W,
      `${H.regionName(r)}'s hall runs off the side of the world at x ${a.x}`);
    assert.ok(a.d - (H.VAULT_H - 1) / 2 >= 1,
      `${H.regionName(r)}'s hall runs into the sky at ${a.d} m`);
  }
  /* And every stamped cell really is inside the world. */
  for (const k of VAULT.keys()) {
    const i = k.indexOf(',');
    const x = +k.slice(0, i), d = +k.slice(i + 1);
    assert.ok(x >= 0 && x < H.W, `a room cell sits at column ${x}`);
    assert.ok(d >= 1 && d < H.WORLD_DEPTH, `a room cell sits at ${d} m`);
  }
});

test('every Anchor hall is shut, so getting in is always a decision', () => {
  /* The ritual the room exists for: break in, cross the room, cut the plinth.
     It only works if the room is actually enclosed - one gap in the wall and
     an ordinary shaft wanders in without the player noticing they arrived.

     Checked on the STAMPED world rather than on the template, because the
     stamp is where a room could lose a wall to a clip or to an overlap. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    const x0 = a.x - (H.VAULT_W - 1) / 2, d0 = a.d - (H.VAULT_H - 1) / 2;
    for (let dy = 0; dy < H.VAULT_H; dy++) {
      for (let dx = 0; dx < H.VAULT_W; dx++) {
        const x = x0 + dx, d = d0 + dy;
        if (VAULT.get(x + ',' + d) !== '.') continue;
        /* Air. Every one of its four neighbours has to be part of this room -
           air, a wall, the plinth, or the Anchor. A neighbour that is not
           stamped at all is a hole in the wall. */
        for (const n of [[x, d - 1], [x, d + 1], [x - 1, d], [x + 1, d]]) {
          assert.ok(VAULT.has(n[0] + ',' + n[1]),
            `${H.regionName(r)}'s hall is open to the rock at (${n[0]},${n[1]})`);
        }
      }
    }
  }
});

test('the Anchor itself can never be mined, lit or not', () => {
  /* It is lit by standing next to it. A block you can drill out is a pickup,
     and the whole point of the plinth is that the objective is a place. */
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.ground = H.newGround();
  const a = H.anchorAt(0);
  const before = H.blockAt(a.x, a.d);
  assert.equal(before.id, 'anchor');
  assert.equal(before.hard, Infinity, 'an unlit Anchor can be drilled out');

  H.lightAnchor(H.g.ground, 0);
  const after = H.blockAt(a.x, a.d);
  assert.equal(after.id, 'anchorlit', 'a lit Anchor looks exactly like an unlit one');
  assert.equal(after.hard, Infinity, 'a lit Anchor can be drilled out');
  assert.ok(after.glow > before.glow, 'lighting an Anchor does not change how it reads');
  H.g.ground = H.newGround();
});

/* ---------- the locked door ---------- */

test('sealed stone is shut without the laser and cuts with it', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.ground = H.newGround();
  const sealedRegion = [4, 6, 8].find((r) => H.anchorSealed(r));
  const a = H.anchorAt(sealedRegion);
  /* The top-left corner of the ring, which the template makes '=' . */
  let cell = null;
  for (const k of VAULT.keys()) {
    if (VAULT.get(k) !== '=') continue;
    const i = k.indexOf(',');
    const x = +k.slice(0, i), d = +k.slice(i + 1);
    if (Math.abs(x - a.x) <= 5 && Math.abs(d - a.d) <= 4) { cell = [x, d]; break; }
  }
  assert.ok(cell, 'no sealed stone anywhere near the sealed hall');

  const held = H.g.found.slice();
  H.g.found = [];
  const shut = H.blockAt(cell[0], cell[1]);
  assert.equal(shut.id, 'sealed');
  assert.equal(shut.hard, Infinity, 'sealed stone cuts without the key');

  H.g.found = ['laser'];
  const open = H.blockAt(cell[0], cell[1]);
  assert.ok(Number.isFinite(open.hard), 'sealed stone is still shut with the key in hand');
  assert.ok(open.hard > 20, `sealed stone drills at ${open.hard} even with the key - a door should stay a door`);
  H.g.found = held;
});

test('the first Anchor you can reach is never behind a door', () => {
  /* Two mutations passed before this existed - sealing every hall, and letting
     sealed stone into the ordinary hall's walls - and neither is a bug the
     other tests can see. They are both the same failure: the player meets the
     locked door BEFORE they have met the mechanic, and a door you cannot open
     is only a promise if you already know what doors are.

     So the shallowest Anchor in the world is always open, and an ordinary hall
     has no sealed stone in it anywhere. */
  let shallow = -1, best = Infinity;
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    if (a.d < best) { best = a.d; shallow = r; }
  }
  assert.equal(H.anchorSealed(shallow), false,
    `the shallowest Anchor (${H.regionName(shallow)}, ${best} m) is sealed - the first one you meet cannot be the locked one`);

  let open = 0;
  for (let r = 0; r < H.ANCHOR_COUNT; r++) if (!H.anchorSealed(r)) open++;
  assert.ok(open >= H.ANCHOR_COUNT / 2,
    `${open} of ${H.ANCHOR_COUNT} Anchors are open - too much of the game is behind one device`);

  /* And "sealed" has to mean something: an ordinary hall with sealed stone in
     its wall is a door the player cannot tell from a wall. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    if (H.anchorSealed(r)) continue;
    const v = H.anchorVault(r);
    for (const row of v.rows) {
      assert.equal(row.indexOf('='), -1,
        `${H.regionName(r)}'s hall is open but has sealed stone in its wall`);
    }
  }
});

test('a locked door never locks the planet', () => {
  /* The one that matters. Sealed halls are placed by hand, and a hand can put
     one across the only way down - at which point a first-time player with no
     laser has a world that ends at 131 metres and no way to be told why.

     So: with NOTHING found, flood the world through everything that is not
     unbreakable and check the bottom is still reachable. This is a claim about
     the whole planet and it is checked over the whole planet. */
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.ground = H.newGround();
  const held = H.g.found.slice();
  H.g.found = [];

  const floor = H.WORLD_DEPTH - 1;
  const seen = new Set(['30,0']);
  let queue = [[30, 0]];
  let deepest = 0;
  while (queue.length) {
    const next = [];
    for (const c of queue) {
      for (const n of [[c[0], c[1] - 1], [c[0], c[1] + 1], [c[0] - 1, c[1]], [c[0] + 1, c[1]]]) {
        const x = n[0], d = n[1];
        if (x < 0 || x >= H.W || d < 0 || d > floor) continue;
        const k = x + ',' + d;
        if (seen.has(k)) continue;
        const b = H.blockAt(x, d);
        /* Passable means "a drill could get through it", so empty or finite. */
        if (b && !Number.isFinite(b.hard)) continue;
        seen.add(k);
        if (d > deepest) deepest = d;
        next.push(n);
      }
    }
    queue = next;
  }
  H.g.found = held;
  assert.equal(deepest, floor,
    `with no devices at all the world bottoms out at ${deepest} m of ${floor} - a sealed hall has walled the planet off`);

  /* And every Anchor hall that is NOT sealed can be broken into with nothing
     but a drill, which is the other half of the same promise. A hall whose
     walls the flood never reached is a room nobody can get into. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    if (H.anchorSealed(r)) continue;
    const a = H.anchorAt(r);
    assert.ok(seen.has(a.x + ',' + (a.d + 1)) || seen.has(a.x + ',' + (a.d - 1)) ||
              seen.has((a.x - 1) + ',' + a.d) || seen.has((a.x + 1) + ',' + a.d),
      `${H.regionName(r)}'s Anchor cannot be reached from the surface at all`);
  }
});

test('the key is never behind the door it opens', () => {
  /* The deadlock. The Cutting Laser's crate opens every sealed hall, so a
     crate stamped inside one is a save that cannot be finished - and the
     positions of both are seeded, so this is a thing to CHECK rather than a
     thing to assume. */
  H.setWorld(0);
  H.g.found = [];
  const crates = H.findCells();
  for (const [k] of crates) {
    assert.notEqual(VAULT.get(k), '=',
      `a device crate is inside sealed stone at ${k}`);
  }
  /* And not in the air of a sealed hall either, which would be worse: visible,
     reachable-looking, and behind a wall. */
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    if (!H.anchorSealed(r)) continue;
    const a = H.anchorAt(r);
    for (const [k] of crates) {
      const i = k.indexOf(',');
      const x = +k.slice(0, i), d = +k.slice(i + 1);
      assert.ok(Math.abs(x - a.x) > (H.VAULT_W - 1) / 2 || Math.abs(d - a.d) > (H.VAULT_H - 1) / 2,
        `a device crate is inside ${H.regionName(r)}'s sealed hall at ${k}`);
    }
  }
});

/* ---------- how much of the world is authored ---------- */

test('worked stone is rare enough to be a question', () => {
  /* The named failure mode of authored content in a seeded world is templates
     you start to recognise. The library is small, so the defence is rarity:
     meeting one has to be an event. Under a tenth of the world, and the
     stamp is nowhere near that - but the ceiling is what stops the next person
     adding forty slots because rooms are fun to write. */
  const total = H.W * H.WORLD_DEPTH;
  assert.ok(VAULT.size / total < 0.1,
    `${Math.round(1000 * VAULT.size / total) / 10}% of the planet is inside an authored room`);
  assert.ok(VAULT.size > 800, `only ${VAULT.size} authored cells in the whole world`);
});

test('the rooms that are worth nothing outnumber the rooms that pay', () => {
  /* Load-bearing, and the reason a quiet room exists at all: if every worked
     room held something, worked stone would be a reward rather than a
     question. Counted over the actual stamp rather than over the pool, because
     what matters is what got placed. */
  let pay = 0, quiet = 0;
  for (let i = 0; i < H.WILD_SLOTS; i++) {
    const s = H.wildSlot(i);
    if (s.vault.kind === 'quiet') quiet++;
    else pay++;
  }
  assert.ok(quiet > 0, 'not one empty room anywhere in the world');
  assert.ok(quiet >= pay * 0.4,
    `${quiet} empty rooms against ${pay} that hold something - finding worked stone is a reward, not a question`);
});

test('every room that was placed is stamped whole', () => {
  /* Two rooms sharing cells is one room with a wall through the middle of it.

     The first version of this test re-derived the stamp's own drop rule and
     then asserted the rule had been applied - which is a test of the
     implementation by the implementation, and it passed happily with the drop
     removed. It proved nothing.

     This asks the STAMP instead: for every room that made it into the world,
     is every cell of it exactly the character its template says? A room that
     was overwritten by another loses cells and fails here, whatever the
     placement code believes. */
  /* Each room's OWN size, not the standard one. The Vault is 15 by 13 and
     checking it against 11 by 9 reads the wrong characters out of the
     template - which this test reported, correctly, as the Vault having lost
     cells it never had. */
  const check = (cx, cd, v, what) => {
    const w = H.vaultW(v), h = H.vaultH(v);
    const x0 = cx - (w - 1) / 2, d0 = cd - (h - 1) / 2;
    for (let ry = 0; ry < h; ry++) {
      for (let rx = 0; rx < w; rx++) {
        const ch = v.rows[ry][rx];
        if (!ch || ch === ' ') continue;
        const x = x0 + rx, d = d0 + ry;
        if (x < 0 || x >= H.W || d < 1 || d >= H.WORLD_DEPTH) continue;
        assert.equal(VAULT.get(x + ',' + d), ch,
          `${what} lost its cell at (${x},${d}): expected '${ch}', found '${VAULT.get(x + ',' + d)}'`);
      }
    }
  };
  /* The PLAN, not a re-derivation of the drop rule.

     The first version of this identified a placed room by whether its centre
     cell was stamped - which is true of a room that was dropped for overlapping
     an Anchor, because the Anchor's own hall covers that cell. It reported a
     room that does not exist as having lost its walls. */
  const plan = H.vaultPlan();
  for (const p of plan) check(p.x, p.d, p.vault, `the ${p.vault.id} at (${p.x},${p.d})`);

  /* And nothing on the plan overlaps anything else on it. */
  for (let i = 0; i < plan.length; i++) {
    for (let j = i + 1; j < plan.length; j++) {
      assert.ok(
        Math.abs(plan[i].x - plan[j].x) >= (H.vaultW(plan[i].vault) + H.vaultW(plan[j].vault)) / 2 ||
        Math.abs(plan[i].d - plan[j].d) >= (H.vaultH(plan[i].vault) + H.vaultH(plan[j].vault)) / 2,
        `the ${plan[i].vault.id} at (${plan[i].x},${plan[i].d}) overlaps the ` +
        `${plan[j].vault.id} at (${plan[j].x},${plan[j].d})`);
    }
  }
  assert.ok(plan.length > H.ANCHOR_COUNT + 9,
    `only ${plan.length - H.ANCHOR_COUNT - 1} of ${H.WILD_SLOTS} wild rooms survived placement`);
});

/* ---------- lighting one ---------- */

test('lighting an Anchor pushes its region back, raises the tier, and only once', () => {
  const s = H.newGround();
  s.unrest[3] = 0.9;
  assert.equal(H.tierOf(s), 0);
  assert.equal(H.lightAnchor(s, 3), 1);
  assert.ok(s.unrest[3] <= H.UNREST_AFTER_ANCHOR,
    `lighting left ${H.regionName(3)} at ${s.unrest[3]}`);
  assert.ok(s.unrest[3] > 0,
    'lighting an Anchor wiped the region clean - it holds the ground down, it does not undo what you did');
  assert.equal(H.tierOf(s), 1);
  assert.equal(H.isLit(s, 3), true);

  /* Twice is once. The loop calls this every frame while the ship is next to
     the plinth, so a second call has to be free. */
  assert.equal(H.lightAnchor(s, 3), 1);
  assert.equal(H.tierOf(s), 1);

  /* And it does not calm anywhere else. */
  assert.equal(s.unrest[4], 0);
});

test('an Anchor never raises a region it already calmed', () => {
  /* A quiet region stays quiet: the push-back is a ceiling, not an
     assignment, so lighting an Anchor in ground you have barely touched must
     not make it angrier than it was. */
  const s = H.newGround();
  s.unrest[2] = 0.02;
  H.lightAnchor(s, 2);
  assert.equal(s.unrest[2], 0.02);
});
