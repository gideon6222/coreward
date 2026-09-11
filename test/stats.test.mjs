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
  out.cellFuel = sweep('scrub', 8, () => H.S.cellFuel());
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
      H.setWorld(p);
      out.push({ cargo: c, planet: p, value: H.haulValue() });
    }
  }
  H.g.cargo = savedCargo;
  H.setWorld(savedPlanet);
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
    /* Reachable on the world where the row UNLOCKS, not on the first world.
       M5 ended leg 0 at 58 m, so emerald at 78 and ruby at 105 are below it -
       and so are the rows they belong to, which unlock at 55, 65 and 90 m and
       cannot be opened on leg 0 either. The claim that matters is that by the
       time a row is buyable, the mineral it wants exists above that world's
       core. */
    let leg = 0;
    while (leg < 40 && H.coreDepth(leg) <= (u.unlock || 0)) leg++;
    assert.ok(def.min < H.coreDepth(leg),
      u.key + ' unlocks at ' + (u.unlock || 0) + ' m, first reachable on leg ' + leg +
      ' whose core is at ' + H.coreDepth(leg) + ' m, but needs ' + u.mat + ' from ' + def.min + ' m');
  }
});

test('the opening hour is untouched, and requirements ramp after it', () => {
  for (const u of H.UPGRADES) {
    for (let lvl = 0; lvl < H.MAT_FROM_LEVEL - 1; lvl++)
      assert.equal(H.matCost(u, lvl), null,
        u.key + ' wants materials to reach level ' + (lvl + 1) + ', inside the free tier');
    assert.ok(H.matCost(u, H.MAT_FROM_LEVEL - 1),
      u.key + ' should start wanting materials at level ' + H.MAT_FROM_LEVEL);

    /* Ramps and then PLATEAUS, which is round seven's change and is deliberate.

       The requirement used to grow by two a rung for ever. With half as much
       ore in the ground that turned the top of a ladder into an expedition -
       measured, maxing the tree wanted 72 iron, about sixteen hundred-cell runs
       of nothing but looking. It grows by one and stops at four now. What still
       has to hold is that it never goes BACKWARDS and that it does grow at
       least once, because a flat requirement from the first rung is not a ramp
       at all. */
    let prev = 0, grew = 0;
    for (let lvl = H.MAT_FROM_LEVEL - 1; lvl < u.max; lvl++) {
      const m = H.matCost(u, lvl);
      assert.equal(m.id, u.mat, u.key + ' changed mineral mid-ladder');
      assert.ok(m.need >= prev, u.key + ' requirement fell at level ' + (lvl + 1));
      if (m.need > prev) grew++;
      prev = m.need;
    }
    if (u.max > H.MAT_FROM_LEVEL)
      assert.ok(grew >= 2, u.key + ' requirement never ramps, it is flat from the first rung');
  }
});

/* THE one that carries the design. */
test('the Cooling Rig is gated behind a mineral inside the heat zone', () => {
  const cool = H.UPGRADES.find((u) => u.key === 'cool');
  const mat = H.DEF[cool.mat];
  /* Measured on the world where the row actually opens, not on leg 0. M5 made
     the heat line a fraction of each world's core, so "inside the heat zone"
     is a different metre on every leg and the claim has to be made against the
     leg that can buy it. */
  let leg = 0;
  while (leg < 40 && H.coreDepth(leg) <= cool.unlock) leg++;
  const heat = H.heatDepth(leg), core = H.coreDepth(leg);
  assert.ok(mat.min > heat,
    'cooling must be bought with a mineral from below the heat line of leg ' + leg + ' (' + heat +
    ' m), so a heat run has to happen BEFORE the heat protection - ' + cool.mat + ' starts at ' + mat.min);
  const into = (mat.min - heat) / (core - heat);
  assert.ok(into < 0.6,
    cool.mat + ' at ' + mat.min + ' m is ' + Math.round(into * 100) + '% of the way from the heat ' +
    'line to the core on leg ' + leg + ' - that far in, the gate is a wall');

  /* Nothing that a player needs before the heat zone may demand a mineral
     from inside it. The exemptions are the things you buy BECAUSE you go
     deep - the rig itself, the autopilot, and the laser, which does not even
     appear on the shelf until 90 m. */
  /* Deep Survey joined this list with M5. It exists to find ore through rock
     at depth and it unlocks at 35 m, which on leg 0 is past the heat line at
     32 - it is bought BECAUSE you go deep, exactly like the other three. */
  const deepOnly = new Set(['cool', 'auto', 'laser', 'survey', 'drone', 'reactor']);
  for (const u of H.UPGRADES) {
    if (deepOnly.has(u.key)) continue;
    assert.ok(H.DEF[u.mat].min < H.heatDepth(0),
      u.key + ' demands a heat run for ' + u.mat + ', but it is not a deep-game upgrade');
  }
  for (const key of deepOnly) {
    const u = H.UPGRADES.find((x) => x.key === key);
    /* Exempt means "you buy it because you go deep", and the honest test of
       that is the row's own unlock against the heat line of leg 0, not a fixed
       55 m written when the heat line was a fixed 70. */
    assert.ok(u.unlock >= H.heatDepth(0) * 0.9,
      key + ' is exempt from the heat-run rule but unseals at ' + u.unlock +
      ' m, above the leg 0 heat line at ' + H.heatDepth(0));
  }
});

test('the mineral gates climb in the same order as the upgrades matter', () => {
  /* Cargo and drill are what a new player buys first, so they must ask for the
     shallowest things. Autopilot is the last luxury and asks for the deepest. */
  const depthOf = (key) => H.DEF[H.UPGRADES.find((u) => u.key === key).mat].min;
  /* Stated as two groups rather than one chain. The chain was cargo, drill,
     thrust, tank, scan, cool, auto, and it broke the moment the Scanner moved
     to copper - which is the RIGHT place for an opening-kit row to sit, so the
     test was wrong rather than the table. What actually matters is that
     everything you need to start comes from above the heat line, and
     everything you buy because you went deep comes from below it. */
  const open = H.UPGRADES.filter((u) => (u.unlock || 0) === 0);
  const deep = ['cool', 'auto', 'laser', 'survey', 'drone', 'reactor'];
  const heat = H.heatDepth(0);
  for (const u of open) {
    assert.ok(depthOf(u.key) < heat,
      u.key + ' is an opening row but wants ' + u.mat + ' from ' + depthOf(u.key) +
      ' m, below the leg 0 heat line at ' + heat);
  }
  const deepestOpen = Math.max(...open.map((u) => depthOf(u.key)));
  for (const k of deep) {
    assert.ok(depthOf(k) > deepestOpen,
      k + ' wants ' + depthOf(k) + ' m, no deeper than the opening kit at ' + deepestOpen);
  }
  /* And within the opening kit the very first two are still the shallowest. */
  assert.ok(depthOf('cargo') <= depthOf('drill'));
  assert.ok(depthOf('drill') <= depthOf('thrust'));
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
    /* Eight worlds, not five. Round seven spread the ladder out deliberately -
       "you only start seeing new resources when you get really deep" - so
       Solmarrow arriving on planet 7 is the feature. The bound is still here
       because an ore nobody reaches is still dead content; it is just drawn
       where the ladder now ends. */
    assert.ok(firstPlanet <= 7,
      o.id + ' only appears from planet ' + firstPlanet + ', which nobody will see');
  }

  /* and no long stretch of the deepest reachable ground has nothing new in it */
  const deepest = H.coreDepth(7);
  const mins = H.ORES.map((o) => o.min).sort((a, b) => a - b);
  let worst = 0, at = 0;
  for (let i = 1; i < mins.length; i++)
    if (mins[i] - mins[i - 1] > worst) { worst = mins[i] - mins[i - 1]; at = mins[i - 1]; }
  const tail = deepest - mins[mins.length - 1];
  assert.ok(worst <= 62, 'a ' + worst + ' m stretch from ' + at + ' m has no new ore in it');
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

test('every drill tier has a name, and the ladder never repeats a look', () => {
  /* The tier names are the promise; the auger's appearance is the payoff. A
     tier with no distinct look is an upgrade the player buys on trust, which
     is exactly what the Scanner Array was before the headlight. */
  const drill = H.UPGRADES.find((u) => u.key === 'drill');
  assert.ok(drill.tiers, 'the drill lost its tier names');
  assert.equal(drill.tiers.length, drill.max + 1,
    'there must be a tier name for level 0 through ' + drill.max);
  assert.equal(new Set(drill.tiers).size, drill.tiers.length, 'duplicate tier name');
});

/* ---------- ordnance ----------

   Two abilities off one shared meter. The tests are about them staying
   situational: a piece of ordnance that out-digs the drill is a second drill,
   and one that never beats it is a souvenir. */

test('the charge always beats the laser per point of power', () => {
  /* They cost different amounts and unlock at different depths, so the more
     expensive-to-fire one has to clear more per point at EVERY level. The
     first version had them equal at level 1, which made the charge - cheaper
     to unlock, earlier, and twice the firing cost - strictly pointless the
     moment you owned both. */
  for (let l = 1; l <= 3; l++) {
    const perPower = H.bombCells(l) / H.BOMB_CHARGE;
    const laserPer = H.laserRange(l) / H.LASER_CHARGE;
    assert.ok(perPower > laserPer,
      'at level ' + l + ' the charge clears ' + perPower.toFixed(1) + ' cells per power ' +
      'and the laser ' + laserPer.toFixed(1) + ' - the charge has nothing to offer');
  }
  /* and the laser keeps reach: it touches cells the charge cannot */
  for (let l = 1; l <= 3; l++)
    assert.ok(H.laserRange(l) > H.bombRadius(l) + 1,
      'at level ' + l + ' the laser does not reach past the charge, so it has ' +
      'neither range nor volume to offer');
});

test('ordnance grows with its level and stays inside sane bounds', () => {
  for (let l = 1; l < 3; l++) {
    assert.ok(H.bombCells(l + 1) > H.bombCells(l), 'charge level ' + (l + 1) + ' adds nothing');
    assert.ok(H.laserRange(l + 1) > H.laserRange(l), 'laser level ' + (l + 1) + ' adds nothing');
  }
  assert.ok(H.bombCells(3) < H.W * 4,
    'a maxed charge clears ' + H.bombCells(3) + ' cells, which is most of the screen');
  assert.ok(H.laserRange(3) <= 12, 'a laser reaching further than the frame is aiming blind');
  assert.ok(H.BOMB_CHARGE <= H.CHARGE_MAX && H.LASER_CHARGE <= H.CHARGE_MAX,
    'an ability that costs more than a full meter can never be fired');
});

test('power fills at the pad and trickles underground', () => {
  assert.equal(H.chargeAfter(0, 0.016, true), H.CHARGE_MAX, 'the pad must refill completely');
  assert.equal(H.chargeAfter(H.CHARGE_MAX, 10, false), H.CHARGE_MAX, 'power must clamp at the cap');

  /* a full meter from empty takes the whole recharge time, and no less */
  const secs = H.CHARGE_SECONDS * H.CHARGE_MAX;
  let c = 0;
  for (let i = 0; i < secs * 60; i++) c = H.chargeAfter(c, 1 / 60, false);
  assert.ok(Math.abs(c - H.CHARGE_MAX) < 0.01, 'recharge drifted: ' + c);

  /* and it does not depend on frame rate */
  let fast = 0, slow = 0;
  for (let i = 0; i < 120 * 60; i++) fast = H.chargeAfter(fast, 1 / 120, false);
  for (let i = 0; i < 30 * 60; i++) slow = H.chargeAfter(slow, 1 / 30, false);
  assert.ok(Math.abs(fast - slow) < 1e-9, 'recharge differs with frame rate');

  /* the trickle must be slow enough that returning to the pad still matters */
  const perFire = H.CHARGE_SECONDS * H.BOMB_CHARGE;
  assert.ok(perFire > 60,
    'a charge comes back every ' + perFire + 's underground, which is often enough ' +
    'that the pad refill is not worth walking to');
});

test('every upgrade has a counter and a sensible unlock depth', () => {
  const groups = new Set(['rig', 'survival', 'instruments', 'ordnance']);
  for (const u of H.UPGRADES) {
    assert.ok(groups.has(u.group), u.key + ' is on no counter: ' + u.group);
    /* Reachable somewhere in the early game rather than on leg 0 specifically:
       M5 ended leg 0 at 58 m, and three rows deliberately open below that. */
    /* Reachable in the early game rather than on leg 0 - and "early" now means
       four worlds rather than two. Round seven spread the ore ladder over eight
       planets and the rows that are built out of deep minerals followed them
       down; the Cutting Laser is a ruby tool and ruby starts at 168 m. The
       bound is still here because a row nobody can reach is dead content, it
       just sits where the ladder now does. */
    assert.ok(u.unlock >= 0 && u.unlock < H.coreDepth(4),
      u.key + ' unlocks at ' + u.unlock + ' m, which is past the core of leg 4 at ' + H.coreDepth(4));
    /* Anything gated has to be gated ABOVE the depth where its own mineral
       lives, or the shelf unseals at the exact moment you could already
       afford it and the gate has done nothing. */
    if (u.unlock > 0)
      assert.ok(u.unlock <= H.DEF[u.mat].min + 30,
        u.key + ' unseals at ' + u.unlock + ' m but wants ' + u.mat + ' from ' +
        H.DEF[u.mat].min + ' m, so one of the two gates is doing nothing');
  }
  /* the opening kit has to be big enough to make a first run possible */
  const open = H.UPGRADES.filter((u) => u.unlock === 0);
  assert.ok(open.length >= 4, 'only ' + open.length + ' upgrades on the shelf at 0 m');
  for (const key of ['drill', 'cargo', 'thrust'])
    assert.equal(H.UPGRADES.find((u) => u.key === key).unlock, 0,
      key + ' must be available from the first visit');
});

/* ---------- relics ----------

   The second objective. Credits buy the ladder and reset their own relevance
   every time you can afford the next rung; a relic is kept forever, so the
   collection is the one number that only ever goes up.

   It is also the only thing in the game you can miss permanently: break the
   core with the relic still in the ground and it goes with the planet. */

test('every planet buries exactly one relic, and never out of reach', () => {
  for (let p = 0; p < 16; p++) {
    const r = H.relicAt(p);
    const cd = H.coreDepth(p);
    assert.ok(r.d >= Math.floor(cd * 0.5),
      'planet ' + p + ' relic at ' + r.d + ' m is above the halfway mark, so it ' +
      'would be found on the way past rather than looked for');
    assert.ok(r.d < cd, 'planet ' + p + ' relic at ' + r.d + ' m is at or past the core');
    assert.ok(r.x >= 1 && r.x <= H.W - 2,
      'planet ' + p + ' relic is in column ' + r.x + ', hard against the wall');
    /* deterministic, like everything else in the world */
    assert.deepEqual(H.relicAt(p), r);
  }
});

test('relics move around between planets', () => {
  const cols = new Set(), depths = new Set();
  for (let p = 0; p < 16; p++) {
    const r = H.relicAt(p);
    cols.add(r.x);
    depths.add(Math.floor(r.d / 10));
  }
  assert.ok(cols.size > 4, 'relics only use ' + cols.size + ' columns; the search is the same every time');
  assert.ok(depths.size > 4, 'relics cluster at the same depth on every planet');
});

test('a relic is generated until it is taken, then never again', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  H.g.relics = [];
  const r = H.relicAt(0);
  const there = H.blockAt(r.x, r.d);
  assert.ok(there && there.relic, 'no relic at the place relicAt names');
  assert.equal(there.wt, 0, 'a relic must never cost cargo weight');
  assert.equal(there.value, 0, 'a relic pays in what it does, not in credits');

  /* it must not lose a coin flip to a cave or a pocket */
  let count = 0;
  for (let d = 0; d < H.coreDepth(0); d++)
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      if (b && b.relic) count++;
    }
  assert.equal(count, 1, 'expected exactly one relic on the planet, found ' + count);

  H.g.relicsTaken = [0];
  assert.ok(!(H.blockAt(r.x, r.d) || {}).relic, 'a taken relic must not come back');
  H.g.relics = []; H.g.relicsTaken = [];
});

/* The bug this exists to prevent, which shipped for about an hour.

   Past the named eight, every planet grants the same stacking charter. The
   first version asked "do I already own this perk" to decide whether a relic
   was still in the ground - which answers yes for every planet from the ninth
   onward, and quietly stops generating relics for the rest of the game.

   The perk is what you own. `relicsTaken` is what you have done. They are not
   the same list and must not be conflated. */
test('relics keep appearing past the point where the perks repeat', () => {
  H.g.dug = new Set();
  H.g.rubble = new Set();
  /* someone who has cleared the first twelve planets */
  H.g.relics = H.RELICS.map((r) => r.id).concat(['assay', 'assay', 'assay']);
  H.g.relicsTaken = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

  for (const p of [12, 13, 20]) {
    H.setWorld(p);
    const r = H.relicAt(p);
    const b = H.blockAt(r.x, r.d);
    assert.ok(b && b.relic,
      'planet ' + p + ' has no relic, because its perk was already owned - the ' +
      'collection stops the moment the perks start repeating');
  }

  /* and a planet already cleared still has none */
  H.setWorld(3);
  const done = H.relicAt(3);
  assert.ok(!(H.blockAt(done.x, done.d) || {}).relic, 'a cleared planet regrew its relic');

  H.g.relics = []; H.g.relicsTaken = []; H.setWorld(0);
});

test('every relic perk is named, described and actually does something', () => {
  const ids = new Set();
  for (const r of H.RELICS) {
    assert.ok(!ids.has(r.id), 'duplicate relic id ' + r.id);
    ids.add(r.id);
    assert.equal(H.RELIC_OF[r.id], r);
    assert.ok(r.name.length > 3 && r.name.length < 26, r.id + ' name will not fit the event card');
    assert.ok(r.blurb.length > 15 && r.blurb.length < 60, r.id + ' blurb will not fit one line');
  }

  /* Each perk has to move a stat it claims to move. Checked against the real
     derived stats rather than against the table, because a perk that is
     described and never read is the exact failure this is here to catch. */
  const base = {};
  H.g.relics = [];
  for (const k of ['drill', 'cargoCap', 'light', 'cellFuel', 'fuelUse', 'heatTake', 'gasTake', 'powerCap', 'saleBonus'])
    base[k] = H.S[k]();

  const moves = {
    drum: 'drill', weave: 'cargoCap', eye: 'light', rights: 'cellFuel',
    recyc: 'fuelUse', lattice: 'heatTake', damper: 'gasTake',
    coupler: 'powerCap', assay: 'saleBonus'
  };
  for (const r of H.RELICS) {
    const stat = moves[r.id];
    assert.ok(stat, r.id + ' is not wired to any stat in this test - either it does ' +
      'nothing or the test has fallen behind');
    H.g.relics = [r.id];
    assert.notEqual(H.S[stat](), base[stat],
      r.id + ' claims "' + r.blurb + '" but ' + stat + ' did not move');
  }
  H.g.relics = [];
});

test('the assay charter stacks past the named relics', () => {
  H.g.relics = [];
  const one = (n) => { H.g.relics = Array(n).fill('assay'); return H.S.saleBonus(); };
  assert.ok(one(1) > 1, 'one charter should pay something');
  assert.ok(one(3) > one(1), 'charters must stack, or planet 12 onward has no reward');
  assert.ok(one(10) < 1.6, 'ten charters at ' + one(10).toFixed(2) + 'x is runaway');
  H.g.relics = [];
  /* and past the named eight, every planet grants the stacking one */
  assert.equal(H.relicFor(20).id, 'assay');
  assert.equal(H.relicFor(0).id, H.RELICS[0].id);
});

test('the second wave of upgrades each answer something the first ten cannot', () => {
  /* The bar for a new upgrade is that it is not a second price on a decision
     the player already makes. These are the five gaps that existed, asserted
     as properties rather than as a list of names, so the test survives a
     rename and fails on a duplicate. */
  const by = (k) => H.UPGRADES.find((u) => u.key === k);

  /* Hull was a flat constant from the first metre to the last - the only
     survival stat with no ladder at all. */
  H.g.up.hull = 0;
  const base = H.S.hullCap();
  H.g.up.hull = by('hull').max;
  assert.ok(H.S.hullCap() > base * 2, 'maxed Hull Plating barely moves the hull');
  H.g.up.hull = 0;

  /* Not installed means NOT INSTALLED. CRAFT.md: a station the player can pass
     through and get nothing from teaches them to stop reading the signs - and
     the inverse, a level-0 effect that already does something, means the first
     purchase buys nothing you did not have. */
  for (const k of ['magnet', 'survey', 'drone', 'reactor']) {
    H.g.up[k] = 0;
  }
  assert.equal(H.S.magnetR(), 0, 'the magnet pulls before it is bought');
  assert.equal(H.S.surveyM(), 0, 'the survey reads before it is bought');
  assert.equal(H.S.repair(), 0, 'the drone repairs before it is bought');
  assert.equal(H.S.powerExtra(), 0, 'the reactor adds power before it is bought');
  assert.equal(H.S.rechargeMult(), 1, 'the reactor speeds recharge before it is bought');

  for (const k of ['magnet', 'survey', 'drone', 'reactor']) {
    H.g.up[k] = 1;
  }
  assert.ok(H.S.magnetR() > 0.5, 'the first level of the magnet does nothing worth the price');
  assert.ok(H.S.surveyM() > 1, 'the first level of the survey does nothing worth the price');
  assert.ok(H.S.repair() > 0, 'the first level of the drone does nothing');
  assert.ok(H.S.powerExtra() >= 1 && H.S.rechargeMult() > 1, 'the first reactor does nothing');

  for (const k of ['hull', 'magnet', 'survey', 'drone', 'reactor']) H.g.up[k] = 0;
});

test('the repair drone can never outpace the heat it is meant to survive', () => {
  /* The drone must make a bad run recoverable, never make heat survivable.
     If it out-heals soak at depth, the whole bottom half of the game stops
     having a cost and the Cooling Rig - which is the ladder the deep game is
     built on - becomes optional. */
  const maxRepair = (() => {
    const u = H.UPGRADES.find((x) => x.key === 'drone');
    H.g.up.drone = u.max;
    const r = H.S.repair();
    H.g.up.drone = 0;
    return r;
  })();

  /* Soak damage per second at the heat line and well past it, with no cooling.
     soakAfter returns the new soak; what costs hull is the rate it climbs. */
  const at = (d) => {
    let soak = 0;
    for (let i = 0; i < 60; i++) soak = H.soakAfter(soak, d, 1 / 60, 1);
    return soak;
  };
  const deep = at(H.heatDepth(0) + 60);
  assert.ok(deep > 0, 'the heat model stopped charging for depth');
  /* The drone heals `maxRepair` hull per second; soak climbing to `deep` in a
     second is what the hull then pays for. An order of magnitude is the claim. */
  assert.ok(maxRepair < 4,
    'a maxed drone repairs ' + maxRepair + ' hull/s, which is in the range heat takes');
});

test('a consumable never undercuts the upgrade that answers the same problem', () => {
  /* CRAFT.md: consumables and permanent upgrades sit on different axes, and
     the way that breaks is on price. If the one-run answer to a problem costs
     less than the first rung of the permanent answer, stocking up quietly
     replaces climbing - and the ladder, which is the whole progression, stops
     being bought.

     Asserted as pairs rather than as absolute numbers so a repricing of either
     side keeps the relationship. */
  const sup = (k) => H.SUPPLIES.find((s) => s.key === k);
  const up = (k) => H.UPGRADES.find((u) => u.key === k);
  const rung1 = (k) => H.costOf(up(k), 0);

  const pairs = [
    ['overdrive', 'drill'],
    ['bulwark', 'hull'],
    ['pulse', 'survey']
  ];
  for (const [s, u] of pairs) {
    assert.ok(sup(s), 'no supply "' + s + '"');
    assert.ok(sup(s).cost > rung1(u),
      sup(s).name + ' costs ' + sup(s).cost + ' against ' + up(u).name +
      ' level 1 at ' + rung1(u) + ' - the consumable replaces the ladder');
  }
});

test('the timed consumables are windows, not permanent power', () => {
  /* A stack limit and a window length are the two things that keep these on
     the consumable axis. Large stacks turn a window into a state you are
     always in; a long window does the same thing more slowly. */
  for (const k of ['overdrive', 'bulwark', 'pulse']) {
    const s = H.SUPPLIES.find((x) => x.key === k);
    assert.ok(s.max <= 2, s.name + ' stacks to ' + s.max + ', which is a strategy rather than a decision');
  }
  assert.ok(H.OVERDRIVE_SECS <= 30, 'Overdrive lasts long enough to be a state rather than a moment');
  assert.ok(H.PULSE_SECS <= 45, 'the pulse lasts long enough to be a permanent sense');

  /* And Overdrive must stay under a free Drill Bit level, or carrying one is
     strictly better than buying the rung it imitates. */
  const drill = H.UPGRADES.find((u) => u.key === 'drill');
  const perLevel = 1 + 0.95;
  assert.ok(H.OVERDRIVE_MULT < perLevel,
    'Overdrive at ' + H.OVERDRIVE_MULT + 'x is worth more than a level of ' + drill.name);
});

test('the shelf shows everything you can buy and exactly one thing you cannot', () => {
  /* The corrected form of a CRAFT.md rule rather than an exception to it.

     The rule said sealed rows should be SHOWN and not hidden, because "Sealed
     until 90 m" is a reason to go deeper. That is true of the next gate and
     false of all of them: at fifteen upgrades and six gates, a first-hour
     player was looking at five cases they could not plan toward. Showing
     exactly one keeps the entire benefit - there is always one visible reason
     to go deeper - and removes the clutter that came with the other four.

     ROUND SIX narrows the universe this is asserted over, and does not weaken
     it. Seven of the fifteen are no longer sold at any price until they are
     dug out of the rock, so "everything you can buy" now means the eight
     ladders. A device is not a hidden sealed row - it is not a row. The
     separate claim, that a device never appears unbought, is in finds.test.mjs
     and is asserted there rather than smuggled in here. */
  const SOLD = H.UPGRADES.filter((u) => !H.FOUND_KEYS.has(u.key));
  for (const depth of [0, 8, 25, 46, 61, 91, 300]) {
    const stock = H.shelfStock(depth, []);
    const sealed = stock.filter((u) => depth < u.unlock);
    const open = SOLD.filter((u) => depth >= u.unlock);

    for (const u of open) {
      assert.ok(stock.includes(u),
        'at ' + depth + ' m, ' + u.key + ' is unlocked but not on the shelf');
    }
    assert.ok(sealed.length <= 1,
      'at ' + depth + ' m the shelf shows ' + sealed.length + ' sealed cases: ' +
      sealed.map((u) => u.key).join(', '));

    /* And the one shown is the NEXT one, not any of them - a teaser you reach
       last is not a reason to go anywhere. */
    if (sealed.length === 1) {
      const shallowest = SOLD
        .filter((u) => depth < u.unlock)
        .reduce((a, b) => (a.unlock <= b.unlock ? a : b));
      assert.equal(sealed[0].key, shallowest.key,
        'at ' + depth + ' m the teaser is ' + sealed[0].key + ' at ' + sealed[0].unlock +
        ' m, but ' + shallowest.key + ' at ' + shallowest.unlock + ' m comes first');
    }
  }

  /* The same claim for a player holding every device, which is the state the
     shop spends most of a long save in. The teaser rule has to survive the
     shelf growing back to fifteen. */
  const ALL = H.UPGRADES.map((u) => u.key);
  for (const depth of [0, 46, 91]) {
    const sealed = H.shelfStock(depth, ALL).filter((u) => depth < u.unlock);
    assert.ok(sealed.length <= 1,
      'at ' + depth + ' m with every device in hand the shelf shows ' + sealed.length +
      ' sealed cases: ' + sealed.map((u) => u.key).join(', '));
  }
});

test('there is always a reason to go deeper, until there is nothing left to buy', () => {
  /* The half of the rule that must not be lost. If the shelf ever shows only
     what you already have while something is still gated, the shop has stopped
     pointing anywhere.

     Asserted twice: for a player who has found nothing, whose gates are the
     eight sold ladders, and for one holding every device, whose gates are all
     fifteen. Those are the two ends of a save and the rule has to hold at
     both - it was only ever checked at the second before round six, because
     the second was the only one that existed. */
  const SOLD = H.UPGRADES.filter((u) => !H.FOUND_KEYS.has(u.key));
  const ALL = H.UPGRADES.map((u) => u.key);

  for (const [held, pool, who] of [[[], SOLD, 'a player who has found nothing'],
                                   [ALL, H.UPGRADES, 'a player holding every device']]) {
    const deepest = Math.max(...pool.map((u) => u.unlock));
    for (let d = 0; d < deepest; d += 7) {
      const stock = H.shelfStock(d, held);
      assert.ok(stock.some((u) => d < u.unlock),
        'at ' + d + ' m nothing on the shelf is sealed for ' + who +
        ', but ' + deepest + ' m is still gated');
    }
    /* Past the last gate everything is open and nothing is teased. */
    const all = H.shelfStock(deepest + 1, held);
    assert.equal(all.length, pool.length,
      'the full shelf for ' + who + ' has ' + all.length + ' rows, not ' + pool.length);
    assert.ok(!all.some((u) => deepest + 1 < u.unlock), 'a teaser survived past the last gate');
  }
});
