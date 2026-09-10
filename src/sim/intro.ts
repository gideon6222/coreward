/* The first-run intro: where you are, and what is worth finding.

   Playtest: *"dont explain the whole story of the game. Make it feel more
   mysterious."*

   So this is now five short lines instead of six explanatory ones, and the
   beat that described the core loop is gone entirely - the player is about to
   be taught that by playing it, and a game explaining its own loop before
   letting you touch it is the least mysterious thing it can do.

   What must survive is the OBJECTIVE. Mystery is withholding the explanation,
   not withholding the goal: until the Jump Drive shipped there was nothing to
   say, and now a player who is never told finds out an hour in, when their
   first core breaks. Five pieces, one under each kind of world, and a route
   that opens when you have them. Everything else - what the Drift is, what
   built the drive, what the Heart actually is - is deliberately not answered.

   THE TEXT NO LONGER DRIVES THE PICTURE. It used to: each beat carried a shot,
   and the renderer cut to it. That is what made it a slide show. The flight in
   transit.ts is continuous and knows nothing about these lines; they fade in
   and out over the top on their own clock. See the note there.

   The timing is pure so it can be walked by a test - which matters for the
   usual reason (the preview browser stops requestAnimationFrame when hidden)
   and for one specific to an intro: it is the single screen every new player
   sees, and the one nobody who builds it ever looks at again. */

export interface Beat {
  /* seconds this line holds before the next one takes over */
  secs: number;
  text: string;
}

export const BEATS: Beat[] = [
  { secs: 4.0, text: 'The Verdax Drift.' },
  { secs: 5.0, text: 'Twelve dead worlds, and no way out of any of them.' },
  { secs: 5.5, text: 'Except that something out here was built to leave.' },
  { secs: 6.0, text: 'Five pieces of it. One buried under each kind of world.' },
  { secs: 5.5, text: 'Find them all, and the chart opens a route to the Heart.' }
];

/* How long the flight runs before it turns and comes down on Verdax. The
   landing is part of the intro, not something after it. */
export const LANDING_SECS = 4.5;

export interface IntroState {
  i: number;
  t: number;
  /* the captions are finished and the ship is coming down */
  landing: boolean;
  /* the whole thing is over */
  done: boolean;
}

export const newIntro = (): IntroState => ({ i: 0, t: 0, landing: false, done: false });

/* Advance. Returns true when the CAPTION changed, so the caller repaints text
   six times rather than sixty times a second.

   The landing is entered by running out of captions, not by a separate call -
   one path to the end means one place that can forget to start it. */
export function introTick(st: IntroState, dt: number): boolean {
  if (st.done) return false;
  st.t += dt;
  if (st.landing) {
    if (st.t >= LANDING_SECS) st.done = true;
    return false;
  }
  if (st.t < BEATS[st.i].secs) return false;
  return advance(st);
}

/* Step to the next line now, whatever the clock says. On a phone the natural
   thing to do with a caption you have finished is touch the screen, and a
   reader faster than the timer should never be waiting for it. */
export function advance(st: IntroState): boolean {
  if (st.done || st.landing) return false;
  st.i++;
  st.t = 0;
  if (st.i >= BEATS.length) {
    /* Out of captions: the descent begins and the text does NOT change - the
       last line stays up over it. Returning false here keeps the contract
       honest ("true when the caption changed") and stops the caller repainting
       the same words with a fade, which reads as a flicker at the exact moment
       the ship starts coming down. */
    st.i = BEATS.length - 1;
    st.landing = true;
    return false;
  }
  return true;
}

/* Skip to the landing rather than to the game: the ship still flies down to
   the world, because arriving somewhere is not the cutscene, it is how the
   game starts. Skipping the captions should not skip the arrival. */
export function skip(st: IntroState) {
  if (st.landing || st.done) { st.done = true; return; }
  st.i = BEATS.length - 1;
  st.t = 0;
  st.landing = true;
}

/* How far through the current caption, 0..1, for the text fade. */
export function beatT(st: IntroState): number {
  const b = BEATS[st.i];
  return b.secs <= 0 ? 1 : Math.min(1, st.t / b.secs);
}

export const INTRO_SECS = BEATS.reduce((n, b) => n + b.secs, 0) + LANDING_SECS;
