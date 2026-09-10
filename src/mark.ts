import * as THREE from 'three';
import { W } from './sim/config';
import { scene } from './scene';

/* The deepest-reach marker.

   A faint line drawn across the world at the depth you had reached before this
   run started. Descending past it is the one moment in a descent that is
   purely yours - the core is a fixed target the game set, and this is the
   target you set.

   It is frozen at the record you HAD when you left the pad rather than
   following g.best.depth, which updates live. A line that retreats ahead of
   you as you dig is not a line you can cross.

   Two draw calls: the rule itself and a soft bloom under it. Both additive and
   depth-write-free, so they read as light on the rock rather than as an object
   embedded in it. */

const mark = new THREE.Group();

const rule = new THREE.Mesh(
  new THREE.PlaneGeometry(W + 2, 0.045),
  new THREE.MeshBasicMaterial({
    color: 0x8fe8ff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
rule.position.z = 0.62;
mark.add(rule);

const bloom = new THREE.Mesh(
  new THREE.PlaneGeometry(W + 2, 0.85),
  new THREE.MeshBasicMaterial({
    color: 0x3fb4ff, transparent: true, opacity: 0.09,
    blending: THREE.AdditiveBlending, depthWrite: false
  })
);
bloom.position.z = 0.6;
mark.add(bloom);

mark.renderOrder = 3;
mark.visible = false;
scene.add(mark);

/* Where the line sits for this run, and whether it has been crossed yet. Zero
   means there is no record to beat, so nothing is drawn. */
let at = 0;
let crossed = false;

export function setMark(depth: number) {
  at = depth;
  crossed = false;
  mark.visible = depth > 0;
  mark.position.y = -depth;
}

/* Returns the depth of the line, once, on the frame the ship first passes it,
   and 0 otherwise. Returning the line's own depth rather than a boolean is
   what lets the caller say "deeper than 62 m" - the ship's depth at that
   instant is 62-point-something, so reporting it would announce the record as
   the number it just beat.

   Latched here rather than at the call site, because the caller is a frame
   loop and "remember to reset this" is how a one-shot becomes a spam. */
export function crossedMark(pd: number) {
  if (!at || crossed || pd <= at) return 0;
  crossed = true;
  return at;
}

/* Fade the line out once it is behind you: it has said what it had to say, and
   leaving it at full strength turns a moment into scenery. */
export function fadeMark(pd: number) {
  if (!mark.visible) return;
  const past = Math.max(0, pd - at);
  const k = Math.max(0, 1 - past / 14);
  (rule.material as THREE.MeshBasicMaterial).opacity = 0.5 * (crossed ? k : 1);
  (bloom.material as THREE.MeshBasicMaterial).opacity = 0.09 * (crossed ? k : 1);
  if (crossed && k <= 0) mark.visible = false;
}
