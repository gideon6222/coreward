import * as THREE from 'three';
import { W, HULL_MAX, DIG_BASE, DEF, SUPPLY_OF, DROP_MIN_VALUE, RELIC_COLOR, relicFor,
         coreDepth, valueMult, skyHi, skyLo,
         GAS_HULL_DAMAGE, GAS_SOAK, traitOf, TREMOR_DEPTH } from './config';
import { clamp, key } from './util';
import { g, S, save } from './state';
import { blockAt } from './world';
import { R } from './runtime';
import type { Dir } from './types';
import {
  FREEZE_ORE, FREEZE_ROCK,
  SHAKE_CRACK, SHAKE_ROCK, SHAKE_ORE, SHAKE_LANDING, SHAKE_DECAY,
  SQUASH_DIG, SQUASH_BREAK, SQUASH_DECAY, SQUASH_SCALE,
  CAM_FOLLOW_PLAY, CAM_FOLLOW_PLAY_Y, CAM_FOLLOW_FLY, CAM_FOLLOW_FLY_Y,
  CAM_ZOOM_RATE, CAM_Y_OFFSET, CAM_BOOST_DECAY, BANK_INTO_MOVE, BANK_SETTLE,
  FACE_TURN_RATE,
  AMBIENT_SURFACE, AMBIENT_FALLOFF, FOG_SURFACE, FOG_GAIN, RIM_SURFACE, RIM_FALLOFF,
  VIGNETTE_CLEAR_SURFACE, VIGNETTE_CLEAR_DEEP, VIGNETTE_EDGE_SURFACE, VIGNETTE_EDGE_DEEP,
  FUEL_PER_MOVE, HULL_REGEN, HEAT_DEPTH, FLY_ACCEL, FLY_DRAG, SHIP_R, DIG_ALIGN,
  depthT, heatT, easeInOut, approach, zoomForScan, digFuelPerSecond, heatDamagePerSecond, soakAfter,
  tremorTick, TREMOR_EVERY, TREMOR_JITTER, chargeAfter
} from './feel';
import { scene, camera, renderer, gameEl, amb, sun, rim, lamp, fog } from './scene';
import { lerpHex, worldX, crackGeo, crackMat } from './materials';
import { meshes, syncBlocks, dropBlock, beginDig, pulseHaloes } from './blocks';
import { spray, stepParticles, dust, dustMat, starMat, sunSprite } from './particles';
import { leaveDrop, stepDrops } from './drops';
import { stepBeam } from './beam';
import { moveAndCollide, thrust } from './fly';
import { player, rig, bit, flames, headlight, drillTint, FACE_ANGLE } from './ship';
import { padLights, beam } from './pad';
import { crossedMark, fadeMark } from './mark';
import { aimRelic } from './relic';
import { stepParallax, fadeParallax } from './parallax';
import { ui, atSurface, updateHUD, toast, flash, tickToast } from './ui';
import { sell, goSurface, tow, breakCore, tremor, collectHere, grantCache, showEvent,
         stopDigging } from './actions';
import { sfx, setDepth, setMood } from './audio';

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
  if (cy > coreDepth(g.planet)) return true;
  return blockAt(cx, cy) !== null;
}

/* Begin drilling a cell the ship has flown into. */
function startDig(tx: number, td: number) {
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
    R.digging = { x: t.x, d: t.d, t: done * total, total, block: b,
                  stage: Math.floor(done * 5), spark: 0 };
    sfx.digStart(b.hard);
    R.squash = SQUASH_DIG;
  }
}

let camZBoost = 0, freeze = 0, thrustLevel = 0, bank = 0;
let last = performance.now(), skyTick = 0;

export function frame(now: number) {
  requestAnimationFrame(frame);
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;
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
      const ang = Math.atan2(dx, dy);
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
    if (Math.random() < 0.9) spray(p.x, p.y + 0.4, 0x7ad4ff, 2, 2.4, 0.35);
    if (raw01 >= 1) {
      R.flight = null;
      camZBoost = 0;
      goSurface();
      g.mode = 'play';
      sell();
      R.shake = SHAKE_LANDING;
      flash('rgba(110,220,255,.22)', 240);
    }
  } else if (g.mode === 'play') {
    camZBoost = approach(camZBoost, 0, CAM_BOOST_DECAY, raw);
    /* Let go and the drill stops. It used to run to completion no matter what,
       which meant the only way to change your mind about a block was to have
       not started it. */
    /* Let go, or turn away, and the drill stops - the block keeps its damage.
       Compared against the direction rather than the cell, because the ship is
       no longer guaranteed to be exactly one cell away from what it is
       cutting. */
    if (R.digging && (!R.held || FACE_VEC[R.held][0] !== Math.sign(R.digging.x - Math.round(g.px)) ||
                      FACE_VEC[R.held][1] !== Math.sign(R.digging.d - Math.round(g.pd)))) {
      stopDigging();
    }

    if (R.digging) {
      const b = R.digging.block;
      R.digging.t += dt;
      /* Held against the rock and pulled onto the block's centre line. Without
         the alignment a tunnel dug while drifting wanders off the grid and the
         drill visibly misses the cell it is cutting. */
      R.vx = 0; R.vy = 0;
      if (R.digging.x !== Math.round(g.px)) g.px = approach(g.px, R.digging.x, DIG_ALIGN, raw);
      else if (R.digging.d !== Math.round(g.pd)) g.pd = approach(g.pd, R.digging.d, DIG_ALIGN, raw);
      g.fuel -= digFuelPerSecond(b.hard) * dt;
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
        g.dug.add(k);
        delete g.damage[k];
        dropBlock(k);
        spray(worldX(R.digging.x), -R.digging.d, b.color, b.ore ? 52 : 24, b.ore ? 6.5 : 4, 0.85);
        sfx.digStop();
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
        if (b.core) { R.digging = null; breakCore(); }
        else if (b.hazard) {
          /* A gas pocket pays nothing and costs you. It breaks faster than the
             rock around it, so you usually hit one by accident - which is the
             point: it is the surprise that makes a descent differ from the last
             one, and it gives dwelling deep a second thing to fear besides
             heat. The soak spike is what actually bites, because it multiplies
             every bit of heat damage for the rest of the trip. */
          const dmg = Math.round(GAS_HULL_DAMAGE * (traitOf(g.planet).gasDamage || 1) * S.gasTake());
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
          if (b.value >= 400) toast(b.name + '  +◈ ' + Math.round(b.value * valueMult(g.planet)).toLocaleString());
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

      const hit = moveAndCollide(g.px, g.pd, R.vx, R.vy, raw, SHIP_R, solidAt);
      g.px = hit.x; g.pd = hit.y;
      R.vx = hit.vx; R.vy = hit.vy;

      if (R.held) {
        g.face = R.held;
        g.fuel -= FUEL_PER_MOVE * S.fuelUse() * dt;
        thrustLevel = 0.75;
        /* Only the axis being pushed on can start a dig. Scraping along a
           ceiling while flying sideways must not begin drilling the ceiling. */
        const blocker = v[0] !== 0 ? hit.hitX : hit.hitY;
        if (blocker) startDig(blocker.x, blocker.y);
      }

      bank = approach(bank, clamp(R.vx / Math.max(1, top), -1, 1) * 0.45, BANK_INTO_MOVE, raw);
      bit.rotation.y += raw * (3 + Math.abs(R.vx) + Math.abs(R.vy));
      syncBlocks();
      collectHere();

      /* Selling used to happen on arriving in the pad's cell. There are no
         cell arrivals any more, so it is an edge trigger on being at the
         surface at all - which also means it fires once however slowly the
         ship drifts up onto the pad. */
      const now = atSurface();
      if (now && !R.wasAtSurface) { sell(); g.fuel = S.fuelCap(); g.hull = HULL_MAX; }
      R.wasAtSurface = now;
    }

    /* Power cells trickle back underground and fill at the pad; see
       chargeAfter in feel.ts for why it is both. */
    g.charge = chargeAfter(g.charge, dt, atSurface(), S.powerCap());

    /* soak builds while deep and bleeds off above, so staying is the gamble */
    g.soak = soakAfter(g.soak, g.pd, dt, traitOf(g.planet).soak || 1);
    if (g.pd > HEAT_DEPTH) {
      /* heat ramps in below HEAT_DEPTH and escalates with soak; see feel.ts */
      g.hull -= heatDamagePerSecond(g.pd, S.shield(), g.soak) * S.heatTake() * dt;
      R.hullCause = 'heat';
      /* Say it once, at the metre it starts. The HUD carries it from here. */
      if (!R.wasHot) {
        R.wasHot = true;
        toast('Overheating - the hull is draining');
        flash('rgba(255,120,30,.20)', 420);
      }
    } else if (atSurface()) {
      g.hull = Math.min(HULL_MAX, g.hull + HULL_REGEN * dt);
      g.fuel = S.fuelCap();
    }

    /* Two metres of hysteresis, so hovering on the line cannot spam the
       warning every time the camera lerp nudges you across it. */
    if (R.wasHot && g.pd < HEAT_DEPTH - 2) R.wasHot = false;

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
    const tk = tremorTick({ t: R.tremorT, warn: R.tremorWarn }, dt,
      g.pd > TREMOR_DEPTH && !R.flight,
      () => TREMOR_EVERY + Math.random() * TREMOR_JITTER);
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

    if (g.fuel <= 0) { g.fuel = 0; tow('Your tank ran dry at ' + Math.round(g.pd) + ' m.'); }
    else if (g.hull <= 0) {
      g.hull = 1;
      tow(R.hullCause === 'gas'
        ? 'A gas pocket finished your hull at ' + Math.round(g.pd) + ' m.'
        : 'Your hull buckled in the heat at ' + Math.round(g.pd) + ' m.');
    }
  }

  stepParticles(dt);
  stepBeam(raw);
  setDepth(g.pd);
  /* Hand the score what the depth actually MEANS. Danger is whichever of a
     failing hull or a full heat soak is worse, so the alarm layer answers to
     both without either drowning the other. */
  setMood(
    heatT(g.pd),
    g.pd > TREMOR_DEPTH && g.mode === 'play' ? 1 : 0,
    Math.max(clamp((45 - g.hull) / 45, 0, 1), clamp((g.soak - 0.6) / 0.4, 0, 1))
  );

  /* ship transform */
  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, 0.62);
  R.squash *= SQUASH_DECAY;
  const sq = 1 + R.squash * SQUASH_SCALE;
  player.scale.set(1 / sq, sq, 1);
  rig.rotation.y = bank;
  lamp.position.set(px, py, 1.7);
  lamp.distance = S.light();

  /* The headlight. Invisible in daylight and mixed in with depth, because a
     beam that is visible against a bright sky reads as a bug; scaled along its
     length by the Scanner Array, so the upgrade has a silhouette. The 0.82 rig
     scale is divided out so the beam reaches the distance the light actually
     does rather than the distance the model implies. */
  const dark = depthT(g.pd);
  const beamMat = headlight.material as THREE.MeshBasicMaterial;
  beamMat.opacity = 0.22 * dark;
  headlight.visible = beamMat.opacity > 0.004;
  /* Scanner runs 8 m at level 0 to 29.6 m at level 9. Mapped to a beam between
     one and two lengths rather than proportionally, because a cone eight cells
     long stops reading as a beam and starts reading as a wall. */
  const reach = 1 + ((S.light() - 8) / 21.6) * 0.95;
  headlight.scale.set(0.9 + reach * 0.1, reach, 1);

  if (g.mode !== 'fly') {
    const target = FACE_ANGLE[g.face];
    let diff = target - rig.rotation.z;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    /* approach() on the wrapped delta rather than on the angle itself, so the
       ship still turns the short way round. */
    rig.rotation.z += diff * (1 - Math.exp(-FACE_TURN_RATE * raw));
  }

  const fscale = 0.25 + thrustLevel * 1.15;
  for (const f of flames) {
    f.cone.scale.set(0.8 + thrustLevel * 0.5, fscale, 0.8 + thrustLevel * 0.5);
    f.cone.material.opacity = 0.25 + thrustLevel * 0.7;
    f.glow.scale.setScalar(0.35 + thrustLevel * 1.0);
  }

  /* world ambience */
  const tDeep = depthT(g.pd);
  amb.intensity = AMBIENT_SURFACE - AMBIENT_FALLOFF * tDeep;
  sun.intensity = 1.5 * (1 - tDeep);
  rim.intensity = RIM_SURFACE - RIM_FALLOFF * tDeep;
  fog.density = FOG_SURFACE + tDeep * FOG_GAIN;
  /* Below the heat line the whole world turns ember: sky, fog and the drifting
     dust all warm together. Three coordinated signals so the boundary reads at
     a glance instead of having to be noticed in the HUD. */
  const hot = heatT(g.pd);
  const hi = lerpHex(skyHi(g.planet), 0x02030a, tDeep).lerp(new THREE.Color(0x2e0b05), hot * 0.8);
  const lo = lerpHex(skyLo(g.planet), 0x0a0c14, tDeep).lerp(new THREE.Color(0x6b1c08), hot * 0.85);
  fog.color.copy(lo);
  /* ambient warms too, so the rock itself is lit hot rather than just fogged */
  amb.color.setHex(0xffffff).lerp(new THREE.Color(0xff8a52), hot * 0.6);
  dustMat.color.setHex(0xc8b89a).lerp(new THREE.Color(0xff6a28), hot);
  starMat.opacity = clamp(1 - tDeep * 2.4, 0, 0.9);
  sunSprite.material.opacity = clamp(0.5 - tDeep, 0, 0.5);
  dustMat.opacity = clamp(tDeep * 0.7, 0, 0.62);
  dust.position.set(px, py, 0);
  dust.rotation.z += raw * 0.04;

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

  const glowT = now / 1000;
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
  const zNow = R.camZ * zoomForScan(g.up.scan) + camZBoost;
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * zNow * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const flying = g.mode === 'fly';
  const kx = flying ? CAM_FOLLOW_FLY : CAM_FOLLOW_PLAY;
  const ky = flying ? CAM_FOLLOW_FLY_Y : CAM_FOLLOW_PLAY_Y;
  camera.position.x = approach(camera.position.x, clamp(px, -lim, lim), kx, raw);
  camera.position.y = approach(camera.position.y, py - CAM_Y_OFFSET, ky, raw);
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

  tickToast(raw);

  updateHUD();
  renderer.render(scene, camera);
}
