import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppStorage,memoryStorage,createAndMigrate,removePlaintext,plaintextRemains,restorePlaintext,VAULT_MARKER,bootVault,resetBootForTests,claimWriter} from '../chat/vault/vault-store.mjs';
import {createVault} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';
import {KEY_CLASSES,isVaulted,classOf} from '../chat/vault/key-classes.mjs';
import {readFile} from 'node:fs/promises';

const FAST=1000,MARK='PLAINTEXT-MARKER-77';
const threads=n=>Array.from({length:n},(_,i)=>({id:'t'+i,title:'Chat '+i,messages:[{role:'user',content:i===0?MARK:'hi '+i},{role:'assistant',content:'hello '+i}]}));
const setup=async(initial={})=>{
  const realLocal=memoryStorage(initial.local),realSession=memoryStorage(initial.session),adapter=createMemoryAdapter();
  const errors=[];
  const s=createAppStorage({realLocal,realSession,onWriteError:e=>errors.push(e)});
  const vault=createVault({adapter});
  return {realLocal,realSession,adapter,s,vault,errors};
};
const attachNew=async(ctx)=>{const session=await ctx.vault.create('pw',{iterations:FAST});ctx.s.attach(session);return session;};

test('with the vault off, the app storage is the browser storage',async()=>{
  const {s,realLocal}=await setup();
  s.local.setItem('chatThreads','[{"id":"a"}]');s.local.setItem('plc.prefs.v1','{}');
  assert.equal(realLocal.getItem('chatThreads'),'[{"id":"a"}]');assert.equal(s.local.getItem('plc.prefs.v1'),'{}');
  assert.equal(s.active,false);
});

test('with the vault on, vaulted keys go to the vault and never to the browser storage; plain keys stay plain',async()=>{
  const ctx=await setup();const {s,realLocal,realSession,adapter}=ctx;await attachNew(ctx);
  s.local.setItem('plc.prefs.v1','{"enterSends":true}');
  s.session.setItem('chatConfig','{"endpoint":"https://x","token":"'+MARK+'"}');
  s.local.setItem('chatThreads',JSON.stringify(threads(3)));
  s.local.setItem('plc.shell.collapsed','1'); // plain
  await s.flush();
  assert.equal(realLocal.getItem('plc.prefs.v1'),null);assert.equal(realLocal.getItem('chatThreads'),null);assert.equal(realSession.getItem('chatConfig'),null);
  assert.equal(realLocal.getItem('plc.shell.collapsed'),'1');
  assert.equal(s.local.getItem('plc.prefs.v1'),'{"enterSends":true}');
  assert.equal(JSON.parse(s.local.getItem('chatThreads')).length,3);
  assert.ok(!JSON.stringify(adapter.raw()).includes(MARK),'nothing readable in the vault storage');
  // a fresh start reads it all back
  const again=createAppStorage({realLocal,realSession});
  again.attach(await ctx.vault.unlock('pw'));
  assert.equal(JSON.parse(again.local.getItem('chatThreads'))[0].messages[0].content,MARK);
  assert.equal(again.session.getItem('chatConfig').includes(MARK),true);
});

test('chat list order and each chat are stored separately; an unchanged chat is not written again',async()=>{
  const ctx=await setup();const {s}=ctx;const session=await attachNew(ctx);
  const list=threads(50);s.local.setItem('chatThreads',JSON.stringify(list));await s.flush();
  const before=session.lastSeq;
  list[7].messages.push({role:'user',content:'one more'});
  s.local.setItem('chatThreads',JSON.stringify(list));await s.flush();
  // one chat changed: one thread record (plus its key only the first time), not fifty
  assert.equal(session.lastSeq-before,1);
  list.splice(3,1);s.local.setItem('chatThreads',JSON.stringify(list));await s.flush();
  assert.ok(!session.state.threads.has('t3'),'a deleted chat is gone from the vault');
  assert.ok(!session.state.keys.has('c:t3'),'and its key is destroyed');
  assert.deepEqual(JSON.parse(s.local.getItem('chatThreads')).map(t=>t.id),list.map(t=>t.id),'order is kept');
});

test('writes are coalesced: a burst of saves of one key stores far fewer records, and the last value wins',async()=>{
  const ctx=await setup();const {s}=ctx;const session=await attachNew(ctx);
  for(let i=0;i<200;i++)s.local.setItem('plc.drafts.v1',JSON.stringify({t1:'draft '+i}));
  await s.flush();
  assert.ok(session.lastSeq<40,'records written: '+session.lastSeq);
  const again=createAppStorage({realLocal:memoryStorage(),realSession:memoryStorage()});again.attach(await ctx.vault.unlock('pw'));
  assert.equal(again.local.getItem('plc.drafts.v1'),JSON.stringify({t1:'draft 199'}));
});

test('a failed write is reported, and the next one still goes through',async()=>{
  const ctx=await setup();const {s,adapter,errors}=ctx;await attachNew(ctx);
  const realAppend=adapter.append;let fail=true;
  adapter.append=async r=>{if(fail){fail=false;throw new Error('disk full');}return realAppend.call(adapter,r);};
  s.local.setItem('plc.prefs.v1','{"a":1}');await s.flush();
  assert.equal(errors.length,1);assert.match(String(errors[0].message),/disk full/);
  s.local.setItem('plc.prefs.v1','{"a":2}');await s.flush();
  assert.equal(s.stats.failures,1);
  const again=createAppStorage({realLocal:memoryStorage(),realSession:memoryStorage()});again.attach(await ctx.vault.unlock('pw'));
  assert.equal(again.local.getItem('plc.prefs.v1'),'{"a":2}');
});

test('"do not remember keys": the API keys are kept for this visit only and never stored',async()=>{
  const ctx=await setup();const {s,adapter}=ctx;const session=await attachNew(ctx);
  s.setRememberKeys(false);
  s.session.setItem('chatEndpointTokens','{"https://api.x":"'+MARK+'"}');await s.flush();
  assert.equal(s.session.getItem('chatEndpointTokens').includes(MARK),true,'still usable now');
  assert.ok(!session.state.kv.has('s/chatEndpointTokens'));
  const again=createAppStorage({realLocal:memoryStorage(),realSession:memoryStorage()});again.attach(await ctx.vault.unlock('pw'));
  assert.equal(again.session.getItem('chatEndpointTokens'),null,'gone at the next visit');
  assert.equal(again.rememberKeys,false,'and the choice is kept');
});

test('migrating: everything is encrypted and read back, the plaintext stays until removed on request',async()=>{
  const plainThreads=JSON.stringify(threads(5));
  const ctx=await setup({local:{chatThreads:plainThreads,'plc.prefs.v1':'{"p":1}','plc.shell.collapsed':'1','plc.lock.v1':'{"x":1}'},session:{chatConfig:'{"endpoint":"e"}'}});
  const docs=[{id:'d1',name:'a.txt',text:MARK}];
  const {session}=await createAndMigrate({passphrase:'pw',adapter:ctx.adapter,realLocal:ctx.realLocal,realSession:ctx.realSession,documents:docs,iterations:FAST});
  ctx.s.attach(session);
  assert.equal(ctx.s.local.getItem('chatThreads'),plainThreads,'the app sees the same text');
  assert.ok(ctx.realLocal.getItem(VAULT_MARKER));
  assert.ok(plaintextRemains(ctx.realLocal,ctx.realSession).includes('chatThreads'),'the plaintext copy is still there');
  assert.equal(session.state.docs.get('d1').text,MARK);
  const removed=removePlaintext(ctx.realLocal,ctx.realSession);
  assert.ok(removed.includes('chatThreads')&&removed.includes('chatConfig'));
  assert.deepEqual(plaintextRemains(ctx.realLocal,ctx.realSession),[]);
  assert.equal(ctx.realLocal.getItem('plc.shell.collapsed'),'1','plain keys are not touched');
  assert.equal(ctx.realLocal.getItem('plc.lock.v1'),null,'the old screen lock is replaced by the vault');
  assert.ok(!JSON.stringify(ctx.adapter.raw()).includes(MARK));
});

test('migrating fails safely: if the read-back does not match, nothing is switched on and the vault is removed',async()=>{
  const ctx=await setup({local:{chatThreads:JSON.stringify(threads(2))}});
  const realAppend=ctx.adapter.append;
  ctx.adapter.append=async r=>{await realAppend.call(ctx.adapter,{...r,data:r.keyId==='dek'?r.data:Buffer.from('garbage').toString('base64')});};
  await assert.rejects(()=>createAndMigrate({passphrase:'pw',adapter:ctx.adapter,realLocal:ctx.realLocal,realSession:ctx.realSession,iterations:FAST}));
  assert.equal(ctx.realLocal.getItem(VAULT_MARKER),null);
  assert.equal(await ctx.adapter.readHeader(),null);
  assert.ok(ctx.realLocal.getItem('chatThreads'),'the plaintext is untouched');
});

test('turning the vault off writes everything back as plain storage holds it',async()=>{
  const ctx=await setup();const {s}=ctx;await attachNew(ctx);
  s.local.setItem('chatThreads',JSON.stringify(threads(4)));s.local.setItem('plc.prefs.v1','{"z":1}');s.session.setItem('chatConfig','{"c":1}');await s.flush();
  const snap=s.snapshot();
  const rl=memoryStorage(),rs=memoryStorage();restorePlaintext(snap,rl,rs);
  assert.equal(JSON.parse(rl.getItem('chatThreads')).length,4);assert.equal(rl.getItem('plc.prefs.v1'),'{"z":1}');assert.equal(rs.getItem('chatConfig'),'{"c":1}');
});

test('boot: no marker means no vault; a marker asks the unlock screen; a marker without a vault is cleaned up',async()=>{
  resetBootForTests();
  const none=await bootVault({adapter:createMemoryAdapter(),realLocal:memoryStorage(),ui:{unlock:async()=>{throw new Error('should not be asked');}}});
  assert.equal(none.vault,false);
  resetBootForTests();
  const rl=memoryStorage({[VAULT_MARKER]:'1'});
  const orphan=await bootVault({adapter:createMemoryAdapter(),realLocal:rl,ui:{unlock:async()=>{throw new Error('no');}}});
  assert.equal(orphan.vault,false);assert.equal(rl.getItem(VAULT_MARKER),null);
  resetBootForTests();
  const adapter=createMemoryAdapter();await createVault({adapter}).create('pw',{iterations:FAST});
  let asked=0;
  const res=await bootVault({adapter,realLocal:memoryStorage({[VAULT_MARKER]:'1'}),ui:{unlock:async({vault})=>{asked++;return vault.unlock('pw');}}});
  assert.equal(res.vault,true);assert.equal(asked,1);
  resetBootForTests();
});

test('the key table matches the inventory file, key for key',async()=>{
  const inv=JSON.parse(await readFile(new URL('../docs/evidence/encryption/storage-inventory.json',import.meta.url),'utf8'));
  const fromInv=Object.fromEntries(inv.keys.map(k=>[k.key,{store:k.store==='localStorage'?'local':'session',class:k.class,format:k.format}]));
  assert.deepEqual(KEY_CLASSES,fromInv);
  assert.equal(isVaulted('chatThreads'),true);assert.equal(isVaulted('plc.shell.collapsed'),false);assert.equal(classOf('nope'),'unknown');
});

// ---- two tabs (phase 4.1) ------------------------------------------------------------------------------------------------------------------------------------------------
// A stand-in for navigator.locks: one holder per name; a held lock is released only by release(name) (a tab closing), and `ifAvailable` answers null when it is taken.
function fakeLocks(){
  const held=new Set(),waiting=[];
  return {
    request(name,opts,cb){
      if(typeof opts==='function'){cb=opts;opts={};}
      if(!held.has(name)){held.add(name);return Promise.resolve(cb({name}));}
      if(opts.ifAvailable)return Promise.resolve(cb(null));
      return new Promise(resolve=>waiting.push(()=>{held.add(name);resolve(cb({name}));}));
    },
    release(name){held.delete(name);waiting.shift()?.();}
  };
}
test('the first tab is the writer, a second one is read-only until the first goes away',async()=>{
  const locks=fakeLocks();
  const first=await claimWriter({locks}),second=await claimWriter({locks});
  assert.equal(first.writer,true);assert.equal(second.writer,false);
  let freed=false;second.waitUntilFree().then(()=>{freed=true;});
  await new Promise(r=>setImmediate(r));assert.equal(freed,false);
  locks.release('plc-vault-writer');await new Promise(r=>setImmediate(r));
  assert.equal(freed,true,'the second tab is told when the writer closes');
});

test('without Web Locks the vault is still usable (the store refuses a second writer anyway)',async()=>{
  const r=await claimWriter({locks:undefined});
  assert.equal(r.writer,true);assert.equal(r.supported,false);
});

test('a read-only tab reads, keeps changes on screen only, says so once, and cannot write documents',async()=>{
  const ctx=await setup();const events=[];
  const s=createAppStorage({realLocal:ctx.realLocal,realSession:ctx.realSession,onReadOnly:()=>events.push('readonly')});
  const session=await ctx.vault.create('pw',{iterations:FAST});await session.setKv('l/plc.prefs.v1','{"a":1}');
  s.attach(session,{writer:false});
  assert.equal(s.readOnly,true);assert.equal(s.local.getItem('plc.prefs.v1'),'{"a":1}');
  const before=session.lastSeq;
  s.local.setItem('plc.prefs.v1','{"a":2}');s.local.setItem('plc.drafts.v1','{}');await s.flush();
  assert.equal(session.lastSeq,before,'nothing was stored');
  assert.equal(s.local.getItem('plc.prefs.v1'),'{"a":2}','the change stays on screen');
  assert.deepEqual(events,['readonly'],'and the person is told, once');
  await assert.rejects(()=>s.docsBackend.put({id:'d'}),e=>e.code==='read-only');
});

test('the writer tells the other tabs when it stored something',async()=>{
  const ctx=await setup();const posted=[];
  const channel={postMessage:m=>posted.push(m),onmessage:null};
  const s=createAppStorage({realLocal:ctx.realLocal,realSession:ctx.realSession,channel});
  s.attach(await ctx.vault.create('pw',{iterations:FAST}),{writer:true});
  s.local.setItem('plc.prefs.v1','{"a":1}');await s.flush();
  assert.ok(posted.length>=1&&posted.at(-1).seq>0);
  // a reader hears it
  const heard=[];const reader=createAppStorage({realLocal:memoryStorage(),realSession:memoryStorage(),onRemote:m=>heard.push(m),channel});
  reader.attach(await ctx.vault.unlock('pw'),{writer:false});
  channel.onmessage({data:{seq:9}});
  assert.deepEqual(heard,[{seq:9}]);
});

test('transient and setting keys are vaulted too, and the plain ones are not',()=>{
  for(const k of ['plc.draft','plc.pendingToken.v1','plc.prefs.v1','plc.voice.v2'])assert.equal(isVaulted(k),true,k);
  for(const k of ['plc.shell.collapsed','plc.lock.v1','plc.vault.v1','plc.update.tried'])assert.equal(isVaulted(k),false,k);
});

test('"do not remember keys" also keeps the current key out of the stored provider settings',async()=>{
  const ctx=await setup();const {s}=ctx;const session=await attachNew(ctx);
  s.session.setItem('chatConfig','{"endpoint":"https://x","token":"'+MARK+'","model":"m"}');await s.flush();
  assert.ok(session.state.kv.get('s/chatConfig').includes(MARK),'remembered by default');
  s.setRememberKeys(false);await s.flush();
  assert.ok(!session.state.kv.get('s/chatConfig').includes(MARK),'blanked once keys are not remembered');
  assert.ok(session.state.kv.get('s/chatConfig').includes('"endpoint":"https://x"'),'the rest of the settings stay');
  assert.ok(s.session.getItem('chatConfig').includes(MARK),'this visit still has it');
  s.session.setItem('chatConfig','{"endpoint":"https://x","token":"'+MARK+'2","model":"m"}');await s.flush();
  assert.ok(!session.state.kv.get('s/chatConfig').includes(MARK),'a later save is blanked too');
});
