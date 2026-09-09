/* Shared mutable loop state.

   These were plain `let` bindings at the top of app.ts. Once the file is split
   they are written in one module and read in another, and you cannot assign to
   an imported binding — `import { shake } from ...; shake = 0.5` is a compile
   error. So they live on one mutable object, exactly the way `g` already does.

   Only state that genuinely crosses a module boundary belongs here. Things the
   frame loop alone touches (camZBoost, freeze, thrustLevel, bank, last,
   skyTick) stay local to loop.ts, and per-module caches (lastRow, pHead,
   resetArmed) stay with their module. */

import type { Dir, Dig, Flight } from './types';
import { blankLog } from './telemetry';

export const R = {
  /* input -> loop */
  held: null as Dir | null,

  /* loop -> ui: how hard the machine is working right now, 0 to 1 - the drill
     while it is cutting, the thrusters while they are firing. Lives here only
     because the instrument cluster needs a needle for it and thrustLevel is a
     local of the frame loop. */
  load: 0,

  /* actions <-> loop */
  /* Velocity, in cells per second. Replaced the cell-to-cell `moving` lerp:
     the ship has a position and a speed now, and the frame loop integrates
     them like anything else. */
  vx: 0,
  vy: 0,
  /* Edge trigger for arriving at the pad, since selling used to happen on
     landing in a cell and there are no cell arrivals any more. */
  wasAtSurface: true,
  digging: null as Dig | null,
  /* This run's telemetry. Lives here rather than in `g` because it is reset at
     the pad and folded into the all-time totals there; only the totals are
     worth saving. */
  run: blankLog(),
  flight: null as Flight | null,

  /* actions -> loop: what is currently eating the hull, so the tow screen
     names the right cause. Heat is the default because it is the only
     continuous drain; a gas pocket overwrites it on the frame it fires. */
  hullCause: 'heat' as 'heat' | 'gas',

  /* Whether the last frame was inside the heat zone, so crossing in can
     announce itself once instead of every frame. */
  wasHot: false,

  /* Tremor clock. `tremorT` counts down to the next one and is reset whenever
     the ship leaves the unstable band, so surfacing genuinely resets the
     threat rather than merely pausing it. */
  tremorT: 0,
  tremorWarn: 0,

  /* Say "hold full" once per trip, not once per block. */
  warnedFull: false,

  /* actions -> loop, decayed by the loop */
  shake: 0,
  squash: 0,

  /* written by resize() in scene.ts, read by the camera block in loop.ts */
  camZ: 13
};
