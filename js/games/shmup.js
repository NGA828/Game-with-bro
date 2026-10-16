// DUCK INVADERS — a co-op vertical shooter.
//
// The ducks are back. Two bros share one screen, one keyboard and a small
// pile of lives while the flock tries to conquer the city.

import { clamp, rand, randInt, pick, lerp, TAU, DEG, roundRect, shade } from '../utils.js';
import { Particles } from '../particles.js';
import * as Sfx from '../audio.js';
import { PadInput, PlayerControls } from '../shared/keys.js';
import { getKeys, onChange, keyLabel, musicEnabled } from '../shared/config.js';
import { initControlsButton, openControls } from '../shared/controls.js';
import { startMusic } from '../shared/music.js';

// Wire the gear button before anything else, so the settings panel is
// reachable even if the game below trips over something while it boots.
initControlsButton('btn-controls', 'shmup');

export const W = 960;
export const H = 540;

const PLAY_TOP = 30;
const GROUND = H - 26;
const WAVE_COUNT = 8;
const BOSS_WAVE = 5;

// ---------------------------------------------------------------- player

class Ship {
  constructor(side, x) {
    this.side = side;
    this.x = x;
    this.y = GROUND - 40;
    this.speed = 330;
    this.lives = 3;
    this.cool = 0;
    this.spread = 0;         // seconds of spread shot left
    this.shield = 0;
    this.invuln = 0;
    this.alive = true;
    this.aim = 0;
  }
}

// ---------------------------------------------------------------- enemy

class Duck {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.hx = x; this.hy = y;      // home position in the formation
    this.kind = kind;              // 'grunt' | 'bomber' | 'armour'
    this.hp = kind === 'armour' ? 4 : kind === 'bomber' ? 2 : 1;
    this.maxHp = this.hp;
    this.r = kind === 'armour' ? 20 : kind === 'bomber' ? 17 : 15;
    this.phase = rand(0, TAU);
    this.cool = rand(0.6, 2.4);
    this.dive = 0;
    this.diveDir = 0;
    this.flash = 0;
    this.dead = false;
  }
}

class Boss {
  constructor(x) {
    this.x = x; this.y = 90;
    this.hp = 120;
    this.maxHp = 120;
    this.r = 58;
    this.phase = 0;
    this.cool = 1.2;
    this.flash = 0;
    this.dead = false;
    this.dir = 1;
  }
}

// ---------------------------------------------------------------- powerups

class PowerUp {
  constructor(x, y, kind) {
    this.x = x; this.y = y;
    this.kind = kind;             // 'spread' | 'life' | 'bomb' | 'shield'
    this.vy = 90;
    this.t = 0;
  }
}

// ---------------------------------------------------------------- the game

class Shmup {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = new Particles(900);
    this.state = 'title';
    this.stateT = 0;
    this.ships = [];
    this.ducks = [];
    this.bullets = [];
    this.ebullets = [];
    this.powers = [];
    this.boss = null;
    this.wave = 0;
    this.waveT = 0;
    this.score = [0, 0];
    this.scroll = 0;
    this.shake = 0;
    this.flash = 0;
    this.players = 2;
    this.banner = null;
    this.bannerT = 0;
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: rand(0, W), y: rand(0, H), s: rand(0.6, 2.2), v: rand(12, 60) });
    }
    this.city = [];
    for (let i = 0; i < 26; i++) {
      this.city.push({ x: i * 38 - 20, w: rand(24, 44), h: rand(40, 150), lit: rand() });
    }
  }

  start(players) {
    this.players = players;
    this.ships = [new Ship(0, W / 2 - 70)];
    if (players > 1) this.ships.push(new Ship(1, W / 2 + 70));
    this.ducks = [];
    this.bullets = [];
    this.ebullets = [];
    this.powers = [];
    this.boss = null;
    this.wave = 0;
    this.waveT = 0;
    this.score = [0, 0];
    this.particles.clear();
    this.state = 'wave';
    this.stateT = 0;
    this.banner = `WAVE 1`;
    this.bannerT = 1.6;
  }

  // ------------------------------------------------------------ waves
  nextWave() {
    this.wave++;
    this.banner = this.wave % BOSS_WAVE === 0 ? 'BOSS WAVE!' : `WAVE ${this.wave}`;
    this.bannerT = 1.8;
    if (this.wave % BOSS_WAVE === 0) {
      this.boss = new Boss(W / 2);
      return;
    }
    const rows = Math.min(4, 1 + Math.floor(this.wave / 2));
    const cols = Math.min(9, 5 + Math.floor(this.wave / 3));
    const kinds = this.wave > 3 ? ['grunt', 'grunt', 'bomber', 'armour'] : ['grunt', 'grunt', 'bomber'];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kind = pick(kinds);
        const x = 110 + c * 72;
        const y = 90 + r * 62;
        this.ducks.push(new Duck(x, y, kind));
      }
    }
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.scroll += 40 * dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.banner = null;
    }
    for (const s of this.stars) {
      s.y += s.v * dt;
      if (s.y > H) { s.y = -2; s.x = rand(0, W); }
    }

    if (this.state === 'title') { this.stateT += dt; return; }
    if (this.state === 'over') { this.stateT += dt; this.particles.update(dt); return; }

    this.waveT += dt;
    if (this.state === 'wave') {
      if (this.waveT > 1.6) {
        this.state = 'fight';
        this.waveT = 0;
        if (!this.ducks.length && !this.boss) this.nextWave();
      }
    }

    this.updateShips(dt, input);
    this.updateDucks(dt);
    this.updateBullets(dt);
    this.updateBoss(dt);
    this.updatePowers(dt);
    this.particles.update(dt);

    // wave clear
    if (this.state === 'fight' && !this.ducks.length && !this.boss) {
      this.state = 'wave';
      this.waveT = 0;
      this.banner = 'WAVE CLEARED';
      this.bannerT = 1.4;
      Sfx.sfxLap();
    }
    if (this.wave > WAVE_COUNT && !this.ducks.length && !this.boss) {
      this.gameOver(true);
    }
  }

  updateShips(dt, input) {
    for (const s of this.ships) {
      if (!s.alive) continue;
      const i = input[s.side];
      s.x += i.dx * s.speed * dt;
      s.y += i.dy * s.speed * dt;
      s.x = clamp(s.x, 24, W - 24);
      s.y = clamp(s.y, PLAY_TOP + 10, GROUND - 16);
      s.cool -= dt;
      s.invuln = Math.max(0, s.invuln - dt);
      s.shield = Math.max(0, s.shield - dt);
      s.spread = Math.max(0, s.spread - dt);

      if (i.fire && s.cool <= 0) {
        s.cool = 0.16;
        if (s.spread > 0) {
          for (const off of [-10, 0, 10]) {
            this.bullets.push({ x: s.x + off, y: s.y - 20, vy: -640, dmg: 1, friendly: true });
          }
        } else {
          this.bullets.push({ x: s.x, y: s.y - 20, vy: -700, dmg: 1, friendly: true });
        }
        Sfx.sfxShoot();
      }
    }
  }

  updateDucks(dt) {
    const t = this.time || 0;
    for (const d of this.ducks) {
      d.flash = Math.max(0, d.flash - dt);
      d.phase += dt * 3;
      if (d.dive > 0) {
        d.dive -= dt;
        d.x += d.diveDir * 150 * dt;
        d.y += 120 * dt;
        if (d.y > GROUND - 10) { d.dive = 0; d.y = d.hy; d.x = d.hx; }
        continue;
      }
      // formation drift
      const speed = 26 + this.wave * 3;
      const drift = Math.sin(t * 0.7) * 40;
      d.x = d.hx + drift;
      d.y = d.hy + Math.sin(d.phase) * 4;
      d.cool -= dt;
      if (d.cool <= 0 && d.y > 60) {
        d.cool = rand(1.6, 3.4);
        if (d.kind === 'bomber') {
          // dive at the nearest ship
          const target = this.nearestShip(d.x, d.y);
          if (target) {
            d.dive = 2.2;
            d.diveDir = Math.sign(target.x - d.x) || 1;
          }
        } else if (Math.random() < 0.45) {
          this.ebullets.push({ x: d.x, y: d.y + 14, vx: 0, vy: 240, r: 5 });
          Sfx.sfxEnemyShoot();
        }
      }
    }
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.flash = Math.max(0, b.flash - dt);
    b.phase += dt;
    b.x += b.dir * 60 * dt;
    if (b.x < 90 || b.x > W - 90) b.dir *= -1;
    b.y = 90 + Math.sin(b.phase * 1.4) * 16;
    b.cool -= dt;
    if (b.cool <= 0) {
      b.cool = 1.5;
      const target = this.nearestShip(b.x, b.y);
      const dir = target ? Math.sign(target.x - b.x) : 1;
      for (const off of [-26, 0, 26]) {
        this.ebullets.push({ x: b.x + off, y: b.y + 30, vx: off * 3.2, vy: 230, r: 7 });
      }
      for (const off of [-60, 60]) {
        this.ebullets.push({ x: b.x + off, y: b.y + 10, vx: dir * 150, vy: 170, r: 6 });
      }
      Sfx.sfxEnemyShoot();
    }
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.y += b.vy * dt;
      if (b.y < -20) { this.bullets.splice(i, 1); continue; }
      // hit a duck
      let hit = false;
      if (this.boss && !this.boss.dead) {
        const bo = this.boss;
        if (Math.hypot(b.x - bo.x, b.y - bo.y) < bo.r) {
          bo.hp -= b.dmg;
          bo.flash = 0.12;
          this.particles.add(b.x, b.y, rand(-60, 60), rand(-60, 60), { type: 'spark', color: '#fff3c4', size: rand(2, 4), life: 0.25 });
          if (bo.hp <= 0) {
            bo.dead = true;
            this.boss = null;
            this.explode(bo.x, bo.y, 70, '#ffd166');
            this.shake = 16;
            this.flash = 0.7;
            this.addScore(500);
            this.powers.push(new PowerUp(bo.x, bo.y, 'life'));
            Sfx.sfxExplosion(1.6);
          }
          hit = true;
        }
      }
      if (!hit) {
        for (const d of this.ducks) {
          if (d.dead) continue;
          if (Math.hypot(b.x - d.x, b.y - d.y) < d.r) {
            d.hp -= b.dmg;
            d.flash = 0.12;
            this.particles.add(b.x, b.y, rand(-70, 70), rand(-70, 70), { type: 'spark', color: '#fff3c4', size: rand(2, 4.5), life: 0.25 });
            if (d.hp <= 0) this.killDuck(d);
            hit = true;
            break;
          }
        }
      }
      if (hit) this.bullets.splice(i, 1);
    }

    // enemy bullets vs ships
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > H + 20 || b.x < -20 || b.x > W + 20) { this.ebullets.splice(i, 1); continue; }
      for (const s of this.ships) {
        if (!s.alive || s.invuln > 0) continue;
        if (Math.hypot(b.x - s.x, b.y - s.y) < 16) {
          this.hitShip(s);
          this.ebullets.splice(i, 1);
          break;
        }
      }
    }
  }

  updatePowers(dt) {
    for (let i = this.powers.length - 1; i >= 0; i--) {
      const p = this.powers[i];
      p.t += dt;
      p.y += p.vy * dt;
      if (p.y > H + 20) { this.powers.splice(i, 1); continue; }
      for (const s of this.ships) {
        if (!s.alive) continue;
        if (Math.hypot(p.x - s.x, p.y - s.y) < 24) {
          this.applyPower(s, p.kind);
          this.powers.splice(i, 1);
          break;
        }
      }
    }
  }

  killDuck(d) {
    d.dead = true;
    const idx = this.ducks.indexOf(d);
    if (idx >= 0) this.ducks.splice(idx, 1);
    this.explode(d.x, d.y, 26, '#8de04a');
    this.addScore(d.kind === 'armour' ? 60 : d.kind === 'bomber' ? 40 : 20);
    if (Math.random() < 0.07) {
      this.powers.push(new PowerUp(d.x, d.y, pick(['spread', 'spread', 'life', 'shield'])));
    }
  }

  explode(x, y, r, color) {
    this.particles.explosion(x, y, r, color, 0.8);
    this.shake = Math.max(this.shake, 6);
    Sfx.sfxExplosion(0.7);
  }

  addScore(n) {
    // the nearest living ship gets the points
    const alive = this.ships.filter((s) => s.alive);
    if (!alive.length) return;
    const s = alive[0];
    this.score[s.side] += n;
  }

  hitShip(s) {
    if (s.shield > 0) {
      s.shield = 0;
      s.invuln = 1.2;
      this.explode(s.x, s.y, 30, '#7fd4ff');
      return;
    }
    s.lives--;
    s.invuln = 2;
    this.explode(s.x, s.y, 40, '#ff8a3d');
    this.shake = 12;
    Sfx.sfxHurt();
    if (s.lives <= 0) {
      s.alive = false;
      s.x = W / 2;
      s.y = GROUND - 40;
      s.lives = 3;
      s.invuln = 3;
      this.explode(s.x, s.y, 50, '#ff4d4d');
      this.shake = 18;
      Sfx.sfxDeath();
    }
  }

  applyPower(s, kind) {
    if (kind === 'spread') {
      s.spread = 12;
      this.particles.text(s.x, s.y - 30, 'SPREAD!', { color: '#7fd4ff', size: 16 });
      Sfx.sfxPowerup();
    } else if (kind === 'life') {
      s.lives++;
      this.particles.text(s.x, s.y - 30, '1 UP', { color: '#8de04a', size: 16 });
      Sfx.sfxExtraLife();
    } else if (kind === 'shield') {
      s.shield = 8;
      this.particles.text(s.x, s.y - 30, 'SHIELD', { color: '#ffd166', size: 16 });
      Sfx.sfxPowerup();
    } else if (kind === 'bomb') {
      for (const d of [...this.ducks]) this.killDuck(d);
      if (this.boss) {
        this.boss.hp -= 40;
        if (this.boss.hp <= 0) {
          this.boss.dead = true;
          this.boss = null;
          this.explode(this.boss?.x || W / 2, 90, 70, '#ffd166');
        }
      }
      Sfx.sfxExplosion(1.5);
    }
  }

  nearestShip(x, y) {
    let best = null, bd = Infinity;
    for (const s of this.ships) {
      if (!s.alive) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  gameOver(won) {
    this.state = 'over';
    this.stateT = 0;
    this.won = won;
    Sfx.sfxGameOver();
  }

  // ------------------------------------------------------------ render
  render() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    // sky
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0d1030');
    g.addColorStop(0.6, '#2a1c4a');
    g.addColorStop(1, '#5a2a3a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars
    ctx.fillStyle = '#fff';
    for (const s of this.stars) {
      ctx.globalAlpha = 0.4 + Math.sin(s.y * 0.05) * 0.3;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // city silhouette
    ctx.save();
    for (const b of this.city) {
      const y = GROUND - b.h + Math.sin(this.scroll * 0.01) * 0;
      ctx.fillStyle = '#120b22';
      ctx.fillRect(b.x, y, b.w, b.h + 40);
      ctx.fillStyle = 'rgba(255,209,102,0.5)';
      for (let wy = y + 8; wy < GROUND - 8; wy += 14) {
        for (let wx = b.x + 5; wx < b.x + b.w - 6; wx += 11) {
          if ((wx * 3 + wy * 7) % 11 < 4) ctx.fillRect(wx, wy, 4, 6);
        }
      }
    }
    ctx.restore();

    // ground
    ctx.fillStyle = '#241033';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#3a1a4a';
    ctx.fillRect(0, GROUND, W, 3);

    if (this.state === 'title') { this.renderTitle(ctx); return; }

    // powerups
    for (const p of this.powers) this.drawPower(ctx, p);

    // ducks
    for (const d of this.ducks) this.drawDuck(ctx, d);
    if (this.boss) this.drawBoss(ctx, this.boss);

    // bullets
    ctx.fillStyle = '#fff3c4';
    for (const b of this.bullets) {
      ctx.fillRect(b.x - 2, b.y - 10, 4, 12);
    }
    for (const b of this.ebullets) {
      ctx.fillStyle = '#ff6b6b';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }

    // ships
    for (const s of this.ships) this.drawShip(ctx, s);

    this.particles.draw(ctx, 'back');
    this.particles.draw(ctx, 'front');

    this.renderHud(ctx);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.4})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (this.banner) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 44px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000';
      ctx.strokeText(this.banner, W / 2, 200);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner, W / 2, 200);
      ctx.restore();
    }

    if (this.state === 'over') {
      ctx.save();
      ctx.fillStyle = 'rgba(5,7,16,0.75)';
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.font = '700 54px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 9;
      ctx.strokeStyle = '#000';
      const title = this.won ? 'THE DUCKS ARE DEAD' : 'GAME OVER';
      ctx.strokeText(title, W / 2, H / 2 - 30);
      ctx.fillStyle = this.won ? '#8de04a' : '#ff5a5a';
      ctx.fillText(title, W / 2, H / 2 - 30);
      ctx.font = '700 18px "Comic Sans MS", system-ui, sans-serif';
      ctx.strokeText(`P1 ${this.score[0]}   —   P2 ${this.score[1]}`, W / 2, H / 2 + 6);
      ctx.fillStyle = '#fff';
      ctx.fillText(`P1 ${this.score[0]}   —   P2 ${this.score[1]}`, W / 2, H / 2 + 6);
      ctx.restore();
    }
  }

  drawDuck(ctx, d) {
    ctx.save();
    ctx.translate(d.x, d.y);
    const bob = Math.sin(d.phase) * 2;
    ctx.translate(0, bob);
    const s = d.r / 15;
    ctx.scale(s, s);
    if (d.flash > 0) {
      ctx.globalAlpha = 1;
    }
    // body
    ctx.fillStyle = d.flash > 0 ? '#ffffff' : (d.kind === 'armour' ? '#7a6a8a' : d.kind === 'bomber' ? '#8a5a3a' : '#f2f0e6');
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 12, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // wing
    ctx.fillStyle = d.flash > 0 ? '#fff' : '#d8d4c4';
    ctx.beginPath();
    ctx.ellipse(-4, 1, 8, 7, -0.3, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // head
    ctx.fillStyle = d.flash > 0 ? '#fff' : '#f2f0e6';
    ctx.beginPath();
    ctx.arc(7, -7, 7, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // beak
    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.moveTo(11, -7);
    ctx.lineTo(20, -5);
    ctx.lineTo(11, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // eye
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(8, -9, 2.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(8.6, -9, 1.3, 0, TAU);
    ctx.fill();
    if (d.kind === 'armour') {
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 18, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBoss(ctx, b) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const s = b.r / 58;
    ctx.scale(s, s);
    // body
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#3a2a4a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 58, 44, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();
    // wings
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#584066';
    for (const w of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(w * 56, 4, 30, 20, w * 0.4, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    // head
    ctx.fillStyle = b.flash > 0 ? '#fff' : '#f2f0e6';
    ctx.beginPath();
    ctx.arc(0, -30, 26, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // beak
    ctx.fillStyle = '#ff9f43';
    ctx.beginPath();
    ctx.moveTo(-9, -32);
    ctx.lineTo(9, -32);
    ctx.lineTo(0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // angry eyes
    for (const ex of [-9, 9]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, -38, 7, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(ex, -37, 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // boss health bar
    const w = 320, h = 12;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, W / 2 - w / 2 - 3, 20, w + 6, h + 6, 7);
    ctx.fill();
    ctx.fillStyle = '#ff4d4d';
    ctx.fillRect(W / 2 - w / 2, 23, w * clamp(b.hp / b.maxHp, 0, 1), h);
    ctx.font = '700 10px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.fillText('THE BIG DUCK', W / 2, 18);
    ctx.restore();
  }

  drawShip(ctx, s) {
    if (!s.alive && s.invuln <= 0) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.invuln > 0 && Math.floor(s.invuln * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    // flame
    ctx.fillStyle = '#ff9f43';
    const fl = 8 + Math.random() * 8;
    ctx.beginPath();
    ctx.moveTo(-5, 14);
    ctx.lineTo(0, 14 + fl);
    ctx.lineTo(5, 14);
    ctx.closePath();
    ctx.fill();
    // hull
    ctx.fillStyle = s.side === 0 ? '#ff8a3d' : '#45c8ff';
    ctx.beginPath();
    ctx.moveTo(0, -22);
    ctx.lineTo(15, 16);
    ctx.lineTo(0, 9);
    ctx.lineTo(-15, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    // cockpit
    ctx.fillStyle = '#1b1f2a';
    ctx.beginPath();
    ctx.ellipse(0, -4, 5, 9, 0, 0, TAU);
    ctx.fill();
    // pilot
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(0, -12, 5, 0, TAU);
    ctx.fill();
    ctx.stroke();
    if (s.shield > 0) {
      ctx.strokeStyle = '#7fd4ff';
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.5 + Math.sin(performance.now() * 0.01) * 0.2;
      ctx.beginPath();
      ctx.arc(0, -2, 24, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPower(ctx, p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    const bob = Math.sin(p.t * 6) * 3;
    ctx.translate(0, bob);
    ctx.fillStyle = p.kind === 'life' ? '#8de04a' : p.kind === 'spread' ? '#7fd4ff' : p.kind === 'shield' ? '#ffd166' : '#ff6b6b';
    roundRect(ctx, -13, -13, 26, 26, 6);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = '700 15px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.kind === 'life' ? '1' : p.kind === 'spread' ? 'S' : p.kind === 'shield' ? 'O' : 'B', 0, 5);
    ctx.restore();
  }

  renderHud(ctx) {
    for (const s of this.ships) {
      const x = s.side === 0 ? 14 : W - 150;
      ctx.save();
      ctx.textAlign = 'left';
      ctx.font = '700 14px "Comic Sans MS", system-ui, sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#000';
      const name = `P${s.side + 1}`;
      ctx.strokeText(name, x, 22);
      ctx.fillStyle = s.side === 0 ? '#ff8a3d' : '#45c8ff';
      ctx.fillText(name, x, 22);
      ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
      ctx.strokeText(`SCORE ${this.score[s.side]}`, x, 40);
      ctx.fillStyle = '#fff';
      ctx.fillText(`SCORE ${this.score[s.side]}`, x, 40);
      // lives
      for (let i = 0; i < Math.max(0, s.lives); i++) {
        ctx.fillStyle = s.side === 0 ? '#ff8a3d' : '#45c8ff';
        ctx.beginPath();
        ctx.moveTo(x + 6 + i * 16, 58);
        ctx.lineTo(x + 13 + i * 16, 48);
        ctx.lineTo(x + 20 + i * 16, 58);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText(`WAVE ${this.wave} / ${WAVE_COUNT}`, W / 2, 22);
    ctx.restore();
  }

  renderTitle(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = '700 58px "Comic Sans MS", system-ui, sans-serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000';
    const title = 'DUCK INVADERS';
    ctx.strokeText(title, W / 2, 170);
    ctx.fillStyle = '#8de04a';
    ctx.fillText(title, W / 2, 170);

    ctx.font = '700 16px "Comic Sans MS", system-ui, sans-serif';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const blink = Math.floor(this.stateT * 2) % 2 === 0;
    if (blink) {
      ctx.strokeText('PRESS ENTER TO DEFEND THE CITY', W / 2, 230);
      ctx.fillText('PRESS ENTER TO DEFEND THE CITY', W / 2, 230);
    }
    ctx.font = '700 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.strokeText('C — 1P or 2P co-op   ·   ENTER — start   ·   ESC — back to the hub', W / 2, 280);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('C — 1P or 2P co-op   ·   ENTER — start   ·   ESC — back to the hub', W / 2, 280);

    ctx.font = '700 12px "Comic Sans MS", system-ui, sans-serif';
    ctx.strokeText('P1: A/D move · F shoot      P2: ←/→ move · J shoot', W / 2, 330);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('P1: A/D move · F shoot      P2: ←/→ move · J shoot', W / 2, 330);
    ctx.restore();

    // a couple of decorative ducks
    for (let i = 0; i < 3; i++) {
      const d = new Duck(200 + i * 280, 400 + Math.sin(this.stateT * 2 + i) * 12, 'grunt');
      this.drawDuck(ctx, d);
    }
  }
}

// ---------------------------------------------------------------- boot

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);

const shmup = new Shmup(canvas);
shmup.dpr = dpr;
window.broShmup = shmup;

const pad = new PadInput();
// the key maps come from the shared settings - rebind them in the ⚙ panel
const p1 = new PlayerControls(pad, getKeys('shmup', 0), 0);
const p2 = new PlayerControls(pad, getKeys('shmup', 1), 1);

function shmupHint() {
  const k = (p, a) => keyLabel((getKeys('shmup', p)[a] || [])[0]);
  return `<b>P1</b> ${k(0, 'left')}/${k(0, 'right')} move · ${k(0, 'up')}/${k(0, 'down')} up-down · ${k(0, 'fire')} shoot &nbsp;·&nbsp; `
    + `<b>P2</b> ${k(1, 'left')}/${k(1, 'right')} move · ${k(1, 'up')}/${k(1, 'down')} up-down · ${k(1, 'fire')} shoot &nbsp;·&nbsp; `
    + `co-op: share the screen, share the blame`;
}

function refreshHint() {
  const hint = document.getElementById('hinttext');
  if (hint) hint.innerHTML = shmupHint();
}
refreshHint();
onChange(({ gameId }) => { if (!gameId || gameId === 'shmup') refreshHint(); });

const input = [
  { dx: 0, dy: 0, fire: false },
  { dx: 0, dy: 0, fire: false },
];
window.broControls = { p1, p2 };

let players = 2;

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (shmup.state === 'title' || shmup.state === 'over') {
      Sfx.initAudio();
      Sfx.resumeAudio();
      shmup.start(players);
    }
  }
  if (e.code === 'KeyC') { players = players === 2 ? 1 : 2; Sfx.sfxClick(); }
  if (e.code === 'KeyM') {
    Sfx.initAudio();
    const m = Sfx.toggleMute();
    const b = document.getElementById('btn-sound');
    if (b) b.textContent = m ? '🔇' : '🔊';
  }
  if (e.code === 'Escape') window.location.href = 'index.html';
  if (e.code === 'F1') {
    e.preventDefault();
    document.getElementById('overlay-help').classList.toggle('hidden');
  }
  if (e.code === 'F2') {
    e.preventDefault();
    openControls('shmup');
  }
});

// background music
if (musicEnabled()) startMusic('shmup');

document.getElementById('btn-help').addEventListener('click', () => {
  document.getElementById('overlay-help').classList.toggle('hidden');
});
document.getElementById('btn-close-help').addEventListener('click', () => {
  document.getElementById('overlay-help').classList.add('hidden');
});
document.getElementById('btn-sound').addEventListener('click', () => {
  Sfx.initAudio();
  Sfx.resumeAudio();
  const m = Sfx.toggleMute();
  document.getElementById('btn-sound').textContent = m ? '🔇' : '🔊';
});
document.getElementById('btn-restart').addEventListener('click', () => {
  shmup.start(players);
});
// the "◀ HUB" link is a real <a href>, this just makes it work the same
// way as the button in the other two games
const hubLink = document.getElementById('btn-hub');
if (hubLink) {
  hubLink.addEventListener('click', () => { window.location.href = 'index.html'; });
}

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

  const read = (ctl, target) => {
    const ax = ctl.axis('left', 'right');
    const ay = (ctl.down('down') ? 1 : 0) - (ctl.down('up') ? 1 : 0);
    target.dx = ax;
    target.dy = ay;
    target.fire = ctl.down('fire');
  };
  read(p1, input[0]);
  read(p2, input[1]);

  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 8) {
    shmup.update(STEP, input);
    acc -= STEP;
  }
  if (guard >= 8) acc = 0;

  shmup.render();
  pad.endFrame();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
