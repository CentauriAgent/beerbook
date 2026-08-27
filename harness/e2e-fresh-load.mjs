/* Fresh-context (incognito-like) load of the built app against real relays.
 * Captures console errors, page errors, WS traffic, and screenshots. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist');
const PORT = 4187;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let file = req.url?.split('?')[0] ?? '/';
  if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const log = (...a) => console.log('[e2e]', ...a);

server.listen(PORT, async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(); // fresh context = incognito-like
  const page = await ctx.newPage();

  const consoleMsgs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => consoleMsgs.push(`[pageerror] ${e.message}`));
  const wsLog = [];
  page.on('websocket', (ws) => {
    const url = ws.url();
    log('WS open:', url);
    ws.on('framesent', (f) => { const s = String(f.payload); if (s.includes('REQ')) wsLog.push(`${url} → ${s.slice(0, 200)}`); });
    ws.on('framereceived', (f) => {
      const s = String(f.payload);
      if (s.startsWith('["EVENT')) wsLog.push(`${url} ← EVENT ${s.slice(0, 120)}`);
      if (s.startsWith('["EOSE')) wsLog.push(`${url} ← EOSE`);
      if (s.startsWith('["NOTICE') || s.startsWith('["CLOSED')) wsLog.push(`${url} ← ${s.slice(0, 160)}`);
      if (s.startsWith('["AUTH')) wsLog.push(`${url} ← AUTH challenge`);
    });
    ws.on('close', () => log('WS closed:', url));
  });

  // Mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(9000);

  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
  log('BODY TEXT (mobile):', JSON.stringify(bodyText));
  await page.screenshot({ path: 'harness/e2e-fresh-load.png' });

  // Desktop
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'harness/e2e-fresh-load-desktop.png' });

  log('--- WS traffic ---');
  for (const l of wsLog) console.log(l);
  log('--- console errors/warnings ---');
  for (const m of consoleMsgs) console.log(m);

  await browser.close();
  server.close();
  process.exit(0);
});
