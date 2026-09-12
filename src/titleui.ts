import { g, save, hasSave } from './sim/state';
import { R } from './sim/runtime';
import { sfx, setDuck } from './audio';
import { hardReset } from './actions';
import { CAPTIONS, captionAt, newIntro, begin, skip as skipIntro, newArrive } from './sim/intro';
import { regionName, regionAt, WORLD_DEPTH } from './sim/region';
import { tierOf } from './sim/unrest';
import { ANCHOR_COUNT } from './sim/vaults';
import { lamp, LAMP_COLOR } from './scene';
import { buildNotes, updateHUD } from './ui';

/* The title screen, the intro and CONTINUE, wired up.

   Kept apart from intro.ts, which is pure and holds the timelines: what the
   sequence IS can be walked by a test, what it LOOKS like cannot be tested at
   all, so there is as little as possible in here. The frame loop reads the
   timelines every tick and draws them through the game's own camera - see
   "the way in" in loop.ts - and this file only opens and closes the screens
   over the top.

   THERE IS NO SECOND SCENE ANY MORE. Until 2026-09-12 the title and the intro
   ran on transit.ts: a starfield, planets under a sun, and a white flash to
   hide the cut into the game. *"redo the intro completely ... an eerie and
   high quality feel that matches the rest of the game ... an actual
   transition, not just a cut."* The picture that did not match the game was
   that scene. Everything here now happens in the world the game is played in,
   and the ship's landing is the ship landing. */

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error('title: missing #' + id);
  return e;
}

/* Set by main.ts, because starting the game is main.ts's job and this module
   must not import it. */
let onStart: (fresh: boolean) => void = () => {};
export function setStartHandler(fn: (fresh: boolean) => void) { onStart = fn; }

/* ---------- the title ---------- */

export function showTitle() {
  /* Put the pause sheet's own wording back, or the next time it is opened
     from PLAY it will still be headed "Settings" with a BACK button. */
  el('pauseTitle').textContent = 'Paused';
  el('pauseSub').textContent = 'Everything is frozen until you resume';
  el('btnResume').textContent = 'RESUME';
  g.mode = 'title';
  R.intro = null;
  R.arrive = null;
  dipTo(0);
  /* The intro and the title are alternatives, and only one of them used to say
     so: showIntro hid the title but not the other way round, so reaching the
     title while the intro was up drew both at once. */
  el('intro').classList.add('hidden');

  /* GREYED, not hidden, and he was specific about it: *"If there is no saved
     game, make sure the continue button is greyed out."* A button that is
     absent tells a new player nothing; a greyed one says "this is where your
     game will be". `disabled` rather than a class alone, so it cannot be
     tapped either. */
  const cont = el('btnContinue') as HTMLButtonElement;
  const has = hasSave();
  cont.disabled = !has;
  cont.classList.toggle('off', !has);
  /* The campaign in one line, which the round-eight design asks for at every
     return: where the ship is, how deep the run has been, how far through the
     Anchors. */
  el('titleFine').textContent = has
    ? regionName(regionAt(Math.round(g.px), Math.max(0, Math.round(g.pd)))) + ' · ' +
      Math.max(0, Math.round(g.best.depth)) + ' m of ' + WORLD_DEPTH + ' · ' +
      tierOf(g.ground) + ' of ' + ANCHOR_COUNT + ' Anchors lit'
    : 'No saved run yet';
  el('title').classList.remove('hidden');
  /* `crossing` is the way-in flag: the HUD is hidden under it, and the smoke
     helper waits for it to clear. The name is older than what it means. */
  document.body.classList.add('crossing');
}

function hideTitle() {
  el('title').classList.add('hidden');
}

/* ---------- the intro ---------- */

export function showIntro() {
  g.mode = 'intro';
  R.intro = newIntro();
  R.arrive = null;
  el('title').classList.add('hidden');
  el('intro').classList.remove('hidden');
  el('introTap').classList.remove('gone');
  el('introText').classList.remove('on');
  el('introText').textContent = '';
  document.body.classList.add('crossing');
  dipTo(0);

  /* THE SKIP BUTTON IS FOR PEOPLE WHO HAVE FINISHED THE GAME.

     Playtest: *"if you are starting a new run, do the full intro ... if they
     have beaten the game and are doing a new game plus run, do the full intro
     but provide a skip button."*

     A cutscene you cannot skip is a tax on every REPLAY - and until the
     centre is open there has been no replay. A first run sees it once, which
     is the one time it is doing its job; a run started after winning has seen
     it, and gets the way out. */
  el('introSkip').classList.toggle('hidden', !g.won);
}

/* The tap. Also the first touch, which is what lets the audio start - so the
   one sound in the hall can actually be heard. Idempotent. */
export function startIntro() {
  if (!R.intro) return;
  begin(R.intro);
  el('introTap').classList.add('gone');
}

/* Repaint the caption. Called only when the visible line changes - see
   introTick's return value - three times in the whole sequence. */
export function paintCaption() {
  if (!R.intro) return;
  const i = captionAt(R.intro.t);
  const txt = el('introText');
  if (i < 0) { txt.classList.remove('on'); return; }
  /* Off, then on next frame, so the CSS transition re-runs. */
  txt.classList.remove('on');
  const text = CAPTIONS[i].text;
  requestAnimationFrame(() => {
    txt.textContent = text;
    txt.classList.add('on');
  });
}

/* The touchdown has happened; the frame loop calls this on the same tick. */
export function endIntro() {
  el('intro').classList.add('hidden');
  R.intro = null;
  leave();
  onStart(true);
}

/* ---------- CONTINUE ---------- */

/* Playtest: *"a very short intro after hitting the continue button as well.
   It should only take a few seconds to start playing again."*

   Two seconds, and no flight. The title already shows the surface at night
   with no ship on it; CONTINUE brings the ship down onto the pad as the sky
   wakes, or - on a mid-run save - dips to black and drops the camera down the
   shaft to where the ship is. intro.ts has the timeline; the loop draws it. */
function startGame() {
  hideTitle();
  g.mode = 'arrive';
  R.arrive = newArrive(g.pd);
}

export function endArrive() {
  R.arrive = null;
  leave();
  onStart(false);
}

/* Hand the scene back to play: the eye is the ship again, the sky is the
   world's own, the lamp is the headlamp, the HUD comes up. One place, for
   both ways in, so they cannot leave the world in two different states. */
function leave() {
  R.eye = null;
  R.shipShown = true;
  R.dawn = 1;
  R.lampLevel = 1;
  lamp.color.setHex(LAMP_COLOR);
  setDuck(1);
  dipTo(0);
  document.body.classList.remove('crossing');
}

/* The dip to black on a mid-run CONTINUE. The flash element is a full-screen
   sheet already in the DOM; this drives its opacity directly instead of
   through flash()'s timer. Darkness hides a swap in a way brightness cannot -
   the eye is not adapted to it - and here it is hiding a camera move of
   several hundred metres. */
export function dipTo(a: number) {
  const f = el('flash');
  f.style.background = '#000';
  f.style.opacity = String(a);
}

export function wireTitle() {
  el('btnContinue').onclick = () => { sfx.ui(); startGame(); };

  el('btnNewGame').onclick = () => {
    sfx.ui();
    /* Confirmed, because it throws away everything. The pause menu's own reset
       has the same guard for the same reason - and this button sits directly
       under CONTINUE, which is the one place a mis-tap costs the most. */
    if (hasSave() && !confirm('Start over? This wipes credits, upgrades, every Anchor you have lit and every relic you have found. It cannot be undone.')) return;
    hardReset();
    hideTitle();
    showIntro();
  };

  el('btnSettings').onclick = () => { sfx.ui(); openSettings(false); };
  el('btnTitleNotes').onclick = () => { sfx.ui(); openSettings(true); };

  el('introSkip').onclick = (e) => {
    e.stopPropagation();
    sfx.ui();
    /* Skips to the DESCENT and nothing else. Playtest: *"if that is pressed,
       skip the main part of the intro but still have the ship fly to the
       planet."* The ship still comes down onto the pad; a second press during
       the descent ends it. */
    if (!R.intro) return;
    skipIntro(R.intro);
    el('introTap').classList.add('gone');
    paintCaption();
  };

  /* The tap that begins it. A tap during the sequence is not a skip - see
     intro.ts - so this is a no-op after the first. */
  el('intro').onclick = () => { startIntro(); };
}

/* Settings and Notes both open the pause sheet, which already IS the settings
   screen - audio, restart, version, run log, what's new, the build stamp. A
   second copy of those controls would be a second place for them to drift.
   All that changes is its heading and what its close button does. */
function openSettings(withNotes: boolean) {
  const sheet = el('pause');
  /* The version line and the what's-new list are written by updateHUD and by
     the notes builder, neither of which has run when this is opened from the
     title - the sheet showed "v0.0.0" and an empty list. Building them here is
     the one thing this has to do that the pause path gets for free. */
  buildNotes();
  updateHUD();
  el('pauseTitle').textContent = 'Settings';
  el('pauseSub').textContent = 'Nothing is running yet';
  const resume = el('btnResume');
  resume.textContent = 'BACK';
  sheet.classList.remove('hidden');
  el('notes').classList.toggle('hidden', !withNotes);
  if (withNotes) el('notes').scrollIntoView({ block: 'nearest' });
}

/* True while the pause sheet is standing in as the title's settings screen, so
   its close button knows to go back to the title rather than into the game. */
export function atTitle() { return g.mode === 'title'; }

export { save };
