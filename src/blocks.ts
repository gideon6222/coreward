import * as THREE from 'three';
import { W } from './config';
import { key } from './util';
import { g } from './state';
import { rnd, blockAt } from './world';
import { scene } from './scene';
import { mat, shade, makeGlow, worldX, boxGeo, pebbleGeo, shardGeo, chunkFor, glowTex } from './materials';
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
  const body = new THREE.InstancedMesh(chunkFor(b.id), bodyMat, MAX_CELLS);
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

/* Ore haloes, all in one draw call.

   They were one Sprite each, which was fine at 189 streamed cells and became
   the single largest draw-call cost once the world widened to 377 - roughly
   twenty to forty sprites, one draw apiece.

   They are now instanced quads. The trick that makes that work: this camera
   never rotates, it only pans, so a quad in the XY plane always faces it and
   the billboarding a Sprite provides is not needed. Per-instance matrices carry
   position and the pulse scale, per-instance colours carry the ore colour. */
const MAX_HALOS = 160;
const haloGeo = new THREE.PlaneGeometry(1, 1);
const haloMat = new THREE.MeshBasicMaterial({
  map: glowTex, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const haloMesh = new THREE.InstancedMesh(haloGeo, haloMat, MAX_HALOS);
haloMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
haloMesh.frustumCulled = false;
haloMesh.count = 0;
haloMesh.renderOrder = 2;
scene.add(haloMesh);

/* Position, phase and base size for each visible halo. The loop pulses them
   through pulseHaloes() rather than touching three.js objects directly. */
export const oreGlows: { x: number; y: number; phase: number; baseScale: number }[] = [];

/* Animate the pulse. Scale is animated rather than opacity because the material
   is shared across every instance. */
export function pulseHaloes(t: number) {
  for (let i = 0; i < oreGlows.length; i++) {
    const o = oreGlows[i];
    const s = o.baseScale * (1 + 0.14 * Math.sin(t * 2.1 + o.phase));
    scratch.position.set(o.x, o.y, 0.55);
    scratch.rotation.set(0, 0, 0);
    scratch.scale.set(s, s, 1);
    scratch.updateMatrix();
    haloMesh.setMatrixAt(i, scratch.matrix);
  }
  haloMesh.instanceMatrix.needsUpdate = true;
}

/* ---------- the one real block, the one being drilled ---------- */

export const meshes = new Map<string, THREE.Group>();
let digCell: string | null = null;

function makeBlock(x: number, d: number, b: Block) {
  /* Tonal spread between neighbouring chunks. Narrow variation makes a rock
     face read as one flat surface at any distance; widening it is what turns it
     into mottled stone. Free - it is a per-instance colour. */
  const jit = 0.76 + rnd(x + 77, d + 31, g.planet) * 0.46;
  if (!b.ore) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(chunkFor(b.id), mat(shade(b.color, jit), b.glow));
    /* same orientation and oversize as the instanced version, or the block
       being drilled visibly pops the moment drilling starts */
    orientChunk(x, d);
    m.rotation.copy(scratch.rotation);
    m.scale.copy(scratch.scale);
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
  const host = new THREE.Mesh(chunkFor(b.id), mat(shade(b.host || 0x333038, jit), 0.02));
  orientChunk(x, d);
  host.rotation.copy(scratch.rotation);
  host.scale.copy(scratch.scale);
  grp.add(host);
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

/* Orient one rock chunk.

   Quarter-turns on all three axes give 64 distinct orientations of the single
   shared chunk geometry, which is what stops every cell looking like the same
   rock. They are quarter-turns rather than free rotation so a roughly cubic
   chunk still packs against its neighbours instead of leaving wedges of gap.

   A small extra jitter softens the remaining regularity, and the slight
   oversize makes neighbours interlock so no seam shows where the grid is. */
function orientChunk(x: number, d: number) {
  const Q = Math.PI / 2;
  scratch.rotation.set(
    Math.floor(rnd(x + 2, d + 8, g.planet) * 4) * Q + (rnd(x + 21, d + 5, g.planet) - 0.5) * 0.22,
    Math.floor(rnd(x + 4, d + 3, g.planet) * 4) * Q + (rnd(x + 33, d + 9, g.planet) - 0.5) * 0.22,
    Math.floor(rnd(x + 5, d + 9, g.planet) * 4) * Q + (rnd(x + 47, d + 2, g.planet) - 0.5) * 0.22
  );
  const sc = 1.03 + rnd(x + 88, d + 12, g.planet) * 0.09;
  scratch.scale.set(sc, sc, sc);
}

function rebuild() {
  for (const p of pools.values()) { p.bodies = 0; p.details = 0; }
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
      const jit = 0.76 + rnd(x + 77, d + 31, g.planet) * 0.46;
      const px = worldX(x), py = -d;

      if (!b.ore) {
        scratch.position.set(px, py, 0);
        orientChunk(x, d);
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
      orientChunk(x, d);
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
      if (oreGlows.length < MAX_HALOS) {
        haloMesh.setColorAt(oreGlows.length, scratchColor.setHex(b.color));
        oreGlows.push({ x: px, y: py, phase: rnd(x + 3, d + 91, g.planet) * 6.28, baseScale: size });
      }
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
  haloMesh.count = oreGlows.length;
  if (haloMesh.instanceColor) haloMesh.instanceColor.needsUpdate = true;
}

export function syncBlocks(force?: boolean) {
  const row = Math.floor(g.pd);
  if (!force && row === lastRow) return;
  lastRow = row;
  rebuild();
}
