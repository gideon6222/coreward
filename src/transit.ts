import * as THREE from 'three';
import { renderer, scene as gameScene, SHIP_LAYER } from './scene';
import { player, rig, flames } from './ship';
import { paletteOf, skyHi, skyLo } from './config';
import { glowTex } from './materials';

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
  const g2 = new THREE.SphereGeometry(1, 40, 28);
  const body = new THREE.Mesh(g2, new THREE.MeshStandardMaterial({
    color: 0x888888, roughness: 0.92, metalness: 0, flatShading: false
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

/* ---------- the showcase ----------

   The title screen and the intro run on this same scene rather than on one of
   their own. Everything they need already exists here and is already correct:
   a starfield at three depths, a planet painted from a real palette, the ship,
   and a world coming apart in pieces. A second scene would be a second place
   for a world to be drawn, and the two would drift.

   What a beat can ask for is deliberately small - which world, is the ship in
   frame, is it breaking - because the intro is a sequence of pictures and not
   a second renderer. */
export interface Shot {
  /* which world's palette the planet is painted in, or -1 for no planet */
  world: number;
  /* how big it sits in frame, 0..1 */
  size: number;
  ship: boolean;
  breaking: boolean;
}

let shot: Shot = { world: -1, size: 0, ship: false, breaking: false };
let showing = false;
export function isShowcase() { return showing; }

export function beginShowcase() {
  if (showing) return;
  showing = true;
  transitScene.add(player);
  player.scale.setScalar(1.35);
  rig.rotation.set(0, 0, 0);
  for (const f of flames) { f.cone.visible = true; f.glow.visible = true; }
  transitScene.background = new THREE.Color(0x05070e);
  from.grp.visible = false;
  to.grp.visible = false;
  debris.visible = false;
}

export function endShowcase() {
  if (!showing) return;
  showing = false;
  gameScene.add(player);
  player.scale.setScalar(1);
  rig.rotation.set(0, 0, 0);
  player.visible = true;
  from.grp.visible = false;
  to.grp.visible = false;
  debris.visible = false;
}

export function setShot(next: Shot) { shot = next; }

/* `t` is how far into the current beat, 0..1, so a beat eases its planet in
   rather than cutting to it. */
export function stepShowcase(clock: number, t: number) {
  const ease = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);

  player.visible = shot.ship;
  if (shot.ship) {
    /* Nose up and drifting, the same orientation the crossing uses - a ship
       pointed at the floor in open space reads as falling. */
    player.position.set(-0.9 + Math.sin(clock * 0.5) * 0.12,
                        -0.5 + Math.sin(clock * 0.8) * 0.12, 0);
    rig.rotation.z = Math.PI + Math.sin(clock * 0.45) * 0.10;
    rig.rotation.y = Math.sin(clock * 0.33) * 0.16;
    rig.rotation.x = -0.28;
    for (const f of flames) {
      f.cone.scale.set(1.0, 1.25 + Math.sin(clock * 8) * 0.2, 1.0);
      f.glow.scale.setScalar(1.1 + Math.sin(clock * 6) * 0.18);
    }
  }

  const on = shot.world >= 0;
  to.grp.visible = on;
  if (on) {
    const pal = paletteOf(shot.world);
    (to.body.material as THREE.MeshStandardMaterial).color.setHex(pal.rock);
    (to.halo.material as THREE.SpriteMaterial).color.setHex(skyLo(shot.world));
    chunkMat.color.setHex(pal.rock);
    const near = 90 - ease * shot.size * 78;
    to.grp.position.set(0.16 * near, -0.06 * near, -near);
    let sc = 3 + ease * shot.size * 22;
    to.body.rotation.y = clock * 0.09;

    /* A core breaking, on the same instanced debris the crossing throws. The
       world shrinks as it goes, so the pieces read as having BEEN it rather
       than as rocks flying past it. */
    debris.visible = shot.breaking;
    if (shot.breaking) {
      sc *= 1 - ease * 0.45;
      const spread = ease * 7;
      for (let i = 0; i < CHUNKS; i++) {
        scratch.position.copy(to.grp.position).addScaledVector(dDir[i], spread * sc * 0.55);
        scratch.rotation.set(dSpin[i].x * clock, dSpin[i].y * clock, dSpin[i].z * clock);
        scratch.scale.setScalar(sc * 0.5 * (1 - ease * 0.3));
        scratch.updateMatrix();
        debris.setMatrixAt(i, scratch.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    }
    to.grp.scale.setScalar(sc);
  } else {
    debris.visible = false;
  }

  for (let L = 0; L < starLayers.length; L++) {
    const sp = (3 - L) * 7;
    starLayers[L].position.z = (clock * sp) % 90;
    (starLayers[L].material as THREE.PointsMaterial).opacity = 0.9 - L * 0.22;
  }
}

/* Sized here rather than from scene.ts's resize().

   scene.ts must not import this module: transit imports scene for the renderer
   and uses it at module load, so a scene -> transit edge would run this file's
   body before `renderer` was initialised and the game would not boot. The
   import direction stays one-way and this listens for itself. */
function fit() {
  transitCamera.aspect = Math.max(0.01, window.innerWidth / Math.max(1, window.innerHeight));
  transitCamera.position.set(0, 0.35, 6.2);
  transitCamera.lookAt(0, 0, -12);
  transitCamera.updateProjectionMatrix();
}
fit();
window.addEventListener('resize', fit);

export function renderTransit() {
  renderer.info.reset();
  renderer.render(transitScene, transitCamera);
}
