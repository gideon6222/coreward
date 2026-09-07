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
    },
    soak: { rise: H.SOAK_RISE, fall: H.SOAK_FALL, maxMult: H.SOAK_MAX_MULT },
    heatTint: { ramp: H.HEAT_TINT_RAMP }
  });
});

/* ---- heat soak: the tension mechanic, so its shape is asserted, not just its
   numbers. The design intent is "lingering is the gamble". ---- */

test('soak builds while deep and bleeds off above the threshold', () => {
  const deep = H.HEAT_DEPTH + 20;
  const shallow = H.HEAT_DEPTH - 20;
  assert.ok(H.soakAfter(0, deep, 1) > 0, 'must build below the heat threshold');
  assert.equal(H.soakAfter(0, shallow, 1), 0, 'must not build above it, and must not go negative');
  assert.ok(H.soakAfter(0.5, shallow, 1) < 0.5, 'must bleed off above it');
  assert.ok(H.soakAfter(1, deep, 999) <= 1, 'must clamp at fully soaked');
  assert.equal(H.soakAfter(0, deep, 0), 0, 'a zero-length frame changes nothing');
});

test('recovering is faster than soaking, so a dip in and out is cheap', () => {
  /* if recovery were slower than the build, a single deep trip would poison the
     rest of the run and the mechanic would read as punishment rather than as a
     decision */
  assert.ok(H.SOAK_FALL > H.SOAK_RISE, 'recovery must outpace accumulation');
});

test('soak escalates heat damage without replacing depth as the driver', () => {
  const deep = 100;
  const cold = H.heatDamagePerSecond(deep, 0, 0);
  const hot = H.heatDamagePerSecond(deep, 0, 1);
  assert.ok(hot > cold, 'a soaked hull must take more damage');
  assert.ok(Math.abs(hot / cold - H.SOAK_MAX_MULT) < 1e-9, 'full soak must apply exactly the stated multiplier');
  /* depth still dominates: shallow-and-soaked must beat deep-and-cold */
  assert.ok(H.heatDamagePerSecond(80, 0, 1) < H.heatDamagePerSecond(110, 0, 0),
    'depth must still matter more than dwell time');
  /* and soak cannot conjure damage where there is none */
  assert.equal(H.heatDamagePerSecond(H.HEAT_DEPTH - 1, 0, 1), 0, 'no heat above the threshold, however soaked');
});

/* The world has to explain the mechanic. If the rock band and the heat
   threshold ever drift apart again, crossing into danger stops being visible
   and the player is back to reading a number that is not on screen. */
test('the scoria band starts exactly at the heat threshold', () => {
  assert.equal(H.GRANITE_TO_SCORIA, H.HEAT_DEPTH,
    'the rock must change on the same metre the heat starts');
  assert.equal(H.baseRock(H.HEAT_DEPTH - 1).id, 'granite', 'still safe rock just above the line');
  assert.equal(H.baseRock(H.HEAT_DEPTH).id, 'scoria', 'hot rock from the line down');
});

test('the world tint announces the zone faster than the danger builds', () => {
  assert.equal(H.heatT(H.HEAT_DEPTH), 0, 'no tint above the line');
  assert.equal(H.heatT(0), 0);
  assert.ok(H.heatT(H.HEAT_DEPTH + 10) > 0.3, 'the shift must be obvious within a few blocks');
  assert.equal(H.heatT(200), 1, 'and clamp');
  /* tint ramps over ~26 m of digging; soak takes 40 s. The world should say
     "you are somewhere dangerous" well before the hull says "and it is
     costing you". */
  assert.ok(H.HEAT_TINT_RAMP < 40, 'the visual cue must not lag the damage');
});

test('every rock band is reachable, and they get harder with depth', () => {
  const bands = [0, 20, 50, 80, 130].map((d) => H.baseRock(d));
  const ids = bands.map((b) => b.id);
  assert.deepEqual(ids, ['dirt', 'stone', 'granite', 'scoria', 'basalt']);
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i].hard > bands[i - 1].hard, ids[i] + ' must be harder than ' + ids[i - 1]);
    assert.ok(bands[i].value > bands[i - 1].value, ids[i] + ' must be worth more than ' + ids[i - 1]);
  }
  /* basalt used to start at 130 while planet 0's core sits at 110, so the
     deepest rock in the game could never be seen on the first planet */
  assert.ok(H.baseRock(H.coreDepth(1) - 5).id === 'basalt', 'basalt must be reachable by planet 1');
});

test('cooling buys time but never immunity', () => {
  const maxShield = 0.72;
  assert.ok(H.heatDamagePerSecond(110, maxShield, 1) > 0,
    'a fully upgraded rig fully soaked at the core must still be losing hull');
  /* the whole point of the rebalance: the pressure is not purchasable away */
  const unprotected = H.heatDamagePerSecond(110, 0, 1);
  const protectedRate = H.heatDamagePerSecond(110, maxShield, 1);
  assert.ok(protectedRate < unprotected / 2, 'cooling must still be clearly worth buying');
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

/* The Searing trait scales how fast soak builds and nothing else. Recovery
   stays the same everywhere on purpose: a trait that also slowed the bleed-off
   would punish twice for one idea, and the surface would stop being a reset. */
test('the soak rise multiplier speeds building without slowing recovery', () => {
  const deep = H.HEAT_DEPTH + 30;
  const normal = H.soakAfter(0, deep, 1);
  const hot = H.soakAfter(0, deep, 1, 1.6);
  assert.ok(hot > normal, 'a higher rise must soak faster: ' + hot + ' vs ' + normal);
  assert.ok(Math.abs(hot - normal * 1.6) < 1e-9, 'rise should scale linearly');

  const shallow = H.HEAT_DEPTH - 10;
  assert.equal(H.soakAfter(0.5, shallow, 1, 1.6), H.soakAfter(0.5, shallow, 1),
    'the rise multiplier must not touch how fast soak bleeds off');

  assert.equal(H.soakAfter(0, deep, 1), H.soakAfter(0, deep, 1, 1),
    'omitting the multiplier must behave exactly as before it existed');
  assert.ok(H.soakAfter(0.9, deep, 10, 3) <= 1, 'soak must stay clamped at 1');
});
