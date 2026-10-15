// Particles + floating text. Everything the explosions need to feel loud.

import { rand, clamp } from './utils.js';

const TYPES = {
  spark: { grav: 320, drag: 0.9, fade: 0.9, shrink: 1 },
  smoke: { grav: -26, drag: 0.6, fade: 1.6, shrink: 1 },
  dirt: { grav: 900, drag: 0.35, fade: 0.8, shrink: 0.6 },
  deb: { grav: 780, drag: 0.4, fade: 0.5, shrink: 1 },
  goo: { grav: -70, drag: 0.9, fade: 0.8, shrink: 0.8 },
};

export class Particles {
  constructor(max = 1600) {
    this.max = max;
    this.items = [];
    this.texts = [];
  }

  clear() {
    this.items.length = 0;
    this.texts.length = 0;
  }

  add(x, y, vx, vy, opts = {}) {
    if (this.items.length >= this.max) return;
    const type = opts.type || 'spark';
    const base = TYPES[type] || TYPES.spark;
    const life = opts.life ?? rand(0.4, 1.1);
    this.items.push({
      x, y, vx, vy,
      life, maxLife: life,
      size: opts.size ?? rand(1.5, 3.5),
      color: opts.color || '#ffb703',
      type,
      grav: opts.grav ?? base.grav,
      drag: opts.drag ?? base.drag,
      shrink: opts.shrink ?? base.shrink,
      glow: opts.glow ?? (type === 'spark'),
      rot: rand(0, Math.PI * 2),
      spin: rand(-9, 9),
      front: !!opts.front,
    });
  }

  trail(x, y, color, size = 1.8) {
    this.add(x, y, rand(-8, 8), rand(-8, 8), {
      type: 'smoke', color, size, life: rand(0.25, 0.6),
    });
  }

  explosion(x, y, radius, color = '#ffb703', power = 1) {
    const n = Math.min(90, Math.round(radius * 1.15 * power));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.25, 1) * radius * rand(4.5, 10);
      this.add(x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.9 - rand(0, 60), {
        type: 'spark',
        color: Math.random() < 0.45 ? color : Math.random() < 0.6 ? '#fff3c4' : '#ff6b35',
        size: rand(2, 5.5),
        life: rand(0.28, 0.7),
      });
    }
    // smoke plume
    for (let i = 0; i < Math.round(radius * 0.5); i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(10, radius * 3);
      this.add(x + rand(-radius * 0.4, radius * 0.4), y + rand(-8, 8),
        Math.cos(a) * sp, Math.sin(a) * sp * 0.6 - rand(10, 60), {
          type: 'smoke',
          color: Math.random() < 0.5 ? '#8a8a92' : '#57575f',
          size: rand(6, 18),
          life: rand(0.9, 1.9),
        });
    }
    // dirt fountains
    for (let i = 0; i < Math.round(radius * 0.9); i++) {
      const a = rand(-Math.PI * 0.92, -Math.PI * 0.08);
      const sp = rand(80, radius * 7);
      this.add(x + rand(-radius * 0.5, radius * 0.5), y,
        Math.cos(a) * sp, Math.sin(a) * sp, {
          type: 'dirt',
          color: Math.random() < 0.5 ? '#5a3d27' : '#3b2717',
          size: rand(2.5, 7),
          life: rand(0.5, 1.3),
        });
    }
  }

  debris(x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(60, 340);
      this.add(x, y, Math.cos(a) * sp, Math.sin(a) * sp - rand(60, 240), {
        type: 'deb',
        color: colors[Math.floor(Math.random() * colors.length)],
        size: rand(3, 8),
        life: rand(0.7, 1.6),
      });
    }
  }

  confetti(x, y, count = 60) {
    const colors = ['#ff8a3d', '#45c8ff', '#ffd166', '#8de04a', '#ff5a9e', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI, 0);
      const sp = rand(120, 480);
      this.add(x, y, Math.cos(a) * sp, Math.sin(a) * sp, {
        type: 'deb',
        color: colors[Math.floor(Math.random() * colors.length)],
        size: rand(3, 7),
        life: rand(1.4, 3),
        grav: 420,
        drag: 0.75,
      });
    }
  }

  gooBubble(x, y) {
    this.add(x, y, rand(-16, 16), rand(-70, -30), {
      type: 'goo', color: '#8de04a', size: rand(2, 6), life: rand(0.5, 1.3), front: true,
    });
  }

  /** Splashes that should sit ON TOP of the water, not under it. */
  splash(x, y, color, count = 40) {
    for (let i = 0; i < count; i++) {
      this.add(x + rand(-16, 16), y + rand(-4, 6), rand(-140, 140), rand(-340, -70), {
        type: 'goo', color, size: rand(2, 6), life: rand(0.4, 1.1), front: true,
      });
    }
  }

  text(x, y, str, opts = {}) {
    this.texts.push({
      x, y,
      text: str,
      color: opts.color || '#fff',
      life: opts.life ?? 1.1,
      maxLife: opts.life ?? 1.1,
      vy: opts.vy ?? -46,
      size: opts.size ?? 17,
      outline: opts.outline ?? '#000',
      wobble: opts.wobble ?? 2.4,
    });
  }

  update(dt) {
    const items = this.items;
    for (let i = items.length - 1; i >= 0; i--) {
      const p = items[i];
      p.life -= dt;
      if (p.life <= 0) { items.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      const d = Math.pow(1 - p.drag, dt * 60 / 60);
      p.vx *= Math.pow(1 - p.drag * 0.06, dt * 60);
      p.vy *= Math.pow(1 - p.drag * 0.06, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      void d;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.y += t.vy * dt;
      t.vy *= 0.94;
    }
  }

  /**
   * `layer` is 'back' for everything that belongs on the terrain, 'front' for
   * splashes and bubbles that need to sit on top of the liquid.
   */
  draw(ctx, layer = 'back') {
    ctx.save();
    for (const p of this.items) {
      if ((layer === 'front') !== p.front) continue;
      const t = clamp(p.life / p.maxLife, 0, 1);
      const alpha = Math.pow(t, p.type === 'dirt' || p.type === 'deb' ? 0.75 : 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      if (p.type === 'smoke') {
        ctx.globalAlpha = alpha * 0.55;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + (1 - t) * 1.5), 0, 6.283);
        ctx.fill();
      } else if (p.type === 'deb' || p.type === 'dirt') {
        const s = p.size * (0.4 + t * 0.8);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-s / 2, -s / 2, s, s * 0.8);
        ctx.restore();
      } else {
        if (p.glow) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, p.size * (0.3 + t)), 0, 6.283);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();

    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    for (const t of this.texts) {
      const k = clamp(t.life / t.maxLife, 0, 1);
      const grow = 1 + (1 - k) * 0.25;
      ctx.globalAlpha = Math.min(1, k * 1.8);
      ctx.font = `700 ${t.size * grow}px "Comic Sans MS", "Segoe UI", system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = t.outline;
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

}
