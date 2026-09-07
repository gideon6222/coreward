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
  await expect(page.locator('#upgrades .up')).toHaveCount(8);
  /* supplies are a separate section, and each one renders a buy row */
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

  /* get underground, where the window is full of terrain */
  await holdUntil(page, 'down', async () => {
    await expect(page.locator('#depth')).not.toContainText('DEPTH 0 m', { timeout: DEEP_ENOUGH });
    await expect(page.locator('#cargoTxt')).not.toHaveText(/^0\.0 /, { timeout: DEEP_ENOUGH });
  });

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
  expect(await fuelPct(), 'spending a fuel cell must actually add fuel').toBeGreaterThan(before);
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
