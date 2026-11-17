import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {pickTier,lightBackend,tierBackend,cpuBackendSupport,gpuRunsLight} from '../runtime/auto-tier.mjs';
import {wasmSupport} from '../runtime/providers/capability-probe.mjs';
import {loadConfigFor} from '../runtime/providers/catalog.mjs';
import {createModelHost} from '../runtime/providers/model-host.mjs';
import {preflight} from '../runtime/providers/adapters/wllama.mjs';
const DESK='Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0',IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',MAC='Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari';
const WASM={available:true,simd:true};
const NO_GPU={webgpu:{available:false,hasApi:false},wasm:WASM,deviceMemoryGB:8};
test('without a usable graphics card the small model runs on the processor, where that is possible',()=>{
 assert.deepEqual(pickTier({env:NO_GPU,userAgent:DESK}),{tier:'light',backend:'cpu',reason:'no-gpu-cpu'});
 assert.equal(pickTier({env:{...NO_GPU,webgpu:{available:true,isFallbackAdapter:true,shaderF16:true}},userAgent:DESK}).backend,'cpu','a software renderer is slower than the processor');
 assert.equal(pickTier({env:{...NO_GPU,deviceMemoryGB:null},userAgent:DESK}).backend,'cpu','memory unknown (Firefox, Safari)');
 // the larger model is never run on the processor
 assert.equal(pickTier({env:NO_GPU,userAgent:DESK,selection:{tier:'default',chosenBy:'human'}}).tier,'light');
 assert.equal(pickTier({env:NO_GPU,userAgent:DESK,installed:{default:true}}).tier,'light');
});
test('a card without 16-bit shaders on a small device falls back to the processor instead of giving up',()=>{
 const env={webgpu:{available:true,shaderF16:false},wasm:WASM,deviceMemoryGB:4};
 assert.deepEqual(pickTier({env,userAgent:DESK}),{tier:'light',backend:'cpu',reason:'no-f16-cpu'});
 assert.equal(pickTier({env:{...env,deviceMemoryGB:8},userAgent:DESK}).tier,'default','a roomy desktop still uses the larger model on its card');
});
test('a card that works is used, and nothing changes for it',()=>{
 const env={webgpu:{available:true,shaderF16:true},wasm:WASM,deviceMemoryGB:4};
 assert.deepEqual(pickTier({env,userAgent:DESK}),{tier:'light',reason:'small-device'});
 assert.equal(lightBackend({env,userAgent:DESK}),'gpu');assert.equal(gpuRunsLight(env),true);
});
test('the processor is not offered where it cannot work',()=>{
 // no WebAssembly, no SIMD, or nothing probed: no model at all
 for(const [why,env,ua,touch] of [
  ['no wasm',{...NO_GPU,wasm:{available:false}},DESK,0],['no simd',{...NO_GPU,wasm:{available:true,simd:false}},DESK,0],['unprobed',{webgpu:{available:false}},DESK,0]]){
  assert.equal(cpuBackendSupport({env,userAgent:ua,maxTouchPoints:touch}).ok,false,why);
  assert.equal(cpuBackendSupport({env,userAgent:ua,maxTouchPoints:touch,tier:'nano'}).ok,false,why+' (tiny)');
  assert.equal(pickTier({env,userAgent:ua,maxTouchPoints:touch}).tier,null,why);
 }
 // the 2B model on the processor is not offered on iPhone and iPad or with little memory; the tiny models are
 for(const [why,env,ua,touch] of [['iphone',NO_GPU,IPHONE,5],['ipad as a mac',NO_GPU,MAC,5],['little memory',{...NO_GPU,deviceMemoryGB:2},DESK,0]]){
  assert.equal(cpuBackendSupport({env,userAgent:ua,maxTouchPoints:touch}).ok,false,why);
  assert.equal(cpuBackendSupport({env,userAgent:ua,maxTouchPoints:touch,tier:'mini'}).ok,true,why+' (tiny)');
  const pick=pickTier({env,userAgent:ua,maxTouchPoints:touch});
  assert.deepEqual([pick.tier,pick.backend],['mini','cpu'],why+': the tiny model is picked, on the processor');
 }
 assert.equal(cpuBackendSupport({env:{...NO_GPU,deviceMemoryGB:1},userAgent:DESK,tier:'nano'}).ok,false,'under 2 GB not even the tiny model');
 assert.equal(cpuBackendSupport({env:NO_GPU,userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/140 Mobile'}).ok,true);
});
test('a phone with no graphics card gets the tiny model by default; a person\'s choice and a desktop keep theirs',()=>{
 const ANDROID='Mozilla/5.0 (Linux; Android 9) Chrome/131 Mobile';
 assert.deepEqual(pickTier({env:NO_GPU,userAgent:ANDROID,maxTouchPoints:5}),{tier:'mini',backend:'cpu',reason:'mobile-cpu-tiny'});
 assert.equal(pickTier({env:NO_GPU,userAgent:DESK}).tier,'light','a desktop without a graphics card still gets the small Qwen model');
 assert.equal(pickTier({env:NO_GPU,userAgent:ANDROID,maxTouchPoints:5,selection:{tier:'nano',chosenBy:'human'}}).tier,'nano');
 assert.equal(pickTier({env:NO_GPU,userAgent:IPHONE,maxTouchPoints:5,selection:{tier:'granite',chosenBy:'human'}}).tier,'mini','a 1B model chosen on an iPhone is not allowed on the processor, so the tiny one is used');
 assert.equal(pickTier({env:NO_GPU,userAgent:IPHONE,maxTouchPoints:5,selection:{tier:'nano',chosenBy:'human'}}).tier,'nano');
 assert.equal(pickTier({env:NO_GPU,userAgent:IPHONE,maxTouchPoints:5,installed:{nano:true},selection:{tier:'mini',chosenBy:'default'}}).tier,'nano','one already downloaded keeps its place');
 assert.equal(tierBackend({env:NO_GPU,userAgent:IPHONE,maxTouchPoints:5,tier:'nano'}),'cpu');
 assert.equal(tierBackend({env:NO_GPU,userAgent:IPHONE,maxTouchPoints:5,tier:'light'}),'gpu','the load will say what is missing');
});
test('WebAssembly and SIMD are detected from the browser',()=>{
 assert.deepEqual(wasmSupport(null),{available:false,simd:false});
 assert.deepEqual(wasmSupport({validate:()=>true}),{available:true,simd:true});
 assert.deepEqual(wasmSupport({validate:()=>false}),{available:true,simd:false});
 assert.deepEqual(wasmSupport({validate(){throw new Error('x');}}),{available:true,simd:false});
 assert.equal(wasmSupport().available,true,'this Node can run WebAssembly');
});
test('the processor configuration keeps every layer and the embedding off the graphics card',()=>{
 const gpu=loadConfigFor('light',{runtimeDir:'/r/'}),cpu=loadConfigFor('light',{runtimeDir:'/r/',backend:'cpu'});
 assert.equal(gpu.backend,'gpu');assert.equal(gpu.context.n_gpu_layers,-1);assert.equal(gpu.knobs.offloadTiedEmbedding,true);
 assert.equal(cpu.backend,'cpu');assert.equal(cpu.context.n_gpu_layers,0);assert.equal(cpu.knobs.offloadTiedEmbedding,false);
 assert.deepEqual(cpu.files,gpu.files,'the same downloaded files serve both');assert.equal(cpu.modelUrl,gpu.modelUrl);
 assert.equal(loadConfigFor('default',{backend:'cpu'}).adapter,'webllm','the larger model has no processor build');
});
test('the runtime start-up check needs WebAssembly, not WebGPU, for the processor',async()=>{
 await preflight({backend:'cpu'}); // no navigator.gpu in Node: must not throw
 await assert.rejects(preflight({backend:'gpu'}),/WebGPU/);
 await assert.rejects(preflight(),/WebGPU/);
});
test('the model host picks the backend from the device and reports it',async()=>{
 const make=(env,userAgent=DESK)=>createModelHost({envProbe:async()=>env,userAgent:()=>userAgent,settings:null,createWorker:()=>{throw new Error('no worker in this test');}});
 const probe=async(host)=>{try{await host.init();}catch{}return host;};
 let host=await probe(make(NO_GPU));
 assert.equal(host.getState().backend.light,'cpu');assert.equal(host.tierConfig('light').context.n_gpu_layers,0);assert.equal(host.tierConfig('default').adapter,'webllm');
 host=await probe(make({webgpu:{available:true,shaderF16:true},wasm:WASM}));
 assert.equal(host.getState().backend.light,'gpu');assert.equal(host.tierConfig('light').context.n_gpu_layers,-1);
 host=await probe(make(NO_GPU,IPHONE));
 assert.equal(host.getState().backend.light,'gpu','an iPhone is never moved to the processor');
});

test('where the browser\'s file storage cannot be opened, the smallest model is the default, and everything else is unchanged',()=>{
 const IPH='Mozilla/5.0 (iPhone; CPU iPhone OS 18_6_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1';
 assert.deepEqual(pickTier({env:{...NO_GPU,opfs:false},userAgent:IPH,maxTouchPoints:5}),{tier:'nano',backend:'cpu',reason:'no-opfs-tiny'});
 assert.equal(pickTier({env:{...NO_GPU,opfs:true},userAgent:IPH,maxTouchPoints:5}).tier,'mini','storage works: the better tiny model');
 assert.equal(pickTier({env:{...NO_GPU,opfs:null},userAgent:IPH,maxTouchPoints:5}).tier,'mini','unknown is not a failure');
 assert.equal(pickTier({env:{...NO_GPU,opfs:false},userAgent:IPH,maxTouchPoints:5,selection:{tier:'mini',chosenBy:'human'}}).tier,'mini','a person\'s choice is respected');
 assert.equal(pickTier({env:{...NO_GPU,opfs:false},userAgent:IPH,maxTouchPoints:5,installed:{mini:true},selection:{tier:'mini',chosenBy:'default'}}).tier,'mini','a model already saved keeps its place');
});

// ---- a small iPhone gets the tiny model, whatever its iOS (the 11 Pro on iOS 27 reports a working WebGPU and used to be given the 1.2 GB model) ----
const APPLE=(maxBufferSize)=>({webgpu:{available:true,hasApi:true,shaderF16:true,isFallbackAdapter:false,adapter:{vendor:'apple'},maxBufferSize},wasm:WASM,deviceMemoryGB:null});
test('an iPhone with about 4 GB (buffer limit one sixth of 4 GiB) starts with the tiny model on its processor, with or without WebGPU',async()=>{
 const {appleMemoryEstimateGB,lowMemoryApple}=await import('../runtime/auto-tier.mjs');
 const small=APPLE(715827880);
 assert.equal(appleMemoryEstimateGB(small),4);assert.equal(lowMemoryApple(small),true);
 assert.deepEqual(pickTier({env:small,userAgent:IPHONE}),{tier:'mini',backend:'cpu',reason:'low-memory-phone'});
 assert.equal(tierBackend({env:small,userAgent:IPHONE,tier:'mini'}),'cpu','the tiny model runs on the processor there, not on a card that shares the memory');
 assert.equal(tierBackend({env:small,userAgent:IPHONE,tier:'light'}),'gpu','a person who picks the 2B model still gets what they asked for');
 // the same phone with an older Safari (no WebGPU) already got the tiny model
 assert.equal(pickTier({env:{...small,webgpu:{available:false}},userAgent:IPHONE}).tier,'mini');
});
test('a bigger iPhone, an iPad, a Mac and an Android phone are not moved by this rule',async()=>{
 const {appleMemoryEstimateGB}=await import('../runtime/auto-tier.mjs');
 const big=APPLE(1073741824);
 assert.equal(appleMemoryEstimateGB(big),null,'the 1 GiB class cannot be told apart, so it is not guessed');
 assert.equal(pickTier({env:big,userAgent:IPHONE}).tier,'light');
 assert.equal(pickTier({env:APPLE(4294967296),userAgent:MAC,maxTouchPoints:5}).tier,'light','an iPad-class device with a large limit');
 const android={webgpu:{available:true,shaderF16:true,adapter:{vendor:'qualcomm'},maxBufferSize:715827880},wasm:WASM,deviceMemoryGB:4};
 assert.equal(appleMemoryEstimateGB(android),null,'only Apple GPUs report their memory this way');
 assert.equal(pickTier({env:android,userAgent:'Mozilla/5.0 (Linux; Android 14) Chrome/140'}).tier,'light');
 // a model already downloaded, or one the person chose, still wins on the small iPhone
 const small=APPLE(715827880);
 assert.equal(pickTier({env:small,userAgent:IPHONE,selection:{tier:'light',chosenBy:'human'}}).tier,'light');
 assert.equal(pickTier({env:small,userAgent:IPHONE,installed:{light:true}}).tier,'light');
});
