// PIZZA RUSH - a two chef time management duel.
//
// Two bros share one kitchen, one oven and a queue of hungry customers.
// Build the pizza they asked for, bake it, serve it before they walk out.
//
// Everything is drawn in code. Fan-made homage - no official assets.

import { clamp, rand, randInt, pick, lerp, TAU, DEG, roundRect, rgba, shade } from '../utils.js';
import { Particles } from '../particles.js';
import * as Sfx from '../audio.js';
import { PadInput, PlayerControls } from '../shared/keys.js';
import { getKeys, onChange, keyLabel, musicEnabled } from '../shared/config.js';
import { initControlsButton, openControls } from '../shared/controls.js';
import { startMusic } from '../shared/music.js';

export const W = 960;
export const H = 540;

const ROUND_TIME = 75;
const BAKE_TIME = 2.3;
const STATION_W = 452;
const STATION_GAP = 16;

const TOPPINGS = [
  { id: 'cheese', name: 'CHEESE', color: '#ffd166' },
  { id: 'pepperoni', name: 'PEP', color: '#ff5a3d' },
  { id: 'mushroom', name: 'SHROOM', color: '#d7b3a0' },
  { id: 'olive', name: 'OLIVE', color: '#8de04a' },
  { id: 'pineapple', name: 'PINE', color: '#ffe9a8' },
];

// id -> topping, so the dough, the tickets and the orders all speak the same
// language (they used to mix indices with ids and never matched)
const TOP_BY_ID = Object.fromEntries(TOPPINGS.map((t) => [t.id, t]));

/** The ids in bin order - handy for tests and for anybody adding a topping. */
export const TOPPING_IDS = TOPPINGS.map((t) => t.id);

const P1 = '#ff8a3d';
const P2 = '#45c8ff';

function sameSet(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

class Pizza {
  constructor(toppings) {
    this.toppings = new Set(toppings);
    this.time = BAKE_TIME;
    this.total = BAKE_TIME;
    this.ready = false;
    this.pop = 0;
  }
}

class Station {
  constructor(side) {
    this.side = side;
    this.dough = new Set();
    this.sel = 0;
    this.pizza = null;
    this.order = null;
    this.tips = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.served = 0;
    this.missed = 0;
    this.cooldown = 1.2;
    this.msg = '';
    this.msgT = 0;
    this.happy = 0;
    this.angry = 0;
    this.shake = 0;
  }

  say(text, good = false) {
    this.msg = text;
    this.msgT = 1.4;
    if (good) this.happy = 0.6; else this.angry = 0.6;
  }
}

class PizzaRush {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new Particles(600);
    this.state = 'title';
    this.time = 0;
    this.left = ROUND_TIME;
    this.stations = [new Station(0), new Station(1)];
    this.shake = 0;
  }

  start() {
    this.time = 0;
    this.left = ROUND_TIME;
    this.stations = [new Station(0), new Station(1)];
    this.fx.clear();
    this.state = 'play';
  }

  /** orders get meaner as the shift goes on */
  difficulty() {
    const t = 1 - this.left / ROUND_TIME;         // 0 .. 1
    return {
      count: 1 + (Math.random() < 0.35 + t * 0.4 ? 1 : 0) + (Math.random() < t * 0.3 ? 1 : 0),
      patience: lerp(15, 8, t) + rand(-1.5, 1.5),
    };
  }

  makeOrder() {
    const d = this.difficulty();
    const toppings = new Set();
    for (let i = 0; i < d.count; i++) toppings.add(TOPPINGS[randInt(0, TOPPINGS.length - 1)].id);
    return { toppings, patience: d.patience, patienceMax: d.patience, value: 8 + toppings.size * 3 };
  }

  update(dt, input) {
    this.time += dt;
    this.fx.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 20);
    if (this.state !== 'play') return;

    this.left -= dt;
    if (this.left <= 0) {
      this.left = 0;
      this.state = 'over';
      Sfx.sfxGameOver();
      return;
    }

    for (let i = 0; i < this.stations.length; i++) {
      const st = this.stations[i];
      const inp = input[i];
      if (st.msgT > 0) st.msgT -= dt;
      if (st.happy > 0) st.happy -= dt;
      if (st.angry > 0) st.angry -= dt;
      if (st.shake > 0) st.shake = Math.max(0, st.shake - dt * 20);

      if (inp.left) { st.sel = (st.sel + TOPPINGS.length - 1) % TOPPINGS.length; Sfx.sfxClick(); }
      if (inp.right) { st.sel = (st.sel + 1) % TOPPINGS.length; Sfx.sfxClick(); }
      if (inp.up) {
        const t = TOPPINGS[st.sel].id;
        if (st.dough.has(t)) { st.dough.delete(t); Sfx.sfxClick(); }
        else { st.dough.add(t); Sfx.sfxTick(); }
      }
      if (inp.down) this.pressDown(st);

      // the pizza in the oven
      if (st.pizza && !st.pizza.ready) {
        st.pizza.time -= dt;
        if (st.pizza.time <= 0) {
          st.pizza.time = 0;
          st.pizza.ready = true;
          st.pizza.pop = 1;
          Sfx.sfxBell();
        }
      }

      // the customer
      if (st.order) {
        st.order.patience -= dt;
        if (st.order.patience <= 0) {
          st.missed++;
          st.combo = 0;
          st.order = null;
          st.cooldown = rand(0.6, 1.4);
          st.say('WALKED OUT');
          Sfx.sfxLose();
          this.shake = 6;
        }
      } else {
        st.cooldown -= dt;
        if (st.cooldown <= 0) {
          st.order = this.makeOrder();
          Sfx.sfxPowerup();
        }
      }
    }
  }

  pressDown(st) {
    // take a ready pizza out
    if (st.pizza && st.pizza.ready) {
      const pizza = st.pizza;
      st.pizza = null;
      const order = st.order;
      if (order && sameSet(pizza.toppings, order.toppings)) {
        const speed = Math.max(0, Math.round(order.patience));
        const tip = order.value + speed + Math.min(10, st.combo * 2);
        st.tips += tip;
        st.combo++;
        st.bestCombo = Math.max(st.bestCombo, st.combo);
        st.served++;
        st.order = null;
        st.cooldown = rand(0.5, 1.2);
        st.say(`+${tip} TIP!`);
        Sfx.sfxPowerup();
        this.fx.confetti(this.stationX(st.side) + 96, 150, 26);
      } else {
        st.combo = 0;
        st.missed++;
        if (order) {
          order.patience = Math.max(0.5, order.patience - 4);
          st.say('WRONG PIZZA!');
        } else {
          st.say('NOBODY ORDERED THAT');
        }
        Sfx.sfxLose();
      }
      return;
    }
    // put a pizza in the oven
    if (st.pizza) { st.say('STILL BAKING'); return; }
    if (!st.dough.size) { st.say('NO TOPPINGS'); return; }
    st.pizza = new Pizza(st.dough);
    st.dough = new Set();
    Sfx.sfxWhiff();
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) ctx.translate(rand(-this.shake, this.shake) * 0.4, rand(-this.shake, this.shake) * 0.4);
    this.drawKitchen(ctx);
    this.stations.forEach((st, i) => this.drawStation(ctx, st, i));
    this.fx.draw(ctx, 'front');
    ctx.restore();
    this.drawHud(ctx);
    if (this.state === 'over') this.drawEnd(ctx);
  }

  // ------------------------------------------------------------- painting

  drawKitchen(ctx) {
    // wall
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a2140');
    g.addColorStop(0.45, '#1d1832');
    g.addColorStop(1, '#141126');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // tiles
    ctx.strokeStyle = 'rgba(255,255,255,.04)';
    ctx.lineWidth = 1;
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); ctx.stroke();
    }
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); ctx.stroke();
    }

    // counter
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(0, 300, W, 240);
    ctx.fillStyle = '#4a3c2a';
    ctx.fillRect(0, 300, W, 10);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    for (let x = 0; x < W; x += 60) ctx.fillRect(x, 310, 2, 230);
  }

  stationX(side) { return 14 + side * (STATION_W + STATION_GAP); }

  drawStation(ctx, st, side) {
    const x = this.stationX(side);
    const color = side === 0 ? P1 : P2;
    const w = STATION_W;
    ctx.save();
    if (st.shake > 0) ctx.translate(rand(-st.shake, st.shake) * 0.4, rand(-st.shake, st.shake) * 0.4);

    // ---- the serve window with the customer
    const winY = 58, winH = 150;
    ctx.fillStyle = '#171329';
    roundRect(ctx, x + 30, winY, w - 60, winH, 12);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 3;
    ctx.stroke();

    // the customer
    const cx = x + 96;
    const cy = winY + 74;
    const mood = st.order ? (st.order.patience / st.order.patienceMax) : 1;
    const skin = st.angry > 0 ? '#e08a7a' : '#f0c9a4';
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.arc(cx, cy, 34, 0, TAU); ctx.fill();
    // hat
    ctx.fillStyle = st.order ? '#fff' : '#6b6b7a';
    ctx.beginPath();
    ctx.arc(cx, cy - 22, 26, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(cx - 30, cy - 24, 60, 9);
    // eyes
    ctx.fillStyle = '#1b1526';
    const eyeY = cy - 2;
    ctx.beginPath(); ctx.arc(cx - 12, eyeY, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 12, eyeY, 4, 0, TAU); ctx.fill();
    // mouth
    ctx.strokeStyle = '#1b1526';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (st.order && mood < 0.35) ctx.arc(cx, cy + 16, 9, Math.PI, TAU);       // angry
    else if (st.order && mood < 0.7) ctx.arc(cx, cy + 10, 9, 0, Math.PI);      // nervous
    else ctx.arc(cx, cy + 8, 10, 0.15, Math.PI - 0.15);                          // happy
    ctx.stroke();
    // the order ticket
    if (st.order) {
      const tx = x + 160, ty = winY + 18;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(-0.04);
      ctx.fillStyle = '#f6f1e2';
      ctx.fillRect(0, 0, 190, 112);
      ctx.fillStyle = 'rgba(0,0,0,.12)';
      ctx.fillRect(0, 0, 190, 14);
      ctx.fillStyle = '#3a2f22';
      ctx.font = 'bold 12px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('ORDER', 10, 26);
      // the wanted toppings
      const want = [...st.order.toppings];
      want.forEach((id, i) => {
        const tp = TOP_BY_ID[id];
        if (!tp) return;
        const bx = 16 + i * 56, by = 42;
        ctx.fillStyle = tp.color;
        ctx.beginPath(); ctx.arc(bx + 18, by + 18, 18, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#3a2f22';
        ctx.font = 'bold 9px "Comic Sans MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tp.name, bx + 18, by + 48);
      });
      ctx.restore();

      // patience bar
      const bw = 190;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(tx, winY + 134, bw, 10);
      ctx.fillStyle = mood > 0.5 ? '#8de04a' : mood > 0.25 ? '#ffd166' : '#ff5a3d';
      ctx.fillRect(tx, winY + 134, bw * clamp(mood, 0, 1), 10);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.font = 'bold 14px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('...', x + 170, winY + 80);
    }

    // ---- the counter: dough, bins, oven
    const dy = 380;
    // dough
    ctx.fillStyle = '#e8c893';
    ctx.beginPath(); ctx.arc(x + 92, dy, 44, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // the toppings on the dough
    [...st.dough].forEach((id, i) => {
      const tp = TOP_BY_ID[id];
      if (!tp) return;
      const a = (i / Math.max(1, st.dough.size)) * TAU;
      const px = x + 92 + Math.cos(a) * 18;
      const py = dy + Math.sin(a) * 18;
      ctx.fillStyle = tp.color;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    if (!st.dough.size) {
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.font = 'bold 11px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('EMPTY', x + 92, dy + 4);
    }

    // topping bins
    const binY = 452;
    TOPPINGS.forEach((tp, i) => {
      const bx = x + 168 + i * 54;
      const on = st.sel === i;
      ctx.fillStyle = on ? 'rgba(255,209,102,.18)' : 'rgba(0,0,0,.3)';
      roundRect(ctx, bx, binY, 46, 52, 8);
      ctx.fill();
      ctx.strokeStyle = on ? '#ffd166' : 'rgba(0,0,0,.5)';
      ctx.lineWidth = on ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = tp.color;
      ctx.beginPath(); ctx.arc(bx + 23, binY + 20, 13, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = 'bold 8px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(tp.name, bx + 23, binY + 44);
    });

    // the oven
    const ox = x + 168, oy = 300;
    ctx.fillStyle = '#20222c';
    roundRect(ctx, ox, oy, 262, 72, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.lineWidth = 3;
    ctx.stroke();
    if (st.pizza) {
      const p = st.pizza;
      if (p.ready) {
        const flash = Math.floor(this.time * 6) % 2 === 0;
        ctx.fillStyle = flash ? 'rgba(255,209,102,.85)' : 'rgba(255,138,61,.75)';
        roundRect(ctx, ox + 8, oy + 8, 246, 56, 6);
        ctx.fill();
        ctx.fillStyle = '#12152b';
        ctx.font = 'bold 20px "Comic Sans MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('READY!', ox + 131, oy + 44);
      } else {
        ctx.fillStyle = 'rgba(255,90,61,.35)';
        roundRect(ctx, ox + 8, oy + 8, 246, 56, 6);
        ctx.fill();
        const prog = 1 - p.time / p.total;
        ctx.fillStyle = '#ff5a3d';
        ctx.fillRect(ox + 12, oy + 46, 238 * prog, 12);
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.font = 'bold 12px "Comic Sans MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('BAKING', ox + 131, oy + 32);
      }
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      roundRect(ctx, ox + 8, oy + 8, 246, 56, 6);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.font = 'bold 12px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('OVEN EMPTY', ox + 131, oy + 40);
    }

    // the player's banner - it lives under the serve window so it never
    // collides with the score panels or the shift timer along the top
    ctx.fillStyle = color;
    roundRect(ctx, x + 30, 222, 150, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#12152b';
    ctx.font = 'bold 14px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(side === 0 ? 'CHEF ORANGE' : 'CHEF BLUE', x + 105, 241);
    ctx.textAlign = 'left';

    // the floating message
    if (st.msgT > 0) {
      ctx.globalAlpha = Math.min(1, st.msgT * 2);
      ctx.fillStyle = st.angry > 0 ? '#ff8a3d' : '#8de04a';
      ctx.font = 'bold 22px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(st.msg, x + w / 2, 348);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  drawHud(ctx) {
    ctx.fillStyle = 'rgba(8,10,22,.9)';
    ctx.fillRect(W / 2 - 90, 10, 180, 44);
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W / 2 - 90, 10, 180, 44);
    ctx.fillStyle = this.left < 10 ? '#ff5a3d' : '#ffd166';
    ctx.font = 'bold 26px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.ceil(this.left), W / 2, 42);

    this.stations.forEach((st, i) => {
      const x = i === 0 ? 14 : W - 150;
      ctx.fillStyle = 'rgba(8,10,22,.85)';
      ctx.fillRect(x, 10, 136, 44);
      ctx.fillStyle = i === 0 ? P1 : P2;
      ctx.font = 'bold 19px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${st.tips}`, x + 10, 38);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.font = 'bold 10px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillText(`served ${st.served} · combo x${st.combo}`, x + 10, 50);
    });
  }

  drawTitle(ctx) {
    ctx.fillStyle = '#140f22';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 62px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('PIZZA RUSH', W / 2, 190);
    ctx.font = 'bold 17px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#8f96c9';
    ctx.fillText('two chefs · one oven · a queue that only gets meaner', W / 2, 230);
    ctx.fillStyle = '#fff';
    ctx.fillText('PRESS ENTER TO OPEN THE SHOP', W / 2, 300);
    ctx.font = 'bold 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#6d74a8';
    ctx.fillText('P1  A/D pick topping · W add · S bake & serve', W / 2, 350);
    ctx.fillText('P2  ←/→ pick topping · ↑ add · ↓ bake & serve', W / 2, 372);
  }

  drawEnd(ctx) {
    ctx.fillStyle = 'rgba(5,6,13,.88)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px "Comic Sans MS", system-ui, sans-serif';
    const a = this.stations[0], b = this.stations[1];
    const winner = a.tips === b.tips ? null : (a.tips > b.tips ? a : b);
    ctx.fillStyle = winner ? (winner.side === 0 ? P1 : P2) : '#ffd166';
    ctx.fillText(winner ? 'SHIFT OVER' : 'A DEAD HEAT', W / 2, 170);
    ctx.font = 'bold 20px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(`ORANGE ${a.tips} tips   ·   BLUE ${b.tips} tips`, W / 2, 220);
    ctx.fillStyle = '#8f96c9';
    ctx.font = 'bold 14px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText(`served ${a.served} (best combo ${a.bestCombo})   ·   served ${b.served} (best combo ${b.bestCombo})`, W / 2, 252);
    ctx.fillText('PRESS ENTER FOR ANOTHER SHIFT', W / 2, 320);
  }
}

// ------------------------------------------------------------------- boot

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);

const pizza = new PizzaRush(canvas);
pizza.dpr = dpr;
window.broPizza = pizza;

const pad = new PadInput();
const p1 = new PlayerControls(pad, getKeys('pizza', 0), 0);
const p2 = new PlayerControls(pad, getKeys('pizza', 1), 1);

function pizzaHint() {
  const k = (p, a) => keyLabel((getKeys('pizza', p)[a] || [])[0]);
  return `<b>P1</b> ${k(0, 'left')}/${k(0, 'right')} topping · ${k(0, 'up')} add · ${k(0, 'down')} bake &nbsp;·&nbsp; `
    + `<b>P2</b> ${k(1, 'left')}/${k(1, 'right')} topping · ${k(1, 'up')} add · ${k(1, 'down')} bake &nbsp;·&nbsp; `
    + `match the ticket, then serve before they walk out`;
}
function refreshHint() {
  const hint = document.getElementById('hinttext');
  if (hint) hint.innerHTML = pizzaHint();
}
refreshHint();
onChange(({ gameId }) => { if (!gameId || gameId === 'pizza') refreshHint(); });

const input = [
  { left: false, right: false, up: false, down: false },
  { left: false, right: false, up: false, down: false },
];
window.broControls = { p1, p2 };

function read(ctl, out) {
  out.left = ctl.press('left');
  out.right = ctl.press('right');
  out.up = ctl.press('up');
  out.down = ctl.press('down');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (pizza.state === 'title' || pizza.state === 'over') {
      Sfx.initAudio();
      Sfx.resumeAudio();
      pizza.start();
    }
  }
  if (e.code === 'F1') {
    e.preventDefault();
    document.getElementById('overlay-help').classList.toggle('hidden');
  }
  if (e.code === 'F2') {
    e.preventDefault();
    openControls('pizza');
  }
});

const soundBtn = document.getElementById('btn-sound');
if (soundBtn) {
  soundBtn.addEventListener('click', () => {
    Sfx.initAudio();
    Sfx.resumeAudio();
    const m = Sfx.toggleMute();
    soundBtn.textContent = m ? '🔇' : '🔊';
  });
}
window.addEventListener('pointerdown', () => { Sfx.initAudio(); Sfx.resumeAudio(); }, { once: true });

initControlsButton('btn-controls', 'pizza');
if (musicEnabled()) startMusic('pizza');

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();
function frame(now) {
  // the first frame timestamp can be older than performance.now(),
  // so a negative dt has to be thrown away, not clamped
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;
  read(p1, input[0]);
  read(p2, input[1]);
  acc += dt;
  if (acc < 0) acc = 0;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) {
    pizza.update(STEP, input);
    // a button press is edge triggered: handle it once, not once per step
    for (const i of input) { i.left = i.right = i.up = i.down = false; i.attack = false; i.dash = false; }
    acc -= STEP;
  }
  if (guard >= 8) acc = 0;
  pizza.render();
  pad.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
