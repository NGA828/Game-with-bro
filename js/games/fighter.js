// HERO CLASH — a King of Fighters style duel starring My Hero Academia heroes.
//
// Team LETTERS (player 1) vs Team NUMBERS (player 2). Pick a hero, then
// fight best of three with real quirks: All Might's punches, Bakugo's
// explosions, Todoroki's ice, Uraraka's zero gravity.
//
// Everything is drawn in code. Fan-made homage — no official assets.

import { clamp, rand, randInt, pick, lerp, TAU, DEG, roundRect, rgba, shade } from '../utils.js';
import { Particles } from '../particles.js';
import * as Sfx from '../audio.js';
import { PadInput, PlayerControls } from '../shared/keys.js';
import { getKeys, onChange, keyLabel } from '../shared/config.js';
import { initControlsButton, openControls } from '../shared/controls.js';
import { startMusic, setMusicVolume } from '../shared/music.js';
import { musicEnabled, musicVolume } from '../shared/config.js';

// Wire the gear button before anything else, so the settings panel is
// reachable even if the game below trips over something while it boots.
initControlsButton('btn-controls', 'fighter');

export const W = 960;
export const H = 540;

const FLOOR = 468;            // y of the ground the fighters stand on
const MAX_HP = 1000;
const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;       // best of 3
const GRAVITY = 2100;
const FIGHTER_H = 108;
const CROUCH_H = 66;
const STAGE_W = 1600;          // how far the stage stretches past the screen
const WALK_SPEED = 190;
const BACK_SPEED = 150;
const JUMP_V = 700;

// ---------------------------------------------------------------- roster
// power/speed drive the walk speed and the damage multipliers.
// `kind` picks which move routine runs when the special fires.

export const ROSTER = [
  {
    id: 'allmight', name: 'ALL MIGHT', tag: 'Symbol of Peace',
    quirk: 'One For All — borrowed power, absurd strength',
    power: 5, speed: 3, weight: 1.4,
    skin: '#f2c9a0', hair: '#f7dc6f', hairStyle: 'flat',
    suit: '#2f5fb3', suit2: '#eceaf5', accent: '#ffd166', cape: '#d8453f',
    special: { kind: 'lunge', name: 'DETROIT SMASH', dmg: 130, reach: 190, dist: 230, startup: 0.16 },
    super: { kind: 'lunge', name: 'UNITED STATES OF SMASH', dmg: 300, reach: 260, dist: 340, startup: 0.22, armor: true },
  },
  {
    id: 'allforone', name: 'ALL FOR ONE', tag: 'The Shoto',
    quirk: 'Steal and give — he takes your power and keeps it',
    power: 4, speed: 3, weight: 1.3,
    skin: '#d9c3a8', hair: '#9aa6b8', hairStyle: 'mask',
    suit: '#20243a', suit2: '#3a4258', accent: '#9d7bff', cloak: '#2a3048',
    special: { kind: 'aoe', name: 'AIR SLAM', dmg: 140, radius: 160, startup: 0.24, kbY: 520 },
    super: { kind: 'meteor', name: 'METEOR SHOWER', dmg: 320, startup: 0.3 },
  },
  {
    id: 'deku', name: 'DEKU', tag: 'One For All',
    quirk: 'The next generation of the strongest hero',
    power: 3, speed: 5, weight: 1.0,
    skin: '#f0c49b', hair: '#4b8f3a', hairStyle: 'messy',
    suit: '#e8503a', suit2: '#2a3550', accent: '#8de04a', lenses: true,
    special: { kind: 'lunge', name: 'ONE FOR ALL', dmg: 105, reach: 165, dist: 250, startup: 0.12 },
    super: { kind: 'barrage', name: 'ONE FOR ALL 1000%', dmg: 92, hits: 7, startup: 0.2, active: 0.95 },
  },
  {
    id: 'bakugo', name: 'BAKUGO', tag: 'Explosion',
    quirk: 'Palms off, everything goes up',
    power: 4, speed: 4, weight: 1.0,
    skin: '#f0c49b', hair: '#f2d06b', hairStyle: 'spiky',
    suit: '#232733', suit2: '#8a8f9e', accent: '#ff7a2f', gauntlets: true,
    special: { kind: 'blast', name: 'HOWITZER IMPACT', dmg: 125, speed: 560, radius: 30, startup: 0.18, kbY: 320 },
    super: { kind: 'blast', name: 'EXPLOSION', dmg: 300, speed: 720, radius: 70, startup: 0.26, unblockable: true, big: true },
  },
  {
    id: 'todoroki', name: 'TODOROKI', tag: 'Half-Cold Half-Hot',
    quirk: 'Fire on the left, ice on the right',
    power: 4, speed: 4, weight: 1.15,
    skin: '#f0c49b', hair: '#e05a5a', hairStyle: 'half', hair2: '#eef3f8',
    suit: '#2a3550', suit2: '#c0392b', accent: '#7fd4ff', scar: true,
    special: { kind: 'projectile', name: 'ICE', dmg: 95, speed: 460, radius: 26, element: 'ice', startup: 0.2, freeze: 1.3 },
    super: { kind: 'projectile', name: 'FLASHFREEZE HEATWAVE', dmg: 190, speed: 520, radius: 40, element: 'fire', startup: 0.3, burn: 3, unblockable: true },
  },
  {
    id: 'uraraka', name: 'URARAKA', tag: 'Zero Gravity',
    quirk: 'Anything she touches stops falling',
    power: 2, speed: 5, weight: 0.9,
    skin: '#f4cfae', hair: '#6b4a35', hairStyle: 'bob',
    suit: '#f27da4', suit2: '#3b4a6b', accent: '#ffd166',
    special: { kind: 'lift', name: 'ZERO GRAVITY', dmg: 70, range: 150, startup: 0.16, slam: 90 },
    super: { kind: 'lift', name: 'ZERO GRAVITY ULTIMATE', dmg: 120, range: 190, startup: 0.26, slam: 190, float: true },
  },
  {
    id: 'tsuyu', name: 'TSUYU', tag: 'Frog',
    quirk: 'Slippery, cheerful, and weirdly hard to hold',
    power: 2, speed: 5, weight: 0.95,
    skin: '#f4cfae', hair: '#3f7a4a', hairStyle: 'hood',
    suit: '#2f8f5b', suit2: '#e9e4c9', accent: '#8de04a',
    special: { kind: 'heal', name: 'RIBBIT', heal: 170, startup: 0.22 },
    super: { kind: 'heal', name: 'FROG SLIME', heal: 300, startup: 0.34, slow: 0.5 },
  },
  {
    id: 'iida', name: 'IIDA', tag: 'Tenya',
    quirk: 'Speed above, and he will absolutely tell you about it',
    power: 3, speed: 5, weight: 1.0,
    skin: '#f0c49b', hair: '#2f4a6b', hairStyle: 'suit',
    suit: '#1f3a6b', suit2: '#d9b34a', accent: '#7fd4ff', horns: true,
    special: { kind: 'debuff', name: 'TENYA', dmg: 70, slow: 0.45, dur: 3, startup: 0.18 },
    super: { kind: 'lunge', name: 'HUNDRED THOUSAND MPH', dmg: 210, reach: 230, dist: 470, startup: 0.18 },
  },
  {
    id: 'kirishima', name: 'KIRISHIMA', tag: 'Hardening',
    quirk: 'Hit him and it hurts your hand',
    power: 4, speed: 3, weight: 1.3,
    skin: '#e8b48c', hair: '#d8493f', hairStyle: 'messy',
    suit: '#2b2f3d', suit2: '#8a2f2a', accent: '#ffb703',
    special: { kind: 'armor', name: 'HARDENING', dmg: 115, dur: 1.8, startup: 0.16 },
    super: { kind: 'armor', name: 'UNBREAKABLE', dmg: 240, dur: 3.2, startup: 0.24, unbreakable: true },
  },
  {
    id: 'tokoyami', name: 'TOKOYAMI', tag: 'Shadow',
    quirk: 'A bird demon does the hitting, politely',
    power: 3, speed: 4, weight: 1.05,
    skin: '#e8c9a8', hair: '#241c2e', hairStyle: 'bird',
    suit: '#1d1a2b', suit2: '#3a3350', accent: '#c9a227', cloak: '#2a2340',
    special: { kind: 'teleport', name: 'BLACK SHADOW', dmg: 125, startup: 0.18 },
    super: { kind: 'teleport', name: 'SHADOW THRONE', dmg: 260, startup: 0.28, hits: 2 },
  },
  {
    id: 'momo', name: 'MOMO', tag: 'Gigantification',
    quirk: 'She grows. Everything else stays the same size',
    power: 3, speed: 3, weight: 1.1,
    skin: '#f4cfae', hair: '#f0d17a', hairStyle: 'bun',
    suit: '#e05a7a', suit2: '#f2e6c9', accent: '#ffd166', horns: true,
    special: { kind: 'grow', name: 'GIANT', dur: 9, mul: 1.55, startup: 0.2 },
    super: { kind: 'grow', name: 'GIGANTIFICATION', dur: 13, mul: 1.95, startup: 0.3 },
  },
  {
    id: 'dabi', name: 'DABI', tag: 'Blue Flame',
    quirk: 'Hotter than All For One likes',
    power: 4, speed: 4, weight: 1.1,
    skin: '#e8c0a0', hair: '#2f6fb5', hairStyle: 'spiky', staples: true,
    suit: '#1a1a22', suit2: '#2f6fb5', accent: '#2f6fb5',
    special: { kind: 'projectile', name: 'BLUE FLAME', dmg: 85, speed: 520, radius: 24, element: 'fire', startup: 0.18, burn: 3 },
    super: { kind: 'projectile', name: 'COMBUSTION', dmg: 210, speed: 560, radius: 46, element: 'fire', startup: 0.3, burn: 4, unblockable: true },
  },
  {
    id: 'stain', name: 'STAIN', tag: 'Crimson Ice',
    quirk: 'He freezes things, then arrests them',
    power: 3, speed: 4, weight: 1.05,
    skin: '#e0b088', hair: '#b03a2e', hairStyle: 'hood2',
    suit: '#232a35', suit2: '#2f6f4f', accent: '#7fd4ff', scarf: true,
    special: { kind: 'projectile', name: 'CRIMSON ICE', dmg: 105, speed: 500, radius: 25, element: 'ice', startup: 0.2, freeze: 1.6 },
    super: { kind: 'projectile', name: 'FROZEN CAGE', dmg: 185, speed: 540, radius: 38, element: 'ice', startup: 0.28, freeze: 2.2 },
  },
  {
    id: 'shigaraki', name: 'SHIGARAKI', tag: 'Decay',
    quirk: 'Touch anything and it stops existing',
    power: 4, speed: 3, weight: 1.1,
    skin: '#e0c8b0', hair: '#2a3a6b', hairStyle: 'spiky', stitches: true,
    suit: '#20222c', suit2: '#4a3a6b', accent: '#9d7bff',
    special: { kind: 'dot', name: 'DECAY', dmg: 55, dot: 11, dur: 4, range: 130, startup: 0.18 },
    super: { kind: 'dot', name: 'DECAY WAVE', dmg: 95, dot: 18, dur: 5, range: 230, startup: 0.3, wide: true },
  },
  {
    id: 'presentmic', name: 'PRESENT MIC', tag: 'Voice',
    quirk: 'His voice is a weapon, and he will demo it',
    power: 2, speed: 4, weight: 1.0,
    skin: '#f0c49b', hair: '#f2d98a', hairStyle: 'pompadour',
    suit: '#2b2f3d', suit2: '#ffd166', accent: '#ffd166', shades: true,
    special: { kind: 'sonic', name: 'VOICE PRESSURE', dmg: 65, width: 460, stun: 0.9, startup: 0.16 },
    super: { kind: 'sonic', name: 'HUNDRED DECIBEL BOMB', dmg: 180, width: 900, stun: 2.1, startup: 0.3, unblockable: true },
  },
  {
    id: 'midnight', name: 'MIDNIGHT', tag: 'Rope Whip',
    quirk: 'Corporate hostage expert, pro wrestler, rope enthusiast',
    power: 3, speed: 4, weight: 1.0,
    skin: '#e8c0a0', hair: '#3a2f4a', hairStyle: 'bob',
    suit: '#1f1a2b', suit2: '#6a3f8a', accent: '#c9a227', cape: '#6a3f8a', mask: true,
    special: { kind: 'whip', name: 'ROPE WHIP', dmg: 75, range: 320, startup: 0.2 },
    super: { kind: 'bind', name: 'CORN DOG BIND', dmg: 110, range: 380, startup: 0.28, dur: 3 },
  },
];

// ---------------------------------------------------------------- moves

const BASIC_LIGHT = {
  startup: 0.07, active: 0.07, recovery: 0.15,
  dmg: 42, hitstun: 0.3, blockstun: 0.16, kb: 90, kbY: 0,
  reach: 78, h: 'mid', guard: 'all', meter: 4, sfx: 'light',
};
const BASIC_HEAVY = {
  startup: 0.15, active: 0.09, recovery: 0.28,
  dmg: 92, hitstun: 0.44, blockstun: 0.24, kb: 210, kbY: 130,
  reach: 96, h: 'mid', guard: 'all', meter: 8, sfx: 'heavy',
};
const CROUCH_LIGHT = {
  ...BASIC_LIGHT, dmg: 34, reach: 70, h: 'low', startup: 0.06, recovery: 0.13, meter: 3,
};

// moves that carry their own hitbox (everything else applies its effect directly)
const DIRECT_HITBOX = new Set([undefined, 'lunge', 'barrage', 'teleport', 'armor']);

function moveFromSpecial(sp, isSuper) {
  const p = sp;
  const base = {
    startup: p.startup ?? 0.2,
    active: p.active ?? 0.1,
    recovery: p.recovery ?? (isSuper ? 0.42 : 0.32),
    dmg: p.dmg ?? 100,
    hitstun: p.hitstun ?? (isSuper ? 0.7 : 0.5),
    blockstun: p.blockstun ?? 0.24,
    kb: p.kb ?? 220,
    kbY: p.kbY ?? 120,
    reach: p.reach ?? 100,
    h: p.h ?? 'mid',
    guard: p.unblockable ? 'unblockable' : 'all',
    meter: isSuper ? 0 : 12,
    kind: p.kind,
    params: p,
    super: isSuper,
    sfx: isSuper ? 'super' : 'special',
  };
  if (p.armor) base.armor = p.armor;
  return base;
}

// ---------------------------------------------------------------- fighter

class Fighter {
  constructor(def, side) {
    this.def = def;
    this.side = side;                 // 0 = LETTERS, 1 = NUMBERS
    this.name = def.name;
    this.x = side === 0 ? 320 : 640;
    this.y = FLOOR;
    this.vx = 0;
    this.vy = 0;
    this.facing = side === 0 ? 1 : -1;
    this.hp = MAX_HP;
    this.maxHp = MAX_HP;
    this.meter = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.attack = null;
    this.hitstun = 0;
    this.blockstun = 0;
    this.crouching = false;
    this.blocking = false;
    this.airborne = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.growT = 0;
    this.growMul = 1;
    this.dash = null;
    this.hop = 0;
    this.dead = false;
    this.wins = 0;
    this.input = { left: false, right: false, up: false, down: false, light: false, heavy: false, special: false, super: false };
    // attack buffer — a press is never eaten by hitstop or hitstun
    this.bufLight = 0;
    this.bufHeavy = 0;
    this.bufSpecial = 0;
    this.bufSuper = 0;
    this.status = { burn: 0, freeze: 0, slow: 0, bind: 0, dot: 0, armor: 0, stun: 0, dotTick: 0 };
    this.flash = 0;
    this.specialGlow = 0;
  }

  get growScale() { return this.growT > 0 ? this.growMul : 1; }
  get busy() { return this.state === 'attack' || this.hitstun > 0 || this.status.freeze > 0 || this.status.stun > 0; }
  get canAct() { return !this.busy && this.state !== 'ko' && this.state !== 'hurt' && this.state !== 'launched'; }

  hurtbox() {
    const s = this.growScale;
    const w = 21 * s;
    const h = (this.crouching ? CROUCH_H : FIGHTER_H) * s;
    return { l: this.x - w, r: this.x + w, t: this.y - h, b: this.y };
  }

  addMeter(v) {
    this.meter = clamp(this.meter + v, 0, 100);
  }

  startAttack(move) {
    this.state = 'attack';
    this.stateT = 0;
    this.attack = { move, t: 0, fired: false, hit: false, hits: 0, nextHit: 0 };
  }
}

// ---------------------------------------------------------------- the game

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new Particles(900);
    this.time = 0;
    this.shake = 0;
    this.state = 'select';
    this.stateT = 0;
    this.round = 1;
    this.wins = [0, 0];
    this.timer = ROUND_TIME;
    this.banner = null;
    this.bannerSub = '';
    this.fighters = null;
    this.projectiles = [];
    this.effects = [];
    this.meteors = [];
    this.flashWhite = 0;
    this.hitstop = 0;
    this.slowmo = 0;
    this.vsCpu = false;
    this.cpuLevel = 1;             // 0 easy, 1 normal, 2 hard
    this.pick = [
      { idx: 0, confirmed: false },
      { idx: 5, confirmed: false },
    ];
    this.pickT = 0;
    this.pickStartT = 0;
    this.cpu = null;
    this.lastResult = null;
  }

  // ------------------------------------------------------------ select
  startSelect() {
    this.state = 'select';
    this.stateT = 0;
    this.pick[0].confirmed = false;
    this.pick[1].confirmed = false;
    this.pick[0].idx = 0;
    this.pick[1].idx = 5;
  }

  updateSelect(dt, input) {
    this.pickT += dt;
    const p1 = input.p1, p2 = input.p2;

    if (!this.pick[0].confirmed) {
      if (p1.press('left')) { this.pick[0].idx = (this.pick[0].idx + 15) % 16; Sfx.sfxSelect(); }
      if (p1.press('right')) { this.pick[0].idx = (this.pick[0].idx + 1) % 16; Sfx.sfxSelect(); }
      if (p1.press('up')) { this.pick[0].idx = (this.pick[0].idx + 12) % 16; Sfx.sfxSelect(); }
      if (p1.press('down')) { this.pick[0].idx = (this.pick[0].idx + 4) % 16; Sfx.sfxSelect(); }
      if (p1.press('confirm')) {
        this.pick[0].confirmed = true;
        Sfx.sfxConfirm();
      }
    }

    if (!this.vsCpu && !this.pick[1].confirmed) {
      if (p2.press('left')) { this.pick[1].idx = (this.pick[1].idx + 15) % 16; Sfx.sfxSelect(); }
      if (p2.press('right')) { this.pick[1].idx = (this.pick[1].idx + 1) % 16; Sfx.sfxSelect(); }
      if (p2.press('up')) { this.pick[1].idx = (this.pick[1].idx + 12) % 16; Sfx.sfxSelect(); }
      if (p2.press('down')) { this.pick[1].idx = (this.pick[1].idx + 4) % 16; Sfx.sfxSelect(); }
      if (p2.press('confirm')) {
        this.pick[1].confirmed = true;
        Sfx.sfxConfirm();
      }
    }

    if (this.vsCpu && this.pick[0].confirmed) this.pickCpu();

    if (this.pick[0].confirmed && (this.pick[1].confirmed || this.vsCpu)) {
      if (!this.pickStartT) this.pickStartT = this.pickT;
      if (this.pickT - this.pickStartT > 1.1) {
        this.pickStartT = 0;
        this.startFight();
      }
    } else {
      this.pickStartT = 0;
    }
  }

  pickCpu() {
    // the CPU picks a rival it does not already face, after a short think
    if (this.pick[1].confirmed) return;
    if (this.pickT > 0.6 && Math.random() < 0.02) {
      let idx = randInt(0, 15);
      if (idx === this.pick[0].idx) idx = (idx + 1) % 16;
      this.pick[1].idx = idx;
      this.pick[1].confirmed = true;
      Sfx.sfxConfirm();
    }
  }

  // ------------------------------------------------------------ fight
  startFight() {
    const a = new Fighter(ROSTER[this.pick[0].idx], 0);
    const b = new Fighter(ROSTER[this.pick[1].idx], 1);
    this.fighters = [a, b];
    this.round = 1;
    this.wins = [0, 0];
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.meteors.length = 0;
    this.particles.clear();
    this.state = 'intro';
    this.stateT = 0;
    this.timer = ROUND_TIME;
    this.banner = { text: `ROUND ${this.round}`, sub: 'READY...', t: 0 };
    this.cpu = this.vsCpu ? new AI(b, a, this.cpuLevel) : null;
    if (this.cpu) this.cpu.fighter = b;
  }

  startRound(n) {
    this.round = n;
    this.timer = ROUND_TIME;
    this.projectiles.length = 0;
    this.effects.length = 0;
    this.meteors.length = 0;
    this.particles.clear();
    for (const f of this.fighters) {
      f.x = f.side === 0 ? 320 : 640;
      f.y = FLOOR;
      f.vx = 0; f.vy = 0;
      f.hp = MAX_HP;
      f.meter = 0;
      f.state = 'idle';
      f.attack = null;
      f.hitstun = 0;
      f.blockstun = 0;
      f.combo = 0;
      f.comboTimer = 0;
      f.growT = 0;
      f.growMul = 1;
      f.dead = false;
      f.dash = null;
      f.crouching = false;
      f.blocking = false;
      f.airborne = false;
      f.flash = 0;
      f.status = { burn: 0, freeze: 0, slow: 0, bind: 0, dot: 0, armor: 0, stun: 0, dotTick: 0 };
      f.facing = f.side === 0 ? 1 : -1;
    }
    this.state = 'intro';
    this.stateT = 0;
    this.banner = { text: `ROUND ${this.round}`, sub: 'READY...', t: 0 };
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 40);
    this.flashWhite = Math.max(0, this.flashWhite - dt * 3.2);

    if (this.state === 'select') { this.updateSelect(dt, input); return; }

    if (this.hitstop > 0) {
      this.hitstop -= dt;
      this.particles.update(dt * 0.25);
      return;
    }

    const scale = this.slowmo > 0 ? 0.35 : 1;
    this.slowmo = Math.max(0, this.slowmo - dt);
    const sdt = dt * scale;

    if (this.state === 'intro') {
      this.stateT += dt;
      if (this.stateT > 1.1) {
        this.state = 'fight';
        this.stateT = 0;
        this.banner = { text: 'FIGHT!', sub: this.fighters[0].name + ' vs ' + this.fighters[1].name, t: 0 };
        Sfx.sfxBell();
      }
    } else if (this.state === 'fight') {
      this.timer -= dt;
      this.updateFighters(sdt, input);
      this.updateProjectiles(sdt);
      this.updateMeteors(sdt);
      if (this.timer <= 0) { this.timer = 0; this.endRoundByTime(); }
    } else if (this.state === 'ko') {
      this.stateT += dt;
      this.updateFighters(sdt * 0.35, input);
      this.updateProjectiles(sdt * 0.35);
      if (this.stateT > 2.4) {
        const w = this.wins[0] >= ROUNDS_TO_WIN ? 0 : this.wins[1] >= ROUNDS_TO_WIN ? 1 : -1;
        if (w >= 0) this.endMatch(w);
        else this.startRound(this.round + 1);
      }
    }

    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 1.5) this.banner = null;
    }

    this.particles.update(dt);
    this.updateEffects(dt);
  }

  updateFighters(dt, input) {
    const [a, b] = this.fighters;
    if (this.cpu) this.cpu.update(dt);

    for (const f of this.fighters) {
      const opp = f === a ? b : a;
      this.updateFighter(f, opp, dt);
    }
    this.separateFighters(a, b);
  }

  separateFighters(a, b) {
    const dx = b.x - a.x;
    const minDist = 46;
    if (Math.abs(dx) < minDist) {
      const push = (minDist - Math.abs(dx)) / 2 * Math.sign(dx || 1);
      a.x -= push;
      b.x += push;
    }
    for (const f of this.fighters) {
      f.x = clamp(f.x, 40, W + 140);
    }
  }

  updateFighter(f, opp, dt) {
    const st = f.status;
    f.flash = Math.max(0, f.flash - dt);
    f.specialGlow = Math.max(0, f.specialGlow - dt);
    f.comboTimer = Math.max(0, f.comboTimer - dt);
    if (f.comboTimer <= 0) f.combo = 0;
    f.bufLight = Math.max(0, f.bufLight - dt);
    f.bufHeavy = Math.max(0, f.bufHeavy - dt);
    f.bufSpecial = Math.max(0, f.bufSpecial - dt);
    f.bufSuper = Math.max(0, f.bufSuper - dt);
    if (f.growT > 0) {
      f.growT -= dt;
      if (f.growT <= 0) f.growMul = 1;
    }

    // status ticks
    if (st.freeze > 0) st.freeze -= dt;
    if (st.stun > 0) st.stun -= dt;
    if (st.slow > 0) st.slow -= dt;
    if (st.bind > 0) st.bind -= dt;
    if (st.armor > 0) st.armor -= dt;
    if (st.burn > 0) {
      st.burn -= dt;
      st.dotTick += dt;
      if (st.dotTick > 0.5) {
        st.dotTick = 0;
        f.hp = Math.max(0, f.hp - 4);
        this.particles.add(f.x + rand(-14, 14), f.y - rand(30, 80), rand(-20, 20), rand(-60, -20), {
          type: 'spark', color: '#5ce6ff', size: rand(2, 4), life: 0.4,
        });
        if (f.hp <= 0) this.ko(f, opp);
      }
    }
    if (st.dot > 0) {
      st.dot -= dt;
      st.dotTick += dt;
      if (st.dotTick > 0.5) {
        st.dotTick = 0;
        f.hp = Math.max(0, f.hp - 11);
        this.particles.add(f.x + rand(-10, 10), f.y - rand(20, 70), rand(-14, 14), rand(-30, 10), {
          type: 'spark', color: '#9d7bff', size: rand(2, 5), life: 0.5,
        });
        if (f.hp <= 0) this.ko(f, opp);
      }
    }

    if (f.state === 'ko') {
      f.vy += GRAVITY * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.y > FLOOR) { f.y = FLOOR; f.vy = 0; f.vx *= 0.8; }
      return;
    }

    const frozen = st.freeze > 0 || st.stun > 0;
    const input = f.input;

    // --- face the opponent when free to move
    if (f.canAct && f.state !== 'attack') {
      const want = opp.x > f.x ? 1 : -1;
      f.facing = want;
    }

    // --- blocking: hold back while standing on the ground
    const away = opp.x > f.x ? 'left' : 'right';
    const holdingBack = input[away];
    f.blocking = false;
    if (f.canAct && !f.airborne && holdingBack) {
      f.blocking = true;
      f.crouching = !!input.down;
    } else if (f.canAct) {
      f.crouching = !!input.down;
    }
    if (f.state === 'attack' || f.hitstun > 0) { f.crouching = false; f.blocking = false; }

    // --- movement
    if (f.state === 'attack') {
      this.updateAttack(f, opp, dt);
    } else if (f.hitstun > 0) {
      f.hitstun -= dt;
      f.vx *= 0.86;
      f.x += f.vx * dt;
      if (f.hitstun <= 0 && f.state === 'hurt') f.state = 'idle';
    } else if (!frozen) {
      const speedMul = (1 - (st.slow > 0 ? 0.45 : 0)) * (st.bind > 0 ? 0.2 : 1);
      const base = WALK_SPEED * (0.72 + f.def.speed * 0.11) * speedMul;
      let vx = 0;
      if (input.left) vx -= base;
      if (input.right) vx += base;
      if (f.crouching) vx *= 0.42;
      f.vx = vx;
      f.x += vx * dt;

      // jump
      if (input.up && !f.airborne && !f.crouching) {
        f.vy = -JUMP_V * (0.9 + f.def.speed * 0.03);
        f.airborne = true;
        f.state = 'jump';
        f.y = FLOOR - 1;
      }
    }

    // --- attacks (reads the buffer, so a press during hitstop still lands)
    if (f.canAct && !frozen) {
      if (f.bufSuper > 0 && f.meter >= 100) {
        f.bufSuper = 0; f.meter = 0;
        this.startSpecial(f, true);
      } else if (f.bufSpecial > 0) {
        f.bufSpecial = 0;
        this.startSpecial(f, false);
      } else if (f.bufHeavy > 0) {
        f.bufHeavy = 0;
        this.startBasic(f, BASIC_HEAVY);
      } else if (f.bufLight > 0) {
        f.bufLight = 0;
        this.startBasic(f, f.crouching ? CROUCH_LIGHT : BASIC_LIGHT);
      }
    }

    // --- physics
    if (f.airborne || f.y < FLOOR) {
      f.vy += GRAVITY * dt;
      f.y += f.vy * dt;
      if (f.y >= FLOOR) {
        f.y = FLOOR;
        f.vy = 0;
        f.airborne = false;
        if (f.state === 'jump' || f.state === 'launched') f.state = 'idle';
        this.particles.add(f.x, FLOOR, rand(-40, 40), rand(-50, -10), { type: 'dirt', color: '#8d8d99', size: rand(2, 5), life: 0.4 });
      }
    } else {
      f.y = FLOOR;
      f.vy = 0;
      f.airborne = false;
      if (f.state === 'jump' || f.state === 'launched') f.state = 'idle';
    }
    f.x += f.vx * dt * (f.state === 'attack' ? 0.35 : 1);
    if (f.dash) {
      f.dash.t -= dt;
      f.x += f.dash.v * dt;
      if (f.dash.t <= 0) f.dash = null;
    }
    f.x = clamp(f.x, 30, W + 170);
  }

  startBasic(f, move) {
    f.startAttack({ ...move });
    f.addMeter(0);
    f.specialGlow = 0.12;
    if (move.sfx === 'heavy') Sfx.sfxHeavy();
    else Sfx.sfxPunch();
  }

  startSpecial(f, isSuper) {
    const src = isSuper ? f.def.super : f.def.special;
    const move = moveFromSpecial(src, isSuper);
    f.startAttack(move);
    f.specialGlow = 0.5;
    if (isSuper) {
      this.flashWhite = 0.55;
      this.shake = 8;
      Sfx.sfxSuper();
      this.banner = { text: 'SUPER!', sub: f.name + ' — ' + src.name, t: 0 };
    } else {
      Sfx.sfxSpecial();
    }
  }

  updateAttack(f, opp, dt) {
    const a = f.attack;
    if (!a) { f.state = 'idle'; return; }
    const m = a.move;
    a.t += dt;

    if (!a.fired && a.t >= m.startup) {
      a.fired = true;
      this.fireMove(f, opp, m);
    }

    if (a.t >= m.startup && a.t < m.startup + m.active) {
      if (DIRECT_HITBOX.has(m.kind)) this.checkHit(f, opp, m, a);
    }

    if (a.t >= m.startup + m.active + m.recovery) {
      f.attack = null;
      f.state = 'idle';
      f.blocking = false;
    }
  }

  fireMove(f, opp, m) {
    const p = m.params;
    const dir = f.facing;
    f.specialGlow = 0.45;

    switch (m.kind) {
      case 'lunge': {
        const dist = p.dist ?? 200;
        const dur = m.startup + m.active;
        f.dash = { v: dir * dist / dur, t: dur };
        f.vx = dir * 60;
        this.effect('dust', f.x, FLOOR, { dir });
        break;
      }
      case 'barrage': {
        break;
      }
      case 'blast':
      case 'projectile': {
        const el = p.element || 'blast';
        this.projectiles.push({
          x: f.x + dir * 46, y: f.y - 62, vx: dir * (p.speed ?? 500), vy: 0,
          r: p.radius ?? 26, dmg: m.dmg, owner: f.side, dir,
          element: el, life: 2.2, kb: m.kb, kbY: p.kbY ?? m.kbY,
          freeze: p.freeze ?? 0, burn: p.burn ?? 0, guard: m.guard,
          hitstun: m.hitstun, big: !!p.big, trail: [],
        });
        Sfx.sfxCharge(p.element);
        break;
      }
      case 'aoe': {
        const radius = p.radius ?? 150;
        this.effect('shock', f.x, FLOOR, { radius, color: '#9d7bff' });
        this.shake = 10;
        this.particles.explosion(f.x, FLOOR, radius * 0.5, '#9d7bff', 0.8);
        Sfx.sfxExplosion(0.9);
        const d = Math.abs(opp.x - f.x);
        if (d < radius && Math.abs(opp.y - f.y) < 120) {
          this.applyHit(f, opp, m, { dir: Math.sign(opp.x - f.x) || dir, height: 'low' });
        }
        break;
      }
      case 'lift': {
        const range = p.range ?? 150;
        if (Math.abs(opp.x - f.x) < range) {
          opp.vy = -820;
          opp.airborne = true;
          opp.state = 'launched';
          opp.hitstun = 0;
          this.applyHit(f, opp, { ...m, dmg: p.dmg ?? m.dmg, kb: 0, kbY: 0 }, { dir: dir, height: 'mid' });
          this.effect('grav', opp.x, opp.y, { dur: 0.9 });
          Sfx.sfxSpecial();
        } else {
          Sfx.sfxWhiff();
        }
        break;
      }
      case 'heal': {
        const heal = p.heal ?? 150;
        f.hp = Math.min(f.maxHp, f.hp + heal);
        f.vy = -420;
        f.airborne = true;
        f.state = 'jump';
        this.effect('heal', f.x, f.y - 50, { dur: 0.7, heal });
        for (let i = 0; i < 26; i++) {
          this.particles.add(f.x + rand(-24, 24), f.y - rand(0, 90), rand(-18, 18), rand(-90, -30), {
            type: 'spark', color: '#8de04a', size: rand(2, 4.5), life: rand(0.4, 0.9),
          });
        }
        Sfx.sfxHeal();
        break;
      }
      case 'armor': {
        f.status.armor = p.dur ?? 2;
        f.hitstun = 0;
        this.effect('armor', f.x, f.y - 50, { dur: 0.5 });
        Sfx.sfxArmor();
        break;
      }
      case 'teleport': {
        this.effect('shadow', f.x, f.y - 50, { dur: 0.4, color: '#241c2e' });
        f.x = opp.x - dir * 90;
        this.effect('shadow', f.x, f.y - 50, { dur: 0.4, color: '#241c2e' });
        break;
      }
      case 'grow': {
        f.growT = p.dur ?? 8;
        f.growMul = p.mul ?? 1.5;
        this.effect('grow', f.x, f.y, { dur: 0.6 });
        Sfx.sfxGrow();
        break;
      }
      case 'sonic': {
        const width = p.width ?? 400;
        this.effect('sonic', f.x + dir * 50, f.y - 70, { width, dur: 0.5, dir });
        this.shake = 7;
        Sfx.sfxSonic();
        const d = Math.abs(opp.x - f.x);
        if (d < width) {
          this.applyHit(f, opp, m, { dir, height: 'mid' });
          opp.status.stun = Math.max(opp.status.stun, p.stun ?? 0.8);
        }
        break;
      }
      case 'whip': {
        const range = p.range ?? 300;
        this.effect('whip', f.x, f.y - 60, { range, dur: 0.3, dir });
        if (Math.abs(opp.x - f.x) < range) {
          this.applyHit(f, opp, m, { dir: dir, height: 'mid' });
          opp.x = f.x + dir * 90;
          opp.vx = dir * 260;
        }
        Sfx.sfxWhip();
        break;
      }
      case 'bind': {
        const range = p.range ?? 340;
        this.effect('whip', f.x, f.y - 60, { range, dur: 0.4, dir, color: '#c9a227' });
        if (Math.abs(opp.x - f.x) < range) {
          this.applyHit(f, opp, m, { dir, height: 'mid' });
          opp.status.bind = p.dur ?? 3;
          opp.status.slow = p.dur ?? 3;
        }
        Sfx.sfxWhip();
        break;
      }
      case 'debuff': {
        this.effect('ring', f.x, f.y - 50, { dur: 0.5, color: '#7fd4ff' });
        if (Math.abs(opp.x - f.x) < 150) {
          this.applyHit(f, opp, m, { dir, height: 'mid' });
          opp.status.slow = Math.max(opp.status.slow, p.dur ?? 3);
        }
        Sfx.sfxSpecial();
        break;
      }
      case 'dot': {
        const range = p.range ?? 140;
        this.effect('rot', f.x + dir * 50, f.y - 60, { dur: 0.4, range, color: '#9d7bff' });
        if (Math.abs(opp.x - f.x) < range) {
          this.applyHit(f, opp, m, { dir, height: 'mid' });
          opp.status.dot = Math.max(opp.status.dot, p.dur ?? 4);
        }
        Sfx.sfxSpecial();
        break;
      }
      case 'meteor': {
        for (let i = 0; i < 7; i++) {
          this.meteors.push({
            x: opp.x + rand(-320, 320), y: -60 - i * 40, vy: 380 + i * 20,
            dmg: Math.round(m.dmg / 7) + 12, owner: f.side, t: 0,
          });
        }
        Sfx.sfxMeteor();
        break;
      }
      case 'steal': {
        if (Math.abs(opp.x - f.x) < 150) {
          this.applyHit(f, opp, m, { dir, height: 'mid' });
          const stolen = Math.min(30, opp.meter);
          opp.meter -= stolen;
          f.addMeter(stolen);
          this.effect('steal', opp.x, opp.y - 70, { dur: 0.5 });
        }
        break;
      }
      default:
        break;
    }
  }

  // ------------------------------------------------------------ hit logic
  hitBox(f, m) {
    const s = f.growScale;
    const reach = m.reach * s;
    const dir = f.facing;
    const left = dir > 0 ? f.x + 10 : f.x - 10 - reach;
    let top, bottom;
    if (m.h === 'high') { top = f.y - FIGHTER_H * s + 6; bottom = f.y - FIGHTER_H * s + 46; }
    else if (m.h === 'low') { top = f.y - 50 * s; bottom = f.y - 4; }
    else { top = f.y - 96 * s; bottom = f.y - 26 * s; }
    return { l: left, r: left + reach, t: top, b: bottom };
  }

  checkHit(f, opp, m, a) {
    if (a.hit) return;
    if (m.kind === 'barrage' && a.t < a.nextHit) return;
    const box = this.hitBox(f, m);
    const hb = opp.hurtbox();
    if (box.r < hb.l || box.l > hb.r || box.b < hb.t || box.t > hb.b) return;
    // height rules: a standing fighter dodges lows, a crouching one dodges highs
    if (m.h === 'high' && opp.crouching) return;
    if (m.h === 'low' && !opp.crouching) return;
    a.hit = true;
    this.applyHit(f, opp, m, { dir: f.facing, height: m.h });
    if (m.kind === 'barrage') {
      a.hits++;
      a.hit = false;
      a.nextHit = a.t + 0.11;
    }
  }

  applyHit(attacker, victim, m, opts = {}) {
    const dir = opts.dir ?? attacker.facing;
    const height = opts.height ?? 'mid';
    const blocked = victim.blocking && m.guard !== 'unblockable' && this.blockCovers(victim, height);

    if (blocked) {
      const chip = Math.round(m.dmg * 0.12);
      victim.hp = Math.max(0, victim.hp - chip);
      victim.blockstun = m.blockstun ?? 0.2;
      victim.vx = dir * (m.kb ?? 120) * 0.5;
      victim.x += victim.vx * 0.016;
      attacker.addMeter(3);
      victim.addMeter(6);
      this.particles.add(victim.x - dir * 20, victim.y - 60, rand(-60, 60), rand(-60, 10), {
        type: 'spark', color: '#9fd8ff', size: rand(2, 4), life: 0.3,
      });
      this.effect('block', victim.x - dir * 22, victim.y - 60, { dur: 0.22 });
      this.shake = Math.max(this.shake, 4);
      this.hitstop = 0.05;
      Sfx.sfxBlock();
      if (victim.hp <= 0) this.ko(attacker, victim);
      return;
    }

    const armored = victim.status.armor > 0 && m.guard !== 'unblockable';
    const dmg = Math.round(m.dmg * (attacker.growScale > 1 ? 1 + (attacker.growScale - 1) * 0.8 : 1));

    if (armored) {
      victim.hp = Math.max(0, victim.hp - Math.round(dmg * 0.25));
      victim.hitstun = Math.max(victim.hitstun, 0.12);
      victim.status.armor = Math.max(0, victim.status.armor - 0.4);
      this.effect('armorhit', victim.x, victim.y - 55, { dur: 0.3 });
      this.shake = Math.max(this.shake, 7);
      this.hitstop = 0.07;
      Sfx.sfxArmorHit();
      attacker.addMeter(5);
      victim.addMeter(6);
      if (victim.hp <= 0) this.ko(attacker, victim);
      return;
    }

    victim.hp = Math.max(0, victim.hp - dmg);
    victim.flash = 0.16;
    victim.hitstun = m.hitstun ?? 0.4;
    victim.blockstun = 0;
    victim.attack = null;
    victim.state = 'hurt';
    victim.vx = dir * (m.kb ?? 180) * (victim.def.weight > 1.2 ? 0.72 : 1);
    victim.vy = -(m.kbY ?? 0);
    if (m.kbY > 0) { victim.airborne = true; victim.y -= 1; }
    victim.x += victim.vx * 0.016;

    attacker.combo += 1;
    attacker.comboTimer = 1.5;
    victim.combo = 0;
    victim.comboTimer = 0;

    attacker.addMeter(m.meter || 5);
    victim.addMeter(Math.round(dmg * 0.09));

    this.hitstop = m.super ? 0.16 : 0.07;
    this.shake = Math.max(this.shake, m.super ? 16 : 9);
    this.slowmo = m.super ? 0.35 : 0;

    const hx = victim.x - dir * 16;
    const hy = victim.y - (height === 'low' ? 26 : 62);
    this.particles.add(hx, hy, rand(-90, 90), rand(-120, -10), { type: 'spark', color: '#fff3c4', size: rand(3, 6), life: 0.25 });
    this.particles.add(hx, hy, rand(-140, 140), rand(-160, -30), { type: 'spark', color: '#ff6b35', size: rand(2, 5), life: 0.3 });
    this.effect('hit', hx, hy, { dur: 0.2, big: !!m.super });
    Sfx.sfxHit(m.super ? 1.6 : 1);

    if (victim.hp <= 0) this.ko(attacker, victim);
  }

  blockCovers(victim, height) {
    // standing block covers mid + high, crouching block covers low + mid
    if (victim.crouching) return height === 'low' || height === 'mid';
    return height === 'mid' || height === 'high';
  }

  ko(loser, winner) {
    if (loser.state === 'ko') return;
    loser.state = 'ko';
    loser.dead = true;
    loser.hp = 0;
    loser.vy = -360;
    loser.vx = (winner ? Math.sign(loser.x - winner.x) : 1) * 150;
    this.state = 'ko';
    this.stateT = 0;
    this.slowmo = 1.2;
    this.shake = 18;
    const w = winner ? winner.side : 0;
    this.banner = { text: 'K.O.!', sub: this.fighters[w].name + ' takes the round', t: 0 };
    this.wins[w]++;
    this.particles.confetti(loser.x, loser.y - 40, 40);
    Sfx.sfxKO();
  }

  endRoundByTime() {
    const [a, b] = this.fighters;
    const w = a.hp === b.hp ? -1 : (a.hp > b.hp ? 0 : 1);
    if (w >= 0) {
      this.wins[w]++;
      this.banner = { text: 'TIME UP', sub: this.fighters[w].name + ' wins on health', t: 0 };
    } else {
      this.banner = { text: 'DRAW', sub: 'nobody wins, rematch?', t: 0 };
    }
    this.state = 'ko';
    this.stateT = 0;
    Sfx.sfxBell();
  }

  endMatch(winner) {
    this.state = 'over';
    this.lastResult = {
      winner,
      name: this.fighters[winner].name,
      a: this.fighters[0].name,
      b: this.fighters[1].name,
      wins: [...this.wins],
    };
    Sfx.sfxWin();
  }

  // ------------------------------------------------------------ projectiles
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 10) p.trail.shift();

      const owner = this.fighters[p.owner];
      const victim = this.fighters[1 - p.owner];
      let hit = false;
      if (victim.state !== 'ko') {
        const hb = victim.hurtbox();
        if (p.x + p.r > hb.l && p.x - p.r < hb.r && p.y + p.r > hb.t && p.y - p.r < hb.b) {
          if (!(p.element === 'fire' && victim.crouching && false)) hit = true;
        }
      }
      if (hit) {
        const dir = Math.sign(p.vx) || 1;
        this.applyHit(owner, victim, {
          dmg: p.dmg, kb: p.kb, kbY: p.kbY, hitstun: p.hitstun, guard: p.guard, super: p.big,
        }, { dir, height: 'mid' });
        if (p.freeze) {
          victim.status.freeze = Math.max(victim.status.freeze, p.freeze);
          this.effect('freeze', victim.x, victim.y - 50, { dur: 0.6 });
        }
        if (p.burn) {
          victim.status.burn = Math.max(victim.status.burn, p.burn);
          this.effect('burn', victim.x, victim.y - 50, { dur: 0.6 });
        }
        this.particles.explosion(p.x, p.y, p.r * 1.2, p.element === 'ice' ? '#7fd4ff' : p.element === 'fire' ? '#ff7a2f' : '#ffd166', 0.7);
        this.shake = Math.max(this.shake, p.big ? 16 : 7);
        this.hitstop = p.big ? 0.14 : 0.06;
        Sfx.sfxExplosion(p.big ? 1.5 : 0.8);
        this.projectiles.splice(i, 1);
        continue;
      }
      if (p.life <= 0 || p.x < -80 || p.x > W + 260) {
        this.particles.explosion(p.x, p.y, p.r * 0.7, '#8d8d99', 0.4);
        this.projectiles.splice(i, 1);
      }
    }
  }

  updateMeteors(dt) {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      m.y += m.vy * dt;
      const owner = this.fighters[m.owner];
      const victim = this.fighters[1 - m.owner];
      if (m.y >= FLOOR) {
        this.particles.explosion(m.x, FLOOR, 60, '#9d7bff', 1);
        this.effect('shock', m.x, FLOOR, { radius: 130, color: '#9d7bff' });
        this.shake = Math.max(this.shake, 9);
        Sfx.sfxExplosion(1);
        if (victim && victim.state !== 'ko' && Math.abs(victim.x - m.x) < 110) {
          this.applyHit(owner, victim, { dmg: m.dmg, kb: 240, kbY: 340, hitstun: 0.5, guard: 'all', super: true },
            { dir: Math.sign(victim.x - m.x) || 1, height: 'mid' });
        }
        this.meteors.splice(i, 1);
        continue;
      }
      if (Math.random() < 0.6) {
        this.particles.add(m.x + rand(-8, 8), m.y - 20, rand(-20, 20), rand(-120, -40), {
          type: 'spark', color: '#9d7bff', size: rand(3, 7), life: 0.4,
        });
      }
    }
  }

  // ------------------------------------------------------------ effects
  effect(type, x, y, opts = {}) {
    this.effects.push({ type, x, y, t: 0, life: opts.dur ?? 0.4, ...opts });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      if (e.t >= e.life) this.effects.splice(i, 1);
    }
  }

  // ------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (this.state === 'select') { this.renderSelect(ctx); return; }

    const shakeX = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const shakeY = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    drawArena(ctx, this.round, this.time);

    // effects behind fighters
    for (const e of this.effects) this.drawEffect(ctx, e, true);
    for (const p of this.projectiles) this.drawProjectile(ctx, p);
    for (const m of this.meteors) this.drawMeteor(ctx, m);

    // fighters, hurt one first so the winner is on top
    const [a, b] = this.fighters;
    const order = a.y <= b.y ? [a, b] : [b, a];
    for (const f of order) drawFighter(ctx, f, this.time);

    this.particles.draw(ctx, 'back');
    for (const e of this.effects) this.drawEffect(ctx, e, false);
    this.particles.draw(ctx, 'front');

    ctx.restore();

    this.renderHud(ctx);

    if (this.flashWhite > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashWhite * 0.55})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawProjectile(ctx, p) {
    ctx.save();
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const k = i / p.trail.length;
      ctx.globalAlpha = k * 0.4;
      ctx.fillStyle = p.element === 'ice' ? '#7fd4ff' : p.element === 'fire' ? '#ff7a2f' : '#ffd166';
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.r * 0.5 * k, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    const col = p.element === 'ice' ? '#7fd4ff' : p.element === 'fire' ? '#ff7a2f' : p.element === 'blast' ? '#ff8a3d' : '#9d7bff';
    ctx.shadowColor = col;
    ctx.shadowBlur = 22;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath();
    ctx.arc(p.x - p.r * 0.25, p.y - p.r * 0.25, p.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawMeteor(ctx, m) {
    ctx.save();
    ctx.shadowColor = '#9d7bff';
    ctx.shadowBlur = 20;
    ctx.fillStyle = '#4a3f66';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 16, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(m.x, m.y, 7, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  drawEffect(ctx, e, behind) {
    const k = Math.min(1, e.t / e.life);
    ctx.save();
    switch (e.type) {
      case 'hit': {
        if (behind) break;
        const r = (e.big ? 60 : 34) * (0.4 + k * 0.9);
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#fff3c4';
        ctx.lineWidth = 4 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(e.x, e.y, r * 0.55, 0, TAU);
        ctx.fill();
        break;
      }
      case 'block': {
        if (behind) break;
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = '#9fd8ff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 24 + k * 12, -0.9, 0.9);
        ctx.stroke();
        break;
      }
      case 'shock': {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = e.color || '#9d7bff';
        ctx.lineWidth = 7 * (1 - k) + 1;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.radius * k, e.radius * 0.32 * k, 0, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = (1 - k) * 0.3;
        ctx.fillStyle = e.color || '#9d7bff';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, e.radius * k, e.radius * 0.32 * k, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'sonic': {
        ctx.globalAlpha = (1 - k) * 0.55;
        const col = '#ffd166';
        for (let i = 0; i < 3; i++) {
          const kk = Math.max(0, k - i * 0.16);
          ctx.strokeStyle = col;
          ctx.lineWidth = 5 - i;
          ctx.beginPath();
          ctx.ellipse(e.x, e.y, e.width * kk * 0.5, 70 * kk, 0, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'whip': {
        ctx.globalAlpha = 1 - k;
        ctx.strokeStyle = e.color || '#c9a227';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.quadraticCurveTo(e.x + e.dir * e.range * 0.5, e.y - 40, e.x + e.dir * e.range * k, e.y - 10);
        ctx.stroke();
        break;
      }
      case 'heal': {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.fillStyle = '#8de04a';
        ctx.font = '700 22px "Comic Sans MS", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('+' + Math.round(e.heal || 0), e.x, e.y - 30 - k * 30);
        break;
      }
      case 'grav': {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = '#f27da4';
        ctx.lineWidth = 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.ellipse(e.x, e.y - 40 - k * 60, 40 - i * 10, 16 - i * 4, 0, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'shadow': {
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.fillStyle = e.color || '#241c2e';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 26, 44, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'armor':
      case 'armorhit': {
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.strokeStyle = e.type === 'armor' ? '#ffb703' : '#fff3c4';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 40 + k * 20, 62 + k * 12, 0, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'burn': {
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.fillStyle = '#ff7a2f';
        ctx.beginPath();
        ctx.arc(e.x, e.y, 34 * (1 - k) + 8, 0, TAU);
        ctx.fill();
        break;
      }
      case 'freeze': {
        ctx.globalAlpha = (1 - k) * 0.75;
        ctx.fillStyle = 'rgba(180,235,255,0.8)';
        ctx.beginPath();
        ctx.ellipse(e.x, e.y, 30, 50, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'rot': {
        ctx.globalAlpha = (1 - k) * 0.7;
        ctx.strokeStyle = e.color || '#9d7bff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.range * k, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'ring': {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = e.color || '#7fd4ff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 20 + k * 50, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'steal': {
        ctx.globalAlpha = (1 - k) * 0.8;
        ctx.strokeStyle = '#9d7bff';
        ctx.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
          const a = this.time * 6 + i * 1.57;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, 5, 0, TAU);
          ctx.stroke();
        }
        break;
      }
      case 'grow': {
        ctx.globalAlpha = (1 - k) * 0.6;
        ctx.strokeStyle = '#f05a7a';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(e.x, e.y - 40, 30 + k * 60, 60 + k * 60, 0, 0, TAU);
        ctx.stroke();
        break;
      }
      case 'dust': {
        ctx.globalAlpha = (1 - k) * 0.5;
        ctx.fillStyle = '#c9c9d6';
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(e.x - e.dir * (10 + i * 18 * k), FLOOR - rand(0, 16), 8 * (1 - k) + 3, 0, TAU);
          ctx.fill();
        }
        break;
      }
      default: break;
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ hud
  renderHud(ctx) {
    const [a, b] = this.fighters;
    drawHealthBar(ctx, a, 14, 30, 1, this.time);
    drawHealthBar(ctx, b, W - 14, 30, -1, this.time);

    // round pips
    for (let i = 0; i < 2; i++) {
      for (let r = 0; r < ROUNDS_TO_WIN; r++) {
        const x = i === 0 ? 30 + r * 20 : W - 30 - r * 20;
        ctx.beginPath();
        ctx.arc(x, 78, 6, 0, TAU);
        ctx.fillStyle = this.wins[i] > r ? (i === 0 ? '#ff8a3d' : '#45c8ff') : 'rgba(255,255,255,0.18)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#000';
        ctx.stroke();
      }
    }

    // timer
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 34px "Comic Sans MS", system-ui, sans-serif';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#000';
    const t = Math.ceil(this.timer);
    ctx.strokeText(String(t).padStart(2, '0'), W / 2, 40);
    ctx.fillStyle = t <= 10 ? '#ff5a5a' : '#ffd166';
    ctx.fillText(String(t).padStart(2, '0'), W / 2, 40);
    ctx.restore();

    // combo counters
    for (const f of this.fighters) {
      if (f.combo > 1 && f.comboTimer > 0) {
        ctx.save();
        ctx.textAlign = f.side === 0 ? 'left' : 'right';
        const x = f.side === 0 ? 20 : W - 20;
        ctx.font = '700 22px "Comic Sans MS", system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeStyle = '#000';
        ctx.strokeText(`${f.combo} HIT COMBO!`, x, 100);
        ctx.fillStyle = f.side === 0 ? '#ff8a3d' : '#45c8ff';
        ctx.fillText(`${f.combo} HIT COMBO!`, x, 100);
        ctx.restore();
      }
    }

    if (this.banner) {
      const b = this.banner;
      const k = Math.min(1, b.t / 0.25);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, k);
      const big = b.text.length > 8;
      ctx.font = `700 ${big ? 40 : 62}px "Comic Sans MS", system-ui, sans-serif`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000';
      ctx.strokeText(b.text, W / 2, H / 2 - 30);
      ctx.fillStyle = b.text === 'K.O.!' ? '#ff4d4d' : '#ffd166';
      ctx.fillText(b.text, W / 2, H / 2 - 30);
      if (b.sub) {
        ctx.font = '700 18px "Comic Sans MS", system-ui, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeText(b.sub, W / 2, H / 2 + 4);
        ctx.fillStyle = '#fff';
        ctx.fillText(b.sub, W / 2, H / 2 + 4);
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------ select screen
  renderSelect(ctx) {
    // backdrop
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1b2145');
    g.addColorStop(1, '#0a0c18');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalAlpha = 0.12;
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = i % 2 ? '#ffd166' : '#45c8ff';
      const x = (i * 137) % W;
      const y = (i * 91) % H;
      ctx.fillRect(x, y, 3, 3);
    }
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.font = '700 30px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('CHOOSE YOUR HERO', W / 2, 44);
    ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('TEAM LETTERS  vs  TEAM NUMBERS', W / 2, 64);

    // grid
    const cols = 4, rows = 4;
    const cw = 112, ch = 86, gap = 8;
    const gw = cols * cw + (cols - 1) * gap;
    const gh = rows * ch + (rows - 1) * gap;
    const gx = (W - gw) / 2;
    const gy = 86;

    for (let i = 0; i < 16; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const x = gx + c * (cw + gap);
      const y = gy + r * (ch + gap);
      const def = ROSTER[i];
      const chosen0 = this.pick[0].idx === i;
      const chosen1 = this.pick[1].idx === i;

      ctx.save();
      roundRect(ctx, x, y, cw, ch, 8);
      const grad = ctx.createLinearGradient(x, y, x, y + ch);
      grad.addColorStop(0, shade(def.suit, 0.12));
      grad.addColorStop(1, shade(def.suit, -0.45));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = chosen0 ? '#ff8a3d' : chosen1 ? '#45c8ff' : '#000';
      ctx.stroke();
      ctx.clip();

      // mini portrait
      ctx.save();
      ctx.translate(x + cw / 2, y + ch - 32);
      const s = 0.92;
      ctx.scale(s, s);
      drawHead(ctx, def, 0, 0, 1);
      ctx.restore();

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(x, y + ch - 19, cw, 19);
      ctx.font = '700 10px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(def.name, x + cw / 2, y + ch - 6);
      ctx.restore();

      // cursors
      if (this.pick[0].idx === i) {
        ctx.save();
        ctx.strokeStyle = '#ff8a3d';
        ctx.lineWidth = 4;
        ctx.strokeRect(x - 3, y - 3, cw + 6, ch + 6);
        ctx.restore();
      }
      if (this.pick[1].idx === i && !this.vsCpu) {
        ctx.save();
        ctx.strokeStyle = '#45c8ff';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(x - 7, y - 7, cw + 14, ch + 14);
        ctx.restore();
      }
    }

    // side panels
    this.renderSidePanel(ctx, 0, 108, '#ff8a3d', 'TEAM LETTERS', 'P1');
    this.renderSidePanel(ctx, 1, W - 108, '#45c8ff', 'TEAM NUMBERS', 'P2');

    // footer hints
    ctx.font = '700 12px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.textAlign = 'left';
    ctx.fillText('P1  W A S D move · F confirm', 14, H - 26);
    ctx.textAlign = 'right';
    ctx.fillText(this.vsCpu ? 'P2  → CPU' : 'P2  ARROWS move · J confirm', W - 14, H - 26);
    ctx.textAlign = 'center';
    ctx.fillStyle = this.vsCpu ? '#8de04a' : 'rgba(255,255,255,0.45)';
    ctx.fillText(this.vsCpu
      ? `VS CPU — ${['EASY', 'NORMAL', 'HARD'][this.cpuLevel]}  (C toggle · V difficulty)`
      : 'C toggle VS CPU  ·  V difficulty', W / 2, H - 26);
  }

  renderSidePanel(ctx, side, x, color, label, tag) {
    const p = this.pick[side];
    const def = ROSTER[p.idx];
    ctx.save();
    roundRect(ctx, x, 108, 96, 250, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.globalAlpha = p.confirmed ? 1 : 0.65;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = '700 12px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(label, x + 48, 126);
    ctx.font = '700 10px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(tag, x + 48, 140);

    // big portrait
    ctx.save();
    ctx.translate(x + 48, 196);
    drawHead(ctx, def, 0, 0, 2.1);
    ctx.restore();

    ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.fillText(def.name, x + 48, 246);
    ctx.font = '700 9px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(def.tag.toUpperCase(), x + 48, 260);

    // quirk line
    ctx.font = '9px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    wrapText(ctx, def.quirk, x + 10, 278, 76, 11);

    // stat bars
    const bar = (label2, val, yy, col) => {
      ctx.textAlign = 'left';
      ctx.font = '700 9px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(label2, x + 8, yy);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(x + 8, yy + 3, 80, 5);
      ctx.fillStyle = col;
      ctx.fillRect(x + 8, yy + 3, 80 * (val / 5), 5);
    };
    bar('PWR', def.power, 312, '#ff8a3d');
    bar('SPD', def.speed, 328, '#45c8ff');

    if (p.confirmed) {
      ctx.textAlign = 'center';
      ctx.font = '700 14px "Comic Sans MS", system-ui, sans-serif';
      ctx.fillStyle = '#8de04a';
      ctx.fillText('READY', x + 48, 350);
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------- CPU brain

class AI {
  constructor(fighter, opponent, level) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.level = level;
    this.cool = 0;
    this.react = 0;
    this.wantBlock = false;
    this.desired = 0;
  }

  update(dt) {
    const f = this.fighter;
    const o = this.opponent;
    const inp = f.input;
    for (const k in inp) inp[k] = false;

    if (this.cool > 0) this.cool -= dt;

    const dx = o.x - f.x;
    const adx = Math.abs(dx);
    const dir = Math.sign(dx) || 1;
    const lvl = this.level;

    // read the opponent's attack and decide to block
    const incoming = o.state === 'attack' && o.attack
      && o.attack.t > o.attack.move.startup * 0.5 && adx < 170;
    if (incoming && Math.random() < 0.02 + lvl * 0.05) this.wantBlock = true;
    if (this.wantBlock && (!incoming || Math.random() < 0.06)) this.wantBlock = false;

    if (this.wantBlock) {
      inp.left = dx > 0;
      inp.right = dx < 0;
      inp.down = Math.random() < 0.3;
      return;
    }

    // spacing: keep near the sweet spot for a poke
    const sweet = 90 + lvl * 10;
    if (adx > sweet) {
      inp.right = dx > 0;
      inp.left = dx < 0;
    } else if (adx < 48) {
      if (Math.random() < 0.02) { inp.left = dx > 0; inp.right = dx < 0; }
    }

    // jump in occasionally
    if (Math.random() < 0.004 + lvl * 0.003 && adx > 70 && adx < 260) inp.up = true;

    // attacks
    if (this.cool <= 0 && adx < 150) {
      const r = Math.random();
      if (r < 0.10 + lvl * 0.05) {
        inp.heavy = true;
        f.bufHeavy = 0.18;
        this.cool = 0.5 - lvl * 0.09;
      } else if (r < 0.42 + lvl * 0.1) {
        inp.light = true;
        f.bufLight = 0.18;
        this.cool = 0.28 - lvl * 0.05;
      } else if (r < 0.52 + lvl * 0.06 && f.meter >= 100) {
        inp.super = true;
        f.bufSuper = 0.18;
        this.cool = 1.6;
      } else if (r < 0.72 + lvl * 0.05 && f.meter >= 35) {
        inp.special = true;
        f.bufSpecial = 0.18;
        this.cool = 1.1 - lvl * 0.15;
      }
    }
  }
}

// ---------------------------------------------------------------- drawing

function drawHealthBar(ctx, f, x, y, dir, time) {
  const w = 330, h = 22;
  ctx.save();
  // frame
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 8);
  ctx.fill();

  const frac = clamp(f.hp / f.maxHp, 0, 1);
  const bx = dir > 0 ? x : x - w;
  ctx.fillStyle = '#2a1020';
  ctx.fillRect(bx, y, w, h);

  // health
  const hpCol = frac > 0.55 ? '#5ce65c' : frac > 0.25 ? '#ffb703' : '#ff4d4d';
  ctx.fillStyle = hpCol;
  ctx.fillRect(dir > 0 ? bx : bx + w * (1 - frac), y, w * frac, h);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(dir > 0 ? bx : bx + w * (1 - frac), y, w * frac, h * 0.35);

  // super meter
  const mw = w, mh = 8, my = y + h + 5;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(bx, my, mw, mh);
  const mfrac = f.meter / 100;
  const full = f.meter >= 100;
  ctx.fillStyle = full ? (Math.sin(time * 12) > 0 ? '#fff3c4' : '#ffd166') : '#7b61ff';
  ctx.fillRect(dir > 0 ? bx : bx + mw * (1 - mfrac), my, mw * mfrac, mh);
  if (full) {
    ctx.font = '700 9px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = dir > 0 ? 'left' : 'right';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('SUPER READY', dir > 0 ? bx : bx + mw, my + 18);
  }

  // name
  ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
  ctx.textAlign = dir > 0 ? 'left' : 'right';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000';
  const nameX = dir > 0 ? x : x + w;
  ctx.strokeText(f.name, nameX, y - 12);
  ctx.fillStyle = dir > 0 ? '#ff8a3d' : '#45c8ff';
  ctx.fillText(f.name, nameX, y - 12);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lh;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

// --- the fighter sprite, drawn from a skeleton so every hero looks different
export function drawFighter(ctx, f, time) {
  const def = f.def;
  const s = f.growScale;
  const pose = poseFor(f, time);

  ctx.save();
  ctx.translate(f.x, f.y);
  ctx.scale(f.facing * s, s);

  if (f.state === 'ko') { drawKo(ctx, f, pose); ctx.restore(); return; }

  // shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, 2, 26, 7, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  // cape / cloak behind
  if (def.cape || def.cloak) {
    const capeCol = def.cape || def.cloak;
    const sway = Math.sin(time * 3 + f.side) * 5;
    const top = pose.shoulderY + 2;
    const mid = pose.shoulderY * 0.55;
    const hem = -pose.hipY * 0.35;
    ctx.save();
    ctx.fillStyle = capeCol;
    ctx.beginPath();
    ctx.moveTo(-4, top);
    ctx.quadraticCurveTo(-24 - sway, mid, -19 - sway, hem);
    ctx.lineTo(-2, hem - 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = shade(capeCol, -0.3);
    ctx.beginPath();
    ctx.moveTo(-4, top);
    ctx.quadraticCurveTo(-13 - sway, mid, -10 - sway, hem - 2);
    ctx.lineTo(-2, hem - 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const skin = def.skin;
  const suit = def.suit;
  const suit2 = def.suit2 || shade(suit, -0.25);
  const back = shade(suit, -0.32);
  const legCol = shade(suit, -0.18);
  const backSkin = shade(skin, -0.28);

  // back limbs first
  limb(ctx, 0, -pose.hipY, pose.bl[0], 24, pose.bl[1], 24, 13, 10, back);
  limb(ctx, pose.shoulderX, pose.shoulderY, pose.ba[0], 21, pose.ba[1], 20, 10, 8, back, backSkin);

  // torso
  ctx.save();
  ctx.translate(0, -pose.hipY);
  ctx.rotate(pose.lean * DEG);
  ctx.fillStyle = suit;
  roundRect(ctx, -15, -38, 30, 40, 9);
  ctx.fill();
  // chest
  ctx.fillStyle = suit2;
  roundRect(ctx, -9, -34, 18, 15, 5);
  ctx.fill();
  // emblem
  ctx.fillStyle = def.accent;
  ctx.beginPath();
  ctx.arc(0, -26, 6.5, 0, TAU);
  ctx.fill();
  ctx.fillStyle = shade(def.accent, -0.45);
  ctx.beginPath();
  ctx.arc(0, -26, 3, 0, TAU);
  ctx.fill();
  // belt
  ctx.fillStyle = def.accent;
  ctx.fillRect(-15, -6, 30, 6);
  ctx.restore();

  // front leg
  limb(ctx, 0, -pose.hipY, pose.fl[0], 24, pose.fl[1], 24, 14, 11, legCol);
  // boots
  drawFoot(ctx, pose.fl, 0, -pose.hipY, def.accent);

  // front arm
  limb(ctx, pose.shoulderX, pose.shoulderY, pose.fa[0], 21, pose.fa[1], 20, 11, 9, suit, skin);
  if (def.gauntlets) {
    ctx.fillStyle = def.suit2;
    const ex = pose.shoulderX + Math.sin(pose.fa[1] * DEG) * 20;
    const ey = pose.shoulderY + Math.cos(pose.fa[1] * DEG) * 20;
    ctx.beginPath();
    ctx.arc(ex, ey, 7, 0, TAU);
    ctx.fill();
  }

  // head
  ctx.save();
  ctx.translate(pose.headX, pose.headY);
  ctx.rotate((pose.lean + pose.headTilt) * DEG);
  drawHead(ctx, def, 0, 0, 1);
  ctx.restore();

  // growth aura
  if (f.growT > 0) {
    ctx.save();
    ctx.globalAlpha = 0.25 + Math.sin(time * 8) * 0.08;
    ctx.strokeStyle = '#f05a7a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -45, 40, 58, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // freeze / burn / armor tints
  if (f.status.freeze > 0) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#b9e8ff';
    roundRect(ctx, -22, -108, 44, 110, 12);
    ctx.fill();
    ctx.restore();
  }
  if (f.status.burn > 0) {
    ctx.save();
    ctx.globalAlpha = 0.22 + Math.sin(time * 14) * 0.08;
    ctx.fillStyle = '#ff7a2f';
    roundRect(ctx, -22, -108, 44, 110, 12);
    ctx.fill();
    ctx.restore();
  }
  if (f.status.armor > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(time * 10) * 0.12;
    ctx.strokeStyle = '#ffb703';
    ctx.lineWidth = 3;
    roundRect(ctx, -26, -112, 52, 114, 14);
    ctx.stroke();
    ctx.restore();
  }
  if (f.status.slow > 0) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath();
    ctx.ellipse(0, -50, 30, 56, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  if (f.flash > 0) {
    ctx.save();
    ctx.globalAlpha = f.flash * 3;
    ctx.fillStyle = '#fff';
    roundRect(ctx, -24, -110, 48, 112, 12);
    ctx.fill();
    ctx.restore();
  }
  if (f.specialGlow > 0) {
    ctx.save();
    ctx.globalAlpha = f.specialGlow;
    ctx.shadowColor = def.accent;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = def.accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -52, 34, 56, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

function drawFoot(ctx, leg, ox, oy, color) {
  // the boot sits at the end of the shin, not the hip
  const kx = ox + Math.sin(leg[0] * DEG) * 24;
  const ky = oy + Math.cos(leg[0] * DEG) * 24;
  const ex = kx + Math.sin(leg[1] * DEG) * 24;
  const ey = ky + Math.cos(leg[1] * DEG) * 24;
  ctx.fillStyle = color || '#e8e8f0';
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(leg[1] * DEG);
  ctx.fillRect(-5, -3, 14, 6);
  ctx.restore();
  ctx.fillStyle = '#e8e8f0';
  ctx.fillRect(ex - 3, ey - 3, 7, 6);
}

function limb(ctx, ox, oy, a1, l1, a2, l2, w1, w2, color, handColor) {
  const r1 = a1 * DEG, r2 = a2 * DEG;
  const kx = ox + Math.sin(r1) * l1;
  const ky = oy + Math.cos(r1) * l1;
  const ex = kx + Math.sin(r2) * l2;
  const ey = ky + Math.cos(r2) * l2;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = w1;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(kx, ky);
  ctx.stroke();
  ctx.lineWidth = w2;
  ctx.beginPath();
  ctx.moveTo(kx, ky);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.fillStyle = handColor || color;
  ctx.beginPath();
  ctx.arc(ex, ey, w2 * 0.55, 0, TAU);
  ctx.fill();
}

function drawKo(ctx, f, pose) {
  ctx.save();
  ctx.rotate(-1.35);
  ctx.fillStyle = shade(f.def.suit, -0.2);
  roundRect(ctx, -16, -30, 32, 30, 8);
  ctx.fill();
  ctx.fillStyle = f.def.skin;
  ctx.beginPath();
  ctx.arc(0, -40, 12, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function poseFor(f, time) {
  const t = time * 6 + f.side * 2;
  let hipY = 44;
  let lean = 0;
  let headTilt = 0;
  let fa = [18, 14];
  let ba = [-16, 12];
  let fl = [12, -6];
  let bl = [-12, 4];
  let headX = 0;

  if (f.state === 'ko') {
    return { hipY: 20, lean: 0, headTilt: 0, fa: [40, 60], ba: [-40, 50], fl: [30, 20], bl: [-20, 10], shoulderX: 0, shoulderY: -60, headX: 0, headY: -78 };
  }

  if (f.state === 'attack' && f.attack) {
    const a = f.attack;
    const m = a.move;
    const p = a.t / (m.startup + m.active + m.recovery);
    const wind = a.t < m.startup;
    const strike = a.t >= m.startup && a.t < m.startup + m.active;
    const kind = m.kind;

    if (kind === 'lunge' || kind === 'barrage') {
      if (wind) { fa = [-40, -70]; ba = [50, 80]; lean = -14; }
      else { fa = [95, 5]; ba = [-30, 40]; lean = 18; }
      fl = [40, -10]; bl = [-30, 20];
    } else if (kind === 'blast' || kind === 'projectile') {
      if (wind) { fa = [-50, -90]; ba = [40, 70]; lean = -10; }
      else { fa = [92, 10]; ba = [-20, 30]; lean = 8; }
      fl = [20, -8]; bl = [-20, 8];
    } else if (kind === 'aoe') {
      if (wind) { fa = [-80, -100]; ba = [-70, -90]; lean = -12; }
      else { fa = [95, 20]; ba = [85, 10]; lean = 22; }
      fl = [50, -20]; bl = [-35, 25];
    } else if (kind === 'lift') {
      fa = wind ? [-60, -80] : [88, 20];
      ba = wind ? [40, 60] : [-20, 30];
      lean = wind ? -10 : 12;
      fl = [24, -10]; bl = [-22, 8];
    } else if (kind === 'heal') {
      fa = [-60, -70]; ba = [-50, -60]; lean = -6; fl = [30, -20]; bl = [-25, 15];
    } else if (kind === 'armor') {
      fa = wind ? [-50, -60] : [80, 30];
      ba = wind ? [40, 60] : [-30, 40];
      lean = wind ? -12 : 14;
      fl = [26, -12]; bl = [-24, 10];
    } else if (kind === 'teleport') {
      fa = [30, 60]; ba = [-30, 50]; lean = 0; fl = [10, 30]; bl = [-10, 25];
    } else if (kind === 'grow') {
      fa = [-40, -50]; ba = [-30, -40]; lean = -6; fl = [24, -12]; bl = [-22, 10];
    } else if (kind === 'sonic') {
      fa = wind ? [-70, -90] : [100, 0];
      ba = wind ? [60, 80] : [-30, 40];
      lean = wind ? -12 : 6;
      fl = [18, -8]; bl = [-18, 8];
    } else if (kind === 'whip' || kind === 'bind') {
      fa = wind ? [-80, -100] : [80, 40];
      ba = [40, 50];
      lean = wind ? -14 : 10;
      fl = [20, -8]; bl = [-20, 8];
    } else if (kind === 'debuff' || kind === 'dot' || kind === 'steal') {
      fa = wind ? [-60, -80] : [85, 25];
      ba = [30, 50]; lean = 6;
      fl = [16, -8]; bl = [-16, 8];
    } else {
      // basic punch
      if (wind) { fa = [-45, -60]; ba = [35, 55]; lean = -8; }
      else if (strike) { fa = [92, 4]; ba = [-25, 35]; lean = 12; }
      else { fa = [60, 25]; ba = [-20, 30]; lean = 4; }
      fl = [20, -8]; bl = [-20, 8];
    }
    void p;
  } else if (f.hitstun > 0) {
    lean = -16;
    headTilt = -12;
    fa = [-50, -30]; ba = [40, 20];
    fl = [-16, 8]; bl = [20, 6];
  } else if (f.blocking) {
    fa = [58, 74]; ba = [46, 86];
    lean = -6;
    if (f.crouching) { hipY = 28; fl = [56, -66]; bl = [-44, 74]; }
    else { fl = [16, -8]; bl = [-18, 8]; }
  } else if (f.crouching) {
    hipY = 28;
    fa = [30, 50]; ba = [24, 56];
    fl = [56, -66]; bl = [-44, 74];
  } else if (f.airborne) {
    fa = [40, 20]; ba = [-30, 20];
    fl = [46, -54]; bl = [-30, 40];
  } else if (Math.abs(f.vx) > 5) {
    const w = Math.sin(t) * 26;
    fl = [w, -w * 0.35];
    bl = [-w, w * 0.35];
    fa = [-w * 0.5, 12]; ba = [w * 0.5, 12];
    hipY = 44 + Math.abs(Math.sin(t)) * 2;
  } else {
    // idle: gentle breathing
    const bob = Math.sin(time * 2.6 + f.side) * 1.6;
    hipY = 44 + bob;
    fa = [18 + Math.sin(time * 2.6 + f.side) * 3, 14];
    ba = [-16, 12];
    fl = [12, -6]; bl = [-12, 4];
  }

  const shoulderY = -(hipY + 38);
  const shoulderX = Math.sin(lean * DEG) * 38;
  return {
    hipY, lean, headTilt, fa, ba, fl, bl,
    shoulderX, shoulderY,
    headX: shoulderX + Math.sin((lean + headTilt) * DEG) * 20,
    headY: shoulderY - 16 + Math.cos((lean + headTilt) * DEG) * 4,
  };
}

// --- heads ---------------------------------------------------------------

export function drawHead(ctx, def, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  const r = 12;

  // neck
  ctx.fillStyle = shade(def.skin, -0.22);
  ctx.fillRect(-3, r - 3, 6, 6);

  // face
  ctx.fillStyle = def.skin;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();

  const style = def.hairStyle;

  // special faces
  if (style === 'mask') {
    // All For One: a featureless dark mask
    ctx.fillStyle = '#2b2f3a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.02, r * 1.06, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.beginPath();
    ctx.ellipse(-3, -4, r * 0.55, r * 0.4, -0.4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.ellipse(-4.5, -1, 2.2, 3.4, 0, 0, TAU);
    ctx.ellipse(4.5, -1, 2.2, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffd166';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-6, 6);
    ctx.quadraticCurveTo(0, 10, 6, 6);
    ctx.stroke();
  } else if (style === 'hood') {
    // Tsuyu: frog hood with big eyes
    ctx.fillStyle = '#3f7a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.3, r * 1.25, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f6f2e2';
    ctx.beginPath();
    ctx.ellipse(-5, -2, 5, 6, 0, 0, TAU);
    ctx.ellipse(5, -2, 5, 6, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1d2a1f';
    ctx.beginPath();
    ctx.arc(-5, -1, 2.2, 0, TAU);
    ctx.arc(5, -1, 2.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#1d2a1f';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7, 7);
    ctx.quadraticCurveTo(0, 12, 7, 7);
    ctx.stroke();
  } else if (style === 'hood2') {
    // Stain: hood + scarf over the mouth
    ctx.fillStyle = '#2f3a4a';
    ctx.beginPath();
    ctx.ellipse(0, -3, r * 1.12, r * 1.05, 0, Math.PI, TAU);
    ctx.fill();
    ctx.fillStyle = '#e0b088';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#2f6f4f';
    ctx.fillRect(-9, 3, 18, 7);
    ctx.fillStyle = '#1a1f2b';
    ctx.beginPath();
    ctx.ellipse(-4, -2, 1.6, 2.2, 0, 0, TAU);
    ctx.ellipse(4, -2, 1.6, 2.2, 0, 0, TAU);
    ctx.fill();
  } else if (style === 'bird') {
    // Tokoyami: bird mask with a beak
    ctx.fillStyle = '#241c2e';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.15, r * 1.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.lineTo(2.5, 0);
    ctx.lineTo(0, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffe27a';
    ctx.beginPath();
    ctx.ellipse(-5.5, -3, 2, 2.8, 0, 0, TAU);
    ctx.ellipse(5.5, -3, 2, 2.8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(-5.5, -3, 1, 0, TAU);
    ctx.arc(5.5, -3, 1, 0, TAU);
    ctx.fill();
  } else {
    // eyes — dark almond with a glint so they read at any size
    ctx.fillStyle = '#1a1a22';
    ctx.beginPath();
    ctx.ellipse(-4.5, -1, 2.5, 3.1, 0, 0, TAU);
    ctx.ellipse(4.5, -1, 2.5, 3.1, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-3.6, -2.2, 1, 0, TAU);
    ctx.arc(5.4, -2.2, 1, 0, TAU);
    ctx.fill();
    // angry brows
    ctx.strokeStyle = shade(def.hair, -0.35);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-8, -5.5);
    ctx.lineTo(-1.8, -3.2);
    ctx.moveTo(8, -5.5);
    ctx.lineTo(1.8, -3.2);
    ctx.stroke();
    // mouth
    ctx.strokeStyle = '#7a3b3b';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    if (def.id === 'allmight') {
      ctx.arc(0, 3, 5, 0.2, Math.PI - 0.2);
    } else {
      ctx.moveTo(-3, 6);
      ctx.lineTo(3, 6);
    }
    ctx.stroke();
  }

  // hair on top
  drawHair(ctx, def, r);

  // accessories
  if (def.lenses) {
    ctx.fillStyle = 'rgba(120,220,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-4.5, -1, 3.6, 3.4, 0, 0, TAU);
    ctx.ellipse(4.5, -1, 3.6, 3.4, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2a3550';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  if (def.shades) {
    ctx.fillStyle = '#14141c';
    roundRect(ctx, -9, -4, 8.5, 6, 2);
    ctx.fill();
    roundRect(ctx, 0.5, -4, 8.5, 6, 2);
    ctx.fill();
    ctx.fillRect(-1, -2.5, 2, 2);
  }
  if (def.scar) {
    ctx.strokeStyle = '#c25a4a';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(4, 2);
    ctx.lineTo(8, 7);
    ctx.stroke();
  }
  if (def.staples) {
    ctx.strokeStyle = '#c9c9d6';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(5, 1 + i * 2.2);
      ctx.lineTo(9, 1.6 + i * 2.2);
      ctx.stroke();
    }
  }
  if (def.stitches) {
    ctx.strokeStyle = '#8a8a96';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, 3);
    ctx.lineTo(8, 8);
    ctx.stroke();
  }
  if (def.horns) {
    ctx.fillStyle = def.id === 'iida' ? '#d9b34a' : '#f2e6c9';
    ctx.beginPath();
    ctx.moveTo(-9, -7);
    ctx.lineTo(-5, -13);
    ctx.lineTo(-3, -7);
    ctx.closePath();
    ctx.moveTo(9, -7);
    ctx.lineTo(5, -13);
    ctx.lineTo(3, -7);
    ctx.closePath();
    ctx.fill();
  }
  if (def.mask) {
    // Midnight's half mask
    ctx.fillStyle = '#1f1a2b';
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(12, -6);
    ctx.lineTo(12, 8);
    ctx.lineTo(0, 4);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawHair(ctx, def, r) {
  const style = def.hairStyle;
  const col = def.hair;
  ctx.fillStyle = col;

  if (style === 'flat') {
    // All Might: blonde flat top with a centre notch
    ctx.beginPath();
    ctx.moveTo(-r, -2);
    ctx.quadraticCurveTo(-r - 1, -r - 3, 0, -r - 4);
    ctx.quadraticCurveTo(r + 1, -r - 3, r, -2);
    ctx.lineTo(r - 1, -6);
    ctx.lineTo(4, -3);
    ctx.lineTo(0, -7);
    ctx.lineTo(-4, -3);
    ctx.lineTo(-r + 1, -6);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'spiky') {
    const spikes = 6;
    for (let i = 0; i < spikes; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / spikes);
      const len = r * (1.25 + (i % 2) * 0.3);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.3) * r * 0.95, Math.sin(a - 0.3) * r * 0.95);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + 0.3) * r * 0.95, Math.sin(a + 0.3) * r * 0.95);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, -3, r * 0.9, Math.PI, TAU);
    ctx.fill();
  } else if (style === 'messy') {
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i + 0.5) * (Math.PI / 7);
      const len = r * (1.15 + ((i * 37) % 10) / 30);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.32) * r * 0.92, Math.sin(a - 0.32) * r * 0.92);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + 0.32) * r * 0.92, Math.sin(a + 0.32) * r * 0.92);
      ctx.closePath();
      ctx.fill();
    }
  } else if (style === 'half') {
    // Todoroki: red on one side, white on the other
    ctx.save();
    ctx.beginPath();
    ctx.rect(-r, -r * 1.3, r * 2, r * 0.8);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.04, 0, TAU);
    ctx.clip();
    ctx.fillStyle = def.hair;
    ctx.fillRect(-r, -r, r, r * 2);
    ctx.fillStyle = def.hair2 || '#eef3f8';
    ctx.fillRect(0, -r, r, r * 2);
    ctx.restore();
  } else if (style === 'bob') {
    ctx.beginPath();
    ctx.moveTo(-r - 1, 6);
    ctx.quadraticCurveTo(-r - 2, -r - 2, 0, -r - 3);
    ctx.quadraticCurveTo(r + 2, -r - 2, r + 1, 6);
    ctx.lineTo(r - 2, 6);
    ctx.quadraticCurveTo(r, -4, 2, -5);
    ctx.lineTo(-2, -5);
    ctx.quadraticCurveTo(-r, -4, -r + 2, 6);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'bun') {
    ctx.beginPath();
    ctx.arc(0, -r - 4, 5, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r - 1, 6);
    ctx.quadraticCurveTo(-r - 2, -r - 2, 0, -r - 2);
    ctx.quadraticCurveTo(r + 2, -r - 2, r + 1, 6);
    ctx.lineTo(r - 2, 6);
    ctx.quadraticCurveTo(r, -5, 0, -5);
    ctx.quadraticCurveTo(-r, -5, -r + 2, 6);
    ctx.closePath();
    ctx.fill();
  } else if (style === 'suit') {
    // Iida: neat dark hair, flat top
    ctx.beginPath();
    ctx.moveTo(-r, -1);
    ctx.quadraticCurveTo(-r, -r - 3, 0, -r - 3);
    ctx.quadraticCurveTo(r, -r - 3, r, -1);
    ctx.lineTo(r - 1, -5);
    ctx.quadraticCurveTo(0, -7, -r + 1, -5);
    ctx.closePath();
    ctx.fill();
    // glasses
    ctx.strokeStyle = '#e8c66a';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.rect(-7.5, -4, 6, 5);
    ctx.rect(1.5, -4, 6, 5);
    ctx.moveTo(-1.5, -2);
    ctx.lineTo(1.5, -2);
    ctx.stroke();
  } else if (style === 'pompadour') {
    ctx.beginPath();
    ctx.moveTo(-r, -1);
    ctx.quadraticCurveTo(-r - 1, -r - 6, 0, -r - 9);
    ctx.quadraticCurveTo(r + 1, -r - 6, r, -1);
    ctx.lineTo(r - 1, -5);
    ctx.quadraticCurveTo(0, -8, -r + 1, -5);
    ctx.closePath();
    ctx.fill();
  }
  // bird and mask styles already draw their own head covering
}

// --- arena ---------------------------------------------------------------

const BUILDINGS = (() => {
  const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const out = [];
  for (let i = 0; i < 26; i++) {
    const w = 30 + rnd() * 70;
    out.push({ x: i * 64 - 40, w, h: 60 + rnd() * 150, lit: rnd() });
  }
  return out;
})();

const ARENAS = [
  { name: 'UA ROOFTOP', sky: ['#4a8fd6', '#bfe6ff'], far: '#5f7fb8', near: '#3d5680', ground: '#8d93a8', ground2: '#6b7185', sun: '#fffbe0' },
  { name: 'GYMnasium', sky: ['#2c3350', '#171b30'], far: '#3a4265', near: '#2a3050', ground: '#c8a06a', ground2: '#a07a4c', sun: '#ffe9b0' },
  { name: 'NIGHT SHIFT', sky: ['#0a0f2a', '#243061'], far: '#1a2145', near: '#121736', ground: '#5b6280', ground2: '#414764', sun: '#e8f0ff' },
];

function drawArena(ctx, round, time) {
  const a = ARENAS[(round - 1) % ARENAS.length];
  const g = ctx.createLinearGradient(0, 0, 0, FLOOR);
  g.addColorStop(0, a.sky[0]);
  g.addColorStop(1, a.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // sun / moon
  ctx.save();
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = a.sun;
  ctx.beginPath();
  ctx.arc(800, 96, 34, 0, TAU);
  ctx.fill();
  ctx.restore();

  // clouds
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 5; i++) {
    const x = ((i * 260 + time * 8) % (W + 300)) - 150;
    const y = 60 + (i % 3) * 46;
    ctx.beginPath();
    ctx.ellipse(x, y, 70, 20, 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // skyline
  for (const b of BUILDINGS) {
    ctx.fillStyle = a.far;
    ctx.fillRect(b.x, FLOOR - 150 - b.h, b.w, b.h + 150);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let wy = FLOOR - 140 - b.h; wy < FLOOR - 160; wy += 22) {
      for (let wx = b.x + 6; wx < b.x + b.w - 8; wx += 16) {
        if ((wx * 7 + wy * 13) % 5 < 2.4) ctx.fillRect(wx, wy, 7, 9);
      }
    }
  }

  // ground
  const gg = ctx.createLinearGradient(0, FLOOR - 10, 0, H);
  gg.addColorStop(0, a.ground);
  gg.addColorStop(1, a.ground2);
  ctx.fillStyle = gg;
  ctx.fillRect(0, FLOOR - 10, W, H - FLOOR + 10);

  // floor lines
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  for (let i = -6; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2 + (i - 3) * 34, FLOOR - 8);
    ctx.lineTo(W / 2 + (i - 3) * 150, H);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, FLOOR + 24);
  ctx.lineTo(W, FLOOR + 24);
  ctx.stroke();
  ctx.restore();

  // rooftop railing
  ctx.fillStyle = shade(a.ground2, -0.35);
  ctx.fillRect(0, FLOOR - 34, W, 8);
  ctx.fillStyle = shade(a.ground2, -0.5);
  for (let x = 6; x < W; x += 44) ctx.fillRect(x, FLOOR - 30, 6, 30);

  // stage name
  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.textAlign = 'center';
  ctx.font = '700 26px "Comic Sans MS", system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(a.name, W / 2, 120);
  ctx.restore();
}

// ---------------------------------------------------------------- boot

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);

const game = new Game(canvas);
game.dpr = dpr;

const pad = new PadInput();
// the key maps come from the shared settings - rebind them in the ⚙ panel
const p1 = new PlayerControls(pad, getKeys('fighter', 0), 0);
const p2 = new PlayerControls(pad, getKeys('fighter', 1), 1);

function fighterHint() {
  const k = (p, a) => keyLabel((getKeys('fighter', p)[a] || [])[0]);
  return `<b>P1</b> ${k(0, 'left')}/${k(0, 'right')} move · ${k(0, 'up')} jump · ${k(0, 'down')} crouch · `
    + `${k(0, 'light')} light · ${k(0, 'heavy')} heavy · ${k(0, 'special')} special · ${k(0, 'super')} super &nbsp;·&nbsp; `
    + `<b>P2</b> ${k(1, 'left')}/${k(1, 'right')} move · ${k(1, 'up')} jump · ${k(1, 'down')} crouch · `
    + `${k(1, 'light')} light · ${k(1, 'heavy')} heavy · ${k(1, 'special')} special · ${k(1, 'super')} super`;
}

function refreshHint() {
  const hint = document.getElementById('hinttext');
  if (hint) hint.innerHTML = fighterHint();
}
refreshHint();
onChange(({ gameId }) => { if (!gameId || gameId === 'fighter') refreshHint(); });

const input = { p1, p2 };
window.broFighter = game;
window.broControls = { p1, p2 };

// keyboard helpers for the select screen
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyC') {
    game.vsCpu = !game.vsCpu;
    if (game.vsCpu) game.pick[1].confirmed = false;
    Sfx.sfxClick();
  }
  if (e.code === 'KeyV') {
    game.cpuLevel = (game.cpuLevel + 1) % 3;
    Sfx.sfxClick();
  }
  if (e.code === 'KeyM') {
    Sfx.initAudio();
    const m = Sfx.toggleMute();
    const b = document.getElementById('btn-sound');
    if (b) b.textContent = m ? '🔇' : '🔊';
  }
  if (e.code === 'Escape') {
    window.location.href = 'index.html';
  }
});

// result overlay
const resultOverlay = document.getElementById('overlay-result');
const resultTitle = document.getElementById('result-title');
const resultSub = document.getElementById('result-sub');
const resultStats = document.getElementById('result-stats');

function showResult() {
  const r = game.lastResult;
  if (!r) return;
  resultTitle.textContent = `${r.name} WINS`;
  resultTitle.className = `title ${r.winner === 0 ? 'p1' : 'p2'}`;
  resultSub.textContent = r.winner === 0
    ? 'Team Letters takes the series. Team Numbers is writing the excuse.'
    : 'Team Numbers takes the series. Team Letters is writing the excuse.';
  resultStats.innerHTML = [
    stat('FINAL SCORE', `${r.wins[0]} – ${r.wins[1]}`),
    stat('TEAM LETTERS', r.a),
    stat('TEAM NUMBERS', r.b),
  ].join('');
  resultOverlay.classList.remove('hidden');
}

const stat = (l, v) => `<div class="statbox"><div class="sv">${v}</div><div class="sl">${l}</div></div>`;

document.getElementById('btn-rematch').addEventListener('click', () => {
  resultOverlay.classList.add('hidden');
  game.startSelect();
});
document.getElementById('btn-hub').addEventListener('click', () => {
  window.location.href = 'index.html';
});

// help + sound
const helpOverlay = document.getElementById('overlay-help');
const helpBtn = document.getElementById('btn-help');
const closeHelp = document.getElementById('btn-close-help');
const soundBtn = document.getElementById('btn-sound');

function toggleHelp(force) {
  const show = force !== undefined ? force : helpOverlay.classList.contains('hidden');
  helpOverlay.classList.toggle('hidden', !show);
  Sfx.sfxClick();
}
helpBtn.addEventListener('click', () => toggleHelp());
closeHelp.addEventListener('click', () => toggleHelp(false));
soundBtn.addEventListener('click', () => {
  Sfx.initAudio();
  Sfx.resumeAudio();
  const m = Sfx.toggleMute();
  soundBtn.textContent = m ? '🔇' : '🔊';
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'F1') { e.preventDefault(); toggleHelp(); }
  if (e.code === 'F2') { e.preventDefault(); openControls('fighter'); }
});
window.addEventListener('pointerdown', () => { Sfx.initAudio(); Sfx.resumeAudio(); }, { once: true });

// background music
if (musicEnabled()) startMusic('fighter');

const STEP = 1 / 120;
let acc = 0;
let last = performance.now();

function frame(now) {
  let dt = (now - last) / 1000;
  last = now;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.25) dt = 0.25;

  pad.poll();
  p1.update();
  p2.update();

  if (game.state === 'select') {
    handleSelectInput();
  } else if (game.fighters) {
    readFightInput();
  }

  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) {
    game.update(STEP, input);
    acc -= STEP;
  }
  if (guard >= 8) acc = 0;

  game.render();

  if (game.state === 'over' && resultOverlay.classList.contains('hidden')) showResult();

  pad.endFrame();
  requestAnimationFrame(frame);
}

function handleSelectInput() {
  // 'up' doubles as jump in the fight; on the select screen it moves the cursor
  // (handled in Game.updateSelect via p1.press('up')), so nothing to do here.
}

function readFightInput() {
  const [a, b] = game.fighters;
  const map = (ctl, f) => {
    const i = f.input;
    const ax = ctl.axis('left', 'right');
    i.left = ax < -0.25;
    i.right = ax > 0.25;
    i.up = ctl.press('up');
    i.down = ctl.down('down') || ctl.stick.y > 0.55;
    i.light = ctl.press('light');
    i.heavy = ctl.press('heavy');
    i.special = ctl.press('special');
    i.super = ctl.press('super');
    // press -> buffer, so hitstop / hitstun never eats the input
    if (i.light) f.bufLight = 0.18;
    if (i.heavy) f.bufHeavy = 0.18;
    if (i.special) f.bufSpecial = 0.18;
    if (i.super) f.bufSuper = 0.18;
  };
  map(p1, a);
  if (!game.vsCpu) map(p2, b);
}

requestAnimationFrame(frame);
