/* E2E render check for the redesigned Profile "book cover" page.
 * Serves dist-harness statically, opens the profile harness (mocked feed),
 * waits for settle, screenshots populated + empty variants. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist-harness');
const PORT = 4185;
const SHOTS = 'harness';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let file = req.url?.split('?')[0] ?? '/';
  if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

server.listen(PORT, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  const shoot = async (url, out) => {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => (window).__ready === true, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(SHOTS, out), fullPage: true });
    console.log(`shot ${out}`);
  };

  await shoot(`http://localhost:${PORT}/harness/profile.html`, 'e2e-profile.png');
  await shoot(`http://localhost:${PORT}/harness/profile.html?empty=1`, 'e2e-profile-empty.png');

  // sanity: stat row text
  const stats = await page.locator('text=Breweries').count();
  console.log('empty-state stat blocks visible:', stats);

  // ---- cover header screenshot (dark leather, readable cream text) ----
  await page.goto(`http://localhost:${PORT}/harness/profile.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window).__ready === true, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  
  // Pull-to-refresh instrumentation — simulate a deliberate downward pull
  const drag = await page.evaluate(() => {
    window.__pullRefreshes = 0;
    const startY = 300;
    const el = document.elementFromPoint(200, startY) ?? document.body;
    const opts = { pointerType: 'touch', bubbles: true, cancelable: true };
    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 200, clientY: startY, ...opts }));
    for (let y = startY; y < startY + 260; y += 20) {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: y, ...opts }));
    }
    window.dispatchEvent(new PointerEvent('pointerup', { clientX: 200, clientY: startY + 260, ...opts }));
    return { events: window.__swipeEvents, refreshes: window.__pullRefreshes, state: window.__pullState };
  });
  await page.waitForTimeout(600);
  
  await page.screenshot({ path: path.join(SHOTS, 'e2e-profile-cover.png'), fullPage: false });
  console.log('shot e2e-profile-cover.png');
  console.log('pull events:', JSON.stringify(drag.events));
  console.log('pullRefreshes:', drag.refreshes, 'pullState:', JSON.stringify(drag.state));

  await browser.close();
  server.close();
  if (errors.length) { console.error('PAGE ERRORS:', errors); process.exit(1); }
  console.log('OK');
});
