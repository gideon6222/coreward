import * as THREE from 'three';
import { W, HULL_MAX, DEF, START_X, SAVE_KEY, OLD_KEY, coreDepth, planetName, valueMult } from './config';
import { clamp, key } from './util';
import { g, S, save } from './state';
import { haulValue, findRoute } from './world';
import { R } from './runtime';
import { lamp } from './scene';
import { worldX } from './materials';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { spray } from './particles';
import { ui, toast, flash, atSurface } from './ui';
import { sfx } from './audio';
import { SHAKE_TOW, SHAKE_BOOM } from './feel';

export function sell() {
  const v = haulValue();
  if (v <= 0) { g.cargo = {}; g.weight = 0; return; }
  g.credits += v;
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
  syncBlocks(true);
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
      'Total shards: ' + g.shards + '. Next stop: ' + planetName(next) + ', where the crust is tougher and the veins run richer.',
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
