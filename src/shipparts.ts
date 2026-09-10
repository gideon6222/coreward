/* Imported hardware for the ship, loaded only when the shop is opened.

   Playtest: *"change the ship and part models to look more realistic ... make
   it so each upgraded part changes the look as its upgraded. uses pre-made
   assets like models and textures for the different ship parts."*

   This repo has imported a ship mesh twice and reverted it twice, both times
   with measurements rather than opinions: the ship is about thirty pixels in
   play, a repainted drill tier "did not read" and had to become spark COUNT
   instead, and a downloaded mesh arrives with its own topology, normals and
   sense of scale next to terrain that is flat-shaded low-poly on a hand-tuned
   palette. Both of those findings are still true and neither is being
   overturned here.

   What changed is the screen. The hangar is a place where the ship sits large,
   static and lit while nothing else is happening - which is the pad's own
   argument for importing detail, and it is the one place in this game where a
   thirty-pixel silhouette is not what is being judged. So imported hardware
   goes on the hardpoints, where it is read at full size in the dock and
   contributes only a silhouette in flight, and the hull stays the coded one so
   the ship you look at is still the ship you fly.

   Three rules hold it to the house style:

   1. **The kit's own materials are thrown away.** Every imported mesh is
      re-materialled to the project's convention - roughness about 0.7, metal 0
      unless it is meant to read as bare steel - so a Kenney part and a coded
      part catch the same lamp the same way. An imported mesh lit by its own
      baked guess is the join that shows in the first frame.
   2. **Loaded lazily, in its own chunk.** GLTFLoader is about 15 KB before a
      single model's bytes and the surface is not the first thing on screen, so
      none of it is in the entry bundle.
   3. **Absence is not an error.** If the fetch fails, or the file is missing
      from an older cached precache, the coded hardware that was always there
      stays visible and nothing throws. */

import * as THREE from 'three';

/* Kenney Space Kit, CC0, run through gltf-transform: 6 to 11 KB each after
   optimisation, down from 26 to 39. */
const PARTS = {
  thruster: 'models/ship/machine_generator.glb',
  thrusterBig: 'models/ship/machine_generatorLarge.glb',
  collar: 'models/ship/turret_single.glb'
} as const;

export type PartName = keyof typeof PARTS;

const loaded = new Map<PartName, THREE.Object3D>();
let loading: Promise<void> | null = null;

/* One shared material for everything imported, for the reason in the header:
   the kit's baked look is discarded and the parts join the scene's own
   lighting model instead. Flat-shaded to match the terrain and the pad. */
const partMat = new THREE.MeshStandardMaterial({
  color: 0x8d949e, metalness: 0.55, roughness: 0.68, flatShading: true
});

function dress(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh) return;
    /* The atlas goes too. A kit's colour map is the single thing most likely
       to drag its own hue family into a scene whose colour is decided by a
       twelve-entry palette. */
    m.material = partMat;
    m.castShadow = false;
    m.receiveShadow = false;
  });
  return o;
}

/* Fetch every part once, on the first shop visit. Resolves either way: a
   missing file leaves that entry absent and callers fall back. */
export function loadShipParts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    let GLTFLoader;
    try {
      ({ GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js'));
    } catch (e) {
      return;   /* no loader, no imported hardware, coded parts stand */
    }
    const loader = new GLTFLoader();
    /* base: './' in vite.config, so a relative path is already correct for a
       Pages deploy under /coreward/. Read off the document rather than through
       import.meta.env, which this project's tsconfig does not declare. */
    const base = './';
    await Promise.all((Object.keys(PARTS) as PartName[]).map((k) =>
      new Promise<void>((res) => {
        loader.load(base + PARTS[k],
          (g) => { loaded.set(k, dress(g.scene)); res(); },
          undefined,
          () => res());   /* 404 or parse failure: skip this one, keep the rest */
      })
    ));
  })();
  return loading;
}

/* A fresh copy of a part, or null if it is not here. Cloned per call because
   the same part appears on more than one hardpoint. */
export function shipPart(name: PartName, scale = 1): THREE.Object3D | null {
  const src = loaded.get(name);
  if (!src) return null;
  const o = src.clone(true);
  o.scale.setScalar(scale);
  return o;
}

export function partsReady() { return loaded.size > 0; }
