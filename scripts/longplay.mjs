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

/* `stop` is an optional policy: it is asked between slices and ends the hold
   when it returns true. Everything the probe does about FUEL is in there, and
   without it the probe is not a bad player, it is a suicidal one - it dug down
   for two minutes flat every run, ran the tank dry, lost the hold, and banked
   nothing for eight runs while the Ballast drained on schedule.

   `CRAFT.md`: measure a progression by simulating PLAY. A policy that ignores
   the one warning the game shouts at you is not play. */
async function hold(dir, secs, stop) {
  const key = page.locator(`#dpad .k[data-dir=${dir}]`);
  await key.dispatchEvent('pointerdown');
  let done = false;
  for (let i = 0; i < secs && !done; i += SLICE) {
    const r = await page.evaluate((n) => {
      const w = window.__cw;
      for (let k = 0; k < n; k++) w.advance(1);
      return { busy: w.g.mode !== 'play', state: w.R.fuelState,
               px: w.g.px, pd: w.g.pd,
               weight: w.g.weight, cap: w.S.cargoCap() };
    }, SLICE);
    if (r.busy) {
      await key.dispatchEvent('pointerup');
      const btn = await page.$('#evBtn');
      if (btn) await btn.dispatchEvent('click');
      await page.waitForTimeout(30);
      await key.dispatchEvent('pointerdown');
    }
    if (stop && stop(r)) done = true;
  }
  await key.dispatchEvent('pointerup');
  await page.waitForTimeout(20);
  return done;
}

/* Turn back when the game says to, which is the whole of the Point of No
   Return: `fuelState` goes clear -> plan -> danger -> stranded, and 'danger'
   is the one that toasts TURN BACK. A full hold is the other reason to leave,
   because a hold that is full is a hold that is not earning. */
const turnBack = (r) => r.state === 'danger' || r.state === 'stranded' ||
                        r.weight >= r.cap - 0.5;

const read = () => page.evaluate(() => {
  const w = window.__cw;
  return {
    t: Math.round(w.g.log.sec || 0),
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

  /* Where to go: the shallowest Anchor still unlit, that is not sealed unless
     the laser is aboard, and that is not inside ground that has come down.

     That last clause is the one that cost an afternoon. Without it the probe
     spent six runs pressing DOWN against unbreakable fallen ground - deepest,
     dug, credits and Unrest all frozen - which reads exactly like a hung
     probe and was in fact a probe playing very badly on purpose and then
     getting stuck. A player would have opened the map and seen FALLEN written
     across it. The probe has to be told.

     (The game no longer allows this state - collapseTarget will not take a
     region holding an unlit Anchor - but the probe keeps the check, because
     its job is to notice when the game does something it should not.) */
  const target = await page.evaluate(() => {
    const w = window.__cw;
    const pick = (allowSealed) => {
      let best = null, at = Infinity;
      for (let r = 0; r < w.ANCHOR_COUNT; r++) {
        if (w.g.ground.lit.includes(r)) continue;
        if (w.g.ground.collapsed.includes(r)) continue;
        if (!allowSealed && w.anchorSealed(r) && !w.g.found.includes('laser')) continue;
        const a = w.anchorAt(r);
        if (a.d < at) { at = a.d; best = { r, x: a.x, d: a.d }; }
      }
      return best;
    };
    /* Everything open is lit: go for a sealed one anyway, which is what a
       player without the laser ends up doing - and finds out. */
    const b = pick(false) || pick(true);
    if (b) return b;
    /* Nothing reachable at all. If the centre is open, go and finish it. */
    if (w.vaultOpen(w.g.ground.lit.length) && !w.g.won) {
      return { r: -1, x: w.VAULT_CORE_X, d: w.VAULT_CORE_D };
    }
    return null;
  });
  if (!target) break;

  /* Out, down, and into it. Fuel is spent for real; the probe tops up only at
     the pad, like the game does. */
  /* Flown to the COLUMN, not for a number of seconds.

     The first version held the d-pad for `|dx| * 2 + 4` seconds, which at
     three cells a second and a one-cell offset is eighteen cells of overshoot.
     The probe spent thirty-three simulated minutes digging shafts eighteen
     columns away from the hall it was aiming at, lit nothing, and looked for
     all the world like a balance problem. */
  const dx = await page.evaluate((tx) => tx - Math.round(window.__cw.g.px), target.x);
  if (dx !== 0) {
    const want = target.x;
    await hold(dx > 0 ? 'right' : 'left', 90,
      (r) => turnBack(r) || Math.abs(r.px - want) < 0.6);
  }
  await hold('down', 160, turnBack);

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
  /* Shore up anything that has come down, if the tank can pay for it - which
     is the other half of what a player does at that panel, and without it the
     probe never exercises the way back from a collapse at all. */
  await page.evaluate(() => {
    const w = window.__cw;
    while (w.g.ground.collapsed.length && w.g.ground.ballast >= 0.7) {
      if (w.shoreUp() < 0) break;
    }
  });
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
