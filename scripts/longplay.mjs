/* longplay.mjs - a whole campaign, driven through the real game.

   W10's brief is "a long play of the whole thing rather than of any one
   milestone", and the thing round eight built is a campaign: nine Anchors
   spread across a 61-by-452 world, a Ballast that drains while you work, ground
   that closes once the planet wakes, and an ending at the centre.

   None of that can be judged from a unit test, because every number in it is
   about how the pieces meet: whether the Ballast can actually be kept up while
   you are hunting, whether Unrest outruns the Anchors that push it back,
   whether the ground closing faster than you cut turns the second act into
   re-digging the first.

   So this drives the SHIPPING loop in a real browser, on the tick seam, and
   reports what the campaign looked like. It plays badly on purpose - it flies
   straight lines and does not think - so every number here is a floor rather
   than a forecast.

   Run:  node scripts/longplay.mjs            (needs the preview server up)
         node scripts/longplay.mjs --anchors 9 --minutes 90                */

import { chromium } from '@playwright/test';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const WANT = arg('anchors', 9);
const BUDGET = arg('minutes', 120) * 60;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({
  viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true
});
await page.goto('http://127.0.0.1:4319/?debug');
await page.waitForTimeout(2500);
for (const id of ['#introSkip', '#btnNew', '#btnPlay']) {
  const el = await page.$(id);
  if (el) { await el.dispatchEvent('click'); await page.waitForTimeout(400); }
}
await page.waitForFunction(() => window.__cw && window.__cw.g.mode === 'play', null, { timeout: 30000 });

/* Hold a direction for `secs` of GAME time, dismissing any card that comes up
   - a modal stops the loop, and a probe that does not press the button sits
   there for the rest of the budget looking like a hang. */
/* Two game-seconds a round trip. One was the bottleneck: a 150-minute campaign
   is nine thousand of them, and a browser round trip is milliseconds the game
   does not spend. Two still lands well inside a cell at top speed, so nothing
   is skipped over. */
const SLICE = 2;

async function hold(dir, secs) {
  const key = page.locator(`#dpad .k[data-dir=${dir}]`);
  await key.dispatchEvent('pointerdown');
  for (let i = 0; i < secs; i += SLICE) {
    const busy = await page.evaluate((n) => {
      const w = window.__cw;
      for (let k = 0; k < n; k++) w.advance(1);
      return w.g.mode !== 'play';
    }, SLICE);
    if (busy) {
      await key.dispatchEvent('pointerup');
      const btn = await page.$('#evBtn');
      if (btn) await btn.dispatchEvent('click');
      await page.waitForTimeout(30);
      await key.dispatchEvent('pointerdown');
    }
  }
  await key.dispatchEvent('pointerup');
  await page.waitForTimeout(20);
}

const read = () => page.evaluate(() => {
  const w = window.__cw;
  return {
    t: Math.round(w.g.log.secs || 0),
    px: Math.round(w.g.px), pd: Math.round(w.g.pd),
    credits: Math.round(w.g.credits),
    lit: w.g.ground.lit.length,
    ballast: +w.g.ground.ballast.toFixed(2),
    unrest: +w.worldUnrest().toFixed(3),
    peak: +Math.max(...w.g.ground.unrest).toFixed(2),
    collapsed: w.g.ground.collapsed.length,
    woke: w.g.ground.woke, won: w.g.won,
    dug: w.g.dug.size, seen: w.g.seen.length,
    deepest: w.g.best.depth
  };
});

/* Keep the rig climbing. A probe that never buys anything is measuring a game
   nobody plays - and the shop is a 3D room, so it is driven through the same
   pure helper the shop's own rows use rather than by tapping a case. */
async function shopUp() {
  await page.evaluate(() => {
    const w = window.__cw;
    for (let pass = 0; pass < 40; pass++) {
      let bought = false;
      for (const u of w.UPGRADES) {
        const lvl = w.g.up[u.key] || 0;
        if (lvl >= u.max) continue;
        if (!w.g.found.includes(u.key) && w.upgradeOf(u.key) &&
            ['magnet', 'bomb', 'survey', 'reactor', 'drone', 'auto', 'laser'].includes(u.key)) continue;
        const cost = w.costOf(u, lvl);
        if (w.g.credits < cost) continue;
        const mat = w.matCost(u, lvl);
        if (mat && (w.g.stock[mat.id] || 0) < mat.need) continue;
        w.g.credits -= cost;
        if (mat) w.g.stock[mat.id] -= mat.need;
        w.g.up[u.key] = lvl + 1;
        bought = true;
      }
      if (!bought) break;
    }
  });
}

/* Feed the Ballast whatever the vault holds, which is what a player who has
   read the panel once does every time they dock. */
async function feedBallast() {
  await page.evaluate(() => {
    const w = window.__cw;
    for (const o of w.ORES) {
      const have = w.g.stock[o.id] || 0;
      if (!have || w.g.ground.ballast > 0.92) continue;
      const each = w.feedValue(o.id);
      const n = Math.min(have, Math.max(1, Math.ceil((1 - w.g.ground.ballast) / each)));
      w.feed(w.g.ground, o.id, n);
      w.g.stock[o.id] -= n;
      if (w.g.stock[o.id] <= 0) delete w.g.stock[o.id];
    }
  });
}

/* One run: out to a target, down, back. The target is the next unlit Anchor,
   because that is what the campaign is - and the probe does not know where the
   halls are any better than a player does, it just flies at them. */
const log = [];
let runs = 0;
let lastLit = 0;
const marks = [];

while (true) {
  const s = await read();
  if (s.t > BUDGET || s.lit >= WANT || s.won) break;
  if (s.lit !== lastLit) {
    marks.push({ anchor: s.lit, run: runs, min: +(s.t / 60).toFixed(1), deepest: s.deepest });
    lastLit = s.lit;
  }

  /* Where to go: the shallowest Anchor still unlit that is not sealed unless
     the laser is aboard. */
  const target = await page.evaluate(() => {
    const w = window.__cw;
    let best = null, at = Infinity;
    for (let r = 0; r < w.ANCHOR_COUNT; r++) {
      if (w.g.ground.lit.includes(r)) continue;
      if (w.anchorSealed(r) && !w.g.found.includes('laser')) continue;
      const a = w.anchorAt(r);
      if (a.d < at) { at = a.d; best = { r, x: a.x, d: a.d }; }
    }
    /* Everything open is lit: go for a sealed one anyway, which is what a
       player without the laser ends up doing - and finds out. */
    if (!best) {
      for (let r = 0; r < w.ANCHOR_COUNT; r++) {
        if (w.g.ground.lit.includes(r)) continue;
        const a = w.anchorAt(r);
        if (a.d < at) { at = a.d; best = { r, x: a.x, d: a.d }; }
      }
    }
    return best;
  });
  if (!target) break;

  /* Out, down, and into it. Fuel is spent for real; the probe tops up only at
     the pad, like the game does. */
  const dx = await page.evaluate((tx) => tx - Math.round(window.__cw.g.px), target.x);
  if (dx !== 0) await hold(dx > 0 ? 'right' : 'left', Math.min(90, Math.abs(dx) * 2 + 4));
  await hold('down', 120);

  /* Home. The climb is the real one, through the tunnels that are there. */
  await hold('up', 160);
  const home = await page.evaluate(() => window.__cw.g.pd <= 0.5);
  if (!home) {
    /* Stranded or dead. Either way the game puts the ship back on the pad, so
       the probe lets it and counts the run. */
    await page.evaluate(() => {
      const w = window.__cw;
      if (w.g.mode !== 'play') { const b = document.getElementById('evBtn'); if (b) b.click(); }
    });
  }
  await shopUp();
  await feedBallast();
  runs++;
  const after = await read();
  const row = { run: runs, min: +(after.t / 60).toFixed(1), deepest: after.deepest,
                lit: after.lit, ballast: after.ballast, unrest: after.unrest,
                peak: after.peak, down: after.collapsed, dug: after.dug,
                seen: after.seen, credits: after.credits, woke: after.woke ? 'woke' : '' };
  log.push(row);
  /* Streamed rather than held to the end. A probe that prints nothing for
     twenty minutes is indistinguishable from a probe that has hung, and the
     first thing you want from a long play is to watch it. */
  console.log(JSON.stringify(row));
  if (runs > 400) break;
}

const end = await read();
console.log('\n=== the campaign, played badly and on purpose ===\n');
console.table(log.filter((_, i) => i % Math.max(1, Math.ceil(log.length / 30)) === 0));
console.log('\n=== when each Anchor lit ===');
console.table(marks);
console.log('\n=== where it ended ===');
console.log({ runs, minutes: +(end.t / 60).toFixed(1), ...end });

await browser.close();
