// Reading aloud with the downloaded voice must keep working with no network after the install (plan acceptance: "Reading aloud works offline
// after install"). Real worker, real Kitten files (fetched/verified by voice-files.mjs), the service worker ENABLED, because offline use of the
// worker and the ONNX Runtime files depends on the app cache the service worker fills the first time the voice is used.
//
//   node tests/e2e/voice-offline.e2e.mjs
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {launch,assert} from './harness.mjs';
import {voiceFilesDir} from './voice-files.mjs';

const FILES_DIR=await voiceFilesDir('kitten');
if(!FILES_DIR){console.log('SKIPPED: the model files could not be fetched and VOICE_E2E_ALLOW_SKIP=1');process.exit(0);}
const NAMES=['kitten_tts_nano_v0_8.onnx','voices.npz','config.json'];
const CDN='https://voice-cdn.example.test/kitten/';

const h=await launch({port:18321,serviceWorkers:'allow'});
try{
 const {page,context}=h;
 const served=[];let blocked=false; // routed requests would still be answered by the test while the context is offline, so the route aborts them itself
 await context.route(CDN+'**',route=>{
  if(blocked)return route.abort('internetdisconnected');
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!NAMES.includes(name))return route.fulfill({status:404,body:'no'});
  served.push(name);
  route.fulfill({status:200,body:readFileSync(path.join(FILES_DIR,name)),headers:{'content-type':'application/octet-stream','access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin'}});
 });
 // the service worker must be in control before the voice is first used, so that it saves the worker and the runtime files
 await page.waitForFunction(()=>navigator.serviceWorker?.controller||false,null,{timeout:30000}).catch(async()=>{await page.reload();await page.waitForSelector('#messageInput');});
 await page.waitForFunction(()=>navigator.serviceWorker?.controller,null,{timeout:30000});
 const base=await page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);

 const speakOnce=(text)=>page.evaluate(async(text)=>{
  const chunks=[];const stats=await window.__engine.speak(text,{onChunk:c=>chunks.push(c.samples)});
  const samples=chunks.reduce((n,c)=>n+c.length,0);let peak=0;for(const c of chunks)for(let i=0;i<c.length;i+=10)peak=Math.max(peak,Math.abs(c[i]));
  return {audioSeconds:stats.audioSeconds,samples,peak,chunks:chunks.length};
 },text);

 // online: install and use the voice once (this is what fills the service worker cache)
 await page.evaluate(async({base,cdn})=>{
  const {createVoiceEngine}=await import(base+'chat/voice/voice-engine.mjs');
  window.__engine=createVoiceEngine({baseUrl:cdn});
  await window.__engine.install(()=>{});
 },{base,cdn:CDN});
 const online=await speakOnce('The capital of France is Paris.');
 assert(online.samples>0&&online.peak>0.05,'speech works online: '+JSON.stringify(online));
 const cached=await page.evaluate(async()=>{const out=[];for(const name of await caches.keys()){const c=await caches.open(name);for(const r of await c.keys())if(/\/vendor\/voice\//.test(r.url))out.push(r.url.replace(/^.*\/vendor\/voice\//,''));}return out;});
 assert(cached.includes('worker.js')&&cached.some(f=>/ort-wasm-simd-threaded\.wasm$/.test(f)),'the service worker saved the voice worker and the runtime: '+cached.join());

 // offline: drop the worker (so the next speak must start a new one from the saved files) and cut the network
 await page.evaluate(()=>window.__engine.unload());
 await context.setOffline(true);blocked=true;
 assert(await page.evaluate(()=>navigator.onLine===false),'the browser reports offline');
 const reachable=await page.evaluate(()=>fetch('https://voice-cdn.example.test/kitten/config.json').then(()=>true,()=>false));
 assert(reachable===false,'the CDN is unreachable while offline');
 const offline=await speakOnce('This sentence is read without any network.');
 assert(offline.samples>0&&offline.peak>0.05&&offline.audioSeconds>1,'speech works offline: '+JSON.stringify(offline));
 assert(served.length===3,'the model files were fetched only once, during the install: '+served.join());
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 await context.setOffline(false);blocked=false;
 await page.evaluate(()=>window.__engine.remove());
 console.log(`PASS voice-offline e2e: ${online.audioSeconds.toFixed(1)} s online, ${offline.audioSeconds.toFixed(1)} s offline after a fresh worker start`);
}finally{await h.close();}
