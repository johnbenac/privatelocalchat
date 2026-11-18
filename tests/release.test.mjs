import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
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
