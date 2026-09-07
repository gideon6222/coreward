/* Shared mutable loop state.

   These were plain `let` bindings at the top of app.ts. Once the file is split
   they are written in one module and read in another, and you cannot assign to
   an imported binding — `import { shake } from ...; shake = 0.5` is a compile
   error. So they live on one mutable object, exactly the way `g` already does.

   Only state that genuinely crosses a module boundary belongs here. Things the
   frame loop alone touches (camZBoost, freeze, thrustLevel, bank, last,
   skyTick) stay local to loop.ts, and per-module caches (lastRow, pHead,
   resetArmed) stay with their module. */

import type { Dir, Move, Dig, Flight } from './types';

export const R = {
  /* input -> loop */
  held: null as Dir | null,

  /* actions <-> loop */
  moving: null as Move | null,
  digging: null as Dig | null,
  flight: null as Flight | null,

  /* actions -> loop: what is currently eating the hull, so the tow screen
     names the right cause. Heat is the default because it is the only
     continuous drain; a gas pocket overwrites it on the frame it fires. */
  hullCause: 'heat' as 'heat' | 'gas',

  /* actions -> loop, decayed by the loop */
  shake: 0,
  squash: 0,

  /* written by resize() in scene.ts, read by the camera block in loop.ts */
  camZ: 13
};
