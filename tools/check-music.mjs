// Checks the soundtrack: every track must have a title, and its three
// voices must be exactly the same length or the chiptune falls apart.
//
//   node tools/check-music.mjs

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// music.js talks to the WebAudio API, so give it a tiny fake browser
globalThis.window = globalThis.window || {
  addEventListener() {},
  AudioContext: undefined,
};
globalThis.document = globalThis.document || { body: { appendChild() {} } };

const mod = await import(pathToFileURL(join(ROOT, 'js/shared/music.js')).href);
const TRACKS = mod.TRACKS;

if (!TRACKS) {
  console.error('music.js does not export TRACKS');
  process.exit(1);
}

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE_RE = /^([A-G])(#|b)?(-?\d+)$/;
const DRUMS = new Set(['k', 's', 'h', 'c']);

/** the same bar-splitting the engine does */
function parse(pattern) {
  if (!pattern) return [];
  const steps = [];
  for (const bar of pattern.split('|')) {
    const notes = bar.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < 16; i++) steps.push(notes[i] || '.');
  }
  return steps;
}

let bad = 0;
for (const [id, def] of Object.entries(TRACKS)) {
  const lead = parse(def.lead);
  const bass = parse(def.bass);
  const drums = parse(def.drums);
  const problems = [];

  if (!def.name) problems.push('no title');
  if (!def.bpm || def.bpm < 40 || def.bpm > 220) problems.push(`odd bpm ${def.bpm}`);

  const len = Math.max(lead.length, bass.length, drums.length);
  if (lead.length !== len) problems.push(`lead ${lead.length} steps`);
  if (bass.length !== len) problems.push(`bass ${bass.length} steps`);
  if (drums.length !== len) problems.push(`drums ${drums.length} steps`);
  if (len !== 64) problems.push(`${len} steps (expected 64 = 4 bars of 16)`);

  // every note has to be playable
  const notes = [...lead, ...bass].filter((n) => n !== '.');
  for (const n of notes) {
    if (!NOTE_RE.test(n)) problems.push(`bad note "${n}"`);
  }
  for (const d of drums) {
    if (d !== '.' && !DRUMS.has(d)) problems.push(`bad drum "${d}"`);
  }

  // a track that plays nothing at all is not a track
  if (!notes.length) problems.push('the lead is empty');
  if (!drums.filter((d) => d !== '.').length) problems.push('no drums');

  const label = `${id} (${def.name || '?'})`;
  if (problems.length) {
    bad++;
    console.log(`FAIL  ${label}: ${problems.join('; ')}`);
  } else {
    console.log(`ok    ${label.padEnd(26)} ${def.bpm} bpm · ${len} steps · ${notes.length} notes · ${drums.filter((d) => d !== '.').length} drum hits`);
  }
}

if (bad) {
  console.error(`\n${bad} track(s) have a problem`);
  process.exit(1);
}
console.log('\nall tracks are in sync');
