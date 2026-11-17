import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {launch,assert} from './harness.mjs';
// The processor (WebAssembly) path, end to end in a browser that has no usable graphics card: headless Chromium offers navigator.gpu but no adapter.
// A tiny random-weight llama model (tests/fixtures/tiny-llama.gguf) stands in for Qwen3.5-2B: it is downloaded into storage, checked against its
// SHA-256, loaded through the real host Worker and wllama runtime with the configuration the app builds for "cpu", and asked for text.
// The text is meaningless (random weights, and the fixture has no chat format the runtime's chat endpoint accepts, so generation goes through the
// raw completion endpoint of the same runtime); what is proved is that nothing needs WebGPU and that every layer runs on the processor.
const fixture=await readFile('tests/fixtures/tiny-llama.gguf');
const sha256=createHash('sha256').update(fixture).digest('hex');
const h=await launch();
const {page}=h;
const ok=name=>console.log('PASS',name);
try{
 await page.route('**/__fixture/tiny-llama.gguf',route=>route.fulfill({body:fixture,contentType:'application/octet-stream'}));
 await page.waitForFunction(()=>!document.querySelector('#messageInput').disabled);
 await page.waitForFunction(()=>window.localModels?.state?.device&&window.localModels.supported!==undefined);
 const env=await page.evaluate(()=>window.localModels.state.device);
 assert(env&&env.wasm?.available&&env.wasm.simd,'the probe sees WebAssembly with SIMD: '+JSON.stringify(env?.wasm));
 assert(!env.webgpu.available,'this browser has no usable graphics card: '+JSON.stringify(env.webgpu));
 assert(await page.evaluate(()=>window.localModels.backend)==='cpu','the app chose the processor');
 assert(await page.evaluate(()=>window.localModels.supported)===true&&await page.evaluate(()=>window.localModels.canPrepare)===true,'on-device chat is offered, not refused');
 assert((await page.evaluate(()=>window.localModels.state.backend.light))==='cpu','the model host reports it');
 ok('the app picks the processor without a graphics card');

 const result=await page.evaluate(async({sha256,bytes})=>{
  const commit=window.APP_BUILD.commit,rel=`/releases/${commit}/runtime/providers/`;
  const {createProvider}=await import(rel+'client.mjs');
  const {loadConfigFor}=await import(rel+'catalog.mjs');
  const worker=new Worker(rel+'host.worker.mjs',{type:'module'});
  const provider=createProvider(worker);await provider.ready();
  const runtimeDir=location.origin+rel+'vendor/wllama/v1q/';
  const files=[{path:'tiny-llama.gguf',bytes,sha256,url:location.origin+'/__fixture/tiny-llama.gguf',scope:'opfs'}];
  await provider.storage('wllama','remove',{files,runtimeDir},{});
  const installed=await provider.storage('wllama','install',{files,runtimeDir,verifyHash:true},{});
  const base=loadConfigFor('light',{runtimeDir,backend:'cpu'});
  const config={...base,files,modelUrl:files[0].url,context:{...base.context,n_ctx:512},loadAttempt:1};
  const info=await provider.load(config,{onProgress:()=>{}});
  const out={installed:installed.ok,state:installed.state,config:{backend:config.backend,layers:config.context.n_gpu_layers,offload:config.knobs.offloadTiedEmbedding},kind:info.capabilities?.kind,runtime:info.runtime};
  await provider.unload();worker.terminate();
  // generation on the processor: the runtime the host uses, with the settings the app builds for it, and no WebGPU adapter anywhere
  const {Wllama}=await import(runtimeDir+'wllama.js');
  const code=await (await fetch(runtimeDir+'compat-worker.js')).text();
  const w=new Wllama({default:runtimeDir+'default.wasm','single-thread/wllama.wasm':runtimeDir+'default.wasm'},{useMultiThread:false,allowOffline:true,expectedBuildId:base.runtime.buildId,forceCompat:true,logger:{debug(){},log(){},warn(){},error(){}}});
  w.setCompat({wasm:runtimeDir+'compat.wasm',worker:{code}},'firefox_safari');
  await w.loadModel([new Blob([await (await fetch(files[0].url)).arrayBuffer()])],{n_ctx:512,n_batch:base.context.n_batch,n_ubatch:base.context.n_ubatch,n_threads:1,n_parallel:1,n_gpu_layers:base.context.n_gpu_layers,flash_attn_policy:-1});
  const done=await w.createCompletion({prompt:'hello world',max_tokens:8,temperature:0,stream:false});
  out.text=done?.text??done?.choices?.[0]?.text??'';out.finish=done?.finish_reason??null;
  await w.exit?.().catch?.(()=>{});
  await provider.storage('wllama','remove',{files,runtimeDir},{}).catch(()=>{});
  return out;
 },{sha256,bytes:fixture.length});
 assert(result.installed===true,'the model file downloaded and passed its checksum: '+JSON.stringify(result));
 assert(result.config.backend==='cpu'&&result.config.layers===0&&result.config.offload===false,'configured for the processor: '+JSON.stringify(result.config));
 assert(result.kind==='local-cpu','the loaded model reports the processor: '+result.kind);
 assert(result.text.length>0,'it generated text on the processor: '+JSON.stringify(result));
 ok('a model installs, loads through the host and generates on the processor with no WebGPU adapter');

 const unexpected=h.errors.filter(e=>!/API responded with status 500|network error/.test(e));
 assert(unexpected.length===0,'no unexpected page errors: '+JSON.stringify(unexpected));
 console.log('ALL PASS');
}catch(e){console.error(e.message);console.error(h.errors);process.exitCode=1;}
finally{await h.close();}
