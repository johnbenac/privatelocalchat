import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeObject,decodeObjects,captureProvider} from '../dev-tools/conversation-capture.mjs';
import {Telemetry} from '../dev-tools/telemetry-core.mjs';
import receiver from '../dev-tools/receiver-worker.js';
class Store{constructor(){this.events=[];}async add(e){this.events.push(e);}async list(n){return this.events.slice(0,n);}async remove(ids){this.events=this.events.filter(e=>!ids.includes(e.id));}async count(){return this.events.length;}async clear(){this.events=[];}}
const settings=()=>{const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v)};};
const envelopes=frames=>frames.map(data=>({id:crypto.randomUUID(),page:'test',at:'2026-10-30T00:00:00Z',type:'conversation-object',data}));
test('complete Unicode request objects survive framing, reorder and idempotent retries',async()=>{
 const object={messages:[{role:'system',content:'Use the full requested answer.'},{role:'user',content:'🦉漢字\n"\\'.repeat(1200)}],max_tokens:512,temperature:0};
 const frames=await encodeObject('native-request','req',object,0);assert.ok(frames.length>10);
 const events=envelopes(frames);for(const event of events)assert.ok(new TextEncoder().encode(JSON.stringify(event)).length<2048);
 const [decoded]=await decodeObjects([...events.reverse(),events[0]]);assert.deepEqual(decoded.object,object);assert.deepEqual(decoded.missingParts,[]);
 const [partial]=await decodeObjects(events.slice(1));assert.equal(partial.object,undefined);assert.equal(partial.missingParts.length,1);
 const altered=structuredClone(events);altered[0].data.data='AAAA';await assert.rejects(decodeObjects(altered),/digest mismatch/);
});
test('content-free settings cannot serialize or upload request objects',async()=>{
 const store=new Store(),t=new Telemetry({store,settings:settings(),fetchImpl:async()=>{throw Error('offline');}});t.configure({url:'https://receiver.example/session',disk:true});
 await t.recordObject('provider-request','req',{toJSON(){throw Error('Must not serialize');}});assert.equal(store.events.length,0);
});
test('full objects persist offline across reopening and upload only after consent',async()=>{
 const store=new Store(),config=settings(),sent=[];let online=false;
 const fetchImpl=async(url,opt)=>{if(!online)throw Error('offline');const b=JSON.parse(opt.body);sent.push(...b.events);return {ok:true,json:async()=>({accepted:b.events.length})};};
 const t=new Telemetry({store,settings:config,fetchImpl});t.configure({url:'https://receiver.example/session',disk:true,captureContent:true,contentConsent:'local'});
 const object={messages:[{role:'user',content:'Long exact prompt — '.repeat(3000)}],maxTokens:512};await t.recordObject('provider-request','r',object);await t.flush();assert.ok(store.events.length>50);
 const reopened=new Telemetry({store,settings:config,fetchImpl});assert.equal(reopened.config.captureContent,true);online=true;await reopened.flush({force:true});assert.equal(store.events.length,0);assert.deepEqual((await decodeObjects(sent))[0].object,object);
});
test('receiver consent enables an existing opted-in owner session but cannot override a local opt-out',async()=>{
 let gets=0;const t=new Telemetry({store:new Store(),settings:settings(),fetchImpl:async()=>{gets++;return {ok:true,json:async()=>({format:'plc-dev-policy/1',captureContent:true})};}});
 t.configure({url:'https://receiver.example/session'});assert.equal(t.config.captureContent,false);await t.refreshPolicy();assert.equal(t.config.captureContent,true);assert.equal(t.config.contentConsent,'receiver');
 t.configure({captureContent:false,contentConsent:'local'});await t.refreshPolicy();assert.equal(gets,1);assert.equal(t.config.captureContent,false);
});
test('provider capture preserves native request and raw chunks, terminal usage, and UI streaming without duplicate token payloads',async()=>{
 const recorded=[],visible=[],request={attemptId:'r',messages:[{role:'user',content:'Give the full answer.'}],maxTokens:512};let forwarded;
 const terminal={type:'attempt-completed',text:'Hello world.',usage:{completionTokens:3}};
 const events=[{type:'debug-object',kind:'native-request',object:{messages:request.messages,max_tokens:512,temperature:0,chat_template_kwargs:{enable_thinking:false}}},{type:'debug-object',kind:'native-chunk',object:{choices:[{delta:{content:'Hello '}}]}},{type:'token',text:'Hello '},{type:'debug-object',kind:'native-chunk',object:{choices:[{delta:{content:'world.'}}]}},{type:'token',text:'world.'},terminal];
 const provider={generate(req,opt){forwarded=req;let i=0;for(const e of events)if(e.type==='token')opt.onToken(e);return {done:Promise.resolve(terminal),abort(){},[Symbol.asyncIterator](){return {next:async()=>i<events.length?{value:events[i++],done:false}:{done:true},[Symbol.asyncIterator](){return this;}};}};}};
 captureProvider(provider,{config:{enabled:true,captureContent:true},recordObject:async(kind,id,object)=>{recorded.push({kind,id,object});}});
 const result=await provider.generate(request,{onToken:e=>visible.push(e.text)}).done;
 assert.equal(result,terminal);assert.equal(forwarded.debugCapture,true);assert.equal(recorded[0].object,forwarded);assert.deepEqual(visible,['Hello ','world.']);assert.equal(recorded.filter(r=>r.kind==='native-chunk').length,2);assert.ok(!recorded.some(r=>r.object.type==='token'));assert.equal(recorded.at(-1).object.usage.completionTokens,3);
});
test('receiver policy changes require administrator auth and preserve unrelated session fields',async()=>{
 const id=crypto.randomUUID(),objects=new Map([['control/'+id+'.json',JSON.stringify({id,createdAt:'test'})]]),base='https://dev.privatelocal.chat';
 const env={DEBUG_READ_TOKEN:'admin',DEBUG_LOGS:{async get(k){return objects.has(k)?{json:async()=>JSON.parse(objects.get(k))}:null;},async put(k,v){objects.set(k,v);}},ASSETS:{fetch:async()=>new Response('asset')}};
 const endpoint=base+'/api/debug/admin/sessions/'+id;
 assert.equal((await receiver.fetch(new Request(endpoint,{method:'PATCH',body:'{"captureContent":true}'}),env)).status,401);
 assert.equal((await receiver.fetch(new Request(endpoint,{method:'PATCH',headers:{Authorization:'Bearer admin'},body:'{"captureContent":true}'}),env)).status,200);
 assert.equal(JSON.parse(objects.get('control/'+id+'.json')).createdAt,'test');
 const policy=await(await receiver.fetch(new Request(base+'/api/debug/'+id),env)).json();assert.deepEqual(policy,{format:'plc-dev-policy/1',captureContent:true,remoteControl:false,commands:[]});
 assert.equal((await receiver.fetch(new Request(base+'/api/debug/'+id,{headers:{Origin:'https://elsewhere.example'}}),env)).status,403);
});

test('a stalled browser database cannot block streaming from the memory fallback',async()=>{
 const {DiskJournal}=await import('../dev-tools/telemetry-core.mjs');let opens=0,closed=0;const pending=[];
 const store=new DiskJournal({timeoutMs:10,retryMs:30000,factory:{open(...args){assert.equal(args.length,1);opens++;const req={};pending.push(req);return req;}}});
 let uploaded=0;const values=new Map();const settings={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
 const t=new Telemetry({store,settings,fetchImpl:async(url,opt)=>{uploaded+=JSON.parse(opt.body).events.length;return {ok:true,json:async()=>({accepted:JSON.parse(opt.body).events.length})};}});
 t.configure({url:'https://receiver.example/session',disk:true});await t.record('page-start');await t.flush();while(t.sending)await new Promise(r=>setImmediate(r));assert.equal(uploaded,1);assert.equal(t.memory.length,0);assert.equal(opens,1);
 pending[0].result={close(){closed++;}};pending[0].onsuccess();assert.equal(closed,1);
 await t.record('heartbeat');await t.flush();while(t.sending)await new Promise(r=>setImmediate(r));assert.equal(uploaded,2);assert.equal(opens,1);
});

test('a receiver grant cannot authorize content or controls at a different receiver URL',async()=>{
 const store=new Store(),config=settings();let uploadedContent=0;
 const t=new Telemetry({store,settings:config,fetchImpl:async(url,opt)=>{if(opt.method==='GET')return {ok:true,json:async()=>({format:'plc-dev-policy/1',captureContent:true,remoteControl:true})};const batch=JSON.parse(opt.body);uploadedContent+=batch.events.filter(e=>e.type==='conversation-object').length;return {ok:true,json:async()=>({accepted:batch.events.length})};}});
 t.configure({url:'https://first.example/receiver',disk:true});await t.refreshPolicy();assert.equal(t.config.captureContent,true);assert.equal(t.config.remoteControl,true);
 // A retained offline frame must wait for the next receiver's own content grant.
 store.events.push({id:crypto.randomUUID(),type:'conversation-object',data:{},at:'2026-10-30T00:00:00Z'});
 t.configure({url:'https://second.example/receiver'});assert.equal(t.config.enabled,true);assert.equal(t.config.captureContent,false);assert.equal(t.config.remoteControl,false);assert.equal(t.config.contentConsent,null);await t.flush();assert.equal(uploadedContent,0);assert.equal(store.events.length,1);
 await t.refreshPolicy();await t.flush();assert.equal(uploadedContent,1);assert.equal(store.events.length,0);
 // The tester's explicit local choice remains a remembered choice.
 t.configure({captureContent:true,contentConsent:'local',remoteControl:true,controlConsent:'local'});t.configure({url:'https://third.example/receiver'});assert.equal(t.config.captureContent,true);assert.equal(t.config.remoteControl,true);
});
