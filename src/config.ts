/* Tuning constants and the pure functions over them. Imports only types. */

import type { Ore, Rock, Material, Upgrade, UpgradeKey, Supply, Trait, MatCost } from './types';

/* World width in columns. Only about 8 fit on a portrait screen at the current
   framing, so the rest is lateral room to explore: which way to dig at a given
   depth is a real choice rather than a formality.

   Widening this does not change the blocks in columns 0-8 - rnd() is seeded on
   (x, d, planet), so existing columns generate exactly as before and the new
   ones are simply additional world. */
export const W = 13;
export const SAVE_KEY = 'coreward.v2';
export const OLD_KEY = 'coreward.v1';
export const HULL_MAX = 100;
export const DIG_BASE = 0.5;

/* Twelve rather than six. The list cycles with a numeric suffix, so a long
   session used to read "Verdax 2" by the seventh planet - which says "you have
   seen everything" at exactly the point the game is asking for more time. */
const PLANET_NAMES = ['Verdax', 'Rustmoor', 'Cryon', 'Ashvault', 'Kryllon', 'Tessivar',
                      'Obrinth', 'Palewell', 'Serrik', 'Vantomir', 'Halcyne', 'Dross'];
const SKY_HI = [0x0d2b52, 0x4a1d10, 0x0c3a44, 0x2a0f36, 0x101440, 0x0c331f,
                0x3a1030, 0x1c2c2c, 0x40230c, 0x0a1d3e, 0x2e2a08, 0x1a0e1e];
const SKY_LO = [0x5aa8dd, 0xe08a45, 0x54d4d8, 0xa055b8, 0x5560c8, 0x4fbf78,
                0xe86fb0, 0x7fd8c4, 0xffa356, 0x6f9ae8, 0xd8c94a, 0xa878c8];

export const planetName = (i: number) => {
  const base = PLANET_NAMES[i % PLANET_NAMES.length];
  const cyc = Math.floor(i / PLANET_NAMES.length);
  return cyc ? base + ' ' + (cyc + 1) : base;
};
export const skyHi = (i: number) => SKY_HI[i % SKY_HI.length];
export const skyLo = (i: number) => SKY_LO[i % SKY_LO.length];
export const coreDepth = (p: number) => 110 + p * 35;

/* ---------- planet traits ----------

   Planets used to differ by three numbers that all climbed together: deeper
   core, harder rock, better prices. That is a difficulty slider, not variety -
   every planet was the last one with the dial turned up, so the ladder gave
   you nothing new to learn.

   A trait gives each one a different question. Every trait is a multiplier on
   something layered over generation, never on the ore stream itself; see the
   note on Trait in types.ts for why that line matters.

   Verdax is always Stable. The first planet is where you learn what normal
   feels like, and a trait there would just read as "the game is like this". */
export const TRAITS: Trait[] = [
  { id: 'stable', name: 'Stable',
    blurb: 'Nothing unusual in the crust. A good place to learn the ground.' },
  { id: 'volatile', name: 'Volatile',
    blurb: 'Gas pockets riddle the rock, and they hit harder here.',
    gas: 2.2, gasDamage: 1.35 },
  { id: 'hollow', name: 'Hollow',
    blurb: 'Cave systems run through it. Quick to cross, little to mine.',
    cave: 2.4 },
  { id: 'crystalline', name: 'Crystalline',
    blurb: 'Geode seams everywhere, for anyone willing to dig sideways.',
    geode: 3.0 },
  { id: 'searing', name: 'Searing',
    blurb: 'The rock holds its heat. Soak builds far faster than it should.',
    soak: 1.6 }
];

/* Deterministic, so a planet is the same every time you reach it and the
   golden tests stay reproducible. Skips index 0 for p > 0 so the four real
   traits cycle and Stable stays unique to Verdax. */
export const traitOf = (p: number): Trait =>
  p <= 0 ? TRAITS[0] : TRAITS[1 + (Math.imul(p, 2654435761) >>> 8) % (TRAITS.length - 1)];

export const TRAIT_OF: Record<string, Trait> = {};
for (const t of TRAITS) TRAIT_OF[t.id] = t;
export const hardMult = (p: number) => 1 + p * 0.28;
export const valueMult = (p: number) => 1 + p * 0.6;

/* ---------- pockets ----------

   Rare cells that are not ore. They exist because the loop was predictable: dig
   down, sell, upgrade, repeat, with the only variable being how deep you dared.
   These make a given descent differ from the last one, and they push in both
   directions - a reason to want to stay down, and a second reason staying down
   is dangerous, which the heat soak badly needed since it was carrying that
   entirely on its own.

   Both are generated from the same seeded hash as everything else, so a planet
   is reproducible; it is only the player who is surprised. */

/* Worth roughly a full hold of amethyst, in one block that breaks easily. The
   payoff for exploring sideways rather than straight down. */
export const GEODE: Ore = {
  id: 'geode', name: 'Geode', color: 0x7fffe0, host: 0x2b3340,
  hard: 6, wt: 4, value: 6200, min: 52, chance: 0.011, glow: 0.75, shards: 9, tone: 10
};

/* Breaks faster than the rock around it, so you tend to hit one by accident
   rather than by choosing to. Pays nothing and costs hull and soak. */
export const GAS: Ore = {
  id: 'gas', name: 'Gas Pocket', color: 0xd4ee2a, host: 0x2a3320,
  hard: 1.8, wt: 0, value: 0, min: 34, chance: 0.014, glow: 0.45, shards: 5, tone: 2
};

/* A supply cache left by whoever was here before.

   The research finding this answers: routine mining goes stale without
   discovery, and "a touch of surprise" during a descent is what a resource
   loop is missing when every cell is worth a predictable number. Gas and
   geodes made a descent differ from the last one in what it COSTS. This makes
   one differ in what it hands you.

   Rarer than either - about one every couple of runs - because a surprise you
   can plan around is a resource, and this is not meant to be a resource.

   Deliberately pink. Nothing else in the ground is, and a thing left behind by
   people should not look like something the planet grew. */
export const CACHE: Ore = {
  id: 'cache', name: 'Supply Cache', color: 0xff7ad0, host: 0x3a3040,
  hard: 3.4, wt: 0, value: 0, min: 20, chance: 0.006, glow: 0.62, shards: 6, tone: 8
};

export const GAS_HULL_DAMAGE = 26;
export const GAS_SOAK = 0.3;

/* ---------- caves ----------
   Open pockets in the rock, in 2x2 blobs so they read as caves rather than
   confetti. Free travel and a clear view, but they also expose you: soak keeps
   building while you cross one, and there is nothing to mine in it. */
export const CAVE_MIN_DEPTH = 26;
export const caveChance = (d: number) => Math.min(0.09, 0.03 + (d - CAVE_MIN_DEPTH) * 0.0006);

/* Trait-adjusted rates. Capped after the multiply, because a 2.4x on a rate
   that already climbs with depth dissolves the deep ground into open air. */
export const CAVE_CHANCE_CAP = 0.17;
export const caveChanceOn = (d: number, p: number) =>
  Math.min(CAVE_CHANCE_CAP, caveChance(d) * (traitOf(p).cave || 1));
export const gasChanceOn = (p: number) => Math.min(0.06, GAS.chance * (traitOf(p).gas || 1));
export const geodeChanceOn = (p: number) => Math.min(0.06, GEODE.chance * (traitOf(p).geode || 1));

/* ---------- tremors ----------

   Below 70 m the only pressure was heat, which is attrition: it charges you
   for time and nothing else, so the deep game had exactly one question and the
   answer was always "leave a bit sooner". Dome Keeper's tension comes from a
   recurring event on a rhythm rather than a drain, and that is what this is.

   Past TREMOR_DEPTH the ground periodically shifts and fills in some of the
   tunnel you dug. It never touches where you are standing - it takes the way
   OUT. So depth stops being a number you push and becomes a commitment: the
   further down you are when one lands, the worse your route home gets, and the
   more of your remaining fuel goes on re-digging it.

   Deliberately deeper than the heat line, so the world reads in three bands
   rather than two: quiet, hot, and unstable. 85 m leaves a 25 m window on
   planet 0, whose core sits at 110, so the band is reachable on the planet
   everyone starts on. */
export const TREMOR_DEPTH = 85;
/* The rhythm - first delay, gap, jitter, warning - lives in feel.ts. */
/* how far from the ship a cell has to be before it may collapse */
export const TREMOR_SAFE_RADIUS = 3;
export const tremorCells = (d: number) => Math.min(9, 3 + Math.floor((d - TREMOR_DEPTH) / 22));

/* What a collapsed cell becomes. It regenerates as loose rubble rather than as
   whatever was there before, because otherwise a tremor would refill the ore
   you just mined and you could farm the same vein forever. Cheap to clear and
   nearly worthless, so re-digging your way out costs time and fuel and pays
   almost nothing - which is the point. */
export const RUBBLE_HARD = 0.55;   /* against the band it sits in */
export const RUBBLE: Rock = {
  id: 'rubble', name: 'Rubble', color: 0x6d6459, hard: 1.4, wt: 1.2, value: 5, glow: 0.02
};

/* Ordered deepest first, and that order is load-bearing twice over.

   blockAt() walks this list and takes the first entry whose depth gate is met,
   so a deeper ore gets first refusal on a cell. Because each entry's `chance`
   is also strictly lower than the one after it, a deeper ore can only ever
   claim cells the next one up would have taken - which is what makes adding a
   new deepest ore a narrow overwrite rather than a reshuffle of the whole
   table. There is a test on that ordering; break it and every depth on every
   planet quietly rebalances.

   Umbrite and Solmarrow exist because the ladder used to stop at 185 m while
   planet 5's core sits at 285. That is a hundred metres of the deepest, most
   dangerous ground in the game with nothing new in it - which is the CRAFT
   note about unreachable content bands turned inside out: not content you
   cannot reach, but ground you can reach that has no content. */
export const ORES: Ore[] = [
  { id: 'solmarrow', name: 'Solmarrow', color: 0xfff0b0, host: 0x3a3226, hard: 23,   wt: 21,  value: 132000, min: 245, chance: 0.021, glow: 0.72, shards: 8, tone: 10 },
  { id: 'umbrite',   name: 'Umbrite',   color: 0x9d7bff, host: 0x241f33, hard: 19.5, wt: 18,  value: 54000,  min: 210, chance: 0.026, glow: 0.58, shards: 7, tone: 10 },
  { id: 'coreite',  name: 'Coreite',  color: 0x66fff0, host: 0x2a2f3a, hard: 16,  wt: 16,  value: 22000, min: 185, chance: 0.030, glow: 0.60, shards: 7, tone: 9 },
  { id: 'magmite',  name: 'Magmite',  color: 0xff7a18, host: 0x2e2228, hard: 13,  wt: 13,  value: 9000,  min: 145, chance: 0.038, glow: 0.50, shards: 6, tone: 8 },
  { id: 'ruby',     name: 'Ruby',     color: 0xff3b5c, host: 0x33303a, hard: 10,  wt: 10,  value: 3600,  min: 105, chance: 0.042, glow: 0.32, shards: 6, tone: 7 },
  { id: 'emerald',  name: 'Emerald',  color: 0x2fd07a, host: 0x2f3a38, hard: 8.5, wt: 8.5, value: 1800,  min: 78,  chance: 0.048, glow: 0.30, shards: 5, tone: 6 },
  { id: 'amethyst', name: 'Amethyst', color: 0xa060ff, host: 0x35323f, hard: 7,   wt: 7,   value: 900,   min: 56,  chance: 0.055, glow: 0.28, shards: 5, tone: 5 },
  { id: 'gold',     name: 'Gold',     color: 0xffcf47, host: 0x3d3a34, hard: 5.5, wt: 9,   value: 420,   min: 36,  chance: 0.060, glow: 0.20, shards: 5, tone: 4 },
  { id: 'silver',   name: 'Silver',   color: 0xd8e0e8, host: 0x3a3c40, hard: 4.5, wt: 6,   value: 150,   min: 22,  chance: 0.070, glow: 0.16, shards: 4, tone: 3 },
  { id: 'iron',     name: 'Iron',     color: 0xb0b6bd, host: 0x3a3630, hard: 3.5, wt: 4.5, value: 60,    min: 11,  chance: 0.085, glow: 0.10, shards: 4, tone: 2 },
  { id: 'copper',   name: 'Copper',   color: 0xc87137, host: 0x3c342c, hard: 2.6, wt: 3.5, value: 25,    min: 4,   chance: 0.100, glow: 0.10, shards: 4, tone: 1 }
];

export const ROCKS: Rock[] = [
  { id: 'dirt',    name: 'Dirt',    color: 0x6b4b2a, hard: 1,   wt: 0.4, value: 1,  glow: 0.02 },
  { id: 'stone',   name: 'Stone',   color: 0x807a72, hard: 2.4, wt: 0.9, value: 3,  glow: 0.02 },
  { id: 'granite', name: 'Granite', color: 0x5e5a66, hard: 5,   wt: 1.8, value: 9,  glow: 0.02 },
  /* The hot-zone rock. Its whole job is to be unmistakable: it starts at
     exactly HEAT_DEPTH, so the moment the rock turns to smouldering ember you
     are in the zone where dwell time starts killing you. Emissive is high for a
     rock, on purpose - it should look like it is holding heat. */
  { id: 'scoria',  name: 'Scoria',  color: 0x6b2a18, hard: 7,   wt: 2.3, value: 16, glow: 0.10 },
  { id: 'basalt',  name: 'Basalt',  color: 0x3a3540, hard: 9,   wt: 2.8, value: 22, glow: 0.03 }
];

/* Band boundaries are deliberately tied to the mechanics rather than round
   numbers. Granite arriving at 45 telegraphs "this is getting harder" before
   the danger; scoria at 70 IS the danger line, matching HEAT_DEPTH in feel.ts.
   Change one and change the other, or the world stops explaining itself.

   Basalt moved from 130 to 120 because planet 0's core sits at 110 - the old
   band meant the deepest rock in the game was unreachable on the first planet. */
const DIRT_TO_STONE = 10;
const STONE_TO_GRANITE = 45;
export const GRANITE_TO_SCORIA = 70;   /* === HEAT_DEPTH */
const SCORIA_TO_BASALT = 120;

export const baseRock = (d: number) =>
  d < DIRT_TO_STONE ? ROCKS[0]
  : d < STONE_TO_GRANITE ? ROCKS[1]
  : d < GRANITE_TO_SCORIA ? ROCKS[2]
  : d < SCORIA_TO_BASALT ? ROCKS[3]
  : ROCKS[4];

/* Ore carries a depth gate and a spawn chance; rock does not. That is the only
   structural difference between the two, so it is also the type guard - and it
   is what lets the vault and the shop ask a material where it lives. */
export const isOre = (m: Material): m is Ore => 'min' in m;

export const DEF: Record<string, Material> = {};
for (const o of ORES) DEF[o.id] = o;
DEF[GEODE.id] = GEODE;
DEF[RUBBLE.id] = RUBBLE;
DEF[CACHE.id] = CACHE;
DEF[GAS.id] = GAS;
for (const r of ROCKS) DEF[r.id] = r;

/* ---------- supplies ----------

   Upgrades and supplies answer the same threats on different axes: an upgrade
   raises the ceiling on every future run, a supply buys one more minute on
   THIS run. That is the whole decision - bank toward the permanent thing, or
   spend now because the core is forty metres away and you are nearly out.

   Priced against the loss they prevent rather than against a haul. A tow takes
   half your cargo (a tenth once Tow Insurance is maxed) and a haul from 90 m
   runs to several thousand, so anything that reliably averts a tow has to cost
   enough to still be a choice.

   Coolant is the dear one because soak is the only pressure with no permanent
   answer: the cooling rig caps at a 72% shield on purpose, so past a certain
   depth the clock always wins. A flush is the one way to reset that clock, and
   you can only carry two. */
export const PATCH_HULL = 45;
export const CELL_FUEL = 55;

export const SUPPLIES: Supply[] = [
  { key: 'coolant', name: 'Coolant Flush', icon: 'COOL', cost: 1500, max: 2,
    blurb: 'Dumps accumulated heat soak back to zero. Does not cool the rock.',
    idle: 'no soak' },
  { key: 'patch', name: 'Hull Patch', icon: 'HULL', cost: 850, max: 3,
    blurb: 'Welds ' + PATCH_HULL + ' hull back on, anywhere.',
    idle: 'hull full' },
  { key: 'cell', name: 'Fuel Cell', icon: 'FUEL', cost: 600, max: 3,
    blurb: 'Burns ' + CELL_FUEL + ' fuel straight into the tank.',
    idle: 'tank full' }
];

export const SUPPLY_OF: Record<string, Supply> = {};
for (const sup of SUPPLIES) SUPPLY_OF[sup.key] = sup;

export const UPGRADES: Upgrade[] = [
  { key: 'drill',  name: 'Drill Bit',     base: 130, mul: 2.00, max: 9, mat: 'iron',
    tiers: ['Steel', 'Tungsten', 'Carbide', 'Diamond', 'Ionized', 'Plasma', 'Graviton', 'Singularity', 'Starbreaker', 'Godcore'],
    effect: (l: number) => 'Power ' + (1 + l * 0.95).toFixed(2) + 'x' },
  { key: 'cargo',  name: 'Cargo Hold',    base: 110, mul: 2.00, max: 9, mat: 'copper',
    effect: (l: number) => (60 + l * 45) + ' kg' },
  { key: 'thrust', name: 'Thrusters',     base: 100, mul: 1.95, max: 9, mat: 'silver',
    effect: (l: number) => (3.0 + l * 0.7).toFixed(1) + ' cells/s' },
  /* Priced against the depth where running dry actually strands you, not
     against the first haul. The old 200 was pocket change by 36 m. */
  { key: 'tank',   name: 'Fuel Tank',     base: 480, mul: 2.00, max: 9, mat: 'gold',
    effect: (l: number) => (90 + l * 40) + ' fuel' },
  /* The expensive one, and the ladder you save for. Heat starts at 70 m, so
     the first level costs about half a good run from that depth rather than
     one gold block. The shallower multiplier keeps later levels reachable. */
  { key: 'cool',   name: 'Cooling Rig',   base: 1000, mul: 1.80, max: 9, mat: 'emerald',
    effect: (l: number) => Math.round(Math.min(0.72, l * 0.09) * 100) + '% heat shield' },
  { key: 'scan',   name: 'Scanner Array', base: 140, mul: 1.90, max: 9, mat: 'amethyst',
    effect: (l: number) => (8 + l * 2.4).toFixed(0) + 'm light' },
  { key: 'tow',    name: 'Tow Insurance', base: 180, mul: 2.00, max: 8, mat: 'iron',
    effect: (l: number) => 'Tow takes ' + Math.round(Math.max(0.1, 0.5 - l * 0.05) * 100) + '% of haul' },
  { key: 'auto',   name: 'Autopilot',     base: 900, mul: 2.20, max: 6, mat: 'ruby',
    effect: (l: number) => (l === 0 ? 'Not installed' : (0.55 - (l - 1) * 0.075).toFixed(2) + ' fuel per metre') }
];
export const costOf = (u: Upgrade, lvl: number) => Math.round(u.base * Math.pow(u.mul, lvl));

/* ---------- material costs ----------

   Credits alone made the upgrade ladder a pure grind against one number: any
   ore at any depth converted to any upgrade, so nothing about WHERE you dug
   ever mattered. Past level three each upgrade also wants the mineral it is
   built out of, and the mineral's depth is the actual gate.

   The one that carries the design is the Cooling Rig, which wants emerald from
   78 m - eight metres INSIDE the heat zone. You have to survive a heat run
   without the protection in order to buy the protection. That is the "hit a
   wall, upgrade, get past it" shape the game did not have; everything below
   70 m was previously reachable on day one with enough patience.

   The choice this creates is real because cargo is weight-limited. Six emerald
   is 51 kg of a 60 kg starting hold, and every kilo of it is a kilo not spent
   on something worth more per kilo. You are choosing what to come back with,
   not just how deep to go.

   Levels 1-3 stay pure credits so the opening hour is untouched. */
export const MAT_FROM_LEVEL = 4;
export const matCost = (u: Upgrade, lvl: number): MatCost => {
  const buying = lvl + 1;
  if (buying < MAT_FROM_LEVEL) return null;
  return { id: u.mat, need: 2 + (buying - MAT_FROM_LEVEL) * 2 };
};

/* Everything a tree will ever ask for, used to grandfather old saves and to
   sanity-check the totals in tests. */
export const matTotalFor = (u: Upgrade, throughLevel: number) => {
  let n = 0;
  for (let l = 0; l < throughLevel; l++) {
    const m = matCost(u, l);
    if (m) n += m.need;
  }
  return n;
};

export const START_X = Math.floor(W / 2);
