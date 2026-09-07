import * as THREE from 'three';
import { W } from './config';

export const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

/* soft additive halo sprite, the cheap stand-in for bloom */
const glowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.42)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad;
  x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const glowMats = new Map();
function glowMat(color, opacity) {
  const k = color + '|' + opacity;
  if (!glowMats.has(k)) {
    glowMats.set(k, new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: opacity,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
  }
  return glowMats.get(k);
}
export function makeGlow(color, size, opacity) {
  const s = new THREE.Sprite(glowMat(color, opacity === undefined ? 0.85 : opacity));
  s.scale.set(size, size, 1);
  return s;
}

export const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
export const pebbleGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
export const shardGeo = new THREE.OctahedronGeometry(1, 0);
export const crackGeo = new THREE.BoxGeometry(1, 0.045, 0.045);
export const crackMat = new THREE.MeshBasicMaterial({ color: 0x08080c });

const matCache = new Map();
export function mat(color, glow) {
  const k = color + '|' + (glow || 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02), flatShading: true
    }));
  }
  return matCache.get(k);
}
export const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
export const worldX = (x) => x - (W - 1) / 2;
