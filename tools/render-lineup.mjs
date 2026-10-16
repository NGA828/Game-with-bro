// Draw every hero side by side so the roster can be checked in one image.
//
//   node tools/render-lineup.mjs && node tools/topng.mjs ...

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installStub } from './svg-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const stub = installStub(960, 540);
const mod = await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const { ROSTER, drawFighter } = mod;
const ctx = stub.ctx;

ctx.fillStyle = '#16192e';
ctx.fillRect(0, 0, 960, 540);

const cols = 8;
const cellW = 120;
ROSTER.forEach((def, i) => {
  const cx = (i % cols) * cellW + cellW / 2;
  const cy = 150 + Math.floor(i / cols) * 240;
  const fake = {
    def,
    side: i % 2,
    x: cx, y: cy, facing: 1,
    growScale: 1, flash: 0, specialGlow: 0, growT: 0,
    state: 'idle', vx: 0, hp: 1000, combo: 0,
    status: { burn: 0, freeze: 0, slow: 0, armor: 0 },
  };
  drawFighter(ctx, fake, 1.2);
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.font = '700 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.name, cx, cy + 16);
  ctx.restore();
});

writeFileSync(join(OUT, 'lineup.svg'), ctx.toSVG('#16192e'));
console.log('wrote tools/out/lineup.svg', ROSTER.length, 'heroes');
