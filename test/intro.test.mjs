/* The first-run intro.

   The beats and their timing are pure so they can be walked here, which
   matters for the usual reason - the preview browser stops
   requestAnimationFrame when its pane is hidden, so anything on a timer is
   untestable by eye there - and for one specific to an intro: it is the single
   screen every new player sees, and the one nobody on the team ever sees again
   after the first day of building it. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

test('the intro states the objective, not just the mood', () => {
  /* The reason it exists. Until the Jump Drive shipped there was nothing to
     explain; now a player who is never told about it finds out an hour in,
     when their first core breaks. If a rewrite ever drops that sentence the
     intro becomes atmosphere and the game goes back to having a secret goal. */
  const all = H.BEATS.map((b) => b.text).join(' ').toLowerCase();
  assert.ok(all.includes('jump drive'), 'the intro never mentions the jump drive');
  assert.ok(all.includes('five'), 'the intro never says how many components there are');
  assert.ok(all.includes('heart'), 'the intro never mentions the Heart');
  assert.ok(/buried|each kind of world/.test(all),
    'the intro never says WHERE the components are, which is the part that changes what a player does');
});

test('the intro is short enough to sit through and every beat readable', () => {
  /* He plays the opening - CRAFT.md - so this is the most-played screen in the
     game, and it is also the one standing between a player and the thing they
     opened the app to do. */
  assert.ok(H.INTRO_SECS < 45,
    'the intro runs ' + H.INTRO_SECS + ' s before the player can touch anything');
  for (const b of H.BEATS) {
    /* Roughly: a beat has to hold long enough to read its own line. Two and a
       half words a second is a slow reader on a phone in one hand. */
    const words = b.text.split(/\s+/).length;
    assert.ok(b.secs >= words / 4,
      'beat "' + b.text.slice(0, 30) + '..." shows ' + words + ' words for ' + b.secs + ' s');
    assert.ok(b.secs <= 8, 'a beat holding ' + b.secs + ' s is a pause, not a beat');
  }
});

test('it runs to the end on its own, and lands exactly once', () => {
  const st = H.newIntro();
  let changes = 0;
  for (let i = 0; i < 60 * 60; i++) {
    if (H.introTick(st, 1 / 60)) changes++;
    if (st.done) break;
  }
  assert.ok(st.done, 'the intro never finished on its own');
  assert.equal(changes, H.BEATS.length, 'a beat was skipped or repeated');

  /* And it stays finished. A tick after the end that reported another change
     would run endIntro twice - which starts the game twice. */
  assert.equal(H.introTick(st, 10), false, 'the intro kept going after it ended');
});

test('a tap moves it on, and a tap on the last beat ends it', () => {
  const st = H.newIntro();
  for (let i = 0; i < H.BEATS.length - 1; i++) {
    assert.equal(H.advance(st), true);
    assert.equal(st.i, i + 1, 'a tap did not advance one beat');
    assert.equal(st.done, false, 'the intro ended early, on beat ' + st.i);
  }
  H.advance(st);
  assert.equal(st.done, true, 'a tap on the last beat did not end the intro');
  /* Never off the end of the array: the renderer reads BEATS[st.i] on the same
     frame it is told the intro is over. */
  assert.ok(st.i < H.BEATS.length, 'the beat index ran off the end of the list');
});

test('skip ends it from anywhere, including the first frame', () => {
  /* A cutscene you cannot skip is a tax on every replay, and this one plays
     again on every New Game. */
  for (const at of [0, 2, H.BEATS.length - 1]) {
    const st = H.newIntro();
    st.i = at;
    H.skip(st);
    assert.equal(st.done, true, 'skip did not end the intro from beat ' + at);
    assert.ok(st.i < H.BEATS.length, 'skip left the index off the end');
  }
});

test('every beat is a picture, and the pictures change', () => {
  /* CRAFT.md: do not invent a symbol for something you can show. An intro
     whose every beat is the same shot is text over a wallpaper, which is the
     thing this was built instead of. */
  const shots = H.BEATS.map((b) => JSON.stringify(b.shot));
  assert.ok(new Set(shots).size >= 5,
    'only ' + new Set(shots).size + ' distinct shots across ' + H.BEATS.length + ' beats');

  /* The ship has to appear - it is the thing the player will BE - and a world
     has to come apart, because that is the loop's whole climax. */
  assert.ok(H.BEATS.some((b) => b.shot.ship), 'the ship is never on screen');
  assert.ok(H.BEATS.some((b) => b.shot.breaking), 'no world ever breaks');
  assert.ok(H.BEATS.some((b) => b.shot.world === -1), 'the intro never opens on empty space');

  /* And the last beat is the Heart, because that is where it is sending you. */
  const last = H.BEATS[H.BEATS.length - 1];
  assert.equal(last.shot.world, 9999, 'the intro does not end on the Heart');
});
