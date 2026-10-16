# BRO ARCADE 🎮

**Four games. One keyboard. Zero excuses.**

BRO ARCADE is a tiny local arcade for **two brothers and one screen**. The
first thing you see is a pop-up asking which game you want to play — pick one
and it starts. No lobby, no accounts, no waiting for a patch.

| | Game | What it is |
|---|---|---|
| 🎯 | **BRO ARTILLERY** | The original. Two tanks, turn-based, craters, wind, and rising goo. |
| 🥊 | **HERO CLASH** | King of Fighters with a My Hero Academia roster. Team Letters vs Team Numbers, best of three. |
| 🏎️ | **TURBO BROS** | Top-down split-screen racing. Three tracks, four cars, drift, nitro, boost pads. |
| 🦆 | **DUCK INVADERS** | Co-op vertical shooter. Eight waves, a boss every fifth, and the ducks want revenge. |

Two more are queued: **BRO DUNGEON** 🗡️ (twin-stick crawl) and **PIZZA RUSH** 🍕
(time-management chaos).

---

## Setting it up

There is **nothing to install and nothing to compile** — no `npm install`, no
build step, no dependencies. You just need the files served over HTTP.

### ⚠️ Don't just double-click `index.html`

It will show a blank screen. Browsers refuse to load ES modules from `file://`,
and this project is pure ES modules. Run one of the servers below instead —
that's the whole reason `serve.mjs` exists.

### Step 1 — get the files

```bash
git clone https://github.com/NGA828/Game-with-bro.git
cd Game-with-bro
```

Or on GitHub: **Code → Download ZIP**, and unzip it.

### Step 2 — start a server in that folder

```bash
node serve.mjs              # needs Node 18+  ->  http://localhost:4173
npm start                   # same thing
node serve.mjs 8080         # or choose your own port
```

No Node? Python is already on most Macs and Linux boxes:

```bash
python3 -m http.server 4173
```

Then open **http://localhost:4173** in Chrome, Firefox, Safari or Edge.

### Step 3 — play

The pop-up asks which game you want. Click one. Click once anywhere before
the music starts — browsers block audio until you do.

### If something looks wrong

| Symptom | Cause |
|---|---|
| Blank white/black page | You opened `index.html` directly. Use the server. |
| `Failed to load module script` | Same thing — served over `file://`. |
| No sound | Click once anywhere first, or press `M` (mute toggle). |
| No music | The ⚙ panel has a music switch — turn it on there. |
| `EADDRINUSE` | Something is on port 4173 — `node serve.mjs 8080`. |

---

## ⚙ Controls & music

Every game in the arcade shares **one settings panel**, so you can set the
keys up once and play everything.

* **Open it** with the **⚙ button** in the top bar of the hub or of any game,
  or with **F2** inside a game (**C** in the hub).
* **Player One and Player Two get their own keys.** Click a key slot, press
  the key you want, done. The panel warns you if you pick a key that another
  action already uses.
* **Everything is saved** in `localStorage`, so the setup survives a reload.
  `RESET DEFAULTS` puts the factory keys back.
* **Background music** is a chiptune sequencer written in WebAudio — no audio
  files, no downloads. The panel has an on/off switch and a volume slider.
  Each game has its own track (the hub has a chill one, the fighter a driving
  rock one, the racer a synthwave one, the ducks a spacey one).

The games read the configuration live: rebind a key while you are playing and
the very next frame uses the new one. The hint bar under the canvas updates
itself too.

---

## The games

### 🥊 HERO CLASH

Sixteen My Hero Academia characters, one special and one super each:

> All Might · All For One · Deku · Bakugo · Todoroki · Uraraka · Tsuyu · Iida ·
> Kirishima · Tokoyami · Momo · Dabi · Stain · Shigaraki · Present Mic · Midnight

* **Team Letters (P1)** vs **Team Numbers (P2)** on the select screen.
* 1000 HP, a meter that fills when you hit *and* when you get hit, 60-second
  rounds, best of three.
* Height matters: low hits beat a standing hero, high hits beat a crouching
  one. Hold back to block. Supers are unblockable.
* **VS CPU** mode (C) with three difficulty levels (V) if your bro isn't home.

### 🏎️ TURBO BROS

* Three tracks, four cars, three laps, six checkpoints per lap.
* Drift with the handbrake, grab the boost pads, spend the nitro.
* Split screen for two players, or one player against two CPUs (C on the
  track screen). Live standings, per-player lap times, a minimap.

### 🦆 DUCK INVADERS

* Co-op vertical shooter, 1P or 2P (C).
* Eight waves; every fifth wave is a boss duck with a lot of HP.
* Power-ups: **S** spread shot, **1** extra life, **O** bubble shield,
  **B** screen bomb.

### 🎯 BRO ARTILLERY

* Turn-based duel: drive with a fuel limit, aim with the mouse or the
  keyboard, hold to charge, release to fire.
* Wind changes every turn and pushes your shells sideways.
* Five weapons, craters that reshape the map, and the goo that rises from
  round 9.

---

## Default controls

| Game | Player One | Player Two |
|---|---|---|
| HERO CLASH | `A`/`D` move · `W` jump · `S` crouch · `F` light · `G` heavy · `H` special · `T` super | `←`/`→` · `↑` · `↓` · `J` light · `K` heavy · `L` special · `I` super |
| TURBO BROS | `W` gas · `S` brake · `A`/`D` steer · `SPACE` handbrake · `L-SHIFT` nitro | `↑` gas · `↓` brake · `←`/`→` steer · `/` handbrake · `R-SHIFT` nitro |
| DUCK INVADERS | `A`/`D` move · `W`/`S` up-down · `F` shoot | `←`/`→` · `↑`/`↓` · `J` shoot |
| BRO ARTILLERY | `A`/`D` drive · `W`/`S` aim · `SPACE` fire · `1`–`5` weapon (both players share the keyboard, they take turns) | |

Gamepads work too: HERO CLASH (`X` light, `Y` heavy, `B` special, `A` super),
TURBO BROS (stick to steer, `RT` gas, `LT` brake, `A` handbrake, `RB` nitro)
and DUCK INVADERS.

**All of it is rebindable** in the ⚙ panel.

---

## Project layout

```
index.html            the hub: game picker, cards, notes
artillery.html        BRO ARTILLERY
fighter.html          HERO CLASH
racer.html            TURBO BROS
shmup.html            DUCK INVADERS

css/hub.css           hub + picker styling
css/game.css          the shared game shell (top bar, canvas, overlays)
css/controls.css      the settings panel
css/style.css         BRO ARTILLERY styling

js/hub.js             builds the cards, runs the picker, the music
js/shared/config.js   the key bindings + the music settings (localStorage)
js/shared/controls.js the settings panel (click a slot, press a key)
js/shared/keys.js     shared keyboard + gamepad input layer
js/shared/music.js    the chiptune sequencer (five tracks, no audio files)
js/audio.js           synthesised sound effects
js/utils.js           math helpers
js/particles.js       the particle system

js/games/fighter.js   HERO CLASH
js/games/racer.js     TURBO BROS
js/games/shmup.js     DUCK INVADERS

js/main.js            BRO ARTILLERY boot + loop
js/game.js            turn flow, ballistics, explosions, rendering
js/terrain.js         heightmap terrain, crater carving
js/tank.js            tank physics + drawing
js/weapons.js         the arsenal
js/input.js           keyboard + pointer
js/particles.js       sparks, smoke, dirt, floating text

serve.mjs             dependency-free static server
tools/                headless test harnesses and the SVG recorder
```

---

## Tests

Everything runs headless in Node — no browser needed:

```bash
node tools/smoke.mjs            # every game boots and runs clean
node tools/scenario-fighter.mjs # HERO CLASH: roster, specials, damage, KO
node tools/scenario-racer.mjs   # TURBO BROS: physics, laps, AI, ranking
node tools/scenario-shmup.mjs   # DUCK INVADERS: waves, boss, power-ups
node tools/scenario-config.mjs  # the settings panel and the key bindings
```

`tools/svg-canvas.mjs` is a Canvas2D → SVG recorder, so a frame of any game
can be dumped as an image for eyeballing the art:

```bash
node tools/render-lineup.mjs && node tools/topng.mjs tools/out/lineup.svg tools/out/lineup.png 1440
```

---

## Make it yours

Everything is plain numbers and plain ES modules.

- **`js/shared/config.js`** — the default key maps and the music settings.
  Add a game by giving it a `players` array; the settings panel builds itself.
- **`js/shared/music.js` → `TRACKS`** — each track is a BPM and three
  space-separated patterns (lead, bass, drums). `k` `s` `h` are kick, snare
  and hat, `.` is a rest.
- **`js/games/*.js` → `ROSTER` / `TRACKS` / `WAVE_COUNT`** — the content of
  each game is data at the top of the file.
- **`js/audio.js`** — every sound effect is a couple of oscillators. Add your
  own the same way.

Console hooks for testing silly ideas: `broFighter`, `broRacer`, `broShmup`
and `broGame` are all exposed on `window`.

---

Built with canvas 2D, no frameworks, no dependencies, no build step.
Have fun, and remember: it was lag.

*My Hero Academia characters belong to Kōhei Horikoshi. This is an unofficial
fan-made parody — no official assets, all art is drawn in code.*
