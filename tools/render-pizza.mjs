// Render a PIZZA RUSH frame to SVG/PNG.
//
//   node tools/render-pizza.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installStub } from './svg-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const stub = installStub(960, 540);
await import(pathToFileURL(join(ROOT, 'js', 'games', 'pizza.js')).href);
const game = stub.win.broPizza;

stub.tick(5);
stub.key('Enter', true); stub.tick(1); stub.key('Enter', false);
stub.tick(30);

// chef 1: pick cheese + pepperoni, chef 2: mushroom
stub.key('KeyW', true); stub.tick(2); stub.key('KeyW', false);
stub.key('KeyD', true); stub.tick(2); stub.key('KeyD', false);
stub.key('KeyW', true); stub.tick(2); stub.key('KeyW', false);
stub.key('ArrowUp', true); stub.tick(2); stub.key('ArrowUp', false);
stub.tick(400);   // let a customer walk in

stub.ctx.elements.length = 0;
stub.ctx.clipDefs.length = 0;
stub.ctx.clipStack.length = 0;
game.render();

writeFileSync(join(OUT, 'pizza.svg'), stub.ctx.toSVG('#241a12'));
console.log('state', game.state, 'elements', stub.ctx.elements.length);
console.log('stations', game.stations.map((s) => s.order ? [...s.order.toppings].join('+') : 'none').join(' | '));
console.log('dough', game.stations.map((s) => [...s.dough].join('+')).join(' | '));
