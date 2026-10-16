// Shared input layer for the two-player games.
//
// Every new game speaks the same language:
//
//   const pad = new PadInput();
//   pad.down('left')        -> is the key / gamepad button held?
//   pad.press('jump')       -> was it pressed this frame? (consumed once)
//   pad.axis('steer')       -> -1..1 analogue steer (gamepad stick, keyboard fallback)
//
// Bindings are per-player objects so two humans can share one keyboard.
// If a gamepad is plugged in it overrides that player's keyboard bindings.

const KEY_BLOCK = new Set([
  'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Slash', 'Quote', 'Backslash', 'Tab',
]);

export class PadInput {
  constructor() {
    this.keys = new Set();
    this.pressBuffer = new Set();
    this.released = new Set();
    this.gamepadIndex = null;
    this.pads = [];

    window.addEventListener('keydown', (e) => {
      if (KEY_BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressBuffer.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });
  }

  /** Poll the gamepad list once per frame. */
  poll() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pads = [];
    for (const g of list) {
      if (g && g.connected) this.pads.push(g);
    }
  }

  isDown(code) {
    return this.keys.has(code);
  }

  anyDown(...codes) {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** True exactly once per physical key press. */
  press(code) {
    if (this.pressBuffer.has(code)) {
      this.pressBuffer.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressBuffer.clear();
    this.released.clear();
  }
}

/**
 * A single player's control surface: keyboard bindings plus an optional
 * gamepad. `bindings` maps an action name to an array of KeyboardEvent.code
 * values.
 */
export class PlayerControls {
  constructor(pad, bindings, gamepadIndex = 0) {
    this.pad = pad;
    this.bindings = bindings;
    this.gamepadIndex = gamepadIndex;
    this.prevButtons = [];
    this.stick = { x: 0, y: 0 };
    this.pressed = new Set();
  }

  _pad() {
    const list = this.pad.pads;
    return list[this.gamepadIndex] || null;
  }

  /** Call at the start of every frame. */
  update() {
    this.pressed.clear();
    const g = this._pad();
    this.stick.x = 0;
    this.stick.y = 0;
    this.padBtns = {};
    if (g) {
      const ax = g.axes[0] || 0;
      const ay = g.axes[1] || 0;
      if (Math.abs(ax) > 0.18) this.stick.x = ax;
      if (Math.abs(ay) > 0.18) this.stick.y = ay;
      for (let i = 0; i < g.buttons.length; i++) {
        const b = g.buttons[i];
        const now = b.pressed || b.value > 0.5;
        this.padBtns[i] = now;
        if (now && !this.prevButtons[i]) this.pressed.add('btn' + i);
      }
      this.prevButtons = g.buttons.map((b) => b.pressed || b.value > 0.5);
    } else {
      this.prevButtons = [];
    }
  }

  down(action) {
    const codes = this.bindings[action];
    if (codes && this.pad.anyDown(...codes)) return true;
    const gp = GAMEPAD_BUTTONS[action];
    if (gp && this.padBtns && this.padBtns[gp]) return true;
    return false;
  }

  /** True once per press (key or gamepad button). */
  press(action) {
    const codes = this.bindings[action];
    if (codes) {
      for (const c of codes) {
        if (this.pad.press(c)) return true;
      }
    }
    const gp = GAMEPAD_BUTTONS[action];
    if (gp && this.pressed.has('btn' + gp)) return true;
    return false;
  }

  /** -1..1 analogue, keyboard left/right blended with the stick. */
  axis(negAction, posAction) {
    let v = 0;
    if (this.down(negAction)) v -= 1;
    if (this.down(posAction)) v += 1;
    if (Math.abs(this.stick.x) > 0.18) v = this.stick.x;
    return v;
  }
}

// Standard gamepad mapping (Xbox-style layout).
export const GAMEPAD_BUTTONS = {
  a: 0,      // cross
  b: 1,      // circle
  x: 2,      // square
  y: 3,      // triangle
  lb: 4,
  rb: 5,
  lt: 6,
  rt: 7,
  back: 8,
  start: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  // aliases used by the games
  super: 0,
  special: 1,
  light: 2,
  heavy: 3,
  boost: 7,
  confirm: 9,
};

/** Read a standard gamepad's d-pad as a virtual axis (for older pads). */
export function padDpad(gamepad) {
  if (!gamepad) return { x: 0, y: 0 };
  const b = gamepad.buttons;
  let x = 0, y = 0;
  if (b[14]?.pressed) x -= 1;
  if (b[15]?.pressed) x += 1;
  if (b[12]?.pressed) y -= 1;
  if (b[13]?.pressed) y += 1;
  return { x, y };
}
