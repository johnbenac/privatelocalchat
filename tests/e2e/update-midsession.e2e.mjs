// A new build is published while a tab is open (docs/UPGRADE-BEHAVIOUR.md): the tab keeps the build it started on and keeps working, offers the new one without reloading itself,
// asks before interrupting a reply or unsent text, and picks the new build up when the person reloads.
// A deploy is made the way production makes one: the site is rebuilt as another commit, and the earlier commit's folder is gone from the server.
//   node scripts/e2e.mjs update-midsession
process.env.PLC_E2E_BRANCH??='main';
import {execFileSync} from 'node:child_process';
import {renameSync,rmSync} from 'node:fs';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40);
process.env.GITHUB_SHA=A;
const {launch,assert}=await import('./harness.mjs');
const ok=n=>console.log('PASS '+n);
const h=await launch({port:18501,serviceWorkers:'allow'});
const {page,errors,origin}=h;
const ready=async()=>{await page.waitForSelector('#messageInput');await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);};
// built beside the live site and swapped in at once, so the server never answers 404 for the worker script in between (a browser unregisters a worker whose script is missing)
const deploy=sha=>{
  execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,GITHUB_SHA:sha,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH,BUILD_OUT_DIR:'dist-next'}});
  renameSync('dist','dist-old');renameSync('dist-next','dist');rmSync('dist-old',{recursive:true,force:true});
};
const cacheNames=()=>page.evaluate(async()=>(await caches.keys()).filter(k=>k.startsWith('plc-shell-')));
const checkForNewer=()=>page.evaluate(()=>window.dispatchEvent(new Event('plc-check-update')));
const newServiceWorker=async sha=>{ // the browser's own check for a new worker, then wait for it to take over
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update();});
  await page.waitForFunction(async s=>(await caches.keys()).includes('plc-shell-'+s)&&(await navigator.serviceWorker.getRegistration()).active?.scriptURL!==undefined&&!(await navigator.serviceWorker.getRegistration()).waiting&&!(await navigator.serviceWorker.getRegistration()).installing,sha,{timeout:30000});
  await page.waitForTimeout(800);
};
const noticeText=()=>page.locator('#updateNotice').innerText();
let navigations=0;
try{
  await ready();
  page.on('framenavigated',f=>{if(f===page.mainFrame())navigations++;});
  await page.waitForFunction(async c=>Boolean(navigator.serviceWorker.controller)&&(await caches.keys()).includes('plc-shell-'+c),A,{timeout:30000});
  assert((await page.evaluate(()=>window.APP_BUILD.commit))===A,'the tab runs build A');
  assert((await fetch(`${origin}/releases/${A}/chat/stream.mjs`)).status===200,'build A is on the server to begin with');
  await page.evaluate(()=>{window.__aliveSince=Date.now();});

  // 1. build B is published: the tab is offered it, and nothing reloads
  deploy(B);
  assert((await fetch(`${origin}/releases/${A}/chat/stream.mjs`)).status===404,'build A is gone from the server after the deploy, as it is in production');
  await checkForNewer();
  await page.waitForSelector('#updateNotice',{timeout:10000});
  let text=await noticeText();
  assert(/new version of Private Local Chat is ready/.test(text)&&/What changed/.test(text)&&/Reload/.test(text)&&/Later/.test(text),'the notice says a new version is ready, links to what changed, and offers Reload and Later: '+text);
  assert((await page.getAttribute('#updateNotice a','href'))==='/updates/','"What changed" goes to the updates page');
  await page.waitForTimeout(3000);
  assert(navigations===0&&await page.evaluate(()=>window.__aliveSince!==undefined),'the page did not reload by itself: '+navigations);
  assert((await page.evaluate(()=>window.APP_BUILD.commit))===A,'the tab still runs build A');
  ok('a newer build is offered, with a link to what changed, and the page stays as it is');

  // 2. the tab keeps working on A: the service worker for B takes over, and the saved copy of A is still there
  await newServiceWorker(B);
  let r=await page.evaluate(async c=>{const x=await fetch(`/releases/${c}/chat/stream.mjs`);return {status:x.status,length:(await x.text()).length};},A);
  assert(r.status===200&&r.length>100,'a file of build A still loads in the open tab after build B took over: '+JSON.stringify(r));
  await page.evaluate(async c=>{await import(window.plcApp.moduleBase()+'chat/vault/data-formats.mjs');},A);
  ok('the open tab keeps loading its own build after the new service worker takes over');

  // 3. Later hides the notice for this build, and a still newer build brings it back
  await page.click('#updateNotice button:has-text("Later")');
  assert(await page.locator('#updateNotice').count()===0,'Later closes the notice');
  await checkForNewer();await page.waitForTimeout(1500);
  assert(await page.locator('#updateNotice').count()===0,'it does not come back for the same build');
  deploy(C);
  await newServiceWorker(C);
  assert((await cacheNames()).includes('plc-shell-'+A),'the saved copy of build A survives two newer builds while a tab runs it: '+(await cacheNames()));
  r=await page.evaluate(async c=>{const x=await fetch(`/releases/${c}/chat/markdown.mjs`);return x.status;},A);
  assert(r===200,'a file of build A still loads after two newer builds: '+r);
  await checkForNewer();
  await page.waitForSelector('#updateNotice',{timeout:10000});
  ok('Later is remembered per build, and a tab keeps its build across two deploys');

  // 4. unsent text: Reload asks first, and "Keep working" changes nothing
  await page.fill('#messageInput','a thought I have not sent yet');
  await page.click('#updateNotice button:has-text("Reload")');
  text=await noticeText();
  assert(/interrupt/.test(text)&&/a message you have not sent/.test(text),'it says what a reload would interrupt: '+text);
  assert(navigations===0,'and has not reloaded');
  await page.click('#updateNotice button:has-text("Keep working")');
  assert(/ready/.test(await noticeText())&&navigations===0&&await page.inputValue('#messageInput')==='a thought I have not sent yet','Keep working leaves everything as it was');
  ok('unsent text is protected');

  // 5. a reply in progress: Reload asks first
  await page.fill('#messageInput','slow answer please');await page.click('#sendBtn');
  await page.waitForFunction(()=>Boolean(document.querySelector('#stopGeneration')?.offsetParent),null,{timeout:10000});
  await page.click('#updateNotice button:has-text("Reload")');
  text=await noticeText();
  assert(/a reply being written/.test(text),'it names the reply: '+text);
  assert(navigations===0,'and has not reloaded');
  await page.waitForFunction(()=>/^Response complete\./.test(document.querySelector('#generationStatus').textContent),null,{timeout:30000});
  await page.waitForFunction(()=>!document.querySelector('#stopGeneration').offsetParent);
  ok('a reply in progress is protected, and the reply finished untouched');

  // 6. nothing in progress: Reload takes the new build, and an unsent message comes back
  await page.fill('#messageInput','');
  await page.click('#updateNotice button:has-text("Keep working")').catch(()=>{});
  if(await page.locator('#updateNotice').count()===0)await checkForNewer();
  await page.waitForSelector('#updateNotice',{timeout:10000});
  await page.fill('#messageInput','carry this over');
  await page.click('#updateNotice button:has-text("Reload")');
  await page.click('#updateNotice button:has-text("Reload anyway")');
  await ready();
  assert((await page.evaluate(()=>window.APP_BUILD.commit))===C,'after the reload the tab runs build C');
  assert(await page.inputValue('#messageInput')==='carry this over','the unsent message came back');
  await page.waitForTimeout(1500);
  assert(await page.locator('#updateNotice').count()===0,'no notice: nothing newer');
  ok('Reload takes the new build and keeps the unsent message');

  assert(!errors.length,'page errors: '+errors.join(' | '));
  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  await page.screenshot({path:'/tmp/update-midsession-failure.png'}).catch(()=>{});
  process.exitCode=1;
}finally{
  await h.close();
}
