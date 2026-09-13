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
/* ---------- the palette ----------

   Six materials, and between them they are the whole "advanced but ancient"
   read. The old set was built around brass, because a near-black hull needed
   a mid-value appendage to be visible at thirty pixels. This one solves that
   in the hull itself: the body is PALE, so it separates from dark rock on
   value alone, and the accent can then be a single alien light rather than a
   second metal.

   Matte and barely metallic on purpose. Polished metal reads as new whatever
   color it is, and the one thing this ship must not read as is new. */
const hullMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x9a9788, metalness: 0.14, roughness: 0.92, flatShading: true
}), 0.16);

/* The plates: the same stone a shade down, so the hull reads as layered
   panels rather than as one moulded shell. */
const plateMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x6e6c62, metalness: 0.18, roughness: 0.9, flatShading: true
}), 0.18);

/* The seam light. EMISSIVE, and the only saturated color on the ship.

   Teal because that is what an Anchor does when it lights: the ship and the
   Lattice are the same civilization's work, and one shared color says so
   without a line of text. Emissive rather than lit, so it holds its value in
   a dark tunnel - a stripe that dims with the lamp is paint, and a line that
   does not is a thing still running after a very long time. */
export const SEAM_COLOR = 0x37e2c4;
const seamMat = new THREE.MeshStandardMaterial({
  color: 0x06201c, emissive: SEAM_COLOR, emissiveIntensity: 1.5,
  metalness: 0, roughness: 0.5, flatShading: true
});

/* A seam that has gone out. The same material with the light dead, which is
   the wear language the research names: not rust, not dirt, but capability
   that has stopped. */
const deadMat = new THREE.MeshStandardMaterial({
  color: 0x14201e, emissive: SEAM_COLOR, emissiveIntensity: 0.05,
  metalness: 0.1, roughness: 0.85, flatShading: true
});

/* Pitting: the hull's own stone, darker, for erosion bitten into the
   surface. */
const pitMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x565349, metalness: 0.12, roughness: 1.0, flatShading: true
}), 0.1);

/* Kept names, because the imported-hardware table and the station both build
   against them. `trimMat` is no longer a warm painted accent - there is no
   paint on this ship - but the same weathered plate. */
const trimMat = plateMat;
export const darkMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x1a1e21, metalness: 0.45, roughness: 0.7, flatShading: true
}), 0.28);
const steelMat = asMetal(new THREE.MeshStandardMaterial({
  color: 0x4a4f52, metalness: 0.5, roughness: 0.7, flatShading: true
}), 0.24);
/* What used to be brass. Nothing on the hull uses it now; the cockpit ring
   still does, and it is the pale stone there rather than a yellow metal. */
const brassMat = plateMat;

/* ---------- the hull ----------

   Playtest, 2026-09-13: *"I dont really like the look of the ship. Can you see
   if you can make it look more like advanced technology that has been sitting
   for thousands of years, so it is advanced but also old looking."*

   That replaces the W1 direction, which was *"redesign the ship to look more
   steam punk and unique"* - a boiler, a raked stack, a spoked flywheel, brass
   over everything. Standing rule 9: when he restates from scratch instead of
   refining, the model is wrong rather than the tuning, so none of that is
   kept. It also closes a hole in the fiction. The Anchors, the sealed halls
   and the Vault are all the work of somebody advanced who is long gone; a
   brass boiler belonged to no one in this world. A driller flying recovered
   Lattice gear does.

   The research (plans/lattice/REFERENCE.md - Sheikah tech, Subnautica's
   Precursor work, the Vex) converges on six signifiers, and each one below is
   one of them:

     ONE SEALED SILHOUETTE. No stack, no wheel, no exposed rod. Ancient
     advanced tech has no moving parts on the outside; the moment something
     protrudes and turns, the read is Victorian machine.
     LARGE FLAT FACETS, NO RIVETS. Few, big planes. The rivets are gone - a
     rivet is a fastening you can see, which is exactly the thing this
     civilization would not show you.
     ONE ALIEN EMISSIVE, ALONG SEAMS. Not amber, and not on gauges: gauges
     are instruments for a pilot, and a seam that glows is the object itself
     being powered. Teal, because that is what an Anchor does when it lights,
     and the ship and the Lattice should read as one hand.
     MATTE, STONE-LIKE. Low metalness and high roughness. Polished metal
     reads as new whatever color it is.
     ONE DELIBERATE ASYMMETRY. A single break in an otherwise regular object
     reads as damage; a generally messy object reads as clutter.
     WEAR AS DEAD LIGHT, NOT RUST. One seam has gone out. Rust is the
     steampunk word for age; a panel that used to be lit and is not is the
     ancient-advanced one.

   And the constraint that governed the old hull governs this one: it is about
   thirty pixels at play scale, so this is a silhouette and a value, and every
   part below is either one or the other. */

/* The core. A six-sided prism lying across the ship with a flat facet up, so
   the body is a sealed lozenge that catches the lamp in broad planes rather
   than in a highlight. Pale against dark rock, which is the whole of the
   value read at thirty pixels - the old hull was near-black and needed brass
   appendages to be visible at all. */
const core = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.44, 6), hullMat);
core.rotation.z = Math.PI / 2;
core.rotation.y = Math.PI / 12;
core.position.y = 0.01;
rig.add(core);

/* The prow shroud: a tapered collar the drill comes out of, sealed to the
   body. It is what makes the front a FRONT without anything sticking out of
   it. */
const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.2, 6), plateMat);
shroud.rotation.x = Math.PI / 2;
shroud.position.set(0, -0.18, 0.02);
rig.add(shroud);

/* Two flank plates, proud of the core, with a gap between them and it. The
   gap is the seam, and the seam is where the light is. */
for (const sx of [-1, 1]) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.34), plateMat);
  plate.position.set(sx * 0.2, 0.02, 0);
  /* THE ONE ASYMMETRY. The left plate is short and canted: a single panel
     that has been struck and never re-seated. Everything else on the hull is
     regular, which is what lets one break read as damage rather than as
     style. */
  if (sx < 0) {
    plate.scale.set(1, 0.62, 0.86);
    plate.rotation.z = 0.16;
    plate.position.y = -0.03;
  }
  rig.add(plate);
}

/* The dorsal ridge, low and sealed - the read that this is a machine with a
   spine rather than a pod. */
const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.2), plateMat);
ridge.position.set(0, 0.25, 0);
rig.add(ridge);

/* ---------- the light in the seams ----------

   One color, and it is the Anchors' own. Emissive rather than lit: this is
   the object being powered, so it must not go dark when the lamp does - a
   seam that dims with the tunnel is a painted stripe, and a seam that holds
   its value in the dark is a thing that is still running after a very long
   time. It is also what carries the ship's read at thirty pixels now that
   there is no brass: two bright lines on a pale hull. */
const seams: THREE.Mesh[] = [];
for (const sx of [-1, 1]) {
  /* Longer and a touch thicker than the first pass: at size the seams were
     one thin line and the hull read as a dark mass with a bright eye. The
     seam IS the read now, so it runs most of the flank. */
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.28, 0.4), seamMat);
  seam.position.set(sx * 0.15, 0.02, 0);
  /* The left seam follows its own broken plate down and stops short. */
  if (sx < 0) { seam.scale.set(1, 0.55, 0.8); seam.position.y = -0.04; }
  rig.add(seam);
  seams.push(seam);
}
/* One along the spine, and one across the prow, so the lit line reads from
   above and from the front as well as from the side. */
const spineSeam = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.026, 0.026), seamMat);
spineSeam.position.set(0, 0.285, 0.06);
rig.add(spineSeam);
/* And a short bar across the prow shroud, so the front reads as powered from
   head-on - which is the angle the ship is seen at while digging down. */
const prowSeam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.026, 0.026), seamMat);
prowSeam.position.set(0, -0.2, 0.14);
rig.add(prowSeam);

/* ---------- the wear ----------

   Two panels that used to be lit and are not. This is the whole age of the
   thing: not dirt, not rust, but capability that has gone out. Dark, slightly
   green-black, so they read as the same material as the live seams rather
   than as holes. */
for (const [px, py, pz, s] of [[0.2, 0.14, 0.12, 1], [-0.13, 0.2, -0.13, 0.8]] as number[][]) {
  const dead = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.02, 0.07 * s), deadMat);
  dead.position.set(px, py, pz);
  rig.add(dead);
}

/* Erosion, not rust: three shallow bites out of the hull's own material,
   sitting slightly inside the surface so they read as pitting rather than as
   attachments. Flat-shaded, so each one is a facet that catches the lamp at
   the wrong angle - which is exactly what worn stone does. */
for (const [px, py, pz, s] of [[0.17, -0.1, 0.16, 0.055], [-0.19, 0.12, 0.1, 0.045],
                               [0.06, 0.22, -0.16, 0.05]] as number[][]) {
  const pit = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 0), pitMat);
  pit.position.set(px, py, pz);
  pit.rotation.set(px * 4, py * 4, pz * 4);
  rig.add(pit);
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
/* SMALLER, and teal. Two faults the first ancient-advanced pass showed at
   size: at 0.105 across it was the biggest feature on the ship and read as a
   single huge eye, and being amber it was a SECOND alien color competing with
   the seams. The research is explicit that the look rests on one emissive,
   run along structure rather than pooled in a lens. So the window is a port
   rather than a face, and it is the same teal the seams and the Anchors
   are. */
const cab = new THREE.Mesh(
  new THREE.CylinderGeometry(0.055, 0.068, 0.07, 6),
  new THREE.MeshStandardMaterial({
    color: 0x0a1f1d, emissive: SEAM_COLOR, emissiveIntensity: 0.9,
    metalness: 0.3, roughness: 0.3, flatShading: true
  })
);
cab.position.set(0.02, 0.02, 0.24);
cab.rotation.x = Math.PI / 2;
rig.add(cab);

/* The porthole's ring. Highest-value detail at small scale for the same reason
   it always was: it separates the lit window from the lit hull, which
   otherwise merge into one bright smudge. Brass, and thick enough to survive
   being small - a thin ring is the 2 px band the research says vanishes. */
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.072, 0.018, 5, 8), plateMat);
ring.position.set(0.02, 0.02, 0.26);
rig.add(ring);

/* Much smaller than a lantern. The cockpit is a lit window. */
const cabGlow = makeGlow(SEAM_COLOR, 0.2, 0.28);
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
