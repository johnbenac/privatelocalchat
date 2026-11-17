import test from 'node:test';
import assert from 'node:assert/strict';
import {createAppStorage,memoryStorage,VAULT_MARKER} from '../chat/vault/vault-store.mjs';
import {createVaultControl} from '../chat/vault/vault-control.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';
import {createVault} from '../chat/vault/vault.mjs';

globalThis.indexedDB??={}; // supported() only asks whether it exists
const FAST=1000,MARK='CTRL-MARKER-31';
const rig=(initial={})=>{
  const realLocal=memoryStorage(initial.local),realSession=memoryStorage(initial.session),adapter=createMemoryAdapter();
  const app=createAppStorage({realLocal,realSession});
  const docsPlain=new Map((initial.docs||[]).map(d=>[d.id,d]));
  const docs={all:async()=>[...docsPlain.values()],put:async d=>{docsPlain.set(d.id,d);}};
  const events=[];let reloaded=0;
  const control=createVaultControl({app,adapter,realLocal,realSession,docs,events:{emit:(n,...a)=>events.push(n)},reload:()=>{reloaded++;},iterations:FAST,dropDocsDb:async()=>{docsPlain.clear();}});
  return {app,realLocal,realSession,adapter,docsPlain,docs,control,events,get reloaded(){return reloaded;}};
};
const chats=JSON.stringify([{id:'a',title:'A',messages:[{role:'user',content:MARK}]}]);

test('enable: encrypts what is there, keeps serving it, leaves the plaintext until asked',async()=>{
  const r=rig({local:{chatThreads:chats,'plc.prefs.v1':'{"x":1}'},session:{chatConfig:'{"endpoint":"e"}'},docs:[{id:'d',name:'n',text:MARK}]});
  const res=await r.control.enable('pw');
  assert.ok(r.control.active);assert.ok(res.remaining.includes('chatThreads'));
  assert.equal(r.app.local.getItem('chatThreads'),chats);
  assert.ok(r.realLocal.getItem(VAULT_MARKER));
  assert.ok(r.events.includes('vault:unlocked'));
  await r.control.removePlaintext();
  assert.deepEqual(r.control.plaintextRemaining(),[]);assert.equal(r.docsPlain.size,0,'the old document database is gone');
  assert.equal(r.app.local.getItem('chatThreads'),chats,'and the app still reads everything');
  await assert.rejects(()=>r.control.enable('again'),e=>e.code==='exists');
});

test('lock now: writes finish, the key is forgotten, the page reloads, and the right passphrase opens it again',async()=>{
  const r=rig({local:{chatThreads:chats}});await r.control.enable('pw');
  r.app.local.setItem('plc.prefs.v1','{"late":true}');
  await r.control.lockNow();
  assert.equal(r.reloaded,1);assert.equal(r.control.active,false);
  assert.ok(r.events.includes('vault:locked'));
  const session=await createVault({adapter:r.adapter}).unlock('pw');
  assert.equal(session.state.kv.get('l/plc.prefs.v1'),'{"late":true}','the last change was stored before locking');
});

test('change passphrase needs the old one; auto-lock minutes live in the plain marker',async()=>{
  const r=rig();await r.control.enable('old');
  await assert.rejects(()=>r.control.changePassphrase('nope','new'),e=>e.code==='bad-passphrase');
  await r.control.changePassphrase('old','new');
  await assert.rejects(()=>createVault({adapter:r.adapter}).unlock('old'));
  assert.ok(await createVault({adapter:r.adapter}).unlock('new'));
  r.control.setAutoMinutes(5);assert.equal(r.control.autoMinutes,5);
});

test('turn off: needs the passphrase, restores plain storage and documents, removes the vault',async()=>{
  const r=rig({local:{chatThreads:chats},docs:[{id:'d',name:'n',text:'t'}]});await r.control.enable('pw');await r.control.removePlaintext();
  r.docsPlain.clear();
  r.app.local.setItem('plc.prefs.v1','{"keep":1}');
  await assert.rejects(()=>r.control.disable('wrong'),e=>e.code==='bad-passphrase');
  assert.ok(r.control.active,'a wrong passphrase leaves it on');
  await r.control.disable('pw');
  assert.equal(r.control.active,false);
  assert.equal(r.realLocal.getItem('chatThreads'),chats);assert.equal(r.realLocal.getItem('plc.prefs.v1'),'{"keep":1}');
  assert.ok(r.docsPlain.has('d'),'documents are back');
  assert.equal(r.realLocal.getItem(VAULT_MARKER),null);assert.equal(await r.adapter.readHeader(),null);
});
