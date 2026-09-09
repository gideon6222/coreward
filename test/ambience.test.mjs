/* What a world does, as opposed to what colour it is.

   The palettes made the planets look different; these make them behave
   differently in the air the player is flying through. The timing is pure so
   it can be asserted here rather than watched - which matters twice over,
   because the preview browser stops requestAnimationFrame when it is hidden
   and anything on a timer is untestable by eye there. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

const trait = (id) => H.TRAIT_OF[id];

/* Run a world for `secs` of game time at a fixed depth and count what came
   out. Fixed randoms, so this measures the RATE and not the shape. */
function emitted(id, depth, secs, dt = 1 / 60) {
  const st = H.newAmbState();
  let n = 0;
  for (let i = 0; i < secs / dt; i++) {
    if (H.ambienceTick(st, trait(id), depth, dt, 0.5, 0.5)) n++;
  }
  return n;
}

test('Stable emits nothing, which is what makes the others read', () => {
  /* The control. If the quiet world had its own weather there would be no
     baseline to notice the others against, and every planet would read as
     "busy" rather than as somewhere particular. */
  assert.equal(emitted('stable', 60, 30), 0);
  assert.equal(emitted('stable', 200, 30), 0);
});

test('every other trait emits, and only underground', () => {
  for (const id of ['volatile', 'searing', 'crystalline', 'hollow']) {
    assert.ok(emitted(id, 60, 30) > 0, id + ' emits nothing underground');
    /* The pad is not underground. Weather at the surface would put gas vents
       and falling grit around a ship parked in daylight on a landing platform. */
    assert.equal(emitted(id, 0, 30), 0, id + ' emits at the surface');
    assert.equal(emitted(id, 2, 30), 0, id + ' emits above the ambience line');
  }
});

test('the deep is busier than the shallows, on every world that has weather', () => {
  for (const id of ['volatile', 'searing', 'crystalline', 'hollow']) {
    const shallow = emitted(id, 10, 60);
    const deep = emitted(id, 240, 60);
    assert.ok(deep > shallow,
      id + ' emits ' + deep + ' deep against ' + shallow + ' shallow - depth should thicken the air');
  }
});

test('a stalled frame never dumps a clump of particles', () => {
  /* At most one emission per call, however long the frame was. A tab that was
     hidden for ten seconds comes back to one puff, not six hundred - which
     would read as a rendering bug rather than as weather, and is exactly what
     a naive "while (t > every)" loop would do. */
  const st = H.newAmbState();
  let n = 0;
  for (let i = 0; i < 5; i++) {
    if (H.ambienceTick(st, trait('searing'), 120, 10, 0.5, 0.5)) n++;
  }
  assert.equal(n, 5, 'five long frames should give five emissions, not a burst per frame');
});

test('each world emits something recognisably its own', () => {
  /* The point of the feature: four worlds that are telling you what they are.
     If two of them emit the same colour from the same place, one of them is
     saying nothing. */
  const seen = new Map();
  for (const id of ['volatile', 'searing', 'crystalline', 'hollow']) {
    const st = H.newAmbState();
    let em = null;
    for (let i = 0; i < 600 && !em; i++) em = H.ambienceTick(st, trait(id), 120, 1 / 60, 0.3, 0.7);
    assert.ok(em, id + ' never emitted');
    assert.ok(!seen.has(em.color), id + ' emits the same colour as ' + seen.get(em.color));
    seen.set(em.color, id);
    assert.ok(em.count > 0 && em.life > 0, id + ' emits an invisible particle');
  }

  /* And the two that have a direction must actually have it: embers rise from
     below on a Searing world, grit falls from above on a Hollow one. In world
     space +y is up, and the offset is from the ship. */
  const dirOf = (id) => {
    const st = H.newAmbState();
    let em = null;
    for (let i = 0; i < 600 && !em; i++) em = H.ambienceTick(st, trait(id), 120, 1 / 60, 0.5, 0.5);
    return em.dy;
  };
  assert.ok(dirOf('searing') < 0, 'embers on a Searing world must come from below');
  assert.ok(dirOf('hollow') > 0, 'grit on a Hollow world must fall from above');
});
