// The whole offline lifecycle with a real on-device model (offline plan 0.2 and 4.2). A RELEASE CHECK: it downloads the small model
// (about 1.5 GB from the real CDN) and generates real replies, so it takes minutes and is not part of the per-push CI run.
//
//   node tests/e2e/offline-model.e2e.mjs                 (OFFLINE_MATRIX_OUT=docs/evidence/offline/matrix-chromium.json to keep the matrix)
//
// Phase A, online, in a fresh browser profile: open the app, let the service worker save it, download and load the model, chat, make a
// conversation with a marker word. Phase B: close the browser completely, start a new one on the same profile with the network cut
// (every request is refused by the browser and by a route, so nothing is answered by the test), and try each feature the way a person
// would. Each check is recorded in a matrix and the run fails if any check that must work did not. Phase C: back online.
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {devSite} from '../helpers/dev-site.mjs';
const {chromium}=createRequire(import.meta.url)('playwright');

const root=process.cwd(),port=18341,origin=`http://127.0.0.1:${port}`,MARKER='zebra-lantern-'+Date.now().toString(36);
execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH||'main',...devSite(process.env.PLC_E2E_BRANCH)}});
const web=spawn('node',['scripts/serve.mjs'],{env:{...process.env,PORT:String(port)},stdio:'pipe'});
for(let i=0;i<50;i++){try{if((await fetch(origin+'/')).ok)break;}catch{}await sleep(100);}
await mkdir(path.join(root,'work'),{recursive:true});
const profile=await mkdtemp(path.join(root,'work','offline-profile-'));
const matrix={origin,build:process.env.PLC_E2E_BRANCH||'main',startedAt:new Date().toISOString(),checks:[],requests:{failedOffline:[],foreign:[]}};
const check=(name,ok,detail='',must=true)=>{matrix.checks.push({name,ok:Boolean(ok),must,detail:String(detail).slice(0,300)});console.log((ok?'ok   ':must?'FAIL ':'warn ')+name+(detail?'  '+String(detail).slice(0,160):''));};
const open=async()=>chromium.launchPersistentContext(profile,{headless:true,viewport:{width:1280,height:800},serviceWorkers:'allow'});
const waitReply=async(page,before)=>{
 await page.waitForFunction(n=>{const a=[...document.querySelectorAll('.message.assistant')];return a.length>n&&!a[a.length-1].classList.contains('streaming')&&a[a.length-1].innerText.trim().length>0;},before,{timeout:600000});
 return page.locator('.message.assistant').last().innerText();
};
const send=async(page,text)=>{const n=await page.locator('.message.assistant').count();await page.fill('#messageInput',text);await page.click('#sendBtn');return waitReply(page,n);};

let context,page;
try{
 // ---------------------------------------------------------------- Phase A: online
 context=await open();page=await context.newPage();
 await page.goto(origin+'/');await page.waitForSelector('#messageInput');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>navigator.serviceWorker.controller||false,null,{timeout:30000}).catch(async()=>{await page.reload();await page.waitForSelector('#messageInput');});
 await page.waitForFunction(()=>/Offline app ready/.test(document.querySelector('#offlineStatus')?.textContent||''),null,{timeout:120000});
 check('A: the app is saved for offline use',true,await page.locator('#offlineStatus').innerText());
 await page.waitForFunction(()=>window.localModels?.state,null,{timeout:120000});
 await page.evaluate(()=>window.localModels.setMode('local'));
 const t0=Date.now();
 const first=await send(page,`Reply with one short sentence that includes the word ${MARKER}.`);
 check('A: a real reply from the downloaded model',first.length>0,`${Math.round((Date.now()-t0)/1000)} s: ${first}`);
 const tier=await page.evaluate(()=>window.localModels.selectedTier);
 const installed=await page.evaluate(()=>window.localModels.installed);
 check('A: the model is installed',installed,tier);
 await page.waitForTimeout(25000); // best-effort runtime files finish saving
 const saved=await page.evaluate(async()=>{const k=(await caches.keys()).filter(n=>n.startsWith('plc-shell-'));const c=await caches.open(k[k.length-1]);const ks=(await c.keys()).map(r=>new URL(r.url).pathname);return {files:ks.length,bulk:ks.filter(p=>/vendor\/(wllama|webllm)\//.test(p)).length};});
 check('A: the model runtime files are saved by the service worker',saved.bulk>0,JSON.stringify(saved),false);
 await context.close();

 // ---------------------------------------------------------------- Phase B: offline, brand-new browser on the same profile
 context=await open();
 await context.setOffline(true);
 await context.route(url=>url.origin!==origin,route=>{matrix.requests.foreign.push(route.request().url().slice(0,120));return route.abort('internetdisconnected');});
 page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('requestfailed',r=>{const u=new URL(r.url());matrix.requests.failedOffline.push((u.origin===origin?'':'foreign ')+u.pathname.replace(/^\/releases\/[^/]+/,'')+' '+(r.failure()?.errorText||''));});
 await page.goto(origin+'/').catch(e=>errors.push('goto: '+e.message));
 const booted=await page.waitForSelector('#messageInput',{timeout:30000}).then(()=>true,()=>false);
 check('B: the app opens cold with no connection',booted);
 check('B: no failure banner and the page finished starting',booted&&await page.evaluate(()=>window.__plcBooted===true&&!/couldn.t start/i.test(document.body.innerText)),errors.join(' | '));
 check('B: the earlier conversation is still there',await page.evaluate(m=>(localStorage.getItem('chatThreads')||'').includes(m),MARKER));
 check('B: the model is still installed',await page.waitForFunction(()=>window.localModels?.state,null,{timeout:60000}).then(()=>page.evaluate(()=>window.localModels.installed),()=>false),tier);
 const second=await send(page,'Reply with one short sentence: what is two plus three?').catch(e=>'ERROR '+e.message);
 check('B: a real reply from the model with no connection',!/^ERROR/.test(second)&&second.length>0,second);
 // search finds the earlier conversation (keyword search needs no network; the matching model, never downloaded here, is only a bonus)
 await page.keyboard.press('Control+k');
 const t1=Date.now();
 await page.waitForSelector('#searchOverlay',{state:'visible',timeout:10000}).catch(()=>{});
 await page.fill('.search-input',MARKER);
 const found=await page.waitForSelector('.search-item',{timeout:30000}).then(()=>true,()=>false);
 const shown=found?await page.locator('.search-item').first().innerText():await page.locator('#searchOverlay').innerText().catch(()=>'(no overlay)');
 check('B: search finds the earlier conversation by its words',found&&/Reply with one short sentence/.test(shown),Math.round((Date.now()-t1)/1000)+' s: '+shown.replace(/\s+/g,' '));
 await page.keyboard.press('Escape');
 // the public pages
 const help=await context.newPage();await help.goto(origin+'/help').catch(()=>{});
 check('B: Help opens its own page',await help.locator('h1').first().innerText().then(t=>/help/i.test(t),()=>false));
 await help.close();
 // the reasons: what the page says about the connection
 const state=await page.evaluate(()=>({status:document.querySelector('#offlineStatus')?.textContent,online:navigator.onLine}));
 check('B: the browser reports offline',state.online===false);
 // what the person sees: the pill (calm, on-device chat works) and the checklist (everything ready)
 check('B: the connection pill says Offline, and that on-device chat still works',await page.waitForSelector('#connectionPill',{state:'visible',timeout:8000}).then(async()=>/Offline/.test(await page.locator('#connectionPill').innerText())&&/On-device chat still works/.test(await page.locator('#connectionPill').getAttribute('title')),()=>false));
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForSelector('#offlineSection .off-item[data-id="model"]');
 await page.waitForFunction(()=>/^Ready for offline use/.test(document.querySelector('#offlineSummary')?.innerText||''),null,{timeout:15000}).catch(()=>{});
 const states=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#offlineSection .off-item')].map(li=>[li.dataset.id,li.dataset.state])));
 check('B: Settings says this device is ready for offline use',/^Ready for offline use/.test(await page.locator('#offlineSummary').innerText())&&states.app==='ready'&&states.model==='ready'&&states.runtime==='ready',JSON.stringify(states));
 await page.keyboard.press('Escape');
 const ownFailures=matrix.requests.failedOffline.filter(r=>!r.startsWith('foreign '));
 check('B: no file of the app itself failed to load',ownFailures.length===0,ownFailures.join(', '));
 // A model that was never downloaded is fetched from the CDN when something asks for it. That is allowed, but it is listed so a
 // request nobody expected shows up here. Only the matching-model files for search are expected.
 const unexpected=matrix.requests.foreign.filter(u=>!/\/models\/memory\//.test(u));
 check('B: nothing outside this app was reached except the optional matching model',unexpected.length===0,unexpected.join(', '));
 await context.close();

 // ---------------------------------------------------------------- Phase C: online again
 context=await open();page=await context.newPage();
 const errors2=[];page.on('pageerror',e=>errors2.push(e.message));
 await page.goto(origin+'/');await page.waitForSelector('#messageInput');
 check('C: back online, the app opens and still has the conversation',await page.evaluate(m=>(localStorage.getItem('chatThreads')||'').includes(m),MARKER)&&errors2.length===0,errors2.join(' | '));
}catch(e){check('run completed',false,e.stack||e.message);}
finally{
 try{await context?.close();}catch{}
 web.kill();await rm(profile,{recursive:true,force:true});
 matrix.finishedAt=new Date().toISOString();
 if(process.env.OFFLINE_MATRIX_OUT){await mkdir(path.dirname(process.env.OFFLINE_MATRIX_OUT),{recursive:true});await writeFile(process.env.OFFLINE_MATRIX_OUT,JSON.stringify(matrix,null,1)+'\n');}
 const failed=matrix.checks.filter(c=>c.must&&!c.ok);
 console.log(failed.length?`\n${failed.length} required check(s) failed`:'\noffline-model e2e: ok');
 process.exit(failed.length?1:0);
}
