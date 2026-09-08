import * as THREE from 'three';
import { W, worldX } from './config';
import { blockAt } from './world';
import { solveVis, shiftField } from './light';
import { chainCompile } from './shader';
import { LM_ATT, LM_PINCH, LM_SEEP, LM_SEEP_STEPS, LM_SMOOTH, LM_FLOOR_DEEP,
         LM_DARK_START, LM_DARK_RAMP, LM_POOL_POW, LM_GAIN,
         LM_HAZE, LM_HAZE_COLOR } from './feel';

/* The grid the solver works on, and the bridge from it to every shader.

   The solved field is uploaded as a small texture and sampled by world
   position, which is what makes the lighting continuous rather than blocky:
   the grid is one texel per cell, but LinearFilter interpolates between them,
   so light fades across a rock face instead of stepping at its edges.

   The texture is tiny - 15 by 36 texels, 2 KB - and re-uploaded at most once a
   frame. It is not a cost worth thinking about; the cost worth thinking about
   was the solve, and that only runs when the ship changes cell or the terrain
   changes shape.

   What the shader does with it is deliberately narrow: it multiplies the light
   three has already computed, and it is clamped to at most 1. It cannot make
   anything brighter than it was. Every lighting value in feel.ts was calibrated
   by eye against the old renderer and stays valid; this only takes light away
   from places the lamp cannot reach. */

/* One border column each side of the world, so a fragment at the very edge of
   the map still has a texel on both sides to interpolate between. */
export const LM_COLS = W + 2;
/* Comfortably more than the 29 rows of terrain that are ever streamed, so the
   sampled area always has real data under it rather than a clamped edge. */
export const LM_ROWS = 36;
const LM_ABOVE = 17;
const CELLS = LM_COLS * LM_ROWS;

const solid = new Uint8Array(CELLS);
const target = new Float32Array(CELLS);
const cur = new Float32Array(CELLS);
const data = new Uint8Array(CELLS * 4);

const lmTex = new THREE.DataTexture(data, LM_COLS, LM_ROWS, THREE.RGBAFormat);
lmTex.minFilter = lmTex.magFilter = THREE.LinearFilter;
lmTex.wrapS = lmTex.wrapT = THREE.ClampToEdgeWrapping;
lmTex.generateMipmaps = false;
lmTex.needsUpdate = true;

/* One set of uniform objects, shared by reference into every material that
   takes the injection. Writing `.value` here therefore updates all of them,
   which is the only reason a per-frame position can drive thirty materials
   without thirty writes. */
const U = {
  uLmMap: { value: lmTex },
  /* world X of the left border texel, the shallowest row, and the two texel
     scales - packed because a vec4 is one uniform and four floats are four */
  uLmFrame: { value: new THREE.Vector4(0, 0, 1 / LM_COLS, 1 / LM_ROWS) },
  /* lamp X, lamp Y, 1 / reach, gain */
  uLmLamp: { value: new THREE.Vector4(0, 0, 1 / 8, LM_GAIN) },
  /* the floor a cell the lamp never reaches settles to, and where daylight
     gives out - in metres, read from the CELL rather than from the ship */
  uLmDark: { value: new THREE.Vector3(LM_FLOOR_DEEP, LM_DARK_START, 1 / LM_DARK_RAMP) }
};

const OPTS = { att: LM_ATT, pinch: LM_PINCH, seep: LM_SEEP, seepSteps: LM_SEEP_STEPS };

let row0 = 0;
let srcI = -999, srcJ = -999;
let dirty = true;
let snap = true;

/* Terrain changed shape. Called from the one place that already knows -
   blocks.rebuild() - so a dug cell, a tremor and a planet change all reach it
   without any of them having to remember to. */
export function markLightDirty() { dirty = true; }

/* Planet change: do not ease from the old world's shadows into the new one's. */
export function resetLight() { dirty = true; snap = true; }

function fillSolid() {
  for (let j = 0; j < LM_ROWS; j++) {
    const d = row0 + j;
    for (let i = 0; i < LM_COLS; i++) {
      const x = i - 1;
      /* Above the surface is open sky in every column, including the two
         border ones - otherwise the world edge grows walls into the air and
         the pad sits in a slot. Below it, out of bounds is rock. */
      solid[j * LM_COLS + i] =
        d < 0 ? 0 : x < 0 || x >= W ? 1 : blockAt(x, d) ? 1 : 0;
    }
  }
}

export function updateLight(px: number, pd: number, range: number, dt: number) {
  const want = Math.round(pd) - LM_ABOVE;
  /* Scroll the smoothed field with the window, or descending drags every
     cell's old value one row along with it and the field smears. */
  if (want !== row0) { shiftField(cur, LM_COLS, LM_ROWS, want - row0); row0 = want; dirty = true; }

  const si = Math.round(px) + 1, sj = Math.round(pd) - row0;
  if (dirty || si !== srcI || sj !== srcJ) {
    if (dirty) fillSolid();
    solveVis(solid, LM_COLS, LM_ROWS, si, sj, OPTS, target);
    dirty = false; srcI = si; srcJ = sj;
  }

  const k = snap ? 1 : 1 - Math.exp(-LM_SMOOTH * dt);
  snap = false;
  for (let n = 0; n < CELLS; n++) {
    const v = cur[n] + (target[n] - cur[n]) * k;
    cur[n] = v;
    const b = v <= 0 ? 0 : v >= 1 ? 255 : (v * 255 + 0.5) | 0;
    /* R is how lit a SURFACE here is. G is the same number but only in cells
       that are open, which is what the haze below draws: light in the air of a
       tunnel rather than light on the rock around it. Two channels of one
       upload - the alternative is a second texture for one bit of extra
       information. */
    data[n * 4] = b;
    data[n * 4 + 1] = solid[n] ? 0 : b;
  }
  lmTex.needsUpdate = true;

  U.uLmFrame.value.set(worldX(-1) - 0.5, row0 - 0.5, 1 / LM_COLS, 1 / LM_ROWS);
  U.uLmLamp.value.set(worldX(px), -pd, 1 / Math.max(0.5, range), LM_GAIN);
  haze.position.set(0, -pd, HAZE_Z);
}

/* ---------- light in the air ----------

   The half of "light fills the tunnel" that lighting a surface cannot do.

   A dug cell contains nothing. There is no geometry in it to light, so however
   good the propagated field is, what the player sees down an open shaft is
   whatever plane happens to be behind it - and the tunnel reads as an empty
   slot rather than as a space with light in it.

   This is one additive quad across the frame, sampling the OPEN channel of the
   same texture. Where the solver says a cell is open and reached, it adds a
   warm glow; on rock it adds nothing, because the channel is zero there. It
   sits behind the terrain and depth-tests against it, so the two agree twice
   over about where a tunnel is.

   One draw call and a trivial fragment. The cost is fill rate, and fill rate
   is the one thing this phone has in abundance. */
const HAZE_Z = -0.55;
export const haze = new THREE.Mesh(
  new THREE.PlaneGeometry(W + 10, 46),
  new THREE.ShaderMaterial({
    uniforms: {
      uLmMap: U.uLmMap, uLmFrame: U.uLmFrame, uLmLamp: U.uLmLamp, uLmDark: U.uLmDark,
      uHaze: { value: new THREE.Color(LM_HAZE_COLOR) },
      uHazeGain: { value: LM_HAZE }
    },
    vertexShader: `
      varying vec2 vLmPos;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vLmPos = w.xy;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec2 vLmPos;
      uniform sampler2D uLmMap;
      uniform vec4 uLmFrame;
      uniform vec4 uLmLamp;
      uniform vec3 uLmDark;
      uniform vec3 uHaze;
      uniform float uHazeGain;
      void main() {
        vec2 luv = vec2((vLmPos.x - uLmFrame.x) * uLmFrame.z,
                        (-vLmPos.y - uLmFrame.y) * uLmFrame.w);
        float air = texture2D(uLmMap, luv).g;
        float r = min(1.0, length(vLmPos - uLmLamp.xy) * uLmLamp.z);
        float pool = clamp(1.0 - pow(r, ${LM_POOL_POW.toFixed(1)}), 0.0, 1.0);
        /* Fades out at the surface with everything else - haze in daylight
           reads as a smudge on the screen. */
        float dep = clamp((-vLmPos.y - uLmDark.y) * uLmDark.z, 0.0, 1.0);
        gl_FragColor = vec4(uHaze * (air * pool * pool * dep * uHazeGain), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })
);
haze.frustumCulled = false;
haze.renderOrder = -0.5;

/* Live handles for tuning by eye, behind ?debug in main.ts.

   Every number in the propagated light was set by looking at it, and looking
   at it through a rebuild-and-reload cycle is how an afternoon disappears.
   Mutating OPTS then calling resolve() re-runs the flood on the next frame;
   mutating U changes the shader with no re-solve at all. */
export const lmDebug = { U, OPTS, resolve: markLightDirty };

/* ---------- the injection ---------- */

const DECL = `
  varying vec2 vLmPos;
  uniform sampler2D uLmMap;
  uniform vec4 uLmFrame;
  uniform vec4 uLmLamp;
  uniform vec3 uLmDark;
  float coreLit(vec2 p) {
    vec2 luv = vec2((p.x - uLmFrame.x) * uLmFrame.z, (-p.y - uLmFrame.y) * uLmFrame.w);
    /* How much of the lamp survived getting here through the tunnels. */
    float vis = texture2D(uLmMap, luv).r;
    /* How far away it is, from the ship exact position rather than its cell.
       This is the half that has to be continuous, and it is the reason the
       pool glides with the ship instead of stepping a metre at a time. */
    float r = min(1.0, length(p - uLmLamp.xy) * uLmLamp.z);
    float pool = clamp(1.0 - pow(r, ${LM_POOL_POW.toFixed(1)}), 0.0, 1.0);
    /* Daylight, by the cell own depth: the top of a shaft still glows when
       you are twenty metres under it. */
    float fl = mix(1.0, uLmDark.x, clamp((-p.y - uLmDark.y) * uLmDark.z, 0.0, 1.0));
    return fl + (1.0 - fl) * min(1.0, vis * pool * uLmLamp.w);
  }
`;

/* Both start with a newline of their own, because they are appended straight
   after an `#include` line and GLSL preprocessor directives own their line. */
const VERT_DECL = `
  varying vec2 vLmPos;`;
const VERT_BODY = `
  #ifdef USE_INSTANCING
    vLmPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xy;
  #else
    vLmPos = (modelMatrix * vec4(position, 1.0)).xy;
  #endif
`;

/* Both injections below go through chainCompile, so they stack onto the
   displacement a rock material already carries instead of replacing it. */

function inject(
  m: THREE.Material,
  patch: (s: Parameters<THREE.Material['onBeforeCompile']>[0]) => void,
  tag: string
) {
  return chainCompile(m, (shader) => {
    shader.uniforms.uLmMap = U.uLmMap;
    shader.uniforms.uLmFrame = U.uLmFrame;
    shader.uniforms.uLmLamp = U.uLmLamp;
    shader.uniforms.uLmDark = U.uLmDark;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>' + VERT_DECL)
      .replace('#include <begin_vertex>', '#include <begin_vertex>' + VERT_BODY);
    patch(shader);
  }, tag);
}

/* For anything three lights: scale the reflected light and leave the emissive
   alone. That distinction is the whole reason this is injected here rather
   than multiplied over the final colour - ore has to keep glowing in the dark,
   because finding it in the dark is the game. */
export function applyLight<T extends THREE.Material>(m: T): T {
  inject(m, (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          float lit = coreLit(vLmPos);
          reflectedLight.directDiffuse *= lit;
          reflectedLight.indirectDiffuse *= lit;
          reflectedLight.directSpecular *= lit;
          reflectedLight.indirectSpecular *= lit;
        }`);
  }, 'lm');
  return m;
}

/* For unlit materials, which have no reflected light to scale. Applied before
   fog so distance still does what it did. */
export function applyLightUnlit<T extends THREE.Material>(m: T): T {
  inject(m, (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + DECL)
      .replace('#include <opaque_fragment>',
        '#include <opaque_fragment>\n  gl_FragColor.rgb *= coreLit(vLmPos);');
  }, 'lmu');
  return m;
}
