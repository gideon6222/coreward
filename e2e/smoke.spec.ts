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

/* Hold a direction and run GAME time until a condition holds, rather than
   waiting on the wall clock.

   `holdUntil` above presses the same button and then waits for real seconds to
   pass, which is fine when there is a GPU and marginal when there is not. CI
   has no GPU, falls back to a software rasteriser, and the suite has grown a
   1400-mote dust field and per-world weather since these budgets were set: the
   sell test needed more than its 45 seconds to fly back up to the pad and went
   red on CI while passing locally in a third of the time.

   PIPELINE.md already names the fix and it is not a bigger timeout: *"anything
   that accumulates over GAME time belongs on advance(), where a slow machine
   costs nothing."* The button is still pressed with a real pointer event, so
   the input path is exercised exactly as before; only the waiting changes.

   Advanced in one-second slices with a check between them, so a hold cannot
   overshoot by more than a second - which matters for the directions where
   holding too long drives into something. */
async function holdSeam(
  page: Page, dir: string, check: () => Promise<boolean>, maxSecs = 90
) {
  const key = page.locator(`#dpad .k[data-dir=${dir}]`);
  await key.dispatchEvent('pointerdown');
  let ok = false;
  try {
    for (let t = 0; t < maxSecs && !ok; t++) {
      ok = await check();
      if (!ok) await page.evaluate(() => (window as any).__cw.advance(1));
    }
    ok = ok || await check();
  } finally {
    await key.dispatchEvent('pointerup');
    await page.waitForTimeout(60);
  }
  if (!ok) {
    throw new Error('held ' + dir + ' for ' + maxSecs +
      ' s of GAME time and the condition never held - this is a real failure, not a slow machine');
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
    /* Walk to the aisle it is in first.

       The shop is four departments and only one is in the room at a time, so a
       case in ORDNANCE is not merely off screen from RIG - it is not in the
       scene at all, and its world position is wherever it was last parked. The
       glide is run out on the tick seam rather than waited for. */
    const up = w.upgradeOf ? w.upgradeOf(k) : null;
    if (up) {
      const want = w.aisleOf(k);
      if (want > 0 && want !== w.currentAisle()) { w.goAisle(want); w.advance(2); }
    }
    if (!bay.group.visible) return { err: k + ' is not stocked, so it has no case in the room' };
    const p = bay.group.getWorldPosition(new w.camera.position.constructor());
    p.project(w.stationCamera);
    const x = Math.round((p.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-p.y * 0.5 + 0.5) * window.innerHeight);
    const el = document.elementFromPoint(x, y);
    if (!el) return { err: 'nothing at ' + x + ',' + y };
    const before = { mode: w.g.mode, sel: w.selectedBay() };
    /* Down AND up, at the same point.

       A tap and a swipe start identically, so the shop decides which one it
       was on the way UP: anything that moved more than 42 px sideways walks to
       the next aisle and anything else picks a case. A test that only sends
       pointerdown is sending half a gesture and gets neither. */
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    w.advance(0.3);
    return { at: x + ',' + y, on: el.id || el.className, picked: w.pickBay(x, y),
             selected: w.selectedBay(), before };
  }, key);
  expect(r.err, String(r.err)).toBeUndefined();
  expect(r.selected, 'tapped "' + key + '" at ' + r.at + ' over "' + r.on +
    '"; raycast said "' + r.picked + '"; before=' + JSON.stringify(r.before)).toBe(key);
}

/* Open the drawer, pick a crate, press BUY. The whole path a thumb takes, so a
   spec asserting "a supply can be bought" is asserting that and not that a
   function exists. */
async function buyKit(page: Page, key: string) {
  await page.evaluate((k) => {
    const w = (window as any).__cw;
    if (!w.drawerOpen()) w.roomDrawer().setOpen(true);
    /* No `advance()` here, and that is not tidiness.

       `advance` calls `stopClock()` and never gives it back, which is fine for
       a spec that drives every remaining step itself and fatal for one that
       then holds a d-pad in real time - the game simply stops, with the mode
       still 'play' and the key still held, which is about as misleading as a
       symptom gets. It cost a run to find and it is the trap already written
       down beside `startClock` in loop.ts.

       Nothing here needs time to pass: the selection is set directly rather
       than raycast, so the drawer's slide does not have to have finished. */
    w.selectBay(k);
    w.buildShop();
  }, key);
  await page.locator('#shopCard .cbuy').click();
}

const num = async (loc: Locator) =>
  Number((await loc.innerText()).replace(/[^0-9.]/g, ''));

test.beforeEach(async ({ page }) => {
  /* fail loudly on anything the page throws, rather than letting a broken
     module surface later as a confusing assertion failure */
  page.on('pageerror', (e) => {
    throw new Error('uncaught page error: ' + e.message);
  });
  /* ?debug for every spec, not just the ones that reach into the game.

     The seam only ADDS `window.__cw`; it changes no behaviour, and nothing
     asserts its absence. What it buys is that enterGame can run the way in on
     the tick seam instead of waiting out a four-and-a-half second descent in
     real time - which, times twenty-five specs, took the suite from 2.7
     minutes to 5.0 and would have taken CI past twelve. Same reason the deep
     holds moved off the wall clock: a slow machine must not be what a test is
     measuring. */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
});

/* Get past the way in.

   Every spec below boots and starts driving, and as of the title screen there
   is now something in front of that. Dismissed HERE rather than bypassed with
   a flag, deliberately: a flag would mean the one path every player takes is
   the one path nothing ever exercises. This way the title or the intro is
   crossed on all twenty-five runs.

   A fresh Playwright context has no save, so the normal answer is the intro;
   a spec that seeds a save first gets the title. Both are handled because
   which one appears is not this helper's business. */
async function enterGame(page: Page) {
  const intro = page.locator('#intro');
  const title = page.locator('#title');
  if (!(await intro.getAttribute('class'))?.includes('hidden')) {
    /* The skip button only exists on a run started after the game has been
       beaten - a first run watches it, which is the whole point of it. So a
       test cannot rely on the button being there.

       Tapping steps a caption on any run, and running out of captions hands
       over to the descent, so tapping through is the route that always works.
       One more tap than there are beats, because the last one is what ends
       them. */
    const skip = page.locator('#introSkip');
    const canSkip = !(await skip.getAttribute('class'))?.includes('hidden');
    if (canSkip) {
      await skip.dispatchEvent('click');
    } else {
      for (let i = 0; i < 10; i++) {
        await intro.dispatchEvent('click');
        if ((await intro.getAttribute('class'))?.includes('hidden')) break;
      }
    }
  } else if (!(await title.getAttribute('class'))?.includes('hidden')) {
    /* CONTINUE when there is a save, NEW GAME when there is not - and NEW GAME
       from a fresh context needs no confirm, because there is nothing to
       lose. */
    const cont = page.locator('#btnContinue');
    /* Disabled rather than hidden now - CONTINUE is greyed on a save-less
       run, not removed. */
    const useCont = !(await cont.isDisabled());
    await page.locator(useCont ? '#btnContinue' : '#btnNewGame').dispatchEvent('click');
    if (!useCont) await enterGame(page);
  }
  /* Both routes in now end by FLYING DOWN to the world, which is four and a
     half seconds of game time before play starts. Waiting for that on the wall
     clock is the mistake that put CI red the last time - the runner has no GPU,
     so game seconds cost more real ones there than here. Run it out on the
     seam where it is available. */
  /* Advanced UNTIL it is done, not for a fixed guess. The first version ran
     advance(7) against a launch of 2.6 s and a descent of 4.5 s, which is 7.1 -
     it missed by a tenth of a second and hung on the poll. A number that has
     to be kept in step with two constants in another file will fall out of
     step with them; asking whether it has finished cannot. */
  await page.evaluate(async () => {
    const cw = (window as any).__cw;
    if (!cw || !cw.advance) return;
    /* Past the touchdown as well as the flight: the ship now comes down onto
       the pad in the game's own scene before the controls wake, so `crossing`
       clearing is no longer the same thing as being able to play. */
    const busy = () => document.body.classList.contains('crossing') ||
      (window as any).__cw.g.mode !== 'play';
    for (let i = 0; i < 40 && busy(); i++) {
      cw.advance(1);
      await new Promise((r) => requestAnimationFrame(r));
    }
    /* HAND THE CLOCK BACK. advance() stops the real-time loop so a caller can
       drive it, and every spec after this one holds a d-pad and waits for the
       world to move. Without this the game is frozen from here on, which looks
       exactly like a game that will not move - six specs failed that way at
       once. */
    cw.startClock();
  });

  /* Waited for on a DOM signal, not on the debug seam.

     `body.crossing` is set while any of this is on screen and removed when the
     game actually starts, and it is there on every page. The seam is not: half
     these specs load plain '/', where `__cw` is undefined - and the first
     version of this polled `__cw?.g?.mode ?? 'play'`, which on those pages is
     the string 'play' before anything has happened. It returned instantly
     while the ship was still four seconds from the ground, and the click that
     followed went into a game that had not started yet.

     A fallback that makes an assertion vacuously true is worse than no
     assertion: it reports success for the state it cannot see. */
  await expect
    .poll(() => page.evaluate(() => document.body.classList.contains('crossing')),
          { timeout: 25_000 })
    .toBe(false);
  await expect
    .poll(() => page.evaluate(() => (window as any).__cw?.g?.mode ?? 'play'),
          { timeout: 10_000 })
    .toBe('play');

  /* Asserted AFTER the wait, not before it. Tapping through the captions sets
     the descent going but the screen is not hidden until the next frame runs,
     so checking straight after the last tap failed on a flag that had not been
     read yet - a race against the frame loop rather than a real state. */
  await expect(intro, 'the intro never closed').toHaveClass(/hidden/);
  await expect(title, 'the title never closed').toHaveClass(/hidden/);
}

test('boots without hitting the error overlay', async ({ page }) => {
  /* the overlay is the game's own last-resort reporter; if it is visible,
     something threw before we got here */
  await expect(page.locator('#err')).toHaveClass(/hidden/);
  /* The chip names the REGION the ship is standing in, not the planet. It named
     the planet until W6, and a literal 'Verdax' here was fine while a planet
     was a place you flew to; with one world it would have been asserting that
     the chip says the same thing for the whole game, which is the bug rather
     than the property.

     Derived from the pad's own region so the assertion survives the boundaries
     being reseeded - they wander, so the name at the pad is a fact about the
     world and not a constant anybody should type out. */
  const here = await page.evaluate(() => {
    const w = (window as any).__cw;
    return w.regionName(w.padRegion());
  });
  await expect(page.locator('#planet')).toHaveText(new RegExp('^' + here));
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
  /* On the tick seam rather than the wall clock - see holdSeam. This is the
     test that went red on CI while passing locally: flying back up to the pad
     took longer than its 45-second budget on a runner with no GPU. */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);

  const weight = () => page.evaluate(() => (window as any).__cw.g.weight);
  const credits = () => page.evaluate(() => (window as any).__cw.g.credits);

  await holdSeam(page, 'down', async () => (await weight()) > 0);
  expect(await num(page.locator('#haul')), 'digging should produce a haul').toBeGreaterThan(0);

  /* The sale itself, not the depth readout. The HUD rounds, so it shows
     "DEPTH 0 m" while the ship is still a cell above the pad - credits
     changing is the unambiguous signal that the pad was touched. */
  await holdSeam(page, 'up', async () => (await credits()) > 0);

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
  await enterGame(page);
  /* The ship has to be DOWN first. Landing puts the game in 'settle' mode and
     the shop button refuses clicks until it is 'play' - so a click sent during
     the descent is silently dropped and everything after it tests a shop that
     never opened. */
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });
  await page.locator('#btnShop').dispatchEvent('click');
  await expect(page.locator('#shop')).not.toHaveClass(/hidden/);
  /* Wait for the room's models before touching anything.

     The Outfitter now fetches its props on the first visit and the shelf shows
     one group once they land, so a tap sent before that lands on a shelf that
     is about to re-lay itself. The game handles this correctly - the mode is
     frozen at dock, so what is on screen stays put - but a test that taps
     during the fetch is testing the fetch, not the shop. */
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });

  /* The Outfitter is a room: one display case per upgrade, and the ship itself
     reparented onto the deck. Asserting the case COUNT is the equivalent of the
     old row count - it catches an upgrade that stops being reachable. */
  const bays = await page.evaluate(() => (window as any).__cw.bays.length);
  /* Against the number of upgrades, not against a literal. The literal said 10
     and the message said "every upgrade needs a case to stand in", which are
     two different claims - and when the shop went from ten upgrades to fifteen
     it failed for the wrong reason and would have been fixed by editing the
     number. The property is the one worth keeping: an upgrade with no case is
     an upgrade nobody can buy. */
  const upgrades = await page.evaluate(() => (window as any).__cw.upgradeCount);
  expect(bays, 'every upgrade needs a case to stand in').toBe(upgrades);
  expect(upgrades, 'the shop is empty').toBeGreaterThan(5);
  /* Nothing picked yet, so the card is empty and the hint is showing. */
  await expect(page.locator('#shopHint')).not.toHaveClass(/gone/);

  /* Tapping a case fills the card - and a sealed one still says why. */
  await tapBay(page, 'drill');
  await expect(page.locator('#shopCard')).toContainText('Drill Bit');
  await expect(page.locator('#shopHint')).toHaveClass(/gone/);
  /* THE sealed case, not a named one. The shelf only stocks what you can buy
     plus the single next thing you cannot - so 'auto' at 65 m is simply not in
     the room on a fresh save, and naming it here asserted a layout rather than
     the property. The property is that whatever teaser IS shown explains
     itself, because that one case is the entire reason to go deeper. */
  const sealed = await page.evaluate(() => (window as any).__cw.sealedKey());
  expect(sealed, 'nothing on the shelf is sealed, so there is no reason to go deeper')
    .toBeTruthy();
  await tapBay(page, sealed as string);
  await expect(page.locator('#shopCard'), 'a sealed case must say what unlocks it')
    .toContainText('Sealed until');

  /* The supplies are not on this screen at all any more.

     They were a row of chips in the tray, asserted here by count. They are
     crates in a drawer under the counter now - found by opening caches rather
     than bought from the first minute - so the assertion that matters is that
     the grid is GONE, and that one case exists per supply ready to be revealed
     as each is found. Asserted against the real count for the same reason as
     the cases above: a literal goes stale the day the kit changes size. */
  await expect(page.locator('#supplies')).toHaveCount(0);
  const supplies = await page.evaluate(() => (window as any).__cw.supplyCount);
  const crates = await page.evaluate(() => (window as any).__cw.kitCases.length);
  expect(crates, 'every consumable needs a crate to appear in').toBe(supplies);
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
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);

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
      up: { drill: 6, cargo: 3, thrust: 4, tank: 6, cool: 7, scan: 5, scrub: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {},
      /* The shaft has to be under the SHIP. This dug column 6 and parked the
         ship at 30, which leaves it sealed in solid rock. */
      dug: Array.from({ length: 402 }, (_, d) => '30,' + d),
      rubble: [], cargo: {}, weight: 0, px: 30, pd: 400
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);

  /* a real click, because Chrome will not build an AudioContext without one */
  await page.locator('#dpad .k[data-dir=left]').click();

  const seen = () => page.evaluate(() => (window as any).__gains as number[]);
  const near = (xs: number[], v: number) => xs.some((x) => Math.abs(x - v) < 1e-6);

  /* 400 m, and the number is chosen against the RAMP rather than against the
     line.

     The score asks for the heat layer at `heatT(pd, line, (core - line) * 0.55)`
     - a ramp that scales with the world - so reaching full volume needs
     199 + 139 = 338 m, not merely crossing 199. At 300 the layer was at 0.063
     of its 0.075 and this waited twenty seconds for a number it was never
     going to see. It was 96 m against a 58-metre planet, where the same
     arithmetic put full volume at 49.

     400 is past that and past the unstable band at 253, so both layers should
     be asked for. */
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
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);

  /* Seeded to the worst case rather than dug to a shallow one.

     The original version dug down for a few seconds, which by now measures a
     window containing three or four block types. Everything added since -
     rubble, caches, the parallax layers, the headlight, the record marker -
     shows up deep and in an opened-out chamber, and each distinct block id is
     its own pool and its own pair of draw calls. Measuring the easy case is
     how a budget silently stops being a budget. */
  await page.evaluate(() => {
    const dug: string[] = [];
    /* 300 m, not 96. The heat line moved from 38 m to 199 m when the twelve
       planets folded into one 452-metre world, so a fixture that sits at 96 is
       in cool rock and can only assert that nothing is draining. */
    for (let d = 0; d <= 300; d++) dug.push('30,' + d);
    for (let x = 25; x <= 35; x++) for (let d = 292; d <= 303; d++) dug.push(x + ',' + d);
    const rubble = ['29,294', '31,294', '28,296', '32,296', '30,290', '33,298', '27,299', '26,295'];
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 3, credits: 0, shards: 0,
      up: { drill: 9, cargo: 9, thrust: 9, tank: 9, cool: 7, scan: 9, scrub: 0, auto: 0 },
      kit: { coolant: 2, patch: 3, cell: 3 }, stock: {},
      best: { depth: 40, haul: 0 },
      dug: dug.filter((k) => !rubble.includes(k)), rubble,
      cargo: {}, weight: 0, px: 30, pd: 300
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);
  await expect(page.locator('#depth')).toContainText('DEPTH 300 m');

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
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);

  /* Buy the two out of the drawer rather than off a grid.

     The Outfitter will not sell a consumable that has never been held, so this
     has to say it has held them - which is the feature, stated by a test that
     previously just bought whatever it liked. `buyKit` opens the drawer, picks
     the crate and presses the card's button, which is the whole path a thumb
     takes. */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    for (const k of ['coolant', 'cell']) if (!w.g.foundKit.includes(k)) w.g.foundKit.push(k);
  });
  await page.locator('#btnShop').dispatchEvent('click');
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });
  await buyKit(page, 'coolant');
  await expect(page.locator('#shopCard')).toContainText('Coolant Flush');
  await expect(page.locator('#shopCard')).toContainText('1/2');
  await buyKit(page, 'cell');
  await expect(page.locator('#shopCard')).toContainText('Fuel Cell');
  await expect(page.locator('#shopCard')).toContainText('1/3');
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

  /* Hold until the TANK has moved, which is the thing the assertion after this
     actually needs, rather than until a depth that stands in for it.

     M3 cut the fuel a cell of drilling costs by about two thirds, so a single
     cut no longer rounds the gauge off 100% and the old "not DEPTH 0 m" was
     satisfied long before the fuel was. Asking for ten metres instead fixed it
     on this desk and failed on CI, which reached seven in the same wall-clock
     window because it has no GPU - which is this repo's own recorded lesson:
     waiting on real time for something measured in game time is the bug rather
     than the timeout. Waiting on the precondition itself is immune to both. */
  await holdUntil(page, 'down', async () => {
    await expect.poll(fuelPct, { timeout: DEEP_ENOUGH }).toBeLessThan(100);
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
    for (let d = 0; d <= 44; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 0, thrust: 4, tank: 8, cool: 9, scan: 4, scrub: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {},
      best: { depth: 300, haul: 0 },
      /* Six amethyst at 7 kg is 42 of the 45 kg a stock hold carries: room for
         nothing worth having. Written as the ore rather than as a number so
         that a retune of the hold moves this with it. */
      dug, cargo: { amethyst: 6 }, weight: 42, px: 6, pd: 44
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  /* ?debug, not a bare reload: holdSeam below needs the tick seam, and a
     bare reload keeps the beforeEach's plain '/' where __cw does not exist. */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);
  /* Read the cap rather than restating it. It moved from 60 to 45 in M3 and
     both of these tests failed on the literal, which is the only thing they
     were really asserting about it. */
  const cap = await page.evaluate(() => (window as any).__cw.S.cargoCap());
  await expect(page.locator('#cargoTxt')).toHaveText('42.0 / ' + cap + ' KG');

  /* The drill must keep working. On the tick seam - see holdSeam - because
     this needs seventy-five metres of drilling and that is game time, which is
     the one thing a slow runner must not be charged for. */
  await holdSeam(page, 'down',
    async () => (await page.evaluate(() => (window as any).__cw.g.pd)) >= 50);
  const kg = () => page.evaluate(() =>
    parseFloat((document.querySelector('#cargoTxt') as HTMLElement).innerText));
  expect(await kg(), 'the hold must never exceed its cap').toBeLessThanOrEqual(cap);

  await expect(page.locator('#err')).toHaveClass(/hidden/);
});

test('ore left behind is picked up by flying back through it', async ({ page }) => {
  await page.evaluate(() => {
    const dug: string[] = [];
    for (let d = 0; d <= 44; d++) dug.push('6,' + d);
    dug.push('5,44', '4,44');
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 0, thrust: 4, tank: 8, cool: 9, scan: 4, scrub: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [],
      drops: { '5,44': 'amethyst', '4,44': 'gold' },
      best: { depth: 300, haul: 0 },
      dug, cargo: {}, weight: 0, px: 6, pd: 44
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.reload();
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);
  await expect(page.locator('#cargoTxt')).toHaveText(
    '0.0 / ' + (await page.evaluate(() => (window as any).__cw.S.cargoCap())) + ' KG');

  await holdUntil(page, 'left', async () => {
    await expect
      .poll(() => page.evaluate(() => Number(
        (document.querySelector('#haul') as HTMLElement).innerText.replace(/[^0-9]/g, ''))),
        { timeout: DEEP_ENOUGH })
      .toBeGreaterThan(1900);
  });

  /* Amethyst is 1400 and gold 660, so anything over 1900 means BOTH drops were
     collected rather than one of them plus rock.

     1200 before round seven, when amethyst was 900 - and the threshold had to
     move with the value, because at 1400 the amethyst alone cleared the old
     bar and the poll stopped after one pickup. A threshold that a single item
     can satisfy is not testing "both". */
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
      up: { drill: 0, cargo: 5, thrust: 3, tank: 9, cool: 9, scan: 3, scrub: 0, auto: 0, bomb: 0, laser: 0 },
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
  await enterGame(page);
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
      up: { drill: 2, cargo: 5, thrust: 1, tank: 6, cool: 0, scan: 3, scrub: 0, auto: 0, bomb: 2, laser: 2 },
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
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);

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
      up: { drill: 8, cargo: 3, thrust: 5, tank: 6, cool: 4, scan: 6, scrub: 0, auto: 0 },
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
  await enterGame(page);

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
    /* Thirty slices, not eighty. M5 ended leg 0 at 58 m with heat from 38, so
       forty seconds of holding down now drills into the heat zone without a
       rig and the run ends with the ship lost - which is the game working, and made this
       test about survival rather than about the record announcement. */
    for (let i = 0; i < 30; i++) {
      w.advance(0.5);
      await new Promise((r) => setTimeout(r, 0));
    }
    w.R.held = null;
    w.advance(0.3);
  });
  await expect(page.locator('#depth')).toContainText(/DEPTH (1[5-9]|[2-9][0-9]) m/);

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
      up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 3, scan: 0, scrub: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 },
      stock: {},
      /* Deep enough that the Cooling Rig is on the shelf at all - the depth
         gate and the mineral gate are separate walls and this test is about
         the second one. 135, not 80: round seven moved emerald from 78 m to
         130 m and the row followed it, which is the whole point of the two
         gates pointing at the same place. */
      best: { depth: 460, haul: 0 },
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
  await enterGame(page);

  await page.locator('#btnShop').dispatchEvent('click');
  await tapBay(page, 'cool');
  const card = page.locator('#shopCard');
  const buy = card.locator('button');

  /* half a million credits and it is still refused */
  await expect(card).toContainText('Cooling Rig');
  await expect(buy).toBeDisabled();
  await expect(card.locator('.upmat')).toHaveClass(/short/);
  await expect(card.locator('.upmat')).toContainText('2 Magmite');
  await expect(card.locator('.upmat'), 'a requirement you cannot meet must say where to go')
    .toContainText('from 210 m');

  /* levels inside the free tier are still pure credits */
  await tapBay(page, 'drill');
  await expect(card).toContainText('Drill Bit');
  await expect(card.locator('.upmat')).toHaveCount(0);
  await expect(buy).toBeEnabled();

  /* bank the emerald and the same row unlocks */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('coreward.v2') as string);
    s.stock = { magmite: 3 };
    s.best = { depth: 460, haul: 0 };
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
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);
  await page.locator('#btnShop').dispatchEvent('click');
  await tapBay(page, 'cool');
  await expect(card, 'the tap should have selected the Cooling Rig case')
    .toContainText('Cooling Rig');

  await expect(card.locator('.upmat')).not.toHaveClass(/short/);
  await expect(card.locator('button')).toBeEnabled();
  await card.locator('button').click();

  /* bought: the level went up and the minerals were actually spent */
  await expect(card).toContainText('Lv 4/7');
  await expect(card.locator('.upmat')).toContainText('you have 1');

  /* and the vault reflects it */
  await page.locator('#shopClose').dispatchEvent('click');
  await page.locator('#btnManifest').dispatchEvent('click');
  await expect(page.locator('#vault')).toContainText('Magmite');
  await expect(page.locator('#vault')).toContainText('from 210 m');
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
        up: { drill: 6, cargo: 3, thrust: 4, tank: 4, cool: 7, scan: 4, scrub: 0, auto: 0 },
        kit: { coolant: 1, patch: 0, cell: 0 },
        /* Below the heat line, which is 199 m in the one world - it was 38 m
           when this fixture was written to sit at 48. */
        dug: Array.from({ length: 261 }, (_, d) => '30,' + d),
        cargo: {}, weight: 0, px: 30, pd: 260
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
    await enterGame(page);

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
    /* a one-cell shaft straight down column 6, stopping at 44 - so row 45 is
       untouched rock and the ship has something to actually drill. 44 rather
       than 70 because M5 moved leg 0's core to 58 m, and a save whose ship is
       below the core is put back on the pad by the migration in state.ts. */
    for (let d = 0; d <= 44; d++) dug.push('6,' + d);
    localStorage.setItem('coreward.v2', JSON.stringify({
      planet: 0, credits: 0, shards: 0,
      up: { drill: 8, cargo: 4, thrust: 4, tank: 8, cool: 9, scan: 4, scrub: 0, auto: 0 },
      kit: { coolant: 0, patch: 0, cell: 0 }, stock: {}, rubble: [], drops: {},
      best: { depth: 300, haul: 0 },
      dug, cargo: {}, weight: 0,
      /* off the centre line by 0.4 of a cell: enough that the ship's radius
         reaches into column 7 and the old collision saw a wall */
      px: 6.4, pd: 40
    }));
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  /* ?debug, not a bare reload: holdSeam below needs the tick seam, and a
     bare reload keeps the beforeEach's plain '/' where __cw does not exist. */
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  /* A reload lands back on the way in - see enterGame. `dispatchEvent('click')`
     raises no pointerdown, so this cannot start the audio graph and the
     gesture assertions below still mean what they say. */
  await enterGame(page);
  await expect(page.locator('#depth')).toContainText('DEPTH 40 m');

  /* Down through the open shaft, then through the rock under it. Reaching 46
     means the ship both moved off-lane without snagging AND completed at least
     one cut it could not previously start - and neither of those claims is
     about how fast the machine happens to be running, so it goes on the tick
     seam. See holdSeam. The old target of 72 m is below leg 0's core since M5
     moved it to 58. */
  await holdSeam(page, 'down',
    async () => (await page.evaluate(() => (window as any).__cw.g.pd)) >= 46);

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
  await enterGame(page);

  const out = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    /* Sat well below the tremor line, in a shaft, with the hull and tank
       upgraded enough that nothing else ends the run first. */
    w.g.up.tank = 9; w.g.up.cool = 9; w.g.up.drill = 8;
    /* Just below the tremor line at 44 m rather than deep in the heat zone.
       M5 scaled the heat curve to each world's own zone, so leg 0 goes from
       warm at 38 m to lethal at 58 - and seventy seconds of waiting for a
       tremor at 52 m now ends in a tow, which is the heat working rather than
       the tremor failing. */
    w.g.px = 6; w.g.pd = 46;
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
    /* Dug to the tremor line rather than to a literal 50 m. The line was 44 m
       in a 58-metre world and is 253 m in a 452-metre one; a fixture that digs
       to 50 is above it and can only ever assert that nothing happens. Three
       columns wide so a collapse has somewhere to go - see the note above. */
    const floor = Math.round(w.tremorDepth(0)) + 24;
    const cx = Math.round(w.g.px);
    for (let d = 0; d <= floor; d++)
      for (let x = cx - 1; x <= cx + 1; x++) w.g.dug.add(x + ',' + d);
    w.g.pd = floor - 2;
    const before = w.g.rubble.size;
    /* Two full tremor periods plus the jitter, so "none fired" cannot just
       mean the window was too short. */
    w.advance(70);
    return { before, after: w.g.rubble.size, depth: w.g.pd, hull: w.g.hull,
             dug: w.g.dug.size };
  });

  expect(out.dug, 'nothing was dug, so there was nothing a tremor could collapse')
    .toBeGreaterThan(100);
  expect(out.depth, 'the ship should still be deep, not towed home').toBeGreaterThan(40);
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
  await enterGame(page);

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
  await enterGame(page);

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
      up: { drill: 0, cargo: 0, thrust: 0, tank: 0, cool: 0, scan: 0, scrub: 0, auto: 0 },
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
  await enterGame(page);

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
  await enterGame(page);

  const r = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stopClock();
    w.R.held = 'down';
    /* Stopped at the cave line rather than after a fixed thirty seconds. The
       ship digs faster through the shallow dirt of a 452-metre world than it
       did through a 58-metre one's, and this fixture's assertions only hold in
       solid ground. */
    for (let i = 0; i < 60 && w.g.pd < w.CAVE_MIN_DEPTH - 4; i++) w.advance(0.5);
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
    /* Read off the seam, not written down. This was a literal 15 - the grid's
       width back when the world was 13 columns plus a border - and round eight
       widened the world to 61, which made SUB come out at 12.6 instead of 3
       and every sample land outside the image. A geometric constant that the
       game derives should be derived here too; the literals in this suite
       belong on EXPECTATIONS, not on the shape of the thing being read. */
    const COLS = w.LM_COLS;
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
  /* CAVE_MIN_DEPTH, not a literal 26. The run drifts a little past wherever
     the fixture stops, and the claim is "above the line" rather than "above
     twenty-six" - so it is asked of the line. */
  expect(r.depth, 'and has to stay above the cave line for the rock assertions to hold')
    .toBeLessThan(await page.evaluate(() => (window as any).__cw.CAVE_MIN_DEPTH));
  expect(r.rockPrograms, 'no rock programs compiled - the terrain never drew')
    .toBeGreaterThan(0);
  expect(r.unlit, r.unlit + ' of ' + r.rockPrograms +
    ' rock programs lost the light injection - something assigned onBeforeCompile' +
    ' instead of chaining onto it').toBe(0);

  expect(r.missing, 'the lighting shader declares ' + r.missing.join(', ') +
    ' and nothing supplies them, so that part of the model is silently inert')
    .toEqual([]);
});

/* ---------- what used to be here ----------

   `breaking a core opens the chart, and the crossing lands you somewhere else`
   went with the chart in W9. It was the ending of a game about a chain of
   planets, and this is a game about one. Its replacement is
   `the Vault at the centre opens on the ninth Anchor` at the bottom of this
   file - the same shape of test for the ending that exists now. */

test('the three ways in behave differently, and New Game Plus can skip', async ({ page }) => {
  /* Playtest: *"if you are starting a new run, do the full intro. if you are
     continuing a game, I want the ship to take off and fly to the planet they
     were on last. if they have beaten the game and are doing a new game plus
     run, do the full intro but provide a skip button. if that is pressed, skip
     the main part of the intro but still have the ship fly to the planet."*

     Four claims, and the interesting one is the last: a skip that also skipped
     the arrival would drop the player onto the pad out of nowhere. */
  /* A genuinely fresh player. The beforeEach has already crossed the way in
     once, which wrote a save - so this has to clear it AND stop the outgoing
     page writing the live state back on unload, which is the trap CLAUDE.md
     records about seeding saves. */
  await page.evaluate(() => {
    localStorage.clear();
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === 'coreward.v2') return;
      return set.call(this, k, v);
    };
  });
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });

  /* 1. A FIRST RUN gets the intro and no way out of it. It is only a tax on a
        replay, and there has not been one yet. */
  await expect(page.locator('#intro'), 'a first run should open on the intro')
    .not.toHaveClass(/hidden/);
  await expect(page.locator('#introSkip'),
    'a first run must not offer a skip - it has never seen this').toHaveClass(/hidden/);

  await enterGame(page);

  /* 2. CONTINUE takes off and flies, rather than cutting into the game. The
        launch is its own phase before the descent, so the crossing is still up
        well after the click. */
  await page.evaluate(() => {
    const cw = (window as any).__cw;
    cw.g.world = 3; cw.g.planet = 3; cw.g.best.depth = 90;
    cw.showTitle();
  });
  await expect(page.locator('#btnContinue'), 'a save exists, so CONTINUE is live')
    .toBeEnabled();
  await page.locator('#btnContinue').dispatchEvent('click');

  const flying = await page.evaluate(() => {
    (window as any).__cw.advance(1.0);
    return {
      crossing: document.body.classList.contains('crossing'),
      mode: (window as any).__cw.g.mode
    };
  });
  expect(flying.crossing, 'CONTINUE cut straight into the game instead of flying there')
    .toBe(true);
  expect(flying.mode).not.toBe('play');

  /* And it arrives on the world the save was on, not on Verdax. */
  await page.evaluate(async () => {
    const cw = (window as any).__cw;
    for (let i = 0; i < 30 && document.body.classList.contains('crossing'); i++) {
      cw.advance(1);
      await new Promise((r) => requestAnimationFrame(r));
    }
  });
  expect(await page.evaluate(() => (window as any).__cw.g.world),
    'CONTINUE landed on the wrong world').toBe(3);

  /* 3. NEW GAME PLUS: having beaten it, the intro comes back WITH a skip. The
        flag has to survive the wipe, or the one screen that should know the
        player has finished the game treats them as a first-timer. */
  await page.evaluate(() => {
    (window as any).__cw.g.won = true;
    (window as any).__cw.showTitle();
  });
  /* NEW GAME asks before it wipes, and Playwright dismisses dialogs by default
     - so without this the button correctly refuses and the test reads it as
     the intro failing to open. */
  page.once('dialog', (d) => d.accept());
  await page.locator('#btnNewGame').dispatchEvent('click');
  await expect(page.locator('#intro'), 'New Game did not play the intro')
    .not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => (window as any).__cw.g.won),
    'a reset wiped the fact that the game had been beaten').toBe(true);
  await expect(page.locator('#introSkip'), 'a New Game Plus run must offer a skip')
    .not.toHaveClass(/hidden/);

  /* 4. Skipping drops the captions and KEEPS the descent. */
  await page.locator('#introSkip').dispatchEvent('click');
  const afterSkip = await page.evaluate(() => {
    (window as any).__cw.advance(0.6);
    return {
      introGone: document.getElementById('intro')!.classList.contains('hidden'),
      crossing: document.body.classList.contains('crossing'),
      mode: (window as any).__cw.g.mode
    };
  });
  expect(afterSkip.introGone, 'skip left the captions up').toBe(true);
  expect(afterSkip.crossing,
    'skip threw away the arrival as well as the words - the ship should still fly down')
    .toBe(true);
  expect(afterSkip.mode).not.toBe('play');
});

/* THE HEADING. Measured, not reasoned about.

   "The ship flies backwards" has now been reported three times in this game and
   fixed wrongly twice, both times by arguing from the code about Euler order
   and the sign of a pitch. The third fix came from measuring the vector between
   the hull and the drill in the running game, which said the drill was pointing
   at the camera when two rounds of arithmetic had concluded it was not.

   So the arithmetic does not get another chance. This asserts the thing the
   player actually sees: the drill leads, along the direction of travel. */
test('the ship flies drill-first in the showcase', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await page.evaluate(() => (window as any).__cw.showTitle());
  await page.waitForTimeout(900);

  const drill = await page.evaluate(() => {
    const w = (window as any).__cw;
    const at = (o: any) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements;
      return { x: e[12], y: e[13], z: e[14] }; };
    const hull = at(w.rig), tip = at(w.bit);
    const d = { x: tip.x - hull.x, y: tip.y - hull.y, z: tip.z - hull.z };
    const len = Math.hypot(d.x, d.y, d.z) || 1;
    return { x: d.x / len, y: d.y / len, z: d.z / len };
  });

  /* The showcase camera sits at +z looking toward -z, so the direction of
     travel is -z. The drill has to be pointing that way, and by most of a unit
     vector rather than merely on the correct side of zero - it was 0.917 of
     the way there while also pitched a quarter of a right angle nose-up, which
     is what made it read as climbing. */
  expect(drill.z, 'the drill must point away from the camera, along the heading').toBeLessThan(-0.9);
  expect(Math.abs(drill.y), 'and must not be pitched up or down off that heading').toBeLessThan(0.2);
});

/* ---------- round six: the aisles, and what the shop is allowed to sell ----------

   Three claims that are only true in a real browser: that the swipe actually
   moves the camera, that the shelf genuinely refuses to stock a device that
   has not been found, and that a case is not merely inside the frame by its
   centre.

   That last one is here because it is the failure the measurement harness
   passed. Projected centres said every case was on screen while two of five
   plates hung over the edges, so this asserts the PLATE's bounding box rather
   than the group's origin. */
test('the shop is four aisles, and you can walk between them', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });
  await page.locator('#btnShop').dispatchEvent('click');
  await expect(page.locator('#shop')).not.toHaveClass(/hidden/);
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });

  /* The dots are the visible half of the navigation, and they are the half
     that must exist - a swipe with no affordance is a shop most people only
     ever see one quarter of. One per station, the forecourt included. */
  const dots = await page.locator('#aisles .dot').count();
  const stations = await page.evaluate(() => (window as any).__cw.AISLE_COUNT);
  expect(dots, 'a dot per station, or the aisle bar has drifted from the room').toBe(stations);

  const start = await page.evaluate(() => (window as any).__cw.currentAisle());

  /* The arrow, which is the control that does not have to be discovered. */
  await page.locator('#aisleR').dispatchEvent('click');
  await page.evaluate(() => (window as any).__cw.advance(2));
  const afterArrow = await page.evaluate(() => ({
    aisle: (window as any).__cw.currentAisle(),
    camX: (window as any).__cw.stationCamera.position.x
  }));
  expect(afterArrow.aisle, 'the right arrow did not walk to the next aisle').toBeGreaterThan(start);

  /* And the camera actually WENT there, rather than an index changing under a
     shop that stayed exactly where it was. */
  const wantX = await page.evaluate((i) => (window as any).__cw.stationXOf(i), afterArrow.aisle);
  expect(Math.abs(afterArrow.camX - wantX),
    'the aisle changed but the camera did not move to it').toBeLessThan(0.2);

  /* The swipe: a drag past the threshold on the stage, walking back the way we
     came. */
  const before = afterArrow.aisle;
  await page.evaluate(() => {
    const el = document.getElementById('shopStage')!;
    const y = window.innerHeight * 0.35;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 60, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 260, clientY: y }));
    (window as any).__cw.advance(2);
  });
  const afterSwipe = await page.evaluate(() => (window as any).__cw.currentAisle());
  expect(afterSwipe, 'dragging right did not walk back an aisle').toBeLessThan(before);

  /* A short drag is a TAP, not a swipe. The two gestures start identically and
     this is the line between them. */
  const held = await page.evaluate(() => {
    const w = (window as any).__cw;
    const at = w.currentAisle();
    const el = document.getElementById('shopStage')!;
    const y = window.innerHeight * 0.35;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 180, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 196, clientY: y }));
    w.advance(1);
    return { was: at, now: w.currentAisle() };
  });
  expect(held.now, 'a 16 px drag changed aisle; that is a tap, not a swipe').toBe(held.was);
});

test('the Outfitter will not sell a device that has not been dug up', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* A player with unlimited money and every depth record in the game who has
     still never found a Cutting Laser. Money must not be able to buy one. */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.credits = 9e6;
    w.g.best.depth = 300;
    for (const k of ['iron', 'copper', 'silver', 'gold', 'amethyst', 'emerald', 'ruby']) {
      w.g.stock[k] = 99;
    }
    w.g.found.length = 0;
    w.g.px = 6; w.g.pd = -1;
    w.advance(0.5);
  });
  await page.locator('#btnShop').dispatchEvent('click');
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });

  const shelf = await page.evaluate(() => (window as any).__cw.shelfKeys());
  for (const k of ['laser', 'bomb', 'auto', 'magnet', 'survey', 'drone', 'reactor']) {
    expect(shelf, k + ' is on the shelf of a player who has never found one').not.toContain(k);
  }
  /* And the eight that ARE sold are all there, or the gate has eaten the shop. */
  for (const k of ['drill', 'cargo', 'thrust', 'tank', 'scan', 'scrub', 'hull', 'cool']) {
    expect(shelf, k + ' is sold at the shop and is missing from the shelf').toContain(k);
  }

  /* ORDNANCE is entirely devices, so its aisle has nothing in it and the walk
     refuses to stop there. */
  const ord = await page.evaluate(() => {
    const w = (window as any).__cw;
    const i = w.aisleOf('bomb');
    return { i, stocked: w.aisleStocked(i) };
  });
  expect(ord.stocked, 'the ORDNANCE aisle has stock before anything has been found').toBe(false);

  /* Now dig one up, and the whole aisle lights. */
  const after = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.grantFind('bomb');
    w.buildShop();
    return { stocked: w.aisleStocked(w.aisleOf('bomb')), shelf: w.shelfKeys() };
  });
  expect(after.stocked, 'finding a charge did not light the ORDNANCE aisle').toBe(true);
  expect(after.shelf, 'a found charge is still not on the shelf').toContain('bomb');
});

test('every case is fully inside the frame, plate and all', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.credits = 9e6;
    w.g.best.depth = 300;
    for (const k of ['magnet', 'survey', 'bomb', 'laser', 'auto', 'drone', 'reactor']) {
      if (!w.g.found.includes(k)) w.g.found.push(k);
    }
    w.g.px = 6; w.g.pd = -1;
    w.advance(0.5);
  });
  await page.locator('#btnShop').dispatchEvent('click');
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });

  const bad: string[] = [];
  const n = await page.evaluate(() => (window as any).__cw.AISLE_COUNT);
  for (let i = 1; i < n; i++) {
    const rows = await page.evaluate((i) => {
      const w = (window as any).__cw;
      w.goAisle(i);
      w.advance(2);
      w.stationScene.updateMatrixWorld(true);
      w.stationCamera.updateMatrixWorld(true);
      /* The band the player can actually SEE: under the aisle bar and above
         the tray. Composing into the whole canvas is the fault this measures,
         and it is the one he reported. */
      const bar = document.querySelector('#shop .aislebar')!;
      const tray = document.querySelector('#shop .tray')!;
      const top = bar.getBoundingClientRect().bottom;
      const bot = tray.getBoundingClientRect().top;
      const out: any[] = [];
      for (const b of w.bays) {
        if (!b.group.visible) continue;
        /* The PLATE's own corners, not the group's origin. A centre inside the
           frame says nothing at all about a 136 px wide plate hanging off it,
           which is exactly how two cases per aisle shipped half off the edge
           while every measured number said they were fine. */
        const box = new w.Box3Ctor().setFromObject(b.plate);
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const cx of [box.min.x, box.max.x]) {
          for (const cy of [box.min.y, box.max.y]) {
            for (const cz of [box.min.z, box.max.z]) {
              const p = new w.Vec3Ctor(cx, cy, cz).project(w.stationCamera);
              const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
              const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
              x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
              y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
            }
          }
        }
        out.push({ key: b.key, x0: Math.round(x0), x1: Math.round(x1),
                   y0: Math.round(y0), y1: Math.round(y1),
                   W: window.innerWidth, top: Math.round(top), bot: Math.round(bot) });
      }
      return out;
    }, i);
    for (const r of rows) {
      /* A margin, not a boundary. Flush with the edge passes an `x > 0` test
         and still reads as a plate somebody forgot to finish. */
      const M = 6;
      if (r.x0 < M || r.x1 > r.W - M) bad.push(r.key + ' runs off the side (' + r.x0 + '..' + r.x1 + ' of ' + r.W + ')');
      if (r.y1 > r.bot) bad.push(r.key + ' runs under the tray (' + r.y1 + ' past ' + r.bot + ')');
      if (r.y0 < r.top) bad.push(r.key + ' runs under the aisle bar (' + r.y0 + ' above ' + r.top + ')');
    }
  }
  expect(bad.join('; '), 'a case is not fully on screen').toBe('');
});

/* Digging a device out of the ground, end to end.

   The headline feature of round six, and everything above it is unit-tested on
   the pure side: that the crate is somewhere legal, that the shelf refuses to
   stock what has not been found. What none of that proves is that a crate is
   actually REACHABLE in a running game and that breaking one does the three
   things it is supposed to - fit the device, say what it does without pausing,
   and put the row in the shop. */
test('a sealed crate in the rock fits the device and stocks the shop', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* Find where the first crate on this world actually is, and confirm it is a
     real cell of real rock rather than a number in a table. */
  const where = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.found.length = 0;
    w.g.up.magnet = 0;
    const cells = [...w.findCells().entries()].map(([k, f]: any) => ({ k, key: f.key }));
    const first = cells[0];
    const [x, d] = first.k.split(',').map(Number);
    const b = w.blockAt(x, d);
    return { count: cells.length, key: first.key, x, d, id: b ? b.id : null, hard: b ? b.hard : 0 };
  });
  /* Two, not three: round seven pushed Deep Survey down to 62 m with the gold
     it is built from, which is past the 58 m core of the tutorial world. */
  expect(where.count, 'the first world buries nothing at all').toBe(2);
  expect(where.id, 'the crate cell is not a crate').toBe('schematic');
  expect(where.hard, 'a crate with no hardness is not a dig').toBeGreaterThan(0);

  /* The banner is not showing yet, and the device is not on the ship. */
  await expect(page.locator('#found')).not.toHaveClass(/on/);

  /* Break it the way ordnance would, which is the same routine the drill uses.
     Driving the ship forty metres down a shaft is a different test. */
  const after = await page.evaluate((c) => {
    const w = (window as any).__cw;
    w.grantFind(w.findCells().get(c.x + ',' + c.d).key);
    w.advance(0.2);
    return {
      found: w.g.found.slice(),
      level: w.g.up[c.key],
      banner: document.getElementById('found')!.className,
      name: document.getElementById('foundName')!.textContent,
      what: document.getElementById('foundWhat')!.textContent,
      mode: w.g.mode
    };
  }, where);

  expect(after.found, 'the device is not in hand').toContain(where.key);
  expect(after.level, 'a device out of the rock arrives installed, at level one')
    .toBeGreaterThanOrEqual(1);
  expect(after.banner, 'no banner').toContain('on');
  expect(after.name!.length, 'the banner does not name the device').toBeGreaterThan(3);
  expect(after.what!.length, 'the banner does not say what it does').toBeGreaterThan(20);
  /* AND THE GAME DID NOT STOP. This is the whole difference between a device
     and a relic: a relic ends a search and can afford a modal, a device is a
     verb you are about to use. */
  expect(after.mode, 'the discovery paused the game').toBe('play');

  /* Four seconds later it is gone on its own, with nothing tapped. */
  const later = await page.evaluate(() => {
    (window as any).__cw.advance(5);
    return document.getElementById('found')!.className;
  });
  expect(later, 'the banner never went away').not.toContain('on');

  /* And the crate is no longer in the ground, because the map is keyed on how
     many devices are in hand. */
  const gone = await page.evaluate((c) => {
    const w = (window as any).__cw;
    return w.findCells().has(c.x + ',' + c.d);
  }, where);
  expect(gone, 'the crate is still buried after being opened').toBe(false);

  /* Finally: the Outfitter stocks it now, and did not before. */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.credits = 9e6; w.g.px = 6; w.g.pd = -1; w.advance(0.5);
    document.getElementById('btnShop')!.click();
  });
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });
  const shelf = await page.evaluate(() => (window as any).__cw.shelfKeys());
  expect(shelf, 'the device was found and the shop still will not sell a rung').toContain(where.key);
});

/* ---------- the drawer under the counter ----------

   Playtest: *"a secret display case at the bottom of the screen pops open and
   shows all of the upgrades you have collected and lets you purchase the
   upgrades there."* */
test('the drawer opens, holds only what you have found, and sells it', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.credits = 9e6;
    w.g.foundKit.length = 0;
    w.g.foundKit.push('cell', 'patch');
    w.g.px = 6; w.g.pd = -1; w.advance(0.5);
    document.getElementById('btnShop')!.click();
  });
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });

  /* Shut to begin with. A drawer that is already open when you walk up is a
     shelf, and a shelf is what this replaced. */
  expect(await page.evaluate(() => (window as any).__cw.drawerOpen())).toBe(false);

  /* Only the two that have ever been held are in it. */
  const shown = await page.evaluate(() => {
    const w = (window as any).__cw;
    return w.kitCases.filter((c: any) => c.group.visible).map((c: any) => c.key);
  });
  expect(shown.sort()).toEqual(['cell', 'patch']);

  /* Open it by tapping the handle, the way a thumb does. */
  const opened = await page.evaluate(() => {
    const w = (window as any).__cw;
    /* The CAMERA too, not only the scene.

       The station camera is not a child of the station scene, so
       `scene.updateMatrixWorld()` does not touch it - and `project()` reads the
       camera's own matrixWorldInverse. Updating only the scene gave a
       projection 97 px off, which put the drawer handle inside the tray and
       made the tap land on the card. It works in the game because rendering a
       frame updates the camera; it only bites a test that projects without
       drawing. */
    w.stationScene.updateMatrixWorld(true);
    w.stationCamera.updateMatrixWorld(true);
    const h = w.roomDrawer().hit[1];
    const p = h.getWorldPosition(new w.Vec3Ctor()).project(w.stationCamera);
    const x = Math.round((p.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-p.y * 0.5 + 0.5) * window.innerHeight);
    const el = document.elementFromPoint(x, y);
    if (!el) return { err: 'nothing at ' + x + ',' + y };
    const tray = document.querySelector('#shop .tray')!.getBoundingClientRect();
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    w.advance(3);
    return { open: w.drawerOpen(), on: el.id || el.className,
             at: x + ',' + y, tray: Math.round(tray.top), H: window.innerHeight,
             vis: w.roomDrawer().group.visible, aisle: w.currentAisle() };
  });
  expect(opened.err, String(opened.err)).toBeUndefined();
  expect(opened.open, 'tapping the handle at ' + opened.at + ' hit "' + opened.on +
    '"; tray starts at ' + opened.tray + ' of ' + opened.H +
    '; drawer visible=' + opened.vis + ' aisle=' + opened.aisle).toBe(true);

  /* Every crate in it is inside the band the player can see. This is the
     assertion the two-rows-of-three version failed: the rows overlapped each
     other AND ran under the tray, and only a bounding box says so. */
  const bad = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stationScene.updateMatrixWorld(true);
    w.stationCamera.updateMatrixWorld(true);
    const top = document.querySelector('#shop .aislebar')!.getBoundingClientRect().bottom;
    const bot = document.querySelector('#shop .tray')!.getBoundingClientRect().top;
    const out: string[] = [];
    for (const c of w.kitCases) {
      if (!c.group.visible) continue;
      const b = new w.Box3Ctor().setFromObject(c.group);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const cx of [b.min.x, b.max.x]) {
        for (const cy of [b.min.y, b.max.y]) {
          for (const cz of [b.min.z, b.max.z]) {
            const p = new w.Vec3Ctor(cx, cy, cz).project(w.stationCamera);
            const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
            const sy = (-p.y * 0.5 + 0.5) * window.innerHeight;
            x0 = Math.min(x0, sx); x1 = Math.max(x1, sx);
            y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
          }
        }
      }
      if (x0 < 4 || x1 > window.innerWidth - 4) {
        out.push(c.key + ' off the side (' + Math.round(x0) + '..' + Math.round(x1) + ')');
      }
      if (y1 > bot) out.push(c.key + ' under the tray (' + Math.round(y1) + ' past ' + Math.round(bot) + ')');
      if (y0 < top) out.push(c.key + ' above the band');
    }
    return out;
  });
  expect(bad.join('; '), 'a crate in the drawer is not on screen').toBe('');

  /* Tap one, and the card offers it. */
  const picked = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.stationScene.updateMatrixWorld(true);
    w.stationCamera.updateMatrixWorld(true);
    const c = w.kitCases.find((k: any) => k.key === 'cell');
    const p = c.group.getWorldPosition(new w.Vec3Ctor()).project(w.stationCamera);
    const x = Math.round((p.x * 0.5 + 0.5) * window.innerWidth);
    const y = Math.round((-p.y * 0.5 + 0.5) * window.innerHeight);
    const el = document.elementFromPoint(x, y)!;
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    w.advance(0.3);
    return w.selectedBay();
  });
  expect(picked, 'tapping a crate did not select it').toBe('cell');
  await expect(page.locator('#shopCard')).toContainText('Fuel Cell');

  /* And buying works, out of the drawer. */
  const before = await page.evaluate(() => (window as any).__cw.g.kit.cell);
  await page.locator('#shopCard .cbuy').click();
  const after = await page.evaluate(() => (window as any).__cw.g.kit.cell);
  expect(after, 'buying from the drawer did nothing').toBe(before + 1);

  /* A tap on nothing shuts it, and drops the selection with it - the card must
     not keep offering something that is no longer on screen.

     NOT a second tap on the handle, which was the first design and does not
     survive the drawer opening: the handle swings down and forward with the
     flap, which on a portrait phone puts it under the tray. The control that
     opens a drawer cannot also be the one that shuts it when opening it is
     what moves it out of reach. */
  const shut = await page.evaluate(() => {
    const w = (window as any).__cw;
    const el = document.getElementById('shopStage')!;
    const x = Math.round(window.innerWidth * 0.5);
    const y = Math.round(window.innerHeight * 0.22);
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x, clientY: y }));
    w.advance(3);
    return { open: w.drawerOpen(), sel: w.selectedBay(), mode: w.g.mode, at: x + ',' + y };
  });
  expect(shut.open, 'the drawer did not shut; tapped ' + shut.at +
    ' in mode ' + shut.mode).toBe(false);
  expect(shut.sel, 'shutting the drawer left a crate selected').toBe(null);
});

test('a supply cache hands over something new, and the Outfitter stocks it', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  const got = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.foundKit.length = 0;
    /* Open a cache the way the drill does. The cell is chosen by asking what
       each one would pay, because whether a cache pays a supply or a mineral
       is a hash of where it is. */
    let hit: { x: number; d: number } | null = null;
    for (let d = 10; d < 50 && !hit; d++) {
      for (let x = 0; x < 13; x++) {
        if (w.cachePrize(x, d).kind === 'supply') { hit = { x, d }; break; }
      }
    }
    if (!hit) return { err: 'no cache cell on this world pays a supply' };
    w.grantCache(hit.x, hit.d);
    w.advance(0.2);
    return {
      kit: w.g.foundKit.slice(),
      prize: JSON.stringify(w.cachePrize(hit.x, hit.d)),
      banner: document.getElementById('found')!.className,
      head: document.querySelector('#found .fhead')!.textContent,
      mode: w.g.mode
    };
  });
  expect(got.err, String(got.err)).toBeUndefined();
  expect(got.kit!.length, 'a cache paid ' + got.prize + ' and nothing was learned').toBe(1);
  /* The banner, and its own heading - a Fuel Cell must not be announced as
     DEVICE RECOVERED, which is the fixed line the buried crates use. */
  expect(got.banner, 'no banner for a consumable nobody had seen').toContain('on');
  expect(got.head, 'a consumable was announced as a device').toBe('NEW SUPPLY');
  expect(got.mode, 'the discovery paused the game').toBe('play');

  /* And now it is in the drawer. */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.credits = 9e6; w.g.px = 6; w.g.pd = -1; w.advance(0.5);
    document.getElementById('btnShop')!.click();
  });
  await page.waitForFunction(() => (window as any).__cw.roomReady(), null, { timeout: 15_000 });
  const shown = await page.evaluate(() => {
    const w = (window as any).__cw;
    return w.kitCases.filter((c: any) => c.group.visible).map((c: any) => c.key);
  });
  expect(shown, 'the consumable was found and the drawer is still empty').toEqual(got.kit);
});

/* ---------- round seven: running dry kills you ----------

   Playtest: *"if you run out of gas, you should game over."* */
test('an empty tank loses the ship, the hold, and nothing else', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  const before = await page.evaluate(() => {
    const w = (window as any).__cw;
    /* A shaft to be down, a hold worth losing, and money and a rig worth
       keeping - the whole point is which of these survives. */
    for (let d = 0; d <= 30; d++) w.g.dug.add('6,' + d);
    w.g.px = 6; w.g.pd = 28;
    w.g.credits = 12345;
    w.g.up.drill = 4;
    w.g.relics = ['drum'];
    w.g.found = ['magnet'];
    w.g.cargo = { iron: 6 };
    w.g.weight = 27;
    w.resetBlocks();
    w.advance(0.6);
    return { credits: w.g.credits, drill: w.g.up.drill, relics: w.g.relics.length,
             found: w.g.found.length, planet: w.g.planet, haulValue: w.haulValue() };
  });
  expect(before.haulValue, 'the hold has to be worth something for its loss to mean anything')
    .toBeGreaterThan(0);

  /* Run it dry. The reactor idles now, so this happens even standing still -
     which is the hole the idle drain exists to close. */
  const dead = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.fuel = 0.25;
    w.advance(8);
    return {
      mode: w.g.mode,
      title: (document.getElementById('evTitle') as HTMLElement).textContent,
      body: (document.getElementById('evBody') as HTMLElement).textContent,
      cargo: Object.keys(w.g.cargo).length,
      weight: w.g.weight,
      pd: w.g.pd,
      credits: w.g.credits, drill: w.g.up.drill, relics: w.g.relics.length,
      found: w.g.found.length, planet: w.g.planet
    };
  });

  /* It is a death, not a rescue. */
  expect(dead.title, 'running dry did not end the run').toBe('THE SHIP IS LOST');
  expect(dead.body, 'the card must say where it happened').toContain('28 m');
  /* The hold is gone in full - a tow used to take a percentage. */
  expect(dead.cargo, 'the hold survived a death').toBe(0);
  expect(dead.weight).toBe(0);
  /* And the ship is back on the pad BEFORE the card hands control back, or
     dismissing it drops you inside solid rock. */
  expect(dead.pd, 'the ship was left underground').toBeLessThanOrEqual(-0.5);

  /* Everything permanent survives. This is the line the whole design turns on:
     across every comparable game the research found, not one destroys its
     meta-progression on a single failed run. */
  expect(dead.credits, 'banked credits were taken').toBe(before.credits);
  expect(dead.drill, 'an upgrade level was taken').toBe(before.drill);
  expect(dead.relics, 'a relic was taken').toBe(before.relics);
  expect(dead.found, 'a found device was taken').toBe(before.found);
  expect(dead.planet, 'the world was taken').toBe(before.planet);
});

test('the fuel gauge shows the climb home, and goes red before it is too late', async ({ page }) => {
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });
  await page.evaluate(() => {
    const w = (window as any).__cw;
    for (let d = 0; d <= 40; d++) w.g.dug.add('6,' + d);
    w.g.px = 6; w.g.pd = 38;
    w.resetBlocks();
    w.advance(0.6);
  });

  /* The reserve is a real number computed from the real route, not the depth,
     and it is drawn on the dial. */
  const band = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.fuel = w.S.fuelCap();
    w.R.climbT = 0;
    w.advance(0.5);
    const d = document.getElementById('fuelReserve')!.getAttribute('stroke-dasharray') || '';
    return { climb: w.R.climb, drawn: parseFloat(d.split(' ')[0]),
             cap: w.S.fuelCap(), state: w.R.fuelState };
  });
  expect(band.climb, 'the climb home was never computed').toBeGreaterThan(0);
  expect(band.state, 'a full tank at 38 m is not a warning').toBe('clear');
  /* Drawn as a fraction of the TANK, because it is a mark on the dial. */
  expect(Math.abs(band.drawn - (band.climb / band.cap) * 100),
    'the band on the dial does not match the fuel the climb costs').toBeLessThan(1);

  /* And it escalates as the tank falls, in order, with the dial and the
     printed figure agreeing at every step. */
  const seen: string[] = [];
  for (const mult of [3.0, 1.8, 1.2, 0.9]) {
    const s = await page.evaluate((m) => {
      const w = (window as any).__cw;
      w.g.fuel = w.R.climb * m;
      w.R.climbT = 0;
      w.advance(0.5);
      return { state: w.R.fuelState,
               cluster: document.getElementById('cluster')!.className,
               txt: document.getElementById('fuelTxt')!.className,
               dry: document.getElementById('dry')!.className };
    }, mult);
    seen.push(s.state);
    expect(s.txt, 'the printed figure disagrees with the dial').toContain(s.state);
    if (s.state === 'danger' || s.state === 'stranded') {
      expect(s.cluster, 'the dial is not warning at ' + s.state).toContain('dry');
      expect(s.dry, 'the screen edge is not warning at ' + s.state).toContain('on');
    } else {
      expect(s.cluster, 'the dial is crying wolf at ' + s.state).not.toContain('dry');
    }
  }
  expect(seen).toEqual(['clear', 'plan', 'danger', 'stranded']);
});

test('the shallow world holds three materials, and the deep ones are a prize', async ({ page }) => {
  /* One world now, so "planet 0" is not a thing to sweep. The claim converts
     to depth BANDS of the single world, which is what the ore ladder actually
     gates on and what he asked for: three materials near the top, and the deep
     kinds rare even where they exist.

     Sixty metres, because gold starts at 64 - the band has to stop before the
     fourth material to be a claim about the first three. */
  const counts = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.dug = new Set(); w.g.rubble = new Set();
    const floor = w.coreM();
    const bands: Record<string, Record<string, number>> = {};
    for (const [name, lo, hi] of [['shallow', 0, 60], ['deep', floor - 90, floor]] as
         [string, number, number][]) {
      const seen: Record<string, number> = {};
      let cells = 0;
      for (let d = lo; d < hi; d++) {
        for (let x = 0; x < w.W; x++) {
          const b = w.blockAt(x, d);
          cells++;
          if (b && b.ore && !b.core) seen[b.id] = (seen[b.id] || 0) + 1;
        }
      }
      seen.__cells = cells;
      bands[name] = seen;
    }
    return bands;
  });

  /* NO cell above a material's floor ever holds it - the invariant, swept, not
     a sample. A 0.12% material can miss a single band by luck; a floor cannot
     be broken by luck. */
  const breaches = await page.evaluate(() => {
    const w = (window as any).__cw;
    const bad: string[] = [];
    const floor = w.coreM();
    for (let d = 0; d < floor; d++) {
      for (let x = 0; x < w.W; x += 3) {
        const b = w.blockAt(x, d);
        if (!b || !b.ore || b.core) continue;
        const o = w.ORES.find((z: any) => z.id === b.id);
        if (o && d < o.min) bad.push(o.id + ' at ' + d + ' m, above its floor of ' + o.min);
      }
    }
    return bad.slice(0, 5);
  });
  expect(breaches.join('; '), 'a material generated above its own floor depth').toBe('');

  /* Blocks that carry `ore: true` and are not materials.

     The flag does two jobs: it decides what goes in the hold when a block
     breaks, and it decides whether blocks.ts draws crystal shards or pebbles.
     An Anchor wants the second and cannot do the first - it never breaks - so
     it is flagged and belongs on this list, next to the crates and pockets
     that were already here for the same reason. */
  const notOre = new Set(['__cells', 'geode', 'gas', 'cache', 'schematic', 'relic', 'part',
                          'anchor', 'anchorlit']);
  const shallow = Object.keys(counts.shallow).filter((k) => !notOre.has(k));
  expect(shallow.sort().join(','), 'the top sixty metres holds more than the starter three')
    .toBe('copper,iron,silver');

  /* And the deepest material is rare even in the band it lives in. */
  const deep = counts.deep;
  const sol = deep.solmarrow || 0;
  expect(sol, 'solmarrow does not generate at all in the deepest band').toBeGreaterThan(0);
  expect(sol / deep.__cells,
    'solmarrow is ' + ((sol / deep.__cells) * 100).toFixed(2) + '% of the deep band, not a prize')
    .toBeLessThan(0.006);
});

/* The map, end to end.

   Two things can break here and neither shows up in a unit test. The first is
   the recorder: it runs on the climb timer, and the timer is reset inside the
   same branch that fires it - so a recorder written next to that branch rather
   than inside it runs on the first frame of the session and never again. The
   map then fills in at the pad and nowhere else, which looks exactly like a
   map that simply has not been explored yet. The assertion that catches it is
   the SPAN of the trail, not its size.

   The second is the screen itself: a canvas that is laid out at zero height,
   or is never drawn into, is a black rectangle that reads as "you have not
   been anywhere". So the pixels are counted. */
test('the map records the descent and draws it', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* Nothing is recorded while the ship is on the pad, so the map starts blank
     however long the descent takes to begin. */
  const rowSpan = () => page.evaluate(() => {
    const w = (window as any).__cw;
    const rows = w.g.seen.map((k: string) => Number(k.split(',')[1]));
    return rows.length ? { n: w.g.seen.length, lo: Math.min(...rows), hi: Math.max(...rows) }
                       : { n: 0, lo: 0, hi: 0 };
  });

  const depth = 40;
  await holdSeam(page, 'down', async () => (await page.evaluate(() => (window as any).__cw.g.pd)) > depth);

  const trail = await rowSpan();
  /* 40 m of descent is ten four-metre tile rows. A recorder that fired once
     leaves the three or four rows the lamp reaches from a single point, so
     eight is comfortably past "it ran" and short of "it ran perfectly". */
  expect(trail.hi - trail.lo,
    `the trail covers tile rows ${trail.lo}..${trail.hi} after a ${depth} m descent - a recorder that only fires once leaves about three`)
    .toBeGreaterThanOrEqual(8);
  expect(trail.n, 'the descent recorded almost no tiles').toBeGreaterThan(20);

  /* ---- the screen ---- */
  await page.locator('#btnMap').dispatchEvent('click');
  await expect(page.locator('#map')).not.toHaveClass(/hidden/);
  expect(await page.evaluate(() => (window as any).__cw.g.mode)).toBe('map');

  /* Read as a DIFFERENCE between a surveyed tile and an unsurveyed one, at
     known positions, rather than as a count of lit pixels.

     Two earlier versions of this check were worth less than they looked. "Is
     anything lit" stopped meaning anything the moment the survey grid started
     drawing over unexplored ground as well - a map that had drawn nothing but
     its own graph paper passed it. Counting the wash by colour was no better:
     the heavier 50 m rules are wide, coloured enough to match, and three of
     them across the canvas cleared the threshold on their own. Both were
     verified by deleting the wash, and the second one still passed.

     A tile you have surveyed against a tile you have not, at the same scale on
     the same canvas, cannot be satisfied by anything but the wash. Tiles with
     a tunnel through them are excluded so the tunnels cannot answer for it. */
  const painted = await page.evaluate(() => {
    const w = (window as any).__cw;
    const c = document.getElementById('mapCanvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d')!;
    const dpr = c.width / c.clientWidth;
    const s = c.clientWidth / w.W;
    const view = w.mapView();
    const rows = c.clientHeight / s;
    const seen = new Set<string>(w.g.seen);
    const tw = Math.ceil(w.W / w.MAP_TILE);

    /* The brightness at the centre of a tile, averaged over a small patch so a
       single grid pixel cannot decide it. */
    const patch = (tx: number, ty: number) => {
      const px = Math.round((tx * w.MAP_TILE + w.MAP_TILE / 2) * s * dpr);
      const py = Math.round(((ty * w.MAP_TILE + w.MAP_TILE / 2) - view) * s * dpr);
      const d = ctx.getImageData(px - 2, py - 2, 5, 5).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
      return sum / (d.length / 4) / 3;
    };
    /* A tile is usable if it is fully on screen and holds no dug cell. */
    const clean = (tx: number, ty: number) => {
      if (ty * w.MAP_TILE < view + 2 || (ty + 1) * w.MAP_TILE > view + rows - 2) return false;
      for (let cx = tx * w.MAP_TILE; cx < (tx + 1) * w.MAP_TILE; cx++) {
        for (let cd = ty * w.MAP_TILE; cd < (ty + 1) * w.MAP_TILE; cd++) {
          if (w.g.dug.has(cx + ',' + cd)) return false;
        }
      }
      return true;
    };
    let lit = -1, dark = -1;
    for (let ty = Math.floor(view / w.MAP_TILE); ty < (view + rows) / w.MAP_TILE; ty++) {
      for (let tx = 0; tx < tw; tx++) {
        if (!clean(tx, ty)) continue;
        if (seen.has(tx + ',' + ty)) { if (lit < 0) lit = patch(tx, ty); }
        else if (dark < 0) dark = patch(tx, ty);
      }
    }
    /* And the dug cells, read at their own positions. The tunnels are the
       layer that can only exist because the player went somewhere, and they
       are pale and warm where nothing else on the map is both.

       The MEDIAN of them, not the brightest. The brightest was the first
       version and it was worthless: the ship marker is drawn on top of a dug
       cell by definition, so one amber dot answered for the whole layer and
       deleting every tunnel still passed. A median cannot be moved by the two
       or three cells a marker covers. */
    const reds: number[] = [], blues: number[] = [];
    for (const k of w.g.dug) {
      const i = k.indexOf(',');
      const cx = +k.slice(0, i), cd = +k.slice(i + 1);
      if (cd < view + 3 || cd > view + rows - 3) continue;
      const d = ctx.getImageData(Math.round((cx + 0.5) * s * dpr),
                                 Math.round((cd - view + 0.5) * s * dpr), 1, 1).data;
      reds.push(d[0]); blues.push(d[2]);
    }
    reds.sort((a, b) => a - b); blues.sort((a, b) => a - b);
    const mid = (a: number[]) => (a.length ? a[Math.floor(a.length / 2)] : -1);
    return { h: c.clientHeight, lit, dark, cut: { n: reds.length, r: mid(reds), b: mid(blues) } };
  });
  expect(painted.h, 'the map canvas has no height, so nothing can be on it').toBeGreaterThan(200);
  expect(painted.lit, 'no surveyed tile was on screen to measure').toBeGreaterThan(0);
  expect(painted.dark, 'no unsurveyed tile was on screen to measure').toBeGreaterThan(-1);
  expect(painted.lit - painted.dark,
    `a surveyed tile reads ${painted.lit.toFixed(1)} and an unsurveyed one ${painted.dark.toFixed(1)} - the wash is not being drawn`)
    .toBeGreaterThan(6);
  expect(painted.cut.n, 'no dug cell was on screen to measure').toBeGreaterThan(20);
  expect(painted.cut.r,
    `the median dug cell on screen reads ${painted.cut.r} - no tunnel is being drawn`)
    .toBeGreaterThan(140);
  expect(painted.cut.r - painted.cut.b, 'the tunnel colour is not the tunnel colour')
    .toBeGreaterThan(20);

  /* ---- panning ----

     The world moves WITH the finger, and it stops at both ends. A map that
     pans the wrong way or scrolls into empty space below the world is worse
     than no map, and neither shows up as an error. */
  const pan = await page.evaluate(() => {
    const w = (window as any).__cw;
    const c = document.getElementById('mapCanvas') as HTMLCanvasElement;
    const cw = c.clientWidth, ch = c.clientHeight;
    w.mapSetView(100);
    /* Dragging the finger DOWN (positive dy) has to show you shallower ground. */
    const down = w.mapPan(60, cw, ch);
    w.mapSetView(100);
    const up = w.mapPan(-60, cw, ch);
    w.mapSetView(0);
    const top = w.mapPan(9999, cw, ch);
    const bottom = w.mapPan(-99999, cw, ch);
    return { down, up, top, bottom, depth: w.WORLD_DEPTH };
  });
  expect(pan.down, 'dragging down must travel up the world').toBeLessThan(100);
  expect(pan.up, 'dragging up must travel down the world').toBeGreaterThan(100);
  expect(pan.top, 'the map scrolled above the sky').toBeGreaterThanOrEqual(-2);
  expect(pan.bottom, 'the map scrolled past the bottom of the world')
    .toBeLessThanOrEqual(pan.depth);

  await page.locator('#mapClose').dispatchEvent('click');
  await expect(page.locator('#map')).toHaveClass(/hidden/);
  expect(await page.evaluate(() => (window as any).__cw.g.mode)).toBe('play');
});

/* The Ballast, and a region coming down.

   The campaign's whole stake, end to end. Everything here is reachable in
   ordinary play and none of it is reachable in ninety seconds of it, so the
   planet is pushed into the state rather than played into it - the code that
   then runs is the same code either way.

   The load-bearing assertion is that fallen ground is actually SHUT. Every
   other part of this can fail visibly; a collapse that draws grey on the map
   and still lets you fly through it is a collapse that looks right in a
   screenshot and is not a stake at all. */
test('the Ballast is fed at the pad, and an empty one takes a region', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* A kitted rig, because the ground this test needs to reach is two regions
     and a sale away and a stock drill does not get there inside the budget.
     Everything after this is the shipping code path. */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.up.thrust = 6; w.g.up.drill = 5; w.g.up.tank = 9;
    w.g.fuel = w.S.fuelCap();
  });

  /* Down, then sideways until the ship is out of the pad's own region - which
     is the one region a collapse may never take, so the test has to be
     standing somewhere else to have anything to collapse.

     Sideways and not deeper: the regions are three columns by four rows, so
     the shallow middle runs to a hundred and thirteen metres and the nearest
     edge of it is ten cells to the right. The fuel is topped up inside the
     poll, which is a fixture and not a game rule - the drill, the rock and the
     tunnels are all real. */
  const topUp = () => page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.fuel = w.S.fuelCap(); w.g.hull = w.S.hullCap();
  });
  const until = (fn: () => Promise<boolean>) => async () => { await topUp(); return fn(); };
  const depth = () => page.evaluate(() => (window as any).__cw.g.pd);
  const offPad = () => page.evaluate(() => {
    const w = (window as any).__cw;
    return w.regionAt(Math.round(w.g.px), Math.round(w.g.pd)) !== w.padRegion();
  });

  await holdSeam(page, 'down', until(async () => (await depth()) > 18));
  await holdSeam(page, 'right', until(offPad));
  await holdSeam(page, 'down', until(async () => (await depth()) > 30));
  await holdSeam(page, 'up', until(async () =>
    (await page.evaluate(() => (window as any).__cw.g.credits)) > 0));
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* ---- feeding ---- */
  await page.locator('#btnBallast').dispatchEvent('click');
  await expect(page.locator('#ballast')).not.toHaveClass(/hidden/);
  /* Room to feed into, or every FEED button is correctly disabled and this
     tests nothing. Half empty is a state several runs of play reach. */
  await page.evaluate(() => {
    (window as any).__cw.g.ground.ballast = 0.5;
    (window as any).__cw.buildBallast();
  });

  const before = await page.evaluate(() => {
    const w = (window as any).__cw;
    const btn = document.querySelector('#balRows button[data-feed]') as HTMLButtonElement;
    return btn ? { id: btn.dataset.feed!, n: Number(btn.dataset.n),
                   held: w.g.stock[btn.dataset.feed!], ballast: w.g.ground.ballast } : null;
  });
  expect(before, 'the panel offered nothing to feed after a sale').not.toBeNull();
  await page.locator('#balRows button[data-feed]').first().dispatchEvent('click');

  const after = await page.evaluate((id: string) => {
    const w = (window as any).__cw;
    return { held: w.g.stock[id] || 0, ballast: w.g.ground.ballast };
  }, before!.id);
  expect(after.ballast, 'feeding did not raise the Ballast').toBeGreaterThan(before!.ballast);
  expect(after.held, 'feeding did not cost any banked ore')
    .toBe(before!.held - before!.n);
  expect(after.ballast, 'the Ballast went over full').toBeLessThanOrEqual(1);

  await page.locator('#ballastClose').dispatchEvent('click');
  await expect(page.locator('#ballast')).toHaveClass(/hidden/);

  /* ---- the collapse ----

     Aimed at the region the shaft actually goes through, found from a dug cell
     rather than from a region index picked out of the air: the boundaries
     wander, so "region 4" is a guess and "wherever cell 30,80 is" is not. */
  const hit = await page.evaluate(() => {
    const w = (window as any).__cw;
    const pad = w.padRegion();
    for (const k of w.g.dug) {
      const i = k.indexOf(',');
      const r = w.regionAt(+k.slice(0, i), +k.slice(i + 1));
      if (r !== pad) return { region: r, cell: k, pad };
    }
    return null;
  });
  expect(hit, 'the descent never left the pad region, so there is nothing to collapse').not.toBeNull();

  const dugThere = await page.evaluate((r: number) => {
    const w = (window as any).__cw;
    let n = 0;
    for (const k of w.g.dug) {
      const i = k.indexOf(',');
      if (w.regionAt(+k.slice(0, i), +k.slice(i + 1)) === r) n++;
    }
    return n;
  }, hit!.region);
  expect(dugThere, 'no tunnel in the region about to fall').toBeGreaterThan(5);

  const fell = await page.evaluate((h: { region: number; cell: string }) => {
    const w = (window as any).__cw;
    w.g.ground.ballast = 0;
    w.g.ground.pending = h.region;
    w.landCollapse();
    const i = h.cell.indexOf(',');
    const x = +h.cell.slice(0, i), d = +h.cell.slice(i + 1);
    let left = 0;
    for (const k of w.g.dug) {
      const j = k.indexOf(',');
      if (w.regionAt(+k.slice(0, j), +k.slice(j + 1)) === h.region) left++;
    }
    const b = w.blockAt(x, d);
    return {
      down: w.g.ground.collapsed.indexOf(h.region) >= 0,
      left,
      /* JSON cannot carry Infinity, so the question is asked here. */
      solid: !!b && b.hard === Infinity,
      id: b ? b.id : null,
      ballast: w.g.ground.ballast
    };
  }, hit!);

  expect(fell.down, 'the region was not recorded as collapsed').toBe(true);
  expect(fell.left, 'tunnels survived the ground coming down on them').toBe(0);
  expect(fell.solid,
    `a cell in fallen ground came back as ${fell.id} - the region is drawn as shut and is not`)
    .toBe(true);
  expect(fell.ballast,
    'the collapse left the Ballast empty, which collapses another region on the next run')
    .toBeGreaterThan(0);

  /* ---- and shoring it back ---- */
  await page.locator('#btnBallast').dispatchEvent('click');
  await page.evaluate(() => {
    (window as any).__cw.g.ground.ballast = 1;
    (window as any).__cw.buildBallast();
  });
  await expect(page.locator('#balFallen button[data-shore]')).toBeEnabled();
  await page.locator('#balFallen button[data-shore]').dispatchEvent('click');

  const reopened = await page.evaluate((h: { region: number; cell: string }) => {
    const w = (window as any).__cw;
    const i = h.cell.indexOf(',');
    const b = w.blockAt(+h.cell.slice(0, i), +h.cell.slice(i + 1));
    return {
      down: w.g.ground.collapsed.indexOf(h.region) >= 0,
      solid: !!b && b.hard === Infinity,
      ballast: w.g.ground.ballast,
      dug: w.g.dug.size
    };
  }, hit!);
  expect(reopened.down, 'the region is still marked as fallen').toBe(false);
  expect(reopened.solid, 'shored ground is still unbreakable').toBe(false);
  expect(reopened.ballast, 'shoring a region cost nothing').toBeLessThan(1);
});

/* An Anchor hall, and lighting the thing in it.

   The objective, end to end. Flown rather than dug: the shallowest Anchor is
   forty-odd metres down and a stock drill takes longer than the budget to get
   through a hall wall, so the ship is placed at the door and everything after
   that - breaking in, crossing the room, standing at the plinth - is the real
   code.

   The load-bearing assertions are the two that could each look right in a
   screenshot and be wrong: that the room is actually SHUT until you cut it,
   and that the Anchor cannot be mined. A hall you can drift into is not a
   discovery, and an Anchor you can drill out is a pickup. */
test('an Anchor hall is shut until you cut it, and lights by standing there', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* The shallowest Anchor, found rather than named: the positions are seeded
     and a literal here would go stale the moment anything reseeds them. */
  const target = await page.evaluate(() => {
    const w = (window as any).__cw;
    let best = -1, at = Infinity;
    for (let r = 0; r < w.ANCHOR_COUNT; r++) {
      const a = w.anchorAt(r);
      if (!w.anchorSealed(r) && a.d < at) { at = a.d; best = r; }
    }
    const a = w.anchorAt(best);
    return { region: best, x: a.x, d: a.d };
  });
  expect(target.region, 'no open Anchor anywhere in the world').toBeGreaterThanOrEqual(0);

  /* ---- the room is shut ----

     Checked at the wall and at the air behind it, on the real generator. An
     unbreakable wall would be a different bug and is checked too: worked stone
     has to be cuttable or the room is a tease. */
  const hall = await page.evaluate((t: { x: number; d: number }) => {
    const w = (window as any).__cw;
    const V = w.vaultCells();
    /* Straight up from the Anchor: plinth, air, wall, rock. */
    const col: { d: number; ch: string; id: string; hard: number }[] = [];
    for (let d = t.d - 5; d <= t.d; d++) {
      const b = w.blockAt(t.x, d);
      col.push({ d, ch: V.get(t.x + ',' + d) || ' ',
                 id: b ? b.id : '(empty)', hard: b ? b.hard : 0 });
    }
    return col;
  }, target);

  const wall = hall.find((c) => c.ch === '#');
  const air = hall.find((c) => c.ch === '.');
  expect(wall, 'no worked stone above the Anchor at all').toBeTruthy();
  expect(air, 'no open room above the Anchor at all').toBeTruthy();
  expect(wall!.id, 'the hall wall is not worked stone').toBe('worked');
  expect(Number.isFinite(wall!.hard) && wall!.hard > 0,
    `worked stone reads as hardness ${wall!.hard} - a wall you cannot cut is not a room`).toBe(true);
  expect(air!.id, 'the room behind the wall is solid').toBe('(empty)');
  /* And the wall is genuinely between you and the room: the cell above the
     wall is untouched ground, so there is no way in that is not through it. */
  const outside = hall.find((c) => c.d < wall!.d);
  expect(outside && outside.id, 'the ground above the hall is already open').not.toBe('(empty)');

  /* ---- the Anchor cannot be mined ---- */
  const anchorBlock = hall[hall.length - 1];
  expect(anchorBlock.id, 'the Anchor is not where the map says it is').toBe('anchor');
  expect(Number.isFinite(anchorBlock.hard),
    'the Anchor has a finite hardness, so it can be drilled out like ore').toBe(false);

  /* ---- and lighting it ----

     The ship is put in the room's air, one cell above the plinth, and then the
     frame loop does the rest. Nothing here calls lightAnchor: the assertion is
     that STANDING THERE is enough. */
  const lit = await page.evaluate(async (t: { region: number; x: number; d: number }) => {
    const w = (window as any).__cw;
    w.g.px = t.x; w.g.pd = t.d - 1;
    w.g.fuel = w.S.fuelCap(); w.g.hull = w.S.hullCap();
    const before = w.g.ground.lit.slice();
    w.advance(0.2);
    return {
      before, after: w.g.ground.lit.slice(),
      mode: w.g.mode,
      unrest: w.g.ground.unrest[t.region],
      seen: w.g.seen.length,
      title: (document.getElementById('evTitle') || {}).textContent
    };
  }, target);

  expect(lit.before.length, 'something was already lit before the test lit anything').toBe(0);
  expect(lit.after, 'standing at the plinth did not light the Anchor').toContain(target.region);
  expect(lit.mode, 'lighting an Anchor did not stop the game to say so').toBe('event');
  expect(lit.title, 'the moment passed with no card').toMatch(/ANCHOR/i);

  /* The region drew itself onto the map, which is the reward that is not a
     number: a whole region surveyed without flying it. */
  const revealed = await page.evaluate((region: number) => {
    const w = (window as any).__cw;
    let mine = 0, total = 0;
    const seen = new Set(w.g.seen);
    for (let ty = 0; ty * w.MAP_TILE < w.WORLD_DEPTH; ty++) {
      for (let tx = 0; tx * w.MAP_TILE < w.W; tx++) {
        if (w.regionAt(tx * w.MAP_TILE + 2, ty * w.MAP_TILE + 2) !== region) continue;
        total++;
        if (seen.has(tx + ',' + ty)) mine++;
      }
    }
    return { mine, total, ballastTier: w.g.ground.lit.length };
  }, target.region);
  expect(revealed.total, 'the region has no map tiles at all').toBeGreaterThan(20);
  expect(revealed.mine, 'lighting the Anchor revealed none of its region')
    .toBe(revealed.total);
  expect(revealed.ballastTier, 'the Ballast gained no tier').toBe(1);

  /* And the block itself now reads as lit, which is the only thing left in the
     room to look at. */
  const after = await page.evaluate((t: { x: number; d: number }) =>
    (window as any).__cw.blockAt(t.x, t.d).id, target);
  expect(after, 'the Anchor looks the same after being lit').toBe('anchorlit');
});

/* The planet answering.

   Terraria's Hardmode is the sourced device and the whole of W8: edit the
   world the player already has rather than building more of it. Three things
   fire at the fifth Anchor and each one is invisible until it is not - a step
   in a meter, a material that starts generating, and tunnels that fill in.

   The load-bearing assertion is the third. A Bloom you cannot see and a meter
   that moved are both things a player might not notice for a run; a shaft that
   is not there when you come back is the moment the map goes stale, and it is
   the one that can take a run if it is wrong. */
test('the fifth Anchor wakes the planet, and the ground stops staying where you left it',
  async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* Four Anchors lit through the real path, and nothing has woken. */
  const before = await page.evaluate((n: number) => {
    const w = (window as any).__cw;
    for (let i = 0; i < n - 1; i++) w.lightAnchor(w.g.ground, i);
    let blooms = 0;
    for (let d = 10; d < 200; d += 3) for (let x = 0; x < w.W; x += 3) {
      const b = w.blockAt(x, d);
      if (b && b.id === 'bloom') blooms++;
    }
    return { lit: w.g.ground.lit.length, awake: w.isAwake(w.g.ground), blooms };
  }, 5);
  expect(before.lit).toBe(4);
  expect(before.awake, 'the planet woke before the fifth Anchor').toBe(false);
  expect(before.blooms, 'Blooms generated on a planet that has not answered').toBe(0);

  /* The fifth, through the real path: fly to it and stand there. */
  const target = await page.evaluate(() => {
    const w = (window as any).__cw;
    const a = w.anchorAt(4);
    w.g.px = a.x; w.g.pd = a.d - 1;
    w.g.fuel = w.S.fuelCap(); w.g.hull = w.S.hullCap();
    w.advance(0.2);
    return { region: 4, mode: w.g.mode, title: (document.getElementById('evTitle') || {}).textContent };
  });
  expect(target.mode, 'lighting the fifth Anchor did not stop the game').toBe('event');

  /* The Anchor's own card first, then the planet's. Two modals in the order
     the player experiences them, never stacked. */
  expect(target.title).toMatch(/ANCHOR/i);
  await page.locator('#evBtn').dispatchEvent('click');
  await expect(page.locator('#evTitle')).toHaveText(/PLANET ANSWERS/i);
  await page.locator('#evBtn').dispatchEvent('click');
  await expect(page.locator('#event')).toHaveClass(/hidden/);

  const after = await page.evaluate(() => {
    const w = (window as any).__cw;
    let blooms = 0, shallow = 0;
    for (let d = 10; d < 200; d += 3) for (let x = 0; x < w.W; x += 3) {
      const b = w.blockAt(x, d);
      if (b && b.id === 'bloom') { blooms++; if (d < 60) shallow++; }
    }
    return { awake: w.isAwake(w.g.ground), woke: w.g.ground.woke, blooms, shallow,
             unrest: w.g.ground.unrest.slice() };
  });
  expect(after.awake, 'five Anchors did not wake the planet').toBe(true);
  expect(after.woke, 'the wake was not recorded, so a reload would pay for it again').toBe(true);
  expect(after.blooms, 'nothing new grew in the woken world').toBeGreaterThan(5);
  expect(after.shallow,
    'nothing grew in the shallow ground - the map the player already has is unchanged')
    .toBeGreaterThan(0);
  /* Every region stepped, including ones the player has never been in. */
  expect(Math.min(...after.unrest), 'the calmest region did not step').toBeGreaterThan(0);

  /* ---- and the ground closes ----

     Driven through the real docking path: a shaft is cut, the region is made
     restless, and the ship touches the pad. Nothing here calls planClose. */
  const closed = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.dug = new Set();
    w.g.rubble = new Set();
    for (let d = 20; d < 220; d++) w.g.dug.add('30,' + d);
    for (let i = 0; i < w.REGION_COUNT; i++) w.g.ground.unrest[i] = 0.95;
    const was = w.g.dug.size;
    /* Through the DOCKING EDGE, not by calling closeGround().

       Calling the seam passed with the call removed from the frame loop
       entirely - it proved the function works and nothing about whether
       anything invokes it. The loop fires this on the frame the ship arrives
       at the surface having not been there the frame before, so that is the
       state to put it in. */
    /* -1 and not 0: atSurface() is `pd <= -0.6`, because the pad sits a metre
       above the first row of rock. Parked at 0 the ship is a metre INTO the
       ground and the edge never fires. */
    w.g.px = 30; w.g.pd = -1;
    w.R.wasAtSurface = false;
    w.advance(0.2);
    return { was, now: w.g.dug.size, rubble: w.g.rubble.size };
  });
  expect(closed.now, 'coming home to a woken planet left every tunnel exactly as it was')
    .toBeLessThan(closed.was);
  expect(closed.rubble, 'the tunnels closed into nothing at all').toBeGreaterThan(0);
  expect(closed.now + closed.rubble,
    'cells went missing rather than filling in').toBe(closed.was);

  /* And what filled in is diggable. A hazard that walls a player in is the one
     thing CRAFT.md forbids outright. */
  const fill = await page.evaluate(() => {
    const w = (window as any).__cw;
    const k = Array.from(w.g.rubble)[0] as string;
    const i = k.indexOf(',');
    const b = w.blockAt(+k.slice(0, i), +k.slice(i + 1));
    return { id: b ? b.id : null, finite: !!b && Number.isFinite(b.hard) };
  });
  expect(fill.id, 'closed ground is not rubble').toBe('rubble');
  expect(fill.finite, 'closed ground cannot be dug back out').toBe(true);
});

/* The Vault at the centre, which is the end of the game.

   Three claims, and the first one is the whole design: the last wall in the
   game is not a wall you can be clever about. Sealed stone waits for a tool
   you might find by accident; this waits for the entire errand, and nothing in
   the game opens it early.

   Driven with the Anchors lit through the state rather than flown to nine
   halls, because nine halls is an evening. Everything after the ninth - the
   seal opening, the map learning where the centre is, and the ending firing
   when the ship reaches it - is the shipping path. */
test('the Vault at the centre opens on the ninth Anchor', async ({ page }) => {
  await page.goto('/?debug');
  await expect(page.locator('#boot')).toHaveClass(/hidden/, { timeout: 15_000 });
  await enterGame(page);
  await page.waitForFunction(() => (window as any).__cw.g.mode === 'play', null, { timeout: 15_000 });

  /* ---- shut, with eight of nine ---- */
  const shut = await page.evaluate(() => {
    const w = (window as any).__cw;
    for (let i = 0; i < w.ANCHOR_COUNT - 1; i++) w.lightAnchor(w.g.ground, i);
    /* And the wake, which a real save with eight Anchors lit has already paid
       for - the fixture lights them through the state, so it owes the step. */
    w.wake(w.g.ground);
    const V = w.vaultCells();
    /* A seal cell, found from the stamp rather than named. */
    let seal: string | null = null;
    for (const [k, ch] of V) if (ch === '%') { seal = k; break; }
    const i = seal!.indexOf(',');
    const b = w.blockAt(+seal!.slice(0, i), +seal!.slice(i + 1));
    const core = w.blockAt(w.VAULT_CORE_X, w.VAULT_CORE_D);
    return {
      lit: w.g.ground.lit.length, open: w.vaultOpen(w.g.ground.lit.length),
      seal, sealId: b ? b.id : null, sealShut: !!b && !Number.isFinite(b.hard),
      coreId: core ? core.id : null,
      coreShut: !!core && !Number.isFinite(core.hard),
      seenCentre: w.g.seen.includes(
        Math.floor(w.VAULT_CORE_X / w.MAP_TILE) + ',' + Math.floor(w.VAULT_CORE_D / w.MAP_TILE))
    };
  });
  expect(shut.lit).toBe(8);
  expect(shut.open, 'eight Anchors opened the centre').toBe(false);
  expect(shut.sealId, 'the Vault has no seal around it').toBe('vaultwall');
  expect(shut.sealShut,
    'the last wall in the game can be drilled with eight of nine Anchors lit').toBe(true);
  expect(shut.coreId).toBe('vaultcore');
  expect(shut.coreShut, 'the Vault core can be mined').toBe(true);
  expect(shut.seenCentre, 'the map already knows where the centre is').toBe(false);

  /* ---- the ninth ---- */
  await page.evaluate(() => {
    const w = (window as any).__cw;
    const a = w.anchorAt(w.ANCHOR_COUNT - 1);
    w.g.px = a.x; w.g.pd = a.d - 1;
    w.g.fuel = w.S.fuelCap(); w.g.hull = w.S.hullCap();
    w.advance(0.2);
  });
  await expect(page.locator('#evTitle')).toHaveText(/ANCHOR/i);
  await page.locator('#evBtn').dispatchEvent('click');
  await expect(page.locator('#evTitle')).toHaveText(/CENTRE IS OPEN/i);
  await page.locator('#evBtn').dispatchEvent('click');

  const open = await page.evaluate((seal: string) => {
    const w = (window as any).__cw;
    const i = seal.indexOf(',');
    const b = w.blockAt(+seal.slice(0, i), +seal.slice(i + 1));
    return {
      lit: w.g.ground.lit.length,
      sealId: b ? b.id : null, hard: b ? b.hard : 0,
      seenCentre: w.g.seen.includes(
        Math.floor(w.VAULT_CORE_X / w.MAP_TILE) + ',' + Math.floor(w.VAULT_CORE_D / w.MAP_TILE)),
      won: w.g.won
    };
  }, shut.seal!);
  expect(open.lit).toBe(9);
  expect(open.sealId, 'the seal did not open on the ninth Anchor').toBe('vaultopen');
  expect(Number.isFinite(open.hard), 'the seal is open and still uncuttable').toBe(true);
  expect(open.hard,
    `the open seal drills at ${open.hard} - the last wall should still cost something`)
    .toBeGreaterThan(20);
  expect(open.seenCentre,
    'nine Anchors and the map still does not know where the centre is').toBe(true);
  expect(open.won, 'the game ended before the ship got there').toBe(false);

  /* ---- and reaching it ----

     Standing next to the core, exactly like an Anchor. Nothing here calls the
     ending: the assertion is that flying down to it IS the ending. */
  const won = await page.evaluate(() => {
    const w = (window as any).__cw;
    w.g.px = w.VAULT_CORE_X; w.g.pd = w.VAULT_CORE_D - 1;
    w.g.fuel = w.S.fuelCap(); w.g.hull = w.S.hullCap();
    w.advance(0.2);
    return { won: w.g.won, mode: w.g.mode,
             title: (document.getElementById('evTitle') || {}).textContent };
  });
  expect(won.won, 'reaching the centre did not end the game').toBe(true);
  expect(won.mode, 'the ending did not stop the game to say so').toBe('event');
  expect(won.title).toMatch(/VAULT/i);

  /* It does not throw you back to a title screen: the world is still there,
     and so is everything in it. */
  await page.locator('#evBtn').dispatchEvent('click');
  const after = await page.evaluate(() => {
    const w = (window as any).__cw;
    const b = w.blockAt(w.VAULT_CORE_X, w.VAULT_CORE_D);
    return { mode: w.g.mode, won: w.g.won, coreId: b ? b.id : null };
  });
  expect(after.mode, 'the game ended the session rather than the errand').toBe('play');
  expect(after.won, 'winning did not stick').toBe(true);
  expect(after.coreId, 'the Vault looks exactly the same after it opened').toBe('vaultlit');
});
