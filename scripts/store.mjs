/* The Play listing images for The Lattice, rendered from the built game.

   The Godot games do this with `scripts\store.ps1`, which drives their
   `Main.dev_seek` through `scripts\shot.gd`. This game is a web game and has
   neither, but it has the same seam under a different name: `window.__cw`, the
   debug handle `scripts/filmstrip.mjs` already drives. So this is filmstrip's
   driver with three differences.

   IT SHOOTS AT 1080x1920, not at the 375x812 the e2e and the contact sheet use.
   Play takes a phone screenshot between 320 and 3840 on a side and at most 2:1,
   and the phone's own 1080x2340 is 2.167:1 and is REJECTED. 1080x1920 is 16:9
   and is what every Godot game here ships, so the listing is consistent across
   the seven apps.

   IT TAKES ONE FRAME PER STATE rather than a sequence. A contact sheet is about
   motion; a listing is four still pictures a stranger reads in a second.

   AND IT CHECKS WHAT IT WROTE. Every image is measured against Play's limits
   before this exits, and the screenshots are measured against each other: four
   identical frames means the setup never took effect, which is exactly how the
   Godot pipeline shipped four blank rectangles before its own check was added.
   A size that is legal proves nothing about whether the game is in the picture.

   Usage:
     npm run build && node scripts/store.mjs

   Everything lands in store/listing/en-US/images/. Commit it. The dashboard's
   store lane sends that folder to Play, and only when autoListing is on. */

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'store', 'listing', 'en-US', 'images');
const SHOTS = join(OUT, 'phoneScreenshots');
/* Its own port, for the reason playwright.config.ts gives at length: several
   games build on this machine at once and a Vite default port is not this
   game's. */
const PORT = 4321;
const W = 1080;
const H = 1920;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

/* The four moments worth putting in front of a stranger. Each `setup` runs on
   the same `window.__cw` handle filmstrip uses, so this file cannot reach a
   state the game cannot actually be in. */
const STATES = [
  {
    name: 'title',
    what: 'the hall in the dark, the Anchor lit',
    setup: `
      localStorage.setItem('coreward.v2', JSON.stringify({ credits: 5000, best: { depth: 140, haul: 900 }, dug: [], up: {} }));
      __cw.g.pd = -1; __cw.g.best.depth = 140;
      __cw.showTitle();
      __cw.advance(1.2);
    `
  },
  {
    name: 'descent',
    what: 'under way, the first cuts into the rock',
    enter: true,
    /* **`advance` alone does not descend.** The ship digs because a control is
       HELD, so a state that only advances time is a picture of a ship sitting
       on the surface - which is exactly what the first run of this file
       produced, four frames all reading DEPTH 0 m. `R.held` is the same seam
       filmstrip's dig and firstminute scenes drive. */
    setup: `
      __cw.R.held = 'down';
      for (let i = 0; i < 12; i++) __cw.advance(0.5);
    `,
    assert: `__cw.g.pd > 2`
  },
  {
    name: 'deep',
    what: 'deep, with the shaft cut behind',
    enter: true,
    /* A shaft already cut, the way the dig scene sets one up, so the picture is
       of a run that has been going rather than of the first few meters. */
    setup: `
      const dug = [];
      for (let d = 0; d <= 40; d++) dug.push('6,' + d);
      for (let x = 2; x <= 10; x++) dug.push(x + ',28');
      __cw.g.dug = new Set(dug);
      __cw.g.px = 6; __cw.g.pd = 26;
      __cw.R.held = 'down';
      for (let i = 0; i < 10; i++) __cw.advance(0.4);
    `,
    assert: `__cw.g.pd > 20`
  },
  {
    name: 'shop',
    what: 'the between-runs shop, spending a haul',
    /* Reached the way filmstrip's own shop scene reaches it: through the
       button, with stock in the hold, rather than through a handle that does
       not exist. `__cw` exposes no showShop. */
    enter: true,
    setup: `
      __cw.g.credits = 9e6; __cw.g.best.depth = 300;
      for (const k of ['iron','copper','silver','gold','amethyst','emerald','ruby']) __cw.g.stock[k] = 99;
      __cw.g.px = 6; __cw.g.pd = -1;
      __cw.advance(0.5);
      document.getElementById('btnShop').click();
      __cw.advance(0.6);
    `
  }
];

function serve() {
  return new Promise((ok) => {
    const s = createServer(async (req, res) => {
      const url = (req.url || '/').split('?')[0];
      const file = join(DIST, url === '/' ? 'index.html' : url);
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
        res.end(body);
      } catch {
        res.writeHead(404).end('not found');
      }
    });
    s.listen(PORT, () => ok(s));
  });
}

/* PNG IHDR. Written out rather than pulled in, because this repo keeps its
   dependency list short on purpose and one header read is not worth a package.
   Read each byte as a NUMBER before shifting - the same trap that had the
   studio dashboard reading a 1080x1920 screenshot as 56x128. */
async function pngSize(path) {
  const b = await readFile(path);
  if (b.length < 26 || b[0] !== 0x89 || b[1] !== 0x50) return null;
  const w = (b[16] << 24) + (b[17] << 16) + (b[18] << 8) + b[19];
  const h = (b[20] << 24) + (b[21] << 16) + (b[22] << 8) + b[23];
  return { w, h };
}

if (!existsSync(DIST)) {
  console.error('there is no dist/ to photograph. Run `npm run build` first.');
  process.exit(1);
}

await mkdir(SHOTS, { recursive: true });

const server = await serve();
const browser = await chromium.launch({
  /* Headless Chrome has no GPU, so WebGL comes from SwiftShader - the same
     arguments playwright.config.ts passes, and for the same reason. */
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});

const problems = [];
const written = [];

try {
  for (const [i, state] of STATES.entries()) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, hasTouch: true });
    page.on('console', (m) => { if (m.type() === 'error') problems.push(state.name + ': ' + m.text()); });
    page.on('pageerror', (e) => problems.push(state.name + ': UNCAUGHT: ' + e.message));

    await page.goto('http://127.0.0.1:' + PORT + '/?debug');
    await page.waitForFunction(() => !!window.__cw, null, { timeout: 20_000 });
    await page.waitForFunction(
      () => document.getElementById('boot').classList.contains('hidden'), null, { timeout: 20_000 });

    /* A state about PLAY has to cross the way in first, the same way the e2e
       does: skipping it with a flag would make the one screen every player
       sees the one screen nothing exercises. */
    if (state.enter) {
      await page.evaluate(() => {
        const skip = document.getElementById('introSkip');
        if (skip && !document.getElementById('intro').classList.contains('hidden')) skip.click();
        const cont = document.getElementById('btnContinue');
        if (cont && !document.getElementById('title').classList.contains('hidden')) {
          (cont.disabled ? document.getElementById('btnNewGame') : cont).click();
        }
      });
      await page.evaluate(() => window.__cw.advance(8));
      await page.waitForFunction(() => window.__cw.g.mode === 'play', null, { timeout: 15_000 });
    }

    await page.evaluate(state.setup);

    /* **Assert the STATE, not the picture.** Two screenshots of this game are
       never byte-identical - the stars twinkle and the lamp flickers - so a
       pixel comparison cannot tell "deep" from "the surface". Each state says
       in the game's own terms what it means to have arrived, and a state that
       did not arrive is a listing image of the wrong thing. */
    if (state.assert) {
      const got = await page.evaluate(state.assert);
      if (!got) {
        const pd = await page.evaluate(() => window.__cw.g.pd);
        throw new Error(
          `state '${state.name}' never arrived: ${state.assert} was false (depth ${pd})`);
      }
    }

    /* A real frame has to be painted after the state moves, or every capture is
       the frame before it. */
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const file = join(SHOTS, (i + 1) + '-' + state.name + '.png');
    await page.screenshot({ path: file });
    written.push(file);
    console.log('screenshot %d  %d-%s.png  (%s)', i + 1, i + 1, state.name, state.what);
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}

/* The icon. public/icon-512.png is already exactly what Play asks for, so this
   copies rather than re-rendering and risking a different picture in the store
   than on the home screen. */
const iconSrc = join(ROOT, 'public', 'icon-512.png');
await copyFile(iconSrc, join(OUT, 'icon.png'));
console.log('icon             icon.png (from public/icon-512.png)');

/* The feature graphic, cut from one screenshot with the wordmark on the empty
   side - the same shape store.ps1 builds for the Godot games, through the same
   ffmpeg. */
const featureSrc = join(SHOTS, '3-deep.png');
const feature = join(OUT, 'featureGraphic.png');
const font = 'C\\:/Windows/Fonts/arial.ttf';
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', featureSrc,
  '-vf', `crop=1010:493:35:980,scale=1024:500,drawtext=fontfile='${font}':text='The Lattice':fontcolor=white:fontsize=88:borderw=6:bordercolor=0x000000aa:x=56:y=h-text_h-46`,
  '-pix_fmt', 'rgb24', feature], { stdio: 'inherit' });
console.log('feature graphic  featureGraphic.png');

/* Everything Play measures, plus the one thing it cannot: whether the game is
   actually in the picture. */
let bad = 0;
const digests = new Map();
for (const f of [join(OUT, 'icon.png'), feature, ...written]) {
  const sz = await pngSize(f);
  const name = f.split(/[\\/]/).pop();
  if (!sz) { console.log('  %s  NOT A PNG', name); bad++; continue; }
  let ok;
  if (name === 'icon.png') ok = sz.w === 512 && sz.h === 512;
  else if (name === 'featureGraphic.png') ok = sz.w === 1024 && sz.h === 500;
  else {
    const ratio = Math.max(sz.w, sz.h) / Math.max(1, Math.min(sz.w, sz.h));
    ok = sz.w >= 320 && sz.h >= 320 && sz.w <= 3840 && sz.h <= 3840 && ratio <= 2.0;
  }
  console.log('  %s %sx%s  %s', name.padEnd(24), sz.w, sz.h, ok ? 'ok' : 'REJECTED BY PLAY');
  if (!ok) bad++;
}

/* Two screenshots byte-for-byte equal mean a setup never took effect. The Godot
   pipeline shipped four identical blank frames past a check that only measured
   their size, which is what this exists to stop happening here. */
for (const f of written) {
  const hash = (await readFile(f)).toString('base64');
  const name = f.split(/[\\/]/).pop();
  if (digests.has(hash)) {
    console.error('  %s is pixel-for-pixel %s - its setup never took effect', name, digests.get(hash));
    bad++;
  } else digests.set(hash, name);
}

if (problems.length) {
  console.log('\nthe page complained:');
  for (const p of problems.slice(0, 10)) console.log('  ' + p);
}

if (bad) {
  console.error('\n%d image(s) are not fit to send to Play', bad);
  process.exit(1);
}
console.log('\nstore images in store/listing/en-US/images - commit them');
