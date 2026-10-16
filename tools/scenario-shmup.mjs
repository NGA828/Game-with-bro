// Deep scenario test for DUCK INVADERS.
//
//   node tools/scenario-shmup.mjs

import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

function makeCtx() {
  const target = {
    canvas: { width: 960, height: 540 },
    measureText: (t) => ({ width: String(t).length * 6 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(target, { get(t, k) { return k in t ? t[k] : () => {}; }, set(t, k, v) { t[k] = v; return true; } });
}
function makeEl(id) {
  return {
    id, style: {}, dataset: {},
    classList: { _s: new Set(), add() {}, remove() {}, contains() { return false; }, toggle() { return true; } },
    addEventListener() {}, appendChild() {}, removeChild() {}, querySelector: () => makeEl('q'), querySelectorAll: () => [],
    getContext: () => makeCtx(), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    textContent: '', innerHTML: '', width: 960, height: 540,
  };
}
const els = new Map();
const winHandlers = new Map();
const win = {
  addEventListener(t, fn) { if (!winHandlers.has(t)) winHandlers.set(t, []); winHandlers.get(t).push(fn); },
  removeEventListener() {}, devicePixelRatio: 1, location: { href: '' },
};
globalThis.window = win;
globalThis.document = {
  body: makeEl('body'),
  getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
  createElement: () => makeEl('new'), addEventListener() {}, hidden: false,
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const queue = [];
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };

function key(code, down) {
  for (const fn of winHandlers.get(down ? 'keydown' : 'keyup') || []) {
    fn({ code, repeat: false, preventDefault() {} });
  }
}

await import(pathToFileURL(join(ROOT, 'js', 'games', 'shmup.js')).href);
const game = win.broShmup;

let now = 0;
const STEP = 1000 / 60;
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    now += STEP;
    const cb = queue.pop();
    if (!cb) throw new Error('loop died');
    cb(now);
  }
}

const fails = [];
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`);
  if (!cond) fails.push(label);
};

tick(5);
check('starts on the title screen', game.state === 'title', `state=${game.state}`);

key('Enter', true); tick(1); key('Enter', false);
tick(5);
check('enter starts the game', game.state === 'wave' || game.state === 'fight', `state=${game.state}`);
check('two ships for co-op', game.ships.length === 2, `ships=${game.ships.length}`);

// let the first wave arrive
for (let i = 0; i < 200 && game.state === 'wave'; i++) tick(1);
check('ducks arrive', game.ducks.length > 0, `ducks=${game.ducks.length}`);

// shooting spawns bullets
const ship = game.ships[0];
key('KeyF', true);
for (let i = 0; i < 20; i++) tick(1);
check('shooting works', game.bullets.length > 0, `bullets=${game.bullets.length}`);
key('KeyF', false);

// move
const x0 = ship.x;
key('KeyD', true);
for (let i = 0; i < 30; i++) tick(1);
key('KeyD', false);
check('the ship moves', ship.x > x0, `x ${x0.toFixed(0)} -> ${ship.x.toFixed(0)}`);

// killing ducks scores points
const d = game.ducks[0];
const score0 = game.score[0];
game.bullets.push({ x: d.x, y: d.y, vy: -700, dmg: 9, friendly: true });
tick(2);
check('ducks die and score', game.score[0] > score0, `score ${score0} -> ${game.score[0]}`);

// enemy fire hurts
const s2 = game.ships[0];
s2.invuln = 0;
s2.lives = 3;
game.ebullets.push({ x: s2.x, y: s2.y, vx: 0, vy: 200, r: 5 });
tick(2);
check('getting hit costs a life', s2.lives === 2, `lives=${s2.lives}`);

// the boss appears on wave 5
game.wave = 4;
game.ducks.length = 0;
game.state = 'fight';
game.nextWave();
check('the boss shows up on wave 5', !!game.boss, `wave=${game.wave}`);

// no NaN
const bad = [...game.ships, ...game.ducks].some((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y));
check('no NaN in entity state', !bad);

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all shmup scenarios passed');
