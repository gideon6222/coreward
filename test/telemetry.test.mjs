/* The run log.

   Playtest: *"I would only want to do it if it has very little impact on the
   game running and is actually helpful."*

   The counters themselves are `+=` in the frame loop and cannot really be wrong
   in an interesting way. The DERIVATIONS are where the judgement is, and where
   a counter wired to the wrong event turns into a confident wrong number that
   someone then balances the game against. So those get tested.

   Everything here is about a number being *right*, not about it existing. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const log = (over = {}) => Object.assign(H.blankLog(), over);
const rowsFor = (over) => {
  const out = {};
  for (const r of H.summarise(log(over), 100, 100)) out[r.label] = r;
  return out;
};

test('a brand new log renders without a single NaN or Infinity', () => {
  /* Every rate in here is a division, and every denominator is zero before the
     first frame of a new save. This is the case the panel is opened in most
     often - straight after RESTART PROGRESS - so it is the one that matters. */
  for (const r of H.summarise(H.blankLog(), 100, 100)) {
    const text = r.label + ' ' + r.value + ' ' + r.note;
    assert.ok(!/NaN|Infinity|undefined/.test(text), 'unguarded division in: ' + text);
    assert.ok(r.value.length > 0, r.label + ' has no value');
    assert.ok(r.note.length > 0, r.label + ' has no note');
  }
});

test('fuel is attributed to what actually spent it', () => {
  const r = rowsFor({ sec: 100, secDig: 40, fuelDig: 75, fuelFly: 25 });
  assert.match(r.Fuel.value, /^1\/s$/, 'total fuel rate should be 100 over 100 s');
  assert.match(r.Fuel.note, /75% of it drilling/);
  assert.match(r.Fuel.note, /25% flying/);
});

test('the tank estimate answers how long a tank of DRILLING lasts', () => {
  /* The question is "is the tank the right size for the job that empties it",
     so the divisor has to be the drilling burn rate, not the overall one.
     Burning 40 fuel over 20 s of drilling is 2/s, so a 100 tank is 50 s -
     and it must NOT come out as 100 s by using the whole run's average. */
  const r = rowsFor({ sec: 100, secDig: 20, fuelDig: 40, fuelFly: 10 });
  assert.match(r.Fuel.note, /a full tank is 50s of drilling/);
});

test('heat is measured against the hull it actually empties', () => {
  /* 25 hull of heat over 50 s is 0.5/s, so a 100 hull is 200 s = 3m 20s. */
  const r = rowsFor({ sec: 50, hullHeat: 25, hullGas: 25 });
  assert.match(r.Hull.note, /50% heat, 50% gas/);
  assert.match(r.Hull.note, /empties a full hull in 3m 20s/);
});

test('an ability nobody uses says so, because that IS the finding', () => {
  /* The whole reason this panel exists. A zero here must read as a verdict
     rather than as a blank row someone scrolls past. */
  const r = rowsFor({ sec: 300, runs: 6 });
  assert.equal(r.Ordnance.value, 'never used');
  assert.match(r.Ordnance.note, /not worth what it costs/);
});

test('a used ability reports what each shot actually bought', () => {
  const r = rowsFor({ bombFired: 2, laserFired: 2, ordBlocks: 40, powerSpent: 12 });
  assert.match(r.Ordnance.value, /^4 fired$/);
  assert.match(r.Ordnance.note, /10 blocks each/);
  assert.match(r.Ordnance.note, /3 power each/);
});

test('over-stocking a supply is called out, since that is a pricing fault', () => {
  const over = rowsFor({ supBought: 10, supUsed: 2 });
  assert.match(over.Supplies.note, /stocked far more than needed/);
  /* but a supply that gets spent must not be nagged about */
  const fine = rowsFor({ supBought: 4, supUsed: 3 });
  assert.doesNotMatch(fine.Supplies.note, /far more than needed/);
});

test('the tow rate is a share of runs, which is the number balance turns on', () => {
  const r = rowsFor({ runs: 8, towed: 2, autoUsed: 5 });
  assert.match(r.Runs.note, /25% ended in a tow/);
  assert.match(r.Runs.note, /autopilot used 5 times/);
});

test('time splits account for every second, including standing still', () => {
  const r = rowsFor({ sec: 100, secDig: 30, secFly: 50 });
  assert.match(r['Where the time goes'].note, /30% drilling, 50% flying, 20% still/);
});

test('merging a run into the totals adds every field, and misses none', () => {
  const all = H.blankLog(), run = H.blankLog();
  /* Set every field to 1 so a field the merge forgot shows up as a zero. */
  for (const k of Object.keys(run)) run[k] = 1;
  H.mergeLog(all, run);
  for (const k of Object.keys(all)) {
    assert.equal(all[k], 1, 'mergeLog did not carry "' + k + '"');
  }
  H.mergeLog(all, run);
  for (const k of Object.keys(all)) assert.equal(all[k], 2, '"' + k + '" did not accumulate');
});

test('a save written before the log existed loads as zeroes, not as holes', () => {
  /* The real hazard: undefined + 1 is NaN, and a NaN in the totals is
     permanent - it survives every later save and poisons the panel forever. */
  for (const raw of [undefined, null, {}, { sec: 'lots' }, { sec: NaN }, { nope: 1 }]) {
    const l = H.loadLog(raw);
    for (const k of Object.keys(H.blankLog())) {
      assert.equal(typeof l[k], 'number', k + ' is not a number for input ' + JSON.stringify(raw));
      assert.ok(isFinite(l[k]), k + ' is not finite for input ' + JSON.stringify(raw));
    }
  }
  /* and a real saved value survives */
  assert.equal(H.loadLog({ sec: 42 }).sec, 42);
});
