/* The daily Drift.

   The one thing that must not move with the calendar is which KINDS of world
   are on offer: a player who needs a Searing world for the Thermal Core must
   never have to wait more than one leg for one, and hanging that on the date
   would make the goal strandable on the wrong day. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();
const DAYS = [0, 1, 2, 19000, 19001, 20500];

test('the worlds on offer change from day to day', () => {
  let differed = 0;
  for (const leg of [0, 1, 2, 5, 9]) {
    const a = H.chartFor(leg, 100).map((d) => d.world).join(',');
    const b = H.chartFor(leg, 101).map((d) => d.world).join(',');
    if (a !== b) differed++;
  }
  assert.ok(differed >= 4, `only ${differed} of 5 legs offered different worlds the next day`);
});

test('but the kinds on offer never do', () => {
  for (const leg of [0, 1, 2, 3, 7, 40]) {
    const base = H.chartFor(leg, 0).map((d) => d.trait).join(',');
    for (const day of DAYS) {
      assert.equal(H.chartFor(leg, day).map((d) => d.trait).join(','), base,
        `leg ${leg} offered different traits on day ${day} - the drive could strand`);
    }
  }
});

test('every trait still appears within one leg, on every day', () => {
  for (const day of DAYS) {
    for (let leg = 0; leg < 60; leg++) {
      const seen = new Set([...H.chartFor(leg, day), ...H.chartFor(leg + 1, day)].map((d) => d.trait));
      assert.equal(seen.size, H.TRAITS.length,
        `day ${day}, legs ${leg} and ${leg + 1} between them offered only ${seen.size} traits`);
    }
  }
});

test('the same day and leg always gives the same chart', () => {
  for (const day of DAYS) {
    const a = JSON.stringify(H.chartFor(3, day));
    assert.equal(JSON.stringify(H.chartFor(3, day)), a, 'the chart is not reproducible');
  }
});

test('the day is UTC and turns over once', () => {
  const t = Date.UTC(2026, 8, 10, 23, 59, 59);
  assert.equal(H.driftDay(t), H.driftDay(t - 1000), 'a second earlier is the same day');
  assert.equal(H.driftDay(t + 2000), H.driftDay(t) + 1, 'a second later is the next day');
});
