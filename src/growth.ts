import * as THREE from 'three';
import { scene } from './scene';
import { paletteOf, GROWTH_BAND, type GrowthKind } from './sim/config';
import { setRockSurface } from './materials';
import { applyLightUnlit } from './lightmap';
import { g } from './sim/state';
import { rnd } from './sim/util';

/* What lives, settles or leaks on the rock face.

   Playtest: *"I also want the actual dirt and rocks to change color and
   texture with each planet. add additional details like moss patches, frost,
   plants, oil."*

   The palettes already tinted the stone, which is one channel and not enough:
   twelve worlds all read as the same rock under a different light. This is the
   channel that actually distinguishes them, because it is a THING on the rock
   rather than a filter over it - a wall with moss on it and a wall with frost
   on it are two places, whatever colour the stone underneath happens to be.

   One signature per world. Six kinds across the twelve, so they repeat, but
   never next to a world that shares one.

   ---- three decisions worth stating ----

   ONE INSTANCED MESH FOR ALL OF IT. Only one kind is ever on screen, because
   only one world is, so the mesh swaps its texture on a planet change rather
   than there being six meshes with five of them empty. That is one extra draw
   call; the budget at 96 m is 66 of 150.

   ITS OWN SEED OFFSET, and this is the one that would cost a day. CLAUDE.md:
   anything new that generates content must roll on its own offset, because
   consuming a roll that already exists shifts every ore at every depth on
   every planet - and the diff looks like three lines. Growth rolls on
   (x + 91, d + 29, planet + 131) and reads nothing else.

   IT CHANGES NO BLOCK IDS. Growth is drawn ON a cell, it is not a kind of
   cell, so the frozen baseline in test/baseline/blocks-preadditive.json stays
   green - and the fact that it does is the proof, not the intention. */

/* A small alpha mask per kind, drawn rather than imported.

   ASSETS.md's rule is a measurement: import what the player reads at its real
   size. A moss patch is forty pixels on a phone and judged as a SHAPE, which
   is the side of that line where you model it - and a photographed lichen
   would drag its own colour and lighting into a flat-shaded world, which is
   the join that shows in the first frame. */
function mask(kind: GrowthKind): THREE.CanvasTexture {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, N, N);
  x.fillStyle = '#fff';

  /* Deterministic, so a screenshot today matches one tomorrow. */
  let seed = kind.length * 7919;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  if (kind === 'moss' || kind === 'ash') {
    /* Clumps. Soft-edged and overlapping, so the patch has a ragged outline
       rather than reading as a printed dot. */
    for (let i = 0; i < 14; i++) {
      const r = (kind === 'moss' ? 9 : 12) + rand() * 9;
      const gx = 12 + rand() * 40, gy = 12 + rand() * 40;
      const grd = x.createRadialGradient(gx, gy, 0, gx, gy, r);
      grd.addColorStop(0, 'rgba(255,255,255,0.95)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = grd;
      x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
    }
  } else if (kind === 'frost' || kind === 'salt') {
    /* Needles from a centre. Frost is long and fine, salt short and blunt. */
    const arms = kind === 'frost' ? 9 : 16;
    x.strokeStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + rand() * 0.4;
      const len = (kind === 'frost' ? 16 : 9) + rand() * 12;
      x.lineWidth = kind === 'frost' ? 1.6 : 3.2;
      x.beginPath();
      x.moveTo(32, 32);
      x.lineTo(32 + Math.cos(a) * len, 32 + Math.sin(a) * len);
      x.stroke();
    }
  } else if (kind === 'plant') {
    /* Fronds off a stem: something that grew rather than settled. */
    x.strokeStyle = 'rgba(255,255,255,0.92)';
    for (let s2 = 0; s2 < 3; s2++) {
      const bx = 18 + s2 * 14, lean = (rand() - 0.5) * 12;
      x.lineWidth = 2.4;
      x.beginPath(); x.moveTo(bx, 58); x.quadraticCurveTo(bx + lean, 40, bx + lean * 1.6, 20); x.stroke();
      x.lineWidth = 1.5;
      for (let f = 0; f < 4; f++) {
        const t = 0.25 + f * 0.2;
        const fx = bx + lean * t * 1.6, fy = 58 - t * 38;
        const dir = f % 2 ? 1 : -1;
        x.beginPath(); x.moveTo(fx, fy); x.lineTo(fx + dir * 9, fy - 5); x.stroke();
      }
    }
  } else if (kind === 'oil') {
    /* A run, not a patch - it has to look like it went somewhere. */
    const grd = x.createLinearGradient(32, 6, 32, 58);
    grd.addColorStop(0, 'rgba(255,255,255,0.05)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = grd;
    x.beginPath();
    x.moveTo(26, 6); x.quadraticCurveTo(18, 30, 27, 58);
    x.lineTo(39, 58); x.quadraticCurveTo(46, 30, 38, 6);
    x.closePath(); x.fill();
    for (let i = 0; i < 3; i++) {
      const gy = 20 + rand() * 34, r = 3 + rand() * 4;
      const gg = x.createRadialGradient(32, gy, 0, 32, gy, r);
      gg.addColorStop(0, 'rgba(255,255,255,0.8)');
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gg;
      x.beginPath(); x.arc(32, gy, r, 0, 7); x.fill();
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const masks = new Map<GrowthKind, THREE.CanvasTexture>();
function maskFor(kind: GrowthKind) {
  if (!masks.has(kind)) masks.set(kind, mask(kind));
  return masks.get(kind)!;
}

const MAX = 900;
const quad = new THREE.PlaneGeometry(1, 1);
const growthMat = applyLightUnlit(new THREE.MeshBasicMaterial({
  transparent: true, depthWrite: false,
  /* NO `vertexColors`. An InstancedMesh's per-instance colour arrives through
     `instanceColor` and three wires that up on its own; setting vertexColors
     as well makes the shader look for a `color` ATTRIBUTE on the geometry,
     and a PlaneGeometry has none - so every patch came out multiplied by zero
     and rendered as a black smudge whatever colour it was given. The rock
     pools get away with it because their chunk geometry does carry one. */
  /* Not additive: moss and oil are things that BLOCK light, not things that
     emit it. Additive turned a wall of moss into a wall of glowing moss, which
     is the tell that a decal is being drawn as a light source. */
  blending: THREE.NormalBlending
}));
/* Through the SAME light field as the rock it sits on. A MeshBasicMaterial is
   unlit, so without this a patch of moss was exactly as bright twenty metres
   into the dark as it was under the lamp - which reads as a sticker rather
   than as something on a wall. applyLightUnlit is the injection the parallax
   silhouettes already use for the same reason. */
export const growthMesh = new THREE.InstancedMesh(quad, growthMat, MAX);
growthMesh.frustumCulled = false;
growthMesh.count = 0;
/* Behind the ship and the haze, in front of the rock face - the same band the
   seam flecks already live in, which is geometry that is known to work. */
growthMesh.renderOrder = 0;
scene.add(growthMesh);

const scratch = new THREE.Object3D();
const col = new THREE.Color();
let n = 0;
let kind: GrowthKind = 'none';

/* Called by blocks.rebuild() before it walks the window. */
export function beginGrowth() {
  n = 0;
  const pal = paletteOf(g.world);
  /* The stone's own surface, not just what grows on it. Set here because this
     already runs on every rebuild - which is every planet change - and one
     call site cannot fall out of step with the palette. */
  setRockSurface(pal.rough, pal.bump);
  if (pal.growth !== kind) {
    kind = pal.growth;
    growthMat.map = kind === 'none' ? null : maskFor(kind);
    growthMat.needsUpdate = true;
  }
}

/* One rock cell. `ao` is the occlusion already computed for the block, so a
   patch in a dark corner is dark with it rather than floating. */
export function addGrowth(x: number, d: number, px: number, py: number, ao: number) {
  if (kind === 'none' || n >= MAX - 3) return;
  const band = GROWTH_BAND[kind];
  if (d < band.from || d > band.to) return;

  /* ITS OWN OFFSET. See the note at the top - this is the line that must never
     be changed to reuse a roll that already exists. */
  const r = rnd(x + 91, d + 29, g.planet + 131);
  if (r > band.chance) return;

  const pal = paletteOf(g.world);
  const r2 = rnd(x + 17, d + 63, g.planet + 131);
  const r3 = rnd(x + 45, d + 8, g.planet + 131);
  /* One patch, or two on a lucky cell, so a face is uneven rather than
     stamped. */
  const many = r2 > 0.72 ? 2 : 1;
  for (let i = 0; i < many; i++) {
    const jx = (i === 0 ? r2 : r3) - 0.5;
    const jy = (i === 0 ? r3 : r2) - 0.5;
    const sc = 0.34 + r3 * 0.34;
    scratch.position.set(px + jx * 0.62, py + jy * 0.62, 0.52);
    scratch.rotation.set(0, 0, (r2 - 0.5) * 1.2);
    scratch.scale.set(sc, sc, 1);
    scratch.updateMatrix();
    growthMesh.setMatrixAt(n, scratch.matrix);
    /* Jittered so a wall of it is not one flat colour, and only LIGHTLY
       shaded by the cell's own occlusion - the lamp is applied by the shader
       now, and multiplying by ao on top of that made every patch a dark smudge
       whatever colour it was supposed to be. */
    const f = (0.55 + ao * 0.45) * (0.8 + r3 * 0.4);
    col.setHex(pal.growthColor).multiplyScalar(f);
    growthMesh.setColorAt(n, col);
    n++;
  }
}

export function finishGrowth() {
  growthMesh.count = n;
  growthMesh.instanceMatrix.needsUpdate = true;
  if (growthMesh.instanceColor) growthMesh.instanceColor.needsUpdate = true;
}
