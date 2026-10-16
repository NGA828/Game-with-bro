// svg -> png using resvg (installed under /tmp for this sandbox)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Resvg } = require('/tmp/svgtest/node_modules/@resvg/resvg-js');
const [, , inFile, outFile, width] = process.argv;
const svg = readFileSync(inFile, 'utf8');
const r = new Resvg(svg, {
  background: '#0a0e20',
  fitTo: { mode: 'width', value: Number(width || 960) },
});
writeFileSync(outFile, r.render().asPng());
console.log('wrote', outFile);
