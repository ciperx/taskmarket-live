import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox']});
const errs = [];
for (const [name,w,h,full] of [['desk',1280,900,true],['phone',390,844,false]]) {
  const p = await b.newPage({viewport:{width:w,height:h}, deviceScaleFactor:1});
  p.on('pageerror', e => errs.push(name+': '+e.message));
  p.on('console', m => { if (m.type()==='error') errs.push(name+' console: '+m.text()); });
  await p.goto('http://127.0.0.1:8899/index.html',{waitUntil:'networkidle'});
  await p.waitForTimeout(1500);
  await p.screenshot({path:`shots/${name}.png`, fullPage:full});
  console.log(name,'shot ok', await p.evaluate(()=>document.body.scrollHeight));
  await p.close();
}
await b.close();
console.log('ERRORS:', errs.length ? errs : 'none');
