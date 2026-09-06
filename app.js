import * as THREE from 'three';

/* ============ config ============ */
const W = 9;
const SAVE_KEY = 'coreward.v2';
const OLD_KEY = 'coreward.v1';
const HULL_MAX = 100;
const DIG_BASE = 0.5;

const PLANET_NAMES = ['Verdax', 'Rustmoor', 'Cryon', 'Ashvault', 'Kryllon', 'Tessivar'];
const PLANET_SKY = [0x2f6fae, 0xb0592a, 0x2aa8b0, 0x6a2f6a, 0x33357a, 0x2f7a4a];

const planetName = (i) => {
  const base = PLANET_NAMES[i % PLANET_NAMES.length];
  const cyc = Math.floor(i / PLANET_NAMES.length);
  return cyc ? base + ' ' + (cyc + 1) : base;
};
const skyOf = (i) => PLANET_SKY[i % PLANET_SKY.length];
const coreDepth = (p) => 110 + p * 35;
const hardMult = (p) => 1 + p * 0.28;
const valueMult = (p) => 1 + p * 0.6;

/* ore: wt in kg, value in credits. rare = heavy but a big jump in price. */
const ORES = [
  { id: 'coreite',  name: 'Coreite',  color: 0x66fff0, host: 0x2a2f3a, hard: 16,  wt: 16,  value: 22000, min: 185, chance: 0.030, glow: 0.60, shards: 7 },
  { id: 'magmite',  name: 'Magmite',  color: 0xff7a18, host: 0x2e2228, hard: 13,  wt: 13,  value: 9000,  min: 145, chance: 0.038, glow: 0.50, shards: 6 },
  { id: 'ruby',     name: 'Ruby',     color: 0xff3b5c, host: 0x33303a, hard: 10,  wt: 10,  value: 3600,  min: 105, chance: 0.042, glow: 0.32, shards: 6 },
  { id: 'emerald',  name: 'Emerald',  color: 0x2fd07a, host: 0x2f3a38, hard: 8.5, wt: 8.5, value: 1800,  min: 78,  chance: 0.048, glow: 0.30, shards: 5 },
  { id: 'amethyst', name: 'Amethyst', color: 0xa060ff, host: 0x35323f, hard: 7,   wt: 7,   value: 900,   min: 56,  chance: 0.055, glow: 0.28, shards: 5 },
  { id: 'gold',     name: 'Gold',     color: 0xffcf47, host: 0x3d3a34, hard: 5.5, wt: 9,   value: 420,   min: 36,  chance: 0.060, glow: 0.20, shards: 5 },
  { id: 'silver',   name: 'Silver',   color: 0xd8e0e8, host: 0x3a3c40, hard: 4.5, wt: 6,   value: 150,   min: 22,  chance: 0.070, glow: 0.16, shards: 4 },
  { id: 'iron',     name: 'Iron',     color: 0xb0b6bd, host: 0x3a3630, hard: 3.5, wt: 4.5, value: 60,    min: 11,  chance: 0.085, glow: 0.10, shards: 4 },
  { id: 'copper',   name: 'Copper',   color: 0xc87137, host: 0x3c342c, hard: 2.6, wt: 3.5, value: 25,    min: 4,   chance: 0.100, glow: 0.10, shards: 4 }
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
  path: [[START_X, -1]],
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
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, host: 0x4a3a20, hard: 26 * hardMult(g.planet), wt: 0, value: 0, glow: 0.9, shards: 8, ore: true, core: true };
  const hm = hardMult(g.planet);
  const r = rnd(x, d, g.planet);
  for (const o of ORES) {
    if (d >= o.min && r < o.chance) {
      return { id: o.id, name: o.name, color: o.color, host: o.host, glow: o.glow, shards: o.shards,
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

/* breadcrumb trail, with loop removal so backtracking shortens the route */
function pushPath(x, d) {
  const n = g.path.length;
  if (n >= 2 && g.path[n - 2][0] === x && g.path[n - 2][1] === d) { g.path.pop(); return; }
  if (n >= 1 && g.path[n - 1][0] === x && g.path[n - 1][1] === d) return;
  g.path.push([x, d]);
  if (g.path.length > 3000) g.path.splice(0, 500);
}

/* ============ three ============ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
document.getElementById('game').appendChild(renderer.domElement);

scene.fog = new THREE.Fog(0x05070d, 16, 40);
scene.background = new THREE.Color(skyOf(0));

const amb = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 10, 8);
scene.add(sun);
const lamp = new THREE.PointLight(0xffd9a0, 26, S.light(), 1.3);
scene.add(lamp);

const boxGeo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
const shardGeo = new THREE.OctahedronGeometry(1, 0);
const crackGeo = new THREE.BoxGeometry(1, 0.05, 0.05);
const crackMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0e });

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

function makeBlock(x, d, b) {
  const jitter = 0.88 + rnd(x + 77, d + 31, g.planet) * 0.24;
  if (!b.ore) {
    const m = new THREE.Mesh(boxGeo, mat(shade(b.color, jitter), b.glow));
    m.rotation.z = (rnd(x + 5, d + 9, g.planet) - 0.5) * 0.06;
    return m;
  }
  const grp = new THREE.Group();
  const host = new THREE.Mesh(boxGeo, mat(shade(b.host || 0x333038, jitter), 0.02));
  grp.add(host);
  const n = b.shards || 5;
  const sm = mat(b.color, b.glow);
  for (let i = 0; i < n; i++) {
    const r1 = rnd(x * 13 + i, d * 7 + i * 3, g.planet);
    const r2 = rnd(x * 3 + i * 5, d * 17 + i, g.planet + 11);
    const r3 = rnd(x + i * 29, d + i * 13, g.planet + 23);
    const s = 0.13 + r3 * 0.13;
    const sh = new THREE.Mesh(shardGeo, sm);
    sh.scale.set(s, s * (1.3 + r1 * 1.1), s);
    sh.position.set((r1 - 0.5) * 0.72, (r2 - 0.5) * 0.72, 0.34 + r3 * 0.16);
    sh.rotation.set(r1 * 3.14, r2 * 3.14, r3 * 3.14);
    grp.add(sh);
    if (i < 2) {
      const back = sh.clone();
      back.position.z = -0.34 - r3 * 0.16;
      grp.add(back);
    }
  }
  return grp;
}

/* ============ particles ============ */
const PMAX = 600;
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(PMAX * 3);
const pCol = new Float32Array(PMAX * 3);
const pVel = [];
const pLife = new Float32Array(PMAX);
for (let i = 0; i < PMAX; i++) { pPos[i * 3 + 1] = 9999; pVel.push(new THREE.Vector3()); }
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.95 }));
pts.frustumCulled = false;
scene.add(pts);
let pHead = 0;

function spray(x, y, color, count, power, life) {
  const c = new THREE.Color(color);
  for (let i = 0; i < count; i++) {
    const k = pHead = (pHead + 1) % PMAX;
    pPos[k * 3] = x + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 1] = y + (Math.random() - 0.5) * 0.5;
    pPos[k * 3 + 2] = 0.4 + Math.random() * 0.4;
    pCol[k * 3] = c.r; pCol[k * 3 + 1] = c.g; pCol[k * 3 + 2] = c.b;
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

/* ============ player ============ */
const player = new THREE.Group();
const rig = new THREE.Group();
player.add(rig);
rig.add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.62), new THREE.MeshLambertMaterial({ color: 0x2fd4ff, emissive: 0x0a3a4a, flatShading: true })));
const bit = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.44, 10), new THREE.MeshLambertMaterial({ color: 0xf0f4ff, emissive: 0x333a4a, flatShading: true }));
bit.position.y = -0.5;
bit.rotation.x = Math.PI;
rig.add(bit);
const cab = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0x7a5a10 }));
cab.position.set(0, 0.14, 0.31);
rig.add(cab);
scene.add(player);

const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };

const pad = new THREE.Group();
const slab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.2, 1.4), new THREE.MeshLambertMaterial({ color: 0x39424f, emissive: 0x0c1016 }));
slab.position.y = 0.6;
pad.add(slab);
for (const sx of [-1.9, 1.9]) {
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8), new THREE.MeshLambertMaterial({ color: 0x59636f }));
  post.position.set(sx, 1.2, 0);
  pad.add(post);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshLambertMaterial({ color: 0x66ffcc, emissive: 0x33ffbb }));
  tip.position.set(sx, 1.8, 0);
  pad.add(tip);
}
pad.position.x = worldX(START_X);
scene.add(pad);

/* ============ world meshes ============ */
const meshes = new Map();
let lastRow = null;
function syncBlocks(force) {
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
  for (const [k, o] of meshes) if (!need.has(k)) { scene.remove(o); meshes.delete(k); }
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
      '<div class="upeff">' + (n * o.wt).toFixed(1) + ' kg \u00b7 ' + Math.round(o.value * vm).toLocaleString() + ' each</div></div>' +
      '<div class="val">\u25c8 ' + Math.round(n * o.value * vm).toLocaleString() + '</div>';
    ui.manifestRows.appendChild(row);
  }
  ui.manifestTotal.textContent = '\u25c8 ' + haulValue().toLocaleString();
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
    const label = u.tiers ? u.name + ' \u2014 ' + u.tiers[lvl] : u.name;
    row.innerHTML =
      '<div class="upinfo"><div class="upname">' + label + '</div>' +
      '<div class="upeff">Lv ' + lvl + '/' + u.max + ' \u00b7 ' + u.effect(lvl) + (maxed ? '' : ' \u2192 ' + u.effect(lvl + 1)) + '</div></div>';
    const btn = document.createElement('button');
    btn.className = 'buy';
    btn.textContent = maxed ? 'MAX' : '\u25c8 ' + c.toLocaleString();
    btn.disabled = maxed || g.credits < c;
    btn.onclick = () => {
      if (g.credits < c || maxed) return;
      g.credits -= c;
      g.up[u.key]++;
      if (u.key === 'tank') g.fuel = S.fuelCap();
      if (u.key === 'scan') lamp.distance = S.light();
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
  toast('Sold haul for \u25c8 ' + v.toLocaleString());
  save();
}

function goSurface() {
  g.px = START_X; g.pd = -1; g.face = 'down';
  g.path = [[START_X, -1]];
  moving = null; digging = null; flight = null;
  g.fuel = S.fuelCap(); g.hull = HULL_MAX;
  syncBlocks(true);
  save();
}

function autopilot() {
  if (g.up.auto === 0 || atSurface() || g.mode !== 'play') return;
  const cost = Math.ceil(g.pd * S.autoRate());
  if (g.fuel < cost) { toast('Autopilot needs ' + cost + ' fuel'); return; }
  g.fuel -= cost;
  const route = g.path.slice().reverse();
  const lastPt = route[route.length - 1];
  if (!lastPt || lastPt[0] !== START_X || lastPt[1] !== -1) route.push([START_X, -1]);
  if (route.length < 2) { goSurface(); sell(); return; }
  const dur = clamp(route.length / 26, 1.0, 4.5);
  flight = { route: route, t: 0, speed: (route.length - 1) / dur };
  moving = null; digging = null; held = null;
  g.mode = 'fly';
  toast('Autopilot engaged');
}

function tow(reason) {
  const cut = S.towCut();
  const before = haulValue();
  const taken = Math.round(before * cut);
  for (const k in g.cargo) g.cargo[k] = Math.floor(g.cargo[k] * (1 - cut));
  g.weight = 0;
  for (const k in g.cargo) g.weight += g.cargo[k] * DEF[k].wt;
  flash('rgba(255,140,60,.35)', 500);
  goSurface();
  const kept = haulValue();
  sell();
  showEvent('TOWED HOME',
    reason + ' A salvage rig winched you back to the pad and took ' + Math.round(cut * 100) +
    '% of your haul as the fee, worth \u25c8 ' + taken.toLocaleString() + '. You kept \u25c8 ' + kept.toLocaleString() +
    '. Tow Insurance in the Outfitter lowers that cut.',
    'CONTINUE', () => {});
}

function showEvent(title, bodyTxt, btnTxt, cb) {
  g.mode = 'event';
  ui.evTitle.textContent = title;
  ui.evBody.textContent = bodyTxt;
  ui.evBtn.textContent = btnTxt;
  ui.event.classList.remove('hidden');
  ui.evBtn.onclick = () => { ui.event.classList.add('hidden'); g.mode = 'play'; cb(); };
}

function breakCore() {
  g.mode = 'boom';
  const x = worldX(g.px), y = -g.pd;
  spray(x, y, 0xffd070, 260, 22, 2.6);
  spray(x, y, 0xff7a18, 160, 14, 3.0);
  flash('rgba(255,255,255,.95)', 700);
  shake = 1.2;
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
        for (const [, o] of meshes) scene.remove(o);
        meshes.clear();
        scene.background = new THREE.Color(skyOf(g.planet));
        goSurface();
        save();
      });
  }, 1600);
}

function hardReset() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_KEY); } catch (e) { /* ignore */ }
  g.planet = 0; g.credits = 0; g.shards = 0;
  g.up = { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 };
  g.dug = new Set();
  g.cargo = {}; g.weight = 0;
  for (const [, o] of meshes) scene.remove(o);
  meshes.clear();
  lastRow = null;
  scene.background = new THREE.Color(skyOf(0));
  lamp.distance = S.light();
  goSurface();
  g.mode = 'play';
  ui.pause.classList.add('hidden');
  flash('rgba(255,255,255,.5)', 400);
  toast('Progress wiped. Fresh start on ' + planetName(0) + '.');
}

/* ============ input ============ */
let held = null, moving = null, digging = null, flight = null;

document.querySelectorAll('#dpad .k').forEach((b) => {
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
ui.btnShop.onclick = () => { if (!atSurface() || g.mode !== 'play') return; g.mode = 'shop'; buildShop(); ui.shop.classList.remove('hidden'); };
el('shopClose').onclick = () => { ui.shop.classList.add('hidden'); g.mode = 'play'; };
el('btnManifest').onclick = () => { if (g.mode !== 'play') return; g.mode = 'manifest'; buildManifest(); ui.manifest.classList.remove('hidden'); };
el('manifestClose').onclick = () => { ui.manifest.classList.add('hidden'); g.mode = 'play'; };

let resetArmed = 0;
function disarmReset() {
  resetArmed = 0;
  ui.btnReset.textContent = 'RESTART PROGRESS';
  ui.btnReset.classList.remove('armed');
}
el('btnPause').onclick = () => {
  if (g.mode !== 'play') return;
  g.mode = 'pause';
  held = null;
  disarmReset();
  ui.pauseStats.innerHTML =
    '<div class="up"><div class="upinfo"><div class="upname">' + planetName(g.planet) + '</div>' +
    '<div class="upeff">Core at ' + coreDepth(g.planet) + ' m \u00b7 you are at ' + Math.max(0, Math.round(g.pd)) + ' m</div></div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Credits</div>' +
    '<div class="upeff">Haul aboard worth \u25c8 ' + haulValue().toLocaleString() + '</div></div>' +
    '<div class="val">\u25c8 ' + Math.floor(g.credits).toLocaleString() + '</div></div>' +
    '<div class="up"><div class="upinfo"><div class="upname">Core Shards</div>' +
    '<div class="upeff">Planets destroyed \u00b7 +' + (g.shards * 8) + '% drill power</div></div>' +
    '<div class="val">' + g.shards + '</div></div>';
  ui.pause.classList.remove('hidden');
};
el('btnResume').onclick = () => { ui.pause.classList.add('hidden'); g.mode = 'play'; };
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
      dug: Array.from(g.dug), cargo: g.cargo, weight: g.weight,
      px: g.px, pd: g.pd, path: g.path
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
      if (Array.isArray(s.path) && s.path.length) g.path = s.path;
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
  } else {
    moving = { x: t.x, d: t.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
  }
}

let camZ = 13, shake = 0, last = performance.now();

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
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (g.mode === 'fly' && flight) {
    flight.t += dt * flight.speed;
    const i = Math.floor(flight.t);
    if (i >= flight.route.length - 1) {
      flight = null;
      goSurface();
      g.mode = 'play';
      sell();
      flash('rgba(110,220,255,.28)', 260);
    } else {
      const a = flight.t - i;
      const p0 = flight.route[i], p1 = flight.route[i + 1];
      g.px = p0[0] + (p1[0] - p0[0]) * a;
      g.pd = p0[1] + (p1[1] - p0[1]) * a;
      const dx = p1[0] - p0[0], dy = p1[1] - p0[1];
      g.face = dy < 0 ? 'up' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
      syncBlocks();
      bit.rotation.y += dt * 14;
      if (Math.random() < 0.8) spray(worldX(g.px), -g.pd, 0x5fd8ff, 2, 2.2, 0.3);
    }
  } else if (g.mode === 'play') {
    startAction();

    if (digging) {
      const b = digging.block;
      digging.t += dt;
      g.fuel -= (1.0 + b.hard * 0.09) * dt;
      const k = key(digging.x, digging.d);
      const o = meshes.get(k);
      const prog = clamp(digging.t / digging.total, 0, 1);
      bit.rotation.y += dt * 26;

      if (o) {
        const stage = Math.floor(prog * 5);
        o.scale.setScalar(1 - 0.06 * stage);
        o.position.x = worldX(digging.x) + (Math.random() - 0.5) * 0.05 * prog;
        o.position.y = -digging.d + (Math.random() - 0.5) * 0.05 * prog;
        if (stage > digging.stage) {
          digging.stage = stage;
          const cr = new THREE.Mesh(crackGeo, crackMat);
          cr.rotation.z = Math.random() * Math.PI;
          cr.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.5);
          cr.scale.x = 0.5 + Math.random() * 0.5;
          o.add(cr);
          spray(o.position.x, o.position.y, b.color, 6, 2.6, 0.5);
        }
      }
      digging.spark -= dt;
      if (digging.spark <= 0) {
        digging.spark = 0.09;
        spray(worldX(digging.x), -digging.d, b.color, 2, 1.8, 0.4);
      }

      if (digging.t >= digging.total) {
        g.dug.add(k);
        if (o) { scene.remove(o); meshes.delete(k); }
        spray(worldX(digging.x), -digging.d, b.color, b.ore ? 26 : 12, b.ore ? 6 : 4, 0.8);
        if (b.core) { digging = null; breakCore(); }
        else {
          g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
          g.weight += b.wt;
          if (b.value >= 400) toast(b.name + '  +\u25c8 ' + Math.round(b.value * valueMult(g.planet)).toLocaleString());
          moving = { x: digging.x, d: digging.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
          digging = null;
          save();
        }
      }
    } else if (moving) {
      moving.t += dt;
      g.fuel -= 0.8 * dt;
      const a = clamp(moving.t / moving.total, 0, 1);
      g.px = moving.fx + (moving.x - moving.fx) * a;
      g.pd = moving.fd + (moving.d - moving.fd) * a;
      bit.rotation.y += dt * 8;
      if (a >= 1) {
        g.px = moving.x; g.pd = moving.d; moving = null;
        pushPath(g.px, g.pd);
        syncBlocks();
        if (atSurface()) { sell(); g.fuel = S.fuelCap(); g.hull = HULL_MAX; }
      }
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

  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, 0.62);
  lamp.position.set(px, py, 1.6);
  lamp.distance = S.light();

  const target = FACE_ANGLE[g.face];
  let diff = target - rig.rotation.z;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rig.rotation.z += diff * Math.min(1, dt * 14);

  const t = clamp((g.pd + 2) / 70, 0, 1);
  amb.intensity = 1.7 - 1.5 * t;
  sun.intensity = 1.4 * (1 - t);
  const sky = new THREE.Color(skyOf(g.planet)).lerp(new THREE.Color(0x05070d), t);
  scene.background = sky;
  scene.fog.color = sky;

  const halfW = Math.tan((camera.fov * Math.PI) / 360) * camZ * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const lerpK = g.mode === 'fly' ? 12 : 6;
  camera.position.x += (clamp(px, -lim, lim) - camera.position.x) * Math.min(1, dt * lerpK);
  camera.position.y += (py - 0.8 - camera.position.y) * Math.min(1, dt * (lerpK + 1));
  camera.position.z = camZ;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.2);
  }

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) ui.toast.style.opacity = '0'; }

  updateHUD();
  renderer.render(scene, camera);
}

/* ============ boot ============ */
load();
lamp.distance = S.light();
g.fuel = S.fuelCap();
g.hull = HULL_MAX;
scene.background = new THREE.Color(skyOf(g.planet));
camera.position.set(0, -g.pd - 0.8, 13);
resize();
syncBlocks(true);
updateHUD();
document.getElementById('boot').classList.add('hidden');
window.addEventListener('visibilitychange', save);
setInterval(save, 5000);
requestAnimationFrame(frame);
