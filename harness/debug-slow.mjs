import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('dist-harness');
const PORT = 4178;
const server = http.createServer((req, res) => {
  let file = req.url;
  if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html', '.js': 'text/javascript' }[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const { chromium } = await import('/tmp/bb-repro/node_modules/playwright/index.mjs');
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
await page.goto(`http://localhost:${PORT}/harness/`);
await page.waitForFunction(() => document.querySelectorAll('.stf__parent').length > 0);
await page.waitForTimeout(600);

// Instrument ALL pointer events reaching the container + window
await page.evaluate(() => {
  window.__evts = [];
  const c = document.querySelector('.stf__parent');
  for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
    c.addEventListener(t, (e) => window.__evts.push(`${t}@${Math.round(e.clientX)},${Math.round(e.clientY)} type=${e.pointerType}`));
    window.addEventListener(t, (e) => window.__evts.push(`W:${t}@${Math.round(e.clientX)},${Math.round(e.clientY)}`), { passive: true });
  }
});

const idx = () => page.evaluate(() => document.getElementById('index-display').textContent);

// SLOW DRAG
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 300, y: 400 }] });
await page.waitForTimeout(200);
for (let i = 1; i <= 10; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(300 - 23 * i), y: 400 }] });
  await page.waitForTimeout(70);
}
await page.waitForTimeout(200);
const during = await page.evaluate(() => ({
  evts: window.__evts.slice(0, 30),
  stfState: document.querySelectorAll('.stf__item').length,
  clipped: [...document.querySelectorAll('.stf__item')].filter((el) => (el.style.clipPath || '').length > 3).length,
}));
console.log('DURING DRAG:', JSON.stringify(during, null, 1));
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await page.waitForTimeout(1200);
for (let k = 0; k < 4; k++) {
  console.log('t+', await idx(), 'clipped:', await page.evaluate(() => [...document.querySelectorAll('.stf__item')].filter((e) => (e.style.clipPath || '').length > 3).length));
  await page.waitForTimeout(700);
}
console.log('AFTER END:', JSON.stringify(await page.evaluate(() => ({ evts: window.__evts.slice(-10), swipe: window.__swipeEvents ?? [] }))));
console.log('index:', await idx());
await browser.close();
server.close();
