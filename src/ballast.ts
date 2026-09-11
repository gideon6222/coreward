/* The Ballast, standing beside the pad.

   Playtest: *"I want to remove the buildings or redesign them visually and
   their purpose."*

   `unrest.ts` owns the rules; this owns the picture. It replaces the refinery,
   the derrick and the store shed - three silhouettes, three meters, three
   repair prices and one idea - with a single machine that can actually be
   lost, and whose whole state is legible from the air on the way down.

   ---------- what it has to say, and how ----------

   Four readings, and none of them is a number on a HUD:

     HOW FULL IT IS   a sight glass up the side, lit to the level. This is the
                      one you read while landing, so it is the tallest, most
                      vertical thing on the machine - a bar chart you can see
                      at fifty pixels
     HOW HARD IT IS   the pressure dial on the front, whose needle swings with
     WORKING          the planet's Unrest, and the stack, which vents faster as
                      the needle climbs
     HOW FAR YOU      the tier collars. Every Anchor lit stacks another drum
     HAVE COME        section on, so the machine visibly grows over a campaign
                      and the surface tells you where you are without a menu.
                      This is SteamWorld Dig's town, and it is the cheapest
                      legible-progress device the research found
     THAT IT IS       when the Ballast empties the glass goes dark, the dial
     FAILING          pins, and the vent stops. A machine that has stopped
                      moving is the most obvious failure state there is

   ---------- why it is coded and not imported ----------

   Same argument pad.ts made and it has not got weaker: an imported station kit
   arrives with its own topology, its own normals and its own idea of scale,
   and the join to flat-shaded low-poly terrain shows in the first frame. The
   import budget goes to surfaces, where a normal map genuinely cannot be
   written by hand.

   ---------- and it is steampunk, at thirty pixels ----------

   The ship's rule, applied again: at play scale only things that break the
   OUTLINE survive. So the machine is a riveted vertical vessel (a mass), a
   flared stack off-centre (an outline break), an external sight glass and
   pipework standing clear of the body (negative space), and collars that
   change the profile as they stack. The rivets, the brass and the dial face
   are for when you are standing next to it on the pad, which you are, every
   run, for as long as it takes to sell. */

import * as THREE from 'three';
import { START_X } from './sim/config';
import { scene } from './scene';
import { worldX, asMetal, gritTex, makeGlow } from './materials';
import { applyLight } from './lightmap';
import { g } from './sim/state';
import { planetUnrest, BALLAST_SAFE } from './sim/unrest';

const station = new THREE.Group();

/* Iron for the pressure parts, brass for everything that reads as an
   instrument, and one painted colour for the tier collars so growth is the
   only thing on the machine that is not metal. Brass carries VALUE against the
   dark iron, which is what made the ship read at thirty pixels - the same
   lesson, and there was no reason to learn it twice. */
const iron = applyLight(asMetal(new THREE.MeshStandardMaterial({
  color: 0x39404a, map: gritTex, metalness: 0.62, roughness: 0.72, flatShading: true
}), 0.35));
const ironWorn = applyLight(asMetal(new THREE.MeshStandardMaterial({
  color: 0x525c68, map: gritTex, metalness: 0.68, roughness: 0.6, flatShading: true
}), 0.4));
const brass = applyLight(asMetal(new THREE.MeshStandardMaterial({
  color: 0xa8762e, map: gritTex, metalness: 0.9, roughness: 0.42, flatShading: true
}), 0.5));
const collarMat = applyLight(new THREE.MeshStandardMaterial({
  color: 0xb2762c, map: gritTex, metalness: 0.15, roughness: 0.82, flatShading: true
}));

/* ---------- the vessel ----------

   Ten-sided rather than smooth. Facets take the lamp unevenly, which is what
   makes a shape read as riveted plate rather than as a moulded tube - the same
   reason the ship's boiler is eight-sided. */
const VESSEL_R = 0.62;
const VESSEL_H = 2.3;
const vessel = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL_R, VESSEL_R * 1.08, VESSEL_H, 10), iron);
vessel.position.y = VESSEL_H / 2;
station.add(vessel);

/* A domed cap, because a flat-topped cylinder is a bin. */
const cap = new THREE.Mesh(new THREE.SphereGeometry(VESSEL_R, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), ironWorn);
cap.position.y = VESSEL_H;
station.add(cap);

/* And a plinth it is bolted to, so it is standing on the ground rather than
   growing out of it. */
const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.92, 0.22, 10), ironWorn);
plinth.position.y = 0.11;
station.add(plinth);

/* ---------- rivets ----------

   Three rings of them, instanced into one draw call. Invisible at play scale
   and the whole character of the thing at pad scale. */
{
  const ROWS = [0.35, 1.05, 1.75];
  const PER = 14;
  const rivets = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.035, 5, 3), brass, ROWS.length * PER
  );
  const m = new THREE.Matrix4();
  let i = 0;
  for (const y of ROWS) {
    for (let k = 0; k < PER; k++) {
      const a = (k / PER) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * VESSEL_R * 1.01, y, Math.sin(a) * VESSEL_R * 1.01);
      rivets.setMatrixAt(i++, m);
    }
  }
  rivets.instanceMatrix.needsUpdate = true;
  station.add(rivets);
}

/* Hoop bands between the rivet rows - the horizontals that stop a tall
   cylinder reading as a pipe. */
for (const y of [0.7, 1.4]) {
  const hoop = new THREE.Mesh(new THREE.CylinderGeometry(VESSEL_R * 1.04, VESSEL_R * 1.04, 0.09, 10), ironWorn);
  hoop.position.y = y;
  station.add(hoop);
}

/* ---------- the sight glass ----------

   The most important element and therefore the tallest, straightest, most
   isolated one: a brass-collared tube standing clear of the body on the side
   the camera is on, lit from inside to the Ballast's own level.

   Stood OFF the vessel rather than let into it, because a window flush with a
   dark cylinder is a dark rectangle at any distance, and a tube with daylight
   behind it is a line. Negative space reads as strongly as filled shape. */
const GLASS_H = 1.7;
const glassTube = new THREE.Mesh(
  new THREE.CylinderGeometry(0.075, 0.075, GLASS_H, 6),
  new THREE.MeshBasicMaterial({ color: 0x0a0f14, toneMapped: false })
);
glassTube.position.set(0.5, 0.98, 0.52);
station.add(glassTube);

/* The fluid in it. Scaled from the bottom, which is where fluid sits.

   IN FRONT of the tube, not inside it. Inside was the obvious way to build it
   and it drew nothing at all: the tube is opaque and goes through the opaque
   pass first, the fluid is additive with `depthWrite` off, and an additive
   surface behind an opaque one is depth-rejected before it ever blends. The
   most important readout on the machine was invisible for exactly as long as
   it took to look at it.

   So the tube is the dark BACKING and the fluid is the lit face over it, which
   is also how a real sight glass reads from the front. */
const fluid = new THREE.Mesh(
  new THREE.CylinderGeometry(0.052, 0.052, GLASS_H, 6),
  new THREE.MeshBasicMaterial({
    color: 0x49e0c0, transparent: true, opacity: 0.9,
    toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false
  })
);
fluid.position.set(glassTube.position.x, glassTube.position.y, glassTube.position.z + 0.06);
station.add(fluid);

for (const y of [0.98 - GLASS_H / 2, 0.98 + GLASS_H / 2]) {
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 6), brass);
  collar.position.set(0.5, y, 0.52);
  station.add(collar);
  /* And the pipe back into the vessel, so the glass is plumbed rather than
     stuck on. */
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.45, 5), brass);
  arm.rotation.z = Math.PI / 2;
  arm.rotation.y = -0.75;
  arm.position.set(0.32, y, 0.36);
  station.add(arm);
}

/* ---------- the dial ----------

   A real instrument: a brass bezel, a dark face, a red danger arc, and a
   needle that moves. The needle reads the PLANET, not the tank - the tank has
   the glass - so the two readouts answer different questions and neither is
   decoration. */
const dialFace = new THREE.Mesh(
  new THREE.CircleGeometry(0.27, 20),
  new THREE.MeshBasicMaterial({ color: 0x11151c, toneMapped: false })
);
dialFace.position.set(-0.16, 1.42, VESSEL_R + 0.02);
station.add(dialFace);
{
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.035, 6, 20), brass);
  bezel.position.copy(dialFace.position);
  station.add(bezel);
  /* The danger arc, from BALLAST_SAFE round to the pin. Drawn from the
     constant so the paint on the dial and the rule in the simulation cannot
     disagree - which is the one-source-of-truth rule applied to a picture. */
  const a0 = Math.PI * (1 - BALLAST_SAFE);
  const arc = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.245, 16, 1, 0, a0),
    new THREE.MeshBasicMaterial({ color: 0xd63a4a, toneMapped: false, side: THREE.DoubleSide })
  );
  arc.position.set(dialFace.position.x, dialFace.position.y, dialFace.position.z + 0.004);
  station.add(arc);
}
/* Pivoted at its base so a rotation about z swings it like a needle. */
const needle = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.24, 0.012), brass);
needle.geometry.translate(0, 0.12, 0);
needle.position.set(dialFace.position.x, dialFace.position.y, dialFace.position.z + 0.012);
station.add(needle);
const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 8), brass);
hub.rotation.x = Math.PI / 2;
hub.position.copy(needle.position);
station.add(hub);

/* ---------- the stack ----------

   Off-centre and raked, which is two asymmetries for the price of one and is
   the single most efficient steampunk signal there is - it changes the
   outline rather than the surface. */
const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 1.0, 8), ironWorn);
stack.position.set(-0.3, VESSEL_H + 0.4, -0.12);
stack.rotation.z = 0.2;
station.add(stack);
const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.11, 0.1, 8), brass);
crown.position.set(-0.42, VESSEL_H + 0.9, -0.12);
crown.rotation.z = 0.2;
station.add(crown);

/* The vent, which is the machine's pulse. */
const vent = makeGlow(0xffb37a, 0.8, 0.5);
vent.position.set(-0.45, VESSEL_H + 1.02, -0.12);
station.add(vent);

/* ---------- the hopper ----------

   Where the ore goes in. A tipped chute on the pad side, so the thing you do
   at this machine has a place, and the place is on the side you walk up to. */
{
  const chute = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.16, 0.44, 6), ironWorn);
  chute.position.set(-0.62, 0.62, 0.34);
  chute.rotation.z = 0.42;
  station.add(chute);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 5, 12), brass);
  lip.rotation.x = Math.PI / 2;
  lip.rotation.z = 0.42;
  lip.position.set(-0.71, 0.81, 0.34);
  station.add(lip);
}

/* ---------- the tier collars ----------

   One per Anchor. Built once at full count, shown to the tier - a mesh that
   already exists and is invisible costs a matrix, and a mesh built at runtime
   costs a frame hitch at exactly the moment the player is being congratulated.

   Nine, because there are nine Anchors. They stack ABOVE the dome, so the
   machine gets taller rather than fatter and the growth is visible against the
   skyline from anywhere on the surface. */
export const MAX_TIER = 9;
const collars: THREE.Mesh[] = [];
for (let i = 0; i < MAX_TIER; i++) {
  const r = 0.5 - i * 0.028;
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.02, 0.16, 8), i % 2 ? collarMat : ironWorn);
  drum.position.y = VESSEL_H + 0.16 + i * 0.17;
  drum.visible = false;
  collars.push(drum);
  station.add(drum);
}

/* To the RIGHT of the pad, and that is a measured decision rather than a
   taste. The camera is 17.7 units back at a 52 degree vertical field on a
   0.46 aspect, which makes the visible world about eight units across - and
   the HUD's action buttons occupy the left sixteen to thirty-two per cent of
   it, which is exactly where this machine stood on its first build. It was
   drawing perfectly and was behind four opaque plates.

   The right-hand side above the d-pad is the largest clear area on a portrait
   phone, and it is where the eye already goes when the ship settles onto the
   pad. */
station.position.x = worldX(START_X) + 2.35;
station.position.z = 0.3;
scene.add(station);

/* ---------- the frame ---------- */

let ventT = 0;
let needleAt = 0;

/* Called every frame from the loop. Nothing here allocates. */
export function updateBallast(dt: number) {
  const s = g.ground;
  const u = planetUnrest(s);

  /* The glass. Scaled from the bottom of the tube, so the fluid sits in it. */
  const lvl = Math.max(0.0015, s.ballast);
  fluid.scale.y = lvl;
  fluid.position.y = glassTube.position.y - (GLASS_H / 2) * (1 - lvl);
  fluid.position.z = glassTube.position.z + 0.06;
  const fm = fluid.material as THREE.MeshBasicMaterial;
  /* Cyan while it is holding, red as it runs out. A level you have to
     remember the scale of is not a reading; a colour that changes is. */
  const low = 1 - Math.min(1, s.ballast / BALLAST_SAFE);
  fm.color.setRGB(0.28 + low * 0.6, 0.88 - low * 0.62, 0.75 - low * 0.5);
  fm.opacity = 0.55 + 0.35 * (1 - low);

  /* The needle, eased rather than snapped. It sweeps 180 degrees from calm on
     the left to the pin on the right, and it is CRITICALLY DAMPED by a simple
     lerp: a needle that tracks a value exactly looks like a progress bar, and
     one that lags looks like an instrument. */
  needleAt += (u - needleAt) * Math.min(1, dt * 1.6);
  needle.rotation.z = Math.PI / 2 - needleAt * Math.PI;

  /* The vent. Faster and brighter as the planet works harder, and STOPPED when
     the tank is empty, because a machine that has stopped moving is the most
     obvious failure state there is. */
  const dead = s.ballast <= 0;
  ventT += dt * (dead ? 0 : 0.9 + u * 5.5);
  const puff = dead ? 0 : 0.5 + 0.5 * Math.sin(ventT);
  const vm = vent.material as THREE.SpriteMaterial;
  vm.opacity = dead ? 0 : 0.16 + puff * (0.2 + u * 0.45);
  vent.scale.setScalar(0.5 + puff * 0.28);

  for (let i = 0; i < MAX_TIER; i++) collars[i].visible = i < s.tier;
}
