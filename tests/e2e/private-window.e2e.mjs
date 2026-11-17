// A private (or restricted) Safari window cannot keep the app or a downloaded model for offline use, and nobody can tell until it fails. The app guesses from what the window
// refuses (chat/connection/private-mode.mjs) and says so. WebKit under Playwright is such a window (no OPFS, no Blob in IndexedDB), so it is the test bed; Chromium is the
// normal window that must NOT be told it is private.
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {setTimeout as sleep} from 'node:timers/promises';
const {webkit,chromium}=createRequire(import.meta.url)('playwright');
import {assert} from './harness.mjs';
import {devSite} from '../helpers/dev-site.mjs';
const ok=n=>console.log('ok   '+n);
execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH||'local',...devSite(process.env.PLC_E2E_BRANCH)}});
const port=18451,origin=`http://127.0.0.1:${port}`;
const web=spawn('node',['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
for(let i=0;i<50;i++){try{if((await fetch(origin+'/')).ok)break;}catch{}await sleep(100);}
const open=async(type,options={})=>{const browser=await type.launch();const context=await browser.newContext({viewport:{width:390,height:800},serviceWorkers:'allow',...options});const page=await context.newPage();
 await page.addInitScript(()=>{localStorage.setItem('plc.inferenceMode.v1','local');localStorage.setItem('plc.lockSplash.v1','off');});
 await page.goto(origin+'/');await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.localModels?.state?.device&&window.plcShell,null,{timeout:60000});return {browser,page};};
const items=page=>page.evaluate(async()=>{window.plcShell.openSettings('models');await new Promise(r=>setTimeout(r,1500));return {summary:document.querySelector('#offlineSummary')?.textContent,items:Object.fromEntries([...document.querySelectorAll('#offlineSection .off-item')].map(x=>[x.dataset.id,x.dataset.state+': '+x.querySelector('.off-detail').textContent.slice(0,80)]))};});
try{
 {const {browser,page}=await open(webkit);
  await page.waitForFunction(()=>/private window/i.test(document.querySelector('#toast')?.textContent||''),null,{timeout:20000});
  const t=await page.locator('#toast').innerText();
  assert(/normal Safari tab/.test(t),'the toast says what to do: '+t);
  ok('WebKit window that refuses file storage: a toast says it looks private and what to do');
  const r=await items(page);
  assert(r.items.window&&r.items.window.startsWith('missing'),'the checklist names it first: '+JSON.stringify(r.items));
  assert(/private window/i.test(r.summary),'and the summary: '+r.summary);
  ok('the checklist says "This window" first, and the summary names it');
  await browser.close();}
 {const {browser,page}=await open(webkit,{viewport:{width:375,height:635}});
  // the real thing in that window: nothing is kept in OPFS, so the 105 MB model is chosen, downloaded, loaded and answers ("hi" and nothing else)
  assert((await page.evaluate(()=>window.localModels.prepareInfo().tier))==='nano','the 105 MB model is the default where file storage is refused');
  await page.fill('#messageInput','hi');await page.evaluate(()=>document.querySelector('#sendBtn').click());
  await page.waitForFunction(()=>{const a=[...document.querySelectorAll('.message.assistant')].pop();return a&&!a.classList.contains('streaming')&&a.innerText.trim().length>20&&window.localModels.state.load.state==='ready';},null,{timeout:240000});
  ok('in that window, "hi" sets the app up with the 105 MB model and gets an answer');
  await browser.close();}
 {const {browser,page}=await open(chromium);
  await page.waitForTimeout(8000);
  assert(!/private window/i.test(await page.locator('#toast').innerText()),'a normal window gets no such toast');
  const r=await items(page);
  assert(!('window' in r.items),'and no such line: '+JSON.stringify(r.items));
  ok('a normal Chromium window is not told it is private');
  await browser.close();}
 console.log('private-window e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{web.kill();}
