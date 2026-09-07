import * as THREE from 'three';
import { W } from './config';
import { S } from './state';
import { R } from './runtime';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
export const gameEl = document.getElementById('game');
gameEl.appendChild(renderer.domElement);

scene.fog = new THREE.FogExp2(0x05070d, 0.028);

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
  const rows = 13, halfV = Math.tan((camera.fov * Math.PI) / 360);
  let z = rows / (2 * halfV);
  const needW = (W + 2) / camera.aspect;
  if (needW < rows) z = Math.max(9, needW / (2 * halfV));
  R.camZ = z;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
