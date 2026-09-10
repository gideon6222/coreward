/* Haptics.

   `POLISH.md`: every action fires visual, audio, camera and haptic feedback
   together, and any one of them alone reads as cheap. This game had three of
   the four and not one `navigator.vibrate` call anywhere, for six versions.

   Everything here is deliberately tiny and deliberately defensive:

   - **Android Chrome supports it and iOS Safari does not**, silently. There is
     no feature to apologise for, so an absent API is simply a no-op.
   - **A vibrate call inside a page that has never been tapped throws** in some
     builds, and a page that is hidden ignores it. Both are wrapped.
   - **Durations are short.** The literature puts a tap at 10 to 20 ms; past
     about 60 ms a phone buzzes rather than taps, which reads as a notification
     rather than as the game. The longest thing here is the quake at 90 ms and
     it is the only event that is allowed to feel like an interruption, because
     it is one.
   - **It is off until it is on.** Stored beside the audio settings, defaulting
     ON, because a phone game that never buzzes when you break something is the
     thing being fixed - but the switch is real and it persists. */

const KEY = 'coreward.haptics';

function load(): boolean {
  try { return localStorage.getItem(KEY) !== 'off'; } catch (e) { return true; }
}

export const haptics = { on: load() };

export function setHaptics(on: boolean) {
  haptics.on = on;
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { /* private mode */ }
}

/* The whole API. A number is one pulse; an array is a pattern of
   pulse/gap/pulse, which is what makes a quake feel unlike a drill. */
function buzz(pattern: number | number[]) {
  if (!haptics.on) return;
  try {
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate === 'function') nav.vibrate(pattern);
  } catch (e) { /* unsupported, blocked, or the page is hidden */ }
}

/* Named events rather than durations at the call sites, so the vocabulary
   lives in one place and can be retuned by feel in one edit. Each is paired
   with the sound and the shake that already fire with it. */
export const hap = {
  /* A block gives way. The most frequent event in the game by a long way, so
     it is the shortest thing that still registers under a thumb. */
  cut: () => buzz(12),
  /* Ore, which is the same event with something worth having in it. */
  ore: () => buzz(22),
  /* Taking damage: two quick taps, which reads as an alarm rather than a hit. */
  hurt: () => buzz([18, 40, 18]),
  /* The ground giving way at the surface. The only long one. */
  quake: () => buzz([90, 60, 45]),
  /* Buying something, and the tow, which is the game taking something. */
  buy: () => buzz(16),
  tow: () => buzz([40, 70, 40, 70, 40]),
  /* A core coming apart. It is allowed to be the biggest thing here. */
  boom: () => buzz([120, 50, 80, 40, 60])
};
