/* Golden-test harness.

   Before the module split this read src/app.ts, sliced it at a section banner
   and evaluated the pure prelude with `new Function`. That worked while the
   game was one file, but it parses the slice as plain JavaScript, so the first
   type annotation would have turned the whole suite into a SyntaxError.

   Now it bundles test/pure-entry.ts with esbuild and imports the result. The
   tests still run against real shipping code — the same modules the game
   imports, through the same import graph — and it survives Phase 5 adding
   annotations and strict mode. */

import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..');

let cached = null;

/* Async because bundling is. Test files use top-level await, which node's ESM
   test runner supports. */
export async function loadPure() {
  if (cached) return cached;
  const outdir = mkdtempSync(join(tmpdir(), 'coreward-pure-'));
  const outfile = join(outdir, 'pure.mjs');
  await build({
    entryPoints: [join(HERE, 'pure-entry.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent'
  });
  cached = await import(pathToFileURL(outfile).href);
  if (typeof cached.blockAt !== 'function') throw new Error('harness: blockAt missing from the bundle');
  if (typeof cached.findRoute !== 'function') throw new Error('harness: findRoute missing from the bundle');
  if (typeof cached.g !== 'object') throw new Error('harness: game state missing from the bundle');
  return cached;
}

/* JSON.stringify turns Infinity into null, which would silently drop bedrock's
   hard value and let a wrong snapshot compare equal to itself. Encode
   non-finite numbers explicitly instead. */
export function ser(value) {
  return JSON.stringify(value, (k, v) => {
    if (typeof v === 'number') {
      if (v === Infinity) return '__Infinity__';
      if (v === -Infinity) return '__-Infinity__';
      if (Number.isNaN(v)) return '__NaN__';
    }
    return v;
  }, 2);
}

/* git core.autocrlf rewrites these baselines to CRLF on checkout, while this
   harness writes LF. Compare line-ending-agnostically or every golden test
   breaks on a fresh clone and in CI. */
const norm = (s) => s.split(String.fromCharCode(13)).join('');

function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n');
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      const trim = (s) => (s === undefined ? '<missing>' : s.length > 220 ? s.slice(0, 220) + '...' : s);
      return 'line ' + (i + 1) + '\n  baseline: ' + trim(la[i]) + '\n  actual:   ' + trim(lb[i]);
    }
  }
  return 'files differ only in trailing content';
}

/* Golden file compare. Writes the baseline on first run and says so. */
export function assertGolden(name, actual) {
  const path = join(HERE, 'baseline', name + '.json');
  const text = ser(actual);
  if (!existsSync(path)) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, 'utf8');
    console.log('  baseline CREATED: test/baseline/' + name + '.json');
    return;
  }
  const expected = norm(readFileSync(path, 'utf8'));
  if (expected !== norm(text)) {
    throw new Error(
      'golden mismatch: ' + name + '\n' + firstDiff(expected, norm(text)) +
      '\n\nIf this change is intentional, delete test/baseline/' + name +
      '.json and re-run to re-record.'
    );
  }
}
