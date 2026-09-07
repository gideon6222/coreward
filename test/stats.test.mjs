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
      effects: Array.from({ length: u.max + 1 }, (_, l) => u.effect(l))
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
  assert.equal(H.W, 9);
  assert.equal(H.START_X, 4);
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
