import { g, save, hasSave } from './state';
import { R } from './runtime';
import { sfx } from './audio';
import { hardReset } from './actions';
import { beginShowcase, endShowcase, setShot } from './transit';
import { BEATS, newIntro, skip as skipIntro, advance as stepBeat } from './intro';
import { planetName, coreDepth } from './config';
import { buildNotes, updateHUD } from './ui';

/* The title screen and the intro, wired up.

   Kept apart from intro.ts, which is pure and holds the beats and their
   timing. Same split as chart.ts against chartui.ts: what the sequence IS can
   be walked by a test, what it LOOKS like cannot be tested at all, so there is
   as little as possible in here. */

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
  beginShowcase();
  /* A world behind the wordmark, and it is the world you are actually on -
     a returning player's title screen showing somewhere they have never been
     would be a picture rather than their game. */
  setShot({ world: g.world, size: 0.5, ship: true, breaking: false });

  const cont = el('btnContinue');
  const has = hasSave();
  cont.classList.toggle('hidden', !has);
  el('titleFine').textContent = has
    ? planetName(g.world) + ' · ' + Math.max(0, Math.round(g.best.depth)) + ' m deepest · core at ' +
      coreDepth(g.planet) + ' m'
    : '';
  el('title').classList.remove('hidden');
  document.body.classList.add('crossing');
}

function hideTitle() {
  el('title').classList.add('hidden');
  document.body.classList.remove('crossing');
}

/* ---------- the intro ---------- */

let st = newIntro();

export function showIntro() {
  g.mode = 'intro';
  st = newIntro();
  R.intro = st;
  beginShowcase();
  el('title').classList.add('hidden');
  el('intro').classList.remove('hidden');
  document.body.classList.add('crossing');
  const dots = el('introDots');
  dots.innerHTML = BEATS.map(() => '<i></i>').join('');
  paintBeat();
}

/* Repaint the caption and hand the renderer the new picture. Called only when
   the beat actually changes - see introTick's return value. */
export function paintBeat() {
  const b = BEATS[st.i];
  const txt = el('introText');
  /* Off, then on next frame, so the CSS transition re-runs. Setting the text
     alone would swap it instantly under a class that is already `on`. */
  txt.classList.remove('on');
  requestAnimationFrame(() => {
    txt.textContent = b.text;
    txt.classList.add('on');
  });
  setShot(b.shot);
  const dots = el('introDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i <= st.i);
}

export function endIntro() {
  el('intro').classList.add('hidden');
  document.body.classList.remove('crossing');
  endShowcase();
  R.intro = null;
  onStart(true);
}

/* ---------- leaving ---------- */

function startGame(fresh: boolean) {
  hideTitle();
  endShowcase();
  onStart(fresh);
}

export function wireTitle() {
  el('btnContinue').onclick = () => { sfx.ui(); startGame(false); };

  el('btnNewGame').onclick = () => {
    sfx.ui();
    /* Confirmed, because it throws away everything. The pause menu's own reset
       has the same guard for the same reason - and this button sits directly
       under CONTINUE, which is the one place a mis-tap costs the most. */
    if (hasSave() && !confirm('Start over? This wipes credits, upgrades, core shards and every relic you have found. It cannot be undone.')) return;
    hardReset();
    hideTitle();
    showIntro();
  };

  el('btnSettings').onclick = () => { sfx.ui(); openSettings(false); };
  el('btnTitleNotes').onclick = () => { sfx.ui(); openSettings(true); };

  el('introSkip').onclick = (e) => {
    e.stopPropagation();
    sfx.ui();
    skipIntro(st);
    endIntro();
  };

  /* Tap anywhere else to go to the next beat. On a phone the natural thing to
     do with a caption you have finished is touch the screen, and a reader
     faster than the timer should never be waiting for it. */
  el('intro').onclick = () => {
    if (st.done) return;
    const wasLast = st.i === BEATS.length - 1;
    stepBeat(st);
    if (wasLast || st.done) endIntro();
    else { sfx.ui(); paintBeat(); }
  };
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
