/* The first-run intro.

   Pure so it can be walked here, which matters for the usual reason - the
   preview browser stops requestAnimationFrame when its pane is hidden - and
   for one specific to an intro: it is the single screen every new player sees,
   and the one nobody who builds it ever looks at again. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

test('the intro still says what you are looking for', () => {
  /* Rewritten from four literal string checks to the property behind them.

     The old version asserted the words "jump drive", "five", "heart" and
     "buried" all appeared - which is a different claim from "a player learns
     the objective", and it broke the moment the script was rewritten to be
     shorter and less explanatory. That is the literal-versus-property mistake
     twice over: it failed for the wrong reason, and the obvious repair would
     have been to paste the missing words back in.

     What actually has to survive is that a new player leaves the intro knowing
     there is a fixed number of things to find, that they are spread across
     the one world rather than stacked down a shaft, and that finding them
     opens something. Mystery is withholding the explanation, not the goal.

     And the number is READ FROM THE GAME, not typed here. The old version
     asserted "five" by hand, and for three days after W9 deleted the five
     drive components it went on passing against an intro that described
     them. A test that knows the count independently of the thing being
     counted is the test that lets the script and the game drift apart. */
  const all = H.BEATS.map((b) => b.text).join(' ').toLowerCase();
  const n = H.ANCHOR_COUNT;
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const count = new RegExp('\\b(' + words[n] + '|' + n + ')\\b');

  assert.ok(count.test(all),
    'the intro never says there are ' + n + ' Anchors, so the goal has no shape');
  assert.ok(/anchor/.test(all),
    'the intro never names the thing you are looking for, so the first hall reads as scenery');
  assert.ok(/buried|across|spread|under/.test(all),
    'the intro never says where to look, which is the part that changes what a player does');
  assert.ok(/opens|open|way out|centre/.test(all),
    'the intro never says that finding them leads anywhere');

  /* And nothing it says is about the game that was deleted. Each of these
     was in the script on 2026-09-12, three days after W9 removed the thing
     it described. */
  for (const stale of ['twelve', 'chart', 'heart', 'drive', 'pieces', 'jump', 'way out of']) {
    assert.ok(!all.includes(stale),
      'the intro still says "' + stale + '", which is the game before round eight');
  }
});

test('the first minute gives a win: the pad is over a hall, and a stock tank reaches it and gets home', () => {
  /* POLISH.md: "the first minute gives a win", and after round eight the win
     is finding something somebody built. R9b leans on Rustmoor's hall being
     almost directly under the pad - which is a fact about the current seeds,
     and seeds move when any offset changes. So it is pinned here, as the
     player experiences it: dig straight down from where you land, with the
     ship you start with, and you are through a roof of cut stone inside the
     minute with enough fuel to climb back out.

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

  /* And the roof belongs to an Anchor hall, not to some other room: the
     Anchor is within one hall of the cell the drill came through. */
  let near = false;
  for (let r = 0; r < H.ANCHOR_COUNT; r++) {
    const a = H.anchorAt(r);
    if (Math.abs(a.x - x) <= Math.floor(H.VAULT_W / 2) && a.d > roof && a.d - roof <= H.VAULT_H) near = true;
  }
  assert.ok(near, 'the cut stone at ' + roof + ' m under the pad is not the roof of an Anchor hall');
});

test('the intro is short, mysterious, and every line readable', () => {
  /* He plays the opening - CRAFT.md - so this is the most-played screen in the
     game, and it stands between a player and the thing they opened the app to
     do. And *"dont explain the whole story"*: a cap on the words is the
     cheapest guard there is against the next rewrite explaining everything
     again. */
  assert.ok(H.BEATS.length <= 6, 'the intro has grown to ' + H.BEATS.length + ' beats');

  const words = H.BEATS.map((b) => b.text.split(/\s+/).length).reduce((a, b) => a + b, 0);
  assert.ok(words < 70, 'the intro is ' + words + ' words - it is explaining, not suggesting');

  assert.ok(H.INTRO_SECS < 40,
    'the intro runs ' + H.INTRO_SECS + ' s before the player can touch anything');

  for (const b of H.BEATS) {
    /* Long enough to read its own line: two and a half words a second is a
       slow reader on a phone held in one hand. */
    const n = b.text.split(/\s+/).length;
    assert.ok(b.secs >= n / 4, 'beat "' + b.text.slice(0, 30) + '" shows ' + n + ' words in ' + b.secs + ' s');
    assert.ok(b.secs <= 8, 'a beat holding ' + b.secs + ' s is a pause, not a beat');
  }
});

test('a beat carries text and timing and nothing else', () => {
  /* This is what stops it being a slide show, and it is a structural claim
     rather than a visual one so it can actually be tested.

     Beats used to carry a `shot` - which world, how big, is it breaking - and
     the renderer cut to it when the caption changed. Text driving pictures IS
     the slide show: every line began with a hard cut. The flight in transit.ts
     is now continuous and knows nothing about these lines, and the way to keep
     it that way is to make sure a beat has nothing a renderer could read. */
  for (const b of H.BEATS) {
    assert.deepEqual(Object.keys(b).sort(), ['secs', 'text'],
      'a beat carries ' + Object.keys(b).join(', ') + ' - anything beyond text and timing ' +
      'is the caption driving the picture again');
  }
});

test('it runs to the landing on its own, then ends', () => {
  const st = H.newIntro();
  let changes = 0;
  for (let i = 0; i < 60 * 90 && !st.done; i++) {
    if (H.introTick(st, 1 / 60)) changes++;
  }
  assert.ok(st.done, 'the intro never finished on its own');
  assert.equal(changes, H.BEATS.length - 1,
    'expected one caption change per beat after the first, got ' + changes);

  /* And it stays finished: a tick after the end reporting another change would
     run endIntro twice, which starts the game twice. */
  assert.equal(H.introTick(st, 10), false, 'the intro kept going after it ended');
});

test('the captions always hand off to the landing, never straight to the game', () => {
  /* Arriving somewhere is not the cutscene, it is how the game starts. Every
     route out of the captions - running out, tapping through, skipping - has
     to go through the descent, or the ship teleports onto the pad. */
  const byTimer = H.newIntro();
  for (let i = 0; i < 60 * 90 && !byTimer.landing; i++) H.introTick(byTimer, 1 / 60);
  assert.ok(byTimer.landing, 'letting it run never reached the landing');

  const byTap = H.newIntro();
  for (let i = 0; i < H.BEATS.length; i++) H.advance(byTap);
  assert.ok(byTap.landing, 'tapping through never reached the landing');
  assert.equal(byTap.done, false, 'tapping through skipped the landing entirely');

  for (const at of [0, 2, H.BEATS.length - 1]) {
    const st = H.newIntro();
    st.i = at;
    H.skip(st);
    assert.ok(st.landing, 'skip from beat ' + at + ' did not reach the landing');
    assert.equal(st.done, false, 'skip from beat ' + at + ' skipped the arrival too');
  }

  /* Skipping again, during the descent, does end it - a player who has seen it
     twice must be able to get out. */
  const twice = H.newIntro();
  H.skip(twice);
  H.skip(twice);
  assert.equal(twice.done, true, 'skipping during the landing did not end it');
});

test('the beat index never runs off the end of the list', () => {
  /* The renderer reads BEATS[st.i] on the same frame it is told the captions
     are over. */
  const st = H.newIntro();
  for (let i = 0; i < 40; i++) H.advance(st);
  assert.ok(st.i >= 0 && st.i < H.BEATS.length, 'beat index is ' + st.i);
});
