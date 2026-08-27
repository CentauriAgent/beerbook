import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '/tmp/bb-repro/node_modules/playwright/index.mjs';

const ROOT = path.resolve('dist-harness');
const PORT = 4191;
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
  await page.goto(`http://localhost:${PORT}/harness/profile.html`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => (window).__ready === true, null, { timeout: 8000 });

  const info = await page.evaluate(() => {
    const el = document.body;
    const all = [...document.querySelectorAll('div')];
    let target = null;
    for (const d of all) {
      if (d.className.includes('from-amber-900')) { target = d; break; }
    }
    if (!target) return { found: false };
    const cs = getComputedStyle(target);
    return {
      found: true,
      bgImage: cs.backgroundImage,
      bgColor: cs.backgroundColor,
      className: target.className,
    };
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
  server.close();
});
