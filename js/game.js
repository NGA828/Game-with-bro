// The game itself: turn flow, ballistics, terrain destruction, gloating.

import { Terrain } from './terrain.js';
import { Tank, TANK_W, FUEL_PER_TURN } from './tank.js';
import { Particles } from './particles.js';
import { WEAPONS, weaponById } from './weapons.js';
import { clamp, rand, randInt, pick, roundRect, rgba } from './utils.js';
import * as Sfx from './audio.js';

export const W = 960;
export const H = 540;
export const WATER_Y = 440;

const GRAVITY = 520;
const MAX_V0 = 560;
const WIND_ACC = 9.5;
const GOO_START_ROUND = 9;
const LIVES = 2;
const ROUNDS_TO_WIN = 3;
const RESPAWN_TIME = 2.4;
const PIVOT_Y = 20;           // barrel pivot height above the tank's ground point
const SUBSTEP = 2.2;          // max pixels travelled per physics substep

const SKIES = [
  { name: 'dawn',   top: '#2c3e70', bot: '#ffb37a', sun: '#fff2c4', far: '#3d4a7a', near: '#2a3054', cloud: 'rgba(255,235,210,0.30)' },
  { name: 'day',    top: '#3a86d6', bot: '#bfe6ff', sun: '#fffbe0', far: '#6f9fd8', near: '#4a6fa5', cloud: 'rgba(255,255,255,0.55)' },
  { name: 'dusk',   top: '#1d1f4d', bot: '#ff7b54', sun: '#ffd8a8', far: '#3a2f5e', near: '#241f42', cloud: 'rgba(255,190,170,0.28)' },
  { name: 'storm',  top: '#20242f', bot: '#5a6472', sun: '#c9d4e2', far: '#39414f', near: '#252b36', cloud: 'rgba(190,200,215,0.30)' },
  { name: 'night',  top: '#070a1c', bot: '#1d2a55', sun: '#e8f0ff', far: '#151c3a', near: '#0e1229', cloud: 'rgba(150,170,220,0.20)' },
];

const MISS_LINES = [
  'flung it into the next county',
  'that one is in orbit now',
  'he aimed at the sky. bold.',
  'not even close, champ',
];

const SELF_LINES = [
  'found himself the hard way',
  'point blank. on himself.',
  'self-inflicted. iconic.',
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.terrain = new Terrain(W, H);
    this.particles = new Particles(1500);

    this.tanks = [
      new Tank(0, '#ff8a3d', '#c25a17', 130),
      new Tank(1, '#45c8ff', '#1d7fb0', W - 130),
    ];

    this.projectiles = [];
    this.pools = [];
    this.clouds = [];

    this.state = 'menu';
    this.turn = 0;
    this.roundNumber = 1;
    this.wins = [0, 0];
    this.lives = [LIVES, LIVES];
    this.wind = 0;
    this.shake = 0;
    this.flashWhite = 0;
    this.time = 0;
    this.stateTimer = 0;
    this.settleTimer = 0;
    this.turnTime = 0;
    this.timerEnabled = false;
    this.gooY = WATER_Y;
    this.gooRise = false;
    this.feed = [];
    this.feedId = 0;
    this.ghostTrails = [[], []];
    this.lastKiller = [null, null];
    this.killCamTank = null;
    this.matchOver = false;
    this.winner = -1;
    this.roundOver = false;
    this.roundWinner = -1;
    this.sky = SKIES[1];
    this.banner = null;        // {text, sub, cls, life}
    this.explosionLights = [];
    this.hitStop = 0;
    this.pendingAutoFire = false;
    this.turnCount = 0;
    this.dpr = 1;
    this.angleByKeyboard = true;
    this.pendingMatchEnd = 0;
    this.pendingNextRound = 0;

    // a live-looking world behind the menu
    this.terrain.generate(Math.floor(Math.random() * 1e9));
    for (const t of this.tanks) t.y = this.terrain.heightAt(t.x);
    this.buildClouds();
  }

  buildClouds() {
    this.clouds = [];
    for (let i = 0; i < 7; i++) {
      this.clouds.push({ x: rand(-100, W + 100), y: rand(30, 190), s: rand(0.6, 1.5), v: rand(3, 11) });
    }
  }

  // ---------------------------------------------------------------- lifecycle
  start(timerEnabled = false) {
    this.timerEnabled = timerEnabled;
    this.wins = [0, 0];
    this.roundNumber = 1;
    this.matchOver = false;
    this.winner = -1;
    this.newRound(true);
  }

  newRound(fresh) {
    this.terrain.generate(Math.floor(Math.random() * 1e9));
    this.sky = pick(SKIES);
    this.particles.clear();
    this.projectiles.length = 0;
    this.pools.length = 0;
    this.ghostTrails = [[], []];
    this.roundOver = false;
    this.roundWinner = -1;
    this.gooRise = this.roundNumber >= GOO_START_ROUND;
    this.gooY = WATER_Y;

    // The goo stops just below the high ground in the middle of the map, so a
    // rising sea becomes a fight over the last hill instead of a coin flip.
    let midPeak = Infinity;
    let peakY = Infinity;
    for (let x = 0; x < W; x++) {
      const h = this.terrain.heights[x];
      peakY = Math.min(peakY, h);
      if (x > W * 0.22 && x < W * 0.78) midPeak = Math.min(midPeak, h);
    }
    this.gooCeiling = clamp(Math.min(midPeak, peakY + 70) + 34, 200, WATER_Y);
    this.buildClouds();

    if (fresh) this.lives = [LIVES, LIVES];
    for (const t of this.tanks) {
      t.reset(t.id === 0 ? 130 : W - 130);
      t.rot = 0;
      t.vx = 0;
      t.spin = 0;
      t.y = this.terrain.heightAt(t.x);
      t.angle = t.id === 0 ? 45 : 135;
      t.facing = t.id === 0 ? 1 : -1;
      t.crown = 0;
    }

    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.turnCount = 0;
    this.state = 'turnstart';
    this.stateTimer = 1.15;
    this.pendingMatchEnd = 0;
    this.pendingNextRound = 0;
    this.setWind();
    this.showBanner(`ROUND ${this.roundNumber}`, this.roundNumber >= GOO_START_ROUND ? 'THE GOO IS RISING' : 'good luck, idiot', '');
    if (this.roundNumber >= GOO_START_ROUND) Sfx.sfxGoo();
  }

  setWind() {
    const max = 4 + this.roundNumber * 0.8;
    const w = (Math.random() * 2 - 1) * Math.min(max, 10);
    this.wind = Math.abs(w) < 1.2 ? 0 : w;
  }

  showBanner(text, sub, cls) {
    this.banner = { text, sub, cls, life: 1.5 };
  }

  beginTurn() {
    const t = this.tanks[this.turn];
    this.turnCount++;
    t.tickGoo(this.particles);
    if (t.hp <= 0) this.killTank(t, null, true);

    // can't take a turn while dead
    if (!t.alive) {
      if (this.eliminated(t)) { this.endRound(); return; }
      this.state = 'settle';
      this.settleTimer = 0.6;   // wait for the respawn
      return;
    }

    t.fuel = FUEL_PER_TURN;
    t.charging = false;
    t.power = clamp(t.power, 12, 100);
    this.turnTime = 45;
    this.state = 'aim';
    this.applyGooPools(t);

    this.showBanner(t.name, pick([
      'your turn, big shot', 'make it count', 'no pressure', 'wind is a liar, by the way',
      'aim good, brother', 'he is laughing. fix that.',
    ]), t.id === 0 ? 'p1' : 'p2');
  }

  // ---------------------------------------------------------------- turn flow
  fire() {
    const t = this.tanks[this.turn];
    if (!t.alive || this.state !== 'aim') return;
    const wpn = weaponById(t.weapon);
    if (t.ammo[wpn.id] !== undefined && t.ammo[wpn.id] <= 0) {
      t.weapon = 'shell';
      return;
    }

    // the cluster bomb is lobbed harder and straighter, so the player can
    // choose when it splits: up high, or straight into someone's face
    const angleMul = wpn.cluster ? 1.22 : 1;
    const a = t.angle * Math.PI / 180;
    const v0 = (t.power / 100) * MAX_V0 * wpn.power * angleMul;
    const tip = t.barrelTip;
    const start = { x: tip.x + Math.cos(a) * 12, y: tip.y - Math.sin(a) * 12 };

    const p = this.makeProjectile(start.x, start.y, Math.cos(a) * v0, -Math.sin(a) * v0, wpn, t);
    if (wpn.cluster) { p.clusterLeft = wpn.cluster; }
    if (wpn.bounces) { p.bounceLeft = wpn.bounces; }
    if (wpn.gooPools) { p.gooPools = wpn.gooPools; }

    this.projectiles.push(p);
    this.ghostTrails[t.id] = [];

    if (t.ammo[wpn.id] !== undefined && t.ammo[wpn.id] !== Infinity) t.ammo[wpn.id]--;
    if (t.ammo[wpn.id] === 0 && wpn.id !== 'shell') {
      // fall back to the shell so the tank is never useless
      setTimeout(() => { if (t.weapon === wpn.id) t.weapon = 'shell'; }, 10);
    }

    t.charging = false;
    t.recoil = 1;
    t.shots++;
    t.vx -= Math.cos(a) * 26;    // cannon recoil shoves the tank
    t.onGround = false;
    this.shake = Math.min(this.shake + 7, 18);
    Sfx.sfxFire();

    for (let i = 0; i < 16; i++) {
      const spread = rand(-0.35, 0.35);
      const sp = rand(60, 240);
      const aa = a + spread;
      this.particles.add(tip.x, tip.y, Math.cos(aa) * sp, -Math.sin(aa) * sp, {
        type: 'spark', color: i % 3 ? '#ffd166' : '#ff7b3d', size: rand(2, 4.5), life: rand(0.15, 0.4),
      });
    }
    this.particles.add(tip.x, tip.y, 0, 0, { type: 'smoke', color: '#c8c8d0', size: 14, life: 0.8 });

    this.state = 'flying';
    this.settleTimer = 0;
  }

  update(dt) {
    this.time += dt;

    // always-running bits
    for (const c of this.clouds) {
      c.x += c.v * dt;
      if (c.x > W + 140) c.x = -140;
    }
    this.particles.update(dt);
    this.shake = Math.max(0, this.shake - dt * 46);
    this.hitStop = Math.max(0, this.hitStop - dt);
    this.flashWhite = Math.max(0, this.flashWhite - dt * 3.2);
    for (let i = this.explosionLights.length - 1; i >= 0; i--) {
      const L = this.explosionLights[i];
      L.life -= dt;
      if (L.life <= 0) this.explosionLights.splice(i, 1);
    }

    for (const t of this.tanks) {
      t.settleTick(dt);
      if (!t.alive && t.crown) t.crown = 0;
    }
    this.updateTankPhysics(dt);
    this.updateRespawns(dt);
    this.updateGooLevel(dt);
    this.tickPending(dt);

    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }

    // a few frames of frozen time when something big goes off
    if (this.hitStop > 0) return;

    switch (this.state) {
      case 'menu':
      case 'gameover':
        break;
      case 'turnstart':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.beginTurn();
        break;
      case 'aim': {
        // safety net: a bro can die outside of a shot — goo eating him alive at
        // the start of his turn, or a collapse he was standing on. Never stall.
        const t = this.tanks[this.turn];
        const other = this.tanks[1 - this.turn];
        if (!t.alive || this.eliminated(other)) {
          this.state = 'settle';
          this.settleTimer = 0.4;
          break;
        }
        this.updateAim(dt);
        break;
      }
      case 'flying':
        this.updateProjectiles(dt);
        break;
      case 'settle':
        this.settleTimer -= dt;
        if (this.settleTimer <= 0 && this.projectiles.length === 0 && !this.roundOver) this.resolveTurn();
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- aiming
  updateAim(dt) {
    const t = this.tanks[this.turn];
    if (!t.alive) return;
    const inp = this.input;
    if (!inp) return;

    // ---- driving
    let move = 0;
    if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) move -= 1;
    if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) move += 1;
    if (move !== 0 && t.fuel > 0) {
      const sp = 44;
      const step = Math.min(t.fuel, sp * dt);
      t.x = clamp(t.x + move * step, 18, W - 18);
      t.fuel -= step;
      t.facing = move;
      t.trackPhase += move * step;
      if (this.terrain.heightAt(t.x) < t.y - 4) t.onGround = false; // drove off a lip
      if (Math.random() < 0.5) {
        this.particles.add(t.x - move * 14, t.y, -move * rand(10, 40), rand(-60, -10), {
          type: 'dirt', color: '#4a3322', size: rand(1.5, 3.5), life: rand(0.3, 0.7),
        });
      }
    }

    // ---- aiming: mouse by default, W/S takes over until the mouse moves again
    const fine = dt * 58;
    if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) { t.angle = clamp(t.angle + fine, 0, 180); this.angleByKeyboard = true; }
    if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) { t.angle = clamp(t.angle - fine, 0, 180); this.angleByKeyboard = true; }
    if (inp.pointer.moved) this.angleByKeyboard = false;

    if (!this.angleByKeyboard && inp.pointer.inside) {
      const pivotX = t.x;
      const pivotY = t.y - PIVOT_Y;
      const dx = inp.pointer.x - pivotX;
      const dy = pivotY - inp.pointer.y; // positive = above the barrel
      let ang = Math.atan2(dy, dx) * 180 / Math.PI;
      if (ang < 0) ang = dy > 0 ? 0 : 180;
      if (Math.abs(dx) < 3 && dy > 0) ang = t.angle;
      t.angle = clamp(ang, 0, 180);
      if (Math.abs(dx) > 4) t.facing = dx >= 0 ? 1 : -1;
    }

    // ---- weapon select
    for (let i = 0; i < WEAPONS.length; i++) {
      if (inp.consume('Digit' + (i + 1))) this.selectWeapon(WEAPONS[i].id);
    }
    if (inp.consume('KeyQ')) this.cycleWeapon(-1);
    if (inp.consume('KeyE')) this.cycleWeapon(1);

    // ---- charge & fire
    const wantCharge = inp.pointer.down || inp.isDown('Space');
    if (wantCharge) {
      if (!t.charging) {
        t.charging = true;
        this.chargeDir = 1;
      }
      t.power = clamp(t.power + this.chargeDir * dt * 118, 0, 100);
      if (t.power >= 100) this.chargeDir = -1;
      if (t.power <= 0) this.chargeDir = 1;
      if (Math.random() < 0.4) {
        const a = t.angle * Math.PI / 180;
        const tip = t.barrelTip;
        this.particles.add(tip.x, tip.y, Math.cos(a) * rand(20, 70) + rand(-30, 30),
          -Math.sin(a) * rand(20, 70) - rand(0, 40), {
            type: 'spark', color: '#ffb703', size: rand(1, 2.6), life: rand(0.15, 0.4),
          });
      }
    } else if (t.charging) {
      t.charging = false;
      this.fire();
      return;
    }

    // ---- turn timer
    if (this.timerEnabled) {
      this.turnTime -= dt;
      const s = Math.ceil(this.turnTime);
      if (s <= 5 && s !== this._lastTick) { this._lastTick = s; if (s > 0) Sfx.sfxTick(); }
      if (this.turnTime <= 0) {
        this.turnTime = 0;
        this.pushFeed(`${t.name} RAN OUT OF TIME — FIRING BLINDLY`);
        this.fire();
      }
    }
  }

  selectWeapon(id) {
    const t = this.tanks[this.turn];
    if (t.ammo[id] !== undefined && t.ammo[id] <= 0) return;
    if (t.weapon === id) return;
    t.weapon = id;
    Sfx.sfxClick();
  }

  cycleWeapon(dir) {
    const t = this.tanks[this.turn];
    const n = WEAPONS.length;
    let i = WEAPONS.findIndex((w) => w.id === t.weapon);
    for (let k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      const id = WEAPONS[i].id;
      if (t.ammo[id] === undefined || t.ammo[id] > 0) { this.selectWeapon(id); return; }
    }
  }

  // ---------------------------------------------------------------- projectiles
  makeProjectile(x, y, vx, vy, wpn, owner) {
    return {
      x, y, vx, vy,
      weapon: wpn,
      owner,
      radius: wpn.radius,
      damage: wpn.damage,
      gravityMul: wpn.gravity,
      windFactor: wpn.windFactor,
      kind: wpn.shot,
      clusterLeft: 0,
      bounceLeft: 0,
      gooPools: 0,
      age: 0,
      trailTimer: 0,
      spin: 0,
      rot: 0,
      lastVy: vy,
      dead: false,
      trail: [],          // per-shell, so cluster bomblets never interleave
      isPrimary: true,    // only the shot the player actually fired is remembered
    };
  }

  updateProjectiles(dt) {
    const list = this.projectiles;
    for (const p of list) {
      if (p.dead) continue;
      this.stepProjectile(p, dt);
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);

    if (this.state === 'flying' && list.length === 0) {
      this.state = 'settle';
      this.settleTimer = 1.35;
    }
  }

  stepProjectile(p, dt) {
    p.age += dt;
    const speed = Math.hypot(p.vx, p.vy);
    const steps = Math.max(1, Math.ceil((speed * dt) / SUBSTEP));
    const h = dt / steps;
    const wpn = p.weapon;

    for (let s = 0; s < steps; s++) {
      if (p.dead) return;
      p.lastVy = p.vy;
      p.vy += GRAVITY * p.gravityMul * h;
      p.vx += this.wind * WIND_ACC * p.windFactor * h;
      p.x += p.vx * h;
      p.y += p.vy * h;
      p.rot += p.spin * h;
      p.spin *= 0.995;

      // trail
      p.trailTimer -= h;
      if (p.trailTimer <= 0) {
        p.trailTimer = p.kind === 'shell' ? 0.012 : 0.02;
        const col = p.kind === 'goo' ? '#8de04a' : p.kind === 'duck' ? '#ffd166' : '#e9edff';
        this.particles.add(p.x, p.y, rand(-14, 14), rand(-14, 14), {
          type: 'smoke', color: col, size: p.kind === 'duck' ? 4 : 2.6, life: rand(0.35, 0.85),
        });
        this.ghost(p);
      }

      // out of bounds
      if (p.x < -80 || p.x > W + 80) {
        this.lost(p);
        return;
      }
      if (p.y < -1400) { this.lost(p); return; }

      // tank collision (skip the owner for the first moment, and while still near the muzzle)
      if (p.age > 0.12) {
        for (const t of this.tanks) {
          if (!t.alive) continue;
          if (t === p.owner && p.age < 0.5) continue;
          if (this.hitsTank(p, t)) {
            this.impact(p, t);
            return;
          }
        }
      }

      // terrain collision
      const surf = this.terrain.heightAt(p.x);
      if (p.y >= surf) {
        if (p.bounceLeft > 0) {
          p.bounceLeft--;
          p.y = surf - 1.5;
          p.vy = -Math.abs(p.vy) * 0.55;
          p.vx *= 0.78;
          p.spin = rand(-8, 8);
          Sfx.sfxQuack();
          this.particles.add(p.x, p.y, 0, -40, { type: 'smoke', color: '#fff6d0', size: 9, life: 0.5 });
          if (p.bounceLeft <= 0) { this.impact(p, null); return; }
          continue;
        }
        // cluster splits on contact
        if (p.clusterLeft > 0) { this.split(p); return; }
        this.impact(p, null);
        return;
      }

      // cluster splits at the top of the arc
      if (p.clusterLeft > 0 && p.lastVy < 0 && p.vy >= 0) {
        this.split(p);
        return;
      }
    }
  }

  ghost(p) {
    if (p.trail.length < 420) p.trail.push({ x: p.x, y: p.y });
  }

  /** Once a primary shell lands, its arc becomes that bro's "last shot" line. */
  commitGhost(p) {
    if (p.isPrimary && p.trail.length > 10) this.ghostTrails[p.owner.id] = p.trail;
  }

  hitsTank(p, t) {
    const halfW = TANK_W / 2 + 2;
    const top = t.y - 30;
    const bot = t.y + 1;
    const cx = clamp(p.x, t.x - halfW, t.x + halfW);
    const cy = clamp(p.y, top, bot);
    return (p.x - cx) ** 2 + (p.y - cy) ** 2 < 10;
  }

  split(p) {
    const wpn = p.weapon;
    const n = p.clusterLeft + 1;
    p.dead = true;
    Sfx.sfxQuack();
    this.particles.explosion(p.x, p.y, 14, '#ffd166', 0.4);
    // fan the bomblets FORWARD along the shell's heading — otherwise a shell
    // fired straight up just rains back down on whoever fired it
    const heading = Math.sign(p.vx) || (p.owner.id === 0 ? 1 : -1);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + heading * rand(-0.22, 1.35);
      const sp = rand(80, 250);
      const child = this.makeProjectile(p.x, p.y, Math.cos(a) * sp + p.vx * 0.6, Math.sin(a) * sp,
        { ...wpn, radius: wpn.clusterRadius || 22, damage: wpn.clusterDamage || 16, shot: 'bomb' }, p.owner);
      child.kind = 'bomb';
      child.clusterLeft = 0;
      child.isPrimary = false;
      this.projectiles.push(child);
    }
  }

  impact(p, hitTank) {
    p.dead = true;
    this.commitGhost(p);
    const r = p.radius;
    this.explode(p.x, p.y, r, p.damage, p.owner, {
      color: p.kind === 'goo' ? '#8de04a' : '#ffb703',
      gooPools: p.gooPools,
      hitTank,
    });
  }

  lost(p) {
    p.dead = true;
    this.commitGhost(p);
    if (p.isPrimary) this.pushFeed(`${p.owner.name}: ${pick(MISS_LINES)}`);
  }

  // ---------------------------------------------------------------- explosions
  explode(x, y, radius, damage, owner, opts = {}) {
    this.terrain.destroy(x, y, radius);

    this.particles.explosion(x, y, radius, opts.color || '#ffb703');
    this.particles.debris(x, y, Math.round(radius * 0.55), ['#5a3d27', '#3b2717', '#241710']);
    Sfx.sfxExplosion(radius / 32);
    this.shake = Math.min(30, this.shake + radius * 0.5);
    this.flashWhite = Math.min(0.55, this.flashWhite + radius / 190);
    this.explosionLights.push({ x, y, r: radius * 3.2, life: 0.28, max: 0.28 });
    if (radius > 44) this.hitStop = 0.06;

    // pools in the blast get vaporised
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const pool = this.pools[i];
      if (Math.hypot(pool.x - x, pool.y - y) < radius) {
        this.particles.debris(pool.x, pool.y, 10, ['#8de04a', '#5aa02a']);
        this.pools.splice(i, 1);
      }
    }

    if (opts.gooPools) this.spawnGooPools(x, y, opts.gooPools);

    // splash goo over anyone nearby
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const dx = t.x - x;
      const dy = (t.y - 12) - y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const reach = radius + 20;
      if (d > reach) continue;
      const falloff = clamp(1 - d / reach, 0, 1);
      const dmg = damage * (0.3 + 0.7 * Math.pow(falloff, 1.15));
      if (dmg > 0.5) {
        t.damage(dmg, this.particles);
        if (dmg > 12) this.particles.text(t.x + rand(-20, 20), t.y - 62, pick(['OOF', 'BONK', 'YIKES', 'WHAM']), {
          color: '#ffd166', size: 14, life: 0.8,
        });
      }
      // knockback — this is where the comedy lives
      const k = falloff * (radius > 40 ? 300 : 215);
      t.vx += (dx / d) * k;
      t.vy -= Math.abs(dy / d) * k * 0.85 + k * 0.42;
      t.spin += ((dx / d) * k) * 0.035 + rand(-4, 4);
      t.onGround = false;
      if (opts.gooPools && falloff > 0.35) t.applyGoo(2);
      if (t.hp <= 0) this.killTank(t, owner, false);
    }

    if (opts.hitTank && opts.hitTank.alive) {
      const self = owner && opts.hitTank === owner;
      if (!self) opts.hitTank.damage(8, this.particles);   // clean direct hits hurt extra
      this.particles.text(opts.hitTank.x, opts.hitTank.y - 86, self ? 'SELF OWN' : 'DIRECT HIT!', {
        color: self ? '#ff8a3d' : '#ffd166', size: 20, life: 1.1,
      });
      if (opts.hitTank.hp <= 0) this.killTank(opts.hitTank, owner, false);
    }
  }

  spawnGooPools(x, y, count) {
    for (let i = 0; i < count; i++) {
      const px = clamp(x + rand(-70, 70), 12, W - 12);
      const py = this.terrain.heightAt(px);
      this.pools.push({ x: px, y: py, r: rand(20, 34), life: 1, spawn: 0 });
      for (let k = 0; k < 12; k++) {
        this.particles.add(px, py, rand(-70, 70), rand(-160, -30), {
          type: 'goo', color: '#8de04a', size: rand(2, 5), life: rand(0.4, 1),
        });
      }
    }
    Sfx.sfxQuack();
  }

  applyGooPools(tank) {
    for (const pool of this.pools) {
      if (Math.abs(pool.x - tank.x) < pool.r * 0.8 && tank.alive) {
        tank.applyGoo(2);
        this.particles.text(tank.x, tank.y - 52, 'GOOED', { color: '#8de04a', size: 14, life: 0.9 });
      }
    }
  }

  // ---------------------------------------------------------------- deaths
  killTank(t, killer, silent) {
    if (!t.alive) return;
    t.alive = false;
    t.hp = 0;
    t.deaths++;
    t.goo = 0;
    t.respawnTimer = this.lives[t.id] - 1 > 0 ? RESPAWN_TIME : -1;
    if (killer && killer !== t) killer.kills++;
    if (!silent) {
      this.particles.explosion(t.x, t.y - 12, 40, '#ffd166');
      this.particles.debris(t.x, t.y - 12, 34, [t.color, t.accent, '#2b3047', '#e6e9f5']);
      this.shake = Math.min(34, this.shake + 20);
      this.flashWhite = Math.min(0.7, this.flashWhite + 0.35);
      Sfx.sfxDeath();
      this.hitStop = 0.09;
    }
    this.particles.text(t.x, t.y - 70, 'DEAD', { color: '#ff5a5a', size: 26, life: 1.4 });

    if (killer && killer !== t) {
      this.pushFeed(`${killer.name} deleted ${t.name} 😎`);
    } else if (killer === t) {
      this.pushFeed(`${t.name} ${pick(SELF_LINES)}`);
    } else {
      this.pushFeed(`${t.name} went down`);
    }
    if (!t.alive) this.lastKiller[t.id] = killer || null;
  }

  drown(t) {
    if (!t.alive) return;
    const splashCol = this.gooRise ? '#c9f0a0' : '#bfe6ff';
    this.particles.splash(t.x, this.gooY, splashCol, 46);
    this.particles.debris(t.x, this.gooY, 14, [t.color, t.accent, '#2b3047']);
    Sfx.sfxSplash();
    this.pushFeed(`${t.name} went for a swim 🌊`);
    this.killTank(t, null, true);
  }

  updateRespawns(dt) {
    for (const t of this.tanks) {
      if (t.respawnTimer > 0) {
        t.respawnTimer -= dt;
        if (t.respawnTimer <= 0) this.respawn(t);
      }
    }
  }

  respawn(t) {
    this.lives[t.id] = Math.max(0, this.lives[t.id] - 1);
    t.hp = 65;
    t.alive = true;
    t.rot = 0; t.vx = 0; t.vy = 0; t.spin = 0;
    t.goo = 0; t.pendingGoo = 0;
    t.ammo = { ...t.ammo, heavy: Math.max(t.ammo.heavy, 1), cluster: Math.max(t.ammo.cluster, 1) };

    // Prefer high ground (clear of the goo), then distance from the other bro,
    // then your own half. Never picks a spot that's already underwater unless
    // there is genuinely nothing better.
    const other = this.tanks[1 - t.id];
    let best = t.id === 0 ? 130 : W - 130;
    let bestScore = -Infinity;
    for (let x = 40; x < W - 40; x += 6) {
      const h = this.terrain.heightAt(x);
      const clearance = this.gooY - h;
      const lone = Math.min(Math.abs(x - other.x), 420);
      const side = t.id === 0 ? (W - x) : x;
      let score = clearance * 3.2 + lone * 0.75 + side * 0.35 + rand(-26, 26);
      if (Math.abs(x - other.x) < 70) score -= 2000;   // never land on your bro
      if (score > bestScore) { bestScore = score; best = x; }
    }
    t.x = clamp(best, 20, W - 20);
    t.y = this.terrain.heightAt(t.x);
    t.onGround = false;
    t.flash = 0.7;
    this.particles.confetti(t.x, t.y - 20, 34);
    this.particles.text(t.x, t.y - 60, `${t.name} IS BACK`, { color: t.color, size: 18, life: 1.4 });
    this.pushFeed(`${t.name} is back on his feet (${this.lives[t.id]} lives left)`);
    Sfx.sfxQuack();
  }

  // ---------------------------------------------------------------- resolution
  updateTankPhysics(dt) {
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const wasGrounded = t.onGround;
      t.vy += GRAVITY * dt;
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vx *= Math.pow(0.25, dt);
      t.vy *= Math.pow(0.85, dt);

      t.x = clamp(t.x, 16, W - 16);
      const surf = this.terrain.heightAt(t.x);
      const impact = t.vy;
      if (t.y >= surf) {
        t.y = surf;
        t.vy = 0;
        if (!wasGrounded && impact > 300) {
          const dmg = clamp((impact - 300) / 22, 0, 30);
          if (dmg > 3) {
            t.fallDamage(dmg, this.particles);
            Sfx.sfxHurt();
            if (t.hp <= 0) this.killTank(t, null, false);
          }
        }
        t.onGround = true;
        t.vx *= 0.25;
        t.spin *= 0.25;
      } else {
        t.onGround = false;
      }

      if (t.onGround) {
        t.rot *= Math.pow(0.02, dt);
        t.spin *= Math.pow(0.02, dt);
      } else {
        t.rot += t.spin * dt;
      }

      // drowning
      if (t.y > this.gooY) this.drown(t);
    }

    // corpses sink out of sight
    for (const t of this.tanks) {
      if (t.alive || t.y <= this.gooY) continue;
      const floor = this.terrain.heightAt(t.x) + 8;
      if (t.y < floor) t.y = Math.min(floor, t.y + 28 * dt);
    }
  }

  updateGooLevel(dt) {
    const target = this.gooRise ? this.gooCeiling : WATER_Y;
    if (this.gooY > target) {
      this.gooY = Math.max(target, this.gooY - dt * 15);
    }
    // bubble away so the goo always looks like something alive
    if (this.gooRise) {
      if (Math.random() < 0.8) this.particles.gooBubble(rand(0, W), this.gooY + rand(6, 90));
      if (Math.random() < 0.25) {
        this.particles.add(rand(0, W), this.gooY + rand(10, 60), 0, -30, {
          type: 'goo', color: '#e8ffa8', size: rand(2, 5), life: rand(0.6, 1.4), front: true,
        });
      }
    }
  }

  eliminated(t) {
    return !t.alive && t.respawnTimer <= 0;
  }

  resolveTurn() {
    const [a, b] = this.tanks;
    if (this.eliminated(a) || this.eliminated(b)) { this.endRound(); return; }

    // both blowing up at once with respawns left: wait it out
    if (!a.alive && !b.alive) {
      this.state = 'settle';
      this.settleTimer = 0.6;
      return;
    }

    // somebody is mid-respawn: hold the turn order rather than
    // handing the survivor a pile of free shots
    if (a.respawnTimer > 0 || b.respawnTimer > 0) {
      this.state = 'settle';
      this.settleTimer = 0.35;
      return;
    }

    a.crown = a.hp > b.hp + 22 ? 1 : 0;
    b.crown = b.hp > a.hp + 22 ? 1 : 0;

    this.turn = 1 - this.turn;
    if (!this.tanks[this.turn].alive) this.turn = 1 - this.turn;
    if (!this.tanks[this.turn].alive) {
      this.state = 'settle';
      this.settleTimer = 0.6;
      return;
    }
    this.setWind();
    this.beginTurn();
  }

  endRound() {
    this.roundOver = true;
    const [a, b] = this.tanks;
    const aOut = this.eliminated(a);
    const bOut = this.eliminated(b);

    if (aOut && bOut) {
      this.roundWinner = -1;
      this.pushFeed('DOUBLE KO — nobody wins, everybody loses');
    } else if (aOut) {
      this.roundWinner = 1;
    } else if (bOut) {
      this.roundWinner = 0;
    } else {
      // nobody eliminated yet (shouldn't normally happen) — decide on hp
      this.roundWinner = a.hp >= b.hp ? 0 : 1;
    }

    if (this.roundWinner >= 0) {
      this.wins[this.roundWinner]++;
      const w = this.tanks[this.roundWinner];
      this.showBanner(`${w.name} TAKES ROUND ${this.roundNumber}`, pick([
        'dominant. slightly rude.', 'he will mention this for weeks', 'clean work, soldier',
        'that was personal',
      ]), w.id === 0 ? 'p1' : 'p2');
      this.particles.confetti(w.x, w.y - 40, 90);
      Sfx.sfxWin();
    } else {
      this.showBanner('DOUBLE KO', 'even the terrain is embarrassed', '');
      Sfx.sfxLose();
    }

    if (this.wins[0] >= ROUNDS_TO_WIN || this.wins[1] >= ROUNDS_TO_WIN) {
      this.matchOver = true;
      this.winner = this.wins[0] >= ROUNDS_TO_WIN ? 0 : 1;
      this.pendingMatchEnd = 1.6;
      this.state = 'settle';
      this.settleTimer = 1.6;
    } else {
      this.pendingNextRound = 2.3;
      this.state = 'settle';
      this.settleTimer = 2.3;
    }
  }

  nextRound() {
    this.roundNumber++;
    this.newRound(false);
  }

  finishMatch() {
    this.state = 'gameover';
    const w = this.tanks[this.winner];
    this.particles.confetti(w ? w.x : W / 2, w ? w.y - 40 : H / 2, 200);
    this.showBanner(`${w.name} WINS THE WAR`, 'irreversible. he is telling everyone.', w.id === 0 ? 'p1' : 'p2');
    this.banner.life = 4;
    Sfx.sfxWin();
  }

  // ---------------------------------------------------------------- helpers
  pushFeed(text) {
    this.feed.push({ id: ++this.feedId, text });
    if (this.feed.length > 5) this.feed.shift();
  }

  /** Handles the little countdown transitions after a round ends. */
  tickPending(dt) {
    if (this.state !== 'settle') return;
    if (this.pendingMatchEnd > 0) {
      this.pendingMatchEnd -= dt;
      if (this.pendingMatchEnd <= 0) { this.pendingMatchEnd = 0; this.finishMatch(); }
    } else if (this.pendingNextRound > 0) {
      this.pendingNextRound -= dt;
      if (this.pendingNextRound <= 0) { this.pendingNextRound = 0; this.nextRound(); }
    }
  }

  // ---------------------------------------------------------------- rendering
  render(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    this.drawSky(ctx);
    this.drawHills(ctx);

    const sx = this.shake ? rand(-this.shake, this.shake) * 0.45 : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) * 0.45 : 0;
    ctx.save();
    ctx.translate(sx, sy);

    this.terrain.render(ctx);
    this.drawPools(ctx);
    this.drawLiquid(ctx);
    this.drawGhosts(ctx);
    for (const t of this.tanks) t.render(ctx, this.time, this.terrain);
    this.drawAimGuide(ctx);
    this.drawProjectiles(ctx);
    this.particles.draw(ctx);
    this.drawTankBars(ctx);
    this.drawLights(ctx);
    ctx.restore();

    if (this.flashWhite > 0.005) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.75, this.flashWhite);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  drawSky(ctx) {
    const s = this.sky;
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.8);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars at night
    if (s.name === 'night' || s.name === 'dusk') {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      for (let i = 0; i < 60; i++) {
        const x = (i * 137.5) % W;
        const y = (i * 71.3) % (H * 0.5);
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 1.6 + i));
        ctx.globalAlpha = tw * 0.7;
        ctx.fillRect(x, y, 1.7, 1.7);
      }
      ctx.globalAlpha = 1;
    }

    // sun / moon
    const sunX = W * 0.79, sunY = 104;
    const rGlow = 92;
    const rg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, rGlow);
    rg.addColorStop(0, rgba(hexOf(s.sun), 0.85));
    rg.addColorStop(0.35, rgba(hexOf(s.sun), 0.22));
    rg.addColorStop(1, rgba(hexOf(s.sun), 0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(sunX, sunY, rGlow, 0, 6.283);
    ctx.fill();
    ctx.fillStyle = s.sun;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 27, 0, 6.283);
    ctx.fill();

    // clouds
    for (const c of this.clouds) {
      ctx.fillStyle = s.cloud;
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 54 * c.s, 19 * c.s, 0, 0, 6.283);
      ctx.ellipse(c.x + 36 * c.s, c.y + 6 * c.s, 36 * c.s, 14 * c.s, 0, 0, 6.283);
      ctx.ellipse(c.x - 34 * c.s, c.y + 7 * c.s, 30 * c.s, 12 * c.s, 0, 0, 6.283);
      ctx.fill();
    }
  }

  drawHills(ctx) {
    const s = this.sky;
    const layers = [
      { color: s.far, base: 352, amp: 34, freq: 0.0058, off: 0 },
      { color: s.near, base: 408, amp: 42, freq: 0.0092, off: 2.1 },
    ];
    for (const L of layers) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 12) {
        const y = L.base + Math.sin(x * L.freq + L.off) * L.amp + Math.sin(x * L.freq * 2.7 + L.off) * L.amp * 0.32;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
    }

    // depth shadow: makes a crater read as a hole into darkness rather than
    // a slab of hill colour floating behind the dirt
    const vg = ctx.createLinearGradient(0, H * 0.42, 0, H);
    vg.addColorStop(0, 'rgba(4,5,12,0)');
    vg.addColorStop(1, 'rgba(4,5,12,0.92)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, H * 0.42, W, H * 0.58);
  }

  drawLiquid(ctx) {
    const y = this.gooY;
    if (y >= H) return;
    const gooey = this.gooRise;
    const top = gooey ? '#bdff3c' : '#3f9ae8';
    const bot = gooey ? '#4c7d12' : '#0d2a52';
    const g = ctx.createLinearGradient(0, y, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bot);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(this.time * 1.6) * 2.5);
    for (let x = 0; x <= W; x += 10) {
      ctx.lineTo(x, y + Math.sin(this.time * 1.7 + x * 0.021) * 3 + Math.sin(x * 0.006) * 3);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.fill();

    // dark rim + bright highlight so the surface reads as liquid
    const line = (dy, style, width, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 8) {
        const yy = y + dy + Math.sin(this.time * 1.7 + x * 0.021) * 3 + Math.sin(x * 0.006) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    };
    line(-2.5, gooey ? '#3d6b0d' : '#0b2447', 4, 0.9);
    line(0, gooey ? '#e8ffa8' : '#bfe6ff', 2.2, 0.75);
    if (gooey) line(4, 'rgba(255,255,255,0.35)', 1.2, 0.5);
    ctx.restore();
  }

  drawPools(ctx) {
    for (const p of this.pools) {
      const y = this.terrain.heightAt(p.x);
      const wob = Math.sin(this.time * 3 + p.x) * 1.4;
      ctx.save();
      // dark rim
      ctx.fillStyle = '#2f5c15';
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.ellipse(p.x, y - 1.5 + wob * 0.4, p.r + 2.5, 9.5, 0, 0, 6.283);
      ctx.fill();
      // body
      ctx.fillStyle = '#a8ee3c';
      ctx.beginPath();
      ctx.ellipse(p.x, y - 2 + wob * 0.4, p.r, 7.5, 0, 0, 6.283);
      ctx.fill();
      // gloss
      ctx.fillStyle = '#e8ffa8';
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      ctx.ellipse(p.x - p.r * 0.24, y - 4.5, p.r * 0.38, 2.4, 0, 0, 6.283);
      ctx.fill();
      // little bubbles to sell the goo
      ctx.fillStyle = 'rgba(232,255,168,0.75)';
      for (let i = 0; i < 3; i++) {
        const bx = p.x + Math.sin(this.time * 1.4 + i * 2.1 + p.x) * p.r * 0.5;
        const by = y - 3 - (Math.sin(this.time * 2 + i) * 0.5 + 0.5) * 5;
        ctx.beginPath();
        ctx.arc(bx, by, 1.3 + (i % 2) * 0.7, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawGhosts(ctx) {
    for (const t of this.tanks) {
      const tr = this.ghostTrails[t.id];
      if (tr.length < 4) continue;
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      for (let i = 0; i < tr.length; i += 2) {
        const p = tr[i];
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A deliberately short preview arc — you still have to guess. */
  drawAimGuide(ctx) {
    if (this.state !== 'aim') return;
    const t = this.tanks[this.turn];
    if (!t || !t.alive || t.charging) return;
    const pts = this.simulate(t);
    if (pts.length < 3) return;
    const show = Math.max(10, Math.floor(pts.length * 0.42));
    ctx.save();
    for (let i = 0; i < Math.min(show, pts.length); i += 2) {
      const p = pts[i];
      const k = 1 - i / Math.min(show, pts.length);
      ctx.globalAlpha = 0.16 + k * 0.5;
      ctx.fillStyle = i < 2 ? '#fff' : t.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.5 + k * 1.6, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }

  simulate(t) {
    const wpn = weaponById(t.weapon);
    const a = t.angle * Math.PI / 180;
    const v0 = (t.power / 100) * MAX_V0 * wpn.power * (wpn.cluster ? 1.22 : 1);
    const tip = t.barrelTip;
    let x = tip.x + Math.cos(a) * 12;
    let y = tip.y - Math.sin(a) * 12;
    let vx = Math.cos(a) * v0;
    let vy = -Math.sin(a) * v0;
    const dt = 1 / 60;
    const pts = [];
    for (let i = 0; i < 420; i++) {
      vy += GRAVITY * wpn.gravity * dt;
      vx += this.wind * WIND_ACC * wpn.windFactor * dt;
      x += vx * dt;
      y += vy * dt;
      if (y >= this.terrain.heightAt(x)) { pts.push({ x, y, hit: true }); break; }
      if (x < -60 || x > W + 60 || y > H + 400) break;
      pts.push({ x, y });
    }
    return pts;
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'duck') {
        ctx.rotate(Math.sin(this.time * 14) * 0.5);
        ctx.font = '26px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦆', 0, 0);
      } else if (p.kind === 'goo') {
        ctx.fillStyle = '#8de04a';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = '#2f5c15';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      } else {
        ctx.rotate(this.time * 9);
        const r = p.kind === 'cluster' ? 7 : p.kind === 'bomb' ? 8 : 5.5;
        ctx.fillStyle = '#2b3047';
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = '#0b0d17';
        ctx.lineWidth = 1.6;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.arc(-r * 0.3, -r * 0.35, r * 0.32, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawTankBars(ctx) {
    for (const t of this.tanks) {
      if (!t.alive || t.y > this.gooY) continue;
      const w = 44;
      const x = t.x - w / 2;
      const y = t.y - 52;
      ctx.save();
      ctx.fillStyle = 'rgba(5,6,13,0.72)';
      roundRect(ctx, x - 2, y - 2, w + 4, 8, 4);
      ctx.fill();
      const frac = clamp(t.hp / t.maxHp, 0, 1);
      ctx.fillStyle = frac > 0.6 ? '#5ce65c' : frac > 0.3 ? '#ffb703' : '#ff4d4d';
      roundRect(ctx, x, y, Math.max(0.001, w * frac), 4, 2);
      ctx.fill();
      if (t.goo > 0) {
        ctx.fillStyle = '#8de04a';
        ctx.beginPath();
        ctx.arc(x + w + 6, y + 2, 3.4, 0, 6.283);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawLights(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const L of this.explosionLights) {
      const k = L.life / L.max;
      const g = ctx.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r * (1.3 - k * 0.3));
      g.addColorStop(0, `rgba(255,220,150,${0.5 * k})`);
      g.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(L.x, L.y, L.r * (1.3 - k * 0.3), 0, 6.283);
      ctx.fill();
    }
    ctx.restore();
  }
}

function hexOf(c) {
  return c.startsWith('#') ? c : '#ffffff';
}

export { GOO_START_ROUND, ROUNDS_TO_WIN, RESPAWN_TIME, PIVOT_Y };
