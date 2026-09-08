import * as THREE from 'three';
import { W } from './config';
/* Imported rather than referenced out of public/: `base` is './' for Pages
   subpaths, so an absolute /textures/ URL would 404 on the live site. Going
   through the bundler also hashes the filename, which is what lets the service
   worker cache it forever and still pick up a replacement. */
import rockNormalUrl from './textures/rock-normal.webp';

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
  dirt: 0.16, stone: 0.20, granite: 0.26, scoria: 0.30, basalt: 0.32,
  /* A gas pocket is a bubble, so its shell is the smoothest thing in the
     ground; a geode is a cracked-open shell, so it is the roughest. Both read
     as "not rock" at a glance, which is the entire point of a pocket. */
  gas: 0.10, geode: 0.34,
  /* a seam is broken-up rock, rougher than the band it sits in */
  seam: 0.30,
  /* loose fill, so the roughest surface in the game */
  rubble: 0.40
};

/* How many world units of rock one tile of the normal map covers, as a
   multiplier on world position: 0.25 is one tile per four cells. Declared here
   rather than beside the texture because the vertex shader below bakes it in as
   a literal, and a constant a shader reads should be visible above it. */
const ROCK_NORMAL_SCALE = 0.25;

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
          vec3 wpos = transformed + cell;
          transformed += rockOffset(wpos);
          /* Point the normal-map lookup at world XY instead of the cube's own
             UVs, so the surface detail runs continuously across cell borders
             rather than restarting inside every block. Assigned here because
             this is where the world position exists; vNormalMapUv is an
             ordinary varying and three has no further use for it after
             <uv_vertex> has set it. Guarded because the same displacement is
             also used on materials that carry no normal map. */
          #ifdef USE_NORMALMAP
            vNormalMapUv = wpos.xy * ${ROCK_NORMAL_SCALE.toFixed(4)};
          #endif
        }`
      );
  };
  /* materials are cached by three on their program key; this forces a rebuild */
  m.customProgramCacheKey = () => 'rock' + bump.toFixed(3);
}
export const shardGeo = new THREE.OctahedronGeometry(1, 0);
/* Cache contents. A flat slab rather than a crystal: at thirty pixels the only
   thing that separates man-made from mineral is that the faces are parallel. */
export const crateGeo = new THREE.BoxGeometry(1, 0.62, 0.62);
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

/* Real rock relief, sampled on WORLD position.

   Everything else on the rock is procedural, and the grain map above is the
   reason why: it costs no bytes and it retunes in a line. What it cannot do is
   look like rock. Two octaves of value noise is pitting, not geology - no
   bedding, no fracture, no sense that the surface was ever under pressure.

   This is a photographed cliff face (ambientCG Rock035, CC0) reduced to its
   NORMAL map alone. That distinction is the whole reason it fits a game that is
   otherwise hand-palette flat-shaded low-poly: a normal map carries no colour.
   Every block keeps the exact hue the palette gives it and gains a surface. The
   colour map from the same download would have dropped a photograph into the
   middle of a stylised world, which is the failure the notes warn about; the
   normal map is the half of it that is style-neutral.

   384 x 384 WebP, 45 KB. On an S26 Ultra at a pixel ratio of 2 a cell is about
   118 physical pixels, so tiling this every four cells puts it at roughly its
   own resolution - large enough to carry detail, small enough that the repeat
   is not a pattern you can read.

   Sampled on world XY rather than on the cube's own UVs, for the reason
   CRAFT.md gives about per-instance data: mapped per cell, the detail would
   restart at every cell boundary and the wall would read as a stack of
   identical boxes. Keyed on world position it is one continuous rock face that
   the tunnels happen to be cut out of, which is the entire point. */
const rockNormal = new THREE.TextureLoader().load(rockNormalUrl);
rockNormal.wrapS = rockNormal.wrapT = THREE.RepeatWrapping;

const matCache = new Map<string, THREE.MeshLambertMaterial>();
/* `vcol` must match the geometry: enabling vertex colours on a geometry that
   has no colour attribute renders it black. Only the chunk geometries carry
   one - shards and haloes do not. */
export function mat(color: number, glow?: number, grain = true, vcol = false) {
  const k = color + '|' + (glow || 0) + '|' + (grain ? 1 : 0) + '|' + (vcol ? 1 : 0);
  if (!matCache.has(k)) {
    const m = new THREE.MeshLambertMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02),
      flatShading: true, map: grain ? rockTex : null, vertexColors: vcol
    });
    /* The `grain` flag already means "this is rock, not a gemstone", so the
       relief rides on the same decision. Rock normals on a crystal would read
       as a scuffed, dirty gem for exactly the reason the grain map does. */
    if (grain) rockRelief(m);
    matCache.set(k, m);
  }
  return matCache.get(k)!;
}

/* Give a material the rock's surface, keyed on world position.

   three already knows how to apply a tangent-space normal map to a flat-shaded
   surface - `perturbNormal2Arb` builds the frame from screen-space derivatives,
   so no tangent attribute is needed. The only thing it does wrong here is the
   lookup: it samples at the cube's own UVs, which restart at every cell.

   `vNormalMapUv` is a varying, so it can simply be reassigned in the vertex
   shader after three has set it. Overwriting it with world XY is the entire
   change - everything downstream is stock three. Done in the same injection as
   the displacement, because that is where the world position is already in
   hand and computing it twice invites the two drifting apart. */
export function rockRelief(m: THREE.MeshLambertMaterial) {
  m.normalMap = rockNormal;
  /* Higher than a normal map usually wants, and measured rather than guessed:
     at 0.45 the effect was invisible against flat shading, and at 3.0 it read
     clearly with the facets still completely intact. The reason it takes so
     much is that the map is spread over four cells, so what survives is its
     low-frequency component - broad swells rather than grain.

     2.6 is a step back from the strongest value verified by eye, to leave
     headroom on brightly lit ore. This is the number to change if the rock ever
     looks either flat or mushy, and it wants checking on the phone: the effect
     lives entirely in how the lamp rakes across a surface, which a desktop
     screenshot of a static frame understates. */
  m.normalScale = new THREE.Vector2(2.6, 2.6);
}
export const shade = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();
export const worldX = (x: number) => x - (W - 1) / 2;
