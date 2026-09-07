/* Bundle size guard.

   The module split once dropped requestAnimationFrame(frame) from the entry
   point. Every golden test passed, the typecheck was clean, the build
   succeeded, and the game was frozen. The only signal was the bundle getting
   7463 bytes smaller, because everything reachable solely from the frame loop
   had been tree-shaken away as unreachable.

   It checks PER CHUNK, not just the total, and that is the whole point. In one
   combined 506 kB bundle that regression was a 1.57% drop, inside any sane
   tolerance. Against the 35 kB game chunk it is 21%, which nothing sensible
   lets through. Splitting three.js out is what makes this guard sharp.

   It fails in both directions. A shrink means code went missing. Growth means
   something got pulled in that should not have been - most often a value
   import of three.js reaching the pure layer, which must only `import type`.

     npm run size          check against the budget
     npm run size:update   re-record it deliberately, then commit it
*/

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const DIST = join(REPO, 'dist', 'assets');
const BUDGET = join(REPO, 'bundle-budget.json');

/* The game chunk is small and volatile: a real edit moves it a few percent, and
   losing a whole subsystem moves it far more. The vendor chunk is pinned to an
   exact three.js version and should not move at all unless that version does. */
const DEFAULT_TOLERANCE = { index: 12, three: 1 };

const update = process.argv.includes('--update');

if (!existsSync(DIST)) {
  console.error('no dist/assets - run `npm run build` first');
  process.exit(1);
}

/* Content hashes change every build; the budget tracks chunk identity, not
   filenames. Sourcemaps are not precached and vary with tooling, so they are
   not part of the budget. */
const chunks = readdirSync(DIST)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({
    name: f.replace(/-[A-Za-z0-9_-]{8,}\.js$/, ''),
    bytes: readFileSync(join(DIST, f)).length
  }))
  .sort((a, b) => b.bytes - a.bytes);

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const total = chunks.reduce((n, c) => n + c.bytes, 0);

if (update) {
  const budget = {
    note: 'Regenerate with `npm run size:update` and commit. Both directions are checked; a shrink means code went missing.',
    chunks: chunks.map((c) => ({
      name: c.name,
      bytes: c.bytes,
      tolerancePercent: DEFAULT_TOLERANCE[c.name] ?? 10
    }))
  };
  writeFileSync(BUDGET, JSON.stringify(budget, null, 2) + '\n', 'utf8');
  console.log('recorded budget, total ' + kb(total));
  for (const c of budget.chunks) {
    console.log('  ' + c.name.padEnd(10) + kb(c.bytes).padStart(10) + '  +/-' + c.tolerancePercent + '%');
  }
  process.exit(0);
}

if (!existsSync(BUDGET)) {
  console.error('no bundle-budget.json - create it with `npm run size:update`');
  process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET, 'utf8'));
const expected = new Map(budget.chunks.map((c) => [c.name, c]));
const failures = [];

for (const c of chunks) {
  const want = expected.get(c.name);
  if (!want) {
    failures.push('new chunk "' + c.name + '" (' + kb(c.bytes) + ') is not in the budget');
    continue;
  }
  expected.delete(c.name);
  const drift = ((c.bytes - want.bytes) / want.bytes) * 100;
  const tol = want.tolerancePercent ?? 10;
  const ok = Math.abs(drift) <= tol;
  console.log(
    '  ' + c.name.padEnd(10) + kb(c.bytes).padStart(10) +
    '  budget ' + kb(want.bytes).padStart(10) +
    '  drift ' + (drift >= 0 ? '+' : '') + drift.toFixed(2) + '%' +
    '  (+/-' + tol + '%)  ' + (ok ? 'ok' : 'FAIL')
  );
  if (!ok) {
    failures.push(
      'chunk "' + c.name + '" ' + (drift < 0 ? 'SHRANK' : 'GREW') + ' by ' +
      Math.abs(drift).toFixed(2) + '%, budget allows ' + tol + '%'
    );
  }
}

for (const [name, want] of expected) {
  failures.push('chunk "' + name + '" (' + kb(want.bytes) + ') vanished from the build');
}

if (!failures.length) {
  console.log('total ' + kb(total) + ' - within budget');
  process.exit(0);
}

console.error('');
for (const f of failures) console.error('  ' + f);
console.error('');
console.error('A build that gets smaller for no reason has lost something. Check the');
console.error('entry point still reaches the frame loop before assuming better');
console.error('tree-shaking. A build that grew may have pulled three.js into the pure');
console.error('layer, which should only ever `import type`.');
console.error('');
console.error('If the change is intentional: npm run size:update, then commit the budget.');
process.exit(1);
