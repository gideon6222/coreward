import * as THREE from 'three';
import { ambienceTick } from './sim/ambience';
import { FIND_COLOR } from './sim/finds';
import { W, HULL_MAX, DIG_BASE, DEF, SUPPLY_OF, DROP_MIN_VALUE, RELIC_COLOR, relicFor,
         coreDepth, valueMult, skyHi, skyLo, ORES,
         GAS_HULL_DAMAGE, GAS_SOAK, traitOf, heatDepth, tremorDepth, paletteOf } from './sim/config';
import { clamp, key, mixHex } from './sim/util';
import { g, S, save, coreM, valueM, worldTrait, cutGround, padFuel, markSeen,
         groundTick, hereUnrest, lightHere, vaultHere } from './sim/state';
import { unrestBand, tremorScale } from './sim/unrest';
import { landCollapse, closeGround } from './collapse';
import { blockAt, findHere, climbCells } from './sim/world';
import { tilesSeen } from './sim/region';
import { R } from './sim/runtime';
import type { Dir } from './types';
import {
  FREEZE_ORE, FREEZE_ROCK,
  SHAKE_CRACK, SHAKE_ROCK, SHAKE_ORE, SHAKE_LANDING, SHAKE_DECAY,
  SQUASH_DIG, SQUASH_BREAK, SQUASH_DECAY, SQUASH_SCALE,
  CAM_FOLLOW_PLAY, CAM_FOLLOW_PLAY_Y, CAM_FOLLOW_FLY, CAM_FOLLOW_FLY_Y,
  CAM_ZOOM_RATE, CAM_Y_OFFSET, CAM_BOOST_DECAY, CAM_SURFACE_BACK, CAM_SURFACE_LIFT,
  BANK_INTO_MOVE, BANK_SETTLE,
  FACE_TURN_RATE,
  AMBIENT_SURFACE, AMBIENT_DEEP, LIGHT_FALL_POW, FOG_SURFACE, FOG_GAIN, FOG_COLOR_RUSH,
  RIM_SURFACE, RIM_DEEP, LAMP_INTENSITY, LM_RANGE_MULT,
  VIGNETTE_CLEAR_SURFACE, VIGNETTE_CLEAR_DEEP, VIGNETTE_EDGE_SURFACE, VIGNETTE_EDGE_DEEP,
  FUEL_PER_MOVE, HULL_REGEN, FLY_ACCEL, FLY_DRAG, SHIP_R, DIG_ALIGN,
  LANE_PULL, DIG_ALIGNED,
  depthT, heatT, easeInOut, approach, zoomForScan, digFuelForStep, heatDamagePerSecond, soakAfter,
  tremorTick, TREMOR_EVERY, TREMOR_JITTER, chargeAfter, fuelToClimb, fuelState, FUEL_IDLE
, SETTLE_RATE, SETTLE_DONE, SETTLE_MAX} from './sim/feel';
import { scene, camera, renderer, gameEl, amb, sun, rim, lamp, fog, shipKey, renderWorld } from './scene';
import { lerpHex, worldX, crackGeo, crackMat } from './materials';
import { meshes, syncBlocks, dropBlock, beginDig, pulseHaloes } from './blocks';
import { updateLight, setHazeColor } from './lightmap';
import { spray, stepParticles, starMat, sunSprite } from './particles';
import { stepDust } from './dust';
import { leaveDrop, stepDrops } from './drops';
import { stepBeam } from './beam';
import { moveAndCollide, thrust, laneVel, headingFor } from './sim/fly';
import { player, rig, bit, flames, lensFlares, drillTint, FACE_ANGLE, SHIP_Z } from './ship';
import { padLights, beam } from './pad';
import { updateBallast } from './ballast';
import { hap } from './haptics';
import { crossedMark, fadeMark } from './mark';
import { aimRelic } from './relic';
import { stepParallax, fadeParallax, setParallaxTint } from './parallax';
import { ui, atSurface, updateHUD, toast, flash, tickToast, tickFound, foundBanner } from './ui';
import { stepGauges } from './gauges';
import { sell, goSurface, die, tremor, collectHere, grantCache, grantFind, showEvent, stopDigging, absorb, anchorLit, vaultReached } from './actions';
import { sfx, setDepth, setMood } from './audio';
import { isDocked, stepStation, renderStation } from './station';
import { isShowcase, stepShowcase, renderTransit,
         landingT, isLanding } from './transit';
import { introTick, beatT } from './sim/intro';
import { endIntro, paintBeat, beginIntroLanding, titleLanding, finishLanding } from './titleui';

export const FACE_VEC: Record<Dir, number[]> =
  { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

export function step(dir: Dir) {
  const v = FACE_VEC[dir];
  return { x: Math.round(g.px) + v[0], d: Math.round(g.pd) + v[1] };
}

/* Is this cell something the ship cannot fly through?

   The world edges and the roof above the pad are solid too. Without them the
   ship would drift out of the world sideways, or up into a sky that has no
   floor and no way back. */
export function solidAt(cx: number, cy: number) {
  if (cx < 0 || cx >= W) return true;
  if (cy < -1) return true;
  if (cy > coreM()) return true;
  return blockAt(cx, cy) !== null;
}

/* Begin drilling a cell the ship has flown into. */
function startDig(tx: number, td: number, dir: Dir) {
  if (R.digging) return;
  const b = blockAt(tx, td);
  if (!b || b.hard === Infinity) return;
  {
    const t = { x: tx, d: td };
    /* lift this cell out of the instanced terrain into a real mesh, so the
       dig animation has something to scale, jitter and hang cracks on */
    /* Pick up where the last attempt stopped. The stored value is a fraction,
       so a drill bought in between makes the REMAINDER faster without making
       the work already done disappear. */
    const total = (b.hard * DIG_BASE) / S.drill();
    const done = clamp(g.damage[key(t.x, t.d)] || 0, 0, 0.985);
    beginDig(t.x, t.d, b, done);
    R.digging = { x: t.x, d: t.d, dir, t: done * total, total, block: b,
                  stage: Math.floor(done * 5), spark: 0 };
    sfx.digStart(b.hard);
    R.squash = SQUASH_DIG;
  }
}

let camZBoost = 0, freeze = 0, thrustLevel = 0, bank = 0;
let last = performance.now(), skyTick = 0;

/* Seconds of game time since boot, accumulated from the deltas rather than read
   off the wall clock. Decorative pulses used to read `performance.now()`
   directly, which is fine at 60 fps and useless the moment the loop is driven
   by anything other than real time: a run compressed into a hundred
   milliseconds would have had its haloes pulse for a hundred milliseconds while
   the ship crossed forty metres. */
let clock = 0;

/* The rAF half: work out how much time passed and hand it on. Nothing else.

   Everything the game actually does lives in tick(), which takes a delta and
   never asks what time it is. That split is what makes a whole run drivable
   from a test in milliseconds instead of in real seconds - see advance().

   The handle is kept so the clock can be stopped. A test that takes over the
   loop while real frames are still arriving is measuring the two of them
   interleaved, and how many real frames got in first depends on how fast the
   machine booted the bundle. */
let raf = 0;

export function frame(now: number) {
  raf = requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
  tick(raw);
}

/* Stop the real-time clock so a caller can drive the loop itself. */
export function stopClock() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

/* Give it back.

   The seam could stop the clock and not restart it, which was fine while
   `advance()` was only ever used by tests that drove everything themselves
   from that point on. The moment one test helper advanced a few seconds and
   then handed back to a spec that holds a d-pad in real time, the game was
   frozen and six specs failed at once - a stopped clock looks exactly like a
   game that will not move.

   `last` is reset here, or the first frame after resuming carries every
   millisecond spent stopped and the ship teleports. */
export function startClock() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

/* Run `seconds` of game time as fixed steps, as fast as the CPU allows.

   Only the LAST step renders. Nothing in renderer.render() feeds back into game
   state, so drawing every step buys nothing and costs everything: a headless
   browser falls back to a software rasteriser, where a draw is milliseconds
   rather than microseconds, and a minute of simulated play becomes minutes of
   real time. Drawing the final step keeps draw calls and every instance count
   honest for whatever the caller asserts next.

   The step is fixed at 1/60 rather than taken from real elapsed time, so the
   same call produces the same run on any machine. */
/* IT STOPS THE CLOCK AND DOES NOT GIVE IT BACK. Call `startClock()` if the
   caller wants real frames afterwards.

   Deliberate, and the stop is the point: a caller driving the loop while real
   frames are also arriving is measuring the two of them interleaved, and how
   many real frames got in first depends on how fast the machine booted the
   bundle. But the failure mode of forgetting is vicious - the game simply
   freezes, with the mode still 'play' and the key still held, which looks like
   an input or physics bug and is neither. It has now cost two runs, and the
   warning was sitting beside `startClock`, which is the function nobody calls,
   rather than here, which is the one everybody does. */
export function advance(seconds: number, step = 1 / 60) {
  stopClock();
  const n = Math.max(1, Math.round(seconds / step));
  for (let i = 0; i < n; i++) tick(step, i === n - 1);
}

export function tick(raw: number, draw = true) {
  clock += raw;
  const frozen = freeze > 0;
  if (frozen) freeze -= raw;
  const dt = frozen ? 0 : raw;

  thrustLevel *= 0.86;

  if (g.mode === 'fly' && R.flight) {
    R.flight.t += dt;
    const raw01 = clamp(R.flight.t / R.flight.dur, 0, 1);
    const u = easeInOut(raw01);
    const p = R.flight.curve.getPointAt(clamp(u, 0, 1));
    const dx = p.x - R.flight.last.x, dy = p.y - R.flight.last.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.0005) {
      /* Nose along the way it is GOING. FACE_ANGLE has down = 0, so rotation
         zero points the drill at the floor and the heading that goes with an
         angle is (sin, -cos) - note the minus, which is the whole bug. With
         atan2(dx, dy) the ship flew the whole route home pointing at the
         ground, reversing up its own shaft: *"when the autopilot takes you
         back to the platform, can you make it drive forward back to the start
         instead of reverse all the way back?"* */
      const ang = headingFor(dx, dy);
      let df = ang - rig.rotation.z;
      while (df > Math.PI) df -= Math.PI * 2;
      while (df < -Math.PI) df += Math.PI * 2;
      rig.rotation.z += df * Math.min(1, dt * 9);
    }
    R.flight.last.copy(p);
    g.px = p.x + (W - 1) / 2;
    g.pd = -p.y;
    thrustLevel = 1;
    camZBoost += (2.4 - camZBoost) * Math.min(1, dt * 3);
    syncBlocks();
    /* Exhaust out of the BACK, which is now a direction that changes: flying
       home nose-first, the thruster plume trails below, and round a corner it
       swings with the hull. Fixed at p.y + 0.4 it sat in front of the ship. */
    if (Math.random() < 0.9) {
      const m = Math.hypot(dx, dy) || 1;
      spray(p.x - (dx / m) * 0.45, p.y - (dy / m) * 0.45, 0x7ad4ff, 2, 2.4, 0.35);
    }
    if (raw01 >= 1) {
      R.flight = null;
      camZBoost = 0;
      goSurface();
      g.mode = 'play';
      sell();
      R.shake = SHAKE_LANDING;
      flash('rgba(110,220,255,.22)', 240);
    }
  } else if (g.mode === 'settle') {
    /* The touchdown. The ship closes on the pad on the same approach()
       smoothing the camera and the needles use, so it reads as the game
       arriving rather than as a scripted move.

       On `raw` rather than `dt`: nothing here is simulation, and hit-stop
       cannot be in flight before the player has the controls anyway.

       The timeout is not belt-and-braces - approach() is asymptotic and never
       reaches its target, so something has to decide when close is down. */
    R.settleT += raw;
    g.pd = approach(g.pd, -1, SETTLE_RATE, raw);
    thrustLevel = 1;
    if (Math.abs(g.pd + 1) < SETTLE_DONE || R.settleT >= SETTLE_MAX) {
      g.pd = -1;
      g.mode = 'play';
      R.wasAtSurface = true;
      /* Dust off the pad as the weight goes on. */
      spray(worldX(g.px), -g.pd - 0.4, 0xcfc0a4, 26, 3.4, 0.8);
      sfx.supply();
      R.shake = Math.max(R.shake, 0.28);
    }
  } else if (g.mode === 'play') {
    /* The only clock the run log keeps. It runs in play and nowhere else, so
       time spent paused, shopping or reading the manifest never dilutes a rate. */
    R.run.sec += dt;
    /* The timed consumables. On `dt` rather than `raw`, so hit-stop pauses
       them with the simulation - a window bought with a limited resource must
       not be spent by frames in which nothing happened. */
    if (R.odT > 0) R.odT = Math.max(0, R.odT - dt);
    if (R.pulseT > 0) R.pulseT = Math.max(0, R.pulseT - dt);

    /* What this world does, as opposed to what colour it is - see
       ambience.ts. On `raw` rather than `dt`: weather does not stop for
       hit-stop, and a world that froze its own air every time you struck rock
       would read as the game stuttering. */
    const em = ambienceTick(R.amb, worldTrait(), g.pd, raw, Math.random(), Math.random());
    if (em) {
      spray(worldX(g.px) + em.dx, -g.pd + em.dy, em.color, em.count, em.power, em.life);
    }
    camZBoost = approach(camZBoost, 0, CAM_BOOST_DECAY, raw);
    /* Let go and the drill stops. It used to run to completion no matter what,
       which meant the only way to change your mind about a block was to have
       not started it. */
    /* Let go, or turn away, and the drill stops - the block keeps its damage.

       Against the direction the cut STARTED in, and nothing else. The previous
       version rebuilt that direction each frame from `Math.round()` of the
       ship's position, which is a different fact: off a lane the ship's radius
       reaches into the next row, so the collision could stop it on a cell one
       row off its rounded position and the reconstructed direction came back
       diagonal. It then cancelled the dig on the very frame after starting it,
       forever - the ship pressed against rock, drill stuttering, nothing
       happening. Two facts that could disagree are now one fact that cannot. */
    if (R.digging && R.held !== R.digging.dir) stopDigging();

    if (R.digging) {
      const b = R.digging.block;
      R.digging.t += dt;
      /* Held against the rock and pulled onto the block's centre line - ACROSS
         the cut, never along it. Without the alignment a tunnel dug while
         drifting wanders off the grid and the drill visibly misses the cell it
         is cutting.

         The old version aligned whichever axis did not already match, which for
         a dig is always the wrong one: the target cell is one step AHEAD, so the
         mismatched axis is the direction of the cut, and "aligning" it drove the
         ship into the rock it was drilling - by writing g.px/g.pd directly, so
         the collision never saw it happen. Drilling down from 49 sank the ship
         to 49.58, inside the cell at 50.

         It was invisible because the old lane pull ran while coasting and the
         collision ejected the ship back out of the wall on release, so it
         presented as a jerk after every block rather than as a ship inside a
         rock. Removing that pull to fix the bouncy stop is what exposed it.

         Keyed off the direction the cut started in, which the dig now stores. */
      R.vx = 0; R.vy = 0;
      if (FACE_VEC[R.digging.dir][0] === 0) g.px = approach(g.px, R.digging.x, DIG_ALIGN, raw);
      else g.pd = approach(g.pd, R.digging.d, DIG_ALIGN, raw);
      /* Against the cell's own total rather than against the clock, so the
         Drill buys speed and never efficiency - see fuelPerCell in feel.ts. */
      const df = digFuelForStep(b.hard, R.digging.total, dt) * S.cellFuel();
      g.fuel -= df;
      R.run.secDig += dt; R.run.fuelDig += df;
      const k = key(R.digging.x, R.digging.d);
      const o = meshes.get(k);
      const prog = clamp(R.digging.t / R.digging.total, 0, 1);
      bit.rotation.y += raw * 30;

      if (o) {
        const stage = Math.floor(prog * 5);
        o.scale.setScalar(1 - 0.07 * stage);
        o.position.x = worldX(R.digging.x) + (Math.random() - 0.5) * 0.07 * prog;
        o.position.y = -R.digging.d + (Math.random() - 0.5) * 0.07 * prog;
        if (stage > R.digging.stage) {
          R.digging.stage = stage;
          const cr = new THREE.Mesh(crackGeo, crackMat);
          cr.rotation.z = Math.random() * Math.PI;
          cr.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0.5);
          cr.scale.x = 0.5 + Math.random() * 0.5;
          o.add(cr);
          spray(o.position.x, o.position.y, b.color, 12, 2.8, 0.5);
          sfx.crack(b.hard);
          R.shake = Math.max(R.shake, SHAKE_CRACK);
        }
      }
      R.digging.spark -= dt;
      if (R.digging.spark <= 0) {
        R.digging.spark = 0.1;
        /* The drill's colour, not the rock's - break sprays keep the block
           colour because that is ore identity, but the continuous spark
           belongs to the tool.

           Count and speed climb with the tier as well as hue. Steel and
           Godcore are both pale, so colour alone is legible side by side and
           forgettable on its own; a drill throwing three times the sparks
           twice as hard is legible on its own. */
        const tier = g.up.drill;
        spray(worldX(R.digging.x), -R.digging.d, drillTint,
          2 + Math.floor(tier / 2.5), 1.9 + tier * 0.16, 0.4 + tier * 0.02);
        sfx.chip(b.hard);
      }

      if (R.digging.t >= R.digging.total) {
        /* Against DROP_MIN_VALUE, not against zero. Since plain dirt started
           paying a token amount, `value > 0` is true of nearly everything and
           the ratio read 98.5% - accurate, and saying nothing. DROP_MIN_VALUE is
           the game's own existing line for "worth coming back for", which is the
           question this row is actually asking. */
        R.run.blocks++; if (b.value >= DROP_MIN_VALUE) R.run.oreBlocks++;
        g.dug.add(k);
        /* The planet feels every cell that leaves it. */
        cutGround(R.digging.x, R.digging.d);
        delete g.damage[k];
        dropBlock(k);
        spray(worldX(R.digging.x), -R.digging.d, b.color, b.ore ? 52 : 24, b.ore ? 6.5 : 4, 0.85);
        sfx.digStop();
        /* POLISH.md: one event, four channels. The shake and the freeze are on
           the next two lines and the sound is on the one above. */
        if (b.ore) hap.ore(); else hap.cut();
        freeze = b.ore ? FREEZE_ORE : FREEZE_ROCK;
        R.shake = Math.max(R.shake, b.ore ? SHAKE_ORE : SHAKE_ROCK);
        R.squash = SQUASH_BREAK;
        /* Carry the ship straight into the cell it just opened.

           Velocity is held at zero while drilling, so without this the ship
           would restart from a standstill after every block - and at nearly a
           fifth of a second to top speed, digging a shaft would be a stutter
           of accelerate, stop, accelerate. This is what the old cell-to-cell
           step did for free, and it is the one thing about the grid worth
           keeping. */
        const fv = FACE_VEC[g.face];
        R.vx = fv[0] * S.speed();
        R.vy = fv[1] * S.speed();
        if (b.hazard) {
          /* A gas pocket pays nothing and costs you. It breaks faster than the
             rock around it, so you usually hit one by accident - which is the
             point: it is the surprise that makes a descent differ from the last
             one, and it gives dwelling deep a second thing to fear besides
             heat. The soak spike is what actually bites, because it multiplies
             every bit of heat damage for the rest of the trip. */
          const dmg = absorb(Math.round(GAS_HULL_DAMAGE * (worldTrait().gasDamage || 1) * S.gasTake()));
          R.run.hullGas += dmg;
          g.hull -= dmg;
          R.hullCause = 'gas';
          g.soak = Math.min(1, g.soak + GAS_SOAK);
          R.shake = Math.max(R.shake, 0.7);
          flash('rgba(150,220,80,.30)', 380);
          spray(worldX(R.digging.x), -R.digging.d, b.color, 90, 9, 1.5);
          sfx.gas();
          toast('Gas pocket! Hull -' + dmg);
          R.digging = null;
          save();
        }
        else if (b.relic) {
          /* The only thing in the game you can miss permanently: break the
             core with this still in the ground and it goes with the planet. */
          const rel = relicFor(g.planet);
          g.relics.push(rel.id);
          g.relicsTaken.push(g.planet);
          spray(worldX(R.digging.x), -R.digging.d, 0xffffff, 160, 11, 2.0);
          spray(worldX(R.digging.x), -R.digging.d, RELIC_COLOR, 120, 8, 2.4);
          flash('rgba(255,240,255,.55)', 700);
          R.shake = Math.max(R.shake, 0.8);
          sfx.relic();
          showEvent('RELIC RECOVERED', rel.name + '. ' + rel.blurb +
            '  Relics found: ' + g.relics.length + '.', 'STOW IT', () => {});
          R.digging = null;
          save();
        }
        else if (b.find) {
          /* A device. Unlike a relic or a component this does NOT open a
             modal: the research is consistent that a discovery announces
             itself and lets play carry on, and this is a thing you are about
             to use rather than the end of a search. The banner runs itself
             out over four seconds while the drill keeps turning. */
          const f = findHere(R.digging.x, R.digging.d);
          if (f) grantFind(f.key, R.digging.x, R.digging.d);
          spray(worldX(R.digging.x), -R.digging.d, 0xffffff, 150, 10, 1.8);
          spray(worldX(R.digging.x), -R.digging.d, FIND_COLOR, 120, 8, 2.2);
          flash('rgba(80,255,140,.34)', 520);
          R.shake = Math.max(R.shake, 0.55);
          R.digging = null;
          save();
        }
        else if (b.cache) {
          /* A cache pays in something other than ore, so it never enters the
             hold - which also means it never costs you cargo weight, and a
             full hold is no reason to leave one in the ground. */
          grantCache(R.digging.x, R.digging.d);
          spray(worldX(R.digging.x), -R.digging.d, b.color, 70, 7, 1.2);
          flash('rgba(255,150,215,.22)', 340);
          R.digging = null;
          save();
        }
        else if (g.weight + b.wt > S.cargoCap()) {
          /* The drill never refuses any more. What will not fit is left at the
             cell it came from - ore waits to be flown through, plain rock is
             spoil and is thrown away, because a tunnel full of glowing dirt
             would be noise rather than a decision. */
          /* Worth-based rather than ore-based: seams are rock and are worth
             coming back for, plain rock is spoil at any depth. */
          const kept = b.value >= DROP_MIN_VALUE && leaveDrop(R.digging.x, R.digging.d, b.id);
          if (kept) sfx.drop();
          if (!R.warnedFull) {
            R.warnedFull = true;
            toast(kept ? 'Hold full · ore left where it falls' : 'Hold full at ' + S.cargoCap() + ' kg');
          }
          R.digging = null;
          save();
        }
        else {
          g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
          g.weight += b.wt;
          if (b.ore) sfx.collect(b.tone);
          /* ---------- the first one of its kind ----------

             Playtest: *"I want there to be way less special resources to show
             up so it actually feels like a prize when you get one."*

             Rarity is manufactured by depth - a material does not exist above
             its floor, so most runs never roll for the deep ones at all. This
             is the other half: the MOMENT. The sourced pattern for making a
             rare pull read as rare is withheld-then-revealed with a distinct
             beat, rather than a background particle nobody catches, so the
             first Solmarrow anybody ever cuts stops the frame, flashes in its
             own colour and says what it is worth.

             Once, ever, per material. After that it is ore and the toast below
             is the right size for it - the prize is the discovery, not the
             pickup. */
          const ore = ORES.find((o) => o.id === b.id);
          if (b.ore && !b.core && ore && !g.seenOre.includes(b.id)) {
            g.seenOre.push(b.id);
            freeze = Math.max(freeze, FREEZE_ORE * 2.5);
            R.shake = Math.max(R.shake, 0.5);
            spray(worldX(R.digging.x), -R.digging.d, 0xffffff, 140, 10, 2.0);
            spray(worldX(R.digging.x), -R.digging.d, b.color, 160, 8, 2.4);
            flash('rgba(255,255,255,.30)', 420);
            sfx.relic();
            hap.boom();
            foundBanner(b.name,
              'Worth ◈ ' + Math.round(b.value * valueM()).toLocaleString() +
              ' a unit.' + (ore ? ' It does not exist above ' + ore.min + ' m.' : ''),
              'ore');
          } else if (b.value >= 400) {
            toast(b.name + '  +◈ ' + Math.round(b.value * valueM()).toLocaleString());
          }
          R.digging = null;
          save();
        }
      }
    } else {
      /* ---------- flight ----------

         Thrust toward whatever is held, coast when nothing is, then push out
         of anything solid. The collision returns the cell that stopped the
         ship on each axis, and that cell is how digging starts: you fly into a
         wall, the wall stops you, and the wall is what the drill points at.
         There is no separate "is there a block in front of me" test, which is
         what stops the two from ever disagreeing. */
      const v = R.held ? FACE_VEC[R.held] : [0, 0];
      const top = S.speed();
      R.vx = thrust(R.vx, v[0], top, FLY_ACCEL, FLY_DRAG, raw);
      R.vy = thrust(R.vy, v[1], top, FLY_ACCEL, FLY_DRAG, raw);

      /* Lanes. Travel freely along the axis being pushed on; be drawn onto the
         centre line of the other one, and ONLY while something is held.

         Playtest: *"The ship looks very bouncy when you change direction or
         stop... or not make it align until you change direction? I want it to
         ease into a stop."* Both halves of that were the same two mistakes:

         **It assigns, it does not add.** `+=` stacked a correction on top of a
         velocity that was often already carrying the ship toward the lane, so
         the pair overshot, got corrected back, and overshot again. That
         oscillation is the bounce. Assigned, the perpendicular velocity IS the
         exponential approach - it cannot overshoot, because the value is
         exactly the speed that lands on the line and no more. Discarding
         whatever the axis was doing is not a loss either: while you are
         thrusting one way, drift the other way is the thing being removed.

         **Nothing held means no pull at all.** The old version aligned both
         axes while coasting, which is worse than untidy: the nearest lane is as
         often behind the ship as ahead of it, so a release near a cell edge
         hauled the ship BACKWARDS against its own coast. Letting go is now drag
         and nothing else - a clean ease-out that never reverses. The ship comes
         to rest wherever it rests, which costs nothing, because the next
         direction you press aligns it on the way.

         Applied as a velocity rather than written onto the position, so the
         correction goes through the same collision as everything else and can
         never seat the ship inside rock. */
      if (v[0] !== 0)      R.vy = laneVel(g.pd, LANE_PULL, raw);
      else if (v[1] !== 0) R.vx = laneVel(g.px, LANE_PULL, raw);

      const beforeX = g.px, beforeY = g.pd;
      const hit = moveAndCollide(g.px, g.pd, R.vx, R.vy, raw, SHIP_R, solidAt);
      g.px = hit.x; g.pd = hit.y;
      R.vx = hit.vx; R.vy = hit.vy;

      /* Distance actually covered, taken from the positions the collision
         returned rather than from the velocity, so a frame spent pressed
         against rock counts as the nothing it was. */
      R.run.metres += Math.abs(hit.x - beforeX) + Math.abs(hit.y - beforeY);

      if (R.held) {
        g.face = R.held;
        const ff = FUEL_PER_MOVE * S.fuelUse() * dt;
        g.fuel -= ff;
        R.run.secFly += dt; R.run.fuelFly += ff;
        thrustLevel = 0.75;
        /* Only the axis being pushed on can start a dig. Scraping along a
           ceiling while flying sideways must not begin drilling the ceiling.

           The collision says THAT the ship was stopped; the lane says WHICH
           cell is ahead. Taking the target from the lane is what keeps the
           drill pointing at what it is cutting - and while the ship is still
           being pulled in after a turn, it is not lined up on anything yet, so
           it waits. That is a tenth of a second, and it is the difference
           between aiming and guessing. */
        const blocker = v[0] !== 0 ? hit.hitX : hit.hitY;
        const off = v[0] !== 0 ? g.pd - Math.round(g.pd) : g.px - Math.round(g.px);
        if (blocker && Math.abs(off) < DIG_ALIGNED) {
          const t = step(R.held);
          if (blockAt(t.x, t.d)) startDig(t.x, t.d, R.held);
        }
      }

      /* Bank into the drift, in the ship's own frame: sideways for the ship is
         whichever axis it is not pointing along. Reading it off vx regardless
         of facing meant flying left or right banked the ship for going FAST
         rather than for going sideways. */
      const lateral = (g.face === 'left' || g.face === 'right') ? R.vy : R.vx;
      bank = approach(bank, clamp(lateral / Math.max(1, top), -1, 1) * 0.45, BANK_INTO_MOVE, raw);
      bit.rotation.y += raw * (3 + Math.abs(R.vx) + Math.abs(R.vy));
      syncBlocks();
      collectHere();

      /* Selling used to happen on arriving in the pad's cell. There are no
         cell arrivals any more, so it is an edge trigger on being at the
         surface at all - which also means it fires once however slowly the
         ship drifts up onto the pad. */
      const now = atSurface();
      if (now && !R.wasAtSurface) {
        sell(); g.fuel = padFuel(); g.hull = S.hullCap();
        /* And this is the door. A region chosen while you were underground
           comes down NOW, with the ship on the pad and nothing in the hold to
           lose - see the note at the top of unrest.ts about why a collapse
           never lands on somebody who is still down there. */
        landCollapse();
        /* And the ground that closed while you were down there. After the
           collapse, because a region that has just come down has no tunnels
           left to close. */
        closeGround();
      }
      R.wasAtSurface = now;
    }

    /* Standing next to an Anchor lights it. Five Map lookups, every frame -
       see lightHere() for why it cannot be on a timer. */
    const litNow = lightHere();
    if (litNow >= 0) anchorLit(litNow);
    /* And the same for the centre, which is the end of the game. */
    else if (vaultHere()) vaultReached();

    /* The Ballast's own clock, and it only runs while the game is playing -
       not behind a shop sheet, not on the title, not mid-crossing. It decays
       while you are out working, which is the only time it is fair. */
    groundTick(dt);

    /* Power cells trickle back underground and fill at the pad; see
       chargeAfter in feel.ts for why it is both. */
    g.charge = chargeAfter(g.charge, dt, atSurface(), S.powerCap() + S.powerExtra(),
                           S.rechargeMult());

    /* soak builds while deep and bleeds off above, so staying is the gamble */
    R.worldT += dt;
    const heatLine = heatDepth(g.planet, worldTrait());
    const heatSpan = coreM() - heatLine;
    g.soak = soakAfter(g.soak, g.pd, dt, worldTrait().soak || 1, heatLine);
    if (g.pd > heatLine) {
      /* heat ramps in below this world's own heat line and escalates with
         soak; see feel.ts and heatDepth() in config.ts */
      const hd = heatDamagePerSecond(g.pd, S.shield(), g.soak, heatLine, heatSpan) * S.heatTake() * dt;
      g.hull -= hd;
      R.run.hullHeat += hd;
      R.hullCause = 'heat';
      /* Say it once, at the metre it starts. The HUD carries it from here. */
      if (!R.wasHot) {
        R.wasHot = true;
        toast('Overheating - the hull is draining');
        flash('rgba(255,120,30,.20)', 420);
      }
    } else if (atSurface()) {
      g.hull = Math.min(S.hullCap(), g.hull + HULL_REGEN * dt);
      g.fuel = S.fuelCap();
    } else if (S.repair() > 0 && g.hull < S.hullCap()) {
      /* The Repair Drone, and it only runs where the pad cannot reach you.

         Deliberately an order of magnitude under what soak takes at depth: it
         turns a bad run into a long one rather than making heat survivable.
         In the `else` chain AFTER the overheating branch on purpose - a drone
         that ticked while the hull was draining would be quietly cancelling
         part of the hazard, which is the one thing it must not do. */
      g.hull = Math.min(S.hullCap(), g.hull + S.repair() * dt);
    }

    /* Two metres of hysteresis, so hovering on the line cannot spam the
       warning every time the camera lerp nudges you across it. */
    if (R.wasHot && g.pd < heatDepth(g.planet, worldTrait()) - 2) R.wasHot = false;

    /* ---------- personal best ----------
       Updated live so it survives a tow, but the marker line stays where it
       was when this run began - see mark.ts. */
    if (g.pd > g.best.depth) g.best.depth = Math.floor(g.pd);
    const beat = crossedMark(g.pd);
    if (beat) {
      toast('New record · deeper than ' + beat + ' m');
      flash('rgba(140,230,255,.20)', 420);
      sfx.record();
    }
    fadeMark(g.pd);
    aimRelic();

    /* ---------- tremors ----------
       The clock only runs inside the unstable band and is reset the moment
       you leave it, so climbing out of the band is a real reprieve rather
       than a pause. */
    /* Unrest reaches the player HERE, and mostly only here.

       Two ways, and both are things you feel rather than read. Restless ground
       shakes at depths that used to be quiet - past the second band the depth
       gate stops applying at all - and it shakes more often everywhere, up to
       about three times as often at the top of the meter.

       Nothing anywhere says so. That is deliberate: the research on withheld
       rules is that you learn a hazard by watching it, and a tooltip reading
       "Unrest 0.62: tremor rate x2.4" would turn a place that is getting
       dangerous into a status effect. */
    const localUnrest = hereUnrest();
    const shaky = unrestBand(localUnrest) >= 2;
    const tk = tremorTick({ t: R.tremorT, warn: R.tremorWarn }, dt,
      (g.pd > tremorDepth(g.planet) || (shaky && g.pd > 4)) && !R.flight,
      () => (TREMOR_EVERY + Math.random() * TREMOR_JITTER) / tremorScale(localUnrest));
    R.tremorT = tk.t;
    R.tremorWarn = tk.warn;
    if (tk.warned) { toast('The rock is shifting'); sfx.rumble(); }
    if (tk.shake > 0) R.shake = Math.max(R.shake, 0.10 + 0.34 * tk.shake);
    if (tk.fired) {
      const n = tremor();
      R.shake = Math.max(R.shake, 1.15);
      flash('rgba(180,150,110,.24)', 460);
      sfx.collapse();
      toast(n ? 'Tremor - ' + n + ' m of tunnel caved in' : 'Tremor - the rock held');
    }

    /* ---------- the Point of No Return ----------

       Recomputed a few times a second rather than every frame: the route home
       is a breadth-first search over every dug cell, and the answer does not
       move in sixteen milliseconds. See the note on R.climb. */
    /* The reactor idles while you are down here. See FUEL_IDLE: without it a
       ship at nought fuel simply sits in the dark for ever, because fuel only
       ever drained while flying or drilling and a tow used to be what ended
       that. Found by driving the tank to empty and watching nothing happen. */
    if (!atSurface()) {
      const idle = FUEL_IDLE * S.fuelUse() * dt;
      g.fuel -= idle;
      R.run.fuelIdle = (R.run.fuelIdle || 0) + idle;
    }

    R.climbT -= raw;
    if (R.climbT <= 0) {
      R.climbT = 0.35;
      R.climb = atSurface() ? 0 : fuelToClimb(climbCells(), S.speed());
      R.fuelState = fuelState(g.fuel, R.climb);
      /* What the lamp has shown you, folded into the map.

         INSIDE the expiry rather than beside it, and that is not a style
         choice: the timer is reset to 0.35 in the same frame it runs out, so
         `climbT <= 0` is only ever true at the top of the block on the first
         frame of the session. Written that way it recorded one tile and then
         never ran again - the map filled in at the pad and nowhere else.

         On this timer rather than every frame because the tiles are four cells
         across and the ship does not cross one in sixteen milliseconds. At
         0.35 s and full speed the samples are under three cells apart, which
         the lamp's radius covers with room to spare, so the trail has no gaps
         in it. */
      if (!atSurface()) {
        markSeen(tilesSeen(Math.round(g.px), Math.round(g.pd), S.light() * 0.7));
      }
    }
    /* Announced on the EDGE, once per step down, so the tone and the haptic
       are an event rather than a noise that runs for a minute. One escalating
       cue per resource is the sourced pattern; the hull has its own and they
       are deliberately different sounds. */
    if (R.fuelState !== R.warnedFuel) {
      const worse = ['clear', 'plan', 'danger', 'stranded'].indexOf(R.fuelState) >
                    ['clear', 'plan', 'danger', 'stranded'].indexOf(R.warnedFuel);
      R.warnedFuel = R.fuelState;
      if (worse && R.fuelState === 'plan') {
        toast('Fuel: enough to get home and little else');
        sfx.rumble();
      } else if (worse && R.fuelState === 'danger') {
        toast('TURN BACK - the climb is nearly all you have left');
        sfx.alarm();
        hap.hurt();
      } else if (worse && R.fuelState === 'stranded') {
        toast('You cannot reach the surface on what is left');
        sfx.alarm();
        hap.quake();
      }
    }

    if (g.fuel <= 0) { g.fuel = 0; die('fuel'); }
    else if (g.hull <= 0) { g.hull = 0; die(R.hullCause === 'gas' ? 'gas' : 'heat'); }
  }

  stepParticles(dt);
  stepBeam(raw);
  setDepth(g.pd);
  /* Hand the score what the depth actually MEANS. Danger is whichever of a
     failing hull or a full heat soak is worse, so the alarm layer answers to
     both without either drowning the other. */
  setMood(
    heatT(g.pd, heatDepth(g.planet, worldTrait()), (coreM() - heatDepth(g.planet, worldTrait())) * 0.55),
    g.pd > tremorDepth(g.planet) && g.mode === 'play' ? 1 : 0,
    Math.max(clamp((45 - g.hull) / 45, 0, 1), clamp((g.soak - 0.6) / 0.4, 0, 1))
  );

  /* Docked: the station is its own scene with its own lights, and the ship has
     been reparented into it. Everything below here - the ship transform, the
     lamp, the world ambience, the vignette - is about being underground, and
     running it against a ship that is no longer in that world would fight the
     station's own framing. So the loop stops here and draws the room. */
  /* The title screen and the intro, before anything else. Both run on the
     showcase - the crossing's own scene - so the ship has been reparented out
     of the world and nothing underground applies to it.

     The intro's clock runs on `raw`: it is a sequence of pictures, not
     simulation, and hit-stop cannot be in flight before the game has started
     anyway. */
  if (isShowcase()) {
    if (g.mode === 'intro' && R.intro) {
      const st = R.intro;
      const wasLanding = st.landing;
      if (introTick(st, raw)) paintBeat();
      /* Entering the landing is a transition, not a caption change, so it is
         watched for rather than returned. */
      if (!wasLanding && st.landing) beginIntroLanding();
      stepShowcase(raw, clock);
      /* Ordered AFTER the step so the last frame of the descent is drawn.
         Held in a local first, because endIntro clears R.intro and reading it
         back on the same frame is how the old version threw every single time
         the intro finished. */
      if (st.done) endIntro();
    } else {
      stepShowcase(raw, clock);
      /* A CONTINUE landing has no caption clock of its own - it is over when
         the flight says it is. */
      /* Not while it is still burning: isLanding() is false during the launch,
         and landingT() reads 1 from the previous descent, so testing the
         fraction alone would end the sequence on its first frame. */
      if (titleLanding() && isLanding() && landingT() >= 1) finishLanding();
    }
    tickToast(raw); tickFound(raw);
    if (draw) renderTransit();
    return;
  }

  if (isDocked()) {
    stepStation(clock, raw);
    tickToast(raw); tickFound(raw);
    updateHUD();
    stepGauges(raw);
    if (draw) renderStation();
    return;
  }

  /* ship transform */
  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, SHIP_Z);
  R.squash *= SQUASH_DECAY;
  const sq = 1 + R.squash * SQUASH_SCALE;
  player.scale.set(1 / sq, sq, 1);
  rig.rotation.y = bank;
  lamp.position.set(px, py, 1.7);
  /* the ship's own key travels with it, slightly in front and above */
  shipKey.position.set(px + 0.35, py + 0.5, 1.5);
  lamp.distance = S.light();

  /* The headlamp lenses. Dim in daylight, because a visible lamp against a
     bright sky reads as a bug, and grown by the Scanner Array so the upgrade
     is still something you can see rather than something you take on trust.

     These are a third of a cell across and sit on the hull, so unlike the wide
     halo they replaced they cannot paint a circle over the rock behind them.
     Scaled rather than faded: the sprite material is shared with every other
     glow of its colour. */
  const dark = depthT(g.pd);
  /* Scanner runs 8 m at level 0 to 29.6 m at level 9, mapped to between one and
     two lamp widths. Proportional would put a lens the size of the ship on the
     nose of the ship. */
  const reach = 1 + ((S.light() - 8) / 21.6) * 0.95;
  const lens = 0.3 * reach * (0.3 + 0.7 * dark);
  for (const f of lensFlares) f.scale.set(lens, lens, 1);

  if (g.mode !== 'fly') {
    const target = FACE_ANGLE[g.face];
    let diff = target - rig.rotation.z;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    /* approach() on the wrapped delta rather than on the angle itself, so the
       ship still turns the short way round. */
    rig.rotation.z += diff * (1 - Math.exp(-FACE_TURN_RATE * raw));
  }

  /* Solve the propagated light. After the facing above, because the lamp now
     points where the drill points and reading last frame's angle would leave
     the beam trailing the ship round every corner.

     Given the ship's exact position rather than its cell: the flood is on the
     grid, but the pool's centre and the shadow fan's origin are continuous,
     and that split is what keeps the light gliding rather than stepping a
     metre at a time. See lightmap.ts.

     Local forward is -Y and FACE_ANGLE has `down` at zero, so rotating (0,-1)
     by the smoothed facing gives world (sin, -cos) - which in the grid's
     frame, where +y is deeper, is (sin, cos). */
  const fz = rig.rotation.z;
  updateLight(g.px, g.pd, S.light() * LM_RANGE_MULT, Math.sin(fz), Math.cos(fz), raw, draw,
              S.surveyM());

  const fscale = 0.25 + thrustLevel * 1.15;
  for (const f of flames) {
    f.cone.scale.set(0.8 + thrustLevel * 0.5, fscale, 0.8 + thrustLevel * 0.5);
    f.cone.material.opacity = 0.25 + thrustLevel * 0.7;
    f.glow.scale.setScalar(0.35 + thrustLevel * 1.0);
  }

  /* world ambience */
  const tDeep = depthT(g.pd);
  /* Squared, not linear: see AMBIENT_DEEP in feel.ts. The fill light has to be
     gone by the time the lamp is the only thing lighting anything, and a linear
     ramp is still handing out a third of it halfway down. */
  const fall = Math.pow(1 - tDeep, LIGHT_FALL_POW);
  amb.intensity = AMBIENT_DEEP + (AMBIENT_SURFACE - AMBIENT_DEEP) * fall;
  sun.intensity = 1.5 * (1 - tDeep);
  rim.intensity = RIM_DEEP + (RIM_SURFACE - RIM_DEEP) * fall;
  lamp.intensity = LAMP_INTENSITY;
  fog.density = FOG_SURFACE + tDeep * FOG_GAIN;
  /* Below the heat line the whole world turns ember: sky, fog and the drifting
     dust all warm together. Three coordinated signals so the boundary reads at
     a glance instead of having to be noticed in the HUD. */
  const hot = heatT(g.pd, heatDepth(g.planet, worldTrait()),
                    (coreM() - heatDepth(g.planet, worldTrait())) * 0.55);
  const hi = lerpHex(skyHi(g.world), 0x02030a, tDeep).lerp(new THREE.Color(0x2e0b05), hot * 0.8);
  const lo = lerpHex(skyLo(g.world), 0x0a0c14, tDeep).lerp(new THREE.Color(0x6b1c08), hot * 0.85);
  /* The SKY keeps the gradual ramp; the fog does not. Fog only ever tints what
     is underground, and underground is not the colour of the horizon - at 40 m
     the old shared value was still a bright blue and was washing it over every
     distant surface in the game. */
  const tFog = clamp(tDeep * FOG_COLOR_RUSH, 0, 1);
  /* The deep fog target is the WORLD'S, not one shared near-black. It is most
     of what makes Cryon read as ice and Ashvault as ash from the surface down,
     because fog tints every distant surface in the frame at once. */
  const pal = paletteOf(g.world);
  fog.color.copy(lerpHex(skyLo(g.world), pal.fog, tFog).lerp(new THREE.Color(0x4a1305), hot * 0.85));
  /* The tunnel haze and the silhouettes behind it take the same palette. Heat
     still overrides all of it at the bottom - the heat line has to read the
     same on every world or it stops being a threshold the player can learn. */
  setHazeColor(mixHex(pal.haze, 0xff6a28, hot * 0.8));
  setParallaxTint(pal.para);
  /* ambient warms too, so the rock itself is lit hot rather than just fogged */
  amb.color.setHex(0xffffff).lerp(new THREE.Color(0xff8a52), hot * 0.6);
/* The mote field. World-anchored and wrapped around the ship rather than
     parented to it - see dust.ts for why that is the whole difference between
     dust and a texture on the camera. */
  stepDust(px, py, g.pd, raw, hot, pal.dust);

  skyTick += raw;
  if (skyTick > 0.12) {
    skyTick = 0;
    gameEl.style.background = 'linear-gradient(180deg,#' + hi.getHexString() + ' 0%,#' + lo.getHexString() + ' 100%)';
    /* The vignette closes in as you descend. At the surface it is a soft frame;
       deep down the clear area shrinks to not much more than the lamp's pool,
       which is most of what makes being deep feel enclosed rather than merely
       dark. Updated on the same slow tick as the sky - it does not need to run
       every frame and this is a CSS property write. */
    const clear = VIGNETTE_CLEAR_SURFACE + tDeep * (VIGNETTE_CLEAR_DEEP - VIGNETTE_CLEAR_SURFACE);
    const edge = VIGNETTE_EDGE_SURFACE + tDeep * (VIGNETTE_EDGE_DEEP - VIGNETTE_EDGE_SURFACE);
    /* Three stops rather than two. With a single ramp from clear to black the
       darkening is linear across the whole radius, which reads as a grey wash
       over the picture; holding the middle mostly clear and then falling off
       hard in the last third reads as light running out. */
    const mid = (clear + 100) / 2;
    ui.vignette.style.background =
      'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) ' + clear.toFixed(1) + '%, rgba(0,0,0,' +
      (edge * 0.34).toFixed(2) + ') ' + mid.toFixed(1) + '%, rgba(0,0,0,' + edge.toFixed(2) + ') 100%)';
  }

  const glowT = clock;
  pulseHaloes(glowT);
  for (let i = 0; i < padLights.length; i++) {
    const ph = (glowT * 1.6 - i * 0.22) % 2;
    padLights[i].scale.setScalar(0.55 + 0.5 * Math.max(0, 1 - Math.abs(ph - 0.5) * 3));
  }
  beam.material.opacity = 0.05 + 0.035 * Math.sin(glowT * 1.3);
  stepDrops(glowT);

  /* camera */
  /* The Scanner decides how much world is framed; see zoomForScan in feel.ts.
     Applied here rather than in resize() because the level changes in the shop
     and the camera's own lerp then turns the purchase into a visible zoom. */
  /* At the surface the camera pulls back and lifts, because the surface got
     wider in M2 and the shot was composed before there was a yard to include.
     `CRAFT.md`: re-shoot after any change to a length, since framing calibrated
     on old dimensions is wrong.

     Driven off depth rather than off a mode flag so it eases in and out as the
     ship rises and falls, and clamped to the top eight metres so nothing about
     the underground framing - which was calibrated over five sessions of
     lighting work - moves at all. */
  const surfaceT = clamp(1 - g.pd / 8, 0, 1);
  const zNow = (R.camZ + surfaceT * CAM_SURFACE_BACK) * zoomForScan(g.up.scan) + camZBoost;
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * zNow * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const flying = g.mode === 'fly';
  const kx = flying ? CAM_FOLLOW_FLY : CAM_FOLLOW_PLAY;
  const ky = flying ? CAM_FOLLOW_FLY_Y : CAM_FOLLOW_PLAY_Y;
  camera.position.x = approach(camera.position.x, clamp(px, -lim, lim), kx, raw);
  camera.position.y = approach(camera.position.y, py - CAM_Y_OFFSET + surfaceT * CAM_SURFACE_LIFT, ky, raw);
  camera.position.z = approach(camera.position.z, zNow, CAM_ZOOM_RATE, raw);
  /* Parallax reads the camera AFTER the follow but BEFORE the shake, or the
     background jitters independently of the foreground and the illusion that
     they are one space goes with it. */
  fadeParallax(g.pd);
  stepParallax(camera.position.x, camera.position.y);

  if (R.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * R.shake;
    camera.position.y += (Math.random() - 0.5) * R.shake;
    R.shake = Math.max(0, R.shake - raw * SHAKE_DECAY);
  }

  tickToast(raw); tickFound(raw);

  /* The surface is drawn every frame even from underground: the lean and the
     strain lamp are what the player looks for on the way up. */
  updateBallast(raw);
  updateHUD();
  stepGauges(raw);
  if (draw) renderWorld();
}
