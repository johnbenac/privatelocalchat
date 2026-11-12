import test from 'node:test';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Telemetry,safeData} from '../dev-tools/telemetry-core.mjs';
import {execFileSync} from 'node:child_process';
import {readFile,readdir} from 'node:fs/promises';
class Store{constructor(){this.events=[];}async add(e){this.events.push(e);}async list(n){return this.events.slice(0,n);}async remove(ids){this.events=this.events.filter(e=>!ids.includes(e.id));}async count(){return this.events.length;}async clear(){this.events=[];}}
const settings=()=>{const values=new Map();return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};};
test('diagnostics disabled means no recording and no uploads',async()=>{const store=new Store();let requests=0;const t=new Telemetry({store,settings:settings(),fetchImpl:async()=>requests++});await t.record('generation-start');await t.flush();assert.equal(store.events.length,0);assert.equal(requests,0);});
test('durable events survive a new page and failed upload, and clear only after acknowledgement',async()=>{
 const store=new Store(),config=settings();let online=false;
 const send=async(url,options)=>{if(!online)throw Error('offline');const body=JSON.parse(options.body);return {ok:true,json:async()=>({accepted:body.events.length})};};
 const first=new Telemetry({store,settings:config,fetchImpl:send});first.configure({enabled:true,disk:true,url:'https://receiver.example/session'});await first.record('generation-start',{model:'test-model'});await first.flush();assert.equal(store.events.length,1);
 const reopened=new Telemetry({store,settings:config,fetchImpl:send});assert.equal(reopened.config.enabled,true);online=true;await reopened.flush();assert.equal(store.events.length,0);
});
test('conversation and credential fields are excluded from event data',()=>{assert.deepEqual(safeData({prompt:'secret',reply:'secret',token:'secret',messages:['secret'],model:'public-model',chunks:3,memory:{wasm:123,prompt:'secret'}}),{model:'public-model',chunks:3,memory:{wasm:123}});});
test('production artefact contains no diagnostic UI, modules, receiver or disk journal',async()=>{
 execFileSync('node',['scripts/build.mjs'],{env:{...process.env,DEPLOY_BRANCH:'main'},stdio:'pipe'});
 const sw=await readFile('dist/sw.js','utf8');assert.doesNotMatch(sw,/dev-network-fault|developmentOfflineResponse|FAULT_CACHE/);
 const build=JSON.parse(await readFile('dist/version.json','utf8'));const html=await readFile('dist/index.html','utf8');const app=await readFile('dist/releases/'+build.commit+'/local-models.js','utf8');
 assert.equal(build.developmentRuntime,undefined);assert.ok(!html.includes('compiler-control-20261030'));
 assert.ok(!html.includes('__plcDebugCurrentConversation'));
 assert.ok(!html.includes('__plcDebugControl'));
 assert.ok(!html.includes('dev-tools'));assert.ok(!app.includes('__plcDebugModelHost'));assert.ok(!app.includes('__plcDebugDownloadControl'));assert.ok(!app.includes('plc.diagnostic.generations'));
 const adapter=await readFile('dist/releases/'+build.commit+'/runtime/providers/adapters/wllama.mjs','utf8');assert.ok(!adapter.includes('devDiagnostics'));assert.ok(!adapter.includes('enableFlightRecorder'));assert.ok(!adapter.includes('debugFence'));execFileSync('node',['--check','dist/releases/'+build.commit+'/runtime/providers/adapters/wllama.mjs']);
 assert.ok(!adapter.includes('plcDeviceError'));const client=await readFile('dist/releases/'+build.commit+'/runtime/providers/client.mjs','utf8');assert.ok(!client.includes('native-device-error'));
 assert.ok(!adapter.includes('debugCapture'));const core=await readFile('dist/releases/'+build.commit+'/runtime/providers/host-core.mjs','utf8');assert.ok(!core.includes('debug-object'));execFileSync('node',['--check','dist/releases/'+build.commit+'/runtime/providers/host-core.mjs']);
 const wasm=await readFile('dist/releases/'+build.commit+'/runtime/providers/vendor/wllama/v1q/compat.wasm');const production=JSON.parse(await readFile('ops/native/production-runtime.json','utf8'));assert.equal(createHash('sha256').update(wasm).digest('hex'),production.files['compat.wasm'].sha256);assert.ok(!wasm.includes(Buffer.from('webGpuQueue')));assert.match(await readFile('dist/releases/'+build.commit+'/runtime/providers/catalog.mjs','utf8'),new RegExp(production.buildId));assert.match(await readFile('dist/sw.js','utf8'),/const DEVELOPMENT_NATIVE=false/);
 // test hooks live only between the DEV_DIAGNOSTICS markers, and only files the build strips may carry the markers: any file that still has them would ship its hook
 {const unstripped=[];const walkDir=async d=>{for(const e of await readdir(d,{withFileTypes:true})){const q=d+'/'+e.name;if(e.isDirectory()){if(e.name!=='vendor')await walkDir(q);}else if(/\.(mjs|js|html)$/.test(e.name)&&(await readFile(q,'utf8')).includes('DEV_DIAGNOSTICS_START'))unstripped.push(q);}};await walkDir('dist/releases/'+build.commit);assert.deepEqual(unstripped,[],'these production files still contain development hooks: '+unstripped.join(', '));}
 for(const f of ['LICENSE','THIRD-PARTY-NOTICES.md'])assert.equal(await readFile('dist/'+f,'utf8'),await readFile(f,'utf8'));const files=await readdir('dist');assert.ok(!files.includes('_worker.js'));assert.ok(!files.includes('_routes.json'));assert.ok(!(await readdir('dist/releases/'+build.commit)).includes('dev-tools'));
});
test('development artefact includes isolated diagnostics and exact-host activation',async()=>{
 execFileSync('node',['scripts/build.mjs'],{env:{...process.env,DEPLOY_BRANCH:'dev',SITE_DIR:'tests/fixtures/site'},stdio:'pipe'});
 const build=JSON.parse(await readFile('dist/version.json','utf8'));const start=await readFile('dist/releases/'+build.commit+'/dev-tools/start.js','utf8');
 const native=JSON.parse(await readFile('dev-tools/native-runtime/manifest.json','utf8'));const wasm=await readFile('dist/releases/'+build.commit+'/runtime/providers/vendor/wllama/v1q/compat.wasm');assert.equal(createHash('sha256').update(wasm).digest('hex'),native.files['compat.wasm'].sha256);assert.match(await readFile('dist/releases/'+build.commit+'/runtime/providers/catalog.mjs','utf8'),new RegExp(native.buildId));
 assert.deepEqual(build.developmentRuntime,{nativeBuildId:native.buildId,variant:native.compilerControl.id,wasmSha256:native.files['compat.wasm'].sha256});
 for(const f of ['LICENSE','THIRD-PARTY-NOTICES.md'])assert.equal(await readFile('dist/'+f,'utf8'),await readFile(f,'utf8'));assert.match(start,/location.hostname==='dev.privatelocal.chat'/);assert.match(await readFile('dist/_worker.js','utf8'),/url.hostname!==HOST/);
});

test('a URL enables eager sending, persists across restart, and clearing it stops recording',async()=>{
 const store=new Store(),config=settings();let requests=0;
 const send=async(url,options)=>{requests++;return {ok:true,json:async()=>({accepted:JSON.parse(options.body).events.length})};};
 const first=new Telemetry({store,settings:config,fetchImpl:send});first.configure({url:'https://receiver.example/session',disk:true});
 await first.record('load-start');await new Promise(r=>setTimeout(r,10));assert.equal(requests,1);assert.equal(store.events.length,0);
 const reopened=new Telemetry({store,settings:config,fetchImpl:send});assert.equal(reopened.config.enabled,true);assert.equal(reopened.config.disk,true);
 await reopened.record('page-start');await new Promise(r=>setTimeout(r,10));assert.equal(requests,2);
 reopened.configure({url:''});await reopened.record('heartbeat');assert.equal(store.events.length,0);assert.equal(requests,2);
});
test('reconnection drains every acknowledged batch from a saved backlog',async()=>{
 const store=new Store();for(let i=0;i<125;i++)store.events.push({id:String(i),type:'heartbeat'});
 let batches=0;const t=new Telemetry({store,settings:settings(),fetchImpl:async(url,options)=>{batches++;const body=JSON.parse(options.body);return {ok:true,json:async()=>({accepted:body.events.length})};}});
 t.configure({disk:true,url:'https://receiver.example/session'});await t.flush();assert.equal(store.events.length,0);assert.equal(batches,3);
});

test('native crash journal orders valid records and rejects torn writes',async()=>{
 const {parseCheckpoints,crc32}=await import('../dev-tools/native-journal.mjs');
 const buffer=new ArrayBuffer(256*3),bytes=new Uint8Array(buffer);
 for(let slot=0;slot<3;slot++){
  const v=new DataView(buffer,slot*256,256);v.setUint32(0,0x53504652,true);v.setUint16(4,1,true);v.setUint16(6,256,true);
  v.setUint32(8,[9,7,8][slot],true);v.setUint16(48,7,true);v.setUint16(50,42,true);v.setUint8(52,1);v.setUint32(72,134217728,true);
  v.setUint32(252,crc32(bytes.subarray(slot*256,slot*256+252)),true);
 }
 bytes[256+80]^=1;const records=parseCheckpoints(buffer);assert.deepEqual(records.map(r=>r.sequence),[8,9]);assert.equal(records[0].wasmCapacityBytes,134217728);assert.equal(records[0].operation,42);
 assert.equal(parseCheckpoints(buffer.slice(0,250)).length,0);
});

test('receiver keeps idempotent batches and offers a bounded newest-first stream read',async()=>{
 const worker=(await import('../dev-tools/receiver-worker.js')).default,objects=new Map();
 const env={ASSETS:{fetch:async()=>new Response('asset')},DEBUG_READ_TOKEN:'test-read-token',DEBUG_LOGS:{
  async put(key,value){objects.set(key,value);},async get(key){return objects.has(key)?{json:async()=>JSON.parse(objects.get(key))}:null;},
  async list({prefix,limit,cursor}){const keys=[...objects.keys()].filter(k=>k.startsWith(prefix)).sort();const offset=Number(cursor||0),selected=keys.slice(offset,offset+limit);return {objects:selected.map(key=>({key})),truncated:offset+limit<keys.length,cursor:String(offset+limit)};}
 }};
 const base='https://dev.privatelocal.chat/api/debug/',auth={Authorization:'Bearer test-read-token'};
 const created=await (await worker.fetch(new Request(base+'admin/sessions',{method:'POST',headers:auth}),env)).json();assert.ok(!created.expiresAt);
 const post=async(index)=>{const at=new Date(1700000000000+index*1000).toISOString();const batch={format:'plc-dev-telemetry/1',id:crypto.randomUUID()+'_'+crypto.randomUUID(),events:[{id:crypto.randomUUID(),at,type:'heartbeat',data:{chunks:index}}]};const req=()=>new Request(created.receiver,{method:'POST',headers:{Origin:'https://dev.privatelocal.chat','Content-Type':'application/json'},body:JSON.stringify(batch)});assert.equal((await worker.fetch(req(),env)).status,202);assert.equal((await worker.fetch(req(),env)).status,202);};
 for(let i=0;i<45;i++)await post(i);
 assert.equal(objects.size,46);const result=await (await worker.fetch(new Request(base+'admin/sessions/'+created.id+'?recent=1',{headers:auth}),env)).json();assert.equal(result.events.length,40);assert.equal(result.events[0].data.chunks,5);assert.equal(result.events.at(-1).data.chunks,44);
 assert.equal((await worker.fetch(new Request('https://privatelocalchat-dev.pages.dev/releases/test/runtime/providers/vendor/wllama/v1q/compat.wasm'),env)).status,404);
 assert.equal((await worker.fetch(new Request('https://dev.privatelocal.chat/releases/test/runtime/providers/vendor/wllama/v1q/compat.wasm'),env)).status,200);
 assert.equal((await worker.fetch(new Request('https://privatelocal.chat/api/debug/admin/sessions',{method:'POST',headers:auth}),env)).status,404);
});

test('native journal retries transient storage locks and reports an exhausted lock',async()=>{
 const {readCheckpoints}=await import('../dev-tools/native-journal.mjs');let reads=0;const delays=[];
 const busy=()=>Object.assign(new Error('temporarily locked'),{name:'InvalidStateError'});
 const storage={async getDirectory(){return {async getDirectoryHandle(){return {async getFileHandle(){return {async getFile(){if(++reads<3)throw busy();return {size:0,arrayBuffer:async()=>new ArrayBuffer(0)};}};}};}};}};
 assert.deepEqual(await readCheckpoints({storage,pause:async ms=>delays.push(ms)}),[]);assert.equal(reads,3);assert.deepEqual(delays,[100,200]);
 await assert.rejects(()=>readCheckpoints({storage:{getDirectory:async()=>{throw busy();}},pause:async()=>{},attempts:2}),{name:'InvalidStateError'});
});
