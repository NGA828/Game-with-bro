// Deep scenario test for BRO DUNGEON.
//
//   node tools/scenario-dungeon.mjs

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

await import(pathToFileURL(join(ROOT, 'js', 'games', 'dungeon.js')).href);
const game = win.broDungeon;

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
check('enter starts the run', game.state === 'play', `state=${game.state}`);
check('eight rooms are generated', game.rooms.length === 8, `rooms=${game.rooms.length}`);
check('two heroes', game.heroes.length === 2, `heroes=${game.heroes.length}`);
check('the first room has monsters', game.current.enemies.length > 0, `enemies=${game.current.enemies.length}`);

// every room must be walkable - the far door has to be reachable
let allConnected = true;
for (const r of game.rooms) {
  const seen = new Set();
  const stack = [[0, r.doorY]];
  seen.add(`${0},${r.doorY}`);
  let reached = false;
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === 19 && y === r.doorY) { reached = true; break; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 19 || ny > 10) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      if (r.grid[ny][nx] === 1) continue;
      seen.add(k);
      stack.push([nx, ny]);
    }
  }
  if (!reached) { allConnected = false; break; }
}
check('every room connects its doors', allConnected);

// moving
const hero = game.heroes[0];
const x0 = hero.x;
key('KeyD', true);
for (let i = 0; i < 20; i++) tick(1);
key('KeyD', false);
check('the hero walks', hero.x > x0, `x ${x0.toFixed(0)} -> ${hero.x.toFixed(0)}`);

// the sword hurts what is in front of you
const victim = game.current.enemies[0];
victim.x = hero.x + 26;
victim.y = hero.y;
victim.hp = victim.maxHp;
hero.face = 0;
hero.swingCd = 0;
key('KeyF', true); tick(1); key('KeyF', false);
tick(1);
check('the sword damages a monster', victim.hp < victim.maxHp, `hp ${victim.maxHp} -> ${victim.hp}`);

// dashing
const hx = hero.x;
hero.dashCd = 0;
key('KeyG', true); tick(1); key('KeyG', false);
tick(1);
check('the dash moves you further', Math.abs(hero.x - hx) > 0 || hero.dash > 0);

// monsters hurt
const hp0 = hero.hp;
hero.invuln = 0;
hero.shield = 0;
const biter = game.current.enemies.find((e) => !e.dead);
if (biter) {
  biter.x = hero.x;
  biter.y = hero.y;
  tick(2);
}
check('contact damage hurts', hero.hp < hp0 || hero.dead, `hp ${hp0} -> ${hero.hp}`);

// loot
const h2 = game.heroes[1];
h2.coins = 0;
game.current.pickups.push({ kind: 'coin', x: h2.x, y: h2.y, life: 0 });
tick(2);
check('coins are picked up', h2.coins > 0, `coins=${h2.coins}`);

// clear the room and walk through the door
for (const e of game.current.enemies) e.dead = true;
tick(2);
check('clearing the room opens the door', game.current.cleared === true);

const room0 = game.room;
game.heroes.forEach((h) => { h.x = 19 * 48 + 24; h.y = game.current.doorY * 48 + 24; });
tick(3);
check('the open door leads to the next room', game.room === room0 + 1, `room ${room0} -> ${game.room}`);

// the boss is waiting in the last room
game.enterRoom(7);
tick(2);
const boss = game.current.enemies.find((e) => e.kind === 'boss');
check('the last room has the boss', !!boss, `enemies=${game.current.enemies.map((e) => e.kind).join(',')}`);
if (boss) {
  boss.hp = 1;
  const h3 = game.heroes[0];
  h3.face = 0;
  h3.swingCd = 0;
  boss.x = h3.x + 24;
  boss.y = h3.y;
  key('KeyF', true); tick(1); key('KeyF', false);
  tick(2);
  check('killing the boss wins the run', game.state === 'win', `state=${game.state}`);
}

// dying loses the run
game.start();
tick(2);
for (const h of game.heroes) { h.hp = 1; h.invuln = 0; h.shield = 0; }
game.heroes[0].dead = true;
game.heroes[1].dead = true;
tick(2);
check('both heroes down ends the run', game.state === 'over', `state=${game.state}`);

// no NaN
const bad = [...game.heroes, ...game.current.enemies].some((o) => !Number.isFinite(o.x) || !Number.isFinite(o.y));
check('no NaN in entity state', !bad);

console.log('');
if (fails.length) {
  console.log(`${fails.length} check(s) failed: ${fails.join(', ')}`);
  process.exit(1);
}
console.log('all dungeon scenarios passed');
