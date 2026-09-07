import * as THREE from 'three';
import { W, relicAt, RELIC_COLOR } from './config';
import { g, S } from './state';
import { scene } from './scene';
import { worldX } from './materials';

/* The relic finder.

   A relic is one cell on a whole planet and nothing marks it, which on its own
   is not a secret - it is a lottery. This is what turns looking for one into
   something you can be good at: within range, a small mote drifts off the ship
   in the relic's direction and brightens as you close.

   The range is the Scanner's lamp radius. That gives the Scanner a third job
   after light and framing, and it is the one that makes it worth maxing: the
   difference between a 8 m and a 30 m search radius is the difference between
   finding a relic by luck and finding it on purpose. */

const mote = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.16, 0),
  new THREE.MeshBasicMaterial({
    color: RELIC_COLOR, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
mote.renderOrder = 3;
mote.visible = false;
scene.add(mote);

const halo = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 1.5),
  new THREE.MeshBasicMaterial({
    color: 0xffbdff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
halo.renderOrder = 2;
halo.visible = false;
scene.add(halo);

let spin = 0;

export function aimRelic() {
  const found = g.relicsTaken.includes(g.planet);
  const r = relicAt(g.planet);
  const dx = r.x - g.px, dy = -r.d - -g.pd;
  const dist = Math.hypot(dx, dy);
  const range = S.light();

  if (found || dist > range || dist < 0.6 || g.pd < 0) {
    mote.visible = false;
    halo.visible = false;
    return;
  }

  /* Closer is brighter, and it sits a fixed short distance from the ship so it
     reads as a bearing rather than as an object floating in the rock. */
  const near = 1 - dist / range;
  const k = Math.min(1, dx / dist), ky = dy / dist;
  const ox = worldX(g.px) + k * 1.25;
  const oy = -g.pd + ky * 1.25;

  spin += 0.05;
  mote.position.set(ox, oy, 0.68);
  mote.rotation.set(spin, spin * 1.3, 0);
  mote.visible = true;
  (mote.material as THREE.MeshBasicMaterial).opacity = 0.25 + near * 0.7;

  halo.position.set(ox, oy, 0.66);
  halo.scale.setScalar(0.6 + near * 0.7);
  halo.visible = true;
  (halo.material as THREE.MeshBasicMaterial).opacity = 0.05 + near * 0.22;
}

/* How far off the relic is, for the pause menu. Returns null once found. */
export function relicDistance(): number | null {
  if (g.relicsTaken.includes(g.planet)) return null;
  const r = relicAt(g.planet);
  return Math.round(Math.hypot(r.x - g.px, r.d - g.pd));
}

export const RELIC_COLS = W;
