// Deep scenario test: drive TURBO BROS through track select -> countdown ->
// race -> laps, and check the physics, checkpoints and AI behave.
//
//   node tools/scenario-racer.mjs

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
  const el = {
    id, style: {}, dataset: {},
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c, f) { const on = f === undefined ? !this._s.has(c) : !!f; if (on) this._s.add(c); else this._s.delete(c); return on; } },
    addEventListener() {}, appendChild() {}, removeChild() {}, querySelector: () => makeEl('q'), querySelectorAll: () => [],
    getContext: () => makeCtx(), setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 540 }),
    textContent: '', innerHTML: '', width: 960, height: 540,
  };
  return el;
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
  createElement: () => makeEl('new'),
  addEventListener() {}, hidden: false,
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const queue = [];
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };

function key(code, down) {
  const list = winHandlers.get(down ? 'keydown' : 'keyup') || [];
  for (const fn of list) fn({ code, repeat: false, preventDefault() {} });
}

await import(pathToFileURL(join(ROOT, 'js', 'games', 'racer.js')).href);
const racer = win.broRacer;

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
check('starts on the track picker', racer.state === 'track', `state=${racer.state}`);

// pick track 2 and start
key('ArrowRight', true); tick(1); key('ArrowRight', false);
key('Enter', true); tick(1); key('Enter', false);
tick(5);
check('loading a track starts the countdown', racer.state === 'countdown', `state=${racer.state}`);
check('four cars on the grid', racer.cars.length === 4, `cars=${racer.cars.length}`);

// let the countdown run out
for (let i = 0; i < 300 && racer.state === 'countdown'; i++) tick(1);
check('the countdown ends into the race', racer.state === 'race', `state=${racer.state}`);

// drive
const car = racer.cars[0];
const x0 = car.x, y0 = car.y;
check('the grid sits on the tarmac', car.offRoad === false, `offRoad=${car.offRoad}`);
key('KeyW', true);
for (let i = 0; i < 30; i++) tick(1);
check('the car accelerates', car.vel > 100, `speed=${car.vel.toFixed(1)}`);
for (let i = 0; i < 30; i++) tick(1);
check('the car moves', Math.hypot(car.x - x0, car.y - y0) > 20, `moved=${Math.hypot(car.x - x0, car.y - y0).toFixed(1)}`);
check('speed is capped', car.vel <= 620, `speed=${car.vel.toFixed(1)}`);

// steering changes the heading
const a0 = car.angle;
key('KeyD', true);
for (let i = 0; i < 30; i++) tick(1);
key('KeyD', false);
check('steering turns the car', Math.abs(car.angle - a0) > 0.1, `d=${(car.angle - a0).toFixed(3)}`);

// a car that is driven properly stays on the tarmac (borrow the AI's driving)
function autoDrive(ticks) {
  for (let i = 0; i < ticks; i++) {
    const ai = racer.aiInput(car);
    key('KeyD', ai.steer > 0.2);
    key('KeyA', ai.steer < -0.2);
    key('KeyW', ai.accel);
    key('KeyS', ai.brake);
    tick(1);
  }
  key('KeyD', false); key('KeyA', false);
  key('KeyW', false); key('KeyS', false);
}
autoDrive(240);
check('a well driven car stays on the road', car.offRoad === false, `offRoad=${car.offRoad}`);
check('the driven car keeps up with the AI', car.progress > racer.cars[2].progress * 0.5,
  `progress=${Math.round(car.progress)} cpu=${Math.round(racer.cars[2].progress)}`);

// the AI drives too
const cpu = racer.cars[2];
const cx = cpu.x, cy = cpu.y;
for (let i = 0; i < 60; i++) tick(1);
check('the CPU cars drive', Math.hypot(cpu.x - cx, cpu.y - cy) > 20, `moved=${Math.hypot(cpu.x - cx, cpu.y - cy).toFixed(1)}`);

// nitro burns the meter
key('KeyW', true);
for (let i = 0; i < 30; i++) tick(1);
const nitro = car.nitro;
key('ShiftLeft', true);
for (let i = 0; i < 30; i++) tick(1);
key('ShiftLeft', false);
check('nitro drains the meter', car.nitro < nitro, `nitro=${car.nitro.toFixed(1)}`);

// drive the whole lap by teleporting along the centreline
key('KeyW', false);
const t = racer.track;
let lapped = false;
for (let i = 0; i < t.samples.length + 40; i++) {
  const s = t.samples[i % t.samples.length];
  car.x = s.x; car.y = s.y;
  car.trackIdx = s.i;
  car.vx = 0; car.vy = 0; car.speed = 100; car.vel = 100;
  tick(1);
  if (car.lap > 0) { lapped = true; break; }
}
check('completing a lap counts it', lapped, `lap=${car.lap} cp=${car.cp}`);

// no NaN anywhere
const bad = racer.cars.some((c) => !Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.speed) || !Number.isFinite(c.vel) || !Number.isFinite(c.progress));
check('no NaN in car state', !bad);

// a full lap driven by the AI takes a sensible amount of time
const cpu2 = racer.cars[2];
for (let i = 0; i < 60 * 45 && cpu2.lap < 1; i++) tick(1);
check('the AI completes a lap', cpu2.lap >= 1, `lap=${cpu2.lap}`);
check('the lap time is believable', cpu2.lapTimes.length > 0 && cpu2.lapTimes[0] > 5,
  `lapTime=${cpu2.lapTimes.length ? cpu2.lapTimes[0].toFixed(1) : 'n/a'}`);

// ranking exists
check('the race is ranked', racer.cars.every((c) => c.place >= 1 && c.place <= 4), racer.cars.map((c) => c.place).join(','));

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all racer scenarios passed');
