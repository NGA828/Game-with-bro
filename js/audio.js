// Tiny synthesised sound effects — no audio files needed.

let ctx = null;
let master = null;
let muted = false;
let noiseBuf = null;

export function initAudio() {
  if (ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.32;
  master.connect(ctx.destination);
  // pre-render one second of white noise, reused by all the noisy effects
  const len = Math.floor(ctx.sampleRate);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
}

export function resumeAudio() {
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

/** The shared AudioContext (created on the first user gesture). */
export function audioContext() {
  return ctx;
}

/** The master gain node every sound is routed through. */
export function masterGain() {
  return master;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.32;
  return muted;
}

const now = () => (ctx ? ctx.currentTime : 0);

function noise(dur, { freq = 900, q = 1, type = 'lowpass', gain = 0.5, sweep = 0, delay = 0 } = {}) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = type;
  filt.frequency.setValueAtTime(freq, t);
  if (sweep) filt.frequency.exponentialRampToValueAtTime(Math.max(40, sweep), t + dur);
  filt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, to = null, attack = 0.005 } = {}) {
  if (!ctx || muted) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function sfxFire() {
  noise(0.22, { freq: 1400, sweep: 180, gain: 0.5, type: 'lowpass' });
  tone(220, 0.25, { type: 'square', gain: 0.16, to: 60 });
}

export function sfxExplosion(size = 1) {
  const s = Math.max(0.5, Math.min(size, 2));
  noise(0.55 * s, { freq: 1000 * s, sweep: 60, gain: 0.62, type: 'lowpass' });
  tone(90, 0.5 * s, { type: 'sine', gain: 0.4, to: 32 });
  noise(0.16, { freq: 4200, gain: 0.2, type: 'highpass' });
}

export function sfxQuack() {
  tone(520, 0.13, { type: 'sawtooth', gain: 0.22, to: 320 });
  tone(300, 0.16, { type: 'square', gain: 0.12, to: 520, delay: 0.1 });
}

export function sfxHurt() {
  tone(400, 0.2, { type: 'triangle', gain: 0.26, to: 110 });
  noise(0.1, { freq: 600, sweep: 200, gain: 0.2 });
}

export function sfxDeath() {
  tone(300, 0.7, { type: 'sawtooth', gain: 0.26, to: 50 });
  noise(0.7, { freq: 1200, sweep: 80, gain: 0.3 });
}

export function sfxClick() {
  tone(760, 0.06, { type: 'square', gain: 0.14 });
}

export function sfxTick() {
  tone(1200, 0.04, { type: 'square', gain: 0.09 });
}

export function sfxSplash() {
  noise(0.4, { freq: 700, sweep: 120, gain: 0.34, type: 'bandpass', q: 0.8 });
  tone(180, 0.3, { type: 'sine', gain: 0.16, to: 60 });
}

export function sfxWin() {
  const notes = [523, 659, 784, 1047];
  notes.forEach((f, i) => tone(f, 0.28, { type: 'square', gain: 0.2, delay: i * 0.11 }));
}

export function sfxLose() {
  const notes = [392, 330, 262, 196];
  notes.forEach((f, i) => tone(f, 0.34, { type: 'triangle', gain: 0.22, delay: i * 0.14 }));
}

export function sfxGoo() {
  tone(70, 1.2, { type: 'sawtooth', gain: 0.22, to: 130 });
  noise(1.2, { freq: 300, sweep: 900, gain: 0.16, type: 'bandpass', q: 0.6 });
}

// ---------------------------------------------------------------- hub games

export function sfxSelect() {
  tone(880, 0.05, { type: 'square', gain: 0.11 });
}

export function sfxConfirm() {
  tone(523, 0.08, { type: 'square', gain: 0.16 });
  tone(784, 0.12, { type: 'square', gain: 0.14, delay: 0.07 });
}

export function sfxBell() {
  tone(1046, 0.5, { type: 'sine', gain: 0.26, to: 1040 });
  tone(1568, 0.35, { type: 'sine', gain: 0.12, delay: 0.02 });
  noise(0.12, { freq: 5200, gain: 0.1, type: 'highpass' });
}

export function sfxPunch() {
  noise(0.1, { freq: 1500, sweep: 420, gain: 0.34, type: 'lowpass' });
  tone(180, 0.09, { type: 'triangle', gain: 0.2, to: 90 });
}

export function sfxHeavy() {
  noise(0.16, { freq: 1100, sweep: 260, gain: 0.42, type: 'lowpass' });
  tone(140, 0.16, { type: 'square', gain: 0.22, to: 60 });
}

export function sfxHit(scale = 1) {
  const s = Math.max(0.5, Math.min(scale, 2));
  noise(0.12 * s, { freq: 2600, sweep: 700, gain: 0.3, type: 'bandpass', q: 1.4 });
  tone(320, 0.12 * s, { type: 'square', gain: 0.16, to: 120 });
}

export function sfxBlock() {
  noise(0.1, { freq: 3400, gain: 0.22, type: 'bandpass', q: 2.2 });
  tone(900, 0.07, { type: 'square', gain: 0.1, to: 1500 });
}

export function sfxWhiff() {
  noise(0.16, { freq: 700, sweep: 2200, gain: 0.16, type: 'bandpass', q: 0.8 });
}

export function sfxSpecial() {
  tone(240, 0.3, { type: 'sawtooth', gain: 0.18, to: 900 });
  noise(0.3, { freq: 500, sweep: 2600, gain: 0.18, type: 'bandpass', q: 1.2 });
}

export function sfxSuper() {
  tone(160, 0.7, { type: 'sawtooth', gain: 0.24, to: 900 });
  tone(320, 0.6, { type: 'square', gain: 0.12, to: 1400, delay: 0.05 });
  noise(0.7, { freq: 400, sweep: 4200, gain: 0.2, type: 'bandpass', q: 0.9 });
}

export function sfxCharge(element = 'blast') {
  const base = element === 'ice' ? 1200 : element === 'fire' ? 420 : 700;
  tone(base, 0.3, { type: 'sawtooth', gain: 0.16, to: base * 2.2 });
  noise(0.3, { freq: base, sweep: base * 3, gain: 0.14, type: 'bandpass', q: 1.6 });
}

export function sfxHeal() {
  const notes = [523, 659, 784, 1046];
  notes.forEach((f, i) => tone(f, 0.22, { type: 'triangle', gain: 0.14, delay: i * 0.07 }));
}

export function sfxArmor() {
  tone(140, 0.4, { type: 'square', gain: 0.16, to: 260 });
  noise(0.4, { freq: 900, gain: 0.14, type: 'lowpass' });
}

export function sfxArmorHit() {
  noise(0.16, { freq: 2200, sweep: 400, gain: 0.34, type: 'bandpass', q: 1.1 });
  tone(110, 0.2, { type: 'sawtooth', gain: 0.2, to: 60 });
}

export function sfxGrow() {
  tone(180, 0.5, { type: 'sawtooth', gain: 0.2, to: 620 });
  noise(0.5, { freq: 300, sweep: 1600, gain: 0.16, type: 'lowpass' });
}

export function sfxSonic() {
  tone(1200, 0.35, { type: 'square', gain: 0.14, to: 300 });
  tone(600, 0.4, { type: 'sawtooth', gain: 0.12, to: 180, delay: 0.04 });
  noise(0.4, { freq: 2400, sweep: 500, gain: 0.14, type: 'bandpass', q: 0.7 });
}

export function sfxWhip() {
  noise(0.18, { freq: 1800, sweep: 600, gain: 0.2, type: 'bandpass', q: 3 });
  tone(600, 0.1, { type: 'triangle', gain: 0.1, to: 220 });
}

export function sfxMeteor() {
  tone(300, 0.6, { type: 'sawtooth', gain: 0.2, to: 90 });
  noise(0.6, { freq: 1600, sweep: 300, gain: 0.2, type: 'lowpass' });
}

export function sfxKO() {
  tone(420, 0.9, { type: 'sawtooth', gain: 0.26, to: 70 });
  noise(0.8, { freq: 1200, sweep: 120, gain: 0.26, type: 'lowpass' });
  tone(104, 1.2, { type: 'sine', gain: 0.2, delay: 0.1, to: 50 });
}

// ---------------------------------------------------------------- racer

let engine = null;

export function sfxEngineStart() {
  if (!ctx || muted) return;
  if (engine) return;
  const o = ctx.createOscillator();
  const o2 = ctx.createOscillator();
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  o.type = 'sawtooth';
  o2.type = 'square';
  o.frequency.value = 60;
  o2.frequency.value = 30;
  g.gain.value = 0;
  f.type = 'lowpass';
  f.frequency.value = 700;
  o.connect(f);
  o2.connect(f);
  f.connect(g).connect(master);
  o.start();
  o2.start();
  engine = { o, o2, g, f };
}

export function sfxEngineSet(rpm, load = 0) {
  if (!engine || !ctx) return;
  const t = ctx.currentTime;
  const f = 45 + rpm * 150;
  engine.o.frequency.setTargetAtTime(f, t, 0.08);
  engine.o2.frequency.setTargetAtTime(f * 0.5, t, 0.08);
  engine.g.gain.setTargetAtTime(muted ? 0 : 0.035 + load * 0.05, t, 0.1);
  engine.f.frequency.setTargetAtTime(500 + rpm * 1800, t, 0.12);
}

export function sfxEngineStop() {
  if (!engine) return;
  try { engine.o.stop(); engine.o2.stop(); } catch { /* already stopped */ }
  engine = null;
}

export function sfxSkid() {
  noise(0.22, { freq: 1500, sweep: 800, gain: 0.14, type: 'bandpass', q: 2.4 });
}

export function sfxBoost() {
  tone(200, 0.4, { type: 'sawtooth', gain: 0.2, to: 1200 });
  noise(0.4, { freq: 700, sweep: 3400, gain: 0.16, type: 'bandpass', q: 1.1 });
}

export function sfxCountdown(final = false) {
  if (final) {
    tone(880, 0.5, { type: 'square', gain: 0.24 });
    tone(1320, 0.4, { type: 'square', gain: 0.16, delay: 0.06 });
  } else {
    tone(440, 0.2, { type: 'square', gain: 0.18 });
  }
}

export function sfxLap() {
  tone(660, 0.12, { type: 'square', gain: 0.16 });
  tone(990, 0.16, { type: 'square', gain: 0.14, delay: 0.1 });
}

export function sfxCrash() {
  noise(0.3, { freq: 1200, sweep: 200, gain: 0.34, type: 'lowpass' });
  tone(120, 0.25, { type: 'square', gain: 0.18, to: 50 });
}

// ---------------------------------------------------------------- shmup

export function sfxShoot() {
  tone(900, 0.07, { type: 'square', gain: 0.12, to: 300 });
}

export function sfxEnemyShoot() {
  tone(400, 0.1, { type: 'sawtooth', gain: 0.1, to: 180 });
}

export function sfxPowerup() {
  const notes = [660, 880, 1100, 1320];
  notes.forEach((f, i) => tone(f, 0.14, { type: 'square', gain: 0.13, delay: i * 0.05 }));
}

export function sfxExtraLife() {
  const notes = [523, 784, 1046];
  notes.forEach((f, i) => tone(f, 0.2, { type: 'triangle', gain: 0.16, delay: i * 0.08 }));
}

export function sfxGameOver() {
  const notes = [440, 392, 330, 262, 196];
  notes.forEach((f, i) => tone(f, 0.4, { type: 'triangle', gain: 0.2, delay: i * 0.18 }));
}
