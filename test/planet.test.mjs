/* What makes one world different from another.

   The traits were always there and always did something to generation. What
   was missing is that they were invisible: every planet in the game drew the
   same grey rock in the same fog, so a trait was a number in a blurb rather
   than a place you could recognise. These are the assertions that keep a
   palette from quietly collapsing back into one look. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPure } from './harness.mjs';

const H = await loadPure();

/* Perceptual-ish distance between two packed colours. Not a real colour space
   - the point is only to catch two worlds that are the same world. */
function apart(a, b) {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

test('every planet has a palette, however long the run goes on', () => {
  /* The names cycle with a numeric suffix past twelve, and the palette has to
     cycle with them rather than running off the end of the array into
     undefined - which would not throw, it would draw black. */
  for (const p of [0, 1, 5, 11, 12, 13, 47, 200]) {
    const pal = H.paletteOf(p);
    assert.ok(pal && typeof pal.rock === 'number', `planet ${p} has no palette`);
    for (const k of ['rock', 'fog', 'haze', 'dust', 'para']) {
      assert.ok(pal[k] >= 0 && pal[k] <= 0xffffff, `planet ${p} ${k} is not a colour`);
    }
    assert.ok(pal.mix >= 0 && pal.mix <= 1, `planet ${p} mix is out of range`);
  }
  assert.deepEqual(H.paletteOf(0), H.paletteOf(12), 'the palette must cycle with the names');
});

test('no two worlds in a cycle look the same', () => {
  /* The failure this catches is a palette added by copying its neighbour and
     changing one field. Twelve worlds that are all "grey with a tint" is the
     thing this whole system exists to stop, and it is easy to arrive at one
     entry at a time. */
  const seen = [];
  for (let p = 0; p < 12; p++) seen.push(H.paletteOf(p));
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      const d = apart(seen[i].rock, seen[j].rock);
      assert.ok(d > 40,
        `planets ${i} and ${j} have rock only ${d.toFixed(0)} apart - they will read as the same world`);
    }
  }
});

test('a palette tints the rock without swallowing it', () => {
  /* Rock still has to look like rock. At mix 1.0 every band on the planet
     would be one flat colour and the shallow/deep boundary - which is a real
     signal the player reads for depth - would be gone. */
  for (let p = 0; p < 12; p++) {
    const pal = H.paletteOf(p);
    assert.ok(pal.mix <= 0.45,
      `planet ${p} tints rock ${Math.round(pal.mix * 100)}% - the rock bands stop being distinguishable`);
  }

  /* And the bands must survive the tint: two rocks that differ before it must
     still differ after it, on every world. */
  const bands = H.ROCKS.map((r) => r.color);
  for (let p = 0; p < 12; p++) {
    const pal = H.paletteOf(p);
    const tinted = bands.map((c) => H.mixHex(c, pal.rock, pal.mix));
    for (let i = 0; i < tinted.length; i++) {
      for (let j = i + 1; j < tinted.length; j++) {
        if (apart(bands[i], bands[j]) < 25) continue;   /* already alike untinted */
        assert.ok(apart(tinted[i], tinted[j]) > 12,
          `on planet ${p}, rock bands ${H.ROCKS[i].id} and ${H.ROCKS[j].id} collapse into one colour`);
      }
    }
  }
});

test('Verdax is the least tinted world', () => {
  /* It is the world the game teaches you on, and everything after it should
     read as a departure from it. If a later palette is more neutral than the
     first, the game opens somewhere strange and settles somewhere plain -
     which is backwards. */
  const first = H.paletteOf(0);
  for (let p = 1; p < 12; p++) {
    assert.ok(H.paletteOf(p).mix > first.mix,
      `planet ${p} is tinted less than Verdax, so the opening world is not the baseline`);
  }
});

test('every world has a ground of its own, not just a tint', () => {
  /* Playtest: *"I want the actual dirt and rocks to change color and texture
     with each planet."* A tint is one channel, and one channel is why twelve
     worlds all read as the same stone under a different light. These are the
     other three: how rough the surface is, how hard the relief bites, and what
     grows on it. */
  for (let p = 0; p < 12; p++) {
    const pal = H.paletteOf(p);
    assert.ok(pal.rough > 0.4 && pal.rough < 1.6, `planet ${p} roughness ${pal.rough} is off the scale`);
    assert.ok(pal.bump > 0.5 && pal.bump < 1.8, `planet ${p} relief ${pal.bump} is off the scale`);
    assert.ok(H.GROWTH_BAND[pal.growth], `planet ${p} has an unknown growth "${pal.growth}"`);
  }

  /* The surfaces have to actually DIFFER, or the channel is decoration. */
  const roughs = new Set([...Array(12).keys()].map((p) => H.paletteOf(p).rough));
  assert.ok(roughs.size >= 6, `only ${roughs.size} distinct roughnesses across twelve worlds`);
});

test('the growths he asked for all exist, and no two neighbours share one', () => {
  /* *"add additional details like moss patches, frost, plants, oil."* All four
     are named, so all four have to be somewhere - a list of ideas where one
     silently never got used is the easiest thing to ship. */
  const used = [...Array(12).keys()].map((p) => H.paletteOf(p).growth);
  for (const want of ['moss', 'frost', 'plant', 'oil']) {
    assert.ok(used.includes(want), `nothing in the game has "${want}" on it`);
  }

  /* Six kinds over twelve worlds means they repeat; consecutive worlds sharing
     one would mean two crossings in a row landing somewhere that looks the
     same, which is the thing the whole system exists to prevent. */
  for (let p = 0; p < 12; p++) {
    const a = H.paletteOf(p).growth;
    const b = H.paletteOf((p + 1) % 12).growth;
    assert.notEqual(a, b, `planets ${p} and ${(p + 1) % 12} both grow "${a}"`);
  }
});

test('growth sits in a band that means something', () => {
  /* A growth that covers every depth equally is wallpaper. Moss and plants
     want the damp near the surface; oil seeps from deep; frost does not care.
     What is asserted is that they are not all the same, and that each is
     actually reachable. */
  const bands = Object.entries(H.GROWTH_BAND).filter(([k]) => k !== 'none');
  for (const [kind, b] of bands) {
    assert.ok(b.to > b.from, `"${kind}" has an empty band`);
    assert.ok(b.chance > 0 && b.chance < 0.5,
      `"${kind}" appears on ${Math.round(b.chance * 100)}% of rock - that is a texture, not a detail`);
    assert.ok(b.from < 60, `"${kind}" starts at ${b.from} m, which most runs never reach`);
  }
  const shallow = bands.filter(([, b]) => b.to < 200).length;
  assert.ok(shallow >= 2, 'nothing is limited to the shallows, so depth means nothing to growth');
  assert.ok(bands.some(([, b]) => b.from > 20), 'nothing is limited to the deep');
});
