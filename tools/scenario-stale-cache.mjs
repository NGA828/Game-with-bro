// Regression test: a browser can be holding an OLD copy of one module
// while loading a NEW copy of another one. The classic symptom is
//
//   Uncaught SyntaxError: The requested module '../audio.js' does not
//   provide an export named 'audioContext'
//
// which kills the whole page. The music engine must survive that, so
// this builds a deliberately mismatched module graph and imports it.
//
//   node tools/scenario-stale-cache.mjs

import { mkdtemp, mkdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = await mkdtemp(join(tmpdir(), 'bro-stale-'));

try {
  // a module layout that mirrors js/
  await mkdir(join(tmp, 'js/shared'), { recursive: true });

  // the OLD audio.js: it has no audioContext() and no masterGain()
  await writeFile(join(tmp, 'js/audio.js'), `
let ctx = null;
export function initAudio() { /* the old version had no context getter */ }
export function resumeAudio() {}
export function sfxClick() {}
`);

  // the NEW music.js and config.js
  await copyFile(join(ROOT, 'js/shared/music.js'), join(tmp, 'js/shared/music.js'));
  await copyFile(join(ROOT, 'js/shared/config.js'), join(tmp, 'js/shared/config.js'));

  // a tiny browser to satisfy the module
  globalThis.window = globalThis.window || { addEventListener() {} };
  globalThis.document = globalThis.document || { body: { appendChild() {} } };

  let failed = null;
  let mod = null;
  try {
    mod = await import(pathToFileURL(join(tmp, 'js/shared/music.js')).href);
  } catch (err) {
    failed = err;
  }

  if (failed) {
    console.log(`FAIL  the music engine died on a stale audio.js: ${failed.message}`);
    process.exit(1);
  }

  const problems = [];
  if (typeof mod.startMusic !== 'function') problems.push('no startMusic');
  if (typeof mod.stopMusic !== 'function') problems.push('no stopMusic');
  if (typeof mod.trackName !== 'function') problems.push('no trackName');
  if (mod.trackName('hub') !== 'SOUL SOCIETY') problems.push('the track titles are gone');

  // and the functions must not throw when the audio module is the old one
  try {
    mod.startMusic('hub');
    mod.stopMusic();
  } catch (err) {
    problems.push(`startMusic threw: ${err.message}`);
  }

  if (problems.length) {
    console.log(`FAIL  stale audio.js: ${problems.join('; ')}`);
    process.exit(1);
  }

  console.log('PASS  the music engine survives a stale audio.js');
  console.log('PASS  the track titles survive a stale audio.js');
  console.log('\nall stale-cache scenarios passed');
} finally {
  await rm(tmp, { recursive: true, force: true });
}
