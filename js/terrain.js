// Destructible terrain stored as a heightmap (one surface height per pixel column).
// Craters are carved by pushing the surface DOWN, so the ground is always
// "everything below heights[x]" — that makes collision a single array lookup.

import { clamp, lerp, mulberry32, smoothstep } from './utils.js';

export class Terrain {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.bedrock = h - 22; // indestructible floor so the map never vanishes
    this.maxHeight = this.bedrock - 26; // deepest the ground can go
    this.heights = new Float32Array(w);
    this.dirt = this.makeDirtTexture(w, h);
    this.grassTufts = [];
  }

  // ---------- generation ----------
  generate(seed = Math.floor(Math.random() * 1e9)) {
    const rng = mulberry32(seed);
    const p = [rng() * 99, rng() * 99, rng() * 99, rng() * 99, rng() * 99];
    const base = this.h * 0.6 + (rng() - 0.5) * 40;
    const amps = [30, 16, 9, 4.5];
    const freqs = [0.0031, 0.0077, 0.0175, 0.038];

    // one or two broad bays that dip below the sea line — this is how bros drown
    const inlets = [];
    const inletCount = rng() < 0.45 ? 2 : 1;
    for (let i = 0; i < inletCount; i++) {
      inlets.push({
        x: 300 + rng() * 360,
        depth: 88 + rng() * 62,
        width: 78 + rng() * 72,
      });
    }

    // a proper hill in the middle: something to hide behind, and the last
    // patch of dry land once the goo starts climbing
    this.hillX = 380 + rng() * 200;
    const hillH = 66 + rng() * 62;
    const hillW = 120 + rng() * 80;

    const hs = new Float32Array(this.w);
    for (let x = 0; x < this.w; x++) {
      let y = base;
      for (let i = 0; i < 4; i++) y += amps[i] * Math.sin(x * freqs[i] + p[i] * 6.283);
      y += 2.6 * Math.sin(x * 0.13 + p[4]);
      for (const inl of inlets) {
        const d = (x - inl.x) / inl.width;
        y += inl.depth * Math.exp(-d * d);
      }
      const hd = (x - this.hillX) / hillW;
      y -= hillH * Math.exp(-hd * hd);
      // keep the hill a hill and not a needle poking out of the sky
      hs[x] = clamp(y, 190, this.maxHeight);
    }

    // gentle low-pass so it reads as rolling hills, not a saw blade
    for (let pass = 0; pass < 2; pass++) {
      const copy = hs.slice();
      for (let x = 1; x < this.w - 1; x++) hs[x] = (copy[x - 1] + copy[x] * 2 + copy[x + 1]) / 4;
    }

    // flat-ish starting pads for both bros, both safely out of the water
    this.padLeft = 130;
    this.padRight = this.w - 130;
    this.flatten(hs, this.padLeft, 90);
    this.flatten(hs, this.padRight, 90);
    this.raise(hs, this.padLeft, 108, 396);
    this.raise(hs, this.padRight, 108, 396);

    this.heights = hs;
    this.buildTufts(seed);
    return this;
  }

  flatten(hs, cx, halfW) {
    let sum = 0, n = 0;
    const x0 = Math.max(0, Math.floor(cx - halfW));
    const x1 = Math.min(this.w, Math.ceil(cx + halfW));
    for (let x = x0; x < x1; x++) { sum += hs[x]; n++; }
    const target = n ? sum / n : hs[Math.round(cx)];
    const reach = halfW + 26;
    for (let x = Math.max(0, Math.floor(cx - reach)); x < Math.min(this.w, Math.ceil(cx + reach)); x++) {
      const t = clamp(1 - Math.abs(x - cx) / reach, 0, 1);
      hs[x] = lerp(hs[x], target, smoothstep(t));
    }
  }

  /** Lift a region so its surface stays above `limit` — used for the spawn pads. */
  raise(hs, cx, halfW, limit) {
    for (let x = Math.max(0, Math.floor(cx - halfW)); x < Math.min(this.w, Math.ceil(cx + halfW)); x++) {
      const t = clamp(1 - Math.abs(x - cx) / (halfW + 30), 0, 1);
      const target = Math.min(hs[x], limit);
      hs[x] = lerp(hs[x], target, smoothstep(t));
      hs[x] = Math.min(hs[x], limit + 30 * (1 - t));
    }
  }

  buildTufts(seed) {
    const rng = mulberry32((seed >> 3) + 17);
    this.grassTufts = [];
    for (let x = 3; x < this.w - 3; x += 9) {
      if (rng() < 0.45) continue;
      const slope = Math.abs(this.heights[x + 2] - this.heights[x - 2]) / 4;
      if (slope > 1.1) continue;
      this.grassTufts.push({ x, len: 3 + rng() * 5, lean: (rng() - 0.5) * 2.4 });
    }
  }

  // ---------- queries ----------
  heightAt(x) {
    const i = clamp(Math.round(x), 0, this.w - 1);
    return this.heights[i];
  }

  /** Which tank-relative direction the ground falls away (dh/dx). */
  slopeAt(x) {
    const a = this.heightAt(x - 3);
    const b = this.heightAt(x + 3);
    return (b - a) / 6;
  }

  // ---------- destruction ----------
  /** Carve a circular hole. Returns number of columns that changed. */
  destroy(cx, cy, r) {
    let changed = 0;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r));
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const inner = r * r - dx * dx;
      if (inner <= 0) continue;
      const bottom = cy + Math.sqrt(inner);
      const next = Math.min(this.bedrock, bottom);
      if (next > this.heights[x] + 0.75) {
        this.heights[x] = next;
        changed++;
      }
    }
    if (changed) this.settle(2, 1.9, 0.22);
    return changed;
  }

  /** Loose-dirt relaxation: steep walls slump a little, which looks great. */
  settle(iterations = 2, maxSlope = 1.9, factor = 0.22) {
    const hs = this.heights;
    for (let it = 0; it < iterations; it++) {
      for (let x = 0; x < this.w - 1; x++) {
        const d = hs[x] - hs[x + 1];
        if (d > maxSlope) {
          const t = (d - maxSlope) * factor;
          hs[x] -= t; hs[x + 1] += t;
        } else if (d < -maxSlope) {
          const t = (-d - maxSlope) * factor;
          hs[x] += t; hs[x + 1] -= t;
        }
      }
      hs[0] = hs[1];
      hs[this.w - 1] = hs[this.w - 2];
    }
  }

  // ---------- rendering ----------
  makeDirtTexture(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');

    const grad = g.createLinearGradient(0, 110, 0, h);
    grad.addColorStop(0, '#6d4b2e');
    grad.addColorStop(0.28, '#5a3d27');
    grad.addColorStop(0.62, '#432c1c');
    grad.addColorStop(1, '#241710');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    const rng = mulberry32(1337);

    // strata bands
    for (let i = 0; i < 9; i++) {
      const y = 150 + rng() * (h - 170);
      const thick = 14 + rng() * 30;
      g.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.07})`;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 24) g.lineTo(x, y + Math.sin(x * 0.017 + i) * 8);
      for (let x = w; x >= 0; x -= 24) g.lineTo(x, y + thick + Math.sin(x * 0.017 + i) * 8);
      g.closePath();
      g.fill();
    }

    // pebble speckles
    for (let i = 0; i < 6000; i++) {
      const x = rng() * w;
      const y = 110 + rng() * (h - 110);
      const r = 0.5 + rng() * 2.8;
      const a = 0.05 + rng() * 0.2;
      g.fillStyle = rng() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,214,160,${a * 0.55})`;
      g.beginPath();
      g.arc(x, y, r, 0, 6.283);
      g.fill();
    }
    return c;
  }

  buildPath(ctx) {
    const hs = this.heights;
    ctx.beginPath();
    ctx.moveTo(-2, hs[0]);
    for (let x = 0; x < this.w; x++) ctx.lineTo(x, hs[x]);
    ctx.lineTo(this.w + 2, hs[this.w - 1]);
    ctx.lineTo(this.w + 2, this.h + 4);
    ctx.lineTo(-2, this.h + 4);
    ctx.closePath();
  }

  render(ctx) {
    const hs = this.heights;

    // solid mass
    ctx.save();
    this.buildPath(ctx);
    ctx.fillStyle = '#2a1a10';
    ctx.fill();
    ctx.clip();
    ctx.drawImage(this.dirt, 0, 0);
    // vignette toward the bottom
    const vg = ctx.createLinearGradient(0, this.h - 150, 0, this.h);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();

    // grass / crust line
    ctx.beginPath();
    ctx.moveTo(0, hs[0]);
    for (let x = 1; x < this.w; x++) ctx.lineTo(x, hs[x]);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f5c2a';
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = '#61a844';
    ctx.lineWidth = 3.2;
    ctx.stroke();
    ctx.strokeStyle = '#8ed35c';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // grass tufts
    ctx.strokeStyle = '#7ec850';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (const t of this.grassTufts) {
      const y = hs[t.x];
      ctx.moveTo(t.x, y);
      ctx.lineTo(t.x + t.lean, y - 2 - t.len);
    }
    ctx.stroke();
  }
}
