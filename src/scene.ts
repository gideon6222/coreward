import * as THREE from 'three';
import { W } from './config';
import { S } from './state';
import { LAMP_DECAY, LAMP_INTENSITY } from './feel';
import { R } from './runtime';
import { applyLightUnlit, haze } from './lightmap';

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
export const gameEl = document.getElementById('game')!;
gameEl.appendChild(renderer.domElement);

/* Scene.fog is typed FogBase | null and only FogExp2 has `density`, which
   the frame loop writes every frame. Keep a typed handle so that is checked
   rather than assumed. */
export const fog = new THREE.FogExp2(0x05070d, 0.028);
scene.fog = fog;

export const amb = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(amb);
export const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
sun.position.set(5, 12, 8);
scene.add(sun);
export const rim = new THREE.DirectionalLight(0x4a7ad0, 0.5);
rim.position.set(-6, -3, -6);
scene.add(rim);
/* Backdrop.

   The terrain is a single layer of chunks, so anywhere one is missing - a dug
   side tunnel, the edge of the streamed window - the sky gradient shows
   straight through and underground reads as cut-out shapes floating in
   daylight. This sits behind the terrain so those gaps read as rock continuing
   into the dark instead.

   Completely static: the world is 13 columns wide and this is 60, so it never
   needs to follow the camera, and its top edge sits at the surface so it never
   covers the sky or the stars. One draw call, set up once, never touched again.

   Deliberately dark and unlit - fog tints it toward whatever the depth colour
   is, so it goes ember below the heat line along with everything else. */
/* Lightmapped, and that is what makes a tunnel look FILLED with light rather
   than merely walled with lit rock. A dug cell has no geometry in it at all,
   so what the player sees down an open shaft is this plane; unlit it was the
   same flat grey a metre from the lamp as thirty metres down a side branch.
   Now the void immediately around the ship glows and the far end of the branch
   is black, which reads as the light travelling down the tunnel. */
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 400),
  applyLightUnlit(new THREE.MeshBasicMaterial({ color: 0x1a1c22 }))
);
/* Moved back from -1.4 to make room for the parallax layers, which have to
   sit BEHIND the drifting dust (z -0.7 to -1.3) and IN FRONT of this. At -1.4
   there was a tenth of a unit to work with; the first attempt put them behind
   this plane, which is opaque, and they rendered perfectly into nothing. */
backdrop.position.set(0, 0.5 - 200, -3.2);
scene.add(backdrop);

/* Light in the air, between the parallax layers and the terrain. Added here
   rather than in lightmap.ts so the module that owns the light field stays
   free of the scene graph. */
scene.add(haze);

/* Decay 1.75, not 1.25. The pool has a hard edge now instead of trailing off
   across half the frame, which is the whole reason the tight framing reads as
   "this is as far as the light reaches" rather than as a close camera. */
/* The ship renders on its own layer, and the point of that is which light does
   NOT reach it.

   The lamp is a point light sitting on the ship, so the ship was roughly four
   times closer to it than the rock it was lighting. Whatever colour its hull
   was painted, it arrived saturated: a dark gunmetal body rendered as a white
   blob. Worse, its brightness moved with `S.light()` - buying a Scanner level
   changed how the SHIP looked, which is a gameplay upgrade reaching into art
   direction by accident.

   The ship is lit by the world's ambient, sun and rim, plus one small key light
   of its own that travels with it. It therefore looks the same at ten metres
   and at ninety, which is what lets its material read as metal at all. */
export const SHIP_LAYER = 1;

export const lamp = new THREE.PointLight(0xffd9a0, LAMP_INTENSITY, S.light(), LAMP_DECAY);
scene.add(lamp);
/* Draw the world, then draw the ship with the lamp switched off.

   THE LAYER ON ITS OWN DOES NOTHING, and that was wrong in this file for three
   versions. `Object3D.layers` decides what a CAMERA draws. It does not decide
   which lights reach which object - three collects the scene's lights once and
   every lit material gets all of them - so putting the ship on its own layer
   and leaving the lamp off that layer excluded exactly nothing. The lamp is a
   point light of intensity 44 sitting on the ship, and it had been lighting it
   the whole time.

   Measured rather than argued: the ship's mean pixel brightness is 199 of 255
   with the lamp on and 72 with it off, at the same depth, with everything else
   unchanged. That is the entire reason the hull rendered white no matter what
   colour it was painted - and why darkening it three times in a row did
   nothing at all.

   Two passes is what actually excludes it. The world pass draws everything but
   the ship; the ship pass draws only the ship, with the lamp momentarily at
   zero. `autoClear` is off for the second so the depth buffer survives and the
   ship still sorts against the terrain correctly. It costs no extra draw calls
   - the same objects are drawn, just split across two passes - and it makes
   the comment above finally true. */
/* Two render calls, one frame's worth of statistics.

   `renderer.info` resets itself at the start of every render() by default, so
   with two passes the draw-call count left behind is the SHIP pass - about
   thirty of a hundred and fifty. The e2e budget guard reads exactly that
   number, so it would have gone on passing while measuring a fifth of the
   frame: a safety net that reports success is worse than no safety net. Reset
   once, by hand, at the top of the frame instead. */
renderer.info.autoReset = false;

export function renderWorld() {
  renderer.info.reset();
  camera.layers.disable(SHIP_LAYER);
  renderer.render(scene, camera);

  const held = lamp.intensity;
  lamp.intensity = 0;
  camera.layers.set(SHIP_LAYER);
  renderer.autoClear = false;
  renderer.render(scene, camera);
  renderer.autoClear = true;
  lamp.intensity = held;

  camera.layers.set(0);
  camera.layers.enable(SHIP_LAYER);
}

/* Ambient and rim reach the ship. The SUN deliberately does not.

   A directional light at intensity 1.0 is what daylight is, and the ship spends
   its life in a hole. Leaving it on the ship layer meant that at twenty metres
   - where the sun has barely started to fade - the hull was being lit by a
   light source that is not physically anywhere near it, and it flattened into
   a bright card against dark rock. Underground there is no sun; above ground
   the ambient is 1.30 and carries the ship on its own. */
amb.layers.enable(SHIP_LAYER);
rim.layers.enable(SHIP_LAYER);
camera.layers.enable(SHIP_LAYER);

/* The ship's own key, and it is now a tenth of what it was.

   Playtest: *"the ship is very bright. I want it to look more like light is
   coming from the ship, rather than being shined on the ship."* Exactly right,
   and measurable: the hull is dark gunmetal and it was rendering at 255,255,246
   - pure white. Not diffuse, which the maths puts at about 0.13; SPECULAR. A
   point light sitting half a unit off a metal panel with middling roughness
   puts the whole face inside one highlight, and the ship became a lamp-shaped
   hole in the picture regardless of what colour it was painted.

   So the key is now barely a key - just enough that the facets are not flat -
   and the ship's brightness comes from its own emissive fittings instead: the
   canopy, the running lights and the lamp housings in ship.ts. Those do not
   answer to any light in the scene, which is the whole point. A machine in the
   dark is a dark shape with lit windows. */
export const shipKey = new THREE.PointLight(0xffd7b0, 0.85, 3.4, 1.1);
shipKey.layers.set(SHIP_LAYER);
scene.add(shipKey);

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  /* Rows framed vertically. Portrait aspect is about 0.46, so this also decides
     how many columns are visible - 18 rows shows roughly 8 columns. Raising it
     is what makes the world feel large: the ship shrinks against the terrain and
     more of the shaft is legible at once. Affordable because terrain is
     instanced; before Stage 2 this would have been ~300 draw calls. */
  const rows = 18, halfV = Math.tan((camera.fov * Math.PI) / 360);
  let z = rows / (2 * halfV);
  const needW = (W + 2) / camera.aspect;
  if (needW < rows) z = Math.max(9, needW / (2 * halfV));
  R.camZ = z;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
