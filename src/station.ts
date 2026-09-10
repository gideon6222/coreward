import * as THREE from 'three';
import { renderer, scene as gameScene, SHIP_LAYER } from './scene';
import { player, rig, flames, HW, HW_MAT, augerGeo, augerMat } from './ship';
import { asMetal } from './materials';
import { UPGRADES, shelfState, shelfStock } from './sim/config';
import { g } from './sim/state';
import type { UpgradeKey } from './types';

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
stationCamera.position.set(0, 0.05, 8);
stationCamera.lookAt(0, 0.2, -1);
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
const floor = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6), deckMat);
floor.position.set(0, -3.3, -1);
stationScene.add(floor);
const ceiling = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 6), wallMat);
ceiling.position.set(0, 4.8, -1);
stationScene.add(ceiling);

/* Back wall and two returns, so the room has corners. One plane behind
   everything reads as a backdrop; three read as somewhere you are standing. */
const back = new THREE.Mesh(new THREE.BoxGeometry(6, 7.5, 0.3), wallMat);
back.position.set(0, 0.3, -3.4);
stationScene.add(back);
for (const sx of [-1, 1]) {
  const side = new THREE.Mesh(new THREE.BoxGeometry(0.3, 7.5, 6), wallMat);
  side.position.set(sx * 2.85, 0.3, -1);
  stationScene.add(side);
}
/* Ribs across the back wall - the cheapest thing that makes a flat panel read
   as built structure, and they catch the work lights at different angles. */
for (let i = -3; i <= 3; i++) {
  const rib = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.14, 0.18), deckMat);
  rib.position.set(0, i * 1.1 + 0.3, -3.2);
  stationScene.add(rib);
}
/* Hazard stripe along the deck edge: what the front of a real bay has, and what
   tells you where the floor stops. */
const stripe = new THREE.Mesh(new THREE.BoxGeometry(6, 0.06, 0.3), hazardMat);
stripe.position.set(0, -3.13, 1.85);
stationScene.add(stripe);

/* The docking clamp the ship hangs in. */
const collar = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 6, 20), hazardMat);
collar.position.set(0, -0.75, 0.2);
collar.rotation.x = Math.PI / 2.15;
stationScene.add(collar);
for (const sx of [-1, 1]) {
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 1.2), deckMat);
  arm.position.set(sx * 0.58, -0.78, -0.35);
  stationScene.add(arm);
}

/* ---------- lights ----------

   A workshop. Strong key from above and in front so the ship's facets read, a
   cool fill from behind so it is not sitting in a void, and a warm bounce off
   the deck. None of it changes with depth: the point of the room is that it is
   the one place in the game that is properly lit. */
const ambLight = new THREE.AmbientLight(0xbfd0e8, 1.15);
ambLight.layers.enable(SHIP_LAYER);
stationScene.add(ambLight);
const keyLight = new THREE.DirectionalLight(0xfff0dc, 3.4);
keyLight.position.set(2.2, 3, 5);
keyLight.layers.enable(SHIP_LAYER);
stationScene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x6f9ad8, 1.2);
fillLight.position.set(-3, 0.5, -2);
fillLight.layers.enable(SHIP_LAYER);
stationScene.add(fillLight);
const bounce = new THREE.PointLight(0xffb870, 9, 10, 1.5);
bounce.position.set(0, -1.6, 1.8);
bounce.layers.enable(SHIP_LAYER);
stationScene.add(bounce);

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
const glowMat = new THREE.MeshBasicMaterial({
  color: 0x3fe0ff, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false
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
    case 'tow':
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

/* Two columns flanking the ship, five high, plus one over the top. Every slot
   sits inside what a portrait frame can actually show at this camera distance -
   see the note on the room above. Angled inward so the wall reads as facing
   the middle rather than as shelves that happen to be in shot. */
/* Where the cases go, worked out from HOW MANY there are.

   It used to be a hand-written table of fifteen positions, and every case
   stood in its own fixed spot whether the shop had eight things in it or
   fifteen. That is most of what "it feels a bit cluttered" was: a first-hour
   player was looking at a wall built for a late-game one, five of whose cases
   were things they could not buy.

   Now the room is built for the shelf it actually has. Two columns while ten
   or fewer fit - which is the whole early game - and the back rack only
   appears when there is something to put on it. Fewer cases also means each
   one can be bigger, which is most of what makes a plate readable. */
type Slot = [number, number, number, number];

function layout(n: number): { slots: Slot[]; scale: number } {
  const slots: Slot[] = [];
  /* Split as evenly as the two columns allow, capped at six a side. */
  const perCol = Math.min(6, Math.ceil(Math.min(n, 12) / 2));
  const inCols = Math.min(n, perCol * 2);
  /* CENTRED on the deck, not hung from the top. Hanging from a fixed top meant
     a short shelf ran off the bottom of a portrait frame - three rows of the
     bigger cases put the last one under the deck. Centring keeps whatever
     number there is inside the same band the camera can actually show.

     The step is capped so a long shelf uses the full span and a short one does
     not spread until the cases stop reading as a column. */
  const SPAN = 3.1, MID = 0.5;
  const step = perCol > 1 ? Math.min(0.76, SPAN / (perCol - 1)) : 0;
  const top = MID + ((perCol - 1) * step) / 2;
  for (let i = 0; i < inCols; i++) {
    const col = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    slots.push([col * 1.18, top - row * step, -1.2, col * -0.5]);
  }
  /* Anything left goes on the back wall, spread to fit whatever the count is. */
  const rest = n - inCols;
  for (let i = 0; i < rest; i++) {
    const t = rest === 1 ? 0.5 : i / (rest - 1);
    slots.push([-1.52 + t * 3.04, 2.88, -2.3, 0]);
  }
  /* Bigger when there are fewer of them. Four cases at the size fifteen need
     is a wall of empty shelf. */
  const scale = n <= 8 ? 1.18 : n <= 11 ? 1.06 : 1;
  return { slots, scale };
}

/* Built once per upgrade; only the POSITIONS change when the shelf does. */
UPGRADES.forEach((u, i) => {
  const slot: Slot = [0, 0, -1.2, 0];
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
  /* What is on the shelf, and therefore where everything stands.

     Re-laid every time rather than once at boot, because the shelf grows: a
     case appears the run after you first reach its depth, and the room has to
     make space for it. `shelfStock` is the single source of what is stocked -
     see the note on it in config.ts about the CRAFT.md rule this corrects. */
  const stock = shelfStock(g.best.depth);
  const shown = new Set(stock.map((u) => u.key));
  const { slots, scale } = layout(stock.length);
  stock.forEach((u, i) => {
    const bay = bays.find((b) => b.key === u.key);
    if (!bay) return;
    const sl = slots[i];
    bay.group.position.set(sl[0], sl[1], sl[2]);
    bay.group.rotation.y = sl[3];
    bay.group.scale.setScalar(scale);
  });

  for (const b of bays) {
    const u = UPGRADES.find((x) => x.key === b.key);
    if (!u) continue;
    /* Not stocked yet: gone from the room entirely rather than dimmed in it.
       `visible` also takes it out of the raycast, so a case you cannot see is
       a case you cannot tap by accident. */
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
  refreshBays();
  stationScene.add(player);
  player.position.set(0, 0.35, 0.9);
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

let selected: UpgradeKey | null = null;
export function selectedBay() { return selected; }
export function selectBay(k: UpgradeKey | null) { selected = k; }

/* Slow turntable on the ship, a turn on each part, and the picked case lit.
   Driven from the frame loop so it runs on the same delta as everything else -
   and so it keeps moving while the shop is open, which is most of what makes
   the room feel like a place rather than a screenshot. */
export function stepStation(t: number, dt: number) {
  rig.rotation.y = Math.sin(t * 0.32) * 0.6;
  for (const b of bays) {
    b.part.rotation.y += dt * 0.65;
    const on = b.key === selected;
    const m = b.glow.material as THREE.MeshBasicMaterial;
    m.opacity += ((on ? 0.45 : 0.08) - m.opacity) * Math.min(1, dt * 8);
    const lift = on ? 0.27 : 0.15;
    b.part.position.y += (lift - b.part.position.y) * Math.min(1, dt * 8);
    b.part.scale.setScalar(b.part.scale.x + ((on ? 1.8 : 1.45) - b.part.scale.x) * Math.min(1, dt * 8));
  }
}

export function resizeStation() {
  stationCamera.aspect = window.innerWidth / window.innerHeight;
  stationCamera.updateProjectionMatrix();
}

/* Which case did that tap land on? Null for a tap on the floor or a wall,
   which deselects - a room you cannot tap out of is a menu again. */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
export function pickBay(clientX: number, clientY: number): UpgradeKey | null {
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
  for (const b of bays) {
    if (ray.intersectObject(b.group, true).length) return b.key;
  }
  return null;
}

export function renderStation() {
  /* The renderer no longer resets its own statistics - see renderWorld() - so
     the station has to, or its counts accumulate for as long as you stand in
     the shop. */
  renderer.info.reset();
  renderer.render(stationScene, stationCamera);
}
