import * as THREE from 'three';
import { scene } from './scene';
import { LM_DECL_SRC, lmUniforms } from './lightmap';
import { DUST_COUNT, DUST_BOX_W, DUST_BOX_H, DUST_SIZE, DUST_SIZE_VARY,
         DUST_LIT_POW, DUST_FLOOR, DUST_RISE, DUST_SWAY, DUST_GAIN,
         LM_DUST_DEPTH, LM_DUST_RAMP, LM_DARK_START, LM_DARK_RAMP } from './sim/feel';

/* Dust hanging in the air, lit by the ship's lamp.

   Playtest: *"can you create a high definition particle effect for dust in the
   air."*

   There was already a dust field, and the reason it did not read as dust is
   worth keeping written down, because it is not the particle count. It was
   parented to the ship - `dust.position.set(px, py, 0)` every frame, with a
   slow spin on top. A cloud that travels with you is not dust; it is a texture
   on the camera. You can fly a hundred metres and the same motes are in the
   same places.

   So these are anchored in the WORLD and wrap around the ship. Fly down and
   motes rise past you, because they are standing still and you are not. That
   one change does more than any amount of extra geometry, and it costs a
   modulo.

   The rest of "high definition":

     - a soft round sprite instead of the default square point
     - per-mote size, phase and drift, so no two move alike
     - lit by the SAME light field as everything else, on a hard curve, so a
       mote outside the beam is nearly invisible and a mote inside it is a
       bright speck. That contrast is the whole effect - it is what makes the
       beam look like a volume with something in it rather than a gradient
     - denser with depth, which is the "increasingly dense air" half of the ask

   One Points draw for all of them. */

/* A round mote with a soft edge. 128px rather than the 64 of the shared bloom
   sprite: these are small on screen and a hard-edged circle at this size reads
   as a dead pixel, which is the one thing a dust mote must not look like. */
const moteTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.72)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  /* The env map bug again, in miniature: a CanvasTexture defaults to
     NoColorSpace, and this one is multiplied into a colour that is about to be
     sRGB-encoded. Left alone the motes come out noticeably hotter than the
     value they are given. */
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();

const pos = new Float32Array(DUST_COUNT * 3);
const seed = new Float32Array(DUST_COUNT);
/* Per-mote drift, held rather than derived, so a mote keeps its own character
   for as long as it is on screen instead of resampling every frame. */
const vel = new Float32Array(DUST_COUNT * 2);

for (let i = 0; i < DUST_COUNT; i++) {
  pos[i * 3] = (Math.random() - 0.5) * DUST_BOX_W;
  pos[i * 3 + 1] = (Math.random() - 0.5) * DUST_BOX_H;
  /* BEHIND the terrain, between the rock face and the backdrop - the same
     reason the old field gave, and it is still right: in front they read as
     specks on the lens floating over solid rock. Behind, a mote is only ever
     visible down a tunnel that has actually been dug. */
  pos[i * 3 + 2] = -0.55 - Math.random() * 0.7;
  seed[i] = Math.random();
  vel[i * 2] = (Math.random() - 0.5) * DUST_SWAY;
  vel[i * 2 + 1] = DUST_RISE * (0.35 + Math.random() * 1.3);
}

const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

const mat = new THREE.ShaderMaterial({
  uniforms: {
    ...lmUniforms(),
    uMote: { value: moteTex },
    uTint: { value: new THREE.Color(0xd8c4a2) },
    uDustGain: { value: 0 },
    uSize: { value: DUST_SIZE },
    uTime: { value: 0 }
  },
  vertexShader: `
    attribute float aSeed;
    uniform float uSize;
    uniform float uTime;
    varying vec2 vLmPos;
    varying float vSeed;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vLmPos = w.xy;
      vSeed = aSeed;
      vec4 mv = viewMatrix * w;
      /* Size attenuated by distance the way a real point would be, with a
         per-mote multiplier so the field has near and far motes in it rather
         than one size of speck repeated. A slow breathe on top, out of phase
         per mote, reads as a mote turning over in the air. */
      float vary = 1.0 + (aSeed - 0.5) * ${DUST_SIZE_VARY.toFixed(2)};
      float breathe = 0.88 + 0.12 * sin(uTime * 1.7 + aSeed * 43.0);
      gl_PointSize = uSize * vary * breathe * 620.0 / max(0.001, -mv.z);
      gl_Position = projectionMatrix * mv;
    }`,
  /* Shares the light model with the terrain and the haze. A mote is a thing in
     the air, so it takes coreAir - the same term the tunnel fog uses, corner
     shadows and all. Dust that lit up inside a shadow would give away exactly
     what the shadow exists to hide. */
  fragmentShader: `
    uniform sampler2D uMote;
    uniform vec3 uTint;
    uniform float uDustGain;
    varying float vSeed;
    ${LM_DECL_SRC()}
    void main() {
      vec4 m = texture2D(uMote, gl_PointCoord);
      if (m.a < 0.004) discard;
      /* A hard curve, on purpose. Out of the beam a mote has to be almost
         nothing; in it, a bright speck. The gap between those two is the
         effect - a flat-lit mote field is just noise over the picture. */
      float lit = pow(coreAir(vLmPos), ${DUST_LIT_POW.toFixed(2)});
      lit = max(${DUST_FLOOR.toFixed(3)}, lit);
      /* Per-mote brightness, so the field does not pulse as one object. */
      float vary = 0.55 + vSeed * 0.9;
      gl_FragColor = vec4(uTint * (lit * vary * uDustGain * m.a), m.a * lit * vary * uDustGain);
    }`,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false
});

export const dustField = new THREE.Points(geo, mat);
dustField.frustumCulled = false;
scene.add(dustField);

let t = 0;

/* Called once a frame with the ship's world position.

   `px`/`py` are world coordinates, not cells. The motes never move with the
   ship; the BOX does, and any mote that falls out of it is wrapped round to the
   other side. Wrapping by the box width keeps a mote's offset within the box,
   so the field stays evenly spread however far the ship has flown, and no mote
   ever pops in the middle of the screen. */
export function stepDust(px: number, py: number, depth: number, raw: number, hot: number,
                         tint = 0xd8c4a2) {
  t += raw;
  mat.uniforms.uTime.value = t;

  /* Thicker the deeper you are. The square is what makes the bottom of a
     planet feel like it has weight in the air rather than just less light. */
  const d = Math.min(1, Math.max(0, depth / LM_DUST_RAMP));
  const dens = 1 + (LM_DUST_DEPTH - 1) * d * d;
  /* Gone in daylight, on exactly the same ramp the haze uses. The haze fades
     with `dep` in its own shader and the motes did not, which left specks
     hanging in the air above the pad on a bright surface - dust you can see
     needs a dark room and a beam, and the surface has neither. */
  const day = Math.min(1, Math.max(0, (depth - LM_DARK_START) / LM_DARK_RAMP));
  mat.uniforms.uDustGain.value = DUST_GAIN * dens * day;
  /* Warm with the rock at the heat line, with everything else that changes
     there - see the band comment in loop.ts. */
  (mat.uniforms.uTint.value as THREE.Color).setHex(tint)
    .lerp(new THREE.Color(0xff7a34), hot);

  const hw = DUST_BOX_W / 2, hh = DUST_BOX_H / 2;
  for (let i = 0; i < DUST_COUNT; i++) {
    const k = i * 3;
    /* Drift plus a slow sway that is a function of the mote's own height and
       seed, so neighbouring motes move differently and the field never shows a
       direction of travel as a whole. */
    pos[k] += (vel[i * 2] * 0.35 + Math.sin(t * 0.7 + seed[i] * 30 + pos[k + 1] * 0.4) * DUST_SWAY * 0.25) * raw;
    pos[k + 1] += vel[i * 2 + 1] * raw;

    const dx = pos[k] - px;
    if (dx > hw) pos[k] -= DUST_BOX_W; else if (dx < -hw) pos[k] += DUST_BOX_W;
    const dy = pos[k + 1] - py;
    if (dy > hh) pos[k + 1] -= DUST_BOX_H; else if (dy < -hh) pos[k + 1] += DUST_BOX_H;
  }
  geo.attributes.position.needsUpdate = true;
}
