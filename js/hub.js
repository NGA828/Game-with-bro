// The hub: builds the game cards, runs the first-load picker pop-up.

import * as Sfx from './audio.js';

// Defensive again: a stale audio.js must not break the hub.
const initAudio = Sfx.initAudio || (() => {});
const resumeAudio = Sfx.resumeAudio || (() => {});
const sfxClick = Sfx.sfxClick || (() => {});
const sfxConfirm = Sfx.sfxConfirm || (() => {});
import { initControlsButton, openControls } from './shared/controls.js';
import { startMusic } from './shared/music.js';
import { musicEnabled } from './shared/config.js';

// Wire the gear buttons before anything else, so the settings panel is
// reachable even if something below trips over while the hub boots.
initControlsButton('btn-controls', null);
initControlsButton('btn-picker-controls', null);

const GAMES = [
  {
    id: 'artillery',
    name: 'BRO ARTILLERY',
    blurb: 'Two tanks, one keyboard, and a hill that will betray you. Blast craters, launch a psychopathic duck, wait for the goo.',
    art: 'img/art-artillery.jpg',
    emoji: '🎯',
    tags: ['2P hot-seat', 'turn-based', 'the classic'],
    accent: ['#ff8a3d', '#ff5a3d'],
    href: 'artillery.html',
  },
  {
    id: 'fighter',
    name: 'HERO CLASH',
    blurb: 'King of Fighters, but the roster is My Hero Academia. All Might vs All For One, quirks flying, best of three rounds.',
    art: 'img/art-fighter.jpg',
    emoji: '🥊',
    tags: ['2P + VS CPU', 'best of 3', 'NEW'],
    accent: ['#ffd166', '#ff8a3d'],
    href: 'fighter.html',
  },
  {
    id: 'racer',
    name: 'TURBO BROS',
    blurb: 'Top-down split-screen racing. Drift round the rooftop circuit, steal the nitro, put your bro in the wall.',
    art: 'img/art-racer.jpg',
    emoji: '🏎️',
    tags: ['2P split-screen', '3 laps', 'NEW'],
    accent: ['#45c8ff', '#7b61ff'],
    href: 'racer.html',
  },
  {
    id: 'dungeon',
    name: 'BRO DUNGEON',
    blurb: 'A twin-stick crawl through eight rooms of haunted crypt. Skeletons, ghosts, loot, and something the size of the fridge.',
    art: 'img/art-dungeon.jpg',
    emoji: '🗡️',
    tags: ['2P co-op', '8 rooms', 'NEW'],
    accent: ['#9d7bff', '#4b2ea8'],
    href: 'dungeon.html',
  },
  {
    id: 'pizza',
    name: 'PIZZA RUSH',
    blurb: 'Two chefs, one kitchen, one oven. Build the pizza they ordered, bake it, and serve it before they walk out.',
    art: 'img/art-pizza.jpg',
    emoji: '🍕',
    tags: ['2P versus', '75s shift', 'NEW'],
    accent: ['#ff6b35', '#ffd166'],
    href: 'pizza.html',
  },
  {
    id: 'shmup',
    name: 'DUCK INVADERS',
    blurb: 'The ducks are back and they are angry. Co-op vertical shooter: hold the line, share the lives, blame the other bro.',
    art: 'img/art-shmup.jpg',
    emoji: '🦆',
    tags: ['2P co-op', 'endless waves', 'NEW'],
    accent: ['#8de04a', '#45c8ff'],
    href: 'shmup.html',
  },
];

const SOON = [
  {
    name: 'BRO SNAKE',
    blurb: 'Two snakes, one board, and a corner that is definitely not a wall. Growing, biting, regretting.',
    emoji: '🐍',
    accent: ['#8de04a', '#2f7a32'],
  },
  {
    name: 'BRO QUIZ',
    blurb: 'Hot-seat trivia. Twenty questions, one winner, and at least one argument about the capital of Norway.',
    emoji: '🧠',
    accent: ['#45c8ff', '#7b61ff'],
  },
  {
    name: 'BRO SOCCER',
    blurb: 'Top-down one-a-side football on a tiny pitch. Two goals, ten minutes, and a keeper who cannot move.',
    emoji: '⚽',
    accent: ['#8de04a', '#1b7a3a'],
  },
  {
    name: 'BRO BLOCKS',
    blurb: 'Falling blocks, hot-seat. Stack them, clear the lines, and blame the bro who left a gap.',
    emoji: '🧱',
    accent: ['#7b61ff', '#ffd166'],
  },
];

function cardHtml(g) {
  const tags = g.tags.map((t) => `<span class="tag">${t}</span>`).join('');
  return `
    <a class="card" href="${g.href}" style="--a1:${g.accent[0]};--a2:${g.accent[1]}">
      <div class="cardart">
        <img src="${g.art}" alt="" loading="lazy" onerror="this.style.display='none'">
        <span class="cardemoji">${g.emoji}</span>
      </div>
      <div class="cardbody">
        <h3>${g.name}</h3>
        <p>${g.blurb}</p>
        <div class="tags">${tags}</div>
      </div>
      <div class="cardgo">PLAY ▶</div>
    </a>`;
}

function soonHtml(g) {
  return `
    <div class="card soon" style="--a1:${g.accent[0]};--a2:${g.accent[1]}">
      <div class="cardart"><span class="cardemoji">${g.emoji}</span><span class="soonbadge">SOON</span></div>
      <div class="cardbody">
        <h3>${g.name}</h3>
        <p>${g.blurb}</p>
        <div class="tags"><span class="tag ghost">in the queue</span></div>
      </div>
    </div>`;
}

function render() {
  const grid = document.getElementById('grid');
  const pgrid = document.getElementById('pickergrid');
  const cards = GAMES.map(cardHtml).join('') + SOON.map(soonHtml).join('');
  grid.innerHTML = cards;
  pgrid.innerHTML = GAMES.map(cardHtml).join('');
}

// ------------------------------------------------------------- picker pop-up
const picker = document.getElementById('picker');
const browse = document.getElementById('btn-browse');

function closePicker() {
  picker.classList.add('gone');
  document.body.classList.remove('locked');
}

function openPicker() {
  picker.classList.remove('gone');
  document.body.classList.add('locked');
}

browse.addEventListener('click', closePicker);
picker.addEventListener('click', (e) => {
  // clicking the dim backdrop closes it, clicking a card does not
  if (e.target === picker) closePicker();
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !picker.classList.contains('gone')) closePicker();
  if (e.code === 'KeyM') toggleSound();
  if (e.code === 'Enter' && !picker.classList.contains('gone')) {
    e.preventDefault();
    const first = pgrid.querySelector('.card');
    if (first) window.location.href = first.getAttribute('href');
  }
});

// ------------------------------------------------------------- sound toggle
const soundBtn = document.getElementById('btn-sound');
let muted = false;
try { muted = localStorage.getItem('bro-arcade-muted') === '1'; } catch { /* private mode */ }

function toggleSound() {
  muted = !mututed;
  try { localStorage.setItem('bro-arcade-muted', muted ? '1' : '0'); } catch { /* ignore */ }
  soundBtn.textContent = muted ? '🔇' : '🔊';
  if (muted) { /* the music rides on the same master gain, so it stops too */ }
  else { initAudio(); resumeAudio(); }
}

soundBtn.textContent = muted ? '🔇' : '🔊';
soundBtn.addEventListener('click', () => {
  initAudio();
  resumeAudio();
  sfxClick();
  toggleSound();
});

// ------------------------------------------------------------- music
if (musicEnabled()) startMusic('hub');

// the first real interaction unlocks the audio context
const wake = () => {
  initAudio();
  resumeAudio();
  if (musicEnabled()) startMusic('hub');
};
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });

// ------------------------------------------------------------- card juice
document.addEventListener('pointerdown', (e) => {
  const card = e.target.closest && e.target.closest('.card');
  if (!card) return;
  initAudio();
  resumeAudio();
  if (card.classList.contains('soon')) sfxClick();
  else sfxConfirm();
});

// hide the emoji once the painted card art is in place
document.addEventListener('load', (e) => {
  if (e.target.tagName === 'IMG' && e.target.closest('.cardart')) {
    e.target.closest('.cardart').classList.add('hasart');
  }
}, true);

render();
openPicker();

// open the controls panel with the C key
document.addEventListener('keydown', (e) => {
  const inPanel = e.target && e.target.closest && e.target.closest('.cfgpanel');
  if ((e.code === 'KeyC' || e.code === 'F2') && !inPanel) {
    e.preventDefault();
    openControls(null);
  }
});
