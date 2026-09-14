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
import { g , coreM, worldTrait, save, docked } from './sim/state';
import { haulValue } from './sim/world';
import { R } from './sim/runtime';
import { openMap, wireMap } from './mapui';
import { ANCHOR_COUNT } from './sim/vaults';
import { MAP_TILE, WORLD_DEPTH, regionName, regionAt } from './sim/region';
import { W } from './sim/config';
import { feed } from './sim/unrest';
import { shoreUp } from './collapse';
import { mustEl, ui, atSurface, buildShop, buildCard, buildManifest, audioLabels, buildNotes, buildRunLog, buildCredits, retireHint, buildBallast, updateHUD } from './ui';
import { dockShip, undockShip, pickBay, selectBay, selectedBay, resizeStation,
         stepAisle, stepBay, paintAisleBar, markSeen } from './station';
import type { Dir } from './types';
import { autopilot, hardReset, useSupply, fireBomb, fireLaser } from './actions';
import { sfx, audioInit, setAudio, setVolume, audioFocus, audioState } from './audio';

function firstTouch() { audioInit(); }
window.addEventListener('pointerdown', firstTouch, { once: true });
window.addEventListener('keydown', firstTouch, { once: true });

/* ---------- the d-pad, and the forgiveness in it ----------

   `mechanics/FOUNDATIONS.md` principle 3: forgiveness is invisible and is most
   of "feel". Round ten's research ranked input BUFFERING first for a game at
   this stage, and measuring it here said it was the wrong forgiveness: the
   only press this game refuses on a timescale a buffer could bridge is
   ordnance with an empty meter, and `CHARGE_SECONDS` is 42 seconds a point, so
   a 150 ms window bridges nothing. The forgiveness that was actually missing
   was one step upstream, in who owns the pointer.

   The keys are 60 px on a 5 px grid, which is about 10 mm on his phone against
   a thumb nearer 18 mm. They used to bind `pointerleave` to a release, so:

     A THUMB THAT DRIFTS STOPPED THE SHIP. Three pixels into the gutter ended
     a dig, silently, in the middle of the one action this game is about. A
     player does not report that as "the key released", they report it as the
     controls feeling wrong, which is exactly what principle 3 predicts.
     A SLIDE BETWEEN KEYS DEAD-ENDED. `pointerleave` fired on the key the
     thumb left and `pointerdown` never fired on the key it reached, because
     the pointer was already down. So the ship simply stopped.

   `setPointerCapture` fixes both and is the whole change. A press owns the
   pointer until it is lifted, which suppresses the boundary events outright,
   and a move is hit-tested against the grid so the thumb can slide from one
   key to another and hand the ship over. Drifting OFF the pad entirely keeps
   the last direction: the press is still live, and guessing that the player
   meant to stop is the same mistake `pointerleave` was making. */
const keyUnder = (x: number, y: number): HTMLElement | null => {
  const el = document.elementFromPoint(x, y);
  return el ? (el.closest('#dpad .k') as HTMLElement | null) : null;
};

document.querySelectorAll<HTMLElement>('#dpad .k').forEach((b) => {
  /* Which key is lit is the thumb's business, not this element's, because a
     slide moves the light to a key that never saw a pointerdown. */
  const light = (el: HTMLElement | null) => {
    document.querySelectorAll<HTMLElement>('#dpad .k').forEach((k) => k.classList.toggle('on', k === el));
  };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    /* Capture can throw when the pointer is already gone (a cancel that
       arrived first). The press must still register if it does. */
    try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    light(b);
    R.held = b.dataset.dir as Dir;
  });
  b.addEventListener('pointermove', (e) => {
    if (!b.hasPointerCapture(e.pointerId)) return;
    const k = keyUnder(e.clientX, e.clientY);
    /* Off the grid is not a release. Only landing on a DIFFERENT key changes
       anything, which also means the gutters between keys cost nothing. */
    if (!k || k === b) return;
    e.preventDefault();
    light(k);
    R.held = k.dataset.dir as Dir;
  });
  const up = (e: PointerEvent) => {
    e.preventDefault();
    try { b.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    light(null);
    /* Unconditional, unlike the old `R.held === dir` guard: after a slide the
       direction being flown is not this key's, and it is still this key's
       pointer that is ending. */
    R.held = null;
  };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
});

const KEYS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
/* Only while the ship is the thing the arrows move. The shop binds the same
   four keys to walking the room, and without this gate a player who steered
   with the keyboard into the Outfitter left `R.held` set behind them and the
   ship flew off the moment they undocked. */
const flying = () => g.mode === 'play' || g.mode === 'fly';
window.addEventListener('keydown', (e) => { if (KEYS[e.key] && flying()) { R.held = KEYS[e.key]; e.preventDefault(); } });
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
  if (!docked() || g.mode !== 'play') return;
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

mustEl('aisleL').onclick = () => { if (stepAisle(-1)) { sfx.ui(); retireHint(); } };
mustEl('aisleR').onclick = () => { if (stepAisle(1)) { sfx.ui(); retireHint(); } };

/* Up and down walk the cases in this aisle. The card follows the selection,
   so the description he asked for comes for free - it is the same card a tap
   builds. */
function walkBay(dir: number) {
  if (!stepBay(dir)) return;
  sfx.ui();
  retireHint();
  buildCard();
  paintAisleBar();
}
mustEl('bayU').onclick = () => walkBay(-1);
mustEl('bayD').onclick = () => walkBay(1);

/* The confirm. The card's own primary button IS the confirm - it carries the
   price and greys itself when the thing cannot be bought - so this presses
   that rather than adding a second control that does the same job, which is
   the "two ways to do one thing" fault the plinths already taught this room.
   Returns whether anything happened, so a key press that confirms nothing
   does not make a sound. */
function confirmSelected(): boolean {
  /* Two classes, because an upgrade row and a supply row build different
     buttons - and a confirm that knew only one of them silently did nothing
     on every upgrade in the game, which is what the verification pass found. */
  const btn = ui.shopCard.querySelector('button.buy, button.cbuy') as HTMLButtonElement | null;
  if (!btn || btn.disabled) return false;
  btn.click();
  return true;
}

/* ---------- the room, from the keyboard ----------

   The same four directions and the same confirm, for a desk session and for
   anybody who cannot hit a 40 px arrow. Gated on the mode so the arrows that
   fly the ship and the arrows that walk the shop are never both live. */
const SHOP_KEYS: Record<string, () => void> = {
  ArrowLeft: () => { if (stepAisle(-1)) { sfx.ui(); retireHint(); } },
  ArrowRight: () => { if (stepAisle(1)) { sfx.ui(); retireHint(); } },
  ArrowUp: () => walkBay(-1),
  ArrowDown: () => walkBay(1),
  Enter: () => { if (confirmSelected()) sfx.ui(); },
  ' ': () => { if (confirmSelected()) sfx.ui(); }
};
window.addEventListener('keydown', (e) => {
  if (g.mode !== 'shop') return;
  const fn = SHOP_KEYS[e.key];
  if (!fn) return;
  e.preventDefault();
  fn();
});

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
    if (stepAisle(dx < 0 ? 1 : -1)) { sfx.ui(); retireHint(); }
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

/* The map. Gated on 'play' like the manifest: a screen opened out of another
   screen is how you get two modals and no way back. */
mustEl('btnMap').onclick = () => { if (g.mode !== 'play') return; sfx.ui(); R.held = null; sfx.digStop(); openMap(); };
wireMap();

/* The Ballast, at the pad. Rebuilt on open rather than kept live: the panel is
   a decision screen and nothing on it moves while it is up except in response
   to a tap, so a rebuild per tap is both simpler and correct. */
const ballastSheet = mustEl('ballast');
function openBallast() {
  if (g.mode !== 'play' || !docked()) return;
  sfx.ui();
  g.mode = 'ballast';
  buildBallast();
  ballastSheet.classList.remove('hidden');
}
mustEl('btnBallast').onclick = openBallast;
mustEl('ballastClose').onclick = () => {
  sfx.ui();
  ballastSheet.classList.add('hidden');
  g.mode = 'play';
  updateHUD();
  save();
};
/* Delegated, because the rows are rebuilt after every tap and handlers bound
   to the old nodes would be bound to nodes that no longer exist. */
ballastSheet.onclick = (e) => {
  const btn = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
  if (!btn || btn.disabled) return;
  if (btn.dataset.shore) {
    if (shoreUp() >= 0) buildBallast();
    return;
  }
  const id = btn.dataset.feed;
  if (!id) return;
  const n = Math.min(g.stock[id] || 0, Number(btn.dataset.n) || 0);
  if (n <= 0) return;
  /* The ore leaves the vault whether or not the tank had room for all of it -
     which is why the button's count is computed to fit rather than to empty
     your pockets. See buildBallast. */
  feed(g.ground, id, n);
  g.stock[id] -= n;
  if (g.stock[id] <= 0) delete g.stock[id];
  sfx.buy();
  hap.buy();
  buildBallast();
  save();
};

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
    /* The REGION, like the HUD chip, and for the same reason: one planet means
       a planet name is the same word for the whole game. And it is not "Core
       at 452 m" any more - there is no core to break, only a floor. */
    '<div class="up"><div class="upinfo"><div class="upname">' +
    regionName(regionAt(Math.round(g.px), Math.max(0, Math.round(g.pd)))) +
    (worldTrait().id === 'stable' ? '' : ' <span class="mult">' + worldTrait().name + '</span>') + '</div>' +
    '<div class="upeff">You are at ' + Math.max(0, Math.round(g.pd)) + ' m of ' + coreM() + '</div>' +
    '<div class="upeff">' + worldTrait().blurb + '</div></div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Credits</div>' +
    '<div class="upeff">Haul aboard worth ◈ ' + haulValue().toLocaleString() + '</div></div>' +
    '<div class="val">◈ ' + Math.floor(g.credits).toLocaleString() + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Relics</div>' +
    '<div class="upeff">' + (g.relics.length
      ? g.relics.map((r) => RELIC_OF[r] ? RELIC_OF[r].name : r).join(' · ')
      : 'One is buried on this planet, below the halfway mark. Nothing marks it.') +
    '</div>' +
    (relicDistance() === null
      ? '<div class="upeff">Recovered.</div>'
      : '<div class="upeff">Still in the ground here.</div>') + '</div>' +
    '<div class="val">' + g.relics.length + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Records</div>' +
    '<div class="upeff">Deepest ' + g.best.depth + ' m' +
    (g.best.haul ? ' · best haul ◈ ' + g.best.haul.toLocaleString() : '') +
    '</div></div>' +
    '<div class="val">' + g.best.depth + ' m</div></div>' +
    /* The campaign, in the two numbers it actually turns on. The Jump Drive and
       the Core Shards used to be here and went with the chart in W9 - one
       planet does not have worlds broken or routes to plot. */
    '<div class="up"><div class="upinfo"><div class="upname">The Lattice</div>' +
    '<div class="upeff">' + (g.ground.lit.length >= ANCHOR_COUNT
      ? (g.won ? 'All nine, and the center is behind you' : 'All nine. The center is open')
      : 'Anchors lit, of nine') + '</div></div>' +
    '<div class="val">' + g.ground.lit.length + ' / ' + ANCHOR_COUNT + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Survey</div>' +
    '<div class="upeff">How much of the planet you have had a lamp on</div></div>' +
    '<div class="val">' + Math.floor((g.seen.length /
      (Math.ceil(W / MAP_TILE) * Math.ceil(WORLD_DEPTH / MAP_TILE))) * 100) + '%</div></div>';
  ui.pause.classList.remove('hidden');
};
/* Built on the click, never while the game is running. ONE panel open at a
   time: the pause sheet is already the tallest thing in the game, and two open
   lists inside one scroll region is how the shop's shelves got clipped at the
   fold. Written as a table rather than as three buttons closing each other by
   hand, because that was two pairwise closes at two panels and would have been
   six at four. */
const PANELS: { btn: HTMLElement; panel: HTMLElement; label: string; build: () => void }[] = [
  { btn: ui.btnNotes, panel: ui.notes, label: "WHAT'S NEW", build: buildNotes },
  { btn: ui.btnLog, panel: ui.runlog, label: 'RUN LOG', build: buildRunLog },
  { btn: ui.btnCredits, panel: ui.creditsPanel, label: 'CREDITS', build: buildCredits }
];
for (const p of PANELS) {
  p.btn.onclick = () => {
    sfx.ui();
    const opening = p.panel.classList.contains('hidden');
    for (const q of PANELS) {
      q.panel.classList.add('hidden');
      q.btn.textContent = q.label;
    }
    if (opening) {
      p.build();
      p.panel.classList.remove('hidden');
      p.btn.textContent = 'HIDE';
    }
  };
}

/* The volume sliders. `input`, not `change`: on a phone `change` does not fire
   until the thumb is released, so the whole point of a volume control - hear
   it move - would be missing. */
for (const [el, kind] of [[ui.volMusic, 'music'], [ui.volSfx, 'sfx']] as const) {
  el.addEventListener('input', () => {
    audioInit();
    setVolume(kind, Number(el.value) / 100);
  });
}

/* Focus. `POLISH.md`: audio ducks and pauses on focus loss and resumes on
   return. `visibilitychange` covers the phone (home, app switcher, screen
   off); `blur`/`focus` covers a desktop tab that is visible but not in front,
   where a game left running under something else is still making noise. */
const focusChanged = () => audioFocus(!document.hidden && document.hasFocus());
document.addEventListener('visibilitychange', focusChanged);
window.addEventListener('blur', focusChanged);
window.addEventListener('focus', focusChanged);

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
