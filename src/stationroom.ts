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
import { SHIP_LAYER } from './scene';

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

/* ---------- the steampunk half ----------

   Playtest: *"I was hoping for more of a mix of cyberpunk, matrix, and steam
   punk."*

   Three styles in one room is a recipe for mud unless each is given a JOB, and
   the research is clear about what each one is actually made of:

     steampunk  is MATERIALS AND PROPS - brass, copper, riveted iron, pipes,
                gauges with needles, valve wheels. It reads through albedo and
                silhouette and needs no lighting trick at all, which is exactly
                why it can be everywhere. It is the room.
     cyberpunk  is LIGHT - saturated magenta and cyan rationed against a warm
                base. It is the signage and nothing else.
     Matrix     is INFORMATION, on one surface, kept monochrome. See crtTexture.

   So these three are the building, and every one of them is high metalness and
   low roughness: brass that does not catch a light is painted wood. */
export const brassMat = new THREE.MeshStandardMaterial({
  color: 0xb8863c, metalness: 0.95, roughness: 0.32, flatShading: true
});
export const copperMat = new THREE.MeshStandardMaterial({
  color: 0x9c5a32, metalness: 0.9, roughness: 0.4, flatShading: true
});
/* Riveted iron: dark, and rough enough that the brass beside it reads as the
   precious one. A room of nothing but brass is a trumpet. */
export const ironMat = new THREE.MeshStandardMaterial({
  color: 0x32302c, metalness: 0.65, roughness: 0.74, flatShading: true
});

/* Rivets, as one instanced mesh for the whole room.

   The single cheapest thing that says "built, and built a long time ago". Six
   hundred of them cost one draw call, which is the only reason they are
   affordable at all - six hundred meshes would not be. */
const rivetGeo = new THREE.SphereGeometry(0.018, 5, 3);
export function rivetRow(into: THREE.Object3D, x0: number, y: number, z: number,
                         len: number, n: number) {
  const m = new THREE.InstancedMesh(rivetGeo, brassMat, n);
  const t = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    t.position.set(x0 + (len * i) / Math.max(1, n - 1), y, z);
    t.updateMatrix();
    m.setMatrixAt(i, t.matrix);
  }
  m.frustumCulled = false;
  into.add(m);
  return m;
}

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

/* ---------- the Matrix terminal ----------

   ONE surface in the whole room, and that exclusivity is the entire technique
   rather than a budget decision.

   The sourced finding: the film's green is a MONOCHROME grade - phosphor
   #00ff41 on near-black, with brighter near-white-green at the hot points and
   no other saturated hue allowed in the same read. It is not one neon among
   several. Put it next to the magenta and the cyan on equal terms and both
   identities cancel: the green stops reading as "a screen from that film" and
   becomes "a third coloured light", and the cyberpunk pair stops reading as a
   pair. So it gets a terminal, the terminal is green and black and nothing
   else, and no fitting in this room is ever that colour.

   It also costs almost nothing, which is the part that makes it viable here.
   Falling glyph columns on a canvas at twelve frames a second, with the
   scanlines drawn INTO the texture rather than added by a post pass this
   renderer does not have. A CRT is one of the few things that is easier
   without post-processing than with it. */
const CRT_W = 256, CRT_H = 320;
const GLYPHS = '01<>[]{}/\\|=+*#%$@&ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const COLS = 16;
const CELL = CRT_W / COLS;
const ROWS = Math.floor(CRT_H / 16);

export interface Crt {
  mesh: THREE.Mesh;
  step(t: number): void;
}

export function makeCrt(w = 1.0, h = 1.25): Crt {
  const c = document.createElement('canvas');
  c.width = CRT_W; c.height = CRT_H;
  const x = c.getContext('2d')!;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;

  /* One head per column, each falling at its own rate. Seeded off the column
     index rather than Math.random, for the same reason everything else in this
     repo is: a screen that looks different every time you open the shop is a
     screen you cannot photograph and compare. */
  const head: number[] = [], rate: number[] = [];
  for (let i = 0; i < COLS; i++) {
    head[i] = ((i * 7919) % 97) / 97 * ROWS;
    rate[i] = 6 + ((i * 104729) % 11);
  }

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    /* Unlit and toneMapped off: a CRT emits, it is not lit. This is the one
       place in the room where MeshBasicMaterial is the honest answer rather
       than the lazy one. */
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
  );

  let acc = 0, last = 0;
  return {
    mesh,
    step(t: number) {
      /* Twelve frames a second, not sixty. A canvas redraw plus a texture
         upload every frame for a decorative screen is the kind of cost that
         does not show up until it is on a phone - and the effect is BETTER
         slow, because real phosphor lags. */
      if (t - last < 1 / 12) return;
      acc += t - last;
      last = t;

      x.fillStyle = '#050a06';
      x.fillRect(0, 0, CRT_W, CRT_H);
      x.font = '700 13px "Chakra Petch", monospace';
      x.textAlign = 'center';
      for (let i = 0; i < COLS; i++) {
        head[i] = (head[i] + acc * rate[i] * 0.12) % (ROWS + 14);
        const hy = Math.floor(head[i]);
        /* A tail of fourteen, fading from the near-white head down into the
           black. The head being WHITER than the green is the detail that makes
           it read as falling rather than as a static gradient. */
        for (let k = 0; k < 14; k++) {
          const r = hy - k;
          if (r < 0 || r > ROWS) continue;
          const gi = (i * 31 + r * 17 + Math.floor(head[i])) % GLYPHS.length;
          x.fillStyle = k === 0 ? '#ccffcc'
            : 'rgba(0,255,65,' + (0.85 * (1 - k / 14)).toFixed(3) + ')';
          x.fillText(GLYPHS[gi], i * CELL + CELL / 2, r * 16 + 13);
        }
      }
      /* Scanlines, drawn in. Every other row darkened is what a phosphor tube
         looks like and what a bloom pass would never give you anyway. */
      x.fillStyle = 'rgba(0,0,0,0.30)';
      for (let y = 0; y < CRT_H; y += 3) x.fillRect(0, y, CRT_W, 1);
      acc = 0;
      tex.needsUpdate = true;
    }
  };
}

/* ---------- an analogue gauge ----------

   The steampunk half's one moving part. A brass bezel, a dark face, a red
   needle, and the needle reads REAL state - the claim's strain, the deepest
   metre, what is in the shed. `CRAFT.md` warns against inventing a symbol for
   something you can show; a dial in the fiction showing state the player
   already has is not a duplicate HUD, it is the room knowing what you know. */
export interface Gauge {
  group: THREE.Group;
  set(v: number): void;
}

function gaugeFaceTexture(label: string): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  x.fillStyle = '#12100c';
  x.beginPath(); x.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2); x.fill();
  /* Ticks around the top 240 degrees, which is what a real dial uses. */
  x.strokeStyle = '#d8c89a';
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * 0.9 + (i / 10) * Math.PI * 1.2;
    const r0 = S / 2 - 8, r1 = i % 5 === 0 ? S / 2 - 20 : S / 2 - 14;
    x.lineWidth = i % 5 === 0 ? 2.5 : 1.2;
    x.beginPath();
    x.moveTo(S / 2 + Math.cos(a) * r0, S / 2 + Math.sin(a) * r0);
    x.lineTo(S / 2 + Math.cos(a) * r1, S / 2 + Math.sin(a) * r1);
    x.stroke();
  }
  x.fillStyle = '#b8a473';
  x.font = '700 13px "Chakra Petch", system-ui, sans-serif';
  x.textAlign = 'center';
  x.fillText(label, S / 2, S * 0.74);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function makeGauge(label: string, r = 0.2): Gauge {
  const grp = new THREE.Group();
  /* The bezel is a torus of real brass, lit by the room. That is the whole
     reason the dial reads as an object rather than as a picture of one. */
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.11, 6, 18), brassMat);
  grp.add(bezel);
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(r * 0.94, 20),
    new THREE.MeshStandardMaterial({ map: gaugeFaceTexture(label), roughness: 0.55, metalness: 0.1 })
  );
  face.position.z = -0.006;
  grp.add(face);
  /* The needle pivots at its own end, so it swings rather than slides: the
     geometry is offset inside a pivot group instead of the mesh being rotated
     about its centre. */
  const pivot = new THREE.Group();
  const needle = new THREE.Mesh(
    new THREE.BoxGeometry(r * 0.78, r * 0.045, 0.008),
    new THREE.MeshStandardMaterial({ color: 0xd83c2c, roughness: 0.5, metalness: 0.2 })
  );
  needle.position.x = r * 0.34;
  pivot.add(needle);
  pivot.position.z = 0.012;
  grp.add(pivot);
  grp.add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.1, r * 0.1, 0.02, 8),
    brassMat).rotateX(Math.PI / 2));

  let shown = 0;
  return {
    group: grp,
    set(v: number) {
      /* Eased toward the reading rather than snapped to it, because a real
         needle has mass and a snapping one reads as a number pretending to be
         a dial. */
      shown += (Math.max(0, Math.min(1, v)) - shown) * 0.12;
      pivot.rotation.z = Math.PI * 0.9 + shown * Math.PI * 1.2;
    }
  };
}

/* ---------- neon ---------- */

/* A soft radial falloff, drawn once and shared by every light pool.

   This is the half a bloom pass would otherwise do: light spreading onto the
   surface behind a fitting. A hard-edged coloured plane cannot stand in for it
   - the edge is the tell - so the gradient goes into a texture and the quad
   that carries it is tinted per fitting. */
let fallTex: THREE.CanvasTexture | null = null;
export function falloffTexture(): THREE.CanvasTexture {
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

/* ---------- glow without a bloom pass ----------

   The sourced technique, and it is the one thing that was actually missing
   from round five's fittings. A tube with an emissive material and no bloom
   behind it is a bright line: the light stops dead at the silhouette, which is
   the opposite of what a gas discharge tube does.

   The fix is a smooth PROXY - a second, slightly larger cylinder around the
   tube carrying a fresnel falloff, so the apparent brightness rises toward the
   grazing edges the way a real tube's does. It has to be its own smooth mesh
   rather than the tube's own material because the falloff is computed from
   interpolated normals, and the flat-shaded low-poly geometry this game is
   made of has none worth reading. That limitation is in the source and it is
   the reason this is an added mesh rather than a material tweak.

   Additive and depth-write-free, so it layers over the housing without
   punching a hole in it, and `side: BackFace` so the near half of the shell
   does not wash out the tube it is meant to be surrounding. */
const fresnelVert = `
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const fresnelFrag = `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uAmount;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    /* One minus the facing ratio: zero head-on, one at the grazing edge. */
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    f = pow(clamp(f, 0.0, 1.0), uPower);
    gl_FragColor = vec4(uColor * f * uAmount, f * uAmount);
  }`;

export interface Halo extends THREE.Mesh {
  material: THREE.ShaderMaterial;
}

function fresnelShell(color: number, len: number, r: number): Halo {
  const m = new THREE.Mesh(
    /* Smooth: 16 segments and no flat shading, because the whole effect is
       computed off the interpolated normal. */
    new THREE.CylinderGeometry(r * 1.9, r * 1.9, len * 1.02, 16, 1, true),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uPower: { value: 2.2 },
        uAmount: { value: 0.8 }
      },
      vertexShader: fresnelVert,
      fragmentShader: fresnelFrag,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.BackSide,
      toneMapped: false
    })
  ) as Halo;
  m.rotation.z = Math.PI / 2;
  return m;
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
  housing?: boolean; light?: number; pool?: number; radius?: number; glow?: number;
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
  if ((opts.light ?? 2.4) > 0 && lightsUsed < NEON_LIGHT_BUDGET) {
    const l = new THREE.PointLight(color, opts.light ?? 2.4, opts.pool ?? 1.6, 2);
    l.castShadow = false;
    l.position.z = 0.06;
    /* Its own full intensity, remembered, so setNeon can dim and restore it
       without every caller having to hand the number back. */
    l.userData.base = opts.light ?? 2.4;
    grp.add(l);
    lightsUsed++;
  }

  /* And the pool it throws on whatever is behind it. */
  /* Sized off the tube's length ALONG it and off its radius ACROSS it.

     Both axes used to scale with the length, so the 3.2-metre strip under the
     counter threw a 4.8 by 1.8 metre haze - a wash over the whole counter and
     the two cases standing on it, which in the screenshot read as a pink fog
     with upgrades floating in it. A light pool is long and thin because the
     thing making it is long and thin. */
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(len * 1.08, Math.min(len * 0.3, r * 18)),
    new THREE.MeshBasicMaterial({
      color, map: falloffTexture(), transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    })
  );
  pool.position.z = -r * 2.2;
  grp.add(pool);

  /* Named handles rather than child indices. The old version was poked at with
     children[0] and children[1] from three different places, which is a
     structure nobody can change without breaking a caller that never said what
     it wanted. */
  /* The fresnel shell, between the tube and the pool: it is the glow the tube
     itself cannot have without a bloom pass. */
  const halo = fresnelShell(color, len, r);
  grp.add(halo);
  /* How hard this fitting glows, over and above how long it is.

     Needed because a fitting's apparent brightness is a function of how close
     it is to the lens, and the fittings in this room are at wildly different
     distances: the sign is on a wall four metres back and the counter strip is
     barely a metre away. The same tube at the same settings read as a neat lit
     line on the wall and as a full-width glare across the bottom of the frame.
     Measured rather than argued: 3.2 units at the counter's distance is about
     880 screen pixels on a 360-wide phone, which is wider than the screen. */
  grp.userData.glow = opts.glow ?? 1;

  (grp as NeonFitting).tube = tube;
  (grp as NeonFitting).pool = pool;
  (grp as NeonFitting).halo = halo;
  return grp as NeonFitting;
}

export interface NeonFitting extends THREE.Group {
  tube: THREE.Mesh;
  pool: THREE.Mesh;
  halo: Halo;
}

/* How brightly a fitting is burning, 0 to 1 of its own colour. Drives the
   tube's emissive and the pool together, because a tube that brightens without
   its pool brightening is back to being a sticker. */
export function setNeon(f: NeonFitting, amount: number) {
  const a = Math.max(0, Math.min(1, amount)) * (f.userData.glow ?? 1);
  (f.tube.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25 + a * 1.15;
  (f.pool.material as THREE.MeshBasicMaterial).opacity = 0.1 + a * 0.34;
  /* All three together, always. A tube that brightens without its pool is back
     to being a sticker, and one that brightens without its halo is a bright
     line again - which is exactly the fault round five shipped. */
  if (f.halo) f.halo.material.uniforms.uAmount.value = 0.15 + a * 0.85;
  /* And the real light, when this fitting got one. Dimming a fitting whose
     lamp keeps burning is the tell that the lamp was never really its. */
  for (const c of f.children) {
    const l = c as THREE.PointLight;
    if (l.isPointLight) l.intensity = (l.userData.base || 2.4) * (0.15 + a * 0.85);
  }
}

/* Kept as a thin alias so the callers that only want a lit line still read
   that way. Everything goes through the fitting now. */
export function neonBar(color: number, w: number, _h = 0.05, _glow = 3.2): NeonFitting {
  return neonFitting(color, w);
}


/* ---------- the drawer under the counter ----------

   Playtest: *"A secret display case at the bottom of the screen pops open and
   shows all of the upgrades you have collected and lets you purchase the
   upgrades there."*

   The six consumables used to be a flat grid of chips in the tray - a menu
   that had survived the room being rebuilt around it twice, and the last piece
   of this screen that was still a list. This is the room's own answer: a
   drawer in the counter you are already standing at, with a brass handle, that
   drops its front and slides a lit shelf out at you.

   THREE THINGS MAKE IT READ AS A DRAWER rather than as a panel that appears.

   The front HINGES, it does not fade. A flap pivoting about its bottom edge is
   the single motion that says "this is a thing with an inside", and it costs
   one rotation. It is the same argument as the neon housing: the eye needs the
   mechanism, not the result.

   The shelf SLIDES OUT while the flap drops, so the two motions are visibly
   one action with a hinge and a runner in it.

   The inside is DARK UNTIL IT OPENS. A strip inside the case comes up as the
   flap comes down, which is what makes it read as a case being opened rather
   than as a lid being removed from a hole. It is also the one light in this
   room that is not a department colour - warm, like something under glass.

   One drawer, moved to whichever counter you are standing at, for the same
   reason there are two roaming lights rather than eight: only one aisle is
   ever on screen, so only one drawer can ever be reachable, and four of them
   would be three more than anybody can open. */

export interface Drawer {
  group: THREE.Group;
  /* Where the supply cases are parented. station.ts fills this, because the
     room owns furniture and the shop owns stock. */
  shelf: THREE.Group;
  /* What a tap has to hit to open it: the handle and the flap together, which
     is a bigger target than either and is what a thumb actually aims at. */
  hit: THREE.Object3D[];
  setOpen(on: boolean): void;
  isOpen(): boolean;
  step(dt: number): void;
}

export function makeDrawer(): Drawer {
  const grp = new THREE.Group();

  /* The flap, hinged at its bottom edge. The pivot is a group at the hinge
     line with the panel offset up inside it - rotating a mesh about its own
     centre would make it sink into the counter instead of falling open. */
  const hinge = new THREE.Group();
  /* Measured, not placed by eye. The counter front is barely a unit from the
     lens, where one world unit is about 245 screen pixels on a 360-wide phone -
     five times the scale of the wall behind. The first version was 3.1 units
     wide with its crates spread over 2.3 of them, which put the outer two at
     screen x -204 and 564 and the bottom row under the tray. Everything in
     here is about a third of what it started as, and it is the same lesson as
     the counter arc: distance from the lens decides the number. */
  hinge.position.set(0, -0.92, 1.64);
  const face = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.3, 0.06), brassMat);
  face.position.y = 0.15;
  hinge.add(face);
  /* Rivets along the flap, so it is built out of the same building as the
     wall behind it. */
  rivetRow(hinge, -0.68, 0.05, 0.04, 1.36, 7);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.055, 0.08), copperMat);
  handle.position.set(0, 0.24, 0.06);
  hinge.add(handle);
  grp.add(hinge);

  /* The shelf that slides out, and the case it slides out of. */
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.26, 0.4), ironMat);
  box.position.set(0, -0.72, 1.42);
  grp.add(box);
  const shelf = new THREE.Group();
  shelf.position.set(0, -0.76, 1.42);
  grp.add(shelf);

  /* The light inside. Warm rather than any department's colour: this is the
     one thing in the room that is under glass rather than on a wall. */
  const lamp = neonFitting(0xffc27a, 1.4, { light: 0, radius: 0.018 });
  lamp.position.set(0, -0.56, 1.54);
  lamp.rotation.x = -0.7;
  grp.add(lamp);
  setNeon(lamp, 0);

  /* A label on the flap, so a closed drawer says what it is. Without it this
     is a brass rectangle, and a brass rectangle nobody opens is worse than the
     grid it replaced. */
  const label = makeLabel('SUPPLIES', 0xffd9a0);
  label.scale.setScalar(0.72);
  label.position.set(0, 0.12, 0.05);
  hinge.add(label);

  let open = false, t = 0;
  return {
    group: grp,
    shelf,
    hit: [face, handle],
    isOpen() { return open; },
    setOpen(on: boolean) { open = on; },
    step(dt: number) {
      /* Eased toward the target rather than tweened on a timer, the same as
         the aisle glide: a second tap part way through simply retargets. */
      t += ((open ? 1 : 0) - t) * Math.min(1, dt * 9);
      if (t < 0.001) t = 0;
      if (t > 0.999) t = 1;
      hinge.rotation.x = t * 1.45;
      shelf.position.z = 1.42 + t * 0.3;
      shelf.position.y = -0.76 + t * 0.06;
      shelf.visible = t > 0.02;
      setNeon(lamp, t);
      /* The label goes with the flap, and fades as the flap turns away from
         the camera - reading a word on a surface edge-on is worse than not
         seeing it. */
      (label.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      (label.material as THREE.MeshBasicMaterial).transparent = true;
    }
  };
}

/* ---------- the room ----------

   Round six: a shop you walk ALONG rather than a wall you stand at.

   Playtest: *"find a way to split the upgrades into categories, that aren't
   all shown at once ... an intuitive way to scroll or swap through upgrades."*

   Four departments, each with its own bay, its own sign in its own colour and
   its own camera station, plus a forecourt at one end where the ship is parked
   at the pump. Swipe or tap an arrow and the camera glides to the next bay.
   Never more than five cases in a shot, which is the sourced ceiling for how
   many options a phone should carry at once.

   THE SHIP AND THE SHELF STOP SHARING A SHOT. That is not a nicety, it is the
   fault he reported: the ship stood at z 0.9 with nine cases on a wall at
   z -2.15 behind it, and with a 22 degree horizontal field there is no
   "beside the ship" in portrait to move them to. Composition fixes it; nudging
   never could. */

export const AISLE_SPAN = 4.6;
/* Station 0 is the forecourt; 1..4 are the four departments in GROUP_ORDER. */
export const FORECOURT = 0;
export function stationX(i: number) { return (i - 1) * AISLE_SPAN; }

export interface Bay {
  name: GroupName;
  sign: NeonFitting;
  /* The lit plate over the bay carrying the department's name. Dimmed rather
     than hidden when the department has nothing in it - a dark aisle you can
     see is a promise, an absent one is nothing. */
  label: THREE.Mesh;
  setLit(on: boolean, stocked: boolean): void;
}

export interface Room {
  group: THREE.Group;
  bays: Bay[];
  crt: Crt;
  gauges: { g: Gauge; read: () => number }[];
  /* The one drawer, moved to whichever counter is in frame. */
  drawer: Drawer;
  /* Moves the two roaming lights and the drawer to a bay. */
  setAisle(i: number): void;
  step(t: number, dt: number): void;
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

  const LEFT = stationX(0) - 2.6;
  const RIGHT = stationX(4) + 2.6;

  /* --- the deck, the length of the whole run --- */
  for (let x = Math.floor(LEFT); x <= Math.ceil(RIGHT); x++) {
    for (let z = -2; z <= 2; z++) {
      const p = prop('floor-panel', deckMat, 1.0);
      if (!p) continue;
      p.position.set(x, -1.35, z);
      root.add(p);
    }
  }

  /* --- the back wall, riveted iron with a window every few metres --- */
  for (let x = Math.floor(LEFT); x <= Math.ceil(RIGHT); x++) {
    const w = prop(Math.abs(x % 4) === 2 ? 'wall-window' : 'wall', ironMat, 1.0);
    if (!w) continue;
    w.position.set(x, -1.35, -2.5);
    root.add(w);
  }
  /* And a real wall ABOVE them.

     The imported wall panels are one metre tall and sit on the deck, so they
     cover y -1.35 to -0.35 - the whole of which is below the rack at 0.46 and
     the sign at 1.4. The screenshot showed both floating in pure black with
     nothing behind them, and worse, nothing for a light pool to LAND on, which
     is the one thing a neon fitting needs in order to read as a light rather
     than as a lit line. A flat plate, in the same riveted iron, is the surface
     the whole lighting idea has been missing. */
  const upper = new THREE.Mesh(
    new THREE.BoxGeometry(RIGHT - LEFT, 3.6, 0.16), ironMat);
  upper.position.set((LEFT + RIGHT) / 2, 0.55, -2.55);
  root.add(upper);
  /* Seams every couple of metres, so it is a wall of panels rather than one
     sheet - which is what stops a large flat surface reading as a backdrop. */
  for (let x = Math.floor(LEFT); x <= Math.ceil(RIGHT); x += 2) {
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 3.6, 0.06), brassMat);
    seam.position.set(x, 0.55, -2.45);
    root.add(seam);
  }

  /* A brass rail along the top of the wall with rivets under it. Two primitives
     and an instanced mesh, and it is most of what makes the wall read as built
     rather than extruded. */
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(RIGHT - LEFT, 0.09, 0.14), brassMat);
  rail.position.set((LEFT + RIGHT) / 2, 1.92, -2.35);
  root.add(rail);
  rivetRow(root, LEFT, 1.79, -2.3, RIGHT - LEFT, Math.round((RIGHT - LEFT) * 3));

  /* --- pipe runs along the ceiling line, the length of the shop --- */
  for (let i = 0; i < Math.ceil(RIGHT - LEFT); i++) {
    const p = prop('pipe', copperMat, 1.0);
    if (!p) continue;
    p.position.set(LEFT + i, 1.55, -2.2);
    p.rotation.z = Math.PI / 2;
    root.add(p);
  }

  /* ---------- the four department bays ---------- */
  const bays: Bay[] = [];
  GROUP_ORDER.forEach((name, i) => {
    const ax = stationX(i + 1);
    const col = GROUP_COLOR[name];

    /* The counter: a brass top on a riveted iron body. This is the "display
       case that is also a counter" from his own brief, and the expensive stock
       stands on it - see layout() in station.ts. */
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.86, 0.72), ironMat);
    body.position.set(ax, -0.92, 1.25);
    root.add(body);
    /* Two ribs across the front. The panel is 3.4 by 0.86 and faces the camera
       squarely with a lamp a foot in front of it, which in the screenshot was
       a flat washed slab with two upgrades standing on it. Something for the
       light to break across is the whole fix. */
    for (const ry of [-0.72, -1.12]) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.05, 0.06), brassMat);
      rib.position.set(ax, ry, 1.62);
      root.add(rib);
    }
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.07, 0.86), brassMat);
    top.position.set(ax, -0.46, 1.25);
    root.add(top);
    rivetRow(root, ax - 1.6, -1.26, 1.62, 3.2, 11);

    /* The strip under the counter TOP, not on its front lip.

       It was on the lip, which is where the drawer is, and the two landed on
       the same sixty pixels of screen - the brass drawer front came out with a
       bright coloured bar drawn straight through the middle of its label. This
       is also where the light belongs on a real display counter: under the
       glass, lighting what is standing on it, with the drawers below in the
       dark until you open one. */
    const lip = neonFitting(col, 2.6, { light: 0, glow: 0.42, radius: 0.02 });
    lip.position.set(ax, -0.55, 1.71);
    /* Applied once here, because `glow` is a scale that `setNeon` multiplies in
       and this fitting is never dimmed by anything else. A fitting built with a
       glow it is never told to apply is a parameter that does nothing. */
    setNeon(lip, 1);
    root.add(lip);

    /* The wall rack behind, and the shelf the standard stock sits on. */
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.07, 0.5), ironMat);
    shelf.position.set(ax, 0.1, -2.1);
    root.add(shelf);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), brassMat);
      post.position.set(ax + sx * 1.62, 0.95, -2.1);
      root.add(post);
    }

    /* The sign over the bay. This is the aisle indicator, and it is a fitting
       rather than an overlay - his note that three coloured lights in a row
       normally mean categories was right, and this is that read made true. */
    const sign = neonFitting(col, 2.4, { light: 0 });
    sign.position.set(ax, 1.18, -2.28);
    root.add(sign);
    const label = makeLabel(GROUP_LABEL[name], col);
    label.scale.setScalar(1.5);
    label.position.set(ax, 0.84, -2.2);
    root.add(label);

    bays.push({
      name, sign, label,
      setLit(on: boolean, stocked: boolean) {
        /* Three states, not two. The aisle you are in burns; an aisle with
           stock you are not in idles; an aisle with NOTHING in it is dark -
           which in the first hour is Ordnance, whose every device has to be
           dug up. A department lighting for the first time is a better reward
           than a row appearing in a list. */
        setNeon(sign, !stocked ? 0.06 : on ? 1 : 0.42);
        const lm = label.material as THREE.MeshBasicMaterial;
        lm.transparent = true;
        lm.opacity = !stocked ? 0.16 : on ? 1 : 0.5;
      }
    });
  });

  /* ---------- the forecourt ----------

     Where the ship parks, and where all of the steampunk hardware is
     concentrated: the pump, its gauges and the one Matrix terminal. Putting
     them together rather than sprinkling them down the shop is what keeps the
     styles from muddying - one place is the machine room, the rest is the
     shop. */
  const fx = stationX(FORECOURT);

  /* The pump: a riveted column with a brass head and a hose to the ship. */
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.7, 0.5), ironMat);
  pump.position.set(fx + 1.3, -0.5, 0.6);
  root.add(pump);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.6), brassMat);
  head.position.set(fx + 1.3, 0.5, 0.6);
  root.add(head);
  rivetRow(root, fx + 1.05, -0.5, 0.86, 0.5, 4);
  /* The hose, as a torus arc. A curve would be truer and a torus is two
     numbers - and at this distance the only thing being read is "there is
     something connecting the pump to the ship". */
  const hose = new THREE.Mesh(
    new THREE.TorusGeometry(0.62, 0.035, 5, 14, Math.PI * 0.8),
    new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.9, metalness: 0 }));
  hose.position.set(fx + 0.95, -0.1, 0.6);
  hose.rotation.set(0, 0, Math.PI * 0.15);
  root.add(hose);

  /* Three gauges on the wall behind the pump, reading real state. */
  const gauges: { g: Gauge; read: () => number }[] = [
    { g: makeGauge('STRAIN'), read: () => Math.min(1, g.claim.strain) },
    { g: makeGauge('DEPTH'), read: () => Math.min(1, g.best.depth / 260) },
    { g: makeGauge('STORE'), read: () => {
      let n = 0; for (const k in g.stock) n += g.stock[k]; return Math.min(1, n / 120); } }
  ];
  /* Right of centre, with the terminal to the left of it.

     Measured: at this wall's distance one world unit is about 122 screen
     pixels on a 360-wide phone, so the terminal at fx - 1.5 spanned screen
     x -3 to 119 - a third of it off the left edge, which the projected-centre
     numbers passed because the centre itself was just inside. */
  gauges.forEach((gg, i) => {
    gg.g.group.position.set(fx + 0.3 + i * 0.46, 0.72, -2.28);
    root.add(gg.g.group);
  });
  const gaugeBoard = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.62, 0.1), ironMat);
  gaugeBoard.position.set(fx + 0.76, 0.72, -2.36);
  root.add(gaugeBoard);
  rivetRow(root, fx + 0.06, 0.44, -2.3, 1.4, 6);

  /* The terminal. The only green in the room, and the only screen. */
  const crt = makeCrt(1.0, 1.25);
  crt.mesh.position.set(fx - 0.92, 0.35, -2.28);
  root.add(crt.mesh);
  /* A brass bezel round it, because a screen with no housing is a sticker -
     the same lesson the neon needed in round five. */
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(1.16, 1.41, 0.12), brassMat);
  bezel.position.set(fx - 0.92, 0.35, -2.36);
  root.add(bezel);

  /* --- the work, dressed along the run --- */
  const skip = prop('skip-rocks', ironMat, 0.95);
  if (skip) { skip.position.set(fx - 1.9, -1.32, 0.9); skip.rotation.y = 0.5; root.add(skip); }
  for (const [cx, cz, cr] of [[stationX(1) - 2.3, 0.4, -0.35], [stationX(3) + 2.2, 0.5, 0.2],
                              [stationX(4) + 1.9, -0.3, 0.7]] as [number, number, number][]) {
    const box = prop('container', ironMat, 0.85);
    if (box) { box.position.set(cx, -1.32, cz); box.rotation.y = cr; root.add(box); }
  }
  for (const [rx, rz, rr] of [[stationX(2) - 2.2, 1.0, 0.4], [stationX(4) - 2.4, 1.15, -0.9]] as
       [number, number, number][]) {
    const r = prop('rocks', ironMat, 0.55);
    if (r) { r.position.set(rx, -1.33, rz); r.rotation.y = rr; root.add(r); }
  }

  /* ---------- the lights that walk with you ----------

     Eight fittings and a budget of seven is a design that has already failed:
     with one light per fitting the eighth simply never got one, which meant
     the ORDNANCE sign was permanently unlit for no reason anybody could state.
     Measured in the built game - eight real lights in the scene against a
     stated ceiling of seven - rather than noticed by reading the code.

     The fix is not a bigger budget. Only ONE aisle is ever on screen, so only
     one aisle's fittings can be doing any lighting work: two lights, moved to
     whichever bay the camera is at. That is two instead of eight, it is always
     the correct two, and it is why this room can afford the lip light to be as
     strong as it is. */
  const lipLight = new THREE.PointLight(0xffffff, 2.1, 2.4, 2);
  lipLight.castShadow = false;
  root.add(lipLight);
  const signLight = new THREE.PointLight(0xffffff, 3.6, 3.2, 2);
  signLight.castShadow = false;
  root.add(signLight);

  /* And one for the forecourt, which has no bay of its own but does have the
     ship in it. Warm, filament-coloured, so the brass reads as brass: the
     research puts two or three of the budget on practicals for exactly this. */
  const pumpLight = new THREE.PointLight(0xffc27a, 5.5, 6.0, 2);
  pumpLight.position.set(fx + 0.9, 1.0, 2.0);
  pumpLight.castShadow = false;
  pumpLight.layers.enable(SHIP_LAYER);
  root.add(pumpLight);
  /* A cool kicker from the other side, so the ship has a lit edge against the
     dark wall instead of reading as a silhouette.

     The room's key was cut from 3.4 to 1.35 to let the neon carry, and the
     ship went dark with the room - which is wrong, because the ship is the one
     object in here whose SHAPE is game state. It gets its own pair rather than
     the room's key coming back up. */
  const drawer = makeDrawer();
  root.add(drawer.group);

  const shipKick = new THREE.PointLight(0x6fa8ff, 3.2, 5.0, 2);
  shipKick.position.set(fx - 1.5, 0.3, 1.9);
  shipKick.castShadow = false;
  shipKick.layers.enable(SHIP_LAYER);
  root.add(shipKick);

  return {
    group: root,
    bays,
    crt,
    gauges,
    drawer,
    setAisle(i: number) {
      /* At the forecourt the two roaming lights go dark rather than lighting
         an aisle nobody is looking at, and the drawer goes with them - there
         is no counter at the pump to put one in. */
      const at = i >= 1 && i <= bays.length;
      lipLight.visible = at;
      signLight.visible = at;
      drawer.group.visible = at;
      if (!at) { drawer.setOpen(false); return; }
      drawer.group.position.x = stationX(i);
      const col = GROUP_COLOR[GROUP_ORDER[i - 1]];
      const ax = stationX(i);
      lipLight.color.setHex(col);
      lipLight.position.set(ax, -0.42, 1.8);
      signLight.color.setHex(col);
      signLight.position.set(ax, 1.1, -2.0);
    },
    step(t: number, dt: number) {
      crt.step(t);
      drawer.step(dt);
      for (const gg of gauges) gg.g.set(gg.read());
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
