/* Group signage and lighting for the Outfitter.

   Playtest: *"reorganize the shop so they are layed out more intuitively"* and
   *"make it feel more like a space station with different colors textures and
   lights."*

   Two findings from the research drive this, and only two, because they were
   the ones with a source behind them.

   **Deep Rock Galactic's Space Rig** puts every function at a separate, named,
   walked-to station rather than on one wall of terminals. This game already
   has the grouping - rig, survival, instruments, ordnance - and was throwing it
   away at the last step: the shelf was laid out in table order, so a drill sat
   next to a cooling rig sat next to a scanner and the four groups the design
   is built on were invisible in the room. Sorting the shelf by group and
   putting a lit header over each band is the same idea at the scale a portrait
   phone can actually hold.

   **Cheap sci-fi lighting** is an emissive strip as the primary read plus one
   warm key against a cool ambient. This game already does exactly that
   underground - warm lamp, cool ambient - so the station carries it verbatim
   rather than inventing a second look. Each group's strip is its own colour,
   which is what makes the bands read as different departments of one place
   instead of one wall painted four ways.

   A colour per group, chosen from what each already means in this game:

     rig          amber   the working end - drill, hold, thrust
     survival     red     hull, heat, fuel, the tow
     instruments  cyan    light, survey, autopilot
     ordnance     violet  the charge and the laser */

import * as THREE from 'three';

export const GROUP_ORDER = ['rig', 'survival', 'instruments', 'ordnance'] as const;
export type GroupName = typeof GROUP_ORDER[number];

export const GROUP_COLOR: Record<GroupName, number> = {
  rig: 0xffb347, survival: 0xff6b5e, instruments: 0x49e0c0, ordnance: 0xb07cff
};

export const GROUP_LABEL: Record<GroupName, string> = {
  rig: 'RIG', survival: 'SURVIVAL', instruments: 'INSTRUMENTS', ordnance: 'ORDNANCE'
};

/* A header plate: the group's name in its own colour on a dark strip, with a
   bright rule under it. Drawn rather than imported for the same reason the
   claim's signs are - the asset hunt found no CC0 signage that would not
   arrive with its own resolution and its own idea of how worn "worn" is. */
function headerTexture(g: GroupName): THREE.CanvasTexture {
  const W = 256, H = 68;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d')!;
  const col = '#' + GROUP_COLOR[g].toString(16).padStart(6, '0');

  x.fillStyle = 'rgba(10,13,18,0.92)';
  x.fillRect(0, 0, W, H);
  x.fillStyle = col;
  x.fillRect(0, H - 7, W, 7);

  x.fillStyle = col;
  x.textBaseline = 'middle';
  x.letterSpacing = '3px';
  /* MEASURED and shrunk to fit, never truncated.

     This is the repo's own round-two lesson arriving again: drawPlate() drew
     at a fixed size with no width limit and "SALVAGE MAGNET" ran off its
     plate, and the fix recorded then was to measure and shrink rather than to
     shorten the name. The first version of this header did the same thing and
     INSTRUMENTS came out as INSTRUMEN.

     Chakra Petch is the game's face and is loaded long before the shop can be
     opened; the fallback matters only for the first frame after a cold
     install. */
  const pad = 12, avail = W - pad * 2;
  let size = 34;
  do {
    x.font = '700 ' + size + 'px "Chakra Petch", system-ui, sans-serif';
    if (x.measureText(GROUP_LABEL[g]).width <= avail) break;
    size -= 2;
  } while (size > 14);
  x.fillText(GROUP_LABEL[g], pad, H / 2 - 4);

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

export interface GroupHeader {
  group: THREE.Group;
  setVisible(v: boolean): void;
  place(x: number, y: number, z: number, scale: number): void;
}

/* The header, plus the emissive strip that runs under it. The strip is the
   thing doing the lighting work: an unlit plane with the group's colour on it
   reads as a lit fitting for a fraction of what an actual light costs, which
   is the whole point of the technique. */
export function makeHeader(g: GroupName): GroupHeader {
  const grp = new THREE.Group();

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.12, 0.30),
    new THREE.MeshBasicMaterial({ map: headerTexture(g), transparent: true, toneMapped: false })
  );
  grp.add(plate);

  /* A thin bar of the group's colour a little in front, so the band has a
     glow of its own that the cases sit inside. */
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 0.035),
    new THREE.MeshBasicMaterial({
      color: GROUP_COLOR[g], transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    })
  );
  strip.position.set(0.62, -0.2, 0.04);
  grp.add(strip);

  grp.renderOrder = 2;
  return {
    group: grp,
    setVisible(v: boolean) { grp.visible = v; },
    place(x: number, y: number, z: number, scale: number) {
      grp.position.set(x, y, z);
      grp.scale.setScalar(scale);
    }
  };
}
