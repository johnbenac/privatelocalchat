import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

const origin='https://dev.privatelocal.chat';
const template=await readFile('scripts/service-worker.js','utf8');
const hook=await readFile('dev-tools/offline-fault-sw.js','utf8');
function cachesFixture(){
 const all=new Map(),key=r=>new URL(r.url||r,origin).href;
 return {async open(name){if(!all.has(name))all.set(name,new Map());const m=all.get(name);return {async match(r){return m.get(key(r))?.clone();},async put(r,response){m.set(key(r),response.clone());}};},async match(r){for(const m of all.values())if(m.has(key(r)))return m.get(key(r)).clone();},async keys(){return [...all.keys()];},async delete(name){return all.delete(name);}};
}
function worker(caches){
 const handlers=new Map(),network=[];
 const self={addEventListener(type,fn){if(!handlers.has(type))handlers.set(type,[]);handlers.get(type).push(fn);}};
 const source=template.replace('__CACHE_NAME__','"plc-shell-fixture"').replace('__DEVELOPMENT_NATIVE__','true').replace('__SHELL_FILES__','[]').replace('__PUBLIC_PAGES__','[]').replace('__DEV_OFFLINE_FAULT__',hook);
 vm.runInNewContext(source,{self,caches,location:new URL(origin),URL,Response,fetch:async request=>{network.push(request.url);return new Response('network');}});
 return {
  network,
  async mode(enabled,sourceOrigin=origin){let pending=Promise.resolve(),reply;for(const fn of handlers.get('message'))fn({data:{type:'dev-network-fault',enabled},source:{url:sourceOrigin+'/'},ports:[{postMessage:r=>{reply=r;}}],waitUntil:p=>{pending=p;}});await pending;return reply;},
  async fetch(url,{method='GET',navigate=false}={}){let result;for(const fn of handlers.get('fetch'))fn({request:{url,method,mode:navigate?'navigate':'cors'},respondWith:p=>{result=p;}});return await result;},
 };
}

test('dev network denial preserves cached navigation and blocks misses, CDN and diagnostic POST',async()=>{
 const caches=cachesFixture(),cache=await caches.open('plc-shell-fixture');await cache.put('/index.html',new Response('cached shell'));await cache.put('/runtime.js',new Response('cached runtime'));
 const w=worker(caches);assert.equal(await(await w.fetch(origin+'/online-probe')).text(),'network');
 assert.equal((await w.mode(true)).enabled,true);const before=w.network.length;
 assert.equal(await(await w.fetch(origin+'/?reopen=1',{navigate:true})).text(),'cached shell');
 assert.equal(await(await w.fetch(origin+'/runtime.js')).text(),'cached runtime');
 for(const [url,options]of [[origin+'/uncached',{}],['https://assets.privatelocal.chat/uncached',{}],[origin+'/api/debug/receiver',{method:'POST'}]])assert.equal((await w.fetch(url,options)).type,'error');
 assert.equal(w.network.length,before);
});

test('denial survives service-worker replacement and only same-origin commands can restore it',async()=>{
 const caches=cachesFixture();await worker(caches).mode(true);
 const replacement=worker(caches);assert.equal((await replacement.fetch(origin+'/probe')).type,'error');
 assert.equal(await replacement.mode(false,'https://privatelocal.chat'),undefined);
 assert.equal((await replacement.fetch(origin+'/probe')).type,'error');
 assert.equal((await replacement.mode(false)).enabled,false);
 assert.equal(await(await replacement.fetch(origin+'/probe')).text(),'network');
 assert.equal(replacement.network.length,1);
});
