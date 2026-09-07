import * as THREE from 'three';
import { W, HULL_MAX, DEF, isOre, START_X, SAVE_KEY, OLD_KEY, SUPPLY_OF,
         PATCH_HULL, CELL_FUEL, coreDepth, planetName, traitOf, valueMult } from './config';
import { clamp, key } from './util';
import { g, S, save } from './state';
import { haulValue, findRoute } from './world';
import { R } from './runtime';
import { lamp } from './scene';
import { worldX } from './materials';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { spray } from './particles';
import { ui, toast, flash, atSurface, updateKit } from './ui';
import { sfx } from './audio';
import { SHAKE_TOW, SHAKE_BOOM } from './feel';
import type { SupplyKey } from './types';

export function sell() {
  const v = haulValue();
  if (v <= 0) { g.cargo = {}; g.weight = 0; return; }
  g.credits += v;
  /* The pad pays for the ore AND keeps the minerals on your account. It is not
     a second payment: the upgrades that want minerals want them on top of a
     credit price, so what this really records is where you have been. Rock is
     not banked - nothing is ever built out of dirt. */
  for (const k in g.cargo) {
    if (DEF[k] && isOre(DEF[k])) g.stock[k] = (g.stock[k] || 0) + g.cargo[k];
  }
  g.cargo = {}; g.weight = 0;
  sfx.sell();
  toast('Sold haul for ◈ ' + v.toLocaleString());
  save();
}

export function goSurface() {
  g.px = START_X; g.pd = -1; g.face = 'down';
  R.moving = null; R.digging = null; R.flight = null;
  sfx.digStop();
  g.fuel = S.fuelCap(); g.hull = HULL_MAX; g.soak = 0;
  R.hullCause = 'heat';
  R.wasHot = false;
  syncBlocks(true);
  save();
}

/* Spend one supply.

   Refuses when it would do nothing rather than silently eating the item - a
   consumable burnt for no effect is the kind of thing a player never forgives,
   and on a phone a mis-tap next to the d-pad is not unlikely.

   Nothing here can be used at the pad, because the pad already refills the
   tank and the hull for free and clears soak. The buttons hide up there for
   the same reason. */
export function useSupply(k: SupplyKey) {
  if (g.mode !== 'play' || atSurface()) return;
  if (g.kit[k] <= 0) return;
  const sup = SUPPLY_OF[k];

  if (k === 'coolant') {
    if (g.soak < 0.02) { toast('Nothing to flush - ' + sup.idle); return; }
    g.soak = 0;
    R.hullCause = 'heat';
    flash('rgba(120,220,255,.26)', 340);
    toast('Coolant flush · heat soak cleared');
  } else if (k === 'patch') {
    if (g.hull >= HULL_MAX - 0.5) { toast('Hull is already sound'); return; }
    g.hull = Math.min(HULL_MAX, g.hull + PATCH_HULL);
    flash('rgba(255,120,140,.22)', 300);
    toast('Hull patched · +' + PATCH_HULL);
  } else {
    if (g.fuel >= S.fuelCap() - 0.5) { toast('Tank is already full'); return; }
    g.fuel = Math.min(S.fuelCap(), g.fuel + CELL_FUEL);
    flash('rgba(120,255,180,.22)', 300);
    toast('Fuel cell burned · +' + CELL_FUEL);
  }

  g.kit[k]--;
  R.shake = Math.max(R.shake, 0.22);
  sfx.supply();
  updateKit();
  save();
}

export function autopilot() {
  if (g.up.auto === 0 || atSurface() || g.mode !== 'play') return;
  const cost = Math.ceil(g.pd * S.autoRate());
  if (g.fuel < cost) { toast('Autopilot needs ' + cost + ' fuel'); return; }
  const route = findRoute();
  if (!route) { toast('No clear tunnel back to the pad'); return; }
  g.fuel -= cost;
  const pts3 = route.map((p) => new THREE.Vector3(worldX(p[0]), -p[1], 0));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
  const len = curve.getLength();
  const cruise = clamp(len / 4.2, 8, 26);
  R.flight = { curve: curve, len: len, u: 0, dur: len / cruise, t: 0, last: pts3[0].clone() };
  R.moving = null; R.digging = null; R.held = null;
  sfx.digStop();
  sfx.thrust();
  g.mode = 'fly';
  toast('Autopilot engaged · ' + route.length + ' m of tunnel');
}

export function tow(reason: string) {
  const cut = S.towCut();
  const taken = Math.round(haulValue() * cut);
  for (const k in g.cargo) g.cargo[k] = Math.floor(g.cargo[k] * (1 - cut));
  g.weight = 0;
  for (const k in g.cargo) g.weight += g.cargo[k] * DEF[k].wt;
  sfx.alarm();
  flash('rgba(255,140,60,.35)', 500);
  R.shake = SHAKE_TOW;
  goSurface();
  const kept = haulValue();
  sell();
  showEvent('TOWED HOME',
    reason + ' A salvage rig winched you back to the pad and took ' + Math.round(cut * 100) +
    '% of your haul as the fee, worth ◈ ' + taken.toLocaleString() + '. You kept ◈ ' + kept.toLocaleString() +
    '. Tow Insurance in the Outfitter lowers that cut.',
    'CONTINUE', () => {});
}

export function showEvent(title: string, bodyTxt: string, btnTxt: string, cb: () => void) {
  g.mode = 'event';
  ui.evTitle.textContent = title;
  ui.evBody.textContent = bodyTxt;
  ui.evBtn.textContent = btnTxt;
  ui.event.classList.remove('hidden');
  ui.evBtn.onclick = () => { sfx.ui(); ui.event.classList.add('hidden'); g.mode = 'play'; cb(); };
}

export function breakCore() {
  g.mode = 'boom';
  const x = worldX(g.px), y = -g.pd;
  spray(x, y, 0xffe9a0, 300, 24, 2.6);
  spray(x, y, 0xff7a18, 200, 15, 3.0);
  flash('rgba(255,255,255,.95)', 700);
  sfx.boom();
  R.shake = SHAKE_BOOM;
  setTimeout(() => {
    g.shards++;
    const next = g.planet + 1;
    showEvent(planetName(g.planet).toUpperCase() + ' DESTROYED',
      'The core gave way and the planet tore itself apart. You recovered a Core Shard, worth a permanent 8% drill power. ' +
      'Total shards: ' + g.shards + '. Next stop: ' + planetName(next) +
      ', where the crust is tougher and the veins run richer. ' + traitOf(next).blurb,
      'LAUNCH TO ' + planetName(next).toUpperCase(),
      () => {
        g.planet = next;
        g.dug = new Set();
        for (const k of Array.from(meshes.keys())) dropBlock(k);
        goSurface();
        save();
      });
  }, 1700);
}

export function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  g.planet = 0; g.credits = 0; g.shards = 0;
  g.up = { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 };
  g.kit = { coolant: 0, patch: 0, cell: 0 };
  g.stock = {};
  g.dug = new Set();
  g.cargo = {}; g.weight = 0;
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  lamp.distance = S.light();
  goSurface();
  g.mode = 'play';
  ui.pause.classList.add('hidden');
  flash('rgba(255,255,255,.5)', 400);
  toast('Progress wiped. Fresh start on ' + planetName(0) + '.');
}
