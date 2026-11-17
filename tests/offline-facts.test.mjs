import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineFacts} from '../chat/connection/offline-facts.mjs';
import {offlineReadiness} from '../runtime/offline-readiness.mjs';

const state=(install=true,loaded=false)=>({selection:{tier:'light'},tiers:{light:{info:{label:'Light 2B'},install:{ok:install}}},load:{state:loaded?'ready':'idle'}});
const make=o=>createOfflineFacts({models:()=>o.models,app:()=>o.app,voice:()=>o.voice,persisted:async()=>o.persisted,standalone:()=>o.standalone});

test('everything saved reads as facts that make the device ready',async()=>{
  const f=await make({models:{mode:'local',state:state()},app:{checked:true,supported:true,controlled:true,current:true,bulkSaved:8,bulkExpected:8},voice:{selected:'os',voices:[{id:'os',state:'ready'}]},persisted:true}).read();
  assert.deepEqual(f.model,{name:'Light 2B',downloaded:true,loaded:false,bytes:0});assert.deepEqual(f.runtime,{saved:8,expected:8});assert.equal(f.app,'current');assert.deepEqual(f.voice,{system:true});assert.equal(f.persisted,true);
  assert.equal(offlineReadiness(f).summary,'ready');
});

test('a stale worker, a missing runtime and a not-yet-asked worker are told apart',async()=>{
  const base={models:{mode:'local',state:state()},voice:null,persisted:null};
  assert.equal((await make({...base,app:{checked:true,supported:true,controlled:true,current:false,bulkSaved:8,bulkExpected:8}}).read()).app,'stale');
  assert.equal((await make({...base,app:{checked:true,supported:true,controlled:false}}).read()).app,'none');
  assert.equal((await make({...base,app:{checked:true,supported:false}}).read()).app,'unsupported');
  assert.equal((await make({...base,app:{checked:false}}).read()).app,undefined,'unknown until the worker answers');
  assert.equal((await make({...base,app:null}).read()).app,undefined);
  const part=await make({...base,app:{checked:true,supported:true,controlled:true,current:true,bulkSaved:2,bulkExpected:8}}).read();
  assert.deepEqual(part.runtime,{saved:2,expected:8});assert.equal(offlineReadiness(part).summary,'almost');
});

test('a chosen voice that is not downloaded is reported by name',async()=>{
  const f=await make({models:{mode:'local',state:state()},app:null,voice:{selected:'kokoro',voices:[{id:'os',state:'ready'},{id:'kokoro',label:'Kokoro',state:'none'}]},persisted:false}).read();
  assert.deepEqual(f.voice,{name:'Kokoro',system:false,downloaded:false});assert.equal(f.persisted,false);
});

test('a connected provider has no model line and nothing throws when parts are missing',async()=>{
  const f=await make({models:{mode:'api',state:null},app:null,voice:null,persisted:undefined}).read();
  assert.equal(f.mode,'api');assert.equal(f.model,undefined);assert.equal(f.persisted,null);
  assert.equal((await createOfflineFacts({persisted:async()=>{throw new Error('no');}}).read()).persisted,null);
});

test('storage room and the matching model reach the facts, and a model that cannot fit is explained',async()=>{
  const m={mode:'local',state:{selection:{tier:'light'},tiers:{light:{info:{label:'Light 2B',downloadBytes:1.2e9},install:{ok:false,bytesPresent:0}}},load:{state:'idle'}}};
  const f=await createOfflineFacts({models:()=>m,storage:async()=>({quota:1.05e9,usage:4e7}),matching:async()=>false,persisted:async()=>false}).read();
  assert.equal(f.model.bytes,1.2e9);assert.equal(f.storage.free,1.01e9);assert.deepEqual(f.matching,{needed:true,downloaded:false});
  const r=offlineReadiness(f),line=r.items.find(i=>i.id==='model');
  assert.match(line.detail,/needs 1\.2 GB.*only let this site save about 1\.0 GB/);assert.equal(line.fix,null,'no download button for something that will not fit');
  const roomy=offlineReadiness(await createOfflineFacts({models:()=>m,storage:async()=>({quota:80e9,usage:1e9})}).read());
  assert.equal(roomy.items.find(i=>i.id==='model').fix,'download-model');
});
