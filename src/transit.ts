import * as THREE from 'three';
import { renderer, scene as gameScene, SHIP_LAYER } from './scene';
import { player, rig, flames } from './ship';
import { paletteOf, skyHi, skyLo } from './sim/config';
import { glowTex } from './materials';
import planetNormalUrl from './textures/planet-normal.webp';

/* One sphere and one normal map for every world in this scene.

   The import is the rule in ASSETS.md applied rather than skipped: *"over
   about two hundred pixels and permanently on screen, import - and modelling
   it is what now needs justifying."* A world here is two to six hundred pixels
   tall and in frame for the entire intro and the entire crossing, which is as
   far onto the import side of that line as anything in this game gets. Before
   this they were flat-shaded spheres, and a flat-shaded sphere at that size is
   a billiard ball.

   NORMAL ONLY, never the colour map. That is what lets a photographed texture
   into a stylised game at all: a normal carries no colour, so all twelve
   palettes keep deciding exactly what colour a world is and only gain relief
   and a terminator with something in it. The colour map from the same download
   would drop a photograph of a rock into the middle of a low-poly scene.

   384px at q68, 48 KB - sized from what it is displayed at rather than from
   what the download offered. 1K was three quarters of a megabyte thrown away.
   Source: ambientCG Rock030, CC0. */
const planetGeo = new THREE.SphereGeometry(1, 48, 32);
const planetNormal = new THREE.TextureLoader().load(planetNormalUrl);
planetNormal.wrapS = planetNormal.wrapT = THREE.RepeatWrapping;
planetNormal.colorSpace = THREE.NoColorSpace;

/* The crossing between worlds.

   Playtest: *"have the ship actually look like it is flying between planets."*

   It was a dialog box. You destroyed a planet - the single most dramatic thing
   the game does - and were told about it in a paragraph with a button under
   it. Everything else in Coreward happens in the world; this one moment was
   described rather than shown.

   Its own scene, for the same reason the Outfitter has one: the lighting here
   is a sun in open space and the game's is a lamp down a hole, and one set of
   lights cannot be both. The ship is REPARENTED in, not copied - the machine
   crossing the gap is wearing the hardware you bought, because it is the same
   object. See dockShip() in station.ts for the same trick and the same reason.

   The shape of the crossing is four beats over about nine seconds:

     0.00-0.18  the world you broke falls away behind, in pieces
     0.18-0.62  open space, the drive lit, stars going past
     0.62-0.88  the destination swells, its own colour arriving with it
     0.88-1.00  descent, and the sky becomes the sky you will be digging under

   No minigame in it. `CRAFT.md` is clear that an input which cannot be failed
   or optimised is a rhythm rather than a decision, and a transit minigame is
   exactly that - it would be there to occupy you rather than to ask anything. */

export const transitScene = new THREE.Scene();
export const transitCamera = new THREE.PerspectiveCamera(52, 1, 0.1, 900);
/* The ship lives on SHIP_LAYER so the world's two-pass render can exclude it -
   see renderWorld() in scene.ts. A camera that has not enabled that layer
   simply does not draw it, which out here means an empty starfield with the
   whole point of the scene missing. The lights need it too, for the same
   reason the station's do. */
transitCamera.layers.enable(SHIP_LAYER);

/* Lit from ahead and to the side, so the hull reads as a solid object against
   the stars rather than as a silhouette. Dimmer than the station's rig: out
   here the only light sources are two planets and a distant sun. */
const key = new THREE.DirectionalLight(0xfff0dd, 2.1);
key.position.set(4, 3, 6);
key.layers.enable(SHIP_LAYER);
transitScene.add(key);
const fill = new THREE.DirectionalLight(0x5f7fbf, 0.7);
fill.position.set(-5, -2, 2);
fill.layers.enable(SHIP_LAYER);
transitScene.add(fill);
const ambT = new THREE.AmbientLight(0xffffff, 0.35);
ambT.layers.enable(SHIP_LAYER);
transitScene.add(ambT);

/* ---------- stars ----------

   Three depths of them, and they move at three speeds. One sheet of stars
   reads as a printed backdrop however fast it scrolls; the parallax is the
   entire difference between "stars" and "travelling past stars". */
const starLayers: THREE.Points[] = [];
for (let L = 0; L < 3; L++) {
  const n = 300 - L * 70;
  const pos = new Float32Array(n * 3);
  const spread = 60 + L * 70;
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 1] = (Math.random() - 0.5) * spread;
    pos[i * 3 + 2] = -20 - Math.random() * (120 + L * 160);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTex, color: 0xffffff, size: 1.5 - L * 0.4,
    transparent: true, opacity: 0.9 - L * 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  pts.frustumCulled = false;
  transitScene.add(pts);
  starLayers.push(pts);
}

/* ---------- the two worlds ----------

   A sphere each, painted from the palette of the planet it stands for, so the
   world you are leaving and the world you are arriving at are recognisably the
   two worlds on the chart. The destination's colour arriving before you land
   is most of what makes the crossing feel like it goes somewhere. */
function makeWorld() {
  const body = new THREE.Mesh(planetGeo, new THREE.MeshStandardMaterial({
    color: 0x888888, roughness: 0.92, metalness: 0, flatShading: false,
    normalMap: planetNormal, normalScale: new THREE.Vector2(1.5, 1.5)
  }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x8899ff, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  halo.scale.setScalar(3.1);
  const grp = new THREE.Group();
  grp.add(body); grp.add(halo);
  transitScene.add(grp);
  return { grp, body, halo };
}
const from = makeWorld();
const to = makeWorld();

/* The debris of the world you just broke. Instanced, because it is the same
   chunk forty times and the only thing that differs is where it is going. */
const CHUNKS = 44;
const chunkGeo = new THREE.IcosahedronGeometry(0.16, 0);
const chunkMat = new THREE.MeshStandardMaterial({ color: 0x8a7f6a, roughness: 1, flatShading: true });
const debris = new THREE.InstancedMesh(chunkGeo, chunkMat, CHUNKS);
debris.frustumCulled = false;
transitScene.add(debris);
const dDir: THREE.Vector3[] = [];
const dSpin: THREE.Vector3[] = [];
for (let i = 0; i < CHUNKS; i++) {
  const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
  dDir.push(new THREE.Vector3(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e))
    .multiplyScalar(0.5 + Math.random() * 1.4));
  dSpin.push(new THREE.Vector3(Math.random() * 2, Math.random() * 2, Math.random() * 2));
}
const scratch = new THREE.Object3D();

let docked = false;
export function isCrossing() { return docked; }

/* Held so the render can paint the sky behind the destination as it arrives. */
let toPal = paletteOf(0);
let toSky = 0x0d2b52;

export function beginTransit(fromWorld: number, toWorld: number) {
  if (docked) return;
  docked = true;
  transitScene.add(player);
  player.scale.setScalar(1.55);
  rig.rotation.set(0, 0, 0);
  for (const f of flames) { f.cone.visible = true; f.glow.visible = true; }

  const fp = paletteOf(fromWorld);
  toPal = paletteOf(toWorld);
  toSky = skyLo(toWorld);
  (from.body.material as THREE.MeshStandardMaterial).color.setHex(fp.rock);
  (from.halo.material as THREE.SpriteMaterial).color.setHex(skyLo(fromWorld));
  chunkMat.color.setHex(fp.rock);
  (to.body.material as THREE.MeshStandardMaterial).color.setHex(toPal.rock);
  (to.halo.material as THREE.SpriteMaterial).color.setHex(skyLo(toWorld));
  transitScene.background = new THREE.Color(skyHi(fromWorld)).multiplyScalar(0.10);
}

export function endTransit() {
  if (!docked) return;
  docked = false;
  gameScene.add(player);
  player.scale.setScalar(1);
  rig.rotation.set(0, 0, 0);
}

/* `t` is 0..1 across the whole crossing. Everything below is a function of it
   and nothing accumulates, so the sequence is the same length however the
   frame rate wanders - and so a skip can jump straight to the end. */
export function stepTransit(t: number, clock: number) {
  const ease = t * t * (3 - 2 * t);

  /* The ship holds the middle of frame and banks, because a ship dead straight
     against moving stars reads as a still image of a ship. */
  player.position.set(Math.sin(clock * 0.7) * 0.16, -0.35 + Math.sin(clock * 0.9) * 0.1, 0);
  /* Nose FORWARD, which underground means straight up: FACE_ANGLE puts the
     drill at the floor at rotation zero, and a ship crossing open space with
     its drill pointed at the deck reads as falling rather than flying. A
     little roll and yaw on top so it is a machine holding a course rather than
     a model on a turntable. */
  rig.rotation.z = Math.PI + Math.sin(clock * 0.55) * 0.10;
  rig.rotation.y = Math.sin(clock * 0.4) * 0.14;
  rig.rotation.x = -0.30 + Math.sin(clock * 0.31) * 0.05;
  for (const f of flames) {
    f.cone.scale.set(1.15, 1.5 + Math.sin(clock * 9) * 0.22, 1.15);
    f.glow.scale.setScalar(1.3 + Math.sin(clock * 7) * 0.2);
  }

  /* The world you broke: behind you and going. Its debris keeps expanding the
     whole way, so a glance back at any point still says what happened. */
  /* The lateral offset scales WITH the distance, which is the whole trick: a
     fixed offset in world space shrinks to nothing in screen space as the
     object recedes, so both planets slid in behind the ship and were eclipsed
     by it. Proportional offsets hold their place in frame. */
  const away = 6 + ease * 150;
  from.grp.position.set(-0.30 * away, 0.16 * away, -away);
  from.grp.scale.setScalar(3.4);
  from.grp.visible = t < 0.75;
  const spread = 1 + t * 9;
  for (let i = 0; i < CHUNKS; i++) {
    scratch.position.copy(from.grp.position).addScaledVector(dDir[i], spread * 3.4);
    scratch.rotation.set(dSpin[i].x * clock, dSpin[i].y * clock, dSpin[i].z * clock);
    const sc = 3.4 * (1 - t * 0.35);
    scratch.scale.setScalar(sc);
    scratch.updateMatrix();
    debris.setMatrixAt(i, scratch.matrix);
  }
  debris.instanceMatrix.needsUpdate = true;
  debris.visible = t < 0.75;

  /* The destination: nothing, then a point, then everything. Held off until
     the middle of the crossing so arriving is an event rather than a slow
     approach that was always visible. */
  const app = Math.max(0, (t - 0.42) / 0.58);
  const near = 260 - app * app * 250;
  to.grp.position.set(0.26 * near, -0.15 * near, -near);
  to.grp.scale.setScalar(3.0 + app * app * 30);
  to.grp.visible = t > 0.36;

  /* Stars stream past at three speeds and fade out on arrival, when the sky of
     the destination should be what fills the frame. */
  for (let L = 0; L < starLayers.length; L++) {
    const sp = (3 - L) * 26;
    starLayers[L].position.z = (clock * sp) % 90;
    (starLayers[L].material as THREE.PointsMaterial).opacity =
      (0.9 - L * 0.22) * (1 - Math.max(0, (t - 0.82) / 0.18));
  }

  /* The sky arrives before the ground does. */
  /* Deep space stays dark. The destination's colour arrives as a tint on the
     void rather than as its sky, because a bright sky belongs to standing
     under one - and Halcyne's is gold, which at full strength turned the whole
     crossing into a wash and buried the stars in it. */
  const sky = new THREE.Color(toSky).multiplyScalar(0.055 + Math.max(0, (t - 0.7) / 0.3) * 0.16);
  (transitScene.background as THREE.Color).lerp(sky, 0.06);
  key.color.setHex(t > 0.7 ? toPal.haze : 0xfff0dd);
}

/* ---------- the flythrough ----------

   The title screen and the intro run on this same scene rather than one of
   their own: it already has a starfield at three depths, palette-painted
   worlds and the ship, and a second scene would be a second place for a world
   to be drawn.

   This replaced a set of discrete SHOTS, and the reason is worth keeping. Each
   beat used to ease a planet in from nothing, hold it, and cut to the next -
   which is a slide show with a dissolve, and a filmstrip of it says so at a
   glance: tiny planet, big planet, cut, tiny planet. The playtest note was
   *"make it less like a slide show and more like the ship is flying past
   planets."*

   So there are no shots. There is a LINE of worlds ahead of the ship and one
   distance that only ever increases. A world comes up out of the dark, swells,
   passes to one side and falls behind, and when it is behind it is recycled to
   the far end of the line as somewhere else. Nothing cuts, and the captions
   fade over the top on their own clock - so the text can change without the
   picture changing, which is the whole difference.

   The landing at the end is a separate mode on the same scene: the flight
   decelerates, one world comes head-on instead of to the side, and the
   atmosphere takes the screen. It is shared with CONTINUE, because "fly to the
   planet" is the same event whether you just watched the intro or tapped a
   button, and two copies of it would drift apart. */

const FLY_SPEED = 26;        /* world units per second of travel */
const FLY_NEAR = 14;         /* past the camera; anything beyond is recycled */
const FLY_FAR = -760;        /* where a recycled world reappears */

interface FlyWorld {
  grp: THREE.Group;
  body: THREE.Mesh;
  halo: THREE.Sprite;
  world: number;
  z: number;
  x: number; y: number; r: number;
  spin: number;
}

const flyPool: FlyWorld[] = [];
let flyDist = 0;
let flyRoll = 0;
let showing = false;

/* The landing. -1 while flying past; a world id while coming down on one. */
let landWorld = -1;
let landT = 0;
let landDur = 1;

/* The launch. CONTINUE does not begin in mid-flight: playtest, *"I want the
   ship to take off and fly to the planet they were on last."* So there is a
   burn first - the drive lights, the stars stretch and rush, and the worlds
   ahead close much faster - and then it settles into the crossing and comes
   down. It is the difference between resuming a journey and starting one. */
let launchT = 0;
let launchDur = 0;
let launchWorld = -1;
const LAUNCH_BOOST = 5.5;   /* multiple of cruise speed at the peak of the burn */
/* How far the nose is tipped away from the camera while cruising.

   It was -1.16, a quarter turn less about twenty-four degrees, on the argument
   that dead astern shows the engine bells and nothing else. Measured, that put
   the drill at (0, +0.40, -0.92): pointing into the screen, yes, but tipped a
   quarter of a right angle NOSE-UP, which fires the flare down the screen. The
   eye reads a ship climbing while the worlds stream past saying it is going
   forward - two directions at once, which is the exact fault the broadside
   version had and which was supposed to have been fixed in round three.

   Playtest: *"the ship flies backwards in the into scene, can you make it fly
   with the drill facing forward, the direction it is flying."*

   It is square now, and the three-quarter view comes from where the CAMERA
   stands rather than from tipping the ship.

   **The sign is +PI/2 and it was MEASURED, not derived.** Two attempts at this
   were argued from the code - local -Y, rotated by an Euler in XYZ order,
   therefore -Z - and both were wrong in the same direction. Reading the vector
   between the hull and the drill out of the running game says the drill points
   +0.999 z at -PI/2, straight at the camera, and -0.999 at +PI/2. Three
   reports of "the ship flies backwards" and two fixes that reasoned their way
   to the wrong answer is enough: `the ship flies drill-first in the showcase`
   in the smoke suite now measures that vector every run. */
const CRUISE_PITCH = Math.PI / 2;

export function isShowcase() { return showing; }
export function isLanding() { return landWorld >= 0; }
/* 0..1 through the landing, for the caller that has to know when it is over. */
export function landingT() { return landDur <= 0 ? 1 : Math.min(1, landT / landDur); }

function makeFlyWorld(): FlyWorld {
  const body = new THREE.Mesh(planetGeo, new THREE.MeshStandardMaterial({
    color: 0x888888, roughness: 0.95, metalness: 0,
    /* The one imported thing in this scene, and the rule says import it: a
       world here is two to six hundred pixels tall and on screen for the whole
       sequence. NORMAL ONLY, never the colour map - see ASSETS.md. The palette
       keeps deciding what colour a world is, and this only gives it relief and
       a terminator that is not a smooth gradient. */
    normalMap: planetNormal,
    normalScale: new THREE.Vector2(1.5, 1.5)
  }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0x8899ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  halo.scale.setScalar(3.2);
  const grp = new THREE.Group();
  grp.add(body); grp.add(halo);
  grp.visible = false;
  transitScene.add(grp);
  return { grp, body, halo, world: 0, z: 0, x: 0, y: 0, r: 10, spin: 0 };
}

/* Put one world somewhere on the line, with its own size, offset and colour. */
function placeFly(f: FlyWorld, z: number, i: number) {
  f.z = z;
  /* Alternating sides so the ship threads between them rather than watching a
     procession down one edge. The offset scales with the radius, so a big
     world passes wide and a small one passes close. */
  f.r = 8 + (flyRoll % 3) * 6;
  const side = (i % 2 === 0) ? -1 : 1;
  f.x = side * (f.r * 0.9 + 6);
  f.y = ((flyRoll % 5) - 2) * 3.5;
  f.world = FLY_WORLDS[flyRoll % FLY_WORLDS.length];
  f.spin = 0.04 + (flyRoll % 4) * 0.015;
  flyRoll++;

  /* Darkened well below the palette's own value. These are unlit worlds seen
     from outside, and at full palette brightness they came out as sweets in a
     jar - the colour still identifies them, it just is not the loudest thing
     in the frame. */
  const pal = paletteOf(f.world);
  (f.body.material as THREE.MeshStandardMaterial).color.setHex(pal.rock).multiplyScalar(0.5);
  (f.halo.material as THREE.SpriteMaterial).color.setHex(skyLo(f.world));
  (f.halo.material as THREE.SpriteMaterial).opacity = 0.32;
  f.grp.visible = true;
}

/* Which worlds the flight passes. Chosen for contrast rather than for order -
   the point of flying past them is that they are visibly different places. */
const FLY_WORLDS = [1, 4, 8, 2, 10, 6, 3];

export function beginShowcase() {
  if (showing) return;
  showing = true;
  landWorld = -1;
  flyDist = 0;
  flyRoll = 0;
  transitScene.add(player);
  player.scale.setScalar(1.35);
  rig.rotation.set(0, 0, 0);
  for (const f of flames) { f.cone.visible = true; f.glow.visible = true; }
  transitScene.background = new THREE.Color(0x05070e);
  from.grp.visible = false;
  to.grp.visible = false;
  debris.visible = false;

  while (flyPool.length < 4) flyPool.push(makeFlyWorld());
  /* Four, spread wide. Five at half this spacing put four or five worlds on
     screen at once, which reads as a busy solar system - and the Drift is
     supposed to be somewhere you would leave if you could. Sparse is the
     mood; the filmstrip is what showed it was not. */
  flyPool.forEach((f, i) => placeFly(f, -120 - i * 185, i));
}

export function endShowcase() {
  if (!showing) return;
  showing = false;
  landWorld = -1;
  launchWorld = -1;
  gameScene.add(player);
  player.scale.setScalar(1);
  rig.rotation.set(0, 0, 0);
  player.visible = true;
  for (const f of flyPool) f.grp.visible = false;
  from.grp.visible = false;
  to.grp.visible = false;
  debris.visible = false;
}

/* Stop flying past and come down on one. Used by the end of the intro and by
   CONTINUE, which is the same event from two places. */
/* Burn, then cruise, then come down - all from one call, because the caller
   should be asking for "go to this world", not sequencing three phases. */
export function beginLaunch(world: number, secs = 2.6) {
  launchWorld = world;
  launchT = 0;
  launchDur = secs;
  landWorld = -1;
}

export function isLaunching() { return launchWorld >= 0; }

export function beginLanding(world: number, secs = 4.5) {
  launchWorld = -1;
  landWorld = world;
  landT = 0;
  landDur = secs;
  for (const f of flyPool) f.grp.visible = false;
  const l = flyPool[0];
  l.world = world;
  l.grp.visible = true;
  const pal = paletteOf(world);
  (l.body.material as THREE.MeshStandardMaterial).color.setHex(pal.rock);
  (l.halo.material as THREE.SpriteMaterial).color.setHex(skyLo(world));
}

export function stepShowcase(dt: number, clock: number) {
  /* The ship: nose forward, holding a course. Underground "forward" is down,
     so rotation PI points it the way it is going - a ship crossing open space
     with its drill at the deck reads as falling. */
  player.visible = true;
  /* Held left of centre and low, so the worlds have the rest of the frame to
     come through. Moved in from -0.62 when the camera went off-axis for the
     three-quarter view: the old station put the ship half outside the frame. */
  player.position.set(-0.08 + Math.sin(clock * 0.5) * 0.10,
                      -0.34 + Math.sin(clock * 0.8) * 0.09, 0);
  /* NOSE-FIRST, seen from behind.

     Playtest: *"can you make it look like the ship is actually flying toward
     the planets rather than always facing us ... it should point the drill end
     toward what it is flying to."* It was flying broadside - the drill pointed
     up the screen while the worlds receded into it, two directions at once,
     and the eye believes the one it can measure. The ship looked parked.

     At rotation zero the drill points at the floor (local -Y - FACE_ANGLE has
     down at zero), so pointing it into the screen is taking -Y to -Z, which is
     a quarter turn about X. CRUISE_PITCH is a little short of that quarter
     turn on purpose: dead-on would show the engine bells and nothing else, and
     a few degrees off gives the three-quarter rear view that reads as a
     machine rather than as a circle. */
  rig.rotation.z = Math.PI + Math.sin(clock * 0.45) * 0.06;
  rig.rotation.y = Math.sin(clock * 0.33) * 0.10;
  rig.rotation.x = CRUISE_PITCH + Math.sin(clock * 0.4) * 0.05;
  for (const f of flames) {
    f.cone.scale.set(1.0, 1.25 + Math.sin(clock * 8) * 0.2, 1.0);
    f.glow.scale.setScalar(1.1 + Math.sin(clock * 6) * 0.18);
  }

  if (landWorld >= 0) { stepLanding(dt, clock); return; }

  /* The burn. Speed peaks early and falls away, which is what an engine
     lighting feels like - a constant fast scroll reads as a different cruise
     speed rather than as acceleration. */
  let boost = 1;
  if (launchWorld >= 0) {
    launchT += dt;
    const u = Math.min(1, launchT / launchDur);
    boost = 1 + (LAUNCH_BOOST - 1) * Math.sin(u * Math.PI) ** 0.7;
    /* Thrown back in the seat: the ship sits lower and pitches up under the
       burn, and recovers as it falls off. */
    const kick = Math.sin(u * Math.PI);
    player.position.y -= kick * 0.30;
    /* Further over under thrust, not up: a ship accelerating along its own axis
       digs its nose in. Lifting it would point the drill away from where it is
       going at exactly the moment it is going there hardest. */
    rig.rotation.x -= kick * 0.16;
    for (const f of flames) {
      f.cone.scale.set(1.0 + kick * 0.5, 1.25 + kick * 2.2, 1.0 + kick * 0.5);
      f.glow.scale.setScalar(1.1 + kick * 1.5);
    }
    if (launchT >= launchDur) beginLanding(launchWorld);
  }

  flyDist += FLY_SPEED * boost * dt;
  for (let i = 0; i < flyPool.length; i++) {
    const f = flyPool[i];
    const z = f.z + flyDist;
    if (z > FLY_NEAR) {
      /* Behind the ship. Send it back to the far end as somewhere else - which
         is what makes the flight endless without ever cutting. */
      placeFly(f, FLY_FAR - flyDist, i);
      continue;
    }
    f.grp.position.set(f.x, f.y, z);
    f.grp.scale.setScalar(f.r);
    f.body.rotation.y = clock * f.spin;
  }

  streamStars(clock, 1, boost);
}

function stepLanding(dt: number, clock: number) {
  landT += dt;
  const t = landingT();
  const e = t * t;

  const l = flyPool[0];
  /* Head-on, and closing. Off to one side at the start so it reads as the
     ship turning toward it rather than as a planet appearing in front. */
  const z = -230 + e * 218;
  l.grp.position.set((1 - e) * 26, (1 - e) * -8, z);
  l.grp.scale.setScalar(16 + e * 26);
  l.body.rotation.y = clock * 0.05;

  /* Turning INTO it. The cruise attitude points the drill into the screen;
     the world is ahead and drifting to centre, so the ship rolls level and
     tips a little further down as it commits - and by the end it is pointed at
     the surface it is about to touch. A ship that kept its cruise attitude all
     the way down arrives flying sideways into a planet. */
  rig.rotation.x = CRUISE_PITCH - e * 0.30;
  rig.rotation.z = Math.PI + (1 - e) * Math.sin(clock * 0.45) * 0.06;
  rig.rotation.y = (1 - e) * Math.sin(clock * 0.33) * 0.10;
  player.position.set((1 - e) * -0.08, -0.34 + e * 0.26, 0);

  /* Atmosphere: the world's own sky takes the frame over the last stretch. */
  const glow = Math.max(0, (t - 0.62) / 0.38);
  const sky = new THREE.Color(skyLo(landWorld)).multiplyScalar(0.05 + glow * 0.95);
  (transitScene.background as THREE.Color).lerp(sky, Math.min(1, dt * 4));

  streamStars(clock, 1 - glow, 1);
}

/* `boost` stretches the starfield during a burn. Accumulated rather than
   derived from `clock`, or changing the speed would make the whole field jump
   to a different place in its cycle instead of speeding up from where it
   was. */
let starScroll = 0;
function streamStars(clock: number, alpha: number, boost = 1) {
  starScroll += boost * 0.28;
  for (let L = 0; L < starLayers.length; L++) {
    const sp = (3 - L) * 16;
    starLayers[L].position.z = (starScroll * sp) % 90;
    (starLayers[L].material as THREE.PointsMaterial).opacity = (0.9 - L * 0.22) * alpha;
    /* Points cannot stretch, so speed reads as brightness instead - the field
       flares under the burn and settles back. */
    (starLayers[L].material as THREE.PointsMaterial).size =
      (1.5 - L * 0.4) * (1 + (boost - 1) * 0.35);
  }
}

/* Sized here rather than from scene.ts's resize().

   scene.ts must not import this module: transit imports scene for the renderer
   and uses it at module load, so a scene -> transit edge would run this file's
   body before `renderer` was initialised and the game would not boot. The
   import direction stays one-way and this listens for itself. */
function fit() {
  transitCamera.aspect = Math.max(0.01, window.innerWidth / Math.max(1, window.innerHeight));
  /* Off the axis and above it, so a ship flying dead away from us is still
     seen three-quarter rear rather than as a circle of engine bells. This is
     what CRUISE_PITCH used to be doing by tipping the ship, which cost the
     picture its honesty about which way the thing was going. */
  transitCamera.position.set(0.92, 0.62, 6.2);
  transitCamera.lookAt(-0.05, -0.22, -13);
  transitCamera.updateProjectionMatrix();
}
fit();
window.addEventListener('resize', fit);

export function renderTransit() {
  renderer.info.reset();
  renderer.render(transitScene, transitCamera);
}
