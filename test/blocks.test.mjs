/* World generation must be bit-identical after the migration.
   rnd() is a pure seeded hash, so every cell of every planet is reproducible. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPure, assertGolden } from './harness.mjs';

const H = await loadPure();
const PLANETS = [0, 1, 2, 3, 4, 5];

/* stable id -> char map, sorted so it never depends on iteration order */
const ALPHA = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ALL_IDS = [
  ...H.ORES.map((o) => o.id), ...H.ROCKS.map((r) => r.id),
  H.GEODE.id, H.GAS.id, H.CACHE.id, H.RUBBLE.id, H.SEAM.id,
  'core', 'bedrock', '(empty)', 'relic', 'part', 'schematic',
  /* The authored rooms. Four ids and not one: a wall you can cut, a wall you
     cannot, and the Anchor in two states are four different things to a player
     and must be four different things to the snapshot. */
  'worked', 'sealed', 'anchor', 'anchorlit'
].sort();
const CHAR = new Map(ALL_IDS.map((id, i) => [id, ALPHA[i]]));

/* Every authored cell in the world, built once. Several tests below need to
   say "except inside a room", and asking the stamp is the only way to say it
   that stays true when the rooms move. */
const VAULT = H.vaultCells();
assert.ok(ALL_IDS.length <= ALPHA.length, 'ran out of snapshot characters');

/* An id with no character silently became the literal string "undefined" in
   the grid, and 'relic' had been doing exactly that since the day it was
   added. On its own that is only ugly - the baseline recorded it consistently,
   so changes were still caught. It became a real hole the moment a SECOND id
   was missing: two different blocks both spelling "undefined" cannot be told
   apart, so a cell changing from one to the other would compare equal and the
   golden would pass through the change it exists to catch.

   Asserting here rather than in the loop so it fails once with a useful name
   rather than four thousand times. */
function charFor(id) {
  const c = CHAR.get(id);
  if (c === undefined) {
    throw new Error('snapshot: block id "' + id + '" has no legend character - ' +
      'add it to ALL_IDS, or it will be indistinguishable from every other missing id');
  }
  return c;
}

/* A cell's payload is determined by (planet, id, colour, HARDNESS). It used to
   be (planet, id, colour), and before that just (planet, id) - every numeric field was constant per id or scaled by
   hardMult - but seams and rubble take the colour of the band they sit in, so
   one id now legitimately has several payloads.

   Round eight added hardness to the key for the same reason colour was added:
   a trait bends how hard its ground is to cut, and traits are now a property
   of a REGION rather than of a planet, so one rock id legitimately has several
   hardnesses within one world. Dirt in Crystalline ground is 1.2 and dirt
   under the pad is 1.

   The snapshot stores one payload per distinct key plus a per-cell id grid,
   and the builder ASSERTS that assumption on every cell rather than trusting
   it. Widening the key rather than dropping the assertion, every time: the
   point of it is to catch a field that starts varying by something nobody
   expected, and the way to keep that sharp is to name the things it is allowed
   to vary by. */
function snapshot(p) {
  H.setWorld(p);
  H.g.dug = new Set();
  const cd = H.coreDepth(p);
  const defs = {};
  const counts = {};
  let grid = '';
  for (let d = -1; d <= cd + 1; d++) {
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      const id = b ? b.id : '(empty)';
      grid += charFor(id);
      counts[id] = (counts[id] || 0) + 1;
      if (!b) continue;
      const payload = { ...b };
      const dk = id + ':' + b.color + ':' + b.hard;
      if (!(dk in defs)) defs[dk] = payload;
      else assert.deepEqual(payload, defs[dk],
        'blockAt payload for "' + dk + '" varies within planet ' + p + ' at (' + x + ',' + d + ')');
    }
  }
  return { planet: p, coreDepth: cd, cols: H.W, rowsFrom: -1, rowsTo: cd + 1, counts, defs, grid };
}

test('world generation is unchanged for planets 0-5', () => {
  assertGolden('blocks', PLANETS.map(snapshot));
});

/* Infinity does not survive JSON, so bedrock gets its own explicit assertion
   on the live value rather than relying on the snapshot round-trip. */
test('bedrock hardness is Infinity (asserted directly, not via snapshot)', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  const below = H.blockAt(H.START_X, H.coreDepth(0) + 1);
  assert.equal(below.id, 'bedrock');
  assert.equal(below.hard, Infinity);
  assert.ok(!Number.isFinite(below.hard));
  assert.equal(below.wt, 0);
  assert.equal(below.value, 0);
  for (const p of PLANETS) {
    H.setWorld(p);
    const b = H.blockAt(0, H.coreDepth(p) + 5);
    assert.equal(b.hard, Infinity, 'bedrock on planet ' + p + ' must stay unbreakable');
  }
});

test('the core sits exactly at coreDepth and is breakable', () => {
  for (const p of PLANETS) {
    H.setWorld(p);
    H.g.dug = new Set();
    const cd = H.coreDepth(p);
    const core = H.blockAt(H.START_X, cd);
    assert.equal(core.id, 'core', 'planet ' + p);
    assert.equal(core.core, true);
    assert.ok(Number.isFinite(core.hard) && core.hard > 0, 'core must be breakable on planet ' + p);
    assert.equal(core.hard, 26 * H.hardMult(p));
  }
});

test('dug cells read as empty', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  const k = H.key(4, 5);
  assert.notEqual(H.blockAt(4, 5), null, 'cell should start solid');
  H.g.dug.add(k);
  assert.equal(H.blockAt(4, 5), null, 'dug cell should read empty');
  H.g.dug = new Set();
});

/* ---------- pockets and caves ----------

   These were added on their own seed offsets specifically so that adding them
   could not reshuffle the ore stream. The frozen snapshot below is the world
   as it stood the moment before they existed, and the test asserts the only
   legal difference: a cell either kept its old id, or a cave/gas/geode
   overwrote it. Anything else means a new generation feature perturbed the
   rolls underneath it, which silently rebalances every depth at once.

   FROZEN, AND RE-FROZEN ONCE - in round seven, 2026-09-10.

   The file used to be the world as it stood the moment before caves, gas and
   geodes existed, which is where the name came from. Round seven rebalanced
   the ore table on purpose: the ladder spread from five worlds to eight, the
   deep tier went from 0.40-2.10% down to 0.12-0.30%, and total density fell by
   a quarter. That is the one change the rule above always said would need a
   re-record, and it is the first time it has been used.

   MEASURED BEFORE RE-RECORDING, NOT AFTER. Of 15,639 cells: 11,053 changed
   rock band, which M5 already licensed as rock-for-rock; 841 changed from one
   ore to another; 574 stopped being ore and 368 started. That is about six per
   cent of cells changing ore STATUS, against a deliberate density cut from 10%
   to 7.5%. Nothing in the diff was a surprise.

   What the file means now is "the world as it stood after round seven". What
   the TEST means is unchanged: a new feature may overwrite cells and may not
   move the ore underneath them. That property does not care which fixed point
   it is measured from - which is why re-freezing costs nothing except a name
   that had stopped being true, so the name went with it.

   Freeze. Do not re-record unless you are deliberately rebalancing ore. */
const PRE = JSON.parse(
  readFileSync(new URL('./baseline/blocks-frozen.json', import.meta.url), 'utf8'));
/* Everything allowed to sit on top of the ore stream. Adding an entry here is
   a deliberate act and should come with a diff you have read: it says "this
   new feature overwrites cells", which is fine, as opposed to "this new
   feature moved the ore around", which is not. */
/* 'part' is the Jump Drive component - one cell per world, on the worlds whose
   trait holds one. It is an overwriter in exactly the sense this set means: it
   replaces whatever was generated in its cell and touches nothing else,
   because its position is a hash of the leg rather than a sample of the
   world's noise. It consumes no roll at all. */
/* 'schematic' is a device crate - up to four cells per world, at positions
   hashed from the leg and the device. Same argument as 'part', and it is worth
   restating rather than lumping in, because the claim is what makes it legal:
   it consumes NO roll. It is not sampled from the world's noise at all, so it
   cannot move an ore, and the cells it takes are the only cells it touches. */
const OVERWRITERS = new Set([
  '(empty)', H.GAS.id, H.GEODE.id, H.CACHE.id, 'relic', 'part', 'schematic',
  /* W7's authored rooms, and they belong here for exactly the reason the
     pockets do: a room is STAMPED over whatever the generator made, after
     every roll has already happened, so it can change what a cell holds and
     can never change what any other cell holds. The ore stream underneath is
     untouched - which is the property this whole file exists to defend.

     The rubble in the expedition room is the one that needs saying out loud:
     rubble was previously only ever placed by a tremor, so it appears in this
     list as a thing an authored room may leave behind. */
  'worked', 'sealed', 'anchor', 'anchorlit', H.RUBBLE.id
]);

/* Extending the ore ladder downward is the other legal change, and it is a
   NARROWER claim than the one above, so it is stated narrowly rather than by
   dropping the new ids into OVERWRITERS.

   blockAt() takes the first ORES entry whose depth gate is met, and every
   entry's spawn chance is strictly lower than the one after it. So a new
   deepest ore can only ever claim cells the ore directly above it held -
   never rock, never a shallower ore, never anything at a depth it does not
   reach. That subset property is asserted separately in stats.test.mjs; this
   map is what it buys. */
const LADDER_EXTENSION = { coreite: new Set(['umbrite', 'solmarrow']) };

/* Seams are the same shape of claim: they are rolled on their own seed and
   checked only after every ore roll has failed, so a seam can only ever
   replace PLAIN ROCK - never ore, never a pocket, never the core. Stated as a
   rule rather than as an OVERWRITERS entry for the same reason as the ladder:
   "rock may become a seam" is narrower and therefore worth more than "seams
   may replace anything". */
/* M5, 2026-09-10: the rock bands stopped being fixed metres and became
   fractions of each world's own core depth, so a cell that was granite at 60 m
   on planet 0 is scoria now. That is a rock becoming a DIFFERENT ROCK, and it
   is the only thing that change can do - it moved no ore, because ore is
   gated on its own depth table and rolled before any band is consulted.

   Stated as rock-for-rock rather than by widening OVERWRITERS, and paired with
   the assertion below that the set of cells holding ORE is bit-identical to
   the frozen baseline, which is the property this whole test exists to defend.
   The frozen file itself is untouched. */
const ROCK_IDS = new Set(H.ROCKS.map((r) => r.id));
for (const r of H.ROCKS) LADDER_EXTENSION[r.id] = new Set(['seam', ...ROCK_IDS]);

test('pockets and caves only overwrite cells, never reshuffle the ore stream', () => {
  /* Two different kinds of legal change, counted apart.

     A pocket or a cave dropping onto the world has to stay rare - that is what
     "an event, not terrain" means, and the ceiling below is what enforces it.
     A ladder extension or a seam is a different claim entirely: it converts a
     whole category wholesale and is SUPPOSED to be common. Counting them
     together meant seams tripped the pocket ceiling, which would have read as
     "pockets have gone wrong" for a change that had nothing to do with them. */
  let same = 0, overwritten = 0, extended = 0, shortened = 0;
  for (const snap of PRE) {
    H.setWorld(snap.planet);
    H.g.dug = new Set();
    let i = 0;
    for (let d = snap.rowsFrom; d <= snap.rowsTo; d++) {
      for (let x = 0; x < snap.cols; x++, i++) {
        const was = snap.legend[snap.grid[i]];
        const b = H.blockAt(x, d);
        const now = b ? b.id : '(empty)';
        const at = 'planet ' + snap.planet + ' (' + x + ',' + d + ')';
        /* The invariant underneath everything else: a cell that held ore in
           the frozen world still holds ore, and a cell that did not still does
           not. Every legal change above is a change of KIND within one of
           those two camps. */
        /* M5 also moved every core upward, so cells that held ore in the
           frozen world are now the core itself or the bedrock under it. That
           is the world getting shorter, not the ore stream moving. */
        /* The world got shorter AND the core moved up, so cells that were the
           core are now ordinary rock above it, and cells that were ore are now
           the core or the bedrock under it. Both are the same fact. */
        if ((now === 'core' || now === 'bedrock') && d >= H.coreDepth(snap.planet)) { shortened++; continue; }
        if ((was === 'core' || was === 'bedrock') && d < H.coreDepth(snap.planet)) { shortened++; continue; }
        const wasOre = !!(H.DEF[was] && H.isOre(H.DEF[was]));
        const nowOre = !!(b && b.ore && H.DEF[now] && H.isOre(H.DEF[now]));
        /* An overwriter LEAVING a cell is as legal as one arriving.

           The rule was one-directional: X becoming a pocket was fine and a
           pocket becoming X was "the ore stream moved". That held while
           overwriters never moved - and round eight widened the world from 13
           columns to 61, which moves every hashed singleton, because their
           positions are taken modulo the width. A schematic crate that used to
           sit at (9,28) is somewhere else now and the cell underneath it went
           back to being the granite it always was.

           That is the overwriter moving, not the ore stream. Stated
           symmetrically so the test keeps meaning what it says. */
        if (OVERWRITERS.has(was)) { overwritten++; continue; }
        if (wasOre !== nowOre && !OVERWRITERS.has(now) && was !== 'seam' && now !== 'seam') {
          assert.fail(at + ': ' + was + ' became ' + now + ' - the ore stream moved');
        }
        if (now === was) { same++; continue; }
        /* A rock that became a different rock is M5 re-banding the world, and
           it is counted apart from the ladder and seam conversions: those are
           claims about the ORE stream and have a ceiling for that reason. */
        if (ROCK_IDS.has(was) && ROCK_IDS.has(now)) { shortened++; continue; }
        const ladder = LADDER_EXTENSION[was];
        if (ladder && ladder.has(now)) extended++;
        else if (OVERWRITERS.has(now)) overwritten++;
        else assert.fail(
          at + ': ' + was + ' became ' + now + ', which is neither a pocket, a cave, ' +
          'nor a legal extension of the ore ladder - something perturbed the ore rolls');
        assert.ok(was !== 'core' && was !== 'bedrock',
          at + ': ' + was + ' must never be overwritten');
      }
    }
    assert.equal(i, snap.grid.length, 'planet ' + snap.planet + ' grid length drifted');
  }
  /* `shortened` is in the denominator: those cells are still part of the
     world being compared, they just changed because M5 moved the core and the
     bands. Leaving them out shrank the total and made the pocket share read
     twice what it is. */
  const total = same + overwritten + extended + shortened;
  /* Guard against the test passing because nothing generates any more.

     Counted in the WORLD rather than in the diff, and that changed with the
     re-freeze. The baseline used to predate caves, gas and geodes, so every
     one of them showed up as an overwrite and counting overwrites counted
     them. The frozen world now contains them, so the diff is - correctly -
     zero, and a count of zero would have read as "pockets have stopped
     generating" when it actually means "nothing changed".

     So the claim is made directly: pockets and caves exist, and they stay rare
     enough to be events rather than terrain. That is what the assertion always
     meant and it no longer depends on which fixed point it is measured from. */
  let pockets = 0, cells = 0;
  for (const snap of PRE) {
    H.setWorld(snap.planet);
    H.g.dug = new Set();
    for (let d = 0; d <= snap.rowsTo; d++) {
      for (let x = 0; x < snap.cols; x++) {
        const b = H.blockAt(x, d);
        cells++;
        if (!b) { pockets++; continue; }
        if (b.id === H.GAS.id || b.id === H.GEODE.id || b.id === H.CACHE.id) pockets++;
      }
    }
  }
  assert.ok(pockets > 200, 'pockets and caves generate almost nothing: ' + pockets);
  /* 18%, not 12%.

     Two things moved it and both were deliberate. Cave chance climbs with
     depth and the world went from 58 metres to 452, so there is far more deep
     ground in the average now. And he asked for this: *"find more secrets,
     random caves, and other things to make the planet feel mysterious"*. The
     ceiling still exists because ground you cannot dig is ground with nothing
     in it - it is just drawn where a world with real cave systems in it sits
     rather than where a shallow shaft did. */
  assert.ok(pockets / cells < 0.18,
    'pockets and caves now cover ' + Math.round(1000 * pockets / cells) / 10 +
    '% of the world - they are meant to be events, not terrain');
  /* And the seams, for the same reason and in the same way: the frozen world
     already has them, so a diff cannot see them any more. */
  let seams = 0;
  for (const snap of PRE) {
    H.setWorld(snap.planet);
    H.g.dug = new Set();
    for (let d = 0; d <= snap.rowsTo; d++) {
      for (let x = 0; x < snap.cols; x++) {
        const b = H.blockAt(x, d);
        if (b && b.seam) seams++;
      }
    }
  }
  assert.ok(seams > 200, 'the rock has no seams in it at all: ' + seams);
  assert.ok(extended / total < 0.45,
    'category conversions now cover ' + Math.round(1000 * extended / total) / 10 +
    '% of the world - at that point the thing being converted is the exception');
});

test('caves stay below CAVE_MIN_DEPTH and never eat the core', () => {
  for (const p of PLANETS) {
    H.setWorld(p);
    H.g.dug = new Set();
    const cd = H.coreDepth(p);
    /* Except inside an authored room, which is open ground ON PURPOSE at
       whatever depth it was placed - see vaults.ts. Named as an exception
       rather than by lowering CAVE_MIN_DEPTH, because the claim is still that
       the GENERATOR opens nothing up there, and a room is not the generator. */
    for (let d = 0; d < H.CAVE_MIN_DEPTH; d++)
      for (let x = 0; x < H.W; x++) {
        if (VAULT.has(x + ',' + d)) continue;
        assert.notEqual(H.blockAt(x, d), null,
          'planet ' + p + ': a cave opened at ' + d + ' m, above CAVE_MIN_DEPTH');
      }
    for (let x = 0; x < H.W; x++) {
      assert.equal(H.blockAt(x, cd).id, 'core', 'planet ' + p + ': core row must survive caves');
      assert.equal(H.blockAt(x, cd + 1).id, 'bedrock', 'planet ' + p + ': floor must survive caves');
    }
  }
  assert.ok(H.caveChance(H.CAVE_MIN_DEPTH) < H.caveChance(200),
    'caves should open up with depth');
  assert.ok(H.caveChance(100000) <= 0.09, 'cave chance must stay capped or the ground dissolves');
});

/* A gas pocket has to give way faster than whatever surrounds it. The bang
   only reads as a surprise if the block breaks early - if it were the tougher
   block you would feel it coming and it would just be a tax. */
test('gas breaks faster than the rock it hides in, and pays nothing', () => {
  for (let d = H.GAS.min; d <= 300; d++)
    assert.ok(H.GAS.hard < H.baseRock(d, 0).hard,
      'gas (' + H.GAS.hard + ') is not softer than ' + H.baseRock(d, 0).id +
      ' (' + H.baseRock(d, 0).hard + ') at ' + d + ' m');
  assert.equal(H.GAS.value, 0, 'gas must never be worth credits');
  assert.equal(H.GAS.wt, 0, 'gas must never take cargo weight');
  assert.ok(H.GAS_HULL_DAMAGE > 0 && H.GAS_HULL_DAMAGE < H.HULL_MAX / 3,
    'gas should hurt without being a one-hit kill: ' + H.GAS_HULL_DAMAGE + ' of ' + H.HULL_MAX);
  assert.ok(H.GAS_SOAK > 0 && H.GAS_SOAK <= 0.5, 'the soak spike is the real bite');
});

/* A geode is the payoff for going sideways instead of straight down, so it has
   to beat anything you could have reached by simply digging deeper at the
   depth where it starts appearing. */
test('a geode outvalues every ore available at its depth', () => {
  for (const o of H.ORES) {
    if (o.min > H.GEODE.min) continue;
    assert.ok(H.GEODE.value > o.value * 3,
      'geode (' + H.GEODE.value + ') barely beats ' + o.id + ' (' + o.value + ') at ' +
      H.GEODE.min + ' m, so there is no reason to go looking for one');
  }
  assert.ok(H.GEODE.wt <= 5, 'a geode must be light enough that you never leave one behind');
  assert.ok(H.GEODE.glow > Math.max(...H.ORES.map((o) => o.glow)),
    'a geode has to out-shine every ore or you will never spot one across a cave');
});

/* ---------- planet traits ----------

   The additive-only test above runs with traits applied, so its passing is
   also the proof that no trait perturbs the ore stream. If a future trait
   reaches into `rnd(x, d, planet)` it fails there, not here. */

/* A census of one REGION, not of one planet.

   Round eight folded the twelve planets into twelve regions of one world, so
   "what does Volatile ground look like" is now a question about a patch of
   this world rather than about a place you fly to. The sweep walks the whole
   world once and bins every cell by the region it is in, which is both faster
   than twelve passes and the only way to be sure the regions actually tile the
   world with nothing left over. */
function censusAll() {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  const cd = H.coreDepth(0);
  const bins = [];
  for (let i = 0; i < H.REGION_COUNT; i++) bins.push({ cells: 0, gas: 0, geo: 0, cave: 0 });
  for (let d = 0; d < cd; d++) {
    for (let x = 0; x < H.W; x++) {
      const r = bins[H.regionAt(x, d)];
      r.cells++;
      const b = H.blockAt(x, d);
      if (!b) r.cave++;
      else if (b.id === H.GAS.id) r.gas++;
      else if (b.id === H.GEODE.id) r.geo++;
    }
  }
  return bins.map((r) => ({
    cells: r.cells,
    gas: 100 * r.gas / r.cells, geode: 100 * r.geo / r.cells,
    cave: 100 * r.cave / r.cells,
    minable: 100 * (r.cells - r.cave - r.gas) / r.cells
  }));
}

const CENSUS = censusAll();
const REGIONS = Array.from({ length: 12 }, (_, i) => i);

test('the regions tile the world, and every one of them is somewhere you can be', () => {
  const total = CENSUS.reduce((n, r) => n + r.cells, 0);
  assert.equal(total, H.W * H.coreDepth(0), 'the regions do not tile the world');
  for (let i = 0; i < H.REGION_COUNT; i++) {
    /* No region may be a sliver. Twelve equal regions would be 8.3% each; a
       floor of 4% allows the wandering boundaries to breathe and still catches
       a layout that has squeezed one out of existence. */
    const share = 100 * CENSUS[i].cells / total;
    assert.ok(share > 4, H.regionName(i) + ' is only ' + share.toFixed(1) + '% of the world');
    assert.ok(H.regionName(i).length > 2, 'region ' + i + ' has no name');
  }
});

test('the shallow middle is Stable, because that is where the game starts', () => {
  /* The pad is at the top of the middle column, so the region a new player
     spends their first hour in must be the one with no rules bent. A tutorial
     whose gas is doubled is a tutorial nobody finishes. */
  assert.equal(H.traitAt(H.START_X, 2).id, 'stable',
    'the ground under the pad is not Stable');
});

test('every trait is somewhere in the world, and none of them owns it', () => {
  const seen = new Map();
  for (const i of REGIONS) {
    const id = H.traitOf(i).id;
    seen.set(id, (seen.get(id) || 0) + 1);
  }
  for (const t of H.TRAITS) {
    assert.ok(seen.get(t.id) >= 1, t.name + ' is in the table and nowhere in the world');
  }
  for (const [id, n] of seen) {
    assert.ok(n <= 4, id + ' covers ' + n + ' of 12 regions - it is the world, not a trait');
  }
  /* And the same region always has the same trait, or nothing about a place
     can be learned. */
  for (const i of REGIONS) assert.equal(H.traitOf(i), H.traitOf(i), 'traitOf must be pure');
});

test('a trait bends its own rate without turning a pocket into terrain', () => {
  for (const i of REGIONS) {
    const t = H.traitOf(i);
    const c = CENSUS[i];
    for (const [name, pct] of [['gas', c.gas], ['geodes', c.geode]]) {
      assert.ok(pct < 4.5, H.regionName(i) + ' (' + t.id + '): ' + name + ' at ' +
        pct.toFixed(2) + '% is terrain, not an event');
    }
    /* Hollow trades material for speed. Past a point it stops being a trade. */
    assert.ok(c.minable > 70, H.regionName(i) + ' (' + t.id + ') is only ' +
      c.minable.toFixed(1) + '% minable - there is nothing left to dig for');
  }

  /* The flagship effects have to be visible against Stable ground, or a trait
     is a name rather than a change you can feel. Measured against the average
     of the Stable regions rather than one of them, because a region's depth
     also moves these rates and one sample would be comparing two things. */
  const avg = (pred) => {
    const rs = REGIONS.filter((i) => H.traitOf(i).id === pred);
    return {
      gas: rs.reduce((n, i) => n + CENSUS[i].gas, 0) / rs.length,
      geode: rs.reduce((n, i) => n + CENSUS[i].geode, 0) / rs.length,
      cave: rs.reduce((n, i) => n + CENSUS[i].cave, 0) / rs.length
    };
  };
  const stable = avg('stable');
  assert.ok(avg('volatile').gas > stable.gas * 1.6, 'Volatile is not volatile');
  assert.ok(avg('crystalline').geode > stable.geode * 2.0, 'Crystalline is not crystalline');
  assert.ok(avg('hollow').cave > stable.cave * 1.4, 'Hollow is not hollow');
});

test('trait-adjusted rates stay inside their caps at any depth', () => {
  /* Sweeping REGIONS and passing real traits.

     This swept planet indices and handed them straight to functions whose
     parameter is a Trait - `caveChanceOn(d, p)` with p a number. It passed
     because a number has no `.cave`, so every lookup fell back to 1 and the
     test was measuring the UNMODIFIED rates while claiming to measure the
     trait-adjusted ones. Round eight turned the planet index into a region
     index and the mistake became visible; it was always there. */
  for (const i of REGIONS) {
    const t = H.traitOf(i);
    for (const d of [26, 60, 120, 400, 5000]) {
      assert.ok(H.caveChanceOn(d, t) <= H.CAVE_CHANCE_CAP + 1e-9,
        'cave chance broke the cap in ' + H.regionName(i) + ' at ' + d + ' m');
      assert.ok(H.caveChanceOn(d, t) > 0);
    }
    assert.ok(H.gasChanceOn(t) <= 0.06 && H.gasChanceOn(t) >= H.GAS.chance);
    assert.ok(H.geodeChanceOn(t) <= 0.06 && H.geodeChanceOn(t) >= H.GEODE.chance);
  }
});

test('out of bounds and above surface read as empty', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  assert.equal(H.blockAt(-1, 5), null);
  assert.equal(H.blockAt(H.W, 5), null);
  assert.equal(H.blockAt(4, -1), null);
});

test('rnd() is a pure deterministic hash', () => {
  const a = H.rnd(13, 41, 2);
  const b = H.rnd(13, 41, 2);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 1, 'rnd must stay in [0,1)');
  assert.notEqual(H.rnd(13, 41, 2), H.rnd(13, 41, 3), 'planet must seed the hash');
  const seen = new Set();
  for (let x = 0; x < 40; x++) for (let d = 0; d < 40; d++) seen.add(H.rnd(x, d, 0));
  assert.ok(seen.size > 1500, 'hash is collapsing: only ' + seen.size + ' distinct values in 1600');
});

/* ---------- tremors and rubble ----------

   A collapsed cell has to regenerate as rubble rather than as whatever was
   originally there, or a tremor becomes an ore respawn and the deepest vein in
   the game can be farmed forever from one spot. */

test('a collapsed cell comes back as rubble, never as the ore it held', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();

  /* Find a cell that generates something valuable.

     Searched across the shallow WORLDS rather than down one of them. Round
     seven pushed the ore ladder out over eight planets, so planet 0 tops out
     at silver and there is nothing worth 500 anywhere in its 58 metres - the
     old bounds were looking for ore below that world's own bedrock. What this
     test is actually about is rubble, not value, so it takes the first
     valuable cell it can find on any early world. */
  let found = null;
  for (let p = 0; p < 4 && !found; p++) {
    H.setWorld(p);
    H.g.dug = new Set();
    H.g.rubble = new Set();
    for (let d = 30; d < H.coreDepth(p) && !found; d++)
      for (let x = 0; x < H.W; x++) {
        const b = H.blockAt(x, d);
        if (b && b.ore && b.value > 500) { found = [x, d, b]; break; }
      }
  }
  assert.ok(found, 'expected some valuable ore on an early planet');
  const [x, d, original] = found;

  const k = H.key(x, d);
  H.g.dug.add(k);
  assert.equal(H.blockAt(x, d), null, 'mined cell should be empty');

  /* a tremor fills it back in */
  H.g.dug.delete(k);
  H.g.rubble.add(k);
  const now = H.blockAt(x, d);
  assert.equal(now.id, 'rubble', 'a collapsed ore cell must not come back as ore');
  assert.ok(now.value < original.value / 10,
    'rubble must be worth almost nothing, or collapsing is a payday');
  assert.equal(now.ore, false);

  /* hardness rides on the band it sits in, and is easier than that band */
  assert.ok(now.hard < H.baseRock(d, 0).hard * H.hardMult(0),
    'clearing rubble should be easier than cutting fresh rock');
  assert.ok(now.hard > 0);

  /* clearing it again wins: dug beats rubble, so no cleanup is needed */
  H.g.dug.add(k);
  assert.equal(H.blockAt(x, d), null, 're-cleared rubble must read as empty');
  H.g.dug = new Set();
  H.g.rubble = new Set();
});

test('rubble never appears on its own, only where something put it', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  /* "Something put it" now means a tremor OR an authored room - the previous
     expedition's spoil is the only rubble in the world that was not caved in
     by the ground. The claim is unchanged: the generator never rolls it. */
  let authored = 0;
  for (let d = 0; d < H.coreDepth(0); d++)
    for (let x = 0; x < H.W; x++) {
      const b = H.blockAt(x, d);
      if (b && b.id === 'rubble') {
        assert.equal(VAULT.get(x + ',' + d), 'r',
          'rubble generated at (' + x + ',' + d + ') with nothing to have put it there');
        authored++;
      }
    }
  /* And the exception is not vacuous: there IS spoil in the world, so this
     test is exercising the branch it just licensed rather than licensing a
     branch that never runs. */
  assert.ok(authored > 0, 'no expedition spoil anywhere in the world');
});

test('the tremor band is reachable on the planet everyone starts on', () => {
  assert.ok(H.tremorDepth(0) > H.heatDepth(0),
    'tremors must be a THIRD band, not a second thing happening at the heat line');
  assert.ok(H.tremorDepth(0) < H.coreDepth(0) - 8,
    'the unstable band would be unreachable or vestigial on planet 0: ' +
    H.tremorDepth(0) + ' against a core at ' + H.coreDepth(0));
});

test('a tremor takes more of the tunnel the deeper you are, but stays bounded', () => {
  let prev = 0;
  for (let d = H.tremorDepth(0); d < 600; d += 5) {
    const n = H.tremorCells(d, 0);
    assert.ok(n >= prev, 'collapse size went backwards at ' + d + ' m');
    assert.ok(n >= 1 && n <= 12, n + ' cells at ' + d + ' m is outside any sane range');
    prev = n;
  }
  assert.ok(H.tremorCells(600, 0) > H.tremorCells(H.tremorDepth(0), 0),
    'depth should make tremors worse or the band has no gradient');
  assert.ok(H.TREMOR_SAFE_RADIUS >= 2, 'a tremor must never land next to the ship');
  assert.ok(H.TREMOR_WARN > 1.5, 'the player needs time to read the warning');
  assert.ok(H.TREMOR_FIRST > H.TREMOR_EVERY,
    'the first tremor should come later than the rhythm that follows, so ' +
    'arriving in the band is not immediately punished');
});

test('rubble is coloured as the band it sits in, not one fixed grey', () => {
  H.setWorld(0);
  H.g.dug = new Set();
  H.g.rubble = new Set();
  const at = (d) => {
    H.g.rubble = new Set([H.key(3, d)]);
    return H.blockAt(3, d);
  };
  /* dirt near the top against scoria deep in the hot half: two very different
     bands, both inside the one world, which now ends at 452 m */
  const shallow = at(3), deep = at(320);
  assert.notEqual(shallow.color, deep.color,
    'rubble is one flat colour everywhere, so it reads as imported rock');

  /* and it sits between the band and the neutral fill rather than being either.
     Kept above coreDepth(0), which M5 moved to 58 m: bedrock is resolved
     before rubble is, correctly, since there is no tunnel down there to
     collapse. The old depths of 90 and 108 are below the world now. */
  for (const d of [3, 60, 150, 250, 380]) {
    const b = at(d);
    /* The band AT THAT COLUMN. Stratum boundaries wander per column now, so
       "the band at this depth" is only a whole answer once you say where. */
    const band = H.baseRock(d, 0, 3).color;
    assert.notEqual(b.color, band, 'rubble at ' + d + ' m is indistinguishable from fresh rock');
    assert.notEqual(b.color, H.RUBBLE.color, 'rubble at ' + d + ' m ignored its band');
    assert.equal(b.color, H.mixHex(band, H.RUBBLE.color, 0.5));
  }

  /* and it never overrides the two things that are not tunnel */
  const cd = H.coreDepth(0);
  H.g.rubble = new Set([H.key(3, cd), H.key(3, cd + 1)]);
  assert.equal(H.blockAt(3, cd).id, 'core', 'rubble must not overwrite the core');
  assert.equal(H.blockAt(3, cd + 1).id, 'bedrock', 'rubble must not overwrite bedrock');
  H.g.rubble = new Set();
});

test('mixHex blends channels and stays inside 24 bits', () => {
  assert.equal(H.mixHex(0x000000, 0xffffff, 0), 0x000000);
  assert.equal(H.mixHex(0x000000, 0xffffff, 1), 0xffffff);
  assert.equal(H.mixHex(0x000000, 0xffffff, 0.5), 0x808080);
  assert.equal(H.mixHex(0xff0000, 0x0000ff, 0.5), 0x800080);
  for (const t of [0, 0.13, 0.5, 0.87, 1]) {
    const v = H.mixHex(0x6b2a18, 0x6d6459, t);
    assert.ok(v >= 0 && v <= 0xffffff, 'mixHex escaped 24 bits at t=' + t);
    assert.equal(v, Math.round(v), 'mixHex produced a non-integer colour');
  }
});

/* ---------- supply caches ----------

   The discovery moment. A cache pays in something other than ore, which means
   it never touches the hold - so a full hold is never a reason to leave one in
   the ground, and the prize is never in competition with cargo weight. */

test('a cache is rare enough to be a surprise and common enough to be met', () => {
  for (const p of PLANETS) {
    H.setWorld(p);
    H.g.dug = new Set();
    H.g.rubble = new Set();
    const cd = H.coreDepth(p);
    let n = 0, cells = 0;
    for (let d = 0; d < cd; d++) for (let x = 0; x < H.W; x++) {
      cells++;
      const b = H.blockAt(x, d);
      if (b && b.cache) {
        n++;
        assert.ok(d >= H.CACHE.min, 'a cache appeared at ' + d + ' m, above its floor');
        assert.equal(b.wt, 0, 'a cache must never cost cargo weight');
        assert.equal(b.value, 0, 'a cache pays through its contents, not as ore');
      }
    }
    /* A whole planet dug out end to end holds a handful. A run touches a
       fraction of that, which is the point. */
    assert.ok(n >= 2, 'planet ' + p + ' has only ' + n + ' caches - most runs would never see one');
    assert.ok(n < cells * 0.012, 'planet ' + p + ' has ' + n + ' caches, which is terrain');
  }
});

test('what a cache holds is fixed by where it is, not by when you open it', () => {
  H.setWorld(0);
  const a = H.cachePrize(4, 61);
  const b = H.cachePrize(4, 61);
  assert.deepEqual(a, b, 'the same cache rolled differently twice');
  /* and it is not the same everywhere */
  const seen = new Set();
  for (let d = 20; d < 200; d += 3)
    for (let x = 0; x < H.W; x += 3) seen.add(JSON.stringify(H.cachePrize(x, d)));
  assert.ok(seen.size > 20, 'cache contents barely vary: only ' + seen.size + ' outcomes');
});

test('every cache prize is something the game can actually give you', () => {
  H.setWorld(0);
  const kinds = { supply: 0, mineral: 0, credits: 0 };
  for (let d = H.CACHE.min; d < 280; d++)
    for (let x = 0; x < H.W; x++) {
      const p = H.cachePrize(x, d);
      kinds[p.kind]++;
      if (p.kind === 'supply') {
        assert.ok(H.SUPPLY_OF[p.id], 'unknown supply in a cache: ' + p.id);
      } else if (p.kind === 'mineral') {
        const ore = H.DEF[p.id];
        assert.ok(ore && H.isOre(ore), 'unknown mineral in a cache: ' + p.id);
        assert.ok(ore.min <= d,
          'a cache at ' + d + ' m held ' + p.id + ', which only exists at ' + ore.min + ' m');
        assert.ok(p.n >= 3 && p.n <= 6, 'cache mineral count out of range: ' + p.n);
      } else {
        assert.ok(p.n > 0 && Number.isFinite(p.n), 'bad credit prize: ' + p.n);
      }
    }

  /* Supplies most often - a consumable you did not buy changes what the run
     can attempt, which is the most interesting thing to be handed. Money
     least, because money is what the game already pays constantly. */
  const total = kinds.supply + kinds.mineral + kinds.credits;
  assert.ok(kinds.supply / total > 0.45, 'supplies should be the common find');
  assert.ok(kinds.credits / total < 0.25, 'money should be the rare, dull find');
  assert.ok(kinds.mineral > 0 && kinds.credits > 0, 'every prize kind must be reachable');
});

test('a deep cache holds deeper minerals than a shallow one', () => {
  H.setWorld(0);
  const deepestAt = (d) => {
    let best = 0;
    for (let x = 0; x < H.W; x++) {
      const p = H.cachePrize(x, d);
      if (p.kind === 'mineral') best = Math.max(best, H.DEF[p.id].min);
    }
    return best;
  };
  assert.ok(deepestAt(160) > deepestAt(30),
    'depth should change what a cache is worth, or every cache is the same cache');
});
