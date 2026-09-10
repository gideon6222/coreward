import * as THREE from 'three';
import { DEF } from './sim/config';
import { g } from './sim/state';
import { scene } from './scene';
import { applyLight } from './lightmap';
import { shardGeo, worldX } from './materials';
import { key } from './sim/util';

/* Ore left lying where it fell.

   Digging used to stop dead when the hold filled: the button simply refused
   and told you the number. That is the worst kind of wall - it does not ask
   you to decide anything, it just makes you stop doing the thing the game is
   about.

   Now the drill always cuts. Ore that will not fit is dropped at the cell it
   came from and waits there; plain rock is spoil and is thrown away, because
   a tunnel full of glowing dirt would be noise rather than a decision. Come
   back with room and you pick it up by flying through it.

   One InstancedMesh, one draw call, per-instance colour. Positions come from
   the keys in g.drops, so the whole thing persists in the save for free. */

const MAX_DROPS = 90;
const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

/* Lightmapped like the rock it is lying on. A drop in a side tunnel you have
   not lit should be as hard to see as the tunnel is - its halo is what finds
   it, and the halo is additive and therefore untouched by this. */
const dropMat = applyLight(new THREE.MeshLambertMaterial({
  color: 0xffffff, emissive: 0x666666, flatShading: true, vertexColors: false
}));
const mesh = new THREE.InstancedMesh(shardGeo, dropMat, MAX_DROPS);
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;
mesh.count = 0;
mesh.renderOrder = 1;
scene.add(mesh);

/* A halo apiece, so a drop is findable across a dark chamber the same way ore
   is. Same instanced-quad trick the ore haloes use: this camera never rotates,
   so a quad in the XY plane always faces it. */
const cells: { x: number; y: number; id: string; phase: number }[] = [];

export function dropCount() { return cells.length; }

/* Rebuilt whenever g.drops changes rather than every frame - the set only
   changes when something is dug or collected. */
export function syncDrops() {
  cells.length = 0;
  for (const k in g.drops) {
    const c = k.split(',');
    const x = +c[0], d = +c[1];
    cells.push({
      x: worldX(x), y: -d, id: g.drops[k],
      /* a stable per-cell phase, so they do not all bob in unison */
      phase: (x * 7 + d * 13) % 61
    });
  }
  mesh.count = Math.min(cells.length, MAX_DROPS);
  for (let i = 0; i < mesh.count; i++) {
    const def = DEF[cells[i].id];
    mesh.setColorAt(i, scratchColor.setHex(def ? def.color : 0xcccccc));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function stepDrops(t: number) {
  for (let i = 0; i < mesh.count; i++) {
    const c = cells[i];
    const bob = Math.sin(t * 1.9 + c.phase) * 0.11;
    scratch.position.set(c.x, c.y + bob, 0.5);
    scratch.rotation.set(t * 0.7 + c.phase, t * 1.1 + c.phase, 0);
    const s = 0.2 + Math.sin(t * 2.4 + c.phase) * 0.018;
    scratch.scale.set(s, s * 1.5, s);
    scratch.updateMatrix();
    mesh.setMatrixAt(i, scratch.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/* Leave a block where it fell. Returns false when there is already something
   at that cell or the field is full, so the caller can fall back to spoil. */
export function leaveDrop(x: number, d: number, id: string) {
  const k = key(x, d);
  if (g.drops[k] || Object.keys(g.drops).length >= MAX_DROPS) return false;
  g.drops[k] = id;
  syncDrops();
  return true;
}

export function takeDrop(x: number, d: number) {
  const k = key(Math.round(x), Math.round(d));
  const id = g.drops[k];
  if (!id) return null;
  delete g.drops[k];
  syncDrops();
  return id;
}
