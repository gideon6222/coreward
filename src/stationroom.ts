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

/* A strip and its hand-made halo. Without a bloom pass an emissive quad is a
   bright line and nothing more; the second, larger, dimmer additive quad
   behind it is what makes the eye read a glow. */
export function neonBar(color: number, w: number, h = 0.05, glow = 3.2): THREE.Group {
  const grp = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color, toneMapped: false })
  );
  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 1.06, h * glow),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.24, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false
    })
  );
  halo.position.z = -0.004;
  grp.add(halo, core);
  return grp;
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
  const consoles: { mesh: THREE.Object3D; bar: THREE.Group; read: () => number }[] = [];
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

  /* --- four plinths, one per group --- */
  const plinths: Plinth[] = [];
  GROUP_ORDER.forEach((name, i) => {
    const grp = new THREE.Group();
    const x = -1.30 + i * 0.87;
    grp.position.set(x, -1.34, 1.55);

    const base = prop(i % 2 === 0 ? 'table-display' : 'table-display-small', gearMat, 0.62);
    if (base) grp.add(base);

    /* The neon that names it: a bar in the group's colour under a small lit
       label, both facing the fixed camera. */
    const bar = neonBar(GROUP_COLOR[name], 0.72, 0.05, 3.6);
    bar.position.set(0, 0.86, 0.3);
    grp.add(bar);

    const label = makeLabel(GROUP_LABEL[name], GROUP_COLOR[name]);
    label.position.set(0, 1.02, 0.3);
    grp.add(label);

    /* A floating sample over the plinth, turning slowly. Deep Rock's rig is
       full of things that do nothing but invite a look, and this is the
       cheapest version of that: an object under glass that moves. */
    const sample = prop('rocks', gearMat, 0.3);
    if (sample) { sample.position.set(0, 0.5, 0); grp.add(sample); }

    /* The down-light, which is the whole of what museum display sources call
       "museum-quality": a cone from directly above onto an object in an
       otherwise dark surround, rather than an evenly lit box. Additive and
       depth-write-free so it reads as light in the air rather than as a solid
       cone sitting over the sample. */
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.34, 0.92, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: GROUP_COLOR[name], transparent: true, opacity: 0.075,
        side: THREE.DoubleSide, depthWrite: false,
        blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    cone.position.set(0, 0.72, 0);
    grp.add(cone);

    /* And a pool of the same light on the plinth top, which is the half that
       makes the cone land on something. */
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(0.3, 16),
      new THREE.MeshBasicMaterial({
        color: GROUP_COLOR[name], transparent: true, opacity: 0.16,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
      })
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, 0.28, 0);
    grp.add(pool);

    /* A wide invisible box for the tap, because the plinth's own geometry is
       thin and a thumb is not. */
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 1.5, 0.8),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.set(0, 0.5, 0);
    grp.add(hit);

    root.add(grp);
    plinths.push({
      name, group: grp, hit,
      setPicked(on: boolean) {
        (bar.children[1] as THREE.Mesh).scale.setScalar(on ? 1.12 : 1);
        ((bar.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = on ? 0.5 : 0.24;
        if (sample) sample.visible = true;
      }
    });
  });

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
        ((c.bar.children[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.16 + v * 0.34;
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
