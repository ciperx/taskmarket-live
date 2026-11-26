import { chromium } from 'playwright';
const b = await chromium.launch({args:['--no-sandbox']});
const p = await b.newPage({viewport:{width:390,height:1100}, deviceScaleFactor:1});
await p.goto('https://ciperx.github.io/taskmarket-live/?range=30d',{waitUntil:'load',timeout:60000});
await p.waitForTimeout(2000);
await p.evaluate(()=>document.querySelector('.deepbar').scrollIntoView({block:'center'}));
await p.waitForTimeout(400);
await p.screenshot({path:'shots/nav.png'});
await b.close(); console.log('ok');
