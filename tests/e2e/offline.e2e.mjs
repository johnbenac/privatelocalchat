// The app with no connection, fast (offline plan 4.1, runs with the per-push checks): the app saved by the service worker opens cold, keeps its
// conversations, finds them by search, opens its public pages, explains itself, and asks for nothing it could not have. No model is downloaded;
// tests/e2e/offline-model.e2e.mjs does the full lifecycle with a real model before a release.
import {launch,assert} from './harness.mjs';

const ok=n=>console.log('ok   '+n);
const h=await launch({port:18351,serviceWorkers:'allow'});
try{
 const {page,context,origin}=h;
 const MARKER='kumquat-harbour-'+Date.now().toString(36);
 await page.waitForFunction(()=>navigator.serviceWorker?.controller||false,null,{timeout:30000}).catch(async()=>{await page.reload();await page.waitForSelector('#messageInput');});
 await page.waitForFunction(()=>/Offline app ready/.test(document.querySelector('#offlineStatus')?.textContent||''),null,{timeout:60000});
 await page.fill('#messageInput','Remember the word '+MARKER);await page.click('#sendBtn');
 await page.waitForSelector('.message.assistant');
 await page.waitForFunction(()=>!document.querySelector('.message.assistant.streaming'));
 ok('online: a conversation exists and the app is saved');

 // ---- the checklist in Settings and the connection pill, on the page that is already open
 assert(await page.locator('#connectionPill').isHidden(),'no connection pill while online');
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForSelector('#offlineSection .off-item[data-id="app"]');
 await page.waitForFunction(()=>document.querySelector('#offlineSection .off-item[data-id="app"]')?.dataset.state==='ready',null,{timeout:20000});
 assert(/Ready for offline use|connected provider/i.test(await page.locator('#offlineSummary').innerText()),'the checklist has a one-line summary: '+await page.locator('#offlineSummary').innerText());
 await page.keyboard.press('Escape');
 ok('online: no pill, and Settings lists what is ready for offline use');
 const goOffline=async()=>{await context.setOffline(true);await page.waitForSelector('#connectionPill',{state:'visible',timeout:8000});};
 const comeBack=async()=>{await context.setOffline(false);await page.waitForFunction(()=>/Back online/.test(document.querySelector('#connectionPill')?.innerText||''),null,{timeout:8000});await page.waitForSelector('#connectionPill',{state:'hidden',timeout:10000});};
 const sendAndRead=async text=>{const n=await page.locator('.message.assistant').count();await page.fill('#messageInput',text);await page.click('#sendBtn');await page.waitForFunction(n=>{const all=[...document.querySelectorAll('.message.assistant')];const a=all[all.length-1];return all.length>n&&a&&!a.classList.contains('streaming')&&a.innerText.trim();},n,{timeout:15000});return page.locator('.message.assistant').last().innerText();};

 // a provider that runs on this device (the test's fake API is on 127.0.0.1) can still answer offline: the app must not call that a problem
 await goOffline();
 assert(/Offline/.test(await page.locator('#connectionPill').innerText()),'the pill says Offline');
 assert(/runs on this device/i.test(await page.locator('#connectionPill').getAttribute('title')),'a provider on this device is said to keep working: '+await page.locator('#connectionPill').getAttribute('title'));
 assert(await page.locator('#refreshModelsBtn').isEnabled(),'refreshing the model list of a provider on this device stays possible');
 assert(/offline/i.test(await page.locator('#connectionAnnounce').innerText()),'the change is announced to screen readers');
 await page.click('#connectionPill');await page.waitForSelector('.shell-pop');
 assert(/You are offline/.test(await page.locator('.shell-pop').innerText())&&/Offline settings/.test(await page.locator('.shell-pop').innerText()),'the pill opens an explanation and a way to the offline settings');
 await page.keyboard.press('Escape');
 const unreachable=await sendAndRead('are you there');
 assert(/Could not reach the provider/.test(unreachable)&&!/Failed to fetch/i.test(unreachable),'a failure of a provider on this device is "could not reach", in words: '+unreachable);
 ok('offline with a provider on this device: calm pill, honest failure');
 await comeBack();

 // a provider on the internet needs a connection, and everything says so
 await page.evaluate(()=>{const c=JSON.parse(sessionStorage.getItem('chatConfig'));c.endpoint='https://api.example.test/v1';sessionStorage.setItem('chatConfig',JSON.stringify(c));});
 await page.reload();await page.waitForSelector('#messageInput');
 await goOffline();
 assert(/provider needs a connection/i.test(await page.locator('#connectionPill').getAttribute('title')),'with a provider on the internet the pill says what will not work');
 assert(await page.locator('#refreshModelsBtn').isDisabled(),'refreshing the provider\'s model list is disabled while offline');
 assert(/connection/i.test(await page.locator('#refreshModelsBtn').getAttribute('title')),'and says why');
 await page.evaluate(()=>window.plcShell.openSettings('models'));
 await page.waitForSelector('#offlineNote',{state:'visible'});
 assert(/waits for a connection/.test(await page.locator('#offlineNote').innerText()),'the Models page says what a download does offline');
 await page.keyboard.press('Escape');
 const failedText=await sendAndRead('hello again');
 assert(/You are offline/.test(failedText)&&/needs a connection/.test(failedText)&&!/Failed to fetch/i.test(failedText),'a provider failure while offline says so in words: '+failedText);
 ok('offline with a provider on the internet: the pill, the disabled refresh, the note and the failure all say so');
 await comeBack();
 assert(await page.locator('#refreshModelsBtn').isEnabled(),'refresh works again when back online');
 ok('back online: the pill says so for a moment, then goes away');

 // a dead connection that the browser still calls online (a dead Wi-Fi): the check of the app's own origin notices it
 await context.route('**/version.json?probe=*',route=>route.abort('connectionfailed'));
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForSelector('#connectionPill',{state:'visible',timeout:8000});
 assert(await page.evaluate(()=>navigator.onLine===true),'the browser still says it is online');
 assert(/Offline/.test(await page.locator('#connectionPill').innerText()),'the pill says Offline anyway');
 await context.unroute('**/version.json?probe=*');
 await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await page.waitForFunction(()=>/Back online/.test(document.querySelector('#connectionPill')?.innerText||''),null,{timeout:8000});
 await page.waitForSelector('#connectionPill',{state:'hidden',timeout:10000});
 ok('a connection that is dead while the browser says online is noticed, and its return too');

 // ---- offline, in a brand-new page (the page and its workers start from the saved files)
 const foreign=[],failed=[],errors=[];
 await context.setOffline(true);
 // Some Chromium builds do not apply the offline setting to requests the service worker makes, so the origin itself is taken away too: from here on
 // everything the app asks of its own server is refused, the way a dead network refuses it. Pages must come from what the service worker saved.
 h.web.kill();await new Promise(r=>setTimeout(r,500));
 await context.route(url=>url.origin!==origin,route=>{foreign.push(route.request().url());return route.abort('internetdisconnected');});
 const off=await context.newPage();
 off.on('pageerror',e=>errors.push(e.message));
 // The app's own files must all load. Two failures are expected and are not files the app needs: the app's own reachability check (version.json with
 // a query, which is what tells it that it is offline) and, on a dev build only, the instrumented model runtime that the service worker does not save.
 off.on('requestfailed',r=>{const u=new URL(r.url());if(u.origin===origin&&!(u.pathname==='/version.json'&&(u.search.startsWith('?probe=')||u.search.startsWith('?check=')))&&!/\/vendor\/wllama\/v1q\//.test(u.pathname))failed.push(u.pathname);});
 await off.goto(origin+'/');await off.waitForSelector('#messageInput',{timeout:20000});
 assert(await off.evaluate(()=>window.__plcBooted===true),'the page finished starting offline');
 assert(!/couldn.t start/i.test(await off.locator('body').innerText()),'no failure banner');
 ok('offline: the app opens cold');
 assert(await off.evaluate(m=>(localStorage.getItem('chatThreads')||'').includes(m),MARKER),'the conversation is kept');
 // opened on a connection the browser calls online but that is dead: the start-up check says so (the page's first request to its own origin fails)
 await off.waitForSelector('#connectionPill',{state:'visible',timeout:30000}).catch(async e=>{
  const d=await off.evaluate(()=>({state:window.plcApp?.offline?.connection?.state,reason:window.plcApp?.offline?.connection?.reason,vis:document.visibilityState,online:navigator.onLine,controlled:!!navigator.serviceWorker.controller,shell:Boolean(window.plcShell)})).catch(x=>String(x));
  throw new Error('no Offline pill on a cold offline page: '+JSON.stringify(d)+' failed='+JSON.stringify(failed)+' errors='+JSON.stringify(errors));
 });
 assert(/Offline/.test(await off.locator('#connectionPill').innerText()),'a page opened with no connection shows the Offline pill');
 await off.keyboard.press('Control+k');await off.fill('.search-input',MARKER);
 await off.waitForSelector('.search-item',{timeout:8000});
 assert(/kumquat-harbour/.test(await off.locator('.search-item').first().innerText()),'search finds it by its words');
 await off.keyboard.press('Escape');
 ok('offline: conversations are kept and found by search');
 for(const [path,heading] of [['/help','Help'],['/privacy','Privacy'],['/about','About']]){
  const p=await context.newPage();await p.goto(origin+path);
  assert(new RegExp(heading,'i').test(await p.locator('h1').first().innerText()),path+' opens its own page offline');await p.close();
 }
 ok('offline: the public pages open');
 await off.waitForFunction(()=>Boolean(window.plcShell),null,{timeout:15000}); // the shell is drawn a moment after the page starts
 await off.evaluate(()=>window.plcShell.openSettings('data'));
 await off.waitForSelector('#settingsPage',{state:'visible'});
 await off.keyboard.press('Escape');
 ok('offline: Settings opens');
 assert(failed.length===0,'files of the app that failed to load: '+failed.join(', '));
 assert(errors.length===0,'page errors: '+errors.join(' | '));
 const unexpected=foreign.filter(u=>!/\/models\/memory\//.test(u));
 assert(unexpected.length===0,'unexpected outside requests: '+unexpected.join(', '));
 ok('offline: nothing failed and nothing unexpected was requested');
 await context.setOffline(false);
 console.log('offline e2e: ok');
}catch(e){console.error(e);process.exitCode=1;}
finally{await h.close();}
