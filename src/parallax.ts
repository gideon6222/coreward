import * as THREE from 'three';
import { W } from './config';
import { scene } from './scene';
import { rnd } from './world';

/* Distant rock, behind the tunnels.

   Underground there was one flat backdrop plane and nothing else, so a tunnel
   read as a hole cut in a wall rather than as a space with anything behind it.
   Two layers of dark slabs at different depths now scroll at fractions of the
   camera's motion, which is the whole of the parallax: something further away
   moves less.

   Two InstancedMesh layers, two draw calls, no lighting and no shader work.
   They are MeshBasic and dark on purpose - the scene fog tints them toward
   whatever the depth colour is, so they go ember below the heat line with
   everything else without knowing anything about heat.

   Positions come from `rnd`, the same seeded hash the world uses, so the
   background of a given planet is as reproducible as its ore. */

type Layer = {
  mesh: THREE.InstancedMesh;
  /* how much of the camera's movement this layer copies: 1 would be locked to
     the world, 0 would be locked to the screen */
  factor: number;
  span: number;
  slabs: { x: number; y: number; s: number; r: number }[];
};

/* An irregular hexagon, not a plane.

   Rectangles read as rectangles however they are rotated or scaled, and in a
   world made entirely of chipped angular rock that is the one silhouette that
   says "UI element behind the level". Jittering a six-sided disc gives a chunk
   instead, and it costs one geometry built once at load. */
const slabGeo = (() => {
  const g = new THREE.CircleGeometry(1, 6);
  const pos = g.attributes.position;
  const h = (i: number, k: number) => {
    let n = Math.imul(i + 3, 374761393) ^ Math.imul(k + 11, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967296) - 0.5;
  };
  for (let i = 1; i < pos.count; i++) {
    pos.setXY(i, pos.getX(i) * (1 + h(i, 0) * 0.55), pos.getY(i) * (1 + h(i, 1) * 0.55));
  }
  pos.needsUpdate = true;
  return g;
})();
const scratch = new THREE.Object3D();

/* Vertical distance a layer tiles over. Anything the camera can travel is
   covered by wrapping into this window rather than by generating the whole
   planet, so the cost does not grow with depth. */
const SPAN = 46;

function makeLayer(count: number, z: number, factor: number, color: number, seed: number): Layer {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const mesh = new THREE.InstancedMesh(slabGeo, mat, count);
  mesh.frustumCulled = false;
  mesh.position.z = z;
  mesh.renderOrder = -1;
  scene.add(mesh);

  const slabs = [];
  for (let i = 0; i < count; i++) {
    slabs.push({
      x: (rnd(i, seed, 3) - 0.5) * (W + 10),
      y: rnd(i, seed + 11, 5) * SPAN,
      s: 1.6 + rnd(i, seed + 23, 7) * 4.2,
      r: (rnd(i, seed + 37, 9) - 0.5) * 0.9
    });
  }
  return { mesh, factor, span: SPAN, slabs };
}

/* Further back is darker and slower, which is the only cue that makes two
   layers read as depth rather than as clutter. */
/* z is chosen for OCCLUSION, not for the parallax itself - the offset maths
   below is what creates the depth. These sit behind the dust and in front of
   the backdrop, which is a narrow slot; see the note in scene.ts.

   Colours are lighter than they look here because the scene fog pulls them
   toward the void colour at this distance. Nearer is lighter and faster,
   further is darker and slower, which is the only cue that makes two layers
   read as depth rather than as clutter. */
const layers = [
  makeLayer(30, -1.55, 0.55, 0x1a1f2b, 101),
  makeLayer(22, -2.30, 0.30, 0x11151d, 202)
];

/* Called every frame with the camera's world position. Each slab is wrapped
   into a window around the camera, so a layer is a fixed number of instances
   no matter how deep the ship goes. */
export function stepParallax(camX: number, camY: number) {
  for (const L of layers) {
    const ox = camX * (1 - L.factor);
    const oy = camY * (1 - L.factor);
    for (let i = 0; i < L.slabs.length; i++) {
      const sl = L.slabs[i];
      /* wrap relative to where this layer "is", so slabs recycle above and
         below the camera instead of running out */
      const base = camY - oy;
      let y = sl.y + Math.floor((base - sl.y) / L.span) * L.span;
      if (base - y > L.span * 0.5) y += L.span;
      scratch.position.set(sl.x + ox, y + oy, 0);
      scratch.rotation.set(0, 0, sl.r);
      scratch.scale.set(sl.s, sl.s * (0.55 + (sl.r + 0.45) * 0.5), 1);
      scratch.updateMatrix();
      L.mesh.setMatrixAt(i, scratch.matrix);
    }
    L.mesh.instanceMatrix.needsUpdate = true;
  }
}

/* Faded in over the first few metres rather than switched on at a threshold.
   Against a lit sky these read as grey shapes floating in the air, and there
   is nothing behind the surface to suggest - but a hard toggle at 1 m pops in
   the corner of your eye every time you leave the pad. */
export function fadeParallax(pd: number) {
  const k = Math.min(1, Math.max(0, (pd - 0.5) / 6));
  for (const L of layers) {
    const m = L.mesh.material as THREE.MeshBasicMaterial;
    m.opacity = 0.92 * k;
    L.mesh.visible = k > 0.01;
  }
}
