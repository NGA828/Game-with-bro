// Render a TURBO BROS frame to SVG/PNG.
//
//   node tools/render-racer.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { installStub } from './svg-canvas.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const stub = installStub(960, 540);
await import(pathToFileURL(join(ROOT, 'js', 'games', 'racer.js')).href);
const racer = stub.win.broRacer;

stub.tick(5);
stub.key('Enter', true); stub.tick(1); stub.key('Enter', false);
stub.tick(260);                       // countdown

// drive both cars forward (borrow the AI's steering so they stay on track)
const car = racer.cars[0];
stub.key('KeyW', true);
stub.key('ArrowUp', true);
for (let i = 0; i < 260; i++) {
  const ai = racer.aiInput(car);
  stub.key('KeyD', ai.steer > 0.2);
  stub.key('KeyA', ai.steer < -0.2);
  stub.tick(1);
}
stub.key('KeyW', false);
stub.key('ArrowUp', false);
stub.key('KeyD', false);
stub.key('KeyA', false);
stub.tick(4);

stub.ctx.elements.length = 0;
stub.ctx.clipDefs.length = 0;
stub.ctx.clipStack.length = 0;
racer.render();

writeFileSync(join(OUT, 'racer.svg'), stub.ctx.toSVG('#173a20'));
console.log('state', racer.state, 'track', racer.track.def.name, 'elements', stub.ctx.elements.length);

console.log('P1', racer.cars[0].x.toFixed(1), racer.cars[0].y.toFixed(1), 'vel', (racer.cars[0].vel||0).toFixed(1), 'off', racer.cars[0].offRoad);
console.log('P2', racer.cars[1].x.toFixed(1), racer.cars[1].y.toFixed(1), 'vel', (racer.cars[1].vel||0).toFixed(1));
