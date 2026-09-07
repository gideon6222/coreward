import * as THREE from 'three';
import { sfx, audioInit, setAudio, audioState, setDepth } from './audio.js';

/* ============ config ============ */
const W = 9;
const SAVE_KEY = 'coreward.v2';
const OLD_KEY = 'coreward.v1';
const HULL_MAX = 100;
const DIG_BASE = 0.5;

const PLANET_NAMES = ['Verdax', 'Rustmoor', 'Cryon', 'Ashvault', 'Kryllon', 'Tessivar'];
const SKY_HI = [0x0d2b52, 0x4a1d10, 0x0c3a44, 0x2a0f36, 0x101440, 0x0c331f];
const SKY_LO = [0x5aa8dd, 0xe08a45, 0x54d4d8, 0xa055b8, 0x5560c8, 0x4fbf78];

const planetName = (i) => {
  const base = PLANET_NAMES[i % PLANET_NAMES.length];
  const cyc = Math.floor(i / PLANET_NAMES.length);
  return cyc ? base + ' ' + (cyc + 1) : base;
};
const skyHi = (i) => SKY_HI[i % SKY_HI.length];
const skyLo = (i) => SKY_LO[i % SKY_LO.length];
const coreDepth = (p) => 110 + p * 35;
const hardMult = (p) => 1 + p * 0.28;
const valueMult = (p) => 1 + p * 0.6;

const ORES = [
  { id: 'coreite',  name: 'Coreite',  color: 0x66fff0, host: 0x2a2f3a, hard: 16,  wt: 16,  value: 22000, min: 185, chance: 0.030, glow: 0.60, shards: 7, tone: 9 },
  { id: 'magmite',  name: 'Magmite',  color: 0xff7a18, host: 0x2e2228, hard: 13,  wt: 13,  value: 9000,  min: 145, chance: 0.038, glow: 0.50, shards: 6, tone: 8 },
  { id: 'ruby',     name: 'Ruby',     color: 0xff3b5c, host: 0x33303a, hard: 10,  wt: 10,  value: 3600,  min: 105, chance: 0.042, glow: 0.32, shards: 6, tone: 7 },
  { id: 'emerald',  name: 'Emerald',  color: 0x2fd07a, host: 0x2f3a38, hard: 8.5, wt: 8.5, value: 1800,  min: 78,  chance: 0.048, glow: 0.30, shards: 5, tone: 6 },
  { id: 'amethyst', name: 'Amethyst', color: 0xa060ff, host: 0x35323f, hard: 7,   wt: 7,   value: 900,   min: 56,  chance: 0.055, glow: 0.28, shards: 5, tone: 5 },
  { id: 'gold',     name: 'Gold',     color: 0xffcf47, host: 0x3d3a34, hard: 5.5, wt: 9,   value: 420,   min: 36,  chance: 0.060, glow: 0.20, shards: 5, tone: 4 },
  { id: 'silver',   name: 'Silver',   color: 0xd8e0e8, host: 0x3a3c40, hard: 4.5, wt: 6,   value: 150,   min: 22,  chance: 0.070, glow: 0.16, shards: 4, tone: 3 },
  { id: 'iron',     name: 'Iron',     color: 0xb0b6bd, host: 0x3a3630, hard: 3.5, wt: 4.5, value: 60,    min: 11,  chance: 0.085, glow: 0.10, shards: 4, tone: 2 },
  { id: 'copper',   name: 'Copper',   color: 0xc87137, host: 0x3c342c, hard: 2.6, wt: 3.5, value: 25,    min: 4,   chance: 0.100, glow: 0.10, shards: 4, tone: 1 }
];

const ROCKS = [
  { id: 'dirt',    name: 'Dirt',    color: 0x6b4b2a, hard: 1,   wt: 0.4, value: 1,  glow: 0.02 },
  { id: 'stone',   name: 'Stone',   color: 0x807a72, hard: 2.4, wt: 0.9, value: 3,  glow: 0.02 },
  { id: 'granite', name: 'Granite', color: 0x5e5a66, hard: 5,   wt: 1.8, value: 9,  glow: 0.02 },
  { id: 'basalt',  name: 'Basalt',  color: 0x3a3540, hard: 9,   wt: 2.8, value: 22, glow: 0.03 }
];
const baseRock = (d) => (d < 10 ? ROCKS[0] : d < 60 ? ROCKS[1] : d < 130 ? ROCKS[2] : ROCKS[3]);

const DEF = {};
for (const o of ORES) DEF[o.id] = o;
for (const r of ROCKS) DEF[r.id] = r;

const UPGRADES = [
  { key: 'drill',  name: 'Drill Bit',     base: 130, mul: 2.00, max: 9,
    tiers: ['Steel', 'Tungsten', 'Carbide', 'Diamond', 'Ionized', 'Plasma', 'Graviton', 'Singularity', 'Starbreaker', 'Godcore'],
    effect: (l) => 'Power ' + (1 + l * 0.95).toFixed(2) + 'x' },
  { key: 'cargo',  name: 'Cargo Hold',    base: 110, mul: 2.00, max: 9,
    effect: (l) => (60 + l * 45) + ' kg' },
  { key: 'thrust', name: 'Thrusters',     base: 100, mul: 1.95, max: 9,
    effect: (l) => (3.0 + l * 0.7).toFixed(1) + ' cells/s' },
  { key: 'tank',   name: 'Fuel Tank',     base: 200, mul: 2.10, max: 9,
    effect: (l) => (90 + l * 40) + ' fuel' },
  { key: 'cool',   name: 'Cooling Rig',   base: 300, mul: 2.15, max: 9,
    effect: (l) => Math.round(Math.min(0.9, l * 0.1) * 100) + '% heat shield' },
  { key: 'scan',   name: 'Scanner Array', base: 140, mul: 1.90, max: 9,
    effect: (l) => (8 + l * 2.4).toFixed(0) + 'm light' },
  { key: 'tow',    name: 'Tow Insurance', base: 180, mul: 2.00, max: 8,
    effect: (l) => 'Tow takes ' + Math.round(Math.max(0.1, 0.5 - l * 0.05) * 100) + '% of haul' },
  { key: 'auto',   name: 'Autopilot',     base: 900, mul: 2.20, max: 6,
    effect: (l) => (l === 0 ? 'Not installed' : (0.55 - (l - 1) * 0.075).toFixed(2) + ' fuel per metre') }
];
const costOf = (u, lvl) => Math.round(u.base * Math.pow(u.mul, lvl));

const START_X = Math.floor(W / 2);

/* ============ state ============ */
const g = {
  planet: 0, credits: 0, shards: 0,
  up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 },
  dug: new Set(),
  px: START_X, pd: -1,
  face: 'down',
  fuel: 90, hull: HULL_MAX,
  cargo: {}, weight: 0,
  mode: 'play'
};

const S = {
  drill: () => (1 + g.up.drill * 0.95) * (1 + g.shards * 0.08),
  cargoCap: () => 60 + g.up.cargo * 45,
  speed: () => 3.0 + g.up.thrust * 0.7,
  fuelCap: () => 90 + g.up.tank * 40,
  shield: () => Math.min(0.9, g.up.cool * 0.1),
  light: () => 8 + g.up.scan * 2.4,
  towCut: () => Math.max(0.1, 0.5 - g.up.tow * 0.05),
  autoRate: () => (g.up.auto === 0 ? 0 : 0.55 - (g.up.auto - 1) * 0.075)
};

const key = (x, d) => x + ',' + d;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

function rnd(x, y, p) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(p | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function blockAt(x, d) {
  if (d < 0 || x < 0 || x >= W) return null;
  if (g.dug.has(key(x, d))) return null;
  const cd = coreDepth(g.planet);
  if (d > cd) return { id: 'bedrock', name: 'Bedrock', color: 0x1a1820, hard: Infinity, wt: 0, value: 0, glow: 0.02 };
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, host: 0x4a3a20, hard: 26 * hardMult(g.planet), wt: 0, value: 0, glow: 0.9, shards: 8, tone: 10, ore: true, core: true };
  const hm = hardMult(g.planet);
  const r = rnd(x, d, g.planet);
  for (const o of ORES) {
    if (d >= o.min && r < o.chance) {
      return { id: o.id, name: o.name, color: o.color, host: o.host, glow: o.glow, shards: o.shards, tone: o.tone,
               hard: o.hard * hm, wt: o.wt, value: o.value, ore: true };
    }
  }
  const b = baseRock(d);
  return { id: b.id, name: b.name, color: b.color, glow: b.glow, hard: b.hard * hm, wt: b.wt, value: b.value, ore: false };
}

const haulValue = () => {
  let v = 0;
  for (const k in g.cargo) v += g.cargo[k] * DEF[k].value;
  return Math.round(v * valueMult(g.planet));
};

/* shortest route home through already dug tunnels, breadth first */
function findRoute() {
  const sx = Math.round(g.px), sd = Math.round(g.pd);
  const goal = key(START_X, -1);
  const start = key(sx, sd);
  if (start === goal) return null;
  const prev = new Map();
  const seen = new Set([start]);
  let queue = [[sx, sd]];
  let found = false;
  let guard = 0;
  while (queue.length && !found && guard < 40000) {
    const next = [];
    for (const cell of queue) {
      const cx = cell[0], cd = cell[1];
      const around = [[cx, cd - 1], [cx - 1, cd], [cx + 1, cd], [cx, cd + 1]];
      for (const n of around) {
        guard++;
        const nx = n[0], nd = n[1];
        if (nx < 0 || nx >= W || nd < -3 || nd > coreDepth(g.planet)) continue;
        const k = key(nx, nd);
        if (seen.has(k)) continue;
        if (blockAt(nx, nd)) continue;
        seen.add(k);
        prev.set(k, cell);
        if (k === goal) { found = true; break; }
        next.push(n);
      }
      if (found) break;
    }
    queue = next;
  }
  if (!found) return null;
  const route = [];
  let cur = [START_X, -1];
  while (cur) {
    route.push(cur);
    const p = prev.get(key(cur[0], cur[1]));
    if (!p) break;
    cur = p;
  }
  route.reverse();
  return route.length > 1 ? route : null;
}

/* audio lives in audio.js so it can be tuned without touching the game */

/* ============ three ============ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const gameEl = document.getElementById('game');
gameEl.appendChild(renderer.domElement);

scene.fog = new THREE.FogExp2(0x05070d, 0.028);

const amb = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff0d8, 1.5);
sun.position.set(5, 12, 8);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x4a7ad0, 0.5);
rim.position.set(-6, -3, -6);
scene.add(rim);
const lamp = new THREE.PointLight(0xffd9a0, 30, S.light(), 1.25);
scene.add(lamp);

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
function makeGlow(color, size, opacity) {
  const s = new THREE.Sprite(glowMat(color, opacity === undefined ? 0.85 : opacity));
  s.scale.set(size, size, 1);
  return s;
}

const boxGeo = new THREE.BoxGeometry(0.97, 0.97, 0.97);
const pebbleGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const shardGeo = new THREE.OctahedronGeometry(1, 0);
const crackGeo = new THREE.BoxGeometry(1, 0.045, 0.045);
const crackMat = new THREE.MeshBasicMaterial({ color: 0x08080c });

const matCache = new Map();
function mat(color, glow) {
  const k = color + '|' + (glow || 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({
      color: color, emissive: new THREE.Color(color).multiplyScalar(glow || 0.02), flatShading: true
    }));
  }
  return matCache.get(k);
}
const shade = (hex, f) => new THREE.Color(hex).multiplyScalar(f).getHex();
const worldX = (x) => x - (W - 1) / 2;

const oreGlows = [];

function makeBlock(x, d, b) {
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
  const sm = mat(b.color, b.glow);
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

/* ============ particles ============ */
const PMAX = 700;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
const pCol = new Float32Array(PMAX * 3);
const pVel = [];
const pLife = new Float32Array(PMAX);
for (let i = 0; i < PMAX; i++) { pPos[i * 3 + 1] = 9999; pVel.push(new THREE.Vector3()); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.17, vertexColors: true, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false
}));
pts.frustumCulled = false;
scene.add(pts);
let pHead = 0;

function spray(x, y, color, count, power, life) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const k = pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = x + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 2] = 0.4 + Math.random() * 0.5;
    const f = 0.7 + Math.random() * 0.5;
    pCol[k * 3] = c.r * f; pCol[k * 3 + 1] = c.g * f; pCol[k * 3 + 2] = c.b * f;
    const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI - Math.PI / 2;
    const s = power * (0.4 + Math.random() * 0.9);
    pVel[k].set(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + power * 0.3, Math.sin(a) * Math.cos(e) * s * 0.5);
    pLife[k] = life * (0.6 + Math.random() * 0.6);
  }
}

function stepParticles(dt) {
  let live = false;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    live = true;
    pLife[i] -= dt;
    pVel[i].y -= 14 * dt;
    pPos[i * 3] += pVel[i].x * dt;
    pPos[i * 3 + 1] += pVel[i].y * dt;
    pPos[i * 3 + 2] += pVel[i].z * dt;
    if (pLife[i] <= 0) pPos[i * 3 + 1] = 9999;
  }
  if (live) pGeo.attributes.position.needsUpdate = true;
}

/* drifting dust underground */
const DMAX = 140;
const dGeo = new THREE.BufferGeometry();
const dPos = new Float32Array(DMAX * 3);
for (let i = 0; i < DMAX; i++) {
  dPos[i * 3] = (Math.random() - 0.5) * 14;
  dPos[i * 3 + 1] = (Math.random() - 0.5) * 16;
  dPos[i * 3 + 2] = Math.random() * 2;
}
dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
const dustMat = new THREE.PointsMaterial({ size: 0.07, color: 0xc8b89a, transparent: true, opacity: 0, depthWrite: false });
const dust = new THREE.Points(dGeo, dustMat);
dust.frustumCulled = false;
scene.add(dust);

/* stars and a distant sun, surface only */
const sGeo = new THREE.BufferGeometry();
const sPos = new Float32Array(260 * 3);
for (let i = 0; i < 260; i++) {
  sPos[i * 3] = (Math.random() - 0.5) * 90;
  sPos[i * 3 + 1] = 6 + Math.random() * 60;
  sPos[i * 3 + 2] = -30 - Math.random() * 30;
}
sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
const starMat = new THREE.PointsMaterial({ size: 0.35, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false });
const stars = new THREE.Points(sGeo, starMat);
stars.frustumCulled = false;
scene.add(stars);

const sunSprite = makeGlow(0xffd9a0, 16, 0.5);
sunSprite.position.set(-14, 24, -28);
scene.add(sunSprite);

/* ============ ship ============ */
const player = new THREE.Group();
const rig = new THREE.Group();
player.add(rig);

const hullMat = new THREE.MeshLambertMaterial({ color: 0x3aa8d8, emissive: 0x0a2a3a, flatShading: true });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xe8eef8, emissive: 0x1a2230, flatShading: true });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x28303c, flatShading: true });

const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.66, 6), hullMat);
rig.add(hull);
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 6), trimMat);
collar.position.y = -0.3;
rig.add(collar);
for (const sx of [-0.36, 0.36]) {
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.44, 6), darkMat);
  pod.position.set(sx, 0.06, 0);
  rig.add(pod);
}
const bit = new THREE.Mesh(new THREE.ConeGeometry(0.23, 0.5, 8), trimMat);
bit.position.y = -0.56;
bit.rotation.x = Math.PI;
rig.add(bit);
const cab = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xa07a10 }));
cab.position.set(0, 0.1, 0.3);
rig.add(cab);
const cabGlow = makeGlow(0xffe9a0, 1.1, 0.7);
cabGlow.position.set(0, 0.1, 0.42);
rig.add(cabGlow);

const flames = [];
for (const sx of [-0.36, 0.36]) {
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.34, 6), new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 }));
  fl.position.set(sx, 0.42, 0);
  rig.add(fl);
  const fg = makeGlow(0x7ad4ff, 0.9, 0.9);
  fg.position.set(sx, 0.5, 0);
  rig.add(fg);
  flames.push({ cone: fl, glow: fg });
}
scene.add(player);
const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };

/* ============ landing pad ============ */
const pad = new THREE.Group();
const slab = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 1.5), new THREE.MeshLambertMaterial({ color: 0x3d4753, emissive: 0x0c1016, flatShading: true }));
slab.position.y = 0.62;
pad.add(slab);
const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 1.0), new THREE.MeshLambertMaterial({ color: 0x59646f, emissive: 0x12181f, flatShading: true }));
deck.position.y = 0.75;
pad.add(deck);
for (const sx of [-1.7, 1.7]) {
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.0, 6), darkMat);
  leg.position.set(sx, 0.1, 0);
  pad.add(leg);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 6), new THREE.MeshLambertMaterial({ color: 0x5b6672, flatShading: true }));
  mast.position.set(sx, 1.5, 0);
  pad.add(mast);
}
const arch = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: 0x4a545f, emissive: 0x101820, flatShading: true }));
arch.position.y = 2.28;
pad.add(arch);

const padLights = [];
for (let i = 0; i < 6; i++) {
  const sx = -1.5 + i * 0.6;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0x66ffcc }));
  bulb.position.set(sx, 0.82, 0.52);
  pad.add(bulb);
  const gl = makeGlow(0x55ffcc, 0.7, 0.8);
  gl.position.set(sx, 0.82, 0.62);
  pad.add(gl);
  padLights.push(gl);
}
const beam = new THREE.Mesh(
  new THREE.CylinderGeometry(1.3, 0.9, 3.4, 12, 1, true),
  new THREE.MeshBasicMaterial({ color: 0x49e0c0, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
);
beam.position.y = 2.4;
pad.add(beam);
pad.position.x = worldX(START_X);
scene.add(pad);

/* ============ world meshes ============ */
const meshes = new Map();
let lastRow = null;
function dropBlock(k) {
  const o = meshes.get(k);
  if (!o) return;
  const i = oreGlows.indexOf(o);
  if (i >= 0) oreGlows.splice(i, 1);
  scene.remove(o);
  meshes.delete(k);
}
function syncBlocks(force?) {
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

/* ============ ui ============ */
const el = (id) => document.getElementById(id);
const ui = {
  planet: el('planet'), credits: el('credits'), haul: el('haul'), depth: el('depth'),
  fuel: el('fuelBar'), hull: el('hullBar'), cargoBar: el('cargoBar'), cargoTxt: el('cargoTxt'),
  toast: el('toast'), shop: el('shop'), shopCredits: el('shopCredits'), upgrades: el('upgrades'),
  event: el('event'), evTitle: el('evTitle'), evBody: el('evBody'), evBtn: el('evBtn'),
  manifest: el('manifest'), manifestRows: el('manifestRows'), manifestTotal: el('manifestTotal'),
  pause: el('pause'), pauseStats: el('pauseStats'), btnReset: el('btnReset'),
  btnMusic: el('btnMusic'), btnSfx: el('btnSfx'), heat: el('heat'),
  flash: el('flash'), btnShop: el('btnShop'), btnAuto: el('btnAuto')
};

let toastT = 0;
function toast(msg) { ui.toast.textContent = msg; ui.toast.style.opacity = '1'; toastT = 2.0; }
function flash(color, ms) {
  ui.flash.style.background = color;
  ui.flash.style.opacity = '1';
  setTimeout(() => { ui.flash.style.opacity = '0'; }, ms || 220);
}
const atSurface = () => g.pd <= -0.6;

function updateHUD() {
  ui.planet.textContent = planetName(g.planet);
  ui.credits.textContent = Math.floor(g.credits).toLocaleString();
  ui.haul.textContent = haulValue().toLocaleString();
  ui.depth.textContent = 'DEPTH ' + Math.max(0, Math.round(g.pd)) + ' m   /   CORE ' + coreDepth(g.planet) + ' m';
  ui.fuel.style.width = clamp(g.fuel / S.fuelCap(), 0, 1) * 100 + '%';
  ui.hull.style.width = clamp(g.hull / HULL_MAX, 0, 1) * 100 + '%';
  ui.cargoBar.style.width = clamp(g.weight / S.cargoCap(), 0, 1) * 100 + '%';
  ui.cargoTxt.textContent = g.weight.toFixed(1) + ' / ' + S.cargoCap() + ' KG';
  ui.btnShop.style.display = atSurface() && g.mode === 'play' ? '' : 'none';
  if (g.up.auto > 0 && !atSurface() && g.mode === 'play') {
    ui.btnAuto.style.display = '';
    ui.btnAuto.textContent = 'AUTOPILOT  ' + Math.ceil(g.pd * S.autoRate()) + ' FUEL';
  } else {
    ui.btnAuto.style.display = 'none';
  }
  const danger = clamp((45 - g.hull) / 45, 0, 1);
  ui.heat.style.opacity = String(danger * (0.35 + 0.25 * Math.sin(performance.now() / 180)));
}

function buildManifest() {
  ui.manifestRows.innerHTML = '';
  const vm = valueMult(g.planet);
  const rows = Object.keys(g.cargo).filter((k) => g.cargo[k] > 0)
    .sort((a, b) => g.cargo[b] * DEF[b].value - g.cargo[a] * DEF[a].value);
  if (!rows.length) {
    ui.manifestRows.innerHTML = '<div class="upeff" style="padding:12px 0">Hold empty. Go find a deposit.</div>';
  }
  for (const k of rows) {
    const o = DEF[k], n = g.cargo[k];
    const row = document.createElement('div');
    row.className = 'up';
    row.innerHTML =
      '<span class="dot" style="background:#' + o.color.toString(16).padStart(6, '0') + '"></span>' +
      '<div class="upinfo"><div class="upname">' + o.name + ' <span class="mult">x' + n + '</span></div>' +
      '<div class="upeff">' + (n * o.wt).toFixed(1) + ' kg · ' + Math.round(o.value * vm).toLocaleString() + ' each</div></div>' +
      '<div class="val">◈ ' + Math.round(n * o.value * vm).toLocaleString() + '</div>';
    ui.manifestRows.appendChild(row);
  }
  ui.manifestTotal.textContent = '◈ ' + haulValue().toLocaleString();
}

function buildShop() {
  ui.shopCredits.textContent = Math.floor(g.credits).toLocaleString();
  ui.upgrades.innerHTML = '';
  for (const u of UPGRADES) {
    const lvl = g.up[u.key];
    const maxed = lvl >= u.max;
    const c = costOf(u, lvl);
    const row = document.createElement('div');
    row.className = 'up';
    const label = u.tiers ? u.name + ' — ' + u.tiers[lvl] : u.name;
    row.innerHTML =
      '<div class="upinfo"><div class="upname">' + label + '</div>' +
      '<div class="upeff">Lv ' + lvl + '/' + u.max + ' · ' + u.effect(lvl) + (maxed ? '' : ' → ' + u.effect(lvl + 1)) + '</div></div>';
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? 'MAX' : '◈ ' + c.toLocaleString();
    btn.disabled = maxed || g.credits < c;
    btn.onclick = () => {
      if (g.credits < c || maxed) return;
      g.credits -= c;
      g.up[u.key]++;
      if (u.key === 'tank') g.fuel = S.fuelCap();
      if (u.key === 'scan') lamp.distance = S.light();
      sfx.buy();
      save(); buildShop(); updateHUD();
      flash('rgba(120,255,200,.25)', 160);
    };
    row.appendChild(btn);
    ui.upgrades.appendChild(row);
  }
}

/* ============ actions ============ */
function sell() {
  const v = haulValue();
  if (v <= 0) { g.cargo = {}; g.weight = 0; return; }
  g.credits += v;
  g.cargo = {}; g.weight = 0;
  sfx.sell();
  toast('Sold haul for ◈ ' + v.toLocaleString());
  save();
}

function goSurface() {
  g.px = START_X; g.pd = -1; g.face = 'down';
  moving = null; digging = null; flight = null;
  sfx.digStop();
  g.fuel = S.fuelCap(); g.hull = HULL_MAX;
  syncBlocks(true);
  save();
}

function autopilot() {
  if (g.up.auto === 0 || atSurface() || g.mode !== 'play') return;
  const cost = Math.ceil(g.pd * S.autoRate());
  if (g.fuel < cost) { toast('Autopilot needs ' + cost + ' fuel'); return; }
  const route = findRoute();
  if (!route) { toast('No clear tunnel back to the pad'); return; }
  g.fuel -= cost;
  const pts3 = route.map((p) => new THREE.Vector3(worldX(p[0]), -p[1], 0));
  const curve = new THREE.CatmullRomCurve3(pts3, false, 'catmullrom', 0.35);
  const len = curve.getLength();
  const cruise = clamp(len / 4.2, 8, 26);
  flight = { curve: curve, len: len, u: 0, dur: len / cruise, t: 0, last: pts3[0].clone() };
  moving = null; digging = null; held = null;
  sfx.digStop();
  sfx.thrust();
  g.mode = 'fly';
  toast('Autopilot engaged · ' + route.length + ' m of tunnel');
}

function tow(reason) {
  const cut = S.towCut();
  const taken = Math.round(haulValue() * cut);
  for (const k in g.cargo) g.cargo[k] = Math.floor(g.cargo[k] * (1 - cut));
  g.weight = 0;
  for (const k in g.cargo) g.weight += g.cargo[k] * DEF[k].wt;
  sfx.alarm();
  flash('rgba(255,140,60,.35)', 500);
  shake = 0.5;
  goSurface();
  const kept = haulValue();
  sell();
  showEvent('TOWED HOME',
    reason + ' A salvage rig winched you back to the pad and took ' + Math.round(cut * 100) +
    '% of your haul as the fee, worth ◈ ' + taken.toLocaleString() + '. You kept ◈ ' + kept.toLocaleString() +
    '. Tow Insurance in the Outfitter lowers that cut.',
    'CONTINUE', () => {});
}

function showEvent(title, bodyTxt, btnTxt, cb) {
  g.mode = 'event';
  ui.evTitle.textContent = title;
  ui.evBody.textContent = bodyTxt;
  ui.evBtn.textContent = btnTxt;
  ui.event.classList.remove('hidden');
  ui.evBtn.onclick = () => { sfx.ui(); ui.event.classList.add('hidden'); g.mode = 'play'; cb(); };
}

function breakCore() {
  g.mode = 'boom';
  const x = worldX(g.px), y = -g.pd;
  spray(x, y, 0xffe9a0, 300, 24, 2.6);
  spray(x, y, 0xff7a18, 200, 15, 3.0);
  flash('rgba(255,255,255,.95)', 700);
  sfx.boom();
  shake = 1.4;
  setTimeout(() => {
    g.shards++;
    const next = g.planet + 1;
    showEvent(planetName(g.planet).toUpperCase() + ' DESTROYED',
      'The core gave way and the planet tore itself apart. You recovered a Core Shard, worth a permanent 8% drill power. ' +
      'Total shards: ' + g.shards + '. Next stop: ' + planetName(next) + ', where the crust is tougher and the veins run richer.',
      'LAUNCH TO ' + planetName(next).toUpperCase(),
      () => {
        g.planet = next;
        g.dug = new Set();
        for (const k of Array.from(meshes.keys())) dropBlock(k);
        goSurface();
        save();
      });
  }, 1700);
}

function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  g.planet = 0; g.credits = 0; g.shards = 0;
  g.up = { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 };
  g.dug = new Set();
  g.cargo = {}; g.weight = 0;
  for (const k of Array.from(meshes.keys())) dropBlock(k);
  lastRow = null;
  lamp.distance = S.light();
  goSurface();
  g.mode = 'play';
  ui.pause.classList.add('hidden');
  flash('rgba(255,255,255,.5)', 400);
  toast('Progress wiped. Fresh start on ' + planetName(0) + '.');
}

/* ============ input ============ */
let held = null, moving = null, digging = null, flight = null;

function firstTouch() { audioInit(); }
window.addEventListener('pointerdown', firstTouch, { once: true });
window.addEventListener('keydown', firstTouch, { once: true });

document.querySelectorAll<HTMLElement>('#dpad .k').forEach((b) => {
  const dir = b.dataset.dir;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); held = dir; });
  const up = (e) => { if (e) e.preventDefault(); b.classList.remove('on'); if (held === dir) held = null; };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
window.addEventListener('keydown', (e) => { if (KEYS[e.key]) { held = KEYS[e.key]; e.preventDefault(); } });
window.addEventListener('keyup', (e) => { if (KEYS[e.key] && held === KEYS[e.key]) held = null; });

ui.btnAuto.onclick = autopilot;
ui.btnShop.onclick = () => { if (!atSurface() || g.mode !== 'play') return; sfx.ui(); g.mode = 'shop'; buildShop(); ui.shop.classList.remove('hidden'); };
el('shopClose').onclick = () => { sfx.ui(); ui.shop.classList.add('hidden'); g.mode = 'play'; };
el('btnManifest').onclick = () => { if (g.mode !== 'play') return; sfx.ui(); g.mode = 'manifest'; buildManifest(); ui.manifest.classList.remove('hidden'); };
el('manifestClose').onclick = () => { sfx.ui(); ui.manifest.classList.add('hidden'); g.mode = 'play'; };

function audioLabels() {
  ui.btnMusic.textContent = 'MUSIC  ' + (audioState.music ? 'ON' : 'OFF');
  ui.btnSfx.textContent = 'SOUND  ' + (audioState.sfx ? 'ON' : 'OFF');
  ui.btnMusic.classList.toggle('off', !audioState.music);
  ui.btnSfx.classList.toggle('off', !audioState.sfx);
}
ui.btnMusic.onclick = () => { audioInit(); setAudio('music', !audioState.music); audioLabels(); };
ui.btnSfx.onclick = () => { audioInit(); setAudio('sfx', !audioState.sfx); audioLabels(); sfx.ui(); };

let resetArmed = 0;
function disarmReset() {
  resetArmed = 0;
  ui.btnReset.textContent = 'RESTART PROGRESS';
  ui.btnReset.classList.remove('armed');
}
el('btnPause').onclick = () => {
  if (g.mode !== 'play') return;
  sfx.ui();
  g.mode = 'pause';
  held = null;
  sfx.digStop();
  disarmReset();
  audioLabels();
  ui.pauseStats.innerHTML =
    '<div class="up"><div class="upinfo"><div class="upname">' + planetName(g.planet) + '</div>' +
    '<div class="upeff">Core at ' + coreDepth(g.planet) + ' m · you are at ' + Math.max(0, Math.round(g.pd)) + ' m</div></div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Credits</div>' +
    '<div class="upeff">Haul aboard worth ◈ ' + haulValue().toLocaleString() + '</div></div>' +
    '<div class="val">◈ ' + Math.floor(g.credits).toLocaleString() + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Core Shards</div>' +
    '<div class="upeff">Planets destroyed · +' + (g.shards * 8) + '% drill power</div></div>' +
    '<div class="val">' + g.shards + '</div></div>';
  ui.pause.classList.remove('hidden');
};
el('btnResume').onclick = () => { sfx.ui(); ui.pause.classList.add('hidden'); g.mode = 'play'; };
ui.btnReset.onclick = () => {
  if (resetArmed === 0) {
    resetArmed = 1;
    ui.btnReset.textContent = 'TAP AGAIN TO WIPE EVERYTHING';
    ui.btnReset.classList.add('armed');
    setTimeout(disarmReset, 4000);
    return;
  }
  hardReset();
  disarmReset();
};
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* ============ save ============ */
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      planet: g.planet, credits: g.credits, shards: g.shards, up: g.up,
      dug: Array.from(g.dug), cargo: g.cargo, weight: g.weight, px: g.px, pd: g.pd
    }));
  } catch (e) { /* ignore */ }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      g.planet = s.planet || 0; g.credits = s.credits || 0; g.shards = s.shards || 0;
      Object.assign(g.up, s.up || {});
      g.dug = new Set(s.dug || []);
      g.cargo = s.cargo || {}; g.weight = s.weight || 0;
      if (typeof s.px === 'number') g.px = s.px;
      if (typeof s.pd === 'number') g.pd = s.pd;
      return;
    }
    const old = localStorage.getItem(OLD_KEY);
    if (!old) return;
    const s = JSON.parse(old);
    g.planet = s.planet || 0;
    g.shards = s.shards || 0;
    g.credits = Math.round((s.credits || 0) * 4);
    g.dug = new Set(s.dug || []);
    const o = s.up || {};
    g.up.drill = o.drill || 0; g.up.cargo = o.cargo || 0; g.up.thrust = o.thrust || 0;
    g.up.tank = o.tank || 0; g.up.cool = o.cool || 0; g.up.scan = o.scan || 0;
    g.up.auto = Math.min(6, o.beacon || 0);
    save();
  } catch (e) { /* corrupt save, start fresh */ }
}

/* ============ loop ============ */
function step(dir) {
  const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  return { x: g.px + v[0], d: Math.round(g.pd) + v[1] };
}

function startAction() {
  if (!held || moving || digging) return;
  const t = step(held);
  g.face = held;
  if (t.x < 0 || t.x >= W || t.d < -3 || t.d > coreDepth(g.planet)) return;
  const b = blockAt(t.x, t.d);
  if (b) {
    if (b.hard === Infinity) return;
    if (g.weight + b.wt > S.cargoCap()) { toast('Hold is full at ' + S.cargoCap() + ' kg'); return; }
    digging = { x: t.x, d: t.d, t: 0, total: (b.hard * DIG_BASE) / S.drill(), block: b, stage: 0, spark: 0 };
    sfx.digStart(b.hard);
    squash = 0.55;
  } else {
    moving = { x: t.x, d: t.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
  }
}

let camZ = 13, camZBoost = 0, shake = 0, squash = 0, freeze = 0, thrustLevel = 0, bank = 0;
let last = performance.now(), skyTick = 0;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const rows = 13, halfV = Math.tan((camera.fov * Math.PI) / 360);
  let z = rows / (2 * halfV);
  const needW = (W + 2) / camera.aspect;
  if (needW < rows) z = Math.max(9, needW / (2 * halfV));
  camZ = z;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  const frozen = freeze > 0;
  if (frozen) freeze -= raw;
  const dt = frozen ? 0 : raw;

  thrustLevel *= 0.86;

  if (g.mode === 'fly' && flight) {
    flight.t += dt;
    const raw01 = clamp(flight.t / flight.dur, 0, 1);
    const u = raw01 < 0.5 ? 2 * raw01 * raw01 : 1 - Math.pow(-2 * raw01 + 2, 2) / 2;
    const p = flight.curve.getPointAt(clamp(u, 0, 1));
    const dx = p.x - flight.last.x, dy = p.y - flight.last.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
      const ang = Math.atan2(dx, dy);
      let df = ang - rig.rotation.z;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      rig.rotation.z += df * Math.min(1, dt * 9);
    }
    flight.last.copy(p);
    g.px = p.x + (W - 1) / 2;
    g.pd = -p.y;
    thrustLevel = 1;
    camZBoost += (2.4 - camZBoost) * Math.min(1, dt * 3);
    syncBlocks();
    if (Math.random() < 0.9) spray(p.x, p.y + 0.4, 0x7ad4ff, 2, 2.4, 0.35);
    if (raw01 >= 1) {
      flight = null;
      camZBoost = 0;
      goSurface();
      g.mode = 'play';
      sell();
      shake = 0.25;
      flash('rgba(110,220,255,.22)', 240);
    }
  } else if (g.mode === 'play') {
    camZBoost += (0 - camZBoost) * Math.min(1, raw * 4);
    startAction();

    if (digging) {
      const b = digging.block;
      digging.t += dt;
      g.fuel -= (1.0 + b.hard * 0.09) * dt;
      const k = key(digging.x, digging.d);
      const o = meshes.get(k);
      const prog = clamp(digging.t / digging.total, 0, 1);
      bit.rotation.y += raw * 30;

      if (o) {
        const stage = Math.floor(prog * 5);
        o.scale.setScalar(1 - 0.07 * stage);
        o.position.x = worldX(digging.x) + (Math.random() - 0.5) * 0.07 * prog;
        o.position.y = -digging.d + (Math.random() - 0.5) * 0.07 * prog;
        if (stage > digging.stage) {
          digging.stage = stage;
          const cr = new THREE.Mesh(crackGeo, crackMat);
          cr.rotation.z = Math.random() * Math.PI;
          cr.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.5);
          cr.scale.x = 0.5 + Math.random() * 0.5;
          o.add(cr);
          spray(o.position.x, o.position.y, b.color, 7, 2.8, 0.5);
          sfx.crack(b.hard);
          shake = Math.max(shake, 0.045);
        }
      }
      digging.spark -= dt;
      if (digging.spark <= 0) {
        digging.spark = 0.1;
        spray(worldX(digging.x), -digging.d, b.color, 2, 1.9, 0.4);
        sfx.chip(b.hard);
      }

      if (digging.t >= digging.total) {
        g.dug.add(k);
        dropBlock(k);
        spray(worldX(digging.x), -digging.d, b.color, b.ore ? 30 : 13, b.ore ? 6.5 : 4, 0.85);
        sfx.digStop();
        freeze = b.ore ? 0.075 : 0.035;
        shake = Math.max(shake, b.ore ? 0.22 : 0.09);
        squash = 0.8;
        if (b.core) { digging = null; breakCore(); }
        else {
          g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
          g.weight += b.wt;
          if (b.ore) sfx.collect(b.tone);
          if (b.value >= 400) toast(b.name + '  +◈ ' + Math.round(b.value * valueMult(g.planet)).toLocaleString());
          moving = { x: digging.x, d: digging.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
          digging = null;
          save();
        }
      }
    } else if (moving) {
      moving.t += dt;
      g.fuel -= 0.8 * dt;
      thrustLevel = 0.75;
      const a = clamp(moving.t / moving.total, 0, 1);
      g.px = moving.fx + (moving.x - moving.fx) * a;
      g.pd = moving.fd + (moving.d - moving.fd) * a;
      bank += ((moving.x - moving.fx) * 0.45 - bank) * Math.min(1, raw * 8);
      bit.rotation.y += raw * 9;
      if (a >= 1) {
        g.px = moving.x; g.pd = moving.d; moving = null;
        syncBlocks();
        if (atSurface()) { sell(); g.fuel = S.fuelCap(); g.hull = HULL_MAX; }
      }
    } else {
      bank += (0 - bank) * Math.min(1, raw * 6);
    }

    if (g.pd > 70) {
      const ex = (g.pd - 70) / 50;
      g.hull -= Math.pow(ex, 1.3) * 4.5 * (1 - S.shield()) * dt;
    } else if (atSurface()) {
      g.hull = Math.min(HULL_MAX, g.hull + 30 * dt);
      g.fuel = S.fuelCap();
    }

    if (g.fuel <= 0) { g.fuel = 0; tow('Your tank ran dry at ' + Math.round(g.pd) + ' m.'); }
    else if (g.hull <= 0) { g.hull = 1; tow('Your hull buckled in the heat at ' + Math.round(g.pd) + ' m.'); }
  }

  stepParticles(dt);
  setDepth(g.pd);

  /* ship transform */
  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, 0.62);
  squash *= 0.88;
  const sq = 1 + squash * 0.16;
  player.scale.set(1 / sq, sq, 1);
  rig.rotation.y = bank;
  lamp.position.set(px, py, 1.7);
  lamp.distance = S.light();

  if (g.mode !== 'fly') {
    const target = FACE_ANGLE[g.face];
    let diff = target - rig.rotation.z;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    rig.rotation.z += diff * Math.min(1, raw * 14);
  }

  const fscale = 0.25 + thrustLevel * 1.15;
  for (const f of flames) {
    f.cone.scale.set(0.8 + thrustLevel * 0.5, fscale, 0.8 + thrustLevel * 0.5);
    f.cone.material.opacity = 0.25 + thrustLevel * 0.7;
    f.glow.scale.setScalar(0.35 + thrustLevel * 1.0);
  }

  /* world ambience */
  const tDeep = clamp((g.pd + 2) / 72, 0, 1);
  amb.intensity = 1.75 - 1.55 * tDeep;
  sun.intensity = 1.5 * (1 - tDeep);
  rim.intensity = 0.5 - 0.32 * tDeep;
  scene.fog.density = 0.02 + tDeep * 0.028;
  const hi = lerpHex(skyHi(g.planet), 0x02030a, tDeep);
  const lo = lerpHex(skyLo(g.planet), 0x0a0c14, tDeep);
  scene.fog.color.copy(lo);
  starMat.opacity = clamp(1 - tDeep * 2.4, 0, 0.9);
  sunSprite.material.opacity = clamp(0.5 - tDeep, 0, 0.5);
  dustMat.opacity = clamp(tDeep * 0.55, 0, 0.5);
  dust.position.set(px, py, 0);
  dust.rotation.z += raw * 0.04;

  skyTick += raw;
  if (skyTick > 0.12) {
    skyTick = 0;
    gameEl.style.background = 'linear-gradient(180deg,#' + hi.getHexString() + ' 0%,#' + lo.getHexString() + ' 100%)';
  }

  const glowT = now / 1000;
  for (const o of oreGlows) {
    const s = o.userData.baseScale * (1 + 0.14 * Math.sin(glowT * 2.1 + o.userData.phase));
    o.userData.halo.scale.set(s, s, 1);
  }
  for (let i = 0; i < padLights.length; i++) {
    const ph = (glowT * 1.6 - i * 0.22) % 2;
    padLights[i].scale.setScalar(0.55 + 0.5 * Math.max(0, 1 - Math.abs(ph - 0.5) * 3));
  }
  beam.material.opacity = 0.05 + 0.035 * Math.sin(glowT * 1.3);

  /* camera */
  const zNow = camZ + camZBoost;
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * zNow * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const k = g.mode === 'fly' ? 11 : 6;
  camera.position.x += (clamp(px, -lim, lim) - camera.position.x) * Math.min(1, raw * k);
  camera.position.y += (py - 0.8 - camera.position.y) * Math.min(1, raw * (k + 1));
  camera.position.z += (zNow - camera.position.z) * Math.min(1, raw * 4);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - raw * 1.4);
  }

  if (toastT > 0) { toastT -= raw; if (toastT <= 0) ui.toast.style.opacity = '0'; }

  updateHUD();
  renderer.render(scene, camera);
}

/* ============ build stamp ============
   Vite replaces __BUILD_SHA__ and __BUILD_TIME__ at build time. This is the
   only way to tell on the phone which build is actually running: an installed
   PWA can be a load behind after a deploy, and the game itself is meant to
   look identical between builds. Open the pause menu and read the line.
   The typeof guards keep this harmless if the file is ever loaded unbuilt. */
function stampBuild() {
  const sha = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev';
  let when = 'unbuilt';
  if (typeof __BUILD_TIME__ === 'string') {
    const d = new Date(__BUILD_TIME__);
    when = isNaN(d.getTime()) ? __BUILD_TIME__ : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  const node = el('build');
  if (node) node.textContent = 'build ' + sha + '  ·  ' + when;
}

/* ============ boot ============ */
load();
lamp.distance = S.light();
g.fuel = S.fuelCap();
g.hull = HULL_MAX;
camera.position.set(0, -g.pd - 0.8, 13);
resize();
syncBlocks(true);
audioLabels();
updateHUD();
stampBuild();
document.getElementById('boot').classList.add('hidden');
window.addEventListener('visibilitychange', () => { save(); if (document.hidden) sfx.digStop(); });
setInterval(save, 5000);
requestAnimationFrame(frame);
