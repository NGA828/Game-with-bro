// BRO DUNGEON - a top-down twin-stick crawl for two bros and one keyboard.
//
// Eight rooms of a haunted crypt. Skeletons walk at you, bats dive, ghosts
// phase through the walls and something very big waits at the end.
//
// Everything is drawn in code. Fan-made homage - no official assets.

import { clamp, rand, randInt, pick, lerp, TAU, DEG, roundRect, rgba, shade, mulberry32 } from '../utils.js';
import { Particles } from '../particles.js';
import * as Sfx from '../audio.js';
import { PadInput, PlayerControls } from '../shared/keys.js';
import { getKeys, onChange, keyLabel, musicEnabled } from '../shared/config.js';
import { initControlsButton, openControls } from '../shared/controls.js';
import { startMusic } from '../shared/music.js';

export const W = 960;
export const H = 540;

const CELL = 48;
const COLS = 20;            // 20 * 48 = 960 wide
const ROWS = 10;            // 10 * 48 = 480, the rest is HUD
const ROOMS = 8;

const FLOOR = 0;
const WALL = 1;
const DOOR_L = 2;
const DOOR_R = 3;

const HERO_SPEED = 210;
const DASH_SPEED = 520;
const SWING_TIME = 0.22;
const SWING_CD = 0.36;
const DASH_TIME = 0.16;
const DASH_CD = 0.85;
const IFRAMES = 1.1;

const KINDS = {
  skeleton: { hp: 3, r: 15, speed: 82, dmg: 1, coin: 3 },
  bat: { hp: 2, r: 12, speed: 165, dmg: 1, coin: 4 },
  ghost: { hp: 4, r: 16, speed: 66, dmg: 1, coin: 6 },
  boss: { hp: 46, r: 34, speed: 104, dmg: 2, coin: 50 },
};

// ------------------------------------------------------------------ helpers

function cellCenter(cx, cy) {
  return { x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 };
}

/** can a hero stand here? */
/** does a circle of radius r fit here? checks its four corners. */
function blocked(grid, x, y, r) {
  return solidAt(grid, x - r, y - r) || solidAt(grid, x + r, y - r)
    || solidAt(grid, x - r, y + r) || solidAt(grid, x + r, y + r);
}

function solidAt(grid, x, y) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
  const t = grid[cy][cx];
  return t === WALL;
}

function doorAt(grid, x, y) {
  const cx = Math.floor(x / CELL);
  const cy = Math.floor(y / CELL);
  if (cy < 0 || cy >= ROWS || cx < 0 || cx >= COLS) return 0;
  return grid[cy][cx];
}

/** flood fill - is the far door reachable from the near one? */
function connected(grid, ax, ay, bx, by) {
  const seen = new Set();
  const key = (x, y) => y * COLS + x;
  const stack = [[ax, ay]];
  seen.add(key(ax, ay));
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x === bx && y === by) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      if (seen.has(key(nx, ny))) continue;
      if (grid[ny][nx] === WALL) continue;
      seen.add(key(nx, ny));
      stack.push([nx, ny]);
    }
  }
  return false;
}

function genRoom(rng, index) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const grid = [];
    for (let y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(WALL));
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) grid[y][x] = FLOOR;

    const doorY = 1 + Math.floor(rng() * (ROWS - 2));
    grid[doorY][0] = DOOR_L;
    grid[doorY][COLS - 1] = DOOR_R;

    // scatter pillars
    const clumps = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < clumps; i++) {
      const w = 1 + Math.floor(rng() * 3);
      const h = 1 + Math.floor(rng() * 2);
      const x = 2 + Math.floor(rng() * Math.max(1, COLS - 4 - w));
      const y = 1 + Math.floor(rng() * Math.max(1, ROWS - 2 - h));
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy === doorY || xx === 0 || xx === COLS - 1) continue;
          grid[yy][xx] = WALL;
        }
      }
    }
    if (!connected(grid, 0, doorY, COLS - 1, doorY)) continue;

    // where the monsters come from
    const spots = [];
    for (let y = 1; y < ROWS - 1; y++) {
      for (let x = 1; x < COLS - 1; x++) {
        if (grid[y][x] === FLOOR && Math.abs(x - 1) > 3) spots.push([x, y]);
      }
    }
    const count = index === ROOMS - 1 ? 3 : Math.min(6, 2 + Math.floor(index / 2));
    const enemies = [];
    for (let i = 0; i < count && spots.length; i++) {
      const at = spots.splice(Math.floor(rng() * spots.length), 1)[0];
      let kind = 'skeleton';
      if (index === ROOMS - 1 && i === 0) kind = 'boss';
      else if (index >= 1 && rng() < 0.35) kind = 'bat';
      else if (index >= 2 && rng() < 0.3) kind = 'ghost';
      enemies.push({ kind, cx: at[0], cy: at[1] });
    }
    const pickups = [];
    if (index === ROOMS - 1) {
      pickups.push({ kind: 'heart', cx: 2, cy: ROWS - 2 });
    }
    return { grid, doorY, enemies, pickups, cleared: false, spawned: false };
  }
  return null;
}

// ------------------------------------------------------------------ actors

class Hero {
  constructor(side, x, y) {
    this.side = side;
    this.x = x; this.y = y;
    this.r = 14;
    this.hp = 5;
    this.maxHp = 5;
    this.face = side === 0 ? 0 : Math.PI;
    this.swing = 0;
    this.swingCd = 0;
    this.dash = 0;
    this.dashCd = 0;
    this.dashX = 0;
    this.dashY = 0;
    this.invuln = 0;
    this.coins = 0;
    this.power = 1;
    this.shield = 0;
    this.walk = 0;
    this.dead = false;
  }
}

class Enemy {
  constructor(kind, x, y) {
    const k = KINDS[kind];
    this.kind = kind;
    this.x = x; this.y = y;
    this.hp = k.hp;
    this.maxHp = k.hp;
    this.r = k.r;
    this.speed = k.speed;
    this.dmg = k.dmg;
    this.coin = k.coin;
    this.flash = 0;
    this.t = rand(0, 6);
    this.dead = false;
    this.slam = 0;
    this.spawnCd = 4;
    this.phase = kind === 'ghost';
  }
}

// ------------------------------------------------------------------ dungeon

class Dungeon {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.fx = new Particles(900);
    this.state = 'title';
    this.rooms = [];
    this.room = 0;
    this.heroes = [];
    this.banner = null;
    this.bannerT = 0;
    this.shake = 0;
    this.time = 0;
    this.hint = '';
  }

  start() {
    const rng = mulberry32((Math.random() * 1e9) | 0);
    this.rooms = [];
    for (let i = 0; i < ROOMS; i++) this.rooms.push(genRoom(rng, i));
    this.room = 0;
    this.heroes = [
      new Hero(0, cellCenter(1, 5).x, cellCenter(1, 5).y),
      new Hero(1, cellCenter(1, 5).x + 34, cellCenter(1, 5).y),
    ];
    this.fx.clear();
    this.time = 0;
    this.enterRoom(0);
    this.state = 'play';
    this.say('ROOM 1 - GO DEEP', 2.2);
  }

  say(text, time = 1.8) {
    this.banner = text;
    this.bannerT = time;
  }

  enterRoom(index, forward = true) {
    this.room = index;
    const r = this.rooms[index];
    if (!r.spawned) {
      r.spawned = true;
      r.enemies = r.enemies.map((e) => {
        const c = cellCenter(e.cx, e.cy);
        const en = new Enemy(e.kind, c.x, c.y);
        return en;
      });
      r.pickups = r.pickups.map((p) => {
        const c = cellCenter(p.cx, p.cy);
        return { kind: p.kind, x: c.x, y: c.y, life: 0 };
      });
    }
    // put the heroes back on the door they came through
    const doorY = r.doorY;
    const c = cellCenter(forward ? 0 : COLS - 1, doorY);
    this.heroes.forEach((h, i) => {
      h.x = c.x + (forward ? 26 : -26) + i * (forward ? 30 : -30);
      h.y = c.y;
      h.swing = 0;
      h.swingCd = 0;
      h.dash = 0;
    });
  }

  get current() { return this.rooms[this.room]; }

  heroesAlive() { return this.heroes.filter((h) => !h.dead).length; }

  update(dt, input) {
    this.time += dt;
    this.fx.update(dt);
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 30);
    if (this.state !== 'play') return;

    const r = this.current;
    const alive = this.heroes.filter((h) => !h.dead);

    // ---- heroes
    for (let i = 0; i < this.heroes.length; i++) {
      const h = this.heroes[i];
      if (h.dead) continue;
      const inp = input[i];
      let dx = inp.dx, dy = inp.dy;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }

      if (h.swingCd > 0) h.swingCd -= dt;
      if (h.dashCd > 0) h.dashCd -= dt;
      if (h.invuln > 0) h.invuln -= dt;
      if (h.shield > 0) h.shield -= dt;

      if (inp.dash && h.dashCd <= 0) {
        h.dash = DASH_TIME;
        h.dashCd = DASH_CD;
        h.invuln = Math.max(h.invuln, 0.28);
        const dl = Math.hypot(dx, dy) || 1;
        h.dashX = dx / dl;
        h.dashY = dy / dl;
        Sfx.sfxWhiff();
        this.fx.trail(h.x, h.y, h.side === 0 ? '#ff8a3d' : '#45c8ff', 3);
      }
      if (inp.attack && h.swingCd <= 0) {
        h.swing = SWING_TIME;
        h.swingCd = SWING_CD;
        Sfx.sfxWhiff();
      }
      if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
        h.face = Math.atan2(dy, dx);
        h.walk += dt * 9;
      }

      let vx = dx, vy = dy;
      if (h.dash > 0) {
        h.dash -= dt;
        vx = h.dashX;
        vy = h.dashY;
        this.moveHero(h, vx * DASH_SPEED * dt, vy * DASH_SPEED * dt);
      } else {
        this.moveHero(h, vx * HERO_SPEED * dt, vy * HERO_SPEED * dt);
      }
    }

    // ---- swing damage
    for (const h of alive) {
      if (h.swing <= 0) continue;
      const reach = 44 + (h.power - 1) * 12;
      for (const e of r.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - h.x, e.y - h.y);
        if (d > reach + e.r) continue;
        const a = Math.atan2(e.y - h.y, e.x - h.x);
        let diff = Math.abs(((a - h.face + Math.PI * 3) % TAU) - Math.PI);
        if (diff > 1.15) continue;
        this.damageEnemy(e, h.power, h);
      }
    }

    // ---- enemies
    for (const e of r.enemies) {
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      const target = this.nearestHero(e.x, e.y, alive);
      let tx = target ? target.x : e.x;
      let ty = target ? target.y : e.y;

      if (e.kind === 'boss') {
        e.spawnCd -= dt;
        if (e.spawnCd <= 0) {
          e.spawnCd = 5.5;
          const spot = this.freeSpot(r);
          if (spot) {
            r.enemies.push(new Enemy('skeleton', spot.x, spot.y));
            this.fx.explosion(spot.x, spot.y, 18, '#9d7bff', 0.5);
          }
        }
        e.slam -= dt;
        if (e.slam <= 0 && target) {
          const d = Math.hypot(target.x - e.x, target.y - e.y);
          if (d < 150) {
            e.slam = 2.4;
            this.fx.explosion(e.x, e.y, 70, '#ff5a3d', 1.2);
            this.shake = 10;
            Sfx.sfxExplosion(1);
            for (const h of alive) {
              if (Math.hypot(h.x - e.x, h.y - e.y) < 110) this.hurtHero(h, 1);
            }
          }
        }
      }

      if (e.kind === 'bat') {
        tx += Math.cos(e.t * 6) * 60;
        ty += Math.sin(e.t * 7) * 60;
      }
      if (e.kind === 'ghost') {
        tx += Math.cos(e.t * 2) * 30;
        ty += Math.sin(e.t * 2.3) * 30;
      }

      const ang = Math.atan2(ty - e.y, tx - e.x);
      const sp = e.speed * (e.kind === 'boss' && e.slam > 1.9 ? 0.3 : 1);
      const mx = Math.cos(ang) * sp * dt;
      const my = Math.sin(ang) * sp * dt;
      if (!e.phase) {
        this.moveEnemy(e, mx, my);
      } else {
        e.x += mx; e.y += my;
        e.x = clamp(e.x, CELL / 2, W - CELL / 2);
        e.y = clamp(e.y, CELL / 2, ROWS * CELL - CELL / 2);
      }

      // contact damage
      for (const h of alive) {
        if (Math.hypot(h.x - e.x, h.y - e.y) < e.r + h.r - 2) this.hurtHero(h, e.dmg);
      }
    }

    // ---- pickups
    for (const p of r.pickups) {
      for (const h of alive) {
        if (p.life > 0) continue;
        if (Math.hypot(h.x - p.x, h.y - p.y) > h.r + 16) continue;
        p.life = 1;
        if (p.kind === 'coin') {
          h.coins++;
          Sfx.sfxTick();
          this.fx.text(p.x, p.y, '+1', { color: '#ffd166' });
        } else if (p.kind === 'heart') {
          h.hp = Math.min(h.maxHp, h.hp + 2);
          Sfx.sfxPowerup();
          this.fx.text(p.x, p.y, '+HP', { color: '#8de04a' });
        } else if (p.kind === 'sword') {
          h.power = Math.min(4, h.power + 1);
          Sfx.sfxPowerup();
          this.fx.text(p.x, p.y, 'SWORD UP', { color: '#45c8ff' });
        } else if (p.kind === 'shield') {
          h.shield = 6;
          Sfx.sfxPowerup();
          this.fx.text(p.x, p.y, 'SHIELD', { color: '#7b61ff' });
        }
      }
    }

    // ---- doors
    if (!r.cleared && r.enemies.every((e) => e.dead)) {
      r.cleared = true;
      this.say('THE WAY IS OPEN', 2);
      Sfx.sfxBell();
    }
    for (const h of alive) {
      const d = doorAt(r.grid, h.x, h.y);
      if (d === DOOR_R && r.cleared) {
        if (this.room === ROOMS - 1) {
          this.state = 'win';
          Sfx.sfxWin();
        } else {
          this.enterRoom(this.room + 1);
          this.say(`ROOM ${this.room + 1}`, 1.6);
        }
        break;
      }
      if (d === DOOR_L && this.room > 0) {
        this.enterRoom(this.room - 1, false);
        this.say(`ROOM ${this.room + 1}`, 1.4);
        break;
      }
    }

    // ---- death check
    if (this.heroesAlive() === 0) {
      this.state = 'over';
      Sfx.sfxLose();
    }
  }

  freeSpot(r) {
    for (let i = 0; i < 40; i++) {
      const cx = randInt(2, COLS - 3);
      const cy = randInt(1, ROWS - 2);
      if (r.grid[cy][cx] !== FLOOR) continue;
      const c = cellCenter(cx, cy);
      let taken = false;
      for (const e of r.enemies) if (!e.dead && Math.hypot(e.x - c.x, e.y - c.y) < 60) taken = true;
      if (taken) continue;
      return c;
    }
    return null;
  }

  nearestHero(x, y, alive) {
    let best = null, bd = Infinity;
    for (const h of alive) {
      const d = Math.hypot(h.x - x, h.y - y);
      if (d < bd) { bd = d; best = h; }
    }
    return best;
  }

  moveHero(h, dx, dy) {
    // walls block, doors do not - and the body is wider than a point
    const g = this.current.grid;
    const r = h.r - 3;
    if (dx && !blocked(g, h.x + dx, h.y, r)) h.x += dx;
    if (dy && !blocked(g, h.x, h.y + dy, r)) h.y += dy;
    h.x = clamp(h.x, CELL / 2, W - CELL / 2);
    h.y = clamp(h.y, CELL / 2, ROWS * CELL - CELL / 2);
  }

  moveEnemy(e, dx, dy) {
    const g = this.current.grid;
    const r = e.r - 4;
    if (dx && !blocked(g, e.x + dx, e.y, r)) e.x += dx;
    if (dy && !blocked(g, e.x, e.y + dy, r)) e.y += dy;
  }

  damageEnemy(e, amount, hero) {
    e.hp -= amount;
    e.flash = 0.12;
    this.shake = Math.max(this.shake, 3);
    Sfx.sfxHit(1);
    this.fx.explosion(e.x, e.y, 14, e.kind === 'boss' ? '#ff5a3d' : '#ffd166', 0.4);
    const a = Math.atan2(e.y - hero.y, e.x - hero.x);
    e.x += Math.cos(a) * 8;
    e.y += Math.sin(a) * 8;
    if (e.hp <= 0) {
      e.dead = true;
      hero.coins += e.coin;
      this.fx.explosion(e.x, e.y, e.kind === 'boss' ? 90 : 26, '#ffb703', e.kind === 'boss' ? 1.6 : 0.8);
      this.fx.debris(e.x, e.y, e.kind === 'boss' ? 40 : 12, ['#e8e3d0', '#9d7bff']);
      this.shake = e.kind === 'boss' ? 16 : 5;
      Sfx.sfxDeath();
      if (e.kind === 'boss') {
        this.state = 'win';
        Sfx.sfxWin();
      }
    }
  }

  hurtHero(h, amount) {
    if (h.dead) return;
    if (h.invuln > 0 || h.shield > 0) return;
    h.hp -= amount;
    h.invuln = IFRAMES;
    this.shake = 7;
    Sfx.sfxHurt();
    this.fx.explosion(h.x, h.y, 20, '#ff5a3d', 0.7);
    if (h.hp <= 0) {
      h.hp = 0;
      h.dead = true;
      this.fx.explosion(h.x, h.y, 40, '#ff5a3d', 1.2);
      Sfx.sfxDeath();
      this.say(h.side === 0 ? 'HERO RED FELL' : 'HERO BLUE FELL', 2);
    }
  }

  // ------------------------------------------------------------- rendering

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0) {
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    }
    if (this.state === 'title') {
      this.drawTitle(ctx);
      ctx.restore();
      return;
    }

    const r = this.current;
    this.drawFloor(ctx, r);
    this.drawWalls(ctx, r);
    this.drawDoors(ctx, r);
    this.drawPickups(ctx, r);
    for (const e of r.enemies) if (!e.dead) this.drawEnemy(ctx, e);
    for (const h of this.heroes) if (!h.dead) this.drawHero(ctx, h);
    this.fx.draw(ctx, 'front');
    ctx.restore();

    this.drawHud(ctx);
    if (this.bannerT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.bannerT * 2);
      ctx.fillStyle = 'rgba(0,0,0,.55)';
      ctx.fillRect(0, 250, W, 44);
      ctx.font = 'bold 24px "Comic Sans MS", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner, W / 2, 280);
      ctx.restore();
    }
    if (this.state === 'over') this.drawEnd(ctx, 'THE CRYPT KEEPS YOU', '#ff5a3d');
    if (this.state === 'win') this.drawEnd(ctx, 'DUNGEON CLEARED', '#8de04a');
  }

  drawFloor(ctx, r) {
    ctx.fillStyle = '#151327';
    ctx.fillRect(0, 0, W, ROWS * CELL);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (r.grid[y][x] === WALL) continue;
        ctx.fillStyle = (x + y) % 2 ? '#1b1836' : '#211d40';
        ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
        ctx.fillStyle = 'rgba(255,255,255,.025)';
        ctx.fillRect(x * CELL, y * CELL, CELL, 2);
      }
    }
  }

  drawWalls(ctx, r) {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (r.grid[y][x] !== WALL) continue;
        const px = x * CELL, py = y * CELL;
        ctx.fillStyle = '#3a3358';
        ctx.fillRect(px, py, CELL, CELL);
        ctx.fillStyle = '#4a4270';
        ctx.fillRect(px + 2, py + 2, CELL - 4, 8);
        ctx.fillStyle = 'rgba(0,0,0,.28)';
        ctx.fillRect(px, py + CELL - 6, CELL, 6);
        ctx.strokeStyle = 'rgba(0,0,0,.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
      }
    }
  }

  drawDoors(ctx, r) {
    const y = r.doorY * CELL;
    // left door
    ctx.fillStyle = '#120f22';
    ctx.fillRect(0, y, CELL, CELL);
    ctx.fillStyle = 'rgba(120,97,255,.35)';
    ctx.fillRect(2, y + 4, 8, CELL - 8);
    // right door
    const open = r.cleared;
    ctx.fillStyle = '#120f22';
    ctx.fillRect(W - CELL, y, CELL, CELL);
    if (open) {
      const g = ctx.createLinearGradient(W - CELL, y, W, y);
      g.addColorStop(0, 'rgba(255,209,102,0)');
      g.addColorStop(1, 'rgba(255,209,102,.85)');
      ctx.fillStyle = g;
      ctx.fillRect(W - CELL, y, CELL, CELL);
    } else {
      ctx.fillStyle = 'rgba(255,90,61,.55)';
      ctx.fillRect(W - 10, y + 4, 8, CELL - 8);
      // little lock bars
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      for (let i = 0; i < 3; i++) ctx.fillRect(W - CELL + 4, y + 10 + i * 12, CELL - 8, 4);
    }
  }

  drawPickups(ctx, r) {
    for (const p of r.pickups) {
      if (p.life > 0) continue;
      const bob = Math.sin(this.time * 3 + p.x) * 3;
      ctx.save();
      ctx.translate(p.x, p.y + bob);
      if (p.kind === 'coin') {
        ctx.fillStyle = '#ffd166';
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fill();
        ctx.fillStyle = '#b8860b';
        ctx.fillRect(-1.5, -6, 3, 12);
      } else if (p.kind === 'heart') {
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.bezierCurveTo(-14, -2, -8, -12, 0, -6);
        ctx.bezierCurveTo(8, -12, 14, -2, 0, 8);
        ctx.fill();
      } else if (p.kind === 'sword') {
        ctx.rotate(-0.6);
        ctx.fillStyle = '#cfd8ff';
        ctx.fillRect(-2, -14, 4, 18);
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(-6, 3, 12, 4);
        ctx.fillStyle = '#7b61ff';
        ctx.fillRect(-2, 7, 4, 7);
      } else if (p.kind === 'shield') {
        ctx.fillStyle = 'rgba(123,97,255,.55)';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
        ctx.strokeStyle = '#cfd8ff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawHero(ctx, h) {
    const color = h.side === 0 ? '#ff8a3d' : '#45c8ff';
    const blink = h.invuln > 0 && Math.floor(this.time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(h.x, h.y);
    if (blink) ctx.globalAlpha = 0.4;

    // cape
    ctx.fillStyle = shade(color, -0.45);
    ctx.beginPath();
    ctx.moveTo(-Math.cos(h.face) * 6, -Math.sin(h.face) * 6);
    ctx.lineTo(-Math.cos(h.face) * 20 - 4, -Math.sin(h.face) * 20 + 8);
    ctx.lineTo(-Math.cos(h.face) * 20 + 4, -Math.sin(h.face) * 20 - 8);
    ctx.closePath();
    ctx.fill();

    // body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, h.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // eyes, looking where you are going
    const ex = Math.cos(h.face) * 5, ey = Math.sin(h.face) * 5;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(ex - 4, ey - 3, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4, ey + 3, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = '#12152b';
    ctx.beginPath(); ctx.arc(ex - 4 + Math.cos(h.face), ey - 3 + Math.sin(h.face), 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(ex + 4 + Math.cos(h.face), ey + 3 + Math.sin(h.face), 1.4, 0, TAU); ctx.fill();

    // sword
    ctx.save();
    ctx.rotate(h.face);
    if (h.swing > 0) {
      const p = 1 - h.swing / SWING_TIME;
      const a = lerp(-0.9, 0.9, p);
      ctx.rotate(a);
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#cfd8ff';
      ctx.beginPath();
      ctx.arc(0, 0, 46, -0.45, 0.45);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#cfd8ff';
    ctx.fillRect(10, -2, 26, 4);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(8, -6, 4, 12);
    ctx.restore();

    // shield bubble
    if (h.shield > 0) {
      ctx.strokeStyle = 'rgba(123,97,255,.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 20, 0, TAU); ctx.stroke();
    }

    // little health pips
    for (let i = 0; i < h.maxHp; i++) {
      ctx.fillStyle = i < h.hp ? '#ff5a5a' : 'rgba(255,255,255,.16)';
      ctx.fillRect(-h.maxHp * 5 + i * 10, -h.r - 12, 8, 4);
    }
    ctx.restore();
  }

  drawEnemy(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.flash > 0) ctx.globalAlpha = 0.6;

    if (e.kind === 'skeleton') {
      ctx.fillStyle = '#e8e3d0';
      ctx.beginPath(); ctx.arc(0, -4, 10, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      ctx.beginPath(); ctx.arc(-3.5, -5, 2.4, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(3.5, -5, 2.4, 0, TAU); ctx.fill();
      ctx.fillRect(-7, 1, 14, 3);
      ctx.fillStyle = '#cfc7ae';
      ctx.fillRect(-7, 5, 5, 9);
      ctx.fillRect(2, 5, 5, 9);
    } else if (e.kind === 'bat') {
      const flap = Math.sin(e.t * 18) * 0.6;
      ctx.fillStyle = '#7b61ff';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-16, -6 + flap * 8);
      ctx.lineTo(-11, 6);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(16, -6 + flap * 8);
      ctx.lineTo(11, 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#2a2044';
      ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ff5a5a';
      ctx.fillRect(-4, -2, 2, 2);
      ctx.fillRect(2, -2, 2, 2);
    } else if (e.kind === 'ghost') {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#8fdcff';
      ctx.beginPath();
      ctx.arc(0, -2, e.r, Math.PI, 0);
      ctx.lineTo(e.r, 12);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(e.r - (i + 0.5) * (e.r * 2 / 4), i % 2 ? 12 : 6);
      }
      ctx.lineTo(-e.r, 12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b0d17';
      ctx.beginPath(); ctx.arc(-5, -3, 3, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(5, -3, 3, 0, TAU); ctx.fill();
    } else if (e.kind === 'boss') {
      const pulse = 1 + Math.sin(e.t * 4) * 0.04;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#4a2b6b';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#9d7bff';
      ctx.lineWidth = 4;
      ctx.stroke();
      // horns
      ctx.fillStyle = '#e8e3d0';
      ctx.beginPath();
      ctx.moveTo(-e.r + 4, -e.r + 10);
      ctx.lineTo(-e.r - 6, -e.r - 10);
      ctx.lineTo(-e.r + 16, -e.r + 2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(e.r - 4, -e.r + 10);
      ctx.lineTo(e.r + 6, -e.r - 10);
      ctx.lineTo(e.r - 16, -e.r + 2);
      ctx.closePath(); ctx.fill();
      // eyes
      ctx.fillStyle = '#ffd166';
      ctx.beginPath(); ctx.arc(-10, -6, 6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -6, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#12152b';
      ctx.beginPath(); ctx.arc(-10, -6, 2.5, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(10, -6, 2.5, 0, TAU); ctx.fill();
      // health bar
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(-e.r, e.r + 6, e.r * 2, 6);
      ctx.fillStyle = '#ff5a3d';
      ctx.fillRect(-e.r, e.r + 6, e.r * 2 * Math.max(0, e.hp / e.maxHp), 6);
    }
    ctx.restore();
  }

  drawHud(ctx) {
    const y0 = ROWS * CELL;
    ctx.fillStyle = 'rgba(8,10,22,.94)';
    ctx.fillRect(0, y0, W, H - y0);
    ctx.fillStyle = 'rgba(255,209,102,.35)';
    ctx.fillRect(0, y0, W, 2);

    ctx.font = 'bold 12px "Comic Sans MS", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#8f96c9';
    ctx.fillText('ROOMS', 12, y0 + 20);

    // room map
    for (let i = 0; i < ROOMS; i++) {
      const x = 12 + i * 22;
      const done = this.rooms[i].cleared;
      const here = i === this.room;
      ctx.fillStyle = here ? '#ffd166' : done ? '#45c8ff' : 'rgba(255,255,255,.16)';
      ctx.fillRect(x, y0 + 27, 16, 9);
      if (i === ROOMS - 1) {
        ctx.fillStyle = '#ff5a3d';
        ctx.fillRect(x + 4, y0 + 24, 8, 3);
      }
    }

    // players
    this.heroes.forEach((h, i) => {
      const x = 320 + i * 250;
      ctx.fillStyle = i === 0 ? '#ff8a3d' : '#45c8ff';
      ctx.fillRect(x, y0 + 12, 12, 12);
      ctx.fillStyle = '#8f96c9';
      ctx.fillText(i === 0 ? 'RED' : 'BLUE', x + 18, y0 + 22);
      for (let k = 0; k < h.maxHp; k++) {
        ctx.fillStyle = k < h.hp ? '#ff5a3a' : 'rgba(255,255,255,.16)';
        ctx.fillRect(x + 52 + k * 11, y0 + 15, 8, 8);
      }
      ctx.fillStyle = '#ffd166';
      ctx.textAlign = 'right';
      ctx.fillText(`${h.coins}`, x + 220, y0 + 22);
      ctx.textAlign = 'left';
      if (h.power > 1) {
        ctx.fillStyle = '#cfd8ff';
        ctx.fillText(`sword ${h.power}`, x + 70, y0 + 42);
      }
    });

    ctx.fillStyle = '#5b6290';
    ctx.textAlign = 'right';
    ctx.fillText('F sword  ·  G dash  ·  ENTER hub', W - 12, y0 + 42);
    ctx.textAlign = 'left';
  }

  drawTitle(ctx) {
    ctx.fillStyle = '#0b0d17';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 64px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffd166';
    ctx.fillText('BRO DUNGEON', W / 2, 210);
    ctx.font = 'bold 18px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#8f96c9';
    ctx.fillText('eight rooms · two heroes · one very big problem at the end', W / 2, 250);
    ctx.fillStyle = '#fff';
    ctx.fillText('PRESS ENTER TO DESCEND', W / 2, 320);
    ctx.font = 'bold 13px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#6d74a8';
    ctx.fillText('P1  WASD move · F sword · G dash      P2  arrows move · J sword · K dash', W / 2, 370);
  }

  drawEnd(ctx, text, color) {
    ctx.fillStyle = 'rgba(5,6,13,.86)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 46px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 220);
    ctx.font = 'bold 16px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillStyle = '#fff';
    const a = this.heroes[0], b = this.heroes[1];
    ctx.fillText(`RED ${a.coins} coins   ·   BLUE ${b.coins} coins`, W / 2, 262);
    ctx.fillStyle = '#8f96c9';
    ctx.fillText('PRESS ENTER TO GO AGAIN', W / 2, 320);
  }
}

// ------------------------------------------------------------------- boot

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = Math.round(W * dpr);
canvas.height = Math.round(H * dpr);

const dungeon = new Dungeon(canvas);
dungeon.dpr = dpr;
window.broDungeon = dungeon;

const pad = new PadInput();
const p1 = new PlayerControls(pad, getKeys('dungeon', 0), 0);
const p2 = new PlayerControls(pad, getKeys('dungeon', 1), 1);

function dungeonHint() {
  const k = (p, a) => keyLabel((getKeys('dungeon', p)[a] || [])[0]);
  return `<b>P1</b> ${k(0, 'left')}/${k(0, 'right')}/${k(0, 'up')}/${k(0, 'down')} move · ${k(0, 'light')} sword · ${k(0, 'special')} dash &nbsp;·&nbsp; `
    + `<b>P2</b> ${k(1, 'left')}/${k(1, 'right')}/${k(1, 'up')}/${k(1, 'down')} move · ${k(1, 'light')} sword · ${k(1, 'special')} dash &nbsp;·&nbsp; `
    + `clear the room, then walk through the open door`;
}
function refreshHint() {
  const hint = document.getElementById('hinttext');
  if (hint) hint.innerHTML = dungeonHint();
}
refreshHint();
onChange(({ gameId }) => { if (!gameId || gameId === 'dungeon') refreshHint(); });

const input = [
  { dx: 0, dy: 0, attack: false, dash: false },
  { dx: 0, dy: 0, attack: false, dash: false },
];
window.broControls = { p1, p2 };

function read(ctl, out) {
  const ax = ctl.axis('left', 'right');
  const ay = ctl.axis('up', 'down');
  out.dx = Math.abs(ax) > Math.abs(ctl.stick.x) ? ax : ctl.stick.x;
  out.dy = Math.abs(ay) > Math.abs(ctl.stick.y) ? ay : ctl.stick.y;
  out.attack = ctl.press('light');
  out.dash = ctl.press('special');
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (dungeon.state === 'title' || dungeon.state === 'over' || dungeon.state === 'win') {
      Sfx.initAudio();
      Sfx.resumeAudio();
      dungeon.start();
    }
  }
  if (e.code === 'F1') {
    e.preventDefault();
    document.getElementById('overlay-help').classList.toggle('hidden');
  }
  if (e.code === 'F2') {
    e.preventDefault();
    openControls('dungeon');
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

initControlsButton('btn-controls', 'dungeon');
if (musicEnabled()) startMusic('dungeon');

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
    dungeon.update(STEP, input);
    // a button press is edge triggered: handle it once, not once per step
    for (const i of input) { i.left = i.right = i.up = i.down = false; i.attack = false; i.dash = false; }
    acc -= STEP;
  }
  if (guard >= 8) acc = 0;
  dungeon.render();
  pad.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
