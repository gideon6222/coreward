import { coreDepth, planetName, traitOf, SUPPLIES } from './config';
import { g } from './state';
import { haulValue } from './world';
import { R } from './runtime';
import { mustEl, ui, atSurface, buildShop, buildManifest, audioLabels } from './ui';
import type { Dir } from './types';
import { autopilot, hardReset, useSupply, fireBomb, fireLaser } from './actions';
import { sfx, audioInit, setAudio, audioState } from './audio';

function firstTouch() { audioInit(); }
window.addEventListener('pointerdown', firstTouch, { once: true });
window.addEventListener('keydown', firstTouch, { once: true });

document.querySelectorAll<HTMLElement>('#dpad .k').forEach((b) => {
  const dir = b.dataset.dir as Dir;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); R.held = dir; });
  const up = (e?: Event) => { if (e) e.preventDefault(); b.classList.remove('on'); if (R.held === dir) R.held = null; };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
window.addEventListener('keydown', (e) => { if (KEYS[e.key]) { R.held = KEYS[e.key]; e.preventDefault(); } });
window.addEventListener('keyup', (e) => { if (KEYS[e.key] && R.held === KEYS[e.key]) R.held = null; });

/* Supplies. pointerdown rather than click so a spend feels as immediate as a
   dig does, and preventDefault so the press cannot also scroll or select. */
for (const sup of SUPPLIES) {
  const btn = mustEl('sup' + sup.key[0].toUpperCase() + sup.key.slice(1));
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); useSupply(sup.key); });
}

/* Ordnance. Same pointerdown treatment as the supplies - a spend should feel
   as immediate as a dig - and both refuse loudly rather than silently when
   there is not enough power. */
mustEl('ordBomb').addEventListener('pointerdown', (e) => { e.preventDefault(); fireBomb(); });
mustEl('ordLaser').addEventListener('pointerdown', (e) => { e.preventDefault(); fireLaser(); });

ui.btnAuto.onclick = autopilot;
ui.btnShop.onclick = () => { if (!atSurface() || g.mode !== 'play') return; sfx.ui(); g.mode = 'shop'; buildShop(); ui.shop.classList.remove('hidden'); };
mustEl('shopClose').onclick = () => { sfx.ui(); ui.shop.classList.add('hidden'); g.mode = 'play'; };
mustEl('btnManifest').onclick = () => { if (g.mode !== 'play') return; sfx.ui(); g.mode = 'manifest'; buildManifest(); ui.manifest.classList.remove('hidden'); };
mustEl('manifestClose').onclick = () => { sfx.ui(); ui.manifest.classList.add('hidden'); g.mode = 'play'; };

ui.btnMusic.onclick = () => { audioInit(); setAudio('music', !audioState.music); audioLabels(); };
ui.btnSfx.onclick = () => { audioInit(); setAudio('sfx', !audioState.sfx); audioLabels(); sfx.ui(); };

let resetArmed = 0;
function disarmReset() {
  resetArmed = 0;
  ui.btnReset.textContent = 'RESTART PROGRESS';
  ui.btnReset.classList.remove('armed');
}
mustEl('btnPause').onclick = () => {
  if (g.mode !== 'play') return;
  sfx.ui();
  g.mode = 'pause';
  R.held = null;
  sfx.digStop();
  disarmReset();
  audioLabels();
  ui.pauseStats.innerHTML =
    '<div class="up"><div class="upinfo"><div class="upname">' + planetName(g.planet) +
    (traitOf(g.planet).id === 'stable' ? '' : ' <span class="mult">' + traitOf(g.planet).name + '</span>') + '</div>' +
    '<div class="upeff">Core at ' + coreDepth(g.planet) + ' m · you are at ' + Math.max(0, Math.round(g.pd)) + ' m</div>' +
    '<div class="upeff">' + traitOf(g.planet).blurb + '</div></div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Credits</div>' +
    '<div class="upeff">Haul aboard worth ◈ ' + haulValue().toLocaleString() + '</div></div>' +
    '<div class="val">◈ ' + Math.floor(g.credits).toLocaleString() + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Records</div>' +
    '<div class="upeff">Deepest ' + g.best.depth + ' m' +
    (g.best.haul ? ' · best haul ◈ ' + g.best.haul.toLocaleString() : '') + '</div></div>' +
    '<div class="val">' + g.best.depth + ' m</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Core Shards</div>' +
    '<div class="upeff">Planets destroyed · +' + (g.shards * 8) + '% drill power</div></div>' +
    '<div class="val">' + g.shards + '</div></div>';
  ui.pause.classList.remove('hidden');
};
mustEl('btnResume').onclick = () => { sfx.ui(); ui.pause.classList.add('hidden'); g.mode = 'play'; };
ui.btnReset.onclick = () => {
  if (resetArmed === 0) {
    resetArmed = 1;
    ui.btnReset.textContent = 'TAP AGAIN TO WIPE EVERYTHING';
    ui.btnReset.classList.add('armed');
    setTimeout(disarmReset, 4000);
    return;
  }
  hardReset();
  disarmReset();
};
document.addEventListener('contextmenu', (e) => e.preventDefault());
