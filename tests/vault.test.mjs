import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault,VaultError,pad,unpad,emptyState,applyEvent,eventsFor,chatKeyId} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';

const FAST=1000; // iterations: the minimum the vault accepts; the real number is only measured on devices
const make=()=>{const adapter=createMemoryAdapter();return {adapter,vault:createVault({adapter})};};
const thread=(id,text='hello')=>({id,title:'T '+id,messages:[{role:'user',content:text}]});
const MARK='SECRET-MARKER-9f2c';

test('padding rounds up to a bucket and unpads exactly',()=>{
  for(const n of [0,1,5,1019,1020,1021,5000]){const b=new Uint8Array(n).map((_,i)=>i%251);const p=pad(b,1024);assert.equal(p.length%1024,0);assert.deepEqual([...unpad(p)],[...b]);}
  assert.throws(()=>unpad(new Uint8Array([0,0,9,9,1])),VaultError);
});

test('create, write, lock, unlock: the state comes back',async()=>{
  const {vault}=make();
  const a=await vault.create('pass one',{iterations:FAST});
  await a.setKv('plc.prefs.v1','{"enterSends":true}');
  await a.putThread('t1',thread('t1',MARK));
  await a.putDoc('d1',{id:'d1',name:'notes.txt',text:'doc text'});
  a.lock();
  const b=await vault.unlock('pass one');
  assert.equal(b.state.kv.get('plc.prefs.v1'),'{"enterSends":true}');
  assert.equal(b.state.threads.get('t1').messages[0].content,MARK);
  assert.equal(b.state.docs.get('d1').name,'notes.txt');
  assert.deepEqual(b.damaged,[]);
});

test('a wrong passphrase fails; NFKC-equivalent passphrases agree',async()=>{
  const {vault}=make();
  await vault.create('é-pass',{iterations:FAST}); // é as a single code point
  await assert.rejects(()=>vault.unlock('nope'),e=>e.code==='bad-passphrase');
  const ok=await vault.unlock('é-pass'); // e + combining acute
  assert.ok(ok);
  await assert.rejects(()=>vault.create('again'),e=>e.code==='exists');
});

test('nothing readable is stored: no marker in the header or the log',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  await s.putThread('t1',thread('t1',MARK));await s.setKv('k',MARK);await s.putDoc('d',{id:'d',text:MARK});
  assert.ok(!JSON.stringify(adapter.raw()).includes(MARK));
  assert.ok(!JSON.stringify(adapter.raw()).includes('hello'));
});

test('records are padded: a short and a slightly longer message look the same size',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  await s.putThread('a',thread('a','hi'));await s.putThread('b',thread('b','hi there, a bit longer than that'));
  const sizes=adapter.raw().log.filter(r=>r.keyId.startsWith('c:')).map(r=>r.data.length);
  assert.equal(sizes[0],sizes[1]);
});

test('tamper detection: a changed byte, a swapped keyId, a record moved to another seq all fail and are reported',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  await s.putThread('t1',thread('t1','one'));await s.putThread('t2',thread('t2','two'));await s.setKv('a','b');
  const log=adapter.raw().log;
  const t1=log.find(r=>r.keyId==='c:t1'),t2=log.find(r=>r.keyId==='c:t2'),kv=log.filter(r=>r.keyId==='dek').at(-1);
  // 1) flip a byte of t1's ciphertext
  adapter.tamper((rs,put)=>{const r=rs.find(x=>x.seq===t1.seq);const raw=Buffer.from(r.data,'base64');raw[3]^=1;put({...r,data:raw.toString('base64')});});
  // 2) give t2's record t1's key id
  adapter.tamper((rs,put)=>{const r=rs.find(x=>x.seq===t2.seq);put({...r,keyId:'c:t1'});});
  // 3) move the kv record to a new seq
  adapter.tamper((rs,put,del)=>{const r=rs.find(x=>x.seq===kv.seq);del(r.seq);put({...r,seq:r.seq+10});});
  const b=await vault.unlock('p');
  assert.ok(!b.state.threads.has('t1')&&!b.state.threads.has('t2'),'tampered chats are not shown');
  assert.equal(b.state.kv.get('a'),undefined,'a moved record is not accepted');
  const reasons=b.damaged.map(d=>d.reason);
  assert.ok(reasons.includes('unreadable')&&reasons.includes('missing'),'reported: '+JSON.stringify(b.damaged));
});

test('a replayed old record at its own place is accepted, but not at another',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  await s.setKv('k','1');const old=adapter.raw().log.find(r=>r.seq===1);
  await s.setKv('k','2');
  adapter.tamper((rs,put,del)=>{put({...old,seq:5});}); // replay the first write at a later position
  const b=await vault.unlock('p');
  assert.equal(b.state.kv.get('k'),'2');
  assert.ok(b.damaged.some(d=>d.seq===5));
});

test('change passphrase: only the header changes, old passphrase stops working, data is the same',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('old',{iterations:FAST});
  await s.putThread('t',thread('t'));
  const logBefore=JSON.stringify(adapter.raw().log);
  await assert.rejects(()=>s.changePassphrase('wrong','new',{iterations:FAST}),e=>e.code==='bad-passphrase');
  await s.changePassphrase('old','new',{iterations:FAST});
  assert.equal(JSON.stringify(adapter.raw().log),logBefore,'no record was re-encrypted');
  await assert.rejects(()=>vault.unlock('old'),e=>e.code==='bad-passphrase');
  assert.ok((await vault.unlock('new')).state.threads.has('t'));
});

test('deleting a chat destroys its key: the old records become unreadable even if their bytes remain',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  await s.putThread('keep',thread('keep','kept'));await s.putThread('gone',thread('gone',MARK));
  const goneRecords=adapter.raw().log.filter(r=>r.keyId==='c:gone');
  await s.delThread('gone');
  // the key is gone from the live state and, once the key record is dropped, from storage
  assert.ok(!s.state.keys.has(chatKeyId('gone')));
  await s.compact();
  const raw=adapter.raw();
  assert.ok(!raw.log.some(r=>r.keyId==='c:gone'),'its records are removed by compaction');
  // simulate a flash copy of the old chat records surviving: put them back; the key no longer exists anywhere
  adapter.tamper((rs,put)=>goneRecords.forEach(r=>put({...r,seq:r.seq+1000})));
  const b=await vault.unlock('p');
  assert.ok(b.state.threads.has('keep')&&!b.state.threads.has('gone'));
  assert.ok(b.destroyedRecords>=1,'the leftover records are known to be unreadable');
});

test('compaction keeps exactly the live state and removes superseded writes',async()=>{
  const {vault,adapter}=make();
  const s=await vault.create('p',{iterations:FAST});
  for(let i=0;i<20;i++)await s.putThread('t',thread('t','version '+i));
  await s.setKv('a','1');await s.setKv('a','2');await s.putDoc('d',{id:'d',text:'x'});await s.delDoc('d');
  const before=adapter.raw().log.length;
  const r=await s.compact();
  const after=adapter.raw().log.length;
  assert.ok(after<before/2,`log shrank from ${before} to ${after}`);
  assert.equal(r.records,after);
  await s.setKv('b','3'); // writing continues with the next seq
  const b=await vault.unlock('p');
  assert.equal(b.state.threads.get('t').messages[0].content,'version 19');
  assert.equal(b.state.kv.get('a'),'2');assert.equal(b.state.kv.get('b'),'3');
  assert.ok(!b.state.docs.has('d'));assert.deepEqual(b.damaged,[]);
});

test('writes are ordered and a locked session refuses to write',async()=>{
  const {vault}=make();
  const s=await vault.create('p',{iterations:FAST});
  await Promise.all(Array.from({length:30},(_,i)=>s.setKv('k','v'+i)));
  assert.equal(s.state.kv.get('k'),'v29');
  const b=await vault.unlock('p');assert.equal(b.state.kv.get('k'),'v29');
  s.lock();
  await assert.rejects(()=>s.setKv('x','y'),e=>e.code==='locked');
  assert.equal(s.state.kv.size,0,'locking drops the data from memory');
});

test('two writers: the second write of the same seq is refused',async()=>{
  const {vault,adapter}=make();
  const a=await vault.create('p',{iterations:FAST});
  const b=await vault.unlock('p');
  await a.setKv('x','1');
  await assert.rejects(()=>b.setKv('y','2'),e=>e.code==='conflict');
});

test('the reducer: events replay to the state, and eventsFor rebuilds it',()=>{
  const st=emptyState();
  applyEvent(st,{t:'kv.set',k:'a',v:'1'});applyEvent(st,{t:'thread.put',id:'1',thread:thread('1')});applyEvent(st,{t:'future.event',x:1});
  applyEvent(st,{t:'kv.del',k:'zzz'});
  assert.equal(st.kv.get('a'),'1');assert.ok(st.threads.has('1'));
  const again=emptyState();for(const {event} of eventsFor(st))applyEvent(again,event);
  assert.deepEqual([...again.kv],[...st.kv]);assert.deepEqual([...again.threads],[...st.threads]);
});

test('a damaged header is refused with a clear error',async()=>{
  const {vault,adapter}=make();
  await vault.create('p',{iterations:FAST});
  const h=await adapter.readHeader();h.wraps[0].iterations=5;await adapter.writeHeader(h);
  await assert.rejects(()=>vault.unlock('p'),e=>e.code==='damaged');
  h.format='plc-vault/9';await adapter.writeHeader(h);
  await assert.rejects(()=>vault.unlock('p'),e=>e.code==='format');
});
