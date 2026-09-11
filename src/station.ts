import * as THREE from 'three';
import { renderer, scene as gameScene, SHIP_LAYER } from './scene';
import { player, rig, flames, HW, HW_MAT, augerGeo, augerMat,
         setUpgradeHardware, fitImportedHardware } from './ship';
import { loadShipParts } from './shipparts';
import { GROUP_ORDER, GROUP_COLOR, GROUP_LABEL, type GroupName } from './stationsigns';
import { loadStationProps, buildRoom, stationX, FORECOURT, falloffTexture, type Room } from './stationroom';
import { asMetal } from './materials';
import { UPGRADES, SUPPLIES, SUPPLY_OF, shelfState, shelfStock, costOf } from './sim/config';
import { g } from './sim/state';
import type { UpgradeKey, SupplyKey } from './types';

/* The Outfitter, as a room you are standing in.

   Playtest: "can you rearrange how the shop is layed out? make it look like a
   full room where upgrades have a physical model associated with it instead of
   a list of upgrades."

   It was a scrolling list on a styled background, and a list is a list however
   it is dressed. This is a second three.js scene: a hangar bay with the ship
   parked on a deck and the upgrades racked around it in lit display cases.

   Two decisions carry most of the value.

   THE SHIP IN HERE IS THE SHIP. `player` is reparented out of the game scene
   into this one, not copied. The machine on the deck is wearing exactly the
   hardware it will wear when you undock, and buying something changes the thing
   you are looking at. A copy would be a second source of truth and would drift
   inside a single session.

   THE PARTS IN THE CASES ARE THE PARTS. Same geometry, same materials,
   exported from ship.ts as HW. The model on the pedestal is not a picture of
   the upgrade, it is the upgrade - so "what changes in the shop" and "what
   changes in play" cannot disagree, because there is only one set of art.

   Its own scene rather than a corner of the game world, because the lighting
   here wants to be a lit workshop and the game's wants to be a dark hole, and
   one set of lights cannot be both. */

export const stationScene = new THREE.Scene();
/* The station gets a real background, unlike the game.

   The renderer runs `alpha: true` with no scene background so the game's CSS
   sky can show through - which is right underground and wrong in here, where it
   showed as a band of planet-coloured sky above the back wall. A scene
   background is per-scene, so setting one here does not disturb that. */
stationScene.background = new THREE.Color(0x090c12);
export const stationCamera = new THREE.PerspectiveCamera(46, 1, 0.1, 60);
/* Framed for a room rather than for a wall of cases.

   The old shot sat level with a shelf and looked straight at it, which is the
   right camera for the thing that used to be here and the wrong one for a
   deck with plinths on it. This stands back and a little above and looks down
   into the room, which is the diorama framing the fixed-camera research points
   at: foreground rail, plinths, ship, back wall, in four readable layers. */
/* Standing at a counter, not looking down into a diorama.

   The old shot stood back and above because the room was a deck with plinths
   on it. A shop you walk along wants eye level: the counter in the near third,
   the rack and the sign behind it, and the aisle you are NOT in sliding past
   the edges of frame. Only x moves - the height and the distance are the same
   at every station, which is what makes the glide read as walking rather than
   as a camera being flown somewhere. */
export const CAM_AIM_Y = -0.16;
export const CAM_AIM_Z = -1.4;
stationCamera.position.set(0, 0.48, 5.35);
stationCamera.lookAt(0, CAM_AIM_Y, CAM_AIM_Z);
/* The ship lives on its own layer so the game's lamp cannot blow it out. That
   decision follows it in here: without this the station camera does not RENDER
   it and the station's lights do not reach it, which presented as an empty
   docking clamp and took a moment to recognise. */
stationCamera.layers.enable(SHIP_LAYER);

/* ---------- the room ---------- */

const deckMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x2c313a, metalness: 0.55, roughness: 0.62, flatShading: true
}), 0.5);
const wallMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x1a1f27, metalness: 0.4, roughness: 0.78, flatShading: true
}), 0.35);
const hazardMat = new THREE.MeshStandardMaterial({
  color: 0xb8862c, metalness: 0.3, roughness: 0.7, flatShading: true
});

/* The bay is TALL, not wide, and that is forced by the screen.

   Portrait is about 0.46 aspect, so at a 46 degree vertical field the
   horizontal one is only ~22 degrees: at eight units back you can see 6.8 units
   of height and barely 3.1 of width. A hangar laid out sideways - the obvious
   shape for a hangar - puts most of itself off the edges of a phone. So the
   cases are racked in two vertical columns flanking the ship, which is both
   what fits and what a parts wall in a workshop actually looks like. */
/* The room's shell is gone from here.

   It was a six-by-six box with a back wall, two returns, ribs, a hazard stripe
   and a docking collar, all built before the imported room existed and all of
   it now inside a box the camera pans out of. `buildRoom()` in stationroom.ts
   owns the building - the deck, the wall, the four bays and the forecourt -
   which is the "one writer per phase" rule applied to a room: two modules both
   drawing a floor is two floors, and the second one is always the one you can
   see the seam of. */

/* ---------- lights ----------

   A workshop. Strong key from above and in front so the ship's facets read, a
   cool fill from behind so it is not sitting in a void, and a warm bounce off
   the deck. None of it changes with depth: the point of the room is that it is
   the one place in the game that is properly lit. */
/* Lit for neon, which means lit DARK.

   These were a workshop's lights: a strong warm key, a cool fill and a bright
   ambient, set when this room was a hangar whose job was to show the ship's
   facets clearly. Against the round-six room they were the whole problem. The
   sourced cyberpunk rule is saturated accents against a dark, desaturated
   base - "neon is rationed, not everywhere" - and a base lit to 1.15 ambient
   is not a dark base. The screenshot showed a mid-grey wall with a pink line
   on it, which is the same complaint as round five's in a different disguise:
   the fitting was fine and the room around it was drowning it.

   So the ambient is a third of what it was, the key is less than half, and the
   light that actually falls on the counter you are standing at comes from the
   fitting under its lip. The ship keeps enough key to read, because it is the
   one object in here whose shape is game state.

   The three fixed lights do not count against the neon budget - they are
   directional and ambient, which cost one term each regardless of how many
   fragments they touch. Only the point lights are metered. */
const ambLight = new THREE.AmbientLight(0x8fa4c4, 0.38);
ambLight.layers.enable(SHIP_LAYER);
stationScene.add(ambLight);
const keyLight = new THREE.DirectionalLight(0xffe8cc, 1.35);
keyLight.position.set(2.2, 3, 5);
keyLight.layers.enable(SHIP_LAYER);
stationScene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x4a6a9c, 0.55);
fillLight.position.set(-3, 0.5, -2);
fillLight.layers.enable(SHIP_LAYER);
stationScene.add(fillLight);

/* The warm bounce off the deck is gone from here.

   It was a fixed point light at the origin, which in a one-room shop was the
   middle of the floor and in a shop you walk along is a lamp burning in the
   RIG aisle wherever you happen to be standing. The room hands out its own
   lights now and moves them with the camera - see the note on the roaming
   lights in stationroom.ts - and two modules both lighting the same floor is
   the same "one writer per phase" fault as two modules both drawing it.

   It also freed the eighth light. The scene measured eight real lights against
   a stated ceiling of seven, and this was the one nobody had counted.
   */

/* ---------- display cases ---------- */

export interface Bay {
  key: UpgradeKey;
  group: THREE.Group;
  part: THREE.Object3D;
  glow: THREE.Mesh;
  /* the engraved plate on the front of the plinth */
  plate: THREE.Mesh;
  plateTex: THREE.CanvasTexture;
  plateCtx: CanvasRenderingContext2D;
  /* the strip of light along the plinth that carries the state at a glance */
  lamp: THREE.Mesh;
  /* darkens the alcove when the thing in it cannot be bought */
  scrim: THREE.Mesh;
}
export const bays: Bay[] = [];

const caseMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x39414d, metalness: 0.6, roughness: 0.5, flatShading: true
}), 0.5);
/* A soft pool, not a rectangle.

   It was a flat plane at 0.08 opacity, which on a dark wall is invisible and
   on a lit one is a pale grey box behind every single case - which is exactly
   what the screenshot showed, five of them. A hard edge is the tell, the same
   one the neon halo had, and the same falloff texture is the same answer. */
const glowMat = new THREE.MeshBasicMaterial({
  color: 0x3fe0ff, map: falloffTexture(), transparent: true, opacity: 0.0,
  blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false
});

/* One case per upgrade, and the part inside it is built from HW - the same
   geometry and materials the hull gets. */
function makePart(key: UpgradeKey): THREE.Object3D {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0,
               rot?: [number, number, number], s = 1) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.scale.setScalar(s);
    g.add(mesh);
  };
  switch (key) {
    case 'tank':
      add(HW.tank, HW_MAT.steel, -0.09, 0, 0); add(HW.tank, HW_MAT.steel, 0.09, 0, 0); break;
    case 'cool':
      for (let i = -1; i <= 1; i++) add(HW.rad, HW_MAT.trim, i * 0.09, 0, 0, undefined, 1.5); break;
    case 'cargo':
      add(HW.pod, HW_MAT.hull); break;
    case 'scan':
      add(HW.mast, HW_MAT.steel, 0, -0.08, 0);
      add(HW.dish, HW_MAT.trim, 0, 0.1, 0, [Math.PI / 2.6, 0, 0]); break;
    case 'thrust':
      add(HW.jet, HW_MAT.steel, -0.08, 0, 0, undefined, 1.6);
      add(HW.jet, HW_MAT.steel, 0.08, 0, 0, undefined, 1.6); break;
    case 'drill':
      add(augerGeo, augerMat, 0, -0.02, 0, undefined, 0.72); break;
    /* The four with no bolt-on part still get something that says what they
       are. An empty case reads as a bug, not as "this one is abstract". */
    case 'scrub':
      add(new THREE.TorusGeometry(0.13, 0.035, 6, 14), HW_MAT.trim, 0, 0, 0, [Math.PI / 2.4, 0, 0]); break;
    case 'auto':
      add(new THREE.OctahedronGeometry(0.15, 0), HW_MAT.trim); break;
    case 'bomb':
      add(new THREE.CylinderGeometry(0.1, 0.12, 0.24, 8), HW_MAT.trim); break;
    case 'laser':
      add(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), HW_MAT.steel, 0, 0, 0, [Math.PI / 2.2, 0, 0]); break;
    default:
      add(new THREE.BoxGeometry(0.2, 0.2, 0.2), HW_MAT.steel);
  }
  return g;
}

/* ---------- the engraved plate ----------

   Playtest: *"can you label each upgrade so that it is easy to tell what it is
   without clicking on it."*

   A canvas texture on a small plate on the front of each plinth, rather than
   HTML floating over the room: the label belongs to the case, the way a museum
   label does, and text pinned to the world moves and turns with it instead of
   hovering in front of everything.

   The size is decided by the screen, not by taste. At this camera the visible
   width is about 3.5 world units across 375 CSS pixels, so a 0.66-unit plate is
   roughly 70 px wide - which is a six-character word at a readable size and
   nothing more. That is why the labels are DRILL and THRUST rather than "Drill
   Bit" and "Thrusters": the full names are in the card the moment you tap. */
const PLATE_W = 512, PLATE_H = 168;

/* Short enough to read at seventy pixels. The card carries the full name. */
const SHORT: Record<string, string> = {
  drill: 'DRILL', cargo: 'CARGO', thrust: 'THRUST', tank: 'FUEL',
  cool: 'COOLING', scan: 'SCANNER', tow: 'TOW', auto: 'AUTOPILOT',
  bomb: 'CHARGE', laser: 'LASER'
};

function makePlate() {
  const c = document.createElement('canvas');
  c.width = PLATE_W; c.height = PLATE_H;
  const ctx = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.66, 0.216),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true })
  );
  return { mesh, tex, ctx };
}

/* The largest size at or below `want` that fits `max` pixels wide. */
function fitPx(x: CanvasRenderingContext2D, text: string, want: number, max: number): number {
  for (let px = want; px > 22; px -= 2) {
    x.font = '700 ' + px + 'px "Chakra Petch", system-ui, sans-serif';
    if (x.measureText(text).width <= max) return px;
  }
  return 22;
}

/* Redrawn whenever the shop opens or something is bought - never per frame. */
function drawPlate(b: Bay, name: string, line: string, tone: string, dim: boolean) {
  const x = b.plateCtx;
  x.clearRect(0, 0, PLATE_W, PLATE_H);
  /* the plate itself, so the text sits on brushed metal rather than in mid-air */
  x.fillStyle = dim ? 'rgba(16,20,27,0.92)' : 'rgba(26,32,42,0.95)';
  x.fillRect(0, 0, PLATE_W, PLATE_H);
  x.fillStyle = dim ? 'rgba(70,80,96,0.5)' : 'rgba(120,140,170,0.55)';
  x.fillRect(0, 0, PLATE_W, 5);
  x.textAlign = 'center';
  /* Measured, not assumed. This drew at a fixed 62px with no width limit, and
     "SALVAGE MAGNET" wants about 490px of a 512px plate before the margins -
     so the longest names in the game ran off both ends. `fillText`'s maxWidth
     argument would squash the glyphs instead; shrinking the size keeps the
     letterforms and just makes a long name smaller, which is what a real
     engraved plate does too. */
  x.fillStyle = dim ? '#5d6779' : '#e8f0ff';
  x.font = '700 ' + fitPx(x, name, 62, PLATE_W - 44) + 'px "Chakra Petch", system-ui, sans-serif';
  x.fillText(name, PLATE_W / 2, 70);
  x.fillStyle = tone;
  x.font = '700 ' + fitPx(x, line, 46, PLATE_W - 44) + 'px "Chakra Petch", system-ui, sans-serif';
  x.fillText(line, PLATE_W / 2, 132);
  b.plateTex.needsUpdate = true;
}

/* ---------- where the cases stand in one bay ----------

   Local to the bay. `refreshBays` adds the bay's own x, so this only ever has
   to think about one department at a time - which is the whole point of
   splitting the shop into four.

   Two rows, and the split is by PRICE, which is what a real counter does: the
   dear stock is under glass at the till because that is where it can be
   watched, and the ordinary stock is racked behind because there is more of it
   and nobody needs to be careful with it. The sourced display research says
   the same thing in lighting terms - individual light on few items reads as
   precious, repetition under one flat wash reads as stock.

   Never more than five in a department, which is the sourced ceiling for how
   many options a phone should carry at once. Three on the counter and the rest
   on the rack. */
/* x, y, z, yaw, and a scale of its own.

   The fifth number is not tidiness. The counter is four units from the lens
   and the rack is over seven, so a case of one size in world units is half
   again as big on the counter - which is what put REPAIR DRONE and HULL
   PLATING half off both edges of the screen. Projected CENTRES said everything
   was inside the frame; the plates are 136 px wide and the centres were 133 px
   apart from the middle, so both outer plates hung over the edge. A centre is
   not a case. This is the correction, and the screenshot is what found it. */
type Slot = [number, number, number, number, number];

/* Two under glass, not three. Three fit by their centres and did not fit by
   their plates. */
const COUNTER_SLOTS = 2;

function layout(n: number): { slots: Slot[]; scale: number } {
  const slots: Slot[] = [];
  const counter = Math.min(COUNTER_SLOTS, n);

  /* The counter: a shallow arc across the front, facing the camera.

     The spread is MEASURED, not chosen. At z 1.3 the camera is 4 units away
     and one world unit of x is about 215 screen pixels on a 360-wide phone, so
     the first version's +/-1.05 put the outer two cases at x -46 and x 406 -
     both entirely off the screen, which a contact sheet would never have
     shown. +/-0.62 puts them at about +/-133 px, which fits three cases and
     their plates inside the frame with margin.

     The rack behind sits at z -2.0, over three units further away, where the
     same +/-1.05 is only +/-132 px. That is why the two rows have different
     spreads for what looks like the same row width: they are not the same
     distance from the lens. */
  for (let i = 0; i < counter; i++) {
    const t = counter === 1 ? 0.5 : i / (counter - 1);
    const x = counter === 1 ? 0 : -0.46 + t * 0.92;
    /* Curved toward the viewer at the ends, so it reads as a case you are
       standing at rather than a row of boxes on a line. */
    const z = 1.3 - Math.abs(t - 0.5) * 0.2;
    /* Smaller in world units so it is the SAME size on screen as the rack
       behind - see the note on Slot. */
    slots.push([x, -0.2, z, (0.5 - t) * 0.44, 0.74]);
  }

  /* The rack behind: a regular row, which is what says "stock". */
  const rest = n - counter;
  for (let i = 0; i < rest; i++) {
    const t = rest === 1 ? 0.5 : i / (rest - 1);
    const x = rest === 1 ? 0 : -1.02 + t * 2.04;
    slots.push([x, 0.46, -2.0, 0, 1]);
  }

  /* Bigger when there are fewer of them. With at most five in a bay every
     department can afford a readable plate, which fifteen in one frame never
     could. */
  const scale = n <= 3 ? 1.08 : n <= 4 ? 1.0 : 0.94;
  return { slots, scale };
}

/* ---------- the aisles ----------

   Station 0 is the forecourt where the ship is parked; 1 to 4 are the four
   departments. `aisle` is where the camera IS, `aisleTarget` is where it is
   going, and the glide between them is what makes this read as walking along a
   shop rather than as a screen changing.

   The state lives here rather than in the Room because it has to exist before
   the room's models have arrived. That is the exact bug round five shipped and
   then cut: what the player could buy depended on whether an async fetch had
   landed, so a tap could hit a shelf that was about to re-lay itself
   underneath it. The shelf's shape is decided by state that is present at boot
   and nothing else. */
export const AISLE_COUNT = GROUP_ORDER.length + 1;
let aisle = 1;
let aisleShown = 1;
export function currentAisle() { return aisle; }
export function currentGroup(): GroupName { return GROUP_ORDER[Math.max(0, aisle - 1)]; }

/* Which departments have anything in them at all.

   Ordnance is empty until the first charge is dug out of the ground, and an
   empty aisle is SKIPPED by the swipe rather than being a dead stop the player
   has to pass through twice. Its sign stays visible and dark, because a dark
   aisle you can see is a promise and an absent one is nothing. */
export function aisleStocked(i: number): boolean {
  if (i === FORECOURT) return true;
  const gname = GROUP_ORDER[i - 1];
  return shelfStock(g.best.depth, g.found).some((u) => u.group === gname);
}

export function goAisle(i: number) {
  const n = Math.max(0, Math.min(AISLE_COUNT - 1, i));
  if (!aisleStocked(n)) return;
  if (n === aisle) return;
  aisle = n;
  selected = null;
  refreshBays();
  paintAisleBar();
}

/* One step, skipping anything empty. Returns false when there is nothing that
   way, which is what greys the arrow out. */
export function stepAisle(dir: number): boolean {
  for (let i = aisle + dir; i >= 0 && i < AISLE_COUNT; i += dir) {
    if (aisleStocked(i)) { goAisle(i); return true; }
  }
  return false;
}
export function canStepAisle(dir: number): boolean {
  for (let i = aisle + dir; i >= 0 && i < AISLE_COUNT; i += dir) {
    if (aisleStocked(i)) return true;
  }
  return false;
}

/* ---------- what is new since you were last here ----------

   Playtest: *"find a way to make new items appearing feel natural."*

   A device dug out of the rock is announced underground by its own banner, and
   the shop's job is the second half: the department it belongs to is where the
   room opens next time you dock. No badge, no list of what changed - you
   arrive standing in front of it.

   Tracked as the found list AS IT WAS at the last undock, so the beat fires
   exactly once per device and survives a reload. */
let seenFound: string[] = [];
export function freshAisle(): number {
  for (const k of g.found) {
    if (seenFound.includes(k)) continue;
    const u = UPGRADES.find((x) => x.key === k);
    if (!u) continue;
    const i = GROUP_ORDER.indexOf(u.group as GroupName);
    if (i >= 0) return i + 1;
  }
  return -1;
}
export function markSeen() { seenFound = g.found.slice(); }

/* ---------- the aisle bar ----------

   A dot per station in its own colour, plus an arrow either side. Both, and
   from the first commit, because the research is unambiguous: NN/g measured a
   21% drop in task completion for navigation with no visible affordance, and
   roughly half the discoverability. A swipe nobody finds is a shop with one
   aisle, and this room has already shipped one control that did nothing.

   In the DOM rather than in the room, deliberately, and it is the one thing in
   here that is allowed to be. It has to be legible at every station including
   the ones it is pointing away from, and a fitting that is visible from
   everywhere is a fitting that is nowhere. The diegetic half is the sign over
   each bay, in the same colour, which is the thing the dots mirror. */
export function paintAisleBar() {
  const bar = document.getElementById('aisles');
  if (!bar) return;
  const dots = ['<i class="dot pump' + (aisle === FORECOURT ? ' on' : '') + '"></i>'];
  GROUP_ORDER.forEach((gname, i) => {
    const st = aisleStocked(i + 1);
    dots.push('<i class="dot' + (aisle === i + 1 ? ' on' : '') + (st ? '' : ' off') +
      '" style="--c:#' + GROUP_COLOR[gname].toString(16).padStart(6, '0') + '"></i>');
  });
  bar.innerHTML = dots.join('');
  /* No name here. The lit sign over the bay already says which aisle this is,
     in the same colour, and the DOM printed it a second time directly on top
     of it - two LIFEs stacked, which reads as a bug rather than as emphasis.
     The dots say WHERE you are, the sign says WHAT it is, and neither repeats
     the other. */
  for (const [id, dir] of [['aisleL', -1], ['aisleR', 1]] as [string, number][]) {
    const b = document.getElementById(id);
    if (b) b.classList.toggle('gone', !canStepAisle(dir));
  }
}

/* ---------- framing, measured ----------

   Playtest: *"it looks like the description of the upgrade is cutting into the
   bottom upgrades in the cases."*

   He was right and the cause was one number. Measured at 360x780 CSS, which is
   the phone at its device pixel ratio: the bar takes the top 120 px, the tray
   takes the bottom 310, and the room is composed into the 350 px between them -
   45% of the screen. The camera was framing for all 780, so the counter landed
   at y 461 with the tray starting at 470 and the plates hung into it.

   `setViewOffset` SHIFTS the frustum and does not rescale it. That distinction
   took two attempts. The first version passed the visible band's height as the
   virtual full height, which does not move the composition up - it redefines
   the field of view as covering only the band, and everything in the room comes
   out at 47% of the size it was. What is wanted is much smaller: the same
   camera, the same scale, the image slid up by half the difference between what
   the tray covers and what the bar covers, so the composition is centred in the
   gap the player can actually see rather than in the canvas.

   Re-measured on every open rather than stored, because the tray's height is a
   function of the font and the safe-area inset and neither is knowable from
   here.

   AND MEASURED WHEN THE TRAY IS ON SCREEN. The second attempt was worse than
   wrong, it was invisible: `resizeStation()` was called while #shop still
   carried `.hidden`, so every `getBoundingClientRect` returned zero, the guard
   below fired, and the whole thing was a no-op that had been shipping for an
   afternoon while a hand-tuned camera angle quietly did the job instead. It was
   found by deliberately deleting the call and watching the test that guards it
   pass anyway - which is rule 11 catching a construct that could not fail. */
/* Re-frame only if the band has actually moved.

   Called after anything that can change the tray's height. The card reserves
   its tallest size so in practice this finds nothing to do - but a card that
   ever outgrows the reserve would otherwise cover the bottom of the room
   silently, which is exactly what it did before the reserve existed. */
export function reframeIfNeeded() {
  const W = window.innerWidth, H = window.innerHeight;
  const band = visibleBand();
  if (W + ':' + H + ':' + band.top + ':' + band.bottom === lastBand) return;
  resizeStation();
}

export function visibleBand(): { top: number; bottom: number } {
  const H = window.innerHeight;
  const bar = document.querySelector('#shop .shopbar') as HTMLElement | null;
  const ais = document.querySelector('#shop .aislebar') as HTMLElement | null;
  const tray = document.querySelector('#shop .tray') as HTMLElement | null;
  const top = (bar ? bar.getBoundingClientRect().height : 0) +
              (ais ? ais.getBoundingClientRect().height : 0);
  const bottom = tray ? tray.getBoundingClientRect().height : 0;
  /* A guard, not a nicety. If nothing has been laid out the band is the whole
     screen, which is the old behaviour and is merely unframed rather than
     broken. It must stay rare: see the note above about the afternoon it spent
     firing on every single open. */
  if (top + bottom > H * 0.85) return { top: 0, bottom: 0 };
  return { top, bottom };
}

let lastBand = '';
export function resizeStation() {
  const W = window.innerWidth, H = window.innerHeight;
  const band = visibleBand();
  lastBand = W + ':' + H + ':' + band.top + ':' + band.bottom;
  stationCamera.aspect = W / H;
  /* Slide the image up by half the difference. Same size, same field, just
     centred on the gap between the furniture instead of on the canvas. */
  const shift = (band.bottom - band.top) / 2;
  if (Math.abs(shift) < 1) stationCamera.clearViewOffset();
  else stationCamera.setViewOffset(W, H, 0, shift, W, H);
  stationCamera.updateProjectionMatrix();
}

/* The room, once its models have arrived. */
let room: Room | null = null;
/* Exposed so a test can wait for the thing itself instead of a timeout. */
export function roomReady() { return room !== null; }

/* Built once per upgrade; only the POSITIONS change when the shelf does. */
UPGRADES.forEach((u, i) => {
  const slot: Slot = [0, 0, -1.2, 0, 1];
  const grp = new THREE.Group();
  grp.position.set(slot[0], slot[1], slot[2]);
  grp.rotation.y = slot[3];

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.34, 0.42), caseMat);
  plinth.position.y = -0.26;
  grp.add(plinth);
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.05, 0.48), deckMat);
  top.position.y = -0.07;
  grp.add(top);

  const part = makePart(u.key);
  /* Scaled up from hull size. On the hull these are read at thirty pixels as
     part of a silhouette; in a display case they are the subject, and a
     faithful 1:1 tank is a speck on a plinth. */
  part.scale.setScalar(1.45);
  part.position.y = 0.15;
  grp.add(part);

  /* Selection light: a panel behind the part, near-off until it is picked. */
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.66), glowMat.clone());
  glow.position.set(0, 0.16, -0.22);
  grp.add(glow);

  const { mesh: plate, tex: plateTex, ctx: plateCtx } = makePlate();
  plate.position.set(0, -0.2, 0.212);
  grp.add(plate);

  /* A strip of light along the front lip. This is the part that reads from
     across the room without being read: colour alone, no text. */
  const lamp = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.026),
    new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.9 })
  );
  /* Below the plate, on the front face. The first attempt put it above, at the
     lip - which is inside the plinth's own top slab, so it rendered perfectly
     into the middle of a solid box and could not be seen at all. */
  lamp.position.set(0, -0.335, 0.213);
  grp.add(lamp);

  /* Smoked glass across the alcove for anything that cannot be bought. It
     darkens the part WITHOUT touching its material - which matters, because
     those materials are shared with the hull, and dimming a case would
     otherwise dim the tanks on the ship parked three feet away. */
  const scrim = new THREE.Mesh(
    new THREE.PlaneGeometry(0.6, 0.72),
    new THREE.MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0, depthWrite: false })
  );
  scrim.position.set(0, 0.18, 0.16);
  grp.add(scrim);

  stationScene.add(grp);
  bays.push({ key: u.key, group: grp, part, glow, plate, plateTex, plateCtx, lamp, scrim });
});


/* ---------- what is in the drawer ----------

   Playtest: *"a secret display case at the bottom of the screen pops open and
   shows all of the upgrades you have collected and lets you purchase the
   upgrades there."*

   One case per consumable, built once, parented into the drawer's shelf the
   first time the room exists. Only the ones you have actually held are
   visible - an empty drawer with six grey slots in it would be a checklist,
   which is the opposite of finding something.

   Deliberately SMALLER and plainer than an upgrade case. These are boxes of
   stock, not hardware under glass: a shallow crate, a plate, and the count you
   are carrying. The visual difference is the point - the upgrade cases say
   "this changes the ship" and these say "this is a thing you take with you". */

export interface KitCase {
  key: SupplyKey;
  group: THREE.Group;
  plate: THREE.Mesh;
  plateTex: THREE.CanvasTexture;
  plateCtx: CanvasRenderingContext2D;
  glow: THREE.Mesh;
}
export const kitCases: KitCase[] = [];

const kitMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x5a5148, metalness: 0.5, roughness: 0.62, flatShading: true
}), 0.4);

export function makeKitCases() {
  if (kitCases.length) return;
  SUPPLIES.forEach((sup) => {
    const grp = new THREE.Group();
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.085, 0.15), kitMat);
    grp.add(crate);
    /* A coloured lid, so six crates in a row are six different things at a
       glance rather than six crates. The colours are the ones the game already
       uses for what each consumable answers: heat, hull, fuel, and the three
       timed ones share the violet that ordnance uses for "a window, not a
       repair". */
    const lid = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.018, 0.16),
      new THREE.MeshStandardMaterial({
        color: KIT_COLOR[sup.key], metalness: 0.3, roughness: 0.5, flatShading: true
      })
    );
    lid.position.y = 0.05;
    grp.add(lid);

    const { mesh: plate, tex: plateTex, ctx: plateCtx } = makePlate();
    plate.scale.setScalar(0.36);
    plate.position.set(0, -0.075, 0.1);
    plate.rotation.x = -0.35;
    grp.add(plate);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), glowMat.clone());
    glow.position.set(0, 0.01, -0.1);
    grp.add(glow);

    kitCases.push({ key: sup.key, group: grp, plate, plateTex, plateCtx, glow });
  });
}

const KIT_COLOR: Record<string, number> = {
  coolant: 0x6fd8ff, patch: 0xff6b7e, cell: 0x4be08a,
  overdrive: 0xffa83c, bulwark: 0x8fb6ff, pulse: 0xa855f7
};

/* Laid out and priced. Only the found ones take a slot, so a drawer holding
   two is two crates in the middle rather than two crates and four gaps. */
export function refreshKit() {
  makeKitCases();
  const known = SUPPLIES.filter((sup) => g.foundKit.includes(sup.key));
  const shown = new Set(known.map((s2) => s2.key));
  const n = known.length;
  known.forEach((sup, i) => {
    const c = kitCases.find((k) => k.key === sup.key);
    if (!c) return;
    /* ONE row, however many there are, and that is decided by the screen.

       Two rows of three was the obvious shape and it does not fit: measured,
       the drawer has 117 px of band between the counter cases and the tray, and
       two rows of crates with plates on them want about 160. They overlapped
       each other AND ran under the tray.

       So the crates are small, in a line, and read by their coloured lid and
       their four-letter code rather than by a full name - which is what a
       drawer of stock actually looks like, and which the card at the bottom of
       the screen expands the moment you tap one. */
    /* A fixed PITCH, centred, rather than a spread stretched to fill the
       drawer. Stretching put the first two consumables a player ever finds at
       the extreme left and right ends of an otherwise empty drawer, which
       reads as two things that have fallen over rather than as stock. The
       pitch is what six across the usable width works out at, so a full drawer
       is unchanged and a nearly empty one sits in the middle. */
    const PITCH = 0.222, y = 0.09;
    c.group.position.set((i - (n - 1) / 2) * PITCH, y, 0);
    /* Remembered, because the lift on the picked crate is animated off it
       every frame. Without this the lift is measured against wherever the
       crate happened to be last frame and it walks upward out of the drawer -
       the same class of bug as easing toward a moving target. */
    c.group.userData.baseY = y;
  });

  for (const c of kitCases) {
    c.group.visible = shown.has(c.key);
    if (!c.group.visible) continue;
    const sup = SUPPLY_OF[c.key];
    const held = g.kit[c.key];
    const full = held >= sup.max;
    const afford = g.credits >= sup.cost;
    const line = full ? 'FULL' : '◈ ' + sup.cost.toLocaleString();
    const tone = full ? '#4be08a' : afford ? '#3fe0ff' : '#ffc861';
    /* The four-letter code and what you are carrying, then the price. At about
       57 px wide there is room for one short word and a number, and `icon` is
       already the four-letter code the in-game kit button uses - so the thing
       in the drawer and the thing under your thumb underground are labelled
       the same, which is most of what makes a consumable learnable. */
    drawPlate(c as unknown as Bay, sup.icon + ' ' + held + '/' + sup.max, line, tone, false);
  }
}

/* ---------- availability ----------

   Playtest: *"doing something to visually show that certain upgrades aren't
   available or you don't have enough money to purchase it by dimming it."*

   Four states, and each one is said three ways - the strip of light, the plate,
   and how dark the alcove is - so it reads at a glance AND survives being
   colour-blind, which a colour-only code would not.

     READY    cyan strip, price in cyan, alcove clear
     SHORT    amber strip, price in amber, alcove smoked
     SEALED   strip off, the depth in dull red, alcove smoked harder
     MAX      green strip, "MAX", alcove clear

   The part itself is never dimmed by touching its material, because those
   materials are shared with the hull - dimming a case would dim the same part
   bolted to the ship parked in the middle of the room. The smoked panel in
   front does the job without that.

   Runs on opening the shop and after every purchase; never per frame. */
export function refreshBays() {
  /* What is on the shelf at all, which is now two gates rather than one.

     `shelfStock` is the single source: the depth gate it always had, plus the
     devices, which come off the shelf entirely until they are dug out of the
     ground. See finds.ts for why that gate is silent where the depth gate is
     a visible promise. */
  const raw = shelfStock(g.best.depth, g.found);

  /* Only ONE department is in the room at a time, and this is where round five
     finally gets the thing it cut.

     It was cut then because the shelf's contents depended on whether an async
     model fetch had landed - `room !== null` was read at every refresh, so a
     tap could hit a shelf that was about to re-lay itself underneath it. The
     shape is decided by `aisle` now, which exists at boot and has nothing to
     do with the network. What the player can buy is never a race. */
  /* Nothing is on sale at the pump. Measured first, which is how it was found:
     standing at the forecourt still showed the RIG cases, because
     `currentGroup()` clamps aisle 0 to the first department and the filter
     never asked whether there WAS a department. The ship and the shelf sharing
     a shot is the fault this whole milestone is about, and it would have come
     straight back at station zero. */
  const gname = currentGroup();
  const inBay = aisle === FORECOURT ? [] : raw.filter((u) => u.group === gname);

  /* Dearest first, so the counter gets the expensive stock and the rack gets
     the rest. Priced at the rung the player would buy NEXT rather than at the
     base, or a ladder they are halfway up would sit in the cheap seats. */
  const stock = inBay.slice().sort((a, b) =>
    costOf(b, g.up[b.key] || 0) - costOf(a, g.up[a.key] || 0));
  const shown = new Set(stock.map((u) => u.key));
  const { slots, scale } = layout(stock.length);

  /* The bay's own x, added once here rather than baked into `layout`, so the
     layout only ever has to think about one department. */
  const ax = stationX(aisle);
  stock.forEach((u, i) => {
    const bay = bays.find((b) => b.key === u.key);
    const sl = slots[i];
    if (!bay || !sl) return;
    bay.group.position.set(ax + sl[0], sl[1], sl[2]);
    bay.group.rotation.y = sl[3];
    bay.group.scale.setScalar(scale * sl[4]);
  });

  for (const b of bays) {
    const u = UPGRADES.find((x) => x.key === b.key);
    if (!u) continue;
    /* Not in this department, or not stocked at all: gone from the room rather
       than dimmed in it. `visible` also takes it out of the raycast, so a case
       you cannot see is a case you cannot tap by accident. */
    b.group.visible = shown.has(u.key);
    if (!b.group.visible) continue;
    const sh = shelfState(u, g.up[u.key], g.credits, g.stock, g.best.depth);

    /* One row per state, so adding a fifth is a line rather than an edit to a
       chain of conditionals. tone is the plate's second line, lamp is the strip
       along the front lip, smoke is how far the alcove is shuttered. */
    const look = {
      ready:  { tone: '#3fe0ff', lamp: 0x3fe0ff, on: 0.9,  smoke: 0    },
      short:  { tone: '#ffc861', lamp: 0xffc861, on: 0.8,  smoke: 0.42 },
      sealed: { tone: '#8c4a52', lamp: 0x101010, on: 0,    smoke: 0.62 },
      max:    { tone: '#4be08a', lamp: 0x4be08a, on: 0.85, smoke: 0    }
    }[sh.state];

    drawPlate(b, SHORT[b.key] || u.name.toUpperCase(), sh.line, look.tone, sh.state === 'sealed');
    const lm = b.lamp.material as THREE.MeshBasicMaterial;
    lm.color.setHex(look.lamp);
    lm.opacity = look.on;
    (b.scrim.material as THREE.MeshBasicMaterial).opacity = look.smoke;
  }

  /* And the signs. The aisle you are in burns, one with stock idles, an empty
     one is dark - see setLit in stationroom.ts. */
  if (room) {
    for (let i = 0; i < room.bays.length; i++) {
      room.bays[i].setLit(aisle === i + 1, aisleStocked(i + 1));
    }
    room.setAisle(aisle);
  }
}

/* ---------- docking ---------- */

let docked = false;
export function isDocked() { return docked; }

/* Reparenting, not copying. three removes an object from its old parent when
   it is added to a new one, so this is the whole mechanism - and it is what
   guarantees the ship on the deck is the ship you fly out. */
export function dockShip() {
  if (docked) return;
  docked = true;
  /* First time the shop is opened, the imported hardware comes down in its own
     chunk. Deliberately here and not at boot: it is surface detail, the game is
     playable without it, and the entry bundle should not carry a model loader
     for a screen most first sessions reach a minute in. */
  loadShipParts().then(() => { fitImportedHardware(); setUpgradeHardware(g.up); });
  loadStationProps().then(() => {
    if (room) return;
    room = buildRoom();
    if (room) {
      stationScene.add(room.group);
      /* The crates go INTO the drawer, once, the moment there is a drawer to
         put them in. Built in this module because drawing a plate is this
         module's job; parented into the room because where they physically are
         is the room's. */
      makeKitCases();
      for (const c of kitCases) room.drawer.shelf.add(c.group);
      refreshBays();
      refreshKit();
    }
  });
  /* Where the shop OPENS, decided before anything is drawn.

     On the aisle holding something you have just dug up, if there is one: a
     device coming out of the rock and the shop opening on the department it
     belongs to is the whole of "make new items appearing feel natural". The
     reveal is the room, not a badge.

     Otherwise on the aisle you were last in, so a second visit to buy the
     second rung of something does not cost two swipes. */
  const fresh = freshAisle();
  if (fresh >= 0) aisle = fresh;
  else if (!aisleStocked(aisle)) aisle = 1;
  aisleShown = aisle;
  refreshBays();
  paintAisleBar();
  stationScene.add(player);
  /* Parked at the pump on the forecourt, which is a station of its own at one
     end of the run. This is what stops the ship standing in front of the
     stock: they are never in the same shot any more. */
  player.position.set(stationX(FORECOURT) - 0.1, -0.2, 0.75);
  player.scale.setScalar(1.05);
  rig.rotation.set(0, 0, 0);
  /* Engines off. The frame loop's thruster animation is downstream of the
     branch that returns for a docked ship, so whatever the flames were doing on
     the way in is what they would keep doing forever - a parked ship burning
     its engines inside a hangar. */
  for (const f of flames) { f.cone.visible = false; f.glow.visible = false; }
}
export function undockShip() {
  if (!docked) return;
  docked = false;
  gameScene.add(player);
  player.scale.setScalar(1);
  rig.rotation.set(0, 0, 0);
  for (const f of flames) { f.cone.visible = true; f.glow.visible = true; }
}

/* An upgrade key OR a supply key. One selection, because there is one card at
   the bottom of the screen and two things that can fill it - and two selection
   variables would be two ways for the card and the lit case to disagree. */
let selected: string | null = null;
export function selectedBay() { return selected; }
export function selectBay(k: string | null) { selected = k; }

/* Slow turntable on the ship, a turn on each part, and the picked case lit.
   Driven from the frame loop so it runs on the same delta as everything else -
   and so it keeps moving while the shop is open, which is most of what makes
   the room feel like a place rather than a screenshot. */
export function stepStation(t: number, dt: number) {
  if (room) room.step(t, dt);
  /* The glide between aisles. Exponential approach on the frame delta rather
     than a tween on a timer, so it lands the same however the loop is driven -
     and so a swipe part way through another one simply retargets instead of
     fighting a running animation. */
  const want = stationX(aisle);
  aisleShown += (want - aisleShown) * Math.min(1, dt * 6.5);
  if (Math.abs(want - aisleShown) < 0.002) aisleShown = want;
  stationCamera.position.x = aisleShown;
  stationCamera.lookAt(aisleShown, CAM_AIM_Y, CAM_AIM_Z);
  rig.rotation.y = Math.sin(t * 0.32) * 0.6;
  for (const c of kitCases) {
    const on = c.key === selected;
    const m = c.glow.material as THREE.MeshBasicMaterial;
    m.opacity += ((on ? 0.5 : 0) - m.opacity) * Math.min(1, dt * 8);
    const lift = on ? 0.05 : 0;
    c.group.position.y += ((c.group.userData.baseY || 0) + lift - c.group.position.y) *
      Math.min(1, dt * 8);
  }
  for (const b of bays) {
    b.part.rotation.y += dt * 0.65;
    const on = b.key === selected;
    const m = b.glow.material as THREE.MeshBasicMaterial;
    m.opacity += ((on ? 0.5 : 0) - m.opacity) * Math.min(1, dt * 8);
    const lift = on ? 0.27 : 0.15;
    b.part.position.y += (lift - b.part.position.y) * Math.min(1, dt * 8);
    b.part.scale.setScalar(b.part.scale.x + ((on ? 1.8 : 1.45) - b.part.scale.x) * Math.min(1, dt * 8));
  }
}

/* Which case did that tap land on? Null for a tap on the floor or a wall,
   which deselects - a room you cannot tap out of is a menu again. */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
export function pickBay(clientX: number, clientY: number): string | null {
  /* Bring the world matrices up to date first.

     A raycast reads world matrices, and those are only refreshed as part of a
     render. Tap a case in the same tick the room opened - before it has ever
     been drawn - and every bay is still sitting at the identity matrix, so the
     ray misses everything and the tap silently does nothing. It works the
     instant one frame has gone by, which is exactly the kind of bug that
     reproduces on a fast tap and nowhere else. */
  stationScene.updateMatrixWorld(true);
  ndc.x = (clientX / window.innerWidth) * 2 - 1;
  ndc.y = -(clientY / window.innerHeight) * 2 + 1;
  ray.setFromCamera(ndc, stationCamera);

  /* The drawer first, and inside-out.

     A tap that lands on both an open drawer's flap and a case standing in it
     is a purchase, not a close - so the cases are tested before the handle.
     Closing a drawer by tapping the thing you were reaching for is the kind of
     fault that only shows up under a thumb. */
  if (room && room.drawer.group.visible) {
    if (room.drawer.isOpen()) {
      for (const c of kitCases) {
        if (!c.group.visible) continue;
        if (ray.intersectObject(c.group, true).length) return c.key;
      }
    }
    if (room.drawer.isOpen()) {
      /* Open, and the tap missed every crate: it shuts.

         Tapping the handle again was the first design and it does not survive
         the drawer opening - the handle swings down and forward with the flap,
         which on a portrait phone puts it under the tray, so the control that
         opened it is unreachable the moment it has been used. Tap-outside-to-
         dismiss is the gesture people already have, and it costs nothing.

         It falls THROUGH to the bays rather than returning, so a tap that
         lands on an upgrade case both shuts the drawer and picks the case,
         which is what somebody reaching past an open drawer meant. */
      room.drawer.setOpen(false);
      if (selected && SUPPLY_OF[selected]) selected = null;
    } else {
      for (const h of room.drawer.hit) {
        if (ray.intersectObject(h, true).length) { room.drawer.setOpen(true); return null; }
      }
    }
  }
  for (const b of bays) {
    if (ray.intersectObject(b.group, true).length) return b.key;
  }
  return null;
}

/* Whether the drawer is open, for the card and for a test. */
export function drawerOpen() { return !!room && room.drawer.isOpen(); }
export function roomDrawer() { return room ? room.drawer : null; }

export function renderStation() {
  /* The renderer no longer resets its own statistics - see renderWorld() - so
     the station has to, or its counts accumulate for as long as you stand in
     the shop. */
  renderer.info.reset();
  renderer.render(stationScene, stationCamera);
}
