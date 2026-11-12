import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tierFiles,resolveSources,chooseWebllmVariant} from '../runtime/providers/catalog.mjs';
const html=await readFile('index.html','utf8');
test('legacy storage keys are preserved and obsolete notice is removed',()=>{
 assert.match(html,/const CONFIG_KEY = 'chatConfig'/);assert.match(html,/const THREAD_KEY = 'chatThreads'/);
 assert.ok(!/migration-warning-banner|cutover is April/.test(html));
});
test('inline application script remains valid JavaScript',()=>{
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(/application\/ld\+json/.test(match[0].slice(0,match[0].indexOf('>'))))JSON.parse(match[1]);else if(match[1].trim())execFileSync('node',['--check','--input-type=commonjs'],{input:match[1]});}
});
test('local inference gates API requests and supports cancellation',async()=>{
 const html=await readFile('chat/core/sender.mjs','utf8');
 const gate=html.search(/if \(window.localModels\?\.mode === 'local'\) \{[\s\S]*?window.localModels.generate[\s\S]*?return \{ text, finishReason \};\s*\}\s*if \(!provider.config.endpoint\)/);
 assert.ok(gate>=0,'local mode must return before any API request is prepared');
 assert.ok(html.indexOf('fetch(request.url',gate)>gate,'the only chat fetch comes after the local-mode gate');
 assert.match(await readFile('index.html','utf8'),/generationController\?\.abort\(\)/);
 const bridge=await readFile('local-models.js','utf8');
 assert.match(bridge,/call.done/);assert.match(bridge,/attempt-completed/);
 assert.doesNotMatch(bridge,/fetch\([^)]*chat\/completions/);
});
test('both GPU variants and GGUF use only pinned project CDN assets below cache ceiling',()=>{
 const base='https://assets.privatelocal.chat/models/';
 const variants={q4f16_1:'c7c5d3f5a81e37b8facbb72970940a1b131314a8',q4f32_1:'f8f042bfb68cb88573af4c8e0ef9b1a26bef4ad0'};
 const webllm=Object.fromEntries(Object.entries(variants).map(([v,r])=>[v,base+'Qwen3.5-9B-'+v+'-MLC/resolve/'+r+'/']));
 const {sources}=resolveSources({webllmModelBase:webllm,webllmLibBase:webllm,wllamaModelBase:base+'Qwen3.5-2B/15852e8c16360a2fea060d615a32b45270f8a8fc/'});
 const files=[...tierFiles('default',sources,'q4f16_1'),...tierFiles('default',sources,'q4f32_1'),...tierFiles('light',sources)];
 assert.equal(files.length,275);
 for(const f of files){assert.equal(new URL(f.url).hostname,'assets.privatelocal.chat');assert.match(f.sha256,/^[a-f0-9]{64}$/);assert.ok(f.bytes<512_000_000);}
 assert.equal(chooseWebllmVariant({webgpu:{available:true,shaderF16:true}}),'q4f16_1');
 assert.equal(chooseWebllmVariant({webgpu:{available:true,shaderF16:false}}),'q4f32_1');
 assert.equal(chooseWebllmVariant({webgpu:{available:false}}),null);
});
test('deployment branches have separate projects and deployment follows validation',async()=>{
 const ci=await readFile('.github/workflows/deploy.yml','utf8');
 assert.match(ci,/project=privatelocalchat\n/);assert.match(ci,/project=privatelocalchat-dev\n/);
 assert.ok(ci.indexOf('run: npm test')<ci.indexOf('npx wrangler pages deploy'));
 assert.match(ci,/cancel-in-progress: false/);assert.match(ci,/Skipping superseded commit/);
});

test('offline navigation responses discard redirect metadata',async()=>{
 const sw=await readFile('scripts/service-worker.js','utf8');
 assert.match(sw,/cache.put\(url,new Response\(response.body/);
 assert.match(sw,/new Response\(saved.body,\{status:200,headers:saved.headers\}\)/);
});
