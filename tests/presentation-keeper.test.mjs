// The keeper (chat/presentation/keeper.mjs): the one owner of plc.presentations.v1, reading through the record check and changing through the lock-protected store.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {openAuthored} from '../vendor/authored-profiles/neutral/index.mjs';
import {openPresentationBundle} from '../chat/presentation/open-bundle.mjs';
import {makeRecord} from '../chat/presentation/record.mjs';
import {createPresentationKeeper,PRESENTATIONS_KEY,MAX_KEPT} from '../chat/presentation/keeper.mjs';
import {memoryStorage} from '../chat/vault/vault-store.mjs';

function fakeLocks(){const queue=[];let held=false;const next=()=>{if(held||!queue.length)return;const w=queue.shift();held=true;w();};
  return {request(name,options,callback){return new Promise((resolve,reject)=>{queue.push(async()=>{try{resolve(await callback({name}));}catch(e){reject(e);}finally{held=false;next();}});next();});}};}
const opened=await openPresentationBundle(readFileSync(new URL('./fixtures/presentation/lantern-keeper.bundle.json',import.meta.url),'utf8'),{openAuthored});
const record=makeRecord({character:opened.characters[0],assetBytes:opened.assetBytes}).record;
const mk=(extra={})=>{const storage=memoryStorage();const changes=[];return {storage,changes,keeper:createPresentationKeeper({storage,locks:fakeLocks(),onChange:(m)=>changes.push(Object.keys(m).sort()),...extra})};};

test('the key is the one the inventory will list, and a fresh browser has no looks',()=>{
  assert.equal(PRESENTATIONS_KEY,'plc.presentations.v1');
  const {keeper}=mk();assert.equal(keeper.describe('preset-a').usesDefault,true);assert.equal(keeper.describe('preset-a').reason,'none');assert.equal(keeper.has('preset-a'),false);assert.equal(keeper.ready().ok,true);
});

test('keep, choose, describe, remove: what is drawn follows what is stored, and each change is announced',async()=>{
  const {keeper,storage,changes}=mk();
  assert.equal((await keeper.keep('preset-a',record)).result.status,'saved');
  let d=keeper.describe('preset-a');assert.equal(d.usesDefault,false);assert.equal(d.palette,'sea');assert.equal(d.images.length,2);assert.equal(keeper.has('preset-a'),true);
  assert.equal(keeper.describe('preset-b').usesDefault,true,'another preset has none');
  await keeper.setChoice('preset-a',{off:{portrait:true}});d=keeper.describe('preset-a');assert.deepEqual(d.images.map(i=>i.role),['background']);
  await keeper.setChoice('preset-a',{enabled:false});assert.equal(keeper.describe('preset-a').reason,'disabled');
  await keeper.setChoice('preset-a',{enabled:true});assert.equal(keeper.describe('preset-a').usesDefault,false);
  assert.equal((await keeper.remove('preset-a')).result.status,'removed');assert.equal(keeper.describe('preset-a').reason,'none');
  assert.deepEqual(JSON.parse(storage.getItem(PRESENTATIONS_KEY)),{},'nothing but an empty map is left');
  assert.equal(changes.length,5);
});

test('a damaged or newer stored record is the default look and is left alone; prune keeps a newer one',async()=>{
  const storage=memoryStorage({[PRESENTATIONS_KEY]:JSON.stringify({damaged:{v:1,enabled:'x'},fromNewer:{v:2,x:1},gone:JSON.parse(JSON.stringify(record))})});
  const keeper=createPresentationKeeper({storage,locks:fakeLocks()});
  assert.equal(keeper.describe('damaged').reason,'unusable:enabled');assert.equal(keeper.describe('fromNewer').reason,'unusable:newer');assert.equal(keeper.describe('gone').usesDefault,false);
  const pruned=await keeper.prune(['damaged']);assert.deepEqual(pruned.result.removed.sort(),['gone']);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(PRESENTATIONS_KEY))).sort(),['damaged','fromNewer'],'the newer entry survives a prune');
});

test('unreadable storage and a read-only tab: the default look is drawn and nothing is written, with the store\'s message',async()=>{
  const bad=memoryStorage({[PRESENTATIONS_KEY]:'{oops'});const k1=createPresentationKeeper({storage:bad,locks:fakeLocks()});
  assert.equal(k1.describe('a').usesDefault,true);const r=await k1.keep('a',record);assert.equal(r.ok,false);assert.equal(r.code,'malformed');assert.equal(bad.getItem(PRESENTATIONS_KEY),'{oops');
  const ro=createPresentationKeeper({storage:memoryStorage(),locks:fakeLocks(),isReadOnly:()=>true});assert.equal((await ro.keep('a',record)).code,'read-only');assert.equal(ro.ready().code,'read-only');
  const noLocks=createPresentationKeeper({storage:memoryStorage(),locks:null});assert.equal((await noLocks.keep('a',record)).code,'unsupported');
});

test('a listener that throws does not undo a saved change, and the bound is the store\'s',async()=>{
  const {keeper}=mk({onChange:()=>{throw new Error('listener');}});
  assert.equal((await keeper.keep('p0',record)).ok,true);assert.equal(keeper.has('p0'),true);
  for(let i=1;i<MAX_KEPT;i++)await keeper.keep('p'+i,record);
  assert.deepEqual((await keeper.keep('extra',record)).result,{status:'full',max:MAX_KEPT});
});

test('peek gives the checked record for the controls, and null for none, damaged or newer',async()=>{
  const storage=memoryStorage({[PRESENTATIONS_KEY]:JSON.stringify({damaged:{v:1},fromNewer:{v:2}})});
  const keeper=createPresentationKeeper({storage,locks:fakeLocks()});
  assert.equal(keeper.peek('none'),null);assert.equal(keeper.peek('damaged'),null);assert.equal(keeper.peek('fromNewer'),null);assert.equal(keeper.peek('constructor'),null);
  await keeper.keep('a',record);const r=keeper.peek('a');assert.equal(r.source.label,'Lantern Keeper');assert.equal(r.enabled,true);assert.equal(r.off.portrait,false);
  assert.equal(keeper.has('damaged'),true,'has says something is stored, peek says whether it can be used');
});
