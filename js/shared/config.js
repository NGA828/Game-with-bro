// Shared control configuration.
//
// Every game asks this module "which key does Player 2 press to jump?" and
// the settings panel (js/shared/controls.js) writes the answers back. The
// settings live in localStorage so they survive a reload, and the objects
// handed out here are live - change a key and the running game feels it.

const STORAGE_KEY = 'bro-arcade-config-v1';

// ---------------------------------------------------------------- defaults

// Each game lists its actions per player. `players[0]` is Player One,
// `players[1]` is Player Two.
export const GAMES = {
  artillery: {
    name: 'BRO ARTILLERY',
    players: [
      {
        label: 'Player One',
        keys: {
          left: ['KeyA', 'ArrowLeft'],
          right: ['KeyD', 'ArrowRight'],
          aimUp: ['KeyW', 'ArrowUp'],
          aimDown: ['KeyS', 'ArrowDown'],
          fire: ['Space'],
          weapon: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
          weaponPrev: ['KeyQ'],
          weaponNext: ['KeyE'],
        },
      },
      {
        label: 'Player Two',
        keys: {
          left: ['KeyA', 'ArrowLeft'],
          right: ['KeyD', 'ArrowRight'],
          aimUp: ['KeyW', 'ArrowUp'],
          aimDown: ['KeyS', 'ArrowDown'],
          fire: ['Space'],
          weapon: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'],
          weaponPrev: ['KeyQ'],
          weaponNext: ['KeyE'],
        },
      },
    ],
  },
  fighter: {
    name: 'HERO CLASH',
    players: [
      {
        label: 'Team Letters (P1)',
        keys: {
          left: ['KeyA'],
          right: ['KeyD'],
          up: ['KeyW'],
          down: ['KeyS'],
          light: ['KeyF'],
          heavy: ['KeyG'],
          special: ['KeyH'],
          super: ['KeyT'],
          confirm: ['KeyF', 'Enter'],
        },
      },
      {
        label: 'Team Numbers (P2)',
        keys: {
          left: ['ArrowLeft'],
          right: ['ArrowRight'],
          up: ['ArrowUp'],
          down: ['ArrowDown'],
          light: ['KeyJ'],
          heavy: ['KeyK'],
          special: ['KeyL'],
          super: ['KeyI'],
          confirm: ['KeyJ', 'Enter'],
        },
      },
    ],
  },
  racer: {
    name: 'TURBO BROS',
    players: [
      {
        label: 'Team Orange (P1)',
        keys: {
          left: ['KeyA'],
          right: ['KeyD'],
          accel: ['KeyW'],
          brake: ['KeyS'],
          hand: ['Space'],
          nitro: ['ShiftLeft'],
        },
      },
      {
        label: 'Team Blue (P2)',
        keys: {
          left: ['ArrowLeft'],
          right: ['ArrowRight'],
          accel: ['ArrowUp'],
          brake: ['ArrowDown'],
          hand: ['Slash'],
          nitro: ['ShiftRight'],
        },
      },
    ],
  },
  shmup: {
    name: 'DUCK INVADERS',
    players: [
      {
        label: 'Player One',
        keys: {
          left: ['KeyA'],
          right: ['KeyD'],
          up: ['KeyW'],
          down: ['KeyS'],
          fire: ['KeyF'],
          confirm: ['Enter'],
        },
      },
      {
        label: 'Player Two',
        keys: {
          left: ['ArrowLeft'],
          right: ['ArrowRight'],
          up: ['ArrowUp'],
          down: ['ArrowDown'],
          fire: ['KeyJ'],
          confirm: ['Enter'],
        },
      },
    ],
  },
};

// Human labels for the settings panel.
export const ACTION_LABELS = {
  left: 'Move left',
  right: 'Move right',
  up: 'Jump / up',
  down: 'Crouch / down',
  light: 'Light attack',
  heavy: 'Heavy attack',
  special: 'Special move',
  super: 'Super move',
  confirm: 'Confirm / pick',
  accel: 'Accelerate',
  brake: 'Brake / reverse',
  hand: 'Handbrake',
  nitro: 'Nitro',
  fire: 'Fire',
  aimUp: 'Aim up',
  aimDown: 'Aim down',
  weapon: 'Pick weapon 1-5',
  weaponPrev: 'Previous weapon',
  weaponNext: 'Next weapon',
};

const KEY_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'SPACE', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT',
  ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
  AltLeft: 'L-ALT', AltRight: 'R-ALT', MetaLeft: 'L-META', MetaRight: 'R-META',
  Slash: '/', Quote: "'", Backslash: '\\', Semicolon: ';', Comma: ',', Period: '.',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backquote: '`',
  Enter: 'ENTER', NumpadEnter: 'NUM-ENTER', Tab: 'TAB', Backspace: 'BKSP',
  CapsLock: 'CAPS', Escape: 'ESC', Delete: 'DEL', Insert: 'INS',
  Home: 'HOME', End: 'END', PageUp: 'PG-UP', PageDown: 'PG-DN',
};

/** Turn a KeyboardEvent.code into something a human can read. */
export function keyLabel(code) {
  if (!code) return '—';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'NUM ' + code.slice(6);
  if (/^F\d{1,2}$/.test(code)) return code;
  return code.toUpperCase();
}

// ---------------------------------------------------------------- state

function cloneKeys(keys) {
  const out = {};
  for (const k of Object.keys(keys)) out[k] = keys[k].slice();
  return out;
}

function defaults() {
  const out = {};
  for (const id of Object.keys(GAMES)) {
    out[id] = GAMES[id].players.map((p) => cloneKeys(p.keys));
  }
  return out;
}

const state = {
  games: defaults(),
  music: { on: true, volume: 0.55 },
};

const listeners = new Set();

function readStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      for (const id of Object.keys(state.games)) {
        const saved = data.games && data.games[id];
        if (!saved) continue;
        state.games[id].forEach((keys, p) => {
          const s = saved[p];
          if (!s) return;
          for (const action of Object.keys(keys)) {
            if (Array.isArray(s[action])) keys[action] = s[action].slice();
          }
        });
      }
      if (data.music && typeof data.music === 'object') {
        if (typeof data.music.on === 'boolean') state.music.on = data.music.on;
        if (typeof data.music.volume === 'number') {
          state.music.volume = Math.max(0, Math.min(1, data.music.volume));
        }
      }
    }
  } catch { /* private mode or broken json - defaults are fine */ }
}

function writeStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore */ }
}

readStorage();

// ---------------------------------------------------------------- api

/** The live key map for a game player. Mutating it works. */
export function getKeys(gameId, player = 0) {
  if (!state.games[gameId]) return {};
  return state.games[gameId][player] || {};
}

/** The live key map for one action. */
export function getKey(gameId, player, action) {
  const keys = getKeys(gameId, player);
  return keys[action] ? keys[action][0] : null;
}

/** All actions of a game player, in a stable order. */
export function actionsOf(gameId, player = 0) {
  return Object.keys(getKeys(gameId, player));
}

export function gameName(gameId) {
  return (GAMES[gameId] && GAMES[gameId].name) || gameId;
}

export function playerLabel(gameId, player = 0) {
  const g = GAMES[gameId];
  if (!g || !g.players[player]) return `Player ${player + 1}`;
  return g.players[player].label;
}

/** Is this key already used by another action of the same player? */
export function keyConflict(gameId, player, action, code) {
  const keys = getKeys(gameId, player);
  for (const a of Object.keys(keys)) {
    if (a === action) continue;
    if (keys[a].includes(code)) return a;
  }
  return null;
}

/** Rebind one action. `code` may be null to clear it. */
export function setKey(gameId, player, action, code) {
  const keys = getKeys(gameId, player);
  if (!keys[action]) return false;
  keys[action] = code ? [code] : [];
  writeStorage();
  emitChange(gameId, player, action);
  return true;
}

/** Put a game's bindings back to the factory defaults. */
export function resetGame(gameId) {
  if (!GAMES[gameId]) return;
  // copy the defaults back into the live objects so running games notice
  state.games[gameId].forEach((keys, p) => {
    const def = GAMES[gameId].players[p].keys;
    for (const action of Object.keys(keys)) {
      keys[action] = (def[action] || []).slice();
    }
  });
  writeStorage();
  emitChange(gameId, -1, null);
}

export function resetAll() {
  state.games = defaults();
  writeStorage();
  emitChange(null, -1, null);
}

// ---- music settings (they live next to the key bindings)

export function musicEnabled() { return state.music.on; }
export function musicVolume() { return state.music.volume; }

export function setMusicEnabled(on) {
  state.music.on = !!on;
  writeStorage();
  emitChange(null, -1, null);
}

export function setMusicVolume(v) {
  state.music.volume = Math.max(0, Math.min(1, Number(v) || 0));
  writeStorage();
  emitChange(null, -1, null);
}

// ---- change events

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitChange(gameId, player, action) {
  for (const fn of listeners) {
    try { fn({ gameId, player, action }); } catch { /* a bad listener must not break the rest */ }
  }
}

// keep two open tabs in sync
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  state.games = defaults();
  state.music = { on: true, volume: 0.55 };
  readStorage();
  emitChange(null, -1, null);
});
