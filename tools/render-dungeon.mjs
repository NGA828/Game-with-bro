// Render a BRO DUNGEON frame to SVG/PNG.
//
//   node tools/render-dungeon.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installStub } from './svg-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const stub = installStub(960, 540);
await import(pathToFileURL(join(ROOT, 'js', 'games', 'dungeon.js')).href);
const game = stub.win.broDungeon;

stub.tick(5);
stub.key('Enter', true); stub.tick(1); stub.key('Enter', false);
stub.tick(60);

// walk around a bit so the scene is not the spawn pose
stub.key('KeyD', true); stub.tick(30); stub.key('KeyD', false);
stub.key('KeyS', true); stub.tick(20); stub.key('KeyS', false);
stub.tick(10);

stub.ctx.elements.length = 0;
stub.ctx.clipDefs.length = 0;
stub.ctx.clipStack.length = 0;
game.render();

writeFileSync(join(OUT, 'dungeon.svg'), stub.ctx.toSVG('#120d18'));
console.log('state', game.state, 'room', game.room, 'elements', stub.ctx.elements.length);
console.log('heroes', game.heroes.map((h) => `${h.x.toFixed(0)},${h.y.toFixed(0)} hp${h.hp}`).join('  '));
