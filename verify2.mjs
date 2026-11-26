import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox']});
const errs=[];
const p = await b.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
p.on('pageerror',e=>errs.push(e.message));
// deep link must restore state
await p.goto('https://ciperx.github.io/taskmarket-live/?range=30d&heat=hourOfWeek',{waitUntil:'load',timeout:60000});
await p.waitForTimeout(2200);
const st = await p.evaluate(()=>({
  rangeOn: document.querySelector('[data-range].on')?.getAttribute('data-range'),
  heatOn: document.querySelector('[data-heat].on')?.getAttribute('data-heat'),
  heatRows: document.querySelectorAll('.heat tbody tr').length,
  deepLinks: document.querySelectorAll('.deepbar a').length,
  canvas: (()=>{const c=document.getElementById('ts');const d=c.getContext('2d').getImageData(0,0,c.width,Math.min(200,c.height)).data;for(let i=0;i<d.length;i+=4)if(d[i+3]>0)return true;return false;})(),
}));
console.log(JSON.stringify(st,null,1));
// check nav breaks mobile layout
const ov = await p.evaluate(()=>{const r=document.querySelector('.deepbar');const b=r.getBoundingClientRect();return {w:b.width, overflow: document.documentElement.scrollWidth>390};});
console.log('nav', ov);
await p.screenshot({path:'shots/live-deeplink.png'});
await b.close();
console.log('ERRORS:', errs.length?errs:'none');
