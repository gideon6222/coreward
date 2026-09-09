/* The instrument cluster.

   Playtest: *"Instead of having what looks like status bars at the top for
   these, can you make them look more like analog gauge? Have the fuel gauge
   toward the bottom left that looks like a cars fuel gauge with a tac. Inside
   that, have a weight gauge ... then add an indicator for hull health ...
   Stylize them to look like old mining or diving gauges/equipment."*

   Three readings on two dials, in the corner the left thumb already lives in:

     the big dial   FUEL on the main scale and needle, DRILL LOAD on the outer
                    ring, and CARGO on a sub-dial let into the face
     the small dial HULL, with heat soak as a red sector eating the top of the
                    scale - the same story the old bar told, in the shape a
                    pressure gauge tells it

   SVG rather than canvas: crisp at any pixel density with no redraw, each
   needle is one transform and each arc is one property.

   `pathLength="100"` is the trick that makes the arcs cheap. It renormalises a
   path so its length is exactly 100 whatever its real geometry, so "show 62 per
   cent" is `stroke-dasharray: 62 100` and nothing needs to know the radius. It
   is also directly readable from a test, which is how the heat assertion
   survived the bars being deleted. */

import { clamp } from './util';
import { asExpRate } from './feel';

/* How fast a needle chases its reading.

   Not instant, and this is the single detail that separates an analog gauge
   from a bar with a pointer on it: a real needle has mass and a spring, so it
   lags a change and overshoots nothing. Fuel is heavily damped because it only
   ever falls slowly; the load needle is quick because it is showing something
   that changes in a tenth of a second. */
const NEEDLE_FUEL = asExpRate(9);
const NEEDLE_LOAD = asExpRate(26);
const NEEDLE_SLOW = asExpRate(11);

type Dial = {
  el: SVGElement;
  cx: number; cy: number; sweep: number;
  cur: number; want: number; rate: number;
};
const needles: Dial[] = [];

function needle(id: string, rate: number, cx: number, cy: number, sweep: number): Dial {
  const el = document.getElementById(id) as unknown as SVGElement;
  const d: Dial = { el, cx, cy, sweep, cur: 0, want: 0, rate };
  needles.push(d);
  return d;
}

let fuelN: Dial, loadN: Dial, weightN: Dial, hullN: Dial;

const arcs: Record<string, SVGElement | null> = {};
function setArc(id: string, v: number, fromEnd = false) {
  const a = arcs[id];
  if (!a) return;
  const pct = clamp(v, 0, 1) * 100;
  a.setAttribute('stroke-dasharray', pct.toFixed(2) + ' 100');
  /* Heat grows DOWN from the full end of the hull scale rather than up from
     empty, which is the same story the old bar told: soak and hull are not the
     same quantity, so they must not advance in the same direction. A negative
     dash offset slides the single dash to the far end of the path. */
  if (fromEnd) a.setAttribute('stroke-dashoffset', (pct - 100).toFixed(2));
}

/* Tick marks, generated rather than written out.

   Thirty hand-placed lines of SVG is thirty chances to be half a degree out,
   and it would all have to be redone for the second dial. The geometry is four
   lines of trigonometry; the markup is not worth owning. */
function ticks(
  hostId: string, count: number, r0: number, r1: number, minorEvery: number,
  cx: number, cy: number, sweep: number
) {
  const host = document.getElementById(hostId);
  if (!host) return;
  const NS = 'http://www.w3.org/2000/svg';
  for (let i = 0; i <= count; i++) {
    const a = ((-sweep + (i / count) * sweep * 2) * Math.PI) / 180;
    const major = i % minorEvery === 0;
    const from = major ? r0 : r0 + (r1 - r0) * 0.45;
    const ln = document.createElementNS(NS, 'line');
    ln.setAttribute('x1', (cx + Math.sin(a) * from).toFixed(2));
    ln.setAttribute('y1', (cy - Math.cos(a) * from).toFixed(2));
    ln.setAttribute('x2', (cx + Math.sin(a) * r1).toFixed(2));
    ln.setAttribute('y2', (cy - Math.cos(a) * r1).toFixed(2));
    ln.setAttribute('class', major ? 'tk maj' : 'tk');
    host.appendChild(ln);
  }
}

let built = false;

export function buildGauges() {
  if (built) return;
  built = true;
  ticks('fuelTicks', 20, 29.5, 36.5, 5, 50, 50, 120);
  ticks('weightTicks', 8, 10, 13.5, 4, 50, 68, 78);
  ticks('hullTicks', 12, 25, 32.5, 3, 50, 50, 118);

  fuelN = needle('fuelNeedle', NEEDLE_FUEL, 50, 50, 120);
  loadN = needle('loadNeedle', NEEDLE_LOAD, 50, 50, 120);
  weightN = needle('weightNeedle', NEEDLE_SLOW, 50, 68, 78);
  hullN = needle('hullNeedle', NEEDLE_SLOW, 50, 50, 118);

  for (const id of ['loadArc', 'weightArc', 'soakArc']) {
    arcs[id] = document.getElementById(id) as unknown as SVGElement | null;
  }
}

/* Targets, set from game state. Nothing here draws a frame. */
export function setGauges(fuel: number, load: number, weight: number, hull: number, soak: number) {
  if (!built) return;
  fuelN.want = clamp(fuel, 0, 1);
  loadN.want = clamp(load, 0, 1);
  weightN.want = clamp(weight, 0, 1);
  hullN.want = clamp(hull, 0, 1);
  /* Soak has no needle, so it is written straight through: it is a sector on
     the hull scale rather than a pointer, and a coolant flush zeroing it wants
     to read as the red retreating, not as a needle swinging. */
  setArc('soakArc', clamp(soak, 0, 1), true);

  /* The hold warns before it stops you. An arc that is merely full says nothing
     you did not know when it was nearly full; a sub-dial that starts pulsing is
     something you catch while looking somewhere else. */
  const cluster = document.getElementById('cluster');
  if (cluster) cluster.classList.toggle('heavy', weight > 0.85);
}

/* Move the needles. Called once a frame with the real delta, because the
   smoothing is what makes them read as needles rather than as pointers. */
export function stepGauges(dt: number) {
  if (!built) return;
  for (const d of needles) {
    d.cur += (d.want - d.cur) * (1 - Math.exp(-d.rate * dt));
    const deg = -d.sweep + d.cur * d.sweep * 2;
    d.el.setAttribute('transform', `rotate(${deg.toFixed(2)} ${d.cx} ${d.cy})`);
  }
  /* The arcs follow the SMOOTHED needle rather than the raw reading, so an arc
     and the needle over it can never disagree mid-sweep. */
  setArc('loadArc', loadN.cur);
  setArc('weightArc', weightN.cur);
}
