import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve('dist-harness'); const PORT = 4180;
const s = http.createServer((q,r)=>{let f=q.url; if(f.endsWith('/'))f+='index.html'; const p=path.join(ROOT,f);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);r.end();return;}
 r.writeHead(200,{'content-type':{'.html':'text/html','.js':'text/javascript','.css':'text/css'}[path.extname(p)]||'application/octet-stream'});
 fs.createReadStream(p).pipe(r);});
await new Promise(r=>s.listen(PORT,r));
const { chromium } = await import('/tmp/bb-repro/node_modules/playwright/index.mjs');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:420,height:800}, hasTouch:true, isMobile:true });
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
page.on('pageerror',e=>console.log('PAGEERROR:',e.message));
await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
await page.goto(`http://localhost:${PORT}/harness/`);
await page.waitForFunction(()=>document.getElementById('index-display')!==null);
await page.waitForTimeout(600);
// go to page 1 first via fast swipe
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:300,y:400}]});
for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:300-40*i,y:400}]});await page.waitForTimeout(16);}
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(900);
console.log('after swipe index:', await page.evaluate(()=>document.getElementById('index-display').textContent));
// slow drag PREV: 120 -> 350
await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:400}]});
await page.waitForTimeout(150);
const flapSel = 'div[style*="z-index: 30"]';
for(let i=1;i<=10;i++){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:120+23*i,y:400}]});
  await page.waitForTimeout(70);
  const t = await page.evaluate((sel)=>{const e=document.querySelector(sel); return e? e.style.transform.slice(0,60)+' clip='+(e.style.clipPath||'').slice(0,30) : null;},flapSel);
  console.log('step',i,'finger',120+23*i,'flap:',t,'prog:',await page.evaluate(()=>window.__probe.progress()),'dir:',await page.evaluate(()=>window.__dir));
}
await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
await page.waitForTimeout(1200);
console.log('final:', await page.evaluate(()=>({idx:document.getElementById('index-display').textContent, swipe:window.__swipeEvents??[]})));
await b.close(); s.close();
