import * as THREE from 'three';
import { scene } from './scene';
import { paletteOf, GROWTH_BAND, type GrowthKind } from './sim/config';
import { regionAt } from './sim/region';
import { setRockSurface } from './materials';
import { applyLight } from './lightmap';
import { g, region } from './sim/state';
import { rnd } from './sim/util';

/* What lives, settles or leaks on the rock face.

   Playtest: *"I also want the actual dirt and rocks to change color and
   texture with each planet. add additional details like moss patches, frost,
   plants, oil."*

   The palettes already tinted the stone, which is one channel and not enough:
   twelve worlds all read as the same rock under a different light. This is the
   channel that actually distinguishes them, because it is a THING on the rock
   rather than a filter over it - a wall with moss on it and a wall with frost
   on it are two places, whatever color the stone underneath happens to be.

   ---------- why this was rebuilt, 2026-09-13 ----------

   Playtest: *"There are also some glitches with the plant and frost texture
   that pop in randomly. They also feel a bit low quality. Can you turn these
   into textures or physically different models instead of an overlay?"*

   He is right on all three counts and the cause is one number, measured
   rather than guessed. Growth used to be a flat alpha-masked quad pinned at
   **z = 0.52**, a fifth of a cell in front of a block face at z = 0.5. But the
   rock is not at z = 0.5: `materials.ts` displaces its surface outward by
   `ROCK_BUMP`, which is 0.16 on dirt, 0.20 on stone, 0.30 on a seam and 0.40
   on rubble. So on ordinary stone the rock reaches z = 0.70 and the decal at
   0.52 is INSIDE it, showing only through whatever parts of the noise happen
   to dip below it - and which parts those are changes with the camera. That is
   the "pops in randomly", and it is also the whole of the "low quality": what
   reached the screen was a clipped fragment of a sticker.

   Three things follow, and they are the three he asked for:

   **It is geometry now, not an overlay.** Each kind is a small flat-shaded
   model - tufts, crystal shards, a crust, a slick - lit by the same field the
   rock is, so it takes the lamp and goes dark down a side tunnel like
   everything else. The research is explicit that at this size a flat-shaded
   low-poly game needs real geometry rather than billboards, because the
   silhouette has to survive being looked at from an angle, which is exactly
   what the quads failed at.

   **It is SEATED, not floated.** Every instance is rooted at the block's own
   displacement rather than at a fixed z, so a tuft grows out of the surface it
   is on. Rooted a little under the peak on purpose: a plant whose base is
   buried in the rock and whose body is proud of it is what growing looks like,
   and it makes burial impossible rather than unlikely - there is no depth at
   which the rock can swallow a thing that starts inside it.

   **The kind is the CELL's, not the ship's.** It used to be read from the
   region the ship was in, so crossing a boundary swapped every patch on
   screen at once - a second, quieter pop, and the old comment argued it would
   "look like the growth thinning out rather than like a bug". It does not.
   Each cell asks its own region now, and a mesh per kind is built lazily: at
   most two regions are ever in the window, so at most two of them ever draw.

   ---------- two decisions kept from the first version ----------

   ITS OWN SEED OFFSET. `CLAUDE.md`: anything new that generates content must
   roll on its own offset, because consuming a roll that already exists shifts
   every ore at every depth on every planet - and the diff looks like three
   lines. Growth rolls on (x + 91, d + 29, planet + 131) and reads nothing
   else.

   IT CHANGES NO BLOCK IDS. Growth is drawn ON a cell, it is not a kind of
   cell, so the frozen baseline stays green - and the fact that it does is the
   proof, not the intention. */

/* ---------- the models ----------

   Built in a local frame where +Z points out of the wall, the footprint is
   about one cell across and the body stands in Z. Everything is flat-shaded
   and tiny: these are read at roughly thirty pixels, so the job is silhouette
   and nothing else. `ASSETS.md`'s rule is a measurement - import what the
   player reads at its real size - and a moss tuft at thirty pixels is a SHAPE,
   which is the side of that line where you model it. */

/* Merge transformed primitives into one flat-shaded buffer. Written here
   rather than pulled from three's BufferGeometryUtils example module, which
   this repo does not bundle: six geometries built once at load is not worth a
   dependency, and the whole of it is concatenating two float arrays. */
function merge(parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g2 = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    g2.applyMatrix4(p.m);
    const a = g2.getAttribute('position');
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
    g2.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  /* Computed rather than carried through: the parts are rotated individually
     and a merged flat-shaded surface wants its own face normals. */
  out.computeVertexNormals();
  return out;
}

const M = () => new THREE.Matrix4();
const place = (x: number, y: number, z: number, rx: number, ry: number, rz: number,
               sx: number, sy: number, sz: number) =>
  M().compose(new THREE.Vector3(x, y, z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
              new THREE.Vector3(sx, sy, sz));

/* A deterministic little roll per model, so the six shapes are varied without
   being random at runtime - the geometry is built once and shared by every
   instance of that kind. */
function shapeRand(seedWord: string) {
  let s = seedWord.length * 7919 + 13;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function buildGeo(kind: GrowthKind): THREE.BufferGeometry {
  const r = shapeRand(kind);
  const parts: { geo: THREE.BufferGeometry; m: THREE.Matrix4 }[] = [];

  if (kind === 'moss') {
    /* Low clumps. Four squashed lumps at different sizes, so the silhouette is
       bumpy rather than a single dome. */
    for (let i = 0; i < 4; i++) {
      const s = 0.16 + r() * 0.12;
      parts.push({
        geo: new THREE.IcosahedronGeometry(s, 0),
        m: place((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.02 + r() * 0.04,
                 0, 0, r() * 3.14, 1, 1, 0.5)
      });
    }
  } else if (kind === 'plant') {
    /* Blades. Tapered wedges leaning away from the wall in different
       directions - the one kind whose whole read is that it STANDS OUT of the
       rock, which is precisely what a flat decal could never do. */
    for (let i = 0; i < 5; i++) {
      const h = 0.20 + r() * 0.18;
      const lean = (r() - 0.5) * 0.9;
      parts.push({
        geo: new THREE.ConeGeometry(0.055, h, 3),
        /* +Y in cone space is up the blade; rotate it to lie along +Z, then
           lean it. */
        m: place((r() - 0.5) * 0.52, (r() - 0.5) * 0.52, h * 0.45,
                 Math.PI / 2 + lean * 0.5, 0, lean, 1, 1, 1)
      });
    }
  } else if (kind === 'frost') {
    /* Crystal. Thin spikes at sharp angles, a couple of them long: the read is
       the ANGLES, and angles are exactly what a blurred alpha mask loses. */
    for (let i = 0; i < 6; i++) {
      const h = 0.14 + r() * 0.24;
      parts.push({
        geo: new THREE.ConeGeometry(0.05 + r() * 0.03, h, 4),
        m: place((r() - 0.5) * 0.56, (r() - 0.5) * 0.56, h * 0.4,
                 Math.PI / 2 + (r() - 0.5) * 1.1, 0, (r() - 0.5) * 1.4, 1, 1, 1)
      });
    }
  } else if (kind === 'salt') {
    /* Crust. Small boxes at odd angles, packed low - it reads as something
       that grew in place rather than something that landed. */
    for (let i = 0; i < 7; i++) {
      const s = 0.07 + r() * 0.09;
      parts.push({
        geo: new THREE.BoxGeometry(s, s, s * (0.6 + r())),
        m: place((r() - 0.5) * 0.6, (r() - 0.5) * 0.6, 0.03 + r() * 0.06,
                 (r() - 0.5) * 0.8, (r() - 0.5) * 0.8, r() * 3.14, 1, 1, 1)
      });
    }
  } else if (kind === 'ash') {
    /* Drift. Wide, flat and soft-edged: it has settled ON the rock and its
       silhouette is a low mound, not a spike. */
    for (let i = 0; i < 3; i++) {
      parts.push({
        geo: new THREE.IcosahedronGeometry(0.26 + r() * 0.16, 0),
        m: place((r() - 0.5) * 0.44, (r() - 0.5) * 0.44, 0.01,
                 0, 0, r() * 3.14, 1.2, 1.2, 0.22)
      });
    }
  } else if (kind === 'oil') {
    /* A slick. One very flat lobe plus a smaller one, so it reads as something
       that ran and pooled rather than as a circle. */
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.34, 0),
      m: place(0, 0, 0.01, 0, 0, r() * 3.14, 1.25, 1.0, 0.10)
    });
    parts.push({
      geo: new THREE.IcosahedronGeometry(0.19, 0),
      m: place((r() - 0.5) * 0.5, (r() - 0.5) * 0.5, 0.01, 0, 0, r() * 3.14, 1.1, 1.0, 0.10)
    });
  }
  if (!parts.length) return new THREE.BufferGeometry();
  return merge(parts);
}

/* How each kind takes a light. The three that should CATCH the lamp - frost,
   salt, oil - are smoother and, for oil, a little metallic; the three that
   should absorb it are rough. This is the channel that says "wet" or "mineral"
   or "alive" before any color does. */
const SURFACE: Record<string, { rough: number; metal: number }> = {
  moss: { rough: 0.98, metal: 0.0 },
  plant: { rough: 0.92, metal: 0.0 },
  frost: { rough: 0.28, metal: 0.0 },
  salt: { rough: 0.55, metal: 0.0 },
  ash: { rough: 1.0, metal: 0.0 },
  oil: { rough: 0.18, metal: 0.55 }
};

/* One rebuild can put at most this many patches of ONE kind in the window.
   The window is 29 rows by 21 columns = 609 cells and the densest band rolls
   at 0.30 with a second patch on about a quarter of those, so the real ceiling
   is around 240. Kept well clear of it: an instance budget that binds is a
   patch that silently does not draw, which would be a new way to pop. */
const MAX = 700;

const scratch = new THREE.Object3D();
const col = new THREE.Color();

/* A mesh per kind, built the first time that kind is actually wanted.

   The window spans 21 columns and a region is about 20, so at most two kinds
   are ever on screen and usually one - the rest sit at count 0 and cost
   nothing. This is what lets the kind be the CELL's own rather than the
   ship's, which is what removes the swap-everything-at-once pop. */
type Pool = { mesh: THREE.InstancedMesh; n: number };
const pools = new Map<GrowthKind, Pool>();

function poolFor(kind: GrowthKind): Pool {
  let p = pools.get(kind);
  if (p) return p;
  const s = SURFACE[kind] || { rough: 0.9, metal: 0 };
  /* Standard, not Basic, and lit by the propagated field like the rock it sits
     on. The old version was an unlit MeshBasic tinted by the field, which is
     how a decal is drawn; this is how a thing in the world is drawn, and it is
     most of the difference between "sticker" and "growing there". */
  const mat = applyLight(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: s.rough, metalness: s.metal, flatShading: true
  }));
  const mesh = new THREE.InstancedMesh(buildGeo(kind), mat, MAX);
  mesh.frustumCulled = false;
  mesh.count = 0;
  mesh.castShadow = false;
  scene.add(mesh);
  p = { mesh, n: 0 };
  pools.set(kind, p);
  return p;
}

/* Called by blocks.rebuild() before it walks the window. */
export function beginGrowth() {
  for (const p of pools.values()) p.n = 0;
  /* The stone's own surface, which is still the SHIP's region: it is one
     material for the whole terrain, so it cannot be per cell the way the
     growth now is. */
  const pal = paletteOf(region());
  setRockSurface(pal.rough, pal.bump);
}

/* One rock cell.

   `ao` is the occlusion already computed for the block, and `bump` is that
   block's own displacement amount - the number this whole rewrite is about.
   Passed in rather than looked up here so there is one source for it: blocks.ts
   already has the block in hand, and a second lookup is a second thing that
   can disagree about how far out the rock stands. */
export function addGrowth(x: number, d: number, px: number, py: number, ao: number, bump: number) {
  /* The CELL's region, not the ship's. */
  const pal = paletteOf(regionAt(x, d));
  const kind = pal.growth;
  if (kind === 'none') return;
  const band = GROWTH_BAND[kind];
  if (d < band.from || d > band.to) return;

  /* ITS OWN OFFSET. See the note at the top - this is the line that must never
     be changed to reuse a roll that already exists. */
  const r = rnd(x + 91, d + 29, g.planet + 131);
  if (r > band.chance) return;

  const p = poolFor(kind);
  if (p.n >= MAX - 3) return;

  const r2 = rnd(x + 17, d + 63, g.planet + 131);
  const r3 = rnd(x + 45, d + 8, g.planet + 131);

  /* SEATED ON THE DISPLACED SURFACE. The face is at z = 0.5 and the shader
     pushes it out by up to `bump`; rooting at 0.55 of that puts the base a
     little under the average peak, so the model grows out of the rock instead
     of racing it. Nothing can bury a body that starts inside the surface. */
  const root = 0.5 + bump * 0.55;

  /* One patch, or two on a lucky cell, so a face is uneven rather than
     stamped. */
  const many = r2 > 0.72 ? 2 : 1;
  for (let i = 0; i < many && p.n < MAX - 1; i++) {
    const jx = (i === 0 ? r2 : r3) - 0.5;
    const jy = (i === 0 ? r3 : r2) - 0.5;
    /* SIZE, measured against the frame rather than chosen. The camera frames
       18 rows into 996 px, so one cell is about 55 px and a patch at scale 1
       would be the whole cell - which is what the first pass of this looked
       like: green boulders, not moss. A third of a cell reads as something
       ON the rock at the size it is actually seen. */
    const sc = 0.30 + r3 * 0.22;
    scratch.position.set(px + jx * 0.54, py + jy * 0.54, root);
    /* Spun about the wall's normal, and tipped a little, so a wall of one
       model does not read as one model repeated. */
    scratch.rotation.set((r3 - 0.5) * 0.5, (r2 - 0.5) * 0.5, r2 * Math.PI * 2);
    scratch.scale.set(sc, sc, sc * (0.8 + r2 * 0.5));
    scratch.updateMatrix();
    p.mesh.setMatrixAt(p.n, scratch.matrix);
    /* Jittered so a wall of it is not one flat color, and only LIGHTLY shaded
       by the cell's own occlusion - the lamp is applied by the shader, and
       multiplying by ao on top of that made every patch a dark smudge whatever
       color it was supposed to be. */
    /* Darker than the palette's own color. Growth used to be an UNLIT decal
       multiplied straight by the light field, so it could go fully black down
       a dead tunnel; it is a real lit surface now, which also collects the
       scene ambient, and at full albedo a moss patch was brighter than the
       rock it sits on in ground that should be dark. */
    const f = (0.34 + ao * 0.30) * (0.82 + r3 * 0.36);
    col.setHex(pal.growthColor).multiplyScalar(f);
    p.mesh.setColorAt(p.n, col);
    p.n++;
  }
}

export function finishGrowth() {
  for (const p of pools.values()) {
    p.mesh.count = p.n;
    p.mesh.instanceMatrix.needsUpdate = true;
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
  }
}

/* What grows at a cell, which is a per-CELL fact now rather than a per-ship
   one. Exported for a test that has to find a boundary where the growth
   actually changes - two adjacent regions can share a kind, and a test that
   assumes otherwise passes for the wrong reason. */
export function growthKindAt(x: number, d: number): GrowthKind {
  return paletteOf(regionAt(x, d)).growth;
}

/* For a test: how many patches of each kind the last rebuild placed. */
export function growthCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, p] of pools) out[k] = p.n;
  return out;
}
