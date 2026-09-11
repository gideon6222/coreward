/* Unrest, and the Ballast.

   Playtest: *"it still feels like there is a main component missing ... I want
   the entire game to be based around one planet."*

   ---------- what this replaces ----------

   The Claim was a refinery, a fuel derrick and a store shed standing by the
   pad, and cutting deep rock shook them. It was the right instinct and the
   wrong object. Three buildings whose damage was three discounts is exactly
   the anti-pattern the research names in Deep Rock's rig: organisationally
   rich, in no jeopardy at all. Nothing there could ever cost you anything you
   would miss, because a discount is not a stake.

   Worse, it was three of them. Three meters, three repair prices, three
   silhouettes, one idea.

   So: ONE thing on the surface, and it can actually be lost.

   ---------- Unrest ----------

   Dome Keeper alternates digging with fighting, and its own reviews call that
   division its weakness - two phases competing for attention rather than
   fusing. The version that fuses was already half-built here: cutting the
   world raises strain and the ground answers with tremors. Strain grows up
   into UNREST, and three things change with it:

   1. **It belongs to the planet, not to a building.** There is no structure to
      repair. There is a place that is getting angrier.
   2. **It is PER REGION.** Cutting Kryllon makes Kryllon restless and leaves
      Cryon alone, so the map has something to show and abandoning a worked-out
      region is a real move. A single planet-wide number would have been a
      second fuel gauge.
   3. **Everything you cut raises it.** The old strain was zero above a
      stability line, which quietly said the top half of the world was free.
      Nothing is free. It is merely much cheaper up top - a cell at the floor
      costs two and a half times a cell at the surface.

   And the rules are WITHHELD. There is no tooltip saying what 0.6 does. You
   learn what Unrest does by watching it, which is how Rain World teaches its
   hazards, and it is the difference between a mystery and a status bar.

   ---------- the Ballast ----------

   A pressure station standing over the pad, and the only thing holding the
   planet quiet. It takes its stakes from the two games that actually have any:

   - **It decays on its own**, faster as Unrest rises. That is Subnautica's
     internal failure mode, and the research is blunt that it is the one that
     actually kills bases - most are lost to their own hull integrity, not to
     an attack.
   - **You feed it ore.** Not spend - feed. Ore banked at the pad is what
     upgrades are made of, so the hold is now two decisions: what is worth
     money, and what is worth keeping the ground still.
   - **If it empties, a region collapses.** Not a discount. The ground comes
     down, your tunnels there are gone, and you cannot go back in until you
     have shored it up. That is Dome Keeper's stake, which is the one thing
     Dome Keeper's dome has that these three buildings never did.
   - **It grows a tier with every Anchor lit**, which is SteamWorld Dig's
     legible progress: the surface tells you how far through the game you are
     without opening a menu. The tier is here and reads zero until W7 puts
     Anchors in the ground.

   ---------- and it cannot take the save ----------

   `CRAFT.md`: never let a hazard take the run. A collapse is the harshest
   thing in this game and it is fenced on four sides. It never takes the region
   the pad is in, never takes the one the ship is in, never lands while you are
   underground - it waits at the door until you dock - and it always leaves a
   way down, because one region out of a three-by-four grid cannot wall off a
   column. */

import { ORES, DEF, isOre } from './config';
import { REGION_COUNT, WORLD_DEPTH, regionAt } from './region';

/* ---------- how fast the ground gets angry ---------- */

/* Per cell, at the surface. Chosen against a real campaign rather than by
   feel: a run cuts 120-200 cells and most of them land in one region, so call
   it 60 a run in one place. Ten runs working the same ground is 600 cells, and
   0.0007 puts that at 0.42 - one band, not the whole meter. A region you keep
   going back to gets loud in a dozen visits and a region you pass through
   never does. */
export const UNREST_PER_CELL = 0.0007;

/* And the multiplier by the time you are standing on the floor of the world.
   Linear in between, because the player has to be able to feel the
   relationship: three times as deep, two and a half times the anger. */
export const UNREST_AT_FLOOR = 2.5;

export function unrestPerCell(d: number, awake = false): number {
  const f = Math.min(1, Math.max(0, d) / WORLD_DEPTH);
  return UNREST_PER_CELL * (1 + f * (UNREST_AT_FLOOR - 1)) * (awake ? WAKE_CUT_MULT : 1);
}

/* ---------- the bands ----------

   Four, and they are never named to the player in a legend. They are named
   HERE because the code has to agree with itself about where the lines are,
   and the map shows a colour rather than a number.

   Every band changes at least one rule that is felt while digging, which is
   the same test the traits had to pass: a band that only changes a colour is
   weather, not a place. */
export const UNREST_BANDS = [
  { at: 0.00, id: 'calm',     name: 'Calm',     color: 0x4b8f6a },
  { at: 0.35, id: 'restless', name: 'Restless', color: 0xc8a33a },
  { at: 0.62, id: 'grinding', name: 'Grinding', color: 0xd9702f },
  { at: 0.85, id: 'breaking', name: 'Breaking', color: 0xd63a4a }
];

export function unrestBand(u: number): number {
  let b = 0;
  for (let i = 1; i < UNREST_BANDS.length; i++) if (u >= UNREST_BANDS[i].at) b = i;
  return b;
}

/* Tremors already exist and already have a depth gate. Unrest multiplies how
   often they fire, so restless ground shakes shallower and more often than
   quiet ground at the same depth - which is how a player finds out what the
   meter means without being told. */
export function tremorScale(u: number): number {
  return 1 + u * 2.2;
}

/* Ground under strain is ground that has closed up. Small on purpose: a
   hardness multiplier is the most invisible-but-expensive thing that can be
   done to a mining game, and at 1.3 a Breaking region costs about a third more
   drilling without ever reading as the drill having broken. */
export function hardScale(u: number): number {
  return 1 + Math.max(0, u - UNREST_BANDS[2].at) * 0.8;
}

/* ---------- the Ballast ----------

   A fraction, 0 to 1, and the numbers are set against the clock rather than
   against a feeling.

   A run is roughly three minutes of play. At the drain below, a planet sitting
   at 0.3 mean Unrest empties a full Ballast in about twenty-five minutes -
   eight runs - and one at 0.8 empties it in fourteen. So it is never urgent
   inside a run and always present across an evening, which is the shape a
   phone game's campaign pressure has to have. */
export const BALLAST_DRAIN = 0.001;      /* a second, at the reference Unrest */
export const BALLAST_TIER_RELIEF = 0.25; /* each Anchor slows the drain by this share */

export function ballastDrain(planetUnrest: number, tier: number): number {
  return BALLAST_DRAIN * (0.35 + planetUnrest) / (1 + tier * BALLAST_TIER_RELIEF);
}

/* How many Anchors are lit. Derived, never stored. */
export const tierOf = (s: GroundState) => s.lit.length;

/* ---------- lighting one ----------

   Three things happen, and the third is the point:

   1. the region's Unrest is pushed back - not to zero. An Anchor holds the
      ground down, it does not undo what you did to it
   2. the Ballast gains a permanent tier, which slows its drain for the rest of
      the game and stacks a collar on the machine at the pad
   3. the planet wakes a little more, which is W8's business and is why this
      returns how many are now lit */
export const UNREST_AFTER_ANCHOR = 0.15;

/* ---------- the planet answers ----------

   At the fifth Anchor of nine, and it is the strongest longevity device the
   research turned up for a procedurally generated world: Terraria's Hardmode
   does not build new space, it EDITS the world you already have. A map you
   spent hours filling in becoming unfamiliar is worth more than a map twice
   the size, and it costs almost no content.

   Three things happen, and they are meant to be felt in this order:

   1. UNREST STEPS, everywhere, permanently. Every region gains a floor it can
      never fall below again, and every cell you cut from here costs more than
      it did. The back half of the game is a tenser game.
   2. THE GROUND CLOSES. Tunnels in restless regions fill in while you are
      docked - see closeCells() in collapse.ts. The route home is computed from
      the tunnels you cut, so this is the first thing in the game that makes a
      MAP go stale rather than a resource.
   3. SOMETHING GROWS. Blooms start generating at every depth, including in
      the first hour's ground. See BLOOM in config.ts.

   The third is not a consolation prize, it is the deal: the planet is more
   dangerous and it is also worth more. Waking it has to be something a player
   chooses to do rather than something that happens to them for playing well.

   Half of nine and not all of it, so there is a whole second act after it. */
export const WAKE_AT = 5;

/* What every region gains, once and for ever. A twelfth of the meter: enough
   that Calm ground stops being calm and not enough to push anywhere a whole
   band on its own. */
export const WAKE_STEP = 0.12;

/* And what every cell costs after it. Deliberately modest - the step above is
   the thing you feel on the day, and this is the thing you feel over the ten
   runs after it. */
export const WAKE_CUT_MULT = 1.35;

export const isAwake = (s: GroundState) => s.lit.length >= WAKE_AT;

/* Applied once, by the caller that lit the Anchor that crossed the line.
   Returns true if this was the moment. */
export function wake(s: GroundState): boolean {
  if (s.woke) return false;
  s.woke = true;
  for (let i = 0; i < REGION_COUNT; i++) s.unrest[i] = clamp01(s.unrest[i] + WAKE_STEP);
  return true;
}

export function lightAnchor(s: GroundState, region: number): number {
  if (s.lit.indexOf(region) >= 0) return s.lit.length;
  s.lit.push(region);
  s.unrest[region] = Math.min(s.unrest[region], UNREST_AFTER_ANCHOR);
  return s.lit.length;
}

export const isLit = (s: GroundState, region: number) => s.lit.indexOf(region) >= 0;

/* What a unit of ore is worth to it.

   Scored on the ore's TONE - its rank on the ladder, 1 to 10 - and not on its
   credit value. Value spans forty to a hundred and ninety-six thousand, so a
   value-weighted feed would make one Solmarrow worth six hundred Copper and
   the decision would stop existing: you would tip in the one deep rock and
   never think about it again. Rank compresses that to ten to one, which is
   still a strong preference for deep ore and still leaves a pile of Copper a
   real answer. */
export const BALLAST_PER_UNIT = 0.008;

export function feedValue(id: string): number {
  const o = ORES.find((z) => z.id === id);
  return o ? BALLAST_PER_UNIT * o.tone : 0;
}

/* Only ore. Rock does not hold a planet down, and the whole tension is that
   what the Ballast wants is what the Outfitter wants. */
export function feedable(id: string): boolean {
  const d = DEF[id];
  return !!d && isOre(d) && feedValue(id) > 0;
}

/* ---------- collapse ---------- */

/* Where the Ballast is left standing after a region comes down. Not zero: a
   collapse that leaves you empty collapses a second region on the next run and
   a third on the one after, which is a death spiral and not a stake. */
export const BALLAST_AFTER_COLLAPSE = 0.25;

/* What shoring a fallen region costs, and the level you have to reach to do
   it. The cost is most of the tank on purpose - it is the largest single thing
   you can spend the Ballast on, so losing a region is expensive to undo and
   never impossible. */
export const BALLAST_SAFE = 0.7;
export const BALLAST_SHORE_COST = 0.45;

/* And where it starts to be a worry, which is NOT the same line.

   Both readouts were driven off BALLAST_SAFE on the first build and it was
   wrong in a way that is easy to miss: 0.7 is where SHORING becomes possible,
   so a tank at a perfectly ordinary 60% drew red and the HUD button pulsed.
   An alarm that is on for most of the normal range is not an alarm.

   A third of the tank is about three runs of warning at ordinary Unrest, which
   is enough to do something about it and not so much that it becomes wallpaper
   before it matters. */
export const BALLAST_LOW = 0.35;

/* And where the region's own Unrest is left. Relief, not absolution: the
   ground has moved and some of the pressure went with it, but a region you let
   fall comes back half angry already. Zero here would make "let it collapse"
   the cheapest way to reset a worked-out region. */
export const UNREST_AFTER_COLLAPSE = 0.5;

export interface GroundState {
  /* Per region, 0..1. Not a Record, because the region count is fixed and an
     array is what both the map and the save want. */
  unrest: number[];
  ballast: number;
  /* Anchors lit, by region. Raises the Ballast's resistance and its height on
     the pad, and is the campaign's own progress bar.

     A LIST and not just the count, because three different things want to know
     WHICH: the map draws a lit Anchor differently from one you have only found,
     the world draws the monument, and W8's threshold has to fire on the fifth
     one exactly once. `tier` is derived from it rather than stored beside it -
     two numbers that must agree is one number with a bug in it. */
  lit: number[];
  /* Regions currently down, oldest first - which is also the order they are
     shored back up in. */
  collapsed: number[];
  /* A region that has run out of Ballast and is waiting for you to come home.
     -1 for none. See the note at the top about never landing underground. */
  pending: number;
  collapses: number;
  /* Units of ore fed, all time. The only thing in here that is purely a
     readout. */
  fed: number;
  /* Whether the planet has answered.

     Stored rather than derived from `lit.length >= WAKE_AT`, and that is not
     redundancy: waking APPLIES a one-off step to every region's Unrest, so the
     flag is a record that the step has been paid. Derived, a save loaded after
     the fifth Anchor would have no way to know whether it had already
     happened, and the only two options would be paying it twice or never. */
  woke: boolean;
}

export function newGround(): GroundState {
  return {
    unrest: new Array(REGION_COUNT).fill(0),
    ballast: 1, lit: [], collapsed: [], pending: -1, collapses: 0, fed: 0, woke: false
  };
}

export function loadGround(raw: unknown): GroundState {
  const s = newGround();
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Partial<GroundState>;
  if (Array.isArray(r.unrest)) {
    for (let i = 0; i < REGION_COUNT; i++) s.unrest[i] = clamp01(Number(r.unrest[i]) || 0);
  }
  if (typeof r.ballast === 'number') s.ballast = clamp01(r.ballast);
  if (Array.isArray(r.lit)) {
    s.lit = r.lit
      .map((n) => Math.round(Number(n)))
      .filter((n, i, a) => n >= 0 && n < REGION_COUNT && a.indexOf(n) === i);
  }
  if (Array.isArray(r.collapsed)) {
    s.collapsed = r.collapsed
      .map((n) => Math.round(Number(n)))
      .filter((n) => n >= 0 && n < REGION_COUNT);
  }
  if (typeof r.pending === 'number' && r.pending >= 0 && r.pending < REGION_COUNT) {
    s.pending = Math.round(r.pending);
  }
  if (typeof r.collapses === 'number') s.collapses = Math.max(0, r.collapses);
  if (typeof r.fed === 'number') s.fed = Math.max(0, r.fed);
  s.woke = r.woke === true;
  return s;
}

function clamp01(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/* ---------- the operations ---------- */

/* One cell cut. Returns the region it landed in so the caller can say so. */
export function cutCell(s: GroundState, x: number, d: number): number {
  const r = regionAt(Math.round(x), Math.max(0, Math.round(d)));
  s.unrest[r] = clamp01(s.unrest[r] + unrestPerCell(d, s.woke));
  return r;
}

/* What the planet as a whole is doing: the mean of its twelve regions.

   The mean and not the worst. The worst would mean one furious region pinned
   the drain at maximum however much of the planet was quiet, which reads as
   the meter being broken - and it would punish the exact behaviour the design
   wants, which is working one region hard and then going somewhere else. */
export function planetUnrest(s: GroundState): number {
  let sum = 0;
  for (let i = 0; i < REGION_COUNT; i++) sum += s.unrest[i];
  return sum / REGION_COUNT;
}

export function isCollapsed(s: GroundState, region: number): boolean {
  return s.collapsed.indexOf(region) >= 0;
}

/* Run the Ballast down for `dt` seconds, and report the moment it empties.

   `emptied` is true only on the transition, so the caller can choose a region
   once rather than every frame for as long as the tank sits on the floor. */
export function drainBallast(s: GroundState, dt: number): { emptied: boolean } {
  if (s.ballast <= 0) return { emptied: false };
  s.ballast = Math.max(0, s.ballast - ballastDrain(planetUnrest(s), tierOf(s)) * dt);
  return { emptied: s.ballast <= 0 };
}

/* Which region falls, given where the ship is.

   The angriest one that is still standing, minus the two it is never allowed
   to take. Returns -1 when every candidate is excluded, and -1 has to be a
   real answer rather than a fallback to "take one anyway": a planet with one
   region left is a planet that has to be allowed to stop collapsing. */
export function collapseTarget(s: GroundState, shipRegion: number, padRegion: number): number {
  let best = -1, worst = -1;
  for (let i = 0; i < REGION_COUNT; i++) {
    if (i === shipRegion || i === padRegion || isCollapsed(s, i)) continue;
    if (s.unrest[i] > worst) { worst = s.unrest[i]; best = i; }
  }
  return best;
}

/* Apply a collapse. The caller owns the world and clears the tunnels; this
   owns the bookkeeping. */
export function collapse(s: GroundState, region: number): void {
  if (region < 0 || isCollapsed(s, region)) return;
  s.collapsed.push(region);
  s.unrest[region] = UNREST_AFTER_COLLAPSE;
  s.ballast = Math.max(s.ballast, BALLAST_AFTER_COLLAPSE);
  s.pending = -1;
  s.collapses++;
}

/* Feed it. Returns how much of the feed the Ballast could actually take, so
   the caller can refuse to spend ore into a full tank. */
export function feed(s: GroundState, id: string, n: number): number {
  const room = 1 - s.ballast;
  if (room <= 0 || n <= 0) return 0;
  const gain = Math.min(room, feedValue(id) * n);
  s.ballast = clamp01(s.ballast + gain);
  s.fed += n;
  return gain;
}

/* Shore up the oldest fallen region, if the Ballast can pay for it. Returns
   the region reopened, or -1. */
export function shore(s: GroundState): number {
  if (!s.collapsed.length || s.ballast < BALLAST_SAFE) return -1;
  const region = s.collapsed.shift() as number;
  s.ballast = clamp01(s.ballast - BALLAST_SHORE_COST);
  return region;
}

/* Whether shoring is even on offer, which is what the pad's panel asks. */
export function canShore(s: GroundState): boolean {
  return s.collapsed.length > 0 && s.ballast >= BALLAST_SAFE;
}
