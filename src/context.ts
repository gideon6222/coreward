/* ---------- losing the GPU ----------

   A WebGL context is not guaranteed. Android Chrome drops it when a tab has
   been in the background a while, when the driver resets, and under memory
   pressure - and this game is played installed, on a phone, in long sessions,
   which is the exact profile that meets it.

   What happened without this: the canvas goes blank and three.js silently
   stops drawing, while `requestAnimationFrame` keeps running. So the game
   carries on simulating - fuel burning, heat climbing, the ship still flying
   wherever the thumb points - behind a black screen with a live HUD on top of
   it. There is no error, nothing in the log the player can see, and no way out
   but to kill the app. A run can be lost to it without the player ever
   learning what happened.

   Three things, and the first one is the one everybody misses:

     `preventDefault()` ON THE LOST EVENT. Without it the browser will not
     attempt to restore the context at all - the default action is to give up
     permanently. This single line is the difference between a recoverable
     blackout and a dead tab.
     STOP THE CLOCK AND SAVE. The simulation must not keep running where it
     cannot be seen, and whatever is safe to keep should be kept before
     anything else can go wrong.
     SAY SO. A black screen that explains itself and offers a way out is a
     different experience from a black screen.

   Restoration is usually automatic and quick; `webglcontextrestored` fires and
   three.js re-uploads what it needs as the scene is drawn again. When it does
   not come back, the overlay's button reloads, and progress is whatever was
   last banked at the pad. */

import { renderer } from './scene';
import { stopClock, startClock } from './loop';
import { save } from './sim/state';

let overlay: HTMLElement | null = null;
let lost = false;

function show(text: string, withReload: boolean) {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'gpulost';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = text;
  overlay.appendChild(p);
  if (withReload) {
    const b = document.createElement('button');
    b.textContent = 'RELOAD';
    b.onclick = () => location.reload();
    overlay.appendChild(b);
  }
  overlay.hidden = false;
}

function hide() { if (overlay) overlay.hidden = true; }

export function installContextGuard() {
  const cv = renderer.domElement;

  cv.addEventListener('webglcontextlost', (e) => {
    /* THE LINE THAT MAKES RESTORATION POSSIBLE. */
    e.preventDefault();
    if (lost) return;
    lost = true;
    /* Nothing may keep simulating behind a screen that cannot show it. */
    stopClock();
    try { save(); } catch { /* a save that refuses is not worth a second fault here */ }
    show('The graphics driver dropped this game. Waiting for it to come back.', false);
    /* If it has not come back shortly, stop waiting and offer the way out
       rather than leaving the player reading the same sentence forever. */
    window.setTimeout(() => {
      if (lost) show('The graphics driver did not come back. Your progress is saved at the pad.', true);
    }, 4000);
  });

  cv.addEventListener('webglcontextrestored', () => {
    lost = false;
    hide();
    startClock();
  });
}

/* For the test, which loses the context on purpose. */
export const contextLost = () => lost;
