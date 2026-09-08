/* Free flight: integrate a velocity, then push out of anything solid.

   The ship used to hop cell to cell on a fixed timer, which made every
   movement a discrete decision and the world feel like a spreadsheet. It flies
   now. This module is the part that has to be right - the frame loop only
   feeds it a direction and reads back where the ship ended up - and it is pure
   so it can be tested without a renderer.

   Cells are unit squares centred on integer coordinates, so cell (cx, cy)
   spans [cx-0.5, cx+0.5] on each axis and the column containing a point p is
   Math.round(p). */

export interface FlyResult {
  x: number; y: number;
  vx: number; vy: number;
  /* The cell that stopped the ship on each axis, or null. This is how digging
     starts: you fly into a wall, the wall stops you, and the wall it was is
     the block the drill points at. */
  hitX: { x: number; y: number } | null;
  hitY: { x: number; y: number } | null;
}

/* Sitting exactly flush against a face means the next frame's rounding puts
   the ship's edge back inside the cell it just left. Backing off by a
   ten-thousandth costs nothing visually and makes the contact test stable. */
const SKIN = 1e-4;

/* A fast ship crossing a thin cell in one frame would tunnel straight through
   it. Splitting any step longer than this into pieces is cheaper and far
   simpler than a swept test, and at a top speed of ten cells per second it
   almost never costs more than two iterations. */
const MAX_STEP = 0.3;

type Solid = (cx: number, cy: number) => boolean;

function sweep(
  x: number, y: number, vx: number, vy: number, dt: number, r: number, solid: Solid
): FlyResult {
  let hitX: FlyResult['hitX'] = null;
  let hitY: FlyResult['hitY'] = null;

  /* X first, then Y, each resolved on its own. Axis separation is what lets
     the ship slide along a wall instead of catching on it: blocked sideways
     does not mean blocked downward. */
  let nx = x + vx * dt;
  if (vx !== 0) {
    const edge = nx + Math.sign(vx) * r;
    const col = Math.round(edge);
    for (let row = Math.round(y - r); row <= Math.round(y + r); row++) {
      if (!solid(col, row)) continue;
      nx = col - Math.sign(vx) * (0.5 + r + SKIN);
      hitX = { x: col, y: row };
      vx = 0;
      break;
    }
  }

  let ny = y + vy * dt;
  if (vy !== 0) {
    const edge = ny + Math.sign(vy) * r;
    const row = Math.round(edge);
    for (let col = Math.round(nx - r); col <= Math.round(nx + r); col++) {
      if (!solid(col, row)) continue;
      ny = row - Math.sign(vy) * (0.5 + r + SKIN);
      hitY = { x: col, y: row };
      vy = 0;
      break;
    }
  }

  return { x: nx, y: ny, vx, vy, hitX, hitY };
}

export function moveAndCollide(
  x: number, y: number, vx: number, vy: number, dt: number, r: number, solid: Solid
): FlyResult {
  const dist = Math.max(Math.abs(vx), Math.abs(vy)) * dt;
  const steps = Math.max(1, Math.ceil(dist / MAX_STEP));
  const sub = dt / steps;

  let out: FlyResult = { x, y, vx, vy, hitX: null, hitY: null };
  for (let i = 0; i < steps; i++) {
    const step = sweep(out.x, out.y, out.vx, out.vy, sub, r, solid);
    /* Keep the first contact of each axis rather than the last: a ship that
       stops against a wall reports null for every substep after the one that
       stopped it, and the caller needs to know what it hit. */
    out = {
      x: step.x, y: step.y, vx: step.vx, vy: step.vy,
      hitX: out.hitX || step.hitX,
      hitY: out.hitY || step.hitY
    };
    if (out.vx === 0 && out.vy === 0) break;
  }
  return out;
}

/* Thrust toward a held direction, and coast to a stop when nothing is held.

   Exponential rather than linear on both, for the same reason the camera is:
   the result must not depend on frame rate. `accel` and `drag` are per-second
   rates, and `top` is the speed the ship settles at under continuous thrust. */
export function thrust(
  v: number, dir: number, top: number, accel: number, drag: number, dt: number
): number {
  if (dir !== 0) {
    const target = dir * top;
    return target + (v - target) * Math.exp(-accel * dt);
  }
  return v * Math.exp(-drag * dt);
}

/* ---------- lanes ----------

   Free flight fixed how the ship *reads* and broke how it *aims*. Off a lane
   the ship's 0.34 radius overlaps two rows at once, so the cell the collision
   reported was not always the cell `Math.round()` said was ahead - and the two
   disagreeing is what made the drill refuse to start and the ship snag on
   openings it was clearly wide enough for.

   The world is still built on cells, so the answer is not to fly off the grid
   but to fly *along* it: travel freely down a lane, and be continuously drawn
   onto the centre line of the lane you are not travelling along. All the
   momentum stays; the ambiguity goes.

   Returned as a velocity rather than applied as a position, so it goes through
   the same collision as everything else and can never push the ship into rock.
   Exponential, so it does not depend on frame rate. */
export function laneVel(p: number, rate: number, dt: number): number {
  if (dt <= 0) return 0;
  const lane = Math.round(p);
  const next = lane + (p - lane) * Math.exp(-rate * dt);
  return (next - p) / dt;
}
