// Deep scenario test for PIZZA RUSH.
//
//   node tools/scenario-pizza.mjs

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
function press(code) {
  key(code, true);
  tick(1);
  key(code, false);
}

const mod = await import(pathToFileURL(join(ROOT, 'js', 'games', 'pizza.js')).href);
const game = win.broPizza;
const TOPPING_IDS = mod.TOPPING_IDS;

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
check('enter opens the shop', game.state === 'play', `state=${game.state}`);
check('two stations', game.stations.length === 2, `stations=${game.stations.length}`);

// a customer turns up
const st = game.stations[0];
for (let i = 0; i < 200 && !st.order; i++) tick(1);
check('a customer arrives', !!st.order, `order=${st.order ? [...st.order.toppings].join('+') : 'none'}`);

// picking a topping
const sel0 = st.sel;
press('KeyD');
check('the bins can be cycled', st.sel !== sel0, `sel ${sel0} -> ${st.sel}`);
press('KeyA');
check('and cycled back', st.sel === sel0, `sel=${st.sel}`);

// adding and removing a topping
press('KeyW');
check('a topping goes on the dough', st.dough.size === 1, `dough=${st.dough.size}`);
press('KeyW');
check('and comes off again', st.dough.size === 0, `dough=${st.dough.size}`);

// an empty dough cannot be baked
press('KeyS');
check('an empty dough is not baked', !st.pizza, `pizza=${st.pizza ? 'yes' : 'no'}`);

// build the ordered pizza the way a player does it: pick the bin, press add
const wanted = [...st.order.toppings];
for (const id of wanted) {
  const idx = TOPPING_IDS.indexOf(id);
  let guard = 0;
  while (st.sel !== idx && guard++ < TOPPING_IDS.length) press('KeyD');
  press('KeyW');
}
check('the dough holds exactly the ordered toppings',
  st.dough.size === wanted.length && wanted.every((id) => st.dough.has(id)),
  `dough=[${[...st.dough].join('+')}] wanted=[${wanted.join('+')}]`);

// bake the right pizza
press('KeyS');
check('the pizza goes in the oven', !!st.pizza, `pizza=${st.pizza ? 'baking' : 'none'}`);
check('the dough is empty again', st.dough.size === 0);

for (let i = 0; i < 200 && st.pizza && !st.pizza.ready; i++) tick(1);
check('the pizza comes out ready', !!(st.pizza && st.pizza.ready));

const tips0 = st.tips;
const served0 = st.served;
press('KeyS');
check('a correct pizza is served', st.tips > tips0, `tips ${tips0} -> ${st.tips}`);
check('the order is cleared', !st.order);
check('the served count goes up', st.served === served0 + 1);
check('the combo builds', st.combo === 1, `combo=${st.combo}`);

// the wrong pizza
for (let i = 0; i < 200 && !st.order; i++) tick(1);
if (st.order) {
  const wrong = TOPPING_IDS.find((id) => !st.order.toppings.has(id));
  st.dough = new Set([wrong]);
  press('KeyS');
  for (let i = 0; i < 200 && st.pizza && !st.pizza.ready; i++) tick(1);
  const tips1 = st.tips;
  const combo1 = st.combo;
  press('KeyS');
  check('a wrong pizza earns nothing', st.tips === tips1, `tips=${st.tips}`);
  check('a wrong pizza breaks the combo', st.combo === 0, `combo was ${combo1} -> ${st.combo}`);
}

// a customer who walks out
for (let i = 0; i < 200 && !st.order; i++) tick(1);
if (st.order) {
  const missed0 = st.missed;
  st.order.patience = 0.05;
  tick(10);
  check('a customer who walks out is counted', st.missed === missed0 + 1, `missed ${missed0} -> ${st.missed}`);
  check('and the order is gone', !st.order);
}

// player two has their own station
const st2 = game.stations[1];
check('player two has their own kitchen', st2 !== st && st2.tips === 0, `tips2=${st2.tips}`);

// the shift ends
game.left = 0.02;
tick(5);
check('the shift ends', game.state === 'over', `state=${game.state}`);

// no NaN
const bad = game.stations.some((s) => !Number.isFinite(s.tips) || !Number.isFinite(s.combo));
check('no NaN in the state', !bad);

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all pizza scenarios passed');
