import * as THREE from 'three';
import { W, paletteOf } from './sim/config';
import { mixHex } from './sim/util';
/* Re-exported so the renderer modules keep one import for "geometry of a cell". */
export { worldX } from './sim/config';
import { renderer } from './scene';
import { applyLight } from './lightmap';
import { chainCompile } from './shader';
/* Imported rather than referenced out of public/: `base` is './' for Pages
   subpaths, so an absolute /textures/ URL would 404 on the live site. Going
   through the bundler also hashes the filename, which is what lets the service
   worker cache it forever and still pick up a replacement. */
import rockNormalUrl from './textures/rock-normal.webp';
import dirtNormalUrl from './textures/dirt-normal.webp';
import dirtRoughUrl from './textures/dirt-rough.webp';
import gravelNormalUrl from './textures/gravel-normal.webp';
import gravelRoughUrl from './textures/gravel-rough.webp';
import rockGritUrl from './textures/rock-grit.webp';
import rockRoughUrl from './textures/rock-rough.webp';

export const lerpHex = (a: number, b: number, t: number) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/* Rock, in the colour of the world it belongs to. See Palette in config.ts.

   Rock only. Ore keeps its own colour on every planet, because ore colour is
   the fastest-read piece of information in the game and a world that shifted
   it would make the player's quickest judgement the least reliable one. The
   HOST a crystal sits in is rock, so that does tint. */
export const tintRock = (hex: number, planet: number) => {
  const pal = paletteOf(planet);
  return mixHex(hex, pal.rock, pal.mix);
};

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
  chainCompile(m, (shader) => {
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
          /* And project each FACE on its own plane rather than projecting the
             whole world on XY.

             wpos.xy is correct only for a face pointing at the camera. A tunnel
             floor or ceiling has its extent in X and Z and was being sampled
             with (x, y), where y barely changes across the whole face - so one
             axis of texture variation collapsed and the surface read as a flat
             band instead of stone. Every horizontal tunnel, every cavern floor
             and every ledge underside in the game was smeared, and it was
             invisible for as long as play was a straight vertical shaft.

             This is triplanar mapping's right-sized form for this geometry. The
             terrain is a flat-shaded box with hard ninety-degree edges, so
             there is no seam for a three-way blend to hide and no need for
             whiteout normal blending: one plane per face, picked from the box's
             own unperturbed normal, which is still object-space-correct because
             the displacement above only ever writes the transformed position. Cost is a
             handful of scalar compares at vertex frequency, no extra texture
             fetches, and nothing added to the bundle. */
          vec3 an = abs(normal);
          vec2 rockPlane = (an.z >= an.x && an.z >= an.y) ? wpos.xy
                         : (an.x >= an.y)                 ? wpos.zy
                         :                                  wpos.xz;
          vec2 rockUv = rockPlane * ${ROCK_NORMAL_SCALE.toFixed(4)};
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
  }, 'rock' + bump.toFixed(3));
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

/* A surface per band, rather than one stone for the whole world.

   Playtest: *"update the look and feel of the dirt and rock. I want it to feel
   much more realistic."* Every band shared one normal and one roughness map,
   so dirt at four metres and basalt at fifty were the same surface in a
   different colour - and colour is the one thing this game deliberately does
   NOT use to tell materials apart, because twelve palettes are already
   spending it.

   ambientCG Ground110 for the loose soil at the top of the world and Gravel043
   for the stone band under it, both normal and roughness only, both 384 px
   WebP at 25-39 KB. Granite, scoria and basalt keep Rock035, which is what
   they were always closest to.

   Each pair was checked after conversion for actual variance rather than
   trusted: the same pass rejected ambientCG Metal038 for the hull, whose
   normal map came back with a standard deviation of 0.4 - a real file, and
   very nearly flat. */
const dirtNormal = tiled(dirtNormalUrl);
const dirtRough = tiled(dirtRoughUrl);
const gravelNormal = tiled(gravelNormalUrl);
const gravelRough = tiled(gravelRoughUrl);

/* Which surface belongs to which band. Anything not named here falls through
   to the original rock pair, so a new block id is never accidentally invisible
   - it just looks like stone until someone decides otherwise. */
const BAND_SURFACE: Record<string, { n: THREE.Texture; r: THREE.Texture }> = {
  dirt: { n: dirtNormal, r: dirtRough },
  stone: { n: gravelNormal, r: gravelRough }
};
/* Greyscale, and that is the point: it multiplies the palette colour rather
   than replacing it. The photograph supplies the grain, the pitting and the
   mineral speckle; the hand-tuned band colour still decides what KIND of rock
   this is. Importing the colour map instead would have put a photograph of one
   particular cliff into every band in the game. */
const rockGrit = tiled(rockGritUrl, true);
/* The same grain the terrain uses, exported for anything else that wants a
   surface that has been down a hole - the landing pad, chiefly. */
export const gritTex = rockGrit;
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
    /* Everything mat() makes is world geometry, and world geometry answers to
       the lamp. The one exception is handled at the call site: displaceLikeRock
       has to be applied before this, because the injections chain in order. */
    applyLight(m);
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
export function rockRelief(m: THREE.MeshStandardMaterial, band?: string) {
  const surf = (band && BAND_SURFACE[band]) || { n: rockNormal, r: rockRough };
  m.normalMap = surf.n;
  m.roughnessMap = surf.r;
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
  tuneRock(m);
}

/* The two channels that make the ground itself change between worlds, rather
   than just its colour - see Palette in config.ts.

   `rough` decides whether the lamp catches the stone or is swallowed by it,
   which does more to tell two worlds apart than hue does: ice reads as ice
   because it has a highlight, ash reads as ash because nothing on it does.
   `bump` scales the relief, weathered against fractured.

   Applied to every rock material that exists, and re-applied on a planet
   change - a material built on Verdax and reused on Cryon would otherwise
   carry Verdax's surface. */
const rockMats = new Set<THREE.MeshStandardMaterial>();
let surfRough = 1, surfBump = 1;

/* Clamped, and the floor is the interesting half. Below about 0.78 a warm
   lamp's specular starts to dominate the diffuse term, and the rock takes the
   LIGHT'S colour instead of its own - Cryon at 0.62 came out khaki instead of
   ice, which is the palette losing an argument with a highlight. The ceiling
   is 1.0 because that is as rough as the material model goes. */
const ROUGH_MIN = 0.78;

function tuneRock(m: THREE.MeshStandardMaterial) {
  rockMats.add(m);
  m.roughness = Math.max(ROUGH_MIN, Math.min(1, surfRough));
  m.normalScale.set(2.6 * surfBump, 2.6 * surfBump);
}

export function setRockSurface(rough: number, bump: number) {
  if (rough === surfRough && bump === surfBump) return;
  surfRough = rough; surfBump = bump;
  for (const m of rockMats) {
    m.roughness = Math.max(ROUGH_MIN, Math.min(1, rough));
    m.normalScale.set(2.6 * bump, 2.6 * bump);
    m.needsUpdate = true;
  }
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
  /* A canvas holds sRGB values and a texture defaults to NoColorSpace, so
     without this the gradient is read as though it were already linear and
     comes back about two and a half times too bright.

     That matters more here than anywhere else in the game, and it took a while
     to see why: this environment is the ONLY light a metal has. Give the hull a
     nearly black colour - which is what "dark gunmetal" is in linear terms -
     and the albedo contributes almost nothing, so whatever the environment
     supplies is the entire visible brightness of the ship. Painting the hull
     darker did nothing at all until this was fixed, which is exactly the
     signature of a constant term drowning the one you are adjusting. */
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  pmrem.dispose();
  tex.dispose();
  return env;
})();

/* Hazard striping, generated. Forty-five degree bars in the classic yellow and
   near-black, with the yellow scuffed by the same rock grain the terrain uses -
   painted metal on a mining platform has been walked on.

   Drawn rather than imported for the reason the pad itself is built from
   primitives: an imported decal arrives with its own resolution and its own
   idea of how worn "worn" is, and the join to hand-tuned flat-shaded geometry
   shows immediately. */
export const hazardTex = (() => {
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const x = c.getContext('2d')!;
  x.fillStyle = '#c8952f';
  x.fillRect(0, 0, n, n);
  x.strokeStyle = '#1a1712';
  x.lineWidth = n / 6;
  /* Drawn past both edges so the diagonal tiles seamlessly. */
  for (let k = -n; k < n * 2; k += n / 3) {
    x.beginPath(); x.moveTo(k, 0); x.lineTo(k + n, n); x.stroke();
  }
  /* Wear: scratches along the traffic direction, then a dirt wash. */
  x.globalAlpha = 0.18;
  x.strokeStyle = '#000';
  x.lineWidth = 1;
  for (let i = 0; i < 40; i++) {
    const y = (i * 37) % n;
    x.beginPath(); x.moveTo(0, y); x.lineTo(n, y + ((i * 13) % 5) - 2); x.stroke();
  }
  x.globalAlpha = 0.12;
  x.fillStyle = '#2b2419';
  for (let i = 0; i < 60; i++) {
    const r = 3 + ((i * 29) % 11);
    x.beginPath(); x.arc((i * 53) % n, (i * 89) % n, r, 0, 6.3); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

/* Give a material an environment so its metalness means something. */
export function asMetal(m: THREE.MeshStandardMaterial, intensity = 1) {
  m.envMap = metalEnv;
  m.envMapIntensity = intensity;
  return m;
}

export const shade = (hex: number, f: number) => new THREE.Color(hex).multiplyScalar(f).getHex();
