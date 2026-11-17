import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmbedder} from '../chat/embedding/embedder.mjs';
import {EMBEDDING_MODEL_BASE,EMBEDDING_WASM_BASE,EMBEDDING_ASSET_HOST,EMBEDDING_ASSET_VERSION} from '../chat/embedding/embedding-config.mjs';

// A fake worker that speaks the real protocol: init, embedQuery, embedDocuments.
function fakeWorkers({initError=null,delay=0,dim=256}={}){
 const made=[];
 const create=url=>{
  const w={url,terminated:false,messages:[],onmessage:null,onerror:null,onmessageerror:null,
   postMessage(data){
    w.messages.push(data);
    const reply=payload=>setTimeout(()=>{if(!w.terminated)w.onmessage?.({data:{id:data.id,...payload}});},delay);
    if(data.op==='init')return initError?reply({ok:false,error:initError}):reply({ok:true,id_model:'fake@1',timings:{embedLoadMs:1}});
    if(data.op==='embedQuery')return reply({ok:true,vector:Array.from({length:dim},(_,i)=>i===0?1:0)});
    if(data.op==='embedDocuments')return reply({ok:true,vectors:data.texts.map(()=>Array.from({length:dim},(_,i)=>i===1?1:0))});
    reply({ok:false,error:'unknown op '+data.op});
   },
   terminate(){w.terminated=true;}};
  made.push(w);return w;
 };
 return {made,create};
}
// A clock the test advances by hand.
function fakeTimers(){
 const pending=new Map();let next=1;
 return {setTimeout:(fn,ms)=>{const id=next++;pending.set(id,{fn,ms});return id;},clearTimeout:id=>pending.delete(id),
  get size(){return pending.size;},fire(){for(const [id,t] of [...pending]){pending.delete(id);t.fn();}},delays:()=>[...pending.values()].map(t=>t.ms)};
}
const settle=()=>new Promise(r=>setTimeout(r,5));

test('the model location is stated once, in the config, and the worker gets it in its init message',async()=>{
 assert.equal(EMBEDDING_MODEL_BASE,EMBEDDING_ASSET_HOST+EMBEDDING_ASSET_VERSION+'/');
 assert.equal(EMBEDDING_WASM_BASE,EMBEDDING_MODEL_BASE+'runtime/');
 const f=fakeWorkers();
 const e=createEmbedder({createWorker:f.create,saveData:false});
 await e.ready();
 const init=f.made[0].messages[0];
 assert.equal(init.op,'init');assert.equal(init.config.modelBase,EMBEDDING_MODEL_BASE);assert.equal(init.config.wasmBase,EMBEDDING_WASM_BASE);
 assert.match(f.made[0].url,/vendor\/embedding\/worker\.js$/,'the worker is resolved next to the module, so it works under /releases/<commit>/');
 e.terminate();
});

test('state goes idle, loading, ready; ready() starts loading once and every caller shares the promise',async()=>{
 const f=fakeWorkers({delay:2});const seen=[];
 const e=createEmbedder({createWorker:f.create,saveData:false,timers:fakeTimers()});
 e.onState(s=>seen.push(s));
 assert.equal(e.state,'idle');assert.equal(f.made.length,0,'nothing starts before it is asked for');
 const a=e.ready(),b=e.ready();
 assert.equal(e.state,'loading');assert.equal(a,b);
 const q=e.embedQuery('hello');
 await Promise.all([a,b,q]);
 assert.equal(f.made.length,1,'one worker, one init');
 assert.equal(f.made[0].messages.filter(m=>m.op==='init').length,1);
 assert.equal(e.state,'ready');assert.deepEqual(seen,['loading','ready']);
 assert.ok(e.lastInit&&e.lastInit.ms>=0&&e.lastInit.model==='fake@1');
 await e.ready();assert.equal(f.made.length,1,'ready() again is free');
 e.terminate();
});

test('embedQuery and embedDocuments return 256-number Float32Arrays; a worker that answers the wrong size is an error, not a wrong answer',async()=>{
 const e=createEmbedder({createWorker:fakeWorkers().create,saveData:false,timers:fakeTimers()});
 const q=await e.embedQuery('is this private');
 assert.ok(q instanceof Float32Array);assert.equal(q.length,256);assert.equal(q[0],1);
 const docs=await e.embedDocuments(['a','b']);
 assert.equal(docs.length,2);assert.ok(docs.every(v=>v instanceof Float32Array&&v.length===256));
 e.terminate();
 const bad=createEmbedder({createWorker:fakeWorkers({dim:128}).create,saveData:false,timers:fakeTimers()});
 await assert.rejects(bad.embedQuery('x'),/128 numbers, expected 256/);
 bad.terminate();
});

test('a failed load carries its message, releases the worker, and is never an unhandled rejection',async()=>{
 const f=fakeWorkers({initError:'out of memory'});
 const e=createEmbedder({createWorker:f.create,saveData:false,timers:fakeTimers()});
 await assert.rejects(e.ready(),/could not be loaded.*out of memory/);
 assert.equal(e.state,'failed');assert.match(e.error,/out of memory/);
 assert.equal(f.made[0].terminated,true,'the broken worker is released');
 e.ready(); // fire and forget while failing again: must not surface as an unhandled rejection
 await settle();
 e.terminate();
});

test('a retry after a failure starts a new worker and succeeds',async()=>{
 let n=0;const made=[];
 const e=createEmbedder({createWorker:url=>{const f=n++===0?fakeWorkers({initError:'network down'}):fakeWorkers();const w=f.create(url);made.push(w);return w;},saveData:false,timers:fakeTimers()});
 await assert.rejects(e.ready(),/network down/);
 assert.equal(e.state,'failed');
 await e.ready();
 assert.equal(e.state,'ready');assert.equal(made.length,2);assert.equal(made[0].terminated,true);
 assert.equal((await e.embedQuery('hi')).length,256);
 e.terminate();
});

test('an error event from the worker (script missing, blocked) fails the load with the browser\'s words',async()=>{
 const w={terminated:false,postMessage(){setTimeout(()=>w.onerror?.({message:'Failed to fetch the module script'}),1);},terminate(){w.terminated=true;}};
 const e=createEmbedder({createWorker:()=>w,saveData:false,workerUrl:'/nowhere/worker.js'});
 await assert.rejects(e.ready(),/Failed to fetch the module script/);
 assert.equal(e.state,'failed');assert.match(e.error,/Failed to fetch the module script/);assert.equal(w.terminated,true);
});

test('a worker that cannot be created is reported with the address, not thrown',async()=>{
 const e=createEmbedder({createWorker:()=>{throw new Error('SecurityError: blocked');},saveData:false,workerUrl:'/x/worker.js'});
 await assert.rejects(e.ready(),/\/x\/worker\.js.*blocked/);
 assert.equal(e.state,'failed');
});

test('an idle worker is terminated after idleMs and restarted transparently by the next use',async()=>{
 const f=fakeWorkers();const t=fakeTimers();const seen=[];
 const e=createEmbedder({createWorker:f.create,saveData:false,idleMs:120000,timers:t});
 e.onState(s=>seen.push(s));
 await e.embedQuery('one');
 assert.equal(e.state,'ready');assert.deepEqual(t.delays(),[120000],'an idle timer of 120 s is running');
 // using it again moves the deadline instead of stacking timers
 await e.embedQuery('two');assert.equal(t.size,1);
 t.fire();
 assert.equal(e.state,'idle');assert.equal(f.made[0].terminated,true,'memory is given back');
 assert.equal(t.size,0);
 const v=await e.embedQuery('three');
 assert.equal(v.length,256);assert.equal(f.made.length,2,'a second worker started by itself');assert.equal(e.state,'ready');
 assert.deepEqual(seen,['loading','ready','idle','loading','ready']);
 t.fire();assert.equal(f.made[1].terminated,true);
});

test('the idle timer does not fire while a request is in flight',async()=>{
 const f=fakeWorkers({delay:10});const t=fakeTimers();
 const e=createEmbedder({createWorker:f.create,saveData:false,idleMs:1000,timers:t});
 await e.ready();
 const pending=e.embedQuery('slow');
 t.fire(); // the deadline passes while the request is outstanding
 assert.equal(f.made[0].terminated,false,'a timer that fires mid-request must not kill it');
 assert.equal((await pending).length,256);
 e.terminate();
});

test('Data saver makes the model unavailable with a reason, and nothing is downloaded; forcing it overrides',async()=>{
 const f=fakeWorkers();
 const e=createEmbedder({createWorker:f.create,saveData:true});
 await assert.rejects(e.ready(),/Data saver/);
 assert.equal(e.state,'unavailable');assert.match(e.error,/Data saver/);assert.equal(f.made.length,0);
 await assert.rejects(e.embedQuery('x'),/Data saver/);assert.equal(f.made.length,0);
 const forced=createEmbedder({createWorker:fakeWorkers().create,saveData:true,force:true,timers:fakeTimers()});
 await forced.ready();assert.equal(forced.state,'ready');forced.terminate();
});

test('the saveData default comes from navigator.connection when it is not given',async()=>{
 const had=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 Object.defineProperty(globalThis,'navigator',{value:{connection:{saveData:true}},configurable:true});
 try{
  const f=fakeWorkers();const e=createEmbedder({createWorker:f.create});
  await assert.rejects(e.ready(),/Data saver/);assert.equal(f.made.length,0);
 }finally{
  if(had)Object.defineProperty(globalThis,'navigator',had);else delete globalThis.navigator;
 }
});

test('terminate() stops a worker that is still loading and the caller hears why; the next use starts again',async()=>{
 const f=fakeWorkers({delay:20});
 const e=createEmbedder({createWorker:f.create,saveData:false,timers:fakeTimers()});
 const loading=e.ready();
 e.terminate();
 await assert.rejects(loading,/stopped/);
 assert.equal(e.state,'idle');assert.equal(f.made[0].terminated,true);
 await e.ready();assert.equal(e.state,'ready');assert.equal(f.made.length,2);
 e.terminate();
});

test('a listener that throws does not break the embedder, and onState returns an unsubscribe',async()=>{
 const f=fakeWorkers();const e=createEmbedder({createWorker:f.create,saveData:false,timers:fakeTimers()});
 const seen=[];
 e.onState(()=>{throw new Error('listener bug');});
 const off=e.onState(s=>seen.push(s));
 await e.ready();off();e.terminate();
 assert.deepEqual(seen,['loading','ready']);
 await settle();
});
