import * as THREE from 'three';
import { W, HULL_MAX, DIG_BASE, coreDepth, valueMult, skyHi, skyLo } from './config';
import { clamp, key } from './util';
import { g, S, save } from './state';
import { blockAt } from './world';
import { R } from './runtime';
import type { Dir } from './types';
import {
  FREEZE_ORE, FREEZE_ROCK,
  SHAKE_CRACK, SHAKE_ROCK, SHAKE_ORE, SHAKE_LANDING, SHAKE_DECAY,
  SQUASH_DIG, SQUASH_BREAK, SQUASH_DECAY, SQUASH_SCALE,
  CAM_FOLLOW_PLAY, CAM_FOLLOW_FLY, CAM_ZOOM_RATE, CAM_Y_OFFSET,
  AMBIENT_SURFACE, AMBIENT_FALLOFF, FOG_SURFACE, FOG_GAIN,
  FUEL_PER_MOVE, HULL_REGEN,
  depthT, heatT, easeInOut, approach, digFuelPerSecond, heatDamagePerSecond, soakAfter
} from './feel';
import { scene, camera, renderer, gameEl, amb, sun, rim, lamp, fog } from './scene';
import { lerpHex, worldX, crackGeo, crackMat } from './materials';
import { meshes, syncBlocks, dropBlock, beginDig, pulseHaloes } from './blocks';
import { spray, stepParticles, dust, dustMat, starMat, sunSprite } from './particles';
import { player, rig, bit, flames, FACE_ANGLE } from './ship';
import { padLights, beam } from './pad';
import { ui, atSurface, updateHUD, toast, flash, tickToast } from './ui';
import { sell, goSurface, tow, breakCore } from './actions';
import { sfx, setDepth } from './audio';

export function step(dir: Dir) {
  const v: number[] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  return { x: g.px + v[0], d: Math.round(g.pd) + v[1] };
}

export function startAction() {
  if (!R.held || R.moving || R.digging) return;
  const t = step(R.held);
  g.face = R.held;
  if (t.x < 0 || t.x >= W || t.d < -3 || t.d > coreDepth(g.planet)) return;
  const b = blockAt(t.x, t.d);
  if (b) {
    if (b.hard === Infinity) return;
    if (g.weight + b.wt > S.cargoCap()) { toast('Hold is full at ' + S.cargoCap() + ' kg'); return; }
    /* lift this cell out of the instanced terrain into a real mesh, so the
       dig animation has something to scale, jitter and hang cracks on */
    beginDig(t.x, t.d, b);
    R.digging = { x: t.x, d: t.d, t: 0, total: (b.hard * DIG_BASE) / S.drill(), block: b, stage: 0, spark: 0 };
    sfx.digStart(b.hard);
    R.squash = SQUASH_DIG;
  } else {
    R.moving = { x: t.x, d: t.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
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
    camZBoost += (0 - camZBoost) * Math.min(1, raw * 4);
    startAction();

    if (R.digging) {
      const b = R.digging.block;
      R.digging.t += dt;
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
        spray(worldX(R.digging.x), -R.digging.d, b.color, 2, 1.9, 0.4);
        sfx.chip(b.hard);
      }

      if (R.digging.t >= R.digging.total) {
        g.dug.add(k);
        dropBlock(k);
        spray(worldX(R.digging.x), -R.digging.d, b.color, b.ore ? 52 : 24, b.ore ? 6.5 : 4, 0.85);
        sfx.digStop();
        freeze = b.ore ? FREEZE_ORE : FREEZE_ROCK;
        R.shake = Math.max(R.shake, b.ore ? SHAKE_ORE : SHAKE_ROCK);
        R.squash = SQUASH_BREAK;
        if (b.core) { R.digging = null; breakCore(); }
        else {
          g.cargo[b.id] = (g.cargo[b.id] || 0) + 1;
          g.weight += b.wt;
          if (b.ore) sfx.collect(b.tone);
          if (b.value >= 400) toast(b.name + '  +◈ ' + Math.round(b.value * valueMult(g.planet)).toLocaleString());
          R.moving = { x: R.digging.x, d: R.digging.d, fx: g.px, fd: g.pd, t: 0, total: 1 / S.speed() };
          R.digging = null;
          save();
        }
      }
    } else if (R.moving) {
      R.moving.t += dt;
      g.fuel -= FUEL_PER_MOVE * dt;
      thrustLevel = 0.75;
      const a = clamp(R.moving.t / R.moving.total, 0, 1);
      g.px = R.moving.fx + (R.moving.x - R.moving.fx) * a;
      g.pd = R.moving.fd + (R.moving.d - R.moving.fd) * a;
      bank += ((R.moving.x - R.moving.fx) * 0.45 - bank) * Math.min(1, raw * 8);
      bit.rotation.y += raw * 9;
      if (a >= 1) {
        g.px = R.moving.x; g.pd = R.moving.d; R.moving = null;
        syncBlocks();
        if (atSurface()) { sell(); g.fuel = S.fuelCap(); g.hull = HULL_MAX; }
      }
    } else {
      bank += (0 - bank) * Math.min(1, raw * 6);
    }

    /* soak builds while deep and bleeds off above, so staying is the gamble */
    g.soak = soakAfter(g.soak, g.pd, dt);
    if (g.pd > 70) {
      /* heat ramps in below HEAT_DEPTH and escalates with soak; see feel.ts */
      g.hull -= heatDamagePerSecond(g.pd, S.shield(), g.soak) * dt;
    } else if (atSurface()) {
      g.hull = Math.min(HULL_MAX, g.hull + HULL_REGEN * dt);
      g.fuel = S.fuelCap();
    }

    if (g.fuel <= 0) { g.fuel = 0; tow('Your tank ran dry at ' + Math.round(g.pd) + ' m.'); }
    else if (g.hull <= 0) { g.hull = 1; tow('Your hull buckled in the heat at ' + Math.round(g.pd) + ' m.'); }
  }

  stepParticles(dt);
  setDepth(g.pd);

  /* ship transform */
  const px = worldX(g.px), py = -g.pd;
  player.position.set(px, py, 0.62);
  R.squash *= SQUASH_DECAY;
  const sq = 1 + R.squash * SQUASH_SCALE;
  player.scale.set(1 / sq, sq, 1);
  rig.rotation.y = bank;
  lamp.position.set(px, py, 1.7);
  lamp.distance = S.light();

  if (g.mode !== 'fly') {
    const target = FACE_ANGLE[g.face];
    let diff = target - rig.rotation.z;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    rig.rotation.z += diff * Math.min(1, raw * 14);
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
  rim.intensity = 0.5 - 0.32 * tDeep;
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
    const clear = 42 - tDeep * 20;
    const edge = 0.58 + tDeep * 0.28;
    ui.vignette.style.background =
      'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) ' + clear.toFixed(1) +
      '%, rgba(0,0,0,' + edge.toFixed(2) + ') 100%)';
  }

  const glowT = now / 1000;
  pulseHaloes(glowT);
  for (let i = 0; i < padLights.length; i++) {
    const ph = (glowT * 1.6 - i * 0.22) % 2;
    padLights[i].scale.setScalar(0.55 + 0.5 * Math.max(0, 1 - Math.abs(ph - 0.5) * 3));
  }
  beam.material.opacity = 0.05 + 0.035 * Math.sin(glowT * 1.3);

  /* camera */
  const zNow = R.camZ + camZBoost;
  const halfW = Math.tan((camera.fov * Math.PI) / 360) * zNow * camera.aspect;
  const lim = Math.max(0, W / 2 - halfW);
  const k = g.mode === 'fly' ? CAM_FOLLOW_FLY : CAM_FOLLOW_PLAY;
  camera.position.x = approach(camera.position.x, clamp(px, -lim, lim), k, raw);
  camera.position.y = approach(camera.position.y, py - CAM_Y_OFFSET, k + 1, raw);
  camera.position.z = approach(camera.position.z, zNow, CAM_ZOOM_RATE, raw);
  if (R.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * R.shake;
    camera.position.y += (Math.random() - 0.5) * R.shake;
    R.shake = Math.max(0, R.shake - raw * SHAKE_DECAY);
  }

  tickToast(raw);

  updateHUD();
  renderer.render(scene, camera);
}
