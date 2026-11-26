import { chromium } from 'playwright';
const URL = process.argv[2];
const b = await chromium.launch({args:['--no-sandbox']});
const errs = [], reqs = [];
const p = await b.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
p.on('pageerror', e => errs.push('JS: '+e.message));
p.on('requestfailed', r => errs.push('FAILED: '+r.url()));
p.on('request', r => reqs.push(r.url()));
const t0 = Date.now();
await p.goto(URL, {waitUntil:'load', timeout:60000});
const loaded = Date.now() - t0;
await p.waitForTimeout(2000);
const info = await p.evaluate(() => ({
  title: document.title,
  asof: (document.querySelector('.topright b')||{}).textContent,
  cards: document.querySelectorAll('.card').length,
  feed: document.querySelectorAll('.feed li').length,
  canvasPainted: (()=>{const c=document.getElementById('ts');if(!c)return false;
    const g=c.getContext('2d');const d=g.getImageData(0,0,c.width,Math.min(200,c.height)).data;
    for(let i=0;i<d.length;i+=4){if(d[i+3]>0)return true;}return false;})(),
  heatCells: document.querySelectorAll('.heat td.c').length,
  posters: document.querySelectorAll('.posters tbody tr').length,
  footer: (document.querySelector('footer p')||{}).textContent?.trim().slice(0,60),
}));
console.log('load ms:', loaded);
console.log(JSON.stringify(info,null,1));
console.log('external requests:', reqs.filter(u=>!u.startsWith(URL.replace(/\/$/,''))&&!/github\.io/.test(u)).length);
await p.screenshot({path:'shots/live-phone.png', fullPage:false});
await b.close();
console.log('ERRORS:', errs.length?errs:'none');
