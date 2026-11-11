// Stage 1 of the app/site split: a version that finds stored data from a newer version leaves it alone (docs/DATA-COMPATIBILITY.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {REGISTRY_KEY,familyOf,versionOf,supportedFormat,parseRegistry,findNewer,stampedRegistry,describeStore} from '../chat/vault/data-formats.mjs';
import {createAppStorage,memoryStorage,bootVault,resetBootForTests,runFormatGuard,VAULT_MARKER} from '../chat/vault/vault-store.mjs';
import {createVault} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';
import {KEY_CLASSES} from '../chat/vault/key-classes.mjs';
import {guardMessage,showFormatGuard} from '../chat/vault/format-guard-ui.mjs';

const reg=formats=>JSON.stringify({v:1,formats});

test('names and formats: a key named ...vN is version N of a store, and every key has a format', () => {
  assert.equal(familyOf('plc.memory.v1'),'plc.memory');assert.equal(versionOf('plc.memory.v1'),1);
  assert.equal(familyOf('chatThreads'),'chatThreads');assert.equal(versionOf('chatThreads'),null);
  assert.equal(supportedFormat('plc.voice.v2'),2);assert.equal(supportedFormat('chatThreads'),1);assert.equal(supportedFormat('nope'),null);
  for (const [key,info] of Object.entries(KEY_CLASSES)) {
    assert.ok(Number.isInteger(info.format)&&info.format>=1,key);
    if (versionOf(key)!==null) assert.equal(info.format,versionOf(key),key);
  }
  assert.equal(KEY_CLASSES[REGISTRY_KEY].class,'plain');
});

test('parseRegistry reads a record and ignores what is not one', () => {
  assert.equal(parseRegistry(null),null);assert.equal(parseRegistry('nonsense'),null);assert.equal(parseRegistry('[]'),null);assert.equal(parseRegistry('{"v":1}'),null);
  assert.deepEqual(parseRegistry(JSON.stringify({v:1,formats:{a:2,b:0,c:'x',d:1.5},app:{version:'9'}})),{formats:{a:2},app:{version:'9'}});
});

test('findNewer: nothing newer means nothing blocked', () => {
  assert.deepEqual(findNewer(),{blocked:[],notes:[],unknown:[]});
  assert.deepEqual(findNewer({registry:parseRegistry(reg({chatThreads:1,'plc.memory.v1':1})),storedKeys:['chatThreads','plc.memory.v1','plc.theme.v1']}).blocked,[]);
});

test('findNewer: a store marked above what this version understands is blocked', () => {
  const r=findNewer({registry:parseRegistry(reg({chatThreads:2,'plc.memory.v1':1}))});
  assert.deepEqual(r.blocked,['chatThreads']);
  assert.deepEqual(r.notes,[{key:'chatThreads',found:2,understood:1,source:'record'}]);
});

test('findNewer: a store that moved to a newer key name blocks the older keys of its family', () => {
  assert.deepEqual(findNewer({registry:parseRegistry(reg({'plc.memory.v2':1}))}).blocked,['plc.memory.v1']);
  assert.deepEqual(findNewer({registry:parseRegistry(reg({'plc.voice.v3':1}))}).blocked,['plc.voice.v1','plc.voice.v2']);
  // the same signal from the keys themselves, with no record at all
  assert.deepEqual(findNewer({storedKeys:['plc.folders.v2','chatThreads']}).blocked,['plc.folders.v1']);
  // an older name than the highest known one is not newer
  assert.deepEqual(findNewer({storedKeys:['plc.voice.v1','plc.voice.v2']}).blocked,[]);
});

test('findNewer: a store this version has never heard of is reported, not blocked', () => {
  const r=findNewer({registry:parseRegistry(reg({'plc.something.v1':1})),storedKeys:['plc.other.v2']});
  assert.deepEqual(r.blocked,[]);assert.deepEqual(r.unknown,['plc.other.v2','plc.something.v1']);
});

test('stampedRegistry records what this version manages, never lowers a record, keeps what it does not know, and says when nothing changed', () => {
  const first=JSON.parse(stampedRegistry({app:{version:'1',commit:'a'}}));
  assert.equal(first.v,1);assert.equal(first.formats.chatThreads,1);assert.equal(first.formats['plc.voice.v2'],2);
  assert.equal(first.formats['plc.theme.v1'],undefined,'plain and transient keys are not stamped');
  assert.equal(stampedRegistry({current:parseRegistry(JSON.stringify(first)),app:{version:'1',commit:'a'}}),null,'unchanged: nothing to write');
  const higher=parseRegistry(reg({chatThreads:3,'plc.future.v1':1}));
  const kept=JSON.parse(stampedRegistry({current:higher,blocked:['chatThreads'],app:null}));
  assert.equal(kept.formats.chatThreads,3,'a higher record is kept');assert.equal(kept.formats['plc.future.v1'],1,'an unknown store is kept');
  const lowered=JSON.parse(stampedRegistry({current:parseRegistry(reg({chatThreads:0})),app:null}));
  assert.equal(lowered.formats.chatThreads,1);
});

test('describeStore names a store in plain words', () => {
  assert.equal(describeStore('chatThreads'),'chats');assert.equal(describeStore('plc.memory.v1'),'memory');assert.equal(describeStore('plc.shell.pins.v1'),'pinned items');assert.equal(describeStore('plc.zzz.v1'),'saved data');
});

test('a blocked key can be read but is never written or removed, and the rest of the storage still works', () => {
  const realLocal=memoryStorage({'plc.memory.v1':'{"items":[{"text":"newer"}]}','plc.folders.v1':'[]'}),realSession=memoryStorage();
  const refused=[];const s=createAppStorage({realLocal,realSession,onBlockedWrite:k=>refused.push(k)});
  s.setBlocked(['plc.memory.v1']);assert.deepEqual(s.blocked,['plc.memory.v1']);
  s.local.setItem('plc.memory.v1','{"items":[]}');s.local.removeItem('plc.memory.v1');
  assert.equal(s.local.getItem('plc.memory.v1'),'{"items":[{"text":"newer"}]}','read as before, untouched');
  assert.deepEqual(refused,['plc.memory.v1','plc.memory.v1']);
  s.local.setItem('plc.folders.v1','[{"id":"f"}]');assert.equal(realLocal.getItem('plc.folders.v1'),'[{"id":"f"}]','other keys are written');
  s.local.setItem('plc.shell.collapsed','1');
  s.local.clear();
  assert.equal(realLocal.getItem('plc.memory.v1'),'{"items":[{"text":"newer"}]}','clear leaves a blocked key');
  assert.equal(realLocal.getItem('plc.folders.v1'),null);assert.equal(realLocal.getItem('plc.shell.collapsed'),null);
  s.setBlocked([]);s.local.setItem('plc.memory.v1','x');assert.equal(realLocal.getItem('plc.memory.v1'),'x','unblocked, it is written again');
});

test('with the vault on, a blocked key in the vault is also read-only', async () => {
  const realLocal=memoryStorage(),realSession=memoryStorage(),adapter=createMemoryAdapter();
  const s=createAppStorage({realLocal,realSession});const session=await createVault({adapter}).create('pw',{iterations:1000});s.attach(session);
  s.local.setItem('plc.memory.v1','{"items":[{"text":"kept"}]}');s.local.setItem('chatThreads',JSON.stringify([{id:'t',title:'T',messages:[]}]));
  await s.flush();s.setBlocked(['plc.memory.v1','chatThreads']);
  s.local.setItem('plc.memory.v1','changed');s.local.removeItem('plc.memory.v1');s.local.setItem('chatThreads','[]');s.local.removeItem('chatThreads');
  await s.flush();
  assert.equal(s.local.getItem('plc.memory.v1'),'{"items":[{"text":"kept"}]}');assert.equal(JSON.parse(s.local.getItem('chatThreads')).length,1);
});

test('starting the app records the formats, and newer data found at start is blocked and reported', async () => {
  resetBootForTests();
  const fresh=memoryStorage();
  await bootVault({realLocal:fresh});
  const recorded=JSON.parse(fresh.getItem(REGISTRY_KEY));
  assert.equal(recorded.formats.chatThreads,1);assert.deepEqual(globalThis.__plcFormatGuard.blocked,[]);
  resetBootForTests();
  const newer=memoryStorage({chatThreads:'[{"id":"n"}]','plc.memory.v1':'{}',[REGISTRY_KEY]:reg({chatThreads:2,'plc.voice.v3':1})});
  const events=[];const listener=e=>events.push(e.detail);globalThis.addEventListener?.('plc:format-guard',listener);
  await bootVault({realLocal:newer});
  const {app}=await import('../chat/vault/vault-store.mjs');
  assert.deepEqual(app.blocked,['chatThreads','plc.voice.v1','plc.voice.v2']);
  assert.deepEqual(globalThis.__plcFormatGuard.blocked,['chatThreads','plc.voice.v1','plc.voice.v2']);
  const after=JSON.parse(newer.getItem(REGISTRY_KEY));
  assert.equal(after.formats.chatThreads,2,'the higher record stays');assert.equal(after.formats['plc.memory.v1'],1,'the rest is recorded');
  assert.equal(newer.getItem('chatThreads'),'[{"id":"n"}]','the newer data is untouched');
  globalThis.removeEventListener?.('plc:format-guard',listener);
  resetBootForTests();
});

test('the message says what was left alone and where to save a copy; it is shown once per set of newer data; Reload reloads', async () => {
  const state={blocked:['chatThreads','plc.memory.v1'],databases:['plc-docs']};
  const text=guardMessage(state);
  assert.match(text,/chats, memory and documents/);assert.match(text,/newer version/);assert.match(text,/will not change them/);assert.match(text,/Storage and backups/);
  assert.match(guardMessage({blocked:['chatThreads'],databases:[]}),/holds chats saved/);
  let asked=0,reloaded=0;const dialogs={confirm:async(title,body,label)=>{asked++;assert.equal(label,'Reload now');return asked===1;}};
  assert.equal(await showFormatGuard(dialogs,state,{reload:()=>reloaded++}),true);assert.equal(reloaded,1);
  assert.equal(await showFormatGuard(dialogs,state,{reload:()=>reloaded++}),false);assert.equal(asked,1,'the same newer data is not announced twice');
  assert.equal(await showFormatGuard(dialogs,{blocked:['plc.folders.v1'],databases:[]},{reload:()=>reloaded++}),false);assert.equal(asked,2,'different newer data is announced');
  assert.equal(await showFormatGuard(dialogs,{blocked:[],databases:[]}),false);assert.equal(asked,2,'nothing newer, nothing shown');
});
