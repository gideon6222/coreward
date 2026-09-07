import * as THREE from 'three';
import { W } from './config';
import { key } from './util';
import { g } from './state';
import { rnd, blockAt } from './world';
import { scene } from './scene';
import { mat, shade, makeGlow, worldX, boxGeo, pebbleGeo, shardGeo } from './materials';
import type { Block } from './types';

export const oreGlows: THREE.Group[] = [];

export function makeBlock(x: number, d: number, b: Block) {
  const jit = 0.84 + rnd(x + 77, d + 31, g.planet) * 0.3;
  if (!b.ore) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(boxGeo, mat(shade(b.color, jit), b.glow));
    m.rotation.set(
      (rnd(x + 2, d + 8, g.planet) - 0.5) * 0.09,
      (rnd(x + 4, d + 3, g.planet) - 0.5) * 0.09,
      (rnd(x + 5, d + 9, g.planet) - 0.5) * 0.09
    );
    grp.add(m);
    if (rnd(x + 61, d + 17, g.planet) > 0.66) {
      const p = new THREE.Mesh(pebbleGeo, mat(shade(b.color, jit * 1.22), b.glow));
      const r1 = rnd(x + 12, d + 44, g.planet), r2 = rnd(x + 31, d + 6, g.planet);
      p.position.set((r1 - 0.5) * 0.6, (r2 - 0.5) * 0.6, 0.44);
      p.rotation.set(r1 * 3, r2 * 3, r1 * 2);
      grp.add(p);
    }
    return grp;
  }
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(boxGeo, mat(shade(b.host || 0x333038, jit), 0.02)));
  const n = b.shards || 5;
  const sm = mat(b.color, b.glow, false);   /* crystals stay ungrained */
  for (let i = 0; i < n; i++) {
    const r1 = rnd(x * 13 + i, d * 7 + i * 3, g.planet);
    const r2 = rnd(x * 3 + i * 5, d * 17 + i, g.planet + 11);
    const r3 = rnd(x + i * 29, d + i * 13, g.planet + 23);
    const s = 0.12 + r3 * 0.14;
    const sh = new THREE.Mesh(shardGeo, sm);
    sh.scale.set(s, s * (1.4 + r1 * 1.3), s);
    sh.position.set((r1 - 0.5) * 0.7, (r2 - 0.5) * 0.7, 0.33 + r3 * 0.18);
    sh.rotation.set(r1 * 3.14, r2 * 3.14, r3 * 3.14);
    grp.add(sh);
    if (i < 2) {
      const back = sh.clone();
      back.position.z = -0.33 - r3 * 0.18;
      grp.add(back);
    }
  }
  const halo = makeGlow(b.color, 1.5 + (b.tone || 1) * 0.11, 0.5);
  halo.position.z = 0.55;
  grp.add(halo);
  grp.userData.halo = halo;
  grp.userData.phase = rnd(x + 3, d + 91, g.planet) * 6.28;
  grp.userData.baseScale = halo.scale.x;
  oreGlows.push(grp);
  return grp;
}

export const meshes = new Map<string, THREE.Group>();
let lastRow: number | null = null;
/* hardReset() used to assign lastRow directly when it lived in the same file */
export function resetBlockCache() { lastRow = null; }
export function dropBlock(k: string) {
  const o = meshes.get(k);
  if (!o) return;
  const i = oreGlows.indexOf(o);
  if (i >= 0) oreGlows.splice(i, 1);
  scene.remove(o);
  meshes.delete(k);
}
export function syncBlocks(force?: boolean) {
  const row = Math.floor(g.pd);
  if (!force && row === lastRow) return;
  lastRow = row;
  const d0 = Math.max(0, row - 9), d1 = row + 11;
  const need = new Set();
  for (let d = d0; d <= d1; d++) {
    for (let x = 0; x < W; x++) {
      const b = blockAt(x, d);
      if (!b) continue;
      const k = key(x, d);
      need.add(k);
      if (!meshes.has(k)) {
        const o = makeBlock(x, d, b);
        o.position.set(worldX(x), -d, 0);
        scene.add(o);
        meshes.set(k, o);
      }
    }
  }
  const stale = [];
  for (const k of meshes.keys()) if (!need.has(k)) stale.push(k);
  for (const k of stale) dropBlock(k);
}
