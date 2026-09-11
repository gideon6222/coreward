/* The economy's shape, asserted rather than simulated.

   `scripts/econ.mjs` is the instrument: it runs a scripted player and reports
   what happens. This is the gate: the handful of relationships that must hold
   for the report to ever come back healthy, checked in milliseconds so they
   fail on the commit that breaks them rather than the next time someone
   remembers to run the probe.

   Every number here is derived from the shipping tables. None of them is a
   copy of a price, because a test that restates a constant only proves you can
   type it twice. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

/* What a full tank can actually cut, at level 0, through the rock that is
   really there at a given depth. This is the quantity the whole opening
   economy turns on and nothing in the game states it anywhere. */
function cellsPerTank(depth) {
  H.setWorld(0);
  let fuel = H.S.fuelCap();
  /* The climb has to be paid for or the answer is a ship that never comes
     home. */
  fuel -= (depth / H.S.speed()) * H.FUEL_PER_MOVE * 2;
  let cells = 0, kg = 0, rockKg = 0;
  for (let i = 0; fuel > 0 && i < 4000; i++) {
    const b = H.blockAt(2 + (i % 9), depth - (i % 2));
    if (!b || b.value == null || !H.DEF[b.id]) continue;
    /* Per CELL, not per second. Round seven moved the charge onto progress
       through the block so the Drill buys speed and never efficiency - see
       fuelPerCell in feel.ts - which is exactly what this probe is measuring:
       how many cells a tank is worth. Under the old model that answer grew
       fifty-four fold across the upgrade ladder. */
    fuel -= H.fuelPerCell(b.hard) * H.S.cellFuel();
    if (fuel < 0) break;
    cells++; kg += b.wt;
    /* Rock only. A corridor that happens to run through a seam is the RICH
       case and is measured by the next test; the poor case is the one with no
       ore in it at all, which is what "a bad run" means. */
    if (!H.isOre(H.DEF[b.id])) rockKg += b.wt;
  }
  return { cells, kg, rockKg };
}

test('a poor corridor empties the tank before it fills the hold', () => {
  /* The two constraints have different jobs and both have to be able to bind.
     Plain rock weighs almost nothing - granite is 0.25 kg a cell against
     amethyst at 7 - so a corridor of dirt can never fill the hold, and what
     ends that run has to be the fuel. This is the half that makes a bad seam
     feel bad. */
  for (const depth of [20, 35, 50]) {
    const { cells, rockKg } = cellsPerTank(depth);
    assert.ok(rockKg < H.S.cargoCap(),
      `at ${depth} m a whole tank cuts ${rockKg.toFixed(0)} kg of ore-free rock into a ${H.S.cargoCap()} kg hold. ` +
      'If dirt alone fills the hold, the hold stops being about what is worth carrying.');
    assert.ok(cells > 12, `at ${depth} m a full tank only cuts ${cells} cells, which is not a run`);
  }
});

test('a rich seam overflows the hold before the tank runs dry', () => {
  /* And the half that makes a good seam a decision: when the corridor is ore,
     the thing that stops you is what you can carry, not what you can burn.
     CRAFT.md: a weight cap is what turns "which is worth more" into a choice. */
  H.setWorld(0);
  const cap = H.S.cargoCap();
  for (const depth of [20, 35, 50]) {
    const ore = H.ORES.filter((o) => o.min <= depth).sort((a, b) => b.min - a.min)[0];
    const { cells } = cellsPerTank(depth);
    assert.ok(cells * ore.wt > cap,
      `at ${depth} m one tank cuts ${cells} cells; as ${ore.name} at ${ore.wt} kg that is ` +
      `${(cells * ore.wt).toFixed(0)} kg, which does not overflow a ${cap} kg hold. A seam has to be ` +
      'worth more than you can carry away or the cap never binds.');
  }
});

test('a ladder that unlocks deeper costs more to start', () => {
  /* The one price relationship that is not a matter of taste. If a rung that
     opens at 90 m is cheaper to start than one that opens at 20 m, the depth
     gate and the price gate are pulling against each other and one of them is
     decoration - CRAFT.md's "two gates on one thing means one of them is
     decoration", applied across the shop rather than within a row. */
  const rows = H.UPGRADES.map((u) => ({ name: u.name, unlock: u.unlock || 0, rung: H.costOf(u, 0) }))
    .sort((a, b) => a.unlock - b.unlock);
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].unlock === rows[i - 1].unlock) continue;
    assert.ok(rows[i].rung >= rows[i - 1].rung * 0.9,
      `${rows[i].name} unlocks at ${rows[i].unlock} m for ${rows[i].rung}, under ${rows[i - 1].name} ` +
      `which unlocks at ${rows[i - 1].unlock} m for ${rows[i - 1].rung}`);
  }
});

test('the ladders are long enough that money keeps meaning something', () => {
  /* A 2.0x step makes the last rung dearer than the first eight together,
     which is how a ladder ends up with a top nobody will ever see. Under 1.7
     the whole ladder stays inside about 30x its first rung. */
  for (const u of H.UPGRADES) {
    assert.ok(u.mul <= 1.65, `${u.name} steps ${u.mul}x a rung, which puts its top out of reach`);
    assert.ok(u.mul >= 1.3, `${u.name} steps ${u.mul}x a rung, which makes its top free once its bottom is affordable`);
  }
});

test('every consumable stays dearer than the rung it stands in for', () => {
  /* Already asserted in stats.test.mjs for three pairs. This is the general
     rule, over every supply that has a matching ladder, because the pairs list
     was written when there were ten upgrades and is now short by two. */
  const PAIR = { coolant: 'cool', patch: 'hull', cell: 'tank', overdrive: 'drill', bulwark: 'hull', pulse: 'survey' };
  for (const [s, k] of Object.entries(PAIR)) {
    const sup = H.SUPPLY_OF[s];
    const u = H.UPGRADES.find((x) => x.key === k);
    if (!sup || !u) continue;
    assert.ok(sup.cost > H.costOf(u, 0),
      `${sup.name} at ${sup.cost} undercuts ${u.name} rung 1 at ${H.costOf(u, 0)}`);
  }
});
