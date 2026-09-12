/* The way in: the first-run intro, and the two-second CONTINUE.

   Playtest, 2026-09-12, on v0.32.0: *"redo the intro completely. I want it to
   have more of an eerie and high quality feel to it that matches the rest of
   the game. If there are any transitions from flying in a cutscene to landing,
   I want an actual transition, not just a cut. I want a very short intro after
   hitting the continue button as well. It should only take a few seconds to
   start playing again."*

   That was a restatement from scratch, a day after the captions had been
   rewritten over the same picture - so the picture was wrong, not the words.
   The picture was a second scene: a starfield, billiard-ball worlds under a
   sun, and a white flash to hide the cut into the game. Everything he has ever
   praised in this game is dark rock under a lamp.

   So the intro now plays IN THE GAME'S OWN SCENE, with the game's own camera,
   lamp, rock and pad, and there is nothing to cut between. The research
   (plans/coreward/REFERENCE.md) says the same thing three ways: God of War
   and Half-Life 2 never build a second camera; Limbo's dread is silence
   broken by one sound; Hollow Knight shows the world before the character.

   The shape, on the timeline this module owns:

     tap        black. The first touch is also what lets the audio start.
     hall       the eye is inside the first Anchor's hall - the one the first
                descent will cut into - and a cold light breathes up over the
                cut stone. One low sound. One line.
     rise       the eye climbs to the surface through dark rock.
     surface    the pad and the Ballast at night, the only lights their own.
     descent    the ship's lamp comes down out of the dark; the sky wakes
                from night to day as it comes; touchdown, and the controls.

   THE EYE AND THE SHIP ARE TWO THINGS. The eye is where the world streams
   and the lamp floods from and the camera looks; the ship is where the ship
   is. For most of the intro there is no ship. The renderer reads both from
   `eyeAt(t)` every frame and knows nothing about phases.

   Pure, so a test can walk it: where the eye starts is derived from the
   Anchor table rather than typed, and every number below is a second or a
   metre. */

import { START_X } from './config';
import { anchorAt } from './vaults';

/* ---------- timing ---------- */

/* Phase lengths, in seconds. Each phase starts where the last one ends. */
export const HALL_SECS = 7.0;
export const RISE_SECS = 8.0;
export const SURFACE_SECS = 6.0;
export const DESCENT_SECS = 7.0;

export const HALL_END = HALL_SECS;
export const RISE_END = HALL_END + RISE_SECS;
export const SURFACE_END = RISE_END + SURFACE_SECS;
export const INTRO_SECS = SURFACE_END + DESCENT_SECS;

/* How far above the pad the ship starts its descent, in metres. Far enough to
   enter the frame as a light before it is a shape - the camera at the surface
   frames about eighteen rows. */
export const DESCENT_FROM = 24;
/* Where a landed ship sits. The pad is at row -1 everywhere else in the game. */
export const PAD_D = -1;

/* ---------- the words ---------- */

export interface Caption {
  /* seconds into the intro this line appears */
  at: number;
  /* how long it holds before fading */
  secs: number;
  text: string;
}

/* Three lines, and the first one waits: the hall has to be seen before it is
   captioned, or the words are describing a picture the player has not had.
   Mystery is withholding the explanation, not the goal - a player still
   leaves knowing there are nine, that they are spread across one world, and
   that lighting them opens something. */
export const CAPTIONS: Caption[] = [
  { at: 3.6, secs: 3.2, text: 'Whoever cut these halls is gone.' },
  { at: 16.0, secs: 4.4, text: 'Nine Anchors, buried across one world.' },
  { at: 22.6, secs: 4.8, text: 'Light all nine, and the centre opens.' }
];

/* The one sound, and when. sfx.rumble has a 1.6 s attack - "you hear it
   arriving" - so it is placed early enough to have arrived by the line. */
export const RUMBLE_AT = 1.4;

/* ---------- state ---------- */

export interface IntroState {
  /* seconds since the tap; does not advance before it */
  t: number;
  /* the tap has happened */
  started: boolean;
  done: boolean;
}

export const newIntro = (): IntroState => ({ t: 0, started: false, done: false });

/* The tap. Idempotent: a second tap changes nothing, and a tap during the
   sequence is not a skip - the sequence is continuous and twenty-eight seconds
   long, and stepping it would be stepping the landing. */
export function begin(st: IntroState) { st.started = true; }

/* Advance. Returns true when the visible CAPTION changed, so the caller
   repaints text three times rather than sixty times a second. */
export function introTick(st: IntroState, dt: number): boolean {
  if (st.done || !st.started) return false;
  const before = captionAt(st.t);
  st.t += dt;
  if (st.t >= INTRO_SECS) { st.t = INTRO_SECS; st.done = true; }
  return captionAt(st.t) !== before;
}

/* SKIP is for people who have finished the game (titleui.ts says why). It
   jumps to the descent, not to the pad: arriving is not the cutscene, it is
   how the game starts. A second skip during the descent ends it - a player
   who has seen it twice must be able to get out. */
export function skip(st: IntroState) {
  st.started = true;
  if (st.t < SURFACE_END) { st.t = SURFACE_END; return; }
  st.t = INTRO_SECS;
  st.done = true;
}

export const inDescent = (st: IntroState) => st.started && st.t >= SURFACE_END && !st.done;

/* Which caption is up at `t`, or -1. */
export function captionAt(t: number): number {
  for (let i = CAPTIONS.length - 1; i >= 0; i--) {
    const c = CAPTIONS[i];
    if (t >= c.at && t < c.at + c.secs) return i;
  }
  return -1;
}

/* How far through the current caption, 0..1, for the fade. */
export function captionT(st: IntroState): number {
  const i = captionAt(st.t);
  if (i < 0) return 0;
  const c = CAPTIONS[i];
  return Math.min(1, (st.t - c.at) / c.secs);
}

/* ---------- the picture ---------- */

export interface Eye {
  /* where the world streams from, the lamp floods from and the camera looks */
  px: number;
  pd: number;
  /* the lamp, 0..1 of its play intensity */
  light: number;
  /* the sky and the surface light, 0 night .. 1 the world's own day */
  dawn: number;
  /* the ship's depth, or null while there is no ship in the picture */
  shipD: number | null;
  /* engine, 0..1 */
  thrust: number;
}

const smooth = (u: number) => { u = u < 0 ? 0 : u > 1 ? 1 : u; return u * u * (3 - 2 * u); };

/* The first Anchor's hall. The eye sits in the upper chamber, two rows above
   the Anchor, which the template puts in open air: the room reads as a room
   because the light can flood it. Derived from the table so the intro follows
   the Anchor if the seeds ever move it. */
export function hallEye(): { px: number; pd: number } {
  const a = anchorAt(1);
  return { px: a.x, pd: a.d - 2 };
}

/* The eye at time t. Pure geometry; the renderer reads it every frame. */
export function eyeAt(t: number): Eye {
  const hall = hallEye();
  if (t < HALL_END) {
    /* The light breathes up over three seconds from nothing. Cold and dim:
       this is not the ship's lamp, there is no ship yet. */
    return { px: hall.px, pd: hall.pd, light: 0.55 * smooth(t / 3.0), dawn: 0, shipD: null, thrust: 0 };
  }
  if (t < RISE_END) {
    const u = smooth((t - HALL_END) / RISE_SECS);
    /* To the PAD's row, not to zero: row 0 is the first row of rock, and a
       light source inside rock floods nothing. The pad, and a landed ship,
       are at PAD_D, in open air. The filmstrip found this as a surface that
       stayed dark until play began. */
    return { px: hall.px, pd: hall.pd + (PAD_D - hall.pd) * u, light: 0.55 - 0.30 * u, dawn: 0, shipD: null, thrust: 0 };
  }
  if (t < SURFACE_END) {
    const u = (t - RISE_END) / SURFACE_SECS;
    /* The faintest pre-dawn over the last stretch, so the pad is a silhouette
       and not a hole. */
    return { px: START_X, pd: PAD_D, light: 0.25, dawn: 0.06 * smooth((u - 0.5) * 2), shipD: null, thrust: 0 };
  }
  const u = Math.min(1, (t - SURFACE_END) / DESCENT_SECS);
  /* Decelerating onto the pad, and the sky waking with it: the world starts
     when the ship arrives. Light snaps to full at the start of the descent -
     that is the ship's own lamp switching on, and it is the first bright thing
     in the sequence on purpose. */
  const e = smooth(u);
  const shipD = PAD_D - DESCENT_FROM * (1 - e);
  return { px: START_X, pd: PAD_D, light: 1, dawn: 0.06 + 0.94 * smooth((u - 0.15) / 0.85), shipD, thrust: u < 0.97 ? 1 : 0 };
}

/* The title screen's picture: the pad at night with no ship on it, in the
   faintest light. What CONTINUE and the intro both end by waking. */
export function titleEye(): Eye {
  return { px: START_X, pd: PAD_D, light: 0.2, dawn: 0.15, shipD: null, thrust: 0 };
}

/* ---------- CONTINUE ---------- */

/* Two seconds. *"It should only take a few seconds to start playing again."*

   The title shows the surface at night with no ship on it. On a surface save,
   the ship comes down onto the pad as the sky wakes - the last quarter of the
   intro, alone. On a mid-run save there is no pad to land on: the eye dips to
   black, reappears one window above the ship and drops down the shaft to it,
   and its lamp comes on. Both end in play. */
export const ARRIVE_SECS = 2.0;
/* the dip to black on a mid-run continue, at the start */
export const ARRIVE_DIP = 0.35;
/* how far above a mid-run ship the eye starts its drop, in metres */
export const ARRIVE_FROM = 22;
/* a save this shallow lands on the pad rather than dropping to the ship */
export const ARRIVE_SURFACE = 0.5;

export interface Arrive {
  /* where the ship is in the save; below ARRIVE_SURFACE means the pad */
  fromD: number;
  t: number;
  done: boolean;
}

export const newArrive = (fromD: number): Arrive => ({ fromD, t: 0, done: false });

export function arriveTick(st: Arrive, dt: number) {
  if (st.done) return;
  st.t += dt;
  if (st.t >= ARRIVE_SECS) { st.t = ARRIVE_SECS; st.done = true; }
}

/* A ship shallower than this is reached by dropping the camera all the way
   from the pad, with no dip: the whole shaft goes by, which the filmstrip
   showed is the best two seconds in the game. Deeper than this the drop
   would be hundreds of metres a second - a window rebuild per frame or worse
   on the phone - so the eye dips to black and reappears a window above the
   ship instead. */
export const ARRIVE_FLY = ARRIVE_FROM * 2;

/* Where a mid-run drop starts from: the pad, or a window above the ship. */
export function arriveStart(fromD: number): number {
  return fromD <= ARRIVE_FLY ? PAD_D : fromD - ARRIVE_FROM;
}

/* 0..1, how dark the dip is at t - only on a deep continue, only at the
   start. A surface or shallow continue never dips: the picture it starts
   from is the picture it ends in. */
export function arriveDip(st: Arrive): number {
  if (st.fromD <= ARRIVE_SURFACE || arriveStart(st.fromD) === PAD_D) return 0;
  const u = st.t / ARRIVE_DIP;
  if (u >= 1) return Math.max(0, 1 - (st.t - ARRIVE_DIP) / 0.4);
  return Math.min(1, u * 2);
}

export function arriveEye(st: Arrive): Eye {
  const u = Math.min(1, st.t / ARRIVE_SECS);
  if (st.fromD <= ARRIVE_SURFACE) {
    /* The tail of the intro's descent, from a little lower: there is nothing
       to introduce, the ship is just coming home. */
    const e = smooth(u);
    return { px: START_X, pd: PAD_D, light: 1, dawn: 0.15 + 0.85 * smooth(u / 0.9), shipD: PAD_D - 14 * (1 - e), thrust: u < 0.97 ? 1 : 0 };
  }
  /* From the pad, or from behind the dip a window above the ship; then it
     drops. The ship's own lamp is what it arrives at. */
  const start = arriveStart(st.fromD);
  const dip = start === PAD_D ? 0 : ARRIVE_DIP;
  const w = smooth((st.t - dip) / (ARRIVE_SECS - dip));
  return { px: START_X, pd: start + (st.fromD - start) * w, light: 0.35 + 0.65 * w, dawn: 1, shipD: null, thrust: 0 };
}
