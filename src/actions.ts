import * as THREE from 'three';
import { W, HULL_MAX, DEF, isOre, START_X, SAVE_KEY, OLD_KEY, SUPPLY_OF, PATCH_HULL, CELL_FUEL, RUBBLE, tremorCells, DROP_MIN_VALUE, GAS_HULL_DAMAGE, GAS_SOAK, BOMB_CHARGE, LASER_CHARGE, coreDepth, planetName, traitOf, valueMult, OVERDRIVE_SECS, OVERDRIVE_MULT, BULWARK_HITS, PULSE_SECS, tremorDepth, UPGRADES, costOf } from './sim/config';
import { clamp, key, stream } from './sim/util';
import { FIND_OF } from './sim/finds';
import { hap } from './haptics';
import { regionName } from './sim/region';
import { anchorAt } from './sim/vaults';
import { wake } from './sim/unrest';
import { vaultOpen } from './sim/vaults';
import { g, S, save, coreM, worldTrait, resetGround, cutGround, padFuel, salePayout, addMark, resetSeen, revealVault } from './sim/state';
import { blockAt, haulValue, findRoute, planCollapse, cachePrize, findHere } from './sim/world';
import { R } from './sim/runtime';
import { lamp } from './scene';
import { worldX } from './materials';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { resetLight } from './lightmap';
import { spray } from './particles';
import { takeDrop, syncDrops, leaveDrop } from './drops';
import { fireBeam } from './beam';
import { setMark } from './mark';
import { setDrillTier, setUpgradeHardware } from './ship';
import { ui, toast, flash, atSurface, updateKit, foundBanner, updateHUD } from './ui';
import { sfx } from './audio';
import { SHAKE_TOW, SHAKE_BOOM, CHARGE_MAX } from './sim/feel';
import type { Dir, SupplyKey, UpgradeKey } from './types';
import { mergeLog, blankLog } from './sim/telemetry';

/* Stop drilling, and remember how far through the block you were.

   Called from every path that interrupts a dig - releasing the direction,
   turning to another cell, an autopilot launch, a tow, a planet break. The
   rock keeps the damage, so coming back finishes it off rather than starting
   again. That is the difference between a wall you can probe and one you have
   to commit to in a single go.

   Lives here rather than in loop.ts because loop.ts already imports this
   module, and goSurface() and autopilot() below both need it. */
/* An IMPACT - gas, rockfall, anything sudden - against the Bulwark Field.

   Returns the damage that actually lands. Counting impacts rather than running
   a timer is the whole design of the field: heat soak is a drain, not a hit,
   and a timed shield would be eaten by it in a second and never be there for
   the thing it exists to stop.

   One function so both gas paths agree. They did not used to - the ordnance
   path and the drilling path each applied their own gas damage, which is fine
   while there is nothing to consult and two places to update the moment there
   is. */
export function absorb(dmg: number): number {
  if (R.bulwark <= 0) return dmg;
  R.bulwark--;
  flash('rgba(150,210,255,.4)', 260);
  toast('Bulwark absorbed it · ' + R.bulwark + ' left');
  sfx.supply();
  return 0;
}

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
  /* The ground's own trait and the clean-run bonus come out of the price
     before the assay relics add theirs. */
  const paid = Math.round(salePayout(v) * S.saleBonus());
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
  hap.buy();
  toast(debrief(paid));
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
  g.fuel = padFuel(); g.hull = S.hullCap(); g.soak = 0; g.charge = CHARGE_MAX;
  R.hullCause = 'heat';
  R.wasHot = false;
  R.tremorT = 0; R.tremorWarn = 0;
  /* The timed consumables end with the descent they were spent on. */
  R.odT = 0; R.pulseT = 0; R.bulwark = 0;
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
    if (g.hull >= S.hullCap() - 0.5) { toast('Hull is already sound'); return; }
    g.hull = Math.min(S.hullCap(), g.hull + PATCH_HULL);
    flash('rgba(255,120,140,.22)', 300);
    toast('Hull patched · +' + PATCH_HULL);
  } else if (k === 'cell') {
    if (g.fuel >= S.fuelCap() - 0.5) { toast('Tank is already full'); return; }
    g.fuel = Math.min(S.fuelCap(), g.fuel + CELL_FUEL);
    flash('rgba(120,255,180,.22)', 300);
    toast('Fuel cell burned · +' + CELL_FUEL);
  } else if (k === 'overdrive') {
    /* Refuses to stack rather than refreshing. Refreshing would make holding
       two the same as holding one long window, which quietly removes the
       decision about when to spend the second. */
    if (R.odT > 0) { toast('Overdrive is already running'); return; }
    R.odT = OVERDRIVE_SECS;
    flash('rgba(255,190,80,.24)', 340);
    toast('Overdrive · ' + OVERDRIVE_MULT + 'x drill for ' + OVERDRIVE_SECS + ' s');
  } else if (k === 'bulwark') {
    if (R.bulwark > 0) { toast('The field is already up'); return; }
    R.bulwark = BULWARK_HITS;
    flash('rgba(150,210,255,.26)', 340);
    toast('Bulwark field up · absorbs ' + BULWARK_HITS + ' impacts');
  } else {
    if (R.pulseT > 0) { toast('A pulse is already live'); return; }
    R.pulseT = PULSE_SECS;
    flash('rgba(190,140,255,.26)', 380);
    toast('Survey pulse · every vein for ' + PULSE_SECS + ' s');
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
  /* Seeded, not Math.random. INDEX.md: nothing that affects state rolls an
     unseeded die, and a collapse decides whether the way out is still open -
     which made it the one event in the game a replay could not reproduce. */
  const taken = planCollapse(tremorCells(g.pd, g.planet), stream(R.tremorN++, Math.round(g.pd), g.planet + 211));
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
  /* The cell you are standing in, and then anything the Salvage Magnet
     reaches.

     A radius, not a vacuum: you still have to fly back to the neighbourhood of
     what you dropped, it just no longer has to be cell-exact. The minute spent
     lining up on a single cell of ore you already paid to cut is the least
     interesting minute in the game, and it is not a decision - which is the
     test for whether removing something is a loss. */
  const cx = Math.round(g.px), cd = Math.round(g.pd);
  if (!pickAt(cx, cd)) { /* nothing here; the magnet may still find some */ }

  const r = S.magnetR();
  if (r <= 0) return;
  const ri = Math.ceil(r);
  for (let dx = -ri; dx <= ri; dx++) {
    for (let dd = -ri; dd <= ri; dd++) {
      if (dx === 0 && dd === 0) continue;
      if (Math.hypot(dx, dd) > r) continue;
      pickAt(cx + dx, cd + dd);
    }
  }
}

/* Take the drop in one cell, if there is one and it fits. Returns whether it
   did, so the caller can tell "nothing there" from "hold is full". */
function pickAt(x: number, d: number): boolean {
  const id = g.drops[key(x, d)];
  if (!id) return false;
  const def = DEF[id];
  if (!def) { takeDrop(x, d); return false; }
  if (g.weight + def.wt > S.cargoCap()) return false;
  takeDrop(x, d);
  g.cargo[id] = (g.cargo[id] || 0) + 1;
  g.weight += def.wt;
  sfx.collect(isOre(def) ? def.tone : 1);
  spray(worldX(x), -d, def.color, 14, 3, 0.5);
  save();
  return true;
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
    if (x < 0 || x >= W || d < 0 || d > coreM()) continue;
    const b = blockAt(x, d);
    if (!b || b.hard === Infinity || b.core) continue;

    g.dug.add(key(x, d));
    cutGround(x, d);
    dropBlock(key(x, d));
    spray(worldX(x), -d, b.color, b.ore ? 26 : 12, 5, 0.7);

    if (b.hazard) {
      gassed++;
      g.hull -= absorb(Math.round(GAS_HULL_DAMAGE * (worldTrait().gasDamage || 1)));
      g.soak = Math.min(1, g.soak + GAS_SOAK);
      R.hullCause = 'gas';
    } else if (b.find) {
      const f = findHere(x, d);
      if (f) grantFind(f.key, x, d);
    } else if (b.cache) {
      grantCache(x, d);
    } else if (b.spoil) {
      /* Cut stone, blown open rather than drilled. Same rule: nothing in the
         hold, and no id that the manifest cannot look up. */
    } else if (g.weight + b.wt <= S.cargoCap()) {
      g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
      g.weight += b.wt;
      taken++;
    } else if (b.value >= DROP_MIN_VALUE && leaveDrop(x, d, b.id)) {
      dropped++;
    }
  }
  syncBlocks(true);
  /* One blast is one quake however many cells it took, or a bomb through the
     deep rock would fire three in a row and read as a bug. */
  save();
  return { taken, dropped, gassed };
}

/* A sealed crate, opened.

   Here rather than in the frame loop for exactly the reason `grantCache` is:
   ordnance breaks cells too, and a charge that silently deleted the one crate
   on the world carrying the Cutting Laser would be the worst surprise in the
   game. One routine, both callers.

   THE DEVICE ARRIVES AT LEVEL ONE, free. That is the pay for the dig, and it
   is what makes `effect(1)` rather than `Not installed` the first thing the
   shop row ever says about it. `Math.max` rather than assignment so opening a
   crate can never take a level off something - which it could, on a save where
   the grandfather clause put a level-three device in the list and a crate for
   it is still in the ground on the world you were already on. */
export function grantFind(key: UpgradeKey, x: number, d: number) {
  if (!g.found.includes(key)) g.found.push(key);
  addMark('f', x, d);
  g.up[key] = Math.max(g.up[key] || 0, 1);
  const u = UPGRADES.find((x) => x.key === key);
  const f = FIND_OF[key];
  foundBanner(u ? u.name : key, f ? f.blurb : '');
  sfx.relic();
  hap.boom();
}

/* Pulled out of the frame loop so ordnance can open a cache too - a bomb that
   silently destroyed one would be the worst possible surprise. */
export function grantCache(x: number, d: number) {
  const p = cachePrize(x, d);
  addMark('c', x, d);
  if (p.kind === 'supply') {
    const sup = SUPPLY_OF[p.id];
    g.kit[p.id] = Math.min(sup.max, g.kit[p.id] + 1);
    R.run.supBought++;
    /* The first one of its kind gets the banner rather than the toast.

       A cache handing over a second Fuel Cell is a small good thing and a line
       of text is the right size for it. A cache handing over a Bulwark Field
       you have never seen changes what the Outfitter will sell you for the
       rest of the save, and that deserves the same card a device gets - and
       for the same reason, it does not pause. See finds.ts. */
    if (!g.foundKit.includes(p.id)) {
      g.foundKit.push(p.id);
      foundBanner(sup.name, sup.blurb, 'supply');
      hap.boom();
    } else {
      toast('Supply cache \u00b7 ' + sup.name);
    }
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

/* ---------- death ----------

   Playtest: *"I dont want towing to be a thing. if you run out of gas, you
   should game over."*

   A tow used to winch you home and take 10 to 50% of the haul as a fee. That
   is the Super Motherload panic button being handed out free, forever - the
   sequel to the game this one descends from SELLS the rescue as a premium
   one-use item, and the base game just explodes you. He is asking for the base
   game.

   WHAT IS LOST, AND WHERE THE LINE IS. The hold, the run and the ship. Nothing
   else: not a credit already banked, not an upgrade level, not a relic, not a
   drive component, not the world. That line is not caution, it is what the
   research found - across Motherload, SteamWorld Dig, Dome Keeper, Deep Rock,
   Subnautica and Barotrauma, not one game destroys its meta-progression on a
   single failed run. Permadeath modes wipe a RUN or a CHARACTER; the unlocks
   always survive. Losing the whole take is already harsher than SteamWorld Dig
   (half your gold) or Deep Rock (you keep a quarter), and it is the most a
   game with a fifteen-rung ladder can take without the ladder becoming the
   thing you are afraid to risk.

   And the consequence worth naming: THE FUEL CELL IS NOW THE PANIC BUTTON.
   Thirty-five fuel straight into the tank used to be a minor convenience. With
   no tow it is the thing that saves your life, and it is something you have to
   find before you can buy one. An existing mechanic stopped being decoration
   without a line of code. */
export function die(cause: 'fuel' | 'heat' | 'gas', after: () => void = () => {}) {
  /* Counted before anything is cleared, and it is still the number that says
     most about whether the game is priced right. */
  R.run.towed++;
  const lost = haulValue();
  g.cargo = {};
  g.weight = 0;
  sfx.alarm();
  /* Softer and shorter than the first version. The card comes up inside the
     flash, and at .55 over 900 ms a screenshot four hundred milliseconds in
     showed the death notice as pink text on pink - the flash was drowning the
     one thing the player has to read. */
  flash('rgba(255,90,60,.38)', 520);
  R.shake = Math.max(R.shake, SHAKE_BOOM);
  hap.boom();
  spray(worldX(Math.round(g.px)), -g.pd, 0xff8844, 220, 13, 2.6);
  const at = Math.round(g.pd);
  /* The ship is put back on the pad before the card, not after: the card hands
     control back to 'play' when it is dismissed, and handing it back to a ship
     that is still four hundred metres down inside solid rock is the kind of
     thing that only shows up once somebody taps CONTINUE. */
  goSurface();
  const why = cause === 'fuel'
    ? 'The tank ran dry at ' + at + ' m and the ship went down with everything in the hold.'
    : cause === 'gas'
      ? 'A gas pocket opened the hull at ' + at + ' m and the ship went down with everything in the hold.'
      : 'The heat took the hull at ' + at + ' m and the ship went down with everything in the hold.';
  showEvent('THE SHIP IS LOST',
    why + (lost > 0 ? ' That was ◈ ' + lost.toLocaleString() + ' of ore.' : '') +
    '  Everything you had already banked is still yours - the credits, the rig, '
    + 'the relics. Another hull is waiting on the pad.',
    'AGAIN', after);
  save();
}

/* The run report.

   `POLISH.md` asks for a reason to play again in five minutes, and names one:
   a run that ended one decision short. A run used to end with "Sold haul for
   X", which says what happened and nothing about what to do next.

   Three facts, in the order they matter: what it paid, how it stood against
   the record that run could have broken, and the cheapest thing you still
   cannot afford - which is the sentence that sends you back down. Deliberately
   one toast rather than a modal: a run ends every couple of minutes and a
   screen you have to dismiss that often stops being information. */
export function debrief(paid: number): string {
  const bits = ['◈ ' + paid.toLocaleString()];
  if (g.pd < g.best.depth) bits.push('best ' + g.best.depth + ' m');
  /* The nearest thing out of reach, by price, among what the shop will
     actually sell you right now. */
  let want: { name: string; short: number } | null = null;
  for (const u of UPGRADES) {
    const lvl = g.up[u.key as keyof typeof g.up] || 0;
    if (lvl >= u.max || (u.unlock || 0) > g.best.depth) continue;
    const short = costOf(u, lvl) - g.credits;
    if (short <= 0) continue;
    if (!want || short < want.short) want = { name: u.name, short };
  }
  if (want) bits.push(want.name + ' in ' + want.short.toLocaleString());
  else bits.push('everything on the shelf is affordable');
  return bits.join('  ·  ');
}

export function showEvent(title: string, bodyTxt: string, btnTxt: string, cb: () => void) {
  g.mode = 'event';
  ui.evTitle.textContent = title;
  ui.evBody.textContent = bodyTxt;
  ui.evBtn.textContent = btnTxt;
  ui.event.classList.remove('hidden');
  ui.evBtn.onclick = () => { sfx.ui(); ui.event.classList.add('hidden'); g.mode = 'play'; cb(); };
}

export function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  g.planet = 0; g.credits = 0;
  g.up = { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, scrub: 0, auto: 0, bomb: 0, laser: 0,
    hull: 0, magnet: 0, survey: 0, drone: 0, reactor: 0 };
  g.kit = { coolant: 0, patch: 0, cell: 0, overdrive: 0, bulwark: 0, pulse: 0 };
  g.stock = {};
  g.relics = []; g.relicsTaken = [];
  /* The four discovery lists, which a wipe had been quietly leaving behind.

     A button that says TAP AGAIN TO WIPE EVERYTHING and then hands the fresh
     save a shop stocked with every device the last one found is the button
     lying. `g.up` was already being zeroed, so the devices came back at tier
     zero and were still on the shelf - a fresh start that had somehow already
     done the finding. Same for the kit, the mineral reveals and the map. */
  g.found = []; g.foundKit = [];
  g.seenOre = []; g.seen = []; g.marks = [];
  resetSeen();
  /* `won` deliberately SURVIVES a reset. It is not progress, it is something
     you did, and starting another run does not undo it - which is also what
     makes a New Game Plus knowable: the intro reads this to decide whether to
     offer a skip. Wiping it here would mean a player who has beaten the game
     is treated as a first-timer by the one screen that should know better. */
  g.drops = {}; syncDrops();
  g.damage = {};
  g.dug = new Set();
  g.rubble = new Set();
  resetGround();
  g.cargo = {}; g.weight = 0;
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  /* A new planet is a different set of tunnels. Easing the old world's
     shadows into the new one's would show as light bleeding through fresh
     rock for a fifth of a second at exactly the moment the player is looking. */
  resetLight();
  lamp.distance = S.light();
  setDrillTier(0);
  setUpgradeHardware(g.up);
  goSurface();
  g.mode = 'play';
  ui.pause.classList.add('hidden');
  flash('rgba(255,255,255,.5)', 400);
  toast('Progress wiped. The planet is quiet again.');
}

/* ---------- an Anchor lights ----------

   The biggest thing that happens in this game short of losing the ship, and
   the only one that is unambiguously good. `POLISH.md`: one event, four
   channels - light, sound, shake, haptic - fired together.

   A MODAL, unlike a device find, and the difference is deliberate. A device
   banner runs itself out over four seconds while the drill keeps turning,
   because a device is a thing you are about to use. An Anchor is the objective
   moving: the Ballast is permanently stronger, a region is now on your map,
   and the machine on the pad has grown. That is worth stopping for, and it is
   the one place in the round where stopping is right.

   The wording says what changed and does NOT say how many are left. The count
   is on the panel at the pad for anybody who wants it; putting "4 of 9" in the
   moment turns a discovery into a checklist, and the research on withheld
   rules is the whole reason this round exists. */
export function anchorLit(region: number) {
  const n = g.ground.lit.length;
  /* Redraw the cell. The Anchor's BLOCK ID changes when it lights - 'anchor'
     becomes 'anchorlit' - and the instanced pools are keyed by id, so nothing
     in the world knows the cell has to move pools. Without this the monument
     stays dark until the streaming window happens to rebuild, which is when
     you cross a row - so the one thing the player is looking at is the one
     thing that does not change, and then it changes later for no reason.

     A full rebuild rather than a single instance, because moving one cell
     between two pools by hand is three more places for the pools to disagree
     with the world, and this happens nine times in a campaign. */
  const a = anchorAt(region);
  dropBlock(key(a.x, a.d));
  resetBlockCache();
  syncBlocks(true);
  const x = worldX(g.px), y = -g.pd;
  spray(x, y, 0x8fffc8, 260, 14, 2.4);
  spray(x, y, 0xffffff, 120, 20, 1.6);
  /* Short and light, because the CARD is the moment and the flash is only its
     punctuation. The first version was .40 for 900 ms and it was still washing
     the screen green when the modal was fully open and being read - a flash
     under a modal is a flash nobody wants. */
  flash('rgba(150,255,210,.26)', 480);
  R.shake = Math.max(R.shake, 0.9);
  sfx.relic();
  hap.boom();
  /* And whether that was the fifth of nine.

     Decided BEFORE the card goes up and applied after it comes down, so the
     two events are in the order the player experiences them: you lit an
     Anchor, and then the planet reacted to it. Both at once would be one
     confusing flash and two modals stacked. */
  const answered = wake(g.ground);
  /* And whether that was the ninth of nine, which opens the centre. Mutually
     exclusive with the wake by construction - five is not nine - so the two
     follow-on cards can never stack. */
  const opened = !answered && vaultOpen(g.ground.lit.length);
  if (opened) revealVault();
  showEvent('THE ANCHOR WAKES',
    regionName(region) + ' settles. The Ballast holds harder now, and the ground ' +
    'here has drawn itself onto your map.' +
    (n === 1 ? ' Whatever built these left nine of them.' : ''),
    'GO ON',
    () => {
      updateHUD();
      if (answered) planetAnswers();
      else if (opened) centreOpens();
    });
  save();
}


/* ---------- the planet answers ----------

   The fifth Anchor of nine. `unrest.ts` decides what it does to the state;
   this is the half the player experiences, and it is the one moment in the
   game where everything stops and the world talks about itself.

   HERE rather than in collapse.ts, which is where the rest of the world-change
   code lives, and for a reason worth writing down: collapse.ts would have had
   to import `showEvent` from this file, and this file would have had to import
   `planetAnswers` from that one. A cycle that happens to work because of the
   order two bindings are read is a trap for whoever moves a call next - and
   this repo has already lost an afternoon to exactly that, with the symptom
   "Cannot access 'k' before initialization" and a shop that never opened.

   The text names the ANCHORS as the cause, because the point is that the
   player did this: it is a consequence of playing well, not weather. And it
   does not say what any of the three changes are in numbers. You find out that
   Blooms exist by cutting one, and that the ground closes by coming back to a
   shaft that is not there. */
export function planetAnswers() {
  R.shake = Math.max(R.shake, 1.7);
  flash('rgba(232,198,255,.30)', 900);
  sfx.collapse();
  hap.quake();
  showEvent('THE PLANET ANSWERS',
    'Five of nine. Something under all of this has noticed, and the whole ' +
    'crust has shifted a degree - every region, at once. The ground will not ' +
    'be as you left it any more. Watch what grows in it.',
    'UNDERSTOOD',
    () => {
      /* Blooms start generating the instant this flag is set, so the window
         the player is looking at has to be rebuilt or the change arrives
         whenever they next cross a row - the same trap the Anchor's own
         re-draw was. */
      for (const k of Array.from(meshes.keys())) dropBlock(k);
      resetBlockCache();
      syncBlocks(true);
    });
  save();
}

/* ---------- the Vault ----------

   The end of the game, and the one modal in it that is allowed to be long.

   It does NOT end the session. `CRAFT.md` is firm that a game which throws you
   back to a title screen the moment you finish it takes the world away at
   exactly the moment you have earned it - and this is a world the player has
   spent an evening mapping. So the card goes up, `won` is set, the Vault opens,
   and then the game hands the planet back with everything still in it.

   `won` is the one thing a wipe deliberately does not clear. It is not
   progress, it is something you did, and the title reads it to offer a skip
   next time round. */
export function vaultReached() {
  g.won = true;
  const x = worldX(g.px), y = -g.pd;
  spray(x, y, 0xfff0b8, 420, 18, 3.2);
  spray(x, y, 0xffffff, 220, 26, 2.2);
  /* Short and light, like the Anchor's. The card is the moment; a flash still
     washing the screen while somebody is reading it is a flash nobody wants. */
  flash('rgba(255,240,184,.28)', 700);
  R.shake = Math.max(R.shake, 1.4);
  sfx.boom();
  hap.boom();
  /* Redraw: the core's block id changes, and so does every Vault seal around
     it - the same trap the Anchor's own re-draw was. */
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  syncBlocks(true);
  showEvent('THE VAULT',
    'Nine Anchors, and the centre is open. Whatever the Lattice was holding ' +
    'down has been here the whole time, and it is not finished with this ' +
    'planet - but it is quiet now, and it is quiet because of you.\n\n' +
    'The ground is yours. There is more of it than you have seen.',
    'STAY',
    () => { updateHUD(); });
  save();
}


/* The ninth Anchor. Not the ending - the ending is a place you still have to
   fly to - but the moment the map tells you where it is.

   Deliberately a card and not a toast: everything else the Anchors do is a
   quiet consequence, and this is the one that changes what you are going to do
   next. */
export function centreOpens() {
  flash('rgba(255,217,138,.30)', 800);
  R.shake = Math.max(R.shake, 1.0);
  sfx.relic();
  hap.boom();
  /* The seals around the Vault change block id when they open. */
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  syncBlocks(true);
  showEvent('THE CENTRE IS OPEN',
    'All nine. Something at the middle of the planet has stopped holding its ' +
    'door shut, and your map knows where it is now. It is a long way down.',
    'GO',
    () => { updateHUD(); });
  save();
}
