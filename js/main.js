// Boots the game, wires the DOM chrome, runs the fixed-step loop.

import { Game, W, H } from './game.js';
import { Input } from './input.js';
import { WEAPONS, weaponById } from './weapons.js';
import { clamp } from './utils.js';
import * as Sfx from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);
canvas.dataset.w = String(W);
canvas.dataset.h = String(H);

const input = new Input(canvas);
const game = new Game(canvas);
game.input = input;
game.dpr = dpr;

// console playground — poke at the game from devtools: broGame.wind = 10
window.broGame = game;

// ------------------------------------------------------------------ DOM refs
const $ = (id) => document.getElementById(id);
const el = {
  start: $('overlay-start'),
  win: $('overlay-win'),
  help: $('overlay-help'),
  startBtn: $('btn-start'),
  rematchBtn: $('btn-rematch'),
  helpBtn: $('btn-help'),
  closeHelp: $('btn-close-help'),
  soundBtn: $('btn-sound'),
  restartBtn: $('btn-restart'),
  timerToggle: $('timerToggle'),
  windArrow: $('windArrow'),
  windValue: $('windValue'),
  roundLabel: $('roundLabel'),
  turnPuck: $('turnpuck'),
  banner: $('banner'),
  bannerText: $('bannerText'),
  bannerSub: $('bannerSub'),
  feed: $('feed'),
  weapons: $('weapons'),
  helpWeapons: $('helpWeapons'),
  winTitle: $('winTitle'),
  winQuip: $('winQuip'),
  winStats: $('winStats'),
  cards: [$('p1card'), $('p2card')],
};

// ------------------------------------------------------------------ weapon rack
const weaponButtons = [];
for (let i = 0; i < WEAPONS.length; i++) {
  const w = WEAPONS[i];
  const b = document.createElement('button');
  b.className = 'wbtn';
  b.innerHTML = `<span class="wicon">${w.icon}</span><span class="wname">${w.name}</span><span class="wammo"></span>`;
  b.title = `${w.name} — ${w.desc}${w.ammo === Infinity ? ' (unlimited)' : ` (${w.ammo} left)`}`;
  b.addEventListener('click', () => {
    game.selectWeapon(w.id);
    b.blur();
  });
  el.weapons.appendChild(b);
  weaponButtons.push(b);

  const li = document.createElement('li');
  li.innerHTML = `<b>${w.icon} ${w.name}</b>${w.ammo === Infinity ? '' : ` ×${w.ammo}`} — ${w.desc}`;
  el.helpWeapons.appendChild(li);
}

// ------------------------------------------------------------------ HUD sync
let uiCache = {};
let lastFeedId = 0;
let paused = true;

function syncCards() {
  for (let i = 0; i < 2; i++) {
    const t = game.tanks[i];
    const card = el.cards[i];
    const frac = clamp(t.hp / t.maxHp, 0, 1);
    const fill = card.querySelector('.hpfill');
    fill.style.width = `${(frac * 100).toFixed(1)}%`;
    fill.style.background = frac > 0.6 ? '#5ce65c' : frac > 0.3 ? '#ffb703' : '#ff4d4d';
    card.querySelector('.hpnum').textContent = String(Math.max(0, Math.round(t.hp)));
    const hearts = '♥'.repeat(Math.max(0, game.lives[t.id]));
    card.querySelector('.pstat').textContent = `${hearts} ${weaponById(t.weapon).name}`;
    const isActive = game.state === 'aim' && game.turn === i;
    card.classList.toggle('active', isActive);
    card.classList.toggle('dead', !t.alive && game.lives[t.id] <= 1);
  }
}

function syncWeapons() {
  const t = game.tanks[game.turn] || game.tanks[0];
  const activeIdx = t.id;
  for (let i = 0; i < WEAPONS.length; i++) {
    const w = WEAPONS[i];
    const b = weaponButtons[i];
    const ammo = t.ammo[w.id];
    const empty = ammo !== undefined && ammo <= 0;
    b.classList.toggle('sel', t.weapon === w.id);
    b.classList.toggle('empty', empty);
    b.classList.toggle('p1', activeIdx === 0);
    b.classList.toggle('p2', activeIdx === 1);
    const label = empty ? '—' : ammo === Infinity ? '∞' : `×${ammo}`;
    const a = b.querySelector('.wammo');
    if (a.textContent !== label) a.textContent = label;
  }
}

function syncWind() {
  const w = game.wind;
  const mag = Math.round(Math.abs(w) * 10) / 10;
  if (uiCache.wind !== mag || uiCache.windDir !== Math.sign(w)) {
    uiCache.wind = mag;
    uiCache.windDir = Math.sign(w);
    el.windValue.textContent = mag.toFixed(1);
    el.windArrow.textContent = w === 0 ? '·' : w > 0 ? '→' : '←';
    el.windArrow.style.transform = `scale(${1 + Math.min(0.9, Math.abs(w) / 11)})`;
    el.windArrow.style.color = Math.abs(w) > 6 ? '#ff5a5a' : Math.abs(w) > 3 ? '#ffd166' : '#9fe6a0';
  }
}

function syncTurnPuck() {
  let txt;
  if (paused && game.state === 'menu') txt = 'PRESS START';
  else if (game.roundOver) txt = 'ROUND OVER';
  else if (game.state === 'aim') {
    const t = game.tanks[game.turn];
    const timer = game.timerEnabled ? ` · ${Math.max(0, Math.ceil(game.turnTime))}s` : '';
    txt = `${t.name}'S TURN${timer}`;
  } else if (game.state === 'flying') txt = 'INCOMING…';
  else txt = `${game.tanks[game.turn].name}…`;
  if (uiCache.puck !== txt) {
    uiCache.puck = txt;
    el.turnPuck.textContent = txt;
  }
  const urgent = game.state === 'aim' && game.timerEnabled && game.turnTime <= 10;
  el.turnPuck.classList.toggle('urgent', urgent);

  const roundTxt = `ROUND ${game.roundNumber} · ${game.wins[0]}–${game.wins[1]}`;
  if (uiCache.round !== roundTxt) {
    uiCache.round = roundTxt;
    el.roundLabel.textContent = roundTxt;
  }
}

function syncBanner() {
  const b = game.banner;
  const key = b ? `${b.text}|${b.sub}|${b.cls}` : '';
  if (key === uiCache.banner) return;
  uiCache.banner = key;
  if (!b) {
    el.banner.classList.add('hidden');
    return;
  }
  el.banner.classList.remove('hidden');
  el.bannerText.textContent = b.text;
  el.bannerText.className = `bannertext ${b.cls || ''}`;
  el.bannerSub.textContent = b.sub || '';
  // retrigger the pop animation
  el.banner.style.animation = 'none';
  void el.banner.offsetWidth;
  el.banner.style.animation = '';
}

function syncFeed() {
  for (const item of game.feed) {
    if (item.id <= lastFeedId) continue;
    lastFeedId = item.id;
    const d = document.createElement('div');
    d.className = 'feeditem';
    d.textContent = item.text;
    el.feed.appendChild(d);
    while (el.feed.children.length > 5) el.feed.removeChild(el.feed.firstChild);
  }
}

function syncWin() {
  if (game.state !== 'gameover') {
    if (!el.win.classList.contains('hidden')) el.win.classList.add('hidden');
    return;
  }
  if (!el.win.classList.contains('hidden')) return;
  const w = game.tanks[game.winner];
  el.winTitle.textContent = `${w.name} WINS THE WAR`;
  el.winTitle.className = `title small win${w.id + 1}`;
  el.winQuip.textContent = [
    'Your brother wants a rematch. You know what to do.',
    'Undefeated. Unbearable. Unstoppable.',
    'He is going to say it was lag. There is no lag.',
  ][game.winner % 3];
  const a = game.tanks[0], b = game.tanks[1];
  const acc = (t) => (t.shots ? Math.round((t.kills / t.shots) * 100) : 0);
  el.winStats.innerHTML = [
    stat('ROUNDS', `${game.wins[0]} – ${game.wins[1]}`),
    stat(`BRO 1 KILLS`, a.kills),
    stat(`BRO 2 KILLS`, b.kills),
    stat(`BRO 1 ACCURACY`, `${acc(a)}%`),
    stat(`BRO 2 ACCURACY`, `${acc(b)}%`),
  ].join('');
  el.win.classList.remove('hidden');
}

const stat = (l, v) => `<div class="statbox"><div class="sv">${v}</div><div class="sl">${l}</div></div>`;

function syncUI() {
  syncCards();
  syncWeapons();
  syncWind();
  syncTurnPuck();
  syncBanner();
  syncFeed();
  syncWin();
}

// ------------------------------------------------------------------ overlays
function setPaused() {
  paused = !(el.start.classList.contains('hidden') === false)
    || !el.help.classList.contains('hidden')
    || !el.win.classList.contains('hidden');
  // paused when any overlay is visible
  paused = !el.start.classList.contains('hidden')
    || !el.help.classList.contains('hidden')
    || !el.win.classList.contains('hidden');
}

function startMatch() {
  Sfx.initAudio();
  Sfx.resumeAudio();
  game.start(el.timerToggle.checked);
  el.start.classList.add('hidden');
  el.win.classList.add('hidden');
  uiCache = {};
  lastFeedId = 0;
  el.feed.innerHTML = '';
  setPaused();
}

function toggleHelp(force) {
  const show = force !== undefined ? force : el.help.classList.contains('hidden');
  el.help.classList.toggle('hidden', !show);
  if (show) Sfx.sfxClick();
  setPaused();
}

el.startBtn.addEventListener('click', startMatch);
el.rematchBtn.addEventListener('click', startMatch);
el.helpBtn.addEventListener('click', () => toggleHelp());
el.closeHelp.addEventListener('click', () => toggleHelp(false));
el.restartBtn.addEventListener('click', () => {
  Sfx.initAudio();
  startMatch();
});
el.soundBtn.addEventListener('click', () => {
  Sfx.initAudio();
  Sfx.resumeAudio();
  const m = Sfx.toggleMute();
  el.soundBtn.textContent = m ? '🔇' : '🔊';
});

// unlock audio on the first gesture anywhere
const unlock = () => { Sfx.initAudio(); Sfx.resumeAudio(); };
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyH') toggleHelp();
  if (e.code === 'KeyM') {
    Sfx.initAudio();
    const m = Sfx.toggleMute();
    el.soundBtn.textContent = m ? '🔇' : '🔊';
  }
  if (e.code === 'KeyR' && !paused) startMatch();
});

document.addEventListener('visibilitychange', () => { if (!document.hidden) Sfx.resumeAudio(); });

// ------------------------------------------------------------------ main loop
const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

let started = false;

function frame(now) {
  if (!started) { started = true; last = now; }   // first frame sets the clock
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;        // guards against NaN / negative clock jumps
  if (dt > 0.25) dt = 0.25;

  if (paused) {
    // keep the nice things moving behind the overlay
    game.time += dt;
    game.particles.update(dt);
    game.shake = Math.max(0, game.shake - dt * 46);
    for (const c of game.clouds) { c.x += c.v * dt; if (c.x > W + 140) c.x = -140; }
    if (game.banner) { game.banner.life -= dt; if (game.banner.life <= 0) game.banner = null; }
  } else {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard++ < 8) {
      game.update(STEP);
      acc -= STEP;
    }
    if (guard >= 8) acc = 0;
  }

  game.render(ctx);
  syncUI();
  input.endFrame();
  requestAnimationFrame(frame);
}

setPaused();
requestAnimationFrame(frame);
