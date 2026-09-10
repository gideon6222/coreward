import { g, save, hasSave } from './state';
import { R } from './runtime';
import { sfx } from './audio';
import { hardReset } from './actions';
import { beginShowcase, endShowcase, beginLanding, beginLaunch, isLanding } from './transit';
import { BEATS, newIntro, skip as skipIntro, advance as stepBeat, LANDING_SECS } from './intro';
import { planetName, coreDepth, skyLo } from './config';
import { buildNotes, updateHUD, flash } from './ui';

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
  /* The intro and the title are alternatives, and only one of them used to say
     so: showIntro hid the title but not the other way round, so reaching the
     title while the intro was up drew both at once - wordmark, buttons,
     caption and skip button stacked on one screen. */
  el('intro').classList.add('hidden');
  beginShowcase();

  /* GREYED, not hidden, and he was specific about it: *"If there is no saved
     game, make sure the continue button is greyed out."* He is right. A button
     that is absent tells a new player nothing; a greyed one says "this is
     where your game will be", which is the only thing a first-time title
     screen can usefully say about it. `disabled` rather than a class alone, so
     it cannot be tapped either. */
  const cont = el('btnContinue') as HTMLButtonElement;
  const has = hasSave();
  cont.disabled = !has;
  cont.classList.toggle('off', !has);
  el('titleFine').textContent = has
    ? planetName(g.world) + ' · ' + Math.max(0, Math.round(g.best.depth)) + ' m deepest · core at ' +
      coreDepth(g.planet) + ' m'
    : 'No saved run yet';
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

  /* THE SKIP BUTTON IS FOR PEOPLE WHO HAVE FINISHED THE GAME.

     Playtest: *"if you are starting a new run, do the full intro ... if they
     have beaten the game and are doing a new game plus run, do the full intro
     but provide a skip button."*

     Which is the right shape, and it is worth saying why it is not the usual
     "always let them skip". A cutscene you cannot skip is a tax on every
     REPLAY - and until the Heart is broken there has been no replay. A first
     run sees it once, which is the one time it is doing its job; a run started
     after winning has seen it, and gets the way out.

     Tapping still steps through it on any run, so nobody is ever stuck
     watching a line they have finished reading. */
  el('introSkip').classList.toggle('hidden', !g.won);

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
  const dots = el('introDots').children;
  for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i <= st.i);
}

/* The captions are done; hide them and let the ship come down. The intro is
   not over until it has landed - arriving somewhere is not the cutscene, it is
   how the game starts. */
export function beginIntroLanding() {
  el('intro').classList.add('hidden');
  beginLanding(0, LANDING_SECS);
}

export function endIntro() {
  el('intro').classList.add('hidden');
  arrive(0);
  R.intro = null;
  onStart(true);
}

/* The last handful of frames of a descent are the world's surface filling the
   screen, and the first frame of the game is a ship on a pad. Cutting straight
   between them reads as the scene failing rather than as arriving, so the
   world's own sky takes the screen for a moment and pulls back in-game. One
   call, and it is the difference between a transition and a jump. */
function arrive(world: number) {
  document.body.classList.remove('crossing');
  endShowcase();
  const sky = skyLo(world).toString(16).padStart(6, '0');
  flash('#' + sky, 620);
}

/* ---------- leaving ---------- */

/* CONTINUE does not cut into the game. Playtest: *"if you hit continue, have
   the ship take off and fly to the planet the player is currently at."*

   The same landing the intro ends on, because it is the same event - and
   sharing it means the arrival cannot be good in one place and stale in the
   other. The title's buttons go, the showcase stays up, and the frame loop
   flies it down. */
let landingInto: boolean | null = null;

function startGame(fresh: boolean) {
  el('title').classList.add('hidden');
  landingInto = fresh;
  /* Take off, THEN fly there. beginLaunch runs the burn and hands over to the
     landing itself, so this asks for a destination rather than sequencing
     phases - see the note in transit.ts. */
  beginLaunch(g.world);
}

/* Called by the frame loop when a CONTINUE landing finishes. */
export function finishLanding() {
  if (landingInto === null) return;
  const fresh = landingInto;
  landingInto = null;
  arrive(g.world);
  onStart(fresh);
}

/* Is a title-screen landing in flight? The intro has its own clock and its own
   end, so the loop has to be able to tell the two apart. */
/* True from the moment CONTINUE is pressed until the ship is on the ground.
   It has to cover the LAUNCH as well as the landing: `landingInto` is set at
   the launch and the loop only stops watching once the whole thing is over. */
export function titleLanding() { return landingInto !== null; }

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
    /* Skips the CAPTIONS and nothing else. Playtest: *"if that is pressed,
       skip the main part of the intro but still have the ship fly to the
       planet."*

       So it hands over to the descent and the frame loop flies it down -
       exactly as running out of captions does. This used to call endIntro()
       straight after, which threw away the arrival with the words and dropped
       the player onto the pad from nowhere. `skip` sets the landing; the loop
       watches for it; there is one route to the ground. */
    skipIntro(st);
    beginIntroLanding();
  };

  /* Tap anywhere else to go to the next beat. On a phone the natural thing to
     do with a caption you have finished is touch the screen, and a reader
     faster than the timer should never be waiting for it. */
  el('intro').onclick = () => {
    if (st.done || st.landing) return;
    /* stepBeat returns false when it runs out of captions and enters the
       descent, which is not a caption change - the loop watches `landing` for
       that and starts the flight down. A tap here never ends the intro; only
       the landing does. */
    if (stepBeat(st)) { sfx.ui(); paintBeat(); }
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
