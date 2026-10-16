// debug: why does the special not start for some heroes?
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
  createElement: () => makeEl('x'), addEventListener() {}, hidden: false,
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
globalThis.performance = { now: () => Date.now() };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const queue = [];
globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return 1; };

function key(code, down) {
  const list = winHandlers.get(down ? 'keydown' : 'keyup') || [];
  for (const fn of list) fn({ code, repeat: false, preventDefault() {} });
}

await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const game = win.broFighter;
const { ROSTER } = await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);

let now = 0;
const STEP = 1000 / 60;
function tick(n = 1) {
  for (let i = 0; i < n; i++) {
    now += STEP;
    const cb = queue.pop();
    cb(now);
  }
}

tick(10);
key('KeyF', true); tick(2); key('KeyF', false);
key('KeyJ', true); tick(2); key('KeyJ', false);
for (let i = 0; i < 200 && game.state === 'select'; i++) tick(1);
tick(90);

const [a, b] = game.fighters;
console.log('state', game.state, 'a.state', a.state, 'canAct', a.canAct);

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

  key('KeyH', true);
  const preState = { state: a.state, canAct: a.canAct, inputSpecial: a.input.special, gameState: game.state };
  tick(1);
  key('KeyH', false);
  const started = a.state === 'attack' || a.attack !== null;
  console.log(
    def.name.padEnd(13),
    def.special.kind.padEnd(10),
    'started=' + started,
    'pre=' + JSON.stringify(preState),
    'postState=' + a.state,
  );
  // let the attack resolve
  for (let i = 0; i < 120; i++) tick(1);
}
