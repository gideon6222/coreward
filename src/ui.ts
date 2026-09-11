import { HULL_MAX, DEF, isOre, ORES, GEODE, UPGRADES, SUPPLIES, SUPPLY_OF, BOMB_CHARGE, LASER_CHARGE, coreDepth, planetName, traitOf, valueMult, costOf, matCost, TRAIT_OF, heatDepth } from './sim/config';
import { setGauges, setFuelReserve } from './gauges';
import { clamp } from './sim/util';
import { g, S, save, coreM, valueM, worldTrait, padFuel, worldUnrest } from './sim/state';
import { heatDamagePerSecond } from './sim/feel';
import type { Upgrade, Supply } from './types';
import { VERSION, CHANGELOG } from './changelog';
import { haulValue } from './sim/world';
import { lamp } from './scene';
import { setDrillTier, setUpgradeHardware } from './ship';
import { sfx, audioState } from './audio';
import { summarise, mergeLog, loadLog, type Row } from './sim/telemetry';
import { R } from './sim/runtime';
import { feedValue, ballastDrain, unrestBand, UNREST_BANDS,
         BALLAST_SAFE, BALLAST_SHORE_COST, BALLAST_LOW } from './sim/unrest';
import { regionName, regionAt } from './sim/region';
import { hap, haptics, setHaptics } from './haptics';
import { selectedBay, refreshBays, refreshKit, paintAisleBar, reframeIfNeeded } from './station';


export /* el() is for lookups that may legitimately be absent. mustEl() is for the
   ones the game cannot run without: throwing here reaches the on-screen
   error overlay, which on a phone is the only way to see it at all. */
const el = (id: string) => document.getElementById(id);
export const mustEl = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error('missing required element #' + id);
  return node;
};
export const ui = {
  planet: mustEl('planet'), credits: mustEl('credits'), haul: mustEl('haul'), depth: mustEl('depth'),
  cargoTxt: mustEl('cargoTxt'), fuelTxt: mustEl('fuelTxt'),
  toast: mustEl('toast'), shop: mustEl('shop'), shopCredits: mustEl('shopCredits'),
  shopCard: mustEl('shopCard'), shopHint: mustEl('shopHint'),
  event: mustEl('event'), evTitle: mustEl('evTitle'), evBody: mustEl('evBody'), evBtn: mustEl('evBtn'),
  manifest: mustEl('manifest'), manifestRows: mustEl('manifestRows'), manifestTotal: mustEl('manifestTotal'),
  vault: mustEl('vault'),
  pause: mustEl('pause'), pauseStats: mustEl('pauseStats'), btnReset: mustEl('btnReset'),
  btnMusic: mustEl('btnMusic'), btnSfx: mustEl('btnSfx'), heat: mustEl('heat'),
  /* el(), not mustEl(): the toggle is new and a save loaded into an older
     cached shell must not take the whole HUD down with it. */
  btnHaptics: el('btnHaptics'),
  alarm: mustEl('alarm'), hullTxt: mustEl('hullTxt'),
  vignette: mustEl('vignette'),
  flash: mustEl('flash'), btnShop: mustEl('btnShop'), btnAuto: mustEl('btnAuto'),
  kit: mustEl('kit'),
  ordBomb: mustEl('ordBomb'), ordLaser: mustEl('ordLaser'),
  power: mustEl('power'), powerChip: mustEl('powerChip'),
  shopPlanet: mustEl('shopPlanet'),
  verNum: mustEl('verNum'), notes: mustEl('notes'), btnNotes: mustEl('btnNotes'),
  runlog: mustEl('runlog'), btnLog: mustEl('btnLog'),
  /* el(), not mustEl(): the banner is new, and a save loaded into an older
     cached shell must not take the whole HUD down with it - the same clause
     the haptics toggle needed and for the same reason. */
  found: el('found'), foundName: el('foundName'), foundWhat: el('foundWhat')
};

/* The run log, built on open and never in the loop.

   This is the half of the telemetry that costs anything, and it only runs when
   a finger lands on the button. Two columns of the same numbers: what this run
   has done, and what every run has done. All time is what a balance decision
   should be made on - one run is a mood - but this run is what makes the panel
   worth opening while playing.

   All-time is merged into a throwaway copy rather than written back, because
   the run is not over: folding it into the saved totals here would count it
   twice when the ship actually docks. */
export function buildRunLog() {
  const allNow = loadLog(g.log);
  mergeLog(allNow, R.run);
  const table = (rows: Row[]) => rows.map((r) =>
    '<div class="lg"><div class="l">' + r.label + '</div><div class="v">' + r.value +
    '</div><div class="n">' + r.note + '</div></div>').join('');
  ui.runlog.innerHTML =
    '<div class="lgh">THIS RUN</div>' + table(summarise(R.run, S.fuelCap(), S.hullCap())) +
    '<div class="lgh">ALL TIME</div>' + table(summarise(allNow, S.fuelCap(), S.hullCap()));
}

/* Rendered once, on first open, because a changelog does not change while the
   game is running and rebuilding it on every pause would be pure churn. */
let notesBuilt = false;
export function buildNotes() {
  ui.verNum.textContent = 'v' + VERSION;
  if (notesBuilt) return;
  notesBuilt = true;
  ui.notes.innerHTML = CHANGELOG.map((r) =>
    '<div class="rel"><div class="relhead"><span class="v">v' + r.version + '</span>  ' +
    r.title + '  <span class="d">' + r.date + '</span></div><ul>' +
    r.notes.map((n) => '<li>' + n + '</li>').join('') + '</ul></div>'
  ).join('');
}

/* The three kit buttons, looked up once. Ids are derived from the supply key
   so index.html and SUPPLIES cannot drift apart without mustEl throwing. */
const supBtns = SUPPLIES.map((sup) => ({
  sup, el: mustEl('sup' + sup.key[0].toUpperCase() + sup.key.slice(1))
}));

let toastT = 0;
export function toast(msg: string) { ui.toast.textContent = msg; ui.toast.style.opacity = '1'; toastT = 2.0; }
/* the frame loop used to decrement toastT directly; it stays owned here now */
export function tickToast(dt: number) {
  if (toastT <= 0) return;
  toastT -= dt;
  if (toastT <= 0) ui.toast.style.opacity = '0';
}
/* ---------- the discovery banner ----------

   Four seconds, no tap, no pause. Long enough to read nineteen words at arm's
   length and short enough that it is gone before the next block is through.
   Driven off the same tick as the toast rather than a setTimeout, so it runs
   on game time and the filmstrip can hold it still. */
let foundT = 0;
/* `kind` decides the two fixed lines, because a device and a consumable are
   different promises. A device is bolted on and its ladder opens; a supply is
   in the hold and the counter will restock it. Saying "FITTED" over a Fuel
   Cell would be a small lie in the one place the game is teaching. */
export function foundBanner(name: string, what: string, kind: 'device' | 'supply' | 'ore' = 'device') {
  if (!ui.found || !ui.foundName || !ui.foundWhat) return;
  ui.foundName.textContent = name;
  ui.foundWhat.textContent = what;
  const head = ui.found.querySelector('.fhead');
  const fit = ui.found.querySelector('.ffit');
  if (head) head.textContent = kind === 'device' ? 'DEVICE RECOVERED'
    : kind === 'supply' ? 'NEW SUPPLY' : 'NEW MINERAL';
  if (fit) {
    fit.textContent = kind === 'device'
      ? 'FITTED · UPGRADE IT AT THE OUTFITTER'
      : kind === 'supply' ? 'IN THE HOLD · THE OUTFITTER STOCKS IT NOW'
      : 'IN THE HOLD · SELL IT AT THE PAD';
  }
  ui.found.classList.add('on');
  foundT = 4.0;
}
export function tickFound(dt: number) {
  if (foundT <= 0) return;
  foundT -= dt;
  if (foundT <= 0 && ui.found) ui.found.classList.remove('on');
}

/* ---------- the aisle hint ----------

   It retires once it has been obeyed. A line of instructions that never goes
   away is a line of instructions the player stops seeing and the room keeps
   paying for - and this one sits in the only empty band of a frame that has
   four other things competing for it. One successful walk down the aisles is
   proof it landed, and it is persisted, because the second session should not
   be taught again.

   HERE rather than in input.ts, which is where it was written first. input.ts
   imports `ui` from this module, so a call the other way is a cycle - and the
   symptom was not a warning, it was "Cannot access 'k' before initialization"
   at boot, with the shop simply never opening. A hint is a UI concern and this
   is the UI module; the cycle was the design telling me where it belonged.

   Read through try/catch for the same reason the haptics toggle is: private
   browsing can make localStorage throw on access, and a shop that will not
   open because a hint could not remember itself is a bad trade. */
const HINT_KEY = 'coreward.hint.aisle';
let hintSeen = false;
try { hintSeen = localStorage.getItem(HINT_KEY) === '1'; } catch (e) { /* ignore */ }
export function aisleHintSeen() { return hintSeen; }
export function retireHint() {
  if (hintSeen) return;
  hintSeen = true;
  try { localStorage.setItem(HINT_KEY, '1'); } catch (e) { /* ignore */ }
  ui.shopHint.classList.add('gone');
}

export function flash(color: string, ms?: number) {
  ui.flash.style.background = color;
  ui.flash.style.opacity = '1';
  setTimeout(() => { ui.flash.style.opacity = '0'; }, ms || 220);
}
export const atSurface = () => g.pd <= -0.6;

export function updateHUD() {
  /* The chip names WHERE YOU ARE, and it is the only always-visible place that
     happens.

     It used to name the planet, which was right when a planet was a place you
     flew to and stayed on. There is one planet now, so a chip reading "Verdax"
     for the entire game says nothing at all - while the thing it could be
     saying changes every time you cross a boundary, which is the single
     clearest way a player finds out that regions exist.

     The trait rides along with it for the same reason it always did: a
     modifier you have to open a menu to remember is a modifier you play
     without. Stable is left unlabelled, so the first hour never learns that
     traits are a thing before it has seen one bite. */
  const tr = worldTrait();
  const here = regionName(regionAt(Math.round(g.px), Math.max(0, Math.round(g.pd))));
  ui.planet.textContent = tr.id === 'stable'
    ? here
    : here + '  ·  ' + tr.name.toUpperCase();
  ui.credits.textContent = Math.floor(g.credits).toLocaleString();
  ui.haul.textContent = haulValue().toLocaleString();
  /* "CORE 452 m" was the other thing that stopped being true. The core was the
     end of a world you were passing through; the floor of the one world is
     just how deep it goes, and naming it after the thing you used to break
     there points the player at an objective that is no longer the objective. */
  ui.depth.textContent = 'DEPTH ' + Math.max(0, Math.round(g.pd)) + ' m   /   ' + coreM() + ' m DEEP';
  /* The dials take fractions and do their own smoothing - see gauges.ts. The
     two numbers under them are the exact reading a needle cannot give you, and
     fuel is the one that decides whether to turn round. Rounded UP, so a gauge
     never prints 0% while there is still a metre of climb in the tank. */
  const fuelFrac = clamp(g.fuel / S.fuelCap(), 0, 1);
  const hullFrac = clamp(g.hull / S.hullCap(), 0, 1);
  const weightFrac = clamp(g.weight / S.cargoCap(), 0, 1);
  ui.fuelTxt.textContent = Math.ceil(fuelFrac * 100) + '%';
  ui.cargoTxt.textContent = g.weight.toFixed(1) + ' / ' + S.cargoCap() + ' KG';
  const docked = atSurface() && g.mode === 'play';
  ui.btnShop.style.display = docked ? '' : 'none';
  /* The Ballast button carries its own alarm. It is the only place the
     campaign's state reaches the HUD, and it only does so when there is
     something to do about it - a button that is always shouting is a button
     nobody reads. */
  const bal = el('btnBallast');
  if (bal) {
    bal.style.display = docked ? '' : 'none';
    const low = g.ground.ballast < BALLAST_LOW || g.ground.collapsed.length > 0;
    bal.textContent = 'BALLAST  ' + Math.round(g.ground.ballast * 100) + '%';
    bal.classList.toggle('armed', low);
  }
  if (g.up.auto > 0 && !atSurface() && g.mode === 'play') {
    ui.btnAuto.style.display = '';
    ui.btnAuto.textContent = 'AUTOPILOT  ' + Math.ceil(g.pd * S.autoRate()) + ' FUEL';
  } else {
    ui.btnAuto.style.display = 'none';
  }
  /* ---------- heat, as its own channel ----------

     Three signals, all saying the same thing at different volumes, none of
     them shared with any other kind of damage:

       the ember fill    how much soak you are carrying
       the -x.x/s label  that heat is draining the hull, and how fast
       the ember edges   that you are inside the zone right now

     The rate is the load-bearing one. It appears on the hull bar only while
     heat is actually flowing, so the connection between the two is not
     something the player has to be told. */
  /* The readout has to use the same world-scaled curve the loop does, or the
     number on the hull bar disagrees with the hull. */
  const heatLine = heatDepth(g.planet, worldTrait());
  const drain = heatDamagePerSecond(g.pd, S.shield(), g.soak, heatLine, coreM() - heatLine);
  const cooking = drain > 0;
  ui.hullTxt.classList.toggle('hot', cooking);
  ui.hullTxt.textContent = cooking ? 'HULL  -' + drain.toFixed(1) + '/s' : 'HULL';
  /* One call for every reading, so the dials cannot end up describing
     different frames. */
  setGauges(fuelFrac, weightFrac, hullFrac, clamp(g.soak, 0, 1));
  /* The reserve, as a fraction of the TANK rather than of what is left - the
     band is a mark on the dial, so it has to be in the dial's own units. */
  setFuelReserve(R.climb / Math.max(1, S.fuelCap()), R.fuelState);
  /* And the printed figure takes the state's colour, because somebody reading
     the number rather than the needle must get the same warning. */
  ui.fuelTxt.className = 'fuel-' + R.fuelState;

  /* Ember edges are heat. They hold a floor the moment you cross the line,
     because damage starts there whether or not you have soaked yet, and fade
     to a residue above it - you are still hot, just not being cooked. */
  ui.heat.style.opacity = String(cooking ? 0.14 + g.soak * 0.36 : g.soak * 0.10);
  updateOrd();

  /* Red is the hull itself, whatever emptied it: heat, a gas pocket, or the
     next thing. A pulse rather than a gauge, because it is an alarm. */
  const danger = clamp((45 - g.hull) / 45, 0, 1);
  ui.alarm.style.opacity = String(danger * (0.35 + 0.25 * Math.sin(performance.now() / 180)));
  updateKit();
}

/* Whether spending this supply right now would do anything at all. Used to dim
   the button rather than disable it: a supply you cannot usefully spend is
   still worth seeing, because the count is the information. */
function supplyIdle(key: string) {
  if (key === 'coolant') return g.soak < 0.02;
  if (key === 'patch') return g.hull >= S.hullCap() - 0.5;
  return g.fuel >= S.fuelCap() - 0.5;
}

/* The power meter and the two ordnance buttons.

   The chip is hidden entirely until something can spend it, because a meter
   for a thing you do not own is a question with no answer. */
export function updateOrd() {
  const owns = g.up.bomb > 0 || g.up.laser > 0;
  ui.powerChip.classList.toggle('hidden', !owns);
  ui.power.textContent = String(Math.floor(g.charge));

  const hidden = g.mode !== 'play' || atSurface();
  for (const [el, lvl, cost] of [
    [ui.ordBomb, g.up.bomb, BOMB_CHARGE] as const,
    [ui.ordLaser, g.up.laser, LASER_CHARGE] as const
  ]) {
    el.classList.toggle('none', lvl <= 0 || hidden);
    el.classList.toggle('cold', g.charge < cost);
    const n = el.querySelector('.n');
    if (n) n.textContent = String(cost);
  }
}

export function updateKit() {
  const hidden = g.mode !== 'play' || atSurface();
  for (const b of supBtns) {
    const n = g.kit[b.sup.key];
    b.el.classList.toggle('none', n <= 0 || hidden);
    b.el.classList.toggle('idle', supplyIdle(b.sup.key));
    const count = b.el.querySelector('.n');
    if (count) count.textContent = String(n);
  }
}

export function buildManifest() {
  ui.manifestRows.innerHTML = '';
  const vm = valueM();
  const rows = Object.keys(g.cargo).filter((k) => g.cargo[k] > 0)
    .sort((a, b) => g.cargo[b] * DEF[b].value - g.cargo[a] * DEF[a].value);
  if (!rows.length) {
    ui.manifestRows.innerHTML = '<div class="upeff" style="padding:12px 0">Hold empty. Go find a deposit.</div>';
  }
  for (const k of rows) {
    const o = DEF[k], n = g.cargo[k];
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<span class="dot" style="background:#' + o.color.toString(16).padStart(6, '0') + '"></span>' +
      '<div class="upinfo"><div class="upname">' + o.name + ' <span class="mult">x' + n + '</span></div>' +
      '<div class="upeff">' + (n * o.wt).toFixed(1) + ' kg · ' + Math.round(o.value * vm).toLocaleString() + ' each</div></div>' +
      '<div class="val">◈ ' + Math.round(n * o.value * vm).toLocaleString() + '</div>';
    ui.manifestRows.appendChild(row);
  }
  ui.manifestTotal.textContent = '◈ ' + haulValue().toLocaleString();
  buildVault();
}

/* What is banked at the pad, in depth order. This is the half of the manifest
   that turns it from a receipt into a plan: the hold says what you are
   carrying, the vault says what the Outfitter is still waiting on. */
export function buildVault() {
  /* Geodes sort in with the ores rather than trailing them: the list is in
     depth order, and depth order is how the player reads "where do I go". */
  const rows = [...ORES, GEODE]
    .sort((a, b) => a.min - b.min)
    .filter((o) => (g.stock[o.id] || 0) > 0);
  ui.vault.innerHTML = '';
  if (!rows.length) {
    ui.vault.innerHTML =
      '<div class="upeff" style="padding:10px 0">Nothing banked yet. Minerals are kept when you sell, ' +
      'and the Outfitter wants them for anything past level three.</div>';
    return;
  }
  for (const o of rows) {
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<span class="dot" style="background:#' + o.color.toString(16).padStart(6, '0') + '"></span>' +
      '<div class="upinfo"><div class="upname">' + o.name + '</div>' +
      '<div class="upeff">from ' + o.min + ' m</div></div>' +
      '<div class="val">' + (g.stock[o.id] || 0) + '</div>';
    ui.vault.appendChild(row);
  }

    if (g.won) {
    const w = document.createElement('div');
    w.className = 'upeff';
    w.style.marginTop = '10px';
    w.textContent = 'The Heart is broken. The Drift is behind you.';
    ui.vault.appendChild(w);
  }
}

/* The shop is a room now, so this builds the HEADER and the card for whatever
   case is currently picked - not a list. The room itself is station.ts.

   Everything underneath is unchanged: costs, level caps, the mineral gate and
   the depth seals all still come from config, and the buy path is the same one
   the list used. Only the presentation moved. */
export function buildShop() {
  ui.shopCredits.textContent = Math.floor(g.credits).toLocaleString();
  ui.shopPlanet.textContent = planetName(g.world).toUpperCase();
  /* The cases carry price and availability too, so they have to be redrawn
     whenever anything they show can have changed - which is exactly when this
     runs: opening the shop, and after every purchase. */
  refreshBays();
  refreshKit();
  /* The dots too, and the arrows with them: buying the last thing in a
     department cannot change which aisles have stock, but FINDING one can, and
     a purchase is the moment the shop is rebuilt either way. */
  paintAisleBar();
  buildCard();
  /* After the card, because the card is the thing whose height can move. */
  reframeIfNeeded();
}

export function buildCard() {
  const key = selectedBay();
  /* Hidden while something is picked, and hidden for good once the player has
     walked the aisles once - see `retireHint` in input.ts. */
  ui.shopHint.classList.toggle('gone', !!key || aisleHintSeen());
  ui.shopCard.innerHTML = '';
  if (!key) {
    /* Deliberately empty: the hint line floating over the room already says
       what to do, and saying it twice on one screen reads as a bug. */
    ui.shopCard.innerHTML = '<div class="cempty">&nbsp;</div>';
    return;
  }
  const sup = SUPPLY_OF[key];
  if (sup) { buildSupplyRow(sup); return; }
  const u = UPGRADES.find((x) => x.key === key);
  if (!u) return;
  buildUpgradeRow(u);
}

/* One consumable, in the same card the upgrades use.

   Playtest: *"a secret display case at the bottom of the screen pops open and
   shows all of the upgrades you have collected and lets you purchase the
   upgrades there."*

   The six chips in the tray are gone. They were the last list on this screen,
   and a Bulwark Field - three impacts absorbed outright - sitting in a grid
   next to a price is exactly the "too big of an advantage to just purchase"
   he named. Now you have to have held one, and then you have to open a drawer
   to buy another.

   The same card as an upgrade on purpose: one place at the bottom of the
   screen where what you picked explains itself, whether you picked it off a
   counter or out of a drawer. */
function buildSupplyRow(sup: Supply) {
  const held = g.kit[sup.key];
  const full = held >= sup.max;
  const row = document.createElement('div');
  row.className = 'up';
  row.innerHTML =
    '<div class="upinfo"><div class="upname">' + sup.name +
    ' <span class="mult">' + held + '/' + sup.max + '</span></div>' +
    '<div class="upeff">' + sup.blurb + '</div></div>';
  ui.shopCard.appendChild(row);

  const bar = document.createElement('div');
  bar.className = 'crow';
  const btn = document.createElement('button');
  btn.className = 'cbuy';
  btn.textContent = full ? 'HOLD IS FULL' : 'BUY  ◈ ' + sup.cost.toLocaleString();
  btn.disabled = full || g.credits < sup.cost;
  btn.onclick = () => {
    if (full || g.credits < sup.cost) return;
    g.credits -= sup.cost;
    g.kit[sup.key]++;
    sfx.buy();
    hap.buy();
    save(); buildShop(); updateHUD();
    flash('rgba(120,255,200,.25)', 160);
  };
  bar.appendChild(btn);
  ui.shopCard.appendChild(bar);
}

function buildUpgradeRow(u: Upgrade) {
  const lvl = g.up[u.key];

  /* Sealed: shown, named, and not purchasable. The depth is the price. */
  if (g.best.depth < u.unlock) {
    const row = document.createElement('div');
    row.className = 'up sealed';
    row.innerHTML =
      '<div class="upinfo"><div class="upname">' + u.name + '</div>' +
      '<div class="upeff">Sealed until you have reached ' + u.unlock + ' m</div></div>' +
      '<div class="seal">' + u.unlock + ' m</div>';
    ui.shopCard.appendChild(row);
    return;
  }

  const maxed = lvl >= u.max;
  const c = costOf(u, lvl);
  const mat = maxed ? null : matCost(u, lvl);
  const have = mat ? (g.stock[mat.id] || 0) : 0;
  const short = !!mat && have < mat.need;

  const row = document.createElement('div');
  row.className = 'up';
  const label = u.tiers ? u.name + ' — ' + u.tiers[lvl] : u.name;
  /* The requirement line names the depth as well as the mineral, because
     "6 Emerald" is only actionable if you know emerald starts at 78 m. */
  const def = mat ? DEF[mat.id] : null;
  const matLine = mat && def
    ? '<div class="upmat' + (short ? ' short' : '') + '">' +
      '<span class="dot" style="background:#' + def.color.toString(16).padStart(6, '0') + '"></span>' +
      mat.need + ' ' + def.name + ' · you have ' + have +
      (short && isOre(def) ? ' · from ' + def.min + ' m' : '') + '</div>'
    : '';
  row.innerHTML =
    '<div class="upinfo"><div class="upname">' + label + '</div>' +
    '<div class="upeff">Lv ' + lvl + '/' + u.max + ' · ' + u.effect(lvl) + (maxed ? '' : ' → ' + u.effect(lvl + 1)) + '</div>' +
    matLine + '</div>';
  const btn = document.createElement('button');
  btn.className = 'buy';
  btn.textContent = maxed ? 'MAX' : '◈ ' + c.toLocaleString();
  btn.disabled = maxed || g.credits < c || short;
  btn.onclick = () => {
    if (g.credits < c || maxed || short) return;
    g.credits -= c;
    if (mat) g.stock[mat.id] = have - mat.need;
    g.up[u.key]++;
    if (u.key === 'tank') g.fuel = padFuel();
    if (u.key === 'scan') lamp.distance = S.light();
    if (u.key === 'drill') setDrillTier(g.up.drill);
    /* Every upgrade may bolt something on, not just the drill. */
    setUpgradeHardware(g.up);
    sfx.buy();
    save(); buildShop(); updateHUD();
    flash('rgba(120,255,200,.25)', 160);
  };
  row.appendChild(btn);
  ui.shopCard.appendChild(row);
}

/* `buildSupplies` is gone with the grid it built.

   It rendered six chips into the tray, which is where they had been since
   before the Outfitter was a room at all. They are crates in a drawer under
   the counter now and `refreshKit()` in station.ts draws them, for the same
   reason `refreshBays` draws the upgrade cases: the room owns what the room
   shows. */

export function audioLabels() {
  if (ui.btnHaptics) {
    ui.btnHaptics.textContent = 'HAPTICS  ' + (haptics.on ? 'ON' : 'OFF');
    ui.btnHaptics.classList.toggle('off', !haptics.on);
  }
  ui.btnMusic.textContent = 'MUSIC  ' + (audioState.music ? 'ON' : 'OFF');
  ui.btnSfx.textContent = 'SOUND  ' + (audioState.sfx ? 'ON' : 'OFF');
  ui.btnMusic.classList.toggle('off', !audioState.music);
  ui.btnSfx.classList.toggle('off', !audioState.sfx);
}




/* ---------- the Ballast panel ----------

   The one screen where the campaign is a decision rather than a reading.

   It opens at the pad only, because feeding it is a pad action and because the
   two bars on it are the sort of thing that would rot into wallpaper if they
   were on the HUD while you dig. `CRAFT.md`: a HUD is a claim about what the
   player should be thinking about, and what they should be thinking about
   underground is fuel and the way home.

   The list is BANKED ore and not the hold. That is the tension the whole
   system exists for: everything here is something the Outfitter also wants,
   so feeding the planet is paid for out of upgrades. Rock is not on the list -
   rock does not hold a planet down. */
export function buildBallast() {
  const s = g.ground;
  const u = worldUnrest();
  const pct = Math.round(s.ballast * 100);

  const sub = el('balSub');
  if (sub) {
    /* Says what it is DOING, not what it is. The rate is the thing a player
       can act on, and it is the only place the drain is ever stated - the
       machine outside shows it as a vent and a needle and never as a number. */
    const tier = s.lit.length;
    const secs = s.ballast > 0 ? s.ballast / ballastDrain(u, tier) : 0;
    sub.textContent = s.ballast <= 0
      ? 'Empty. The ground is going to give somewhere.'
      : 'Holding for about ' + Math.max(1, Math.round(secs / 60)) + ' more minutes of digging'
        + (tier > 0 ? ' · ' + tier + ' anchor' + (tier === 1 ? '' : 's') + ' lit' : '');
  }
  const fill = el('balFill');
  if (fill) {
    fill.style.width = pct + '%';
    fill.classList.toggle('low', s.ballast < BALLAST_LOW);
  }
  const pctEl = el('balPct');
  if (pctEl) pctEl.textContent = pct + '%';
  const safe = el('balSafe');
  if (safe) {
    safe.style.left = Math.round(BALLAST_SAFE * 100) + '%';
    /* The shoring line only means anything while there is something to shore,
       so it is only drawn then. A permanent mark whose significance is
       conditional is a mark you learn to ignore. */
    safe.style.display = s.collapsed.length ? '' : 'none';
  }
  const unFill = el('balUnFill');
  if (unFill) {
    unFill.style.width = Math.round(u * 100) + '%';
    /* The BAND's own colour, flat, and not a green-to-red gradient across the
       fill. A gradient belongs to the track it is measured against; painted on
       the fill it compresses into the bar's own width, so a Calm planet drew a
       little rainbow with red in it. The colour is the reading. */
    unFill.style.background = '#' +
      UNREST_BANDS[unrestBand(u)].color.toString(16).padStart(6, '0');
  }
  const unEl = el('balUn');
  if (unEl) unEl.textContent = UNREST_BANDS[unrestBand(u)].name.toUpperCase();

  /* ---- fallen ground ---- */
  const fallen = el('balFallen');
  if (fallen) {
    fallen.innerHTML = '';
    for (const r of s.collapsed) {
      const row = document.createElement('div');
      row.className = 'fallen';
      const first = r === s.collapsed[0];
      const can = first && s.ballast >= BALLAST_SAFE;
      row.innerHTML =
        '<div class="upinfo"><div class="upname">' + regionName(r) + ' has come down</div>' +
        '<div class="upeff">' + (first
          ? 'Shoring it costs ' + Math.round(BALLAST_SHORE_COST * 100) + '% of the Ballast'
          : 'Waiting on the ground above it') + '</div></div>' +
        (first ? '<button class="buy" data-shore="1"' + (can ? '' : ' disabled') + '>SHORE UP</button>' : '');
      fallen.appendChild(row);
    }
  }

  /* ---- what you can feed it ---- */
  const rows = el('balRows');
  if (!rows) return;
  rows.innerHTML = '';
  const held = ORES.filter((o) => (g.stock[o.id] || 0) > 0);
  if (!held.length) {
    rows.innerHTML = '<div class="upeff" style="padding:10px 0">Nothing banked. ' +
      'Ore is kept when you sell, and this is the other thing it is for.</div>';
    return;
  }
  const room = 1 - s.ballast;
  for (const o of held) {
    const have = g.stock[o.id] || 0;
    const each = feedValue(o.id);
    /* How many it would actually take, rather than everything you hold.

       A button that empties your Solmarrow into a tank with room for one unit
       is a button that has to be undone, and there is no undo. `CRAFT.md`: the
       expensive irreversible action is the one that must be hardest to do by
       accident - so the count is on the face of the button. */
    const n = Math.min(have, Math.max(1, Math.ceil(room / each)));
    const full = room <= 0.001;
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<span class="dot" style="background:#' + o.color.toString(16).padStart(6, '0') + '"></span>' +
      '<div class="upinfo"><div class="upname">' + o.name + ' <span class="mult">x' + have + '</span></div>' +
      /* What it is worth to the tank, and where it came from - not what it
         sold for. The credits were paid the moment you touched the pad, so a
         price here reads as a second cost that is not being charged, and the
         actual cost of feeding is the upgrade you do not buy. */
      '<div class="upeff">' + Math.round(each * 100) + '% each · from ' + o.min + ' m</div></div>' +
      '<button class="buy" data-feed="' + o.id + '" data-n="' + n + '"' +
        (full ? ' disabled' : '') + '>FEED ' + n + '</button>';
    rows.appendChild(row);
  }
}
