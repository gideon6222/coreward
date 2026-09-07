import * as THREE from 'three';
import { START_X } from './config';
import { scene } from './scene';
import { makeGlow, worldX } from './materials';
import { darkMat } from './ship';

const pad = new THREE.Group();
const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 1.5), new THREE.MeshLambertMaterial({ color: 0x3d4753, emissive: 0x0c1016, flatShading: true }));
slab.position.y = 0.62;
pad.add(slab);
const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.0), new THREE.MeshLambertMaterial({ color: 0x59646f, emissive: 0x12181f, flatShading: true }));
deck.position.y = 0.75;
pad.add(deck);
for (const sx of [-1.7, 1.7]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.0, 6), darkMat);
  leg.position.set(sx, 0.1, 0);
  pad.add(leg);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), new THREE.MeshLambertMaterial({ color: 0x5b6672, flatShading: true }));
  mast.position.set(sx, 1.5, 0);
  pad.add(mast);
}
const arch = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x4a545f, emissive: 0x101820, flatShading: true }));
arch.position.y = 2.28;
pad.add(arch);

export const padLights = [];
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
