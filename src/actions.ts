import * as THREE from 'three';
import { W, HULL_MAX, DEF, isOre, START_X, SAVE_KEY, OLD_KEY, SUPPLY_OF,
         PATCH_HULL, CELL_FUEL, RUBBLE, tremorCells, DROP_MIN_VALUE,
         GAS_HULL_DAMAGE, GAS_SOAK, BOMB_CHARGE, LASER_CHARGE,
         coreDepth, planetName, traitOf, valueMult } from './config';
import { clamp, key } from './util';
import { g, S, save } from './state';
import { blockAt, haulValue, findRoute, planCollapse, cachePrize } from './world';
import { R } from './runtime';
import { lamp } from './scene';
import { worldX } from './materials';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { spray } from './particles';
import { takeDrop, syncDrops, leaveDrop } from './drops';
import { fireBeam } from './beam';
import { setMark } from './mark';
import { setDrillTier } from './ship';
import { ui, toast, flash, atSurface, updateKit } from './ui';
import { sfx } from './audio';
import { SHAKE_TOW, SHAKE_BOOM, CHARGE_MAX } from './feel';
import type { Dir, SupplyKey } from './types';
import { mergeLog, blankLog } from './telemetry';

/* Stop drilling, and remember how far through the block you were.

   Called from every path that interrupts a dig - releasing the direction,
   turning to another cell, an autopilot launch, a tow, a planet break. The
   rock keeps the damage, so coming back finishes it off rather than starting
   again. That is the difference between a wall you can probe and one you have
   to commit to in a single go.

   Lives here rather than in loop.ts because loop.ts already imports this
   module, and goSurface() and autopilot() below both need it. */
export function stopDigging() {
  if (!R.digging) return;
  const done = clamp(R.digging.t / R.digging.total, 0, 1);
  /* Below a couple of per cent there is nothing to see on the rock face, and
     recording it would fill the save with cells nobody touched. */
  if (done > 0.02) g.damage[key(R.digging.x, R.digging.d)] = done;
  R.digging = null;
  sfx.digStop();
}

export function sell() {
  const v = haulValue();
  if (v <= 0) { g.cargo = {}; g.weight = 0; return; }
  const paid = Math.round(v * S.saleBonus());
  g.credits += paid;
  /* A run ends when it is banked. Fold it into the all-time totals and start a
     fresh one, so "this run" in the log means what a player means by it. */
  R.run.earned += paid;
  R.run.runs++;
  mergeLog(g.log, R.run);
  R.run = blankLog();
  /* A best haul is worth calling out because it is the only feedback that
     says a RUN went well, as opposed to a block being valuable. The first
     sale of a save is not a record, it is just the first sale. */
  if (v > g.best.haul) {
    const first = g.best.haul === 0;
    g.best.haul = v;
    if (!first) { toast('Best haul yet · ◈ ' + v.toLocaleString()); sfx.record(); }
  }
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
  /* Banked before the ship is moved, so a tow out of a half-cut block leaves
     the damage on the rock rather than throwing it away. */
  stopDigging();
  /* Freeze the marker at the record as it stands now, before the next descent
     starts pushing it deeper. */
  setMark(g.best.depth);
  g.px = START_X; g.pd = -1; g.face = 'down';
  R.warnedFull = false;
  R.vx = 0; R.vy = 0; R.flight = null;
  /* landing on the pad must not re-trigger the sale that just happened */
  R.wasAtSurface = true;
  g.fuel = S.fuelCap(); g.hull = HULL_MAX; g.soak = 0; g.charge = CHARGE_MAX;
  R.hullCause = 'heat';
  R.wasHot = false;
  R.tremorT = 0; R.tremorWarn = 0;
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
  R.run.supUsed++;
  R.shake = Math.max(R.shake, 0.22);
  sfx.supply();
  updateKit();
  save();
}

/* A tremor: choose and apply the collapse in world.ts, then show it.

   Everything load-bearing - which cells, and the guarantee that the ship can
   still reach the pad afterwards - is in planCollapse() so it can be tested
   without a renderer. What is left here is dust and bookkeeping. */
export function tremor(): number {
  const taken = planCollapse(tremorCells(g.pd));
  if (!taken.length) return 0;
  syncBlocks(true);
  for (const k of taken) {
    const c = k.split(',');
    spray(worldX(+c[0]), -(+c[1]), RUBBLE.color, 16, 4.5, 1.1);
  }
  save();
  return taken.length;
}

/* Fly through your own leavings to pick them up.

   Called on arrival at a cell rather than continuously, because a drop lives
   at a cell and the ship moves cell to cell - there is no in-between state
   where a partial overlap would mean anything. */
export function collectHere() {
  const id = g.drops[key(Math.round(g.px), Math.round(g.pd))];
  if (!id) return;
  const def = DEF[id];
  if (!def) { takeDrop(g.px, g.pd); return; }
  if (g.weight + def.wt > S.cargoCap()) return;
  takeDrop(g.px, g.pd);
  g.cargo[id] = (g.cargo[id] || 0) + 1;
  g.weight += def.wt;
  sfx.collect(isOre(def) ? def.tone : 1);
  spray(worldX(Math.round(g.px)), -Math.round(g.pd), def.color, 14, 3, 0.5);
  save();
}

/* ---------- ordnance ----------

   One routine breaks a list of cells; the two abilities differ only in which
   list they hand it. Everything that makes breaking a block complicated -
   hazards, caches, a full hold, spoil - already had a home in the frame loop
   for the ONE cell being drilled, and this is the same rules applied to many
   at once rather than a second set of them.

   Two cells it refuses outright: bedrock, which is unbreakable everywhere, and
   the planet core, which is the climax of a planet and has to be drilled by
   hand rather than deleted from four metres away. */
function breakCells(cells: number[][]) {
  let taken = 0, dropped = 0, gassed = 0;
  for (const c of cells) {
    const x = c[0], d = c[1];
    if (x < 0 || x >= W || d < 0 || d > coreDepth(g.planet)) continue;
    const b = blockAt(x, d);
    if (!b || b.hard === Infinity || b.core) continue;

    g.dug.add(key(x, d));
    dropBlock(key(x, d));
    spray(worldX(x), -d, b.color, b.ore ? 26 : 12, 5, 0.7);

    if (b.hazard) {
      gassed++;
      g.hull -= Math.round(GAS_HULL_DAMAGE * (traitOf(g.planet).gasDamage || 1));
      g.soak = Math.min(1, g.soak + GAS_SOAK);
      R.hullCause = 'gas';
    } else if (b.cache) {
      grantCache(x, d);
    } else if (g.weight + b.wt <= S.cargoCap()) {
      g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
      g.weight += b.wt;
      taken++;
    } else if (b.value >= DROP_MIN_VALUE && leaveDrop(x, d, b.id)) {
      dropped++;
    }
  }
  syncBlocks(true);
  save();
  return { taken, dropped, gassed };
}

/* Pulled out of the frame loop so ordnance can open a cache too - a bomb that
   silently destroyed one would be the worst possible surprise. */
export function grantCache(x: number, d: number) {
  const p = cachePrize(x, d);
  if (p.kind === 'supply') {
    const sup = SUPPLY_OF[p.id];
    g.kit[p.id] = Math.min(sup.max, g.kit[p.id] + 1);
    R.run.supBought++;
    toast('Supply cache \u00b7 ' + sup.name);
  } else if (p.kind === 'mineral') {
    g.stock[p.id] = (g.stock[p.id] || 0) + p.n;
    toast('Supply cache \u00b7 ' + p.n + ' ' + DEF[p.id].name);
  } else {
    g.credits += p.n;
    toast('Supply cache \u00b7 \u25c8 ' + p.n.toLocaleString());
  }
  sfx.cache();
}

/* The unit vector for a facing. Duplicated from loop.ts rather than imported,
   because loop.ts already imports this module and a cycle that only works
   because of when each binding happens to be read is a trap waiting for the
   next person who moves a call. Four pairs of numbers is a cheaper price. */
const FACE_VEC: Record<Dir, number[]> =
  { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

function spend(cost: number, need: string) {
  if (g.mode !== 'play' || atSurface()) return false;
  if (g.charge < cost) { toast('Not enough power \u00b7 ' + need); return false; }
  g.charge -= cost;
  return true;
}

export function fireBomb() {
  if (g.up.bomb === 0) return;
  if (!spend(BOMB_CHARGE, BOMB_CHARGE + ' cells needed')) return;
  const v = FACE_VEC[g.face];
  const t = { x: Math.round(g.px) + v[0], d: Math.round(g.pd) + v[1] };
  const r = S.bombR();
  const cells: number[][] = [];
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++)
      if (Math.abs(dx) + Math.abs(dy) <= r) cells.push([t.x + dx, t.d + dy]);

  const out = breakCells(cells);
  R.run.bombFired++; R.run.ordBlocks += out.taken; R.run.powerSpent += BOMB_CHARGE;
  R.shake = Math.max(R.shake, 1.0);
  flash('rgba(255,190,90,.30)', 420);
  sfx.bomb();
  toast(out.gassed ? 'Charge fired \u00b7 gas! Hull hit' : 'Charge fired');
}

export function fireLaser() {
  if (g.up.laser === 0) return;
  if (!spend(LASER_CHARGE, LASER_CHARGE + ' cell needed')) return;
  const v = FACE_VEC[g.face];
  const sx = Math.round(g.px), sd = Math.round(g.pd);
  const cells: number[][] = [];
  for (let i = 1; i <= S.laserLen(); i++) cells.push([sx + v[0] * i, sd + v[1] * i]);

  const out = breakCells(cells);
  R.run.laserFired++; R.run.ordBlocks += out.taken; R.run.powerSpent += LASER_CHARGE;
  R.shake = Math.max(R.shake, 0.45);
  flash('rgba(120,230,255,.22)', 300);
  sfx.laser();
  fireBeam(sx, sd, v[0], v[1], S.laserLen());
  toast(out.gassed ? 'Laser \u00b7 gas! Hull hit' : 'Laser fired');
}

export function autopilot() {
  if (g.up.auto === 0 || atSurface() || g.mode !== 'play') return;
  const cost = Math.ceil(g.pd * S.autoRate());
  if (g.fuel < cost) { toast('Autopilot needs ' + cost + ' fuel'); return; }
  const route = findRoute();
  if (!route) { toast('No clear tunnel back to the pad'); return; }
  g.fuel -= cost;
  R.run.autoUsed++;
  const pts3 = route.map((p) => new THREE.Vector3(worldX(p[0]), -p[1], 0));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
  const len = curve.getLength();
  const cruise = clamp(len / 4.2, 8, 26);
  R.flight = { curve: curve, len: len, u: 0, dur: len / cruise, t: 0, last: pts3[0].clone() };
  stopDigging();
  R.vx = 0; R.vy = 0; R.held = null;
  sfx.thrust();
  g.mode = 'fly';
  toast('Autopilot engaged · ' + route.length + ' m of tunnel');
}

export function tow(reason: string) {
  /* A tow ends the run too, and it is the outcome most worth counting: the
     share of runs that end this way is the clearest read there is on whether
     fuel and hull are priced right. Counted here rather than in sell(), which
     is called afterwards on whatever the tow left aboard. */
  R.run.towed++;
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
        g.rubble = new Set();
        /* Cell keys carry no planet, so every per-cell map has to be cleared
           together or the new world inherits the old one's holes. */
        g.damage = {};
        g.drops = {}; syncDrops();
        for (const k of Array.from(meshes.keys())) dropBlock(k);
        goSurface();
        save();
      });
  }, 1700);
}

export function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  g.planet = 0; g.credits = 0; g.shards = 0;
  g.up = { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0, bomb: 0, laser: 0 };
  g.kit = { coolant: 0, patch: 0, cell: 0 };
  g.stock = {};
  g.relics = []; g.relicsTaken = [];
  g.drops = {}; syncDrops();
  g.damage = {};
  g.dug = new Set();
  g.rubble = new Set();
  g.cargo = {}; g.weight = 0;
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  lamp.distance = S.light();
  setDrillTier(0);
  goSurface();
  g.mode = 'play';
  ui.pause.classList.add('hidden');
  flash('rgba(255,255,255,.5)', 400);
  toast('Progress wiped. Fresh start on ' + planetName(0) + '.');
}
