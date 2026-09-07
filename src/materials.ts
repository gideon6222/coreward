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

/* Rock as one continuous mass.

   The previous approach baked a different displacement into each chunk and gave
   every instance its own rotation and scale. Neighbours therefore disagreed
   about where their shared boundary was: their front faces landed at different
   depths, the nearer one's side wall became visible, and every cell read as a
   separate hollow box wedged against the next.

   Now the cells are plain unit cubes at integer positions and the displacement
   happens in the vertex shader as a function of WORLD position. Two cells that
   share a boundary vertex are evaluating the same world coordinate, so they
   compute the same displacement and the surface is continuous by construction -
   one solid rock face, with no gaps to hide and no overlap needed to hide them.

   It also removes the repetition: the old variety came from 64 rotations of one
   shape, this varies with position and never repeats.

   Free at runtime. No extra draw calls, no extra geometry - the same shared
   cube, displaced per vertex on the GPU. */
export function chunkGeometry(seg = 2) {
  const g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
  const pos = g.attributes.position;

  /* Vertical light gradient baked as vertex colours: brighter on top, darker
     underneath, so each lump reads as a form rather than a set of flat facets.
     Multiplies with the per-instance colour rather than replacing it. */
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) + 0.5;
    const v = 0.84 + Math.max(0, Math.min(1, t)) * 0.3;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

export const boxGeo = chunkGeometry(2);

/* Pebbles are decorative scatter, not part of the rock surface, so they keep a
   small independent lump and do not take the displacement shader. */
export const pebbleGeo = (() => {
  const g = new THREE.BoxGeometry(0.3, 0.3, 0.3, 1, 1, 1);
  const pos = g.attributes.position;
  const h = (i: number, k: number) => {
    let n = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (((n ^ (n >>> 16)) >>> 0) / 4294967296) - 0.5;
  };
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + h(i, 0) * 0.1, pos.getY(i) + h(i, 1) * 0.1, pos.getZ(i) + h(i, 2) * 0.1);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  const col = new Float32Array(pos.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
})();

const chunkCache = new Map<number, THREE.BufferGeometry>();
export function chunkFor(_id: string): THREE.BufferGeometry {
  /* One shared cube for every rock type now - the character comes from the
     displacement amount, which is a per-material uniform. */
  const hit = chunkCache.get(2);
  if (hit) return hit;
  const geo = chunkGeometry(2);
  chunkCache.set(2, geo);
  return geo;
}

/* How far each rock type's surface breaks up. Soft material stays lumpy and
   shallow, hard material is chipped and angular. */
export const ROCK_BUMP: Record<string, number> = {
  dirt: 0.16, stone: 0.20, granite: 0.26, scoria: 0.30, basalt: 0.32
};

/* Inject the displacement into a standard material.

   Vertices sit on a 0.5 grid in world space, so `floor(w * 2 + 0.5)` is a stable
   integer key that neighbouring cells agree on for any shared vertex. That
   agreement is the whole trick.

   flatShading derives normals from screen-space derivatives of the final
   position, so lighting follows the displaced surface for free - no normal
   recalculation needed. */
export function displaceLikeRock(m: THREE.Material, bump: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBump = { value: bump };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uBump;
        float rockHash(vec3 k) {
          return fract(sin(dot(k, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        }
        vec3 rockOffset(vec3 w) {
          vec3 k = floor(w * 2.0 + 0.5);
          return (vec3(rockHash(k), rockHash(k + 19.7), rockHash(k + 51.3)) - 0.5) * uBump;
        }`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec3 cell = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 cell = vec3(modelMatrix[3][0], modelMatrix[3][1], modelMatrix[3][2]);
          #endif
          transformed += rockOffset(transformed + cell);
        }`
      );
  };
  /* materials are cached by three on their program key; this forces a rebuild */
  m.customProgramCacheKey = () => 'rock' + bump.toFixed(3);
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
/* `vcol` must match the geometry: enabling vertex colours on a geometry that
   has no colour attribute renders it black. Only the chunk geometries carry
   one - shards and haloes do not. */
export function mat(color: number, glow?: number, grain = true, vcol = false) {
  const k = color + '|' + (glow || 0) + '|' + (grain ? 1 : 0) + '|' + (vcol ? 1 : 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02),
      flatShading: true, map: grain ? rockTex : null, vertexColors: vcol
    }));
  }
  return matCache.get(k)!;
}
export const shade = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();
export const worldX = (x: number) => x - (W - 1) / 2;
