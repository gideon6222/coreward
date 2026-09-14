/* ---------- keeping the screen awake ----------

   `POLISH.md`: *"Screen sleep is prevented during play (`keep_screen_on`)."*
   The Godot games get that from a project setting. A web game has to ask, and
   until now this one never did.

   It matters more here than the one line suggests. This game is played with a
   thumb HELD on a d-pad: a long descent is one continuous press with no taps
   at all, and Android's display timeout does not count a held touch as
   activity the way a tap does. So the screen dims and sleeps in the middle of
   the longest, most committed part of a run - which on a phone reads as the
   game crashing, not as the display timing out.

   Three things the API demands and none of them are optional:

     IT IS SECURE-CONTEXT AND PERMISSION-GATED, and it rejects rather than
     throwing. Every call is wrapped; a browser without it (or with it denied)
     must simply play with a screen that sleeps, never fail to boot.
     THE LOCK IS DROPPED WHEN THE PAGE HIDES, by the browser, not by us. So it
     has to be re-taken on `visibilitychange` or it is held exactly once, until
     the first time the player looks at a notification.
     IT IS RELEASED WHEN THE GAME IS NOT BEING PLAYED. Holding a phone awake on
     the title screen or a paused shop is a battery bug, and a polite one is
     what makes the request defensible at all. */

type Sentinel = { released: boolean; release: () => Promise<void> };
type WakeNav = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };

let lock: Sentinel | null = null;
let want = false;
/* Why the screen is or is not being held. A wake lock fails in several ways
   that look identical from outside - no API, permission refused, page hidden,
   never asked - and on a phone with no console that difference is the whole
   diagnosis. */
let tries = 0;
let why = 'not asked yet';
/* Set when the browser says no. Retrying a DENIED permission every frame for
   the rest of the session is the failure mode the retry design invites, and
   the diagnostic above caught it doing exactly that (22 requests in a headless
   run that refuses). A refusal is sticky until something could plausibly have
   changed it, which is the page coming back to the foreground. */
let blocked = false;

async function take() {
  if (lock) return;
  if (!want) { why = 'not playing'; return; }
  if (document.hidden) { why = 'page hidden'; return; }
  if (blocked) return;
  const nav = navigator as WakeNav;
  if (!nav.wakeLock) { why = 'no wakeLock API in this browser'; return; }
  try {
    tries++;
    lock = await nav.wakeLock.request('screen');
    why = 'held';
    /* The browser can drop it on its own (low battery, a policy change), so
       the sentinel's own event is the only honest record of whether it is
       still held. */
    (lock as unknown as EventTarget).addEventListener?.('release', () => { lock = null; });
  } catch (e) { lock = null; blocked = true; why = 'refused: ' + String((e as Error)?.message || e); }
}

async function drop() {
  const l = lock;
  lock = null;
  if (l && !l.released) { try { await l.release(); } catch { /* already gone */ } }
}

/* Called by the loop every frame.

   It used to act only on a CHANGE of intent, which was wrong in a way the test
   caught before the phone did: the very first request can be skipped or
   refused - the page is momentarily hidden during boot, the permission is
   denied, the battery is low - and on an edge-triggered design that is the end
   of it. The lock is never asked for again for the whole session, and the
   symptom is a screen that sleeps mid-descent with `want` sitting true and
   nothing retrying.

   So it retries while it wants the lock and does not have it. That costs one
   boolean test per frame in the normal case, because `lock` is set and the
   first condition short-circuits. `pending` is what stops a slow or hanging
   request being fired again sixty times a second underneath itself. */
let pending = false;

export function keepAwake(on: boolean) {
  want = on;
  if (!on) { if (lock) void drop(); return; }
  if (lock || pending || document.hidden) return;
  pending = true;
  void take().then(() => { pending = false; }, () => { pending = false; });
}

export function installWakeLock() {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lock = null; return; }   /* the browser already released it */
    /* Coming back to the foreground is the one moment a previous refusal might
       not still hold - a permission granted in settings, a battery saver
       switched off - so it is where the sticky refusal is cleared. */
    blocked = false;
    void take();
  });
}

/* For the test. */
export const wakeHeld = () => !!lock;
export const wakeWanted = () => want;
export const wakeState = () => ({ want, held: !!lock, pending, tries, blocked, why });
