/* The planet answering.

   Terraria's Hardmode edits the world the player already has rather than
   building more of it, and that is the whole of W8. Three changes fire at the
   fifth Anchor of nine, and each of them has a way of being wrong that looks
   fine from the outside:

   1. UNREST STEPS, once. A step that can be paid twice - by a save reload, by
      a ninth Anchor - is a planet that quietly ratchets itself to maximum.
   2. THE GROUND CLOSES, and it must never close the way out, never close
      quiet ground, and never close with rock.
   3. SOMETHING GROWS, and it must generate NOWHERE before the wake, or the
      whole device is just an ore nobody noticed.

   And one that is not a mechanism at all but is the reason this exists: waking
   the planet has to be worth doing. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

function fresh() {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  H.g.ground = H.newGround();
  return H.g.ground;
}

/* ---------- the step ---------- */

test('the planet answers at the fifth Anchor, not the first and not the last', () => {
  const s = fresh();
  assert.equal(H.WAKE_AT, 5, 'the wake is meant to leave a whole second act after it');
  for (let i = 0; i < H.WAKE_AT - 1; i++) {
    H.lightAnchor(s, i);
    assert.equal(H.isAwake(s), false, `the planet woke at ${i + 1} Anchors`);
  }
  H.lightAnchor(s, H.WAKE_AT - 1);
  assert.equal(H.isAwake(s), true, `the planet did not wake at ${H.WAKE_AT} Anchors`);
});

test('the step is not paid before the fifth Anchor', () => {
  /* The bug this exists for, and it shipped for an hour: wake() checked only
     whether the planet had already woken, not whether it was TIME - so the
     first Anchor of nine set the flag and the whole second act fired in the
     first ten minutes.

     Every fixture missed it for the same reason: they lit the early Anchors
     through the state directly and only the last one through the real path,
     so the first call wake() ever saw was always the fifth. */
  const s = fresh();
  assert.equal(H.wake(s), false, 'the planet woke with no Anchors lit at all');
  for (let i = 0; i < H.WAKE_AT - 1; i++) {
    H.lightAnchor(s, i);
    assert.equal(H.wake(s), false, `the planet woke at ${i + 1} Anchors`);
    assert.equal(s.woke, false);
  }
  H.lightAnchor(s, H.WAKE_AT - 1);
  assert.equal(H.wake(s), true, 'the planet did not wake at the fifth');
});

test('the step is paid once, whatever happens afterwards', () => {
  /* The failure this exists for: `woke` is stored rather than derived, and a
     stored flag that the apply path does not check is a planet that ratchets
     itself to maximum - once per Anchor after the fifth, once per save
     reload, once per anything that calls it. */
  const s = fresh();
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.2;
  assert.equal(H.wake(s), true);
  const after = s.unrest.slice();
  assert.ok(Math.abs(after[0] - (0.2 + H.WAKE_STEP)) < 1e-9,
    `the step moved Unrest to ${after[0]} rather than ${0.2 + H.WAKE_STEP}`);

  assert.equal(H.wake(s), false, 'the wake reported itself as new a second time');
  assert.deepEqual(s.unrest, after, 'the step was paid twice');

  /* And across a save. */
  const back = H.loadGround(JSON.parse(JSON.stringify(s)));
  assert.equal(back.woke, true, 'the planet forgot it had woken');
  assert.equal(H.wake(back), false, 'a reload paid the step again');
});

test('the step lifts every region, and cannot push one over the top', () => {
  const s = fresh();
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = i / (H.REGION_COUNT - 1);
  const before = s.unrest.slice();
  H.wake(s);
  for (let i = 0; i < H.REGION_COUNT; i++) {
    assert.ok(s.unrest[i] >= before[i], `region ${i} got calmer when the planet woke`);
    assert.ok(s.unrest[i] <= 1, `region ${i} is at ${s.unrest[i]}`);
  }
  assert.ok(s.unrest[0] > before[0], 'the calmest region was not touched at all');
});

test('every cell cut costs more after the wake', () => {
  const asleep = H.unrestPerCell(200, false);
  const awake = H.unrestPerCell(200, true);
  assert.ok(awake > asleep, 'waking the planet changed nothing about cutting it');
  assert.ok(awake / asleep < 2,
    `a cell costs ${(awake / asleep).toFixed(2)}x after the wake - the back half stops being playable`);
  /* And the state carries it, not just the argument. */
  const s = fresh();
  const r = H.cutCell(s, 30, 200);
  const quiet = s.unrest[r];
  s.unrest[r] = 0;
  s.woke = true;
  H.cutCell(s, 30, 200);
  assert.ok(s.unrest[r] > quiet, 'cutCell ignores whether the planet is awake');
});

/* ---------- something grows ---------- */

test('a Bloom generates nowhere at all until the planet answers', () => {
  /* If it generated before, the whole device would be an ore nobody noticed
     arriving. Swept over the world rather than sampled: a 1.25% material can
     miss any given band by luck, and "none anywhere" is not a thing luck can
     produce over twenty-seven thousand cells. */
  fresh();
  let asleep = 0;
  for (let d = 0; d < H.WORLD_DEPTH; d++) {
    for (let x = 0; x < H.W; x += 2) {
      const b = H.blockAt(x, d);
      if (b && b.id === 'bloom') asleep++;
    }
  }
  assert.equal(asleep, 0, `${asleep} Blooms generated on a planet that has not woken`);

  const s = H.g.ground;
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  assert.equal(H.isAwake(s), true);
  let awake = 0, shallow = 0;
  for (let d = 0; d < H.WORLD_DEPTH; d++) {
    for (let x = 0; x < H.W; x += 2) {
      const b = H.blockAt(x, d);
      if (b && b.id === 'bloom') { awake++; if (d < 60) shallow++; }
    }
  }
  assert.ok(awake > 50, `only ${awake} Blooms in the whole woken world`);
  /* In the FIRST HOUR'S ground, which is the entire point - a map you filled
     in becoming unfamiliar, not a new band at the bottom nobody has reached. */
  assert.ok(shallow > 5,
    `${shallow} Blooms above 60 m - the ground the player already knows is unchanged`);
  fresh();
});

test('waking the planet is worth doing', () => {
  /* The fence against W8 being a punishment for playing well. It costs a
     permanent step in Unrest and ground that closes behind you, so it has to
     pay - and it has to pay in the shallow ground, where the cost lands. */
  const b = H.BLOOM;
  const shallowOres = H.ORES.filter((o) => o.min <= 60);
  const best = Math.max(...shallowOres.map((o) => o.value / o.wt));
  assert.ok(b.value / b.wt > best * 2,
    `a Bloom pays ${(b.value / b.wt).toFixed(0)} a kilo against ${best.toFixed(0)} for the best ` +
    'shallow ore - it is not worth the hold space it takes');
  assert.ok(b.min < 10, `Blooms start at ${b.min} m, which is not "the ground you already know"`);

  /* And it must not eat the deep. A Bloom is an overwriter, so unbounded it
     lands on Solmarrow and Umbrite - cells worth twenty and forty times as
     much - and the reward for waking the planet becomes a tax on it. */
  const deepest = H.ORES.filter((o) => o.min >= H.BLOOM_MAX);
  assert.ok(deepest.length >= 3,
    `only ${deepest.length} ores live below the Bloom line - it is not protecting the deep`);
  for (const o of deepest) {
    assert.ok(o.value > b.value,
      `${o.name} is worth less than a Bloom, so the line is in the wrong place`);
  }
});

test('a Bloom overwrites, and never moves the ore under it', () => {
  /* The same invariant the frozen baseline defends, checked directly for the
     one thing that can be switched on mid-save: turning the wake on must
     change a cell's CONTENTS and never any other cell's. */
  fresh();
  const before = [];
  for (let d = 0; d < 200; d++) for (let x = 0; x < H.W; x += 3) {
    const b = H.blockAt(x, d);
    before.push(b ? b.id : '(empty)');
  }
  const s = H.g.ground;
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  let i = 0, changed = 0;
  for (let d = 0; d < 200; d++) for (let x = 0; x < H.W; x += 3) {
    const b = H.blockAt(x, d);
    const now = b ? b.id : '(empty)';
    const was = before[i++];
    if (now === was) continue;
    assert.equal(now, 'bloom',
      `(${x},${d}) went from ${was} to ${now} when the planet woke - the ore stream moved`);
    changed++;
  }
  assert.ok(changed > 0, 'nothing at all changed when the planet woke');
  fresh();
});

/* ---------- the ground closes ---------- */

const rand = (() => { let i = 0; return () => { i = (i * 1103515245 + 12345) % 2147483648; return i / 2147483648; }; })();

test('a sleeping planet never closes anything, however angry the ground is', () => {
  /* The first version of this ran on a planet with zero Unrest everywhere,
     so it passed with the awake check deleted - nothing was above the
     Restless line either way and the test proved only that calm ground is
     calm. Two separate guards need two separate tests, and this one has to
     hold the OTHER guard wide open. */
  const s = fresh();
  for (let d = 20; d < 200; d++) H.g.dug.add('30,' + d);
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 1;
  const n = H.g.dug.size;
  assert.equal(H.isAwake(s), false);
  assert.equal(H.planClose(rand).length, 0,
    'a planet that has not answered closed tunnels anyway');
  assert.equal(H.g.dug.size, n);
  fresh();
});

test('calm ground never closes, however awake the planet is', () => {
  /* And the mirror: awake, and every region under the Restless line. */
  const s = fresh();
  for (let d = 20; d < 200; d++) H.g.dug.add('30,' + d);
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0;
  const n = H.g.dug.size;
  assert.equal(H.isAwake(s), true);
  assert.equal(H.planClose(rand).length, 0, 'calm ground closed up');
  assert.equal(H.g.dug.size, n, 'calm ground closed up');
  fresh();
});

test('restless ground closes, and angrier ground closes faster', () => {
  const s = fresh();
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);

  const run = (u) => {
    H.g.dug = new Set();
    H.g.rubble = new Set();
    for (let d = 20; d < 220; d++) H.g.dug.add('30,' + d);
    for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = u;
    return H.planClose(rand).length;
  };
  const some = run(0.6), lots = run(1.0);
  assert.ok(some > 0, 'restless ground closed nothing at all');
  assert.ok(lots > some,
    `ground at maximum Unrest closed ${lots} m against ${some} at 0.6 - the meter does not drive it`);
  fresh();
});

test('what closes is rubble you can dig, and it is never the way off the pad', () => {
  const s = fresh();
  for (let i = 0; i < H.WAKE_AT; i++) H.lightAnchor(s, i);
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 1;
  for (let d = 0; d < 200; d++) H.g.dug.add(H.START_X + ',' + d);

  const taken = H.planClose(rand);
  assert.ok(taken.length > 0);
  for (const k of taken) {
    assert.ok(H.g.rubble.has(k), `${k} closed into nothing at all`);
    assert.ok(!H.g.dug.has(k), `${k} is both closed and open`);
    const b = H.blockAt(+k.split(',')[0], +k.split(',')[1]);
    /* Rubble, which is diggable. Rock would be a hazard taking the run, which
       `CRAFT.md` forbids outright. */
    assert.equal(b.id, 'rubble', `${k} closed into ${b.id} rather than rubble`);
    assert.ok(Number.isFinite(b.hard) && b.hard > 0);
  }
  /* And the pad's own column, which has to stay open or leaving is something
     you dig out of.

     Run to EXHAUSTION rather than once. A single pass takes a tenth of the
     tunnels, so the nine protected cells survive one call by luck most of the
     time - the first version of this passed with the guard deleted, which is
     the same "a rare thing cannot be tested by sampling" trap this repo has
     hit before. Closing until nothing more will close removes the luck: with
     no guard, every cell in the pool goes eventually. */
  for (let pass = 0; pass < 200; pass++) {
    if (!H.planClose(rand).length) break;
  }
  for (let d = 0; d <= H.CLOSE_SAFE; d++) {
    assert.ok(H.g.dug.has(H.START_X + ',' + d),
      `the pad's shaft closed at ${d} m - the way down has to always start open`);
  }
  /* And the rest of that column really did go, so the loop above was not
     stopped by something unrelated. */
  assert.ok(!H.g.dug.has(H.START_X + ',' + 150),
    'nothing closed at all, so the exhaustion loop proves nothing');
  fresh();
});
