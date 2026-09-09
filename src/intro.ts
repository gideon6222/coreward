/* The first-run intro: what this place is, and what you are trying to do.

   Playtest: *"if it is the first time starting, make a little intro going
   through the story and objective."*

   The objective half is the part that actually matters. Until the Jump Drive
   shipped, "why am I doing this" had no answer and there was nothing to
   explain; now there is a drive to assemble out of five components and a Heart
   to reach, and a player learns both of those things an hour in, when their
   first core breaks. That is far too late for the thing the whole game is
   pointed at.

   Six beats. Each one is a PICTURE with a line over it, not a paragraph:
   `CRAFT.md` says do not invent a symbol for something you can show, and the
   game already owns a starfield, twelve painted worlds, a ship and a planet
   coming apart. So the intro is those, and the text is a caption.

   The timing lives here and is pure, which is the same split the crossing and
   the ambience use. It buys two things: the sequence can be walked by a test
   without standing up a renderer, and the preview browser stopping
   requestAnimationFrame when its pane is hidden cannot make the intro
   untestable. */

import type { Shot } from './transit';

export interface Beat {
  /* seconds this beat holds before it advances on its own */
  secs: number;
  text: string;
  shot: Shot;
}

/* Worlds chosen for contrast rather than for order: Verdax because it is where
   the game starts, Rustmoor because it is the most obviously ALIEN of the
   palettes at a glance, and the Heart because nothing else in the game is that
   colour. */
const VERDAX = 0, RUSTMOOR = 1, HEART = 9999;

export const BEATS: Beat[] = [
  { secs: 4.5, text: 'The Verdax Drift.',
    shot: { world: -1, size: 0, ship: false, breaking: false } },
  { secs: 5.5, text: 'A dozen worlds with nothing on them worth having, and no way out of any of them.',
    shot: { world: VERDAX, size: 0.55, ship: false, breaking: false } },
  { secs: 5.5, text: 'You drill for a living. Cut down, fill the hold, sell at the pad, buy a better rig.',
    shot: { world: VERDAX, size: 0.8, ship: true, breaking: false } },
  { secs: 5.5, text: 'Reach a world’s core and it comes apart behind you. Then you move on to the next one.',
    shot: { world: RUSTMOOR, size: 0.9, ship: true, breaking: true } },
  /* The objective, and the only beat that is doing work rather than setting a
     mood. If a player skips everything else, this is the one that had to land
     first - which is why it is not last. */
  { secs: 6.5, text: 'But something out here was built to leave. Five pieces of a jump drive, one buried on each kind of world.',
    shot: { world: RUSTMOOR, size: 0.35, ship: true, breaking: false } },
  { secs: 6.0, text: 'Find all five and the chart opens a route to the Heart of the Drift. Whatever this place turns around, it is down there.',
    shot: { world: HEART, size: 1.0, ship: true, breaking: false } }
];

export interface IntroState {
  /* which beat, and how long it has been showing */
  i: number;
  t: number;
  done: boolean;
}

export const newIntro = (): IntroState => ({ i: 0, t: 0, done: false });

/* Advance the intro. Returns true when the beat CHANGED, so the caller knows
   to repaint the caption and hand the renderer a new shot - rather than
   writing to the DOM sixty times a second for text that changes six times. */
export function introTick(st: IntroState, dt: number): boolean {
  if (st.done) return false;
  st.t += dt;
  if (st.t < BEATS[st.i].secs) return false;
  return advance(st);
}

/* Step to the next beat now, whatever the clock says. This is the tap: on a
   phone the natural thing to do with a caption you have finished reading is
   touch the screen, and a player who reads faster than the timer should never
   be waiting for it. */
export function advance(st: IntroState): boolean {
  if (st.done) return false;
  st.i++;
  st.t = 0;
  if (st.i >= BEATS.length) { st.i = BEATS.length - 1; st.done = true; }
  return true;
}

/* End it immediately. A cutscene you cannot skip is a tax on every replay, and
   this one plays again on every New Game. */
export function skip(st: IntroState) {
  st.i = BEATS.length - 1;
  st.t = 0;
  st.done = true;
}

/* How far through the current beat, 0..1, for the renderer's easing. */
export function beatT(st: IntroState): number {
  const b = BEATS[st.i];
  return b.secs <= 0 ? 1 : Math.min(1, st.t / b.secs);
}

/* Total length, for anything that wants to know what it is asking of the
   player before they have touched anything. */
export const INTRO_SECS = BEATS.reduce((n, b) => n + b.secs, 0);
