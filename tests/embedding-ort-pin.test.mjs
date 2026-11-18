import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The search model's ONNX Runtime files are code, so the app serves them itself (the shared CDN holds data only).
// They are the exact files the original set held under runtime/ (ops/cloudflare/memory-models.json pins the same hashes).
const dir=new URL('../chat/vendor/embedding/',import.meta.url);
const versions=JSON.parse(await readFile(new URL('VERSIONS.json',dir),'utf8'));
const memory=JSON.parse(await readFile(new URL('../../../ops/cloudflare/memory-models.json',dir),'utf8')).memory_search;

test('the vendored ONNX Runtime files match the pinned size and SHA-256',async()=>{
 const pins=Object.entries(versions.onnxruntimeFiles);
 assert.equal(pins.length,2);
 for(const [name,pin] of pins){
  const bytes=await readFile(new URL(name,dir));
  assert.equal(bytes.length,pin.bytes,name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,name);
 }
});

test('the search set pins the same size and hash for the same files',async()=>{
 for(const [name,pin] of Object.entries(versions.onnxruntimeFiles)){
  const entry=memory.files.find((f)=>f.path==='runtime/'+name.replace(/^ort\//,''));
  assert.ok(entry,name);
  assert.equal(entry.appServed,true,name+' is code: the app serves it');
  assert.equal(entry.sha256,pin.sha256,name);
  assert.equal(entry.bytes,pin.bytes,name);
 }
});

test('the search set pins the files the app fetches, data first, and names the version the app uses',async()=>{
 const config=await readFile(new URL('../../../chat/embedding/embedding-config.mjs',dir),'utf8');
 assert.match(config,new RegExp('EMBEDDING_ASSET_VERSION = "'+memory.version+'"'));
 assert.equal(memory.prefix,'models/memory/'+memory.version+'/');
 const data=memory.files.filter((f)=>!f.appServed);
 assert.equal(data.length,6);
 assert.ok(data.every((f)=>f.path.startsWith('embed/')),'the data files are the embed/ files');
 assert.equal(data.reduce((n,f)=>n+f.bytes,0),memory.model.totalBytes);
 const seen=new Set();
 for(const f of memory.files){
  assert.match(f.sha256,/^[0-9a-f]{64}$/,f.path);
  assert.ok(Number.isInteger(f.bytes)&&f.bytes>0,f.path);
  assert.ok(!f.path.startsWith('/')&&!f.path.includes('..')&&!seen.has(f.path),f.path);
  seen.add(f.path);
 }
 const text=JSON.stringify(memory);
 for(const forbidden of ['sonalon','assets.privatelocal'+'.chat']) assert.ok(!text.toLowerCase().includes(forbidden),'no foreign or retired host: '+forbidden);
});
