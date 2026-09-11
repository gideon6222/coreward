import { hap, haptics, setHaptics } from './haptics';
import { coreDepth, planetName, traitOf, SUPPLIES, RELIC_OF } from './sim/config';
import { atTitle, showTitle } from './titleui';
import { relicDistance } from './relic';

/* mm:ss for the fastest-core record. Anything over an hour reads as hours, and
   nothing in this game should ever reach that. */
function fmtTime(secs: number) {
  const m = Math.floor(secs / 60), r = secs % 60;
  return m + ':' + String(r).padStart(2, '0');
}
import { g , coreM, worldTrait} from './sim/state';
import { haulValue } from './sim/world';
import { R } from './sim/runtime';
import { mustEl, ui, atSurface, buildShop, buildCard, buildManifest, audioLabels, buildNotes, buildRunLog } from './ui';
import { dockShip, undockShip, pickBay, selectBay, selectedBay, resizeStation,
         stepAisle, paintAisleBar, markSeen } from './station';
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
  buildShop();
  /* Un-hidden BEFORE the camera is framed, and that order is load-bearing.

     The framing measures the tray and the bars to find the band of screen the
     player can actually see, and a `display:none` subtree measures zero on
     every axis. Called the other way round it silently fell back to "the band
     is the whole screen" on every single open. */
  ui.shop.classList.remove('hidden');
  resizeStation();
};
mustEl('shopClose').onclick = () => {
  sfx.ui();
  /* What has been seen is settled on the way OUT, not on the way in. Marking
     it at the door would fire the "open on the new aisle" beat and then
     immediately forget it had, so a player who docked and undocked without
     looking would never get the reveal at all. */
  markSeen();
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
/* ---------- walking the aisles ----------

   Three ways in, and that is the point rather than belt and braces. The
   research is blunt about gesture-only navigation: hidden affordances cost
   about 21% of task completion and roughly half the discoverability, and this
   room has already shipped one control that looked tappable and did nothing.
   So the arrows are the real control, the dots say where you are, and the
   swipe is the one that feels good once you have found it.

   The threshold is 42 px and the vertical guard is what stops it firing on a
   tap that drifted. Both measured against the thumb rather than chosen: a tap
   on this phone wanders about 8 px, and 42 is comfortably outside that while
   still being a flick rather than a drag. */
const SWIPE_PX = 42;
let swipeX = 0, swipeY = 0, swiping = false;

mustEl('aisleL').onclick = () => { if (stepAisle(-1)) sfx.ui(); };
mustEl('aisleR').onclick = () => { if (stepAisle(1)) sfx.ui(); };

document.addEventListener('pointerdown', (e) => {
  if (g.mode !== 'shop') return;
  const t = e.target as HTMLElement;
  /* only taps that landed on the stage itself, not on the tray or the header */
  if (t.id !== 'shop' && t.id !== 'shopStage' && t.id !== 'shopHint') return;
  swipeX = e.clientX; swipeY = e.clientY; swiping = true;
});

document.addEventListener('pointerup', (e) => {
  if (g.mode !== 'shop' || !swiping) return;
  swiping = false;
  const dx = e.clientX - swipeX, dy = e.clientY - swipeY;
  /* A swipe, and the vertical guard so a thumb sliding down the screen does
     not change department. */
  if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
    /* Drag LEFT to walk right, the way a map or a carousel moves - the content
       follows the finger rather than the camera doing. */
    if (stepAisle(dx < 0 ? 1 : -1)) sfx.ui();
    return;
  }
  /* Not a swipe: it is a tap, and taps pick a case. Resolved on the way UP
     rather than on the way down, because the two gestures start identically
     and deciding on pointerdown would select a case every time you swiped
     past one. */
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
/* Guarded: the toggle is new, and an installed app running an older cached
   shell has no such button. A missing control must not take the pause sheet
   down with it. */
if (ui.btnHaptics) ui.btnHaptics.onclick = () => { setHaptics(!haptics.on); audioLabels(); hap.buy(); };

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
    (g.best.haul ? ' · best haul ◈ ' + g.best.haul.toLocaleString() : '') +
    (g.best.fastest ? ' · fastest core ' + fmtTime(g.best.fastest) : '') +
    (g.best.worlds ? ' · ' + g.best.worlds + ' world' + (g.best.worlds === 1 ? '' : 's') + ' broken' : '') +
    '</div></div>' +
    '<div class="val">' + g.best.depth + ' m</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Jump Drive</div>' +
    '<div class="upeff">' + (g.drive.length === 5 ? 'Complete · the Heart is on the chart'
      : 'One piece on each kind of world') + '</div></div>' +
    '<div class="val">' + g.drive.length + ' / 5</div></div>' +
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

mustEl('btnResume').onclick = () => {
  sfx.ui();
  ui.pause.classList.add('hidden');
  /* The pause sheet doubles as the title screen's Settings, so closing it has
     two destinations. Reading the mode rather than a flag of its own: `title`
     is already the fact being asked about, and a second boolean tracking the
     same thing is a second thing to get out of step. */
  if (atTitle()) { showTitle(); return; }
  g.mode = 'play';
};
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
