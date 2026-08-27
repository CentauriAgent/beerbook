/* E2E render check: header wordmark logo at mobile width (390px). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist');
const PORT = 4187;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon',
};

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
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const bad = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });

  await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
  await page.waitForSelector('header img[alt="Beerbook"]', { timeout: 15000 });
  await page.waitForTimeout(2500); // let header/cover settle

  const logo = page.locator('header img[alt="Beerbook"]');
  const box = await logo.boundingBox();
  console.log('logo box:', JSON.stringify(box));
  await page.screenshot({ path: 'harness/e2e-logo.png' });
  await logo.screenshot({ path: 'harness/e2e-logo-closeup.png' });

  // clipping / pixelation sanity
  if (!box || box.width < 40 || box.height < 10) { console.error('logo too small/clipped'); process.exitCode = 1; }
  if (box && (box.x < 0 || box.x + box.width > 390)) { console.error('logo overflows viewport'); process.exitCode = 1; }

  await browser.close();
  server.close();
  if (errors.length) { console.error('PAGE ERRORS:', errors); process.exitCode = 1; }
  if (bad.length) { console.error('HTTP >=400:', bad); process.exitCode = 1; }
  console.log('OK');
});
