// A tiny Canvas2D -> SVG recorder.
//
// Lets us render a real game frame in Node and look at the result as a PNG,
// so the hand-drawn sprites can be eyeballed without a browser.
//
//   node tools/svg-canvas.mjs > frame.svg

function mul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

const IDENT = [1, 0, 0, 1, 0, 0];

function fmt(n) {
  return Math.round(n * 100) / 100;
}

/** If a path is a plain axis aligned rectangle, describe it as one. */
function outToRect(cmds) {
  if (cmds.length !== 5) return null;
  if (cmds[0][0] !== 'M' || cmds[4][0] !== 'Z') return null;
  const pts = cmds.slice(0, 4).map((c) => [c[1], c[2]]);
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4];
    if (a[0] !== b[0] && a[1] !== b[1]) return null;
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) };
}

export class SvgCtx {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.elements = [];
    this.stack = [];
    this.m = IDENT.slice();
    this.path = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.globalAlpha = 1;
    this.font = '10px sans-serif';
    this.textAlign = 'left';
    this.textBaseline = 'alphabetic';
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.shadowBlur = 0;
    this.shadowColor = 'transparent';
    this.dash = [];
    this.canvas = { width, height };
    this.clipDefs = [];
    this.clipStack = [];
    this.clipCounter = 0;
  }

  // ---- state
  save() { this.stack.push({ m: this.m.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, font: this.font, textAlign: this.textAlign, clipDepth: this.clipStack.length }); }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.clipStack.length = s.clipDepth;
    this.m = s.m; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth; this.globalAlpha = s.globalAlpha;
    this.font = s.font; this.textAlign = s.textAlign;
  }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  translate(x, y) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  rotate(r) { this.m = mul(this.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]); }
  scale(x, y = x) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }

  // ---- paths
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push(['M', x, y]); }
  lineTo(x, y) { this.path.push(['L', x, y]); }
  closePath() { this.path.push(['Z']); }
  quadraticCurveTo(cx, cy, x, y) { this.path.push(['Q', cx, cy, x, y]); }
  bezierCurveTo(c1x, c1y, c2x, c2y, x, y) { this.path.push(['C', c1x, c1y, c2x, c2y, x, y]); }
  rect(x, y, w, h) {
    this.path.push(['M', x, y]);
    this.path.push(['L', x + w, y]);
    this.path.push(['L', x + w, y + h]);
    this.path.push(['L', x, y + h]);
    this.path.push(['Z']);
  }

  arc(x, y, r, a0, a1, ccw = false) {
    const sweep = a1 - a0;
    if (Math.abs(Math.abs(sweep) - Math.PI * 2) < 0.001) {
      const mid = a0 + Math.PI * (sweep > 0 ? 1 : -1);
      this.path.push(['M', x + r * Math.cos(a0), y + r * Math.sin(a0)]);
      this.path.push(['A', r, r, 0, 1, sweep > 0 ? 1 : 0, x + r * Math.cos(mid), y + r * Math.sin(mid)]);
      this.path.push(['A', r, r, 0, 1, sweep > 0 ? 1 : 0, x + r * Math.cos(a0), y + r * Math.sin(a0)]);
      return;
    }
    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
    const dir = sweep > 0 ? 1 : 0;
    this.path.push(['M', x + r * Math.cos(a0), y + r * Math.sin(a0)]);
    this.path.push(['A', r, r, 0, large, dir, x + r * Math.cos(a1), y + r * Math.sin(a1)]);
  }

  ellipse(x, y, rx, ry, rot, a0, a1, ccw = false) {
    const sweep = a1 - a0;
    const p0 = [x + rx * Math.cos(a0), y + ry * Math.sin(a0)];
    if (Math.abs(Math.abs(sweep) - Math.PI * 2) < 0.001) {
      const mid = a0 + Math.PI * (sweep > 0 ? 1 : -1);
      const pm = [x + rx * Math.cos(mid), y + ry * Math.sin(mid)];
      this.path.push(['M', p0[0], p0[1]]);
      this.path.push(['A', rx, ry, rot * 180 / Math.PI, 1, sweep > 0 ? 1 : 0, pm[0], pm[1]]);
      this.path.push(['A', rx, ry, rot * 180 / Math.PI, 1, sweep > 0 ? 1 : 0, p0[0], p0[1]]);
      return;
    }
    const large = Math.abs(sweep) > Math.PI ? 1 : 0;
    const dir = sweep > 0 ? 1 : 0;
    const p1 = [x + rx * Math.cos(a1), y + ry * Math.sin(a1)];
    this.path.push(['M', p0[0], p0[1]]);
    this.path.push(['A', rx, ry, rot * 180 / Math.PI, large, dir, p1[0], p1[1]]);
  }

  // ---- clipping (approximate: transform the path into root space)
  clip() {
    const id = 'clip' + (this.clipDefs.length + 1);
    const cmds = this.path.map((c) => c.slice());
    const m = this.m;
    const tp = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const out = [];
    for (const c of cmds) {
      if (c[0] === 'Z') { out.push(['Z']); continue; }
      if (c[0] === 'M' || c[0] === 'L') {
        const [x, y] = tp(c[1], c[2]);
        out.push([c[0], x, y]);
      } else if (c[0] === 'Q') {
        const [cx, cy] = tp(c[1], c[2]);
        const [x, y] = tp(c[3], c[4]);
        out.push(['Q', cx, cy, x, y]);
      } else if (c[0] === 'C') {
        const [a1, a2] = tp(c[1], c[2]);
        const [b1, b2] = tp(c[3], c[4]);
        const [x, y] = tp(c[5], c[6]);
        out.push(['C', a1, a2, b1, b2, x, y]);
      } else {
        out.push(c);
      }
    }
    if (process.env.SVG_NO_CLIP) return;
    // a plain rectangle is emitted as <rect> - resvg is happier with that
    const rect = outToRect(out);
    this.clipDefs.push({ id, cmds: out, rect });
    this.clipStack.push(id);
  }

  _clipPathData(cmds) {
    let d = '';
    for (const c of cmds) {
      if (c[0] === 'Z') { d += 'Z '; continue; }
      if (c[0] === 'A') d += `A${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])} ${c[4]} ${c[5]} ${fmt(c[6])} ${fmt(c[7])} `;
      else d += c[0] + c.slice(1).map(fmt).join(' ') + ' ';
    }
    return d.trim();
  }

  // ---- painting
  _emit(svg) {
    if (this.elements.length > 20000) this.elements.splice(0, 5000);
    this.elements.push({ svg, clip: this.clipStack.length ? this.clipStack[this.clipStack.length - 1] : null });
  }

  _pathData() {
    let d = '';
    for (const c of this.path) {
      if (c[0] === 'Z') { d += 'Z '; continue; }
      if (c[0] === 'A') d += `A${fmt(c[1])} ${fmt(c[2])} ${fmt(c[3])} ${c[4]} ${c[5]} ${fmt(c[6])} ${fmt(c[7])} `;
      else d += c[0] + c.slice(1).map(fmt).join(' ') + ' ';
    }
    return d.trim();
  }

  _color(c) {
    if (typeof c !== 'string') {
      // gradients are not supported by the recorder - use the first stop
      if (c && Array.isArray(c.stops) && c.stops.length) return this._color(c.stops[0]);
      return '#000';
    }
    if (c.startsWith('#')) return c.length === 4
      ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
      : c;
    if (c.startsWith('rgb')) return c.replace(/rgba?\(([^)]+)\)/, (_, v) => {
      const p = v.split(',').map((x) => parseFloat(x));
      return `rgb(${p[0]},${p[1]},${p[2]})`;
    });
    return c;
  }

  /** The alpha channel of a colour string (1 unless it is an rgba() with a < 1 alpha). */
  _alpha(c) {
    if (typeof c !== 'string') return 1;
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return 1;
    const p = m[1].split(',').map((x) => parseFloat(x));
    if (p.length < 4) return 1;
    return isNaN(p[3]) ? 1 : p[3];
  }

  /** fill/stroke opacity: globalAlpha multiplied by the alpha of the colour itself. */
  _opacity(c) {
    return fmt(this.globalAlpha * this._alpha(c));
  }

  fill() {
    const d = this._pathData();
    if (!d) return;
    this._emit(`<path d="${d}" fill="${this._color(this.fillStyle)}" fill-opacity="${this._opacity(this.fillStyle)}" fill-rule="nonzero" transform="matrix(${this.m.map(fmt).join(' ')})"/>`);
  }
  stroke() {
    const d = this._pathData();
    if (!d) return;
    this._emit(`<path d="${d}" fill="none" stroke="${this._color(this.strokeStyle)}" stroke-width="${fmt(this.lineWidth)}" stroke-opacity="${this._opacity(this.strokeStyle)}" stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}" ${this.dash && this.dash.length ? `stroke-dasharray="${this.dash.join(' ')}"` : ''} transform="matrix(${this.m.map(fmt).join(' ')})"/>`);
  }
  fillRect(x, y, w, h) {
    this._emit(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="${this._color(this.fillStyle)}" fill-opacity="${this._opacity(this.fillStyle)}" transform="matrix(${this.m.map(fmt).join(' ')})"/>`);
  }
  strokeRect(x, y, w, h) {
    this._emit(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(w)}" height="${fmt(h)}" fill="none" stroke="${this._color(this.strokeStyle)}" stroke-width="${fmt(this.lineWidth)}" stroke-opacity="${this._opacity(this.strokeStyle)}" transform="matrix(${this.m.map(fmt).join(' ')})"/>`);
  }
  clearRect() {}
  fillText(text, x, y) {
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font);
    const weight = /^\s*(\d{3})\s/.exec(this.font);
    const anchor = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start';
    this._emit(`<text x="${fmt(x)}" y="${fmt(y)}" font-family="Comic Sans MS, DejaVu Sans, sans-serif" font-size="${size ? size[1] : 12}" ${weight ? `font-weight="${weight[1]}"` : ''} fill="${this._color(this.fillStyle)}" fill-opacity="${this._opacity(this.fillStyle)}" text-anchor="${anchor}" transform="matrix(${this.m.map(fmt).join(' ')})">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  }
  strokeText(text, x, y) {
    const size = /(\d+(?:\.\d+)?)px/.exec(this.font);
    this._emit(`<text x="${fmt(x)}" y="${fmt(y)}" font-family="Comic Sans MS, DejaVu Sans, sans-serif" font-size="${size ? size[1] : 12}" fill="none" stroke="${this._color(this.strokeStyle)}" stroke-width="${fmt(this.lineWidth)}" stroke-linejoin="round" text-anchor="${this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' ? 'end' : 'start'}" transform="matrix(${this.m.map(fmt).join(' ')})">${String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`);
  }
  measureText(t) { return { width: String(t).length * 7 }; }
  createLinearGradient() { return { stops: [], addColorStop(o, c) { this.stops.push(c); } }; }
  createRadialGradient() { return { stops: [], addColorStop(o, c) { this.stops.push(c); } }; }
  drawImage(img, dx = 0, dy = 0) {
    const other = img && img.__ctx;
    if (!other) return;
    const base = mul(this.m, [1, 0, 0, 1, dx, dy]);
    for (const e of other.elements) {
      // compose the source element's own matrix with the current one
      let svg = e.svg;
      const m = /transform="matrix\(([^)]*)\)"/.exec(svg);
      if (m) {
        const inner = m[1].trim().split(/\s+/).map(Number);
        const composed = mul(base, inner);
        svg = svg.replace(m[0], `transform="matrix(${composed.map(fmt).join(' ')})"`);
      } else {
        svg = svg.replace('<g ', `<g transform="matrix(${base.map(fmt).join(' ')})" `);
      }
      this._emit(svg);
    }
  }
  putImageData() {}
  createPattern() { return null; }
  setLineDash(arr) { this.dash = arr; }
  getLineDash() { return this.dash || []; }
  arcTo() {}
  resetTransform() { this.m = IDENT.slice(); }

  toSVG(bg = '#0a0e20', view = null) {
    const defs = this.clipDefs.map((c) =>
      c.rect
        ? `<clipPath id="${c.id}" clipPathUnits="userSpaceOnUse"><rect x="${fmt(c.rect.x)}" y="${fmt(c.rect.y)}" width="${fmt(c.rect.w)}" height="${fmt(c.rect.h)}"/></clipPath>`
        : `<clipPath id="${c.id}" clipPathUnits="userSpaceOnUse"><path d="${this._clipPathData(c.cmds)}"/></clipPath>`).join('');
    const body = this.elements.map((e) => e.clip ? `<g clip-path="url(#${e.clip})">${e.svg}</g>` : e.svg).join('');
    const vb = view ? view.join(' ') : `0 0 ${this.width} ${this.height}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="${vb}">` +
      `<rect x="0" y="0" width="${this.width}" height="${this.height}" fill="${bg}"/>` + `<defs>${defs}</defs>` + body + '</svg>';
  }
}

/** Install a global DOM stub whose canvases return an SvgCtx. */
export function installStub(width = 960, height = 540) {
  const ctx = new SvgCtx(width, height);
  const els = new Map();
  const winHandlers = new Map();
  const makeEl = (id, own = false) => {
    const el = {
    id, style: {}, dataset: {},
    classList: { _s: new Set(), add() {}, remove() {}, contains() { return false; }, toggle() { return true; } },
    addEventListener() {}, appendChild() {}, removeChild() {},
    querySelector: () => makeEl('q'), querySelectorAll: () => [],
    getContext: () => {
      if (!own) return ctx;
      if (!el.__ctx) el.__ctx = new SvgCtx(width, height);
      return el.__ctx;
    },
    setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    textContent: '', innerHTML: '', width, height,
    };
    return el;
  };
  const win = {
    addEventListener(t, fn) { if (!winHandlers.has(t)) winHandlers.set(t, []); winHandlers.get(t).push(fn); },
    removeEventListener() {}, devicePixelRatio: 1, location: { href: '' },
  };
  globalThis.window = win;
  globalThis.document = {
    body: makeEl('body'),
    getElementById: (id) => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement: () => makeEl('new', true), addEventListener() {}, hidden: false,
  };
  Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true, writable: true });
  globalThis.performance = { now: () => Date.now() };
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  const queue = [];
  globalThis.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
  let clock = 0;
  globalThis.cancelAnimationFrame = () => {};

  return {
    ctx,
    win,
    key(code, down) {
      for (const fn of winHandlers.get(down ? 'keydown' : 'keyup') || []) {
        fn({ code, repeat: false, preventDefault() {} });
      }
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        clock += 1000 / 60;
        const cb = queue.pop();
        if (!cb) throw new Error('loop died');
        cb(clock);
      }
    },
  };
}
