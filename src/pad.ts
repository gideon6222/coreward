import * as THREE from 'three';
import { START_X } from './config';
import { scene } from './scene';
import { makeGlow, worldX } from './materials';

const pad = new THREE.Group();

/* The landing platform.

   The one structure in the game that is stationary, close to the camera and
   looked at while nothing else is happening - which makes it the only place
   where surface detail is worth paying for. Everything else in this world is
   thirty pixels tall and lives or dies on silhouette.

   Built from primitives rather than an imported model on purpose. A downloaded
   station kit would arrive with its own topology, its own normals and its own
   idea of scale, next to terrain that is flat-shaded low-poly with a hand-tuned
   palette; the join would be visible from the first frame. What it would buy
   is detail at a distance nobody views this from. */

const steelDark = new THREE.MeshLambertMaterial({ color: 0x39424e, emissive: 0x0a0e14, flatShading: true });
const steelLit = new THREE.MeshLambertMaterial({ color: 0x67727f, emissive: 0x141b23, flatShading: true });
const hazard = new THREE.MeshLambertMaterial({ color: 0xd8a33a, emissive: 0x2a1c05, flatShading: true });

/* deck, with a lip so it reads as a platform rather than a slab */
const slab = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 1.5), steelDark);
slab.position.y = 0.6;
pad.add(slab);
const deck = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 1.05), steelLit);
deck.position.y = 0.72;
pad.add(deck);

/* Hazard chevrons along the deck edge. Four small blocks read as painted
   markings at this size where a texture would read as noise. */
for (const sx of [-1.35, -0.45, 0.45, 1.35]) {
  const chev = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.16), hazard);
  chev.position.set(sx, 0.77, 0.44);
  chev.rotation.y = 0.35;
  pad.add(chev);
}

/* the collar the ship settles into */
const collar = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.055, 6, 16), steelLit);
collar.rotation.x = Math.PI / 2;
collar.position.y = 0.78;
pad.add(collar);

/* Legs, splayed, with feet. Splay is the whole reason this reads as standing
   on the ground instead of being pasted onto it. */
for (const sx of [-1.75, 1.75]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.15, 6), steelDark);
  leg.position.set(sx, 0.05, 0);
  leg.rotation.z = sx > 0 ? -0.13 : 0.13;
  pad.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 6), steelDark);
  foot.position.set(sx * 1.08, -0.5, 0);
  pad.add(foot);

  /* mast, with a bracket back to the deck */
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 6), steelLit);
  mast.position.set(sx, 1.6, 0);
  pad.add(mast);
  const stay = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.045, 0.045), steelDark);
  stay.position.set(sx * 0.78, 1.05, 0);
  stay.rotation.z = sx > 0 ? 0.62 : -0.62;
  pad.add(stay);
}

/* gantry, with a service rail under it */
const arch = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.16, 0.34), steelLit);
arch.position.y = 2.42;
pad.add(arch);
const rail = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.05, 0.05), steelDark);
rail.position.set(0, 2.24, 0.12);
pad.add(rail);
for (const sx of [-1.1, 0, 1.1]) {
  const drop = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.2, 0.045), steelDark);
  drop.position.set(sx, 2.3, 0.12);
  pad.add(drop);
}

export const padLights: THREE.Sprite[] = [];
for (let i = 0; i < 6; i++) {
  const sx = -1.5 + i * 0.6;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0x66ffcc }));
  bulb.position.set(sx, 0.82, 0.52);
  pad.add(bulb);
  const gl = makeGlow(0x55ffcc, 0.7, 0.8);
  gl.position.set(sx, 0.82, 0.62);
  pad.add(gl);
  padLights.push(gl);
}
export const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.3, 0.9, 3.4, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x49e0c0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
);
beam.position.y = 2.4;
pad.add(beam);
pad.position.x = worldX(START_X);
scene.add(pad);
