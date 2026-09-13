/* The way in: the first-run intro, the title, and CONTINUE.

   Playtest, 2026-09-12, on v0.32.0: *"redo the intro completely. I want it to
   have more of an eerie and high quality feel to it that matches the rest of
   the game. If there are any transitions from flying in a cutscene to landing,
   I want an actual transition, not just a cut. I want a very short intro after
   hitting the continue button as well. It should only take a few seconds to
   start playing again."*

   And on v0.33.0, an hour later: *"I like the intro a lot more now ... When
   you hit continue at the start screen, have the same starting point as new
   game but move the camera to the launch pad faster and don't display the
   text."*

   The first was a restatement from scratch, a day after the captions had
   been rewritten over the same picture - so the picture was wrong, not the
   words. The picture was a second scene: a starfield, billiard-ball worlds
   under a sun, and a white flash to hide the cut into the game. Everything he
   has ever praised in this game is dark rock under a lamp.

   So the way in plays IN THE GAME'S OWN SCENE, with the game's own camera,
   lamp, rock and pad, and there is nothing to cut between. The research
   (plans/lattice/REFERENCE.md) says the same thing three ways: God of War
   and Half-Life 2 never build a second camera; Limbo's dread is silence
   broken by one sound; Hollow Knight shows the world before the character.

   ONE SHAPE, TWO SPEEDS. The title screen is the first Anchor's hall in the
   dark, the Anchor's own glow the only light. From there:

     NEW GAME   tap. A cold light breathes up over the cut stone - the hall
                the first descent will cut into. One low sound. One line.
                The eye climbs to the surface through dark rock. The pad at
                night, one line. The ship's lamp comes down out of the dark;
                the ground wakes under it; touchdown, one line, controls.
     CONTINUE   the same, in under four seconds, with no words.

   THE EYE AND THE SHIP ARE TWO THINGS. The eye is where the world streams
   and the lamp floods from and the camera looks; the ship is where the ship
   is. For most of the way in there is no ship. The renderer reads both from
   `eyeOn(way, t)` every frame and knows nothing about phases.

   Pure, so a test can walk it: where the eye starts is derived from the
   Anchor table rather than typed, and every number below is a second or a
   metre. */

import { START_X } from './config';
import { anchorAt } from './vaults';

/* ---------- a way in ---------- */

/* Phase lengths in seconds, and how high the ship starts its descent. */
export interface Way {
  hall: number;
  rise: number;
  surface: number;
  descent: number;
  /* metres above the pad the ship enters from */
  from: number;
  /* seconds the hall's light takes to breathe up */
  breathe: number;
}

export const wayEnds = (w: Way) => ({
  hall: w.hall,
  rise: w.hall + w.rise,
  surface: w.hall + w.rise + w.surface,
  end: w.hall + w.rise + w.surface + w.descent
});

/* The intro. The hall needs three seconds to breathe up and three to be
   read; the descent is the old settle's two seconds plus the approach. */
export const INTRO: Way = { hall: 7.0, rise: 8.0, surface: 6.0, descent: 7.0, from: 24, breathe: 3.0 };

/* CONTINUE. *"the same starting point as new game but move the camera to the
   launch pad faster."* The same phases at a run: a glimpse of the hall, the
   rise at about forty metres a second, the ship from half the height. */
export const ARRIVE: Way = { hall: 0.7, rise: 1.3, surface: 0, descent: 1.7, from: 14, breathe: 0.35 };

export const INTRO_SECS = wayEnds(INTRO).end;
export const ARRIVE_SECS = wayEnds(ARRIVE).end;

/* Where a landed ship sits. The pad is at row -1 everywhere else in the game;
   row 0 is the first row of rock, and a light source inside rock floods
   nothing, so every surface moment below is at this row and not at zero. */
export const PAD_D = -1;

/* ---------- the words, intro only ---------- */

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
  { at: 22.6, secs: 4.8, text: 'Light all nine, and the center opens.' }
];

/* The one sound, and when. sfx.rumble has a 1.6 s attack - "you hear it
   arriving" - so it is placed early enough to have arrived by the line. */
export const RUMBLE_AT = 1.4;

/* ---------- the intro's state ---------- */

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
  const e = wayEnds(INTRO);
  if (st.t < e.surface) { st.t = e.surface; return; }
  st.t = INTRO_SECS;
  st.done = true;
}

export const inDescent = (st: IntroState) => st.started && st.t >= wayEnds(INTRO).surface && !st.done;

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
   because the light can flood it. Derived from the table so the way in
   follows the Anchor if the seeds ever move it. */
export function hallEye(): { px: number; pd: number } {
  const a = anchorAt(1);
  return { px: a.x, pd: a.d - 2 };
}

/* The title screen's picture: the hall in the dark, the Anchor's own glow
   the only light. Both NEW GAME and CONTINUE start from exactly this, so
   neither begins with a cut. */
export function titleEye(): Eye {
  const hall = hallEye();
  return { px: hall.px, pd: hall.pd, light: 0, dawn: 0, shipD: null, thrust: 0 };
}

/* The eye at time t along a way. Pure geometry; the renderer reads it every
   frame. */
export function eyeOn(w: Way, t: number): Eye {
  const hall = hallEye();
  const e = wayEnds(w);
  if (t < e.hall) {
    /* The light breathes up from nothing. Cold and dim: this is not the
       ship's lamp, there is no ship yet. */
    return { px: hall.px, pd: hall.pd, light: 0.55 * smooth(t / w.breathe), dawn: 0, shipD: null, thrust: 0 };
  }
  if (t < e.rise) {
    const u = smooth((t - e.hall) / w.rise);
    /* Up to the PAD's row, and ACROSS to the pad's column on the way: the
       hall is centred on the Anchor, one column over from the pad, and a
       snap at the top read as *"it jumps over to the left to line up with
       the launch pad"*. One column, and he saw it. */
    return {
      px: hall.px + (START_X - hall.px) * u,
      pd: hall.pd + (PAD_D - hall.pd) * u,
      light: 0.55 - 0.30 * u, dawn: 0, shipD: null, thrust: 0
    };
  }
  if (t < e.surface) {
    const u = (t - e.rise) / w.surface;
    /* The faintest pre-dawn over the last stretch, so the pad is a silhouette
       and not a hole. */
    return { px: START_X, pd: PAD_D, light: 0.25, dawn: 0.06 * smooth((u - 0.5) * 2), shipD: null, thrust: 0 };
  }
  const u = Math.min(1, (t - e.surface) / w.descent);
  /* Decelerating onto the pad, and the sky waking with it: the world starts
     when the ship arrives. Light snaps to full at the start of the descent -
     that is the ship's own lamp switching on, and it is the first bright thing
     in the sequence on purpose. */
  const s = smooth(u);
  const shipD = PAD_D - w.from * (1 - s);
  return { px: START_X, pd: PAD_D, light: 1, dawn: 0.06 + 0.94 * smooth((u - 0.15) / 0.85), shipD, thrust: u < 0.97 ? 1 : 0 };
}

export const eyeAt = (t: number): Eye => eyeOn(INTRO, t);

/* ---------- CONTINUE ---------- */

/* *"It should only take a few seconds to start playing again."* The intro's
   own way, compressed and silent, when the save is on the pad.

   And when it is a CHECKPOINT - an Anchor lit, the Vault, a relic, a device
   - *"update the continue screen to go directly to their saved location
     instead of up to the launch pad first, then to them."* The light comes
   up in the hall as before, then the eye travels straight to where the ship
   is, through whatever is between, and the ship's lamp comes on. */
export interface Arrive {
  t: number;
  done: boolean;
  /* where the ship is, or null for the pad */
  to: { px: number; pd: number } | null;
}

/* The eye's speed on a direct travel, in metres a second, and the bounds on
   how long the travel takes. Two rebuilds of the streaming window a frame
   at 60 fps; the farthest checkpoint, the Vault at the centre, is about
   three seconds. */
export const TRAVEL_SPEED = 120;
export const TRAVEL_MIN = 0.8;
export const TRAVEL_MAX = 3.2;
/* the ship's lamp coming on at the end of a direct travel */
export const LAMP_UP = 0.5;

export const newArrive = (to: { px: number; pd: number } | null = null): Arrive => ({ t: 0, done: false, to });

/* How long this arrive runs. */
export function arriveSecs(st: Arrive): number {
  if (!st.to) return ARRIVE_SECS;
  const hall = hallEye();
  const dist = Math.hypot(st.to.px - hall.px, st.to.pd - hall.pd);
  const travel = Math.min(TRAVEL_MAX, Math.max(TRAVEL_MIN, dist / TRAVEL_SPEED));
  return ARRIVE.hall + travel + LAMP_UP;
}

export function arriveTick(st: Arrive, dt: number) {
  if (st.done) return;
  const end = arriveSecs(st);
  st.t += dt;
  if (st.t >= end) { st.t = end; st.done = true; }
}

export function arriveEye(st: Arrive): Eye {
  if (!st.to) return eyeOn(ARRIVE, st.t);
  const hall = hallEye();
  const t = st.t;
  if (t < ARRIVE.hall) {
    return { px: hall.px, pd: hall.pd, light: 0.55 * smooth(t / ARRIVE.breathe), dawn: 0, shipD: null, thrust: 0 };
  }
  const travel = arriveSecs(st) - ARRIVE.hall - LAMP_UP;
  if (t < ARRIVE.hall + travel) {
    const u = smooth((t - ARRIVE.hall) / travel);
    return {
      px: hall.px + (st.to.px - hall.px) * u,
      pd: hall.pd + (st.to.pd - hall.pd) * u,
      light: 0.55 - 0.20 * u, dawn: 1, shipD: null, thrust: 0
    };
  }
  /* Arrived. The ship is where it was; its lamp comes on. */
  const u = Math.min(1, (t - ARRIVE.hall - travel) / LAMP_UP);
  return { px: st.to.px, pd: st.to.pd, light: 0.35 + 0.65 * smooth(u), dawn: 1, shipD: st.to.pd, thrust: 0 };
}
