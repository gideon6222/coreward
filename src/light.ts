/* The lighting solver.

   Pure: no three.js, no DOM, no renderer. It takes a grid of "is this cell
   rock" and the cell the ship is in, and returns how much of the lamp reaches
   every cell. The renderer turns that into a texture; nothing in here knows
   that is what happens to it.

   The idea in one line: light is only allowed to travel through open cells, so
   the distance that matters is the distance ALONG THE TUNNEL, not the distance
   across the rock in between.

   That single rule produces everything the lighting is supposed to say:

     - a shaft you have dug lights all the way down, because the path is short
     - a side branch is dim, because the light had to go round the corner and
       the path is longer than the straight line
     - rock you have never opened is black, because there is no path to it at
       all

   What is stored per cell is not brightness but VISIBILITY: how much longer
   the light's actual path was than a clear run through open air would have
   been. Nothing else. Distance falloff is deliberately left out, and is done
   per pixel in the shader from the ship's exact position, because the ship
   moves continuously and this grid does not. Splitting it that way is what
   stops the pool of light stepping from cell to cell as you fly. */

/* Movement is eight-way, so the shortest clear-air path between two cells is
   the octile distance, not the Euclidean one. Subtracting the RIGHT baseline
   is the whole reason open space comes out at full brightness: get it wrong
   and every distant cell looks slightly occluded by nothing at all. */
const DIAG = Math.SQRT2;
export function octile(dx: number, dy: number): number {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  return Math.max(ax, ay) + (DIAG - 1) * Math.min(ax, ay);
}

export type LightOpts = {
  /* how fast light dies per unit of DETOUR - not per unit of distance */
  att: number;
  /* extra cost for a diagonal that has to slip past one rock corner */
  pinch: number;
  /* how much of a lit face carries into the rock behind it, per cell */
  seep: number;
  /* how many cells into the rock that carries at all */
  seepSteps: number;
};

/* A binary heap over cell indices, keyed by the dist array. Written out rather
   than pulled in because the whole solver is one array walk and a dependency
   here would be most of the module. */
class Heap {
  private a: Int32Array;
  private n = 0;
  constructor(cap: number, private d: Float32Array) { this.a = new Int32Array(cap); }
  get size() { return this.n; }
  clear() { this.n = 0; }
  push(v: number) {
    if (this.n >= this.a.length) return;      /* cannot happen: cap is cells*8 */
    let i = this.n++;
    this.a[i] = v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.d[this.a[p]] <= this.d[this.a[i]]) break;
      const t = this.a[p]; this.a[p] = this.a[i]; this.a[i] = t;
      i = p;
    }
  }
  pop(): number {
    const top = this.a[0];
    this.a[0] = this.a[--this.n];
    let i = 0;
    for (;;) {
      const l = i * 2 + 1, r = l + 1;
      let s = i;
      if (l < this.n && this.d[this.a[l]] < this.d[this.a[s]]) s = l;
      if (r < this.n && this.d[this.a[r]] < this.d[this.a[s]]) s = r;
      if (s === i) break;
      const t = this.a[s]; this.a[s] = this.a[i]; this.a[i] = t;
      i = s;
    }
    return top;
  }
}

/* The eight neighbours, orthogonals first so the cheap steps are tried before
   the diagonals and the heap does less work. */
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NY = [0, 0, 1, -1, 1, -1, 1, -1];

/* Scratch that survives between calls. The solver runs on one grid size for
   the life of the page, so allocating per solve would be pure garbage. */
let dist: Float32Array = new Float32Array(0);
let seen: Uint8Array = new Uint8Array(0);
let spare: Float32Array = new Float32Array(0);
let heap: Heap | null = null;

/* Solve one grid.

   `solid` is row-major, 1 for rock and 0 for open. `out` is written with the
   visibility of every cell in 0..1 and returned.

   Rock is relaxed but never EXPANDED: a wall next to a lit tunnel is lit,
   and light stops there. That is what keeps a sealed cave sealed - if rock
   could pass light on, a one-cell wall would leak a third of the lamp into
   the chamber behind it and the shadow the player is reading would be a lie.
   The gradient into the mass is a separate seep pass below, which only ever
   writes to rock, so it cannot leak into open air either. */
export function solveVis(
  solid: Uint8Array, cols: number, rows: number,
  si: number, sj: number,
  o: LightOpts,
  out: Float32Array
): Float32Array {
  const n = cols * rows;
  if (dist.length !== n) {
    dist = new Float32Array(n);
    spare = new Float32Array(n);
    seen = new Uint8Array(n);
    heap = null;
  }
  if (!heap) heap = new Heap(n * 8 + 8, dist);
  const h = heap;

  dist.fill(Infinity);
  seen.fill(0);
  out.fill(0);
  h.clear();

  if (si < 0 || si >= cols || sj < 0 || sj >= rows) return out;

  const src = sj * cols + si;
  dist[src] = 0;
  h.push(src);

  while (h.size > 0) {
    const c = h.pop();
    if (seen[c]) continue;
    seen[c] = 1;
    /* Reached, so it gets a value - then, if it is rock, the walk ends here. */
    const j = (c / cols) | 0, i = c - j * cols;
    out[c] = Math.exp(-o.att * Math.max(0, dist[c] - octile(i - si, j - sj)));
    if (solid[c]) continue;

    for (let k = 0; k < 8; k++) {
      const dx = NX[k], dy = NY[k];
      const ni = i + dx, nj = j + dy;
      if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue;
      const nc = nj * cols + ni;
      if (seen[nc]) continue;

      let step: number;
      if (dx === 0 || dy === 0) {
        step = 1;
      } else {
        /* Both corners rock means a diagonal crack, and light does not squeeze
           through a crack that has no opening. One corner rock means it is
           grazing an edge, which costs but is allowed - without that, light
           turning a corner would arrive as a hard diagonal line. */
        const a = solid[j * cols + ni], b = solid[nj * cols + i];
        if (a && b) continue;
        step = DIAG + (a || b ? o.pinch : 0);
      }
      const nd = dist[c] + step;
      if (nd < dist[nc]) { dist[nc] = nd; h.push(nc); }
    }
  }

  /* The gradient into the mass.

     A wall one cell thick catches the lamp; the rock behind it should fade,
     not cut to black at a cell boundary. Each pass carries a fraction of the
     brightest neighbour one cell deeper into rock, double buffered so the
     result does not depend on which way the loop happens to scan. */
  for (let pass = 0; pass < o.seepSteps; pass++) {
    spare.set(out);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const c = j * cols + i;
        if (!solid[c]) continue;
        let best = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const nj = j + dy;
          if (nj < 0 || nj >= rows) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const ni = i + dx;
            if (ni < 0 || ni >= cols || (dx === 0 && dy === 0)) continue;
            const v = spare[nj * cols + ni];
            if (v > best) best = v;
          }
        }
        const lit = best * o.seep;
        if (lit > out[c]) out[c] = lit;
      }
    }
  }
  return out;
}

/* Scroll a solved field to follow the window.

   The grid covers a fixed number of rows around the ship, so descending one
   metre moves every cell's meaning up one row. Without this the smoothed field
   would keep applying the old row's value to the new row's cell and the whole
   thing would smear downward as you dig.

   Rows shifted in from outside are cleared rather than guessed: they are off
   the bottom or top of the streamed terrain, so nothing is looking at them
   yet, and the next solve fills them before anything does. */
export function shiftField(a: Float32Array, cols: number, rows: number, n: number) {
  if (n === 0) return a;
  if (Math.abs(n) >= rows) { a.fill(0); return a; }
  if (n > 0) {
    /* the window moved DOWN: row n becomes row 0 */
    a.copyWithin(0, n * cols);
    a.fill(0, (rows - n) * cols);
  } else {
    a.copyWithin(-n * cols, 0, (rows + n) * cols);
    a.fill(0, 0, -n * cols);
  }
  return a;
}

/* ---------- hard shadows ----------

   The flood above answers "can light get here at all", and it answers it
   softly: a cell reached by a longer path is dimmer. What it cannot produce is
   an EDGE. Light that turns a corner in the flood arrives from the corner in
   every direction at once, so a tunnel crossing your path lights up along its
   whole length, gently, when what should happen is that the corner throws a
   shadow into it that grows the further away you are.

   That is a different question - a question about straight lines from a point -
   and it gets its own solver.

   This is the classic 2D lighting answer: cast a fan of rays from the lamp and
   record, per angle, how far light gets before something stops it. The result
   is a one-dimensional map of the world as the lamp sees it, and a fragment is
   in shadow if it is further from the lamp than the occluder at its own angle.
   Sharp by construction, exact for any geometry, and the wedge behind a corner
   widens with distance for free, because that is what a fan of rays does.

   Costs nothing worth measuring: a few hundred rays of grid DDA per frame, and
   one texture fetch per pixel. It has to run every frame rather than on cell
   changes, because the whole point is that the shadow moves as the ship does.

   Recorded distance is to the FAR side of the first wall hit, not the near
   side. The face of a wall is the surface the lamp is falling on and has to
   stay lit; shadow starts behind it. Getting that wrong puts every rock face
   in the game in its own shadow. */

const TAU = Math.PI * 2;

function rayHit(
  solid: Uint8Array, cols: number, rows: number,
  li: number, lj: number, dx: number, dy: number, maxDist: number
): number {
  let ix = Math.floor(li + 0.5), iy = Math.floor(lj + 0.5);
  if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) return 0;

  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  const adx = Math.abs(dx), ady = Math.abs(dy);
  const dtx = adx > 1e-9 ? 1 / adx : Infinity;
  const dty = ady > 1e-9 ? 1 / ady : Infinity;
  /* how far along the ray the first cell boundary is, per axis */
  let tx = adx > 1e-9 ? (ix + sx * 0.5 - li) / dx : Infinity;
  let ty = ady > 1e-9 ? (iy + sy * 0.5 - lj) / dy : Infinity;

  for (;;) {
    const enter = tx < ty ? tx : ty;
    if (enter > maxDist) return maxDist;
    if (tx < ty) { ix += sx; tx += dtx; } else { iy += sy; ty += dty; }
    /* outside the grid entirely: nothing out there to light */
    if (ix < 0 || ix >= cols || iy < 0 || iy >= rows) return enter;
    if (solid[iy * cols + ix]) {
      /* The FARTHEST corner of the cell, not where this particular ray happens
         to leave it.

         The fan is sampled by angle and interpolated between neighbouring rays,
         so a fragment's occluder is a blend of two rays that may have clipped
         quite different parts of the wall. With the exit distance, parts of a
         cell end up beyond their own occluder and fall into shadow - on screen,
         a hard diagonal cut across every single block in the frame, which reads
         as every rock casting a shadow on itself. Found by eye in a playtest.

         The rule the fan exists to express is "the first wall is lit", and a
         wall is a whole cell. The far corner makes the recorded value large
         enough, and smooth enough across the cell, that every fragment of it
         clears its own occluder. Bleeding a fraction of a cell past the wall
         costs nothing: behind it is either more rock, which the seep already
         darkens, or open air the flood never reached, which is zero anyway. */
      const far = farCorner(li, lj, ix, iy);
      return far < maxDist ? far : maxDist;
    }
  }
}

/* Distance from the lamp to the farthest of a cell's four corners. */
function farCorner(li: number, lj: number, ix: number, iy: number): number {
  const dx = Math.abs(ix - li) + 0.5, dy = Math.abs(iy - lj) + 0.5;
  return Math.sqrt(dx * dx + dy * dy);
}

/* Fill `out` with one occluder distance per angle, evenly around the lamp.
   Ray k covers angle (k + 0.5) / out.length of a full turn, which is the
   convention the shader's texture lookup assumes. */
export function castShadows(
  solid: Uint8Array, cols: number, rows: number,
  li: number, lj: number, maxDist: number,
  out: Float32Array
): Float32Array {
  const n = out.length;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * TAU;
    out[k] = rayHit(solid, cols, rows, li, lj, Math.cos(a), Math.sin(a), maxDist);
  }
  return out;
}
