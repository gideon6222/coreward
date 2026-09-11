/* Tuning constants and the pure functions over them. Imports only types. */

import type { Ore, Rock, Material, Upgrade, UpgradeKey, Supply, Trait, MatCost, Relic } from '../types';
import { zoomForScan } from './feel';
import { FOUND_KEYS } from './finds';

/* World width in columns. Only about 8 fit on a portrait screen at the current
   framing, so the rest is lateral room to explore: which way to dig at a given
   depth is a real choice rather than a formality.

   Widening this does not change the blocks in columns 0-8 - rnd() is seeded on
   (x, d, planet), so existing columns generate exactly as before and the new
   ones are simply additional world. */
export const W = 13;

/* Column index to world X. Lives here rather than beside the renderer because
   two things that are not the renderer need it - the lighting grid and the
   collision code - and a shared geometric fact about the world belongs with
   the constant it is derived from. */
export const worldX = (x: number) => x - (W - 1) / 2;
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

/* ---------- the palette of a world ----------

   A planet used to BE two sky colours. Everything underground - the rock, the
   fog, the haze in the tunnels, the dust in the beam, the silhouettes behind
   it - was identical on every world in the game, so a new planet was the same
   cave with the horizon repainted, and the traits were weather that happened
   to you rather than anywhere you had been.

   A palette is applied everywhere at once, which is the whole point. The same
   argument as the heat line: one signal is missable, four coordinated ones are
   not. You should know you are somewhere else before you have dug a metre.

   `rock` and `mix` tint the ROCK ONLY, and never the ore. Ore colour is how
   value is read at a glance - amethyst has to look like amethyst on every
   world or the one piece of information the player reads fastest becomes
   unreliable. The host a crystal sits in is rock, so that tints with the rest.

   Nothing here touches generation. Every id in every cell is unchanged; this
   is what colour those cells are drawn. That distinction is what keeps the
   frozen baseline in test/baseline/blocks-preadditive.json meaningful. */
export interface Palette {
  /* what the rock is tinted toward, and how far */
  rock: number; mix: number;
  /* the colour the fog settles to underground */
  fog: number;
  /* the tunnel haze, and the dust hanging in the beam */
  haze: number; dust: number;
  /* the silhouettes behind the tunnels */
  para: number;

  /* ---- how the ground is MADE, not just what colour it is ----

     A tint is one channel, and one channel is why every world still read as
     the same stone under a different light. Playtest: *"I want the actual dirt
     and rocks to change color and texture with each planet."*

     `rough` scales the rock's roughness: under 1 is glassy - ice, slag, wet
     stone - and over 1 is matte and dusty. It is the difference between rock
     that catches the lamp and rock that swallows it, and it changes what the
     whole world looks like far more than the hue does.

     `bump` scales the normal map. Low is weathered and rounded, high is sharp
     and fractured. */
  rough: number;
  bump: number;

  /* What lives, settles or leaks on the rock face here - see growth.ts. One
     signature per world, so a wall is enough to tell you where you are. */
  growth: GrowthKind;
  /* the colour of it, which is usually NOT the rock's */
  growthColor: number;
}

/* Moss and plants want damp near the surface, frost does not care, oil seeps
   from deep. A growth that ignores depth is wallpaper. */
export type GrowthKind = 'moss' | 'frost' | 'plant' | 'oil' | 'ash' | 'salt' | 'none';

/* Twelve, cycling with the names. Verdax is first and is deliberately the
   least tinted: it is the world the game teaches you on, and everything after
   it should read as a departure from it. */
const PALETTES: Palette[] = [
  /* Verdax - the baseline. Warm neutral stone under a blue sky. */
  { rock: 0x8a7f6a, mix: 0.10, fog: 0x07080d, haze: 0xffb46a, dust: 0xd8c4a2, para: 0x1a1f2b,
    rough: 1.00, bump: 1.00, growth: 'moss', growthColor: 0x5f8f3a },
  /* Rustmoor - oxidised iron, everything the colour of old blood. */
  { rock: 0xa8542a, mix: 0.44, fog: 0x1a0805, haze: 0xff9048, dust: 0xe0a070, para: 0x2a1410,
    rough: 1.15, bump: 1.25, growth: 'oil', growthColor: 0x2a2018 },
  /* Cryon - blue ice, and the coldest air in the game. */
  { rock: 0x7fc6d8, mix: 0.41, fog: 0x04121a, haze: 0x9fe0ff, dust: 0xcce8f4, para: 0x162630,
    rough: 0.62, bump: 0.80, growth: 'frost', growthColor: 0xcfeaff },
  /* Ashvault - burnt violet rock, ash in the air. */
  { rock: 0x6a4a78, mix: 0.43, fog: 0x0c0612, haze: 0xd8a0ff, dust: 0xc0a8cc, para: 0x201828,
    rough: 1.20, bump: 1.10, growth: 'ash', growthColor: 0x6a5f72 },
  /* Kryllon - deep indigo, lit like a storm. */
  { rock: 0x4a58b0, mix: 0.41, fog: 0x040720, haze: 0x8ea8ff, dust: 0xa8b4e8, para: 0x161c34,
    rough: 0.80, bump: 1.15, growth: 'salt', growthColor: 0xb9c6f0 },
  /* Tessivar - green stone, the one world that feels alive. */
  { rock: 0x4f8a52, mix: 0.41, fog: 0x05120a, haze: 0xa8e88a, dust: 0xc0d8a0, para: 0x18261a,
    rough: 1.05, bump: 0.90, growth: 'plant', growthColor: 0x6fbf4a },
  /* Obrinth - rose quartz and hot pink light. */
  { rock: 0xb05880, mix: 0.43, fog: 0x160610, haze: 0xff9ad0, dust: 0xe8b4cc, para: 0x2a1622,
    rough: 0.72, bump: 1.05, growth: 'salt', growthColor: 0xf0b8d8 },
  /* Palewell - bone and pale teal. Bleached. */
  { rock: 0xa8b4a8, mix: 0.39, fog: 0x0a1210, haze: 0xc8f0e0, dust: 0xe0e8dc, para: 0x1c2624,
    rough: 0.90, bump: 0.85, growth: 'moss', growthColor: 0x8fc0a0 },
  /* Serrik - amber and ochre, a desert underground. */
  { rock: 0xc08a3a, mix: 0.43, fog: 0x140c04, haze: 0xffc878, dust: 0xf0d4a0, para: 0x282014,
    rough: 1.25, bump: 1.20, growth: 'ash', growthColor: 0xd8a86a },
  /* Vantomir - slate and steel, the bleakest of them. */
  { rock: 0x6a7a90, mix: 0.41, fog: 0x060a10, haze: 0xa8c4e8, dust: 0xc4d0dc, para: 0x1a2028,
    rough: 1.10, bump: 1.15, growth: 'oil', growthColor: 0x1c2430 },
  /* Halcyne - olive and old gold. */
  { rock: 0x8aa030, mix: 0.41, fog: 0x0c1004, haze: 0xd8e888, dust: 0xd0dca0, para: 0x1e240f,
    rough: 1.00, bump: 0.95, growth: 'plant', growthColor: 0xb8c04a },
  /* Dross - almost black, lit violet. The last name before the list cycles,
     and the darkest place in the game. */
  { rock: 0x3a3040, mix: 0.44, fog: 0x050308, haze: 0xb088e0, dust: 0xa898b8, para: 0x14101a,
    rough: 1.30, bump: 1.30, growth: 'ash', growthColor: 0x4a3f56 }
];

/* The Heart's own palette: black rock, red air, nothing else like it in the
   game. It is the last place you will ever go and it has to look like it. */
const HEART_PAL: Palette =
  { rock: 0x2a0808, mix: 0.55, fog: 0x140000, haze: 0xff5028, dust: 0xff8858, para: 0x1c0604,
    /* Glassy and sharp: slag rather than stone, and nothing grows on it. */
    rough: 0.55, bump: 1.45, growth: 'none', growthColor: 0x000000 };

export const paletteOf = (i: number): Palette =>
  i === 9999 ? HEART_PAL : PALETTES[i % PALETTES.length];

/* How many distinct identities exist before the names and palettes repeat.
   The chart uses it to spread world ids over the whole set rather than over
   whatever range the leg happens to be in. */
export const PLANET_COUNT = PALETTES.length;

/* Where each kind belongs, in metres. Moss and plants want the damp near the
   surface; frost does not care; oil seeps from deep. A growth that ignores
   depth is wallpaper. */
export const GROWTH_BAND: Record<GrowthKind, { from: number; to: number; chance: number }> = {
  moss:  { from: 0, to: 45, chance: 0.30 },
  plant: { from: 0, to: 34, chance: 0.24 },
  frost: { from: 0, to: 999, chance: 0.26 },
  salt:  { from: 12, to: 999, chance: 0.22 },
  ash:   { from: 8, to: 999, chance: 0.28 },
  /* Deep, and rarer - it should read as something the world is doing rather
     than as a surface finish. */
  oil:   { from: 40, to: 999, chance: 0.20 },
  none:  { from: 0, to: 0, chance: 0 }
};


export const planetName = (i: number) => {
  /* The Heart is not on the list and never cycles - see HEART_WORLD in
     drive.ts. Named here because planetName is what every screen in the game
     asks, and a special case in each of them would be six places to forget. */
  if (i === 9999) return 'The Heart';
  const base = PLANET_NAMES[i % PLANET_NAMES.length];
  const cyc = Math.floor(i / PLANET_NAMES.length);
  return cyc ? base + ' ' + (cyc + 1) : base;
};
export const skyHi = (i: number) => SKY_HI[i % SKY_HI.length];
export const skyLo = (i: number) => SKY_LO[i % SKY_LO.length];
/* 58 + 48p, not 110 + 35p.

   Planet 0's core sat at 110 m with heat at 70 and tremors at 85, and five
   sessions of playtest notes never went past about 78 m - so the chart, the
   traits, the Jump Drive, the Heart and the crossing were all behind a dive
   that had never happened. Leg 0 now ends at 58 m and teaches heat at 32 and
   tremors at 44, which is a whole world inside a first session. The ladder is
   steeper so that leg 4 lands on 250 m, exactly where the old one did: the
   deep game is unchanged, only the distance to your first sight of it. */
export const coreDepth = (p: number) => 58 + p * 48;

/* Heat and tremors are fractions of the world's own core rather than two
   global metres. Every world then has the same SHAPE - danger at 55%, the
   ground giving at 76%, the core at 100% - so what leg 0 teaches is true of
   leg 9, which a pair of fixed depths could never be: at 250 m a heat line at
   70 is a third of the way down and at 58 m it is past the end.

   0.66 rather than 0.55 because the ore ladder has to fit above it. At 0.55
   leg 0's heat line landed at 32 m, four metres above gold, so the Fuel Tank -
   which every player needs from the first run - would have demanded a trip
   into the heat to buy. Only the rows you buy BECAUSE you go deep may ask for
   a mineral from down there. The heat zone is now the bottom third of every
   world, which is also easier to say out loud than any pair of metres. */
export const HEAT_FRACTION = 0.66;
export const TREMOR_FRACTION = 0.76;
export const heatDepth = (p: number, trait?: Trait) =>
  Math.round(coreDepth(p) * HEAT_FRACTION * (trait?.heatUp ?? 1));
export const tremorDepth = (p: number) => Math.round(coreDepth(p) * TREMOR_FRACTION);

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
/* Every trait changes a RULE, not only a density.

   Until M11 four of the five were a multiplier on how much of something
   generates, which reads as weather rather than as a place: more gas, more
   caves, more geodes, faster soak. A player could not do anything differently
   on a Volatile world than on a Stable one except be a bit more careful.

   Each now also moves a number the player can plan around, and each one is
   paired with the thing it makes interesting:

     stable       pays a premium for surfacing with a whole hull - the control
                  world is the one where a clean run is worth money
     volatile     gas hits harder AND the seismic charge reaches further, so
                  the hazard and its answer live on the same world
     hollow       light carries further through the caverns, which is what
                  makes "quick to cross, little to mine" a real trade
     crystalline  the refinery pays more per kilo, so digging sideways for the
                  geodes is worth the fuel it costs
     searing      soak builds faster AND the heat line sits shallower, so the
                  dangerous third of the world is a bigger third */
export const TRAITS: Trait[] = [
  { id: 'stable', name: 'Stable',
    blurb: 'Nothing unusual in the crust. A whole hull is worth money here.',
    cleanBonus: 0.15 },
  { id: 'volatile', name: 'Volatile',
    blurb: 'Gas riddles the rock and hits harder - but a charge carries further.',
    gas: 2.2, gasDamage: 1.35, blastR: 1.4 },
  { id: 'hollow', name: 'Hollow',
    blurb: 'Cave systems run through it. Light carries; there is little to mine.',
    cave: 2.4, reach: 1.35 },
  /* The rock is 20% harder to cut, and that is not decoration: a design test
     caught this trait giving geodes AND a better price for nothing, which
     makes it the only right answer on the chart. Crystal costs time and fuel
     to get through, which is exactly the trade the geodes are supposed to be
     worth. */
  { id: 'crystalline', name: 'Crystalline',
    blurb: 'Geode seams everywhere and a better price - but the rock fights back.',
    geode: 3.0, payout: 1.18, hard: 1.2 },
  /* Hot rock cuts faster, and that is the upside the design test demanded:
     soak at 1.6 and a heat line 14% shallower are both costs, and a trait that
     is all cost is a world nobody picks. You go to a Searing world because you
     can move through it, and you leave early because it is eating you. */
  { id: 'searing', name: 'Searing',
    blurb: 'The rock holds its heat - softer to cut, and it starts on you sooner.',
    soak: 1.6, heatUp: 0.86, hard: 0.84 }
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

/* ---------- relics ----------

   Exactly one per planet, buried below the halfway mark, in no particular
   column and marked on no map. It is the only thing in the game you can miss
   permanently: break the core with the relic still in the ground and it is
   gone with the planet.

   That is deliberate, and it is the answer to "what is the larger point".
   Every other reward in Coreward is a rung - credits buy the next upgrade,
   which makes the last one irrelevant. A relic is kept, and kept forever, so
   the collection is the one number that only ever goes up. */
export const RELIC_COLOR = 0xfff0ff;
export const RELIC_HOST = 0x2a2438;

/* Below the halfway point of the planet, and never in the outermost column -
   a relic hard against the wall is one you find by accident or not at all. */
export function relicAt(planet: number, coreOff = 0): { x: number; d: number } {
  /* The OFFSET core depth, not the leg's baseline.

     The chart can put a world's core 18 m shallower than the ladder would, and
     a relic placed against the baseline then generates below the floor of the
     world it is on - unreachable, and silently, because nothing looks for a
     relic it cannot see. Found by a test asserting the component sits deeper
     than the relic, which it could not do on a shallow world for exactly this
     reason. */
  const cd = coreDepth(planet) + coreOff;
  const lo = Math.floor(cd * 0.5);
  const span = Math.max(1, cd - 6 - lo);
  const hx = Math.imul(planet + 1, 2654435761) >>> 0;
  const hd = Math.imul(planet + 7, 40503) ^ Math.imul(planet + 13, 2246822519);
  return {
    x: 1 + (hx % (W - 2)),
    d: lo + ((hd >>> 3) % span)
  };
}

/* One perk per planet for the first eight, then a stacking value bonus so the
   ladder never runs out of a reason to look. */
export const RELICS: Relic[] = [
  { id: 'drum',    name: 'Kinetic Drum',      blurb: 'The drill hits 10% harder, forever.' },
  { id: 'weave',   name: 'Ballast Weave',     blurb: 'The hold carries 15% more.' },
  { id: 'recyc',   name: 'Fuel Recycler',     blurb: 'Flying costs 15% less fuel.' },
  { id: 'lattice', name: 'Thermal Lattice',   blurb: 'Heat does 15% less damage.' },
  { id: 'coupler', name: 'Charge Coupler',    blurb: 'One more power cell.' },
  { id: 'eye',     name: "Prospector's Eye",  blurb: 'The lamp reaches 3 m further.' },
  { id: 'damper',  name: 'Impact Damper',     blurb: 'Gas pockets take a third less hull.' },
  { id: 'rights',  name: 'Salvage Rights',    blurb: 'A tow takes 10 points less of the haul.' },
  { id: 'assay',   name: 'Assay Charter',     blurb: 'Everything you sell is worth 4% more.' }
];
export const RELIC_OF: Record<string, Relic> = {};
for (const r of RELICS) RELIC_OF[r.id] = r;

/* Past the named eight, every relic is another Assay Charter and they stack. */
export const relicFor = (planet: number) =>
  RELICS[Math.min(planet, RELICS.length - 1)];

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
/* These take the TRAIT, not a planet index, and that is the whole reason the
   chart can offer you a Hollow world and have it actually be hollow.

   They used to hash the trait out of the planet index themselves, which meant
   a world's trait was a property of how far you had come rather than of where
   you had chosen to go - and it made Stable unreachable for every planet but
   the first, because that is what traitOf does. Passing the trait in moves the
   decision to the one place that should own it. */
export const caveChanceOn = (d: number, t: Trait) =>
  Math.min(CAVE_CHANCE_CAP, caveChance(d) * (t.cave || 1));
export const gasChanceOn = (t: Trait) => Math.min(0.06, GAS.chance * (t.gas || 1));
export const geodeChanceOn = (t: Trait) => Math.min(0.06, GEODE.chance * (t.geode || 1));

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
/* Pre-M5 saves were played with tremors at a global 85; tremorDepth(leg) is
   the live one. Kept only so the constant's name still means something in the
   places that record what a world USED to be. */
export const TREMOR_DEPTH_LEGACY = 85;
/* The rhythm - first delay, gap, jitter, warning - lives in feel.ts. */
/* how far from the ship a cell has to be before it may collapse */
export const TREMOR_SAFE_RADIUS = 3;
/* How many cells one tremor takes, from how far below that world's own tremor
   line you are. Scaled by the world's span rather than by a flat 22 m, or a
   58 m world would never reach the second step and a 250 m one would cap out
   halfway down. */
export const tremorCells = (d: number, p: number) =>
  Math.min(9, 3 + Math.floor((d - tremorDepth(p)) / Math.max(6, coreDepth(p) * 0.2)));

/* What a collapsed cell becomes. It regenerates as loose rubble rather than as
   whatever was there before, because otherwise a tremor would refill the ore
   you just mined and you could farm the same vein forever. Cheap to clear and
   nearly worthless, so re-digging your way out costs time and fuel and pays
   almost nothing - which is the point. */
export const RUBBLE_HARD = 0.55;   /* against the band it sits in */
export const RUBBLE: Rock = {
  id: 'rubble', name: 'Rubble', color: 0x6d6459, hard: 1.4, wt: 0.4, value: 3, glow: 0.02
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

/* ---------- rock, and the seams in it ----------

   Rock used to be a uniform trickle: every cell paid a little and weighed a
   lot, so the hold filled with granite and the actual decision - which ORE to
   carry - was crowded out by spoil.

   Now plain rock is nearly weightless and nearly worthless. It is what you cut
   through, not what you carry, and its income is a rounding error you never
   have to think about. The value that used to be spread evenly across every
   rock cell is concentrated into SEAMS: the roughly one cell in three that
   already had visible mineral flecks scattered on its face.

   Values are fractional on purpose. Five bands have to stay strictly ordered
   AND stay well under a seam in value per kilo, and with weights this small
   there is no room to do both in whole numbers.

   That is the whole idea. The texture was decoration; now it is information.
   Everything the player needs in order to act on it was already on screen. */
export const ROCKS: Rock[] = [
  { id: 'dirt',    name: 'Dirt',    color: 0x6b4b2a, hard: 1,   wt: 0.15, value: 0.6, glow: 0.02 },
  { id: 'stone',   name: 'Stone',   color: 0x807a72, hard: 2.4, wt: 0.20, value: 1.0, glow: 0.02 },
  { id: 'granite', name: 'Granite', color: 0x5e5a66, hard: 5,   wt: 0.25, value: 1.6, glow: 0.02 },
  /* The hot-zone rock. Its whole job is to be unmistakable: it starts at
     exactly HEAT_DEPTH, so the moment the rock turns to smouldering ember you
     are in the zone where dwell time starts killing you. Emissive is high for a
     rock, on purpose - it should look like it is holding heat. */
  { id: 'scoria',  name: 'Scoria',  color: 0x6b2a18, hard: 7,   wt: 0.30, value: 2.2, glow: 0.10 },
  { id: 'basalt',  name: 'Basalt',  color: 0x3a3540, hard: 9,   wt: 0.35, value: 3.0, glow: 0.03 }
];

/* A seam of loose mineral in the rock face - the cells that already carried
   scattered flecks. Rolled on its own seed, checked only for rock, so it
   overwrites nothing but rock and leaves the ore stream alone.

   About one rock cell in three. Value density sits just under iron, so a seam
   is worth stopping for in the first ten metres and is quietly outclassed by
   real ore from there down. Flat rather than depth-scaled: cargo is keyed by
   material id, so a depth-varying value would need a separate id per band, and
   by the depth where that would matter you are surrounded by ore worth a
   hundred times as much. */
/* One rock cell in six.

   The first pass used the roll that already drew decorative flecks, which
   covered about a third of all rock - and on screen a third is not "some of
   the rock has mineral in it", it is "the rock is made of mineral". Every wall
   read as sandy speckle and the bands lost their identity. A sixth reads as a
   find.

   Worth about as much per kilo as iron, at nearly twice the weight of ore per
   unit. That is deliberate: a seam is genuinely good cargo AND genuinely
   expensive in hold space, so passing one up is a real decision rather than an
   oversight. */
export const SEAM_CHANCE = 0.16;
export const SEAM: Rock = {
  id: 'seam', name: 'Mineral Seam', color: 0xc9b98a, hard: 1, wt: 2.0, value: 26, glow: 0.07
};

/* What a block has to be worth before a full hold bothers leaving it behind
   rather than treating it as spoil. Above plain rock, below everything else. */
export const DROP_MIN_VALUE = 10;

/* Band boundaries are deliberately tied to the mechanics rather than round
   numbers. Granite arriving at 45 telegraphs "this is getting harder" before
   the danger; scoria at 70 IS the danger line, matching HEAT_DEPTH in feel.ts.
   Change one and change the other, or the world stops explaining itself.

   Basalt moved from 130 to 120 because planet 0's core sits at 110 - the old
   band meant the deepest rock in the game was unreachable on the first planet. */
/* The bands are fractions of the world too, for the same reason, and the one
   that matters is still nailed to the danger: graniteToScoria IS heatDepth, so
   the rock turning to smouldering ember and the hull starting to drain happen
   on the same metre in every world. There is a test at every leg. */
export const DIRT_FRACTION = 0.09;
export const STONE_FRACTION = 0.39;
export const BASALT_FRACTION = 1.05;
export const dirtToStone = (p: number) => Math.max(4, Math.round(coreDepth(p) * DIRT_FRACTION));
export const stoneToGranite = (p: number) => Math.round(coreDepth(p) * STONE_FRACTION);
export const graniteToScoria = (p: number) => heatDepth(p);
export const scoriaToBasalt = (p: number) => Math.round(coreDepth(p) * BASALT_FRACTION);

export const baseRock = (d: number, p: number) =>
  d < dirtToStone(p) ? ROCKS[0]
  : d < stoneToGranite(p) ? ROCKS[1]
  : d < graniteToScoria(p) ? ROCKS[2]
  : d < scoriaToBasalt(p) ? ROCKS[3]
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
DEF[SEAM.id] = SEAM;
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

/* How long each window lasts, and how much it is worth while it does.

   Overdrive is deliberately under 2x: at 2x it is a free Drill Bit level and
   the ladder stops mattering for the length of the run you carry one. Bulwark
   counts IMPACTS rather than seconds, because a timer would be eaten by heat
   soak - which is a drain, not a hit, and is the one thing it must not
   cancel. */
export const OVERDRIVE_SECS = 20;
export const OVERDRIVE_MULT = 1.8;
export const BULWARK_HITS = 2;
export const PULSE_SECS = 30;
/* What a live pulse adds to the Deep Survey's reach, in metres. Larger than
   the maxed upgrade on purpose: the upgrade is a standing sense, the pulse is
   a moment of seeing everything. */
export const PULSE_REACH = 14;

export const SUPPLIES: Supply[] = [
  { key: 'coolant', name: 'Coolant Flush', icon: 'COOL', cost: 5600, max: 2,
    blurb: 'Dumps accumulated heat soak back to zero. Does not cool the rock.',
    idle: 'no soak' },
  { key: 'patch', name: 'Hull Patch', icon: 'HULL', cost: 3900, max: 3,
    blurb: 'Welds ' + PATCH_HULL + ' hull back on, anywhere.',
    idle: 'hull full' },
  { key: 'cell', name: 'Fuel Cell', icon: 'FUEL', cost: 1400, max: 3,
    blurb: 'Burns ' + CELL_FUEL + ' fuel straight into the tank.',
    idle: 'tank full' },

  /* ---------- the timed three ----------

     The first three consumables all UNDO something: heat, damage, an empty
     tank. These three do the opposite - they buy a window in which the ship is
     better than it is. That is the axis the kit was missing, and it is what
     makes a consumable a decision about WHEN rather than a repair you make
     when a bar gets low.

     Priced above the first rung of the upgrade that answers the same problem,
     per CRAFT.md: a consumable that undercuts the ladder replaces it, and then
     nobody ever buys the ladder. Overdrive against Drill Bit at 130, Bulwark
     against Hull Plating at 420, Pulse against Deep Survey at 700. Stack limits
     stay at two, so a full kit is a run's worth of decisions and not a
     strategy. */
  { key: 'overdrive', name: 'Overdrive', icon: 'OVR', cost: 1500, max: 2,
    blurb: OVERDRIVE_SECS + ' seconds of drilling at ' + OVERDRIVE_MULT + 'x power.',
    idle: 'already running' },
  { key: 'bulwark', name: 'Bulwark Field', icon: 'BWK', cost: 3800, max: 2,
    blurb: 'Absorbs the next ' + BULWARK_HITS + ' impacts outright. Gas, rockfall, anything sudden.',
    idle: 'field is up' },
  { key: 'pulse', name: 'Survey Pulse', icon: 'PLS', cost: 2900, max: 2,
    blurb: PULSE_SECS + ' seconds of seeing every vein through the rock.',
    idle: 'pulse is live' }
];



export const SUPPLY_OF: Record<string, Supply> = {};
for (const sup of SUPPLIES) SUPPLY_OF[sup.key] = sup;

export const UPGRADES: Upgrade[] = [
  { key: 'drill',  name: 'Drill Bit',     base: 340, mul: 1.55, max: 9, mat: 'iron', group: 'rig', unlock: 0,
    tiers: ['Steel', 'Tungsten', 'Carbide', 'Diamond', 'Ionized', 'Plasma', 'Graviton', 'Singularity', 'Starbreaker', 'Godcore'],
    effect: (l: number) => 'Power ' + (1 + l * 0.95).toFixed(2) + 'x' },
  { key: 'cargo',  name: 'Cargo Hold',    base: 320, mul: 1.55, max: 9, mat: 'copper', group: 'rig', unlock: 0,
    effect: (l: number) => (45 + l * 10) + ' kg' },
  { key: 'thrust', name: 'Thrusters',     base: 300, mul: 1.55, max: 9, mat: 'silver', group: 'rig', unlock: 0,
    effect: (l: number) => (3.0 + l * 0.7).toFixed(1) + ' cells/s' },
  /* Priced against the depth where running dry actually strands you, not
     against the first haul.

     The Scanner moved from amethyst at 56 m to copper at 4: amethyst is below
     every heat line and the scanner is an opening-kit row. See HEAT_FRACTION
     for why the line itself moved rather than the tank's mineral. */
  { key: 'tank',   name: 'Fuel Tank',     base: 1100, mul: 1.55, max: 9, mat: 'gold', group: 'survival', unlock: 0,
    effect: (l: number) => (90 + l * 40) + ' fuel' },
  /* The expensive one, and the ladder you save for.

     Unlocked at 78 m rather than 55, which is emerald's own depth: the row now
     opens on exactly the world where the mineral it is built from exists. At
     55 it opened on leg 0, whose core M5 moved up to 58 m, so the shop offered
     a rig that could not be paid for - two gates on one thing, and one of them
     pointing at nothing. The design it protects is unchanged: you still have to
     survive inside the heat to buy the thing that answers it. */
  { key: 'cool',   name: 'Cooling Rig',   base: 5000, mul: 1.5, max: 9, mat: 'emerald', group: 'survival', unlock: 78,
    effect: (l: number) => Math.round(Math.min(0.72, l * 0.09) * 100) + '% heat shield' },
  /* The effect line names the framing as well as the lamp, because the
     framing is now the part the player actually feels. */
  { key: 'scan',   name: 'Scanner Array', base: 700, mul: 1.55, max: 9, mat: 'copper', group: 'instruments', unlock: 0,
    effect: (l: number) => (8 + l * 2.4).toFixed(0) + 'm light · ' +
      Math.round(zoomForScan(l) * 100) + '% view' },
  { key: 'tow',    name: 'Tow Insurance', base: 1500, mul: 1.5, max: 8, mat: 'iron', group: 'survival', unlock: 25,
    effect: (l: number) => 'Tow takes ' + Math.round(Math.max(0.1, 0.5 - l * 0.05) * 100) + '% of haul' },
  { key: 'auto',   name: 'Autopilot',     base: 4900, mul: 1.55, max: 6, mat: 'ruby', group: 'instruments', unlock: 65,
    effect: (l: number) => (l === 0 ? 'Not installed' : (0.55 - (l - 1) * 0.075).toFixed(2) + ' fuel per metre') },

  /* ---------- ordnance ----------

     Both run off one Power Cell meter that trickles back underground and fills
     at the pad. That combination is what stops them being either a gimmick or
     a replacement for drilling: you always have some, you never have many, and
     the question is always "is this the moment".

     Gated so neither arrives before the player has felt the problem it solves.
     The charge at 40 m, about where hard rock starts costing real time; the
     laser at 90 m, where a shaft is long enough that cutting one is a job. */
  { key: 'bomb',   name: 'Seismic Charge', base: 3000, mul: 1.6, max: 3, mat: 'iron', group: 'ordnance', unlock: 40,
    effect: (l) => (l === 0 ? 'Not installed' : bombCells(l) + ' cells around the target') },
  /* Ruby, not silver. Silver starts at 22 m and the laser unseals at 90, so
     the mineral gate was doing nothing at all behind the depth gate - one of
     the two was decoration. Ruby lives at 105 m, which puts both gates in the
     same neighbourhood, and a ruby laser is the better fiction anyway. */
  { key: 'laser',  name: 'Cutting Laser',  base: 12500, mul: 1.6, max: 3, mat: 'ruby', group: 'ordnance', unlock: 90,
    effect: (l) => (l === 0 ? 'Not installed' : laserRange(l) + ' cells straight ahead') },

  /* ---------- the second wave ----------

     Five ladders for five things that had none. Each answers a complaint the
     existing ten cannot, which is the bar: an upgrade that overlaps an
     existing one is a second price on the same decision.

     HULL PLATING. Hull was a flat 100 from the first metre to the last, the
     only survival stat in the game with no ladder at all - so the answer to
     "the deep is chewing me up" was always a consumable, never a rig. Gated at
     45 m and on iron, both cheap, because this is the one that makes the
     middle of the game survivable rather than the end of it. */
  { key: 'hull',   name: 'Hull Plating',   base: 3400, mul: 1.5, max: 9, mat: 'silver', group: 'survival', unlock: 45,
    effect: (l: number) => (100 + l * 25) + ' hull' },

  /* SALVAGE MAGNET. Ore dropped when the hold filled has to be re-approached
     one cell at a time, which is the least interesting minute in the game.
     Radius, not automation: you still have to go back for it. */
  { key: 'magnet', name: 'Salvage Magnet', base: 1200, mul: 1.5, max: 6, mat: 'copper', group: 'rig', unlock: 20,
    effect: (l: number) => (l === 0 ? 'Not installed' : 'Pulls drops from ' + (0.8 + l * 0.55).toFixed(1) + ' cells') },

  /* DEEP SURVEY. Distinct from the Scanner, which is light and framing: this
     is knowing what is inside rock you have not cut. It also points at the
     buried Jump Drive component, which is the thing the goal most needs a way
     to find - a component you can only locate by digging the whole world is a
     goal made of patience. */
  { key: 'survey', name: 'Deep Survey',    base: 2600, mul: 1.55, max: 5, mat: 'amethyst', group: 'instruments', unlock: 35,
    effect: (l: number) => (l === 0 ? 'Not installed' : 'Reads ore ' + (2 + l * 1.6).toFixed(1) + ' m through rock') },

  /* REPAIR DRONE. Turns a bad run into a long one instead of a tow. Slow on
     purpose - it must never make heat survivable, only recoverable, so it is
     an order of magnitude under what soak takes at depth. */
  { key: 'drone',  name: 'Repair Drone',   base: 4700, mul: 1.5, max: 5, mat: 'amethyst', group: 'survival', unlock: 60,
    effect: (l: number) => (l === 0 ? 'Not installed' : '+' + (l * 0.55).toFixed(2) + ' hull/s underground') },

  /* REACTOR. Ordnance had two rungs and no ladder of its own: both weapons ran
     off a meter nothing could improve, so the answer to "I want to use these
     more" was to stop using them. */
  { key: 'reactor', name: 'Reactor Core',  base: 4400, mul: 1.5, max: 5, mat: 'gold', group: 'ordnance', unlock: 50,
    effect: (l: number) => (l === 0 ? 'Not installed' : '+' + l + ' power · ' + (1 + l * 0.35).toFixed(2) + 'x recharge') }
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
/* ---------- ordnance shapes ----------

   The charge clears a diamond around the cell you are facing; the laser cuts a
   line from where you stand. A diamond rather than a box, because the corners
   of a box are the cells you were least likely to want and a 5x5 at level 3
   would clear a quarter of the visible world in one tap. */
export const BOMB_CHARGE = 2;
export const LASER_CHARGE = 1;
/* Radius l+1, not l. At radius 1 the charge cleared five cells for two power
   while the laser cleared five for one - strictly worse, for twice the unlock
   price. The charge has to beat the laser per point of power at every level or
   there is no reason it exists; what the laser keeps is reach and precision. */
export const bombRadius = (l: number) => l + 1;              /* 2, 3, 4 */
export const bombCells = (l: number) => { const r = bombRadius(l); return 2 * r * r + 2 * r + 1; };
export const laserRange = (l: number) => 3 + l * 2;          /* 5, 7, 9 */

export const MAT_FROM_LEVEL = 4;
/* What state a shop case is in, and what its plate should say.

   Pure, and separate from the room that draws it, because this is the part with
   judgement in it: which of four states wins when several apply at once, and
   what the one line of text under the name should say.

   The order matters and is the design. Sealed beats everything - a depth lock
   is not negotiable and quoting a price you could pay would be a lie. Maxed
   beats affordability, because there is nothing to buy. And when you cannot
   afford it, the MINERAL is named ahead of the credits, because credits are
   what the loop pays constantly and a mineral you have never seen is the thing
   actually stopping you. */
export type ShelfState = 'ready' | 'short' | 'sealed' | 'max';
export interface Shelf { state: ShelfState; line: string; }

export function shelfState(
  u: Upgrade, lvl: number, credits: number, stock: Record<string, number>, bestDepth: number
): Shelf {
  if (bestDepth < u.unlock) return { state: 'sealed', line: u.unlock + ' m' };
  if (lvl >= u.max) return { state: 'max', line: 'MAX' };
  const cost = costOf(u, lvl);
  const mat = matCost(u, lvl);
  if (mat && (stock[mat.id] || 0) < mat.need) {
    const def = DEF[mat.id];
    return { state: 'short', line: mat.need + ' ' + (def ? def.name.toUpperCase() : mat.id.toUpperCase()) };
  }
  const price = '◈ ' + cost.toLocaleString();
  return { state: credits < cost ? 'short' : 'ready', line: price };
}

/* Which upgrades belong on the shelf at all.

   Playtest: *"I want future upgrades that dont unlock until later to be
   hidden."* That runs straight into a rule in CRAFT.md, and the rule needed
   correcting rather than working around:

     "Locking shop stock behind deepest-ever-reached is the cheapest structural
      progression available, and it should be SHOWN, not hidden: a row that
      says 'Sealed until 90 m' is a reason to go deeper. A hidden row is
      nothing at all."

   That is right about the NEXT gate and wrong about all of them. A case
   reading "Sealed until 90 m" when your best is 78 m is a reason to go deeper.
   The same case when your best is 12 m cannot be planned toward, is five rungs
   away, and is one of five crowding a phone screen. The rule was written when
   there were ten upgrades and two gates; at fifteen and six it stopped being
   true, and it stopped being true quietly because it was being applied rather
   than measured.

   So: everything already unlocked, plus the ONE next thing you have not
   reached. That keeps the whole benefit the rule was defending - there is
   always exactly one visible reason to go deeper - and removes the clutter.

   Returned in shelf order rather than filtered at the call site, because the
   room lays itself out from this list and two places deciding what is on the
   shelf is two places to disagree. */
export function shelfStock(bestDepth: number, found: string[] = []): Upgrade[] {
  /* The devices come off the shelf entirely until they are dug up.

     This is the harder of the two gates and it is deliberately silent: a
     sealed case says "come back at 90 m", which is a plan, but there is no
     honest case to show for a device the player has no idea exists. Telling
     them the Cutting Laser is out there somewhere would replace a discovery
     with an errand. The room says nothing, and then one day there is a crate
     in the rock. See finds.ts. */
  const sellable = UPGRADES.filter((u) => !FOUND_KEYS.has(u.key) || found.includes(u.key));
  const open = sellable.filter((u) => bestDepth >= u.unlock);
  const sealed = sellable.filter((u) => bestDepth < u.unlock)
    .sort((a, b) => a.unlock - b.unlock);
  /* Exactly one teaser, and it is the shallowest thing still out of reach -
     which is also the next one you will actually get. */
  return sealed.length ? open.concat(sealed[0]) : open;
}

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
