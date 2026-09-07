import * as THREE from 'three';
import { scene } from './scene';
import { worldX } from './materials';

/* The laser's visible cut.

   A single stretched additive quad that flashes along the line and fades in
   about a fifth of a second. It exists because the laser's effect - a row of
   blocks quietly ceasing to exist - has no direction to it: without the beam
   you see the result and never the act, and a tap that removes seven cells
   with no travel reads as a bug rather than a shot. */

const mat = new THREE.MeshBasicMaterial({
  color: 0xbdf2ff, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false
});
const beam = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
beam.position.z = 0.66;
beam.renderOrder = 3;
beam.visible = false;
scene.add(beam);

let life = 0;

export function fireBeam(sx: number, sd: number, vx: number, vy: number, len: number) {
  /* centre it on the middle of the cut rather than on the ship, so it covers
     exactly the cells that were taken */
  const cx = worldX(sx) + vx * (len + 1) / 2;
  const cy = -(sd + vy * (len + 1) / 2);
  beam.position.set(cx, cy, 0.66);
  beam.rotation.z = vx !== 0 ? Math.PI / 2 : 0;
  beam.scale.set(0.42, len + 0.6, 1);
  beam.visible = true;
  life = 0.22;
}

export function stepBeam(dt: number) {
  if (!beam.visible) return;
  life -= dt;
  if (life <= 0) { beam.visible = false; mat.opacity = 0; return; }
  /* bright at the instant of the shot, gone almost at once */
  mat.opacity = Math.min(1, life / 0.22) * 0.85;
}
