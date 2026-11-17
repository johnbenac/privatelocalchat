import test from 'node:test';
import assert from 'node:assert/strict';
import {pickTier,isMobileDevice} from '../runtime/auto-tier.mjs';
import {progressOf,createPreparer} from '../runtime/prepare.mjs';
const GPU={webgpu:{available:true,shaderF16:true},deviceMemoryGB:8};
const IPHONE='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',DESK='Mozilla/5.0 (X11; Linux x86_64) Chrome/140.0';
test('phones get the small model, a capable desktop gets the larger one',()=>{
 assert.equal(pickTier({env:GPU,userAgent:IPHONE}).tier,'light');
 assert.equal(pickTier({env:GPU,userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari',maxTouchPoints:5}).tier,'light','an iPad that says it is a Mac');
 assert.equal(pickTier({env:GPU,userAgent:DESK}).tier,'default');
 assert.equal(pickTier({env:{...GPU,deviceMemoryGB:4},userAgent:DESK}).tier,'light');
 assert.equal(pickTier({env:{webgpu:{available:true,shaderF16:true}},userAgent:DESK}).tier,'default','memory unknown (Firefox, Safari)');
 assert.equal(isMobileDevice(DESK,0),false);
});
test('what is installed or chosen wins, and the large model covers a GPU without 16-bit shaders',()=>{
 assert.deepEqual(pickTier({env:GPU,userAgent:DESK,installed:{light:true}}),{tier:'light',reason:'installed'});
 assert.equal(pickTier({env:GPU,userAgent:DESK,selection:{tier:'light',chosenBy:'human'}}).tier,'light');
 assert.equal(pickTier({env:{webgpu:{available:true,shaderF16:false},deviceMemoryGB:8},userAgent:DESK}).tier,'default');
 assert.equal(pickTier({env:{webgpu:{available:true,shaderF16:false}},userAgent:IPHONE}).tier,null,'nothing can run on a phone without 16-bit shaders');
 assert.equal(pickTier({env:{webgpu:{available:false}},userAgent:DESK}).tier,null);
 assert.equal(pickTier({env:{webgpu:{available:true,isFallbackAdapter:true,shaderF16:true}},userAgent:DESK}).tier,null,'a software renderer is not a GPU');
});
const stateOf=(o={})=>({selection:{tier:'light'},tiers:{light:{info:{modelId:'Qwen3.5-2B',downloadBytes:2e9,memory:{steadyBytes:2.3e9}},install:{ok:false}},default:{info:{modelId:'Qwen3.5-9B',downloadBytes:5.6e9},install:{ok:false}}},load:{state:'unloaded'},busy:null,transfer:null,...o});
test('progress describes each stage in plain terms',()=>{
 assert.equal(progressOf(stateOf(),{}).phase,'starting');
 const d=progressOf(stateOf({busy:'install',transfer:{bytesDone:5e8,bytesTotal:2e9,bytesPerSecond:1e7}}),{});
 assert.equal(d.phase,'download');assert.equal(d.fraction,0.25);assert.equal(d.modelName,'Qwen3.5-2B');
 assert.equal(progressOf(stateOf({busy:'load'}),{}).phase,'load');
 assert.equal(progressOf(stateOf(),{phase:'offline'}).phase,'offline');
 assert.equal(progressOf(stateOf(),{phase:'retrying',retryInMs:4000}).retryInMs,4000);
 assert.equal(progressOf(stateOf(),{phase:'retrying',reason:'stalled'}).phase,'stalled');
 assert.equal(progressOf(stateOf({load:{state:'ready'}}),{}).phase,'ready');
});
function rig(initial){
 let s=structuredClone(initial),rec={phase:'idle',pending:false},listeners=new Set();
 const emit=()=>listeners.forEach(f=>f());
 const calls=[];
 const host={getState:()=>s,async selectTier(t){calls.push('select '+t);s.selection.tier=t;},load:async()=>{calls.push('load');s.busy='load';emit();await new Promise(r=>setTimeout(r,5));s.busy=null;s.load={state:'ready'};emit();}};
 const recovery={get state(){return rec;},start(t){calls.push('download '+t);rec={phase:'downloading',pending:true};s.busy='install';s.transfer={bytesDone:0,bytesTotal:2e9};emit();
   setTimeout(()=>{s.transfer={bytesDone:1e9,bytesTotal:2e9};emit();},5);
   setTimeout(()=>{s.busy=null;s.transfer=null;s.tiers[t].install.ok=true;rec={phase:'complete',pending:false};emit();host.load();},15);},cancel(){calls.push('cancel');rec={phase:'cancelled',pending:false};s.busy=null;emit();}};
 const p=createPreparer({host,recovery,getEnv:()=>GPU,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},userAgent:()=>DESK});
 return {p,calls,state:()=>s};
}
test('a first message downloads, loads and then reports ready, with progress along the way',async()=>{
 const {p,calls}=rig(stateOf());const phases=[];
 await p.ensureReady({onProgress:x=>phases.push(x.phase)});
 assert.deepEqual(calls.slice(0,2),['select default','download default'],'a capable desktop gets the larger model');
 assert.ok(calls.includes('load'));
 assert.ok(phases.includes('download')&&phases.at(-1)==='ready',phases.join());
});
test('an already downloaded model is just loaded',async()=>{
 const st=stateOf();st.tiers.light.install.ok=true;
 const {p,calls}=rig(st);await p.ensureReady();
 assert.deepEqual(calls,['load']);
});
test('stopping the wait is an AbortError and nothing is cancelled',async()=>{
 const {p,calls}=rig(stateOf());const c=new AbortController();
 const run=p.ensureReady({signal:c.signal});setTimeout(()=>c.abort(),8);
 await assert.rejects(run,e=>e.name==='AbortError');assert.ok(!calls.includes('cancel'));
});
test('switching to the smaller model mid-download keeps the wait alive',async()=>{
 const {p,calls,state}=rig(stateOf());
 const run=p.ensureReady();
 await new Promise(r=>setTimeout(r,8));await p.switchTier('light');
 await run;assert.ok(calls.includes('cancel')&&calls.includes('download light'));assert.equal(state().selection.tier,'light');
});
test('a browser that cannot run any model says so',async()=>{
 const host={getState:()=>stateOf()};
 const p=createPreparer({host,recovery:{state:{}},getEnv:()=>({webgpu:{available:false}}),subscribe:()=>()=>{}});
 await assert.rejects(p.ensureReady(),e=>e.code==='unsupported');
});

// The real recovery publishes "complete", then loads on its own a moment later. The preparer must leave that load alone.
function raceRig({failFirstLoads=0}={}){
 let s=stateOf({host:{state:'running'}}),rec={phase:'idle',pending:false},listeners=new Set(),loads=0,failures=failFirstLoads;
 const emit=()=>listeners.forEach(f=>f());
 const host={getState:()=>s,async selectTier(t){s.selection.tier=t;},
  async load(){
   loads++;
   if(s.busy)throw Object.assign(new Error('cannot load while '+s.busy),{code:'manager-busy'});
   s.busy='load';emit();await new Promise(r=>setTimeout(r,80));s.busy=null;
   if(failures>0){failures--;s.load={state:'faulted',lastError:{message:'engine failed'}};emit();throw new Error('engine failed');}
   s.load={state:'ready'};emit();},
  restartHost:async()=>{s.host={state:'running'};s.load={state:'unloaded'};}};
 const recovery={get state(){return rec;},cancel(){},
  start(t){rec={phase:'downloading',pending:true};s.busy='install';s.transfer={bytesDone:1e9,bytesTotal:2e9};emit();
   setTimeout(async()=>{s.busy=null;s.transfer=null;s.tiers[t].install.ok=true;rec={phase:'complete',pending:false};emit();
     await new Promise(r=>setTimeout(r,30)); // await beforeLoad() in the real code
     rec={phase:'loading',pending:false};emit();
     try{await host.load();rec={phase:'ready',pending:false};}catch{rec={phase:'load-failed',pending:false};}emit();},10);}};
 const p=createPreparer({host,recovery,getEnv:()=>GPU,subscribe:f=>{listeners.add(f);return()=>listeners.delete(f);},userAgent:()=>DESK});
 return {p,loads:()=>loads};
}
test('finishing a download does not start a second, colliding load',async()=>{
 const {p,loads}=raceRig();
 await p.ensureReady();
 assert.equal(loads(),1,'only the recovery loaded the model');
});
test('a load that fails is retried by the app, not by the person',async()=>{
 const {p,loads}=raceRig({failFirstLoads:1});
 await p.ensureReady();
 assert.ok(loads()>=2,'loaded again after the failure');
});
test('after repeated failures the real reason is reported',async()=>{
 const {p}=raceRig({failFirstLoads:99});
 await assert.rejects(p.ensureReady(),e=>e.code==='load-failed'&&/engine failed/.test(e.message));
});
