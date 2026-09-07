import * as THREE from 'three';
import { W } from './config';
import { key } from './util';
import { g } from './state';
import { rnd, blockAt } from './world';
import { scene } from './scene';
import { mat, shade, makeGlow, worldX, boxGeo, pebbleGeo, shardGeo } from './materials';
import type { Block } from './types';

/* Terrain rendering.

   Every visible block used to be its own Group of Meshes, and because the
   per-block shade jitter is continuous, almost every one got its own material
   and therefore its own draw call. Measured on the live game: 80 draw calls at
   the surface, 207 underground, against a mobile guideline of about 50.

   Now the terrain is drawn with InstancedMesh, pooled by block id. Per-instance
   matrices carry the position and rotation jitter and per-instance colours carry
   the shade, so the world looks the same while collapsing into a handful of
   draws.

   The one exception is the block currently being drilled. It stays a real Group
   built by makeBlock() exactly as before, because the dig animation scales it,
   jitters it and parents crack decals to it - and there is only ever one at a
   time. That keeps every line of the feel code untouched and still gets
   essentially all of the win. */

/* the streaming window, which must comfortably exceed the framed rows or
   terrain pops in at the edges as the camera moves */
const WINDOW_ROWS = 29;
const MAX_CELLS = WINDOW_ROWS * W;
/* up to `shards` front crystals plus two mirrored to the back face */
const MAX_DETAILS = MAX_CELLS * 10;

type Pool = {
  body: THREE.InstancedMesh;
  detail: THREE.InstancedMesh;
  bodies: number;
  details: number;
};

const pools = new Map<string, Pool>();
const scratch = new THREE.Object3D();
const scratchColor = new THREE.Color();

/* Instance colour multiplies the material colour, so the pool material is white
   and every block's shade rides on the instance. Emissive cannot vary per
   instance, which is why pools are keyed by block id rather than by glow: each
   id has one correct emissive, and scoria's smoulder survives. */
function poolFor(b: Block): Pool {
  const existing = pools.get(b.id);
  if (existing) return existing;

  /* An ore cell is a dull host block with bright crystals in it, so the two
     halves need different emissive. Giving the host the ore's glow lights the
     whole cube like a lamp and the crystals stop reading as crystals - the
     amethyst blocks came out as flat purple squares. Host rock glows 0.02,
     matching what mat() gave it before. */
  const bodyEmissive = b.ore
    ? new THREE.Color(b.host || 0x333038).multiplyScalar(0.02)
    : new THREE.Color(b.color).multiplyScalar(b.glow || 0.02);
  const detailEmissive = new THREE.Color(b.color).multiplyScalar(b.glow || 0.02);

  const bodyMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: bodyEmissive, flatShading: true, map: mat(0xffffff, 0).map
  });
  const body = new THREE.InstancedMesh(boxGeo, bodyMat, MAX_CELLS);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.frustumCulled = false;
  body.count = 0;
  scene.add(body);

  /* rock gets scattered pebbles, ore gets crystal shards; the shards are
     ungrained because rock grain on a gemstone reads as dirt */
  const detailMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: detailEmissive, flatShading: true,
    map: b.ore ? null : mat(0xffffff, 0).map
  });
  const detail = new THREE.InstancedMesh(
    b.ore ? shardGeo : pebbleGeo, detailMat, b.ore ? MAX_DETAILS : MAX_CELLS
  );
  detail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  detail.frustumCulled = false;
  detail.count = 0;
  scene.add(detail);

  const pool: Pool = { body, detail, bodies: 0, details: 0 };
  pools.set(b.id, pool);
  return pool;
}

/* Ore haloes stay as sprites: additive blending on a shared material, only a
   handful visible at once, and the loop pulses them individually. Pooled so
   the count does not grow with time. */
export const oreGlows: { sprite: THREE.Sprite; phase: number; baseScale: number }[] = [];
const haloPool: THREE.Sprite[] = [];
let halosUsed = 0;

function takeHalo(color: number, size: number): THREE.Sprite {
  let s = haloPool[halosUsed];
  if (!s) {
    s = makeGlow(color, size, 0.5);
    haloPool.push(s);
    scene.add(s);
  }
  halosUsed++;
  s.visible = true;
  /* makeGlow caches materials by colour+opacity, so swapping is just a lookup */
  s.material = makeGlow(color, size, 0.5).material;
  s.scale.set(size, size, 1);
  return s;
}

/* ---------- the one real block, the one being drilled ---------- */

export const meshes = new Map<string, THREE.Group>();
let digCell: string | null = null;

function makeBlock(x: number, d: number, b: Block) {
  const jit = 0.84 + rnd(x + 77, d + 31, g.planet) * 0.3;
  if (!b.ore) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(boxGeo, mat(shade(b.color, jit), b.glow));
    m.rotation.set(
      (rnd(x + 2, d + 8, g.planet) - 0.5) * 0.09,
      (rnd(x + 4, d + 3, g.planet) - 0.5) * 0.09,
      (rnd(x + 5, d + 9, g.planet) - 0.5) * 0.09
    );
    grp.add(m);
    if (rnd(x + 61, d + 17, g.planet) > 0.66) {
      const p = new THREE.Mesh(pebbleGeo, mat(shade(b.color, jit * 1.22), b.glow));
      const r1 = rnd(x + 12, d + 44, g.planet), r2 = rnd(x + 31, d + 6, g.planet);
      p.position.set((r1 - 0.5) * 0.6, (r2 - 0.5) * 0.6, 0.44);
      p.rotation.set(r1 * 3, r2 * 3, r1 * 2);
      grp.add(p);
    }
    return grp;
  }
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(boxGeo, mat(shade(b.host || 0x333038, jit), 0.02)));
  const n = b.shards || 5;
  const sm = mat(b.color, b.glow, false);
  for (let i = 0; i < n; i++) {
    const r1 = rnd(x * 13 + i, d * 7 + i * 3, g.planet);
    const r2 = rnd(x * 3 + i * 5, d * 17 + i, g.planet + 11);
    const r3 = rnd(x + i * 29, d + i * 13, g.planet + 23);
    const s = 0.12 + r3 * 0.14;
    const sh = new THREE.Mesh(shardGeo, sm);
    sh.scale.set(s, s * (1.4 + r1 * 1.3), s);
    sh.position.set((r1 - 0.5) * 0.7, (r2 - 0.5) * 0.7, 0.33 + r3 * 0.18);
    sh.rotation.set(r1 * 3.14, r2 * 3.14, r3 * 3.14);
    grp.add(sh);
    if (i < 2) {
      const back = sh.clone();
      back.position.z = -0.33 - r3 * 0.18;
      grp.add(back);
    }
  }
  const halo = makeGlow(b.color, 1.5 + (b.tone || 1) * 0.11, 0.5);
  halo.position.z = 0.55;
  grp.add(halo);
  return grp;
}

/* Called when drilling starts. Promotes one cell out of the instanced terrain
   into a real Group so the dig animation has something to scale, jitter and
   parent cracks to. */
export function beginDig(x: number, d: number, b: Block) {
  const k = key(x, d);
  if (meshes.has(k)) return;
  const grp = makeBlock(x, d, b);
  grp.position.set(worldX(x), -d, 0);
  scene.add(grp);
  meshes.set(k, grp);
  digCell = k;
  rebuild();
}

export function dropBlock(k: string) {
  const o = meshes.get(k);
  if (o) {
    scene.remove(o);
    meshes.delete(k);
  }
  if (digCell === k) digCell = null;
  rebuild();
}

/* ---------- the instanced terrain ---------- */

let lastRow: number | null = null;

/* hardReset() used to assign lastRow directly when it lived in the same file */
export function resetBlockCache() { lastRow = null; }

function rebuild() {
  for (const p of pools.values()) { p.bodies = 0; p.details = 0; }
  halosUsed = 0;
  oreGlows.length = 0;

  const row = lastRow === null ? Math.floor(g.pd) : lastRow;
  const d0 = Math.max(0, row - 13), d1 = row + 15;

  for (let d = d0; d <= d1; d++) {
    for (let x = 0; x < W; x++) {
      const b = blockAt(x, d);
      if (!b) continue;
      /* the block being drilled is a real mesh; skip it here or it draws twice */
      if (digCell === key(x, d)) continue;

      const pool = poolFor(b);
      const jit = 0.84 + rnd(x + 77, d + 31, g.planet) * 0.3;
      const px = worldX(x), py = -d;

      if (!b.ore) {
        scratch.position.set(px, py, 0);
        scratch.rotation.set(
          (rnd(x + 2, d + 8, g.planet) - 0.5) * 0.09,
          (rnd(x + 4, d + 3, g.planet) - 0.5) * 0.09,
          (rnd(x + 5, d + 9, g.planet) - 0.5) * 0.09
        );
        scratch.scale.set(1, 1, 1);
        scratch.updateMatrix();
        pool.body.setMatrixAt(pool.bodies, scratch.matrix);
        pool.body.setColorAt(pool.bodies, scratchColor.setHex(shade(b.color, jit)));
        pool.bodies++;

        if (rnd(x + 61, d + 17, g.planet) > 0.66) {
          const r1 = rnd(x + 12, d + 44, g.planet), r2 = rnd(x + 31, d + 6, g.planet);
          scratch.position.set(px + (r1 - 0.5) * 0.6, py + (r2 - 0.5) * 0.6, 0.44);
          scratch.rotation.set(r1 * 3, r2 * 3, r1 * 2);
          scratch.scale.set(1, 1, 1);
          scratch.updateMatrix();
          pool.detail.setMatrixAt(pool.details, scratch.matrix);
          pool.detail.setColorAt(pool.details, scratchColor.setHex(shade(b.color, jit * 1.22)));
          pool.details++;
        }
        continue;
      }

      /* ore: a host block plus crystal shards, two of them mirrored behind */
      scratch.position.set(px, py, 0);
      scratch.rotation.set(0, 0, 0);
      scratch.scale.set(1, 1, 1);
      scratch.updateMatrix();
      pool.body.setMatrixAt(pool.bodies, scratch.matrix);
      pool.body.setColorAt(pool.bodies, scratchColor.setHex(shade(b.host || 0x333038, jit)));
      pool.bodies++;

      const n = b.shards || 5;
      for (let i = 0; i < n; i++) {
        const r1 = rnd(x * 13 + i, d * 7 + i * 3, g.planet);
        const r2 = rnd(x * 3 + i * 5, d * 17 + i, g.planet + 11);
        const r3 = rnd(x + i * 29, d + i * 13, g.planet + 23);
        const s = 0.12 + r3 * 0.14;
        scratch.rotation.set(r1 * 3.14, r2 * 3.14, r3 * 3.14);
        scratch.scale.set(s, s * (1.4 + r1 * 1.3), s);
        scratch.position.set(px + (r1 - 0.5) * 0.7, py + (r2 - 0.5) * 0.7, 0.33 + r3 * 0.18);
        scratch.updateMatrix();
        pool.detail.setMatrixAt(pool.details, scratch.matrix);
        pool.detail.setColorAt(pool.details, scratchColor.setHex(b.color));
        pool.details++;
        if (i < 2) {
          scratch.position.z = -0.33 - r3 * 0.18;
          scratch.updateMatrix();
          pool.detail.setMatrixAt(pool.details, scratch.matrix);
          pool.detail.setColorAt(pool.details, scratchColor.setHex(b.color));
          pool.details++;
        }
      }

      const size = 1.5 + (b.tone || 1) * 0.11;
      const sprite = takeHalo(b.color, size);
      sprite.position.set(px, py, 0.55);
      oreGlows.push({ sprite, phase: rnd(x + 3, d + 91, g.planet) * 6.28, baseScale: size });
    }
  }

  for (const p of pools.values()) {
    p.body.count = p.bodies;
    p.detail.count = p.details;
    p.body.instanceMatrix.needsUpdate = true;
    p.detail.instanceMatrix.needsUpdate = true;
    if (p.body.instanceColor) p.body.instanceColor.needsUpdate = true;
    if (p.detail.instanceColor) p.detail.instanceColor.needsUpdate = true;
  }
  /* park unused haloes rather than destroying them */
  for (let i = halosUsed; i < haloPool.length; i++) haloPool[i].visible = false;
}

export function syncBlocks(force?: boolean) {
  const row = Math.floor(g.pd);
  if (!force && row === lastRow) return;
  lastRow = row;
  rebuild();
}
