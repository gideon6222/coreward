/* ---------- prefers-reduced-motion ----------

   The one accessibility setting this game was ignoring, and it is not a small
   one for what this game does: a full-screen white flash on every find and on
   every death, a camera that shakes on every cell of rock broken, and two
   readouts that pulse continuously while you are in trouble.

   WHAT IT DOES NOT DO IS REMOVE INFORMATION. Every one of those flashes and
   pulses is telling the player something - the tank is dry, the hull is
   cooking, that was ore and not dirt - so switching them off would make the
   game harder to read for the people asking for less motion, which is the
   opposite of an accommodation. Instead:

     THE SHAKE GOES. It carries no information the sound and the break do not
     already carry, and it is the single most vestibular thing here.
     THE FLASH STAYS, MUCH DIMMER. It still marks the event and still
     distinguishes a gas pocket from a relic by colour; it stops being a
     full-white wash of the screen.
     THE PULSES BECOME STATIC EMPHASIS, in the stylesheet - the warning colour
     or brightness the animation was swinging toward, held. The warning is as
     visible as before and nothing moves.

   Read live rather than at boot: the setting can be changed while the game is
   open, and a player who turns it on mid-run should not have to reload. */

const QUERY = '(prefers-reduced-motion: reduce)';

let reduced = false;
try {
  const mq = window.matchMedia(QUERY);
  reduced = mq.matches;
  /* Safari before 14 has only the deprecated addListener; this is the one
     place a missing method would silently freeze the setting at boot. */
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', (e) => { reduced = e.matches; });
  } else if (typeof (mq as unknown as { addListener?: (f: (e: MediaQueryListEvent) => void) => void }).addListener === 'function') {
    (mq as unknown as { addListener: (f: (e: MediaQueryListEvent) => void) => void })
      .addListener((e) => { reduced = e.matches; });
  }
} catch { reduced = false; }

export function reducedMotion() { return reduced; }

/* How much of the camera shake to apply. Zero, and deliberately not "less":
   a small shake is still a moving frame, and the whole point of the setting is
   that the frame does not move. */
export const shakeScale = () => (reduced ? 0 : 1);

/* How bright a full-screen flash may go. */
export const flashScale = () => (reduced ? 0.3 : 1);
