import * as THREE from 'three';
import { scene } from './scene';
import { makeGlow } from './materials';

/* The drill ship.

   Small on purpose. With 18 rows framed it occupies maybe thirty pixels, so
   "detail" here means silhouette rather than surface: swept fins read at that
   size, panel lines do not. The parts that survive shrinking are the tapered
   nose, the fin sweep, the dark ring separating the canopy from the hull, and
   the spiral on the auger once it turns. */

export const player = new THREE.Group();
export const rig = new THREE.Group();
player.add(rig);

const hullMat = new THREE.MeshLambertMaterial({ color: 0x3aa8d8, emissive: 0x0a2a3a, flatShading: true });
const trimMat = new THREE.MeshLambertMaterial({ color: 0xe8eef8, emissive: 0x1a2230, flatShading: true });
export const darkMat = new THREE.MeshLambertMaterial({ color: 0x28303c, flatShading: true });

/* ---------- body ---------- */

const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.58, 8), hullMat);
rig.add(hull);

/* tapered cowl, so the ship has a nose instead of ending in a flat disc */
const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.21, 0.17, 8), trimMat);
cowl.position.y = 0.36;
rig.add(cowl);

/* the collar the drill hangs off */
const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.11, 8), trimMat);
collar.position.y = -0.3;
rig.add(collar);

/* Swept fins rather than the old round pods. A cylinder reads as a blob at this
   scale; an angled blade still reads as a shape. */
for (const sx of [-1, 1]) {
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.38, 0.2), darkMat);
  fin.position.set(sx * 0.25, 0.02, -0.02);
  fin.rotation.z = sx * 0.22;
  rig.add(fin);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.16), hullMat);
  tip.position.set(sx * 0.31, -0.16, -0.02);
  tip.rotation.z = sx * 0.22;
  rig.add(tip);
}

/* ---------- drill ---------- */

export const bit = new THREE.Group();

/* A real auger: a tapered hexagonal cylinder whose vertices are twisted around
   Y in proportion to height, so the flutes spiral. One mesh, one draw call, and
   the spiral is the only reason the rotation is visible at all - a smooth cone
   looks identical at every angle. */
const augerGeo = (() => {
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
const augerMat = new THREE.MeshLambertMaterial({ color: 0x9fb0c4, emissive: 0x121a24, flatShading: true });

/* One look per drill tier.

   The Drill Bit is the most-bought upgrade in the game and it has ten named
   tiers - Steel, Tungsten, Carbide, up to Godcore - and until now every one of
   them looked like the same grey auger. The Scanner Array had the same problem
   and the headlight fixed it; this is the same argument. An upgrade the player
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

const cab = new THREE.Mesh(
  new THREE.SphereGeometry(0.145, 12, 10),
  new THREE.MeshLambertMaterial({ color: 0xffe27a, emissive: 0xa07a10 })
);
cab.position.set(0, 0.08, 0.26);
rig.add(cab);

/* A dark ring around the canopy. This is the single highest-value detail at
   small scale: it separates the lit cockpit from the lit hull, which otherwise
   merge into one bright smudge. */
const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.026, 6, 14), darkMat);
ring.position.set(0, 0.08, 0.27);
rig.add(ring);

const cabGlow = makeGlow(0xffe9a0, 0.7, 0.4);
cabGlow.position.set(0, 0.08, 0.4);
rig.add(cabGlow);

/* shoulder running lights, so the hull has a readable outline in the dark */
for (const sx of [-0.3, 0.3]) {
  const lamp = makeGlow(0x6fe8ff, 0.3, 0.55);
  lamp.position.set(sx, -0.14, 0.2);
  rig.add(lamp);
}

/* ---------- thrusters ---------- */

export const flames: { cone: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>; glow: THREE.Sprite }[] = [];
for (const sx of [-0.19, 0.19]) {
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.055, 0.1, 6), darkMat);
  nozzle.position.set(sx, 0.3, 0);
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

/* ---------- headlight ----------

   A volumetric cone thrown from the drill in whatever direction the ship is
   facing. It is parented to `rig`, so it swings with the ship for free.

   Two things it fixes. The lamp was a point light: it lit the rock but the
   ship itself showed no sign of being the thing doing the lighting, which at
   this scale made it read as a glowing object rather than as a machine. And
   the Scanner Array only ever changed `lamp.distance` - the most invisible
   upgrade on the shelf. The cone's length now tracks it, so buying a level is
   something you can see rather than something you take on trust.

   The fade costs nothing. Under additive blending black IS transparent, so
   vertex colours running white at the apex to black at the mouth give a soft
   falloff without a texture, an alpha channel or a second draw call. */
const CONE_LEN = 2.9;
const coneGeo = new THREE.ConeGeometry(0.78, CONE_LEN, 14, 1, true);
/* ConeGeometry already has its apex at +y and its mouth at -y, which is
   exactly a beam pointing the way the drill points. The first attempt rotated
   it 180 degrees on the assumption that cones "point up", which put the wide
   end AT the ship: a funnel rather than a headlight. Only translate, so the
   apex lands just under the drill. */
coneGeo.translate(0, -CONE_LEN / 2 - 0.4, 0);
{
  const pos = coneGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    /* apex sits at y = -0.4, mouth at -(CONE_LEN + 0.4) */
    const t = (-pos.getY(i) - 0.4) / CONE_LEN;
    const v = Math.pow(1 - Math.min(1, Math.max(0, t)), 2.1);
    col[i * 3] = v; col[i * 3 + 1] = v * 0.94; col[i * 3 + 2] = v * 0.76;
  }
  coneGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export const headlight = new THREE.Mesh(
  coneGeo,
  /* FrontSide, not DoubleSide. Additive blending draws both walls of an
     open cone on top of each other at the silhouette, which turns the edges
     into two bright outlines and makes the whole thing read as a solid
     trapezoid instead of as light. */
  new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide
  })
);
/* In FRONT of the rock face, not level with the ship.

   At z = 0 the cone sits inside the block volume, so the terrain occludes it -
   and since the ship spends almost all its time in a one-cell tunnel, that
   meant a headlight with nowhere to shine. Pushed forward it reads as light
   falling ON the wall ahead, which is what a beam looks like from this camera
   anyway. The ore halos have always worked exactly this way. */
headlight.position.z = 0.62;
headlight.renderOrder = 1;
rig.add(headlight);

/* Shrunk against the terrain so the world reads as large. The squash animation
   scales `player`, so scaling `rig` here does not interfere with it. */
rig.scale.setScalar(0.82);

scene.add(player);
export const FACE_ANGLE = { down: 0, right: Math.PI / 2, left: -Math.PI / 2, up: Math.PI };
