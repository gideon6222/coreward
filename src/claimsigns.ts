/* What each building on the claim is FOR, said without a word of text.

   Playtest: *"it is difficult to tell what they buildings are for. I like the
   idea but need some indication about what they do."* The mechanic landed - he
   read three structures on the surface as a thing worth having - and the
   readout did not. M2 put the entire state of that system into a lean, a
   settle and one lamp, on the argument that a HUD is a claim about what the
   player should think about. That was right about WHERE the information
   belongs and wrong about how much of it a shape can carry. A building that is
   bent tells you something is wrong. It does not tell you the refinery is the
   thing that pays you.

   The mechanism is Factorio's chemical plant, which is the one fully sourced
   answer the research turned up for "what does this do, with no text": a
   window showing the tinted contents moving inside, plus a chimney venting
   smoke tinted to what it is working on. Function AND state, in two moving
   elements, readable at a glance and at any size.

   So each structure gets three things:

     1. A LIT SIGN with a pictogram, drawn to a canvas here rather than
        imported - the asset hunt found no CC0 signage that would not arrive
        with its own resolution and its own idea of how worn "worn" is, which
        is the same argument this repo already used against imported decals.
     2. A WINDOW showing what is inside, tinted to that building's own colour.
     3. MOTION when it is doing its job, and stillness when it is not.

   One colour per function, carried everywhere that function appears:

     refinery  amber   - the colour ore money already is in this game
     derrick   cyan    - the colour fuel already is on the gauge
     shed      green   - stock, which is what the manifest already uses */

import * as THREE from 'three';

export const CLAIM_COLOR = { refinery: 0xffb347, derrick: 0x49e0c0, shed: 0x7fd86a };

/* A sign face: a dark plate, a bright border, and a pictogram in the middle.

   Drawn at 128 px because the sign is about forty pixels tall in play and a
   larger canvas only costs memory to be downsampled away. Everything is drawn
   in one colour so the plate can be tinted per building without three
   canvases. */
function signTexture(kind: 'refinery' | 'derrick' | 'shed'): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d')!;
  const col = '#' + CLAIM_COLOR[kind].toString(16).padStart(6, '0');

  x.fillStyle = '#14181f';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = col;
  x.lineWidth = 6;
  x.strokeRect(7, 7, S - 14, S - 14);

  x.strokeStyle = col;
  x.fillStyle = col;
  x.lineWidth = 8;
  x.lineCap = 'round';
  x.lineJoin = 'round';

  if (kind === 'refinery') {
    /* A retort: a squat vessel with a stack, which is the silhouette the
       building itself has. The sign and the thing agree, which is the whole
       point of putting one on the other. */
    x.beginPath();
    x.moveTo(38, 92); x.lineTo(38, 58); x.lineTo(90, 58); x.lineTo(90, 92); x.closePath();
    x.stroke();
    x.beginPath();
    x.moveTo(74, 58); x.lineTo(74, 34); x.stroke();
    /* Three rising vapours over the stack. */
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.arc(74, 26 - i * 7, 3.5 - i * 0.7, 0, Math.PI * 2);
      x.fill();
    }
  } else if (kind === 'derrick') {
    /* A drop over a tank - fuel, and the direction it goes. */
    x.beginPath();
    x.moveTo(64, 26);
    x.bezierCurveTo(64, 26, 88, 54, 88, 68);
    x.bezierCurveTo(88, 82, 77, 92, 64, 92);
    x.bezierCurveTo(51, 92, 40, 82, 40, 68);
    x.bezierCurveTo(40, 54, 64, 26, 64, 26);
    x.closePath();
    x.stroke();
    x.globalAlpha = 0.55;
    x.beginPath();
    x.moveTo(43, 74); x.lineTo(85, 74); x.lineTo(85, 82);
    x.bezierCurveTo(78, 90, 50, 90, 43, 82); x.closePath();
    x.fill();
    x.globalAlpha = 1;
  } else {
    /* Stacked crates, and a roof over them. */
    x.beginPath();
    x.moveTo(30, 52); x.lineTo(64, 32); x.lineTo(98, 52); x.stroke();
    x.lineWidth = 7;
    x.strokeRect(38, 60, 24, 22);
    x.strokeRect(66, 60, 24, 22);
    x.strokeRect(52, 84, 24, 16);
  }

  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/* The plate a sign is drawn on. Emissive rather than lit, because a sign that
   goes dark with the rest of the surface at night is a sign nobody reads - and
   because this is the one thing on the claim whose job is to be legible before
   anything else about the building is. */
export function makeSign(kind: 'refinery' | 'derrick' | 'shed', w = 0.62): THREE.Mesh {
  const tex = signTexture(kind);
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w), m);
  mesh.renderOrder = 2;
  return mesh;
}

/* A window with something moving behind it.

   The pane is a dark, slightly reflective plate; `setFill` drives how much of
   it is lit from inside and how brightly, which is the "tinted liquid you can
   see through a window" half of the Factorio mechanism. A refinery with
   nothing to process is a dark window, and that reads as idle without a word.
*/
export function makeWindow(kind: 'refinery' | 'derrick' | 'shed', w: number, h: number) {
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ color: 0x0b0f14, toneMapped: false })
  );
  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.84, h * 0.84),
    new THREE.MeshBasicMaterial({
      color: CLAIM_COLOR[kind], transparent: true, opacity: 0.2,
      toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  fill.position.z = 0.006;
  const grp = new THREE.Group();
  grp.add(glass, fill);
  return {
    group: grp,
    /* `level` is how full it is (0 to 1), `pulse` how hard it is working. */
    set(level: number, pulse: number) {
      const l = Math.max(0, Math.min(1, level));
      fill.scale.y = Math.max(0.001, l);
      /* Filled from the BOTTOM, like anything in a tank. */
      fill.position.y = -h * 0.42 * (1 - l);
      (fill.material as THREE.MeshBasicMaterial).opacity = 0.14 + l * (0.34 + pulse * 0.42);
    }
  };
}
