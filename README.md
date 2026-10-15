# BRO ARTILLERY 🎯

A silly local hot-seat artillery duel for **two brothers and one keyboard**.
Blast craters in the terrain, launch a psychopathic duck, and knock your brother
into the rising goo. Turn-based, so no netcode, no accounts, no waiting.

---

## Setting it up

There is **nothing to install and nothing to compile** — no `npm install`, no
build step, no dependencies. You just need the files served over HTTP.

### ⚠️ Don't just double-click `index.html`

It will show a blank screen. Browsers refuse to load ES modules from `file://`,
and this game is pure ES modules. Run one of the servers below instead — that's
the whole reason `serve.mjs` exists.

### Step 1 — get the files

Either clone it:

```bash
git clone --branch arena/7b5e22e1-game-with-bro https://github.com/NGA828/Game-with-bro.git
cd Game-with-bro
```

Or on GitHub: pick `arena/7b5e22e1-game-with-bro` from the branch dropdown,
then **Code → Download ZIP**, and unzip it. (If you download the ZIP from `main`
before this is merged, you'll get a README and nothing else — check the branch.)

### Step 2 — start a server in that folder

Any one of these works. Pick whatever you already have:

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

Hit **LIGHT IT UP 🔥**, and press `F11` (or `Cmd/Ctrl + Shift + F`) for
fullscreen. Both bros use the same keys and take turns, so one keyboard is
enough. Click anywhere once before you start — browsers block sound until you
do, and the START button handles that for you.

### If something looks wrong

| Symptom | Cause |
|---|---|
| Blank white/black page | You opened `index.html` directly. Use the server. |
| `Failed to load module script` | Same thing — served over `file://`. |
| No sound | Click once anywhere first, or press `M` (mute toggle). |
| Page is tiny / has scrollbars | Maximise the window; the canvas scales to fit. |
| `EADDRINUSE` | Something is on port 4173 — `node serve.mjs 8080`. |

### Playing with a bro who isn't in the room

This build is **local hot-seat only** — one keyboard, one screen, taking turns.
For a remote bro your options are a screen share where he calls the shots, or
adding online play (turn-based, so it's a genuinely small job: just exchange
shot coordinates).

---

## How a match works

| | |
|---|---|
| **Health** | 100 HP each |
| **Lives** | 2 each — you respawn 2.4s after dying, at 65 HP, somewhere safe |
| **Rounds** | First to win **3 rounds** wins the war |
| **Turns** | 45s each *if* you enable the chaos timer |
| **Wind** | changes every turn, pushes shells sideways |

Get your opponent to 0 HP and they respawn. Get them to 0 while they have no
lives left and you take the round. Round 9 onwards, **the goo starts rising** —
everyone races for the high ground.

## Controls (the keyboard is shared, so you both use the same keys)

| Action | Key |
|---|---|
| Drive left / right | `A` / `D` (limited fuel per turn) |
| Aim | move the **mouse**, or fine-tune with `W` / `S` |
| Fire | **hold** click or `SPACE` to charge power, **release** to fire |
| Pick a weapon | `1`–`5` or `Q` / `E` |
| Restart · Help · Mute | `R` · `H` · `M` |

The aim indicator only shows the first chunk of the arc on purpose. The rest is
guesswork, and the wind is a liar.

## The arsenal

| Weapon | Ammo | Why it's funny |
|---|---|---|
| ● **SHELL** | ∞ | reliable, boring, gets the job done |
| 💣 **HEAVY** | 3 | double-size crater, double-size grudge |
| ✸ **CLUSTER** | 3 | lob it high and 5 bomblets rain down in a fan |
| 🟢 **GOOP** | 3 | sticks to your bro and burns 7 HP on each of his turns |
| 🦆 **DUCK** | 1 | bounces off the ground quacking. Nobody controls the duck. |

## The rules of war (as implemented)

- **You can absolutely blow yourself up.** There's even an achievement text for it ("SELF OWN").
- **Direct hits hurt extra** (+8 and a *DIRECT HIT!* stamp).
- **Falling hurts.** Knocking a bro off a cliff does real damage.
- **Water kills instantly.** Blast the ground out from under him and he's gone.
- **The goo rises from round 9** and stops just below the high ground, so the endgame
  is a scramble for the last hill instead of a coin flip.
- **Losing the terrain under your own feet is a real strategy** against you.

## Project layout

```
index.html          markup + the three overlays (start / help / victory)
css/style.css       all the chrome around the canvas
js/main.js          boot, HUD syncing, fixed-step game loop
js/game.js          turn flow, ballistics, explosions, round structure, rendering
js/terrain.js       heightmap terrain, crater carving, sliding
js/tank.js          tank physics + the drawing of the little guy
js/weapons.js       every weapon is just numbers — edit these freely
js/particles.js     sparks, smoke, dirt, confetti, floating text
js/input.js         keyboard + pointer
js/audio.js         synthesised sound effects (no audio files)
serve.mjs           dependency-free static server
```

## Make it yours

Everything is plain numbers, no build step, no dependencies. Some good first edits:

- **`js/weapons.js`** — add a weapon. Copy an entry, tweak `radius`, `power`,
  `damage`, `gravity`, `windFactor`, and give it a `shot` kind. It shows up in the
  rack automatically (the icons are just emoji).
- **`js/game.js` → constants at the top** — `GRAVITY`, `MAX_V0`, `WIND_ACC`,
  `GOO_START_ROUND`, `LIVES`, `ROUNDS_TO_WIN`, `RESPAWN_TIME`.
- **`js/tank.js` → `FUEL_PER_TURN`** — how far you can drive each turn.
- **`js/game.js` → `simulate()`** — the length of the visible aim arc
  (`Math.floor(pts.length * 0.42)`). Set it to `1` to see the whole trajectory
  and turn the game into a geometry exercise.
- **`js/game.js` → `SKIES`** — add a palette; sky colour is picked per round.
- **`js/game.js` → `pushFeed` / the quip arrays** — every insult is a string. Go wild.

There's also a console hook: `broGame.wind = 10`, `broGame.tanks[0].hp = 5`,
`broGame.gooRise = true` — handy for testing stupid ideas quickly.

---

Built with canvas 2D, no frameworks, no dependencies, no build step.
Have fun, and remember: it was lag.
