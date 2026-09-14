/* One tween, called everywhere.

   Round ten's completeness research put this second on its ranked list of what
   a shipped game has and a competent hobby build does not: *"A hobby build has
   three different fades; a shipped game has one tween function called
   everywhere."* It is a consistency claim, so it cannot be judged from any one
   screen - only by reading every declaration at once, which is exactly what a
   test can do and an eye cannot.

   Before this test, `index.html` held NINE durations (.06 .12 .2 .25 .3 .35
   .38 .4 .5) and four curve treatments (the default, `linear`, `ease` and
   `ease-out`). None of that was a decision: each one was chosen in the round
   that added its element, and the set was never looked at.

   What is asserted is the SCATTER, not the numbers. Retuning `--t-base` is a
   design choice and this test must not stand in its way; adding a fourteenth
   bespoke duration is the drift it exists to catch.

   `animation:` is deliberately not covered. A keyframed pulse (fuel low, heat
   soaking, the weight arc) is a loop whose period carries meaning about the
   thing pulsing, not a transition between two states, and forcing those onto
   the same clock would say something false. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');

const decls = html.match(/transition:[^;]*/g) || [];
/* With the `var(--...)` references removed, so that a token NAMED for a curve
   or a speed is not mistaken for a hard-coded one: `var(--ease)` contains the
   word "ease" and is the correct answer, not the drift. */
const bare = (d) => d.replace(/var\(--[a-z-]+\)/g, '');

test('the stylesheet has transitions at all, so this test is not vacuous', () => {
  /* A construct that cannot fail is untested, not safe. If a refactor moves
     the CSS out of index.html, everything below would pass by inspecting
     nothing, and this is the line that says so. */
  assert.ok(decls.length >= 10,
    `found only ${decls.length} transition declarations in index.html, so the checks below ` +
    'inspected almost nothing. If the CSS moved to its own file, point this test at it.');
});

test('every transition uses a duration token, never a bespoke number', () => {
  const raw = decls.filter((d) => /[0-9]*\.?[0-9]+m?s/.test(bare(d)));
  assert.deepEqual(raw, [],
    'these transitions carry their own duration instead of one of --t-press, --t-fast, ' +
    '--t-base or --t-slow:\n  ' + raw.join('\n  '));
});

test('every transition uses the one curve', () => {
  const other = decls.filter((d) => /\b(linear|ease-in-out|ease-in|ease-out|ease|cubic-bezier|steps)\b/.test(bare(d)));
  assert.deepEqual(other, [],
    'these transitions name a curve of their own instead of var(--ease):\n  ' + other.join('\n  '));
});

test('the tokens themselves are defined once, and in the right order', () => {
  const val = (name) => {
    const m = html.match(new RegExp('--' + name + ':\s*([0-9.]+)s'));
    assert.ok(m, `--${name} is used by the transitions above but defined nowhere`);
    return parseFloat(m[1]);
  };
  const press = val('t-press'), fast = val('t-fast'), base = val('t-base'), slow = val('t-slow');
  assert.ok(press < fast && fast < base && base < slow,
    `the four speeds are not ordered: press ${press}, fast ${fast}, base ${base}, slow ${slow}`);
  /* The press is a control answering a thumb rather than an animation. Past
     about 80 ms it stops reading as connected to the finger, which is the one
     number here with a perceptual floor under it rather than a taste. */
  assert.ok(press <= 0.08,
    `--t-press is ${press}s; past about 0.08s a key stops feeling attached to the thumb`);
  assert.ok(/--ease:\s*cubic-bezier/.test(html), '--ease is not defined as a curve');
});
