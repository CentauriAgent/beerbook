/* Real-touch E2E for the Beerbook page-turn engine (mirror + mid-page round).
 * Real CDP touch (NOT mouse-riding):
 *  - Emulation.setTouchEmulationEnabled(true, 5)
 *  - Input.dispatchTouchEvent with explicit touchPoints
 *  - Emulation.setEmitTouchEventsForMouse is NEVER enabled (sent OFF explicitly)
 * Verifies:
 *  1. Back drag (slow, left→right) from MID-HEIGHT commits; mid-drag
 *     screenshot (e2e-back-mid-mid.png) shows the mirrored fold; forward
 *     mid-drag (e2e-fwd-mid-mid.png) captured for side-by-side comparison.
 *  2. Forward + back slow drags from top-third / middle / bottom-third y all
 *     commit AND show immediate fold movement (screenshot diff within the
 *     first ~10% of the drag — no dead zones at any y).
 *  3. Fast swipes both directions from mid-page, keyboard, edge buttons,
 *     spring-back on small abandoned drags.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist-harness');
const PORT = 4178;
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

/** Rough byte-diff ratio between two screenshots (sampled). */
function diffPct(a, b) {
  const n = Math.min(a.length, b.length);
  let d = 0;
  for (let i = 0; i < n; i += 997) if (a[i] !== b[i]) d++;
  return (100 * d) / (n / 997);
}

const browser = await chromium.launch();

const context = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
try { await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }); } catch { /* older chrome */ }
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });

const W = 420, H = 800;
const getIndex = () => page.evaluate(() => parseInt((document.getElementById('index-display').textContent || '').replace('index:', '').trim(), 10));
const getGestures = () => page.evaluate(() => window.__swipeEvents ?? []);
const reset = async (i = 0) => {
  await page.goto(`http://localhost:${PORT}/harness/`);
  await page.waitForFunction(() => document.getElementById('index-display') !== null, { timeout: 10000 });
  await page.waitForTimeout(400);
  for (let k = 0; k < i; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(800); }
  await page.evaluate(() => { window.__swipeEvents = []; window.__pullRefreshes = 0; window.__pullState = {}; });
};

/** Raw touch drag with per-step pacing. Returns after touchEnd. */
async function drag(c, { from, to, steps = 12, stepMs = 40, end = true }) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y) }] });
  await new Promise((r) => setTimeout(r, 60));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  if (end) await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Slow drag with a screenshot taken early (first ~10% of the x sweep) to
 * assert IMMEDIATE fold movement, and mid-drag screenshot at ~55%.
 * Releases (commit) if `commit` — otherwise touchEnd happens after the shot.
 */
async function slowDragWithShots(c, { x0, x1, y, name, commit = true }) {
  await page.evaluate(() => { window.__swipeEvents = []; });
  const rest = await page.screenshot();
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(x0), y: Math.round(y) }] });
  await new Promise((r) => setTimeout(r, 80));
  const span = x1 - x0;
  // first ~10% of the sweep
  await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + span * 0.1), y: Math.round(y) }] });
  await new Promise((r) => setTimeout(r, 120));
  const early = await page.screenshot();
  // continue to ~55%
  for (let f = 0.2; f <= 0.55; f += 0.05) {
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + span * f), y: Math.round(y) }] });
    await new Promise((r) => setTimeout(r, 60));
  }
  await new Promise((r) => setTimeout(r, 120));
  const mid = await page.screenshot();
  if (name) fs.writeFileSync(path.join(SHOTS, name), mid);
  const dEarly = diffPct(rest, early);
  const dMid = diffPct(rest, mid);
  if (commit) {
    for (let f = 0.65; f <= 1.0001; f += 0.07) {
      await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x0 + span * Math.min(f, 1)), y: Math.round(y) }] });
      await new Promise((r) => setTimeout(r, 45));
    }
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(1000);
  }
  return { dEarly, dMid };
}

// ---- 1. BACK slow drag from mid-height: mirrored fold + commit ----------
await reset(1); // on page 1 so back is legal
{
  const idx0 = await getIndex();
  const { dEarly, dMid } = await slowDragWithShots(cdp, { x0: 100, x1: 380, y: H / 2, name: 'e2e-back-mid-mid.png' });
  check('back mid-height: fold moves within first 10% of drag', dEarly > 0.3, `early diff ${dEarly.toFixed(2)}%`);
  check('back mid-height: mirrored fold clearly visible mid-drag', dMid > 2, `mid diff ${dMid.toFixed(2)}%`);
  const idx1 = await getIndex();
  check('back mid-height slow drag commits (index -1)', idx1 === idx0 - 1, `${idx0}→${idx1}`);
  const g = await getGestures();
  check('back mid-height logged as commit-back', g.some((e) => e.type === 'commit-back'), JSON.stringify(g));
}

// Forward mid-drag screenshot for visual mirror comparison
await reset(0);
{
  const { dMid } = await slowDragWithShots(cdp, { x0: 320, x1: 40, y: H / 2, name: 'e2e-fwd-mid-mid.png' });
  check('forward mid-height: fold visible mid-drag (comparison shot)', dMid > 2, `mid diff ${dMid.toFixed(2)}%`);
}

// Pixel-verify the flap mid-drag, both directions: the flap's back face is
// BLANK PAPER (light cream — clearly lighter than any page color), drawn as
// a vertical strip. Back's strip must mirror forward's.
{
  const decode = async (file) => {
    const buf = fs.readFileSync(path.join(SHOTS, file));
    const { PNG } = await import('/tmp/bb-repro/node_modules/pngjs/lib/png.js');
    return PNG.sync.read(buf);
  };
  const paperStripOf = (img) => {
    const { width, height, data } = img;
    // Per-column paper density: a real flap strip is paper for (nearly)
    // the full page height; text antialiasing specks are not. Take the
    // min/max of DENSE columns (>= 60% of sampled rows paper).
    const rows = [];
    for (let y = 40; y < height - 40; y += 6) rows.push(y);
    const colCounts = new Map();
    for (const y of rows) for (let x = 0; x < width; x += 3) {
      const i = (width * y + x) << 2;
      const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
      // cream PAPER: high channels + warm tint (b clearly below r) so the
      // pure-white page text (r=g=b=255) is excluded.
      if (r > 225 && g > 210 && b > 185 && r - b >= 10 && r - b <= 40) {
        colCounts.set(x, (colCounts.get(x) ?? 0) + 1);
      }
    }
    const need = Math.ceil(rows.length * 0.6);
    const dense = [...colCounts.entries()].filter(([, c]) => c >= need).map(([x]) => x);
    if (dense.length < 6) return null;
    return { minX: Math.min(...dense), maxX: Math.max(...dense), n: dense.length };
  };
  try {
    const back = await decode('e2e-back-mid-mid.png');
    const fwd = await decode('e2e-fwd-mid-mid.png');
    const sb = paperStripOf(back);
    const sf = paperStripOf(fwd);
    check('back mid-drag: BLANK-PAPER flap strip visible (pixels)', !!sb,
      sb ? `paper strip x∈[${sb.minX},${sb.maxX}] (${sb.n} samples)` : 'no paper flap pixels');
    check('forward mid-drag: BLANK-PAPER flap strip visible (pixels)', !!sf,
      sf ? `paper strip x∈[${sf.minX},${sf.maxX}] (${sf.n} samples)` : 'no paper flap pixels');
    if (sb && sf) {
      // mirrored: back strip [minX,maxX] ≈ W-1-maxF .. W-1-minF (±12px)
      const W = fwd.width;
      const tol = 12;
      const okMirror = Math.abs(sb.minX - (W - 1 - sf.maxX)) <= tol && Math.abs(sb.maxX - (W - 1 - sf.minX)) <= tol;
      check('paper flap strips are horizontal mirrors (back ≅ flip(forward))', okMirror,
        `back [${sb.minX},${sb.maxX}] vs mirrored fwd [${W - 1 - sf.maxX},${W - 1 - sf.minX}]`);
    }
  } catch (e) {
    check('blank-paper flap strips visible (pixels)', false, `decoder unavailable: ${e.message}`);
  }
}

// ---- 2. Slow drags from top-third / middle / bottom-third, both ways ----
const yThirds = [
  ['top-third', Math.round(H / 3)],
  ['middle', Math.round(H / 2)],
  ['bottom-third', Math.round((2 * H) / 3)],
];
for (const [label, y] of yThirds) {
  // forward
  await reset(0);
  {
    const idx0 = await getIndex();
    const { dEarly, dMid } = await slowDragWithShots(cdp, { x0: 340, x1: 40, y, name: `e2e-fwd-${label}.png` });
    const idx1 = await getIndex();
    check(`forward from ${label}: immediate fold movement`, dEarly > 0.3, `early ${dEarly.toFixed(2)}%`);
    check(`forward from ${label}: commits`, idx1 === idx0 + 1, `${idx0}→${idx1}`);
    void dMid;
  }
  // back
  await reset(1);
  {
    const idx0 = await getIndex();
    const { dEarly } = await slowDragWithShots(cdp, { x0: 80, x1: 390, y, name: `e2e-back-${label}.png` });
    const idx1 = await getIndex();
    check(`back from ${label}: immediate fold movement`, dEarly > 0.3, `early ${dEarly.toFixed(2)}%`);
    check(`back from ${label}: commits`, idx1 === idx0 - 1, `${idx0}→${idx1}`);
  }
}

// ---- 3. Fast swipes both directions from mid-page ----
await reset(0);
{
  const idx0 = await getIndex();
  await page.evaluate(() => { window.__swipeEvents = []; });
  await drag(cdp, { from: { x: 340, y: H / 2 }, to: { x: 50, y: H / 2 }, steps: 5, stepMs: 16 });
  await page.waitForTimeout(900);
  check('fast swipe left (mid-page) → next', (await getIndex()) === idx0 + 1, `${idx0}→${await getIndex()}`);
  const g = await getGestures();
  check('fast swipe left logged commit-forward', g.some((e) => e.type === 'commit-forward'), JSON.stringify(g));
}
{
  const idx0 = await getIndex();
  await page.evaluate(() => { window.__swipeEvents = []; });
  await drag(cdp, { from: { x: 70, y: H / 2 }, to: { x: 360, y: H / 2 }, steps: 5, stepMs: 16 });
  await page.waitForTimeout(900);
  check('fast swipe right (mid-page) → prev', (await getIndex()) === idx0 - 1, `${idx0}→${await getIndex()}`);
  const g = await getGestures();
  check('fast swipe right logged commit-back', g.some((e) => e.type === 'commit-back'), JSON.stringify(g));
}

// ---- 3b. Downward DIAGONAL swipe (dx dominant, dy > 0): no pull-to-refresh,
//          gesture claimed via preventDefault, page still turns ----
await reset(0);
{
  const idx0 = await getIndex();
  await page.evaluate(() => { window.__swipeEvents = []; window.__pdCount = 0; });
  // dx = -280 (dominant), dy = +160 (downward — the pull-to-refresh trigger)
  await drag(cdp, { from: { x: 340, y: 300 }, to: { x: 60, y: 460 }, steps: 8, stepMs: 30 });
  await page.waitForTimeout(1000);
  const idx1 = await getIndex();
  const pd = await page.evaluate(() => window.__pdCount ?? 0);
  check('diagonal down-forward swipe still turns page', idx1 === idx0 + 1, `${idx0}→${idx1}`);
  check('diagonal swipe: touchmove preventDefault claimed the gesture (no overscroll/pull-to-refresh)', pd > 0, `__pdCount=${pd}`);
  // overscroll hardening present in CSS
  const ob = await page.evaluate(() => {
    const cont = document.querySelector('[data-page-index]').parentElement.parentElement;
    return { container: getComputedStyle(cont).overscrollBehavior, body: getComputedStyle(document.body).overscrollBehavior };
  });
  check('overscroll-behavior contain on reader container', ob.container === 'contain', JSON.stringify(ob));
  check('overscroll-behavior contain on body', ob.body === 'contain', JSON.stringify(ob));
  // back-direction diagonal too (dx > 0, dy > 0)
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900);
  await page.evaluate(() => { window.__swipeEvents = []; window.__pdCount = 0; });
  const idx2 = await getIndex();
  await drag(cdp, { from: { x: 70, y: 300 }, to: { x: 350, y: 470 }, steps: 8, stepMs: 30 });
  await page.waitForTimeout(1000);
  const pd2 = await page.evaluate(() => window.__pdCount ?? 0);
  check('diagonal down-back swipe still turns page', (await getIndex()) === idx2 - 1, `${idx2}→${await getIndex()}`);
  check('diagonal back swipe: preventDefault claimed', pd2 > 0, `__pdCount=${pd2}`);
}

// ---- 4. Spring-back on small abandoned drag ----
await reset(1);
{
  const idx0 = await getIndex();
  await page.evaluate(() => { window.__swipeEvents = []; });
  await drag(cdp, { from: { x: 360, y: H / 2 }, to: { x: 300, y: H / 2 }, steps: 10, stepMs: 40 });
  await page.waitForTimeout(1100);
  const idx1 = await getIndex();
  const g = await getGestures();
  check('small abandoned drag springs back (no commit)', idx1 === idx0, `index=${idx1} gestures=${JSON.stringify(g)}`);
  check('spring-back logged', g.some((e) => e.type === 'spring-back-forward'), JSON.stringify(g));
}

// ---- 5. Keyboard ----
{
  const idx0 = await getIndex();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  check('keyboard ArrowRight → next', (await getIndex()) === idx0 + 1);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  check('keyboard ArrowLeft → prev', (await getIndex()) === idx0);
}

// ---- 6. Edge zones inert on touch (swipe owns the surface) ----
{
  const idx0 = await getIndex();
  await page.click('#next-btn', { position: { x: 30, y: H / 2 }, force: true });
  await page.waitForTimeout(600);
  check('touch context: edge zones stay inert', (await getIndex()) === idx0);
}

// ---- 7. Custom pull-to-refresh (shared hook, real CDP touch) ----
// Threshold: 100px displayed at 0.5x resistance → 200px of finger.
{
  // (b) below threshold (130px raw → 65px displayed): springs back, no refresh
  await reset(1);
  await page.evaluate(() => { window.__swipeEvents = []; });
  await drag(cdp, { from: { x: W / 2, y: 300 }, to: { x: W / 2, y: 430 }, steps: 10, stepMs: 40 });
  await page.waitForTimeout(600);
  let r = await page.evaluate(() => window.__pullRefreshes ?? 0);
  check('pull below threshold: NO refresh fires', r === 0, `refreshes=${r}`);
  check('pull below threshold: index unchanged', (await getIndex()) === 1);
  let g = await getGestures();
  check('pull below threshold logged pull-start + pull-spring-back',
    g.some((e) => e.type === 'pull-start') && g.some((e) => e.type === 'pull-spring-back'), JSON.stringify(g));
  let ps = await page.evaluate(() => window.__pullState ?? {});
  check('sub-threshold pull state settled (armed=false, refreshing=false)', ps.armed === false && ps.refreshing === false, JSON.stringify(ps));

  // (a) above threshold (300px raw → 150px displayed): armed mid-pull,
  //     screenshot of the indicator, then refresh fires and settles
  await reset(1);
  const rest = await page.screenshot();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W / 2, y: 300 }] });
  await new Promise((r2) => setTimeout(r2, 60));
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: W / 2, y: Math.round(300 + 30 * i) }] });
    await new Promise((r2) => setTimeout(r2, 40));
  }
  ps = await page.evaluate(() => window.__pullState ?? {});
  check('deep pull: armed mid-gesture', ps.armed === true && ps.dist >= 100, JSON.stringify(ps));
  const mid = await page.screenshot();
  fs.writeFileSync(path.join(SHOTS, 'e2e-pull-mid.png'), mid);
  const dPull = diffPct(rest, mid);
  check('indicator visible mid-pull (pixels differ from rest)', dPull > 0.2, `diff ${dPull.toFixed(2)}%`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250); // inside the 500ms simulated refetch
  ps = await page.evaluate(() => window.__pullState ?? {});
  check('released at threshold: spinner spinning (refreshing)', ps.refreshing === true, JSON.stringify(ps));
  await page.waitForTimeout(900); // refetch settles + settle animation
  r = await page.evaluate(() => window.__pullRefreshes ?? 0);
  check('released at threshold: refresh fired exactly once', r === 1, `refreshes=${r}`);
  ps = await page.evaluate(() => window.__pullState ?? {});
  check('refresh settled (refreshing=false, settledAt recorded)', ps.refreshing === false && typeof ps.settledAt === 'number', JSON.stringify(ps));
  check('reader still on same page after refresh', (await getIndex()) === 1);
  g = await getGestures();
  check('refresh logged as refresh gesture', g.some((e) => e.type === 'refresh'), JSON.stringify(g.slice(-3)));

  // (d) upward drag: nothing happens
  await reset(1);
  await page.evaluate(() => { window.__swipeEvents = []; window.__pullRefreshes = 0; });
  await drag(cdp, { from: { x: W / 2, y: 520 }, to: { x: W / 2, y: 400 }, steps: 8, stepMs: 40 });
  await page.waitForTimeout(500);
  r = await page.evaluate(() => window.__pullRefreshes ?? 0);
  g = await getGestures();
  check('up-drag: no refresh, logged as vertical-scroll', r === 0 && g.some((e) => e.type === 'vertical-scroll') && !g.some((e) => e.type === 'pull-start'), `refreshes=${r} gestures=${JSON.stringify(g)}`);
  check('up-drag: index unchanged', (await getIndex()) === 1);

  // (c) horizontal + diagonal-downward swipes never fire the refresh
  //     (page-turn behavior already asserted in §3b; here: refresh counter)
  await reset(0);
  await page.evaluate(() => { window.__pullRefreshes = 0; });
  await drag(cdp, { from: { x: 340, y: H / 2 }, to: { x: 50, y: H / 2 }, steps: 5, stepMs: 16 });
  await page.waitForTimeout(900);
  await drag(cdp, { from: { x: 340, y: 300 }, to: { x: 60, y: 460 }, steps: 8, stepMs: 30 });
  await page.waitForTimeout(1000);
  r = await page.evaluate(() => window.__pullRefreshes ?? 0);
  check('horizontal + diagonal-down swipes: no refresh triggered', r === 0, `refreshes=${r}`);
  check('horizontal + diagonal-down swipes: pages still turned', (await getIndex()) >= 1);
}

await context.close();

// ---- Desktop context: mouse drag + edge buttons + keyboard ----
{
  const ctx2 = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const p2 = await ctx2.newPage();
  await p2.goto(`http://localhost:${PORT}/harness/`);
  await p2.waitForFunction(() => document.getElementById('index-display') !== null);
  await p2.waitForTimeout(400);
  const idx0 = await p2.evaluate(() => parseInt((document.getElementById('index-display').textContent || '').replace('index:', '').trim(), 10));
  await p2.mouse.move(700, 350);
  await p2.mouse.down();
  for (let i = 1; i <= 8; i++) { await p2.mouse.move(700 - 60 * i, 350); await p2.waitForTimeout(30); }
  await p2.mouse.up();
  await p2.waitForTimeout(1000);
  check('desktop mouse drag → page turns', (await p2.evaluate(() => parseInt(document.getElementById('index-display').textContent.replace('index:', '').trim(), 10))) > idx0);
  const idxD = await p2.evaluate(() => parseInt(document.getElementById('index-display').textContent.replace('index:', '').trim(), 10));
  await p2.click('#next-btn', { position: { x: 30, y: 350 } });
  await p2.waitForTimeout(900);
  check('desktop edge button turns page', (await p2.evaluate(() => parseInt(document.getElementById('index-display').textContent.replace('index:', '').trim(), 10))) === idxD + 1);
  await p2.keyboard.press('ArrowRight');
  await p2.waitForTimeout(900);
  check('desktop keyboard ArrowRight turns page', (await p2.evaluate(() => parseInt(document.getElementById('index-display').textContent.replace('index:', '').trim(), 10))) === idxD + 2);
  await ctx2.close();
}

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
