/* Back-turn under-flap reveal verification.
 * On a 'back' drag, the page revealed BENEATH the sweeping flap must be
 * the PREVIOUS page's content (page 1 = red #7f1d1d when going back from
 * index 1), not the current page (page 2 = green #14532d).
 * Screenshots: harness/e2e-back-under.png (mid back-drag) and
 * harness/e2e-fwd-mid.png (mid forward-drag regression).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';
import { PNG } from '/tmp/bb-repro/node_modules/pngjs/lib/png.js';

const ROOT = path.resolve('dist-harness');
const PORT = 4181;
const SHOTS = 'harness';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  let file = req.url;
  if (file.endsWith('/')) file += 'index.html';
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

const results = [];
const check = (name, ok, extra = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
try { await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }); } catch { /* older chrome */ }
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

const reset = async (i = 0) => {
  await page.goto(`http://localhost:${PORT}/harness/`);
  await page.waitForFunction(() => document.getElementById('index-display') !== null, { timeout: 10000 });
  await page.waitForTimeout(400);
  for (let k = 0; k < i; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800); }
};
const move = async (x, y) => {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
  await new Promise((r) => setTimeout(r, 60));
};
/** Count pixels matching a base color (±18/channel) in a region. */
const countColor = (img, { r: R, g: G, b: B }, x0 = 0, x1 = img.width) => {
  let n = 0;
  for (let y = 0; y < img.height; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (img.width * y + x) << 2;
    if (Math.abs(img.data[i] - R) <= 18 && Math.abs(img.data[i + 1] - G) <= 18 && Math.abs(img.data[i + 2] - B) <= 18) n++;
  }
  return n;
};
const RED = { r: 0x7f, g: 0x1d, b: 0x1d };   // page 1 (previous)
const GREEN = { r: 0x14, g: 0x53, b: 0x2d }; // page 2 (current)
const BLUE = { r: 0x1e, g: 0x3a, b: 0x8a };  // page 3 (forward "next")

// ---- Back drag from index 1, hold at mid-fold ----
await reset(1);
{
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 400 }] });
  await new Promise((r) => setTimeout(r, 80));
  for (let f = 0.1; f <= 0.55; f += 0.05) await move(100 + 280 * f, 400);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-back-under.png') });
  // Released WITHOUT commit so the state under test is the held fold.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900); // spring-back finishes

  const img = PNG.sync.read(fs.readFileSync(path.join(SHOTS, 'e2e-back-under.png')));
  const red = countColor(img, RED);
  const green = countColor(img, GREEN);
  check('back mid-drag: PREVIOUS page (red) visible under flap', red > 500, `red px ${red}`);
  check('back mid-drag: current page (green) still partially visible (correct stack)', green > 500, `green px ${green}`);
}

// ---- Forward regression from index 0, hold mid-fold ----
await reset(0);
{
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 320, y: 400 }] });
  await new Promise((r) => setTimeout(r, 80));
  for (let f = 0.1; f <= 0.55; f += 0.05) await move(320 - 280 * f, 400);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: path.join(SHOTS, 'e2e-fwd-mid.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(900);

  const img = PNG.sync.read(fs.readFileSync(path.join(SHOTS, 'e2e-fwd-mid.png')));
  const green = countColor(img, GREEN);
  check('forward mid-drag regression: NEXT page (green) still revealed under flap', green > 500, `green px ${green}`);
}

// ---- Committed back turn settles on previous page ----
{
  await reset(1);
  const before = await page.evaluate(() => document.getElementById('index-display').textContent);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 400 }] });
  await new Promise((r) => setTimeout(r, 80));
  for (let f = 0.2; f <= 1.001; f += 0.08) await move(100 + 280 * Math.min(f, 1), 400);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => document.getElementById('index-display').textContent);
  check('committed back turn settles on previous page', before.includes('index: 1') && after.includes('index: 0'), `${before} → ${after}`);
  const img = PNG.sync.read(await page.screenshot());
  check('settled state renders previous page (red)', countColor(img, RED) > 2000, `red px ${countColor(img, RED)}`);
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed === 0 ? '\nALL PASS' : `\n${failed} FAILURES`);
process.exit(failed === 0 ? 0 : 1);
