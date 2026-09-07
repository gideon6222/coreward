import * as THREE from 'three';
import { W } from './config';

export const lerpHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/* soft additive halo sprite, the cheap stand-in for bloom */
export const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const glowMats = new Map<string, THREE.SpriteMaterial>();
function glowMat(color: number, opacity: number) {
  const k = color + '|' + opacity;
  if (!glowMats.has(k)) {
    glowMats.set(k, new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }
  return glowMats.get(k)!;
}
export function makeGlow(color: number, size: number, opacity?: number) {
  const s = new THREE.Sprite(glowMat(color, opacity === undefined ? 0.85 : opacity));
  s.scale.set(size, size, 1);
  return s;
}

/* Rock chunks, not cubes.

   A 0.97 cube gives every cell an identical silhouette and leaves 0.03 of gap
   showing the grid, which is what makes the world read as blocks. This is a
   subdivided cube with every vertex pushed around by a deterministic hash, so
   the faces are uneven and the corners are chipped.

   It is ONE shared geometry, so instancing is untouched and this costs no extra
   draw calls. The variety comes from per-instance quarter-turns: the same chunk
   rotated into one of 64 orientations does not look like the same chunk.

   Base size is 1.0 rather than 0.97, and instances scale slightly above that, so
   neighbours interlock instead of leaving seams. Overlapping solids do not
   z-fight - coplanar faces are what z-fight, and this removes those. */
export function chunkGeometry(size: number, bump: number, seg = 2) {
  const g = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  const pos = g.attributes.position;
  /* cheap deterministic hash so every build produces the same rock */
  const h = (i: number, k: number) => {
    let n = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967296) - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + h(i, 0) * bump,
      pos.getY(i) + h(i, 1) * bump,
      pos.getZ(i) + h(i, 2) * bump
    );
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

export const boxGeo = chunkGeometry(1.0, 0.16);
export const pebbleGeo = chunkGeometry(0.3, 0.1);

/* Each block type gets its own chunk shape, which costs nothing because every
   type already has its own instanced pool. Soft material is lumpy and rounded,
   hard material is angular and chipped - that difference is most of what makes
   digging through dirt feel unlike digging through basalt. */
const chunkCache = new Map<string, THREE.BufferGeometry>();
const CHUNK_SHAPE: Record<string, [number, number]> = {
  /* id: [bump, segments] */
  dirt:    [0.13, 3],   /* lumpy soil, no sharp edges */
  stone:   [0.16, 2],
  granite: [0.20, 2],   /* blockier and more chipped */
  scoria:  [0.23, 2],   /* brittle volcanic rock */
  basalt:  [0.25, 2]    /* the hardest thing you dig */
};

export function chunkFor(id: string): THREE.BufferGeometry {
  const hit = chunkCache.get(id);
  if (hit) return hit;
  const [bump, seg] = CHUNK_SHAPE[id] || [0.16, 2];
  const geo = chunkGeometry(1.0, bump, seg);
  chunkCache.set(id, geo);
  return geo;
}
export const shardGeo = new THREE.OctahedronGeometry(1, 0);
export const crackGeo = new THREE.BoxGeometry(1, 0.045, 0.045);
export const crackMat = new THREE.MeshBasicMaterial({ color: 0x08080c });

/* Procedural rock grain.

   Generated into a canvas at load rather than shipped as an image: it costs no
   bytes, no precache entry and no extra request, and it is trivial to retune.
   The map multiplies the material colour, so it is kept near white - it adds
   grain and pitting without shifting the palette.

   Crystal shards deliberately do NOT get this. Rock grain on a gemstone reads
   as dirt, which is why mat() takes a `grain` flag. */
const rockTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const img = x.createImageData(128, 128);
  for (let i = 0; i < 128 * 128; i++) {
    /* two octaves of value noise, cheap and good enough at this size */
    const px = i % 128, py = (i / 128) | 0;
    const coarse = Math.sin(px * 0.11) * Math.cos(py * 0.13) * 0.5 + 0.5;
    const fine = Math.random();
    let v = 236 - coarse * 16 - fine * 26;
    /* occasional darker pits so faces are not uniformly speckled */
    if (fine > 0.985) v -= 55;
    const o = i * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

const matCache = new Map<string, THREE.MeshLambertMaterial>();
export function mat(color: number, glow?: number, grain = true) {
  const k = color + '|' + (glow || 0) + '|' + (grain ? 1 : 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02),
      flatShading: true, map: grain ? rockTex : null
    }));
  }
  return matCache.get(k)!;
}
export const shade = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();
export const worldX = (x: number) => x - (W - 1) / 2;
