// Keyboard + pointer state. Discrete presses are buffered and consumed once per frame.

const BLOCK = new Set([
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Tab',
]);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressBuffer = new Set();
    this.pointer = { x: 480, y: 200, down: false, justDown: false, justUp: false, moved: false, inside: false };
    this.anyInputSinceStart = false;

    window.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressBuffer.add(e.code);
      this.anyInputSinceStart = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    const toWorld = (e) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * canvas.dataset.w * 1,
        y: ((e.clientY - r.top) / r.height) * canvas.dataset.h * 1,
      };
    };

    canvas.addEventListener('pointermove', (e) => {
      const p = toWorld(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.moved = true;
      this.pointer.inside = true;
    });
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture?.(e.pointerId);
      const p = toWorld(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.down = true;
      this.pointer.justDown = true;
      this.pointer.inside = true;
      this.anyInputSinceStart = true;
      e.preventDefault();
    });
    const up = (e) => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      this.pointer.justUp = true;
      if (e) e.preventDefault();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isDown(code) {
    return this.keys.has(code);
  }

  anyDown(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** True exactly once per physical key press. */
  consume(code) {
    if (this.pressBuffer.has(code)) {
      this.pressBuffer.delete(code);
      return true;
    }
    return false;
  }

  /** Clear per-frame flags. Call at the END of each frame. */
  endFrame() {
    this.pressBuffer.clear();
    this.pointer.justDown = false;
    this.pointer.justUp = false;
    this.pointer.moved = false;
  }
}
