// On a phone the app must feel like an app, not a page: the page itself never scrolls or rubber-bands, Settings keeps its title and every section button visible at the top
// (all of them at once, in two columns; a scrolling row hid some), and only the content scrolls. Checked in WebKit with an iPhone 11 Pro viewport.
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {setTimeout as sleep} from 'node:timers/promises';
const {webkit,devices}=createRequire(import.meta.url)('playwright');
import {assert} from './harness.mjs';
import {devSite} from '../helpers/dev-site.mjs';
const ok=n=>console.log('ok   '+n);
execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH||'local',...devSite(process.env.PLC_E2E_BRANCH)}});
const port=18471,origin=`http://127.0.0.1:${port}`;
const web=spawn('node',['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
for(let i=0;i<50;i++){try{if((await fetch(origin+'/')).ok)break;}catch{}await sleep(100);}
try{
 const browser=await webkit.launch();const context=await browser.newContext({...devices['iPhone 11 Pro']});const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('plc.lockSplash.v1','off');});
 await page.goto(origin+'/');await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.plcShell,null,{timeout:30000});
 const pageScroll=()=>page.evaluate(()=>({can:document.scrollingElement.scrollHeight>document.scrollingElement.clientHeight+1,overscroll:getComputedStyle(document.documentElement).overscrollBehaviorY}));
 let m=await pageScroll();
 assert(!m.can,'the chat screen does not scroll as a page');assert(m.overscroll==='none','and does not rubber-band: '+m.overscroll);
 ok('the page itself does not scroll or bounce');
 await page.evaluate(()=>window.plcShell.openSettings('models'));await page.waitForTimeout(1200);
 const r=await page.evaluate(async()=>{const c=document.querySelector('.settings-content'),nav=document.querySelector('.settings-nav');
  const navBox=nav.getBoundingClientRect();const before={top:Math.round(navBox.top),h:Math.round(navBox.height),vh:innerHeight,ch:c.clientHeight,sh:c.scrollHeight};
  c.scrollTop=900;await new Promise(r=>setTimeout(r,300));
  return {before,navTopAfter:Math.round(nav.getBoundingClientRect().top),scrolled:c.scrollTop,page:document.scrollingElement.scrollTop};});
 assert(r.before.sh>r.before.ch*2&&r.scrolled>0,'the content scrolls in its own region: '+JSON.stringify(r));
 assert(r.navTopAfter===0&&r.page===0,'while the header stays put and the page does not move: '+JSON.stringify(r));
 ok('Settings: a header that stays, a content area that scrolls by itself');
 const nav=await page.evaluate(()=>{const n=document.querySelector('.settings-nav'),vw=innerWidth;const items=[...n.querySelectorAll('.settings-nav-item')].filter(b=>b.getBoundingClientRect().width>0);
  return {count:items.length,allInside:items.every(b=>{const r=b.getBoundingClientRect();return r.left>=0&&r.right<=vw+0.5&&r.height>0;}),hScroll:n.scrollWidth>n.clientWidth+1,names:items.map(b=>b.innerText.trim())};});
 assert(nav.count>=8,'every section button is visible: '+JSON.stringify(nav.names));
 assert(nav.allInside&&!nav.hScroll,'all of them on the screen at once, nothing to swipe: '+JSON.stringify(nav));
 ok('all '+nav.count+' Settings sections are visible at once, nothing to swipe');
 await browser.close();
 console.log('app-feel e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{web.kill();}
