// Scenario test for the shared control configuration.
//
//   node tools/scenario-config.mjs
//
// Checks that Player One and Player Two can be given their own keys, that
// the games actually use them, and that the settings survive a reload.

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
    get(t, k) { return k in t ? t[k] : () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeEl(id) {
  const el = {
    id, style: {}, dataset: {}, children: [], tag: 'div', text: '',
    classList: {
      _s: new Set(),
      add(...c) { c.forEach((x) => this._s.add(x)); },
      remove(...c) { c.forEach((x) => this._s.delete(x)); },
      contains(c) { return this._s.has(c); },
      toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; if (on) this._s.add(c); else this._s.delete(c); return on; },
    },
    _handlers: {},
    addEventListener(t, fn) { (this._handlers[t] = this._handlers[t] || []).push(fn); },
    removeEventListener() {},
    click() {
      const e = { stopPropagation() {}, preventDefault() {}, target: this };
      for (const fn of this._handlers.click || []) fn(e);
    },
    appendChild(c) { this.children.push(c); c.parent = this; return c; },
    removeChild() {},
    querySelector(sel) { return findIn(this, sel)[0] || null; },
    querySelectorAll(sel) { return findIn(this, sel); },
    getContext: () => makeCtx(), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    textContent: '', innerHTML: '', width: 960, height: 540,
  };
  // a browser drops the children when innerHTML is reset
  let _html = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return _html; },
    set(v) { _html = String(v); if (_html === '') el.children.length = 0; },
  });
  // className and classList have to agree, like in a real browser
  Object.defineProperty(el, 'className', {
    get() { return [...el.classList._s].join(' '); },
    set(v) { el.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
  });
  return el;
}
function findIn(root, sel) {
  const out = [];
  const want = sel.startsWith('.') ? sel.slice(1) : sel.startsWith('#') ? sel.slice(1) : null;
  const walk = (node) => {
    for (const c of node.children || []) {
      if (want === null) out.push(c);
      else if (sel.startsWith('.') && c.classList.contains(want)) out.push(c);
      else if (sel.startsWith('#') && c.id === want) out.push(c);
      walk(c);
    }
  };
  walk(root);
  return out;
}
const els = new Map();
const winHandlers = new Map();
const store = new Map();
const win = {
  addEventListener(t, fn) {
    if (!winHandlers.has(t)) winHandlers.set(t, []);
    winHandlers.get(t).push(fn);
  },
  removeEventListener() {}, devicePixelRatio: 1, location: { href: '' },
};
globalThis.window = win;
globalThis.document = {
  body: makeEl('body'),
  getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement: () => makeEl('new'),
  addEventListener() {}, hidden: false,
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
const queue = [];
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };

function key(code, down) {
  const list = winHandlers.get(down ? 'keydown' : 'keyup') || [];
  for (const fn of list) fn({ code, repeat: false, preventDefault() {}, stopPropagation() {} });
}
let now = 0;
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    now += 1000 / 60;
    const cb = queue.pop();
    if (!cb) throw new Error('the loop died');
    cb(now);
  }
}

const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(label);
};

// ---------------------------------------------------------------- the config
const cfg = await import(pathToFileURL(join(ROOT, 'js', 'shared', 'config.js')).href);

check('every game has a config', ['artillery', 'fighter', 'racer', 'shmup'].every((g) => cfg.GAMES[g]));
check('every game has two players', Object.values(cfg.GAMES).every((g) => g.players.length === 2));

const p1Keys = Object.values(cfg.getKeys('fighter', 0)).flat();
const p2Keys = Object.values(cfg.getKeys('fighter', 1)).flat();
// 'Enter' is shared on purpose - it starts the match for everybody
const p1Own = cfg.getKeys('fighter', 0).light.concat(cfg.getKeys('fighter', 0).heavy);
const p2Own = cfg.getKeys('fighter', 1).light.concat(cfg.getKeys('fighter', 1).heavy);
check('player one has the default keys', p1Keys.includes('KeyA') && p1Keys.includes('KeyF'), p1Keys.join(','));
check('player two has the default keys', p2Keys.includes('ArrowLeft') && p2Keys.includes('KeyJ'), p2Keys.join(','));
check('the two players do not share a key', !p1Own.some((k) => p2Own.includes(k)),
  p1Own.filter((k) => p2Own.includes(k)).join(',') || 'none');

// a conflict is spotted before it is saved
check('a clash is detected', cfg.keyConflict('fighter', 0, 'light', 'KeyA') === 'left',
  String(cfg.keyConflict('fighter', 0, 'light', 'KeyA')));

// ---------------------------------------------------------------- rebinding
cfg.setKey('fighter', 0, 'light', 'KeyZ');
check('the new key is live', cfg.getKeys('fighter', 0).light[0] === 'KeyZ');
check('the change is stored', (store.get('bro-arcade-config-v1') || '').includes('KeyZ'));

// the game has to use it
await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const game = globalThis.window.broFighter;
const ctl = globalThis.window.broControls.p1;
check('the game reads the new key', ctl.bindings.light[0] === 'KeyZ', ctl.bindings.light.join(','));

// drive into a fight and check the rebound key punches
tick(5);
key('KeyF', true); tick(2); key('KeyF', false);   // P1 confirms a hero
key('KeyJ', true); tick(2); key('KeyJ', false);   // P2 confirms a hero
for (let i = 0; i < 200 && game.state === 'select'; i++) tick(1);
tick(120);
check('the fight is on', game.state === 'fight', `state=${game.state}`);
const [a, b] = game.fighters || [];
if (a && b) {
  a.x = 430; a.y = 468; a.facing = 1; a.state = 'idle'; a.attack = null; a.hitstun = 0;
  a.vx = 0; a.vy = 0; a.airborne = false;
  b.x = 500; b.y = 468; b.state = 'idle'; b.hitstun = 0;
  b.vx = 0; b.vy = 0; b.airborne = false;
  const hpBefore = b.hp;
  // the OLD key must do nothing now
  key('KeyF', true); tick(1); key('KeyF', false); tick(6);
  const oldStarted = a.state === 'attack' || a.attack !== null;
  check('the old key is dead', !oldStarted);
  a.state = 'idle'; a.attack = null;
  // the NEW key must punch
  key('KeyZ', true); tick(1); key('KeyZ', false);
  let started = false;
  for (let i = 0; i < 20; i++) {
    if (a.state === 'attack' || a.attack !== null) { started = true; break; }
    tick(1);
  }
  check('the new key punches', started);
  let hit = false;
  for (let i = 0; i < 60; i++) {
    tick(1);
    if (b.hp < hpBefore) { hit = true; break; }
  }
  check('the rebound punch lands', hit, `hp ${hpBefore.toFixed(0)} -> ${b.hp.toFixed(0)}`);
}

// ---------------------------------------------------------------- reset
cfg.resetGame('fighter');
check('reset restores the defaults', cfg.getKeys('fighter', 0).light[0] === 'KeyF',
  cfg.getKeys('fighter', 0).light.join(','));
check('the game sees the reset too', ctl.bindings.light[0] === 'KeyF');

// ---------------------------------------------------------------- music
cfg.setMusicEnabled(false);
check('music can be switched off', cfg.musicEnabled() === false);
cfg.setMusicVolume(0.25);
check('the music volume is remembered', Math.abs(cfg.musicVolume() - 0.25) < 0.001);
cfg.setMusicEnabled(true);

// a fresh module (a page reload) has to read the saved settings back
const saved = store.get('bro-arcade-config-v1');
store.set('bro-arcade-config-v1', saved);
const reloaded = await import(pathToFileURL(join(ROOT, 'js', 'shared', 'config.js')).href + `?v=${Date.now()}`);
check('the settings survive a reload', reloaded.musicVolume() === cfg.musicVolume()
  && reloaded.getKeys('fighter', 0).light[0] === 'KeyF');

// ---------------------------------------------------------------- the panel
const ctrls = await import(pathToFileURL(join(ROOT, 'js', 'shared', 'controls.js')).href);
ctrls.openControls('fighter');
const overlay = globalThis.document.body.children.find((c) => c.classList.contains('cfgoverlay'));
check('the panel opens', !!overlay && !overlay.classList.contains('hidden'));
const panel = overlay && overlay.querySelector('.cfgpanel');
check('the panel is built', !!panel);
const rows = panel ? panel.querySelectorAll('.cfgrow') : [];
check('every action gets a row', rows.length >= 16, `rows=${rows.length}`);
const slots = panel ? panel.querySelectorAll('.keyslot') : [];
check('every action gets a key slot', slots.length >= 16, `slots=${slots.length}`);
check('the music switch is there', !!panel.querySelector('.cfgtoggle'));
check('the music slider is there', !!panel.querySelector('.cfgslider'));
check('the panel shows the current keys', /A/.test(slots[0] ? slots[0].innerHTML : ''),
  slots[0] ? slots[0].innerHTML : '');

// clicking a slot arms it, pressing a key binds it
if (slots[0]) {
  slots[0].click();
  check('a slot arms itself', slots[0].classList.contains('armed'));
  key('KeyZ', true); key('KeyZ', false);
  check('the pressed key is bound', cfg.getKeys('fighter', 0).left[0] === 'KeyZ',
    cfg.getKeys('fighter', 0).left.join(','));
  check('the slot shows the new key', /Z/.test(slots[0].innerHTML), slots[0].innerHTML);
}
ctrls.closeControls();
check('the panel closes', overlay.classList.contains('hidden'));
cfg.resetGame('fighter');

// ---------------------------------------------------------------- the music
// a fake WebAudio so the sequencer can be driven without a sound card
function fakeAudio() {
  const made = { osc: 0, buf: 0, gain: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() { return this; },
    linearRampToValueAtTime() { return this; },
    exponentialRampToValueAtTime() { return this; },
    setTargetAtTime() { return this; },
  });
  const node = (extra = {}) => ({
    connect() { return this; },
    disconnect() {},
    start() {},
    stop() {},
    ...extra,
  });
  const AC = class {
    constructor() {
      this.sampleRate = 22050;
      this.destination = node();
      this.state = 'running';
      this._t0 = Date.now();
    }
    get currentTime() { return (Date.now() - this._t0) / 1000; }
    resume() { this.state = 'running'; }
    createGain() { made.gain++; return node({ gain: param() }); }
    createOscillator() { made.osc++; return node({ type: 'square', frequency: param() }); }
    createBiquadFilter() { return node({ type: 'lowpass', frequency: param(), Q: param() }); }
    createBufferSource() { made.buf++; return node({ buffer: null, loop: false }); }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
  };
  win.AudioContext = AC;
  return made;
}

const made = fakeAudio();
const Sfx = await import(pathToFileURL(join(ROOT, 'js', 'audio.js')).href);
const Music = await import(pathToFileURL(join(ROOT, 'js', 'shared', 'music.js')).href);
Sfx.initAudio();
check('the audio context is up', !!Sfx.audioContext());
Music.startMusic('fighter');
check('the music is playing', Music.isMusicPlaying());
await new Promise((r) => setTimeout(r, 260));
check('the sequencer is making noise', made.osc > 4, `oscillators=${made.osc}`);
Music.setMusicVolume(0.5);
Music.stopMusic();
check('the music can be stopped', !Music.isMusicPlaying());

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all control configuration scenarios passed');
