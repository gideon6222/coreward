import * as THREE from 'three';
import { W, worldX } from './config';
import { blockAt } from './world';
import { solveVis, shiftField, castShadows } from './light';
import { chainCompile } from './shader';
import { LM_ATT, LM_PINCH, LM_SEEP, LM_SEEP_STEPS, LM_SMOOTH, LM_FLOOR_DEEP,
         LM_DARK_START, LM_DARK_RAMP, LM_POOL_POW, LM_GAIN, LM_CONTRAST,
         LM_HAZE, LM_HAZE_COLOR, LM_INDIRECT, LM_FOCUS, LM_OMNI_NEAR, LM_OMNI_FAR,
         LM_SHADOW_SOFT, LM_RAYS, LM_BOUNCE_RANGE, LM_BOUNCE_POW,
         LM_AIR_EDGE0, LM_AIR_EDGE1, LM_GLOW_FLOOR, LM_GLOW_POW, LM_FORWARD,
         LM_AIR_AMBIENT } from './feel';

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

/* The shadow fan: one texel per angle, holding how far light gets that way
   before something stops it, as a fraction of the lamp's reach.

   One dimensional, so it is 512 texels - two kilobytes - and it is rebuilt
   every frame rather than on cell changes, because the entire point of it is
   that the shadow moves as the ship does.

   Wrapped rather than clamped, and filtered rather than nearest: angle is
   circular, so the seam at the back of the ship has to interpolate across
   itself like any other pair of rays, and the interpolation between adjacent
   rays is what keeps a shadow edge from stair-stepping as the ship moves. */
const shadowRays = new Float32Array(LM_RAYS);
const shadowData = new Uint8Array(LM_RAYS * 4);
const shTex = new THREE.DataTexture(shadowData, LM_RAYS, 1, THREE.RGBAFormat);
shTex.minFilter = shTex.magFilter = THREE.LinearFilter;
shTex.wrapS = THREE.RepeatWrapping;
shTex.wrapT = THREE.ClampToEdgeWrapping;
shTex.generateMipmaps = false;
shTex.needsUpdate = true;

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
  uLmDark: { value: new THREE.Vector3(LM_FLOOR_DEEP, LM_DARK_START, 1 / LM_DARK_RAMP) },
  uLmShadow: { value: shTex },
  /* which way the lamp points, in GRID space where +y is deeper, then the
     bounce fraction and how tightly the beam narrows to the front */
  uLmDir: { value: new THREE.Vector4(0, 1, LM_INDIRECT, LM_FOCUS) },
  /* how far the shadow edge is smeared, and the reach the fan's distances are
     stored as a fraction of */
  /* shadow-edge smear, the reach the fan's distances are a fraction of, and
     how much further the light reaches ahead than to the side */
  uLmShade: { value: new THREE.Vector3(LM_SHADOW_SOFT, 8, LM_FORWARD) },
  /* 1 / the bounce's own reach, the floor and curve that decide how far
     glowing things stay visible through unlit rock, and the ambient the AIR in
     a tunnel keeps - which is much more than a rock face keeps */
  uLmSoft: { value: new THREE.Vector4(1 / 14, LM_GLOW_FLOOR, LM_GLOW_POW, LM_AIR_AMBIENT) }
};

const OPTS = { att: LM_ATT, pinch: LM_PINCH, seep: LM_SEEP, seepSteps: LM_SEEP_STEPS };

let row0 = 0;
let srcI = -999, srcJ = -999;
let dirty = true;
let snap = true;
/* game time that passed on ticks which did not draw, owed to the smoothing */
let pending = 0;

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

/* `dirX`/`dirD` are the way the ship is pointing, in grid space: +D is deeper.
   Taken from the ship's SMOOTHED facing rather than from `g.face`, so the beam
   swings round with the model instead of snapping a quarter turn ahead of it. */
export function updateLight(
  px: number, pd: number, range: number, dirX: number, dirD: number, dt: number,
  draw = true
) {
  const want = Math.round(pd) - LM_ABOVE;
  /* Scroll the smoothed field with the window, or descending drags every
     cell's old value one row along with it and the field smears. */
  if (want !== row0) { shiftField(cur, LM_COLS, LM_ROWS, want - row0); row0 = want; dirty = true; }

  /* Nothing past this point is read by anything except a shader, so on a tick
     that is not going to draw it is pure waste - and the headless seam runs
     thousands of those in a row. The shadow fan alone is 512 ray casts a tick.

     Skipping leaves `srcI`/`srcJ` stale, which is exactly right: the next tick
     that does draw sees the ship in a different cell and re-solves from
     scratch. The row bookkeeping above still runs, because that is the one
     piece of state that has to stay lined up with the world either way.

     The skipped time is CARRIED rather than dropped. Exponential smoothing
     composes over dt - easing for a second in sixty steps lands where easing
     for a second in one step does - so handing the drawing tick the whole
     interval gives the same answer as never having skipped. Dropping it
     instead silently turns the smoothing rate into "per drawn frame", which
     under the headless seam means one step per half-second of game time: the
     field then chases a target it never catches, and the first thing that
     noticed was a test asserting the cell the ship is sitting in was fully
     lit. It was not - it was at 82 per cent and still climbing. */
  if (!draw) { pending += dt; return; }
  dt += pending;
  pending = 0;

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
    /* R is how lit it is here. G is one bit: is this cell OPEN.

       Keeping brightness and openness in separate channels is what lets the
       air be masked sharply without also crushing a dim tunnel to black. The
       mask is hard - 255 or 0 - and the shader re-normalises the half-value
       that bilinear filtering leaves at a cell boundary, so the glow ends at
       the rock face instead of a cell past it. */
    data[n * 4] = b;
    data[n * 4 + 1] = solid[n] ? 0 : 255;
  }
  lmTex.needsUpdate = true;

  /* The shadow fan, every frame and from the ship's EXACT position - the whole
     point of it is that the wedge behind a corner grows as you pull away, and
     a fan re-cast only on cell changes would step a metre at a time.

     Cast against the same `solid` grid the flood used, so the two can never
     disagree about where a wall is. */
  const reach = Math.max(0.5, range);
  castShadows(solid, LM_COLS, LM_ROWS, px + 1, pd - row0, reach, shadowRays);
  for (let n = 0; n < LM_RAYS; n++) {
    const f = shadowRays[n] / reach;
    shadowData[n * 4] = f >= 1 ? 255 : f <= 0 ? 0 : (f * 255 + 0.5) | 0;
  }
  shTex.needsUpdate = true;

  U.uLmFrame.value.set(worldX(-1) - 0.5, row0 - 0.5, 1 / LM_COLS, 1 / LM_ROWS);
  U.uLmLamp.value.set(worldX(px), -pd, 1 / reach, LM_GAIN);
  U.uLmDir.value.set(dirX, dirD, LM_INDIRECT, LM_FOCUS);
  U.uLmShade.value.set(LM_SHADOW_SOFT, reach, LM_FORWARD);
  U.uLmSoft.value.set(1 / (reach * LM_BOUNCE_RANGE), LM_GLOW_FLOOR, LM_GLOW_POW,
                      LM_AIR_AMBIENT);
  haze.position.set(0, -pd, HAZE_Z);
}

/* The whole lighting model, in one function that everything shares.

   Surfaces, the air in the tunnels and anything else that ever wants to know
   how lit a point is all call `coreReach`, so they cannot drift apart. The one
   thing that differs between them is what they do with the answer. */
const DECL = `
  varying vec2 vLmPos;
  uniform sampler2D uLmMap;
  uniform sampler2D uLmShadow;
  uniform vec4 uLmFrame;
  uniform vec4 uLmLamp;
  uniform vec4 uLmDir;
  uniform vec3 uLmDark;
  uniform vec3 uLmShade;
  uniform vec4 uLmSoft;

  /* Where p sits in the light grid. */
  vec2 coreUv(vec2 p) {
    return vec2((p.x - uLmFrame.x) * uLmFrame.z, (-p.y - uLmFrame.y) * uLmFrame.w);
  }

  /* THERE ARE TWO LIGHTS, and keeping them apart is the whole shape of this.

     Playtest: *"there should basically be two types of light. one will be the
     light in the tunnels, which will disperse and spread through all of the
     connected tunnels ... the second type of light I want is on the rock faces
     and separate from the tunnel light."*

     He was right, and the version before this had them fused: one number went
     to both, so the shadow fan - which belongs entirely to the air in a tunnel
     - was also carving hard-edged wedges across every rock face in the frame.
     That is what "we are still getting angle shadows from the blocks" was. The
     acne fix earlier had removed the artefact from INSIDE a wall; it could not
     remove a shadow that was never supposed to be on walls at all.

     So: the terms below are shared, and the two lights differ in exactly one
     thing - whether the shadow applies.

       ROCK  flood x pool x lobe                 (no shadow, ever)
       AIR   flood x pool x lobe x shadow        (or the bounce, whichever wins)

     A rock face is lit by being NEAR a lit tunnel, and that is a property of
     the rock, not of the sightline. The air in a tunnel is lit by light
     arriving along it, and a corner in the way is exactly what stops it. */

  /* dist, pool, lobe, bounce. One call, because both lights want all four. */
  vec4 coreTerms(vec2 dg) {
    float dist = length(dg);
    float ax = dist > 0.0001 ? dot(dg / dist, uLmDir.xy) : 1.0;

    /* Reach is stretched along the way the ship points, so the lit area is an
       egg pointing where the drill points rather than a circle with a bright
       half - "see further forward, rather than just an even circle". */
    float ahead = dist / (1.0 + uLmShade.z * max(0.0, ax));
    float r = min(1.0, ahead * uLmLamp.z);
    float pool = clamp(1.0 - pow(r, ${LM_POOL_POW.toFixed(2)}), 0.0, 1.0);

    /* The lamp points where the drill points. Omnidirectional close in - a
       real lamp lights its own surroundings whichever way it is aimed, and
       without this the ship sits in a hard-edged half-disc of its own
       shadow. */
    float lobe = pow(max(0.0, ax * 0.5 + 0.5), uLmDir.w);
    lobe = mix(1.0, lobe, smoothstep(${LM_OMNI_NEAR.toFixed(2)}, ${LM_OMNI_FAR.toFixed(2)}, dist));

    /* The bounce: omnidirectional, unshadowed, longer reach and a far gentler
       curve than the beam. This is what keeps the way home readable and what
       leaves ambient light in a branch the beam cannot see into. */
    float rB = min(1.0, dist * uLmSoft.x);
    float bounce = clamp(1.0 - pow(rB, ${LM_BOUNCE_POW.toFixed(2)}), 0.0, 1.0);

    return vec4(dist, pool, lobe, bounce);
  }

  vec2 coreOffset(vec2 p) {
    /* Grid space: x across, y DEEPER, which is the frame the shadow fan and
       the ship's facing are both expressed in. */
    return vec2(p.x - uLmLamp.x, uLmLamp.y - p.y);
  }

  /* Light on a ROCK FACE. Near a lit tunnel is lit; a couple of layers into
     the mass it is gone. No shadow term - a wall does not stop being a wall
     because the sightline to it clips a corner. */
  float coreReach(vec2 p) {
    vec4 t = coreTerms(coreOffset(p));
    float vis = texture2D(uLmMap, coreUv(p)).r;
    return vis * max(t.y * t.z, t.w * uLmDir.z);
  }

  /* Light in the AIR of a tunnel. The flood spreads it through everything
     connected; the beam makes the tunnel you are facing the brightest; the fan
     throws a hard wedge into a branch the beam passes. The bounce underneath
     is why that branch is still readable rather than a hole.

     Brightness comes from the R channel and the shape from the hard mask in G.
     The smoothstep is doing something specific: bilinear filtering leaves 0.5
     at a cell boundary and 1.0 at a cell centre, so re-normalising that range
     lands the glow exactly inside the open cell. Without it a one-cell tunnel
     paints a three-cell blob - see LM_AIR_EDGE0 in feel.ts. */
  float coreReachAir(vec2 p) {
    vec2 dg = coreOffset(p);
    vec4 t = coreTerms(dg);
    vec4 lm = texture2D(uLmMap, coreUv(p));
    float air = lm.r * smoothstep(${LM_AIR_EDGE0.toFixed(2)}, ${LM_AIR_EDGE1.toFixed(2)}, lm.g);
    /* The fan is indexed by angle and holds distance as a fraction of reach.
       Anything further from the lamp than the occluder on its own bearing is
       behind something. The smear is a twentieth of a cell, purely so the edge
       does not alias into stair steps as the ship moves. */
    float occ = texture2D(uLmShadow, vec2(atan(dg.y, dg.x) * 0.15915494, 0.5)).r * uLmShade.y;
    float clear = 1.0 - smoothstep(occ - uLmShade.x, occ + uLmShade.x, t.x);
    return air * max(t.y * t.z * clear, t.w * uLmSoft.w);
  }

  /* Daylight, read from the CELL's own depth rather than the ship's, so the
     top of a shaft still glows when you are ninety metres under it. */
  float coreFloor(vec2 p) {
    return mix(1.0, uLmDark.x, clamp((-p.y - uLmDark.y) * uLmDark.z, 0.0, 1.0));
  }

  /* Both lights go through the same gamma curve - see LM_CONTRAST in feel.ts.
     They differ in what reaches them, not in how they are displayed. */
  float coreShade(vec2 p) {
    return pow(min(1.0, coreReach(p) * uLmLamp.w), ${LM_CONTRAST.toFixed(2)});
  }

  float coreAir(vec2 p) {
    return pow(min(1.0, coreReachAir(p) * uLmLamp.w), ${LM_CONTRAST.toFixed(2)});
  }

  float coreLit(vec2 p) {
    float fl = coreFloor(p);
    return fl + (1.0 - fl) * coreShade(p);
  }

  /* What a GLOWING thing keeps here - emissive rock, ore crystals, haloes.

     A much gentler curve than a surface, with a floor. Ore glowing through
     unlit rock is the find-the-vein mechanic and has to survive; at full
     strength, though, a vein five cells inside the mass read as clearly as one
     you were about to break into. */
  float coreGlow(vec2 p) {
    return mix(uLmSoft.y, 1.0, pow(coreShade(p), uLmSoft.z));
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
/* IN FRONT of the terrain, not behind it.

   Behind was the obvious place - the haze belongs in the empty volume of the
   tunnel, and depth-testing against the rock meant it could only ever show
   through a hole. What that missed is that a rock face is not flat: the
   displacement shader pushes vertices up to a fifth of a cell forward, so the
   walls of a tunnel bulge INTO it, and every one of those bulges drew over the
   haze as an angular chip of lit rock floating in the fog.

   In front, none of that can happen, and nothing is lost: the open channel is
   zero on rock, so the quad adds nothing there anyway. The half-texel of
   bilinear bleed at the edge of a tunnel is a bonus - light spilling onto the
   lip of the wall, which is what it should do.

   That puts it forward of the ship's old z, so the ship moved forward too. See
   SHIP_Z in ship.ts: the ship has to stay in front of its own light or the
   additive quad washes the hull flat. */
const HAZE_Z = 0.74;
export const haze = new THREE.Mesh(
  new THREE.PlaneGeometry(W + 10, 46),
  new THREE.ShaderMaterial({
    /* Spread, not listed. This material used to name its uniforms by hand and
       the injection named them by hand somewhere else, which is how the two
       came to disagree: the haze had the shadow fan and the terrain did not.
       One source of truth, and adding a uniform to U reaches both. */
    uniforms: {
      ...U,
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
    /* Shares coreReach with every surface in the world, so the air in a tunnel
       goes dark for exactly the same reasons its walls do - out of the beam,
       round a corner, behind an edge. Written twice, they would drift. */
    fragmentShader: `
      uniform vec3 uHaze;
      uniform float uHazeGain;
      ${DECL}
      void main() {
        /* Fades out at the surface with everything else - haze in daylight
           reads as a smudge on the screen. */
        float dep = clamp((-vLmPos.y - uLmDark.y) * uLmDark.z, 0.0, 1.0);
        gl_FragColor = vec4(uHaze * (coreAir(vLmPos) * dep * uHazeGain), 1.0);
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

/* Both injections below go through chainCompile, so they stack onto the
   displacement a rock material already carries instead of replacing it. */

function inject(
  m: THREE.Material,
  patch: (s: Parameters<THREE.Material['onBeforeCompile']>[0]) => void,
  tag: string
) {
  return chainCompile(m, (shader) => {
    /* Every key in U, by iteration rather than by hand.

       Written out one line per uniform, this silently lost the shadow fan the
       day it was added: the DECL declared `uLmShadow`, `uLmDir` and `uLmShade`
       and nothing here supplied them, so the sampler fell back to texture unit
       zero and the vectors to zero. The terrain compiled, rendered, and simply
       ignored every shadow in the game - while the haze, which lists its
       uniforms explicitly, worked. Which is exactly the shape of bug that
       costs an afternoon: half the feature works.

       A loop cannot forget. */
    for (const k of Object.keys(U)) shader.uniforms[k] = U[k as keyof typeof U];
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
          /* Emissive is dimmed too, but on the glow curve rather than this
             one. Left alone, a vein deep in the rock is the brightest thing on
             screen however dark its surroundings are. */
          totalEmissiveRadiance *= coreGlow(vLmPos);
        }`)
  }, 'lm');
  return m;
}

/* For additive glows - ore haloes and the like.

   Same injection, the gentler curve. These are the loudest thing on screen at
   any depth, and until they answered to the light field at all, a vein deep
   inside unlit rock announced itself exactly as strongly as one at the mouth
   of the tunnel you were standing in. */
export function applyGlow<T extends THREE.Material>(m: T): T {
  inject(m, (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${DECL}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  gl_FragColor.rgb *= coreGlow(vLmPos);`);
  }, 'lmg');
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
