import { g, save, setWorld } from './state';
import { chartFor, type Destination } from './chart';
import { coreDepth, planetName, paletteOf, TRAIT_OF, skyLo } from './config';
import { R } from './runtime';
import { sfx } from './audio';
import { goSurface, stopDigging } from './actions';
import { meshes, dropBlock, syncBlocks, resetBlockCache } from './blocks';
import { syncDrops } from './drops';
import { resetLight } from './lightmap';
import { beginTransit, endTransit } from './transit';
import { partFor, partName, driveComplete, DRIVE_SLOTS,
         HEART_WORLD, HEART_TRAIT, HEART_CORE_OFF, HEART_RICH } from './drive';

/* The chart's own elements, looked up on demand rather than added to the `ui`
   map. That map is built at boot and asserts every id exists; these live in a
   screen that only appears after a core breaks, and keeping them out of it
   means the chart cannot stop the game from starting. */
function chartEl(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error('chart: missing #' + id);
  return el;
}


/* The chart screen, and the hand-off into the crossing.

   Kept apart from chart.ts, which is pure and unit-tested. The rule this
   follows is the one the whole codebase is built on: the thing that DECIDES
   what is out there has no renderer in it, and the thing that draws it has no
   logic. chartFor() can be walked over two hundred legs by a golden test;
   this file cannot be tested at all, so there is as little in it as possible. */

function card(d: Destination, i: number, base: number): string {
  const t = d.world === HEART_WORLD
    ? { name: 'The Heart of the Drift',
        blurb: 'Whatever the Drift is turning around, it is down there. Deeper than anything you have cut, and hot the whole way.' }
    : TRAIT_OF[d.trait];
  const col = '#' + skyLo(d.world).toString(16).padStart(6, '0');
  const need = partFor(d.trait);
  const short = g.fuel < d.fuel && false;   /* transit is paid from the tank you refill on arrival */
  const depth = base + d.coreOff;
  return '<button class="dest' + (short ? ' short' : '') + '" data-i="' + i + '"' +
    ' style="--dc:' + col + '">' +
    '<div class="dname">' + planetName(d.world) + '</div>' +
    '<div class="dtrait">' + t.name.toUpperCase() + '</div>' +
    '<div class="dblurb">' + t.blurb + '</div>' +
    '<div class="drow">' +
      '<span>Core <b>' + depth + ' m</b></span>' +
      '<span>Ore <b>' + Math.round(d.rich * 100) + '%</b></span>' +
      '<span class="dfuel">Crossing <b>' + d.fuel + ' fuel</b></span>' +
    '</div>' +
    (d.world === HEART_WORLD
      ? '<div class="dpart">◆ The drive is complete. This is the way out.</div>'
      : need && !g.drive.includes(need)
      ? '<div class="dpart">◆ ' + partName(need) + ' is buried here</div>' : '') +
    '</button>';
}

/* The route the completed drive opens. Offered ALONGSIDE the ordinary three
   rather than instead of them: a player who has just finished the drive may
   still want a run to kit out first, and forcing the ending the moment it
   becomes available would turn the last five minutes of a long game into
   something that happened to them. */
const HEART: Destination = {
  world: HEART_WORLD, trait: HEART_TRAIT,
  coreOff: HEART_CORE_OFF, rich: HEART_RICH, fuel: 30
};

export function openChart() {
  const leg = g.planet + 1;
  const opts = chartFor(leg);
  if (driveComplete(g.drive)) opts.unshift(HEART);
  const base = coreDepth(leg);
  g.mode = 'chart';
  chartEl('chartSub').textContent = 'Core Shards ' + g.shards + ' · Jump Drive ' +
    g.drive.length + '/' + DRIVE_SLOTS;
  chartEl('chartCards').innerHTML = opts.map((d, i) => card(d, i, base)).join('');
  chartEl('chartFoot').textContent = driveComplete(g.drive)
    ? 'The drive is complete. A route to the Heart is open.'
    : 'A component left in the ground goes with the planet when its core breaks.';
  chartEl('chart').classList.remove('hidden');
  for (const el of Array.from(chartEl('chartCards').querySelectorAll('.dest'))) {
    (el as HTMLElement).onclick = () => {
      sfx.ui();
      chartEl('chart').classList.add('hidden');
      travelTo(opts[Number((el as HTMLElement).dataset.i)], leg);
    };
  }
}

/* The crossing. Nine seconds, and the arrival is what actually changes the
   world - everything before it is presentation. */
const TRANSIT_SECS = 9;

export function travelTo(d: Destination, leg: number) {
  const fromWorld = g.world;
  stopDigging();
  R.flight = null;
  R.vx = 0; R.vy = 0; R.held = null;
  g.mode = 'transit';
  R.transit = { t: 0, dur: TRANSIT_SECS, dest: d, leg };
  document.body.classList.add('crossing');
  const skip = chartEl('skipCross');
  skip.classList.remove('hidden');
  skip.onclick = () => { sfx.ui(); skipTransit(); };
  beginTransit(fromWorld, d.world);
  sfx.thrust();
}

/* Called by the frame loop when the crossing runs out. Everything that makes
   the new world the new world happens here, in one place, because the failure
   mode of scattering it is a map that still remembers the last planet's
   holes - see the per-cell note in CLAUDE.md. */
export function arrive() {
  const tr = R.transit;
  if (!tr) return;
  R.transit = null;
  document.body.classList.remove('crossing');
  chartEl('skipCross').classList.add('hidden');
  endTransit();

  setWorld(tr.leg);
  g.world = tr.dest.world;
  g.trait = tr.dest.trait;
  g.coreOff = tr.dest.coreOff;
  g.rich = tr.dest.rich;

  /* Cell keys carry no planet, so every per-cell map has to be cleared
     together or the new world inherits the old one's tunnels. */
  g.dug = new Set();
  g.rubble = new Set();
  g.damage = {};
  g.drops = {}; syncDrops();
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  resetBlockCache();
  resetLight();
  goSurface();
  syncBlocks(true);
  g.mode = 'play';
  save();
}

/* The whole crossing is skippable, and it has to be: a cutscene you cannot
   skip is a tax on every planet after the first one. */
export function skipTransit() {
  /* Jumps the clock rather than calling arrive() directly, so the crossing
     ends through exactly one path. Two ways to finish it is two places for the
     next person to forget to clear the old world's tunnels. */
  if (R.transit) R.transit.t = R.transit.dur;
}

