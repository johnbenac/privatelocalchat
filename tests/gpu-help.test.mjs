import test from 'node:test';
import assert from 'node:assert/strict';
import {explainGpu} from '../runtime/gpu-help.mjs';
import {gatherEnv} from '../runtime/providers/capability-probe.mjs';
const FF='Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',CR='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',HL=CR.replace('Chrome/','HeadlessChrome/');
test('Firefox on Linux without WebGPU is told to use Chrome, not that shader-f16 is missing',()=>{
 const r=explainGpu({userAgent:FF,platform:'Linux',webgpu:{available:false,hasApi:false}});
 assert.equal(r.kind,'no-api');assert.match(r.headline,/WebGPU is not available/);assert.doesNotMatch(r.headline+r.detail,/shader-f16/);assert.ok(r.steps.some(s=>/Chrome or Chromium/.test(s)));
});
test('Chromium on Linux with no adapter is pointed at Vulkan and the flags',()=>{
 const r=explainGpu({userAgent:CR,platform:'Linux',webgpu:{available:false,hasApi:true,reason:'requestAdapter() returned no adapter'}});
 assert.equal(r.kind,'no-adapter');assert.ok(r.steps.some(s=>/vulkaninfo/.test(s))&&r.steps.some(s=>/--enable-unsafe-webgpu/.test(s)));
});
test('a software adapter is called what it is, and headless browsers are flagged',()=>{
 const r=explainGpu({userAgent:HL,platform:'Linux',webgpu:{available:true,isFallbackAdapter:true,shaderF16:false,adapter:{vendor:'google',architecture:'swiftshader'}}});
 assert.equal(r.kind,'software');assert.match(r.detail,/swiftshader/);assert.ok(r.steps[0].includes('headless'));
});
test('a real adapter without 16-bit support only blocks the 2B model, and says so',()=>{
 const env={userAgent:CR,platform:'Linux',webgpu:{available:true,shaderF16:false,adapter:{vendor:'nvidia',architecture:'ampere'}}};
 assert.equal(explainGpu(env,{tier:'light'}).kind,'no-f16');assert.match(explainGpu(env,{tier:'light'}).detail,/9B/);
 assert.equal(explainGpu(env,{tier:'default'}).headline,'');
});
test('a working GPU needs no explanation',()=>{ assert.equal(explainGpu({userAgent:CR,webgpu:{available:true,shaderF16:true}}).kind,'ok'); });
test('gatherEnv records why WebGPU is missing and prefers the fast GPU',async()=>{
 assert.equal((await gatherEnv({userAgent:FF})).webgpu.hasApi,false);
 const slow={features:new Set(),isFallbackAdapter:false,limits:{},info:{vendor:'intel'}},fast={features:new Set(['shader-f16']),isFallbackAdapter:false,limits:{},info:{vendor:'nvidia',architecture:'ampere'}};
 const env=await gatherEnv({userAgent:CR,gpu:{requestAdapter:async o=>o?.powerPreference==='high-performance'?fast:slow}});
 assert.equal(env.webgpu.shaderF16,true);assert.equal(env.webgpu.adapter.vendor,'nvidia');
 const none=await gatherEnv({userAgent:CR,gpu:{requestAdapter:async o=>o?.forceFallbackAdapter?{}:null}});
 assert.equal(none.webgpu.hasApi,true);assert.equal(none.webgpu.softwareAdapterExists,true);
});

test('on Linux, an NVIDIA graphics card without 16-bit shaders is told about the Dawn switch; other cards and systems are not',()=>{
 const linuxChrome='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
 const env=(vendor,ua,platform)=>({webgpu:{available:true,hasApi:true,shaderF16:false,isFallbackAdapter:false,adapter:{vendor}},userAgent:ua,platform});
 const nv=explainGpu(env('nvidia',linuxChrome,'Linux x86_64'),{tier:'light'});
 assert.equal(nv.kind,'no-f16');assert.ok(nv.steps.some(s=>/vulkan_enable_f16_on_nvidia/.test(s)&&/enable-dawn-features/.test(s)),'the switch is named: '+nv.steps.join(' | '));
 assert.ok(!explainGpu(env('amd',linuxChrome,'Linux x86_64'),{tier:'light'}).steps.some(s=>/vulkan_enable_f16_on_nvidia/.test(s)),'not for an AMD card');
 assert.ok(!explainGpu(env('nvidia','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0.0.0 Safari/537.36','Win32'),{tier:'light'}).steps.some(s=>/vulkan_enable_f16_on_nvidia/.test(s)),'not on Windows');
});
