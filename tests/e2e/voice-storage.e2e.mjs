// Storage behaviour of the voice engine in a real browser's OPFS, with tiny fake model files (no model is loaded, so this is fast):
//   (d) switching from one engine to the other leaves exactly one voice directory in private storage;
//   (e) an install that hits a storage quota error leaves no partial files and reports a clear error (the browser's own QuotaExceededError).
// The quota failure is injected through the engine's documented option `writeStream`: a wrapper around the real worker writer whose stream
// throws a QuotaExceededError once a byte budget is spent.
//
//   node tests/e2e/voice-storage.e2e.mjs
import {launch,assert} from './harness.mjs';

const h=await launch({port:18322});
try{
 const {page}=h;
 const base=await page.evaluate(()=>new URL(/^(.*\/releases\/[^/]+\/)/.exec(document.querySelector('link[href*="/releases/"]').getAttribute('href'))[1],location.href).href);
 const result=await page.evaluate(async(base)=>{
  const {createVoiceEngine,VOICE_DIR,KOKORO_VOICE_DIR}=await import(base+'chat/voice/voice-engine.mjs');
  const enc=new TextEncoder();
  const sha=async(bytes)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  // a tiny file set per engine: same roles as the real manifests, a few hundred bytes each, with real SHA-256 values
  const makeSet=async(id,roles)=>{
   const files=[],data={};
   for(const [name,role,text] of roles){const bytes=enc.encode(text.repeat(40));data[name]=bytes;files.push({name,role,bytes:bytes.length,sha256:await sha(bytes)});}
   return {manifest:{id,files,...(roles.some(r=>r[1]==='tokenizer')?{requiredRoles:['model','tokenizer','tokenizer_config','config','voice']}:{})},data};
  };
  const kitten=await makeSet('test-kitten',[['m.onnx','model','model-'],['v.npz','voices','voices-'],['c.json','config','{"a":1}']]);
  const kokoro=await makeSet('test-kokoro',[['m.onnx','model','model-'],['t.json','tokenizer','tok-'],['tc.json','tokenizer_config','tokc-'],['c.json','config','cfg-'],['v1.bin','voice','voice1-']]);
  const fetchFor=(set)=>async(url)=>{
   const name=url.split('/').pop();const body=set.data[name];
   return body?new Response(body.slice(),{status:200}):new Response('no',{status:404});
  };
  const dirs=async()=>{const out=[];for await(const [name,handle] of (await navigator.storage.getDirectory()).entries())out.push(name+(handle.kind==='directory'?'/':''));return out.sort();};
  const walkBytes=async(dir)=>{let n=0;for await(const [,hd] of dir.entries())n+=hd.kind==='file'?(await hd.getFile()).size:await walkBytes(hd);return n;};
  const out={dirsAtStart:await dirs()};
  const make=(engine,set,extra={})=>createVoiceEngine({engine,baseUrl:'https://cdn.example.test/'+engine+'/',manifest:set.manifest,fetchImpl:fetchFor(set),...extra});

  // (d) switch kitten -> kokoro the way a switch is done: remove the old voice, install the new one
  const k1=make('kitten',kitten),k2=make('kokoro',kokoro);
  out.kittenInstall=(await k1.install(()=>{})).installed;
  out.afterKitten=await dirs();
  await k1.remove();
  out.kokoroInstall=(await k2.install(()=>{})).installed;
  out.afterSwitch=await dirs();
  out.kittenStatusAfterSwitch=(await k1.status()).installed;
  out.kokoroStatusAfterSwitch=(await k2.status()).installed;
  // and back: kokoro -> kitten
  await k2.remove();await k1.install(()=>{});
  out.afterSwitchBack=await dirs();
  // removing one engine never touches the other's directory
  await k2.install(()=>{});
  out.bothInstalled=await dirs();
  await k1.remove();
  out.afterRemovingKittenOnly=await dirs();
  await k2.remove();
  out.afterAll=await dirs();
  out.VOICE_DIR=VOICE_DIR;out.KOKORO_VOICE_DIR=KOKORO_VOICE_DIR;

  // (e) storage quota error during an install
  const root=await navigator.storage.getDirectory();
  // The engine writes through the shared worker writer (writeStream option). Wrap it: the stream is cut with a QuotaExceededError once a byte budget is spent.
  const {writeOpfsStream}=await import(base+'runtime/providers/opfs-stream-writer.mjs');
  const quotaWriter=(budget)=>{
   let used=0;
   return async(key,stream)=>{
    const quota=new DOMException('The quota has been exceeded.','QuotaExceededError');
    const limited=stream.pipeThrough(new TransformStream({transform(chunk,c){used+=chunk.byteLength;if(used>budget)throw quota;c.enqueue(chunk);}}));
    try{return await writeOpfsStream(key,limited,{directory:VOICE_DIR});}catch(e){throw (used>budget?quota:e);}
   };
  };
  const total=kitten.manifest.files.reduce((n,f)=>n+f.bytes,0);
  const tight=make('kitten',kitten,{writeStream:quotaWriter(Math.floor(total*0.6)),attempts:3,pause:()=>Promise.resolve()});
  let error=null;
  try{await tight.install(()=>{});}catch(e){error={name:e.name,message:e.message};}
  out.quota={error,dirs:await dirs(),opfsBytes:await walkBytes(root),status:await make('kitten',kitten).status()};
  // after the failure a normal install on the same storage still works (nothing half-written blocks it)
  out.afterQuotaRetry=(await make('kitten',kitten).install(()=>{})).installed;
  await make('kitten',kitten).remove();
  out.endDirs=await dirs();
  return out;
 },base);
 console.log(JSON.stringify(result,null,1));

 const only=(arr,name)=>arr.length===1&&arr[0]===name+'/';
 assert(result.dirsAtStart.every(n=>!n.startsWith('plc-voice')),'no voice directory at the start: '+result.dirsAtStart);
 assert(result.kittenInstall===true&&result.afterKitten.filter(n=>n.startsWith('plc-voice')).join()===result.VOICE_DIR+'/','kitten alone is installed first');
 assert(result.kokoroInstall===true,'kokoro installed');
 assert(result.afterSwitch.filter(n=>n.startsWith('plc-voice')).length===1&&result.afterSwitch.includes(result.KOKORO_VOICE_DIR+'/'),'after kitten -> kokoro exactly one voice directory remains, the Kokoro one: '+result.afterSwitch);
 assert(result.kittenStatusAfterSwitch===false&&result.kokoroStatusAfterSwitch===true,'status agrees with the directories after the switch');
 assert(result.afterSwitchBack.filter(n=>n.startsWith('plc-voice')).join()===result.VOICE_DIR+'/','after kokoro -> kitten exactly one voice directory remains, the Kitten one: '+result.afterSwitchBack);
 assert(result.bothInstalled.filter(n=>n.startsWith('plc-voice')).length===2,'engines keep separate directories (so a switch must remove the old one explicitly)');
 assert(result.afterRemovingKittenOnly.filter(n=>n.startsWith('plc-voice')).join()===result.KOKORO_VOICE_DIR+'/','removing one engine leaves the other untouched');
 assert(result.afterAll.every(n=>!n.startsWith('plc-voice')),'removing the last one leaves no voice directory');

 assert(result.quota.error&&result.quota.error.name==='QuotaExceededError'&&/quota/i.test(result.quota.error.message),'the install reports the browser quota error unchanged: '+JSON.stringify(result.quota.error));
 assert(result.quota.dirs.every(n=>!n.startsWith('plc-voice')),'a failed install leaves no voice directory: '+result.quota.dirs);
 assert(result.quota.opfsBytes===0,'no partial file bytes remain in private storage: '+result.quota.opfsBytes);
 assert(result.quota.status.installed===false&&result.quota.status.bytes===0,'status reports not installed');
 assert(result.afterQuotaRetry===true,'a later install on the same storage succeeds');
 assert(result.endDirs.every(n=>!n.startsWith('plc-voice')),'clean at the end');
 assert(h.errors.length===0,'no page errors: '+h.errors.join(' | '));
 console.log('PASS voice-storage e2e: engine switch leaves one directory; quota error leaves nothing behind');
}finally{await h.close();}
