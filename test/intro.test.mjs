/* The way in: the first-run intro, the title, and CONTINUE.

   Pure so it can be walked here, which matters for the usual reason - the
   preview browser stops requestAnimationFrame when its pane is hidden - and
   for one specific to an intro: it is the single screen every new player sees,
   and the one nobody who builds it ever looks at again. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const E = H.wayEnds(H.INTRO);

test('the intro still says what you are looking for', () => {
  /* The property, not the words: a new player leaves knowing there is a fixed
     number of things to find, that they are spread across the one world, and
     that finding them opens something. Mystery is withholding the
     explanation, not the goal.

     The number is READ FROM THE GAME, not typed. A version of this test knew
     "five" on its own and went on passing for three days after W9 deleted the
     five things it counted. */
  const all = H.CAPTIONS.map((c) => c.text).join(' ').toLowerCase();
  const n = H.ANCHOR_COUNT;
  const count = new RegExp('\\b(' + words[n] + '|' + n + ')\\b');

  assert.ok(count.test(all), 'the intro never says there are ' + n + ' Anchors, so the goal has no shape');
  assert.ok(/anchor/.test(all), 'the intro never names the thing you are looking for');
  assert.ok(/buried|across|spread|under/.test(all), 'the intro never says where to look');
  assert.ok(/opens|open|way out|centre/.test(all), 'the intro never says that finding them leads anywhere');

  for (const stale of ['twelve', 'chart', 'heart', 'drive', 'pieces', 'jump', 'way out of']) {
    assert.ok(!all.includes(stale), 'the intro still says "' + stale + '", which is the game before round eight');
  }
});

test('the intro is short, mostly silent, and every line readable', () => {
  /* *"dont explain the whole story"*, and the research on eerie openings says
     the same thing from the other side: every one that works says LESS. A cap
     on the words is the cheapest guard against the next rewrite explaining
     everything again. */
  assert.ok(H.CAPTIONS.length <= 4, 'the intro has grown to ' + H.CAPTIONS.length + ' lines');
  const n = H.CAPTIONS.map((c) => c.text.split(/\s+/).length).reduce((a, b) => a + b, 0);
  assert.ok(n < 40, 'the intro is ' + n + ' words - it is explaining, not suggesting');
  assert.ok(H.INTRO_SECS < 40, 'the intro runs ' + H.INTRO_SECS + ' s before the player can touch anything');

  for (const c of H.CAPTIONS) {
    const w = c.text.split(/\s+/).length;
    assert.ok(c.secs >= w / 4, '"' + c.text.slice(0, 30) + '" shows ' + w + ' words in ' + c.secs + ' s');
    assert.ok(c.secs <= 8, 'a line holding ' + c.secs + ' s is a pause, not a line');
    assert.ok(c.at + c.secs <= H.INTRO_SECS, 'a line outlives the intro');
  }
  /* No two lines up at once: the fade is per line and two would stack. */
  for (let i = 1; i < H.CAPTIONS.length; i++) {
    assert.ok(H.CAPTIONS[i].at >= H.CAPTIONS[i - 1].at + H.CAPTIONS[i - 1].secs, 'lines ' + (i - 1) + ' and ' + i + ' overlap');
  }
});

test('the picture comes before the words', () => {
  /* Hollow Knight, Dome Keeper: the environment before anything is said
     about it. The first line waits for the hall to have been seen - which is
     also the difference between a caption and a title card. */
  assert.ok(H.CAPTIONS[0].at >= 3, 'the first line is up at ' + H.CAPTIONS[0].at + ' s, before the hall has been seen');
  /* And the one sound has arrived before the first line - rumble's attack is
     1.6 s. */
  assert.ok(H.RUMBLE_AT + 1.6 <= H.CAPTIONS[0].at, 'the first line is up before the first sound has landed');
});

test('nothing moves before the tap, and the tap is not a skip', () => {
  const st = H.newIntro();
  assert.equal(H.introTick(st, 5), false);
  assert.equal(st.t, 0, 'the clock ran before the tap');
  H.begin(st);
  H.begin(st);
  H.introTick(st, 1);
  assert.equal(st.t, 1);
  const before = st.t;
  H.begin(st);
  assert.equal(st.t, before, 'a second tap moved the clock');
});

test('it runs to the pad on its own, then ends and stays ended', () => {
  const st = H.newIntro();
  H.begin(st);
  let changes = 0;
  for (let i = 0; i < 60 * 60 && !st.done; i++) if (H.introTick(st, 1 / 60)) changes++;
  assert.ok(st.done, 'the intro never finished on its own');
  /* Every line arrives and every line leaves: two changes each. */
  assert.equal(changes, H.CAPTIONS.length * 2, 'expected ' + H.CAPTIONS.length * 2 + ' caption changes, got ' + changes);
  assert.equal(H.introTick(st, 10), false, 'the intro kept going after it ended');
  const eye = H.eyeAt(st.t);
  assert.equal(eye.shipD, H.PAD_D, 'the intro ended with the ship at ' + eye.shipD + ', not on the pad');
  assert.equal(eye.pd, H.PAD_D, 'the intro ended with the eye at ' + eye.pd + ', not at the pad');
  assert.equal(eye.dawn, 1, 'the intro ended before the sky woke');
});

test('the eye starts inside the first Anchor hall, and the title is that hall in the dark', () => {
  /* The hall the first descent will cut into at 48 s. Derived from the same
     table the world is stamped from, never typed - the test in this file that
     pins the first minute is what says that hall is under the pad. */
  const a = H.anchorAt(1);
  const start = H.eyeAt(0);
  assert.equal(start.px, a.x, 'the eye starts in column ' + start.px + ', the first Anchor is in ' + a.x);
  assert.ok(start.pd < a.d && start.pd > a.d - H.VAULT_H, 'the eye starts at ' + start.pd + ' m, outside the hall around ' + a.d);
  assert.equal(start.light, 0, 'the intro starts with the light already up - it should breathe up from black');
  assert.equal(start.shipD, null, 'the ship is in the first frame');
  assert.equal(start.dawn, 0, 'the intro starts in daylight');
  /* The eye's cell is open ground, or the flood has nowhere to go and the
     hall stays black. */
  H.setWorld(0);
  H.g.ground = H.newGround();
  const b = H.blockAt(start.px, start.pd);
  assert.equal(b, null, 'the eye starts inside ' + (b && b.id) + ' rather than in the hall\'s air');

  /* *"have the same starting point as new game"*: the title IS the hall, so
     neither button begins with a cut. */
  const title = H.titleEye();
  assert.equal(title.px, start.px);
  assert.equal(title.pd, start.pd);
  assert.equal(title.light, 0, 'the title has the lamp up; the Anchor\'s own glow should be the only light');
  assert.equal(title.shipD, null);
  assert.deepEqual({ px: H.arriveEye(H.newArrive()).px, pd: H.arriveEye(H.newArrive()).pd }, { px: start.px, pd: start.pd },
    'CONTINUE does not start where NEW GAME starts');
});

test('the rise ends at the pad, glides across to it, and the eye is never in rock at the surface', () => {
  /* *"it looks like it jumps over to the left to line up with the launch
     pad"*: the hall is centred on the Anchor, one column over from the pad,
     and the eye used to snap across at the top. It eases across during the
     rise now, monotonically, and never faster than the rise itself. */
  const top = H.eyeAt(E.rise);
  assert.equal(top.pd, H.PAD_D, 'the rise ends at ' + top.pd + ' m, not at the pad');
  assert.equal(top.px, H.START_X, 'the rise ends in column ' + top.px + ', the pad is ' + H.START_X);
  assert.equal(top.shipD, null, 'the ship is in the picture before the descent');

  let last = H.eyeAt(E.hall);
  const dir = Math.sign(H.START_X - last.px);
  for (let t = E.hall; t <= E.rise + 1e-9; t += 1 / 60) {
    const e = H.eyeAt(Math.min(t, E.rise));
    assert.ok((e.px - last.px) * dir >= -1e-9, 'the eye moved back across at ' + t.toFixed(2) + ' s');
    assert.ok(Math.abs(e.px - last.px) < 0.1, 'the eye jumped ' + Math.abs(e.px - last.px).toFixed(2) + ' columns in one frame at ' + t.toFixed(2) + ' s');
    last = e;
  }
  /* A frame after the rise the column must not move at all: that was the
     snap. */
  assert.equal(H.eyeAt(E.rise + 1 / 60).px, H.START_X);

  /* Row 0 is rock, the pad's row is air, and a flood from inside a solid
     cell lights nothing - the filmstrip's dark pad. */
  H.setWorld(0);
  H.g.ground = H.newGround();
  for (const t of [E.rise, E.surface, H.INTRO_SECS]) {
    const e = H.eyeAt(t);
    assert.equal(H.blockAt(e.px, Math.round(e.pd)), null, 'the eye at ' + t + ' s sits inside rock at ' + e.pd + ' m');
  }
});

test('the descent is continuous: the ship enters from above and never jumps', () => {
  /* *"an actual transition, not just a cut."* The ship's depth over the
     descent is monotone and every step is small; the sky wakes with it. */
  for (const way of [H.INTRO, H.ARRIVE]) {
    const e = H.wayEnds(way);
    let last = null, lastDawn = 0;
    for (let t = e.surface; t <= e.end + 1e-9; t += 1 / 60) {
      const eye = H.eyeOn(way, Math.min(t, e.end));
      assert.ok(eye.shipD !== null, 'no ship at ' + t.toFixed(2) + ' s of the descent');
      if (last !== null) {
        assert.ok(eye.shipD >= last - 1e-9, 'the ship went back up at ' + t.toFixed(2) + ' s');
        assert.ok(eye.shipD - last < 0.5, 'the ship jumped ' + (eye.shipD - last).toFixed(2) + ' m in one frame at ' + t.toFixed(2) + ' s');
      }
      assert.ok(eye.dawn >= lastDawn - 1e-9, 'the sky went back to night at ' + t.toFixed(2) + ' s');
      last = eye.shipD; lastDawn = eye.dawn;
    }
    const first = H.eyeOn(way, e.surface);
    assert.ok(first.shipD <= -way.from * 0.9, 'the ship starts its descent at ' + first.shipD + ' m, already in frame');
    assert.equal(H.eyeOn(way, e.end).shipD, H.PAD_D);
  }
});

test('skip goes to the descent, and only a second skip ends it', () => {
  for (const at of [0, 5, 12, 18]) {
    const st = H.newIntro();
    H.begin(st);
    st.t = at;
    H.skip(st);
    assert.equal(st.t, E.surface, 'skip from ' + at + ' s landed at ' + st.t);
    assert.equal(st.done, false, 'skip from ' + at + ' s skipped the arrival too');
    assert.ok(H.inDescent(st));
  }
  const st = H.newIntro();
  H.skip(st);
  assert.ok(st.started, 'skip before the tap did not start the clock');
  H.skip(st);
  assert.equal(st.done, true, 'a second skip during the descent did not end it');
  assert.equal(H.eyeAt(st.t).shipD, H.PAD_D);
});

test('CONTINUE is the intro at a run: same start, same end, under four seconds, no words', () => {
  /* *"It should only take a few seconds to start playing again"*, and
     *"the same starting point as new game but move the camera to the launch
     pad faster and don't display the text."* */
  assert.ok(H.ARRIVE_SECS <= 4, 'CONTINUE takes ' + H.ARRIVE_SECS + ' s');
  const s = H.newArrive();
  let steps = 0, fastest = 0, last = H.arriveEye(s).pd;
  for (; !s.done && steps < 600; steps++) {
    H.arriveTick(s, 1 / 60);
    const pd = H.arriveEye(s).pd;
    fastest = Math.max(fastest, (last - pd) * 60);
    last = pd;
  }
  assert.ok(s.done);
  assert.ok(steps / 60 <= 4.01, 'CONTINUE took ' + (steps / 60).toFixed(1) + ' s');
  const e = H.arriveEye(s);
  assert.equal(e.shipD, H.PAD_D, 'the ship ended at ' + e.shipD + ', not on the pad');
  assert.equal(e.pd, H.PAD_D);
  assert.equal(e.dawn, 1);
  /* One row rebuild per frame at 60 fps is the ceiling the rise was designed
     to; the window is 29 rows. */
  assert.ok(fastest <= 60, 'the rise peaks at ' + fastest.toFixed(0) + ' m/s');
  /* And it is the same shape: every phase of the intro, each one shorter. */
  for (const k of ['hall', 'rise', 'descent']) {
    assert.ok(H.ARRIVE[k] > 0 && H.ARRIVE[k] < H.INTRO[k], 'CONTINUE\'s ' + k + ' is ' + H.ARRIVE[k] + ' s against the intro\'s ' + H.INTRO[k]);
  }
  /* No words: captions belong to the intro's clock, and the arrive has no
     clock the captions can read. */
  assert.equal(typeof H.arriveEye(s).text, 'undefined');
});

test('the first minute gives a win: the pad is over a hall, and a stock tank reaches it and gets home', () => {
  /* POLISH.md: "the first minute gives a win", and after round eight the win
     is finding something somebody built. The intro shows Rustmoor's hall in
     the dark and then the first descent cuts into it - which only works if
     the hall is under the pad, and that is a fact about the current seeds.
     So it is pinned here, as the player experiences it: dig straight down
     from where you land, with the ship you start with, and you are through a
     roof of cut stone inside the minute with enough fuel to climb back out.

     Costed with the same rules the econ probe uses (hardness times DIG_BASE
     over the drill, fuelPerCell over the cellFuel factor), against the
     shipping generator. Measured 2026-09-12: the roof is at 39 m, 33 s of
     digging on this model, 47 of 90 fuel left with a 10-fuel climb home.

     The model is a LOWER bound. The real loop also pays hit-stop and the
     flight between cells, and the filmstrip of the same descent puts the
     roof at 48 s and THE ANCHOR WAKES at 56 s - about 1.45x. The 45 s cap
     here is therefore about 65 s on the phone, which is the edge of the
     minute; if this ever trips, the fix is where the hall is, not the cap. */
  H.setWorld(0);
  Object.assign(H.g.up, { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, scrub: 0,
    auto: 0, bomb: 0, laser: 0, hull: 0, magnet: 0, survey: 0, drone: 0, reactor: 0 });
  H.g.relics = [];
  H.g.ground = H.newGround();
  H.g.dug = new Set();

  const x = H.START_X;
  let t = 0, fuel = H.S.fuelCap();
  let roof = -1;
  for (let d = 1; d <= 80 && roof < 0; d++) {
    const b = H.blockAt(x, d);
    if (b && b.id === 'worked') { roof = d; }
    if (b && b.hard > 0 && b.hard !== Infinity) {
      t += (b.hard * H.DIG_BASE) / H.S.drill();
      fuel -= H.fuelPerCell(b.hard) * H.S.cellFuel() * H.S.fuelUse();
    } else {
      const secs = 1 / H.S.speed();
      t += secs; fuel -= H.FUEL_PER_MOVE * secs * H.S.fuelUse();
    }
  }
  assert.ok(roof > 0, 'there is no cut stone in the first 80 m under the pad - the first descent finds only rock');
  assert.ok(t <= 45, 'reaching the first cut stone takes ' + t.toFixed(0) + ' s of digging, which is not inside the first minute');

  const climb = roof / H.S.speed() * H.FUEL_PER_MOVE * H.S.fuelUse();
  assert.ok(fuel - climb >= H.S.fuelCap() * 0.3,
    'the stock tank has ' + fuel.toFixed(0) + ' left at the roof and the climb costs ' + climb.toFixed(0) +
    ' - the first win costs the first ship');

  /* And the roof belongs to the hall the intro showed: the eye's own hall. */
  const hall = H.hallEye();
  assert.ok(Math.abs(hall.px - x) <= Math.floor(H.VAULT_W / 2) && hall.pd > roof && hall.pd - roof <= H.VAULT_H,
    'the cut stone at ' + roof + ' m under the pad is not the roof of the hall the intro shows');
});
