import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dev-tools/receiver-worker.js';
import {RemoteControl} from '../dev-tools/remote-control.mjs';
const host='https://dev.privatelocal.chat',commit='a'.repeat(40);
function rig(){
 const id=crypto.randomUUID(),map=new Map([['control/'+id+'.json',JSON.stringify({remoteControl:true,captureContent:true})]]);
 const env={DEBUG_READ_TOKEN:'admin',ASSETS:{fetch:async()=>new Response('asset')},DEBUG_LOGS:{async get(k){return map.has(k)?{json:async()=>JSON.parse(map.get(k))}:null;},async put(k,v,opt){if(opt?.onlyIf&&map.has(k))return null;map.set(k,v);return {};},async delete(k){map.delete(k);},async list({prefix,limit=100}){return {objects:[...map.keys()].filter(k=>k.startsWith(prefix)).sort().slice(0,limit).map(key=>({key}))};}}};
 const admin=(path='',body)=>worker.fetch(new Request(host+'/api/debug/admin/sessions/'+id+'/commands'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer admin'},...(body?{body:JSON.stringify(body)}:{})}),env);
 const fetchImpl=async(url,opt={})=>worker.fetch(new Request(url,{...opt,headers:{Origin:host,...opt.headers}}),env);
 return {id,map,env,admin,fetchImpl};
}
test('commands require admin auth, reject arbitrary execution, deduplicate delivery, and atomically bind one page',async()=>{
 const r=rig(),cmd={id:crypto.randomUUID(),action:'prompt',args:{text:'Reply hello.'},expectedCommit:commit};
 assert.equal((await worker.fetch(new Request(host+'/api/debug/admin/sessions/'+r.id+'/commands',{method:'POST',body:JSON.stringify(cmd)}),r.env)).status,401);
 assert.equal((await r.admin('',{...cmd,action:'eval'})).status,400);assert.equal((await r.admin('',cmd)).status,202);assert.equal((await r.admin('',cmd)).status,202);
 assert.equal([...r.map.keys()].filter(k=>k.includes('/pending/')).length,1);
 const pageId=crypto.randomUUID(),installationId=crypto.randomUUID(),ack=(page,status='claimed')=>r.fetchImpl(host+'/api/debug/'+r.id+'/commands/'+cmd.id,{method:'POST',body:JSON.stringify({status,pageId:page,installationId})});
 assert.equal((await ack(pageId)).status,202);assert.equal((await ack(pageId)).status,202);assert.equal((await ack(crypto.randomUUID())).status,409);assert.equal((await ack(pageId,'completed')).status,202);
 assert.equal((await r.admin('',cmd)).status,202);assert.equal([...r.map.keys()].filter(k=>k.includes('/pending/')).length,0);
});
test('remote command execution survives duplicate polls, records complete results, and rejects wrong builds',async()=>{
 const r=rig(),values=new Map(),settings={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};let executions=0;
 const telemetry={page:crypto.randomUUID(),config:{url:host+'/api/debug/'+r.id,enabled:true,captureContent:true,remoteControl:true},recordObject:async()=>({payloadId:crypto.randomUUID()}),configure(c){Object.assign(this.config,c);}};
 const c=new RemoteControl({telemetry,settings,locks:null,fetchImpl:r.fetchImpl,buildId:commit,execute:async()=>{executions++;return {text:'hello'};}});c.prepare(false);
 const cmd={id:crypto.randomUUID(),action:'prompt',args:{text:'Hello'},expectedCommit:commit};await r.admin('',cmd);const issued=await(await r.admin('/'+cmd.id)).json();
 await c.run(issued.command);await c.run(issued.command);await c.tick();assert.equal(executions,1);assert.equal(c.ledger[cmd.id].status,'completed');
 const wrong={...cmd,id:crypto.randomUUID(),expectedCommit:'b'.repeat(40)};await r.admin('',wrong);await c.run((await(await r.admin('/'+wrong.id)).json()).command);assert.equal(executions,1);assert.equal(c.ledger[wrong.id].code,'build-mismatch');
});
test('a recovered claim is reported interrupted and never automatically executed again',async()=>{
 const r=rig(),v=new Map(),settings={getItem:k=>v.get(k),setItem:(k,s)=>v.set(k,s)},page=crypto.randomUUID();let executions=0;
 const t={page,config:{url:host+'/api/debug/'+r.id,enabled:true,captureContent:true,remoteControl:true},recordObject:async()=>{},configure(c){Object.assign(this.config,c);}};
 const first=new RemoteControl({telemetry:t,settings,locks:null,fetchImpl:r.fetchImpl,buildId:commit,execute:async()=>{executions++;}});first.prepare(false);
 const cmd={id:crypto.randomUUID(),action:'prompt',args:{text:'x'},expectedCommit:commit};await r.admin('',cmd);first.ledger[cmd.id]={status:'claimed',pageId:page,action:'prompt'};first.persist();await first.ack(cmd.id,{status:'claimed'});
 const restored=new RemoteControl({telemetry:{...t,page:crypto.randomUUID()},settings,locks:null,fetchImpl:r.fetchImpl,buildId:commit,execute:async()=>{executions++;}});restored.prepare(true);await restored.tick();assert.equal(executions,0);assert.equal(restored.ledger[cmd.id].status,'interrupted');
 const state=await(await r.admin('/'+cmd.id)).json();assert.ok(state.receipts.some(r=>r.status==='interrupted'));
});
test('stop is delivered while a prompt is running and revocation prevents result upload',async()=>{
 const r=rig(),values=new Map(),settings={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},recorded=[];
 let startedResolve,finish,stops=0;const started=new Promise(r=>startedResolve=r);
 const t={page:crypto.randomUUID(),config:{url:host+'/api/debug/'+r.id,enabled:true,captureContent:true,remoteControl:true},recordObject:async(kind)=>{recorded.push(kind);return {};},configure(c){Object.assign(this.config,c);}};
 const c=new RemoteControl({telemetry:t,settings,locks:null,fetchImpl:r.fetchImpl,buildId:commit,execute:async action=>{if(action==='prompt'){startedResolve();return new Promise(r=>finish=r);}if(action==='stop'){stops++;finish({stopped:true});return {stopped:true};}}});c.prepare(false);
 const cmd={id:crypto.randomUUID(),action:'prompt',args:{text:'Long prompt'},expectedCommit:commit};await r.admin('',cmd);const issued=(await(await r.admin('/'+cmd.id)).json()).command;
 c.active=c.run(issued);await started;
 const stop={id:crypto.randomUUID(),action:'stop',args:{},expectedCommit:commit};await r.admin('',stop);await c.tick();await c.active;assert.equal(stops,1);assert.equal(c.ledger[stop.id].status,'completed');
 // A second active request is revoked locally; only a stop is allowed afterward.
 let began;const secondStarted=new Promise(r=>began=r);c.execute=async action=>{if(action==='prompt'){began();return new Promise(r=>finish=r);}if(action==='stop'){stops++;finish({stopped:true});return {};}};
 const next={...cmd,id:crypto.randomUUID()};await r.admin('',next);const task=c.run((await(await r.admin('/'+next.id)).json()).command);await secondStarted;const before=recorded.filter(k=>k==='remote-result').length;t.config.enabled=false;t.config.url='';await c.tick();await task;assert.equal(stops,2);assert.equal(recorded.filter(k=>k==='remote-result').length,before);
});

test('download controls use bounded commands and the same claimed execution path',async()=>{
 const r=rig(),values=new Map(),settings={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},executed=[];
 const telemetry={page:crypto.randomUUID(),config:{url:host+'/api/debug/'+r.id,enabled:true,captureContent:true,remoteControl:true},recordObject:async()=>({payloadId:crypto.randomUUID()}),configure(c){Object.assign(this.config,c);}};
 const c=new RemoteControl({telemetry,settings,locks:null,fetchImpl:r.fetchImpl,buildId:commit,execute:async action=>{executed.push(action);return {recovery:{pending:action==='download'}};}});c.prepare(false);
 for(const action of ['download','cancel-download']){
  const command={id:crypto.randomUUID(),action,args:{},expectedCommit:commit};
  assert.equal((await r.admin('',{...command,args:{url:'https://unexpected.example/model'}})).status,400);
  assert.equal((await r.admin('',command)).status,202);
  const issued=(await(await r.admin('/'+command.id)).json()).command;
  await c.run(issued);await c.run(issued);await c.tick();assert.equal(c.ledger[command.id].status,'completed');
 }
 assert.deepEqual(executed,['download','cancel-download']);
});
