// The hub: builds the game cards, runs the first-load picker pop-up.

import { initAudio, resumeAudio, sfxClick, sfxConfirm } from './audio.js';
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
    name: 'BRO DUNGEON',
    blurb: 'Twin-stick dungeon crawl. Rooms, loot, skeletons, and a boss the size of the fridge.',
    emoji: '🗡️',
    accent: ['#9d7bff', '#4b2ea8'],
  },
  {
    name: 'PIZZA RUSH',
    blurb: 'Time-management chaos. Take orders, burn the oven, yell at the queue — the ultimate two-player job.',
    emoji: '🍕',
    accent: ['#ff6b35', '#ffd166'],
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
