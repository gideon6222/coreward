import { HULL_MAX, SAVE_KEY, OLD_KEY, START_X, UPGRADES, matTotalFor,
         bombRadius, laserRange, traitOf, TRAIT_OF, TRAITS, coreDepth,
         valueMult , OVERDRIVE_MULT, PULSE_REACH} from './config';
import { CHARGE_MAX } from './feel';
import { R } from './runtime';
import { newClaim, loadClaim, afterCell, applyQuake, refuelMult, payoutMult,
         RICH_PER_QUAKE, type ClaimState, type Structure } from './claim';
import type { Best, Cargo, Dir, Drops, Kit, Mode, UpgradeKey, SaveV1, SaveV2 } from '../types';
import { blankLog, loadLog, type Log } from './telemetry';

/* The whole game state. One mutable singleton, read by nearly every module. */
export const g: {
  /* THE LEG, and it is not the same thing as the world.

     `planet` counts how far you have come: it seeds generation, sets the core
     depth, the rock hardness and the base ore value, and it goes up by one
     every time a core breaks. It is the difficulty ladder and it always was.

     `world` is IDENTITY - the name on the HUD and the palette it is drawn in -
     and the chart chooses it. Splitting them is what lets three candidates at
     the same leg be three different places rather than three copies of one.
     A save from before the chart existed has no world, so it defaults to the
     leg and the old behaviour comes back exactly. */
  planet: number; credits: number; shards: number;
  world: number;
  /* The trait of the world you are on, STORED rather than hashed from an
     index. The chart is what decides what is out there, and `traitOf` can
     never return Stable for anything but planet zero - which would make one
     of the five Jump Drive components unobtainable. */
  trait: string;
  /* What the chart's chosen world does to the leg's baseline: metres on the
     core depth, and a multiplier on what ore is worth. They move together -
     see the note in chart.ts on why deeper must also mean richer. */
  coreOff: number; rich: number;
  up: Record<UpgradeKey, number>;
  kit: Kit;
  dug: Set<string>;
  /* Cells a tremor filled back in. They read as rubble rather than as what was
     originally generated there, which is what stops a collapse from being an
     ore respawn. `dug` takes precedence, so clearing one needs no cleanup. */
  rubble: Set<string>;
  px: number; pd: number;
  face: Dir;
  fuel: number; hull: number; soak: number;
  /* the shared ordnance meter; see chargeAfter in feel.ts */
  charge: number;
  cargo: Cargo; weight: number;
  /* Minerals banked at the pad, spent on upgrades alongside credits. Counts
     only - the credits for the same ore were already paid on the same sale. */
  stock: Cargo;
  /* Relic PERKS collected, across every planet ever visited. The one list in
     the save that only ever grows. */
  /* Jump Drive components aboard. Like `relics`, a list that only grows - and
     like relics, it is what you OWN rather than what you have done. See
     drive.ts. */
  drive: string[];
  /* Whether the Heart has ever been broken. A flag rather than an end state:
     the game keeps going afterwards, and this is what the chart and the
     manifest read to say so. */
  won: boolean;
  relics: string[];
  /* Which planets have had their relic taken.

     Tracked separately from `relics`, and that separation is load-bearing:
     past the named eight every planet grants the same stacking charter, so
     asking "do I already have this perk" would have answered yes for every
     planet from the ninth onward and quietly stopped generating relics for the
     rest of the game. The perk is what you own; this is what you have done. */
  relicsTaken: number[];
  /* balance telemetry: all time in the save, this run in memory only */
  log: Log;
  /* Ore dug with a full hold, left at the cell it came from. Keyed by cell,
     so a cell can only ever hold one - which it can, because breaking a block
     empties the cell it was in. */
  drops: Drops;
  /* How far through a block you already are, 0..1, keyed by cell.

     Stored as a FRACTION rather than as seconds of drilling. Seconds would be
     invalidated by buying a better drill - a block you had half cut would
     silently become nearly whole - and a fraction is the thing the player
     actually saw on the rock face. */
  damage: Cargo;
  best: Best;
  /* The surface claim for the world you are ON. Per world and left behind when
     a core breaks, so its condition is an arc inside a world rather than a
     scar carried across the whole Drift. See claim.ts. */
  claim: ClaimState;
  mode: Mode;
} = {
  planet: 0, credits: 0, shards: 0,
  world: 0, trait: 'stable', coreOff: 0, rich: 1,
  drive: [], won: false,
  up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0, bomb: 0, laser: 0,
    hull: 0, magnet: 0, survey: 0, drone: 0, reactor: 0 },
  kit: { coolant: 0, patch: 0, cell: 0, overdrive: 0, bulwark: 0, pulse: 0 },
  dug: new Set<string>(),
  rubble: new Set<string>(),
  px: START_X, pd: -1,
  face: 'down',
  fuel: 90, hull: HULL_MAX, soak: 0, charge: CHARGE_MAX,
  cargo: {}, weight: 0, stock: {}, drops: {}, damage: {}, relics: [], relicsTaken: [],
  log: blankLog(),
  best: { depth: 0, haul: 0 },
  claim: newClaim(),
  mode: 'play'
};

/* Whether a relic perk has been collected. Relics past the named eight all
   grant the same stacking charter, so this counts rather than tests. */
export const relic = (id: string) => g.relics.includes(id);
export const relicCount = (id: string) => g.relics.filter((r) => r === id).length;

export const S = {
  drill: () => (1 + g.up.drill * 0.95) * (1 + g.shards * 0.08) * (relic('drum') ? 1.1 : 1)
           * (R.odT > 0 ? OVERDRIVE_MULT : 1),
  /* +12 a rung, not +45.
     M1 measured the hold at 5 to 12 per cent full when a run ends, and M3 found
     why: the corridor stops when FUEL runs out, never when the hold is full. A
     full tank pays for roughly forty cells of drilling, which is about sixty
     kilos of rock, against a cap that reached 465. The hold was eight times the
     size the fuel could ever fill, so the cap - the thing CRAFT.md names as the
     source of the "which is worth more" decision - could not bind at any level.
     A full tank is worth about twenty-five cells of granite, which is roughly
     forty kilos of rock, so the hold starts at 45 and climbs by 10. At those
     numbers the two constraints meet: a rich corridor fills the hold, a poor one
     runs the tank dry, and which one you are in is the decision. */
  cargoCap: () => Math.round((45 + g.up.cargo * 10) * (relic('weave') ? 1.15 : 1)),
  speed: () => 3.0 + g.up.thrust * 0.7,
  fuelCap: () => 90 + g.up.tank * 40,
  /* the multipliers relics add, read by the frame loop and by feel.ts */
  fuelUse: () => (relic('recyc') ? 0.85 : 1),
  heatTake: () => (relic('lattice') ? 0.85 : 1),
  gasTake: () => (relic('damper') ? 0.67 : 1),
  powerCap: () => (relic('coupler') ? 1 : 0),
  saleBonus: () => 1 + relicCount('assay') * 0.04,
  /* capped below 1 on purpose - a fully upgraded rig buys time, it does
     not make deep water safe. See the soak note in feel.ts. */
  shield: () => Math.min(0.72, g.up.cool * 0.09),
  light: () => 8 + g.up.scan * 2.4 + (relic('eye') ? 3 : 0),
  /* Rounded before clamping. 0.5 - 8*0.05 is 0.09999999999999998 in binary
     floating point, which showed up in the golden baseline as a cut of
     9.999999999999998% - true, useless, and the kind of diff that trains you
     to re-record without reading. */
  towCut: () => Math.max(0.05,
    Math.round((0.5 - g.up.tow * 0.05 - (relic('rights') ? 0.1 : 0)) * 1000) / 1000),
  autoRate: () => (g.up.auto === 0 ? 0 : 0.55 - (g.up.auto - 1) * 0.075),
  bombR: () => bombRadius(g.up.bomb),
  laserLen: () => laserRange(g.up.laser),

  /* ---------- the second wave ---------- */

  /* Hull was a flat HULL_MAX everywhere in the game, so this is the one that
     had to be threaded through rather than added: anything that repaired to
     "full" was reading the constant. */
  hullCap: () => HULL_MAX + g.up.hull * 25,
  /* 0 means not installed, and the pull is a radius rather than a vacuum -
     you still have to go back for the ore, it just does not have to be exact. */
  magnetR: () => (g.up.magnet === 0 ? 0 : 0.8 + g.up.magnet * 0.55),
  /* How far into unbroken rock ore reads. Feeds the glow floor in the shader,
     which is the term that was already deciding this - see LM_GLOW_FLOOR. */
  surveyM: () => (g.up.survey === 0 ? 0 : 2 + g.up.survey * 1.6)
                 + (R.pulseT > 0 ? PULSE_REACH : 0),
  /* Hull per second underground. Deliberately an order of magnitude under what
     soak takes at depth: this makes a bad run recoverable, never heat
     survivable. */
  repair: () => g.up.drone * 0.55,
  /* Ordnance had no ladder of its own; both weapons ran off a meter nothing
     could improve. */
  powerExtra: () => g.up.reactor,
  rechargeMult: () => 1 + g.up.reactor * 0.35
};

/* A save written before minerals existed has no stock, and its owner has
   already bought levels that would now have cost materials. Charging them
   retroactively would strand a mid-game save behind a wall it already passed,
   so grant exactly what those levels would have needed - nothing more, so the
   next level is still earned. */
export function grandfatherStock(): Cargo {
  const out: Cargo = {};
  for (const u of UPGRADES) {
    const owed = matTotalFor(u, g.up[u.key]);
    if (owed) out[u.mat] = (out[u.mat] || 0) + owed;
  }
  return out;
}

/* Has this player been here before?

   Asked before load() has done anything, so the title screen can tell a first
   run from a returning one. Both keys, because a save written by the pre-v2
   game is still someone's progress and offering them NEW GAME as the only
   option would throw it away. */
export function hasSave(): boolean {
  try {
    return !!(localStorage.getItem(SAVE_KEY) || localStorage.getItem(OLD_KEY));
  } catch (e) {
    /* Private browsing, or storage blocked. No save is the safe answer: the
       worst case is a returning player being shown the intro, and the
       alternative is a CONTINUE button that continues nothing. */
    return false;
  }
}

/* ============ save ============ */
export function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      planet: g.planet, credits: g.credits, shards: g.shards, up: g.up,
      world: g.world, trait: g.trait, coreOff: g.coreOff, rich: g.rich,
      drive: g.drive, won: g.won,
      dug: Array.from(g.dug), cargo: g.cargo, weight: g.weight, px: g.px, pd: g.pd,
      kit: g.kit, stock: g.stock, rubble: Array.from(g.rubble), best: g.best,
      drops: g.drops, damage: g.damage, charge: g.charge,
      relics: g.relics, relicsTaken: g.relicsTaken, log: g.log,
      claim: g.claim
    }));
  } catch (e) { /* ignore */ }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      g.planet = s.planet || 0; g.credits = s.credits || 0; g.shards = s.shards || 0;
      /* Every one of these defaults to the pre-chart behaviour, so a save made
         before the chart existed loads as the world it was on. */
      g.world = typeof s.world === 'number' ? s.world : g.planet;
      g.trait = typeof s.trait === 'string' ? s.trait : traitOf(g.planet).id;
      g.coreOff = typeof s.coreOff === 'number' ? s.coreOff : 0;
      g.rich = typeof s.rich === 'number' ? s.rich : 1;
      Object.assign(g.up, s.up || {});
      Object.assign(g.kit, s.kit || {});
      Object.assign(g.best, s.best || {});
      /* A save from before the Claim existed loads an intact one. */
      g.claim = loadClaim(s.claim);
      /* M5 moved every world's core. A save made when planet 0 ended at 110 m
         can have its ship parked at 70, which is now inside bedrock, so it is
         put back where the world still exists. Nothing else is touched: the
         cargo, the credits and the record all still mean what they meant. */
      const floor = coreM() - 1;
      if (g.pd > floor) { g.pd = 0; g.px = START_X; }
      g.dug = new Set(s.dug || []);
      g.rubble = new Set(s.rubble || []);
      g.drops = s.drops || {};
      g.damage = s.damage || {};
      if (typeof s.charge === 'number') g.charge = s.charge;
      g.drive = Array.isArray(s.drive) ? s.drive.slice() : [];
      g.won = !!s.won;
      g.relics = Array.isArray(s.relics) ? s.relics.slice() : [];
      g.relicsTaken = Array.isArray(s.relicsTaken) ? s.relicsTaken.slice() : [];
      /* loadLog defaults every field, so a save from before the log existed
         comes back zeroed rather than full of undefined that render as NaN. */
      g.log = loadLog(s.log);
      g.cargo = s.cargo || {}; g.weight = s.weight || 0;
      g.stock = s.stock || grandfatherStock();
      if (typeof s.px === 'number') g.px = s.px;
      if (typeof s.pd === 'number') g.pd = s.pd;
      return;
    }
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return;
    const s = JSON.parse(old);
    g.planet = s.planet || 0;
    g.shards = s.shards || 0;
    g.credits = Math.round((s.credits || 0) * 4);
    g.dug = new Set(s.dug || []);
    const o = s.up || {};
    g.up.drill = o.drill || 0; g.up.cargo = o.cargo || 0; g.up.thrust = o.thrust || 0;
    g.up.tank = o.tank || 0; g.up.cool = o.cool || 0; g.up.scan = o.scan || 0;
    g.up.auto = Math.min(6, o.beacon || 0);
    g.stock = grandfatherStock();
    save();
  } catch (e) { /* corrupt save, start fresh */ }
}

/* ---------- the world you are actually on ----------

   Three things that every module used to compute for itself out of `g.planet`,
   and which now have a leg and a world to reconcile. One helper each, because
   the failure mode of six call sites doing their own arithmetic is that five
   of them get updated.

   `worldTrait` falls back rather than throwing: a save carrying a trait id
   that no longer exists (a trait renamed between versions) should load as
   Stable and be playable, not refuse to start. */
export function worldTrait() {
  return TRAIT_OF[g.trait] || TRAITS[0];
}

/* Where the core is on THIS world: the leg's baseline plus what the chart
   promised when you chose it. */
export function coreM() {
  return coreDepth(g.planet) + g.coreOff;
}

/* What ore is worth here: the leg's ladder times this world's richness. */
export function valueM() {
  return valueMult(g.planet) * g.rich;
}

/* Set the leg and the world together, for tests and for a fresh start. The
   two drifting apart is exactly the bug this whole split can cause. */
export function setWorld(p: number) {
  g.planet = p;
  g.world = p;
  g.trait = traitOf(p).id;
  g.coreOff = 0;
  g.rich = 1;
}


/* ---------- the Claim, from the game's side ----------

   Three seams, and they are deliberately the only three: a cell is removed, a
   tank is filled, a haul is sold. Everything else about the Claim is claim.ts's
   business. */

/* Called for every cell the ship removes, however it was removed - drill, bomb
   or laser. Returns true if that cell was the one that set off a quake, so the
   caller can shake the camera and say so; the state change has already
   happened either way. */
export function digStrain(d: number): boolean {
  const r = afterCell(g.claim.strain, d, coreM());
  g.claim.strain = r.strain;
  if (!r.quake) return false;
  applyQuake(g.claim, g.planet);
  /* A shaken world pays more. This is what makes depth a bet rather than a
     tax, and it is the whole reason a quake is worth having. */
  g.rich *= 1 + RICH_PER_QUAKE;
  return true;
}

/* What the tank actually fills to at the pad. A wrecked derrick is a shorter
   tank, not a slower pump: the game refuels instantly at the pad and always
   has, and a discount you can read off the gauge the moment you land beats a
   rate you would have to sit and watch. */
export function padFuel(): number {
  return Math.round(S.fuelCap() * refuelMult(g.claim));
}

/* What the refinery pays for a haul, before the assay relics' bonus. */
export function claimPayout(v: number): number {
  return Math.round(v * payoutMult(g.claim));
}

/* Everything a new world starts with. The Claim does not travel: its condition
   is an arc inside one world, so a bad world cannot sour the ten after it. */
export function resetClaim(): void {
  g.claim = newClaim();
}
