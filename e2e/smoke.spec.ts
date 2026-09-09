import { test, expect, type Page, type Locator } from '@playwright/test';

/* Smoke test against the production build.

   This exists because of a specific incident: the module split dropped the
   final line of the entry point, requestAnimationFrame(frame). Every golden
   test passed, the typecheck was clean and the build succeeded. The game
   booted, drew a single frame and sat there forever. It was caught by noticing
   the bundle had shrunk.

   So the load-bearing assertion here is "the frame loop advances". The rest is
   cheap insurance for the same class of wiring bug: a broken import, a missing
   DOM id (mustEl throws on those now), a boot-order regression.

   Everything below waits on game STATE, never on wall-clock time. The frame
   loop clamps its delta to 50 ms, so on a machine without a GPU the game
   advances in slow motion under load and any fixed sleep becomes a flake. */

/* The budget for anything still waiting on real time.

   45 s, under the 60 s suite timeout, so a poll can actually run out and report
   what it was waiting for instead of dying inside a test timeout.

   Raised from 30 s because the move to PBR shaders made every remaining
   wall-clock test more marginal at once: CI has no GPU, falls back to a
   software rasteriser, and a heavier fragment shader there costs real time that
   the game then advances in slow motion to pay for. Two tests tipped over.

   This is headroom, not a fix. The fix is the tick seam - anything that
   accumulates over GAME time belongs on advance(), where a slow machine costs
   nothing. Tests still using this are ones that only need a second or two. */
const DEEP_ENOUGH = 45_000;

/* Hold a d-pad direction until `settled` passes, then release. The game reads
   pointer events, and holding is what drives the loop - a click can land
   between frames and do nothing at all. */
async function holdUntil(page: Page, dir: string, settled: () => Promise<void>) {
  const key = page.locator(`#dpad .k[data-dir=${dir}]`);
  await key.dispatchEvent('pointerdown');
  try {
    await settled();
  } finally {
    await key.dispatchEvent('pointerup');
    await page.waitForTimeout(150);
  }
}

/* Tap a display case in the Outfitter, the way a thumb would.

   The shop is a 3D room now, so there is no row to click: the case has to be
   found in the scene, projected to screen, and hit with a real pointer event at
   those coordinates. That is more work than clicking a list item and it is
   worth it - it exercises the actual path, raycast and all, which is the part
   that can break.

   Needs ?debug for the scene handles. */
async function tapBay(page: Page, key: string) {
  /* A tap only means anything while docked; without this a shop that failed to
     open shows up as "the card is empty", which points at the wrong thing. */
  await expect(page.locator('#shop'), 'the Outfitter is not open').not.toHaveClass(/hidden/);
  const r = await page.evaluate((k) => {
    const w = (window as any).__cw;
    const bay = w.bays.find((b: any) => b.key === k);
    if (!bay) return { err: 'no case for ' + k };
    const p = bay.group.getWorldPosition(new w.camera.position.constructor());
    p.project(w.stationCamera);
    const x = Math.round((p.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-p.y * 0.5 + 0.5) * window.innerHeight);
    const el = document.elementFromPoint(x, y);
    if (!el) return { err: 'nothing at ' + x + ',' + y };
    const before = { mode: w.g.mode, sel: w.selectedBay() };
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    w.advance(0.3);
    return { at: x + ',' + y, on: el.id || el.className, picked: w.pickBay(x, y),
             selected: w.selectedBay(), before };
  }, key);
  expect(r.err, String(r.err)).toBeUndefined();
  expect(r.selected, 'tapped "' + key + '" at ' + r.at + ' over "' + r.on +
    '"; raycast said "' + r.picked + '"; before=' + JSON.stringify(r.before)).toBe(key);
}

const num = async (loc: Locator) =>
  Number((await loc.innerText()).replace(/[^0-9.]/g, ''));

test.beforeEach(async ({ page }) => {
  /* fail loudly on anything the page throws, rather than letting a broken
     module surface later as a confusing assertion failure */
  page.on('pageerror', (e) => {
    throw new Error('uncaught page error: ' + e.message);
  });
  await page.goto('/');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
});

test('boots without hitting the error overlay', async ({ page }) => {
  /* the overlay is the game's own last-resort reporter; if it is visible,
     something threw before we got here */
  await expect(page.locator('#err')).toHaveClass(/hidden/);
  await expect(page.locator('#planet')).toHaveText('Verdax');
});

test('creates a WebGL context', async ({ page }) => {
  const ok = await page.evaluate(() => {
    const c = document.querySelector('#game canvas') as HTMLCanvasElement | null;
    if (!c) return false;
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  });
  expect(ok, 'three.js should have a live WebGL context').toBe(true);
});

/* THE important one. A frozen game passes every other check in this file. */
test('the frame loop advances', async ({ page }) => {
  await expect(page.locator('#depth')).toContainText('DEPTH 0 m');
  await holdUntil(page, 'down', async () => {
    await expect(
      page.locator('#depth'),
      'depth never changed while digging - the frame loop is not running'
    ).not.toContainText('DEPTH 0 m', { timeout: DEEP_ENOUGH });
  });
});

test('digging fills the hold and selling at the pad pays out', async ({ page }) => {
  await holdUntil(page, 'down', async () => {
    await expect(page.locator('#cargoTxt')).not.toHaveText(/^0\.0 /, { timeout: DEEP_ENOUGH });
  });
  expect(await num(page.locator('#haul')), 'digging should produce a haul').toBeGreaterThan(0);

  /* Wait for the sale itself, not for the depth readout. The HUD rounds, so it
     shows "DEPTH 0 m" while the ship is still one cell above the pad at pd=0 -
     releasing there leaves the sale to whether a move happened to be in flight.
     Credits changing is the unambiguous signal that the pad was touched. */
  await holdUntil(page, 'up', async () => {
    await expect(
      page.locator('#credits'),
      'never reached the pad, so the haul was never sold'
    ).not.toHaveText('0', { timeout: DEEP_ENOUGH });
  });
  await expect(page.locator('#cargoTxt')).toHaveText(/^0\.0 /, { timeout: 10_000 });
  expect(await num(page.locator('#credits')), 'the pad should have bought the haul')
    .toBeGreaterThan(0);
});

/* Every element in the ui map now goes through mustEl(), which throws on a
   missing id. Opening each panel is therefore also a check that index.html and
   ui.ts still agree with each other. */
test('the shop, manifest and pause menu all open', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await page.locator('#btnShop').dispatchEvent('click');
  await expect(page.locator('#shop')).not.toHaveClass(/hidden/);

  /* The Outfitter is a room: one display case per upgrade, and the ship itself
     reparented onto the deck. Asserting the case COUNT is the equivalent of the
     old row count - it catches an upgrade that stops being reachable. */
  const bays = await page.evaluate(() => (window as any).__cw.bays.length);
  expect(bays, 'every upgrade needs a case to stand in').toBe(10);
  /* Nothing picked yet, so the card is empty and the hint is showing. */
  await expect(page.locator('#shopHint')).not.toHaveClass(/gone/);

  /* Tapping a case fills the card - and a sealed one still says why. */
  await tapBay(page, 'drill');
  await expect(page.locator('#shopCard')).toContainText('Drill Bit');
  await expect(page.locator('#shopHint')).toHaveClass(/gone/);
  await tapBay(page, 'auto');
  await expect(page.locator('#shopCard'), 'a sealed case must say what unlocks it')
    .toContainText('Sealed until');

  /* supplies stay as their own row of chips */
  await expect(page.locator('#supplies .up')).toHaveCount(3);
  await page.locator('#shopClose').dispatchEvent('click');

  await page.locator('#btnManifest').dispatchEvent('click');
  await expect(page.locator('#manifest')).not.toHaveClass(/hidden/);
  await page.locator('#manifestClose').dispatchEvent('click');

  await page.locator('#btnPause').dispatchEvent('click');
  await expect(page.locator('#pause')).not.toHaveClass(/hidden/);
  await expect(page.locator('#pauseStats')).toContainText('Verdax');
  await page.locator('#btnResume').dispatchEvent('click');

  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Nothing else covers the audio graph. Chrome refuses to create an
   AudioContext outside a user gesture, so this reloads with a counting wrapper
   installed, then makes a real click - dispatchEvent does not grant user
   activation, so it would prove nothing. */
test('the audio graph builds on a user gesture', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__audioContexts = 0;
    (window as any).__sources = 0;
    const Orig = window.AudioContext;
    (window as any).AudioContext = class extends Orig {
      constructor(...args: any[]) {
        super(...args);
        (window as any).__audioContexts++;
      }
      /* Counting contexts alone would still pass if the graph were built and
         then never published, because every sound would silently no-op. Count
         the buffer sources instead: the wind loop makes one at init, and every
         drill chip and crack makes another. */
      createBufferSource() {
        (window as any).__sources++;
        return super.createBufferSource();
      }
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  expect(await page.evaluate(() => (window as any).__audioContexts),
    'audio must not start before a gesture - Chrome blocks it').toBe(0);

  await page.locator('#dpad .k[data-dir=down]').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__audioContexts), { timeout: 5000 })
    .toBeGreaterThan(0);

  /* now drill for a while and confirm sounds actually reach the graph */
  await holdUntil(page, 'down', async () => {
    await expect
      .poll(() => page.evaluate(() => (window as any).__sources), { timeout: DEEP_ENOUGH })
      .toBeGreaterThan(2);
  });

  /* toggling exercises setAudio against the live graph */
  await page.locator('#btnPause').dispatchEvent('click');
  const music = page.locator('#btnMusic');
  await expect(music).toHaveText(/MUSIC\s+ON/);
  await music.click();
  await expect(music).toHaveText(/MUSIC\s+OFF/);
  await music.click();
  await expect(music).toHaveText(/MUSIC\s+ON/);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* The adaptive music layers.

   Three voices are always running and are mixed in and out by game state. That
   is invisible to every other check: if setMood() stopped being called, or the
   layers were wired to the wrong bus, the game would sound flatter and nothing
   would fail.

   Checked by recording what the code asks of each gain rather than by
   listening. It is coupled to setTargetAtTime being the ramp used, which is a
   deliberate trade: the alternative is exposing the audio graph on window just
   so a test can read it. */
test('the score layers respond to depth and to danger', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__gains = [];
    const orig = AudioParam.prototype.setTargetAtTime;
    AudioParam.prototype.setTargetAtTime = function (v: number, t: number, c: number) {
      (window as any).__gains.push(v);
      return orig.call(this, v, t, c);
    };
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 6, cargo: 3, thrust: 4, tank: 6, cool: 8, scan: 5, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {},
      dug: Array.from({ length: 97 }, (_, d) => '6,' + d),
      rubble: [], cargo: {}, weight: 0, px: 6, pd: 96
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* a real click, because Chrome will not build an AudioContext without one */
  await page.locator('#dpad .k[data-dir=left]').click();

  const seen = () => page.evaluate(() => (window as any).__gains as number[]);
  const near = (xs: number[], v: number) => xs.some((x) => Math.abs(x - v) < 1e-6);

  /* 96 m is past both the heat line and the unstable band, so the heat layer
     and the shifting-rock layer should both be asked for. */
  await expect
    .poll(async () => near(await seen(), 0.075), { timeout: 20_000 })
    .toBe(true);
  await expect
    .poll(async () => near(await seen(), 0.5), { timeout: 20_000 })
    .toBe(true);

  /* Nothing here should have thrown - a broken layer would take the whole
     scheduler down with it and silence the score. */
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Draw-call budget.

   Terrain is drawn with InstancedMesh. Before that, every block was its own
   mesh with its own material, which measured 207 draw calls underground against
   a mobile guideline of about 50. Instancing took it to 35.

   That is easy to lose silently: anything that gives blocks per-instance
   materials, or adds a per-object mesh to the streaming window, puts it
   straight back. It costs nothing on a desktop and shows up on the phone.

   Counted by wrapping the GL context rather than reading renderer.info, which
   is module-scoped and not reachable from here.

   ---

   **150, and it is a regression detector, not a ceiling.** The old value of 70
   came from a "roughly 50 to 100 on mobile" rule of thumb, which turns out to
   be off by more than an order of magnitude for what this game actually does.

   Measured on 2026-09-08 by adding sub-pixel meshes to the real scene at the
   worst case and timing whole frames through the tick seam - so this is draw
   CALL overhead, isolated from fill rate and vertex work:

       79 calls   0.64 ms      819 calls   3.66 ms
      119 calls   0.75 ms     1519 calls   7.27 ms
      219 calls   1.19 ms     2519 calls  12.88 ms
      419 calls   1.88 ms

   Dead linear at **5.0 us per draw call**. The game's 60 calls cost 0.64 ms,
   which is 3.8% of a 60 fps frame, and it would take about **3,200 calls** to
   miss 60 fps on this machine. A phone's driver overhead is worse - call it a
   few times - which still leaves the real ceiling in the high hundreds at
   minimum, ten to twenty times what the game uses.

   So the number here exists to catch ONE thing: instancing silently breaking
   and every block becoming its own mesh again, which measured 207 back when
   the world was much smaller and would be far higher now. 150 catches that
   decisively while leaving room for ordinary feature work to land without a
   budget edit. Raise it deliberately if a feature genuinely needs it; the
   thing to be alarmed by is a jump, not a number. */
const DRAW_CALL_BUDGET = 150;

test('stays inside the draw-call budget while underground', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__glCalls = 0;
    for (const P of [(window as any).WebGL2RenderingContext, (window as any).WebGLRenderingContext]) {
      if (!P) continue;
      for (const fn of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
        const orig = P.prototype[fn];
        if (!orig) continue;
        P.prototype[fn] = function (...a: any[]) {
          (window as any).__glCalls++;
          return orig.apply(this, a);
        };
      }
    }
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* Seeded to the worst case rather than dug to a shallow one.

     The original version dug down for a few seconds, which by now measures a
     window containing three or four block types. Everything added since -
     rubble, caches, the parallax layers, the headlight, the record marker -
     shows up deep and in an opened-out chamber, and each distinct block id is
     its own pool and its own pair of draw calls. Measuring the easy case is
     how a budget silently stops being a budget. */
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 96; d++) dug.push('6,' + d);
    for (let x = 1; x <= 11; x++) for (let d = 88; d <= 99; d++) dug.push(x + ',' + d);
    const rubble = ['5,90', '7,90', '4,92', '8,92', '6,86', '9,94', '3,95', '2,91'];
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 3, credits: 0, shards: 0,
      up: { drill: 9, cargo: 9, thrust: 9, tank: 9, cool: 9, scan: 9, tow: 0, auto: 0 },
      kit: { coolant: 2, patch: 3, cell: 3 }, stock: {},
      best: { depth: 40, haul: 0 },
      dug: dug.filter((k) => !rubble.includes(k)), rubble,
      cargo: {}, weight: 0, px: 6, pd: 96
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#depth')).toContainText('DEPTH 96 m');

  const perFrame = await page.evaluate(async () => {
    const w = window as any;
    const before = w.__glCalls;
    let frames = 0;
    const t0 = performance.now();
    await new Promise<void>((res) => {
      const tick = () => {
        frames++;
        performance.now() - t0 < 1000 ? requestAnimationFrame(tick) : res();
      };
      requestAnimationFrame(tick);
    });
    return Math.round((w.__glCalls - before) / Math.max(1, frames));
  });

  expect(perFrame, 'draw calls per frame underground').toBeGreaterThan(0);
  /* Reported so the headroom is visible in CI output rather than only the
     pass/fail - a budget you never see the margin on is one you find out
     about on the day it breaks. */
  console.log('    draw calls per frame at 96 m: ' + perFrame + ' of ' + DRAW_CALL_BUDGET);
  expect(
    perFrame,
    'draw calls regressed past the budget - most likely something gave blocks ' +
    'per-instance materials or added a per-object mesh to the streaming window'
  ).toBeLessThanOrEqual(DRAW_CALL_BUDGET);
});

/* Supplies are the only thing in the game that spends inventory, and every
   step of it lives in a different module: the shop buys, state saves, the kit
   buttons spend and the frame loop shows the result. This walks the whole
   chain against the real build.

   It buys a fuel cell with credits granted directly rather than mined, because
   mining eight thousand credits under SwiftShader would dominate the suite. */
test('a supply can be bought at the pad and spent underground', async ({ page }) => {
  await page.evaluate(() => {
    const raw = localStorage.getItem('coreward.v2');
    const s = raw ? JSON.parse(raw) : {};
    s.credits = 20000;
    localStorage.setItem('coreward.v2', JSON.stringify(s));
    /* The game saves on visibilitychange, which fires during the reload below
       and would write the live zero-credit state straight back over this.
       Freeze the key on the outgoing page instead. */
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  await page.locator('#btnShop').dispatchEvent('click');
  const rows = page.locator('#supplies .up');
  await expect(rows.nth(0)).toContainText('Coolant Flush');
  await expect(rows.nth(2)).toContainText('Fuel Cell');
  await rows.nth(0).locator('button').click();
  await rows.nth(2).locator('button').click();
  await expect(rows.nth(0)).toContainText('1/2');
  await expect(rows.nth(2)).toContainText('1/3');
  await page.locator('#shopClose').dispatchEvent('click');

  /* hidden at the pad, because the pad already refuels and cools for free */
  await expect(page.locator('#supCell')).toHaveClass(/none/);
  await expect(page.locator('#supCoolant')).toHaveClass(/none/);

  /* Read off the gauge the player is looking at. Fuel is a needle on a dial
     now, and the printed percentage beside it is the exact figure the dial can
     only approximate - which makes it both the honest thing to assert on and
     the one that does not depend on a sweep angle. */
  const fuelPct = () => page.evaluate(() =>
    parseFloat((document.getElementById('fuelTxt') as HTMLElement).textContent || '0'));

  await holdUntil(page, 'down', async () => {
    await expect(page.locator('#depth')).not.toContainText('DEPTH 0 m', { timeout: DEEP_ENOUGH });
  });
  await expect(page.locator('#supCell')).not.toHaveClass(/none/);

  /* Soak is zero until well below the heat depth, so a flush here has nothing
     to do. It must refuse and keep the item rather than silently eat it -
     these buttons sit under a thumb that is mostly steering. */
  await page.locator('#supCoolant').dispatchEvent('pointerdown');
  await expect(page.locator('#toast')).toContainText('Nothing to flush');
  await expect(page.locator('#supCoolant .n')).toHaveText('1');

  /* the fuel cell, by contrast, has real work to do by now */
  const before = await fuelPct();
  expect(before, 'digging should have burned some fuel').toBeLessThan(100);
  await page.locator('#supCell').dispatchEvent('pointerdown');
  await expect(page.locator('#toast')).toContainText('Fuel cell burned');
  await expect(page.locator('#supCell')).toHaveClass(/none/);
  /* Polled, not sampled. useSupply changes game state synchronously but the
     bar is only written by the next updateHUD, so a single read can land in
     the gap - which it did, but only under the load of the full suite. */
  await expect
    .poll(fuelPct, { timeout: 10_000, message: 'spending a fuel cell must actually add fuel' })
    .toBeGreaterThan(before);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Digging with a full hold.

   The drill used to simply refuse, which is the worst kind of wall: it does
   not ask you to decide anything, it just stops you doing the thing the game
   is about. Now it always cuts, ore that will not fit waits at the cell it
   came from, and flying back through picks it up.

   Three separate claims, and all three are observable without reaching into
   the game: depth keeps increasing while the hold is full, the hold does not
   grow past its cap, and coming back with room does grow it. */
test('a full hold no longer stops the drill, and the ore waits', async ({ page }) => {
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 70; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 0, thrust: 4, tank: 8, cool: 9, scan: 4, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {},
      best: { depth: 300, haul: 0 },
      /* 56 of 60 kg: room for nothing worth having */
      dug, cargo: { amethyst: 8 }, weight: 56, px: 6, pd: 70
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#cargoTxt')).toHaveText('56.0 / 60 KG');

  /* the drill must keep working */
  await holdUntil(page, 'down', async () => {
    await expect(page.locator('#depth'))
      .toContainText(/DEPTH (7[5-9]|[89][0-9]) m/, { timeout: DEEP_ENOUGH });
  });
  const kg = () => page.evaluate(() =>
    parseFloat((document.querySelector('#cargoTxt') as HTMLElement).innerText));
  expect(await kg(), 'the hold must never exceed its cap').toBeLessThanOrEqual(60);

  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

test('ore left behind is picked up by flying back through it', async ({ page }) => {
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 70; d++) dug.push('6,' + d);
    dug.push('5,70', '4,70');
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 0, thrust: 4, tank: 8, cool: 9, scan: 4, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [],
      drops: { '5,70': 'amethyst', '4,70': 'gold' },
      best: { depth: 300, haul: 0 },
      dug, cargo: {}, weight: 0, px: 6, pd: 70
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#cargoTxt')).toHaveText('0.0 / 60 KG');

  await holdUntil(page, 'left', async () => {
    await expect
      .poll(() => page.evaluate(() => Number(
        (document.querySelector('#haul') as HTMLElement).innerText.replace(/[^0-9]/g, ''))),
        { timeout: DEEP_ENOUGH })
      .toBeGreaterThan(1200);
  });

  /* amethyst is 900 and gold 420 on planet 0, so anything over 1200 means
     both drops were collected rather than one of them plus rock */
  expect(await page.evaluate(() =>
    parseFloat((document.querySelector('#cargoTxt') as HTMLElement).innerText)),
    'both drops should be aboard').toBeGreaterThan(15);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Half-drilled blocks stay half-drilled.

   Before this, letting go mid-block threw the work away, so the only way to
   change your mind about a wall was to have not started it. The damage is
   stored as a fraction rather than as seconds precisely so that buying a
   better drill in between speeds up the REMAINDER instead of erasing the
   progress - which is the part worth testing, because it is the part that is
   easy to get backwards. */
test('a block remembers how far through it you were', async ({ page }) => {
  /* Granite at 50 m with an unupgraded drill takes 2.5 seconds to cut. Short
     interrupted bursts can only ever finish it if each one picks up where the
     last stopped.

     Driven through the headless seam rather than by holding a real d-pad for
     600 ms at a time, and that is not a convenience. The frame loop clamps its
     delta, so under SwiftShader a burst of 600 ms of WALL CLOCK delivers some
     unknown smaller amount of GAME time - and how much depends on how heavy a
     frame currently is. This test passed for months and then went red on CI,
     on a commit that only touched lighting: the extra per-frame cost of a
     shadow fan under a software rasteriser was enough that thirty bursts no
     longer added up to 2.5 seconds of drilling. The failure message said the
     damage was being thrown away, which was not true and was not close.

     Fixed steps make the burst length mean exactly what it says on any
     machine. The d-pad's own wiring is covered by the tests that hold it. */
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 49; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 0, cargo: 5, thrust: 3, tank: 9, cool: 9, scan: 3, tow: 0, auto: 0, bomb: 0, laser: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {}, damage: {},
      relics: [], relicsTaken: [], best: { depth: 300, haul: 0 }, charge: 4,
      dug, cargo: {}, weight: 0, px: 6, pd: 49
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#depth')).toContainText('DEPTH 49 m');

  const r = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    let bursts = 0;
    /* 0.3 s on, 0.12 s off. Nine bursts of drilling would finish the block if
       nothing is lost; one never can. */
    while (w.g.pd < 49.5 && bursts < 30) {
      w.R.held = 'down';
      w.advance(0.3);
      w.R.held = null;
      w.advance(0.12);
      bursts++;
    }
    return { bursts, depth: w.g.pd };
  });

  expect(r.bursts, 'one 0.3 s burst finished 2.5 s of granite, so this is not ' +
    'testing interruption at all').toBeGreaterThan(1);
  expect(r.bursts, 'thirty interrupted bursts did not finish the block - the ' +
    'damage is being thrown away when the drill stops').toBeLessThan(30);
  expect(r.depth, 'the block did break').toBeGreaterThanOrEqual(49.5);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

test('the charge and the laser spend power and clear the ground', async ({ page }) => {
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 48; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 2, cargo: 5, thrust: 1, tank: 6, cool: 0, scan: 3, tow: 0, auto: 0, bomb: 2, laser: 2 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {},
      best: { depth: 120, haul: 0 }, charge: 4,
      dug, cargo: {}, weight: 0, px: 6, pd: 47
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* the meter is only shown to someone who can spend it */
  await expect(page.locator('#powerChip')).not.toHaveClass(/hidden/);
  await expect(page.locator('#ordBomb')).not.toHaveClass(/none/);
  await expect(page.locator('#ordLaser')).not.toHaveClass(/none/);

  const power = () => page.evaluate(() =>
    Number((document.querySelector('#power') as HTMLElement).innerText));
  const kg = () => page.evaluate(() =>
    parseFloat((document.querySelector('#cargoTxt') as HTMLElement).innerText));
  await expect.poll(power, { timeout: 10_000 }).toBe(4);

  await page.locator('#ordBomb').dispatchEvent('pointerdown');
  await expect(page.locator('#toast')).toContainText('Charge fired');
  await expect.poll(power, { timeout: 10_000 }).toBe(2);
  await expect.poll(kg, { timeout: 10_000 }).toBeGreaterThan(0);

  /* two power left, and the charge costs two - so it is still armed, and one
     laser shot must take it below what the charge needs */
  await expect(page.locator('#ordBomb')).not.toHaveClass(/cold/);
  await page.locator('#ordLaser').dispatchEvent('pointerdown');
  await expect(page.locator('#toast')).toContainText('Laser fired');
  await expect.poll(power, { timeout: 10_000 }).toBe(1);
  await expect(page.locator('#ordBomb')).toHaveClass(/cold/);

  /* and firing it anyway must refuse rather than go into debt */
  await page.locator('#ordBomb').dispatchEvent('pointerdown');
  await expect(page.locator('#toast')).toContainText('Not enough power');
  await expect.poll(power, { timeout: 10_000 }).toBe(1);

  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Personal bests, and the marker line that makes one visible.

   The record only means something if crossing it is a moment, and a moment
   that fires twice is not one. The latch lives in mark.ts precisely because
   the caller is a frame loop; this checks it actually latches against a real
   build rather than against the unit that owns it. */
test('crossing your deepest reach is announced exactly once', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 3, thrust: 5, tank: 6, cool: 4, scan: 6, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {},
      best: { depth: 14, haul: 0 },
      dug: [], rubble: [], cargo: {}, weight: 0, px: 6, pd: -1
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  /* Driven through the tick seam, for the same reason the heat test is: this
     digs 25 m, which is a lot of GAME time, and a GPU-less CI runner advances
     the game in slow motion. It reached 22 m in the full thirty seconds and
     failed - and it got there by degrees, because the move to PBR shaders made
     an already-marginal test tip over.

     Waiting on real time for something measured in game time is the bug rather
     than the timeout, so this drills in a fraction of a second and identically
     on every machine. */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* Counted after the navigation, not before it: a reload wipes the page's
     globals, and an increment on an undefined counter is NaN rather than an
     error - which reads as a failed assertion about the game. */
  await page.evaluate(() => {
    (window as any).__records = 0;
    const el = document.querySelector('#toast') as HTMLElement;
    new MutationObserver(() => {
      if ((el.textContent || '').includes('New record')) (window as any).__records++;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* dig well past the 14 m record, holding down the whole way */
  await page.evaluate(async () => {
    const w = (window as any).__cw;
    w.stopClock();
    w.R.held = 'down';
    /* Advanced in slices with a yield between them, and that is not cosmetic.

       A MutationObserver fires its callback as a microtask AFTER the current
       synchronous block, so running all forty seconds in one go means the
       observer wakes up once, at the end, when the toast has long since been
       cleared - and the callback reads textContent as it is NOW, not as it was
       when the record was queued. The counter came back 0 for a toast that had
       genuinely fired.

       Yielding between slices lets the observer run while the toast is still on
       screen. The simulation is still fixed 1/60 steps, so nothing about the
       determinism changes. */
    for (let i = 0; i < 80; i++) {
      w.advance(0.5);
      await new Promise((r) => setTimeout(r, 0));
    }
    w.R.held = null;
    w.advance(0.3);
  });
  await expect(page.locator('#depth')).toContainText(/DEPTH (2[5-9]|[3-9][0-9]) m/);

  expect(await page.evaluate(() => (window as any).__records),
    'the record announcement must fire once, not on every frame past the line')
    .toBe(1);

  /* and it is remembered */
  await page.locator('#btnPause').dispatchEvent('click');
  await expect(page.locator('#pauseStats')).toContainText('Deepest');
  await expect(page.locator('#pauseStats')).not.toContainText('Deepest 14 m');
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* The mineral gate. Money alone must not buy a level past the free tier, and
   the row has to say what is missing and where to find it - that line is the
   entire navigation system for this mechanic.

   Walked against the real build because it spans four modules: the table in
   config, the bank in state, the deduction in ui, and the markup in
   index.html. */
test('an upgrade past the free tier needs minerals, not just credits', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 500_000, shards: 0,
      /* cool at 3 means the next purchase is level 4, the first gated one */
      up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 3, scan: 0, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 },
      stock: {},
      /* deep enough that the Cooling Rig is on the shelf at all - the depth
         gate and the mineral gate are separate walls and this test is about
         the second one */
      best: { depth: 80, haul: 0 },
      dug: [], cargo: {}, weight: 0, px: 6, pd: -1
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  /* ?debug: the shop is a 3D room, and tapping a case needs the scene handles */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  await page.locator('#btnShop').dispatchEvent('click');
  await tapBay(page, 'cool');
  const card = page.locator('#shopCard');
  const buy = card.locator('button');

  /* half a million credits and it is still refused */
  await expect(card).toContainText('Cooling Rig');
  await expect(buy).toBeDisabled();
  await expect(card.locator('.upmat')).toHaveClass(/short/);
  await expect(card.locator('.upmat')).toContainText('2 Emerald');
  await expect(card.locator('.upmat'), 'a requirement you cannot meet must say where to go')
    .toContainText('from 78 m');

  /* levels inside the free tier are still pure credits */
  await tapBay(page, 'drill');
  await expect(card).toContainText('Drill Bit');
  await expect(card.locator('.upmat')).toHaveCount(0);
  await expect(buy).toBeEnabled();

  /* bank the emerald and the same row unlocks */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('coreward.v2') as string);
    s.stock = { emerald: 3 };
    s.best = { depth: 80, haul: 0 };
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = set;
    localStorage.setItem('coreward.v2', JSON.stringify(s));
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await page.locator('#btnShop').dispatchEvent('click');
  await tapBay(page, 'cool');
  await expect(card, 'the tap should have selected the Cooling Rig case')
    .toContainText('Cooling Rig');

  await expect(card.locator('.upmat')).not.toHaveClass(/short/);
  await expect(card.locator('button')).toBeEnabled();
  await card.locator('button').click();

  /* bought: the level went up and the minerals were actually spent */
  await expect(card).toContainText('Lv 4/9');
  await expect(card.locator('.upmat')).toContainText('you have 1');

  /* and the vault reflects it */
  await page.locator('#shopClose').dispatchEvent('click');
  await page.locator('#btnManifest').dispatchEvent('click');
  await expect(page.locator('#vault')).toContainText('Emerald');
  await expect(page.locator('#vault')).toContainText('from 78 m');
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Heat has to be legible as the thing draining the hull, separately from every
   other thing that drains it. That readout is assembled from three modules -
   feel.ts computes the rate, ui.ts renders it, and actions.ts clears the soak -
   so nothing else covers the whole chain.

   Seeded straight to depth rather than dug there: reaching 96 m under
   SwiftShader would dominate the suite, and none of what is asserted here
   depends on how the ship arrived. */
test('heat reads as its own channel on the hull bar, and a flush visibly drops it',
  async ({ page }) => {
    await page.evaluate(() => {
      localStorage.setItem('coreward.v2', JSON.stringify({
        planet: 0, credits: 0, shards: 0,
        up: { drill: 6, cargo: 3, thrust: 4, tank: 4, cool: 7, scan: 4, tow: 0, auto: 0 },
        kit: { coolant: 1, patch: 0, cell: 0 },
        dug: Array.from({ length: 97 }, (_, d) => '6,' + d),
        cargo: {}, weight: 0, px: 6, pd: 96
      }));
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (k === 'coreward.v2') return;
        return set.call(this, k, v);
      };
    });
    /* Driven through the ?debug tick seam rather than by waiting.

       This test used to sit and poll for the soak gauge to fill, and it FAILED
       IN CI while passing everywhere else: soak builds in game time, the CI
       runner has no GPU and falls back to a software rasteriser, so the game
       crawls and thirty seconds of wall clock was not enough game time. It
       reached 24.46% of the 25% it needed. Worse, the poll window and
       Playwright's own test timeout were both 30 s, so the poll could never
       actually use its full budget.

       Waiting on real time to observe a thing measured in game time is the bug,
       not the timeout value. advance() runs fixed steps as fast as the CPU
       allows, so this is now both instant and identical on every machine. */
    await page.goto('/?debug');
    await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

    const widthOf = (sel: string) => page.evaluate((s) =>
      parseFloat((document.querySelector(s) as HTMLElement).style.width) || 0, sel);
    const opacityOf = (sel: string) => page.evaluate((s) =>
      parseFloat((document.querySelector(s) as HTMLElement).style.opacity) || 0, sel);
    /* The clock is stopped from here on, so the HUD only repaints when this
       says so - every assertion below reads a settled frame rather than racing
       one. */
    const advance = (secs: number) =>
      page.evaluate((n) => (window as any).__cw.advance(n), secs);

    /* How much heat the gauge is showing, 0-100.

       The soak used to be a bar and this used to be a width. It is a sector on
       the hull dial now, and the arc carries `pathLength="100"` precisely so
       that the drawn fraction IS the first number of its dash array - the
       rendered value, readable without knowing the radius. Reading the shape
       the player is actually looking at is the point; a data attribute would
       pass just as happily with nothing drawn. */
    const soakShown = () => page.evaluate(() => {
      const el = document.getElementById('soakArc');
      return el ? parseFloat((el.getAttribute('stroke-dasharray') || '0').split(' ')[0]) : -1;
    });

    await page.evaluate(() => (window as any).__cw.stopClock());
    await advance(0.2);

    /* Below the heat depth the hull label names heat as the cause and carries
       the rate. Above it, it must say nothing of the kind. */
    await expect(page.locator('#hullTxt')).toHaveText(/^HULL\s+-\d+\.\d\/s$/, { timeout: 10_000 });
    await expect(page.locator('#hullTxt')).toHaveClass(/hot/);

    /* Sixty seconds of sitting at 96 m, in about a second of real time. */
    await advance(60);
    expect(await soakShown(),
      'a minute at 96 m should visibly build heat soak').toBeGreaterThan(25);

    const soakBefore = await soakShown();
    const emberBefore = await opacityOf('#heat');
    /* textContent, not innerText. The hull legend is an SVG <text> now that the
       gauges are dials, and Playwright's innerText refuses anything that is not
       an HTMLElement - it fails with "Node is not an HTMLElement", which reads
       like a broken selector rather than like a changed element type. */
    const rateBefore = Number(
      (await page.locator('#hullTxt').textContent())!.replace(/[^0-9.]/g, ''));
    expect(rateBefore, 'heat should be doing measurable damage at 96 m').toBeGreaterThan(0);

    await page.locator('#supCoolant').dispatchEvent('pointerdown');
    await expect(page.locator('#toast')).toContainText('heat soak cleared');

    /* The soak is zeroed synchronously; the gauge that shows it is not
       repainted until the next frame, so give it one. */
    await advance(0.2);
    expect(await soakShown(), 'the flush must empty the soak gauge')
      .toBeLessThan(soakBefore / 4);
    expect(await opacityOf('#heat'), 'the ember edges must fall back with it')
      .toBeLessThan(emberBefore);
    expect(Number((await page.locator('#hullTxt').textContent())!.replace(/[^0-9.]/g, '')),
      'the drain rate is what the player actually bought').toBeLessThan(rateBefore);

    /* Still in the zone, so the label keeps naming heat - a flush buys time,
       it does not cool the rock. */
    await expect(page.locator('#hullTxt')).toHaveClass(/hot/);
    expect(await opacityOf('#heat'), 'the zone itself must still register')
      .toBeGreaterThan(0);
    await expect(page.locator('#err')).toHaveClass(/hidden/);
  });

/* The stamp is how a deploy is verified on a phone. If the define pipeline
   breaks the stamp silently reads "dev", and the check becomes worthless. */
test('the build stamp is populated', async ({ page }) => {
  await page.locator('#btnPause').dispatchEvent('click');
  const stamp = await page.locator('#build').innerText();
  expect(stamp).toMatch(/^build [0-9a-f]{7}\+?\s+·/);
  expect(stamp, 'an unbuilt stamp means the Vite define pipeline broke')
    .not.toContain('dev');
});

/* The bug that lanes exist to fix, reproduced end to end.

   Free flight let the ship sit anywhere, and its 0.34 radius then reached into
   the next column. Parked at px 6.4 in a one-cell shaft, the ship overlapped
   column 7 - so the collision reported being blocked by the shaft WALL while
   holding down, the drill was aimed at that wall, and the frame after starting
   it the stop test rebuilt the direction from the ship's rounded position,
   found it diagonal, and cancelled the cut. The ship could then neither move
   nor dig: pressed into its own tunnel, drill stuttering, depth frozen.

   Every existing test seeds the ship exactly on a cell centre, which is why
   the whole suite stayed green through it. This one seeds it off-lane on
   purpose - that is the entire point, so do not "tidy" 6.4 to 6. */
test('a ship parked off-lane still digs instead of snagging on its own shaft', async ({ page }) => {
  await page.evaluate(() => {
    const dug: string[] = [];
    /* a one-cell shaft straight down column 6, stopping at 70 - so row 71 is
       untouched rock and the ship has something to actually drill */
    for (let d = 0; d <= 70; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 4, thrust: 4, tank: 8, cool: 9, scan: 4, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {},
      best: { depth: 300, haul: 0 },
      dug, cargo: {}, weight: 0,
      /* off the centre line by 0.4 of a cell: enough that the ship's radius
         reaches into column 7 and the old collision saw a wall */
      px: 6.4, pd: 66
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#depth')).toContainText('DEPTH 66 m');

  /* Down through the open shaft, then through the rock under it. Reaching 72
     means the ship both moved off-lane without snagging AND completed at least
     one cut it could not previously start. */
  await holdUntil(page, 'down', async () => {
    await expect(
      page.locator('#depth'),
      'the ship never got past its own shaft, which is the snag this test is for'
    ).toContainText(/DEPTH (7[2-9]|[89][0-9]) m/, { timeout: DEEP_ENOUGH });
  });

  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* The deep game, reached in a fraction of a second.

   Everything past about 60 m had never been covered end to end, for a boring
   reason: getting there meant holding a d-pad through a real browser for as
   long as it would actually take to fly it, and a test that costs half a minute
   of wall clock does not get written. Tremors are the clearest case - they
   start at 85 m and fire roughly every 27 seconds, so observing even one of
   them is a minute of real play.

   The ?debug seam makes that 0.4 seconds. advance() runs fixed 1/60 steps as
   fast as the CPU can and only draws the last one, so this is both far faster
   than real time and deterministic in a way holding a button never was.

   This is a "does the mechanic actually happen" test, which is the kind
   CRAFT.md keeps asking for: a mechanic whose condition never comes true fails
   as absence, and absence is exactly what playtesting cannot see. */
test('a tremor actually fires in a real run below the tremor line', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  const out = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    /* Sat well below the tremor line, in a shaft, with the hull and tank
       upgraded enough that nothing else ends the run first. */
    w.g.up.tank = 9; w.g.up.cool = 9; w.g.up.drill = 8;
    w.g.px = 6; w.g.pd = 90;
    w.g.best.depth = 300;
    /* THREE columns wide, and that is load-bearing rather than incidental.

       The first version of this dug a one-cell shaft and saw no tremor at all
       in seventy seconds - which was the game being right. planCollapse()
       re-runs the pathfinder after choosing cells and reverts the whole
       collapse if the ship can no longer reach the pad, and in a corridor one
       cell wide EVERY candidate severs the only route home. Every tremor fired
       and every one was correctly spent as noise.

       A fixture that cannot reach the behaviour it names reads as coverage and
       is worse than no test, so the precondition is asserted below rather than
       assumed. */
    for (let d = 0; d <= 90; d++) for (let x = 5; x <= 7; x++) w.g.dug.add(x + ',' + d);
    const before = w.g.rubble.size;
    /* Two full tremor periods plus the jitter, so "none fired" cannot just
       mean the window was too short. */
    w.advance(70);
    return { before, after: w.g.rubble.size, depth: w.g.pd, hull: w.g.hull,
             dug: w.g.dug.size };
  });

  expect(out.dug, 'nothing was dug, so there was nothing a tremor could collapse')
    .toBeGreaterThan(100);
  expect(out.depth, 'the ship should still be deep, not towed home').toBeGreaterThan(80);
  expect(out.after, 'no tremor collapsed anything in 70 s below the tremor line')
    .toBeGreaterThan(out.before);
});

/* The seam's own contract. If advance() stops being deterministic or stops
   being faster than real time, every test built on it silently becomes a
   different kind of test - so both properties get asserted directly rather
   than assumed by the tests that rely on them. */
test('advance is deterministic and far faster than real time', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  const out = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    const run = () => {
      w.g.px = 6; w.g.pd = 0; w.g.dug.clear(); w.g.cargo = {}; w.g.weight = 0;
      w.R.held = 'down'; w.R.vx = 0; w.R.vy = 0; w.R.digging = null;
      w.advance(12);
      return w.g.pd.toFixed(6) + '/' + w.g.weight.toFixed(4);
    };
    const a = run(), b = run();
    const t0 = performance.now();
    run();
    return { a, b, realMs: performance.now() - t0 };
  });

  expect(out.b, 'the same run gave two different answers').toBe(out.a);
  expect(out.realMs, 'twelve simulated seconds should not take real seconds')
    .toBeLessThan(4000);
});

/* Drilling must not push the ship into the rock it is drilling.

   DIG_ALIGN holds the ship on the centre line of the cut so a tunnel stays on
   the grid, and it does that by writing g.px/g.pd directly - which means the
   collision never sees it and nothing else can catch it being wrong. It aligned
   whichever axis did not already match, and for a dig that is always the wrong
   one: the target cell is a step AHEAD, so the mismatched axis IS the direction
   of the cut. Drilling down from 49 walked the ship to 49.58, well inside the
   cell at 50.

   It went unnoticed because the old lane pull ran while coasting and the
   collision ejected the ship back out of the wall on release - so the bug
   presented as a jerk after every block rather than as a ship inside a rock.

   Asserted on position rather than on the depth readout, because the readout
   rounds: 49.58 displays as "50 m", which is how this first showed up. */
test('drilling holds the ship against the rock, never inside it', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  const out = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    const probe = (dir: string, px: number, pd: number) => {
      w.g.dug.clear();
      for (let d = 0; d <= 49; d++) w.g.dug.add('6,' + d);
      w.g.up.drill = 0; w.g.px = px; w.g.pd = pd; w.g.damage = {};
      w.R.digging = null; w.R.vx = 0; w.R.vy = 0;
      w.R.held = dir;
      /* Sampled every tenth of a second through the cut: the drift was gradual,
         so only looking at the end would miss a smaller version of it. */
      let worstX = px, worstY = pd;
      for (let i = 0; i < 8; i++) {
        w.advance(0.1);
        worstX = Math.max(worstX, w.g.px);
        worstY = Math.max(worstY, w.g.pd);
      }
      w.R.held = null;
      return { worstX, worstY, dug: w.g.dug.has('6,50') };
    };
    return { down: probe('down', 6, 49), right: probe('right', 6, 40) };
  });

  /* A cell spans [n-0.5, n+0.5] and the ship's half-width is 0.34, so resting
     against the face of the cell at 50 puts its centre at 49.16. Anything past
     49.5 has the ship's middle inside the rock. A small margin over 49.16 for
     the skin the collision leaves. */
  expect(out.down.worstY,
    'drilling down drove the ship into the cell it was cutting').toBeLessThan(49.2);
  expect(out.right.worstX,
    'drilling sideways drove the ship into the cell it was cutting').toBeLessThan(6.2);
  /* and the perpendicular axis is still held on the line, which is what
     DIG_ALIGN is actually for */
  expect(out.down.worstX).toBeCloseTo(6, 2);
});

/* The shop and the ship are the same object.

   Playtest: "when you upgrade thrusters and it starts to change the way they
   look, it also changes the way that they look when you're actually playing."

   The station does not draw a preview of the ship, it reparents the REAL one
   onto the deck, and the parts in the display cases are the same geometry the
   hull gets. This test is the guarantee that stays true: buy in the room, and
   the thing flying around underground has changed.

   Asserted on the instance COUNT of the bolt-on hardware, because that is the
   model rather than the picture of it - a screenshot comparison would pass on
   a shop that showed the right thing and bolted on nothing. */
test('hardware bought in the Outfitter is on the ship you undock with', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 400000, shards: 0,
      up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, tow: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 },
      stock: { iron: 99, copper: 99, silver: 99, gold: 99, amethyst: 99, emerald: 99 },
      best: { depth: 300, haul: 0 }, dug: [], rubble: [], cargo: {}, weight: 0,
      px: 6, pd: -1
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* Counts the tank instances the ship is actually drawing. Instanced, so this
     is one mesh whose `count` is the number of tanks bolted on. */
  const tanksOn = () => page.evaluate(() => {
    const w = (window as any).__cw;
    let n = -1;
    w.scene.traverse((o: any) => {
      if (o.isInstancedMesh && o.geometry.type === 'CylinderGeometry' &&
          o.instanceMatrix.count === 4) n = o.count;
    });
    return n;
  });

  expect(await tanksOn(), 'a stock ship carries no tanks').toBe(0);

  await page.locator('#btnShop').dispatchEvent('click');
  await tapBay(page, 'tank');
  await expect(page.locator('#shopCard')).toContainText('Fuel Tank');

  /* Buy up to the level where the first pair appears. */
  for (let i = 0; i < 4; i++) {
    const btn = page.locator('#shopCard button');
    if (await btn.isDisabled()) break;
    await btn.click();
    await page.evaluate(() => (window as any).__cw.advance(0.2));
  }
  const level = await page.evaluate(() => (window as any).__cw.g.up.tank);
  expect(level, 'the purchases did not go through').toBeGreaterThanOrEqual(2);

  /* Still docked: the ship on the deck already wears them, because it IS the
     ship - it is just parented to the station scene right now. */
  const dockedTanks = await page.evaluate(() => {
    const w = (window as any).__cw;
    let found = -1;
    /* bays[0].group.parent IS the station scene, which is where the ship is
       parented while docked */
    w.bays[0].group.parent.traverse((o: any) => {
      if (o.isInstancedMesh && o.geometry.type === 'CylinderGeometry' &&
          o.instanceMatrix.count === 4) found = o.count;
    });
    return found;
  });
  expect(dockedTanks, 'the ship on the deck should already be wearing them').toBeGreaterThan(0);

  await page.locator('#shopClose').dispatchEvent('click');
  await page.evaluate(() => (window as any).__cw.advance(0.3));

  expect(await tanksOn(), 'the tanks bought in the room must be on the ship in play')
    .toBe(dockedTanks);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* The propagated light, end to end.

   The solver itself is covered by golden tests - it is pure. What those cannot
   see is the wiring, and the wiring is where this feature went wrong once
   already: `displaceLikeRock` used to ASSIGN `onBeforeCompile`, so applying it
   after the lighting injection silently threw the lighting away. Nothing
   failed. One block in the world was lit differently from the rock around it,
   and it was found by eye.

   So this asserts the two halves separately. First that every rock program the
   renderer actually compiled still contains the call - that is the guard
   against another injection quietly winning. Then that the field the shader is
   sampling says what it should: the shaft is lit and rock a few cells into the
   mass is not, which is the whole promise of the feature. */
test('the lamp reaches the rock shader, and rock away from a tunnel goes dark', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  const r = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    w.R.held = 'down';
    for (let i = 0; i < 60; i++) w.advance(0.5);
    w.R.held = null;
    w.advance(0.5);

    /* Every compiled program that carries the rock displacement must also
       carry the light. Reading the source back out of WebGL rather than
       trusting the material: what matters is what was compiled. */
    const gl = w.renderer.getContext();
    const progs = Array.from(w.renderer.info.programs || []) as any[];
    const rock = progs.filter((p) => String(p.cacheKey || '').includes('rock'));
    const unlit = rock.filter((p) =>
      !String(gl.getShaderSource(p.fragmentShader) || '').includes('coreLit(vLmPos)'));

    /* And every uniform the lighting DECLARES has to actually be supplied.

       Declaring one and forgetting to hand it over is not a compile error and
       not a warning: GLSL happily gives a missing sampler texture unit zero and
       a missing vector all zeroes, so the shader runs and quietly ignores that
       part of the model. It cost an afternoon exactly once - the shadow fan was
       declared, never bound, and the terrain rendered with no shadows at all
       while the haze, which lists its uniforms by hand, worked perfectly. */
    const props = w.renderer.properties;
    const missing: string[] = [];
    const seen = new Set<any>();
    w.scene.traverse((o: any) => {
      const m = o.material;
      if (!m || seen.has(m) || !o.isInstancedMesh || m.type !== 'MeshStandardMaterial') return;
      seen.add(m);
      const stored = props.get(m).uniforms;
      if (!stored || !stored.uLmMap) return;          /* not a lightmapped material */
      const prog = props.get(m).currentProgram;
      if (!prog) return;
      const src = String(gl.getShaderSource(prog.fragmentShader) || '');
      const declared = (src.match(/uniform\s+\w+\s+(uLm\w+)\s*;/g) || [])
        .map((d: string) => d.replace(/.*\s(uLm\w+)\s*;/, '$1'));
      for (const name of declared) if (!stored[name]) missing.push(name);
    });

    /* And the field itself, read straight off the texture the shader samples.
       Column index is x + 1, because the grid carries a border column. */
    const img = w.lmDebug.U.uLmMap.value.image;
    const data = img.data;
    const COLS = 15;
    /* Texels per cell, derived rather than assumed. The grid holds one value
       per cell but the TEXTURE carries several texels per cell, so that
       bilinear filtering only softens the seam at a cell edge instead of
       smearing across a whole cell - and that ratio has changed once already.
       Reading it off the image means the next change does not land here as a
       mystery. */
    const SUB = img.width / COLS;
    /* The window is always centred on the ship, so the ship's row in the grid
       is a constant - 17 rows down from the top of it. Sampled at the middle
       of each cell's block, which is the value the cell actually holds. */
    const ROW = 17, x = Math.round(w.g.px);
    const mid = (SUB / 2) | 0;
    const at = (dx: number) =>
      data[((ROW * SUB + mid) * img.width + (x + 1 + dx) * SUB + mid) * 4];
    return {
      rockPrograms: rock.length, unlit: unlit.length,
      missing: Array.from(new Set(missing)),
      depth: w.g.pd, shaft: at(0), wall: at(1), two: at(2), four: at(4)
    };
  });

  /* Deliberately shallow. Caves start at 26 m, and "four cells into the mass"
     only means anything while the mass is solid - a cave there would be lit
     for the right reason and fail this for the wrong one. */
  expect(r.depth, 'the run has to get underground for any of this to mean anything')
    .toBeGreaterThan(12);
  expect(r.depth, 'and has to stay above the cave line for the rock assertions to hold')
    .toBeLessThan(26);
  expect(r.rockPrograms, 'no rock programs compiled - the terrain never drew')
    .toBeGreaterThan(0);
  expect(r.unlit, r.unlit + ' of ' + r.rockPrograms +
    ' rock programs lost the light injection - something assigned onBeforeCompile' +
    ' instead of chaining onto it').toBe(0);

  expect(r.missing, 'the lighting shader declares ' + r.missing.join(', ') +
    ' and nothing supplies them, so that part of the model is silently inert')
    .toEqual([]);

  /* The shaft the ship is sitting in is fully lit; its wall catches the lamp;
     four cells into untouched rock is nearly nothing.

     The last one is asserted on what reaches the SCREEN, because the shader
     squares this field before applying it and a threshold on the raw byte is a
     threshold on an intermediate value nobody sees. The raw version of this
     line failed the moment the rock gradient was retuned to exactly what a
     playtest asked for, which is the wrong way round for a test to behave. */
  const onScreen = (b: number) => Math.pow(b / 255, 2);
  expect(r.shaft, 'the cell the ship is in').toBeGreaterThan(240);
  expect(r.wall, 'the wall of the shaft').toBeGreaterThan(120);
  expect(onScreen(r.four), 'four cells into solid rock, as displayed')
    .toBeLessThan(0.08);
  expect(r.two, 'two cells in is darker than one').toBeLessThan(r.wall);
});
