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
         node scripts/longplay.mjs --anchors 9 --minutes 90

   ---------- WHAT THIS HAS AND HAS NOT PROVED ----------

   Read this before believing a number out of it.

   PROVED, and it is why the script exists: the first half hour of a campaign
   is healthy. Runs come out at about three minutes of game time, which is what
   the design says a run should be; the Ballast can be kept full out of banked
   ore once income arrives; Unrest reaches about 0.05 mean and 0.11 peak in
   thirty minutes, which is well inside Calm; and the money curve climbs
   without a wall in it.

   FOUND, which is the real return: a lit Anchor was an unbreakable plug in its
   own column, so six of the nine were unreachable by digging down to them; and
   the collapse cascade had no bottom, losing a planet's third region four
   minutes after its second. Both are fixed and both now have their own tests -
   `every Anchor lights by digging down its own column` in the smoke suite, and
   the spiral tests in test/unrest.test.mjs.

   NOT PROVED: that a campaign can be played to the Vault. This probe has never
   lit more than one Anchor, and every time it stalls the cause has turned out
   to be its own policy rather than the game - it has had four separate bugs of
   its own (an eighteen-cell lateral overshoot, no fuel policy at all, a climb
   that gave up because it was in danger, and then a stop condition that fires
   before the first slice when the ship is already deep). **The game's own
   reachability is proved by the smoke test, not by this.**

   The honest state: this is a good instrument for the first half hour and an
   unfinished one past it. Anybody picking it up should expect to fix its
   policy again before it gets to nine.                                     */

import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const arg = (k, d) => {
  const i = process.argv.indexOf('--' + k);
  return i === -1 ? d : Number(process.argv[i + 1]);
};
const WANT = arg('anchors', 9);
const BUDGET = arg('minutes', 120) * 60;

/* Serves dist/ itself, the way filmstrip.mjs does, on its own port. It used
   to need `npm run preview` up on 4319 first, and a campaign runs longer than
   any shell that started a server for it - the server went away under a run
   and the probe died on boot with a timeout that looked like the game. */
const DIST = join(resolve(process.cwd()), 'dist');
/* Any free port, asked for at listen time: two probes at once (a campaign
   left running and a traced replay) collided on a fixed one. */
let PORT = 0;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json'
};
const server = createServer(async (req, res) => {
  const url = (req.url || '/').split('?')[0];
  const file = url === '/' ? '/index.html' : url;
  try {
    const body = await readFile(join(DIST, file));
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
PORT = server.address().port;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({
  viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, hasTouch: true
});
await page.goto('http://127.0.0.1:' + PORT + '/?debug');
/* The way in, on the seam. It runs in real time otherwise, and under
   SwiftShader the loop clamps its delta and the seven-second descent takes
   longer than any sane wait - the probe died here with a timeout that looked
   like the game. Same reason the smoke helper does it this way. */
await page.waitForFunction(() => !!window.__cw && document.getElementById('boot').classList.contains('hidden'),
  null, { timeout: 30000 });
await page.evaluate(async () => {
  const w = window.__cw;
  const skip = document.getElementById('introSkip');
  if (skip && !document.getElementById('intro').classList.contains('hidden')) skip.click();
  const cont = document.getElementById('btnContinue');
  if (cont && !document.getElementById('title').classList.contains('hidden')) {
    (cont.disabled ? document.getElementById('btnNewGame') : cont).click();
  }
  for (let i = 0; i < 40 && w.g.mode !== 'play'; i++) {
    w.advance(1);
    await new Promise((r) => requestAnimationFrame(r));
  }
  w.startClock();
});
await page.waitForFunction(() => window.__cw.g.mode === 'play', null, { timeout: 30000 });

/* `--seed-lit N --seed-credits C`: start from a campaign already N Anchors in,
   with credits in the bank, so a stall found twenty game-minutes deep can be
   reproduced in seconds rather than replayed. Lit through the same call the
   game uses; the planet wakes if N crosses the line. */
const SEED_LIT = arg('seed-lit', 0);
const SEED_CREDITS = arg('seed-credits', 0);
if (SEED_LIT || SEED_CREDITS) {
  await page.evaluate(({ n, c }) => {
    const w = window.__cw;
    let lit = 0;
    for (let r = 0; r < w.ANCHOR_COUNT && lit < n; r++) {
      if (w.anchorSealed(r)) continue;
      w.lightAnchor(w.g.ground, r); lit++;
    }
    w.wake(w.g.ground);
    w.g.credits += c;
    w.resetBlocks();
  }, { n: SEED_LIT, c: SEED_CREDITS });
  await shopUp();
}

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
/* The FIFTH policy bug, and the one that had it digging at the edge of the
   world: `stop` was a closure on this side of the bridge, asked once per
   two-second slice. At three cells a second that is six cells between looks,
   so the probe flew straight through the column it was aiming at, on to
   column 60, and dug there - lit nothing, run after run, and looked exactly
   like a balance problem. A trace of one descent found it in a minute.

   So `stop` is now a SPEC the page evaluates itself, every fifth of a second
   of game time, in one round trip per slice:

     danger   turn back when the game shouts TURN BACK
     full     the hold is full
     column   within `near` cells of a column - and the ship coasts about
              three quarters of a cell after the key is released, so the
              caller stops early and then corrects (see `goToColumn`)
     depth    at or below a depth
     home     back on the pad
     lit      an Anchor lit since the count given
     found    a device found since the count given
     won      the Vault reached */
async function hold(dir, secs, stop) {
  const key = page.locator(`#dpad .k[data-dir=${dir}]`);
  await key.dispatchEvent('pointerdown');
  let done = false, last = null;
  for (let i = 0; i < secs && !done; i += SLICE) {
    const r = await page.evaluate(({ n, stop }) => {
      const w = window.__cw;
      const STEP = (stop && stop.step) || 0.2;
      const state = () => ({
        busy: w.g.mode !== 'play', state: w.R.fuelState, px: w.g.px, pd: w.g.pd,
        weight: w.g.weight, cap: w.S.cargoCap(), lit: w.g.ground.lit.length,
        found: w.g.found.length, won: w.g.won
      });
      const hit = (r) => {
        if (!stop) return false;
        if (stop.danger && (r.state === 'danger' || r.state === 'stranded')) return true;
        if (stop.full && r.weight >= r.cap - 0.5) return true;
        if (stop.column !== undefined && Math.abs(r.px - stop.column) < (stop.near || 0.9)) return true;
        if (stop.depth !== undefined && r.pd >= stop.depth) return true;
        /* The SIXTH policy bug. Home was `pd <= 0.4`, which is just under
           the surface line and not on it: the sale, the refuel and the hull
           repair fire when the ship rises past -0.6 (atSurface in state.ts),
           so the probe hovered a hand's breadth below the pad, sold nothing,
           refuelled nothing, started the next run on the dregs and was lost
           by the seventh. Every row said credits 0 and it read as an economy
           bug. `--trace` said where the ship was. */
        if (stop.home && r.pd <= -0.7) return true;
        if (stop.lit !== undefined && r.lit > stop.lit) return true;
        if (stop.found !== undefined && r.found > stop.found) return true;
        if (stop.won && r.won) return true;
        return false;
      };
      let r = state(), stopped = false;
      for (let t = 0; t < n && !stopped; t += STEP) {
        w.advance(STEP);
        r = state();
        /* A card stops the loop; a probe that does not press the button sits
           there for the rest of the budget looking like a hang. */
        if (r.busy) { const b = document.getElementById('evBtn'); if (b) b.click(); r = state(); }
        if (hit(r)) stopped = true;
      }
      return { ...r, stopped };
    }, { n: SLICE, stop });
    last = r;
    if (r.stopped) done = true;
  }
  await key.dispatchEvent('pointerup');
  await page.waitForTimeout(20);
  return done;
}

/* `--trace`: one line per step of a run, for when the rows say nothing is
   happening and the question is where the ship actually is. */
const TRACE = process.argv.includes('--trace');
async function trace(label) {
  if (!TRACE) return;
  const s = await page.evaluate(() => {
    const w = window.__cw;
    return { mode: w.g.mode, fuel: +w.g.fuel.toFixed(1), state: w.R.fuelState,
             px: +w.g.px.toFixed(2), pd: +w.g.pd.toFixed(2), hull: +w.g.hull.toFixed(0),
             sec: Math.round(w.R.run.sec), card: (document.getElementById('evTitle') || {}).textContent };
  });
  console.log('  ' + label.padEnd(10) + JSON.stringify(s));
}

/* Fly to a column and end up IN it. Stop early, let the coast finish, then
   correct in short holds until the ship is within half a cell - which is
   what the drill needs to cut a straight shaft rather than a stepped one. */
async function goToColumn(x) {
  const at = () => page.evaluate(() => window.__cw.g.px);
  let px = await at();
  if (Math.abs(px - x) >= 0.9) {
    await hold(px < x ? 'right' : 'left', 120, { column: x, near: 0.9, danger: true });
    await page.evaluate(() => window.__cw.advance(0.6));
  }
  for (let i = 0; i < 6; i++) {
    px = await at();
    if (Math.abs(px - x) < 0.45) break;
    await hold(px < x ? 'right' : 'left', 2, { column: x, near: 0.3, step: 0.05 });
    await page.evaluate(() => window.__cw.advance(0.5));
  }
  return Math.abs((await at()) - x) < 0.45;
}

/* Turn back when the game says to, which is the whole of the Point of No
   Return: `fuelState` goes clear -> plan -> danger -> stranded, and 'danger'
   is the one that toasts TURN BACK. A full hold is the other reason to leave,
   because a hold that is full is a hold that is not earning. */
/* And the policy for the CLIMB, which is not the same policy: being in danger
   is the reason you are climbing, so a climb that turned back for danger
   ended on its first slice, every run. Climbing stops for two things only:
   arriving, and the game taking the ship off you. That is `{ home: true }`
   below, and nothing else. */

const read = () => page.evaluate(() => {
  const w = window.__cw;
  return {
    t: Math.round(w.g.log.sec || 0),
    px: Math.round(w.g.px), pd: Math.round(w.g.pd),
    credits: Math.round(w.g.credits),
    lit: w.g.ground.lit.length,
    found: w.g.found.length,
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
    const laser = w.g.found.includes('laser');
    const pick = (allowSealed) => {
      let best = null, at = Infinity;
      for (let r = 0; r < w.ANCHOR_COUNT; r++) {
        if (w.g.ground.lit.includes(r)) continue;
        if (w.g.ground.collapsed.includes(r)) continue;
        if (!allowSealed && w.anchorSealed(r) && !laser) continue;
        const a = w.anchorAt(r);
        if (a.d < at) { at = a.d; best = { kind: 'anchor', r, x: a.x, d: a.d }; }
      }
      return best;
    };
    const open = pick(false);
    if (open) return open;
    /* Everything open is lit and what is left is sealed. Without the laser
       there is exactly one thing to do, and it is what a player who has read
       the wall does: go and dig up crates until the key turns up. The cap
       buries four at a time, shallowest first, so this is a sequence of
       crates rather than a hunt for one. THIS is the branch that found the
       campaign could not be finished: the laser was never buried at all. */
    if (pick(true) && !laser) {
      let crate = null;
      for (const [k, f] of w.findCells()) {
        const i = k.indexOf(',');
        const c = { kind: 'crate', key: f.key, x: +k.slice(0, i), d: +k.slice(i + 1) };
        if (!crate || c.d < crate.d) crate = c;
      }
      if (crate) return crate;
      return { kind: 'stuck', why: 'sealed Anchors left, no laser, and no crate on the world' };
    }
    const sealed = pick(true);
    if (sealed) return sealed;
    /* Nothing left to light. If the centre is open, go and finish it. */
    if (w.vaultOpen(w.g.ground.lit.length) && !w.g.won) {
      return { kind: 'vault', x: w.VAULT_CORE_X, d: w.VAULT_CORE_D };
    }
    return null;
  });
  if (!target) break;
  if (target.kind === 'stuck') { console.log('STUCK: ' + target.why); break; }

  /* Out, down, and into it. Fuel is spent for real; the probe tops up only at
     the pad, like the game does. */
  const before = await read();
  /* THE SEVENTH policy bug, and the first one the GAME was right about. After
     the wake the probe went for Palewell straight down the Rustmoor column,
     and at 130 m that column runs into Kryllon's sealed hall - deliberately
     across the main shaft, uncuttable without the laser. The ship sat against
     sealed stone burning fuel to the danger line, went home with nothing, and
     did it again for a hundred runs. A player goes round. So: dig down the
     nearest column with nothing uncuttable in it above the target, and come
     in sideways at the target's own depth. */
  const column = await page.evaluate((t) => {
    const w = window.__cw;
    const clear = (x) => {
      if (x < 1 || x > w.W - 2) return false;
      for (let d = 0; d <= t.d + 1; d++) {
        const b = w.blockAt(x, d);
        if (b && b.hard === Infinity && !(x === t.x && d === t.d)) return false;
      }
      return true;
    };
    for (let off = 0; off < 12; off++) {
      for (const x of [t.x + off, t.x - off]) if (clear(x)) return x;
    }
    return t.x;
  }, target);
  await goToColumn(column);
  /* Down, and STOP WHEN THE THING HAPPENS - the Anchor lights, the crate
     breaks, the Vault opens - rather than at a depth that has to be right to
     the cell. The depth is the backstop, one cell past the target, and where
     the lateral approach begins for a column the thing is not actually in. */
  const stop = { danger: true, full: true, depth: target.d + 0.6 };
  if (target.kind === 'anchor') stop.lit = before.lit;
  if (target.kind === 'crate') stop.found = before.found;
  if (target.kind === 'vault') { stop.won = true; stop.depth = target.d - 1; }
  await trace('at column');
  const arrived = await hold('down', 400, stop);
  if (arrived && column !== target.x) {
    /* Level with it: cut sideways into the room. */
    const side = target.x > column ? 'right' : 'left';
    const lateral = { ...stop, column: target.x, near: 0.6 };
    delete lateral.depth;
    await hold(side, 120, lateral);
  }
  /* And a beat at the bottom, because lighting is a proximity check on the
     frame loop and a hold that ends on the frame it arrives has not run one. */
  await page.evaluate(() => window.__cw.advance(2));
  await trace('bottom');

  /* Home. The climb is the real one, through the tunnels that are there. */
  await hold('up', 400, { home: true });
  await trace('home');
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
                lit: after.lit, found: after.found, at: target.kind + '@' + target.x + ',' + target.d,
                ballast: after.ballast, unrest: after.unrest,
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
server.close();
