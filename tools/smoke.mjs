// Headless smoke test for the browser games.
// Stubs just enough DOM/canvas to run the real game loops in Node and catch
// runtime errors (undefined functions, bad math, NaNs, etc).
//
//   node tools/smoke.mjs

import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// ---------------------------------------------------------------- dom stub

function makeCtx() {
  const target = {
    canvas: { width: 960, height: 540 },
    measureText: (t) => ({ width: String(t).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    getImageData: () => ({ data: [0, 0, 0, 0] }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeEl(id) {
  const el = {
    id,
    style: {},
    dataset: {},
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, force) {
        const on = force === undefined ? !this._s.has(c) : !!force;
        if (on) this._s.add(c); else this._s.delete(c);
        return on;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    appendChild() {},
    removeChild() {},
    querySelector: () => makeEl('q'),
    querySelectorAll: () => [],
    getContext: () => makeCtx(),
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    focus() {},
    blur() {},
    textContent: '',
    innerHTML: '',
    width: 960,
    height: 540,
  };
  return el;
}

const els = new Map();
const winHandlers = new Map();
const docHandlers = new Map();

const win = {
  addEventListener(type, fn) {
    if (!winHandlers.has(type)) winHandlers.set(type, []);
    winHandlers.get(type).push(fn);
  },
  removeEventListener() {},
  devicePixelRatio: 1,
  location: { href: '' },
  AudioContext: undefined,
  webkitAudioContext: undefined,
};

const doc = {
  body: makeEl('body'),
  getElementById: (id) => {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  createElement: () => makeEl('new'),
  addEventListener(type, fn) {
    if (!docHandlers.has(type)) docHandlers.set(type, []);
    docHandlers.get(type).push(fn);
  },
  removeEventListener() {},
  hidden: false,
};

function dispatchKey(code, type = 'keydown') {
  const e = { code, key: code, repeat: false, preventDefault() {}, stopPropagation() {} };
  for (const fn of winHandlers.get(type) || []) fn(e);
}

globalThis.window = win;
globalThis.document = doc;
Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [] },
  configurable: true,
  writable: true,
});
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
globalThis.cancelAnimationFrame = () => {};
globalThis.HTMLCanvasElement = class {};

const queue = [];

// ---------------------------------------------------------------- runner

async function runGame(file, seconds, keys = []) {
  // fresh module registry per game
  const url = pathToFileURL(join(ROOT, file)).href;
  const mod = await import(url);

  let t = 0;
  const step = 1000 / 60;
  const frames = Math.round(seconds * 60);
  const errors = [];

  for (let i = 0; i < frames; i++) {
    t += step;
    // inject the scripted keys
    if (i % 7 === 0 && keys.length) dispatchKey(keys[(i / 7 | 0) % keys.length]);
    const cb = queue.pop();
    if (!cb) break;
    try {
      cb(t);
    } catch (err) {
      errors.push(`${file}: ${err.stack || err}`);
      break;
    }
  }
  void mod;
  return errors;
}

// ---------------------------------------------------------------- main

const games = await readdir(join(ROOT, 'js', 'games'));
const allErrors = [];

for (const g of games) {
  if (!g.endsWith('.js')) continue;
  const file = `js/games/${g}`;
  process.stdout.write(`smoke: ${file} ... `);
  const errs = await runGame(file, 6, ['KeyF', 'KeyJ', 'KeyW', 'KeyA', 'KeyD', 'KeyS', 'KeyG', 'KeyH', 'KeyL', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'KeyK']);
  if (errs.length) {
    console.log('FAIL');
    allErrors.push(...errs);
  } else {
    console.log('ok');
  }
}

// the hub too
process.stdout.write('smoke: js/hub.js ... ');
{
  const url = pathToFileURL(join(ROOT, 'js', 'hub.js')).href;
  await import(url);
  console.log('ok');
}

if (allErrors.length) {
  console.log('\n--- ERRORS ---');
  for (const e of allErrors) console.log(e, '\n');
  process.exit(1);
}
console.log('\nall games ran clean');
