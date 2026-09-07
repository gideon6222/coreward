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
/* The drill.

   Was a plain cone, which read as a traffic cone once it started spinning
   because a smooth cone looks identical at every angle. This is a real auger:
   a tapered hexagonal cylinder whose vertices are twisted around Y in
   proportion to their height, so the flutes spiral. It costs one mesh and one
   draw call - the same as the cone - and the spiral is what makes the rotation
   legible.

   Kept as a Group so the chuck spins with it; the frame loop drives
   bit.rotation.y and does not care which it is. */
export const bit = new THREE.Group();

const augerGeo = (() => {
  const g = new THREE.CylinderGeometry(0.25, 0.03, 0.56, 6, 6, false);
  const pos = g.attributes.position;
  /* deeper spiral: at portrait phone scale a subtle twist is invisible, and
     the whole point of the flutes is that the rotation reads */
  const TWIST = 7.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = (y + 0.28) * TWIST;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.setXYZ(i, x * ca - z * sa, y, x * sa + z * ca);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
})();

/* Steel rather than the white trim: a near-white auger blows out under the
   cockpit glow and the spiral disappears, which defeats the point of it. */
const augerMat = new THREE.MeshLambertMaterial({ color: 0x9fb0c4, emissive: 0x121a24, flatShading: true });
const auger = new THREE.Mesh(augerGeo, augerMat);
auger.position.y = -0.04;
bit.add(auger);

/* the chuck that holds it, so the bit does not float off the hull */
const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.1, 6), darkMat);
chuck.position.y = 0.24;
bit.add(chuck);

bit.position.y = -0.5;
rig.add(bit);
const cab = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xa07a10 }));
cab.position.set(0, 0.1, 0.3);
rig.add(cab);
const cabGlow = makeGlow(0xffe9a0, 0.8, 0.45);
cabGlow.position.set(0, 0.1, 0.42);
rig.add(cabGlow);

/* Two running lights on the shoulders. Sprites, so they cost almost nothing,
   and they give the hull a readable silhouette in the dark where the flat
   Lambert shading alone leaves it as a blue blob. */
for (const sx of [-0.34, 0.34]) {
  const lamp = makeGlow(0x6fe8ff, 0.34, 0.6);
  lamp.position.set(sx, -0.16, 0.24);
  rig.add(lamp);
}

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
