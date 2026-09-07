import * as THREE from 'three';
import { scene } from './scene';
import { makeGlow } from './materials';

export const player = new THREE.Group();
export const rig = new THREE.Group();
player.add(rig);

const hullMat = new THREE.MeshLambertMaterial({ color: 0x3aa8d8, emissive: 0x0a2a3a, flatShading: true });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xe8eef8, emissive: 0x1a2230, flatShading: true });
export const darkMat = new THREE.MeshLambertMaterial({ color: 0x28303c, flatShading: true });

const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.66, 6), hullMat);
rig.add(hull);
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 6), trimMat);
collar.position.y = -0.3;
rig.add(collar);
for (const sx of [-0.36, 0.36]) {
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.44, 6), darkMat);
  pod.position.set(sx, 0.06, 0);
  rig.add(pod);
}
export const bit = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.5, 8), trimMat);
bit.position.y = -0.56;
bit.rotation.x = Math.PI;
rig.add(bit);
const cab = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xa07a10 }));
cab.position.set(0, 0.1, 0.3);
rig.add(cab);
const cabGlow = makeGlow(0xffe9a0, 1.1, 0.7);
cabGlow.position.set(0, 0.1, 0.42);
rig.add(cabGlow);

export const flames: { cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; glow: THREE.Sprite }[] = [];
for (const sx of [-0.36, 0.36]) {
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 }));
  fl.position.set(sx, 0.42, 0);
  rig.add(fl);
  const fg = makeGlow(0x7ad4ff, 0.9, 0.9);
  fg.position.set(sx, 0.5, 0);
  rig.add(fg);
  flames.push({ cone: fl, glow: fg });
}
scene.add(player);
export const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };
