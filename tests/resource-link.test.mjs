// The discovery "Open in Private Local Chat" link (chat/assistant/resource-link.mjs, board T461): every case of tests/fixtures/discovery-opening/cases.json, which aiofourown's page generator also runs against,
// and the check of a chosen file against what the link described.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readResourceFragment,encodeResourceFragment,checkResource,checkResourceFile,safePageAddress,sha256Hex,RESOURCE_KEYS,RESOURCE_LIMITS,RESOURCE_FAMILIES} from '../chat/assistant/resource-link.mjs';
import {cases,valid} from './helpers/make-resource-cases.mjs';

const file=JSON.parse(readFileSync(new URL('./fixtures/discovery-opening/cases.json',import.meta.url),'utf8'));

test('the fixtures file is exactly what the generator makes (aiofourown runs its generator against this file)',()=>{
  assert.deepEqual(file.cases,JSON.parse(JSON.stringify(cases())),'regenerate with: node tests/helpers/make-resource-cases.mjs');
  assert.ok(file.cases.length>=60);
});

test('every case: valid ones are read exactly, others are refused with their code, fragments of other things are left alone',()=>{
  for(const c of file.cases){
    const r=c.expect==='no-link'?null:readResourceFragment(c.fragment);
    if(c.expect==='ok'){assert.ok(r&&r.ok===true,c.name+': '+JSON.stringify(r));assert.deepEqual(Object.keys(r.resource),RESOURCE_KEYS,c.name+': the keys are exactly the contract\'s, in order');assert.ok(Object.isFrozen(r.resource),c.name);}
    else if(c.expect==='none')assert.equal(r,null,c.name);
    else if(c.expect==='no-link')assert.equal(encodeResourceFragment(c.builds),null,c.name);
    else{assert.ok(r&&r.ok===false,c.name+': '+JSON.stringify(r));assert.equal(r.code,c.expect,c.name+' -> '+r.code);assert.match(r.message,/Nothing was changed\./,c.name);assert.ok(!/(bad|invalid|corrupt)\b/i.test(r.message)||/not usable|cannot be shown/.test(r.message),c.name+': '+r.message);}
  }
});

test('a page builds exactly the fragment the cases name from the resource it lists, and the reader reads it back',()=>{
  for(const c of file.cases.filter(c=>c.builds&&c.expect==='ok')){
    assert.equal(encodeResourceFragment(c.builds),c.fragment,c.name);
    assert.deepEqual({...readResourceFragment(c.fragment).resource},c.builds,c.name);
  }
  const f=encodeResourceFragment(valid());assert.match(f,/^#resource=[A-Za-z0-9_-]+$/);assert.ok(f.length<=RESOURCE_LIMITS.valueChars+10);
  const scrambled={};for(const k of [...RESOURCE_KEYS].reverse())scrambled[k]=valid()[k];
  assert.equal(encodeResourceFragment(scrambled),f,'the key order of the input does not matter: the canonical order is used');
});

test('the family table and the limits are what the contract says',()=>{
  assert.deepEqual(Object.keys(RESOURCE_FAMILIES),['preset-candidate']);assert.equal(RESOURCE_FAMILIES['preset-candidate'].maxBytes,32768);
  assert.equal(RESOURCE_LIMITS.valueChars,2048);assert.equal(RESOURCE_LIMITS.title,120);assert.equal(RESOURCE_LIMITS.license,120);
  assert.equal(checkResource(null).ok,false);assert.equal(checkResource([]).ok,false);assert.equal(checkResource({}).code,'missing');
  assert.equal(Object.keys(RESOURCE_FAMILIES).includes('constructor'),false);
});

test('page addresses: only a readable https page on a real host',()=>{
  for(const ok of ['https://a.example/','https://a.example/x/y?lang=en','https://sub.a.example/p#'.replace('#','')])assert.equal(safePageAddress(ok),true,ok);
  for(const bad of ['','http://a.example/','https://a.example:1/','https://u@a.example/','https://a.example/#x','https://a.example/?access_token=1','https://a.example/?Signature=1','https://1.2.3.4/','https://[::1]/','https://localhost/','https://x.local/',null,undefined,7,'https://a.example/'+'x'.repeat(2100)])assert.equal(safePageAddress(bad),false,String(bad).slice(0,40));
});

test('a chosen file is accepted only when it is exactly the one listed; any difference says what differed and never calls the file bad',async()=>{
  const bytes=new Uint8Array(readFileSync(new URL('./fixtures/presets/emma-minimal.plc-preset-candidate.json',import.meta.url)));
  const resource={...valid(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  assert.equal(await sha256Hex(bytes),resource.sha256,'the page-side digest is lower-case hex of the exact bytes');
  assert.deepEqual(await checkResourceFile(resource,bytes),{ok:true});
  const shorter=bytes.slice(0,bytes.length-1);const s=await checkResourceFile(resource,shorter);
  assert.equal(s.ok,false);assert.equal(s.code,'size');assert.match(s.message,/is \d+ bytes, but the listing says \d+/);assert.match(s.message,/not the file that was listed/);
  const flipped=bytes.slice();flipped[0]^=1;const h=await checkResourceFile(resource,flipped);
  assert.equal(h.ok,false);assert.equal(h.code,'hash');assert.match(h.message,/right size but a different checksum/);
  for(const r of [s,h])assert.ok(!/\b(bad|invalid|corrupt|tamper)/i.test(r.message),r.message);
  assert.equal((await checkResourceFile(resource,'not bytes')).code,'unreadable');assert.equal((await checkResourceFile(resource,null)).code,'unreadable');
  let called=0;await checkResourceFile(resource,shorter,async()=>{called++;return '';});assert.equal(called,0,'the size is checked before the file is hashed');
});
