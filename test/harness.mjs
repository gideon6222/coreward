/* Phase 0 golden-test harness.
   Loads the pure prelude of app.js WITHOUT modifying it, by slicing the real
   source at the existing section banner and stripping the module imports.
   The tests therefore run against shipping code, not a copy of it.
   After the Vite/TS migration, replace loadPure() with real imports from
   src/config.ts + src/world.ts and keep every assertion unchanged. */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = join(HERE, '..');

const MARKER = '/* ============ three ============ */';

/* every binding the pure prelude defines that a test might want */
const NAMES = [
  'W', 'SAVE_KEY', 'OLD_KEY', 'HULL_MAX', 'DIG_BASE', 'START_X',
  'PLANET_NAMES', 'SKY_HI', 'SKY_LO', 'planetName', 'skyHi', 'skyLo',
  'coreDepth', 'hardMult', 'valueMult',
  'ORES', 'ROCKS', 'DEF', 'UPGRADES', 'costOf',
  'g', 'S', 'key', 'clamp', 'rnd', 'blockAt', 'haulValue', 'findRoute'
];

export function loadPure() {
  const src = readFileSync(join(REPO, 'src', 'app.js'), 'utf8');
  const cut = src.indexOf(MARKER);
  if (cut < 0) {
    throw new Error('harness: banner not found in src/app.js: ' + MARKER +
      '\nIf the banner moved or was renamed, update MARKER in test/harness.mjs.');
  }
  const prelude = src.slice(0, cut)
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l))
    .join('\n');
  if (/^\s*import\s/m.test(prelude)) throw new Error('harness: an import survived stripping');
  if (!/function blockAt/.test(prelude)) throw new Error('harness: slice is missing blockAt');
  if (!/function findRoute/.test(prelude)) throw new Error('harness: slice is missing findRoute');

  /* lerpHex is the only THREE user in the prelude and no test calls it,
     but stub THREE so nothing can throw at definition time */
  const THREE = {
    Color: class { constructor() {} lerp() { return this; } getHex() { return 0; } }
  };
  const body = prelude + '\n;return {' + NAMES.join(',') + '};';
  return new Function('THREE', body)(THREE);
}

/* JSON.stringify turns Infinity into null, which would silently drop
   bedrock's hard value and let a wrong snapshot compare equal to itself.
   Encode non-finite numbers explicitly instead. */
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
