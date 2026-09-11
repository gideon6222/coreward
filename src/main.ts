/* Boot. Every imported module's top-level setup runs before this file's
   body, which is what the single-file version got for free by being written
   top to bottom. */
import * as THREE from 'three';
import { HULL_MAX, UPGRADES, SUPPLIES, ORES, shelfStock, tremorDepth, heatDepth, traitAt, W, CAVE_MIN_DEPTH } from './sim/config';
import { g, S, save, load, hasSave, coreM, padRegion, worldUnrest, markSeen } from './sim/state';
import { R } from './sim/runtime';
import { camera, lamp, resize, scene, amb, sun, rim, fog, renderer } from './scene';
import { syncBlocks, resetBlockCache } from './blocks';
import { findCells, blockAt, cachePrize, haulValue } from './sim/world';
import { regionAt, regionName, MAP_TILE, WORLD_DEPTH, REGION_COUNT } from './sim/region';
import { setMark } from './mark';
import { syncDrops } from './drops';
import { setDrillTier, setUpgradeHardware, rig, bit, player } from './ship';
import { GROUP_ORDER } from './stationsigns';
import { stationX } from './stationroom';
import { pickBay, selectBay, selectedBay, bays, kitCases, refreshKit, drawerOpen, roomDrawer,
         stationCamera, stationScene, roomReady, goAisle, stepAisle,
         currentAisle, currentGroup, aisleStocked, AISLE_COUNT } from './station';
import { el, updateHUD, audioLabels, buildShop, toast, foundBanner, buildBallast } from './ui';
import { frame, tick, advance, stopClock, startClock } from './loop';
import { installPanelGrain } from './grain';
import { buildGauges } from './gauges';
import { lmDebug, LM_COLS } from './lightmap';
import { sfx } from './audio';
import { setCoreHandler, breakCore, beginSettle, beginBreach, grantFind, grantCache } from './actions';
import { openChart, arrive, skipTransit } from './chartui';
import { openMap, closeMap, mapView, mapPan, mapSetView, draw as mapDraw } from './mapui';
import { landCollapse, closeGround } from './collapse';
import { collapseTarget, lightAnchor, WAKE_AT, isAwake } from './sim/unrest';
import { anchorAt, anchorSealed, anchorCells, ANCHOR_COUNT, vaultCells } from './sim/vaults';
import { setStartHandler, wireTitle, showTitle, showIntro, paintBeat } from './titleui';
import './input';

/* actions.ts raises "a core broke"; chartui.ts answers it. Wired here rather
   than imported directly, because chartui already imports actions and a cycle
   that works only because of when each binding is read is a trap. */
setCoreHandler(openChart);

/* ============ build stamp ============
   Vite replaces __BUILD_SHA__ and __BUILD_TIME__ at build time. This is the
   only way to tell on the phone which build is actually running: an installed
   PWA can be a load behind after a deploy, and the game itself is meant to
   look identical between builds. Open the pause menu and read the line.
   The typeof guards keep this harmless if the file is ever loaded unbuilt. */
function stampBuild() {
  const sha = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev';
  let when = 'unbuilt';
  if (typeof __BUILD_TIME__ === 'string') {
    const d = new Date(__BUILD_TIME__);
    when = isNaN(d.getTime()) ? __BUILD_TIME__ : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const node = el('build');
  if (node) node.textContent = 'build ' + sha + '  ·  ' + when;
}

/* ============ boot ============ */
load();
lamp.distance = S.light();
g.fuel = S.fuelCap();
g.hull = S.hullCap();
camera.position.set(0, -g.pd - 0.8, 13);
resize();
syncBlocks(true);
setMark(g.best.depth);
syncDrops();
setDrillTier(g.up.drill);
setUpgradeHardware(g.up);
audioLabels();
updateHUD();
stampBuild();
/* Before the boot overlay lifts, so no frame is ever drawn with bare panels. */
installPanelGrain();
/* Ticks and needle handles, before updateHUD() first writes to them. */
buildGauges();
document.getElementById('boot')!.classList.add('hidden');

/* ============ the way in ============

   The game used to boot straight into a ship on a pad. It still does all of
   the setup above first - the world is built, the ship is dressed, the HUD is
   written - so whichever screen goes in front of it is standing over a game
   that is ready to run, and starting is a matter of hiding a div rather than
   of loading anything.

   First run gets the intro; a returning player gets the title. `hasSave()` is
   asked rather than a flag of our own, because "has this player been here"
   and "is there something to continue" are the same question and keeping them
   as one is what stops a CONTINUE button that continues nothing. */
setStartHandler((fresh: boolean) => {
  if (fresh) {
    /* hardReset() already put the state back; this re-reads it into everything
       downstream that caches a derived value. */
    lamp.distance = S.light();
    setDrillTier(g.up.drill);
    setUpgradeHardware(g.up);
    setMark(g.best.depth);
    syncBlocks(true);
  }
  g.fuel = S.fuelCap();
  g.hull = S.hullCap();
  /* The flight ends above the pad and the ship comes down the last few metres
     under its own thrust - but ONLY if the pad is where it belongs.

     A save can be mid-run: quit at ninety metres with a full hold and CONTINUE
     has to put you back at ninety metres. Settling unconditionally moved that
     ship to the surface, which loses the player's position and is worse than
     that - it makes quitting and reloading a free ride home with the cargo,
     which is the trip the whole game is about making. */
  if (g.pd <= 0.5) beginSettle();
  else g.mode = 'play';
  updateHUD();
  /* Tow Insurance was deleted this version and its cost refunded during
     `load()`, which runs before there is a HUD to say so on. Said here, once
     the game is actually in front of somebody, because money appearing in your
     account with no explanation is worse than the upgrade disappearing. */
  if (R.refund > 0) {
    toast('Tow Insurance is gone · ◈ ' + R.refund.toLocaleString() + ' refunded');
    R.refund = 0;
  }
  save();
});
wireTitle();
if (hasSave()) showTitle(); else showIntro();

window.addEventListener('visibilitychange', () => { save(); if (document.hidden) sfx.digStop(); });
setInterval(save, 5000);
requestAnimationFrame(frame);

/* ============ the headless seam ============
   Behind ?debug, so nothing here exists in a normal load.

   The loop splits into frame(), which asks what time it is, and tick(), which
   takes a delta and does the work. Exposing the second one means a whole run
   compresses into `advance(56)` - deterministically, and far faster than real
   time, because a fixed step does not depend on how quickly the machine booted
   the bundle and only the last step renders.

   Without this, every balance number past the shallow game has to be reached by
   holding a d-pad in a real browser for as long as it would actually take, which
   is why the deep content is still the least tested part of the game.

   The state objects come too. A test that reads the HUD is asserting on a
   rounded string in a formatter, which is a different claim from the one it
   usually means to make: DEPTH 0 m is true at pd 0.0 and at pd 0.49. */
if (new URLSearchParams(location.search).has('debug')) {
  (window as unknown as { __cw: unknown }).__cw = {
    tick, advance, stopClock, startClock, g, S, R, save, markSeen,
    /* The renderer's own handles, for tuning an art pass live. Every lighting
       value in feel.ts was set by eye, and setting one by eye through a
       rebuild-and-reload cycle is how an afternoon disappears. */
    scene, camera, lamp, amb, sun, rim, fog, renderer, lmDebug,
    setDrillTier, setUpgradeHardware,
    /* The chart and the crossing. Reached through here rather than by
       importing the module in a test: under the dev server a dynamic import
       resolves to a different module instance than the one main.ts wired up,
       so `breakCore` imported that way calls a handler that was never set and
       the game sits in 'boom' forever. Through the seam it is the same
       instance the game is running. */
    breakCore, openChart, arrive, skipTransit,
    showTitle, showIntro,
    /* Jump the intro to a beat and repaint it. Through the seam and not a
       dynamic import, because under the dev server an import() resolves to a
       different module instance than the one the loop is running - the same
       trap that made breakCore sit in 'boom' forever. */
    introTo: (i: number) => {
      showIntro();
      if (R.intro) { R.intro.i = i; R.intro.t = 0; }
      paintBeat();
    },
    pickBay, selectBay, selectedBay, bays, stationCamera, roomReady,
    /* The aisles, so a smoke test can drive the shop the way a thumb does. */
    goAisle, stepAisle, currentAisle, currentGroup, aisleStocked, AISLE_COUNT,
    /* The scene itself, so the framing harness can project a world position
       into screen pixels and count the lights that are actually in it. */
    stationScene,
    /* Which aisle a given upgrade lives in, so a test can walk there rather
       than hard-coding a department that the layout may later move it out of. */
    aisleOf: (k: string) => {
      const u = UPGRADES.find((x) => x.key === k);
      return u ? GROUP_ORDER.indexOf(u.group as never) + 1 : -1;
    },
    upgradeOf: (k: string) => UPGRADES.find((x) => x.key === k) || null,
    stationXOf: stationX,
    grantFind, buildShop, buildBallast,
    /* Constructors, so a spec can build a Box3 or a Vector3 without importing
       three itself - under the dev server an import() resolves to a different
       module instance than the one the loop is running, which is the trap this
       whole seam exists to avoid. */
    Box3Ctor: THREE.Box3, Vec3Ctor: THREE.Vector3, LM_COLS,
    /* What is buried on this world, so a test can dig up the real crate rather
       than a cell it picked out of the air. */
    findCells, blockAt,
    drawerOpen, roomDrawer, kitCases, refreshKit,
    /* So a spec can open a cache the way the drill does, and ask what a given
       cell would pay before it opens one. */
    cachePrize, grantCache, haulValue, ORES, foundBanner,
    /* The danger lines, so a fixture can dig to one instead of to a literal
       depth that meant something in a world this no longer is. */
    tremorDepth, heatDepth, regionAt, traitAt, regionName, W, CAVE_MIN_DEPTH,
    /* So a test can assert one case per upgrade against the real number
       rather than against a literal that goes stale. */
    upgradeCount: UPGRADES.length, supplyCount: SUPPLIES.length,
    /* What is actually on the shelf right now, so a test can ask for "the
       sealed case" rather than naming one that may not be stocked. */
    /* Force a full terrain rebuild - for looking at a world's ground without
       flying to it. */
    resetBlocks: () => { resetBlockCache(); syncBlocks(true); },
    /* The breach, so the filmstrip can start one without having to drill a
       whole world first. coreM is here for the same reason: every fixture that
       used to write a literal depth is now written against the world. */
    beginBreach, coreM,
    /* The ship's own objects, for measuring which way the drill actually
       points rather than reasoning about Euler order. Two "fixes" to the
       intro's heading were argued from the code and both were wrong. */
    rig, bit, player,
    shelfKeys: () => shelfStock(g.best.depth, g.found).map((u) => u.key),
    sealedKey: () => {
      const s = shelfStock(g.best.depth, g.found).filter((u) => g.best.depth < u.unlock);
      return s.length ? s[0].key : null;
    },
    /* The map. `mapView` and `mapPan` rather than the canvas, because the one
       part of that screen that can silently be wrong is the panning arithmetic
       - backwards, or unclamped off either end of the world. */
    openMap, closeMap, mapView, mapPan, mapSetView, mapDraw, MAP_TILE, WORLD_DEPTH,
    /* The campaign, so a spec can put the planet into a state it would take
       forty runs to reach and then check what the game does about it. */
    padRegion, worldUnrest, landCollapse, collapseTarget, REGION_COUNT,
    /* The Anchors, so a spec can fly to one rather than dig for forty minutes
       looking for it. */
    anchorAt, anchorSealed, anchorCells, ANCHOR_COUNT, vaultCells, lightAnchor, WAKE_AT, isAwake, closeGround
  };
}
