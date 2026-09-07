import { HULL_MAX, DEF, UPGRADES, coreDepth, planetName, valueMult, costOf } from './config';
import { clamp } from './util';
import { g, S, save } from './state';
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
  flash: mustEl('flash'), btnShop: mustEl('btnShop'), btnAuto: mustEl('btnAuto')
};

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
  ui.planet.textContent = planetName(g.planet);
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
  /* Two different warnings share the one vignette. Soak reddens the edges
     steadily, so you can watch the pressure build and decide whether to push
     one more block. A failing hull pulses on top of it, because that is an
     alarm rather than a gauge. */
  const danger = clamp((45 - g.hull) / 45, 0, 1);
  const alarm = danger * (0.35 + 0.25 * Math.sin(performance.now() / 180));
  const building = g.soak * 0.34;
  ui.heat.style.opacity = String(Math.max(alarm, building));
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
}

export function audioLabels() {
  ui.btnMusic.textContent = 'MUSIC  ' + (audioState.music ? 'ON' : 'OFF');
  ui.btnSfx.textContent = 'SOUND  ' + (audioState.sfx ? 'ON' : 'OFF');
  ui.btnMusic.classList.toggle('off', !audioState.music);
  ui.btnSfx.classList.toggle('off', !audioState.sfx);
}
