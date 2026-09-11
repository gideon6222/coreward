import * as THREE from 'three';
import { scene, SHIP_LAYER } from './scene';
import { shipPart, partsReady } from './shipparts';
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
/* Rougher and less metallic than it was, and the reason is the same one that
   took the key light down: at metalness 0.55 and roughness 0.56 a single close
   light put the entire face inside one specular highlight and the hull
   rendered white. Roughness spreads that energy out instead of concentrating
   it, which is what lets a dark colour actually read as dark. */
const hullMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x232932, metalness: 0.42, roughness: 0.78, flatShading: true
}), 0.30);
/* The one warm accent. Every working machine has a painted part that has taken
   a beating, and one accent colour is what stops a grey ship reading as a grey
   smudge at thirty pixels. */
const trimMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x5e3814, metalness: 0.22, roughness: 0.86, flatShading: true
}), 0.18);
export const darkMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x12161c, metalness: 0.5, roughness: 0.6, flatShading: true
}), 0.3);
/* Brass, and it exists for a measured reason rather than for flavour.

   The first pass of this hull failed its own squint test: blurred at play
   scale the ship was one dark lump with a bright dot on it, and neither the
   stack nor the flywheel read at all. They were there - they were just dark
   metal on a dark hull, so the outline breaks were invisible even though the
   geometry was correct.

   The fix is not more geometry, it is VALUE. The protruding parts are brass:
   mid-value and warm, so they separate from both the near-black hull and the
   dark tunnel, and the blurred silhouette gains two distinct appendages
   instead of being a rounded rectangle. This is the research's "value carries
   the read, hue count does not", applied to the one object that has to be
   recognisable at thirty pixels. */
const brassMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0xa8762e, metalness: 0.9, roughness: 0.42, flatShading: true
}), 0.4);

const steelMat = asMetal(new THREE.MeshStandardMaterial({
  /* The pale steel was most of what still read as white at play scale:
     bright bare metal on a small object against dark rock is a highlight, not
     a colour. Kept metallic, taken well down in value. */
  color: 0x2b3038, metalness: 0.62, roughness: 0.66, flatShading: true
}), 0.26);

/* ---------- the body ----------

   Playtest: *"redesign the ship to look more steam punk and unique."*

   Designed at THIRTY PIXELS, which is the whole method and is what every
   previous pass on this ship got wrong. The sourced finding is blunt: at play
   scale only things that break the OUTLINE survive. Rivets, gauges, valve
   dials, portholes and brass-versus-iron all vanish - a 2-3 px brass band is
   not a colour, it is noise. Brass reads in play only if it covers a whole
   panel.

   What survives the squint test, and what this hull is therefore made of:

   1. A STACK. A cylinder breaking the roofline is the single most efficient
      steampunk signal there is, because it changes the outline rather than the
      surface. Off-centre and raked back, so it is also the asymmetry.
   2. A BOILER. A barrel-shaped drum instead of a flat box hull - a bulge
      distinct from the body is the second outline break.
   3. A FLYWHEEL. Big enough to matter: a spoked disc on one flank at about a
      third of ship height. Under about 15% of height a wheel disappears.
   4. NEGATIVE SPACE. An open frame between the boiler and the drill collar.
      Gaps read as strongly as filled shape at distance and cost nothing.

   And the rule that decides everything else: ONE dominant feature, not several.
   The stack is the hero. The rest of the hull is deliberately plain and low
   contrast so the eye lands on it - which is why there is no detail on the
   boiler's face at all.

   The greeble that a steampunk machine wants but cannot show at 30 px - rivet
   rows, the brass band, a pressure gauge, a valve wheel - is in `dressShip()`
   at the bottom, added only when the Outfitter shows the ship at full screen.

   ASYMMETRIC FRONT TO BACK, on purpose. A symmetric hull reads as "generic
   vehicle"; steampunk craft almost never are. The stack leans one way, the
   flywheel sits on one flank, and the ship is immediately not a sci-fi pod. */

/* The boiler: a drum lying across the ship, so the silhouette is round where a
   hull would be flat. Eight sides rather than smooth - facets take the lamp
   unevenly, which is what makes a shape read as machined rather than moulded. */
const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.42, 8), hullMat);
boiler.rotation.z = Math.PI / 2;
boiler.position.y = 0.02;
rig.add(boiler);

/* The end caps, a little proud, so the drum has a rim rather than a cut edge. */
for (const sx of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 8), steelMat);
  cap.rotation.z = Math.PI / 2;
  cap.position.set(sx * 0.22, 0.02, 0);
  rig.add(cap);
}

/* The firebox under the boiler, squared off - the one hard-edged mass on the
   ship, and what the drill collar hangs from. */
const firebox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.3), darkMat);
firebox.position.y = -0.2;
rig.add(firebox);

/* ---------- the stack ----------

   The hero feature, and the only thing on the ship allowed to be loud. Raked
   back off the top of the boiler and offset to one side: two asymmetries for
   the price of one, and it is what makes this silhouette nobody else's.

   Remember the ship flies drill-first, so +y is the REAR - the stack trails
   behind the machine the way a funnel should. */
const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.46, 6), brassMat);
stack.position.set(-0.19, 0.4, -0.04);
stack.rotation.z = -0.3;
rig.add(stack);
/* The crown - a flared lip, which is what stops a cylinder reading as a peg. */
const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.07, 0.07, 6), brassMat);
crown.position.set(-0.26, 0.62, -0.04);
crown.rotation.z = -0.3;
rig.add(crown);

/* ---------- the flywheel ----------

   On one flank only, facing the camera, because a disc seen edge-on is a line.
   0.18 radius against a hull about 0.6 tall is roughly a third - comfortably
   over the threshold where a wheel stops being visible.

   Six spokes as one thin box each. Spokes are the reason it reads as a WHEEL
   and not a disc, and they are also the negative space: the gaps between them
   are as much of the read as the metal is. */
export const flywheel = new THREE.Group();
const rim = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.036, 5, 12), brassMat);
flywheel.add(rim);
for (let i = 0; i < 6; i++) {
  const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.4, 0.032), brassMat);
  spoke.rotation.z = (i / 6) * Math.PI;
  flywheel.add(spoke);
}
const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 6), darkMat);
boss.rotation.x = Math.PI / 2;
flywheel.add(boss);
flywheel.position.set(0.3, -0.04, 0.18);
rig.add(flywheel);

/* And the rod that drives it, running down to the collar - the one piece of
   visible mechanism, and it sits on the silhouette's edge where it can be
   seen rather than on a face where it cannot. */
const rod = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.26, 0.035), steelMat);
rod.position.set(0.32, -0.26, 0.14);
rod.rotation.z = 0.18;
rig.add(rod);

/* ---------- the open frame ----------

   Two legs from the firebox down to the drill collar with daylight between
   them. This is the negative space, and it is why the bottom half of the ship
   does not read as one solid lump. */
for (const sx of [-1, 1]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.05), steelMat);
  leg.position.set(sx * 0.14, -0.36, 0.02);
  leg.rotation.z = sx * 0.14;
  rig.add(leg);
}

/* The collar the drill hangs off - heavy and stepped, because this is the part
   of a mining machine that takes the load. */
const collar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.26), steelMat);
collar.position.y = -0.47;
rig.add(collar);
const collarLip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.3), trimMat);
collarLip.position.y = -0.53;
rig.add(collarLip);

/* ---------- the greeble ----------

   Everything here is invisible at play scale and that is the point. The
   research is explicit that rivets, gauges and valve wheels do not survive
   thirty pixels - they exist because the Outfitter shows this ship at full
   screen, and a steampunk machine with no rivets on it at arm's length is a
   shape rather than a thing.

   Kept to THREE draw calls between them. The rivets are one instanced mesh
   rather than forty, which is the same lesson the ship's bolt-on hardware
   learned when thirteen separate meshes took the worst case to three draws off
   failing CI. */
const rivetGeo = new THREE.SphereGeometry(0.012, 5, 3);
{
  const N = 24;
  const rivets = new THREE.InstancedMesh(rivetGeo, brassMat, N);
  const t = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    /* Two bands around the boiler, at the seams a real drum would be riveted
       at rather than scattered over the face. */
    const band = i < N / 2 ? -0.13 : 0.13;
    const a2 = ((i % (N / 2)) / (N / 2)) * Math.PI * 2;
    t.position.set(band, 0.02 + Math.cos(a2) * 0.25, Math.sin(a2) * 0.25);
    t.updateMatrix();
    rivets.setMatrixAt(i, t.matrix);
  }
  rivets.frustumCulled = false;
  rig.add(rivets);
}

/* A pressure gauge on the firebox, because the one thing a boiler always has
   is something telling you whether it is about to go. */
const gaugeFace = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.018, 8),
  new THREE.MeshStandardMaterial({ color: 0xe8dcc0, metalness: 0.1, roughness: 0.7, flatShading: true }));
gaugeFace.rotation.x = Math.PI / 2;
gaugeFace.position.set(-0.17, -0.19, 0.17);
rig.add(gaugeFace);
const gaugeBezel = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.014, 4, 8), brassMat);
gaugeBezel.position.set(-0.17, -0.19, 0.18);
rig.add(gaugeBezel);

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
  new THREE.CylinderGeometry(0.085, 0.105, 0.08, 6),
  new THREE.MeshStandardMaterial({
    color: 0x2a3138, emissive: 0x9a6a12, emissiveIntensity: 0.55,
    metalness: 0.4, roughness: 0.25, flatShading: true
  })
);
cab.position.set(0.02, 0.02, 0.24);
cab.rotation.x = Math.PI / 2;
rig.add(cab);

/* The porthole's ring. Highest-value detail at small scale for the same reason
   it always was: it separates the lit window from the lit hull, which
   otherwise merge into one bright smudge. Brass, and thick enough to survive
   being small - a thin ring is the 2 px band the research says vanishes. */
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.024, 5, 8), brassMat);
ring.position.set(0.02, 0.02, 0.26);
rig.add(ring);

/* Much smaller than a lantern. The cockpit is a lit window. */
const cabGlow = makeGlow(0xffca7a, 0.3, 0.3);
cabGlow.position.set(0.02, 0.02, 0.34);
rig.add(cabGlow);

/* shoulder running lights, so the hull has a readable outline in the dark */
for (const sx of [-0.24, 0.24]) {
  const lamp = makeGlow(0x6fe8ff, 0.15, 0.45);
  lamp.position.set(sx, 0.02, 0.2);
  rig.add(lamp);
}

/* ---------- the lamp housings ----------

   The ship had no visible light source on it at all. The glow that stands in
   for the lamp sits BEHIND the hull - it has to, or it washes the whole thing
   flat - so from the front the machine that lights the entire cave had nothing
   on it that looked like a lamp.

   Two housings at the leading edge, pointing the way the drill points: a dark
   metal shroud with a fully emissive lens in it. Emissive answers to no light
   in the scene, so these stay exactly as bright at ninety metres as at one,
   which is what makes them read as the source rather than as something catching
   a highlight. They are the brightest thing on the ship by a wide margin now,
   and the hull around them is nearly black - which is what "light coming from
   the ship" looks like. */
/* Held so the Scanner can grow them. That upgrade used to be read off the size
   of the halo; with the halo gone the lamps themselves carry it, which is the
   more honest version anyway - a bigger lamp, not a bigger smudge. */
export const lensFlares: THREE.Sprite[] = [];
const lensMat = new THREE.MeshStandardMaterial({
  color: 0xffdca8, emissive: 0xffc879, emissiveIntensity: 1.9,
  metalness: 0, roughness: 1, flatShading: true
});
for (const sx of [-0.15, 0.15]) {
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.1), darkMat);
  shroud.position.set(sx, -0.42, 0.12);
  rig.add(shroud);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.045, 0.11), lensMat);
  lens.position.set(sx, -0.45, 0.13);
  rig.add(lens);
  /* A tight halo so the lens blooms rather than reading as a painted rectangle.
     Small on purpose: anything wide enough to cover the hull is the mistake the
     big glow made. */
  const flare = makeGlow(0xffc87a, 0.3, 0.55);
  flare.position.set(sx, -0.46, 0.28);
  rig.add(flare);
  lensFlares.push(flare);
}

/* ---------- thrusters ---------- */

export const flames: { cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; glow: THREE.Sprite }[] = [];
for (const sx of [0.14, -0.2]) {
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.06, 0.13, 4), steelMat);
  nozzle.position.set(sx, 0.26, 0);
  nozzle.rotation.y = Math.PI / 4;
  rig.add(nozzle);

  const fl = new THREE.Mesh(
    new THREE.ConeGeometry(0.075, 0.3, 6),
    new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.9 })
  );
  fl.position.set(sx, 0.37, 0);
  rig.add(fl);
  const fg = makeGlow(0x7ad4ff, 0.7, 0.9);
  fg.position.set(sx, 0.43, 0);
  rig.add(fg);
  flames.push({ cone: fl, glow: fg });
}

/* The z stack, and why these numbers are what they are.

   Rock cells are unit cubes at z 0, and the displacement shader pushes their
   vertices up to a fifth of a cell either way, so a rock FACE can reach 0.7.
   The haze quad has to sit in front of all of that or bulges in a tunnel wall
   draw over it as chips of lit rock floating in the fog; it is at 0.74. And the
   ship has to sit in front of the haze, because an additive quad drawn over the
   hull washes it flat.

   So: rock to 0.7, haze at 0.74, the ship in front of everything. */
export const SHIP_Z = 0.95;

/* The wide lamp halo is gone, and it is worth saying why it existed and why it
   had to go.

   It was two additive sprites centred on the ship, standing in for "there is a
   lamp here". Additive quads know nothing about geometry, so it painted a soft
   circle over whatever was behind it - including solid rock. Playtest: *"there
   still appears to be a circle of light that surrounds the ship ... this makes
   it look like light is clipping through the rock."* Exactly right, and it was
   the one thing left in the frame that ignored the light field entirely.

   Nothing replaces it. The propagated light already puts light in the tunnel,
   the lens housings below are the visible source, and the halo was the last
   survivor of the era when a sprite had to fake all of that. */

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

/* Imported hardware, hung on the same hardpoints as the coded parts and shown
   in place of them once it has arrived. Absent until the shop has been opened
   once, and absent forever if the fetch failed - which is why every one of
   these is created lazily and why the coded part it replaces is only hidden
   when its import is actually present. See shipparts.ts. */
const imported: { collar?: THREE.Object3D; jetA?: THREE.Object3D; jetB?: THREE.Object3D } = {};

export function fitImportedHardware() {
  if (imported.collar || !partsReady()) return;
  /* A drill collar at the nose. The turret mesh reads as a machined housing
     with a barrel through it, which is what a drill mount is. */
  const collar = shipPart('collar', 0.16);
  if (collar) {
    collar.position.set(0, -0.30, 0);
    collar.rotation.set(Math.PI, 0, 0);
    imported.collar = collar;
    rig.add(collar);
  }
  /* Two generator blocks either side of the stern, which is where the coded
     jets already sit. The larger one is the higher tier. */
  const a = shipPart('thruster', 0.13);
  if (a) { a.position.set(-0.20, 0.24, 0); imported.jetA = a; rig.add(a); }
  const b = shipPart('thrusterBig', 0.13);
  if (b) { b.position.set(0.20, 0.24, 0); imported.jetB = b; rig.add(b); }
  shipToLayer();
}

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

  /* The imported hardware, where it has arrived. Each piece appears at its own
     tier, so a purchase is a new object on the ship rather than a slightly
     different colour on an old one - which is the finding from the drill tiers
     that "did not read" when they were only repainted. */
  if (imported.collar) imported.collar.visible = (up.drill || 0) >= 3;
  if (imported.jetA) imported.jetA.visible = (up.thrust || 0) >= 2;
  if (imported.jetB) imported.jetB.visible = (up.thrust || 0) >= 6;
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
/* FACE_ANGLE moved to fly.ts, which is pure - it is geometry rather than art,
   and the autopilot's heading has to be testable against it. Re-exported here
   so the model's orientation still has one obvious place to look. */
export { FACE_ANGLE } from './sim/fly';
