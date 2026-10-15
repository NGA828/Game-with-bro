// Tank: the physics body, the visual, and the barrel.

import { clamp, rgba, roundRect, smoothstep } from './utils.js';
import { START_AMMO, DEFAULT_WEAPON } from './weapons.js';

export const TANK_W = 34;
export const TANK_H = 17;
export const BARREL_LEN = 26;
export const FUEL_PER_TURN = 62;

export class Tank {
  constructor(id, color, accent, x) {
    this.id = id;                 // 0 or 1
    this.name = id === 0 ? 'BRO 1' : 'BRO 2';
    this.color = color;
    this.accent = accent;
    this.x = x;
    this.y = 0;
    this.vy = 0;
    this.onGround = false;
    this.hp = 100;
    this.maxHp = 100;
    this.alive = true;
    this.facing = id === 0 ? 1 : -1;   // which way the tank body points
    this.angle = id === 0 ? 45 : 135;   // barrel, degrees; 0 = right, 90 = up
    this.power = 55;                    // 0..100, remembered between turns
    this.fuel = FUEL_PER_TURN;
    this.ammo = START_AMMO();
    this.weapon = DEFAULT_WEAPON;
    this.tilt = 0;                      // visual settle tilt
    this.recoil = 0;
    this.flash = 0;                     // white damage flash 0..1
    this.shakeTime = 0;
    this.trackPhase = 0;
    this.kills = 0;
    this.shots = 0;
    this.deaths = 0;
    this.goo = 0;                       // turns of goo burning
    this.pendingGoo = 0;
    this.respawnTimer = 0;
    this.respawned = 0;
    this.crown = 0;                     // 1 while winning on hp, animated in render
  }

  reset(x) {
    this.x = x;
    this.vy = 0;
    this.hp = this.maxHp;
    this.alive = true;
    this.fuel = FUEL_PER_TURN;
    this.ammo = START_AMMO();
    this.weapon = DEFAULT_WEAPON;
    this.power = 55;
    this.goo = 0;
    this.pendingGoo = 0;
    this.recoil = 0;
    this.flash = 0;
    this.shakeTime = 0;
    this.onGround = false;
    this.respawnTimer = 0;
  }

  get barrelTip() {
    const a = this.angle * Math.PI / 180;
    return {
      x: this.x + Math.cos(a) * BARREL_LEN,
      y: this.y - 13 - Math.sin(a) * BARREL_LEN,
    };
  }

  muzzlePos() {
    return this.barrelTip;
  }

  damage(amount, particles) {
    if (!this.alive) return 0;
    const before = this.hp;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.flash = Math.min(1, this.flash + amount / 22);
    const dealt = before - this.hp;
    if (dealt > 0 && particles) {
      // above the heli/helmet area so it never fights with the OOF tag
      particles.text(this.x, this.y - 96, `-${Math.round(dealt)}`, {
        color: '#ff5a5a', size: 21 + Math.min(10, dealt * 0.25),
      });
    }
    return dealt;
  }

  /** True damage from falling off a cliff / into the sea. */
  fallDamage(amount, particles) {
    if (!this.alive) return 0;
    this.hp = clamp(this.hp - amount, 0, this.maxHp);
    this.flash = Math.min(1, this.flash + 0.5);
    if (particles) {
      particles.text(this.x, this.y - 46, `-${Math.round(amount)}`, { color: '#ff9f43', size: 19 });
    }
    return amount;
  }

  heal(amount, particles) {
    if (!this.alive) return;
    const before = this.hp;
    this.hp = clamp(this.hp + amount, 0, this.maxHp);
    const got = this.hp - before;
    if (got > 0 && particles) {
      particles.text(this.x, this.y - 46, `+${Math.round(got)}`, { color: '#8de04a', size: 19 });
    }
  }

  applyGoo(turns) {
    this.pendingGoo = Math.max(this.pendingGoo, turns);
  }

  /** Called at the start of this tank's turn. */
  tickGoo(particles) {
    this.goo = Math.max(0, this.goo - 1);
    if (this.pendingGoo > 0) {
      this.goo = Math.max(this.goo, this.pendingGoo);
      this.pendingGoo = 0;
    }
    if (this.goo > 0) {
      this.hp = clamp(this.hp - 7, 0, this.maxHp);
      this.flash = Math.min(1, this.flash + 0.35);
      if (particles) particles.text(this.x, this.y - 44, '-7 GOO', { color: '#8de04a', size: 15 });
    }
  }

  settleTick(dt) {
    this.flash = Math.max(0, this.flash - dt * 1.7);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    this.shakeTime = Math.max(0, this.shakeTime - dt);
  }

  canFire() {
    return this.alive;
  }

  render(ctx, t, terrain) {
    const shake = this.shakeTime > 0 ? (Math.random() - 0.5) * 3.2 : 0;
    ctx.save();
    ctx.translate(this.x + shake, this.y + shake * 0.6);

    const dead = !this.alive;
    if (dead) ctx.globalAlpha = 0.32;

    const base = dead ? '#5a5a62' : this.color;
    const dark = dead ? '#3a3a42' : this.accent;

    // barrels (treads) — the black outline keeps the tank readable on dark dirt
    ctx.fillStyle = '#171a26';
    roundRect(ctx, -TANK_W / 2 - 2, -9, TANK_W + 4, 12, 5);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // tread notches
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const off = (this.trackPhase % 6);
    for (let i = -TANK_W / 2; i < TANK_W / 2; i += 6) {
      const px = i + off;
      ctx.moveTo(px, -8);
      ctx.lineTo(px, 2);
    }
    ctx.stroke();

    // hull
    const g = ctx.createLinearGradient(0, -18, 0, 0);
    g.addColorStop(0, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    roundRect(ctx, -TANK_W / 2, -18, TANK_W, 12, 4);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // turret dome
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(0, -18, 9, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // ...barrel
    const a = -this.angle * Math.PI / 180;
    const recoilPull = this.recoil * 6;
    ctx.save();
    ctx.translate(0, -20);
    ctx.rotate(a);
    ctx.translate(-recoilPull, 0);
    ctx.lineWidth = 2;
    const bg = ctx.createLinearGradient(0, -3.4, 0, 3.4);
    bg.addColorStop(0, dead ? '#8a8a92' : '#e6e9f5');
    bg.addColorStop(1, dead ? '#4a4a52' : '#8e93a8');
    ctx.fillStyle = bg;
    roundRect(ctx, 0, -3.4, BARREL_LEN + 5, 6.8, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // muzzle brake
    ctx.fillStyle = dead ? '#5a5a62' : '#2b3047';
    roundRect(ctx, BARREL_LEN - 1, -4.6, 6, 9.2, 2);
    ctx.fill();
    ctx.stroke();
    // muzzle glow when charged
    if (this.charging && this.alive) {
      const gl = 0.35 + 0.65 * Math.abs(Math.sin(t * 9));
      const rr = 5 + (this.power / 100) * 7;
      const rg = ctx.createRadialGradient(BARREL_LEN + 4, 0, 0, BARREL_LEN + 4, 0, rr);
      rg.addColorStop(0, `rgba(255,${Math.round(150 + 105 * (1 - this.power / 100))},60,${gl})`);
      rg.addColorStop(1, 'rgba(255,120,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(BARREL_LEN + 4, 0, rr, 0, 6.283);
      ctx.fill();
    }
    ctx.restore();

    // eyes
    if (this.alive) {
      const ex = this.facing * 3.4;
      const blink = (t * 0.7 + this.id * 1.7) % 5.5 < 0.13;
      ctx.fillStyle = '#0b0d17';
      if (blink) {
        ctx.fillRect(ex - 3.4, -25.5, 6.8, 1.6);
      } else {
        ctx.beginPath();
        ctx.arc(ex - 2.6, -25, 2.5, 0, 6.283);
        ctx.arc(ex + 2.9, -25, 2.5, 0, 6.283);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(ex - 1.7, -25.9, 0.95, 0, 6.283);
        ctx.arc(ex + 3.8, -25.9, 0.95, 0, 6.283);
        ctx.fill();
      }
    } else {
      // X eyes
      ctx.strokeStyle = '#0b0d17';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const ex = this.facing * 3.4;
      ctx.moveTo(ex - 4.6, -27); ctx.lineTo(ex - 0.6, -23);
      ctx.moveTo(ex - 0.6, -27); ctx.lineTo(ex - 4.6, -23);
      ctx.moveTo(ex + 1.6, -27); ctx.lineTo(ex + 5.6, -23);
      ctx.moveTo(ex + 5.6, -27); ctx.lineTo(ex + 1.6, -23);
      ctx.stroke();
    }

    // goo coating
    if (this.goo > 0 && this.alive) {
      ctx.fillStyle = `rgba(141,224,74,${0.35 + 0.25 * Math.sin(t * 5)})`;
      roundRect(ctx, -TANK_W / 2, -18, TANK_W, 14, 4);
      ctx.fill();
    }

    // spiky helmet while clearly ahead
    if (this.crown > 0 && this.alive) {
      ctx.save();
      ctx.translate(0, -27);
      ctx.scale(1, 0.9 * this.crown);
      ctx.fillStyle = '#c9d2e0';
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 7 - 2.2, -1);
        ctx.lineTo(i * 7, -10);
        ctx.lineTo(i * 7 + 2.2, -1);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();

    // damage flash
    if (this.flash > 0.01) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.75;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(this.x, this.y - 14, 26, 20, 0, 0, 6.283);
      ctx.fill();
      ctx.restore();
    }

    // aim guide is drawn by game.js (needs the full trajectory sim)
    void terrain; void smoothstep; void rgba;
  }
}
