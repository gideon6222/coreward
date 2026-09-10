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

/* How much of the remaining distance a smoothing rate covers in one 60 fps
   frame, rounded past floating-point noise so the baseline is readable. */
const perFrame = (rate) => Math.round((1 - Math.exp(-rate / 60)) * 1e6) / 1e6;

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
    /* Recorded as the fraction each rate covers in one 60 fps frame rather
       than as the raw exponential constant. That is the quantity that was
       actually tuned by eye, it is readable in a diff, and it stays put
       across any future change of smoothing form. */
    camera: {
      play: perFrame(H.CAM_FOLLOW_PLAY), playY: perFrame(H.CAM_FOLLOW_PLAY_Y),
      fly: perFrame(H.CAM_FOLLOW_FLY), flyY: perFrame(H.CAM_FOLLOW_FLY_Y),
      zoom: perFrame(H.CAM_ZOOM_RATE), yOffset: H.CAM_Y_OFFSET
    },
    smoothing: {
      camBoost: perFrame(H.CAM_BOOST_DECAY), bankIn: perFrame(H.BANK_INTO_MOVE),
      bankSettle: perFrame(H.BANK_SETTLE), faceTurn: perFrame(H.FACE_TURN_RATE)
    },
    depth: {
      ramp: H.DEPTH_RAMP, ambientSurface: H.AMBIENT_SURFACE,
      ambientDeep: H.AMBIENT_DEEP, fallPow: H.LIGHT_FALL_POW,
      rimSurface: H.RIM_SURFACE, rimDeep: H.RIM_DEEP,
      lamp: H.LAMP_INTENSITY, lampDecay: H.LAMP_DECAY,
      fogSurface: H.FOG_SURFACE, fogGain: H.FOG_GAIN, fogRush: H.FOG_COLOR_RUSH
    },
    cost: {
      move: H.FUEL_PER_MOVE, digBase: H.FUEL_DIG_BASE,
      digPerHardness: H.FUEL_DIG_PER_HARDNESS, hullRegen: H.HULL_REGEN
    },
    heat: {
      depth: H.heatDepth(0), ramp: H.HEAT_RAMP,
      exponent: H.HEAT_EXPONENT, rate: H.HEAT_RATE
    },
    soak: { rise: H.SOAK_RISE, fall: H.SOAK_FALL, maxMult: H.SOAK_MAX_MULT },
    heatTint: { ramp: H.HEAT_TINT_RAMP }
  });
});

/* ---- heat soak: the tension mechanic, so its shape is asserted, not just its
   numbers. The design intent is "lingering is the gamble". ---- */

test('soak builds while deep and bleeds off above the threshold', () => {
  const deep = H.heatDepth(0) + 20;
  const shallow = H.heatDepth(0) - 20;
  assert.ok(H.soakAfter(0, deep, 1, 1, H.heatDepth(0)) > 0, 'must build below the heat threshold');
  assert.equal(H.soakAfter(0, shallow, 1, 1, H.heatDepth(0)), 0, 'must not build above it, and must not go negative');
  assert.ok(H.soakAfter(0.5, shallow, 1) < 0.5, 'must bleed off above it');
  assert.ok(H.soakAfter(1, deep, 999, 1, H.heatDepth(0)) <= 1, 'must clamp at fully soaked');
  assert.equal(H.soakAfter(0, deep, 0, 1, H.heatDepth(0)), 0, 'a zero-length frame changes nothing');
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
  assert.ok(H.heatDamagePerSecond(80, 0, 1) < H.heatDamagePerSecond(110, 0, 0, H.heatDepth(0)),
    'depth must still matter more than dwell time');
  /* and soak cannot conjure damage where there is none */
  assert.equal(H.heatDamagePerSecond(H.heatDepth(0) - 1, 0, 1), 0, 'no heat above the threshold, however soaked');
});

/* The world has to explain the mechanic. If the rock band and the heat
   threshold ever drift apart again, crossing into danger stops being visible
   and the player is back to reading a number that is not on screen. */
test('the scoria band starts exactly at the heat threshold', () => {
  assert.equal(H.graniteToScoria(0), H.heatDepth(0),
    'the rock must change on the same metre the heat starts');
  assert.equal(H.baseRock(H.heatDepth(0) - 1, 0).id, 'granite', 'still safe rock just above the line');
  assert.equal(H.baseRock(H.heatDepth(0), 0).id, 'scoria', 'hot rock from the line down');
});

test('the world tint announces the zone faster than the danger builds', () => {
  assert.equal(H.heatT(H.heatDepth(0), H.heatDepth(0)), 0, 'no tint above the line');
  assert.equal(H.heatT(0, H.heatDepth(0)), 0);
  assert.ok(H.heatT(H.heatDepth(0) + 10, H.heatDepth(0)) > 0.3, 'the shift must be obvious within a few blocks');
  assert.equal(H.heatT(200, H.heatDepth(0)), 1, 'and clamp');
  /* tint ramps over ~26 m of digging; soak takes 40 s. The world should say
     "you are somewhere dangerous" well before the hull says "and it is
     costing you". */
  assert.ok(H.HEAT_TINT_RAMP < 40, 'the visual cue must not lag the damage');
});

test('every rock band is reachable, and they get harder with depth', () => {
  const bands = [0, 10, 25, 40, 61].map((d) => H.baseRock(d, 0));
  const ids = bands.map((b) => b.id);
  assert.deepEqual(ids, ['dirt', 'stone', 'granite', 'scoria', 'basalt']);
  for (let i = 1; i < bands.length; i++) {
    assert.ok(bands[i].hard > bands[i - 1].hard, ids[i] + ' must be harder than ' + ids[i - 1]);
    assert.ok(bands[i].value > bands[i - 1].value, ids[i] + ' must be worth more than ' + ids[i - 1]);
  }
  /* basalt used to start at 130 while planet 0's core sits at 110, so the
     deepest rock in the game could never be seen on the first planet */
  assert.ok(H.baseRock(H.coreDepth(1) - 5).id === 'basalt', 'basalt must be reachable by planet 1');

  /* Plain rock is what you cut through, not what you carry. Its income has to
     stay a rounding error next to a seam, or the hold fills with spoil and the
     decision the cargo cap exists to force never happens. */
  for (const b of bands) {
    assert.ok(b.value * 3 < H.SEAM.value,
      b.id + ' at ' + b.value + ' is close enough to a seam (' + H.SEAM.value +
      ') that carrying spoil competes with carrying value');
    assert.ok(b.wt <= 0.4,
      b.id + ' weighs ' + b.wt + ' kg - heavy enough that spoil crowds the hold');
    assert.ok(b.value / b.wt < (H.SEAM.value / H.SEAM.wt) * 0.75,
      b.id + ' at ' + (b.value / b.wt).toFixed(1) + '/kg is close to a seam at ' +
      (H.SEAM.value / H.SEAM.wt).toFixed(1) + '/kg, which inverts the whole idea');
  }
});

test('a seam is worth stopping for early and outclassed by ore later', () => {
  const perKg = (m) => m.value / m.wt;
  const iron = H.ORES.find((o) => o.id === 'iron');
  const copper = H.ORES.find((o) => o.id === 'copper');

  /* Better than the first ore you meet, so the flecks are worth learning */
  assert.ok(perKg(H.SEAM) > perKg(copper),
    'a seam must beat copper or there is no reason to notice the texture');
  /* and quietly outclassed from iron down, so it never replaces real mining */
  assert.ok(perKg(H.SEAM) < perKg(iron) * 1.05,
    'a seam at ' + perKg(H.SEAM).toFixed(1) + '/kg outclasses iron at ' +
    perKg(iron).toFixed(1) + '/kg - rock should never be the best cargo');
  for (const o of H.ORES)
    if (o.min >= iron.min)
      assert.ok(perKg(o) >= perKg(H.SEAM) * 0.9,
        o.id + ' is worse cargo than plain rock with flecks in it');

  /* and it is worth leaving behind when the hold is full, unlike spoil */
  assert.ok(H.SEAM.value >= H.DROP_MIN_VALUE, 'a seam must be worth coming back for');
  for (const b of H.ROCKS)
    assert.ok(b.value < H.DROP_MIN_VALUE, b.id + ' would be left as a drop; it is spoil');
});

test('seams are common enough to shape a tunnel, rare enough to be a find', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  let rock = 0, seams = 0;
  /* Inside the world, not to a fixed 108 m. Leg 0's core is at 58 m now, so
     the old range spent half its samples on bedrock, which is not rock and
     never carries a seam - the share read 8.3% for a generator that had not
     changed. */
  for (let d = 0; d < H.coreM(); d++)
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      if (!b || b.ore) continue;
      if (b.seam) seams++;
      rock++;
    }
  const share = seams / rock;
  /* A third read as "the rock is made of mineral" rather than "some of it has
     mineral in it", and every wall went sandy. A sixth reads as a find. */
  assert.ok(share > 0.1 && share < 0.24,
    'seams are ' + (share * 100).toFixed(1) + '% of rock; below a tenth nobody ' +
    'learns the tell, above a quarter it stops being one');
  assert.ok(Math.abs(share - H.SEAM_CHANCE) < 0.03,
    'the measured share (' + share.toFixed(3) + ') has drifted from SEAM_CHANCE (' +
    H.SEAM_CHANCE + '), so the flecks and the payout no longer agree');
});

test('cooling buys time but never immunity', () => {
  const maxShield = 0.72;
  assert.ok(H.heatDamagePerSecond(110, maxShield, 1, H.heatDepth(0)) > 0,
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
      values: at((pd) => H.heatDamagePerSecond(pd, shield, H.heatDepth(0)), [0, 50, 70, 71, 90, 110, 150, 285])
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

/* The fix for the characteristic that used to be pinned here.

   approach() was `min(1, dt * rate)`, where one 100 ms step covered 60% of the
   distance and ten 10 ms steps covered 46%. Combined with the frame loop's
   50 ms delta cap, a stuttering frame made the camera snap rather than lag.

   It is now `1 - exp(-rate * dt)`, and every tuned rate goes through
   asExpRate() so that a 60 fps frame still covers exactly the fraction the
   original number was tuned to cover. The two tests below are the two halves
   of that claim: the maths is right, and the feel at 60 fps did not move. */
test('approach is frame-rate independent', () => {
  const oneStep = H.approach(0, 100, 6, 0.1);
  let many = 0;
  for (let i = 0; i < 10; i++) many = H.approach(many, 100, 6, 0.01);
  assert.ok(Math.abs(oneStep - many) < 1e-9,
    'one 100ms step (' + oneStep + ') must land where ten 10ms steps land (' + many + ')');

  /* and at any subdivision, from any start, toward any target */
  for (const [from, to, rate] of [[0, 100, 6], [100, 0, 11], [-3.5, 7.25, 4], [2, 2, 9]]) {
    const coarse = H.approach(from, to, rate, 0.048);
    let fine = from;
    for (let i = 0; i < 16; i++) fine = H.approach(fine, to, rate, 0.003);
    assert.ok(Math.abs(coarse - fine) < 1e-9,
      'rate ' + rate + ' from ' + from + ': ' + coarse + ' vs ' + fine);
  }

  /* it must still never overshoot, at any dt */
  for (const dt of [0.001, 0.05, 1, 999]) {
    const v = H.approach(0, 100, 6, dt);
    assert.ok(v >= 0 && v <= 100, 'overshoot at dt ' + dt + ': ' + v);
  }
  assert.ok(H.approach(0, 100, 6, 999) > 99.999, 'a huge dt should essentially arrive');
});

test('asExpRate preserves what each rate did in one 60 fps frame', () => {
  /* This is the whole safety argument for changing the smoothing: at 60 fps
     nothing moved, so the change cannot have altered how the camera feels on a
     phone holding frame rate. */
  const FRAME = 1 / 60;
  for (const tuned of [4, 6, 7, 8, 11, 12, 14]) {
    const legacy = Math.min(1, FRAME * tuned);
    const now = 1 - Math.exp(-H.asExpRate(tuned) * FRAME);
    assert.ok(Math.abs(legacy - now) < 1e-12,
      'rate ' + tuned + ' covered ' + legacy + ' per frame, now covers ' + now);
  }
  /* and the constants the game actually uses went through that conversion */
  const pairs = [[H.CAM_FOLLOW_PLAY, 6], [H.CAM_FOLLOW_PLAY_Y, 7],
                 [H.CAM_FOLLOW_FLY, 11], [H.CAM_FOLLOW_FLY_Y, 12],
                 [H.CAM_ZOOM_RATE, 4], [H.CAM_BOOST_DECAY, 4],
                 [H.BANK_INTO_MOVE, 8], [H.BANK_SETTLE, 6], [H.FACE_TURN_RATE, 14]];
  for (const [actual, tuned] of pairs)
    assert.equal(actual, H.asExpRate(tuned), 'a camera rate skipped the conversion');
});

test('vertical follow stays slightly tighter than horizontal', () => {
  /* Used to be written as `k + 1` at the call site. The ship travels down far
     more than sideways, so the axis it moves along should lag less. */
  assert.ok(H.CAM_FOLLOW_PLAY_Y > H.CAM_FOLLOW_PLAY);
  assert.ok(H.CAM_FOLLOW_FLY_Y > H.CAM_FOLLOW_FLY);
});

test('the autopilot camera is tighter than the play camera', () => {
  assert.ok(H.CAM_FOLLOW_FLY > H.CAM_FOLLOW_PLAY,
    'flying should track the ship more tightly than digging does');
});

test('heat only bites below the safe depth, and cooling reduces it', () => {
  assert.equal(H.heatDamagePerSecond(0, 0, 0, H.heatDepth(0)), 0);
  assert.equal(H.heatDamagePerSecond(H.heatDepth(0), 0, 0, H.heatDepth(0)), 0, 'no damage at exactly the threshold');
  assert.ok(H.heatDamagePerSecond(H.heatDepth(0) + 1, 0, 0, H.heatDepth(0)) > 0, 'damage must begin past the threshold');

  /* accelerating, not linear: the second 40 m must hurt more than the first */
  const a = H.heatDamagePerSecond(110, 0) - H.heatDamagePerSecond(70, 0, 0, H.heatDepth(0));
  const b = H.heatDamagePerSecond(150, 0) - H.heatDamagePerSecond(110, 0);
  assert.ok(b > a, 'heat must accelerate with depth');

  /* the cooling rig caps at 90%, so it never makes you immune */
  assert.ok(H.heatDamagePerSecond(150, 0.9, H.heatDepth(0)) > 0, 'max cooling must still leave some pressure');
  assert.ok(H.heatDamagePerSecond(150, 0.9) < H.heatDamagePerSecond(150, 0, H.heatDepth(0)));
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
  const deep = H.heatDepth(0) + 30;
  const normal = H.soakAfter(0, deep, 1, 1, H.heatDepth(0));
  const hot = H.soakAfter(0, deep, 1, 1.6, H.heatDepth(0));
  assert.ok(hot > normal, 'a higher rise must soak faster: ' + hot + ' vs ' + normal);
  assert.ok(Math.abs(hot - normal * 1.6) < 1e-9, 'rise should scale linearly');

  const shallow = H.heatDepth(0) - 10;
  assert.equal(H.soakAfter(0.5, shallow, 1, 1.6, H.heatDepth(0)), H.soakAfter(0.5, shallow, 1, 1, H.heatDepth(0)),
    'the rise multiplier must not touch how fast soak bleeds off');

  assert.equal(H.soakAfter(0, deep, 1, 1, H.heatDepth(0)), H.soakAfter(0, deep, 1, 1, H.heatDepth(0)),
    'omitting the multiplier must behave exactly as before it existed');
  assert.ok(H.soakAfter(0.9, deep, 10, 3) <= 1, 'soak must stay clamped at 1');
});

/* ---------- the tremor rhythm ----------

   Simulated at 60 fps rather than reasoned about, because the whole reason
   this lives in feel.ts as a reducer is that the alternative is watching a
   34-second timer through a renderer. */

function runTremors(seconds, opts = {}) {
  const dt = opts.dt || 1 / 60;
  const inBand = opts.inBand || (() => true);
  let c = { t: 0, warn: 0 };
  const fires = [], warns = [];
  let peakShake = 0, t = 0;
  const gap = () => H.TREMOR_EVERY + (opts.jitter === undefined ? H.TREMOR_JITTER / 2 : opts.jitter);
  for (let i = 0; i * dt < seconds; i++) {
    t = i * dt;
    const tick = H.tremorTick(c, dt, inBand(t), gap);
    c = { t: tick.t, warn: tick.warn };
    if (tick.warned) warns.push(t);
    if (tick.fired) fires.push(t);
    peakShake = Math.max(peakShake, tick.shake);
  }
  return { fires, warns, peakShake, clock: c };
}

test('the first tremor is late, and the ones after it keep a rhythm', () => {
  const { fires } = runTremors(180);
  assert.ok(fires.length >= 4, 'expected several tremors in three minutes, got ' + fires.length);

  assert.ok(Math.abs(fires[0] - H.TREMOR_FIRST) < 0.1,
    'the first tremor landed at ' + fires[0].toFixed(1) + 's, not ' + H.TREMOR_FIRST + 's');
  assert.ok(fires[0] > H.TREMOR_EVERY,
    'arriving in the band should not be punished faster than staying in it');

  const gap = H.TREMOR_EVERY + H.TREMOR_JITTER / 2;
  for (let i = 1; i < fires.length; i++) {
    const d = fires[i] - fires[i - 1];
    assert.ok(Math.abs(d - gap) < 0.2,
      'gap ' + i + ' was ' + d.toFixed(1) + 's, expected about ' + gap + 's');
  }
});

test('every tremor is announced before it lands, exactly once', () => {
  const { fires, warns, peakShake } = runTremors(180);
  assert.equal(warns.length, fires.length, 'a tremor landed without a warning, or warned twice');
  for (let i = 0; i < fires.length; i++) {
    const lead = fires[i] - warns[i];
    assert.ok(Math.abs(lead - H.TREMOR_WARN) < 0.1,
      'tremor ' + i + ' gave ' + lead.toFixed(2) + 's of notice, not ' + H.TREMOR_WARN + 's');
  }
  assert.ok(peakShake > 0.95, 'the shake ramp should reach full by the time it lands');
});

test('the shake ramps up through the warning rather than appearing at the end', () => {
  let c = { t: H.TREMOR_WARN, warn: 0 };
  const dt = 1 / 60;
  const seen = [];
  for (let i = 0; i < Math.ceil(H.TREMOR_WARN / dt); i++) {
    const tick = H.tremorTick(c, dt, true, () => H.TREMOR_EVERY);
    c = { t: tick.t, warn: tick.warn };
    seen.push(tick.shake);
    if (tick.fired) break;
  }
  assert.ok(seen.length > 30, 'the warning should span many frames');
  assert.ok(seen[0] < 0.15, 'the rumble must start quiet, not at full strength');
  assert.ok(seen[seen.length - 1] > 0.85, 'and reach full as it lands');
  for (let i = 1; i < seen.length; i++)
    assert.ok(seen[i] >= seen[i - 1] - 1e-9, 'the ramp went backwards at frame ' + i);
});

test('leaving the band genuinely resets the threat', () => {
  /* thirty seconds down - almost to the first tremor - then surface */
  const { fires, clock } = runTremors(60, { inBand: (t) => t < 30 });
  assert.equal(fires.length, 0, 'a tremor fired after the ship left the band');
  assert.equal(clock.t, 0, 'the clock must reset, not pause');
  assert.equal(clock.warn, 0);

  /* and going back down starts the long first gap again */
  const again = runTremors(40, { inBand: (t) => t >= 2 });
  assert.ok(again.fires.length === 1 && again.fires[0] > H.TREMOR_FIRST,
    're-entering the band should restart the full first delay');
});

test('the rhythm does not depend on frame rate', () => {
  const fast = runTremors(120, { dt: 1 / 120 });
  const slow = runTremors(120, { dt: 1 / 30 });
  assert.equal(fast.fires.length, slow.fires.length,
    'a slower machine got a different number of tremors');
  for (let i = 0; i < fast.fires.length; i++)
    assert.ok(Math.abs(fast.fires[i] - slow.fires[i]) < 0.1,
      'tremor ' + i + ' drifted between frame rates');
});

test('a single enormous frame cannot skip a warning', () => {
  /* the loop caps its delta at 50 ms, but the reducer should not rely on that */
  let c = { t: 0, warn: 0 };
  let warned = 0, fired = 0;
  for (let i = 0; i < 40; i++) {
    const tick = H.tremorTick(c, 5, true, () => H.TREMOR_EVERY);
    c = { t: tick.t, warn: tick.warn };
    if (tick.warned) warned++;
    if (tick.fired) fired++;
  }
  assert.ok(fired > 0, 'nothing fired at all');
  assert.equal(warned, fired, 'huge frames desynced the warning from the landing');
});

/* ---------- what the Scanner is actually for ----------

   Playtest: "I can see all of the blocks on screen, so it doesnt seem very
   beneficial." The Scanner only changed the lamp's radius while the camera
   framed a fixed number of rows, so everything on screen was already inside
   the lit circle at every level. The framing belongs to it now. */

test('the Scanner widens the view, and the early levels are worth the most', () => {
  const at = (l) => H.zoomForScan(l);
  /* The property that matters is the RATIO, not where the two ends happen to
     sit. Pinning "level 0 must be below 0.8" broke the moment the whole range
     was nudged outward for readability, and it was never the thing being
     protected: what makes the upgrade worth buying is how much more world it
     shows, whatever the baseline framing is. */
  assert.ok(at(9) / at(0) > 1.35,
    'a maxed Scanner shows only ' + (at(9) / at(0)).toFixed(2) + 'x the world of an ' +
    'unupgraded one, which is not enough to feel');
  assert.ok(at(9) / at(0) < 2.2,
    'the Scanner range is so wide that level 0 must be unplayably tight');

  for (let l = 1; l <= 9; l++)
    assert.ok(at(l) > at(l - 1), 'level ' + l + ' did not widen the view');

  /* Front-loaded: the first two levels are when the player is deciding whether
     the Scanner is worth buying at all, so they have to be the ones that show. */
  const first = at(2) - at(0), last = at(9) - at(7);
  assert.ok(first > last * 1.5,
    'the first two levels gain ' + first.toFixed(3) + ' and the last two ' +
    last.toFixed(3) + ' - a linear ramp makes the first purchase feel like nothing');

  /* and it stays inside sane bounds however it is called */
  for (const l of [-3, 0, 4, 9, 40]) {
    const v = at(l);
    assert.ok(v >= H.ZOOM_MIN - 1e-9 && v <= H.ZOOM_MAX + 1e-9, 'zoom escaped its range at ' + l);
  }
});

/* Lighting INTENT, which survives a retune where the snapshot above does not.

   These arrived with the move from MeshLambertMaterial to MeshStandardMaterial.
   Standard adds a specular lobe, so every light contributes a highlight as well
   as a diffuse term and the old values read as a bright plastic wash. The
   numbers that fixed it will drift again; what must not drift is the shape. */
test('the fill light is gone long before the bottom of the ramp', () => {
  const fall = (t) => H.AMBIENT_DEEP + (H.AMBIENT_SURFACE - H.AMBIENT_DEEP) * Math.pow(1 - t, H.LIGHT_FALL_POW);
  assert.ok(H.LIGHT_FALL_POW > 1,
    'a linear ambient falloff is still handing out a third of the fill halfway down');
  /* Halfway down should already be well under half the surface fill, or the
     descent does not read as getting darker until it is nearly over. */
  assert.ok(fall(0.5) < H.AMBIENT_SURFACE * 0.35,
    'halfway down the ambient is still ' + fall(0.5).toFixed(2) + ' of ' + H.AMBIENT_SURFACE);
  assert.ok(fall(1) <= H.AMBIENT_SURFACE * 0.12,
    'the deep floor is not a floor, it is a light');
  assert.ok(fall(1) > 0, 'pitch black is not the goal - shape still has to read');
  /* and it only ever gets darker */
  for (let t = 0; t < 1; t += 0.05) {
    assert.ok(fall(t + 0.05) <= fall(t) + 1e-12, 'ambient rose with depth at t=' + t);
  }
});

test('the lamp is what lights the deep, not the fill', () => {
  /* The whole point of the darkness pass: at the bottom the only meaningful
     light is the one attached to the ship. A fill light that still competes
     with it means the tight framing reads as a close camera rather than as the
     edge of what the lamp reaches. */
  const deepFill = H.AMBIENT_DEEP + H.RIM_DEEP;
  assert.ok(H.LAMP_INTENSITY > deepFill * 100,
    'the lamp only outguns the deep fill by ' + (H.LAMP_INTENSITY / deepFill).toFixed(0) + 'x');
});

test('fog reaches its underground colour before the sky does', () => {
  /* Fog only ever tints what is underground, and underground is not the colour
     of the horizon. Sharing the sky's ramp painted a bright blue over every
     distant surface at 40 m. */
  assert.ok(H.FOG_COLOR_RUSH > 1,
    'fog colour tracking the sky exactly is what made the deep rock blue');
  assert.ok(1 / H.FOG_COLOR_RUSH < 0.6,
    'fog should be fully underground-coloured well before halfway down');
});

test('the lamp and the framing grow together', () => {
  /* If the view outran the light, the extra world would be dark and the
     upgrade would have made things worse. Both are driven by the same level,
     so this asserts the ratio never gets worse as you buy levels. */
  const lit = (l) => 8 + l * 2.4;
  let prev = lit(0) / H.zoomForScan(0);
  for (let l = 1; l <= 9; l++) {
    const now = lit(l) / H.zoomForScan(l);
    assert.ok(now > prev,
      'at level ' + l + ' the view widened faster than the light reached, so the ' +
      'upgrade buys more darkness');
    prev = now;
  }
});

/* ---------- partial dig damage ----------

   The stored value is a FRACTION of the block, not seconds of drilling, and
   getting that backwards is easy and quiet. With seconds, buying a better
   drill between two attempts shrinks the total while the stored number stays
   put - so a wall you had half cut would silently become nearly whole, which
   is the exact opposite of what an upgrade should do. */

const digSeconds = (hard, drill) => (hard * H.DIG_BASE) / drill;
const remaining = (stored, hard, drill) => (1 - stored) * digSeconds(hard, drill);

test('stored dig damage is a share of the block, not a number of seconds', () => {
  const hard = 5;                     /* granite */
  const stored = 0.75;

  /* A better drill makes what is LEFT faster, and never makes it slower. */
  let prev = Infinity;
  for (const drill of [1, 2, 4, 8]) {
    const left = remaining(stored, hard, drill);
    assert.ok(left < prev, 'a stronger drill did not shorten the remainder');
    prev = left;
  }

  /* The share already done survives the upgrade untouched: three quarters cut
     is three quarters cut whatever you are holding. */
  for (const drill of [1, 8]) {
    const left = remaining(stored, hard, drill);
    const whole = digSeconds(hard, drill);
    assert.ok(Math.abs(left / whole - (1 - stored)) < 1e-12,
      'the remaining share moved when the drill changed, at drill ' + drill);
  }

  /* And the seconds interpretation is genuinely different, which is what makes
     this worth asserting rather than assuming. */
  const asSeconds = stored * digSeconds(hard, 1);      /* 1.875 s of work done */
  const wholeAfterUpgrade = digSeconds(hard, 8);       /* 0.3125 s total now */
  assert.ok(asSeconds > wholeAfterUpgrade,
    'the two interpretations happen to agree here, so this test proves nothing');
});

test('a nearly-finished block still needs a moment, and a fresh one needs it all', () => {
  const hard = 5, drill = 1;
  assert.ok(remaining(0.985, hard, drill) > 0, 'a capped resume must still take some work');
  assert.equal(remaining(0, hard, drill), digSeconds(hard, drill));
  assert.equal(remaining(1, hard, drill), 0);
});
