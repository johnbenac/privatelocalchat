// The Kokoro-82M q8 voice engine in a real browser: the REAL worker (ONNX Runtime Web WASM + espeak-ng phonemizer) and the REAL model files.
// The CDN URL is answered from VOICE_KOKORO_DIR (the layout of the hosted set); when that is unset the pinned files are fetched from the hosted
// CDN into a temp directory and verified against the manifest (tests/e2e/voice-files.mjs). Installs, speaks a short text, checks the audio, removes, and checks private storage is back to its baseline.
//
//   node tests/e2e/voice-kokoro.e2e.mjs        (VOICE_WAV_OUT=/path.wav keeps the audio)
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {launch,assert} from './harness.mjs';
import {KOKORO_Q8_MANIFEST} from '../../chat/voice/voice-manifest-kokoro.mjs';
import {voiceFilesDir} from './voice-files.mjs';

const FILES_DIR=await voiceFilesDir('kokoro');
const PATHS=KOKORO_Q8_MANIFEST.files.map(f=>f.path);
if(!FILES_DIR){console.log('SKIPPED: the Kokoro files could not be fetched and VOICE_E2E_ALLOW_SKIP=1');process.exit(0);}
const TOTAL=KOKORO_Q8_MANIFEST.files.reduce((n,f)=>n+f.bytes,0);
const wavOut=process.env.VOICE_WAV_OUT||'';
const TEXT='The capital of France is Paris. This is a short test of on device speech.';
const CDN='http://voice-cdn.example.test/kokoro/';

const h=await launch({port:18312});
try{
 const {page,context}=h;
 const served=[];
 // The 92 MB model is too big for route.fulfill (it drops the browser connection), so the CDN URL is redirected with route.continue to a small
 // local file server that sends the CORS / CORP headers a real asset host would.
 const files=http.createServer((req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://x').pathname.replace(/^\/kokoro\//,''));
  if(!PATHS.includes(rel)){res.writeHead(404,{'access-control-allow-origin':'*'});res.end('no');return;}
  served.push(rel);
  const body=readFileSync(path.join(FILES_DIR,rel));
  res.writeHead(200,{'content-type':rel.endsWith('.json')?'application/json':'application/octet-stream','access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','content-length':body.length});
  res.end(body);
 });
 await new Promise(r=>files.listen(0,'127.0.0.1',r));
 const filesPort=files.address().port;
 await context.route(CDN+'**',route=>route.continue({url:`http://127.0.0.1:${filesPort}/kokoro/`+new URL(route.request().url()).pathname.replace(/^\/kokoro\//,'')}));
 const base=await page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);
 const opfsBytes=()=>page.evaluate(async()=>{
  const walk=async dir=>{let n=0;for await(const [,h] of dir.entries())n+=h.kind==='file'?(await h.getFile()).size:await walk(h);return n;};
  return walk(await navigator.storage.getDirectory());
 });
 const baseline=await opfsBytes();

 const result=await page.evaluate(async({base,cdn,text,wavOut})=>{
  const {createVoiceEngine}=await import(base+'chat/voice/voice-engine.mjs');
  const engine=createVoiceEngine({engine:'kokoro',baseUrl:cdn});
  window.__engine=engine;
  const out={};
  out.before=await engine.status();
  let progress=0;
  out.afterInstall=await engine.install(p=>{progress=p.overallLoaded;});
  out.progress=progress;
  const loadT0=performance.now();
  const loaded=await engine.load();
  out.loadMs=Math.round(performance.now()-loadT0);
  out.voices=loaded.voices;
  const run=async()=>{
   const chunks=[];const t0=performance.now();
   const stats=await engine.speak(text,{onChunk:c=>chunks.push(c.samples)});
   const samples=chunks.reduce((n,c)=>n+c.length,0);
   let peak=0,energy=0;for(const c of chunks)for(let i=0;i<c.length;i+=10){const v=Math.abs(c[i]);if(v>peak)peak=v;energy+=v*v;}
   return {stats,chunks,chunkCount:chunks.length,samples,peak,rms:Math.sqrt(energy/(samples/10)),wallMs:Math.round(performance.now()-t0)};
  };
  const first=await run();   // includes the first-run warm-up
  const second=await run();  // warm
  out.first={stats:first.stats,chunkCount:first.chunkCount,samples:first.samples,wallMs:first.wallMs};
  out.second={stats:second.stats,chunkCount:second.chunkCount,samples:second.samples,wallMs:second.wallMs,peak:second.peak,rms:second.rms};
  if(wavOut){const all=new Float32Array(second.samples);let at=0;for(const c of second.chunks){all.set(c,at);at+=c.length;}out.pcm=Array.from(all,v=>Math.max(-32768,Math.min(32767,Math.round(v*32767))));}
  const emma=await engine.speak('Colour and grey.',{voice:'bf_emma',onChunk(){}});
  out.britishSeconds=emma.audioSeconds;
  out.status=await engine.status();
  return out;
 },{base,cdn:CDN,text:TEXT,wavOut:Boolean(wavOut)});
 if(wavOut){
  const pcm=Int16Array.from(result.pcm);delete result.pcm;
  const hdr=Buffer.alloc(44);hdr.write('RIFF',0);hdr.writeUInt32LE(36+pcm.length*2,4);hdr.write('WAVEfmt ',8);hdr.writeUInt32LE(16,16);hdr.writeUInt16LE(1,20);hdr.writeUInt16LE(1,22);hdr.writeUInt32LE(24000,24);hdr.writeUInt32LE(48000,28);hdr.writeUInt16LE(2,32);hdr.writeUInt16LE(16,34);hdr.write('data',36);hdr.writeUInt32LE(pcm.length*2,40);
  writeFileSync(wavOut,Buffer.concat([hdr,Buffer.from(pcm.buffer)]));
 }
 console.log(JSON.stringify(result,null,1));

 assert(result.before.installed===false,'not installed at first');
 assert(result.afterInstall.installed===true&&result.afterInstall.bytes===TOTAL,'installed with all bytes');
 assert(result.progress===TOTAL,'progress reached the total');
 assert(served.length===PATHS.length,'each file fetched once: '+served.length);
 assert(result.voices.length===8&&result.voices.includes('af_heart'),'eight voices loaded');
 const r=result.second;
 assert(r.chunkCount===2,'two sentences give two chunks; got '+r.chunkCount);
 const seconds=r.samples/24000;
 assert(seconds>3&&seconds<12,'plausible length for the text: '+seconds+' s');
 assert(Math.abs(r.stats.audioSeconds-seconds)<1e-6,'audioSeconds matches the samples');
 assert(r.peak>0.05&&r.peak<=1.5,'audio is not silent: peak '+r.peak);
 assert(r.rms>0.005,'audio has energy: rms '+r.rms);
 assert(r.stats.realTimeFactor>0&&r.stats.firstAudioMs>0&&r.stats.synthSeconds>0,'stats present');
 assert(result.britishSeconds>0.5,'a British voice speaks too');
 assert(result.status.loaded===true,'model stays loaded after speaking');
 const during=await opfsBytes();
 assert(during-baseline>=TOTAL&&during-baseline<TOTAL+4096,'OPFS holds the files plus a small marker: '+(during-baseline));
 const after=await page.evaluate(async()=>{const s=await window.__engine.remove();return s;});
 assert(after.installed===false&&after.loaded===false,'removed and unloaded');
 const end=await opfsBytes();
 assert(end===baseline,`OPFS back to baseline: baseline ${baseline}, after remove ${end}`);
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log(`PASS voice-kokoro e2e: ${seconds.toFixed(2)} s of audio; warm real-time factor ${r.stats.realTimeFactor.toFixed(2)}, first audio ${r.stats.firstAudioMs} ms; first run factor ${result.first.stats.realTimeFactor.toFixed(2)}, first audio ${result.first.stats.firstAudioMs} ms; load ${result.loadMs} ms`);
}finally{await h.close();process.exit(process.exitCode||0);}
