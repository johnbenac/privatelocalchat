// Real-browser operator qualification. Raw output stays in ignored work/.
// Configure an owned cached profile, private diagnostic session, browser and GPU as documented.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

const manifest=JSON.parse(await readFile('dev-tools/native-runtime/manifest.json','utf8'));
const baselineHash=manifest.compilerControl.sourceSha256,candidateHash=manifest.files['compat.wasm'].sha256;
const sessionFile=process.env.PLC_DEBUG_SESSION_FILE;
if(!sessionFile)throw Error('Set PLC_DEBUG_SESSION_FILE to a private diagnostic session JSON file');
const receiver=JSON.parse(await readFile(sessionFile,'utf8')).receiver;
const profile=process.env.PLC_QA_PROFILE;
if(!profile)throw Error('Set PLC_QA_PROFILE to an owned Chromium profile with the verified 2B model already installed');
const baselineFile=process.env.PLC_BASELINE_WASM||'work/compiler-baseline/compat.wasm';
const mode=process.env.PLC_QA_MODE||'parity',live=process.env.PLC_LIVE==='1';
const comparisonBaseline=live&&mode==='parity'?JSON.parse(await readFile(process.env.PLC_BASELINE_RECEIPT||'work/evidence/compiler-candidate-parity.json','utf8')).records.find(r=>r.arm==='baseline'&&r.wasmSha256===baselineHash):null;
if(live&&mode==='parity'&&!comparisonBaseline)throw Error('Published parity requires a separately qualified baseline receipt');
if(!['parity','endurance','phone-profile'].includes(mode))throw Error('Unknown PLC_QA_MODE');
const output=process.env.PLC_QA_OUTPUT||'work/evidence/compiler-candidate-'+(live?'published-':'')+mode+'.json';
const records=[],errors=[],assetWarnings=[];
const digest=b=>createHash('sha256').update(b).digest('hex');
const prompts=mode==='parity'?[
 'Reply with one short sentence: what is two plus three?',
 'Recite the Gettysburg Address in full.',
 'Recite the Gettysburg Address in full.'
]:[
 'Reply with one short sentence: what is two plus three?',
 'Recite the Gettysburg Address in full.',
 'Recite the Gettysburg Address in full.',
 'What is six plus one? Reply briefly.',
 'What is seven minus two? Reply with one number.',
 'Reply with one word: hello.',
 'What is three plus four? Reply briefly.',
 'What is two times three? Reply briefly.',
 'What is ten minus one? Reply briefly.',
 'Reply with one word: ready.'
];
const save=()=>writeFile(output,JSON.stringify({mode,live,records,errors,assetWarnings},null,2));
for(const arm of live?['candidate']:mode==='parity'?['baseline','candidate']:['candidate']){
 let observedHash=null;const config=mode==='phone-profile'?{n_gpu_layers:0,flash_attn_policy:0}:{n_gpu_layers:-1,flash_attn_policy:0};
 const c=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block',executablePath:process.env.PLC_QA_BROWSER||chromium.executablePath(),env:{...process.env,MESA_VK_DEVICE_SELECT:process.env.PLC_QA_GPU||process.env.MESA_VK_DEVICE_SELECT||''},args:['--no-sandbox','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--enable-features=Vulkan','--use-angle=vulkan','--disable-vulkan-surface','--enable-dawn-features=vulkan_enable_f16_on_nvidia']});
 const p=await c.newPage();p.setDefaultTimeout(120000);
 c.on('response',response=>{const url=new URL(response.url());if(response.status()>=400&&url.origin==='https://dev.privatelocal.chat'&&!url.pathname.startsWith('/api/debug/'))assetWarnings.push({path:url.pathname,status:response.status()});});
 p.on('pageerror',e=>errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')console.log('BROWSER ERROR',m.text().slice(0,300));});
 if(!live)await c.route(url=>url.origin==='https://dev.privatelocal.chat',async route=>{
  const url=new URL(route.request().url());if(url.pathname.startsWith('/api/debug/'))return route.continue();
  const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(file.includes('..'))return route.abort();
  try{
   let bytes=await readFile(file.endsWith('/compat.wasm')&&arm==='baseline'?baselineFile:'dist/'+file);
   if(file==='index.html'&&arm==='baseline'){let html=bytes.toString();html=html.replace(/window\.APP_BUILD=(.*?);<\/script>/,(all,json)=>{const b=JSON.parse(json);b.developmentRuntime={...b.developmentRuntime,variant:manifest.compilerControl.id+'-baseline',wasmSha256:baselineHash};return 'window.APP_BUILD='+JSON.stringify(b)+';</script>';});bytes=Buffer.from(html);}
   if(file.endsWith('/compat.wasm')){observedHash=digest(bytes);if(observedHash!==(arm==='baseline'?baselineHash:candidateHash))throw Error('Wrong routed native bytes');}
   const ext=file.split('.').pop();await route.fulfill({body:bytes,status:200,contentType:{html:'text/html',js:'application/javascript',mjs:'application/javascript',wasm:'application/wasm',css:'text/css',json:'application/json'}[ext]||'application/octet-stream',headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp'}});
  }catch(e){errors.push('Route '+file+': '+e.message);await route.fulfill({status:404,body:''});}
 });
 const r={arm,config,build:null,turns:[]};records.push(r);
 try{
  for(const other of c.pages())if(other!==p)await other.close();
  await p.goto('https://dev.privatelocal.chat');
  await p.evaluate(async()=>{for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister();});
  await p.goto('about:blank');await(await c.newCDPSession(p)).send('Network.setBypassServiceWorker',{bypass:true});await p.goto('https://dev.privatelocal.chat');
  await p.locator('#devDiagnostics summary').click();await p.locator('#debugReceiver').fill(receiver);await p.locator('#debugDisk').check();
  await p.waitForFunction(()=>window.localModels?.state?.host.state==='running'&&!window.localModels.state.busy&&window.localModels.state.tiers.light.install.ok);
  await p.evaluate(config=>{const h=window.__plcDebugModelHost,original=h.tierConfig.bind(h);h.tierConfig=(...args)=>{const cfg=original(...args);cfg.context={...cfg.context,...config};return cfg;};},config);
  r.effectiveConfig=await p.evaluate(()=>window.__plcDebugModelHost.tierConfig());r.build=await p.evaluate(()=>window.APP_BUILD);
  if(r.build.developmentRuntime?.variant!==manifest.compilerControl.id+(arm==='baseline'?'-baseline':''))throw Error('Missing compiler experiment identity');
  const loadStart=Date.now();await p.locator('#loadModel').click();
  await p.waitForFunction(()=>['ready','faulted'].includes(window.localModels.state.load.state));
  r.load=await p.evaluate(()=>window.localModels.state.load);r.loadMs=Date.now()-loadStart;
  if(r.load.state!=='ready')throw Error('Load failed: '+JSON.stringify(r.load));
  if(!r.load.info?.runtime?.includes(manifest.buildId))throw Error('Wrong native build identity');
  if(live){const url='https://dev.privatelocal.chat/releases/'+r.build.commit+'/runtime/providers/vendor/wllama/v1q/compat.wasm';observedHash=digest(Buffer.from(await(await fetch(url)).arrayBuffer()));}
  r.wasmSha256=observedHash;
  if(observedHash!==(arm==='baseline'?baselineHash:candidateHash))throw Error('Native artifact hash mismatch');
  r.loadMetrics=await p.evaluate(()=>window.__plcDebugModelHost.provider().stats());
  console.log('LOADED',arm,mode,observedHash,r.loadMs);await save();
  const history=[];
  for(let i=0;i<prompts.length;i++){
   history.push({role:'user',content:prompts[i]});const start=Date.now();
   const result=await p.evaluate(async messages=>{const text=await window.localModels.generate(messages);const stats=await window.__plcDebugModelHost.provider().stats();return {text,diagnostics:stats.engine?.lastGenerationDiagnostics,memory:stats.engine?.runtimeMemory,source:stats.engine?.sourceCounters};},history);
   if(!result.diagnostics?.usage||result.diagnostics.checkpointCount>1||result.diagnostics.webGpuQueue?.graphBatchesPending!==0)throw Error('Native usage, checkpoint or queue gate failed');
   if(!result.text.trim())throw Error('Empty turn '+(i+1));
   if(i===0&&!/5|five/i.test(result.text))throw Error('Arithmetic failed');
   history.push({role:'assistant',content:result.text});
   r.turns.push({...result,turn:i+1,durationMs:Date.now()-start});
   console.log('TURN',arm,mode,i+1,JSON.stringify({tokens:result.diagnostics?.usage?.completionTokens,checkpointCount:result.diagnostics?.checkpointCount,checkpointBytes:result.diagnostics?.checkpointCurrentBytes,pending:result.diagnostics?.webGpuQueue?.graphBatchesPending,durationMs:Date.now()-start}));
   await save();
  }
  if(mode==='parity'){
   const baselineRecord=live?comparisonBaseline:records[0];
   if(arm==='candidate')for(let i=0;i<r.turns.length;i++){
    if(r.turns[i].text!==baselineRecord.turns[i].text)throw Error('Baseline text differs on turn '+(i+1));
    if(r.turns[i].diagnostics.usage.completionTokens!==baselineRecord.turns[i].diagnostics.usage.completionTokens)throw Error('Native usage differs');
   }
  }else{
   if(!r.turns.some(t=>t.diagnostics?.usage?.completionTokens===512))throw Error('No actual 512-token completion');
   r.cancellation=await p.evaluate(async()=>{
    const controller=new AbortController();let cancelled=false,characters=0;
    try{await window.localModels.generate([{role:'user',content:'List the integers from 1 to 1000, one per line.'}],{signal:controller.signal,onToken:text=>{characters=text.length;if(text.trim())controller.abort();}});}catch(e){if(e.name!=='AbortError')throw e;cancelled=true;}
    if(!cancelled)throw Error('Cancellation not observed');
    const reply=await window.localModels.generate([{role:'user',content:'Reply with one word: hello.'}]);
    return {cancelled,characters,reply,stats:await window.__plcDebugModelHost.provider().stats()};
   });
   if(!/hello/i.test(r.cancellation.reply))throw Error('Post-cancellation reply failed');
   r.reset=await p.evaluate(async()=>{
    const before=window.localModels.state.load;
    const text=await window.localModels.generate([{role:'user',content:'What is one plus one? Reply with the number only.'}]);
    return {text,loadAttemptsUnchanged:window.localModels.state.load.loadAttempt===before.loadAttempt,stats:await window.__plcDebugModelHost.provider().stats()};
   });
   if(!/2|two/i.test(r.reset.text)||!r.reset.loadAttemptsUnchanged)throw Error('Fresh context reset failed');
   await c.setOffline(true);
   r.offline=await p.evaluate(()=>window.localModels.generate([{role:'user',content:'Reply with one word: hello.'}]));
   await c.setOffline(false);if(!/hello/i.test(r.offline))throw Error('Offline response failed');
   console.log('CANCELLATION RESET OFFLINE PASSED',mode);await save();
   await p.waitForTimeout(30000);if(!await p.evaluate(()=>window.localModels.ready))throw Error('Model lost during post-generation hold');r.postGenerationHoldMs=30000;
  }
  r.completed=true;await save();
  await p.waitForFunction(()=>document.querySelector('#debugBadge').textContent.includes('· 0 queued events.'),null,{timeout:60000});
  await p.locator('#debugReceiver').fill('');
 }catch(e){r.failed=e.message;await save();throw e;}finally{await c.close();}
}
if(errors.length)throw Error(errors.join(';'));
console.log('QUALIFIED',mode,records.map(r=>r.arm).join(','));
