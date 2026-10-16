// Background music - a tiny chiptune sequencer, no audio files.
//
//   import { startMusic, stopMusic } from './shared/music.js';
//   startMusic('fighter');
//
// Everything is synthesised with the same AudioContext the sound effects
// use, so the M key and the 🔊 button mute the music too.

import { initAudio, resumeAudio, audioContext, masterGain } from '../audio.js';
import { musicVolume } from './config.js';

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])(#|b)?(-?\d+)$/;

/** "A4" -> 440 Hz, or 0 when the note is not playable. */
function freq(note) {
  const m = NOTE_RE.exec(note);
  if (!m) return 0;
  let s = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = 12 * (parseInt(m[3], 10) + 1) + s;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ---------------------------------------------------------------- tracks
// A pattern is a space separated list of steps: a note name, "." for a rest,
// or a drum letter (k = kick, s = snare, h = hat, c = crash).

export const TRACKS = {
  // SOUL SOCIETY - the calm of the afterlife. The hub theme.
  hub: {
    name: 'SOUL SOCIETY',
    bpm: 84,
    lead: 'D5 . F5 . A5 . F5 . D5 . . . . . . . | ' +
          'C5 . E5 . G5 . E5 . C5 . . . . . . . | ' +
          'Bb4 . D5 . F5 . D5 . Bb4 . . . . . . . | ' +
          'A4 . . . D5 . F5 . A5 . . . . . . .',
    bass: 'D2 . . . . . . . A2 . . . . . . . | ' +
          'C2 . . . . . . . G2 . . . . . . . | ' +
          'Bb1 . . . . . . . F2 . . . . . . . | ' +
          'A1 . . . . . . . D2 . . . . . . .',
    drums: 'k . . . h . . . s . . . h . . . | ' +
          'k . . . h . . . s . . . h . . . | ' +
          'k . . . h . . . s . . . h . . . | ' +
          'k . . . h . h . s . . . h h k .',
  },
  // STEALTH FORCE - the Onmitsukido sneaking up on you.
  artillery: {
    name: 'STEALTH FORCE',
    bpm: 112,
    lead: 'A4 . . . C5 . . . B4 . . . A4 . . . | ' +
          'G4 . . . A4 . . . G#4 . . . A4 . . . | ' +
          'E4 . . . G4 . . . F#4 . . . E4 . . . | ' +
          'A4 . . . E5 . . . D5 . . . C5 . . .',
    bass: 'A1 . A1 . A1 . E2 . E2 . E2 . E2 . E2 . | ' +
          'G1 . G1 . G1 . D2 . D2 . D2 . D2 . D2 . | ' +
          'E1 . E1 . E1 . B1 . B1 . B1 . B1 . B1 . | ' +
          'A1 . A1 . A1 . A1 . E2 . E2 . E2 . E2 .',
    drums: 'k . h . s . h . k . h . s . h h | ' +
          'k . h . s . h . k . h . s . h h | ' +
          'k . h . s . h . k . h . s . h h | ' +
          'k . h . s . h . k k s . s . h h',
  },
  // BANDAI - everything on at once. The duel theme.
  fighter: {
    name: 'BANDAI',
    bpm: 158,
    lead: 'E5 . E5 . G5 . E5 . B4 . E5 . F#5 . E5 . | ' +
          'D5 . D5 . F#5 . D5 . A4 . D5 . E5 . D5 . | ' +
          'C5 . C5 . E5 . C5 . G4 . C5 . D5 . C5 . | ' +
          'B5 . . . A5 . . . G5 . . . F#5 . . .',
    bass: 'E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 E2 | ' +
          'D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 D2 | ' +
          'C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 C2 | ' +
          'B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1 B1',
    drums: 'k . h . s . h . k h s . h . h h | ' +
          'k . h . s . h . k h s . h . h h | ' +
          'k . h . s . h . k h s . h . h h | ' +
          'k k s . s . h . k k s . s s h h',
  },
  // HOLLOW HUNT - chasing something down a street at night.
  racer: {
    name: 'HOLLOW HUNT',
    bpm: 146,
    lead: 'G5 . D5 . G5 . Bb5 . D5 . . . G5 . . . | ' +
          'F5 . C5 . F5 . A5 . C5 . . . F5 . . . | ' +
          'Eb5 . Bb4 . Eb5 . G5 . Bb4 . . . Eb5 . . . | ' +
          'D5 . A5 . D5 . F5 . A5 . . . D6 . . .',
    bass: 'G1 G1 G1 G1 G1 G1 G1 G1 D2 D2 D2 D2 D2 D2 D2 D2 | ' +
          'F1 F1 F1 F1 F1 F1 F1 F1 C2 C2 C2 C2 C2 C2 C2 C2 | ' +
          'Eb1 Eb1 Eb1 Eb1 Eb1 Eb1 Eb1 Eb1 Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 Bb1 | ' +
          'D2 D2 D2 D2 D2 D2 D2 D2 A2 A2 A2 A2 A2 A2 A2 A2',
    drums: 'k . . . h . s . . k . . h . s h | ' +
          'k . . . h . s . . k . . h . s h | ' +
          'k . . . h . s . . k . . h . s h | ' +
          'k . . . h . s . k k k . s . s h',
  },
  // ZANPAKUTO - sword out, ready to go. The shooter theme.
  shmup: {
    name: 'ZANPAKUTO',
    bpm: 132,
    lead: 'C5 . E5 . G5 . C6 . G5 . E5 . C5 . . . | ' +
          'D5 . F#5 . A5 . D6 . A5 . F#5 . D5 . . . | ' +
          'E5 . G5 . B5 . E6 . B5 . G5 . E5 . . . | ' +
          'F5 . A5 . C6 . G5 . . . . . . . . .',
    bass: 'C2 . . . C2 . . . G2 . . . C2 . . . | ' +
          'D2 . . . D2 . . . A2 . . . D2 . . . | ' +
          'E2 . . . E2 . . . B2 . . . E2 . . . | ' +
          'F2 . . . C2 . . . C2 . . . C2 . . .',
    drums: 'k . h . s . h . k . h . s . h h | ' +
          'k . h . s . h . k . h . s . h h | ' +
          'k . h . s . h . k . h . s . h h | ' +
          'k k h . s . h . k k s . s . h h',
  },
};


// ---------------------------------------------------------------- engine

let bus = null;            // music gain node
let timer = null;
let step = 0;
let nextTime = 0;
let current = null;        // { def, lead, bass, drums }
let pendingTrack = null;
let started = false;
let lastTrackId = null;

function musicGain() {
  const ctx = audioContext();
  if (!ctx) return null;
  if (!bus) {
    bus = ctx.createGain();
    bus.gain.value = 0.25;
    bus.connect(masterGain());
  }
  return bus;
}

// Every bar is exactly 16 sixteenth-notes. Short bars are padded with rests,
// long ones are trimmed, so the three voices always stay in sync.
function parse(pattern) {
  if (!pattern) return [];
  const steps = [];
  for (const bar of pattern.split('|')) {
    const notes = bar.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < 16; i++) steps.push(notes[i] || '.');
  }
  return steps;
}

function loadTrack(id) {
  const def = TRACKS[id];
  if (!def) return null;
  const lead = parse(def.lead);
  const bass = parse(def.bass);
  const drums = parse(def.drums);
  const steps = Math.max(lead.length, bass.length, drums.length);
  return { def, lead, bass, drums, steps };
}

function playTone(note, time, dur, { type = 'square', gain = 0.16, glide = 0 } = {}) {
  const ctx = audioContext();
  const out = musicGain();
  if (!ctx || !out) return;
  const f = freq(note);
  if (!f) return;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f, time);
  if (glide) o.frequency.exponentialRampToValueAtTime(f * glide, time + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, time);
  g.gain.linearRampToValueAtTime(gain, time + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
  o.connect(g).connect(out);
  o.start(time);
  o.stop(time + dur + 0.02);
}

function playDrum(kind, time) {
  const ctx = audioContext();
  const out = musicGain();
  if (!ctx || !out) return;
  if (kind === 'k') {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.11);
    g.gain.setValueAtTime(0.34, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    o.connect(g).connect(out);
    o.start(time);
    o.stop(time + 0.18);
    return;
  }
  // snare / hat are noise bursts
  const len = Math.floor(ctx.sampleRate * 0.2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  if (kind === 's') {
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.9;
    g.gain.setValueAtTime(0.2, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.13);
  } else {
    f.type = 'highpass';
    f.frequency.value = 6800;
    g.gain.setValueAtTime(0.09, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  }
  src.connect(f).connect(g).connect(out);
  src.start(time);
  src.stop(time + 0.2);
}

function playStep(i, time) {
  const tr = current;
  if (!tr) return;
  const stepDur = 60 / tr.def.bpm / 4;

  const lead = tr.lead[i % tr.lead.length];
  if (lead && lead !== '.') playTone(lead, time, stepDur * 1.7, { type: 'square', gain: 0.1 });

  const bass = tr.bass[i % tr.bass.length];
  if (bass && bass !== '.') playTone(bass, time, stepDur * 1.9, { type: 'triangle', gain: 0.2 });

  const drum = tr.drums[i % tr.drums.length];
  if (drum && drum !== '.') playDrum(drum, time);
}

function schedule() {
  const ctx = audioContext();
  if (!ctx || !current) return;
  const stepDur = 60 / current.def.bpm / 4;
  const ahead = ctx.currentTime + 0.2;
  if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
  while (nextTime < ahead) {
    playStep(step, nextTime);
    nextTime += stepDur;
    step = (step + 1) % current.steps;
  }
}

let gestureHooked = false;

/** Browsers only allow audio after a gesture - wait for one. */
function hookGesture() {
  if (gestureHooked) return;
  gestureHooked = true;
  const go = () => {
    initAudio();
    resumeAudio();
    if (pendingTrack) {
      const id = pendingTrack;
      pendingTrack = null;
      beginTrack(id);
    }
  };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
}

function beginTrack(trackId) {
  if (!audioContext()) return;      // no audio available on this device
  lastTrackId = trackId;
  resumeAudio();
  if (current && current.id === trackId) return;
  stopMusic();
  const tr = loadTrack(trackId);
  if (!tr) return;
  tr.id = trackId;
  current = tr;
  step = 0;
  nextTime = audioContext().currentTime + 0.08;
  if (!timer) timer = setInterval(schedule, 40);
  started = true;
  applyVolume();
}

/** Start (or switch to) a music track. Safe to call before the first click. */
export function startMusic(trackId) {
  pendingTrack = trackId;
  if (!audioContext()) {
    hookGesture();
    return;
  }
  pendingTrack = null;
  beginTrack(trackId);
}

export function stopMusic() {
  pendingTrack = null;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  current = null;
  started = false;
  pendingTrack = null;
}

export function isMusicPlaying() {
  return !!current;
}

/** The track that is (or was) playing - used when the music is switched on. */
export function lastTrack() {
  return lastTrackId || pendingTrack;
}

/** The title of a track, e.g. "SOUL SOCIETY". */
export function trackName(id) {
  const t = TRACKS[id];
  return t ? t.name : String(id || '').toUpperCase();
}

/** Called when the settings panel changes the music volume. */
export function refreshMusicVolume() {
  applyVolume();
}

/** 0..1 */
export function setMusicVolume(v) {
  const ctx = audioContext();
  if (!ctx) return;
  const g = musicGain();
  if (g) g.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.42, ctx.currentTime, 0.05);
}

function applyVolume() {
  const ctx = audioContext();
  if (!ctx) return;
  const g = musicGain();
  if (!g) return;
  g.gain.setTargetAtTime(musicVolume() * 0.42, ctx.currentTime, 0.05);
}
