// Zero-dependency static server so the game runs anywhere Node is installed.
// (ES modules can't be loaded over file://, so a server is genuinely required.)
//
//   node serve.mjs            -> http://localhost:4173
//   node serve.mjs 8080       -> pick your own port

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const HOST = process.env.HOST || '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

// --------------------------------------------------------------- cache busting
//
// A browser that mixes a fresh music.js with a stale audio.js dies with
// "does not provide an export named ...". So every module URL gets a
// content hash of the file it points at: change a file and its URL changes,
// which means the browser can never pair old and new modules together.

const hashCache = new Map();

async function hashOf(abs) {
  let info;
  try { info = await stat(abs); } catch { return 'missing'; }
  const hit = hashCache.get(abs);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.hash;
  const buf = await readFile(abs);
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 10);
  hashCache.set(abs, { mtimeMs: info.mtimeMs, size: info.size, hash });
  return hash;
}

// 'from ./x.js' / "import('./x.js')" / "import './x.js'"
const JS_SPECIFIER = /((?:\bfrom|\bimport)\s*\(?\s*)(['"])(\.[^'"]*\.js)\2/g;
// href="css/x.css?v=3" / src="js/x.js?v=3"
const HTML_ASSET = /((?:href|src)=")((?:css|js)\/[^"?]+)(?:\?v=[^"]*)?(")/g;

async function stampJs(text, filePath) {
  const specs = new Set();
  for (const m of text.matchAll(JS_SPECIFIER)) specs.add(m[3]);
  const hashes = new Map();
  for (const spec of specs) {
    hashes.set(spec, await hashOf(resolve(dirname(filePath), spec)));
  }
  return text.replace(JS_SPECIFIER, (m, pre, q, spec) => `${pre}${q}${spec}?v=${hashes.get(spec)}${q}`);
}

async function stampHtml(text) {
  const files = new Set();
  for (const m of text.matchAll(HTML_ASSET)) files.add(m[2]);
  const hashes = new Map();
  for (const f of files) hashes.set(f, await hashOf(join(ROOT, f)));
  return text.replace(HTML_ASSET, (m, p1, path, p3) => `${p1}${path}?v=${hashes.get(path)}${p3}`);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname.endsWith('/')) pathname += 'index.html';

    // never serve anything outside the project folder
    const filePath = join(ROOT, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    const info = await stat(filePath);
    if (info.isDirectory()) {
      res.writeHead(302, { Location: pathname.replace(/\/?$/, '/') + 'index.html' }).end();
      return;
    }

    let body = await readFile(filePath);
    const ext = extname(filePath).toLowerCase();
    if (ext === '.js') {
      body = Buffer.from(await stampJs(body.toString('utf8'), filePath), 'utf8');
    } else if (ext === '.html') {
      body = Buffer.from(await stampHtml(body.toString('utf8')), 'utf8');
    }
    // code and html must never be served stale, or a fix will look like it
    // "did not work" in the browser
    const cache = ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css'
      ? 'no-store, must-revalidate'
      : 'no-cache';
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': cache,
    });
    res.end(body);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 — not found');
    } else {
      res.writeHead(500, { 'Content-Type': 'text/plain' }).end('500 — ' + (err?.message || 'error'));
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  BRO ARTILLERY running at http://localhost:${PORT}\n  (serving ${ROOT})\n`);
});
