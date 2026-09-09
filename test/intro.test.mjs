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
     there is a fixed number of things to find, that WHERE they are is tied to
     the kind of world, and that finding them opens something. Mystery is
     withholding the explanation, not the goal. */
  const all = H.BEATS.map((b) => b.text).join(' ').toLowerCase();

  assert.ok(/\b(five|5)\b/.test(all),
    'the intro never says how many pieces there are, so the goal has no shape');
  assert.ok(/each kind of world|under each|one on each/.test(all),
    'the intro never says where to look, which is the part that changes what a player does');
  assert.ok(/route|opens|way out|leave/.test(all),
    'the intro never says that finding them leads anywhere');
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
