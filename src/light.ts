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
  /* what one step of travel THROUGH rock costs on top of its geometry */
  solidStep: number;
};

/* Turn the feel constants, which are written in CELLS because that is the unit
   a person can picture, into the units a solve at `sub` samples per cell needs.

   Two conversions and both are one line, which is the point of doing it here
   rather than at three call sites:

     att  is per unit of detour, and a detour measured in sub-cells is `sub`
          times the same detour measured in cells
     solidStep falls out of the seep: travelling one CELL through rock must
          leave exp(-att * step) equal to the per-cell seep, and that works out
          the same whatever the sampling is

   Passing sub = 1 gives cell-unit behaviour, which is what the golden tests
   use - they are about the geometry, not the resolution. */
export function subOpts(att: number, pinch: number, seep: number, sub: number): LightOpts {
  return { att: att / sub, pinch, solidStep: -Math.log(seep) / att };
}

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

   Rock passes light on ONLY TO MORE ROCK. That one rule does two jobs. It
   keeps a sealed cave sealed - if rock could reach open air, a one-cell wall
   would leak a third of the lamp into the chamber behind it and the shadow the
   player is reading would be a lie. And it turns the fade into the mass into a
   distance transform that comes out of the same Dijkstra, at whatever
   resolution the grid happens to be, instead of a fixed number of whole-cell
   passes.

   That second half is why this replaced an iterated seep. A per-cell seep can
   only ever produce per-cell values, and a cell is a big thing on screen: the
   rock ended up as visibly distinct patches, roughly 2.5x apart in brightness
   between neighbours, with hard edges. Running the same solve at three samples
   per cell gives a gradient that varies WITHIN a cell and follows the shape of
   the tunnel rather than the shape of the grid. */
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
    const fromRock = solid[c] !== 0;

    for (let k = 0; k < 8; k++) {
      const dx = NX[k], dy = NY[k];
      const ni = i + dx, nj = j + dy;
      if (ni < 0 || ni >= cols || nj < 0 || nj >= rows) continue;
      const nc = nj * cols + ni;
      if (seen[nc]) continue;
      /* The one rule: rock never lights open air. */
      if (fromRock && !solid[nc]) continue;

      let step: number;
      if (dx === 0 || dy === 0) {
        step = 1;
      } else if (fromRock) {
        /* Inside the mass every neighbour is rock, so the corner rule below
           would forbid every diagonal and the fade would come out diamond
           shaped. */
        step = DIAG;
      } else {
        /* Both corners rock means a diagonal crack, and light does not squeeze
           through a crack that has no opening. One corner rock means it is
           grazing an edge, which costs but is allowed - without that, light
           turning a corner would arrive as a hard diagonal line. */
        const a = solid[j * cols + ni], b = solid[nj * cols + i];
        if (a && b) continue;
        step = DIAG + (a || b ? o.pinch : 0);
      }
      /* Entering the FIRST wall is free of this: that face is the surface the
         lamp is falling on. Only rock-to-rock pays. */
      if (fromRock) step += o.solidStep;
      const nd = dist[c] + step;
      if (nd < dist[nc]) { dist[nc] = nd; h.push(nc); }
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
      /* Where the ray actually MEETS the wall. Not the far corner of the cell,
         and this is the difference between one lamp and several.

         The far corner was here to stop a rock face falling into its own
         shadow, from back when rock sampled this fan. It does not any more -
         see coreReach in lightmap.ts, which has no shadow term at all - so the
         only thing left reading the fan is the air in a tunnel, and the air is
         only ever in open cells. The reason was gone; the cost was not.

         The cost is that a cell's far corner is CONSTANT across the whole cell
         and then jumps to the next cell's. Occlusion against angle came out as
         a staircase, one plateau per wall cell, and each plateau draws as its
         own cone. Playtest, and an exactly correct diagnosis from a screenshot:
         *"it looks like you are creating the shadows by sending out multiple
         cone shape beams ... since the light should be coming from one location
         it shouldn't be split into more than one beam."* One lamp, quantised
         per block into several.

         The entry distance has no such steps. Along a flat wall it is
         (wall - lamp) / cos(angle), which is smooth in angle, so the shadow
         boundary is a single silhouette. It jumps only at a real corner, which
         is the one place a shadow is supposed to jump. */
      return enter;
    }
  }
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
