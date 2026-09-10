import { HULL_MAX, DEF, isOre, ORES, GEODE, UPGRADES, SUPPLIES, BOMB_CHARGE, LASER_CHARGE, coreDepth, planetName, traitOf, valueMult, costOf, matCost, TRAIT_OF, heatDepth } from './sim/config';
import { setGauges } from './gauges';
import { clamp } from './sim/util';
import { g, S, save, coreM, valueM, worldTrait, padFuel } from './sim/state';
import { heatDamagePerSecond } from './sim/feel';
import type { Upgrade } from './types';
import { VERSION, CHANGELOG } from './changelog';
import { haulValue } from './sim/world';
import { lamp } from './scene';
import { setDrillTier, setUpgradeHardware } from './ship';
import { sfx, audioState } from './audio';
import { summarise, mergeLog, loadLog, type Row } from './sim/telemetry';
import { R } from './sim/runtime';
import { hap, haptics, setHaptics } from './haptics';
import { selectedBay, refreshBays } from './station';
import { PARTS, DRIVE_SLOTS } from './sim/drive';

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
  kit: mustEl('kit'), supplies: mustEl('supplies'),
  ordBomb: mustEl('ordBomb'), ordLaser: mustEl('ordLaser'),
  power: mustEl('power'), powerChip: mustEl('powerChip'),
  shopPlanet: mustEl('shopPlanet'),
  verNum: mustEl('verNum'), notes: mustEl('notes'), btnNotes: mustEl('btnNotes'),
  runlog: mustEl('runlog'), btnLog: mustEl('btnLog')
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
export function flash(color: string, ms?: number) {
  ui.flash.style.background = color;
  ui.flash.style.opacity = '1';
  setTimeout(() => { ui.flash.style.opacity = '0'; }, ms || 220);
}
export const atSurface = () => g.pd <= -0.6;

export function updateHUD() {
  /* The chip carries the trait because it is the only always-visible place a
     planet is named, and a modifier you have to open a menu to remember is a
     modifier you play without. Stable is left unlabelled - "Verdax · Stable"
     would teach the first-time player that traits are a thing before they have
     ever seen one bite. */
  const tr = worldTrait();
  ui.planet.textContent = tr.id === 'stable'
    ? planetName(g.world)
    : planetName(g.world) + '  ·  ' + tr.name.toUpperCase();
  ui.credits.textContent = Math.floor(g.credits).toLocaleString();
  ui.haul.textContent = haulValue().toLocaleString();
  ui.depth.textContent = 'DEPTH ' + Math.max(0, Math.round(g.pd)) + ' m   /   CORE ' + coreM() + ' m';
  /* The dials take fractions and do their own smoothing - see gauges.ts. The
     two numbers under them are the exact reading a needle cannot give you, and
     fuel is the one that decides whether to turn round. Rounded UP, so a gauge
     never prints 0% while there is still a metre of climb in the tank. */
  const fuelFrac = clamp(g.fuel / S.fuelCap(), 0, 1);
  const hullFrac = clamp(g.hull / S.hullCap(), 0, 1);
  const weightFrac = clamp(g.weight / S.cargoCap(), 0, 1);
  ui.fuelTxt.textContent = Math.ceil(fuelFrac * 100) + '%';
  ui.cargoTxt.textContent = g.weight.toFixed(1) + ' / ' + S.cargoCap() + ' KG';
  ui.btnShop.style.display = atSurface() && g.mode === 'play' ? '' : 'none';
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
  const heatLine = heatDepth(g.planet);
  const drain = heatDamagePerSecond(g.pd, S.shield(), g.soak, heatLine, coreM() - heatLine);
  const cooking = drain > 0;
  ui.hullTxt.classList.toggle('hot', cooking);
  ui.hullTxt.textContent = cooking ? 'HULL  -' + drain.toFixed(1) + '/s' : 'HULL';
  /* One call for every reading, so the dials cannot end up describing
     different frames. */
  setGauges(fuelFrac, weightFrac, hullFrac, clamp(g.soak, 0, 1));

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

  /* The Jump Drive, under the minerals.

     It belongs in the manifest because the manifest is the screen that answers
     "what have I got" - and the whole reason the drive exists is that the old
     answer was a credit balance, which is a number that will look small next
     week. Five named things you either have or do not is the opposite. */
  const head = document.createElement('div');
  head.className = 'sub';
  head.style.marginTop = '16px';
  head.textContent = 'JUMP DRIVE  ' + g.drive.length + ' / ' + DRIVE_SLOTS;
  ui.vault.appendChild(head);
  for (const part of PARTS) {
    const has = g.drive.includes(part.id);
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<div class="dot" style="background:' +
        (has ? '#9ffcff' : '#2a3038') + '; color:' + (has ? '#9ffcff' : '#2a3038') + '"></div>' +
      '<div class="upinfo"><div class="upname"' + (has ? '' : ' style="color:#6b7480"') + '>' +
        part.name + '</div>' +
      '<div class="upeff">' + (has ? 'Aboard' : 'On a ' + (TRAIT_OF[part.trait] || { name: part.trait }).name + ' world') +
      '</div></div>' +
      '<div class="val"' + (has ? '' : ' style="color:#6b7480"') + '>' + (has ? '✓' : '—') + '</div>';
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
  buildCard();
  buildSupplies();
}

export function buildCard() {
  const key = selectedBay();
  ui.shopHint.classList.toggle('gone', !!key);
  ui.shopCard.innerHTML = '';
  if (!key) {
    /* Deliberately empty: the hint line floating over the room already says
       what to do, and saying it twice on one screen reads as a bug. */
    ui.shopCard.innerHTML = '<div class="cempty">&nbsp;</div>';
    return;
  }
  const u = UPGRADES.find((x) => x.key === key);
  if (!u) return;
  buildUpgradeRow(u);
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

export function buildSupplies() {
  ui.supplies.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'counter';
  head.textContent = 'SUPPLIES \u00b7 SPENT UNDERGROUND';
  ui.supplies.appendChild(head);
  for (const sup of SUPPLIES) {
    const held = g.kit[sup.key];
    const full = held >= sup.max;
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<div class="upinfo"><div class="upname">' + sup.name +
      ' <span class="mult">' + held + '/' + sup.max + '</span></div>' +
      '<div class="upeff">' + sup.blurb + '</div></div>';
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = full ? 'FULL' : '◈ ' + sup.cost.toLocaleString();
    btn.disabled = full || g.credits < sup.cost;
    btn.onclick = () => {
      if (full || g.credits < sup.cost) return;
      g.credits -= sup.cost;
      g.kit[sup.key]++;
      sfx.buy();
      save(); buildShop(); updateHUD();
      flash('rgba(120,255,200,.25)', 160);
    };
    row.appendChild(btn);
    ui.supplies.appendChild(row);
  }
}

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


/* ---------- a quake at the surface ----------

   Fired from wherever the cell was removed, which is usually a hundred metres
   from the thing that just broke. So the feedback has to travel: a rumble you
   hear underground, a shake through the whole frame, and a line that names
   what took the damage. The damage itself is visible the next time you surface,
   which is the point - you cannot fly up to protect it and you do not get to
   watch it happen.

   `CRAFT.md`: fire visual, audio and camera as one event. Haptics join this in
   M8, where every event in the game gets them at once. */
export function onQuake() {
  const c = g.claim;
  R.shake = Math.max(R.shake, 1.35);
  sfx.rumble();
  hap.quake();
  const worst = (['refinery', 'derrick', 'shed'] as const)
    .map((k) => ({ k, v: c[k] }))
    .sort((a, b) => a.v - b.v)[0];
  const name = { refinery: 'Refinery', derrick: 'Derrick', shed: 'Shed' }[worst.k];
  toast('The claim was shaken · ' + name + ' at ' + Math.round(worst.v) + '%');
}
