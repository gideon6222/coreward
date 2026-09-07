/* Coreward audio. Everything is synthesised at runtime, no files are loaded.
   Split out of app.js so the score can be retuned on its own. */

/* Built lazily by audioInit() on the first user gesture, because Chrome blocks
   an AudioContext created any other way. Everything below runs only after that,
   behind `if (!ready())` or `if (!A.ctx) return` guards, so these are typed as
   non-null rather than threading a narrowed context through 34 call sites.

   The trade is explicit: strict null checking does not protect this module. The
   runtime guards do. Do not remove one assuming the other covers it.

   drill and timer are genuinely nullable - they are set and cleared as sounds
   start and stop. */
type Drill = { src: AudioBufferSourceNode; osc: OscillatorNode; gain: GainNode };

const A = {
  ctx: null as unknown as AudioContext,
  master: null as unknown as GainNode,
  musicBus: null as unknown as GainNode,
  musicLP: null as unknown as BiquadFilterNode,
  sfxBus: null as unknown as GainNode,
  noise: null as unknown as AudioBuffer,
  drill: null as Drill | null,
  timer: null as ReturnType<typeof setInterval> | null,
  beat: 0, nextT: 0, depth: 0,
  wind: null as unknown as AudioBufferSourceNode,
  windGain: null as unknown as GainNode,
  droneGain: null as unknown as GainNode,
  leadGain: null as unknown as GainNode,
  delay: null as unknown as DelayNode,
  on: { music: true, sfx: true }
};

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
  if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return; }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  A.ctx = new Ctx();
  const ctx = A.ctx;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 12;
  comp.connect(ctx.destination);

  A.master = ctx.createGain();
  A.master.gain.value = 0.9;
  A.master.connect(comp);

  A.sfxBus = ctx.createGain();
  A.sfxBus.gain.value = A.on.sfx ? 0.5 : 0;
  A.sfxBus.connect(A.master);

  A.musicBus = ctx.createGain();
  A.musicBus.gain.value = A.on.music ? 0.24 : 0;
  A.musicBus.connect(A.master);

  /* one lowpass over the whole score, opened and closed by depth */
  A.musicLP = ctx.createBiquadFilter();
  A.musicLP.type = 'lowpass';
  A.musicLP.frequency.value = 2400;
  A.musicLP.Q.value = 0.4;
  A.musicLP.connect(A.musicBus);

  /* echo, so the theme has space around it instead of sounding like blips */
  A.delay = ctx.createDelay(1.0);
  A.delay.delayTime.value = 0.42;
  const fb = ctx.createGain();
  fb.gain.value = 0.34;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  A.delay.connect(fb); fb.connect(A.delay);
  A.delay.connect(wet); wet.connect(A.musicLP);

  /* noise buffer, brown-ish so it reads as air rather than hiss */
  const len = ctx.sampleRate * 2;
  A.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = A.noise.getChannelData(0);
  let lastV = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    lastV = (lastV + 0.02 * white) / 1.02;
    data[i] = white * 0.5 + lastV * 3;
  }

  /* continuous cavern air */
  A.wind = ctx.createBufferSource();
  A.wind.buffer = A.noise;
  A.wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.frequency.value = 380;
  wf.Q.value = 0.8;
  A.windGain = ctx.createGain();
  A.windGain.gain.value = 0.02;
  A.wind.connect(wf); wf.connect(A.windGain); A.windGain.connect(A.musicLP);
  const wlfo = ctx.createOscillator();
  wlfo.frequency.value = 0.045;
  const wlfoAmt = ctx.createGain();
  wlfoAmt.gain.value = 170;
  wlfo.connect(wlfoAmt); wlfoAmt.connect(wf.frequency);
  wlfo.start();
  A.wind.start();

  /* low drone under everything */
  A.droneGain = ctx.createGain();
  A.droneGain.gain.value = 0.05;
  A.droneGain.connect(A.musicLP);
  for (const f of [55, 82.5]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.detune.value = (Math.random() - 0.5) * 6;
    const g2 = ctx.createGain();
    g2.gain.value = f > 60 ? 0.35 : 0.7;
    o.connect(g2); g2.connect(A.droneGain);
    o.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06 + Math.random() * 0.05;
    const amt = ctx.createGain();
    amt.gain.value = 0.25;
    lfo.connect(amt); amt.connect(g2.gain);
    lfo.start();
  }

  A.leadGain = ctx.createGain();
  A.leadGain.gain.value = 0.9;
  A.leadGain.connect(A.musicLP);
  A.leadGain.connect(A.delay);

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

function pad(chord: number[], t: number) {
  const ctx = A.ctx;
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
      o.connect(gn); gn.connect(A.musicLP);
      o.start(t); o.stop(t + hold + 1.6);
    }
  }
}

function bass(root: number, t: number) {
  const o = A.ctx.createOscillator();
  const gn = A.ctx.createGain();
  o.type = 'sine';
  o.frequency.value = semi(55, root);
  env(gn, t, 0.34, 0.09, 2.3);
  o.connect(gn); gn.connect(A.musicLP);
  o.start(t); o.stop(t + 2.6);
}

function lead(s: number, t: number, beats: number) {
  const dur = beats * BEAT;
  for (const shape of ['sine', 'triangle'] as OscillatorType[]) {
    const o = A.ctx.createOscillator();
    const gn = A.ctx.createGain();
    o.type = shape;
    o.frequency.value = semi(220, s);
    o.detune.value = shape === 'triangle' ? 5 : -5;
    const peak = shape === 'sine' ? 0.075 : 0.03;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(peak, t + 0.3);
    gn.gain.linearRampToValueAtTime(peak * 0.7, t + dur * 0.7);
    gn.gain.linearRampToValueAtTime(0.0001, t + dur + 0.5);
    o.connect(gn); gn.connect(A.leadGain);
    o.start(t); o.stop(t + dur + 0.7);
  }
}

function pulse(t: number) {
  const o = A.ctx.createOscillator();
  const gn = A.ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(72, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.5);
  env(gn, t, 0.3, 0.02, 0.7);
  o.connect(gn); gn.connect(A.musicLP);
  o.start(t); o.stop(t + 0.9);
}

function tick() {
  if (!A.ctx) return;
  const ctx = A.ctx;
  const deep = clamp(A.depth / 150, 0, 1);
  const now = ctx.currentTime;
  A.musicLP.frequency.setTargetAtTime(2400 - deep * 1750, now, 0.6);
  A.windGain.gain.setTargetAtTime(0.02 + deep * 0.1, now, 0.8);
  A.droneGain.gain.setTargetAtTime(0.05 + deep * 0.14, now, 0.8);
  A.leadGain.gain.setTargetAtTime(0.95 - deep * 0.45, now, 0.8);
  if (!A.on.music) { A.nextT = Math.max(A.nextT, now); return; }

  while (A.nextT < now + 0.8) {
    const t = A.nextT;
    const b = A.beat % 32;
    const bar = Math.floor(b / 8);
    const cycle = Math.floor(A.beat / 32);
    if (b % 8 === 0) { pad(CHORDS[bar], t); bass(ROOTS[bar], t); }
    if (b % 8 === 4) bass(ROOTS[bar], t);
    if (deep > 0.45 && b % 8 === 0) pulse(t);
    if (cycle % 2 === 0) {
      for (const n of THEME) if (n[0] === b) lead(n[1], t, n[2]);
    }
    A.beat++;
    A.nextT += BEAT;
  }
}

export function setAudio(kind: 'music' | 'sfx', on: boolean) {
  A.on[kind] = on;
  save();
  if (!A.ctx) return;
  const t = A.ctx.currentTime;
  if (kind === 'music') A.musicBus.gain.linearRampToValueAtTime(on ? 0.24 : 0, t + 0.5);
  else A.sfxBus.gain.linearRampToValueAtTime(on ? 0.5 : 0, t + 0.15);
}

/* ============ effects ============ */
function blip(freq: number, t: number, dur: number, type: OscillatorType | undefined, peak: number) {
  const o = A.ctx.createOscillator();
  const gn = A.ctx.createGain();
  o.type = type || 'triangle';
  o.frequency.setValueAtTime(freq, t);
  env(gn, t, peak, 0.008, dur);
  o.connect(gn); gn.connect(A.sfxBus);
  o.start(t); o.stop(t + dur + 0.05);
}

function noiseBurst(t: number, dur: number, cutoff: number, peak: number, type?: BiquadFilterType) {
  const src = A.ctx.createBufferSource();
  src.buffer = A.noise;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = A.ctx.createBiquadFilter();
  f.type = type || 'bandpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff * 0.35), t + dur);
  f.Q.value = 1.2;
  const gn = A.ctx.createGain();
  env(gn, t, peak, 0.006, dur);
  src.connect(f); f.connect(gn); gn.connect(A.sfxBus);
  src.start(t); src.stop(t + dur + 0.05);
}

const ready = () => A.ctx && A.on.sfx;

export const sfx = {
  chip(hard: number) {
    if (!ready()) return;
    noiseBurst(A.ctx.currentTime, 0.09, 900 - Math.min(600, hard * 40) + Math.random() * 200, 0.35);
  },
  crack(hard: number) {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    noiseBurst(t, 0.16, 500 + Math.random() * 300, 0.5, 'lowpass');
    blip(90 + Math.random() * 30 - hard, t, 0.12, 'square', 0.12);
  },
  /* tone is optional because Block.tone is: rock has none. The body already
     defends with (tone || 1) and (tone || 0), so the signature was the thing
     that was lying. */
  collect(tone?: number) {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    const base = 320 * Math.pow(1.09, tone || 1);
    blip(base, t, 0.16, 'triangle', 0.3);
    blip(base * 1.5, t + 0.05, 0.2, 'triangle', 0.22);
    if ((tone || 0) >= 5) blip(base * 2, t + 0.1, 0.26, 'sine', 0.18);
  },
  sell() {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    [0, 4, 7, 12].forEach((s, i) => blip(semi(392, s), t + i * 0.07, 0.3, 'triangle', 0.24));
  },
  buy() {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    blip(523, t, 0.1, 'square', 0.16);
    blip(784, t + 0.07, 0.18, 'square', 0.14);
  },
  ui() {
    if (!ready()) return;
    noiseBurst(A.ctx.currentTime, 0.05, 2200, 0.16, 'highpass');
  },
  alarm() {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    for (let i = 0; i < 3; i++) blip(180, t + i * 0.18, 0.14, 'sawtooth', 0.2);
  },
  boom() {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    noiseBurst(t, 1.6, 900, 0.9, 'lowpass');
    noiseBurst(t + 0.1, 2.2, 300, 0.6, 'lowpass');
    const o = A.ctx.createOscillator();
    const gn = A.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(24, t + 1.8);
    env(gn, t, 0.7, 0.02, 1.9);
    o.connect(gn); gn.connect(A.sfxBus);
    o.start(t); o.stop(t + 2.2);
  },
  thrust() {
    if (!ready()) return;
    const t = A.ctx.currentTime;
    noiseBurst(t, 0.7, 1400, 0.3, 'lowpass');
    blip(140, t, 0.5, 'sawtooth', 0.1);
  },
  digStart(hard: number) {
    if (!ready() || A.drill) return;
    const ctx = A.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = A.noise; src.loop = true;
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
    gn.connect(A.sfxBus);
    src.start(t); o.start(t);
    A.drill = { src: src, osc: o, gain: gn };
  },
  digStop() {
    if (!A.drill || !A.ctx) return;
    const d = A.drill;
    A.drill = null;
    const t = A.ctx.currentTime;
    d.gain.gain.cancelScheduledValues(t);
    d.gain.gain.setValueAtTime(Math.max(0.0001, d.gain.gain.value), t);
    d.gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    try { d.src.stop(t + 0.12); d.osc.stop(t + 0.12); } catch (e) { /* already stopped */ }
  }
};
