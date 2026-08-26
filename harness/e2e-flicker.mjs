/* Flicker probe: captures compositor frames (CDP Page.startScreencast,
 * everyFrame) through the end of a committed page turn and asserts the
 * settle is MONOTONIC — once the destination page is fully shown, no later
 * frame may regress (show the old page / blank / partial fold again).
 *
 * Frame classification: harness pages are solid colors; sample a 9-point
 * grid and classify each pixel to the nearest harness page color. A frame
 * is page-N if ≥7/9 samples match color N. Blank/flap frames are anything
 * else (cream paper flap, mixed fold, background).
 *
 * Usage: node harness/e2e-flicker.mjs [--label NAME]
 * Writes harness/flicker-<label>-{seq}.png for any regressing frame.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist-harness');
const PORT = 4181;
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  return i > 0 ? process.argv[i + 1] : 'run';
})();
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

// Harness page colors (must match harness/harness-main.tsx COLORS, as rgb)
const PAGE_COLORS = [
  [0x7f, 0x1d, 0x1d],
  [0x14, 0x53, 0x2d],
  [0x1e, 0x3a, 0x8a],
  [0x71, 0x3f, 0x12],
  [0x4a, 0x04, 0x4e],
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 420, height: 800 }, hasTouch: true, isMobile: true });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
try { await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }); } catch { /* older chrome */ }
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

await page.goto(`http://localhost:${PORT}/harness/`);
await page.waitForFunction(() => document.getElementById('index-display') !== null, { timeout: 10000 });
await page.waitForTimeout(500);

// --- screencast frame collection ---
let frames = [];        // { data: Buffer, ts }
let collecting = false;
cdp.on('Page.screencastFrame', async (ev) => {
  if (collecting) frames.push({ data: Buffer.from(ev.data, 'base64'), ts: ev.metadata.timestamp ?? performance.now() });
  try { await cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }); } catch { /* closed */ }
});
await cdp.send('Page.startScreencast', { format: 'png', everyFrame: true });
await page.waitForTimeout(300);

const { PNG } = await import('/tmp/bb-repro/node_modules/pngjs/lib/png.js');
const decode = (buf) => PNG.sync.read(buf);

/** Classify a frame: index of matched page color, or null. */
function classify(png) {
  const { width: W, height: H, data } = png;
  const matches = new Array(PAGE_COLORS.length).fill(0);
  const pts = [];
  for (let fy = 1; fy <= 3; fy++) for (let fx = 1; fx <= 3; fx++) pts.push([Math.floor((W * fx) / 4), Math.floor((H * fy) / 4)]);
  for (const [x, y] of pts) {
    const i = (W * y + x) << 2;
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    PAGE_COLORS.forEach((c, ci) => {
      if (Math.abs(r - c[0]) + Math.abs(g - c[1]) + Math.abs(b - c[2]) <= 24) matches[ci]++;
    });
  }
  const best = matches.indexOf(Math.max(...matches));
  return matches[best] >= 7 ? best : null;
}

/** Raw touch drag (mirrors e2e-touch drag helper). */
async function drag(c, { from, to, steps = 12, stepMs = 40 }) {
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y) }] });
  await new Promise((r) => setTimeout(r, 60));
  for (let i = 1; i <= steps; i++) {
    const x = from.x + ((to.x - from.x) * i) / steps;
    const y = from.y + ((to.y - from.y) * i) / steps;
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x), y: Math.round(y) }] });
    await new Promise((r) => setTimeout(r, stepMs));
  }
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/**
 * Run one commit turn under screencast, then analyze.
 * dir 'forward': 0→1 (page0 = red, page1 = green). dir 'back': 1→0.
 * Returns analysis log lines.
 */
async function turnAndAnalyze(dir) {
  const idx = () => page.evaluate(() => parseInt((document.getElementById('index-display').textContent || '').replace('index:', '').trim(), 10));
  // ensure starting index
  const startIdx = dir === 'forward' ? 0 : 1;
  const cur = await idx();
  for (let k = cur; k < startIdx; k++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(900); }
  for (let k = cur; k > startIdx; k--) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(900); }
  await page.waitForTimeout(200);

  const dst = dir === 'forward' ? startIdx + 1 : startIdx - 1;
  frames = [];
  collecting = true;
  if (dir === 'forward') await drag(cdp, { from: { x: 340, y: 400 }, to: { x: 40, y: 400 }, steps: 12, stepMs: 40 });
  else await drag(cdp, { from: { x: 80, y: 400 }, to: { x: 380, y: 400 }, steps: 12, stepMs: 40 });
  // capture through commit animation end + settle window
  await page.waitForFunction((d) => !window.__probe.busy() && parseInt((document.getElementById('index-display').textContent || '').replace('index:', '').trim(), 10) === d, dst, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  collecting = false;

  const cls = frames.map((f) => ({ ...f, page: classify(decode(f.data)) }));

  // Settle = first frame that begins a run of >=2 consecutive dst frames.
  // (Screencast only emits frames on visual change, so after a settle the
  // stream is quiet; any non-dst frame AFTER that point — old-page flash,
  // blank, or fold re-appearance — is a flicker regression.)
  let runStart = -1;
  for (let i = 0; i + 1 < cls.length; i++) {
    if (cls[i].page === dst && cls[i + 1].page === dst) { runStart = i; break; }
  }
  if (runStart < 0) return { ok: false, lines: ['NO settled dst frame captured', `frames=${cls.length}`], cls };

  const regressions = [];
  for (let i = runStart + 2; i < cls.length; i++) {
    if (cls[i].page !== dst) regressions.push({ i, page: cls[i].page });
  }

  const lines = [];
  lines.push(`dir=${dir}: ${cls.length} frames captured; settle at frame ${runStart}; regressions after settle: ${regressions.length ? regressions.map((r) => `#${r.i}->page${r.page ?? 'blank/mixed'}`).join(',') : 'none'}`);
  // full class sequence for debugging
  lines.push('seq: ' + cls.map((f) => f.page === null ? '.' : f.page).join(''));
  regressions.slice(0, 3).forEach((r) => {
    fs.writeFileSync(path.join(SHOTS, `flicker-${LABEL}-${dir}-${r.i}.png`), frames[r.i].data);
  });
  return { ok: regressions.length === 0, lines, cls };
}

const results = [];
for (const dir of ['forward', 'back']) {
  for (let trial = 0; trial < 3; trial++) {
    const r = await turnAndAnalyze(dir);
    r.lines.forEach((l) => console.log(l));
    results.push({ dir, trial, ok: r.ok });
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${dir} trial ${trial}: monotonic settle`);
  }
}

await cdp.send('Page.stopScreencast').catch(() => {});
await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
