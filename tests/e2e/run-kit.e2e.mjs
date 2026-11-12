// A copy of the app served by scripts/serve.mjs and nothing else (docs/RUN-IT.md): the neutral build and the app-only build. Each must be cross-origin isolated, get its worker
// registered, receive the cache rules the build declared, ask the configured model source, and open offline, with Help where the build has it and the app where it does not.
//   node scripts/e2e.mjs run-kit
process.env.PLC_E2E_BRANCH??='main'; // the production build, which is what people receive (and never dev: a download build cannot be made on dev)
delete process.env.SITE_DIR;
const {launch,assert}=await import('./harness.mjs');
const ok=n=>console.log('PASS '+n);
const until=async(cond,ms=45000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await cond())return true;await new Promise(r=>setTimeout(r,200));}return false;};

async function variant(target,port,run){
  process.env.TARGET=target;
  const h=await launch({port,serviceWorkers:'allow'});
  const requests=[];
  try{
    await h.page.route(/^https:\/\/assets\.privatelocal\.chat\//,route=>{requests.push(route.request().url());route.fulfill({status:200,body:'these bytes are not the model',headers:{'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','content-type':'application/octet-stream'}});});
    await run(h,requests);
    assert(!h.errors.filter(e=>!/Failed to load resource|Download|download|integrity|hash|checksum|mismatch|stalled/i.test(e)).length,target+': page errors: '+h.errors.join(' | '));
    ok(target+' served by serve.mjs: all checks');
  }finally{await h.close();}
}
const isolated=page=>page.evaluate(()=>({isolated:window.crossOriginIsolated,secure:window.isSecureContext}));

async function common(h,target){
  const {page,origin}=h;
  await page.waitForFunction(()=>window.__plcBooted===true&&Boolean(window.plcShell),null,{timeout:30000});
  const iso=await isolated(page);
  assert(iso.isolated&&iso.secure,target+': the page is cross-origin isolated and a secure context: '+JSON.stringify(iso));
  // the worker registers, controls the page and has saved the app
  await page.waitForFunction(async()=>Boolean(navigator.serviceWorker.controller)&&(await caches.keys()).some(k=>k.startsWith('plc-shell-')),null,{timeout:60000}).catch(async()=>{await page.reload();await page.waitForSelector('#messageInput');await page.waitForFunction(async()=>Boolean(navigator.serviceWorker.controller),null,{timeout:60000});});
  await page.waitForFunction(()=>/Offline app ready/.test(document.querySelector('#offlineStatus')?.textContent||''),null,{timeout:90000});
  // the rules the build declared reach the browser
  for(const [p,want] of [['/sw.js','no-cache'],['/version.json','no-cache'],['/build-info.js','no-cache']]){
    const r=await fetch(origin+p+'?x='+Date.now());assert(r.headers.get('cache-control')===want,target+': '+p+' cache-control is '+r.headers.get('cache-control'));await r.arrayBuffer();
  }
  const home=await fetch(origin+'/');assert(home.headers.get('cross-origin-opener-policy')==='same-origin'&&home.headers.get('cross-origin-embedder-policy')==='require-corp'&&home.headers.get('x-content-type-options')==='nosniff','isolation headers on the app page');await home.arrayBuffer();
  const license=await fetch(origin+'/LICENSE');assert(/^text\/plain/.test(license.headers.get('content-type')),'LICENSE is plain text');await license.arrayBuffer();
  // the worker was told which pages this build has
  const sw=await (await fetch(origin+'/sw.js')).text();
  return /const PUBLIC_PAGES=(\[[^\]]*\]);/.exec(sw)[1];
}

try{
  await variant('runkit',18611,async(h,requests)=>{
    const pages=await common(h,'runkit');
    assert(pages==="['help','about']",'runkit: the worker knows Help and About: '+pages);
    // a download asks the configured source, and only it
    await h.page.evaluate(async()=>{await window.localModels.inspectAll();window.localModels.setMode('local');await window.localModels.selectTier('nano');window.localModels.download();});
    // a copy that is not a named site says where the models come from first (docs/APP-CONFIG.md)
    await h.page.waitForSelector('.app-dialog:has-text("Where the models come from")',{timeout:45000});
    assert(requests.length===0,'runkit: nothing is requested before the notice is answered');
    await h.page.click('.app-dialog button:has-text("Download")');
    await until(()=>requests.length>0);
    assert(requests.length>0&&requests.every(u=>u.startsWith('https://assets.privatelocal.chat/models/')),'runkit: a model download asks the configured source: '+requests.slice(0,2));
    await h.page.evaluate(()=>window.localModels.cancelDownload());
    // the server goes away: the copy still opens, Help opens its own page, and a page that does not exist opens the app
    h.web.kill();await new Promise(r=>setTimeout(r,600));
    const off=await h.context.newPage();
    await off.goto(h.origin+'/');await off.waitForSelector('#messageInput',{timeout:20000});
    const help=await h.context.newPage();await help.goto(h.origin+'/help/');assert(/help/i.test(await help.locator('h1').first().innerText()),'runkit: Help opens offline');
    const about=await h.context.newPage();await about.goto(h.origin+'/about');assert(/about/i.test(await about.locator('h1').first().innerText()),'runkit: About opens offline from /about');
    const gone=await h.context.newPage();await gone.goto(h.origin+'/privacy');await gone.waitForSelector('#messageInput',{timeout:20000});
    ok('runkit: Help and About open offline, /privacy (not in this build) opens the app');
  });

  await variant('app',18612,async(h)=>{
    const pages=await common(h,'app');
    assert(pages==='[]','app: the worker knows no pages: '+pages);
    assert((await fetch(h.origin+'/help/')).status===404,'app: there is no Help page');
    const links=await h.page.evaluate(()=>window.SITE_LINKS);
    assert(JSON.stringify(links.pages)==='{}','app: the app is told about no pages: '+JSON.stringify(links));
    h.web.kill();await new Promise(r=>setTimeout(r,600));
    const off=await h.context.newPage();
    await off.goto(h.origin+'/');await off.waitForSelector('#messageInput',{timeout:20000});
    const help=await h.context.newPage();await help.goto(h.origin+'/help');await help.waitForSelector('#messageInput',{timeout:20000});
    ok('app: opens offline, and /help opens the app because this build has no Help');
  });
  console.log('ALL PASS');
}catch(error){
  console.error('FAIL '+(error.stack||error));
  process.exitCode=1;
}
