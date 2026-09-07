import * as THREE from 'three';
import { W } from './config';

export const lerpHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/* soft additive halo sprite, the cheap stand-in for bloom */
const glowTex = (() => {
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

export const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
export const pebbleGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
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
