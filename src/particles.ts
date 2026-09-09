import * as THREE from 'three';
import { scene } from './scene';
import { makeGlow } from './materials';

/* One Points draw whatever the count, so a bigger ring buffer is free except
   for the memory. More debris per strike is the cheapest weight in the game. */
const PMAX = 1200;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
const pCol = new Float32Array(PMAX * 3);
const pVel: THREE.Vector3[] = [];
const pLife = new Float32Array(PMAX);
for (let i = 0; i < PMAX; i++) { pPos[i * 3 + 1] = 9999; pVel.push(new THREE.Vector3()); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false
}));
pts.frustumCulled = false;
scene.add(pts);
let pHead = 0;

export function spray(x: number, y: number, color: number, count: number, power: number, life: number) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const k = pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = x + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 2] = 0.4 + Math.random() * 0.5;
    const f = 0.7 + Math.random() * 0.5;
    pCol[k * 3] = c.r * f; pCol[k * 3 + 1] = c.g * f; pCol[k * 3 + 2] = c.b * f;
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    const s = power * (0.4 + Math.random() * 0.9);
    pVel[k].set(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + power * 0.3, Math.sin(a) * Math.cos(e) * s * 0.5);
    pLife[k] = life * (0.6 + Math.random() * 0.6);
  }
}

export function stepParticles(dt: number) {
  let live = false;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    live = true;
    pLife[i] -= dt;
    pVel[i].y -= 14 * dt;
    pPos[i * 3] += pVel[i].x * dt;
    pPos[i * 3 + 1] += pVel[i].y * dt;
    pPos[i * 3 + 2] += pVel[i].z * dt;
    if (pLife[i] <= 0) pPos[i * 3 + 1] = 9999;
  }
  if (live) pGeo.attributes.position.needsUpdate = true;
}

/* The drifting dust that used to live here is now dust.ts.

   It was 260 flat-shaded square points, parented to the ship with
   `dust.position.set(px, py, 0)` and given a slow spin. That parenting is why
   it never read as dust: a cloud that travels with you cannot move past you,
   so flying a hundred metres left the same motes in the same places. The
   replacement is world-anchored, lit by the same field as everything else, and
   wraps around the ship instead of following it. */

/* stars and a distant sun, surface only */
const sGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(260 * 3);
for (let i = 0; i < 260; i++) {
  sPos[i * 3] = (Math.random() - 0.5) * 90;
  sPos[i * 3 + 1] = 6 + Math.random() * 60;
  sPos[i * 3 + 2] = -30 - Math.random() * 30;
}
sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
export const starMat = new THREE.PointsMaterial({ size: 0.35, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
const stars = new THREE.Points(sGeo, starMat);
stars.frustumCulled = false;
scene.add(stars);

export const sunSprite = makeGlow(0xffd9a0, 16, 0.5);
sunSprite.position.set(-14, 24, -28);
scene.add(sunSprite);
