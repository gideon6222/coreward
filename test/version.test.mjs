/* The version, and the changelog that has to agree with it.

   `POLISH.md` asks for a version that agrees everywhere and is asserted by a
   test. On the Godot side that is four places including two export presets;
   here there are two - the `VERSION` constant the pause screen prints, and the
   newest changelog entry - and they are in the same file, which is exactly why
   they drift: a release adds an entry at the top and forgets the constant
   three lines above it, and the pause screen then reports the previous
   version for ever.

   Nothing else in the suite would notice. The build stamp answers "did my
   update land"; it cannot answer "which version is this". */

import test from 'node:test';
import assert from 'node:assert/strict';
/* Its own bundle, not the golden harness's: `pure-entry.ts` is the sim and
   nothing else, and `sim-boundary.test.mjs` is what keeps it that way. The
   changelog is player-facing data with no imports, so it bundles alone. */
import { loadModule } from './harness.mjs';

const H = await loadModule('src/changelog.ts');

const parse = (v) => v.split('.').map(Number);

test('the printed version is the newest changelog entry', () => {
  assert.ok(H.CHANGELOG.length > 0, 'the changelog is empty');
  assert.equal(H.VERSION, H.CHANGELOG[0].version,
    'the pause screen prints v' + H.VERSION + ' and the newest changelog entry is v' +
    H.CHANGELOG[0].version + ' - a release added an entry and left the constant behind');
});

test('every version is well formed and strictly newer than the one under it', () => {
  /* Strictly newer, not merely different: the list is what the player reads
     top to bottom, and two entries that share a version, or a version that
     goes backwards, is a history nobody can follow. */
  let prev = null;
  for (const r of H.CHANGELOG) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/, 'v' + r.version + ' is not major.minor.patch');
    const v = parse(r.version);
    if (prev) {
      /* Walking newest to oldest, so each entry must be strictly OLDER than
         the one above it. Written the other way round first, and the failure
         message it printed - "v0.35.0 is listed under v0.35.1 but is not
         older than it" - is what said so: a message that can be read back
         against the data is worth more than the assertion beside it. */
      const older = v[0] < prev[0] ||
        (v[0] === prev[0] && v[1] < prev[1]) ||
        (v[0] === prev[0] && v[1] === prev[1] && v[2] < prev[2]);
      assert.ok(older, 'v' + r.version + ' is listed under v' + prev.join('.') +
        ' but is not older than it');
    }
    prev = v;
  }
});

test('every entry carries a date, a title and notes a player could read', () => {
  for (const r of H.CHANGELOG) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, 'v' + r.version + ' has date "' + r.date + '"');
    assert.ok(r.title && r.title.length > 2, 'v' + r.version + ' has no title');
    assert.ok(Array.isArray(r.notes) && r.notes.length > 0, 'v' + r.version + ' has no notes');
    for (const n of r.notes) {
      assert.ok(n.length > 10, 'v' + r.version + ' has a note too short to say anything: "' + n + '"');
      /* The changelog is the one player-facing file most likely to carry a
         symbol identifier by accident, because it is written next to the
         code that changed. */
      assert.ok(!/[a-zA-Z]\.(ts|js|mjs)\b/.test(n),
        'v' + r.version + ' names a source file at the player: "' + n.slice(0, 60) + '"');
    }
  }
});

test('the changelog is written in US English', () => {
  /* INDEX.md rule 15, and the doctor checks the repo - but the doctor runs
     over a checkout and this runs in the gate, before a push. The list is
     short on purpose: these are the words this game actually used. */
  const BRITISH = ['colour', 'colours', 'coloured', 'centre', 'centres', 'centred',
    'metre', 'metres', 'grey', 'realise', 'realised', 'recognise', 'organise',
    'travelling', 'travelled', 'licence', 'defence', 'analyse', 'summarise'];
  const all = H.CHANGELOG.map((r) => r.title + ' ' + r.notes.join(' ')).join(' ').toLowerCase();
  for (const w of BRITISH) {
    assert.ok(!new RegExp('\\b' + w + '\\b').test(all),
      'the changelog says "' + w + '" - INDEX.md rule 15 asks for US English everywhere he or a player reads');
  }
});
