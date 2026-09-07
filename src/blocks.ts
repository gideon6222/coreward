import * as THREE from 'three';
import { W } from './config';
import { key } from './util';
import { g } from './state';
import { rnd, blockAt } from './world';
import { scene } from './scene';
import { mat, shade, makeGlow, worldX, boxGeo, pebbleGeo, shardGeo, chunkFor, glowTex,
         displaceLikeRock, ROCK_BUMP } from './materials';
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
  /* A gas pocket is the one cell whose BODY glows rather than its crystals.
     Every ore in the game is a dark host with bright specks in it, so making
     the whole cube luminous gives the hazard a silhouette no ore can imitate -
     which matters most against emerald, the one it sits next to in hue and in
     depth. Costs nothing: emissive is a per-pool material property.

     Kept dimmer than it wants to be: at 0.26 the pockets out-shone the geodes
     and the screen told you to look at the thing you must not touch. The
     payout has to be the brightest object in the frame. */
  const bodyEmissive = b.hazard
    ? new THREE.Color(b.color).multiplyScalar(0.15)
    : b.ore
    ? new THREE.Color(b.host || 0x333038).multiplyScalar(0.02)
    : new THREE.Color(b.color).multiplyScalar(b.glow || 0.02);
  const detailEmissive = new THREE.Color(b.color).multiplyScalar(b.glow || 0.02);

  const bodyMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: bodyEmissive, flatShading: true,
    map: mat(0xffffff, 0).map, vertexColors: true
  });
  displaceLikeRock(bodyMat, ROCK_BUMP[b.id] ?? 0.2);
  const body = new THREE.InstancedMesh(chunkFor(b.id), bodyMat, MAX_CELLS);
  body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  body.frustumCulled = false;
  body.count = 0;
  scene.add(body);

  /* rock gets scattered pebbles, ore gets crystal shards; the shards are
     ungrained because rock grain on a gemstone reads as dirt */
  const detailMat = new THREE.MeshLambertMaterial({
    color: 0xffffff, emissive: detailEmissive, flatShading: true,
    map: b.ore ? null : mat(0xffffff, 0).map,
    /* pebbles are chunk geometry and carry vertex colours; crystal shards are
       octahedra and do not */
    vertexColors: !b.ore
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
/* two instances per ore: a tight core and a wide, dim bloom */
const MAX_HALOS = 340;
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
    const bodyMat = mat(shade(b.color, jit), b.glow, true, true).clone();
    displaceLikeRock(bodyMat, ROCK_BUMP[b.id] ?? 0.2);
    const m = new THREE.Mesh(chunkFor(b.id), bodyMat);
    grp.add(m);
    if (rnd(x + 61, d + 17, g.planet) > 0.66) {
      const p = new THREE.Mesh(pebbleGeo, mat(shade(b.color, jit * 1.22), b.glow, true, true));
      const r1 = rnd(x + 12, d + 44, g.planet), r2 = rnd(x + 31, d + 6, g.planet);
      p.position.set((r1 - 0.5) * 0.6, (r2 - 0.5) * 0.6, 0.44);
      p.rotation.set(r1 * 3, r2 * 3, r1 * 2);
      grp.add(p);
    }
    return grp;
  }
  const grp = new THREE.Group();
  const hostMat = mat(shade(b.host || 0x333038, jit), 0.02, true, true).clone();
  displaceLikeRock(hostMat, ROCK_BUMP[b.id] ?? 0.2);
  const host = new THREE.Mesh(chunkFor(b.id), hostMat);
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

/* Fake ambient occlusion.

   Rock buried in the mass gets no light; rock at the edge of a tunnel catches
   it. Counting open orthogonal neighbours and darkening accordingly costs
   nothing - it rides on the per-instance colour we already write - and it is
   what makes a tunnel read as *carved into* something rather than as a gap
   between floating blocks.

   Kept deliberately gentle. A realistic falloff would black out everything but
   the shaft on a fresh planet, since nothing is dug yet; this is a depth cue,
   not a lighting model. The player's lamp still does the real lighting.

   The world edge counts as solid. Treating out-of-bounds as open would put a
   bright rim down both sides of the map for no reason. */
/* Ambient occlusion needs to know how much of a cell is exposed, so it scans
   the four orthogonal neighbours.

   It used to also collect the colour of adjacent bright ore and tint the rock
   toward it. That was wrong: instance colour is uniform across a whole cell, so
   a vein produced hard square patches of colour rather than a glow. The glow is
   now entirely the additive haloes, whose radial falloff does not know or care
   where the cell boundaries are. */
function openNeighbours(x: number, d: number): number {
  let open = 0;
  /* The world edge counts as solid. Treating out-of-bounds as open would put a
     bright rim down both sides of the map for no reason. */
  if (x - 1 >= 0 && blockAt(x - 1, d) === null) open++;
  if (x + 1 < W && blockAt(x + 1, d) === null) open++;
  if (d - 1 < 0 || blockAt(x, d - 1) === null) open++;
  if (blockAt(x, d + 1) === null) open++;
  return open;
}

/* Rock buried in the mass gets no light; rock at the edge of a tunnel catches
   it. Gentle on purpose - a realistic falloff would black out a fresh planet,
   since nothing is dug yet. */
function occlusion(x: number, d: number): number {
  return 0.72 + 0.28 * Math.min(1, openNeighbours(x, d) / 2);
}

/* Cells are placed on the grid with no rotation and no scale, on purpose.

   The displacement is a function of world position, so two neighbours only
   agree about their shared boundary if their vertices land on exactly the same
   world coordinates. Any per-instance rotation or scale breaks that agreement
   and the seams come straight back. Variety now comes from the noise field
   itself, which does not repeat, rather than from 64 rotations of one shape. */
function placeCell(px: number, py: number) {
  scratch.position.set(px, py, 0);
  scratch.rotation.set(0, 0, 0);
  scratch.scale.set(1, 1, 1);
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
      const ao = occlusion(x, d);
      const px = worldX(x), py = -d;

      if (!b.ore) {
        scratch.position.set(px, py, 0);
        placeCell(px, py);
        scratch.updateMatrix();
        pool.body.setMatrixAt(pool.bodies, scratch.matrix);
        pool.body.setColorAt(pool.bodies, scratchColor.setHex(shade(b.color, jit * ao)));
        pool.bodies++;

        if (rnd(x + 61, d + 17, g.planet) > 0.66) {
          const r1 = rnd(x + 12, d + 44, g.planet), r2 = rnd(x + 31, d + 6, g.planet);
          scratch.position.set(px + (r1 - 0.5) * 0.6, py + (r2 - 0.5) * 0.6, 0.5);
          scratch.rotation.set(r1 * 3, r2 * 3, r1 * 2);
          scratch.scale.set(1, 1, 1);
          scratch.updateMatrix();
          pool.detail.setMatrixAt(pool.details, scratch.matrix);
          pool.detail.setColorAt(pool.details, scratchColor.setHex(shade(b.color, jit * 1.22 * ao)));
          pool.details++;
        }
        continue;
      }

      /* ore: a host block plus crystal shards, two of them mirrored behind */
      scratch.position.set(px, py, 0);
      placeCell(px, py);
      scratch.updateMatrix();
      pool.body.setMatrixAt(pool.bodies, scratch.matrix);
      pool.body.setColorAt(pool.bodies, scratchColor.setHex(shade(b.host || 0x333038, jit * ao)));
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

      /* Two additive quads per vein rather than one.

         A single gradient falls off too fast to reach the neighbouring rock,
         which is what tempted me into the per-cell tint in the first place. A
         tight bright core plus a wide dim bloom gives a much longer, softer
         tail, and because additive blending just sums, the dim one can be
         three times the size for nothing.

         Opacity is a shared material property, so the bloom is dimmed by
         scaling its instance COLOUR instead. */
      const core = 1.35 + (b.tone || 1) * 0.09;
      const phase = rnd(x + 3, d + 91, g.planet) * 6.28;
      if (oreGlows.length + 1 < MAX_HALOS) {
        haloMesh.setColorAt(oreGlows.length, scratchColor.setHex(b.color));
        oreGlows.push({ x: px, y: py, phase, baseScale: core });

        haloMesh.setColorAt(oreGlows.length, scratchColor.setHex(b.color).multiplyScalar(0.30));
        oreGlows.push({ x: px, y: py, phase, baseScale: core * 2.9 });
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
