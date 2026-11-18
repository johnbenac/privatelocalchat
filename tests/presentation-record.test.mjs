// The record of a kept character look (chat/presentation/record.mjs, T706): made from the real packages, checked again on every read, and never able to reach the page as anything but the default.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {openAuthored} from '../vendor/authored-profiles/neutral/index.mjs';
import {openPresentationBundle} from '../chat/presentation/open-bundle.mjs';
import {RECORD_FORMAT,RECORD_LIMITS,checkRecord,makeRecord,withChoice,describeRecord,verifyRecordHashes,toBase64,fromBase64} from '../chat/presentation/record.mjs';

const raw=(n)=>readFileSync(new URL('./fixtures/presentation/'+n+'.bundle.json',import.meta.url),'utf8');
const opened=async(n)=>openPresentationBundle(raw(n),{openAuthored});
const digest=async(b)=>'sha256:'+createHash('sha256').update(b).digest('hex');
const lantern=async()=>{const r=await opened('lantern-keeper');return makeRecord({character:r.characters[0],assetBytes:r.assetBytes});};
const clone=(o)=>JSON.parse(JSON.stringify(o));

test('a record made from the real lantern-keeper holds the look, both pictures and where it came from, and nothing else',async()=>{
  const made=await lantern();
  assert.equal(made.ok,true);const r=made.record;
  assert.equal(r.v,RECORD_FORMAT);assert.equal(r.enabled,true);assert.deepEqual({...r.off},{layout:false,palette:false,portrait:false,background:false});
  assert.deepEqual({...r.source},{id:'subject:lantern-keeper',label:'Lantern Keeper'});
  assert.deepEqual({layout:r.look.layout,palette:r.look.palette,reducedMotion:r.look.reducedMotion},{layout:'folio',palette:'sea',reducedMotion:true});
  assert.deepEqual(r.images.map((i)=>[i.assetId,i.role,i.license]),[['asset:lantern-portrait','portrait','CC0-1.0'],['asset:lantern-background','background','CC0-1.0']]);
  assert.deepEqual(Object.keys(r).sort(),['enabled','images','look','off','source','v'],'no other part of the package is kept');
  assert.ok(JSON.stringify(r).length<RECORD_LIMITS.totalBytes*1.4+4000,'small enough to live in browser storage: '+JSON.stringify(r).length);
  assert.equal((await verifyRecordHashes(r,digest)).ok,true,'every kept picture still hashes to its record');
  assert.deepEqual(JSON.parse(JSON.stringify(r)),checkRecord(JSON.parse(JSON.stringify(r))).record,'it survives being written and read back unchanged');
});

test('there is nothing to keep for a refused presentation or for none',async()=>{
  const ferry=await opened('ferry-clerk');
  assert.deepEqual(makeRecord({character:ferry.characters[0],assetBytes:ferry.assetBytes}),{ok:false,reason:'nothing-to-keep'});
  assert.deepEqual(makeRecord({character:{view:{usesDefault:true,images:[]}},assetBytes:new Map()}),{ok:false,reason:'nothing-to-keep'});
  assert.deepEqual(makeRecord({}),{ok:false,reason:'nothing-to-keep'});
});

test('a record refuses to be made when a picture\'s verified bytes are missing or the wrong size',async()=>{
  const r=await opened('lantern-keeper');
  const short=new Map(r.assetBytes);short.set('asset:lantern-portrait',new Uint8Array(3));
  assert.deepEqual(makeRecord({character:r.characters[0],assetBytes:short}),{ok:false,reason:'image-bytes'});
  const gone=new Map(r.assetBytes);gone.delete('asset:lantern-background');
  assert.deepEqual(makeRecord({character:r.characters[0],assetBytes:gone}),{ok:false,reason:'image-bytes'});
});

test('every way a stored record can be wrong is refused with a named reason, and a newer one is "newer", not damaged',async()=>{
  const good=clone((await lantern()).record);
  const cases=[
    ['not-an-object',null],['not-an-object',[]],['not-an-object','x'],['format',{...good,v:0}],['format',{...good,v:'1'}],['newer',{...good,v:2}],
    ['enabled',{...good,enabled:'yes'}],['off',{...good,off:{layout:false}}],['off',{...good,off:{...good.off,portrait:1}}],
    ['source',{...good,source:{id:'',label:'x'}}],['source',{...good,source:{id:'a',label:'x'.repeat(201)}}],
    ['layout',{...good,look:{...good.look,layout:'masonry'}}],['palette',{...good,look:{...good.look,palette:'__proto__'}}],['alt',{...good,look:{...good.look,alt:''}}],['reduced-motion',{...good,look:{...good.look,reducedMotion:'true'}}],['look',{...good,look:null}],
    ['images',{...good,images:'x'}],['images',{...good,images:Array.from({length:9},(_,i)=>({...good.images[0],assetId:'a'+i}))}],
    ['image-id',{...good,images:[good.images[0],{...good.images[1],assetId:good.images[0].assetId}]}],['image-role',{...good,images:[{...good.images[0],role:'icon'}]}],
    ['image-text',{...good,images:[{...good.images[0],alt:''}]}],['image-text',{...good,images:[{...good.images[0],license:'  '}]}],
    ['image-type',{...good,images:[{...good.images[0],mediaType:'image/svg+xml'}]}],['image-size',{...good,images:[{...good.images[0],size:RECORD_LIMITS.imageBytes+1}]}],
    ['image-hash',{...good,images:[{...good.images[0],sha256:'sha256:ABC'}]}],['image-data',{...good,images:[{...good.images[0],data:good.images[0].data+'A'}]}],['image-data',{...good,images:[{...good.images[0],data:'!!!!'}]}],
    ['image-data',{...good,images:[{...good.images[0],size:good.images[0].size+1}]}]
  ];
  for(const [reason,value] of cases){const r=checkRecord(value);assert.equal(r.ok,false,reason);assert.equal(r.reason,reason,JSON.stringify(value).slice(0,80));}
  const total={...good,images:Array.from({length:5},(_,i)=>({...good.images[0],assetId:'a'+i,size:60*1024,data:toBase64(new Uint8Array(60*1024))}))};
  assert.equal(checkRecord(total).reason,'images-total','five 60 KiB pictures are over the 256 KiB total');
});

test('unknown fields are not carried, and what is read is frozen',async()=>{
  const good=clone((await lantern()).record);
  const r=checkRecord({...good,extra:{x:1},look:{...good.look,css:'body{display:none}'},images:good.images.map((i)=>({...i,url:'https://x'}))});
  assert.equal(r.ok,true);
  assert.equal('extra' in r.record,false);assert.equal('css' in r.record.look,false);assert.equal('url' in r.record.images[0],false);
  assert.ok(Object.isFrozen(r.record)&&Object.isFrozen(r.record.look)&&Object.isFrozen(r.record.images[0])&&Object.isFrozen(r.record.off));
});

test('describing: no record, a damaged one, a newer one and a disabled one are all the default look with a reason; nothing throws',async()=>{
  const good=clone((await lantern()).record);
  for(const [value,reason] of [[undefined,'none'],[null,'none'],['x','unusable:not-an-object'],[{...good,v:2},'unusable:newer'],[{...good,look:{...good.look,palette:'neon'}},'unusable:palette'],[{...good,enabled:false},'disabled']]){
    const d=describeRecord(value);assert.equal(d.usesDefault,true,reason);assert.equal(d.reason,reason);assert.equal(d.layout,null);assert.equal(d.images.length,0);assert.ok(Object.isFrozen(d));
  }
});

test('describing a kept look gives layout, palette, pictures as bytes, and hides the background from assistive technology',async()=>{
  const d=describeRecord((await lantern()).record);
  assert.equal(d.usesDefault,false);assert.equal(d.layout,'folio');assert.equal(d.palette,'sea');assert.equal(d.label,'Lantern Keeper');assert.equal(d.reducedMotion,true);
  assert.deepEqual(d.images.map((i)=>[i.role,i.hideFromAssistiveTech,i.bytes instanceof Uint8Array&&i.bytes.length===i.size]),[['portrait',false,true],['background',true,true]]);
  for(const i of d.images)assert.equal(await digest(i.bytes),i.sha256,'the bytes handed to the page are the verified ones');
  assert.deepEqual([...fromBase64(toBase64(new Uint8Array([0,1,2,250,255])))],[0,1,2,250,255]);
});

test('the person\'s choices: a part turned off is not drawn, all parts off is the default, disabled is the default, and bad choices are refused',async()=>{
  const r=(await lantern()).record;
  let a=withChoice(r,{off:{portrait:true}});assert.equal(a.ok,true);
  let d=describeRecord(a.record);assert.deepEqual(d.images.map((i)=>i.role),['background']);assert.equal(d.layout,'folio');
  a=withChoice(a.record,{off:{background:true,layout:true}});d=describeRecord(a.record);assert.equal(d.images.length,0);assert.equal(d.layout,null);assert.equal(d.palette,'sea');
  a=withChoice(a.record,{off:{palette:true}});d=describeRecord(a.record);assert.equal(d.usesDefault,true);assert.equal(d.reason,'all-parts-off');
  a=withChoice(a.record,{off:{palette:false,portrait:false,background:false,layout:false},enabled:false});d=describeRecord(a.record);assert.equal(d.reason,'disabled');
  a=withChoice(a.record,{enabled:true});assert.equal(describeRecord(a.record).usesDefault,false,'turning it back on restores the whole look: nothing was lost');
  for(const bad of [null,'x',{enabled:'no'},{off:null},{off:{colour:true}},{off:{portrait:'yes'}}])assert.equal(withChoice(r,bad).ok,false,JSON.stringify(bad));
  assert.equal(r.enabled,true,'the record that was given is not changed');
});

test('a picture whose bytes no longer match its hash is caught by the check the renderer runs',async()=>{
  const r=clone((await lantern()).record);const bytes=fromBase64(r.images[0].data);bytes[0]^=1;r.images[0].data=toBase64(bytes);
  const checked=checkRecord(r);assert.equal(checked.ok,true,'size and form are fine, so only the hash can tell');
  assert.deepEqual(await verifyRecordHashes(checked.record,digest),{ok:false,assetId:'asset:lantern-portrait'});
});
