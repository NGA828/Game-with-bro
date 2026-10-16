// Render a HERO CLASH frame to SVG (and a PNG) so the sprites can be checked.
//
//   node tools/render-fighter.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installStub } from './svg-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const who = process.argv[2] || 'allmight';
const zoom = process.argv[3] === 'zoom';

const stub = installStub(960, 540);
await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const game = stub.win.broFighter;

// pick a fight
stub.tick(5);
stub.key('KeyF', true); stub.tick(1); stub.key('KeyF', false);
stub.key('KeyJ', true); stub.tick(1); stub.key('KeyJ', false);
stub.tick(220);

// swap the roster to whatever we want to look at
const { ROSTER } = await import(pathToFileURL(join(ROOT, 'js', 'games', 'fighter.js')).href);
const a = ROSTER.find((r) => r.id === who) || ROSTER[0];
const b = ROSTER.find((r) => r.id === 'allforone') || ROSTER[1];
game.fighters[0].def = a;
game.fighters[1].def = b;

// walk them together and throw a punch so the frame has action
stub.key('KeyD', true);
stub.key('ArrowLeft', true);
stub.tick(120);
stub.key('KeyD', false);
stub.key('ArrowLeft', false);
stub.key('KeyG', true); stub.tick(1); stub.key('KeyG', false);
stub.tick(10);

// keep only the final frame
stub.ctx.elements.length = 0;
stub.ctx.clipDefs.length = 0;
stub.ctx.clipStack.length = 0;
game.render();

let view = zoom ? [300, 330, 320, 200] : null;
if (process.argv[3] === 'head') {
  const f = game.fighters[0];
  view = [f.x - 45, f.y - 135, 90, 90];
}
writeFileSync(join(OUT, 'fighter.svg'), stub.ctx.toSVG('#0a0e20', view));
console.log('state', game.state, '->', a.name, 'vs', b.name);
console.log('elements drawn:', stub.ctx.elements.length);
