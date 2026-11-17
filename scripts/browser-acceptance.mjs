import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
const origin=process.env.PROOF_ORIGIN||'https://dev.privatelocal.chat';
await mkdir('work/evidence',{recursive:true});
const evidence={origin,startedAt:new Date().toISOString(),steps:[],errors:[],unexpectedRequests:[]};
let context=await chromium.launchPersistentContext(process.env.BROWSER_PROOF_PROFILE || 'work/browser-profile',{headless:true,executablePath:process.env.CHROME_EXECUTABLE,env:process.env,args:JSON.parse(process.env.BROWSER_ARGS || '[]')});
let page=await context.newPage();
page.on('pageerror',e=>evidence.errors.push(e.message));
context.on('request',r=>{if(r.method()==='POST'||/benac\.dev|192\.168\./.test(r.url()))evidence.unexpectedRequests.push({method:r.method(),url:r.url()});});
await context.route(/benac\.dev|192\.168\./,r=>r.abort());
const record=async(name,data={})=>{evidence.steps.push({name,at:new Date().toISOString(),...data});console.log(name,JSON.stringify(data));await writeFile('work/evidence/browser-acceptance.json',JSON.stringify(evidence,null,2));};
async function idle(timeout=1200000){let until=Date.now()+timeout,last=0;while(Date.now()<until){const s=await page.evaluate(()=>window.localModels?.state);if(s&&s.host.state==='running'&&!s.busy&&s.tiers[s.selection.tier].install.state!=='unknown')return s;if(Date.now()-last>10000){last=Date.now();console.log('working',JSON.stringify(s?.transfer||s?.load));}await page.waitForTimeout(1000);}throw Error('Model operation did not finish within observation window');}
try{
 await page.goto(origin);await page.waitForFunction(()=>window.localModels?.state?.host.state==='running',null,{timeout:120000});await idle();
 await record('live startup',{build:await page.evaluate(()=>window.APP_BUILD),state:await page.evaluate(()=>({selection:window.localModels.state.selection,storage:window.localModels.state.storage}))});
 const tier=process.env.BROWSER_PROOF_MODEL==='9b'?'default':'light';
 await page.locator('#localModelSelect').selectOption(tier);await idle();
 const initial=await page.evaluate(tier=>window.localModels.state.tiers[tier].install,tier);
 if(!initial.ok){
  await page.locator('#downloadModel').click();
  let interrupted=false;
  for(let i=0;i<240;i++){
   await page.waitForTimeout(1000);const s=await page.evaluate(()=>window.localModels.state);
   if(!s.busy)break;
   if(s.transfer.filesDone>0){await page.locator('#cancelModel').click();interrupted=true;break;}
  }
  const partial=await idle();await record('download interruption',{interrupted,inventory:partial.tiers[tier].install});
  if(!partial.tiers[tier].install.ok){await page.locator('#downloadModel').click();const complete=await idle();if(!complete.tiers[tier].install.ok)throw Error('Model download failed: '+JSON.stringify(complete.lastError));await record('resumed download',{inventory:complete.tiers[tier].install,lastInstall:complete.tiers[tier].lastInstall});}
 }
 await page.locator('#loadModel').click();const loaded=await idle();if(loaded.load.state!=='ready')throw Error('Load failed: '+JSON.stringify(loaded.lastError));
 await record('real model loaded',{load:loaded.load});
 await page.getByRole('button',{name:/start new chat/i}).click();await page.locator('#messageInput').fill('Reply with one short sentence: what is two plus three?');await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:180000});
 if(await page.locator('#generationStatus').textContent()!=='Response complete.')throw Error(await page.locator('#generationStatus').textContent());
 await record('online generation',{reply:await page.locator('#messages').innerText()});
 await page.evaluate(()=>navigator.serviceWorker.ready.then(()=>new Promise(r=>{if(navigator.serviceWorker.controller)r();else navigator.serviceWorker.addEventListener('controllerchange',r,{once:true});})));
 await page.waitForFunction(()=>document.querySelector('#offlineStatus')?.textContent.startsWith('Offline app ready'),null,{timeout:120000});
 await record('offline shell ready',{status:await page.locator('#offlineStatus').innerText()});
 await context.setOffline(true);
 await page.locator('#messageInput').fill('Say one brief hello.');await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:180000});
 if(await page.locator('#generationStatus').textContent()!=='Response complete.')throw Error(await page.locator('#generationStatus').textContent());
 await record('offline generation',{reply:await page.locator('#messages').innerText()});
 await context.close();
 context=await chromium.launchPersistentContext(process.env.BROWSER_PROOF_PROFILE || 'work/browser-profile',{headless:true,executablePath:process.env.CHROME_EXECUTABLE,env:process.env,args:JSON.parse(process.env.BROWSER_ARGS || '[]')});
 context.on('request',r=>{if(r.method()==='POST'||/benac\.dev|192\.168\./.test(r.url()))evidence.unexpectedRequests.push({method:r.method(),url:r.url()});});
 await context.route(/benac\.dev|192\.168\./,r=>r.abort());await context.setOffline(true);page=await context.newPage();page.on('pageerror',e=>evidence.errors.push(e.message));
 await page.goto(origin);await page.waitForFunction(()=>window.localModels?.state?.host.state==='running',null,{timeout:120000});await idle();
 await page.locator('#loadModel').click();const reopened=await idle();if(reopened.load.state!=='ready')throw Error('Offline reload failed: '+JSON.stringify(reopened.lastError));
 await page.locator('#messageInput').fill('In one short sentence, say that you are ready.');await page.locator('#sendBtn').click();
 await page.waitForFunction(()=>/^(Response complete\.|The response was interrupted)/.test(document.querySelector('#generationStatus').textContent),null,{timeout:180000});
 if(await page.locator('#generationStatus').textContent()!=='Response complete.')throw Error(await page.locator('#generationStatus').textContent());
 await record('offline full browser reopen and generation',{reply:await page.locator('#messages').innerText(),unexpectedRequests:evidence.unexpectedRequests});
 await page.screenshot({path:'work/evidence/live-offline-generation.png',fullPage:true});
}catch(e){await record('FAILED',{message:e.message});throw e;}
finally{await context.close();}
