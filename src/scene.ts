import * as THREE from 'three';
import { W } from './config';
import { S } from './state';
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
export const lamp = new THREE.PointLight(0xffd9a0, 30, S.light(), 1.25);
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
