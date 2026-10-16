// Deep scenario test: drive HERO CLASH through select -> fight -> KO and
// check that the combat math actually moves the numbers.
//
//   node tools/scenario-fighter.mjs

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
  };
  return new Proxy(target, {
    get(t, k) { return k in t ? t[k] : () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeEl(id) {
  return {
    id, style: {}, dataset: {},
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
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {},
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    getContext: () => makeCtx(), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    focus() {}, blur() {}, textContent: '', innerHTML: '', width: 960, height: 540,
  };
}

const els = new Map();
const winHandlers = new Map();
const win = {
  addEventListener(type, fn) {
    if (!winHandlers.has(type)) winHandlers.set(type, []);
    winHandlers.get(type).push(fn);
  },
  removeEventListener() {},
  devicePixelRatio: 1,
  location: { href: '' },
};

globalThis.window = win;
globalThis.document = {
  body: makeEl('body'),
  getElementById: (id) => {
    if (!els.has(id)) els.set(id, makeEl(id));
    return els.get(id);
  },
  createElement: () => makeEl('new'),
  addEventListener() {}, removeEventListener() {}, hidden: false,
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const queue = [];
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
globalThis.cancelAnimationFrame = () => {};

const keyState = new Set();
function key(code, down) {
  if (down) {
    if (keyState.has(code)) return;
    keyState.add(code);
    for (const fn of winHandlers.get('keydown') || []) fn({ code, repeat: false, preventDefault() {} });
  } else {
    keyState.delete(code);
    for (const fn of winHandlers.get('keyup') || []) fn({ code, preventDefault() {} });
  }
}

// ---------------------------------------------------------------- run

await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const game = win.broFighter;

let now = 0;
const STEP = 1000 / 60;
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    now += STEP;
    const cb = queue.pop();
    if (!cb) throw new Error('game loop stopped scheduling frames');
    cb(now);
  }
}

const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(label);
};

// 1. select screen is up
tick(10);
check('starts on the select screen', game.state === 'select', `state=${game.state}`);

// 2. P1 confirms, P2 confirms -> fight starts
key('KeyF', true); tick(2); key('KeyF', false);
key('KeyJ', true); tick(2); key('KeyJ', false);
for (let i = 0; i < 200 && game.state === 'select'; i++) tick(1);
check('select -> fight', game.state === 'intro' || game.state === 'fight', `state=${game.state}`);
tick(90);
check('reaches the fight', game.state === 'fight', `state=${game.state}`);

const [a, b] = game.fighters;
check('two fighters exist', !!a && !!b);
check('fighters start on the ground', a.y > 400 && b.y > 400, `a.y=${a.y.toFixed(1)}`);

// 3. walk towards each other until they are in range
for (let i = 0; i < 240; i++) {
  key('KeyD', true); key('ArrowLeft', true);
  tick(1);
  if (Math.abs(a.x - b.x) < 70) break;
}
key('KeyD', false); key('ArrowLeft', false);
check('fighters can close the distance', Math.abs(a.x - b.x) < 120, `gap=${Math.abs(a.x - b.x).toFixed(1)}`);

// 4. land a light punch -> damage must happen
const hpBefore = b.hp;
for (let i = 0; i < 40; i++) {
  key('KeyF', true); tick(1); key('KeyF', false);
  tick(12);
  if (b.hp < hpBefore) break;
}
check('a light punch deals damage', b.hp < hpBefore, `b.hp ${hpBefore} -> ${b.hp.toFixed(0)}`);
check('the attacker builds meter', a.meter > 0, `meter=${a.meter.toFixed(1)}`);

// 5. special moves fire for every hero
// (heal/grow specials are not supposed to damage the other guy)
const NON_DAMAGING = new Set(['heal', 'grow']);
let specialOk = true;
const specialReport = [];
const { ROSTER } = await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
for (const def of ROSTER) {
  a.def = def;
  game.state = 'fight';
  game.timer = 60;
  a.x = 400; a.y = 468; a.facing = 1; a.hp = 1000; a.meter = 100;
  a.state = 'idle'; a.attack = null; a.vx = 0; a.vy = 0;
  a.growT = 0; a.growMul = 1; a.hitstun = 0; a.airborne = false;
  a.status = { burn: 0, freeze: 0, slow: 0, bind: 0, dot: 0, armor: 0, stun: 0, dotTick: 0 };
  b.x = 520; b.y = 468; b.hp = 1000; b.state = 'idle'; b.hitstun = 0;
  b.airborne = false; b.vx = 0; b.vy = 0; b.def = ROSTER[1];
  b.status = { burn: 0, freeze: 0, slow: 0, bind: 0, dot: 0, armor: 0, stun: 0, dotTick: 0 };
  const before = b.hp;
  key('KeyH', true); tick(1); key('KeyH', false);
  // the attack is buffered, so it may start a few frames later (hitstop)
  let started = false;
  for (let i = 0; i < 20; i++) {
    if (a.state === 'attack' || a.attack !== null) { started = true; break; }
    tick(1);
  }
  let hit = false;
  for (let i = 0; i < 140; i++) {
    tick(1);
    if (b.hp < before) { hit = true; break; }
    if (game.state !== 'fight') { game.state = 'fight'; a.hp = 1000; b.hp = 1000; }
  }
  const expectDamage = !NON_DAMAGING.has(def.special.kind);
  const ok = started && (expectDamage ? hit : true);
  if (!ok) specialOk = false;
  specialReport.push(`${def.name}:${started ? '' : 'no-start '}${expectDamage && !hit ? 'no-dmg' : ''}`);
}
check('every hero special fires', specialOk, specialReport.join(' '));

// 6. no NaN anywhere
const bad = [a, b].some((f) => !Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.hp));
check('no NaN in fighter state', !bad);

// 7. the round can end
game.state = 'fight';
a.x = 430; b.x = 480; b.hp = 1;
a.meter = 0; a.state = 'idle'; a.attack = null; a.hitstun = 0;
a.status = { burn: 0, freeze: 0, slow: 0, bind: 0, dot: 0, armor: 0, stun: 0, dotTick: 0 };
for (let i = 0; i < 300 && game.state === 'fight'; i++) {
  key('KeyF', true); tick(1); key('KeyF', false);
  tick(10);
}
check('a round can reach KO', game.state === 'ko' || game.state === 'over', `state=${game.state}`);
check('the win counter moved', game.wins[0] + game.wins[1] > 0, `wins=${game.wins.join('-')}`);

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all fighter scenarios passed');
