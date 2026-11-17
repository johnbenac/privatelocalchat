// Measures the memory of the two voice engines (Kitten nano int8, Kokoro q8) in real Chromium, with several independent methods side by side.
//
//   node ops/voice/measure-memory.mjs [--out docs/evidence/voice/memory-measurements.json] [--engines kitten,kokoro] [--threads 1,4] [--chrome <path>]
//
// Needs: `npm ci` (Playwright + ws), a Chromium, Linux (/proc), and the pinned model files (fetched from the CDN into a temp directory by
// tests/e2e/voice-files.mjs unless VOICE_FILES_DIR / VOICE_KOKORO_DIR point at them). It builds the app, serves dist/ and launches one FRESH
// browser per engine x thread-count, so every run starts from the same cold state.
//
// Methods (each has limits, written down in docs/VOICE-MEMORY.md):
//   uasm      performance.measureUserAgentSpecificMemory() in the page (needs crossOriginIsolated; counts JS + WASM + DOM memory of the page and
//             its same-origin workers; forces a GC; takes seconds)
//   cdpHeap   CDP Runtime.getHeapUsage on the page and on every worker target (V8 heap only: no WebAssembly memory, no ArrayBuffer backing stores)
//   cdpPerf   CDP Performance.getMetrics on the page (JSHeap*, Nodes, Documents...; page only, not workers)
//   cdpMemory CDP Memory.getDOMCounters (counts of documents/nodes/listeners; no bytes)
//   rss       /proc/<pid>/status VmRSS / VmHWM and /proc/<pid>/smaps_rollup Pss of the browser's renderer processes (pids from CDP SystemInfo);
//             the page and ALL its workers (and the ONNX Runtime threads, which are workers) live in the renderer, so this is the closest
//             figure to what the operating system sees; shared pages are counted in full by RSS, split by Pss
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {voiceFilesDir} from '../../tests/e2e/voice-files.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const WebSocket=require('ws');
const args=process.argv.slice(2);
const opt=(n,d)=>{const i=args.indexOf(n);return i>=0&&args[i+1]?args[i+1]:d;};
const NO_UASM=args.includes('--no-uasm'); // skip performance.measureUserAgentSpecificMemory (it wedged a 4-thread run on this machine, see docs/VOICE-MEMORY.md)
const OUT=opt('--out','docs/evidence/voice/memory-measurements.json');
const ENGINES=opt('--engines','kitten,kokoro').split(',');
const THREADS=opt('--threads','1,4').split(',').map(Number);
// performance.measureUserAgentSpecificMemory() is NOT available in Playwright's default headless shell (it answers SecurityError), so a full
// Chromium is used in new headless mode. --chrome <path> overrides the guess (the newest ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome).
const CHROME_ARG=opt('--chrome','');
const CHROME=CHROME_ARG==='none'?'':CHROME_ARG||(()=>{
 const root=path.join(os.homedir(),'.cache','ms-playwright');
 try{for(const d of readdirSync(root).filter(n=>/^chromium-\d+$/.test(n)).sort((a,b)=>Number(b.split('-')[1])-Number(a.split('-')[1]))){
  for(const sub of ['chrome-linux64','chrome-linux']){const f=path.join(root,d,sub,'chrome');if(existsSync(f))return f;}
 }}catch{}
 return '';
})();
const MB=1/1048576;
const mb=(n)=>n==null?null:Math.round(n*MB*10)/10;

// About a minute of speech: several paragraphs of plain English prose (no digits, so the text pre-processor does not change the length).
const PARAGRAPHS=[
 'The harbour was quiet in the early morning, and the fishing boats rocked gently against their ropes. A thin mist lay over the water, and the only sound was the slow creak of old timber. Marta walked along the pier with a flask of tea, watching the light climb over the hills.',
 'She had come here every autumn since she was a girl, because the town changed so little. The baker still opened before dawn, the church bell was still a little flat, and the same grey cat still slept on the warm step of the chandler shop. Some things, she thought, are worth keeping exactly as they are.',
 'By the time the sun cleared the ridge, the first boats were heading out. Men called to each other across the water, and gulls wheeled above the nets. A radio somewhere played a tune she half remembered, and she hummed along without noticing.',
 'Later she sat on the sea wall and wrote a letter to her brother, who lived far away in a city of glass and noise. She told him about the tea, the cat, the flat bell and the gulls. She told him that the town was waiting for him, and that it would not mind how long he had been gone.',
 'When the letter was done she folded it carefully, put it in her coat, and walked up the hill to the post office. The door was open, the clerk was reading a newspaper, and the morning, as always, was in no hurry at all.',
];
const longText=PARAGRAPHS.slice(0,3).join('\n\n');

// ---- build and serve the app once
console.log('building the app...');
execFileSync('node',['scripts/build.mjs'],{stdio:'pipe',env:{...process.env,DEPLOY_BRANCH:'local'}});
const PORT=18650;
const web=spawn('node',['scripts/serve.mjs'],{env:{...process.env,PORT:String(PORT)},stdio:'pipe'});
for(let i=0;i<50;i++){try{if((await fetch(`http://127.0.0.1:${PORT}/`)).ok)break;}catch{}await sleep(100);}
const ORIGIN=`http://127.0.0.1:${PORT}`;

// ---- raw CDP over the browser's debugging port (Playwright's own sessions cannot talk to worker targets)
class Cdp{
 constructor(url){this.ws=new WebSocket(url);this.id=0;this.waiting=new Map();this.ready=new Promise((r,j)=>{this.ws.on('open',r);this.ws.on('error',j);});
  this.ws.on('message',m=>{const d=JSON.parse(m);const w=this.waiting.get(d.id);if(w){this.waiting.delete(d.id);d.error?w.reject(new Error(d.error.message)):w.resolve(d.result);}});}
 send(method,params={},sessionId){const id=++this.id;return new Promise((resolve,reject)=>{this.waiting.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
 close(){this.ws.close();}
}

// a step that never finishes (a wedged worker) must end the run with a clear message instead of hanging it
const within=(ms,what,promise)=>Promise.race([promise,new Promise((_,rej)=>setTimeout(()=>rej(new Error(`timed out after ${ms/1000} s: ${what}`)),ms))]);

const readProc=(pid)=>{
 const out={pid};
 try{
  const s=readFileSync(`/proc/${pid}/status`,'utf8');
  out.rssMB=mb(Number(/VmRSS:\s+(\d+) kB/.exec(s)[1])*1024);
  out.hwmMB=mb(Number(/VmHWM:\s+(\d+) kB/.exec(s)[1])*1024);
  out.threads=Number(/Threads:\s+(\d+)/.exec(s)[1]);
 }catch{return null;}
 try{const r=readFileSync(`/proc/${pid}/smaps_rollup`,'utf8');out.pssMB=mb(Number(/Pss:\s+(\d+) kB/.exec(r)[1])*1024);}catch{out.pssMB=null;}
 return out;
};

async function run(engine,threads,files){
 console.log(`\n=== ${engine}, ONNX Runtime threads ${threads}`);
 const dbgPort=19600+Math.floor(Math.random()*300);
 const browser=await chromium.launch({executablePath:CHROME||undefined,args:[...(CHROME?['--headless=new']:[]),`--remote-debugging-port=${dbgPort}`,'--enable-precise-memory-info']});
 const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
 const page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const browserSession=await browser.newBrowserCDPSession();
 const cdp=new Cdp((await (await fetch(`http://127.0.0.1:${dbgPort}/json/version`)).json()).webSocketDebuggerUrl);
 await cdp.ready;

 // the model files, served from a tiny local server that also sends the headers a real asset host sends
 const served=http.createServer((req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://x').pathname.replace(/^\/[a-z]+\//,''));
  try{const body=readFileSync(path.join(files,rel));res.writeHead(200,{'content-type':'application/octet-stream','access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','content-length':body.length});res.end(body);}
  catch{res.writeHead(404,{'access-control-allow-origin':'*'});res.end('no');}
 });
 await new Promise(r=>served.listen(0,'127.0.0.1',r));
 const CDN=`http://voice-cdn.example.test/${engine}/`;
 await context.route(CDN+'**',route=>route.continue({url:`http://127.0.0.1:${served.address().port}/${engine}/`+new URL(route.request().url()).pathname.replace(/^\/[a-z]+\//,'')}));

 await page.goto(ORIGIN+'/',{waitUntil:'load'});
 await page.waitForSelector('#messageInput');
 await sleep(2500); // let the app settle
 const base=await page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);
 const env=await page.evaluate(()=>({crossOriginIsolated,deviceMemory:navigator.deviceMemory,cores:navigator.hardwareConcurrency,hasUasm:typeof performance.measureUserAgentSpecificMemory==='function',ua:navigator.userAgent}));

 // ---- the instruments
 const processes=async()=>{
  const info=(await browserSession.send('SystemInfo.getProcessInfo')).processInfo;
  const list=info.map(p=>({type:p.type,...readProc(p.id)})).filter(p=>p.pid);
  const renderers=list.filter(p=>p.type==='renderer');
  const sum=(arr,k)=>Math.round(arr.reduce((n,p)=>n+(p[k]||0),0)*10)/10;
  return {renderer:{count:renderers.length,rssMB:sum(renderers,'rssMB'),hwmMB:sum(renderers,'hwmMB'),pssMB:sum(renderers,'pssMB'),threads:sum(renderers,'threads'),each:renderers},
   allProcesses:{count:list.length,rssMB:sum(list,'rssMB'),pssMB:sum(list,'pssMB')}};
 };
 const heaps=async()=>{
  const targets=(await cdp.send('Target.getTargets')).targetInfos.filter(t=>t.type==='page'||t.type==='worker'||t.type==='shared_worker');
  const rows=[];
  for(const t of targets){
   if(t.url.startsWith('devtools://'))continue;
   // Attaching to the ONNX Runtime thread workers (ort-wasm-simd-threaded.mjs) wedged threaded runs (the first speak never returned), so they are only counted.
   if(/ort-wasm/.test(t.url)){rows.push({type:t.type,url:'ort thread worker',skipped:true});continue;}
   let sessionId;
   try{
    sessionId=(await cdp.send('Target.attachToTarget',{targetId:t.targetId,flatten:true})).sessionId;
    const h=await cdp.send('Runtime.getHeapUsage',{},sessionId);
    const row={type:t.type,url:t.url.replace(/^.*\//,'').slice(0,60),usedMB:mb(h.usedSize),totalMB:mb(h.totalSize)};
    if(t.type==='page'){
     await cdp.send('Performance.enable',{},sessionId);
     const m=Object.fromEntries((await cdp.send('Performance.getMetrics',{},sessionId)).metrics.map(x=>[x.name,x.value]));
     row.perf={jsHeapUsedMB:mb(m.JSHeapUsedSize),jsHeapTotalMB:mb(m.JSHeapTotalSize),nodes:m.Nodes,documents:m.Documents,jsEventListeners:m.JSEventListeners};
     try{row.domCounters=await cdp.send('Memory.getDOMCounters',{},sessionId);}catch(e){row.domCounters='unavailable: '+e.message;}
    }
    rows.push(row);
   }catch(e){rows.push({type:t.type,url:t.url.slice(-40),error:e.message});}
   finally{if(sessionId)await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{});}
  }
  const used=rows.reduce((n,r)=>n+(r.usedMB||0),0);
  return {v8HeapUsedMBAllTargets:Math.round(used*10)/10,targets:rows};
 };
 const uasm=async()=>{
  const t0=Date.now();
  const r=await page.evaluate(async()=>{try{const m=await performance.measureUserAgentSpecificMemory();return {bytes:m.bytes,breakdown:m.breakdown.filter(b=>b.bytes>1048576).map(b=>({bytesMB:Math.round(b.bytes/1048576*10)/10,types:b.types,urls:b.attribution.map(a=>(a.url||'').replace(/^.*\//,'').slice(0,50)+':'+a.scope).slice(0,4)}))};}catch(e){return {error:String(e.message||e)};}});
  return r.error?r:{totalMB:mb(r.bytes),breakdown:r.breakdown,tookMs:Date.now()-t0};
 };
 const snapshot=async(label,{withUasm=true}={})=>{
  const out={label,at:new Date().toISOString()};
  out.rss=await processes();
  out.cdp=await heaps();
  if(withUasm&&!NO_UASM)out.uasm=await uasm();
  console.log(`  ${label.padEnd(22)} renderer RSS ${out.rss.renderer.rssMB} MB (HWM ${out.rss.renderer.hwmMB}, PSS ${out.rss.renderer.pssMB}) | UASM ${out.uasm?.totalMB??'-'} MB | V8 heaps ${out.cdp.v8HeapUsedMBAllTargets} MB`);
  return out;
 };

 const result={engine,threadsRequested:threads,browserVersion:browser.version(),env,snapshots:[],errors};
 result.snapshots.push(await snapshot('baseline'));

 // install (not part of the memory question, but recorded: it shows what OPFS writing costs the renderer)
 await page.evaluate(async({base,cdn,engine,threads})=>{
  const {createVoiceEngine}=await import(base+'chat/voice/voice-engine.mjs');
  window.__engine=createVoiceEngine({engine,baseUrl:cdn,threads});
  await window.__engine.install(()=>{});
 },{base,cdn:CDN,engine,threads});
 result.snapshots.push(await snapshot('installed'));

 const loadInfo=await page.evaluate(async()=>{const t=performance.now();const r=await window.__engine.load();return {loadMs:Math.round(performance.now()-t),voices:r.voices.length};});
 result.load=loadInfo;
 await sleep(1500);
 result.snapshots.push(await snapshot('loaded'));

 // a short warm-up so one-off allocations (first run) are not what the "peak" measures; recorded as its own snapshot
 await within(120000,'warm-up speak',page.evaluate(()=>window.__engine.speak('A short warm up sentence.',{onChunk(){}})));
 result.snapshots.push(await snapshot('after warm-up speak'));

 // ---- the long speak: poll /proc every 100 ms and the heaps every second, UASM in a loop inside the page
 await page.evaluate(({text,noUasm})=>{
  window.__done=false;window.__chunks=0;window.__uasmCalls=[];
  window.__speak=window.__engine.speak(text,{onChunk(){window.__chunks++;}}).then(s=>{window.__done=true;return s;},e=>{window.__done=true;throw e;});
  // Chrome answers each UASM call after a random delay of up to ~20 s, so several calls are started during the speak (2 s apart) and all are
  // awaited afterwards; each answer is the memory at some moment close to when it was scheduled, not at a known instant.
  (async()=>{while(!window.__done&&!noUasm){window.__uasmCalls.push(performance.measureUserAgentSpecificMemory().then(m=>m.bytes,()=>null));await new Promise(r=>setTimeout(r,2000));}})();
 },{text:longText,noUasm:NO_UASM});
 const samples=[];const heapSamples=[];
 const t0=Date.now();let lastHeap=0;
 for(;;){
  const done=await page.evaluate(()=>window.__done);
  const ps=await processes();
  samples.push({ms:Date.now()-t0,rssByPid:Object.fromEntries(ps.renderer.each.map(e=>[e.pid,e.rssMB])),pssByPid:Object.fromEntries(ps.renderer.each.map(e=>[e.pid,e.pssMB])),allRssMB:ps.allProcesses.rssMB});
  if(Date.now()-lastHeap>2000){lastHeap=Date.now();const h=await heaps();heapSamples.push({ms:Date.now()-t0,v8HeapUsedMB:h.v8HeapUsedMBAllTargets});}
  if(done)break;
  await sleep(100);
 }
 const stats=await page.evaluate(()=>window.__speak);
 const uasmDuring=(await page.evaluate(()=>Promise.all(window.__uasmCalls))).filter(x=>x!=null).map(x=>Math.round(x/1048576*10)/10);
 const byLabel=Object.fromEntries(result.snapshots.map(s=>[s.label,s]));
 // The browser keeps a spare renderer process next to the page's own. The page's renderer is the one that grew most between 'baseline' and 'loaded'.
 const growth=(e)=>e.rssMB-(byLabel.baseline.rss.renderer.each.find(x=>x.pid===e.pid)?.rssMB??0);
 const pagePid=[...byLabel.loaded.rss.renderer.each].sort((x,y)=>growth(y)-growth(x))[0].pid;
 const mine=(snap)=>snap.rss.renderer.each.find(e=>e.pid===pagePid);
 const peakOf=(key)=>Math.max(...samples.map(x=>x[key][pagePid]??0));
 const r1=(n)=>Math.round(n*10)/10;
 result.pagePid=pagePid;
 result.speak={
  audioSeconds:r1(stats.audioSeconds),wallSeconds:r1(stats.wallSeconds),realTimeFactor:Math.round(stats.realTimeFactor*100)/100,chunks:stats.chunks,
  textChars:longText.length,rssSamples:samples.length,
  peakPageRendererRssMB:peakOf('rssByPid'),peakPageRendererPssMB:peakOf('pssByPid'),peakAllProcessesRssMB:Math.max(...samples.map(x=>x.allRssMB)),
  uasmSamplesMB:uasmDuring,peakUasmMB:uasmDuring.length?Math.max(...uasmDuring):null,
  peakV8HeapUsedMB:heapSamples.length?Math.max(...heapSamples.map(x=>x.v8HeapUsedMB)):null,
  note:'UASM calls (each forces a GC) were started every 2 s during synthesis, so the audio/wall time is a little longer than a quiet run',
 };
 console.log(`  speak: ${result.speak.audioSeconds} s of audio in ${result.speak.wallSeconds} s; peak page-renderer RSS ${result.speak.peakPageRendererRssMB} MB, peak UASM ${result.speak.peakUasmMB} MB`);
 result.snapshots.push(await snapshot('after long speak'));
 await page.evaluate(()=>window.__engine.unload());
 await sleep(2000);
 result.snapshots.push(await snapshot('after unload'));
 await page.evaluate(()=>window.__engine.remove());
 await sleep(2000);
 result.snapshots.push(await snapshot('after remove'));
 byLabel['after long speak']=result.snapshots.at(-3);byLabel['after unload']=result.snapshots.at(-2);byLabel['after remove']=result.snapshots.at(-1);
 const b0=mine(byLabel.baseline),u=(l)=>byLabel[l].uasm?.totalMB??null,du=(l)=>u(l)!=null&&u('baseline')!=null?r1(u(l)-u('baseline')):null;
 result.summary={
  pagePid,
  baselineRssMB:b0.rssMB,loadedRssMB:mine(byLabel.loaded).rssMB,peakRssMB:result.speak.peakPageRendererRssMB,
  extraAtLoadRssMB:r1(mine(byLabel.loaded).rssMB-b0.rssMB),
  extraPeakRssMB:r1(result.speak.peakPageRendererRssMB-b0.rssMB),
  extraPeakPssMB:r1(result.speak.peakPageRendererPssMB-b0.pssMB),
  extraHwmMB:r1(mine(byLabel['after long speak']).hwmMB-b0.hwmMB),
  extraAfterUnloadRssMB:r1(mine(byLabel['after unload']).rssMB-b0.rssMB),
  extraAfterRemoveRssMB:r1(mine(byLabel['after remove']).rssMB-b0.rssMB),
  baselineUasmMB:u('baseline'),loadedUasmMB:u('loaded'),afterSpeakUasmMB:u('after long speak'),peakUasmMB:result.speak.peakUasmMB,
  extraLoadedUasmMB:du('loaded'),extraAfterSpeakUasmMB:du('after long speak'),
  extraPeakUasmMB:result.speak.peakUasmMB!=null&&u('baseline')!=null?r1(result.speak.peakUasmMB-u('baseline')):null,
  extraAfterUnloadUasmMB:du('after unload'),extraAfterRemoveUasmMB:du('after remove'),
 };
 console.log('  summary',JSON.stringify(result.summary));
 cdp.close();served.close();await browser.close();
 return result;
}

const out={
 generatedAt:new Date().toISOString(),
 machine:{cpu:os.cpus()[0]?.model,cores:os.cpus().length,totalMemGB:Math.round(os.totalmem()/2**30),platform:os.platform(),kernel:os.release()},
 browser:'Chromium, new headless mode, executable '+(CHROME||'(Playwright default)'),
 note:'Measured on a desktop Linux machine with a headless Chromium. The app page is idle in API mode: NO local chat model was loaded (none can be loaded here).',
 methods:{uasm:'performance.measureUserAgentSpecificMemory()',cdpHeap:'CDP Runtime.getHeapUsage per page/worker target',cdpPerf:'CDP Performance.getMetrics (page)',cdpMemory:'CDP Memory.getDOMCounters',rss:'/proc/<pid>/status VmRSS and VmHWM, smaps_rollup Pss, renderer processes from CDP SystemInfo.getProcessInfo'},
 runs:[],
};
try{
 for(const engine of ENGINES){
  const files=await voiceFilesDir(engine);
  if(!files)throw new Error('model files unavailable for '+engine);
  for(const threads of THREADS)out.runs.push(await run(engine,threads,files));
 }
}finally{web.kill();}
mkdirSync(path.dirname(OUT),{recursive:true});
writeFileSync(OUT,JSON.stringify(out,null,1)+'\n');
console.log('\nwrote '+OUT);
