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

const DEEP_ENOUGH = 30_000;

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
  await page.locator('#btnShop').dispatchEvent('click');
  await expect(page.locator('#shop')).not.toHaveClass(/hidden/);
  await expect(page.locator('#upgrades .up')).toHaveCount(10);
  /* Four named counters, and on a fresh save some stock is visibly sealed -
     seeing that there IS an Ordnance counter is most of the reason to keep
     going down, so its absence would be a real regression rather than a
     cosmetic one. */
  await expect(page.locator('#upgrades .counter')).toHaveCount(4);
  await expect(page.locator('#upgrades .up.sealed').first()).toContainText('Sealed until');
  /* supplies are a separate section under their own counter */
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
   is module-scoped and not reachable from here. */
const DRAW_CALL_BUDGET = 70;

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

  const fuelPct = () => page.evaluate(() =>
    parseFloat((document.querySelector('#fuelBar') as HTMLElement).style.width));

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

     Counted in bursts rather than timed, because SwiftShader under a full
     suite run makes the game advance in slow motion and any fixed number of
     fixed-length bursts becomes a coin flip. A slower machine simply needs
     more bursts; what it can never do is finish the block in one. */
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
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.locator('#depth')).toContainText('DEPTH 49 m');

  const key = page.locator('#dpad .k[data-dir=down]');
  const stillAt49 = async () =>
    (await page.locator('#depth').innerText()).includes('DEPTH 49 m');

  let bursts = 0;
  while (await stillAt49() && bursts < 30) {
    await key.dispatchEvent('pointerdown');
    await page.waitForTimeout(600);
    await key.dispatchEvent('pointerup');
    await page.waitForTimeout(220);
    bursts++;
  }

  expect(bursts, 'one 0.6 s burst finished 2.5 s of granite, so this is not ' +
    'testing interruption at all').toBeGreaterThan(1);
  expect(bursts, 'thirty interrupted bursts did not finish the block - the ' +
    'damage is being thrown away when the drill stops').toBeLessThan(30);
  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

/* Ordnance: the shared power meter, and what each ability actually does.

   Four modules meet here - the meter in feel.ts, the shapes in config.ts, the
   break routine in actions.ts, the buttons in ui.ts - and none of them can see
   whether the others agree. */
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
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* Counted after the reload, not before it: the reload wipes the page's
     globals, and an increment on an undefined counter is NaN rather than an
     error - which reads as a failed assertion about the game. */
  await page.evaluate(() => {
    (window as any).__records = 0;
    const el = document.querySelector('#toast') as HTMLElement;
    new MutationObserver(() => {
      if ((el.textContent || '').includes('New record')) (window as any).__records++;
    }).observe(el, { childList: true, characterData: true, subtree: true });
  });

  /* dig well past the 14 m record */
  await holdUntil(page, 'down', async () => {
    await expect(page.locator('#depth'))
      .toContainText(/DEPTH (2[5-9]|[3-9][0-9]) m/, { timeout: DEEP_ENOUGH });
  });

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
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  await page.locator('#btnShop').dispatchEvent('click');
  const cool = page.locator('#upgrades .up').filter({ hasText: 'Cooling Rig' });
  const buy = cool.locator('button');

  /* half a million credits and it is still refused */
  await expect(buy).toBeDisabled();
  await expect(cool.locator('.upmat')).toHaveClass(/short/);
  await expect(cool.locator('.upmat')).toContainText('2 Emerald');
  await expect(cool.locator('.upmat'), 'a requirement you cannot meet must say where to go')
    .toContainText('from 78 m');

  /* levels inside the free tier are still pure credits */
  const drill = page.locator('#upgrades .up').filter({ hasText: 'Drill Bit' });
  await expect(drill.locator('.upmat')).toHaveCount(0);
  await expect(drill.locator('button')).toBeEnabled();

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

  const cool2 = page.locator('#upgrades .up').filter({ hasText: 'Cooling Rig' });
  await expect(cool2.locator('.upmat')).not.toHaveClass(/short/);
  await expect(cool2.locator('button')).toBeEnabled();
  await cool2.locator('button').click();

  /* bought: the level went up and the minerals were actually spent */
  await expect(cool2).toContainText('Lv 4/9');
  await expect(cool2.locator('.upmat')).toContainText('you have 1');

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
    await page.reload();
    await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

    const widthOf = (sel: string) => page.evaluate((s) =>
      parseFloat((document.querySelector(s) as HTMLElement).style.width) || 0, sel);
    const opacityOf = (sel: string) => page.evaluate((s) =>
      parseFloat((document.querySelector(s) as HTMLElement).style.opacity) || 0, sel);

    /* Below the heat depth the hull label names heat as the cause and carries
       the rate. Above it, it must say nothing of the kind. */
    await expect(page.locator('#hullTxt')).toHaveText(/^HULL\s+-\d+\.\d\/s$/, { timeout: 10_000 });
    await expect(page.locator('#hullTxt')).toHaveClass(/hot/);

    /* soak builds while you sit there - polled, never slept on, because the
       frame loop advances in slow motion on a machine without a GPU */
    await expect.poll(() => widthOf('#soakBar'), { timeout: DEEP_ENOUGH })
      .toBeGreaterThan(25);

    const soakBefore = await widthOf('#soakBar');
    const emberBefore = await opacityOf('#heat');
    const rateBefore = Number(
      (await page.locator('#hullTxt').innerText()).replace(/[^0-9.]/g, ''));
    expect(rateBefore, 'heat should be doing measurable damage at 96 m').toBeGreaterThan(0);

    await page.locator('#supCoolant').dispatchEvent('pointerdown');
    await expect(page.locator('#toast')).toContainText('heat soak cleared');

    /* Same polling discipline as above: the soak is zeroed synchronously, the
       gauge that shows it is not repainted until the next frame. */
    await expect
      .poll(() => widthOf('#soakBar'), { timeout: 10_000, message: 'the flush must empty the soak gauge' })
      .toBeLessThan(soakBefore / 4);
    await expect
      .poll(() => opacityOf('#heat'), { timeout: 10_000, message: 'the ember edges must fall back with it' })
      .toBeLessThan(emberBefore);
    await expect
      .poll(async () => Number((await page.locator('#hullTxt').innerText()).replace(/[^0-9.]/g, '')),
        { timeout: 10_000, message: 'the drain rate is what the player actually bought' })
      .toBeLessThan(rateBefore);

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
