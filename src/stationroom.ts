/* The Outfitter, rebuilt as a room rather than a wall of cases.

   Playtest: *"I wanted a full overhaul. change how it is layed out completely.
   make it look like a completely different room and less cluttered. I want it
   to feel like a space station with a completely different feel, neon lights
   and realistic textures and models. it should be an open room with display
   cases or something similar and elements that make it feel real, like gauges
   and different artifacts that would be found in a digging space station."*

   What was there: fifteen upgrade cases stacked in two columns either side of
   the ship, which is a menu drawn in 3D. Grouping and heading them helped and
   did not change what it was.

   What it is now, and why each piece is here:

   **Four pedestals, not fifteen cases.** Deep Rock Galactic's Space Rig is the
   sourced pattern - every function at its own named, walked-to station instead
   of one wall of terminals. Here that is four lit display plinths across the
   front of the room, one per group, and the cases for a group only appear when
   its plinth is chosen. Fifteen objects competing for a portrait frame becomes
   four, which is the whole of "less cluttered".

   **The room is dressed with the work.** An ore skip with rock still in it,
   stacked crates, loose samples on the deck, pipe runs along the walls and a
   window onto the planet you are parked over. These are the "artifacts you
   would find in a digging space station" - and they are imported models rather
   than primitives because that is what they are for: props read at full size
   on a screen where nothing is moving.

   **Neon without a bloom pass.** There is no post-processing in this renderer,
   so an emissive strip on its own is just a bright line. Each strip gets a
   second, larger, dimmer quad behind it on additive blending - a hand-made
   halo, which is what sells a light source as glowing when the pipeline cannot
   do it for you. Colours are saturated against a desaturated ambient, which is
   the other half of the trick.

   **The gauges are real.** The consoles on the back wall carry the claim's
   strain, the deepest metre reached and what is in the store shed. `CRAFT.md`
   warns against inventing a symbol for something you can show; the inverse
   applies here, which is that a dial in the fiction showing state the player
   already has is not a duplicate HUD, it is the room knowing what you know. */

import * as THREE from 'three';
import { g } from './sim/state';
import { GROUP_ORDER, GROUP_COLOR, GROUP_LABEL, type GroupName } from './stationsigns';

const PROPS = [
  'table-display', 'table-display-small', 'container', 'container-flat',
  'skip-rocks', 'computer', 'computer-wide', 'pipe', 'pipe-bend', 'rail',
  'floor-panel', 'wall', 'wall-window', 'rocks', 'structure-panel'
] as const;
type PropName = typeof PROPS[number];

const props = new Map<PropName, THREE.Object3D>();
let loading: Promise<void> | null = null;

/* One material family for everything imported, for the reason the ship parts
   use one: a kit's baked look next to a hand-tuned scene is the join that
   shows in the first frame. Two variants only - the deck and the machinery -
   because more than that stops reading as one place. */
const deckMat = new THREE.MeshStandardMaterial({
  color: 0x39404b, metalness: 0.35, roughness: 0.78, flatShading: true
});
const gearMat = new THREE.MeshStandardMaterial({
  color: 0x767f8c, metalness: 0.6, roughness: 0.55, flatShading: true
});

function dress(o: THREE.Object3D, mat: THREE.Material) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (m.isMesh) m.material = mat;
  });
  return o;
}

export function loadStationProps(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    let GLTFLoader;
    try {
      ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'));
    } catch (e) { return; }
    const loader = new GLTFLoader();
    await Promise.all(PROPS.map((p) => new Promise<void>((res) => {
      loader.load('./models/station/' + p + '.glb',
        (gl) => { props.set(p, gl.scene); res(); },
        undefined,
        () => res());
    })));
  })();
  return loading;
}

function prop(name: PropName, mat: THREE.Material, scale = 1): THREE.Object3D | null {
  const src = props.get(name);
  if (!src) return null;
  const o = src.clone(true);
  dress(o, mat);
  o.scale.setScalar(scale);
  return o;
}

/* ---------- neon ---------- */

/* A soft radial falloff, drawn once and shared by every light pool.

   This is the half a bloom pass would otherwise do: light spreading onto the
   surface behind a fitting. A hard-edged coloured plane cannot stand in for it
   - the edge is the tell - so the gradient goes into a texture and the quad
   that carries it is tinted per fitting. */
let fallTex: THREE.CanvasTexture | null = null;
function falloffTexture(): THREE.CanvasTexture {
  if (fallTex) return fallTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const grd = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.34)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grd;
  x.fillRect(0, 0, S, S);
  fallTex = new THREE.CanvasTexture(c);
  return fallTex;
}

/* How many real lights the room has handed out.

   A forward renderer costs every light on every shaded fragment, and the
   three.js forum's practical figure is about ten fixed point lights against a
   typical uniform ceiling near fifteen. Fittings past the cap still get their
   tube, their housing and their light pool - they simply do not get a light of
   their own, which is invisible in a still and cheap in a frame. */
export const NEON_LIGHT_BUDGET = 7;
let lightsUsed = 0;
export function neonLightsUsed() { return lightsUsed; }
export function resetNeonLights() { lightsUsed = 0; }

/* A neon fitting: a tube in a housing, with a light.

   Playtest: *"anything neon should feel like it is actually coming from an
   object or light in the room, not an overlay."* That was a correct read of
   what this used to be - a MeshBasicMaterial plane with an additive quad
   behind it, floating at a fixed z. A lit rectangle, not a lit fitting.

   The sourced recipe names four ingredients and the old version had one:

     1. a TUBE rather than a plane, so it has a lit side and a shaded side
     2. an emissive material on that tube
     3. a HOUSING of ordinary metal around it, lit by the room's own lights -
        the missing ingredient, and the whole reason the old one read as a
        sticker. The eye needs "normally lit" beside "self-lit" in one glance
        before it will believe the second
     4. a real light at the tube, which is what actually puts colour on the
        surfaces near it

   The light pool on the wall behind is the fifth thing, and it is the piece
   that stands in for a bloom pass this renderer does not have. */
export function neonFitting(color: number, len: number, opts: {
  housing?: boolean; light?: number; pool?: number; radius?: number;
} = {}): NeonFitting {
  const grp = new THREE.Group() as NeonFitting;
  const r = opts.radius ?? 0.028;

  /* The housing: a shallow channel the tube sits in, in ordinary lit metal.
     Slightly longer than the tube and open toward the camera. */
  if (opts.housing !== false) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(len + 0.12, r * 2.6, r * 1.6), gearMat);
    back.position.z = -r * 1.5;
    grp.add(back);
    for (const sy of [-1, 1]) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(len + 0.12, r * 0.6, r * 2.6), gearMat);
      lip.position.set(0, sy * r * 1.5, -r * 0.4);
      grp.add(lip);
    }
  }

  /* The tube. Emissive rather than unlit, so the room's own lighting still
     touches its shaded side and it sits in the scene instead of on top of it. */
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(r, r, len, 8, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0b0b0b, emissive: color, emissiveIntensity: 1.0,
      roughness: 0.35, metalness: 0
    })
  );
  tube.rotation.z = Math.PI / 2;
  grp.add(tube);

  /* The light. Short range and no shadow - a point-light shadow is six cube
     faces and this room would pay for it on every fragment. */
  if (lightsUsed < NEON_LIGHT_BUDGET) {
    const l = new THREE.PointLight(color, opts.light ?? 2.4, opts.pool ?? 1.6, 2);
    l.castShadow = false;
    l.position.z = 0.06;
    grp.add(l);
    lightsUsed++;
  }

  /* And the pool it throws on whatever is behind it. */
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(len * 1.5, len * 0.55),
    new THREE.MeshBasicMaterial({
      color, map: falloffTexture(), transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    })
  );
  pool.position.z = -r * 2.2;
  grp.add(pool);

  /* Named handles rather than child indices. The old version was poked at with
     children[0] and children[1] from three different places, which is a
     structure nobody can change without breaking a caller that never said what
     it wanted. */
  (grp as NeonFitting).tube = tube;
  (grp as NeonFitting).pool = pool;
  return grp as NeonFitting;
}

export interface NeonFitting extends THREE.Group {
  tube: THREE.Mesh;
  pool: THREE.Mesh;
}

/* How brightly a fitting is burning, 0 to 1 of its own colour. Drives the
   tube's emissive and the pool together, because a tube that brightens without
   its pool brightening is back to being a sticker. */
export function setNeon(f: NeonFitting, amount: number) {
  const a = Math.max(0, Math.min(1, amount));
  (f.tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + a * 1.15;
  (f.pool.material as THREE.MeshBasicMaterial).opacity = 0.1 + a * 0.34;
}

/* Kept as a thin alias so the callers that only want a lit line still read
   that way. Everything goes through the fitting now. */
export function neonBar(color: number, w: number, _h = 0.05, _glow = 3.2): NeonFitting {
  return neonFitting(color, w);
}

/* ---------- the room ---------- */

export interface Plinth {
  name: GroupName;
  group: THREE.Group;
  hit: THREE.Object3D;
  setPicked(on: boolean): void;
}

export interface Room {
  group: THREE.Group;
  plinths: Plinth[];
  step(t: number): void;
}

/* Built once, the first time the shop is opened and the props have arrived.
   Returns null if nothing loaded, and the caller keeps the old room - a
   missing model must never cost the player the ability to buy anything. */
export function buildRoom(): Room | null {
  if (!props.size) return null;
  /* The room is built once, but a counter that only ever climbs is a slow leak
     waiting for the day something rebuilds it. */
  resetNeonLights();
  const root = new THREE.Group();

  /* --- the deck --- */
  for (let x = -2; x <= 2; x++) {
    for (let z = -2; z <= 1; z++) {
      const p = prop('floor-panel', deckMat, 1.0);
      if (!p) continue;
      p.position.set(x * 1.0, -1.35, z * 1.0);
      root.add(p);
    }
  }

  /* --- the back wall, with a window onto wherever you are parked --- */
  for (let x = -2; x <= 2; x++) {
    const w = prop(x === 0 ? 'wall-window' : 'wall', deckMat, 1.0);
    if (!w) continue;
    w.position.set(x * 1.0, -1.35, -2.5);
    root.add(w);
  }

  /* --- pipe runs, which is most of what says "this is machinery" --- */
  for (const sx of [-2.2, 2.2]) {
    for (let i = 0; i < 4; i++) {
      const p = prop('pipe', gearMat, 1.0);
      if (!p) continue;
      p.position.set(sx, -0.5 + i * 0.02, -2.0 + i * 1.0);
      p.rotation.y = Math.PI / 2;
      root.add(p);
    }
    const b = prop('pipe-bend', gearMat, 1.0);
    if (b) { b.position.set(sx, -0.48, 1.1); root.add(b); }
  }

  /* --- the work: an ore skip, crates and samples on the deck --- */
  const skip = prop('skip-rocks', gearMat, 0.95);
  if (skip) { skip.position.set(-2.15, -1.32, 0.4); skip.rotation.y = 0.5; root.add(skip); }
  const crateA = prop('container', gearMat, 0.9);
  if (crateA) { crateA.position.set(2.15, -1.32, -0.5); crateA.rotation.y = -0.35; root.add(crateA); }
  const crateB = prop('container-flat', gearMat, 0.9);
  if (crateB) { crateB.position.set(2.3, -1.32, 0.5); crateB.rotation.y = 0.2; root.add(crateB); }
  for (const [rx, rz, rr] of [[-1.5, 1.0, 0.4], [1.6, 1.15, -0.9]] as [number, number, number][]) {
    const r = prop('rocks', gearMat, 0.55);
    if (r) { r.position.set(rx, -1.33, rz); r.rotation.y = rr; root.add(r); }
  }

  /* --- the instruments on the back wall --- */
  const consoles: { mesh: THREE.Object3D; bar: NeonFitting; read: () => number }[] = [];
  const READS: { x: number; color: number; read: () => number }[] = [
    { x: -1.35, color: 0xff6b5e, read: () => Math.min(1, g.claim.strain) },
    { x: 0, color: 0x49e0c0, read: () => Math.min(1, g.best.depth / 260) },
    { x: 1.35, color: 0x7fd86a, read: () => {
      let n = 0; for (const k in g.stock) n += g.stock[k]; return Math.min(1, n / 120); } }
  ];
  for (const r of READS) {
    const c = prop('computer', gearMat, 0.8);
    if (!c) continue;
    c.position.set(r.x, -1.34, -2.15);
    root.add(c);
    /* A lit bar across the console face carrying the reading. */
    const bar = neonBar(r.color, 0.5, 0.045, 3.4);
    bar.position.set(r.x, -0.86, -1.98);
    root.add(bar);
    consoles.push({ mesh: c, bar, read: r.read });
  }

  /* --- the counter the display cases stand on ---

     The plinths that used to be here are gone. They named the four upgrade
     groups and filtered the shelf by them, which was a second mechanism bolted
     onto the first and which shipped with the filtering cut - four lit,
     labelled, tappable-looking objects that did nothing, and he found it in the
     first minute.

     The layout is by PRICE now and it lives in station.ts's `layout()`: the
     dear stock on this counter, the rest on the wall behind. Where a thing
     stands is what says which kind it is, so nothing needs a label and nothing
     needs tapping to be revealed. */
  const plinths: Plinth[] = [];
  const counter = prop('table-display', gearMat, 0.9);
  if (counter) { counter.position.set(0, -1.34, 1.62); counter.scale.set(3.1, 0.9, 1.0); root.add(counter); }
  /* A strip under the counter lip, which is the light that makes a glass case
     read as a case. Warm, against the cool room. */
  const lip = neonFitting(0xffc98a, 2.8, { light: 3.0, pool: 2.2 });
  lip.position.set(0, -0.92, 2.12);
  root.add(lip);

  /* And one flat wash over the wall rack behind, which is what says "stock":
     repetition under one even light rather than a highlight per item. */
  const wash = neonFitting(0x8fb6ff, 2.9, { light: 2.2, pool: 2.6 });
  wash.position.set(0, 1.92, -2.1);
  root.add(wash);

  /* A foreground occluder: a rail close to the lens, overlapping the room
     behind it. The diorama sources are consistent that this is what makes a
     fixed-camera scene read as a space with depth rather than as a painted
     backdrop - and it costs one imported model, because the camera never moves
     far enough to reveal that there is nothing behind it. */
  const fg = prop('rail', gearMat, 1.15);
  if (fg) { fg.position.set(-0.2, -1.32, 3.6); root.add(fg); }

  let t0 = 0;
  return {
    group: root,
    plinths,
    step(t: number) {
      t0 = t;
      /* The consoles read live state. */
      for (const c of consoles) {
        const v = c.read();
        c.bar.scale.x = 0.08 + v * 0.92;
        setNeon(c.bar, v);
      }
      /* The samples turn. */
      for (const p of plinths) {
        const s = p.group.children.find((c) => c.type === 'Group' && c !== p.group);
        if (s) s.rotation.y = t0 * 0.35;
      }
    }
  };
}

/* A small lit label, drawn to a canvas and measured to fit - the same
   measure-and-shrink the shop plates and the group headers both needed. */
function makeLabel(text: string, color: number): THREE.Mesh {
  const W = 256, H = 56;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const col = '#' + color.toString(16).padStart(6, '0');
  x.fillStyle = col;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.letterSpacing = '2px';
  let size = 34;
  do {
    x.font = '700 ' + size + 'px "Chakra Petch", system-ui, sans-serif';
    if (x.measureText(text).width <= W - 16) break;
    size -= 2;
  } while (size > 12);
  x.fillText(text, W / 2, H / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 0.17),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false })
  );
  m.renderOrder = 3;
  return m;
}
