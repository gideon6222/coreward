import { coreDepth, planetName, traitOf, SUPPLIES, RELIC_OF } from './config';
import { relicDistance } from './relic';
import { g , coreM, worldTrait} from './state';
import { haulValue } from './world';
import { R } from './runtime';
import { mustEl, ui, atSurface, buildShop, buildCard, buildManifest, audioLabels, buildNotes, buildRunLog } from './ui';
import { dockShip, undockShip, pickBay, selectBay, selectedBay, resizeStation } from './station';
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
ui.btnShop.onclick = () => {
  if (!atSurface() || g.mode !== 'play') return;
  sfx.ui();
  g.mode = 'shop';
  /* Move the real ship into the station scene. Nothing is copied, so the
     machine on the deck is wearing exactly the hardware it will undock with. */
  dockShip();
  document.body.classList.add('docked');
  selectBay(null);
  resizeStation();
  buildShop();
  ui.shop.classList.remove('hidden');
};
mustEl('shopClose').onclick = () => {
  sfx.ui();
  undockShip();
  document.body.classList.remove('docked');
  ui.shop.classList.add('hidden');
  g.mode = 'play';
};

/* Taps fall through the shop's transparent stage onto the bay behind it, so
   this is a raycast into the station scene rather than a click handler on a
   row. Tapping the floor deselects, because a room you cannot tap out of has
   quietly become a menu again.

   On `document` rather than on the shop element. It was on #shop and relied on
   the event bubbling up from the stage, which worked and then did not - the
   kind of thing that costs an hour and buys nothing. The id check below is what
   actually scopes this, so where it is listening does not need to be clever. */
document.addEventListener('pointerdown', (e) => {
  if (g.mode !== 'shop') return;
  const t = e.target as HTMLElement;
  /* only taps that landed on the stage itself, not on the tray or the header */
  if (t.id !== 'shop' && t.id !== 'shopStage' && t.id !== 'shopHint') return;
  const hit = pickBay(e.clientX, e.clientY);
  if (hit === selectedBay()) return;
  selectBay(hit);
  if (hit) sfx.ui();
  buildCard();
});
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
  buildNotes();
  ui.pauseStats.innerHTML =
    '<div class="up"><div class="upinfo"><div class="upname">' + planetName(g.world) +
    (worldTrait().id === 'stable' ? '' : ' <span class="mult">' + worldTrait().name + '</span>') + '</div>' +
    '<div class="upeff">Core at ' + coreM() + ' m · you are at ' + Math.max(0, Math.round(g.pd)) + ' m</div>' +
    '<div class="upeff">' + worldTrait().blurb + '</div></div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Credits</div>' +
    '<div class="upeff">Haul aboard worth ◈ ' + haulValue().toLocaleString() + '</div></div>' +
    '<div class="val">◈ ' + Math.floor(g.credits).toLocaleString() + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Relics</div>' +
    '<div class="upeff">' + (g.relics.length
      ? g.relics.map((r) => RELIC_OF[r] ? RELIC_OF[r].name : r).join(' · ')
      : 'One is buried on every planet, below the halfway mark. Nothing marks it.') +
    '</div>' +
    (relicDistance() === null
      ? '<div class="upeff">Recovered on ' + planetName(g.world) + '.</div>'
      : '<div class="upeff">Still in the ground here.</div>') + '</div>' +
    '<div class="val">' + g.relics.length + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Records</div>' +
    '<div class="upeff">Deepest ' + g.best.depth + ' m' +
    (g.best.haul ? ' · best haul ◈ ' + g.best.haul.toLocaleString() : '') + '</div></div>' +
    '<div class="val">' + g.best.depth + ' m</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Core Shards</div>' +
    '<div class="upeff">Planets destroyed · +' + (g.shards * 8) + '% drill power</div></div>' +
    '<div class="val">' + g.shards + '</div></div>';
  ui.pause.classList.remove('hidden');
};
ui.btnNotes.onclick = () => {
  sfx.ui();
  ui.runlog.classList.add('hidden');
  ui.btnLog.textContent = 'RUN LOG';
  const open = ui.notes.classList.toggle('hidden');
  ui.btnNotes.textContent = open ? "WHAT'S NEW" : 'HIDE';
};

/* Built on the click, never while the game is running. The two panels close
   each other because the pause sheet is already the tallest thing in the game
   and two open lists inside one scroll region is how the shop's shelves got
   clipped at the fold. */
ui.btnLog.onclick = () => {
  sfx.ui();
  ui.notes.classList.add('hidden');
  ui.btnNotes.textContent = "WHAT'S NEW";
  const closed = ui.runlog.classList.contains('hidden');
  if (closed) buildRunLog();
  ui.runlog.classList.toggle('hidden', !closed);
  ui.btnLog.textContent = closed ? 'HIDE' : 'RUN LOG';
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

/* The station has its own camera, so it needs its own aspect update. Hooked
   here rather than inside scene.ts's resize(), because scene.ts is imported BY
   station.ts and the reverse import would be a cycle. */
window.addEventListener('resize', resizeStation);
