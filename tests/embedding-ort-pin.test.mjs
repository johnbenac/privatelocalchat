import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// The search model's ONNX Runtime files are code, so the app serves them itself (the shared CDN holds data only).
// They are the exact files the original set held under runtime/ (ops/cloudflare/publish-embedding.py pins the same hashes).
const dir=new URL('../chat/vendor/embedding/',import.meta.url);
const versions=JSON.parse(await readFile(new URL('VERSIONS.json',dir),'utf8'));

test('the vendored ONNX Runtime files match the pinned size and SHA-256',async()=>{
 const pins=Object.entries(versions.onnxruntimeFiles);
 assert.equal(pins.length,2);
 for(const [name,pin] of pins){
  const bytes=await readFile(new URL(name,dir));
  assert.equal(bytes.length,pin.bytes,name);
  assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,name);
 }
});

test('the publisher pins the same hashes for the same files',async()=>{
 const py=await readFile(new URL('../../../ops/cloudflare/publish-embedding.py',dir),'utf8');
 for(const [name,pin] of Object.entries(versions.onnxruntimeFiles)){
  assert.ok(py.includes("'runtime/"+name.replace(/^ort\//,'')+"'")&&py.includes(pin.sha256),name);
 }
});
