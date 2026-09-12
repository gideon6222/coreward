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
  assert.equal(old.lit.length, 0);
  assert.equal(old.unrest.length, H.REGION_COUNT);
  assert.equal(H.planetUnrest(old), 0);

  /* And a real one round-trips. */
  const s = fresh();
  s.unrest[3] = 0.44; s.ballast = 0.6;
  H.lightAnchor(s, 7); H.lightAnchor(s, 2);
  H.collapse(s, 3);
  const back = H.loadGround(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(back.unrest, s.unrest);
  assert.deepEqual(back.collapsed, s.collapsed);
  assert.deepEqual(back.lit, [7, 2]);
  assert.equal(H.tierOf(back), 2);
});

test('a corrupt save cannot put the planet into a state the game cannot draw', () => {
  const bad = H.loadGround({
    unrest: [5, -3, 'x', null], ballast: 99, lit: [3, 3, 99, -2],
    collapsed: [0, 40, -1, 3], pending: 99
  });
  assert.equal(bad.unrest.length, H.REGION_COUNT);
  for (const u of bad.unrest) assert.ok(u >= 0 && u <= 1, `unrest out of range: ${u}`);
  assert.ok(bad.ballast <= 1 && bad.ballast >= 0);
  assert.deepEqual(bad.lit, [3], 'a duplicate and two out-of-range Anchors survived the load');
  for (const c of bad.collapsed) assert.ok(c >= 0 && c < H.REGION_COUNT, `region out of range: ${c}`);
  assert.equal(bad.pending, -1, 'a pending region off the end of the world survived the load');
});

/* ---------- the cascade, and the two fences on it ----------

   These exist because of a LONG PLAY, not a unit test. A campaign driven
   through the shipping loop stopped dead on run 22 with one Anchor lit, three
   regions down, the Ballast pinned at zero and eighteen credits - and the test
   above it proved only that a SINGLE collapse leaves a planet you can come
   back from. One is not three. */

test('three regions down is as broken as the planet gets', () => {
  /* Collapses cascade by their own logic: each one removes ground you earned
     in, which makes the Ballast harder to fill, which takes the next region.
     Without a floor the spiral has no bottom. */
  const s = fresh();
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.9;
  /* Everything lit, so the Anchor fence is not what is doing the work here -
     a test where two fences overlap proves neither. */
  for (let i = 0; i < H.ANCHOR_COUNT; i++) H.lightAnchor(s, i);

  const taken = [];
  for (let n = 0; n < 8; n++) {
    const t = H.collapseTarget(s, 99, 1, () => false);
    if (t < 0) break;
    H.collapse(s, t);
    taken.push(t);
  }
  assert.equal(taken.length, H.MAX_COLLAPSED,
    `${taken.length} regions came down before the planet stopped - the cascade has no floor`);
  assert.equal(H.collapseTarget(s, 99, 1, () => false), -1,
    'a fourth region was still on offer');
  /* And the floor is not so high that a collapse stops being a stake. */
  assert.ok(H.MAX_COLLAPSED >= 2 && H.MAX_COLLAPSED < H.REGION_COUNT / 2,
    `${H.MAX_COLLAPSED} of ${H.REGION_COUNT} regions is the wrong size for a stake`);
  fresh();
});

test('the ground holding an Anchor you have not reached never falls', () => {
  /* The state the long play actually got into: an unlit Anchor inside fallen
     ground, and no income to shore it with because the income was in there.

     Burying the objective behind a price you may not be able to pay is a
     hazard taking the run. Once its Anchor is lit the region is fair game -
     you have had your prize out of it. */
  const s = fresh();
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.5;
  /* Region 4 is the angriest, so it is what an unfenced chooser would take. */
  s.unrest[4] = 1;
  const unlit = (r) => r < H.ANCHOR_COUNT && !H.isLit(s, r);

  const t = H.collapseTarget(s, 99, 1, unlit);
  assert.ok(t >= 0, 'nothing at all could fall, so the fence is too wide');
  assert.notEqual(t, 4, 'it took the region holding the angriest unlit Anchor');
  assert.ok(t >= H.ANCHOR_COUNT || H.isLit(s, t),
    `it took region ${t}, which holds an Anchor nobody has lit`);

  /* And lighting it hands the region over.

     Its Unrest has to be put back by hand first, because lighting an Anchor
     CALMS its region to 0.15 - so a freshly lit region is not the angriest one
     any more and would not be chosen for a reason that has nothing to do with
     this fence. The first version of this test asserted it would be, and
     failed for exactly that reason. */
  H.lightAnchor(s, 4);
  s.unrest[4] = 1;
  assert.equal(H.collapseTarget(s, 99, 1, unlit), 4,
    'a region whose Anchor is lit is still being protected');
  fresh();
});

test('with no Anchors lit at all there is still somewhere for a collapse to go', () => {
  /* The fence above could easily be too wide: nine of the twelve regions hold
     an Anchor, and at the start of the game none of them is lit. If the other
     three were also excluded for any reason, the Ballast emptying would do
     nothing at all and the stake would quietly not exist. */
  const s = fresh();
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.4;
  const unlit = (r) => r < H.ANCHOR_COUNT && !H.isLit(s, r);
  const t = H.collapseTarget(s, 99, 1, unlit);
  assert.ok(t >= 0,
    'a fresh planet has nowhere for a collapse to land, so an empty Ballast costs nothing');
  assert.ok(t >= H.ANCHOR_COUNT,
    `region ${t} holds an Anchor and was chosen anyway`);
  fresh();
});

test('a planet run to the bottom of its own spiral still has a way forward', () => {
  /* The cheap version of the long play, and the test that should have existed
     first: step the system until it stops changing, then ask whether the
     terminal state is one a player can act on.

     Anything with feedback in it needs this - a meter that costs you the means
     to refill it cannot be judged one step at a time. The browser probe found
     it, but only after twenty-two runs and an afternoon; this runs in a
     millisecond and asks the same question. */
  const s = fresh();
  const pad = 1, ship = 7;
  const unlit = (r) => r < H.ANCHOR_COUNT && !H.isLit(s, r);

  /* The worst case a player can reach: everything furious, nothing lit, and
     the tank empty every time it is asked. Sixty dockings, which is far more
     than a campaign. */
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 1;
  for (let dock = 0; dock < 60; dock++) {
    s.ballast = 0;
    const t = H.collapseTarget(s, ship, pad, unlit);
    if (t < 0) continue;
    H.collapse(s, t);
  }

  /* The floor held. */
  assert.ok(s.collapsed.length <= H.MAX_COLLAPSED,
    `${s.collapsed.length} regions are down after sixty dockings at maximum Unrest`);

  /* And the state is ACTIONABLE, which is the actual claim. Three things have
     to be true at the bottom of the spiral:

     1. no Anchor is buried, so the objective is still reachable
     2. the pad's region is still open, so there is somewhere to earn
     3. shoring is possible once the tank is filled - it is not gated behind
        anything that is itself inside fallen ground */
  for (const r of s.collapsed) {
    assert.ok(r >= H.ANCHOR_COUNT || H.isLit(s, r),
      `${H.regionName(r)} is down with an Anchor nobody has lit in it`);
  }
  assert.equal(H.isCollapsed(s, pad), false, "the pad's own region came down");

  s.ballast = 1;
  const shored = H.shore(s);
  assert.ok(shored >= 0,
    'at the bottom of the spiral, a full Ballast cannot buy a region back');
  assert.ok(s.collapsed.length < H.MAX_COLLAPSED, 'shoring did not reopen anything');
  fresh();
});

test('a planet nobody feeds loses ground and then stops', () => {
  /* The same loop with the REAL drain rather than an empty tank forced every
     time, so the arithmetic of "how long does neglect take" is on the record.
     A full Ballast at ordinary Unrest is about twenty-five minutes of digging;
     this counts how many of those a planet survives before it is as broken as
     it gets. */
  const s = fresh();
  const pad = 1;
  const unlit = () => false;          /* everything lit, so only the floor acts */
  for (let i = 0; i < H.REGION_COUNT; i++) s.unrest[i] = 0.7;
  let mins = 0;
  const at = [];
  while (mins < 600 && s.collapsed.length < H.MAX_COLLAPSED) {
    /* Sixty seconds of digging, then dock, and feed it nothing. */
    const r = H.drainBallast(s, 60);
    mins++;
    if (!r.emptied) continue;
    const t = H.collapseTarget(s, 99, pad, unlit);
    if (t < 0) break;
    H.collapse(s, t);
    at.push(mins);
  }
  assert.equal(at.length, H.MAX_COLLAPSED, `only ${at.length} regions were ever lost`);

  /* The SHAPE, not the total, and that is the whole point of the test.

     The first version asserted the total only and it was the wrong question.
     The old numbers were 16, 20, 26 - the first loss took a reasonable
     sixteen minutes and the next two arrived four minutes apart, because a
     collapse used to restart the tank a quarter full and the drain never
     eased. A total of twenty-six minutes hides a pile-up; the gaps do not. */
  const gaps = at.map((m, i) => (i ? m - at[i - 1] : m));
  assert.ok(gaps[0] > 10,
    `the first region falls after ${gaps[0]} minutes of digging - a run is three, so this has to be several`);
  for (let i = 1; i < gaps.length; i++) {
    assert.ok(gaps[i] > gaps[0] * 0.6,
      `losses came ${gaps.join(', ')} minutes apart - the ${i + 1}th arrived too fast after the one before it to react to`);
  }
  assert.ok(at[at.length - 1] < 200,
    `it took ${at[at.length - 1]} minutes of digging to break the planet as far as it goes, which nobody will reach`);
  fresh();
});
