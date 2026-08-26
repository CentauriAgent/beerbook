/**
 * Beerbook page-turn E2E verification.
 * - Mocks Nostr relays via Playwright routeWebSocket (signed synthetic
 *   kind-1 #beerbook check-ins, so the reader has deterministic pages).
 * - Drives the reader with REAL touch (CDP Input.dispatchTouchEvent) and
 *   mouse drags, both directions; screenshots mid-drag; asserts index
 *   changes via the active progress dot; checks keyboard + edge buttons.
 */
import { chromium } from 'playwright';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools';
import fs from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173';
const SHOTS = new URL('./verify-shots/', import.meta.url).pathname;
fs.mkdirSync(SHOTS, { recursive: true });

const sk = generateSecretKey();
const pk = getPublicKey(sk);

const BEERS = [
  ['Hazy Little Thing', 'Sierra Nevada', 4.5],
  ['Two Hearted Ale', 'Bell\'s Brewery', 5],
  ['Pilsner Urquell', 'Plzeňský Prazdroj', 4],
  ['Breakside Pils', 'Breakside Brewery', 3.5],
];

const events = BEERS.map(([beer, brewery, rating], i) =>
  finalizeEvent(
    {
      kind: 1,
      created_at: 1700000000 + i * 3600,
      tags: [
        ['t', 'beerbook'],
        ['beer_name', beer],
        ['brewery', brewery],
        ['rating', String(rating)],
      ],
      content: `🍺 Drinking ${beer} by ${brewery}\n— ${rating} ★\n\nTest page ${i + 1}. #beerbook`,
    },
    sk,
  ),
);

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

async function getIndex(page) {
  return page.evaluate(() => {
    const dots = [...document.querySelectorAll('span.h-1\\.5')];
    if (dots.length) {
      const i = dots.findIndex((d) => d.className.includes('w-5'));
      if (i >= 0) return i;
    }
    const m = document.body.innerText.match(/(\d+)\s*\/\s*\d+/);
    return m ? Number(m[1]) - 1 : null;
  });
}

async function waitForBook(page) {
  await page.waitForFunction(
    () => document.querySelectorAll('span.h-1\\.5').length > 0 || /\d+\s*\/\s*\d+/.test(document.body.innerText),
    { timeout: 20000 },
  );
}

async function mouseDrag(page, from, to, steps = 12, shotPath = null) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
    if (shotPath && i === Math.floor(steps / 2)) await page.screenshot({ path: shotPath });
    await page.waitForTimeout(30);
  }
  await page.mouse.up();
}

async function touchDrag(cdp, from, to, steps = 12, shotPage = null, shotPath = null) {
  const pt = (x, y) => ({ x: Math.round(x), y: Math.round(y) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(from.x, from.y)] });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t)],
    });
    if (shotPath && i === Math.floor(steps / 2) && shotPage) await shotPage.screenshot({ path: shotPath });
    await new Promise((r) => setTimeout(r, 40));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  // Mock every relay WebSocket: answer REQs with our synthetic feed.
  await context.routeWebSocket(/wss:\/\/.*/, (ws) => {
    ws.onMessage((data) => {
      let msg;
      try { msg = JSON.parse(String(data)); } catch { return; }
      if (msg[0] === 'REQ') {
        const [, sub, filter] = msg;
        const wantKinds = filter?.kinds ?? [1];
        for (const ev of events) {
          if (wantKinds.includes(ev.kind)) ws.send(JSON.stringify(['EVENT', sub, ev]));
        }
        ws.send(JSON.stringify(['EOSE', sub]));
      }
      // CLOSE / EVENT from client: ignore.
    });
  });

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await waitForBook(page);

  const total = await page.evaluate(() => document.querySelectorAll('span.h-1\\.5').length);
  check('book loaded with mocked feed', total === 4, `${total} pages`);

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  // ---- Forward: mouse drag (right corner sweeps left) ----
  let idx = await getIndex(page);
  await mouseDrag(page, { x: 360, y: 700 }, { x: 100, y: 700 }, 14, `${SHOTS}/mouse-forward-mid.png`);
  await page.waitForTimeout(900);
  let idx2 = await getIndex(page);
  check('mouse forward turn commits (0 → 1)', idx === 0 && idx2 === 1, `${idx} → ${idx2}`);

  // ---- Back: mouse drag (left edge sweeps right) ----
  await mouseDrag(page, { x: 30, y: 700 }, { x: 300, y: 700 }, 14, `${SHOTS}/mouse-back-mid.png`);
  await page.waitForTimeout(900);
  let idx3 = await getIndex(page);
  check('mouse back turn commits (1 → 0)', idx2 === 1 && idx3 === 0, `${idx2} → ${idx3}`);

  // ---- Forward: REAL touch via CDP ----
  await touchDrag(cdp, { x: 360, y: 700 }, { x: 100, y: 700 }, 14, page, `${SHOTS}/touch-forward-mid.png`);
  await page.waitForTimeout(900);
  const idx4 = await getIndex(page);
  check('touch forward turn commits (0 → 1)', idx3 === 0 && idx4 === 1, `${idx3} → ${idx4}`);

  // ---- Back: REAL touch via CDP ----
  await touchDrag(cdp, { x: 30, y: 700 }, { x: 300, y: 700 }, 14, page, `${SHOTS}/touch-back-mid.png`);
  await page.waitForTimeout(900);
  const idx5 = await getIndex(page);
  check('touch back turn commits (1 → 0)', idx4 === 1 && idx5 === 0, `${idx4} → ${idx5}`);

  // ---- Spring back: shallow drag released early should NOT commit ----
  await mouseDrag(page, { x: 380, y: 700 }, { x: 330, y: 700 }, 8);
  await page.waitForTimeout(900);
  const idx6 = await getIndex(page);
  check('shallow drag springs back (index stays)', idx5 === idx6, `${idx5} → ${idx6}`);

  // ---- Keyboard ----
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const idx7 = await getIndex(page);
  check('ArrowRight advances', idx6 === 0 && idx7 === 1, `${idx6} → ${idx7}`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(900);
  const idx8 = await getIndex(page);
  check('ArrowLeft goes back', idx7 === 1 && idx8 === 0, `${idx7} → ${idx8}`);

  // ---- Edge buttons (CSS gates them to hover-capable pointers by design —
  //      hasTouch contexts match (hover:none), so drive the handlers directly) ----
  await page.evaluate(() => document.querySelector('button[aria-label="Next page"]')?.click());
  await page.waitForTimeout(900);
  const idx9 = await getIndex(page);
  check('right edge button advances', idx8 === 0 && idx9 === 1, `${idx8} → ${idx9}`);
  await page.evaluate(() => document.querySelector('button[aria-label="Previous page"]')?.click());
  await page.waitForTimeout(900);
  const idx10 = await getIndex(page);
  check('left edge button goes back', idx9 === 1 && idx10 === 0, `${idx9} → ${idx10}`);

  // ---- Gesture log evidence (touch context) ----
  const gestures = await page.evaluate(() => (window).__swipeEvents ?? []);
  const commits = gestures.filter((g) => g.type.startsWith('commit'));
  const springs = gestures.filter((g) => g.type.startsWith('spring-back'));
  check('gesture log shows commits + spring-backs', commits.length >= 4 && springs.length >= 1,
    `commits=${commits.length} springs=${springs.length} :: ${gestures.map((g) => g.type).join(', ')}`);

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
};

run().catch((e) => { console.error(e); process.exit(1); });
