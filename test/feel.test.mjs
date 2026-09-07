/* Game feel.

   CRAFT.md calls these values load-bearing, and until now they were the one
   part of the codebase nothing tested — a refactor could have changed hit-stop
   from 75 ms to 35 ms with every gate still green.

   Two kinds of assertion here, and the second matters more. The snapshot pins
   the exact numbers so a change has to be deliberate. The invariants pin the
   *design intent*: ore has to land heavier than rock, the core giving way has
   to be the biggest thing that happens. Those survive retuning; a snapshot does
   not. If you retune, re-record the baseline and check it on the phone. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();

test('feel constants are unchanged', () => {
  assertGolden('feel', {
    hitStop: { ore: H.FREEZE_ORE, rock: H.FREEZE_ROCK },
    shake: {
      crack: H.SHAKE_CRACK, rock: H.SHAKE_ROCK, ore: H.SHAKE_ORE,
      landing: H.SHAKE_LANDING, tow: H.SHAKE_TOW, boom: H.SHAKE_BOOM,
      decay: H.SHAKE_DECAY
    },
    squash: {
      dig: H.SQUASH_DIG, brk: H.SQUASH_BREAK,
      decay: H.SQUASH_DECAY, scale: H.SQUASH_SCALE
    },
    camera: {
      play: H.CAM_FOLLOW_PLAY, fly: H.CAM_FOLLOW_FLY,
      zoom: H.CAM_ZOOM_RATE, yOffset: H.CAM_Y_OFFSET
    },
    depth: {
      ramp: H.DEPTH_RAMP, ambientSurface: H.AMBIENT_SURFACE,
      ambientFalloff: H.AMBIENT_FALLOFF, fogSurface: H.FOG_SURFACE, fogGain: H.FOG_GAIN
    },
    cost: {
      move: H.FUEL_PER_MOVE, digBase: H.FUEL_DIG_BASE,
      digPerHardness: H.FUEL_DIG_PER_HARDNESS, hullRegen: H.HULL_REGEN
    },
    heat: {
      depth: H.HEAT_DEPTH, ramp: H.HEAT_RAMP,
      exponent: H.HEAT_EXPONENT, rate: H.HEAT_RATE
    }
  });
});

test('the curves are unchanged', () => {
  const at = (f, xs) => xs.map((x) => [x, Number(f(x).toFixed(10))]);
  assertGolden('feel-curves', {
    easeInOut: at(H.easeInOut, [-0.5, 0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1, 1.5]),
    depthT: at(H.depthT, [-1, 0, 5, 20, 35, 50, 70, 100, 200]),
    digFuel: at(H.digFuelPerSecond, [1, 2.4, 3.5, 5, 9, 16, 26]),
    heatAtDepth: [0, 0.5, 0.9].map((shield) => ({
      shield,
      values: at((pd) => H.heatDamagePerSecond(pd, shield), [0, 50, 70, 71, 90, 110, 150, 285])
    }))
  });
});

/* ---- design intent, not just numbers ---- */

test('a valuable strike lands heavier than common rock', () => {
  assert.ok(H.FREEZE_ORE > H.FREEZE_ROCK, 'ore must freeze longer than rock');
  assert.ok(H.SHAKE_ORE > H.SHAKE_ROCK, 'ore must shake harder than rock');
  assert.ok(H.SQUASH_BREAK > H.SQUASH_DIG, 'breaking through must squash more than starting to drill');
});

test('shake is ordered by how big the event is', () => {
  const order = [H.SHAKE_CRACK, H.SHAKE_ROCK, H.SHAKE_ORE, H.SHAKE_LANDING, H.SHAKE_TOW, H.SHAKE_BOOM];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1],
      'shake must increase with significance: index ' + i + ' (' + order[i] + ') should exceed ' + order[i - 1]);
  }
  assert.ok(H.SHAKE_BOOM === Math.max(...order), 'the core giving way must be the biggest shake in the game');
});

test('hit-stop is perceptible but not a stutter', () => {
  /* below about 30 ms reads as a dropped frame; above about 120 ms reads as a
     hang. Both ends of that range were found by playing, not by theory. */
  for (const [name, v] of [['rock', H.FREEZE_ROCK], ['ore', H.FREEZE_ORE]]) {
    assert.ok(v >= 0.03 && v <= 0.12, name + ' hit-stop ' + v + 's is outside the perceptible range');
  }
});

test('easeInOut starts still, ends still and is symmetric', () => {
  assert.equal(H.easeInOut(0), 0);
  assert.equal(H.easeInOut(1), 1);
  assert.ok(Math.abs(H.easeInOut(0.5) - 0.5) < 1e-12, 'must pass through the midpoint');
  /* symmetry: ease(t) + ease(1-t) === 1 */
  for (const t of [0.1, 0.2, 0.3, 0.42]) {
    assert.ok(Math.abs(H.easeInOut(t) + H.easeInOut(1 - t) - 1) < 1e-12, 'asymmetric at t=' + t);
  }
  /* monotonic, and clamped outside [0,1] */
  let prev = -Infinity;
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const v = H.easeInOut(t);
    assert.ok(v >= prev, 'easeInOut must not go backwards at t=' + t.toFixed(2));
    prev = v;
  }
  assert.equal(H.easeInOut(-1), 0);
  assert.equal(H.easeInOut(2), 1);
});

test('easeInOut accelerates out of the pad and decelerates into it', () => {
  /* this is what makes the autopilot read as piloted rather than as a
     fast-forward, which is the note the player actually gave */
  const early = H.easeInOut(0.1) - H.easeInOut(0);
  const middle = H.easeInOut(0.55) - H.easeInOut(0.45);
  const late = H.easeInOut(1) - H.easeInOut(0.9);
  assert.ok(middle > early, 'must be moving fastest in the middle');
  assert.ok(middle > late, 'must slow down at the end');
});

test('approach moves toward the target and never overshoots', () => {
  assert.ok(H.approach(0, 100, 6, 0.016) > 0, 'must actually move');
  assert.ok(H.approach(0, 100, 6, 0.016) < 100, 'must not arrive instantly');
  /* a huge dt clamps rather than flying past the target */
  assert.equal(H.approach(0, 100, 6, 999), 100);
  assert.equal(H.approach(50, 50, 6, 0.016), 50, 'already there is a no-op');
  /* symmetric: approaching from above works the same way */
  assert.ok(H.approach(100, 0, 6, 0.016) < 100);
});

/* KNOWN CHARACTERISTIC, pinned deliberately.

   approach() uses the common `min(1, dt * rate)` lerp, which is NOT frame-rate
   independent: one 100 ms step covers 60% of the distance, while ten 10 ms
   steps cover 46%. So camera lag genuinely differs with frame rate, and the
   frame loop's 50 ms delta cap means a stuttering frame makes the camera snap
   harder rather than merely slower.

   This is pre-existing behaviour, extracted as it was rather than fixed,
   because changing it changes how the camera feels and that needs a phone
   check rather than a quiet edit. The exact form is 1 - exp(-rate * dt).

   This test exists so that switching to the correct form fails here and has to
   be a decision. If you do switch, delete this test, re-record the baselines,
   and check the camera on the phone. */
test('CHARACTERISTIC: approach is frame-rate dependent (see comment)', () => {
  const oneStep = H.approach(0, 100, 6, 0.1);
  let many = 0;
  for (let i = 0; i < 10; i++) many = H.approach(many, 100, 6, 0.01);
  assert.ok(Math.abs(oneStep - 60) < 1e-9, 'one 100ms step should cover 60%');
  assert.ok(Math.abs(many - 46.138) < 0.01, 'ten 10ms steps should cover ~46%');
  assert.ok(oneStep > many, 'coarser steps currently converge faster');
});

test('the autopilot camera is tighter than the play camera', () => {
  assert.ok(H.CAM_FOLLOW_FLY > H.CAM_FOLLOW_PLAY,
    'flying should track the ship more tightly than digging does');
});

test('heat only bites below the safe depth, and cooling reduces it', () => {
  assert.equal(H.heatDamagePerSecond(0, 0), 0);
  assert.equal(H.heatDamagePerSecond(H.HEAT_DEPTH, 0), 0, 'no damage at exactly the threshold');
  assert.ok(H.heatDamagePerSecond(H.HEAT_DEPTH + 1, 0) > 0, 'damage must begin past the threshold');

  /* accelerating, not linear: the second 40 m must hurt more than the first */
  const a = H.heatDamagePerSecond(110, 0) - H.heatDamagePerSecond(70, 0);
  const b = H.heatDamagePerSecond(150, 0) - H.heatDamagePerSecond(110, 0);
  assert.ok(b > a, 'heat must accelerate with depth');

  /* the cooling rig caps at 90%, so it never makes you immune */
  assert.ok(H.heatDamagePerSecond(150, 0.9) > 0, 'max cooling must still leave some pressure');
  assert.ok(H.heatDamagePerSecond(150, 0.9) < H.heatDamagePerSecond(150, 0));
});

test('digging costs more fuel in harder rock', () => {
  const dirt = H.digFuelPerSecond(1);
  const basalt = H.digFuelPerSecond(9);
  const core = H.digFuelPerSecond(26);
  assert.ok(basalt > dirt && core > basalt, 'fuel cost must rise with hardness');
  assert.ok(dirt > 0);
});
