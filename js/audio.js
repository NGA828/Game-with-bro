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
