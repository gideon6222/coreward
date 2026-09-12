/* The wall around src/sim, asserted rather than remembered.

   INDEX.md standing rule 2: a pure simulation core with no renderer in it. It
   is what makes the golden tests, the headless tick seam and any future rewrite
   possible - test/pure-entry.ts bundles these modules under node, where there
   is no three.js, no DOM and no audio context, so the moment one of them
   reaches for a renderer the whole suite stops being able to run.

   That rule used to live in a comment at the top of pure-entry.ts, which is a
   note rather than a gate: a new import in an old module breaks it silently and
   the failure arrives as a confusing esbuild error days later. This test reads
   the files.

   What is deliberately ALLOWED:

   - `import type` from outside src/sim. Types are erased, and src/types.ts is
     type-only by construction for exactly this reason - see its header.
   - localStorage. What INDEX.md rule 2 excludes is the RENDERER, not the disk,
     so persistence may sit inside the wall. There is NO studio convention about
     which side it sits on - the Godot games differ (gravewell keeps save.gd in
     src/sim, stillwater keeps its writes in main.gd) and rule 2 permits both.
     What rule 2 does require is that the disk is never the only way to test a
     save: serialisation is a pure state/object pair round-tripped by a test
     that touches no storage, with the storage call a thin wrapper over it.
   - Math.random, but only where it is an injectable default (see below). */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from './harness.mjs';

const SIM = join(REPO, 'src', 'sim');
const FILES = readdirSync(SIM).filter((f) => f.endsWith('.ts'));

/* Comments first, then string and template literals. In that order, because an
   apostrophe inside a comment ("the cell's own coordinates") would otherwise
   open a string that never closes and swallow the rest of the file. */
function strip(src) {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return {
    noComments,
    code: noComments.replace(/'(?:[^'\\]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``')
  };
}

/* Globals that only exist because something is being drawn, heard or clicked.
   localStorage is not here on purpose; see the header. */
const RENDERER_GLOBALS = [
  'document', 'window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame',
  'HTMLElement', 'HTMLCanvasElement', 'CanvasRenderingContext2D', 'AudioContext',
  'webkitAudioContext', 'Image', 'PointerEvent', 'KeyboardEvent', 'TouchEvent',
  'getComputedStyle', 'matchMedia'
];

assert.ok(FILES.length >= 12, 'src/sim looks empty - did the pure modules move?');

test('no module in src/sim imports three.js', () => {
  for (const f of FILES) {
    const { noComments } = strip(readFileSync(join(SIM, f), 'utf8'));
    assert.ok(
      !/from\s+['"]three['"]|require\(\s*['"]three['"]/.test(noComments),
      `src/sim/${f} imports three.js. The simulation cannot depend on a renderer.`
    );
  }
});

test('src/sim reaches outside itself only for types', () => {
  for (const f of FILES) {
    const { noComments } = strip(readFileSync(join(SIM, f), 'utf8'));
    /* Anchored per statement and stopped at the semicolon: a lazy match that
       may cross statements starts at one import and finishes at the next one's
       path, reporting the wrong line and the wrong verdict. */
    const outward = [...noComments.matchAll(/^[ \t]*import\s+([^;]*?)\s+from\s+['"](\.\.\/[^'"]+)['"]/gm)];
    for (const m of outward) {
      assert.ok(
        m[1].trimStart().startsWith('type'),
        `src/sim/${f} imports ${m[2]} at runtime. Only \`import type\` may cross out of src/sim.`
      );
    }
  }
});

test('src/sim never touches a renderer, a document or an input event', () => {
  for (const f of FILES) {
    const { code } = strip(readFileSync(join(SIM, f), 'utf8'));
    for (const g of RENDERER_GLOBALS) {
      assert.ok(
        !new RegExp(`(^|[^.\\w])${g}\\b`).test(code),
        `src/sim/${f} uses ${g}. That belongs in the presentation layer.`
      );
    }
  }
});

/* Math.random is allowed only as a default parameter, which is the shape that
   lets a test inject a seeded stream. A bare call inside a function body is a
   roll nothing can reproduce, and world generation here is a pure seeded hash
   precisely so that it can be.

   This currently passes with one such default, planCollapse() in world.ts, and
   the SHIPPING game takes that default - the tremor collapse is the one thing
   in Coreward a replay cannot reproduce. That is recorded in PLAN.md as work,
   not blessed here. */
test('src/sim rolls no dice except through an injectable default', () => {
  for (const f of FILES) {
    const { code } = strip(readFileSync(join(SIM, f), 'utf8'));
    /* The allowance is the exact injectable-RNG signature, `rand: () => number
       = Math.random`, and nothing looser. "Preceded by an equals sign" was
       tried first and passes `const roll = Math.random()`, which is the bug
       this test exists to catch - it was written that way, verified by
       injection, and caught doing nothing. */
    const bare = [...code.matchAll(/Math\.random/g)].filter((m) => {
      const before = code.slice(Math.max(0, m.index - 60), m.index);
      return !/=>\s*number\s*=\s*$/.test(before);
    });
    assert.equal(bare.length, 0, `src/sim/${f} calls Math.random outside a default parameter.`);
  }
});

/* pure-entry.ts is what the goldens bundle. If a module it names ever lives
   outside src/sim again, the wall above stops covering the thing under test. */
test('everything the golden harness bundles comes from src/sim', () => {
  const entry = readFileSync(join(REPO, 'test', 'pure-entry.ts'), 'utf8');
  const paths = [...strip(entry).noComments.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(paths.length >= 12, 'pure-entry.ts exported nothing - the regex missed');
  for (const p of paths) {
    assert.ok(p.startsWith('../src/sim/'), `pure-entry.ts pulls ${p} from outside src/sim.`);
  }
});
