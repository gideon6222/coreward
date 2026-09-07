/* Boot. Every imported module's top-level setup runs before this file's
   body, which is what the single-file version got for free by being written
   top to bottom. */
import { HULL_MAX } from './config';
import { g, S, save, load } from './state';
import { camera, lamp, resize } from './scene';
import { syncBlocks } from './blocks';
import { el, updateHUD, audioLabels } from './ui';
import { frame } from './loop';
import { sfx } from './audio';
import './input';

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
g.hull = HULL_MAX;
camera.position.set(0, -g.pd - 0.8, 13);
resize();
syncBlocks(true);
audioLabels();
updateHUD();
stampBuild();
document.getElementById('boot')!.classList.add('hidden');
window.addEventListener('visibilitychange', () => { save(); if (document.hidden) sfx.digStop(); });
setInterval(save, 5000);
requestAnimationFrame(frame);
