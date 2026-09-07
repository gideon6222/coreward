/* Tuning constants and the pure functions over them. Imports only types. */

import type { Ore, Rock, Material, Upgrade, UpgradeKey } from './types';

export const W = 9;
export const SAVE_KEY = 'coreward.v2';
export const OLD_KEY = 'coreward.v1';
export const HULL_MAX = 100;
export const DIG_BASE = 0.5;

const PLANET_NAMES = ['Verdax', 'Rustmoor', 'Cryon', 'Ashvault', 'Kryllon', 'Tessivar'];
const SKY_HI = [0x0d2b52, 0x4a1d10, 0x0c3a44, 0x2a0f36, 0x101440, 0x0c331f];
const SKY_LO = [0x5aa8dd, 0xe08a45, 0x54d4d8, 0xa055b8, 0x5560c8, 0x4fbf78];

export const planetName = (i: number) => {
  const base = PLANET_NAMES[i % PLANET_NAMES.length];
  const cyc = Math.floor(i / PLANET_NAMES.length);
  return cyc ? base + ' ' + (cyc + 1) : base;
};
export const skyHi = (i: number) => SKY_HI[i % SKY_HI.length];
export const skyLo = (i: number) => SKY_LO[i % SKY_LO.length];
export const coreDepth = (p: number) => 110 + p * 35;
export const hardMult = (p: number) => 1 + p * 0.28;
export const valueMult = (p: number) => 1 + p * 0.6;

export const ORES: Ore[] = [
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
  { id: 'basalt',  name: 'Basalt',  color: 0x3a3540, hard: 9,   wt: 2.8, value: 22, glow: 0.03 }
];
export const baseRock = (d: number) => (d < 10 ? ROCKS[0] : d < 60 ? ROCKS[1] : d < 130 ? ROCKS[2] : ROCKS[3]);

export const DEF: Record<string, Material> = {};
for (const o of ORES) DEF[o.id] = o;
for (const r of ROCKS) DEF[r.id] = r;

export const UPGRADES: Upgrade[] = [
  { key: 'drill',  name: 'Drill Bit',     base: 130, mul: 2.00, max: 9,
    tiers: ['Steel', 'Tungsten', 'Carbide', 'Diamond', 'Ionized', 'Plasma', 'Graviton', 'Singularity', 'Starbreaker', 'Godcore'],
    effect: (l: number) => 'Power ' + (1 + l * 0.95).toFixed(2) + 'x' },
  { key: 'cargo',  name: 'Cargo Hold',    base: 110, mul: 2.00, max: 9,
    effect: (l: number) => (60 + l * 45) + ' kg' },
  { key: 'thrust', name: 'Thrusters',     base: 100, mul: 1.95, max: 9,
    effect: (l: number) => (3.0 + l * 0.7).toFixed(1) + ' cells/s' },
  /* Priced against the depth where running dry actually strands you, not
     against the first haul. The old 200 was pocket change by 36 m. */
  { key: 'tank',   name: 'Fuel Tank',     base: 480, mul: 2.00, max: 9,
    effect: (l: number) => (90 + l * 40) + ' fuel' },
  /* The expensive one, and the ladder you save for. Heat starts at 70 m, so
     the first level costs about half a good run from that depth rather than
     one gold block. The shallower multiplier keeps later levels reachable. */
  { key: 'cool',   name: 'Cooling Rig',   base: 1000, mul: 1.80, max: 9,
    effect: (l: number) => Math.round(Math.min(0.72, l * 0.09) * 100) + '% heat shield' },
  { key: 'scan',   name: 'Scanner Array', base: 140, mul: 1.90, max: 9,
    effect: (l: number) => (8 + l * 2.4).toFixed(0) + 'm light' },
  { key: 'tow',    name: 'Tow Insurance', base: 180, mul: 2.00, max: 8,
    effect: (l: number) => 'Tow takes ' + Math.round(Math.max(0.1, 0.5 - l * 0.05) * 100) + '% of haul' },
  { key: 'auto',   name: 'Autopilot',     base: 900, mul: 2.20, max: 6,
    effect: (l: number) => (l === 0 ? 'Not installed' : (0.55 - (l - 1) * 0.075).toFixed(2) + ' fuel per metre') }
];
export const costOf = (u: Upgrade, lvl: number) => Math.round(u.base * Math.pow(u.mul, lvl));

export const START_X = Math.floor(W / 2);
