// The settings panel - a pop-up where Player One and Player Two can be given
// whatever keys they like, plus the music switches.
//
//   openControls();            // all games (from the hub)
//   openControls('fighter');   // one game (from inside a game)

import {
  GAMES, getKeys, setKey, resetGame, keyLabel, keyConflict,
  ACTION_LABELS, musicEnabled, setMusicEnabled, musicVolume, setMusicVolume,
  onChange, playerLabel, gameName,
} from './config.js';
import {
  setMusicVolume as applyMusicVolume, refreshMusicVolume,
  startMusic, stopMusic, lastTrack,
} from './music.js';

let overlay = null;
let activeGame = null;
let armed = null;          // { gameId, player, action, slot }
let toastTimer = null;

const KEY_ORDER = [
  'left', 'right', 'up', 'down', 'aimUp', 'aimDown',
  'light', 'heavy', 'special', 'super', 'fire',
  'accel', 'brake', 'hand', 'nitro',
  'confirm', 'weaponPrev', 'weaponNext',
];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

function toast(msg, bad = false) {
  if (!overlay) return;
  let t = overlay.querySelector('.cfgtoast');
  if (!t) {
    t = el('div', 'cfgtoast');
    overlay.querySelector('.cfgpanel').appendChild(t);
  }
  t.textContent = msg;
  t.classList.toggle('bad', bad);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1600);
}

// ---------------------------------------------------------------- building

function keySlot(gameId, player, action) {
  const slot = el('button', 'keyslot');
  slot.type = 'button';
  const paint = () => {
    const keys = getKeys(gameId, player)[action] || [];
    slot.innerHTML = keys.length
      ? keys.map((k) => `<b>${keyLabel(k)}</b>`).join('<i>/</i>')
      : '<b class="none">—</b>';
  };
  paint();
  slot.addEventListener('click', (e) => {
    e.stopPropagation();
    arm(gameId, player, action, slot);
  });
  slot._paint = paint;
  return slot;
}

function actionRow(gameId, player, action) {
  const row = el('div', 'cfgrow');
  row.appendChild(el('span', 'cfglabel', ACTION_LABELS[action] || action));
  const slot = keySlot(gameId, player, action);
  row.appendChild(slot);
  return row;
}

function playerColumn(gameId, player) {
  const col = el('div', 'cfgcol');
  col.appendChild(el('h3', 'cfgphead', playerLabel(gameId, player)));
  const keys = getKeys(gameId, player);
  const actions = KEY_ORDER.filter((a) => keys[a]);
  for (const a of Object.keys(keys)) if (!actions.includes(a)) actions.push(a);
  for (const a of actions) col.appendChild(actionRow(gameId, player, a));
  return col;
}

function buildGame(gameId) {
  const wrap = el('div', 'cfgbody');
  wrap.appendChild(playerColumn(gameId, 0));
  wrap.appendChild(playerColumn(gameId, 1));
  return wrap;
}

function buildTabs(onPick) {
  const tabs = el('div', 'cfgtabs');
  for (const id of Object.keys(GAMES)) {
    const b = el('button', 'cfgtab', gameName(id));
    b.type = 'button';
    b.dataset.game = id;
    b.addEventListener('click', () => onPick(id));
    tabs.appendChild(b);
  }
  return tabs;
}

function buildMusic() {
  const box = el('div', 'cfgmusic');
  const row = el('div', 'cfgmrow');
  const label = el('span', 'cfglabel', 'Background music');
  row.appendChild(label);

  const toggle = el('button', 'cfgtoggle', '');
  toggle.type = 'button';
  const paint = () => {
    const on = musicEnabled();
    toggle.innerHTML = `<span class="knob"></span><b>${on ? 'ON' : 'OFF'}</b>`;
    toggle.classList.toggle('on', on);
  };
  toggle.addEventListener('click', () => {
    const on = !musicEnabled();
    setMusicEnabled(on);
    if (on) {
      const track = lastTrack();
      if (track) startMusic(track);
    } else {
      stopMusic();
    }
    paint();
  });
  paint();
  row.appendChild(toggle);

  const slider = el('input', 'cfgslider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(musicVolume() * 100));
  slider.addEventListener('input', () => {
    setMusicVolume(Number(slider.value) / 100);
    applyMusicVolume(Number(slider.value) / 100);
  });
  row.appendChild(slider);
  const vol = el('span', 'cfgvol', `${Math.round(musicVolume() * 100)}%`);
  slider.addEventListener('input', () => { vol.textContent = `${slider.value}%`; });
  row.appendChild(vol);
  box.appendChild(row);
  return box;
}

// ---------------------------------------------------------------- panel

function ensureOverlay() {
  if (overlay) return overlay;
  overlay = el('div', 'cfgoverlay hidden');
  // The panel must show up even if a stylesheet fails to load, so the
  // critical bits (fixed, full screen, on top) are set inline as well.
  overlay.style.cssText =
    'position:fixed;left:0;top:0;right:0;bottom:0;z-index:120;' +
    'align-items:center;justify-content:center;display:none;';
  const panel = el('div', 'cfgpanel');

  const head = el('div', 'cfghead');
  head.appendChild(el('h1', 'cfgtitle', 'CONTROLS'));
  const close = el('button', 'cfgclose', '✕');
  close.type = 'button';
  close.addEventListener('click', closeControls);
  head.appendChild(close);
  panel.appendChild(head);

  const tabsSlot = el('div', 'cfgtabslot');
  panel.appendChild(tabsSlot);

  const bodySlot = el('div', 'cfgbodyslot');
  panel.appendChild(bodySlot);

  panel.appendChild(buildMusic());

  const foot = el('div', 'cfgfoot');
  const reset = el('button', 'cfgbtn ghost', 'RESET DEFAULTS');
  reset.type = 'button';
  reset.addEventListener('click', () => {
    if (!activeGame) return;
    resetGame(activeGame);
    refresh(activeGame);
    toast('BACK TO THE FACTORY KEYS');
  });
  foot.appendChild(reset);
  const done = el('button', 'cfgbtn', 'DONE');
  done.type = 'button';
  done.addEventListener('click', closeControls);
  foot.appendChild(done);
  panel.appendChild(foot);

  overlay.appendChild(panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeControls();
  });
  document.body.appendChild(overlay);

  window.addEventListener('keydown', captureKey, true);
  return overlay;
}

function refresh(gameId) {
  if (!overlay) return;
  const slot = overlay.querySelector('.cfgbodyslot');
  const tabs = overlay.querySelector('.cfgtabslot');
  slot.innerHTML = '';
  tabs.innerHTML = '';
  activeGame = gameId;
  slot.appendChild(buildGame(gameId));
  if (Object.keys(GAMES).length > 1) {
    tabs.appendChild(buildTabs((id) => refresh(id)));
  }
  for (const b of tabs.querySelectorAll('.cfgtab')) {
    b.classList.toggle('active', b.dataset.game === gameId);
  }
}

/** Open the settings panel. `gameId` scopes it to a single game. */
export function openControls(gameId = null) {
  ensureOverlay();
  overlay.classList.remove('hidden');
  overlay.style.display = 'flex';
  document.body.classList.add('cfg-locked');
  refresh(gameId || Object.keys(GAMES)[0]);
}

export function closeControls() {
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.style.display = 'none';
  document.body.classList.remove('cfg-locked');
  disarm();
}

/** Wire a button so it opens the panel. */
export function initControlsButton(button, gameId = null) {
  const el2 = typeof button === 'string' ? document.getElementById(button) : button;
  if (el2) {
    el2.addEventListener('click', (e) => {
      e.stopPropagation();
      openControls(gameId);
    });
    // F2 always works, even if the button itself is covered by something
    el2.dataset.cfgGame = gameId || '';
    return;
  }
  // the button is not in the DOM yet - look for it for a short while
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const b = typeof button === 'string' ? document.getElementById(button) : button;
    if (b) {
      clearInterval(timer);
      initControlsButton(b, gameId);
    } else if (tries > 40) {
      clearInterval(timer);
    }
  }, 50);
}

// ---------------------------------------------------------------- rebinding

function arm(gameId, player, action, slot) {
  disarm();
  armed = { gameId, player, action, slot };
  slot.classList.add('armed');
  slot.innerHTML = '<b class="none">PRESS A KEY…</b>';
}

function disarm() {
  if (armed && armed.slot) {
    armed.slot.classList.remove('armed');
    if (armed.slot._paint) armed.slot._paint();
  }
  armed = null;
}

function captureKey(e) {
  if (!overlay || overlay.classList.contains('hidden')) return;
  // the panel is modal: the game underneath must not react to the keys
  e.preventDefault();
  e.stopPropagation();
  if (!armed) {
    if (e.code === 'Escape') closeControls();
    return;
  }
  if (e.code === 'Escape') {
    disarm();
    return;
  }
  const { gameId, player, action } = armed;
  const clash = keyConflict(gameId, player, action, e.code);
  setKey(gameId, player, action, e.code);
  disarm();
  if (clash) {
    toast(`THAT KEY IS ALREADY ${(ACTION_LABELS[clash] || clash).toUpperCase()}`, true);
  } else {
    toast(`${keyLabel(e.code)} BOUND`);
  }
}

// keep the panel in sync when the config changes elsewhere
onChange(({ gameId }) => {
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (gameId && gameId !== activeGame) return;
  refresh(activeGame);
});

export function controlsOpen() {
  return !!overlay && !overlay.classList.contains('hidden');
}
