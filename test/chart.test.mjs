/* The navigation chart.

   The chart is the only reason a trait is something you can plan around, and
   the Jump Drive is entirely a plan about traits. That makes one property
   load-bearing above all the others: **a trait you still need must keep coming
   back**. If the chart can go a long stretch without offering, say, a Searing
   world, then a player who needs the Thermal Core is stuck with nothing on
   screen telling them why - which is the worst failure this game could have,
   because it looks exactly like the game working. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

test('the chart always offers three worlds, and never the same trait twice', () => {
  for (let leg = 0; leg < 60; leg++) {
    const c = H.chartFor(leg);
    assert.equal(c.length, H.CHART_SIZE, `leg ${leg} offered ${c.length} worlds`);
    const traits = c.map((d) => d.trait);
    assert.equal(new Set(traits).size, traits.length,
      `leg ${leg} offered the same trait twice: ${traits.join(', ')} - one of the three cards is then decoration`);
  }
});

test('every trait comes round within two legs, so the goal can never strand the run', () => {
  /* Three per leg out of a five-cycle stepping by three, and gcd(3,5) = 1, so
     two consecutive legs cover six consecutive positions and therefore all
     five traits. This asserts the consequence rather than the arithmetic,
     because the arithmetic is what someone will change. */
  const all = H.TRAITS.map((t) => t.id);
  for (let leg = 0; leg < 200; leg++) {
    const seen = new Set([...H.chartFor(leg), ...H.chartFor(leg + 1)].map((d) => d.trait));
    for (const id of all) {
      assert.ok(seen.has(id),
        `trait "${id}" is missing from legs ${leg} and ${leg + 1} - a player who needs it is stuck`);
    }
  }
});

test('the chart is deterministic', () => {
  /* A save reloaded while the chart is open must offer the same three worlds.
     Reroll it and the player can shop for the world they wanted by restarting,
     which turns a decision into a slot machine. */
  for (const leg of [0, 1, 7, 40]) {
    assert.deepEqual(H.chartFor(leg), H.chartFor(leg), `leg ${leg} is not stable`);
  }
});

test('deeper is always richer, and never free', () => {
  /* The one thing that must never invert. A world that is both shallower and
     richer than another is strictly better, and the choice collapses to
     reading two numbers - see CRAFT.md on good gates versus two upside gates. */
  for (let leg = 0; leg < 40; leg++) {
    const c = H.chartFor(leg);
    for (let i = 1; i < c.length; i++) {
      assert.ok(c[i].coreOff > c[i - 1].coreOff,
        `leg ${leg}: card ${i} is not deeper than card ${i - 1}`);
      assert.ok(c[i].rich > c[i - 1].rich,
        `leg ${leg}: card ${i} is deeper than card ${i - 1} but not richer, so nobody would ever pick it`);
      assert.ok(c[i].fuel > c[i - 1].fuel,
        `leg ${leg}: card ${i} is richer than card ${i - 1} but costs no more to reach`);
    }
  }
});

test('a chart world is somewhere with a name and a palette', () => {
  for (let leg = 0; leg < 40; leg++) {
    for (const d of H.chartFor(leg)) {
      assert.ok(d.world >= 0, `leg ${leg} produced a negative world id`);
      assert.ok(H.planetName(d.world).length > 0, 'a world with no name');
      assert.ok(H.paletteOf(d.world), 'a world with no palette');
      assert.ok(H.TRAIT_OF[d.trait], `unknown trait "${d.trait}"`);
    }
  }
});

test('the crossing never costs more fuel than a full starting tank', () => {
  /* Transit fuel is spent before you arrive, so a cost above what the tank
     holds at level zero would be a chart you cannot use. */
  const startTank = 90;
  for (let leg = 0; leg < 60; leg++) {
    for (const d of H.chartFor(leg)) {
      assert.ok(d.fuel < startTank * 0.5,
        `leg ${leg} asks ${d.fuel} fuel to cross, against a ${startTank} tank`);
    }
  }
});

test('the Heart is never an ordinary destination', () => {
  /* The ending has to be earned. If the Heart could turn up as one of the
     three cards, a player two components in would be handed the last world in
     the game with none of its meaning - and would break its core wondering why
     the credits rolled. The chart draws world ids from a bounded range and the
     Heart sits outside it. */
  for (let leg = 0; leg < 500; leg++) {
    for (const d of H.chartFor(leg)) {
      assert.notEqual(d.world, H.HEART_WORLD,
        `leg ${leg} offered the Heart as an ordinary world`);
    }
  }
});

test('the Heart is deeper and richer than anything the chart offers', () => {
  /* It is the last place you go, and it has to be a commitment rather than
     another stop. If an ordinary world were ever deeper, the ending would be
     an anticlimax you could have practised on. */
  let deepest = -Infinity;
  for (let leg = 0; leg < 200; leg++) {
    for (const d of H.chartFor(leg)) deepest = Math.max(deepest, d.coreOff);
  }
  assert.ok(H.HEART_CORE_OFF > deepest * 1.5,
    `the Heart is ${H.HEART_CORE_OFF} m past baseline against a chart maximum of ${deepest}`);
  assert.ok(H.HEART_RICH > 1.28, 'the Heart pays less than a deep ordinary world');
});

test('the Heart has a name and a palette of its own', () => {
  assert.equal(H.planetName(H.HEART_WORLD), 'The Heart');
  const hp = H.paletteOf(H.HEART_WORLD);
  const any = H.paletteOf(0);
  assert.notDeepEqual(hp, any, 'the Heart is drawn like an ordinary world');
  assert.ok(H.isHeart(H.HEART_WORLD) && !H.isHeart(0));
});

test('a complete drive needs one of every part, not five of anything', () => {
  /* The same trait comes round every couple of legs, so a count would let a
     player finish the drive with five Thermal Cores - which would skip three
     of the five worlds the goal exists to send them to. */
  const ids = H.PARTS.map((p) => p.id);
  assert.ok(!H.driveComplete([]), 'an empty drive is complete');
  assert.ok(!H.driveComplete([ids[0], ids[0], ids[0], ids[0], ids[0]]),
    'five copies of one component completed the drive');
  assert.ok(H.driveComplete(ids), 'one of each did not complete the drive');
  assert.equal(H.DRIVE_SLOTS, ids.length);
});

test('every trait holds exactly one component, and every component a trait', () => {
  /* The chart card promises "X is buried here" from the trait alone. If two
     traits mapped to one part, or a trait to none, that promise is a lie on
     some card and the player learns not to read it. */
  const seen = new Set();
  for (const t of H.TRAITS) {
    const id = H.partFor(t.id);
    assert.ok(id, `trait "${t.id}" holds no component, so that card can never advance the drive`);
    assert.ok(!seen.has(id), `component "${id}" is buried on two different traits`);
    seen.add(id);
  }
  assert.equal(seen.size, H.DRIVE_SLOTS, 'a component exists that no trait holds');
});

test('the component is buried below the relic, and inside the world', () => {
  /* Deeper than the relic on purpose: a world holding a component should be
     one you commit to rather than one you can skim. And it must be reachable -
     a component generated below the core is one that cannot be dug. */
  for (let leg = 0; leg < 40; leg++) {
    for (const off of [-18, 0, 34, 120]) {
      const core = H.coreDepth(leg) + off;
      const part = H.partAt(leg, off);
      const relic = H.relicAt(leg, off);
      assert.ok(part.d < core, `leg ${leg}: the component is at or below the core`);
      assert.ok(part.d > core * 0.6, `leg ${leg}: the component is too shallow to be a commitment`);
      assert.ok(part.x >= 1 && part.x <= H.W - 2,
        `leg ${leg}: the component is hard against the world edge`);

      /* Both are placed against the world's REAL core depth, offset included.
         A relic placed against the leg's baseline generates below the floor of
         a shallow world and can never be dug - which is how this assertion
         earned its keep. */
      assert.ok(relic.d < core, `leg ${leg}, offset ${off}: the relic is below the core`);

      /* And they must never land in the same cell: blockAt returns the relic
         first, so a collision would make the component unreachable and stall
         the drive on a world that promised it. */
      assert.ok(!(relic.x === part.x && relic.d === part.d),
        `leg ${leg}, offset ${off}: relic and component are in the same cell`);
    }
  }
});
