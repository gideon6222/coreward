import * as THREE from 'three';
import { W } from './config';
import { renderer } from './scene';
/* Imported rather than referenced out of public/: `base` is './' for Pages
   subpaths, so an absolute /textures/ URL would 404 on the live site. Going
   through the bundler also hashes the filename, which is what lets the service
   worker cache it forever and still pick up a replacement. */
import rockNormalUrl from './textures/rock-normal.webp';
import rockGritUrl from './textures/rock-grit.webp';
import rockRoughUrl from './textures/rock-rough.webp';

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
          /* Point every map lookup at world XY instead of the cube's own UVs,
             so the surface detail runs continuously across cell borders rather
             than restarting inside every block. Assigned here because this is
             where the world position exists; these are ordinary varyings and
             three has no further use for them after <uv_vertex> has set them.

             All three have to be done, and they have to agree. Grain, relief
             and roughness are three descriptions of ONE surface: if the grit
             says pitted here while the normal map says smooth here, the eye
             reads plastic with a picture of rock printed on it. Each is guarded
             because the same displacement is used on materials that carry only
             some of them. */
          vec2 rockUv = wpos.xy * ${ROCK_NORMAL_SCALE.toFixed(4)};
          #ifdef USE_NORMALMAP
            vNormalMapUv = rockUv;
          #endif
          #ifdef USE_MAP
            vMapUv = rockUv;
          #endif
          #ifdef USE_ROUGHNESSMAP
            vRoughnessMapUv = rockUv;
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

/* The procedural canvas grain that used to live here is gone.

   It was two octaves of value noise multiplied over the palette, and it was the
   right call while nothing could be imported: no bytes, no request, trivial to
   retune. What it could never do is look like a mineral. Noise is uniform by
   construction - it has no bedding, no fracture, no sense that the surface was
   ever under pressure - so it reads as speckle on plastic. The greyscale grit
   map below does the same job (multiply the palette, do not replace it) with a
   photograph of real stone behind it. */

const loader = new THREE.TextureLoader();
const tiled = (url: string, srgb = false) => {
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  /* Only the colour channel is a colour. A normal map and a roughness map are
     DATA - vectors and a scalar - and putting them through the sRGB decode
     three applies to colour textures bends both. This is the single easiest
     thing to get wrong in a PBR setup and it shows up as "the lighting looks
     slightly off" rather than as anything obviously broken. */
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return t;
};

const rockNormal = tiled(rockNormalUrl);
/* Greyscale, and that is the point: it multiplies the palette colour rather
   than replacing it. The photograph supplies the grain, the pitting and the
   mineral speckle; the hand-tuned band colour still decides what KIND of rock
   this is. Importing the colour map instead would have put a photograph of one
   particular cliff into every band in the game. */
const rockGrit = tiled(rockGritUrl, true);
/* Real roughness variation is most of what separates stone from plastic: a
   uniform roughness reads as one moulded surface however good the normal map
   is, because every part of it catches the lamp identically. */
const rockRough = tiled(rockRoughUrl);

const matCache = new Map<string, THREE.MeshStandardMaterial>();
/* `vcol` must match the geometry: enabling vertex colours on a geometry that
   has no colour attribute renders it black. Only the chunk geometries carry
   one - shards and haloes do not. */
export function mat(color: number, glow?: number, grain = true, vcol = false) {
  const k = color + '|' + (glow || 0) + '|' + (grain ? 1 : 0) + '|' + (vcol ? 1 : 0);
  if (!matCache.has(k)) {
    /* Standard rather than Lambert.

       Lambert has no roughness at all: every surface scatters light identically,
       which is exactly why the world read as moulded plastic however much relief
       was added on top. Rock is defined as much by how UNEVENLY it catches a
       light as by its shape, and that needs a roughness channel.

       The cost is real and was measured rather than assumed - see NOTES.md. It
       is affordable here because terrain is instanced: the shader runs per
       pixel, not per block, and the block count never enters into it. */
    const m = new THREE.MeshStandardMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02),
      flatShading: true, map: grain ? rockGrit : null, vertexColors: vcol,
      /* Rock is not metal, and it is rough almost everywhere. The map varies
         this around the base value; the base is what it settles to where the
         map is mid-grey. */
      metalness: 0, roughness: 1.0
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
export function rockRelief(m: THREE.MeshStandardMaterial) {
  m.normalMap = rockNormal;
  m.roughnessMap = rockRough;
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
/* Something for metal to reflect.

   A MeshStandardMaterial with high metalness has NO diffuse term at all - a
   metal's colour comes entirely from what it reflects. With no environment
   that is nothing, so the ship came out as blown-out specular hotspots where
   the lamp caught it and near-black everywhere else: a white blob at play
   scale, which is the opposite of the gunmetal it was asking for.

   This is the cheapest possible fix and it is the correct one rather than a
   workaround: a tiny gradient standing in for "dark rock below, faint warm
   light above", run through PMREM so roughness blurs it properly. 64x64, built
   once at load, no bytes shipped.

   Applied per material rather than as scene.environment on purpose. As a scene
   environment it would light the terrain too, adding exactly the flat fill the
   darkness pass just spent an afternoon removing. */
const metalEnv = (() => {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const x = c.getContext('2d')!;
  const grad = x.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, '#4a4436');     /* warm bounce from above */
  grad.addColorStop(0.5, '#20242c');
  grad.addColorStop(1, '#0a0b0e');     /* dark rock underfoot */
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
})();

/* Give a material an environment so its metalness means something. */
export function asMetal(m: THREE.MeshStandardMaterial, intensity = 1) {
  m.envMap = metalEnv;
  m.envMapIntensity = intensity;
  return m;
}

export const shade = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();
export const worldX = (x: number) => x - (W - 1) / 2;
