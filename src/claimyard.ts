/* The Claim, as three things standing next to the pad.

   claim.ts owns the rules; this owns the picture. It is the only place the
   strain and the damage are shown, on purpose: `CRAFT.md` says a HUD is a claim
   about what the player should think about, and the state of the surface is
   something to think about while you are ON the surface, not while you are
   cutting rock a hundred metres under it.

   Built from primitives in the same family as pad.ts, and for the reason
   written there: an imported station kit arrives with its own topology, its own
   normals and its own idea of scale, and the join to flat-shaded low-poly
   terrain shows in the first frame. The asset hunt recommended importing here;
   the pad's own note is older, better argued and by the same rule, so the
   structures are coded and the import budget goes to the surfaces in M7, where
   a normal map genuinely cannot be written by hand.

   Three silhouettes, deliberately unlike each other, because `CRAFT.md` says
   silhouette carries more than colour and these are read at a glance from
   above while landing:

     refinery  a squat drum with a stack     - wide and low
     derrick   an open lattice tower          - tall and thin
     shed      a long low box with a pitched roof

   Damage is shown as a lean and a darkening rather than as a number, because
   `CRAFT.md` says make failure a shape. A structure at 40% is visibly wrong
   from the air before any text says so. */

import * as THREE from 'three';
import { START_X } from './sim/config';
import { scene } from './scene';
import { worldX, asMetal, gritTex, makeGlow } from './materials';
import { applyLight } from './lightmap';
import { g, S } from './sim/state';
import { stabilityLine, SHED_MULT } from './sim/claim';
import { makeSign, makeWindow, CLAIM_COLOR } from './claimsigns';
import { coreM } from './sim/state';

const yard = new THREE.Group();

/* The three windows and the derrick's beam, declared before the blocks that
   build them so each structure can be assembled in one place. */
let refWin: ReturnType<typeof makeWindow>;
let derWin: ReturnType<typeof makeWindow>;
let shedWin: ReturnType<typeof makeWindow>;
let beam: THREE.Mesh;

const steel = applyLight(asMetal(new THREE.MeshStandardMaterial({
  color: 0x3b434e, map: gritTex, metalness: 0.6, roughness: 0.7, flatShading: true
}), 0.35));
const steelWorn = applyLight(asMetal(new THREE.MeshStandardMaterial({
  color: 0x55606c, map: gritTex, metalness: 0.66, roughness: 0.58, flatShading: true
}), 0.4));
const painted = applyLight(new THREE.MeshStandardMaterial({
  color: 0xb2762c, map: gritTex, metalness: 0.12, roughness: 0.85, flatShading: true
}));

function box(w: number, h: number, d: number, mat: THREE.Material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}

/* ---------- refinery: a drum, a stack and two pipes ---------- */
const refinery = new THREE.Group();
{
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.9, 10), steelWorn);
  drum.position.y = 0.45;
  refinery.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 10), painted);
  band.position.y = 0.62;
  refinery.add(band);
  const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 1.1, 8), steel);
  stack.position.set(0.3, 1.35, -0.1);
  refinery.add(stack);
  for (const sx of [-0.5, 0.5]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), steel);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(sx * 0.9, 0.3, 0.2);
    refinery.add(pipe);
  }
  refWin = makeWindow('refinery', 0.5, 0.34);
  refWin.group.position.set(0, 0.46, 0.63);
  refinery.add(refWin.group);
  const rs = makeSign('refinery', 0.66);
  rs.position.set(0, 1.18, 0.45);
  refinery.add(rs);
}
refinery.position.set(-2.35, 0.02, 0.35);
yard.add(refinery);

/* ---------- derrick: an open lattice, the tallest thing on the surface ---------- */
const derrick = new THREE.Group();
{
  for (const [sx, sz] of [[-0.32, -0.28], [0.32, -0.28], [-0.32, 0.28], [0.32, 0.28]] as [number, number][]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.075, 2.4, 0.075), steel);
    /* Splayed feet: the legs lean in as they rise, which is what makes a
       lattice read as a tower rather than as four posts. */
    leg.position.set(sx, 1.2, sz);
    leg.rotation.z = -sx * 0.09;
    leg.rotation.x = sz * 0.09;
    derrick.add(leg);
  }
  for (let i = 1; i <= 4; i++) {
    const ring = box(0.62 - i * 0.05, 0.05, 0.56 - i * 0.05, steel);
    ring.position.y = i * 0.5;
    derrick.add(ring);
  }
  /* A winch house, wider than the tower it sits on. Without it the lattice is
     a stack of evenly spaced rungs, which is a ladder - and there is already a
     real ladder on the pad twenty pixels away. Silhouette carries more than
     colour, and two things must not share one. */
  const head = box(0.78, 0.34, 0.6, steelWorn);
  head.position.y = 2.52;
  derrick.add(head);
  const jib = box(0.16, 0.16, 0.9, painted);
  jib.position.set(0, 2.42, 0.62);
  derrick.add(jib);
  /* The tank at its foot is where the fuel actually is, so that is where the
     window goes - not on the tower, which is only the thing that stands over
     it. */
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.5, 10), steelWorn);
  tank.position.set(0, 0.25, 0.46);
  derrick.add(tank);
  derWin = makeWindow('derrick', 0.34, 0.34);
  derWin.group.position.set(0, 0.25, 0.815);
  derrick.add(derWin.group);
  const ds = makeSign('derrick', 0.62);
  ds.position.set(0, 1.02, 0.42);
  derrick.add(ds);
  /* The walking beam: the one moving part, and the thing that says "running"
     from across the surface. */
  beam = box(0.7, 0.09, 0.09, painted);
  beam.position.set(0, 1.6, 0.3);
  derrick.add(beam);
}
derrick.position.set(2.35, 0.02, 0.1);
yard.add(derrick);

/* The strain lamp, and the only readout the Claim has. It sits on top of the
   tallest structure because that is the thing you can see from the air on the
   way down, which is the moment the reading is worth having. */
const lamp = makeGlow(0x6fffc0, 0.9, 0.55);
lamp.position.set(2.35, 2.78, 0.1);
yard.add(lamp);

/* ---------- shed: low, long, and where stored ore sits ---------- */
const shed = new THREE.Group();
{
  const body = box(1.5, 0.6, 0.8, steelWorn);
  body.position.y = 0.3;
  shed.add(body);
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.52, 6, 1, false, 0, Math.PI), painted);
  roof.rotation.z = Math.PI / 2;
  roof.position.y = 0.6;
  shed.add(roof);
  const door = box(0.5, 0.42, 0.03, steel);
  door.position.set(0, 0.21, 0.41);
  shed.add(door);
  shedWin = makeWindow('shed', 0.42, 0.3);
  shedWin.group.position.set(0, 0.3, 0.415);
  shed.add(shedWin.group);
  const ss = makeSign('shed', 0.56);
  ss.position.set(-0.62, 0.62, 0.3);
  shed.add(ss);
}
shed.position.set(-0.95, 0.02, 1.25);
yard.add(shed);

yard.position.x = worldX(START_X);
scene.add(yard);

/* ---------- what damage looks like ---------- */

const parts: Record<'refinery' | 'derrick' | 'shed', THREE.Group> = { refinery, derrick, shed };
/* Each structure leans its own way, so a wrecked yard reads as a place things
   happened to rather than as one object that was rotated. */
const LEAN = { refinery: 0.16, derrick: -0.13, shed: 0.09 };
/* Their standing height, captured once. The settle below writes position.y
   every frame, and writing an absolute value there quietly discarded the base
   height each structure was placed at. */
const BASE_Y = { refinery: refinery.position.y, derrick: derrick.position.y, shed: shed.position.y };

let lampT = 0, beamT = 0;

/* Called every frame from the loop. Cheap: three rotations, three colours and
   one sine. Nothing here allocates. */
export function updateClaim(dt: number) {
  const c = g.claim;
  for (const k of ['refinery', 'derrick', 'shed'] as const) {
    const hurt = 1 - c[k] / 100;
    const grp = parts[k];
    grp.rotation.z = LEAN[k] * hurt;
    /* And it settles into the ground as it goes, which is what actually sells
       a lean as damage rather than as a jaunty angle. */
    grp.position.y = BASE_Y[k] - 0.22 * hurt * hurt;
  }

  /* What each building is DOING, which is the half a lean cannot carry.

     Factorio's chemical plant: the window shows the tinted contents and the
     motion says whether it is working. Here the refinery's window fills with
     what is in the hold - so flying home with a full load lights it up before
     you have sold anything - the derrick's shows the tank against the ship's
     own fuel, and the shed's shows how much is stored in it. Each dims as its
     structure takes damage, because a wrecked building doing less is exactly
     what the mechanic says happens. */
  const cap = Math.max(1, S.cargoCap());
  refWin.set((g.weight / cap) * (c.refinery / 100), c.refinery / 100 * 0.6);
  derWin.set((g.fuel / Math.max(1, S.fuelCap())) * (c.derrick / 100), 0.2);
  let stored = 0;
  for (const k in c.stored) stored += c.stored[k];
  shedWin.set(Math.min(1, stored / 40) * (c.shed / 100), 0);

  /* The walking beam only walks when there is something to pump into, which
     is the difference between a machine and a decoration. */
  const pumping = g.fuel < S.fuelCap() - 0.5 && c.derrick > 0;
  beamT += dt * (pumping ? 2.4 : 0.15);
  beam.rotation.z = Math.sin(beamT) * (pumping ? 0.26 : 0.02);

  /* The strain lamp: green and steady at rest, amber and quickening as the
     ground gives, red and fast just before it goes. A rate rather than a
     colour alone, because a colour you have to remember is not a reading. */
  const core = coreM();
  const s = Math.min(1, c.strain);
  lampT += dt * (1.1 + s * 7);
  const pulse = 0.55 + 0.45 * Math.sin(lampT);
  const mat = lamp.material as THREE.SpriteMaterial;
  mat.color.setRGB(0.35 + s * 0.65, 1 - s * 0.75, 0.62 - s * 0.55);
  mat.opacity = 0.35 + pulse * (0.25 + s * 0.5);
  /* Above the line the lamp is simply off. There is nothing to report and a
     lamp that always says something teaches you to stop reading it. */
  lamp.visible = g.pd > stabilityLine(core) || s > 0.02;
}
