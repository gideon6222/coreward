import * as THREE from 'three';
import { scene } from './scene';
import { makeGlow } from './materials';

/* The drill ship.

   Small on purpose. With 18 rows framed it occupies maybe thirty pixels, so
   "detail" here means silhouette rather than surface: swept fins read at that
   size, panel lines do not. The parts that survive shrinking are the tapered
   nose, the fin sweep, the dark ring separating the canopy from the hull, and
   the spiral on the auger once it turns. */

export const player = new THREE.Group();
export const rig = new THREE.Group();
player.add(rig);

const hullMat = new THREE.MeshLambertMaterial({ color: 0x3aa8d8, emissive: 0x0a2a3a, flatShading: true });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xe8eef8, emissive: 0x1a2230, flatShading: true });
export const darkMat = new THREE.MeshLambertMaterial({ color: 0x28303c, flatShading: true });

/* ---------- body ---------- */

const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.58, 8), hullMat);
rig.add(hull);

/* tapered cowl, so the ship has a nose instead of ending in a flat disc */
const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.21, 0.17, 8), trimMat);
cowl.position.y = 0.36;
rig.add(cowl);

/* the collar the drill hangs off */
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.11, 8), trimMat);
collar.position.y = -0.3;
rig.add(collar);

/* Swept fins rather than the old round pods. A cylinder reads as a blob at this
   scale; an angled blade still reads as a shape. */
for (const sx of [-1, 1]) {
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.38, 0.2), darkMat);
  fin.position.set(sx * 0.25, 0.02, -0.02);
  fin.rotation.z = sx * 0.22;
  rig.add(fin);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.16), hullMat);
  tip.position.set(sx * 0.31, -0.16, -0.02);
  tip.rotation.z = sx * 0.22;
  rig.add(tip);
}

/* ---------- drill ---------- */

export const bit = new THREE.Group();

/* A real auger: a tapered hexagonal cylinder whose vertices are twisted around
   Y in proportion to height, so the flutes spiral. One mesh, one draw call, and
   the spiral is the only reason the rotation is visible at all - a smooth cone
   looks identical at every angle. */
const augerGeo = (() => {
  const g = new THREE.CylinderGeometry(0.23, 0.03, 0.5, 6, 6, false);
  const pos = g.attributes.position;
  const TWIST = 7.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = (y + 0.25) * TWIST;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.setXYZ(i, x * ca - z * sa, y, x * sa + z * ca);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
})();

/* steel, not the white trim: a near-white auger blows out under the cockpit
   glow and the spiral disappears */
const augerMat = new THREE.MeshLambertMaterial({ color: 0x9fb0c4, emissive: 0x121a24, flatShading: true });
const auger = new THREE.Mesh(augerGeo, augerMat);
auger.position.y = -0.05;
bit.add(auger);

const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.09, 6), darkMat);
chuck.position.y = 0.23;
bit.add(chuck);

bit.position.y = -0.46;
rig.add(bit);

/* ---------- cockpit ---------- */

const cab = new THREE.Mesh(
  new THREE.SphereGeometry(0.145, 12, 10),
  new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xa07a10 })
);
cab.position.set(0, 0.08, 0.26);
rig.add(cab);

/* A dark ring around the canopy. This is the single highest-value detail at
   small scale: it separates the lit cockpit from the lit hull, which otherwise
   merge into one bright smudge. */
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.026, 6, 14), darkMat);
ring.position.set(0, 0.08, 0.27);
rig.add(ring);

const cabGlow = makeGlow(0xffe9a0, 0.7, 0.4);
cabGlow.position.set(0, 0.08, 0.4);
rig.add(cabGlow);

/* shoulder running lights, so the hull has a readable outline in the dark */
for (const sx of [-0.3, 0.3]) {
  const lamp = makeGlow(0x6fe8ff, 0.3, 0.55);
  lamp.position.set(sx, -0.14, 0.2);
  rig.add(lamp);
}

/* ---------- thrusters ---------- */

export const flames: { cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; glow: THREE.Sprite }[] = [];
for (const sx of [-0.19, 0.19]) {
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.1, 6), darkMat);
  nozzle.position.set(sx, 0.3, 0);
  rig.add(nozzle);

  const fl = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 })
  );
  fl.position.set(sx, 0.42, 0);
  rig.add(fl);
  const fg = makeGlow(0x7ad4ff, 0.7, 0.9);
  fg.position.set(sx, 0.48, 0);
  rig.add(fg);
  flames.push({ cone: fl, glow: fg });
}

/* Shrunk against the terrain so the world reads as large. The squash animation
   scales `player`, so scaling `rig` here does not interfere with it. */
rig.scale.setScalar(0.82);

scene.add(player);
export const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };
