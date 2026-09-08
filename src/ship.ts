import * as THREE from 'three';
import { scene, SHIP_LAYER } from './scene';
import { makeGlow, asMetal } from './materials';

/* The drill ship.

   Small on purpose. With 18 rows framed it occupies maybe thirty pixels, so
   "detail" here means silhouette rather than surface: swept fins read at that
   size, panel lines do not.

   Playtest: *"change the ship to look less bubbly and cartoonish."* Three
   things were doing that, and none of them was the amount of detail:

   - **A sphere for a canopy.** A sphere is the one shape with no orientation
     and no facets, so it reads as a bubble at any size. It is a faceted wedge
     now, which is the single biggest change in here.
   - **Bright saturated cyan.** Toy colours read as a toy. The livery is
     gunmetal and worn ochre, with the cyan cut back to running lights, where
     it earns its place by making the hull legible in the dark.
   - **Everything was a cylinder.** Six and eight-sided prisms with rounded
     silhouettes and no hard corners. There are chamfered blocks, exposed
     struts and a heavy drill collar now - shapes that catch a light on one
     face and not the next.

   Metal is MeshStandardMaterial, for the same reason the rock is: metalness
   and roughness are what separate steel from painted plastic, and Lambert has
   neither. */

export const player = new THREE.Group();
export const rig = new THREE.Group();
player.add(rig);

/* Worn, not showroom. High metalness with middling roughness is machined metal
   that has been down a hole; low roughness would be chrome and would read as
   toy plastic again from the other direction. */
const hullMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x2b313a, metalness: 0.55, roughness: 0.56, flatShading: true
}), 0.35);
/* The one warm accent. Every working machine has a painted part that has taken
   a beating, and one accent colour is what stops a grey ship reading as a grey
   smudge at thirty pixels. */
const trimMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x8a5420, metalness: 0.35, roughness: 0.66, flatShading: true
}), 0.3);
export const darkMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x12161c, metalness: 0.5, roughness: 0.6, flatShading: true
}), 0.3);
const steelMat = asMetal(new THREE.MeshStandardMaterial({
  /* The pale steel was most of what still read as white at play scale:
     bright bare metal on a small object against dark rock is a highlight, not
     a colour. Kept metallic, taken well down in value. */
  color: 0x474e57, metalness: 0.8, roughness: 0.42, flatShading: true
}), 0.45);

/* ---------- body ----------

   A chamfered block rather than a cylinder: four-sided prisms rotated 45 give
   flat faces that take the lamp unevenly, which is what makes a shape read as
   machined. */
const hull = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.34), hullMat);
rig.add(hull);

/* the chamfer - a narrower block sat proud of the main body, so the silhouette
   has a step in it instead of one unbroken edge */
const spine = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.26), darkMat);
spine.position.y = -0.02;
rig.add(spine);

/* A wedge nose. Four segments, so it is a pyramid rather than a cone: the
   difference is four hard edges catching light at four different angles. */
const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.24, 0.22, 4), hullMat);
cowl.position.y = 0.37;
cowl.rotation.y = Math.PI / 4;
rig.add(cowl);

/* The collar the drill hangs off - heavy, and stepped, because this is the part
   of a mining machine that takes the load. */
const collar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.3), steelMat);
collar.position.y = -0.3;
rig.add(collar);
const collarLip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.34), trimMat);
collarLip.position.y = -0.37;
rig.add(collarLip);

/* Exposed struts down each flank. Two thin bars read as structure at small
   scale where a panel line reads as nothing at all. */
for (const sx of [-1, 1]) {
  const strut = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.5, 0.045), steelMat);
  strut.position.set(sx * 0.25, -0.02, 0.14);
  rig.add(strut);
  /* swept blade, kept from the old ship because it was the part that worked */
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.22), darkMat);
  fin.position.set(sx * 0.26, 0.04, -0.04);
  fin.rotation.z = sx * 0.2;
  rig.add(fin);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.16), trimMat);
  tip.position.set(sx * 0.31, -0.15, -0.04);
  tip.rotation.z = sx * 0.2;
  rig.add(tip);
}

/* ---------- drill ---------- */

export const bit = new THREE.Group();

/* A real auger: a tapered hexagonal cylinder whose vertices are twisted around
   Y in proportion to height, so the flutes spiral. One mesh, one draw call, and
   the spiral is the only reason the rotation is visible at all - a smooth cone
   looks identical at every angle. */
export const augerGeo = (() => {
  const g = new THREE.CylinderGeometry(0.23, 0.03, 0.5, 6, 6, false);
  const pos = g.attributes.position;
  const TWIST = 7.8;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = (y + 0.25) * TWIST;
    const ca = Math.cos(a), sa = Math.sin(a);
    pos.setXYZ(i, x * ca - z * sa, y, x * sa + z * ca);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
})();

/* steel, not the white trim: a near-white auger blows out under the cockpit
   glow and the spiral disappears */
/* Standard like the rest of the ship: an auger left on Lambert next to
   machined metal reads as a plastic screw glued to a machine. */
export const augerMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x9fb0c4, emissive: 0x121a24, metalness: 0.85, roughness: 0.34, flatShading: true
}), 0.5);

/* One look per drill tier.

   The Drill Bit is the most-bought upgrade in the game and it has ten named
   tiers - Steel, Tungsten, Carbide, up to Godcore - and until now every one of
   them looked like the same grey auger. The Scanner Array had the same problem
   and its lamp glow fixed it; this is the same argument. An upgrade the player
   cannot see is an upgrade they buy on trust.

   The ramp is deliberate: the first few are metals and stay dull, because
   early progress should look like better tools rather than like magic. The
   emissive only really arrives from Plasma on, so the drill starts glowing at
   about the point the player starts going somewhere that glows back. */
const DRILL_TIERS = [
  { color: 0x9fb0c4, emissive: 0x121a24 },  /* Steel */
  { color: 0xb9c2cc, emissive: 0x161c26 },  /* Tungsten */
  { color: 0xd7d2c4, emissive: 0x1c1e1c },  /* Carbide */
  { color: 0xdff2f6, emissive: 0x1d3038 },  /* Diamond */
  { color: 0x9fe4ff, emissive: 0x1b4d68 },  /* Ionized */
  { color: 0x86d0ff, emissive: 0x2a5f9c },  /* Plasma */
  { color: 0xc79cff, emissive: 0x4a2a86 },  /* Graviton */
  { color: 0xff9ae0, emissive: 0x7a1f66 },  /* Singularity */
  { color: 0xffd88a, emissive: 0x8a5a10 },  /* Starbreaker */
  { color: 0xfff4c8, emissive: 0xb08820 }   /* Godcore */
];

/* The colour the drill throws while it is cutting. Exported because the auger
   itself is about eight pixels tall at play scale - repainting it is honest
   but it does not READ, which is the same trap the ship model note warns
   about: at this size detail means silhouette, not surface.

   The sparks do read. There are a dozen of them a second, they sit right at
   the contact point, and they are the only part of the drill big enough to
   carry a colour. Break sprays keep the BLOCK's colour, because that is ore
   identity and it matters more. */
export let drillTint = DRILL_TIERS[0].color;

export function setDrillTier(level: number) {
  const t = DRILL_TIERS[Math.max(0, Math.min(DRILL_TIERS.length - 1, level))];
  augerMat.color.setHex(t.color);
  augerMat.emissive.setHex(t.emissive);
  drillTint = t.color;
}
const auger = new THREE.Mesh(augerGeo, augerMat);
auger.position.y = -0.05;
bit.add(auger);

const chuck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.09, 6), darkMat);
chuck.position.y = 0.23;
bit.add(chuck);

bit.position.y = -0.46;
rig.add(bit);

/* ---------- cockpit ---------- */

/* A faceted wedge, not a sphere.

   This is the change that does most of the work. A sphere has no orientation
   and no facets, so it reads as a bubble stuck on the front at any size, and
   no amount of hardware elsewhere fixes that. Four segments give a canopy with
   a ridge and two angled panes, which is what a cockpit looks like and also
   catches the lamp differently on each side as the ship turns.

   Dark glass with a little emissive rather than a glowing yellow ball: the
   light should look like it is coming from INSIDE a canopy, not like the
   canopy is the light. */
const cab = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.13, 0.17, 4),
  new THREE.MeshStandardMaterial({
    color: 0x2a3138, emissive: 0x9a6a12, emissiveIntensity: 0.55,
    metalness: 0.4, roughness: 0.25, flatShading: true
  })
);
cab.position.set(0, 0.1, 0.24);
cab.rotation.set(Math.PI / 2.35, Math.PI / 4, 0);
rig.add(cab);

/* The frame around the canopy. Highest-value detail at small scale: it
   separates the lit cockpit from the lit hull, which otherwise merge into one
   bright smudge. Square now, to match the wedge. */
const ring = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.03), steelMat);
ring.position.set(0, 0.09, 0.2);
rig.add(ring);

/* Much smaller than it was. The cockpit should be a lit window, not a lantern -
   an oversized glow sprite here is most of what made the ship read as a toy. */
const cabGlow = makeGlow(0xffca7a, 0.34, 0.32);
cabGlow.position.set(0, 0.1, 0.36);
rig.add(cabGlow);

/* shoulder running lights, so the hull has a readable outline in the dark */
for (const sx of [-0.28, 0.28]) {
  const lamp = makeGlow(0x6fe8ff, 0.17, 0.5);
  lamp.position.set(sx, -0.16, 0.18);
  rig.add(lamp);
}

/* ---------- thrusters ---------- */

export const flames: { cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; glow: THREE.Sprite }[] = [];
for (const sx of [-0.19, 0.19]) {
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.13, 4), steelMat);
  nozzle.position.set(sx, 0.31, 0);
  nozzle.rotation.y = Math.PI / 4;
  rig.add(nozzle);

  const fl = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 })
  );
  fl.position.set(sx, 0.42, 0);
  rig.add(fl);
  const fg = makeGlow(0x7ad4ff, 0.7, 0.9);
  fg.position.set(sx, 0.48, 0);
  rig.add(fg);
  flames.push({ cone: fl, glow: fg });
}

/* ---------- the lamp's own glow ----------

   This replaces a volumetric cone, and the reason is worth keeping.

   The cone was a shape drawn where light was SUPPOSED to be. It pointed the
   way the drill pointed and ended at a hard mouth, so the light in the game
   was a triangle no matter what the tunnel around it was doing - a beam that
   went through solid rock as happily as through open air. The propagated field
   in lightmap.ts now decides where light actually reaches, which leaves the
   ship exactly one thing to draw: the source itself.

   Two additive quads, a tight core and a wide soft one - the same pair the ore
   haloes use, for the same reason: additive blending sums, so the dim one can
   be three times the size for nothing, and together they have a far longer
   tail than one gradient can.

   The Scanner still has a silhouette. It scales the glow rather than
   lengthening a cone, which is the honest version of the same signal: a bigger
   lamp, not a longer triangle. Scaled rather than faded because the sprite
   material is shared with every other glow of its colour. */
export const lampGlow = new THREE.Group();
lampGlow.add(makeGlow(0xffc078, 2.6, 0.13));
lampGlow.add(makeGlow(0xffd9a0, 0.8, 0.34));
/* BEHIND the ship, not in front of it.

   In front, an additive quad centred on the lamp washes straight over the hull
   and the ship renders as a bright blob with no facets - which is the exact
   fault the render layers were added to fix, arriving by a different route.
   Behind, the ship silhouettes against its own light, which is what a lamp on
   a machine actually looks like. Still forward of z = 0, because the ship
   spends its life in a one-cell tunnel and at zero the terrain occludes it. */
/* The z stack, and why these numbers are what they are.

   Rock cells are unit cubes at z 0, and the displacement shader pushes their
   vertices up to a fifth of a cell either way, so a rock FACE can reach 0.7.
   The haze quad has to sit in front of all of that or bulges in a tunnel wall
   draw over it as chips of lit rock floating in the fog; it is at 0.74. And
   the ship has to sit in front of the haze, because an additive quad drawn
   over the hull washes it flat - the exact fault the render layers were added
   to fix, arriving by another route.

   So: rock to 0.7, haze at 0.74, the lamp's glow just behind the ship, the
   ship in front of everything. Moving the ship forward a third of a unit
   against a camera twenty units away is a one per cent scale change, which is
   the whole cost of getting the order right. */
export const SHIP_Z = 0.95;
export const GLOW_Z = 0.80;
lampGlow.position.z = GLOW_Z;
lampGlow.renderOrder = 2;
scene.add(lampGlow);

/* Shrunk against the terrain so the world reads as large. The squash animation
   scales `player`, so scaling `rig` here does not interfere with it. */
rig.scale.setScalar(0.82);

/* Facing (z) and bank (y) both live on this one object, and the order they
   compose in decides whether the bank is a roll or a flip.

   Under the default XYZ order the facing is applied to the model FIRST and the
   bank then turns the already-turned ship about the WORLD vertical. Pointing
   down that is a roll about the drill, which is what a bank should look like.
   Pointing left or right the ship's long axis lies along world X, so the same
   rotation swings its nose toward the camera - the ship visibly flips out of
   the screen plane, worst at exactly the moment it is moving fastest.

   ZYX composes the other way: the bank is applied in the ship's own frame and
   the facing turns the result. It is then a roll about the drill in every
   facing, which is the one thing it was ever meant to be. */
rig.rotation.order = 'ZYX';

/* ---------- bolt-on hardware ----------

   Playtest: *"make it so upgrades to the ship show visual changes."*

   Every upgrade adds something to the OUTLINE, because at thirty pixels the
   silhouette is the only thing that reads - the drill-tier repaint proved that
   the expensive way, being completely correct and completely invisible. Tanks
   stick out sideways, radiators stick up, the sensor mast breaks the top edge,
   the cargo pod squares off the back.

   Built once and shown or hidden, rather than created and destroyed: this runs
   on every purchase and on load, and churning geometry to change a boolean is
   how a frame hitches on the one screen the player is watching closely. */
const hardware = new THREE.Group();
rig.add(hardware);

function bolt(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number,
              rot?: [number, number, number]) {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
  mesh.visible = false;
  hardware.add(mesh);
  return mesh;
}

/* Exported, because the shop shows THESE.

   Playtest: *"when you upgrade thrusters and it starts to change the way they
   look, it also changes the way that they look when you're actually playing."*

   The station's display cases are built from the same geometry and the same
   materials as the parts that get bolted to the hull, so the part on the
   pedestal is not a picture of the upgrade - it is the upgrade. There is no
   second set of art that can drift out of step with the first, because there is
   no second set. */
export const HW = {
  tank: new THREE.CylinderGeometry(0.055, 0.055, 0.3, 6),
  rad: new THREE.BoxGeometry(0.02, 0.13, 0.16),
  pod: new THREE.BoxGeometry(0.34, 0.16, 0.2),
  mast: new THREE.CylinderGeometry(0.016, 0.022, 0.24, 4),
  dish: new THREE.CylinderGeometry(0.09, 0.02, 0.05, 7),
  jet: new THREE.CylinderGeometry(0.05, 0.035, 0.09, 4)
};
export const HW_MAT = { hull: hullMat, trim: trimMat, dark: darkMat, steel: steelMat };
const tankGeo = HW.tank;
const radGeo = HW.rad;
const podGeo = HW.pod;
const mastGeo = HW.mast;
const dishGeo = HW.dish;
const jetGeo = HW.jet;

/* Repeated parts are instanced, not one mesh each.

   The first version bolted on thirteen separate meshes and took the worst-case
   draw count from 55 to 67 against a budget of 70 - three away from failing CI,
   for hardware that is four copies of two shapes. Instancing is what the
   terrain already does and it costs one draw call per KIND rather than per
   part, so the count no longer moves with how upgraded the ship is.

   `count` is the lever: setting it to n draws the first n slots, which is
   exactly the semantics an upgrade ladder wants. */
function boltRow(geo: THREE.BufferGeometry, m: THREE.Material,
                 places: [number, number, number][], rot?: [number, number, number]) {
  const mesh = new THREE.InstancedMesh(geo, m, places.length);
  const o = new THREE.Object3D();
  places.forEach((p, i) => {
    o.position.set(p[0], p[1], p[2]);
    if (rot) o.rotation.set(rot[0], rot[1], rot[2]);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = 0;
  mesh.frustumCulled = false;
  hardware.add(mesh);
  return mesh;
}

/* Fuel: paired tanks down the flanks, one pair per two levels. */
const tanks = boltRow(tankGeo, steelMat, [
  [-0.29, -0.02, -0.1], [0.29, -0.02, -0.1],
  [-0.29, -0.02, 0.12], [0.29, -0.02, 0.12]
]);
/* Cooling: radiator fins along the top, which is where heat would actually be
   thrown from and also the only edge of the ship nothing else uses. */
const rads = boltRow(radGeo, trimMat, [
  [-0.15, 0.22, -0.13], [-0.075, 0.22, -0.13], [0.075, 0.22, -0.13], [0.15, 0.22, -0.13]
]);
/* Cargo: a hold slung behind the body, so a full hold has somewhere to be. */
const pod = bolt(podGeo, hullMat, 0, -0.14, -0.19);
/* Scanner: a mast and dish. The Scanner already changes the framing and how
   far the propagated light reaches; this is the third thing one purchase
   buys. */
const mast = bolt(mastGeo, steelMat, 0.13, 0.3, -0.08);
const dish = bolt(dishGeo, trimMat, 0.13, 0.42, -0.08, [Math.PI / 2.6, 0, 0]);
/* Thrust: a second pair of jets outboard of the originals. */
const jets = boltRow(jetGeo, steelMat, [[-0.3, 0.26, 0], [0.3, 0.26, 0]]);

export function setUpgradeHardware(up: Record<string, number>) {
  const on = (m: THREE.Mesh, yes: boolean) => { m.visible = yes; };
  /* Thresholds are spread across each ladder rather than bunched at the top, so
     that early purchases - the ones actually being made in the first hour -
     are the ones that visibly change the ship. */
  const upto = (lvl: number, steps: number[]) => steps.filter((n) => lvl >= n).length;
  tanks.count = upto(up.tank || 0, [2, 4, 6, 8]);
  rads.count = upto(up.cool || 0, [2, 4, 6, 8]);
  jets.count = (up.thrust || 0) >= 4 ? 2 : 0;
  on(pod, (up.cargo || 0) >= 3);
  on(mast, (up.scan || 0) >= 2);
  on(dish, (up.scan || 0) >= 5);
  /* The drill itself grows. This is the one upgrade whose hardware already
     existed, and scaling it is what makes the tier legible next to the colour
     change that on its own was not. */
  const d = 1 + Math.min(9, up.drill || 0) * 0.055;
  bit.scale.set(d, 1 + (d - 1) * 0.6, d);
  shipToLayer();
}

/* Put every part of the ship on its own layer, so the lamp does not light it.
   Called again by setUpgradeHardware(), because bolt-on parts appear later and
   a part left on layer 0 would be the one thing on the ship the lamp blows
   out. */
export function shipToLayer() {
  player.traverse((o) => o.layers.set(SHIP_LAYER));
}
shipToLayer();

scene.add(player);
export const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };
