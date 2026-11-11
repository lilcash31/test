// Rendu image par image du film (Playwright + Chromium headless).
// Usage : node tools/render.mjs [--fps 30] [--scale 1] [--workers 3] [--stills 2,8,17]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FPS = +arg('fps', 30), SCALE = arg('scale', '1'), WORKERS = +arg('workers', 3), STILLS = arg('stills', null);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'frames'); fs.mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };

const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(0);
const port = server.address().port;

async function worker(frames, tag) {
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  page.on('pageerror', e => console.error('[page]', e.message));
  page.on('console', m => m.type() === 'error' && console.error('[console]', m.text()));
  await page.goto(`http://localhost:${port}/film/index.html?s=${SCALE}`);
  await page.waitForFunction('window.READY === true', null, { timeout: 120000 });
  const t0 = Date.now();
  for (let i = 0; i < frames.length; i++) {
    const { n, t, file } = frames[i];
    await page.evaluate(t => window.renderAt(t), t);
    await page.screenshot({ path: file, type: 'jpeg', quality: 95 });
    if (i % 60 === 0) console.log(`[${tag}] ${i}/${frames.length} (${((Date.now() - t0) / 1000 / (i + 1)).toFixed(2)} s/img)`);
  }
  await browser.close();
}

let frames;
if (STILLS) frames = STILLS.split(',').map(s => ({ t: +s, file: path.join(OUT, `still_${(+s).toFixed(1).padStart(4, '0')}.jpg`) }));
else frames = [...Array(60 * FPS)].map((_, n) => ({ n, t: n / FPS, file: path.join(OUT, `f_${String(n).padStart(5, '0')}.jpg`) })).filter(f => !fs.existsSync(f.file));
const per = Math.ceil(frames.length / WORKERS);
await Promise.all([...Array(WORKERS)].map((_, w) => worker(frames.slice(w * per, (w + 1) * per), 'w' + w)));
server.close();
console.log('ok', frames.length);
