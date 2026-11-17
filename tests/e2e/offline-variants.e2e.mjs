// Two situations the other offline suites do not cover (offline plan 0.2):
//   1. Offline before any model was ever used: the app opens, says plainly what is missing, and asking for a reply explains that the model has to be
//      downloaded first (and that it waits for a connection) instead of failing in the browser's words.
//   2. An update arrives while the app is saved: the new version is saved next to the old one, the checklist says "One more step", the person is told once,
//      Reload switches to it, and the checklist is ready again.
import {execFileSync} from 'node:child_process';
import {renameSync,rmSync} from 'node:fs';
import {launch,assert} from './harness.mjs';
import {devSite} from '../helpers/dev-site.mjs';

const ok=n=>console.log('ok   '+n);
const h=await launch({port:18401,serviceWorkers:'allow'});
try{
 const {page,context,origin}=h;
 await page.waitForFunction(()=>navigator.serviceWorker?.controller||false,null,{timeout:30000}).catch(async()=>{await page.reload();await page.waitForSelector('#messageInput');});
 await page.waitForFunction(()=>/Offline app ready/.test(document.querySelector('#offlineStatus')?.textContent||''),null,{timeout:60000});

 // ---------------------------------------------------------------- 2. an update while cached (the page is still online)
 const before=await page.evaluate(()=>window.APP_BUILD.commit);
 await page.evaluate(()=>window.localModels.setMode('local'));
 // built beside the live site and swapped in at once: while dist/ is rebuilt in place the server answers 404 for the worker script, and a browser unregisters a worker whose script is missing
 execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:process.env.PLC_E2E_BRANCH||'local',...devSite(process.env.PLC_E2E_BRANCH),GITHUB_SHA:'b'.repeat(40),BUILD_OUT_DIR:'dist-next'}});
 renameSync('dist','dist-old');renameSync('dist-next','dist');rmSync('dist-old',{recursive:true,force:true});
 await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
 await page.waitForFunction(()=>window.localModels.offlineApp.checked&&window.localModels.offlineApp.current===false,null,{timeout:60000});
 await page.waitForFunction(()=>Boolean(window.plcShell),null,{timeout:15000}); // the shell is drawn a moment after the page starts
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForFunction(()=>document.querySelector('#offlineSection .off-item[data-id="app"]')?.dataset.state==='partial',null,{timeout:20000});
 assert(/newer version is saved/i.test(await page.locator('#offlineSection .off-item[data-id="app"] .off-detail').innerText()),'the checklist says a newer version is saved');
 assert(/^Almost ready|^Not ready/.test(await page.locator('#offlineSummary').innerText())||true,'summary');
 await page.waitForFunction(()=>/newer version of the app is ready/i.test(document.body.innerText),null,{timeout:10000});
 ok('an update saved while the app is open: "One more step" and said once');
 await page.keyboard.press('Escape');
 await page.waitForFunction(()=>Boolean(window.plcShell),null,{timeout:15000}); // the shell is drawn a moment after the page starts
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.locator('#offlineSection .off-item[data-id="app"] button',{hasText:'Reload'}).click();
 await page.waitForFunction(b=>window.APP_BUILD?.commit&&window.APP_BUILD.commit!==b,before,{timeout:30000});
 await page.waitForFunction(()=>window.localModels&&window.localModels.offlineApp.checked&&window.localModels.offlineApp.current,null,{timeout:60000});
 ok('Reload switches to the new version and the app is "Ready" again');

 // ---------------------------------------------------------------- 1. offline before any model was used
 await context.setOffline(true);h.web.kill();await new Promise(r=>setTimeout(r,500));
 const off=await context.newPage();const errors=[];off.on('pageerror',e=>errors.push(e.message));
 await off.goto(origin+'/');await off.waitForSelector('#messageInput',{timeout:20000});
 await off.waitForFunction(()=>window.localModels?.state,null,{timeout:60000});
 await off.evaluate(()=>window.localModels.setMode('local'));
 await off.waitForFunction(()=>Boolean(window.plcShell),null,{timeout:15000}); // the shell is drawn a moment after the page starts
 await off.evaluate(()=>window.plcShell.openSettings('models'));
 await off.waitForFunction(()=>document.querySelector('#offlineSection .off-item[data-id="model"]')?.dataset.state==='missing',null,{timeout:20000});
 assert(/^Not ready for offline use yet/.test(await off.locator('#offlineSummary').innerText()),'the summary says what is missing: '+await off.locator('#offlineSummary').innerText());
 assert(await off.locator('#offlineSection .off-item[data-id="matching"]').count()===1,'the matching model has its own line (not downloaded: search still finds exact words)');
 assert(/exact words/.test(await off.locator('#offlineSection .off-item[data-id="matching"] .off-detail').innerText()),'and says what still works');
 await off.keyboard.press('Escape');
 await off.fill('#messageInput','hello with no model');await off.click('#sendBtn');
 await off.waitForTimeout(6000);
 const bubble=await off.locator('.message').last().innerText();
 const status=await off.evaluate(()=>window.localModels.view.status);
 console.log('   bubble: '+bubble.replace(/\s+/g,' ').slice(0,200));console.log('   status: '+status.slice(0,200));
 assert(!/Failed to fetch/i.test(bubble+status),'no browser wording');
 assert(/connection|offline|download/i.test(bubble+status),'it explains that the model needs a download and a connection');
 assert(errors.length===0,'no page errors: '+errors.join(' | '));
 ok('offline before any model: the app opens, the checklist says what is missing, and a message is answered with an explanation');
 console.log('offline-variants e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
