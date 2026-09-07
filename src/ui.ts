import { HULL_MAX, DEF, UPGRADES, SUPPLIES, coreDepth, planetName, traitOf,
         valueMult, costOf } from './config';
import { clamp } from './util';
import { g, S, save } from './state';
import { heatDamagePerSecond } from './feel';
import { haulValue } from './world';
import { lamp } from './scene';
import { sfx, audioState } from './audio';

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
  fuel: mustEl('fuelBar'), hull: mustEl('hullBar'), cargoBar: mustEl('cargoBar'), cargoTxt: mustEl('cargoTxt'),
  toast: mustEl('toast'), shop: mustEl('shop'), shopCredits: mustEl('shopCredits'), upgrades: mustEl('upgrades'),
  event: mustEl('event'), evTitle: mustEl('evTitle'), evBody: mustEl('evBody'), evBtn: mustEl('evBtn'),
  manifest: mustEl('manifest'), manifestRows: mustEl('manifestRows'), manifestTotal: mustEl('manifestTotal'),
  pause: mustEl('pause'), pauseStats: mustEl('pauseStats'), btnReset: mustEl('btnReset'),
  btnMusic: mustEl('btnMusic'), btnSfx: mustEl('btnSfx'), heat: mustEl('heat'),
  alarm: mustEl('alarm'), soakBar: mustEl('soakBar'), hullTxt: mustEl('hullTxt'),
  vignette: mustEl('vignette'),
  flash: mustEl('flash'), btnShop: mustEl('btnShop'), btnAuto: mustEl('btnAuto'),
  kit: mustEl('kit'), supplies: mustEl('supplies')
};

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
  const tr = traitOf(g.planet);
  ui.planet.textContent = tr.id === 'stable'
    ? planetName(g.planet)
    : planetName(g.planet) + '  ·  ' + tr.name.toUpperCase();
  ui.credits.textContent = Math.floor(g.credits).toLocaleString();
  ui.haul.textContent = haulValue().toLocaleString();
  ui.depth.textContent = 'DEPTH ' + Math.max(0, Math.round(g.pd)) + ' m   /   CORE ' + coreDepth(g.planet) + ' m';
  ui.fuel.style.width = clamp(g.fuel / S.fuelCap(), 0, 1) * 100 + '%';
  ui.hull.style.width = clamp(g.hull / HULL_MAX, 0, 1) * 100 + '%';
  ui.cargoBar.style.width = clamp(g.weight / S.cargoCap(), 0, 1) * 100 + '%';
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
  const drain = heatDamagePerSecond(g.pd, S.shield(), g.soak);
  const cooking = drain > 0;
  ui.soakBar.style.width = clamp(g.soak, 0, 1) * 100 + '%';
  ui.soakBar.classList.toggle('hot', cooking);
  ui.hullTxt.classList.toggle('hot', cooking);
  ui.hullTxt.textContent = cooking ? 'HULL  -' + drain.toFixed(1) + '/s' : 'HULL';

  /* Ember edges are heat. They hold a floor the moment you cross the line,
     because damage starts there whether or not you have soaked yet, and fade
     to a residue above it - you are still hot, just not being cooked. */
  ui.heat.style.opacity = String(cooking ? 0.14 + g.soak * 0.36 : g.soak * 0.10);

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
  if (key === 'patch') return g.hull >= HULL_MAX - 0.5;
  return g.fuel >= S.fuelCap() - 0.5;
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
  const vm = valueMult(g.planet);
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
}

export function buildShop() {
  ui.shopCredits.textContent = Math.floor(g.credits).toLocaleString();
  ui.upgrades.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = g.up[u.key];
    const maxed = lvl >= u.max;
    const c = costOf(u, lvl);
    const row = document.createElement('div');
    row.className = 'up';
    const label = u.tiers ? u.name + ' — ' + u.tiers[lvl] : u.name;
    row.innerHTML =
      '<div class="upinfo"><div class="upname">' + label + '</div>' +
      '<div class="upeff">Lv ' + lvl + '/' + u.max + ' · ' + u.effect(lvl) + (maxed ? '' : ' → ' + u.effect(lvl + 1)) + '</div></div>';
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? 'MAX' : '◈ ' + c.toLocaleString();
    btn.disabled = maxed || g.credits < c;
    btn.onclick = () => {
      if (g.credits < c || maxed) return;
      g.credits -= c;
      g.up[u.key]++;
      if (u.key === 'tank') g.fuel = S.fuelCap();
      if (u.key === 'scan') lamp.distance = S.light();
      sfx.buy();
      save(); buildShop(); updateHUD();
      flash('rgba(120,255,200,.25)', 160);
    };
    row.appendChild(btn);
    ui.upgrades.appendChild(row);
  }
  buildSupplies();
}

export function buildSupplies() {
  ui.supplies.innerHTML = '';
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
  ui.btnMusic.textContent = 'MUSIC  ' + (audioState.music ? 'ON' : 'OFF');
  ui.btnSfx.textContent = 'SOUND  ' + (audioState.sfx ? 'ON' : 'OFF');
  ui.btnMusic.classList.toggle('off', !audioState.music);
  ui.btnSfx.classList.toggle('off', !audioState.sfx);
}
