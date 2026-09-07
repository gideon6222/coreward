/* Economy and derived stats. These are the numbers that decide how the game
   plays, so every upgrade level and planet index is pinned. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();
const PLANETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function withUp(patch, shards, fn) {
  const savedUp = { ...H.g.up };
  const savedShards = H.g.shards;
  Object.assign(H.g.up, { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 }, patch);
  H.g.shards = shards || 0;
  try { return fn(); } finally { Object.assign(H.g.up, savedUp); H.g.shards = savedShards; }
}

test('upgrade costs are unchanged at every level', () => {
  const table = {};
  for (const u of H.UPGRADES) {
    table[u.key] = {
      name: u.name, base: u.base, mul: u.mul, max: u.max,
      tiers: u.tiers || null,
      costs: Array.from({ length: u.max + 1 }, (_, l) => H.costOf(u, l)),
      effects: Array.from({ length: u.max + 1 }, (_, l) => u.effect(l)),
      mat: u.mat,
      mats: Array.from({ length: u.max }, (_, l) => H.matCost(u, l)),
      matTotal: H.matTotalFor(u, u.max)
    };
  }
  assertGolden('upgrades', table);
});

test('derived stats are unchanged across the full upgrade range', () => {
  const out = {};
  const sweep = (key, max, read) =>
    Array.from({ length: max + 1 }, (_, l) => withUp({ [key]: l }, 0, read));
  out.cargoCap = sweep('cargo', 9, () => H.S.cargoCap());
  out.speed = sweep('thrust', 9, () => H.S.speed());
  out.fuelCap = sweep('tank', 9, () => H.S.fuelCap());
  out.shield = sweep('cool', 9, () => H.S.shield());
  out.light = sweep('scan', 9, () => H.S.light());
  out.towCut = sweep('tow', 8, () => H.S.towCut());
  out.autoRate = sweep('auto', 6, () => H.S.autoRate());
  /* drill is the one stat with two inputs: level and permanent core shards */
  out.drill = {};
  for (let shards = 0; shards <= 8; shards++) {
    out.drill['shards' + shards] =
      Array.from({ length: 10 }, (_, l) => withUp({ drill: l }, shards, () => H.S.drill()));
  }
  assertGolden('stats', out);
});

test('planet scaling is unchanged', () => {
  assertGolden('planets', PLANETS.map((p) => ({
    p,
    name: H.planetName(p),
    coreDepth: H.coreDepth(p),
    hardMult: H.hardMult(p),
    valueMult: H.valueMult(p),
    skyHi: H.skyHi(p),
    skyLo: H.skyLo(p)
  })));
});

test('haul value is unchanged for fixed cargos', () => {
  const cargos = [
    {},
    { dirt: 10 },
    { dirt: 10, iron: 3 },
    { coreite: 2, ruby: 5, gold: 100 },
    { stone: 40, granite: 12, basalt: 7, silver: 9 },
    { magmite: 1, amethyst: 3, emerald: 6, copper: 25 }
  ];
  const savedCargo = H.g.cargo, savedPlanet = H.g.planet;
  const out = [];
  for (const c of cargos) {
    for (const p of [0, 1, 2, 3]) {
      H.g.cargo = c;
      H.g.planet = p;
      out.push({ cargo: c, planet: p, value: H.haulValue() });
    }
  }
  H.g.cargo = savedCargo;
  H.g.planet = savedPlanet;
  assertGolden('haul', out);
});

test('ore and rock definition tables are unchanged', () => {
  assertGolden('materials', { ores: H.ORES, rocks: H.ROCKS });
});

test('constants that gate progression are unchanged', () => {
  assert.equal(H.W, 13);
  assert.equal(H.START_X, 6);
  assert.equal(H.START_X, Math.floor(H.W / 2), 'the pad must stay centred');
  assert.equal(H.HULL_MAX, 100);
  assert.equal(H.DIG_BASE, 0.5);
  assert.equal(H.SAVE_KEY, 'coreward.v2');
  assert.equal(H.OLD_KEY, 'coreward.v1');
});

test('every ore id and rock id resolves through DEF', () => {
  for (const o of H.ORES) assert.equal(H.DEF[o.id], o, 'DEF missing ore ' + o.id);
  for (const r of H.ROCKS) assert.equal(H.DEF[r.id], r, 'DEF missing rock ' + r.id);
});

test('ore value, weight and depth gates stay monotonic', () => {
  /* the shop reads as a ladder only if deeper ores are worth more; this is a
     design invariant, not just a snapshot */
  for (let i = 1; i < H.ORES.length; i++) {
    const deep = H.ORES[i - 1], shallow = H.ORES[i];
    assert.ok(deep.value > shallow.value, deep.id + ' must be worth more than ' + shallow.id);
    assert.ok(deep.min >= shallow.min, deep.id + ' must appear no shallower than ' + shallow.id);
    assert.ok(deep.hard >= shallow.hard, deep.id + ' must be no softer than ' + shallow.id);
  }
});

/* ---------- supplies ----------

   Consumables and upgrades answer the same three threats. The tests below are
   about keeping them on different axes: a supply must never be the cheap way
   to buy what an upgrade sells, and it must never fully solve anything, or the
   run stops having a shape. */

test('the supply table is unchanged', () => {
  assertGolden('supplies', {
    supplies: H.SUPPLIES, patchHull: H.PATCH_HULL, cellFuel: H.CELL_FUEL
  });
});

test('a supply never fully solves the thing it patches', () => {
  assert.ok(H.PATCH_HULL < H.HULL_MAX * 0.6,
    'a hull patch that nearly full-heals removes the reason to surface: ' +
    H.PATCH_HULL + ' of ' + H.HULL_MAX);
  const baseTank = 90;
  assert.ok(H.CELL_FUEL < baseTank,
    'a fuel cell must be a top-up, not a spare tank: ' + H.CELL_FUEL + ' of ' + baseTank);
  for (const s of H.SUPPLIES)
    assert.ok(s.max >= 1 && s.max <= 3,
      s.key + ' stacks to ' + s.max + ' - past three this is a stockpile, not a decision');
});

test('supplies stay priced as a choice against the upgrade ladder', () => {
  const cool = H.UPGRADES.find((u) => u.key === 'cool');
  const coolant = H.SUPPLY_OF.coolant;

  /* Soak is the one pressure with no permanent answer - the shield caps below
     1 on purpose - so the flush that resets it has to be the dearest thing on
     the shelf, and dearer than the first level of the rig it complements. */
  for (const s of H.SUPPLIES)
    if (s.key !== 'coolant')
      assert.ok(coolant.cost > s.cost, 'coolant must be the most expensive supply');
  assert.ok(coolant.cost > H.costOf(cool, 0),
    'a single flush undercutting the first Cooling Rig level makes the rig pointless');

  /* And a full kit has to be a real spend rather than pocket change, or
     stocking up stops competing with saving for the ladder. */
  const fullKit = H.SUPPLIES.reduce((a, s) => a + s.cost * s.max, 0);
  assert.ok(fullKit > H.costOf(cool, 2),
    'a full kit (' + fullKit + ') should cost more than three levels of cooling');
});

test('every supply key resolves through SUPPLY_OF and has display text', () => {
  for (const s of H.SUPPLIES) {
    assert.equal(H.SUPPLY_OF[s.key], s);
    assert.ok(/^[A-Z]{3,5}$/.test(s.icon), s.key + ' label must fit a 60 px button in caps');
    assert.ok(s.blurb.length > 10 && s.blurb.length < 90, s.key + ' blurb should fit one shop line');
    assert.ok(s.idle.length > 0, s.key + ' needs text for when spending it would do nothing');
  }
  assert.equal(new Set(H.SUPPLIES.map((s) => s.key)).size, H.SUPPLIES.length, 'duplicate supply key');
});

/* Which trait lands on which planet is a hash, so it is silent to change. The
   snapshot is the only thing that would notice. */
test('the trait table and its assignment are unchanged', () => {
  assertGolden('traits', {
    traits: H.TRAITS,
    assignment: Array.from({ length: 24 }, (_, p) => ({ planet: p, trait: H.traitOf(p).id })),
    caveCap: H.CAVE_CHANCE_CAP
  });
});

/* ---------- the material economy ----------

   Credits alone made the upgrade ladder a grind against one number: any ore at
   any depth bought any upgrade, so WHERE you dug never mattered. Past level
   three each upgrade also wants the mineral it is built out of, and that
   mineral's depth is the real gate. These tests are about the gate landing
   where the design intends rather than about the numbers themselves. */

test('every upgrade is built out of a real, reachable mineral', () => {
  for (const u of H.UPGRADES) {
    const def = H.DEF[u.mat];
    assert.ok(def, u.key + ' names a mineral that does not exist: ' + u.mat);
    assert.ok(H.isOre(def), u.key + ' is built out of ' + u.mat + ', which is rock');
    assert.ok(def.min < H.coreDepth(0),
      u.key + ' needs ' + u.mat + ' from ' + def.min + ' m, below the first core');
  }
});

test('the opening hour is untouched, and requirements ramp after it', () => {
  for (const u of H.UPGRADES) {
    for (let lvl = 0; lvl < H.MAT_FROM_LEVEL - 1; lvl++)
      assert.equal(H.matCost(u, lvl), null,
        u.key + ' wants materials to reach level ' + (lvl + 1) + ', inside the free tier');
    assert.ok(H.matCost(u, H.MAT_FROM_LEVEL - 1),
      u.key + ' should start wanting materials at level ' + H.MAT_FROM_LEVEL);

    let prev = 0;
    for (let lvl = H.MAT_FROM_LEVEL - 1; lvl < u.max; lvl++) {
      const m = H.matCost(u, lvl);
      assert.equal(m.id, u.mat, u.key + ' changed mineral mid-ladder');
      assert.ok(m.need > prev, u.key + ' requirement did not grow at level ' + (lvl + 1));
      prev = m.need;
    }
  }
});

/* THE one that carries the design. */
test('the Cooling Rig is gated behind a mineral inside the heat zone', () => {
  const cool = H.UPGRADES.find((u) => u.key === 'cool');
  const mat = H.DEF[cool.mat];
  assert.ok(mat.min > H.HEAT_DEPTH,
    'cooling must be bought with a mineral from below ' + H.HEAT_DEPTH + ' m, so a heat ' +
    'run has to happen BEFORE the heat protection - ' + cool.mat + ' starts at ' + mat.min);
  assert.ok(mat.min < H.HEAT_DEPTH + 20,
    cool.mat + ' at ' + mat.min + ' m is so far into the zone that the gate is a wall');

  /* and nothing else forces that trip except the luxury unlock */
  for (const u of H.UPGRADES) {
    if (u.key === 'cool' || u.key === 'auto') continue;
    assert.ok(H.DEF[u.mat].min < H.HEAT_DEPTH,
      u.key + ' also demands a heat run for ' + u.mat + '; only cooling and autopilot should');
  }
});

test('the mineral gates climb in the same order as the upgrades matter', () => {
  /* Cargo and drill are what a new player buys first, so they must ask for the
     shallowest things. Autopilot is the last luxury and asks for the deepest. */
  const depthOf = (key) => H.DEF[H.UPGRADES.find((u) => u.key === key).mat].min;
  assert.ok(depthOf('cargo') <= depthOf('drill'));
  assert.ok(depthOf('drill') < depthOf('thrust'));
  assert.ok(depthOf('thrust') < depthOf('tank'));
  assert.ok(depthOf('tank') < depthOf('scan'));
  assert.ok(depthOf('scan') < depthOf('cool'));
  assert.ok(depthOf('cool') < depthOf('auto'));
});

test('maxing everything is a lot of digging but not a wall', () => {
  const need = {};
  for (const u of H.UPGRADES) need[u.mat] = (need[u.mat] || 0) + H.matTotalFor(u, u.max);

  for (const [id, n] of Object.entries(need)) {
    const ore = H.DEF[id];
    assert.ok(n >= 2, id + ' is asked for only ' + n + ' times - the gate is decorative');
    /* Expected finds per hundred cells dug at or below the mineral's depth.
       Anything needing more than a few runs' worth stops being a gate and
       becomes a grind. */
    const perHundredCells = ore.chance * 100;
    const runsWorth = n / perHundredCells;
    assert.ok(runsWorth < 12,
      'maxing everything needs ' + n + ' ' + id + ', about ' + runsWorth.toFixed(1) +
      ' hundred-cell runs of nothing but looking for it');
  }
});

test('material requirements are unchanged', () => {
  assertGolden('materials-required', {
    fromLevel: H.MAT_FROM_LEVEL,
    perUpgrade: H.UPGRADES.map((u) => ({
      key: u.key, mat: u.mat, mineralDepth: H.DEF[u.mat].min,
      steps: Array.from({ length: u.max }, (_, l) => H.matCost(u, l)),
      total: H.matTotalFor(u, u.max)
    }))
  });
});

test('an old save is grandfathered exactly, never over-granted', () => {
  const before = { ...H.g.up };
  H.g.up.cool = 6; H.g.up.drill = 9; H.g.up.cargo = 2; H.g.up.auto = 0;
  const stock = H.grandfatherStock();

  const cool = H.UPGRADES.find((u) => u.key === 'cool');
  assert.equal(stock[cool.mat], H.matTotalFor(cool, 6),
    'a level 6 rig must be granted exactly the six levels it already paid for');
  assert.equal(stock.copper, undefined,
    'level 2 never cost materials, so nothing is owed for it');
  assert.equal(stock.ruby, undefined, 'an uninstalled autopilot owes nothing');

  /* and the grant leaves nothing over for the NEXT level */
  const spentThrough6 = H.matTotalFor(cool, 6);
  const nextLevel = H.matCost(cool, 6);
  assert.ok(stock[cool.mat] - spentThrough6 === 0 && nextLevel.need > 0,
    'grandfathering must not pay for a level the player has not bought');

  Object.assign(H.g.up, before);
});

/* The invariant that makes extending the ore ladder safe.

   blockAt() walks ORES in order and takes the first entry whose depth gate is
   met. Because each entry's spawn chance is strictly lower than the one after
   it, a deeper ore's cells are a strict SUBSET of the cells the next one up
   would have claimed. That is why adding a new deepest ore only ever converts
   the ore directly above it, rather than reshuffling every band.

   Break this and the additive-only test in blocks.test.mjs stops meaning what
   it says, silently. */
test('ORES is ordered so a deeper ore claims a subset of the next one up', () => {
  for (let i = 1; i < H.ORES.length; i++) {
    const deeper = H.ORES[i - 1], shallower = H.ORES[i];
    assert.ok(deeper.min >= shallower.min,
      deeper.id + ' is listed above ' + shallower.id + ' but starts shallower');
    assert.ok(deeper.chance < shallower.chance,
      deeper.id + ' (' + deeper.chance + ') must be rarer than ' + shallower.id +
      ' (' + shallower.chance + '), or it steals cells that were never the ' +
      'other one\'s to give');
  }
});

test('the deepest ores are reachable on some planet, and not before', () => {
  /* The CRAFT lesson about content bands that fall outside the reachable
     range, applied in both directions: an ore nobody can reach is dead, and
     ground with no ore in it is a hundred metres of nothing. */
  for (const o of H.ORES) {
    let firstPlanet = -1;
    for (let p = 0; p < 12 && firstPlanet < 0; p++)
      if (H.coreDepth(p) > o.min + 4) firstPlanet = p;
    assert.ok(firstPlanet >= 0, o.id + ' at ' + o.min + ' m is unreachable on any planet');
    assert.ok(firstPlanet <= 5,
      o.id + ' only appears from planet ' + firstPlanet + ', which nobody will see');
  }

  /* and no long stretch of the deepest reachable ground has nothing new in it */
  const deepest = H.coreDepth(5);
  const mins = H.ORES.map((o) => o.min).sort((a, b) => a - b);
  let worst = 0, at = 0;
  for (let i = 1; i < mins.length; i++)
    if (mins[i] - mins[i - 1] > worst) { worst = mins[i] - mins[i - 1]; at = mins[i - 1]; }
  const tail = deepest - mins[mins.length - 1];
  assert.ok(worst <= 45, 'a ' + worst + ' m stretch from ' + at + ' m has no new ore in it');
  assert.ok(tail <= 55,
    'the last ' + tail + ' m before planet 5\'s core has nothing new in it');
});

test('planet names and skies do not run out before anyone stops playing', () => {
  const names = new Set();
  for (let p = 0; p < 12; p++) {
    const n = H.planetName(p);
    assert.ok(!/\d/.test(n),
      'planet ' + p + ' is "' + n + '" - a numeric suffix says "you have seen ' +
      'everything" at exactly the point the game is asking for more time');
    names.add(n);
    assert.ok(H.skyHi(p) !== H.skyLo(p), 'planet ' + p + ' has a flat sky');
  }
  assert.equal(names.size, 12, 'duplicate planet names inside one cycle');
});
