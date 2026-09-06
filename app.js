import * as THREE from 'three';

/* ============ config ============ */
const W = 9;
const SAVE_KEY = 'coreward.v1';
const HULL_MAX = 100;
const DIG_BASE = 0.5;
const FUEL_RATE = 1.0;

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

const ORES = [
  { id: 'coreite',  name: 'Coreite',  color: 0x66fff0, hard: 16,  value: 3000, min: 185, chance: 0.030, glow: 0.55 },
  { id: 'magmite',  name: 'Magmite',  color: 0xff7a18, hard: 13,  value: 1300, min: 145, chance: 0.038, glow: 0.45 },
  { id: 'ruby',     name: 'Ruby',     color: 0xff3b5c, hard: 10,  value: 650,  min: 105, chance: 0.042, glow: 0.25 },
  { id: 'emerald',  name: 'Emerald',  color: 0x2fd07a, hard: 8.5, value: 360,  min: 78,  chance: 0.048, glow: 0.22 },
  { id: 'amethyst', name: 'Amethyst', color: 0xa060ff, hard: 7,   value: 190,  min: 56,  chance: 0.055, glow: 0.2 },
  { id: 'gold',     name: 'Gold',     color: 0xffcf47, hard: 5.5, value: 88,   min: 36,  chance: 0.06,  glow: 0.14 },
  { id: 'silver',   name: 'Silver',   color: 0xd8e0e8, hard: 4.5, value: 40,   min: 22,  chance: 0.07,  glow: 0.08 },
  { id: 'iron',     name: 'Iron',     color: 0xb0b6bd, hard: 3.5, value: 17,   min: 11,  chance: 0.085, glow: 0.05 },
  { id: 'copper',   name: 'Copper',   color: 0xc87137, hard: 2.6, value: 7,    min: 4,   chance: 0.10,  glow: 0.05 }
];

function baseRock(d) {
  if (d < 10) return { id: 'dirt',    name: 'Dirt',    color: 0x6b4b2a, hard: 1,   value: 0, glow: 0.02 };
  if (d < 60) return { id: 'stone',   name: 'Stone',   color: 0x807a72, hard: 2.4, value: 1, glow: 0.02 };
  if (d < 130) return { id: 'granite', name: 'Granite', color: 0x5e5a66, hard: 5,  value: 3, glow: 0.02 };
  return { id: 'basalt', name: 'Basalt', color: 0x3a3540, hard: 9, value: 8, glow: 0.03 };
}

const UPGRADES = [
  { key: 'drill',  name: 'Drill Bit',      base: 70,  mul: 2.05, max: 9,
    tiers: ['Steel', 'Tungsten', 'Carbide', 'Diamond', 'Ionized', 'Plasma', 'Graviton', 'Singularity', 'Starbreaker', 'Godcore'],
    effect: (l) => 'Power ' + (1 + l * 0.95).toFixed(2) + 'x' },
  { key: 'cargo',  name: 'Cargo Hold',     base: 55,  mul: 1.95, max: 9,
    effect: (l) => (12 + l * 11) + ' units' },
  { key: 'thrust', name: 'Thrusters',      base: 65,  mul: 1.90, max: 9,
    effect: (l) => (3.0 + l * 0.7).toFixed(1) + ' cells/s' },
  { key: 'tank',   name: 'Fuel Tank',      base: 60,  mul: 1.90, max: 9,
    effect: (l) => (60 + l * 32) + ' fuel' },
  { key: 'cool',   name: 'Cooling Rig',    base: 120, mul: 2.10, max: 9,
    effect: (l) => Math.round(Math.min(0.92, l * 0.11) * 100) + '% heat shield' },
  { key: 'scan',   name: 'Scanner Array',  base: 85,  mul: 1.85, max: 9,
    effect: (l) => (8 + l * 2.4).toFixed(0) + 'm light' },
  { key: 'beacon', name: 'Return Beacon',  base: 100, mul: 2.00, max: 9,
    effect: (l) => Math.round(Math.max(0.1, 1 - l * 0.1) * 100) + '% return cost' }
];
const costOf = (u, lvl) => Math.round(u.base * Math.pow(u.mul, lvl));

/* ============ state ============ */
const g = {
  planet: 0,
  credits: 0,
  shards: 0,
  up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, beacon: 0 },
  dug: new Set(),
  px: Math.floor(W / 2),
  pd: -1,
  fuel: 60,
  hull: HULL_MAX,
  cargo: {},
  cargoCount: 0,
  mode: 'play'
};

const S = {
  drill: () => (1 + g.up.drill * 0.95) * (1 + g.shards * 0.08),
  cargoCap: () => 12 + g.up.cargo * 11,
  speed: () => 3.0 + g.up.thrust * 0.7,
  fuelCap: () => 60 + g.up.tank * 32,
  shield: () => Math.min(0.92, g.up.cool * 0.11),
  light: () => 8 + g.up.scan * 2.4,
  returnMul: () => Math.max(0.1, 1 - g.up.beacon * 0.1)
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
  if (d > cd) return { id: 'bedrock', name: 'Bedrock', color: 0x1a1820, hard: Infinity, value: 0, glow: 0.02 };
  if (d === cd) return { id: 'core', name: 'Planet Core', color: 0xfff2a0, hard: 26 * hardMult(g.planet), value: 0, glow: 0.9, core: true };
  const hm = hardMult(g.planet), vm = valueMult(g.planet);
  const r = rnd(x, d, g.planet);
  for (const o of ORES) {
    if (d >= o.min && r < o.chance) {
      return { id: o.id, name: o.name, color: o.color, glow: o.glow, hard: o.hard * hm, value: Math.round(o.value * vm) };
    }
  }
  const b = baseRock(d);
  return { id: b.id, name: b.name, color: b.color, glow: b.glow, hard: b.hard * hm, value: Math.round(b.value * vm) };
}

/* ============ three ============ */
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
document.getElementById('game').appendChild(renderer.domElement);

const fogCol = new THREE.Color(0x05070d);
scene.fog = new THREE.Fog(fogCol.getHex(), 16, 40);
scene.background = new THREE.Color(skyOf(0));

const amb = new THREE.AmbientLight(0xffffff, 1.6);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(4, 10, 8);
scene.add(sun);
const lamp = new THREE.PointLight(0xffd9a0, 26, S.light(), 1.3);
scene.add(lamp);

const geo = new THREE.BoxGeometry(0.98, 0.98, 0.98);
const matCache = new Map();
function mat(color, glow) {
  const k = color + '|' + (glow || 0);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshLambertMaterial({
      color: color,
      emissive: new THREE.Color(color).multiplyScalar(glow || 0.02)
    }));
  }
  return matCache.get(k);
}

const worldX = (x) => x - (W - 1) / 2;

/* player */
const player = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.BoxGeometry(0.62, 0.6, 0.62),
  new THREE.MeshLambertMaterial({ color: 0x2fd4ff, emissive: 0x0a3a4a })
);
player.add(body);
const bit = new THREE.Mesh(
  new THREE.ConeGeometry(0.24, 0.42, 10),
  new THREE.MeshLambertMaterial({ color: 0xf0f4ff, emissive: 0x333a4a })
);
bit.position.y = -0.48;
bit.rotation.x = Math.PI;
player.add(bit);
const cab = new THREE.Mesh(
  new THREE.SphereGeometry(0.2, 12, 10),
  new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0x7a5a10 })
);
cab.position.set(0, 0.16, 0.3);
player.add(cab);
scene.add(player);

/* surface pad */
const pad = new THREE.Group();
const slab = new THREE.Mesh(
  new THREE.BoxGeometry(4.2, 0.2, 1.4),
  new THREE.MeshLambertMaterial({ color: 0x39424f, emissive: 0x0c1016 })
);
slab.position.y = 0.6;
pad.add(slab);
for (const sx of [-1.9, 1.9]) {
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: 0x59636f })
  );
  post.position.set(sx, 1.2, 0);
  pad.add(post);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.16, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0x66ffcc, emissive: 0x33ffbb })
  );
  tip.position.set(sx, 1.8, 0);
  pad.add(tip);
}
pad.position.x = worldX(Math.floor(W / 2));
scene.add(pad);

/* blocks */
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
        const m = new THREE.Mesh(geo, mat(b.color, b.glow));
        m.position.set(worldX(x), -d, 0);
        scene.add(m);
        meshes.set(k, m);
      }
    }
  }
  for (const [k, m] of meshes) {
    if (!need.has(k)) { scene.remove(m); meshes.delete(k); }
  }
}

/* particles */
let burst = null;
function explode(x, y) {
  const n = 420;
  const pos = new Float32Array(n * 3);
  const vel = [];
  for (let i = 0; i < n; i++) {
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 0;
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    const s = 5 + Math.random() * 16;
    vel.push(new THREE.Vector3(Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s, Math.sin(a) * Math.cos(b) * s * 0.4));
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(bg, new THREE.PointsMaterial({
    color: 0xffd070, size: 0.4, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  scene.add(pts);
  burst = { pts: pts, vel: vel, t: 0 };
}

/* ============ ui ============ */
const el = (id) => document.getElementById(id);
const ui = {
  planet: el('planet'), credits: el('credits'), depth: el('depth'),
  fuel: el('fuelBar'), hull: el('hullBar'), cargoBar: el('cargoBar'), cargoTxt: el('cargoTxt'),
  toast: el('toast'), shop: el('shop'), shopCredits: el('shopCredits'), upgrades: el('upgrades'),
  event: el('event'), evTitle: el('evTitle'), evBody: el('evBody'), evBtn: el('evBtn'),
  flash: el('flash'), btnShop: el('btnShop'), btnReturn: el('btnReturn')
};

let toastT = 0;
function toast(msg) {
  ui.toast.textContent = msg;
  ui.toast.style.opacity = '1';
  toastT = 1.8;
}

function flash(color, ms) {
  ui.flash.style.background = color;
  ui.flash.style.opacity = '1';
  setTimeout(() => { ui.flash.style.opacity = '0'; }, ms || 220);
}

function updateHUD() {
  ui.planet.textContent = planetName(g.planet);
  ui.credits.textContent = Math.floor(g.credits).toLocaleString();
  const depth = Math.max(0, Math.round(g.pd));
  ui.depth.textContent = 'DEPTH ' + depth + ' m   /   CORE ' + coreDepth(g.planet) + ' m';
  ui.fuel.style.width = clamp(g.fuel / S.fuelCap(), 0, 1) * 100 + '%';
  ui.hull.style.width = clamp(g.hull / HULL_MAX, 0, 1) * 100 + '%';
  ui.cargoBar.style.width = clamp(g.cargoCount / S.cargoCap(), 0, 1) * 100 + '%';
  ui.cargoTxt.textContent = 'CARGO ' + g.cargoCount + '/' + S.cargoCap();
  ui.btnShop.style.display = atSurface() ? '' : 'none';
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
      '<div class="upeff">Lv ' + lvl + '/' + u.max + ' · ' + u.effect(lvl) +
      (maxed ? '' : ' → ' + u.effect(lvl + 1)) + '</div></div>';
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
      save();
      buildShop();
      updateHUD();
      flash('rgba(120,255,200,.25)', 160);
    };
    row.appendChild(btn);
    ui.upgrades.appendChild(row);
  }
}

/* ============ actions ============ */
const atSurface = () => g.pd <= -0.6;

function sell() {
  let total = 0, count = 0;
  for (const k in g.cargo) { total += g.cargo[k]; count++; }
  if (total <= 0) return;
  g.credits += total;
  g.cargo = {};
  g.cargoCount = 0;
  toast('Sold haul for ◈ ' + Math.floor(total).toLocaleString());
  save();
}

function goSurface(free) {
  g.px = Math.floor(W / 2);
  g.pd = -1;
  moving = null;
  digging = null;
  g.fuel = S.fuelCap();
  g.hull = HULL_MAX;
  syncBlocks(true);
  if (!free) sell();
  save();
}

function tryReturn() {
  if (atSurface()) { toast('Already at the surface'); return; }
  const cost = Math.round(g.pd * 0.35 * S.returnMul());
  if (g.fuel < cost) { toast('Need ' + cost + ' fuel to return'); return; }
  g.fuel -= cost;
  flash('rgba(110,220,255,.35)', 260);
  goSurface(false);
}

function rescue(reason) {
  for (const k in g.cargo) g.cargo[k] = Math.floor(g.cargo[k] / 2);
  g.cargoCount = Math.floor(g.cargoCount / 2);
  flash('rgba(255,80,80,.4)', 400);
  goSurface(true);
  sell();
  showEvent('RESCUED', reason + ' A salvage drone hauled you back to the pad. Half your cargo was lost.', 'CONTINUE', () => {});
}

function showEvent(title, bodyTxt, btnTxt, cb) {
  g.mode = 'event';
  ui.evTitle.textContent = title;
  ui.evBody.textContent = bodyTxt;
  ui.evBtn.textContent = btnTxt;
  ui.event.classList.remove('hidden');
  ui.evBtn.onclick = () => {
    ui.event.classList.add('hidden');
    g.mode = 'play';
    cb();
  };
}

function breakCore() {
  g.mode = 'boom';
  explode(worldX(g.px), -g.pd);
  flash('rgba(255,255,255,.95)', 700);
  setTimeout(() => {
    g.shards++;
    const next = g.planet + 1;
    showEvent(
      planetName(g.planet).toUpperCase() + ' DESTROYED',
      'The core gave way and the planet tore itself apart. You recovered a Core Shard (+8% drill power, permanent). ' +
      'Total shards: ' + g.shards + '. Next stop: ' + planetName(next) + ', where the crust is tougher and the veins run richer.',
      'LAUNCH TO ' + planetName(next).toUpperCase(),
      () => {
        g.planet = next;
        g.dug = new Set();
        scene.background = new THREE.Color(skyOf(g.planet));
        goSurface(true);
        for (const [, m] of meshes) scene.remove(m);
        meshes.clear();
        syncBlocks(true);
        if (burst) { scene.remove(burst.pts); burst = null; }
        save();
      }
    );
  }, 1500);
}

/* ============ input ============ */
let held = null;
let moving = null;
let digging = null;

function press(dir) { held = dir; }
function release(dir) { if (held === dir) held = null; }

document.querySelectorAll('#dpad .k').forEach((b) => {
  const dir = b.dataset.dir;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('on'); press(dir); });
  const up = (e) => { if (e) e.preventDefault(); b.classList.remove('on'); release(dir); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('pointerleave', up);
});

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
window.addEventListener('keydown', (e) => { if (KEYS[e.key]) { held = KEYS[e.key]; e.preventDefault(); } });
window.addEventListener('keyup', (e) => { if (KEYS[e.key] && held === KEYS[e.key]) held = null; });

ui.btnReturn.onclick = tryReturn;
ui.btnShop.onclick = () => { if (!atSurface()) return; g.mode = 'shop'; buildShop(); ui.shop.classList.remove('hidden'); };
el('shopClose').onclick = () => { ui.shop.classList.add('hidden'); g.mode = 'play'; };
document.addEventListener('contextmenu', (e) => e.preventDefault());

/* ============ save ============ */
function save() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      planet: g.planet, credits: g.credits, shards: g.shards, up: g.up,
      dug: Array.from(g.dug), cargo: g.cargo, cargoCount: g.cargoCount
    }));
  } catch (e) { /* storage full or blocked */ }
}
function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    g.planet = s.planet || 0;
    g.credits = s.credits || 0;
    g.shards = s.shards || 0;
    Object.assign(g.up, s.up || {});
    g.dug = new Set(s.dug || []);
    g.cargo = s.cargo || {};
    g.cargoCount = s.cargoCount || 0;
  } catch (e) { /* corrupt save, start fresh */ }
}

/* ============ loop ============ */
function step(dir) {
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  return { x: g.px + d[0], d: Math.round(g.pd) + d[1] };
}

function startAction() {
  if (!held || moving || digging) return;
  const t = step(held);
  if (t.x < 0 || t.x >= W) return;
  if (t.d < -3) return;
  if (t.d > coreDepth(g.planet)) return;
  const b = blockAt(t.x, t.d);
  if (b) {
    if (b.hard === Infinity) return;
    if (g.cargoCount >= S.cargoCap() && b.value > 0) { toast('Cargo full — head back up'); return; }
    const total = (b.hard * DIG_BASE) / S.drill();
    digging = { x: t.x, d: t.d, t: 0, total: total, block: b };
  } else {
    moving = { x: t.x, d: t.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
  }
}

let camZ = 13;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const rows = 13;
  const halfV = Math.tan((camera.fov * Math.PI) / 360);
  let z = rows / (2 * halfV);
  const needW = (W + 2) / camera.aspect;
  if (needW < rows) z = Math.max(9, needW / (2 * halfV));
  camZ = z;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

let last = performance.now();
let shake = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (g.mode === 'play') {
    startAction();

    if (digging) {
      digging.t += dt;
      g.fuel -= FUEL_RATE * dt;
      const k = key(digging.x, digging.d);
      const m = meshes.get(k);
      if (m) m.scale.setScalar(1 - 0.55 * (digging.t / digging.total));
      bit.rotation.y += dt * 22;
      if (digging.t >= digging.total) {
        const b = digging.block;
        g.dug.add(k);
        if (m) { scene.remove(m); meshes.delete(k); }
        if (b.core) { digging = null; breakCore(); }
        else {
          if (b.value > 0) {
            g.cargo[b.id] = (g.cargo[b.id] || 0) + b.value;
            g.cargoCount++;
            if (b.value >= 100) toast(b.name + '  +◈ ' + b.value.toLocaleString());
          }
          moving = { x: digging.x, d: digging.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
          digging = null;
          save();
        }
      }
    } else if (moving) {
      moving.t += dt;
      g.fuel -= FUEL_RATE * 0.6 * dt;
      const a = clamp(moving.t / moving.total, 0, 1);
      g.px = moving.fx + (moving.x - moving.fx) * a;
      g.pd = moving.fd + (moving.d - moving.fd) * a;
      bit.rotation.y += dt * 6;
      if (a >= 1) {
        g.px = moving.x; g.pd = moving.d;
        moving = null;
        syncBlocks();
        if (atSurface()) { sell(); g.fuel = S.fuelCap(); g.hull = HULL_MAX; }
      }
    }

    /* heat */
    if (g.pd > 60) {
      const exposure = (g.pd - 60) / 60;
      g.hull -= exposure * 3.2 * (1 - S.shield()) * dt;
    } else if (atSurface()) {
      g.hull = Math.min(HULL_MAX, g.hull + 30 * dt);
      g.fuel = S.fuelCap();
    }

    if (g.fuel <= 0) { g.fuel = 0; rescue('You ran dry.'); }
    else if (g.hull <= 0) { g.hull = 1; rescue('Your hull buckled in the heat.'); }
  }

  if (burst) {
    burst.t += dt;
    const p = burst.pts.geometry.attributes.position;
    for (let i = 0; i < burst.vel.length; i++) {
      p.array[i * 3] += burst.vel[i].x * dt;
      p.array[i * 3 + 1] += burst.vel[i].y * dt;
      p.array[i * 3 + 2] += burst.vel[i].z * dt;
      burst.vel[i].multiplyScalar(0.965);
    }
    p.needsUpdate = true;
    burst.pts.material.opacity = Math.max(0, 1 - burst.t / 3);
    shake = Math.max(shake, 0.5 * Math.max(0, 1 - burst.t));
  }

  /* visuals */
  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, 0.62);
  lamp.position.set(px, py, 1.6);
  lamp.distance = S.light();

  const t = clamp((g.pd + 2) / 70, 0, 1);
  amb.intensity = 1.7 - 1.45 * t;
  sun.intensity = 1.4 * (1 - t);
  const sky = new THREE.Color(skyOf(g.planet)).lerp(new THREE.Color(0x05070d), t);
  scene.background = sky;
  scene.fog.color = sky;
  scene.fog.near = 14;
  scene.fog.far = 34;

  const halfW = Math.tan((camera.fov * Math.PI) / 360) * camZ * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const camTX = clamp(px, -lim, lim);
  const camTY = py - 0.8;
  camera.position.x += (camTX - camera.position.x) * Math.min(1, dt * 6);
  camera.position.y += (camTY - camera.position.y) * Math.min(1, dt * 7);
  camera.position.z = camZ;
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dt * 1.2);
  }

  if (toastT > 0) {
    toastT -= dt;
    if (toastT <= 0) ui.toast.style.opacity = '0';
  }

  updateHUD();
  renderer.render(scene, camera);
}

/* ============ boot ============ */
load();
lamp.distance = S.light();
g.fuel = S.fuelCap();
g.hull = HULL_MAX;
scene.background = new THREE.Color(skyOf(g.planet));
camera.position.set(0, 0, 13);
resize();
syncBlocks(true);
updateHUD();
document.getElementById('boot').classList.add('hidden');
window.addEventListener('visibilitychange', save);
setInterval(save, 5000);
requestAnimationFrame(frame);
