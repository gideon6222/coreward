/* The map.

   Playtest: *"find more secrets, random caves, and other things to make the
   planet feel mysterious and intriguing ... I dont want to just try to dig to
   the bottom."*

   There was no map in this game of anything. Not of the tunnels, not of where
   you had been, not of what you had found. That is survivable in fifty-eight
   metres of straight-down and fatal in a world that is 61 by 452 and meant to
   be worth exploring - and every mystery device the research names needs one
   to work at all. "Not yet understood" has to read as a tracked goal rather
   than as confusion, and the thing that does the tracking is this.

   Drawn to a canvas rather than built from elements. A fully explored world is
   1,808 seen tiles and can be thousands of dug cells; as divs that is thousands
   of layout boxes, and as fillRect calls it is one node and a couple of
   milliseconds. It only redraws when the screen opens or the finger moves.

   ---------- what is on it ----------

   Four layers, back to front, each answering a different question:

     the UNSEEN      nothing at all. Most of the world, most of the time, and
                     the reason the map is worth opening again later
     the SEEN        a dim wash in the region's own colour: "you have been down
                     this way". Coarse, four cells to a tile
     the TUNNELS     exact, bright, from `dug`. These are yours, and they are
                     what you actually recognise
     the MARKS       the pad, the ship, and where the notable things were

   Region names sit over their own ground, so the map is also where you find
   out that the place you are standing in is called Kryllon - and a region you
   have never entered is three question marks, because a map that lists twelve
   names you have never seen is a table of contents. The research is explicit
   that too many open hooks at once reads as confusion rather than as mystery. */

import { g, save } from './sim/state';
import { W, paletteOf } from './sim/config';
import { MAP_TILE, WORLD_DEPTH, mapKey, regionAt, regionName,
         REGION_COLS, REGION_ROWS, REGION_COUNT } from './sim/region';
import { el, mustEl } from './ui';
import { sfx } from './audio';
import { isCollapsed, unrestBand, UNREST_BANDS, isLit } from './sim/unrest';
import { ANCHOR_COUNT, anchorAt, anchorSealed,
         vaultOpen, VAULT_CORE_X, VAULT_CORE_D } from './sim/vaults';

/* The pad sits at the middle column, which is also where every run starts. */
const PAD_COL = Math.floor(W / 2);

/* Fitted to the WIDTH, so the whole world is always across the screen and only
   the depth scrolls. That is the right way round for a world seven times
   deeper than it is wide, and it means a shaft's position on the map is its
   position in the world with no mental arithmetic. At 61 columns in about 320
   usable pixels a cell is a shade over five pixels, which is enough for a
   one-cell tunnel to still read as a line. */
const scaleFor = (w: number) => w / W;

let view = 0;             /* the world row at the top of the canvas, in metres */
let dragging = false;
let dragY = 0, dragView = 0;
let wired = false;

/* regionAt() is four seeded hashes deep and gets asked for every tile on
   screen on every frame of a drag. The answer for a given tile never changes,
   so it is asked once per tile per session. */
const regionCache = new Map<string, number>();
function tileRegion(tx: number, ty: number): number {
  const k = tx + ',' + ty;
  let r = regionCache.get(k);
  if (r === undefined) {
    r = regionAt(tx * MAP_TILE + MAP_TILE / 2, ty * MAP_TILE + MAP_TILE / 2);
    regionCache.set(k, r);
  }
  return r;
}

const canvas = () => el('mapCanvas') as HTMLCanvasElement | null;

function rowsOn(c: HTMLCanvasElement) {
  return c.clientHeight / scaleFor(c.clientWidth);
}

function clampView(v: number, rows: number) {
  /* The world starts a couple of metres above the surface so the pad and the
     sky have somewhere to be, and ends at the floor of the deepest region. */
  return Math.max(-2, Math.min(WORLD_DEPTH - rows + 2, v));
}

function centreOnShip() {
  const c = canvas();
  if (!c) return;
  const rows = rowsOn(c);
  view = clampView(g.pd - rows / 2, rows);
}

export function openMap() {
  const scr = el('map');
  if (!scr) return;
  g.mode = 'map';
  scr.classList.remove('hidden');
  /* Opens where the ship is, every time. A map that opens at the top of the
     world and makes you scroll to find yourself is a map you stop opening. */
  centreOnShip();
  draw();
}

export function closeMap() {
  const scr = el('map');
  if (!scr) return;
  scr.classList.add('hidden');
  g.mode = 'play';
  save();
}

/* ---------- the draw ---------- */

export function draw() {
  const c = canvas();
  if (!c) return;
  const cw = c.clientWidth, ch = c.clientHeight;
  if (cw < 2 || ch < 2) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (c.width !== Math.round(cw * dpr) || c.height !== Math.round(ch * dpr)) {
    c.width = Math.round(cw * dpr);
    c.height = Math.round(ch * dpr);
  }
  const x = c.getContext('2d');
  if (!x) return;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);

  const s = scaleFor(cw);
  const rows = ch / s;
  const py = (d: number) => (d - view) * s;

  x.fillStyle = '#05070c';
  x.fillRect(0, 0, cw, ch);

  /* The sky, so the surface is a visible edge rather than where the tiles
     happen to stop. */
  if (view < 0) {
    x.fillStyle = 'rgba(40,58,84,.5)';
    x.fillRect(0, 0, cw, Math.min(ch, py(0)));
  }

  /* ---- the seen wash ---- */
  const seen = new Set(g.seen);
  const known = new Set<number>();
  /* Which regions have been entered is asked of the WHOLE list, not of the
     visible slice: the name on a region twenty metres below the bottom of the
     screen still has to be right when you scroll down to it. */
  for (const k of g.seen) {
    const i = k.indexOf(',');
    known.add(tileRegion(+k.slice(0, i), +k.slice(i + 1)));
  }
  const t0 = Math.floor(Math.max(0, view) / MAP_TILE);
  const t1 = Math.ceil(Math.min(WORLD_DEPTH, view + rows) / MAP_TILE);
  const tw = Math.ceil(W / MAP_TILE);
  for (let ty = t0; ty <= t1; ty++) {
    for (let tx = 0; tx < tw; tx++) {
      if (!seen.has(tx + ',' + ty)) continue;
      /* Painted in the region's own rock colour, so the map reads as the same
         place the game does - the map of Cryon is blue because Cryon is.

         Darkened in the maths rather than drawn through globalAlpha, and that
         is not a style choice. Translucent rects have to overlap by a fraction
         of a pixel to close the seams between them, and every overlap
         double-blends into a line BRIGHTER than either tile - which drew a
         grid over the explored ground by accident, only where tiles happened
         to be adjacent, and nowhere else. Opaque fills have no seam to close
         and no accident to inherit, and the grid below is then deliberate,
         even, and drawn everywhere. */
      /* Fallen ground loses its colour. A region that has come down is not
         somewhere with different rock in it any more, it is somewhere shut. */
      const reg = tileRegion(tx, ty);
      x.fillStyle = isCollapsed(g.ground, reg)
        ? 'rgb(38,34,36)' : dim(paletteOf(reg).rock, 0.34);
      x.fillRect(tx * MAP_TILE * s, py(ty * MAP_TILE),
                 MAP_TILE * s + 1, MAP_TILE * s + 1);
    }
  }

  /* ---- the survey grid, over everything ----

     Drawn across the WHOLE canvas and not only the explored part, which is the
     entire point of it. Without it, ground you have not surveyed is a black
     rectangle, and a black rectangle reads as the map failing rather than as
     somewhere you have not been. Ruled, it reads as a chart with empty squares
     on it - and an empty square on a chart is an invitation.

     One line per tile across, one per tile down, plus a heavier rule and a
     depth on every fiftieth metre, because a world 452 m deep seen 120 m at a
     time needs a scale on it somewhere other than the header. */
  x.strokeStyle = 'rgba(126,148,182,.13)';
  x.lineWidth = 1;
  x.beginPath();
  for (let tx = 1; tx < tw; tx++) {
    const gx = Math.round(tx * MAP_TILE * s) + 0.5;
    x.moveTo(gx, 0); x.lineTo(gx, ch);
  }
  for (let ty = t0; ty <= t1; ty++) {
    const gy = Math.round(py(ty * MAP_TILE)) + 0.5;
    x.moveTo(0, gy); x.lineTo(cw, gy);
  }
  x.stroke();

  x.textBaseline = 'bottom';
  x.textAlign = 'left';
  x.font = '600 9px "Chakra Petch", system-ui, sans-serif';
  for (let d = Math.ceil(Math.max(0, view) / 50) * 50; d < view + rows; d += 50) {
    const gy = Math.round(py(d)) + 0.5;
    x.strokeStyle = 'rgba(126,148,182,.3)';
    x.beginPath(); x.moveTo(0, gy); x.lineTo(cw, gy); x.stroke();
    if (d > 0) {
      x.fillStyle = 'rgba(150,170,200,.75)';
      x.fillText(d + ' m', 3, gy - 2);
    }
  }

  /* ---- the tunnels, exact ---- */
  const d0 = view - 1, d1 = view + rows + 1;
  const cell = Math.max(1.2, s);
  x.fillStyle = '#cbb891';
  for (const k of g.dug) {
    const i = k.indexOf(',');
    const cd = +k.slice(i + 1);
    if (cd < d0 || cd > d1) continue;
    x.fillRect(+k.slice(0, i) * s, py(cd), cell, cell);
  }

  /* ---- region names, and how angry each one is ----

     The map is where Unrest is READ. It is deliberately nowhere else: there is
     no Unrest bar on the HUD, because a meter in the corner of the screen
     while you are digging would turn a place that is getting dangerous into a
     status effect, and the research on withheld rules is that you learn a
     hazard by watching it.

     So it is shown as a bar under a place's name, in that band's colour,
     which answers the only question a player actually asks: which of these
     places is angry, and is the one I am about to go into on that list. There
     is no number and no legend for what the colours mean. */
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (let i = 0; i < REGION_COUNT; i++) {
    const cd = (Math.floor(i / REGION_COLS) + 0.5) * (WORLD_DEPTH / REGION_ROWS);
    if (cd < view || cd > view + rows) continue;
    const cx = ((i % REGION_COLS) + 0.5) * (W / REGION_COLS) * s;
    const hit = known.has(i);
    const down = isCollapsed(g.ground, i);
    x.font = '700 10px "Chakra Petch", system-ui, sans-serif';
    x.fillStyle = down ? 'rgba(214,58,74,.75)'
      : hit ? 'rgba(232,228,218,.42)' : 'rgba(130,145,170,.26)';
    x.fillText(down ? regionName(i).toUpperCase() : hit ? regionName(i).toUpperCase() : '? ? ?',
               cx, py(cd));

    if (down) {
      x.font = '700 8px "Chakra Petch", system-ui, sans-serif';
      x.fillStyle = 'rgba(214,58,74,.65)';
      x.fillText('FALLEN', cx, py(cd) + 12);
      continue;
    }
    /* Only for ground you have been in. An Unrest reading on a region you have
       never entered would be telling you something you have no way to have
       learned, and the map's whole rule is that it shows what you know. */
    if (!hit) continue;
    const u = g.ground.unrest[i];
    const w = 34;
    x.fillStyle = 'rgba(255,255,255,.09)';
    x.fillRect(cx - w / 2, py(cd) + 8, w, 3);
    x.fillStyle = dim(UNREST_BANDS[unrestBand(u)].color, 1);
    x.fillRect(cx - w / 2, py(cd) + 8, w * Math.max(0.04, Math.min(1, u)), 3);
  }

  /* ---- the marks ----

     Where the notable things were, which is the half of "you have explored
     this" that a wash of colour cannot carry. A cache you already emptied is
     still worth a dot: it is how you recognise ground you have picked over. */
  for (const k of g.marks) {
    const p = k.split(',');
    const md = +p[2];
    if (md < d0 || md > d1) continue;
    if (p[0] === 'f') diamond(x, +p[1] * s, py(md), '#00ff41', 5);
    else dot(x, +p[1] * s, py(md), '#ff8fd8', 3);
  }

  /* ---------- the Anchors ----------

     The hunt, on the one screen that can show it. Three states, and which one
     a marker is in is the whole of what the map has to say about the
     objective:

       LIT        a filled ring. Nine of these is the end of the game
       FOUND      a hollow ring - you have surveyed the ground it is in, so you
                  know it is there and have not been to it
       SEALED     the same, in the colour of the stone you cannot cut. The
                  "locked door you can see", and the map is where you see it
                  from once you have walked away

     An Anchor in ground you have never surveyed is not drawn at all. That is
     the rule the whole map runs on and it is what makes lighting one - which
     reveals its whole region - worth the trip. */
  for (let r = 0; r < ANCHOR_COUNT; r++) {
    const a = anchorAt(r);
    if (a.d < d0 || a.d > d1) continue;
    const lit = isLit(g.ground, r);
    if (!lit && !seen.has(mapKey(a.x, a.d))) continue;
    ring(x, a.x * s, py(a.d),
         lit ? '#8fffc8' : anchorSealed(r) ? '#5ad0e0' : '#d8d2c0', lit);
  }

  /* ---------- the centre ----------

     Drawn only once the ninth Anchor has opened it - which also puts its tiles
     on the map, so it appears and is findable in the same moment. Before that
     there is nothing here at all, because a marker for a place you cannot open
     for six hours is the "too many unexplained hooks at once" failure the
     research names by name. */
    if (vaultOpen(g.ground.lit.length) && VAULT_CORE_D >= d0 && VAULT_CORE_D <= d1) {
      star(x, VAULT_CORE_X * s, py(VAULT_CORE_D), g.won ? '#fff0b8' : '#ffd98a');
    }

  /* The pad, the one fixed point in the world, and then the ship over the top
     of it - because at the start of a run they are the same place and the one
     you need to see is the ship.

     A cyan SQUARE and not a green dot. Green was too close to a device's green
     at five pixels, and the whole reason the devices are diamonds is that a
     hue is a guess at that size and a silhouette is not. Cyan is also what the
     rest of the game's interface is, so the one man-made thing on the map is
     the one thing drawn in the interface's own colour. */
  x.fillStyle = '#3fe0ff';
  x.strokeStyle = 'rgba(0,0,0,.7)';
  x.lineWidth = 1.5;
  x.fillRect(PAD_COL * s - 4, py(0) - 4, 8, 8);
  x.strokeRect(PAD_COL * s - 4, py(0) - 4, 8, 8);
  /* The ship LAST, and smaller than the Anchor ring it may be sitting on. The
     two coincide at exactly the moment an Anchor lights, and the ship hiding
     the thing you just lit is the one frame where the map has something to
     say. */
  dot(x, g.px * s, py(g.pd), '#ffc861', 4);

  const depth = el('mapDepth');
  if (depth) depth.textContent = Math.max(0, Math.round(view)) + ' – ' +
    Math.min(WORLD_DEPTH, Math.round(view + rows)) + ' m';
  /* How much of the planet has been surveyed.

     The research on procedural mystery is specific that it turns into
     emptiness when there is no way to track partial progress, so the map says
     what fraction of the world it has filled in. It is also the only number in
     the game that goes up purely for going somewhere new. */
  const pct = el('mapPct');
  if (pct) {
    const total = Math.ceil(W / MAP_TILE) * Math.ceil(WORLD_DEPTH / MAP_TILE);
    pct.textContent = 'SURVEYED ' + Math.floor((g.seen.length / total) * 100) + '%';
  }
  const where = el('mapWhere');
  if (where) {
    const r = regionAt(Math.round(g.px), Math.max(0, Math.round(g.pd)));
    where.textContent = regionName(r).toUpperCase() + ' · ' +
      Math.max(0, Math.round(g.pd)) + ' m';
  }
}

/* A palette colour, darkened, as a css string. Multiplied per channel rather
   than drawn through an alpha - see the note at the wash. */
function dim(rock: number, f: number) {
  const r = Math.round(((rock >> 16) & 255) * f);
  const gr = Math.round(((rock >> 8) & 255) * f);
  const b = Math.round((rock & 255) * f);
  return 'rgb(' + r + ',' + gr + ',' + b + ')';
}

function dot(x: CanvasRenderingContext2D, px: number, py: number, col: string, r: number) {
  x.beginPath();
  x.arc(px, py, r, 0, Math.PI * 2);
  x.fillStyle = col;
  x.fill();
  /* A dark ring, so a yellow ship on pale rock is still a ship. */
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(0,0,0,.7)';
  x.stroke();
}

/* The Vault. A star, because it is the only one and it never has to be told
   apart from a second of its kind - which is the whole reason the other marks
   are disciplined about shape. */
function star(x: CanvasRenderingContext2D, px: number, py: number, col: string) {
  x.save();
  x.translate(px, py);
  x.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 3.6 : 8.5;
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    if (i === 0) x.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else x.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  x.closePath();
  x.fillStyle = col;
  x.fill();
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(0,0,0,.7)';
  x.stroke();
  x.restore();
}

/* An Anchor. A RING, which is a third silhouette after the ship's disc and a
   device's diamond - hollow while it is only known and filled once it is lit,
   so "how far through the game am I" is a glance at a map rather than a
   counter anywhere. */
function ring(x: CanvasRenderingContext2D, px: number, py: number, col: string, filled: boolean) {
  x.beginPath();
  x.arc(px, py, 6, 0, Math.PI * 2);
  x.lineWidth = 2.4;
  x.strokeStyle = col;
  if (filled) { x.fillStyle = col; x.fill(); }
  x.stroke();
  x.beginPath();
  x.arc(px, py, 2, 0, Math.PI * 2);
  x.fillStyle = filled ? 'rgba(0,0,0,.55)' : col;
  x.fill();
}

/* Devices get a different SHAPE and not just a different colour. At five
   pixels on a phone a hue is a guess and a silhouette is not, which is the
   same rule the ship was redesigned under. */
function diamond(x: CanvasRenderingContext2D, px: number, py: number, col: string, r: number) {
  x.save();
  x.translate(px, py);
  x.rotate(Math.PI / 4);
  x.fillStyle = col;
  x.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
  x.lineWidth = 1.5;
  x.strokeStyle = 'rgba(0,0,0,.7)';
  x.strokeRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
  x.restore();
}

/* ---------- dragging ----------

   Vertical only, because the width is always the whole world. One axis means a
   drag cannot get lost sideways, which on a map you open while low on fuel
   matters more than the freedom would. */
export function wireMap() {
  if (wired) return;
  const c = canvas();
  if (!c) return;
  wired = true;
  mustEl('mapClose').onclick = () => { sfx.ui(); closeMap(); };
  mustEl('mapHere').onclick = () => { sfx.ui(); centreOnShip(); draw(); };

  c.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragY = e.clientY;
    dragView = view;
    c.setPointerCapture(e.pointerId);
  });
  c.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    /* The world moves WITH the finger: drag down and you travel up. Anything
       else is an argument with every map the player has ever used. */
    view = clampView(dragView - (e.clientY - dragY) / scaleFor(c.clientWidth), rowsOn(c));
    draw();
  });
  const end = () => { dragging = false; };
  c.addEventListener('pointerup', end);
  c.addEventListener('pointercancel', end);
}

/* ---------- the seam ----------

   Panning is the one piece of this file with arithmetic in it, and it is the
   one that can silently be backwards or unclamped. A test drives it here
   rather than reading pixels off a canvas. */
export function mapView() { return view; }
export function mapSetView(v: number) { view = v; }
export function mapPan(dyPixels: number, canvasW: number, canvasH: number) {
  const s = scaleFor(canvasW);
  view = clampView(view - dyPixels / s, canvasH / s);
  return view;
}
