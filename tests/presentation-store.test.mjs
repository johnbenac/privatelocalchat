// The store of kept character looks (chat/presentation/presentation-store.mjs, T706): lock, fresh read, read-back, no rollback, no write without Web Locks, and above all that an entry it cannot read is
// never dropped, rewritten or overwritten. Parallel actors and the abrupt-death test are in presentation-crash.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openAuthored} from '../vendor/authored-profiles/neutral/index.mjs';
import {openPresentationBundle} from '../chat/presentation/open-bundle.mjs';
import {makeRecord,checkRecord,describeRecord} from '../chat/presentation/record.mjs';
import {createPresentationStore,keepChange,choiceChange,removeChange,pruneChange,lookup,MAX_KEPT,PRESET_ID} from '../chat/presentation/presentation-store.mjs';
import {memoryStorage} from '../chat/vault/vault-store.mjs';

const KEY='plc.presentations.v1';
function fakeLocks(){const queue=[];let held=false;const next=()=>{if(held||!queue.length)return;const w=queue.shift();if(w.aborted)return next();held=true;w.start();};
  return {get held(){return held;},request(name,options,callback){return new Promise((resolve,reject)=>{const w={aborted:false,start:async()=>{try{resolve(await callback({name}));}catch(e){reject(e);}finally{held=false;next();}}};
    options?.signal?.addEventListener('abort',()=>{w.aborted=true;const e=new Error('aborted');e.name='AbortError';reject(e);});queue.push(w);next();});}};}
const opened=await openPresentationBundle(readFileSync(new URL('./fixtures/presentation/lantern-keeper.bundle.json',import.meta.url),'utf8'),{openAuthored});
const record=makeRecord({character:opened.characters[0],assetBytes:opened.assetBytes}).record;
const plain=()=>JSON.parse(JSON.stringify(record));
const mk=(storage=memoryStorage(),extra={})=>({storage,store:createPresentationStore({storage,key:KEY,locks:fakeLocks(),...extra})});
const stored=(s)=>JSON.parse(s.getItem(KEY)||'{}');

test('keep, change a choice, remove: each reads what is stored now, writes and checks by reading back',async()=>{
  const {storage,store}=mk();
  assert.equal((await store.mutate(keepChange('preset-a',record))).result.status,'saved');
  storage.setItem(KEY,JSON.stringify({...stored(storage),'preset-x':plain()})); // another tab wrote this
  const r=await store.mutate(choiceChange('preset-a',{off:{portrait:true}}));
  assert.equal(r.result.status,'saved');assert.deepEqual(Object.keys(stored(storage)).sort(),['preset-a','preset-x'],'the other tab\'s look was not lost');
  assert.equal(stored(storage)['preset-a'].off.portrait,true);assert.equal(stored(storage)['preset-x'].off.portrait,false);
  assert.equal((await store.mutate(removeChange('preset-a'))).result.status,'removed');assert.deepEqual(Object.keys(stored(storage)),['preset-x']);
  assert.equal((await store.mutate(removeChange('preset-a'))).result.status,'gone','removing what is not there is not an error');
  assert.equal((await store.mutate(choiceChange('preset-a',{enabled:false}))).result.status,'gone');
  const noop=await store.mutate(()=>({result:'nothing'}));assert.equal(noop.result,'nothing');
});

test('removing the last look leaves nothing behind but an empty map, and it reads back as the default look',async()=>{
  const {storage,store}=mk();await store.mutate(keepChange('preset-a',record));await store.mutate(removeChange('preset-a'));
  assert.deepEqual(stored(storage),{});assert.equal(describeRecord(stored(storage)['preset-a']).reason,'none');
});

test('an entry this version cannot read is carried through every write untouched, and a newer one is never overwritten or removed',async()=>{
  const newer={v:2,whatever:{from:'a newer version'},big:1.0,list:[1,2,{x:null}]};
  const damaged={v:1,enabled:'yes'};
  const {storage,store}=mk(memoryStorage({[KEY]:JSON.stringify({'preset-new':newer,'preset-bad':damaged})}));
  assert.equal((await store.mutate(keepChange('preset-a',record))).result.status,'saved');
  assert.deepEqual(stored(storage)['preset-new'],newer,'the newer entry is kept, value for value');assert.deepEqual(stored(storage)['preset-bad'],damaged);
  assert.equal((await store.mutate(keepChange('preset-new',record))).result.status,'newer','a keep does not overwrite a newer entry');
  assert.equal((await store.mutate(removeChange('preset-new'))).result.status,'newer','nor does a remove');
  assert.equal((await store.mutate(choiceChange('preset-new',{enabled:false}))).result.status,'newer');
  assert.equal((await store.mutate(choiceChange('preset-bad',{enabled:false}))).result.status,'damaged');
  assert.deepEqual(stored(storage)['preset-new'],newer);
  assert.equal((await store.mutate(keepChange('preset-bad',record))).result.status,'saved','a damaged entry may be replaced by a good one');
  assert.equal(checkRecord(stored(storage)['preset-bad']).ok,true);
  const pruned=await store.mutate(pruneChange(['preset-a']));
  assert.deepEqual(pruned.result.removed,['preset-bad'],'prune removes looks of presets that are gone, but never a newer version\'s entry');
  assert.deepEqual(Object.keys(stored(storage)).sort(),['preset-a','preset-new']);
});

test('at most MAX_KEPT looks are kept, replacing one is always allowed, and the refusal changes nothing',async()=>{
  const {storage,store}=mk();
  for(let i=0;i<MAX_KEPT;i++)assert.equal((await store.mutate(keepChange('p'+i,record))).result.status,'saved');
  const before=storage.getItem(KEY);
  const full=await store.mutate(keepChange('one-too-many',record));assert.deepEqual(full.result,{status:'full',max:MAX_KEPT});assert.equal(storage.getItem(KEY),before);
  assert.equal((await store.mutate(keepChange('p3',record))).result.status,'saved','replacing one that is kept is not "one more"');
  assert.equal((await store.mutate(removeChange('p0'))).result.status,'removed');assert.equal((await store.mutate(keepChange('one-too-many',record))).result.status,'saved');
});

test('unsafe preset ids and invalid records are refused and change nothing',async()=>{
  const {storage,store}=mk();
  for(const id of ['__proto__','_x','','a b','../x','a/b','a'.repeat(129),null,undefined,7,{}]){
    for(const change of [keepChange(id,record),choiceChange(id,{enabled:false}),removeChange(id)])assert.equal((await store.mutate(change)).result.status,'bad-id',String(id));
  }
  assert.equal(PRESET_ID.test('preset-mq1x2y'),true);
  assert.equal((await store.mutate(keepChange('a',{...plain(),look:{...plain().look,layout:'masonry'}}))).result.status,'invalid');
  assert.equal((await store.mutate(keepChange('a',null))).result.status,'invalid');
  await store.mutate(keepChange('a',record));
  assert.equal((await store.mutate(choiceChange('a',{off:{colour:true}}))).result.status,'invalid');
  assert.equal(storage.getItem(KEY),JSON.stringify({a:plain()}),'nothing but the one good keep was written');
  assert.equal(({}).polluted,undefined);
});

test('two people turning different parts off both stay, because a choice is applied to what is stored now',async()=>{
  const {storage,store}=mk();await store.mutate(keepChange('a',record));
  await Promise.all([store.mutate(choiceChange('a',{off:{portrait:true}})),store.mutate(choiceChange('a',{off:{background:true}})),store.mutate(choiceChange('a',{off:{layout:true}}))]);
  assert.deepEqual({...stored(storage).a.off},{layout:true,palette:false,portrait:true,background:true});
});

test('stored text that is not a map, a storage that cannot be read, a read-only tab, a full disk and a lying write change nothing',async()=>{
  for(const text of ['{"a":','[1,2]','"x"','3']){const s=memoryStorage({[KEY]:text});const r=await createPresentationStore({storage:s,key:KEY,locks:fakeLocks()}).mutate(keepChange('a',record));
    assert.equal(r.ok,false);assert.equal(r.code,'malformed',text);assert.equal(s.getItem(KEY),text,'left exactly as it was');}
  const denied=memoryStorage({[KEY]:'{}'});denied.getItem=()=>{throw new DOMException('denied','SecurityError');};const writes=[];denied.setItem=(...a)=>writes.push(a);
  const ds=createPresentationStore({storage:denied,key:KEY,locks:fakeLocks()});assert.equal(ds.read().code,'unreadable');assert.equal((await ds.mutate(keepChange('a',record))).code,'unreadable');assert.deepEqual(writes,[]);
  const ro=memoryStorage({[KEY]:'{}'});const rs=createPresentationStore({storage:ro,key:KEY,locks:fakeLocks(),isReadOnly:()=>true});
  assert.equal((await rs.mutate(keepChange('a',record))).code,'read-only');assert.equal(rs.ready().code,'read-only');assert.equal(ro.getItem(KEY),'{}');
  const full=memoryStorage({[KEY]:JSON.stringify({a:plain()})});const before=full.getItem(KEY);const set=full.setItem;full.setItem=()=>{throw new Error('QuotaExceededError');};
  const q=await createPresentationStore({storage:full,key:KEY,locks:fakeLocks()}).mutate(keepChange('b',record));full.setItem=set;assert.equal(q.code,'write-failed');assert.equal(full.getItem(KEY),before);
  const silent=memoryStorage({[KEY]:'{}'});silent.setItem=()=>{};assert.equal((await createPresentationStore({storage:silent,key:KEY,locks:fakeLocks()}).mutate(keepChange('a',record))).code,'changed');
});

test('NO Web Locks: nothing is written, whatever the change; reading still works',async()=>{
  const s=memoryStorage({[KEY]:JSON.stringify({a:plain()})});const store=createPresentationStore({storage:s,key:KEY,locks:null});
  assert.equal((await store.mutate(keepChange('b',record))).code,'unsupported');assert.equal(store.ready().code,'unsupported');assert.deepEqual(Object.keys(store.read().map),['a']);
  assert.deepEqual(Object.keys(stored(s)),['a']);
});

test('another tab holding the lock for too long gives "busy" and changes nothing; a change that throws frees the lock',async()=>{
  const locks=fakeLocks();const s=memoryStorage({[KEY]:'{}'});const store=createPresentationStore({storage:s,key:KEY,locks,waitMs:30});
  let release;const hold=locks.request('plc-presentations',{},()=>new Promise((r)=>{release=r;}));
  assert.equal((await store.mutate(keepChange('a',record))).code,'busy');assert.equal(s.getItem(KEY),'{}');release();await hold;
  assert.equal((await store.mutate(()=>{throw new Error('boom');})).code,'write-failed');assert.equal(locks.held,false,'the lock is free after a failed change');
  assert.equal((await store.mutate(keepChange('a',record))).result.status,'saved');
});

test('looking a look up by preset id never finds an inherited property, and an id like "constructor" is an ordinary id',async()=>{
  const {store}=mk();
  assert.equal((await store.mutate(keepChange('constructor',record))).result.status,'saved');
  const map=store.read().map;
  assert.equal(checkRecord(lookup(map,'constructor')).ok,true);
  for(const id of ['toString','hasOwnProperty','__proto__','valueOf','missing',null,undefined,7])assert.equal(lookup(map,id),undefined,String(id));
  assert.equal(lookup(null,'a'),undefined);assert.equal(describeRecord(lookup(map,'toString')).reason,'none');
  assert.equal(({}).polluted,undefined);
});
