/* Coreward audio. Everything is synthesised at runtime, no files are loaded.
   Split out of app.js so the score can be retuned on its own. */

/* The audio graph. Chrome blocks an AudioContext created outside a user
   gesture, so none of this exists until audioInit() runs on the first touch.

   It is built in one go and never partially: either every node exists or none
   do. Modelling that as a single nullable object means one check narrows all
   eleven nodes at once, so the guards the code already had are the same guards
   the type system reads. */
interface Graph {
  ctx: AudioContext;
  master: GainNode;
  musicBus: GainNode;
  musicLP: BiquadFilterNode;
  sfxBus: GainNode;
  noise: AudioBuffer;
  wind: AudioBufferSourceNode;
  windGain: GainNode;
  droneGain: GainNode;
  leadGain: GainNode;
  delay: DelayNode;
}

type Drill = { src: AudioBufferSourceNode; osc: OscillatorNode; gain: GainNode };

let graph: Graph | null = null;

/* Genuinely mutable state, separate from the graph because it changes while
   the game runs rather than being built once. */
const A = {
  drill: null as Drill | null,
  timer: null as ReturnType<typeof setInterval> | null,
  beat: 0, nextT: 0, depth: 0,
  on: { music: true, sfx: true }
};

/* The graph, but only when sound is actually wanted. Returning it rather than a
   boolean is what lets every caller below narrow. */
const live = (): Graph | null => (graph && A.on.sfx ? graph : null);

const AUD_KEY = 'coreward.audio';
try {
  const saved: { music?: boolean; sfx?: boolean } | null =
    JSON.parse(localStorage.getItem(AUD_KEY) || 'null');
  if (saved) { A.on.music = saved.music !== false; A.on.sfx = saved.sfx !== false; }
} catch (e) { /* defaults */ }

export const audioState = A.on;
export function setDepth(d: number) { A.depth = d; }

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const semi = (base: number, s: number) => base * Math.pow(2, s / 12);

function save() {
  try { localStorage.setItem(AUD_KEY, JSON.stringify(A.on)); } catch (e) { /* ignore */ }
}

function env(node: GainNode, t: number, peak: number, attack: number, decay: number) {
  node.gain.setValueAtTime(0.0001, t);
  node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

export function audioInit() {
  if (graph) { if (graph.ctx.state === 'suspended') graph.ctx.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 12;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = A.on.sfx ? 0.5 : 0;
  sfxBus.connect(master);

  const musicBus = ctx.createGain();
  musicBus.gain.value = A.on.music ? 0.24 : 0;
  musicBus.connect(master);

  /* one lowpass over the whole score, opened and closed by depth */
  const musicLP = ctx.createBiquadFilter();
  musicLP.type = 'lowpass';
  musicLP.frequency.value = 2400;
  musicLP.Q.value = 0.4;
  musicLP.connect(musicBus);

  /* echo, so the theme has space around it instead of sounding like blips */
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  delay.connect(fb); fb.connect(delay);
  delay.connect(wet); wet.connect(musicLP);

  /* noise buffer, brown-ish so it reads as air rather than hiss */
  const len = ctx.sampleRate * 2;
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noise.getChannelData(0);
  let lastV = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lastV = (lastV + 0.02 * white) / 1.02;
    data[i] = white * 0.5 + lastV * 3;
  }

  /* continuous cavern air */
  const wind = ctx.createBufferSource();
  wind.buffer = noise;
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 380;
  wf.Q.value = 0.8;
  const windGain = ctx.createGain();
  windGain.gain.value = 0.02;
  wind.connect(wf); wf.connect(windGain); windGain.connect(musicLP);
  const wlfo = ctx.createOscillator();
  wlfo.frequency.value = 0.045;
  const wlfoAmt = ctx.createGain();
  wlfoAmt.gain.value = 170;
  wlfo.connect(wlfoAmt); wlfoAmt.connect(wf.frequency);
  wlfo.start();
  wind.start();

  /* low drone under everything */
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.05;
  droneGain.connect(musicLP);
  for (const f of [55, 82.5]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 6;
    const g2 = ctx.createGain();
    g2.gain.value = f > 60 ? 0.35 : 0.7;
    o.connect(g2); g2.connect(droneGain);
    o.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06 + Math.random() * 0.05;
    const amt = ctx.createGain();
    amt.gain.value = 0.25;
    lfo.connect(amt); amt.connect(g2.gain);
    lfo.start();
  }

  const leadGain = ctx.createGain();
  leadGain.gain.value = 0.9;
  leadGain.connect(musicLP);
  leadGain.connect(delay);

  /* Publish only once every node exists, so `graph` is never observed
     half-built. */
  graph = { ctx, master, musicBus, musicLP, sfxBus, noise, wind, windGain, droneGain, leadGain, delay };

  A.nextT = ctx.currentTime + 0.2;
  A.timer = setInterval(tick, 160);
}

/* ============ the score ============
   A minor. Four bars of eight beats. i - VI - III - VII.
   The theme is written out, not random, and only plays every other cycle. */
const BEAT = 0.78;
const CHORDS = [[0, 3, 7], [-4, 0, 5], [3, 7, 10], [-2, 2, 5]];
const ROOTS = [0, -4, 3, -2];
const THEME = [
  [0, 12, 3], [4, 15, 2], [6, 12, 2],
  [8, 17, 3], [12, 15, 2], [14, 12, 2],
  [16, 19, 3], [20, 17, 2], [22, 15, 3],
  [26, 12, 2], [28, 7, 4]
];

function pad(G: Graph, chord: number[], t: number) {
  const ctx = G.ctx;
  const hold = BEAT * 8;
  for (let i = 0; i < chord.length; i++) {
    for (const oct of [1, 2]) {
      const o = ctx.createOscillator();
      const gn = ctx.createGain();
      o.type = oct === 1 ? 'sine' : 'triangle';
      o.frequency.value = semi(110 * oct, chord[i]);
      o.detune.value = (Math.random() - 0.5) * 11;
      const peak = (oct === 1 ? 0.1 : 0.055) / (1 + i * 0.35);
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.linearRampToValueAtTime(peak, t + 2.4);
      gn.gain.setValueAtTime(peak, t + hold - 2.2);
      gn.gain.linearRampToValueAtTime(0.0001, t + hold + 1.4);
      o.connect(gn); gn.connect(G.musicLP);
      o.start(t); o.stop(t + hold + 1.6);
    }
  }
}

function bass(G: Graph, root: number, t: number) {
  const o = G.ctx.createOscillator();
  const gn = G.ctx.createGain();
  o.type = 'sine';
  o.frequency.value = semi(55, root);
  env(gn, t, 0.34, 0.09, 2.3);
  o.connect(gn); gn.connect(G.musicLP);
  o.start(t); o.stop(t + 2.6);
}

function lead(G: Graph, s: number, t: number, beats: number) {
  const dur = beats * BEAT;
  for (const shape of ['sine', 'triangle'] as OscillatorType[]) {
    const o = G.ctx.createOscillator();
    const gn = G.ctx.createGain();
    o.type = shape;
    o.frequency.value = semi(220, s);
    o.detune.value = shape === 'triangle' ? 5 : -5;
    const peak = shape === 'sine' ? 0.075 : 0.03;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(peak, t + 0.3);
    gn.gain.linearRampToValueAtTime(peak * 0.7, t + dur * 0.7);
    gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    o.connect(gn); gn.connect(G.leadGain);
    o.start(t); o.stop(t + dur + 0.7);
  }
}

function pulse(G: Graph, t: number) {
  const o = G.ctx.createOscillator();
  const gn = G.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(72, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
  env(gn, t, 0.3, 0.02, 0.7);
  o.connect(gn); gn.connect(G.musicLP);
  o.start(t); o.stop(t + 0.9);
}

function tick() {
  const G = graph;
  if (!G) return;
  const ctx = G.ctx;
  const deep = clamp(A.depth / 150, 0, 1);
  const now = ctx.currentTime;
  G.musicLP.frequency.setTargetAtTime(2400 - deep * 1750, now, 0.6);
  G.windGain.gain.setTargetAtTime(0.02 + deep * 0.1, now, 0.8);
  G.droneGain.gain.setTargetAtTime(0.05 + deep * 0.14, now, 0.8);
  G.leadGain.gain.setTargetAtTime(0.95 - deep * 0.45, now, 0.8);
  if (!A.on.music) { A.nextT = Math.max(A.nextT, now); return; }

  while (A.nextT < now + 0.8) {
    const t = A.nextT;
    const b = A.beat % 32;
    const bar = Math.floor(b / 8);
    const cycle = Math.floor(A.beat / 32);
    if (b % 8 === 0) { pad(G, CHORDS[bar], t); bass(G, ROOTS[bar], t); }
    if (b % 8 === 4) bass(G, ROOTS[bar], t);
    if (deep > 0.45 && b % 8 === 0) pulse(G, t);
    if (cycle % 2 === 0) {
      for (const n of THEME) if (n[0] === b) lead(G, n[1], t, n[2]);
    }
    A.beat++;
    A.nextT += BEAT;
  }
}

export function setAudio(kind: 'music' | 'sfx', on: boolean) {
  A.on[kind] = on;
  save();
  const G = graph;
  if (!G) return;
  const t = G.ctx.currentTime;
  if (kind === 'music') G.musicBus.gain.linearRampToValueAtTime(on ? 0.24 : 0, t + 0.5);
  else G.sfxBus.gain.linearRampToValueAtTime(on ? 0.5 : 0, t + 0.15);
}

/* ============ effects ============ */
function blip(G: Graph, freq: number, t: number, dur: number, type: OscillatorType | undefined, peak: number) {
  const o = G.ctx.createOscillator();
  const gn = G.ctx.createGain();
  o.type = type || 'triangle';
  o.frequency.setValueAtTime(freq, t);
  env(gn, t, peak, 0.008, dur);
  o.connect(gn); gn.connect(G.sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBurst(G: Graph, t: number, dur: number, cutoff: number, peak: number, type?: BiquadFilterType) {
  const src = G.ctx.createBufferSource();
  src.buffer = G.noise;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = G.ctx.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), t + dur);
  f.Q.value = 1.2;
  const gn = G.ctx.createGain();
  env(gn, t, peak, 0.006, dur);
  src.connect(f); f.connect(gn); gn.connect(G.sfxBus);
  src.start(t); src.stop(t + dur + 0.05);
}

export const sfx = {
  chip(hard: number) {
    const G = live();
    if (!G) return;
    noiseBurst(G, G.ctx.currentTime, 0.09, 900 - Math.min(600, hard * 40) + Math.random() * 200, 0.35);
  },
  crack(hard: number) {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    noiseBurst(G, t, 0.16, 500 + Math.random() * 300, 0.5, 'lowpass');
    blip(G, 90 + Math.random() * 30 - hard, t, 0.12, 'square', 0.12);
  },
  /* tone is optional because Block.tone is: rock has none. The body already
     defends with (tone || 1) and (tone || 0), so the signature was the thing
     that was lying. */
  collect(tone?: number) {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    const base = 320 * Math.pow(1.09, tone || 1);
    blip(G, base, t, 0.16, 'triangle', 0.3);
    blip(G, base * 1.5, t + 0.05, 0.2, 'triangle', 0.22);
    if ((tone || 0) >= 5) blip(G, base * 2, t + 0.1, 0.26, 'sine', 0.18);
  },
  sell() {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => blip(G, semi(392, s), t + i * 0.07, 0.3, 'triangle', 0.24));
  },
  buy() {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    blip(G, 523, t, 0.1, 'square', 0.16);
    blip(G, 784, t + 0.07, 0.18, 'square', 0.14);
  },
  ui() {
    const G = live();
    if (!G) return;
    noiseBurst(G, G.ctx.currentTime, 0.05, 2200, 0.16, 'highpass');
  },
  alarm() {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    for (let i = 0; i < 3; i++) blip(G, 180, t + i * 0.18, 0.14, 'sawtooth', 0.2);
  },
  boom() {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    noiseBurst(G, t, 1.6, 900, 0.9, 'lowpass');
    noiseBurst(G, t + 0.1, 2.2, 300, 0.6, 'lowpass');
    const o = G.ctx.createOscillator();
    const gn = G.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1.8);
    env(gn, t, 0.7, 0.02, 1.9);
    o.connect(gn); gn.connect(G.sfxBus);
    o.start(t); o.stop(t + 2.2);
  },
  thrust() {
    const G = live();
    if (!G) return;
    const t = G.ctx.currentTime;
    noiseBurst(G, t, 0.7, 1400, 0.3, 'lowpass');
    blip(G, 140, t, 0.5, 'sawtooth', 0.1);
  },
  digStart(hard: number) {
    const G = live();
    if (!G || A.drill) return;
    const ctx = G.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = G.noise; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700 - Math.min(450, hard * 32);
    f.Q.value = 4;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 48 + hard * 3;
    const og = ctx.createGain();
    og.gain.value = 0.05;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(0.22, t + 0.06);
    src.connect(f); f.connect(gn);
    o.connect(og); og.connect(gn);
    gn.connect(G.sfxBus);
    src.start(t); o.start(t);
    A.drill = { src: src, osc: o, gain: gn };
  },
  digStop() {
    const G = graph;
    if (!A.drill || !G) return;
    const d = A.drill;
    A.drill = null;
    const t = G.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(Math.max(0.0001, d.gain.gain.value), t);
    d.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    try { d.src.stop(t + 0.12); d.osc.stop(t + 0.12); } catch (e) { /* already stopped */ }
  }
};
