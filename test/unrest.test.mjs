/* Unrest and the Ballast.

   The Claim's tests proved three buildings took damage and that repairing them
   put the numbers back. None of that survives, and it should not: the
   properties worth holding are different now, because the thing at stake is
   different.

   Four of them, and they are the ones that stop this system being either
   toothless or a death spiral:

   1. Digging is what makes the ground angry, it costs more the deeper you go,
      and nowhere is free.
   2. The Ballast runs out on a clock a player can plan against, and feeding it
      costs something they wanted for something else.
   3. A collapse can never take the pad's region, the ship's region, or a
      region that is already down.
   4. A collapse leaves a planet you can come back from. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const fresh = () => H.newGround();

/* ---------- Unrest ---------- */

test('nowhere is free, and the deep is worse', () => {
  /* The strain this replaced was exactly zero above a stability line, which
     quietly said the top half of the world cost nothing. Everything you cut
     raises it now - that is the plan's own wording - so the shallowest cell in
     the game still has to move the meter. */
  assert.ok(H.unrestPerCell(0) > 0, 'a cell at the surface has to cost something');
  assert.ok(H.unrestPerCell(1) > 0);
  const top = H.unrestPerCell(0);
  const floor = H.unrestPerCell(H.WORLD_DEPTH);
  assert.ok(floor > top * 2,
    `the floor costs ${(floor / top).toFixed(2)}x the surface - depth has to be felt`);
  /* And it is monotonic the whole way, which is what makes "twice as deep,
     twice the anger" a relationship the player can actually learn. */
  let prev = -1;
  for (let d = 0; d <= H.WORLD_DEPTH; d += 10) {
    const v = H.unrestPerCell(d);
    assert.ok(v >= prev, `unrest per cell dipped at ${d} m`);
    prev = v;
  }
});

test('cutting one region leaves the others alone', () => {
  /* The whole reason Unrest is per region rather than one planet-wide number:
     working a place hard and then going somewhere else has to be a real move,
     and it is not if the meter follows you. */
  const s = fresh();
  const r = H.cutCell(s, 30, 120);
  assert.ok(s.unrest[r] > 0, 'the region that was cut must be the one that rose');
  let others = 0;
  for (let i = 0; i < H.REGION_COUNT; i++) if (i !== r) others += s.unrest[i];
  assert.equal(others, 0, 'cutting one region raised another one');
});

test('a region gets loud in about a dozen visits, not in one and not in a hundred', () => {
  /* The number that decides whether this system is felt at all, checked
     against a real campaign rather than by eye. A run cuts 120-200 cells and
     most of them land in one place, so 60 a run in one region is the honest
     figure. */
  const s = fresh();
  const PER_RUN = 60;
  let runs = 0;
  const r = H.cutCell(s, 30, 150);
  while (s.unrest[r] < H.UNREST_BANDS[2].at && runs < 200) {
    for (let i = 0; i < PER_RUN; i++) H.cutCell(s, 30, 150);
    runs++;
  }
  assert.ok(runs >= 5 && runs <= 30,
    `working one region took ${runs} runs to reach Grinding - under five is a tax, over thirty is decoration`);
});

test('every band changes a rule, and calm ground changes nothing', () => {
  /* The same test the traits had to pass, for the same reason: a band that
     only changes a colour on the map is weather, not a place. */
  assert.equal(H.unrestBand(0), 0);
  assert.equal(H.tremorScale(0), 1, 'calm ground must shake exactly as often as it always did');
  assert.equal(H.hardScale(0), 1, 'calm ground must drill exactly as fast as it always did');
  let prevT = 0, prevH = 0;
  for (let i = 0; i < H.UNREST_BANDS.length; i++) {
    const u = Math.min(1, H.UNREST_BANDS[i].at + 0.01);
    assert.equal(H.unrestBand(u), i, `${H.UNREST_BANDS[i].name} does not start at ${H.UNREST_BANDS[i].at}`);
    const t = H.tremorScale(u), h = H.hardScale(u);
    assert.ok(t >= prevT && h >= prevH, `${H.UNREST_BANDS[i].name} is not worse than the band below it`);
    assert.ok(t > prevT || h > prevH, `${H.UNREST_BANDS[i].name} changes no rule at all`);
    prevT = t; prevH = h;
  }
  /* And the invisible one stays small. A hardness multiplier is the most
     expensive-but-unreadable thing that can be done to a mining game. */
  assert.ok(H.hardScale(1) < 1.5,
    `the angriest ground drills ${H.hardScale(1).toFixed(2)}x slower, which reads as a broken drill`);
});

/* ---------- the Ballast ---------- */

test('a full Ballast lasts several runs, and a furious planet costs you a couple', () => {
  /* Written against the clock on purpose. The pacing claim in the design is
     "never urgent inside a run, always present across an evening", and a run
     is about three minutes. */
  const quiet = 1 / H.ballastDrain(0.3, 0) / 60;
  const angry = 1 / H.ballastDrain(0.8, 0) / 60;
  assert.ok(quiet > 12 && quiet < 45,
    `a full tank at ordinary Unrest lasts ${quiet.toFixed(0)} minutes - outside the window where it is a campaign pressure`);
  assert.ok(angry < quiet * 0.85,
    `a furious planet drains it in ${angry.toFixed(0)} minutes against ${quiet.toFixed(0)} - Unrest has to be felt here`);
  /* An Anchor has to be worth lighting. */
  assert.ok(H.ballastDrain(0.5, 3) < H.ballastDrain(0.5, 0),
    'lighting Anchors does nothing to the drain');
});

test('feeding prefers deep ore without making shallow ore pointless', () => {
  /* The compression argument in feedValue, as a property. Value spans forty to
     a hundred and ninety-six thousand; if the feed were value-weighted, one
     Solmarrow would be worth six hundred Copper and the decision would stop
     existing. */
  const shallow = H.feedValue('copper');
  const deep = H.feedValue('solmarrow');
  assert.ok(shallow > 0 && deep > shallow, 'deep ore must be worth more to it');
  assert.ok(deep / shallow <= 20,
    `one Solmarrow is worth ${(deep / shallow).toFixed(0)} Copper to the Ballast - at that ratio nobody ever feeds it Copper`);
  assert.ok(deep <= 0.2,
    `one unit of the deepest ore fills ${Math.round(deep * 100)}% of the tank on its own`);
  /* Rock is not food. */
  assert.equal(H.feedValue('granite'), 0);
  assert.equal(H.feedable('granite'), false);
  assert.equal(H.feedable('copper'), true);
});

test('a feed never overflows, and never silently eats more than it can hold', () => {
  const s = fresh();
  s.ballast = 0.95;
  const gained = H.feed(s, 'solmarrow', 5);
  assert.ok(s.ballast <= 1, 'the Ballast went over full');
  assert.ok(Math.abs(gained - 0.05) < 1e-9,
    `it reported taking ${gained} into 0.05 of room`);
  /* The caller uses the return to decide what to charge, so a full tank has to
     report zero rather than a small lie. */
  assert.equal(H.feed(s, 'copper', 10), 0);
});

/* ---------- collapse ---------- */

test('a collapse can never take the pad, the ship, or ground already down', () => {
  /* The four fences from the top of unrest.ts, and the one the whole "never
     let a hazard take the run" rule rests on. Every region is made angry so
     that nothing but the exclusions can be what keeps them safe - a test where
     the pad's region happens to be calm proves nothing. */
  const s = fresh();
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.9;
  const pad = 1, ship = 7;
  s.unrest[pad] = 1; s.unrest[ship] = 1;
  const t = H.collapseTarget(s, ship, pad);
  assert.ok(t >= 0 && t !== pad && t !== ship, `it chose region ${t}`);

  H.collapse(s, t);
  assert.ok(H.isCollapsed(s, t));
  const t2 = H.collapseTarget(s, ship, pad);
  assert.ok(t2 !== t, 'it chose a region that had already come down');

  /* And with everywhere else down, it has to be able to answer "nowhere". */
  for (let i = 0; i < H.REGION_COUNT; i++) {
    if (i !== pad && i !== ship) H.collapse(s, i);
  }
  assert.equal(H.collapseTarget(s, ship, pad), -1,
    'with every legal region down it still found one to take');
});

test('it takes the angriest region, not an arbitrary one', () => {
  const s = fresh();
  s.unrest[5] = 0.2;
  s.unrest[9] = 0.8;
  s.unrest[10] = 0.4;
  assert.equal(H.collapseTarget(s, 0, 1), 9);
});

test('a collapse leaves a planet you can come back from', () => {
  /* The death-spiral fence. A collapse that empties the tank collapses a
     second region on the next run and a third on the one after, which is not a
     stake, it is a save going out. */
  const s = fresh();
  s.ballast = 0;
  s.unrest[9] = 1;
  H.collapse(s, 9);
  assert.ok(s.ballast >= H.BALLAST_AFTER_COLLAPSE,
    'the Ballast was left empty, so the next drain collapses another region immediately');
  assert.ok(s.unrest[9] < 1 && s.unrest[9] > 0,
    `fallen ground came back at ${s.unrest[9]} - zero makes collapsing the cheapest way to reset a region`);
  assert.equal(s.pending, -1, 'the pending collapse was not cleared, so it can land twice');
});

test('shoring costs most of the tank, and only works when the tank can pay', () => {
  const s = fresh();
  s.ballast = 0;
  H.collapse(s, 9);
  H.collapse(s, 4);
  assert.equal(H.canShore(s), false);
  assert.equal(H.shore(s), -1, 'it shored a region out of an empty Ballast');

  s.ballast = H.BALLAST_SAFE;
  assert.equal(H.canShore(s), true);
  /* Oldest first, so the order a player loses regions in is the order they get
     them back - which is the only order that can be explained without a menu. */
  assert.equal(H.shore(s), 9);
  assert.ok(Math.abs(s.ballast - (H.BALLAST_SAFE - H.BALLAST_SHORE_COST)) < 1e-9);
  assert.deepEqual(s.collapsed, [4]);
  assert.equal(H.canShore(s), false, 'a second region was shored out of the same tank');
});

/* ---------- the save ---------- */

test('a save from before this round loads a quiet planet, not a broken one', () => {
  /* There is nothing in the Claim's shape to carry across - a refinery at 40%
     is not an Unrest reading - so an older save starts calm with a full tank.
     What must NOT happen is it starting with an empty one. */
  const old = H.loadGround({ strain: 0.8, refinery: 20, derrick: 0, shed: 55, quakes: 9 });
  assert.equal(old.ballast, 1);
  assert.equal(old.collapsed.length, 0);
  assert.equal(old.unrest.length, H.REGION_COUNT);
  assert.equal(H.planetUnrest(old), 0);

  /* And a real one round-trips. */
  const s = fresh();
  s.unrest[3] = 0.44; s.ballast = 0.6; s.tier = 2;
  H.collapse(s, 3);
  const back = H.loadGround(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.unrest, s.unrest);
  assert.deepEqual(back.collapsed, s.collapsed);
  assert.equal(back.tier, 2);
});

test('a corrupt save cannot put the planet into a state the game cannot draw', () => {
  const bad = H.loadGround({
    unrest: [5, -3, 'x', null], ballast: 99, tier: -4,
    collapsed: [0, 40, -1, 3], pending: 99
  });
  assert.equal(bad.unrest.length, H.REGION_COUNT);
  for (const u of bad.unrest) assert.ok(u >= 0 && u <= 1, `unrest out of range: ${u}`);
  assert.ok(bad.ballast <= 1 && bad.ballast >= 0);
  assert.ok(bad.tier >= 0);
  for (const c of bad.collapsed) assert.ok(c >= 0 && c < H.REGION_COUNT, `region out of range: ${c}`);
  assert.equal(bad.pending, -1, 'a pending region off the end of the world survived the load');
});
