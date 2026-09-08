import * as THREE from 'three';
import { W } from './config';
import { S } from './state';
import { LAMP_DECAY } from './feel';
import { R } from './runtime';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
export const gameEl = document.getElementById('game')!;
gameEl.appendChild(renderer.domElement);

/* Scene.fog is typed FogBase | null and only FogExp2 has `density`, which
   the frame loop writes every frame. Keep a typed handle so that is checked
   rather than assumed. */
export const fog = new THREE.FogExp2(0x05070d, 0.028);
scene.fog = fog;

export const amb = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(amb);
export const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
sun.position.set(5, 12, 8);
scene.add(sun);
export const rim = new THREE.DirectionalLight(0x4a7ad0, 0.5);
rim.position.set(-6, -3, -6);
scene.add(rim);
/* Backdrop.

   The terrain is a single layer of chunks, so anywhere one is missing - a dug
   side tunnel, the edge of the streamed window - the sky gradient shows
   straight through and underground reads as cut-out shapes floating in
   daylight. This sits behind the terrain so those gaps read as rock continuing
   into the dark instead.

   Completely static: the world is 13 columns wide and this is 60, so it never
   needs to follow the camera, and its top edge sits at the surface so it never
   covers the sky or the stars. One draw call, set up once, never touched again.

   Deliberately dark and unlit - fog tints it toward whatever the depth colour
   is, so it goes ember below the heat line along with everything else. */
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 400),
  new THREE.MeshBasicMaterial({ color: 0x14161c })
);
/* Moved back from -1.4 to make room for the parallax layers, which have to
   sit BEHIND the drifting dust (z -0.7 to -1.3) and IN FRONT of this. At -1.4
   there was a tenth of a unit to work with; the first attempt put them behind
   this plane, which is opaque, and they rendered perfectly into nothing. */
backdrop.position.set(0, 0.5 - 200, -3.2);
scene.add(backdrop);

/* Decay 1.75, not 1.25. The pool has a hard edge now instead of trailing off
   across half the frame, which is the whole reason the tight framing reads as
   "this is as far as the light reaches" rather than as a close camera. */
export const lamp = new THREE.PointLight(0xffd9a0, 30, S.light(), LAMP_DECAY);
scene.add(lamp);

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  /* Rows framed vertically. Portrait aspect is about 0.46, so this also decides
     how many columns are visible - 18 rows shows roughly 8 columns. Raising it
     is what makes the world feel large: the ship shrinks against the terrain and
     more of the shaft is legible at once. Affordable because terrain is
     instanced; before Stage 2 this would have been ~300 draw calls. */
  const rows = 18, halfV = Math.tan((camera.fov * Math.PI) / 360);
  let z = rows / (2 * halfV);
  const needW = (W + 2) / camera.aspect;
  if (needW < rows) z = Math.max(9, needW / (2 * halfV));
  R.camZ = z;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
