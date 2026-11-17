// The on-device voice engine in a real browser: the REAL worker (ONNX Runtime Web WASM + espeak-ng phonemizer) and the REAL Kitten TTS nano
// int8 files. The CDN URL is answered by request interception from VOICE_FILES_DIR (default /tmp/tts-spike/site/kitten), so no network is
// needed. Installs, speaks a short sentence, checks the audio, removes, and checks private storage is back to its baseline.
//
//   node tests/e2e/voice-engine.e2e.mjs
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {launch,assert} from './harness.mjs';
import {voiceFilesDir} from './voice-files.mjs';

const FILES_DIR=await voiceFilesDir('kitten');
const NAMES=['kitten_tts_nano_v0_8.onnx','voices.npz','config.json'];
if(!FILES_DIR){console.log('SKIPPED: the model files could not be fetched and VOICE_E2E_ALLOW_SKIP=1');process.exit(0);}
const wavOut=process.env.VOICE_WAV_OUT||'';
const numWavOut=process.env.VOICE_NUMBERS_WAV_OUT||'';
const CDN='https://voice-cdn.example.test/kitten/';
const MIME={'.onnx':'application/octet-stream','.npz':'application/octet-stream','.json':'application/json'};

const h=await launch({port:18311});
try{
 const {page,context}=h;
 const served=[];
 await context.route(CDN+'**',route=>{
  const name=new URL(route.request().url()).pathname.split('/').pop();
  if(!NAMES.includes(name))return route.fulfill({status:404,body:'no'});
  served.push(name);
  route.fulfill({status:200,body:readFileSync(path.join(FILES_DIR,name)),headers:{'content-type':MIME[path.extname(name)],'access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin'}});
 });
 const base=await page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);

 const opfsBytes=()=>page.evaluate(async()=>{
  const walk=async dir=>{let n=0;for await(const [,h] of dir.entries())n+=h.kind==='file'?(await h.getFile()).size:await walk(h);return n;};
  return walk(await navigator.storage.getDirectory());
 });
 const baseline=await opfsBytes();

 const result=await page.evaluate(async({base,cdn,wavOut,numWav})=>{
  const {createVoiceEngine}=await import(base+'chat/voice/voice-engine.mjs');
  const engine=createVoiceEngine({baseUrl:cdn});
  window.__engine=engine;
  const out={};
  out.before=await engine.status();
  let progress=0;
  out.afterInstall=await engine.install(p=>{progress=p.overallLoaded;});
  out.progress=progress;
  const chunks=[];
  const t0=performance.now();
  out.stats=await engine.speak('The capital of France is Paris. This is a short test of on device speech.',{onChunk:c=>chunks.push(c.samples)});
  out.wallMs=Math.round(performance.now()-t0);
  out.chunkCount=chunks.length;
  out.samples=chunks.reduce((n,c)=>n+c.length,0);
  let peak=0,energy=0;for(const c of chunks)for(let i=0;i<c.length;i+=10){const v=Math.abs(c[i]);if(v>peak)peak=v;energy+=v*v;}
  out.peak=peak;out.rms=Math.sqrt(energy/(out.samples/10));
  out.sampleRate=24000;
  if(wavOut){const all=new Float32Array(out.samples);let at=0;for(const c of chunks){all.set(c,at);at+=c.length;}out.pcm=Array.from(all,v=>Math.max(-32768,Math.min(32767,Math.round(v*32767))));}
  // numerals go through the ported Kitten text pre-processor before chunking
  const nchunks=[];
  out.numStats=await engine.speak('It costs $5.50 on Jan 3rd, and there are 365 days.',{onChunk:c=>nchunks.push(c.samples)});
  out.numSamples=nchunks.reduce((n,c)=>n+c.length,0);
  let npeak=0;for(const c of nchunks)for(let i=0;i<c.length;i+=10){const v=Math.abs(c[i]);if(v>npeak)npeak=v;}
  out.numPeak=npeak;out.numChunks=nchunks.length;
  if(numWav){const all=new Float32Array(out.numSamples);let at=0;for(const c of nchunks){all.set(c,at);at+=c.length;}out.numPcm=Array.from(all,v=>Math.max(-32768,Math.min(32767,Math.round(v*32767))));}
  out.status=await engine.status();
  return out;
 },{base,cdn:CDN,wavOut:Boolean(wavOut),numWav:Boolean(numWavOut)});
 const writeWav=(file,arr)=>{const pcm=Int16Array.from(arr);const hdr=Buffer.alloc(44);hdr.write('RIFF',0);hdr.writeUInt32LE(36+pcm.length*2,4);hdr.write('WAVEfmt ',8);hdr.writeUInt32LE(16,16);hdr.writeUInt16LE(1,20);hdr.writeUInt16LE(1,22);hdr.writeUInt32LE(24000,24);hdr.writeUInt32LE(48000,28);hdr.writeUInt16LE(2,32);hdr.writeUInt16LE(16,34);hdr.write('data',36);hdr.writeUInt32LE(pcm.length*2,40);writeFileSync(file,Buffer.concat([hdr,Buffer.from(pcm.buffer)]));};
 if(numWavOut)writeWav(numWavOut,result.numPcm);
 delete result.numPcm;
 if(wavOut){const pcm=result.pcm;delete result.pcm;writeWav(wavOut,pcm);}
 console.log(JSON.stringify(result,null,1));

 assert(result.before.installed===false,'not installed at first');
 assert(result.afterInstall.installed===true&&result.afterInstall.bytes===27649561,'installed with all bytes');
 assert(result.progress===27649561,'progress reached the total');
 assert(result.chunkCount===2,'two sentences give two chunks (sentence punctuation is kept); got '+result.chunkCount);
 const nsec=result.numSamples/24000;
 assert(result.numChunks===1&&nsec>3&&nsec<14&&result.numPeak>0.05,'a sentence with numerals produces audio: '+nsec+' s, peak '+result.numPeak);
 const seconds=result.samples/24000;
 assert(seconds>3&&seconds<12,'plausible length for the sentence: '+seconds+' s');
 assert(Math.abs(result.stats.audioSeconds-seconds)<1e-6,'audioSeconds matches the samples');
 assert(result.peak>0.05&&result.peak<=1.5,'audio is not silent: peak '+result.peak);
 assert(result.rms>0.005,'audio has energy: rms '+result.rms);
 assert(typeof result.stats.realTimeFactor==='number'&&result.stats.realTimeFactor>0,'realTimeFactor present');
 assert(result.stats.firstAudioMs>0,'firstAudioMs present');
 assert(result.status.loaded===true,'model stays loaded after speaking');
 assert(served.length===3,'each file fetched once: '+served.join());

 const during=await opfsBytes();
 assert(during-baseline>=27649561&&during-baseline<27649561+4096,'OPFS holds the model files plus a small marker: '+(during-baseline));
 const after=await page.evaluate(async()=>{const s=await window.__engine.remove();return {s,estimate:(await navigator.storage.estimate()).usage};});
 assert(after.s.installed===false&&after.s.loaded===false,'removed and unloaded');
 const end=await opfsBytes();
 assert(end===baseline,`OPFS back to baseline: baseline ${baseline}, after remove ${end}`);
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log(`PASS voice-engine e2e: ${seconds.toFixed(2)} s of audio, real-time factor ${result.stats.realTimeFactor.toFixed(2)}, first audio ${result.stats.firstAudioMs} ms`);
}finally{await h.close();}
