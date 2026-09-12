/* econ.mjs - what a player actually earns, and when they buy each thing.

   `CRAFT.md`: measure a progression by simulating play - bank, buy, next
   level - and report the level each thing is reached at. Dividing a late price
   by early income measures a player who never got better, which is nobody.

   This drives the REAL pure layer through the same bundle the golden tests
   use, so every number below comes from the shipping generator, the shipping
   ore table, the shipping prices and the shipping fuel and heat rules. What it
   models rather than executes is only the part that lives in the frame loop:
   where the ship flies and which cell it points at. Those are stated as
   assumptions at the top of the report, because a probe that hides its model
   is a probe you cannot argue with.

   Run:  npm run econ            (all three styles)
         node scripts/econ.mjs --style greedy --runs 40

   It changes nothing. It is safe to run against a working tree at any time. */

import { loadPure } from '../test/harness.mjs';

const H = await loadPure();
const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i === -1 ? d : process.argv[i + 1];
};

/* ---------------- the model ----------------

   One run is: fly or cut down a shaft, work a seam at the bottom, climb out,
   sell. The three things the frame loop decides and this has to assume:

   1. The shaft is straight and is reused. The first descent cuts it; later
      runs fly down it. That is what a player does and it is why run two is so
      much faster than run one.
   2. Work at the bottom is a corridor cut sideways from the shaft, taking
      every cell in it. That matters: in this game EVERY broken block goes in
      the hold, dirt included, so the hold fills with what is in the way and
      not only with what is worth money.
   3. No tremors, no gas, no caches. They are variance around this line, not
      the line. */

const DIG_BASE = H.DIG_BASE;
const speed = () => H.S.speed();
const hullMax = () => (H.S.hullMax ? H.S.hullMax() : H.HULL_MAX);

function fresh(style, ox) {
  H.setWorld(0);
  Object.assign(H.g.up, {
    drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0,
    bomb: 0, laser: 0, hull: 0, magnet: 0, survey: 0, drone: 0, reactor: 0,
    recyc: 0, cell: 0, patch: 0, coolant: 0
  });
  H.g.credits = 0; H.g.relics = []; H.g.relicsTaken = [];
  H.g.ground = H.newGround();
  H.g.cargo = {}; H.g.weight = 0; H.g.dug = new Set(); H.g.stock = {};
  return { style, ox, shaft: 0, best: 0, t: 0, runs: 0, bought: [], history: [] };
}

/* The cell as the generator really makes it, with its hardness multiplier.

   Anything the sale table does not know about - the core, bedrock, a relic, a
   drive component - is treated as not there. Those are not mined for money and
   haulValue() looks its prices up in DEF, so putting one in the hold crashes
   the sale rather than earning anything. The probe found that by digging into
   a core, which is the one place the optimal style always ends up. */
function cell(x, d) {
  const b = H.blockAt(x, d);
  if (!b || b.value == null) return null;
  return H.DEF[b.id] ? b : null;
}

function digCost(b) {
  const secs = (b.hard * DIG_BASE) / H.S.drill();
  const fuel = H.fuelPerCell(b.hard) * H.S.cellFuel();
  return { secs, fuel };
}

/* How deep this style is willing to work, given what it owns right now. */
function targetDepth(st) {
  const heat = H.heatDepth(H.g.planet);
  const core = H.coreM();
  if (st.style === 'cautious') return Math.min(st.shaft + 8, heat - 2, core - 1);
  if (st.style === 'greedy') return Math.min(st.shaft + 14, core - 1);
  /* optimal: try every reachable depth and take the best credits per second,
     which is the only definition of "optimal" this game actually rewards. */
  let best = null;
  for (let d = 8; d < core; d += 4) {
    const r = simulate(st, d, true);
    if (!best || r.rate > best.rate) best = { d, rate: r.rate };
  }
  return best ? best.d : 20;
}

/* One run. `dry` runs it against a copy so the caller can compare depths
   without spending the world. */
function simulate(st, depth, dry) {
  const ox = st.ox;
  const shaft0 = st.shaft;
  let t = 0, fuel = H.S.fuelCap(), hull = hullMax(), soak = 0;
  /* UNREST, walked alongside the run rather than mutated in it. It replaced
     the Claim's strain in W6: there are no quakes and no buildings, and what
     the probe reports instead is how much a run raises the anger of the ground
     it is cutting - which is the number the Ballast and the tremor rate both
     answer to. Accumulated locally so a dry run cannot spend it. */
  const core = H.coreM();
  let deepCells = 0, unrest = 0;
  const cargo = {};
  let weight = 0;
  const cap = H.S.cargoCap();
  let lost = false;

  const heatTick = (pd, secs) => {
    soak = H.soakAfter(soak, pd, secs);
    hull -= H.heatDamagePerSecond(pd, H.S.shield(), soak) * secs;
  };

  /* ---- down ---- */
  for (let d = 1; d <= depth; d++) {
    if (d <= shaft0) {
      const secs = 1 / speed();
      t += secs; fuel -= H.FUEL_PER_MOVE * secs * H.S.fuelUse(); heatTick(d, secs);
    } else {
      const b = cell(ox, d);
      if (!b) continue;
      const c = digCost(b);
      t += c.secs; fuel -= c.fuel * H.S.fuelUse(); heatTick(d, c.secs);
      if (weight + b.wt <= cap) { cargo[b.id] = (cargo[b.id] || 0) + 1; weight += b.wt; }
      deepCells++; unrest += H.unrestPerCell(d, H.g.ground.woke);
      if (!dry) st.shaft = d;
    }
    if (hull <= 0 || fuel <= 0) { lost = true; break; }
  }

  /* ---- work the seam ---- */
  const reserve = () => depth / speed() * H.FUEL_PER_MOVE * H.S.fuelUse() * (st.style === 'greedy' ? 1.05 : 1.35);
  const fill = st.style === 'cautious' ? 0.7 : 1.0;
  let x = 1, side = 1;
  while (!lost && weight < cap * fill && fuel > reserve()) {
    for (const dd of [depth, depth - 1]) {
      const b = cell(ox + x * side, dd);
      if (!b) continue;
      const c = digCost(b);
      t += c.secs; fuel -= c.fuel * H.S.fuelUse(); heatTick(dd, c.secs);
      if (weight + b.wt <= cap) { cargo[b.id] = (cargo[b.id] || 0) + 1; weight += b.wt; }
      deepCells++; unrest += H.unrestPerCell(dd, H.g.ground.woke);
      if (hull <= 0) { lost = true; break; }
    }
    side = -side;
    if (side === 1) x++;
    if (x > 40) break;
  }

  /* ---- up ---- */
  const climb = depth / speed();
  t += climb; fuel -= H.FUEL_PER_MOVE * climb * H.S.fuelUse();
  if (fuel <= 0 || hull <= 0) lost = true;

  /* ---- sell ---- */
  const saved = { cargo: H.g.cargo, weight: H.g.weight };
  H.g.cargo = cargo; H.g.weight = weight;
  let value = H.haulValue();
  H.g.cargo = saved.cargo; H.g.weight = saved.weight;
  /* Death takes the whole hold now - there is no tow to take a cut of it. */
  if (lost) value = 0;
  value = Math.round(value * H.S.saleBonus());

  if (dry) { st.shaft = shaft0; }
  else {
    st.best = Math.max(st.best, depth);
    /* Ore banked at the pad, which is what the material gate spends. Only ore:
       sell() puts nothing else in the stock. */
    for (const k in cargo) if (H.isOre(H.DEF[k])) H.g.stock[k] = (H.g.stock[k] || 0) + cargo[k];
  }
  return { t, value, weight, cap, lost, depth, deepCells, unrest, rate: value / Math.max(t, 1) };
}

/* Who buys what. A style is a purchasing policy as much as a depth policy. */
const ORDER = {
  cautious: ['tank', 'cool', 'patch', 'hull', 'cargo', 'drill', 'thrust', 'scan'],
  greedy: ['cargo', 'drill', 'thrust', 'scan', 'tank', 'cool', 'magnet', 'hull'],
  optimal: null
};

function buy(st) {
  const owned = (u) => H.g.up[u.key] || 0;
  /* The shop's real gates, not just the price: a row is sealed until your best
     depth reaches it, and past level three it wants the mineral the thing is
     built out of. A probe that ignores either one reports a shop that does not
     exist. */
  const affordable = H.UPGRADES.filter((u) => {
    if (owned(u) >= u.max) return false;
    if ((u.unlock || 0) > st.best) return false;
    if (H.costOf(u, owned(u)) > H.g.credits) return false;
    const mc = H.matCost(u, owned(u));
    if (mc && (H.g.stock[mc.id] || 0) < mc.need) return false;
    return true;
  });
  if (!affordable.length) return null;
  let pick;
  if (st.style === 'optimal') {
    /* cheapest first maximises the number of rungs owned, which in a game with
       no dominant stat is the closest thing to optimal that does not require
       simulating every basket. */
    pick = affordable.sort((a, b) => H.costOf(a, owned(a)) - H.costOf(b, owned(b)))[0];
  } else {
    const order = ORDER[st.style];
    pick = affordable.sort((a, b) => {
      const ai = order.indexOf(a.key), bi = order.indexOf(b.key);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })[0];
  }
  const lvl = owned(pick);
  const mc = H.matCost(pick, lvl);
  if (mc) H.g.stock[mc.id] -= mc.need;
  H.g.credits -= H.costOf(pick, lvl);
  H.g.up[pick.key] = lvl + 1;
  return { key: pick.key, name: pick.name, level: lvl + 1, run: st.runs, minute: st.t / 60 };
}

function play(style, runs, ox) {
  const st = fresh(style, ox);
  for (let i = 0; i < runs; i++) {
    const depth = targetDepth(st);
    const r = simulate(st, depth, false);
    st.runs++; st.t += r.t; H.g.credits += r.value;
    const purchases = [];
    let p;
    while ((p = buy(st))) { st.bought.push(p); purchases.push(p.name + ' ' + p.level); }
    st.history.push({
      run: st.runs, min: +(st.t / 60).toFixed(1), depth, secs: Math.round(r.t),
      paid: r.value, hold: `${Math.round(r.weight)}/${r.cap}`, lost: r.lost ? 'LOST' : '',
      cut: r.deepCells, unrest: +r.unrest.toFixed(3),
      bank: H.g.credits, bought: purchases.join(', ')
    });
  }
  return st;
}

/* ---------------- report ----------------

   Five corridor offsets, not one. `CRAFT.md`: calibrate against five or six
   procedural seeds, because single-layout numbers swing about 25% on luck -
   and the first version of this probe showed run payouts of 142, 275, 537,
   452, 2029, 170, 192 and 3708 in sequence, which is that swing exactly. The
   median across offsets is the number to argue with; the spread is the second
   finding. */

const runs = +arg('runs', 24);
const only = arg('style', null);
const styles = only ? [only] : ['cautious', 'greedy', 'optimal'];
/* Shaft positions, not arbitrary numbers. The world is W = 13 cells wide and
   blockAt() returns null outside it, so the first version's offsets of 0, 7,
   13, 21 and 29 put three of five shafts entirely outside the world and the
   fourth against the left wall: three seeds mined an empty planet and reported
   it as a poor one. Every median in the first M1 report was computed over that.
   These are inside the world, spread either side of the pad at START_X = 6. */
const OFFSETS = [2, 4, 6, 8, 10];

const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

H.setWorld(0);
console.log(`Coreward economy probe - planet 0, core at ${H.coreM()} m, heat at ${H.heatDepth(0)} m, tremors at ${H.tremorDepth(0)} m`);
console.log(`${runs} runs per style, ${OFFSETS.length} corridor offsets, medians reported.`);
console.log('');
console.log('Model: a straight reused shaft, a corridor at the bottom, every broken block in the');
console.log('hold. No tremors, gas or caches. Prices, ore, hardness, fuel and heat are the real ones.');
console.log('');

const headline = [];
for (const style of styles) {
  const all = OFFSETS.map((ox) => play(style, runs, ox));
  console.log(`--- ${style} ---`);
  console.table(all[0].history.slice(0, 10));

  /* When does each upgrade first get bought, across offsets? */
  const rows = [];
  for (const u of H.UPGRADES) {
    const firsts = all.map((st) => st.bought.find((b) => b.key === u.key)).filter(Boolean);
    if (!firsts.length) continue;
    rows.push({
      upgrade: u.name,
      firstRun: med(firsts.map((f) => f.run)),
      firstMinute: +med(firsts.map((f) => f.minute)).toFixed(1),
      ofSeeds: `${firsts.length}/${all.length}`
    });
  }
  rows.sort((a, b) => a.firstMinute - b.firstMinute);
  console.table(rows);

  const holdUse = all.flatMap((st) => st.history.map((h) => {
    const [w, c] = h.hold.split('/').map(Number); return w / c;
  }));
  const paid = all.flatMap((st) => st.history.map((h) => h.paid));
  const deep = all.flatMap((st) => st.history.map((h) => h.cut));
  const totalUnrest = all.map((st) => st.history.reduce((a, h) => a + h.unrest, 0));
  headline.push({
    style,
    /* How much Unrest a whole style's worth of runs adds up to, against the
       0.35 where a region turns Restless and the 0.62 where it starts to
       grind. One style's runs are not all in one region, so this is an upper
       bound on how fast the ground turns. */
    unrestIn20Runs: +med(totalUnrest).toFixed(2),
    cellsPerRun: med(deep),
    run1: med(all.map((st) => st.history[0].paid)),
    minutesToAllLadders: +med(rows.length ? [Math.max(...rows.map((r) => r.firstMinute))] : [0]).toFixed(1),
    medianHoldUse: (med(holdUse) * 100).toFixed(0) + '%',
    payoutSpread: `${Math.min(...paid)}-${Math.max(...paid)}`,
    rungs: med(all.map((st) => st.bought.length))
  });
  console.log('');
}

console.log('=== the headline ===');
console.table(headline);
console.log('minutesToAllLadders: the median minute by which every ladder in the shop has been started.');
console.log('medianHoldUse: how full the hold actually is when a run ends. A cap that never binds is not a decision.');
