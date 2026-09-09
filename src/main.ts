/* Boot. Every imported module's top-level setup runs before this file's
   body, which is what the single-file version got for free by being written
   top to bottom. */
import { HULL_MAX, UPGRADES, SUPPLIES } from './config';
import { g, S, save, load } from './state';
import { R } from './runtime';
import { camera, lamp, resize, scene, amb, sun, rim, fog, renderer } from './scene';
import { syncBlocks } from './blocks';
import { setMark } from './mark';
import { syncDrops } from './drops';
import { setDrillTier, setUpgradeHardware } from './ship';
import { pickBay, selectBay, selectedBay, bays, stationCamera } from './station';
import { el, updateHUD, audioLabels } from './ui';
import { frame, tick, advance, stopClock } from './loop';
import { installPanelGrain } from './grain';
import { buildGauges } from './gauges';
import { lmDebug } from './lightmap';
import { sfx } from './audio';
import { setCoreHandler, breakCore } from './actions';
import { openChart, arrive, skipTransit } from './chartui';
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
    tick, advance, stopClock, g, S, R,
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
    pickBay, selectBay, selectedBay, bays, stationCamera,
    /* So a test can assert one case per upgrade against the real number
       rather than against a literal that goes stale. */
    upgradeCount: UPGRADES.length, supplyCount: SUPPLIES.length
  };
}
