// Audible check: drives the REAL app path (the picker, the route, chat/voice/speech.mjs, the gapless player) with the REAL Kitten and Kokoro engines and records every
// buffer the page's AudioContext is asked to play. A voice that is "ready" but silent (the engine's chunk objects were once dropped by the player) fails here.
// VOICE_WAV_DIR=/some/dir also writes the audio as WAV files, to transcribe or listen to; VOICE_KINDS=kitten limits it to one voice.
import '../helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {launch,assert} from './harness.mjs';process.env.PLC_E2E_BRANCH='dev';
import {voiceFilesDir} from './voice-files.mjs';
import {KITTEN_NANO_BASE_URL} from '../../chat/voice/voice-manifest.mjs';
import {KOKORO_Q8_BASE_URL} from '../../chat/voice/voice-manifest-kokoro.mjs';
const out=process.env.VOICE_WAV_DIR||'';
if(out)mkdirSync(out,{recursive:true});
const dirs={kitten:await voiceFilesDir('kitten'),kokoro:await voiceFilesDir('kokoro')};
import http from 'node:http';
const server=http.createServer((req,res)=>{const [,kind,...rest]=decodeURIComponent(new URL(req.url,'http://x').pathname).split('/');const f=path.join(dirs[kind]||'/nonexistent',rest.join('/'));try{const body=readFileSync(f);res.writeHead(200,{'content-type':'application/octet-stream','access-control-allow-origin':'*','cross-origin-resource-policy':'cross-origin','content-length':body.length});res.end(body);}catch{res.writeHead(404,{'access-control-allow-origin':'*'});res.end('no');}});
await new Promise(r=>server.listen(18399,'127.0.0.1',r));
const wav=(f32,rate)=>{const b=Buffer.alloc(44+f32.length*2);b.write('RIFF',0);b.writeUInt32LE(36+f32.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(f32.length*2,40);for(let i=0;i<f32.length;i++)b.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(f32[i]*32767))),44+i*2);return b;};
const h=await launch({port:18340,storage:{'plc.test.voice':'1'},init:()=>{const fport=18399;window.__plcVoiceEngineFactory=async id=>{const base=new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href;const {createVoiceEngine}=await import(base+'chat/voice/voice-engine.mjs');return createVoiceEngine({engine:id,baseUrl:`http://127.0.0.1:${fport}/${id}/`});};window.__cap=[];const o=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...a){try{window.__cap.push({rate:this.buffer.sampleRate,data:Array.from(this.buffer.getChannelData(0))});}catch(e){}return o.apply(this,a);};}});
const {page,context}=h;
await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
for(const kind of (process.env.VOICE_KINDS||'kitten,kokoro').split(',')){
 const r=await page.evaluate(async(kind)=>{
  window.__cap.length=0;const ctl=await window.plcApp.loadVoice();
  const sel=await ctl.select(kind,{confirmed:true});            // downloads, self-test, and plays the sample through the player
  const sample=window.__cap.splice(0);
  const mod=await import(new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href+'chat/voice/speech.mjs');
  const route=ctl.route();
  window.__cap.length=0;
  await mod.speak('The capital of France is Paris. This is a short test of on device speech.',{engine:route.engine,...route.options}).done;   // the real read-aloud path
  const read=window.__cap.splice(0);
  return {ok:sel.ok,reason:sel.reason,sample,read,state:ctl.snapshot().voices.find(v=>v.id===kind).state};
 },kind);
 for(const [name,chunks] of [['sample',r.sample],['read',r.read]]){
  let n=0,peak=0,e=0;const all=[];for(const c of chunks){for(const v of c.data){all.push(v);const a=Math.abs(v);if(a>peak)peak=a;e+=v*v;n++;}}
  const rate=chunks[0]?.rate||24000;
  console.log(kind,name,'ok='+r.ok,r.reason||'','state='+r.state,'buffers='+chunks.length,'seconds='+(n/rate).toFixed(2),'peak='+peak.toFixed(3),'rms='+(n?Math.sqrt(e/n):0).toFixed(4));
  assert(r.ok&&r.state==='ready',kind+' was set up: '+r.reason);
  assert(chunks.length>0&&n/rate>1.5&&peak>0.05&&Math.sqrt(e/n)>0.01,kind+' '+name+' reached the audio context as real, audible speech');
  if(n&&out)writeFileSync(path.join(out,`${kind}-${name}.wav`),wav(all,rate));
 }
}
await h.close();server.close();console.log('voice-audible e2e passed: what the voices make reaches the audio context');
