/* The Claim: the rules that must hold whatever the numbers get tuned to.

   Every one of these is a property rather than a value, because the values in
   claim.ts are a first pass and are expected to move. What must not move is
   that a quake is survivable, that the thing which repairs the surface lives
   below the line that breaks it, and that nothing here depends on how much
   money you happen to be holding. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();

const LEGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

test('nothing above the stability line strains anything', () => {
  for (const p of LEGS) {
    H.setWorld(p);
    const core = H.coreM();
    const line = H.stabilityLine(core);
    for (let d = 0; d <= line; d++) {
      assert.equal(H.strainPerCell(d, core), 0, `leg ${p}, ${d} m is above the line at ${line} m`);
    }
    assert.ok(H.strainPerCell(line + 1, core) > 0, `leg ${p}: the first cell below the line must count`);
  }
});

test('strain per cell rises with depth and never falls', () => {
  for (const p of LEGS) {
    H.setWorld(p);
    const core = H.coreM();
    let last = -1;
    for (let d = 0; d <= core; d++) {
      const v = H.strainPerCell(d, core);
      assert.ok(v >= last, `leg ${p}: ${d} m strained less than ${d - 1} m`);
      last = v;
    }
    /* And the relationship the player is meant to feel: the core is worth
       STRAIN_AT_CORE times the line. */
    const atLine = H.strainPerCell(H.stabilityLine(core) + 1, core);
    const atCore = H.strainPerCell(core, core);
    assert.ok(Math.abs(atCore / atLine - H.STRAIN_AT_CORE) < 0.06,
      `leg ${p}: core/line ratio ${(atCore / atLine).toFixed(3)}, expected ~${H.STRAIN_AT_CORE}`);
  }
});

test('the ore that repairs the refinery is only found below the line', () => {
  for (const p of LEGS) {
    H.setWorld(p);
    const core = H.coreM();
    const line = H.stabilityLine(core);
    const id = H.repairOre(core);
    const ore = H.ORES.find((o) => o.id === id);
    assert.ok(ore, `leg ${p}: repairOre returned ${id}, which is not an ore`);
    assert.ok(ore.min >= line,
      `leg ${p}: ${ore.name} starts at ${ore.min} m, at or above the stability line at ${line} m, so the surface could be repaired without ever going below it`);
    assert.ok(ore.min < core, `leg ${p}: ${ore.name} starts at ${ore.min} m, below this world's core at ${core} m, so it cannot be reached at all`);
  }
});

test('a quake is a discount, never a wall', () => {
  const c = H.newClaim();
  /* Wreck it completely, several times over. */
  for (let i = 0; i < 12; i++) H.applyQuake(c, 0);
  assert.equal(c.refinery, 0);
  assert.ok(H.payoutMult(c) >= 0.5, `a wrecked refinery pays ${H.payoutMult(c)}, which is below half`);
  assert.ok(H.refuelMult(c) >= 0.5, `a wrecked derrick fills to ${H.refuelMult(c)}, which is below half`);
  /* And the run is still runnable: fuel enough to reach the core of leg 0 and
     come back is the floor that matters. */
  H.setWorld(0);
  const tank = H.S.fuelCap() * H.refuelMult(c);
  const roundTrip = (H.coreM() * 2 / H.S.speed()) * H.FUEL_PER_MOVE;
  assert.ok(tank > roundTrip * 0.5,
    `a wrecked derrick leaves ${tank.toFixed(0)} fuel against a ${roundTrip.toFixed(0)} round trip`);
});

test('a quake damages every structure, and the derrick most', () => {
  const d = H.quakeDamage(0, 0);
  for (const k of ['refinery', 'derrick', 'shed']) {
    assert.ok(d[k] >= H.DAMAGE_MIN * 0.75, `${k} took ${d[k]}, less than the floor`);
  }
  /* Exposure is the only asymmetry between them, so it has to survive. Read
     across several quakes, because one roll can land anywhere in the range. */
  let derrick = 0, shed = 0;
  for (let i = 0; i < 40; i++) { const q = H.quakeDamage(0, i); derrick += q.derrick; shed += q.shed; }
  assert.ok(derrick > shed, `over 40 quakes the derrick took ${derrick} and the shed ${shed}`);
});

test('the same world shaken the same way gives the same quake, whatever you are holding', () => {
  /* The contaminated-state bug CRAFT.md names: a reward that depends on the
     bank. Same digging, different wallet, same outcome. */
  const dig = (bank) => {
    H.setWorld(3);
    H.g.credits = bank;
    H.g.claim = H.newClaim();
    const core = H.coreM();
    let quakes = 0;
    for (let d = H.stabilityLine(core) + 1; d <= core; d++) {
      for (let i = 0; i < 6; i++) if (H.digStrain(d)) quakes++;
    }
    return { quakes, strain: H.g.claim.strain, refinery: H.g.claim.refinery, rich: H.g.rich };
  };
  assert.deepEqual(dig(0), dig(9_999_999));
});

test('a shaken world pays more, which is what makes depth a bet', () => {
  H.setWorld(0);
  H.g.claim = H.newClaim();
  const before = H.g.rich;
  const core = H.coreM();
  let fired = false;
  for (let d = core; d > H.stabilityLine(core) && !fired; d--) {
    for (let i = 0; i < 400 && !fired; i++) fired = H.digStrain(d);
  }
  assert.ok(fired, 'no quake fired at all after 400 cells at the core');
  assert.ok(H.g.rich > before, `rich went ${before} -> ${H.g.rich}`);
});

test('a save from before the Claim existed loads an intact one', () => {
  const c = H.loadClaim(undefined);
  assert.equal(c.refinery, 100);
  assert.equal(c.strain, 0);
  assert.equal(c.quakes, 0);
  /* And a corrupt one does not produce a negative or a NaN. */
  const bad = H.loadClaim({ strain: 'x', refinery: -50, derrick: 500, stored: null, quakes: NaN });
  assert.ok(bad.strain >= 0 && bad.strain <= 1);
  assert.equal(bad.refinery, 0);
  assert.equal(bad.derrick, 100);
});

test('golden: the strain and quake sequence of a whole descent', () => {
  H.setWorld(0);
  H.g.claim = H.newClaim();
  H.g.rich = 1;
  const core = H.coreM();
  const rows = [];
  let strain = 0;
  for (let d = 1; d <= core; d++) {
    const r = H.afterCell(strain, d, core);
    strain = r.strain;
    if (r.quake || d % 20 === 0) {
      rows.push({ d, strain: +strain.toFixed(4), quake: r.quake });
    }
  }
  assertGolden('claim-strain', {
    line: H.stabilityLine(core),
    repairOre: H.repairOre(core),
    perCellAtLine: +H.strainPerCell(H.stabilityLine(core) + 1, core).toFixed(6),
    perCellAtCore: +H.strainPerCell(core, core).toFixed(6),
    damageFirstFour: [0, 1, 2, 3].map((i) => H.quakeDamage(0, i)),
    rows
  });
});
