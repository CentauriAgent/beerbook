import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';
const ROOT = path.resolve('dist-harness');
const PORT = 4183;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let file = req.url; if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 900, height: 700 } });
const p = await ctx.newPage();
await p.goto(`http://localhost:${PORT}/harness/`);
await p.waitForFunction(() => document.getElementById('index-display') !== null);
await p.waitForTimeout(400);
const probe = () => p.evaluate(() => {
  const hit = document.elementFromPoint(870, 350);
  const chain = [];
  let e = hit; while (e && chain.length < 5) { chain.push(e.tagName + (e.id ? '#'+e.id : '') + (e.hasAttribute('data-page-index') ? `[page${e.getAttribute('data-page-index')}]` : '')); e = e.parentElement; }
  const btn = document.getElementById('next-btn');
  const r = btn.getBoundingClientRect();
  return { chain, btnRect: { x: r.x, y: r.y, w: r.width, h: r.height }, btnPE: getComputedStyle(btn).pointerEvents, pages: [...document.querySelectorAll('[data-page-index]')].map((d) => d.style.display + '/z:' + d.style.zIndex) };
});
console.log('idle:', JSON.stringify(await probe()));
await p.mouse.move(700, 350); await p.mouse.down();
for (let i = 1; i <= 8; i++) { await p.mouse.move(700 - 60 * i, 350); await p.waitForTimeout(30); }
await p.mouse.up();
await p.waitForTimeout(1000);
console.log('after drag:', JSON.stringify(await probe()));
await browser.close(); server.close();
