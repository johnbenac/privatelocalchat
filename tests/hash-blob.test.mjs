import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {hashBlobChunks,HASH_CHUNK_BYTES} from '../runtime/providers/hash-blob-chunks.mjs';
import {sha256OfBlob} from '../runtime/providers/hash-blob.mjs';
import {BrowserWorker} from './hash-worker-fixture.mjs';

test('incremental SHA-256 matches independent digests across padding and read boundaries',async()=>{
 for(const size of [0,1,55,56,63,64,65,HASH_CHUNK_BYTES-1,HASH_CHUNK_BYTES,HASH_CHUNK_BYTES+1]){
  const bytes=Uint8Array.from({length:size},(_,i)=>i%251);
  assert.equal(await hashBlobChunks(new Blob([bytes])),createHash('sha256').update(bytes).digest('hex'));
 }
 assert.equal(await hashBlobChunks(new Blob(['abc'])),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('large logical shard is checked with bounded, serial reads and propagates cancellation',async()=>{
 const size=428120416,reference=createHash('sha256');let maximum=0,reads=0,active=0;
 const blob={size,slice(start,end){
  assert.equal(active,0);assert.ok(end-start<=HASH_CHUNK_BYTES);maximum=Math.max(maximum,end-start);
  return {async arrayBuffer(){active++;const bytes=new Uint8Array(end-start).fill(reads++%251);reference.update(bytes);active--;return bytes.buffer;}};
 }};
 assert.equal(await hashBlobChunks(blob),reference.digest('hex'));
 assert.equal(maximum,HASH_CHUNK_BYTES);assert.equal(reads,Math.ceil(size/HASH_CHUNK_BYTES));
 const controller=new AbortController();let calls=0;
 await assert.rejects(hashBlobChunks({size:2*HASH_CHUNK_BYTES,slice(){calls++;controller.abort();return new Blob(['x']);}},{signal:controller.signal}),{name:'AbortError'});
 assert.equal(calls,1);
});

test('checksum worker returns the actual digest and is terminated on every exit path',async()=>{
 let terminated=0;
 const createWorker=()=>{const w=new BrowserWorker(new URL('../runtime/providers/hash-blob-worker.mjs',import.meta.url));const terminate=w.terminate.bind(w);w.terminate=()=>{terminated++;return terminate();};return w;};
 assert.equal(await sha256OfBlob(new Blob(['abc']),{createWorker}),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
 assert.equal(terminated,1);
 const controller=new AbortController();
 const never=()=>({postMessage(){controller.abort();},terminate(){terminated++;}});
 await assert.rejects(sha256OfBlob(new Blob(['abc']),{createWorker:never,signal:controller.signal}),{name:'AbortError'});
 assert.equal(terminated,2);
 await assert.rejects(sha256OfBlob(new Blob(['abc']),{timeoutMs:5,createWorker:()=>({postMessage(){},terminate(){terminated++;}})}),/stalled/);
 assert.equal(terminated,3);
 await assert.rejects(sha256OfBlob(new Blob(['abc']),{createWorker:()=>({postMessage(){throw Error('clone failed');},terminate(){terminated++;}})}),/clone failed/);
 assert.equal(terminated,4);
 for(const dispatch of [w=>w.onerror({message:'worker died'}),w=>w.onmessageerror(),w=>w.onmessage({data:null})]){
  await assert.rejects(sha256OfBlob(new Blob(['abc']),{createWorker:()=>({postMessage(){dispatch(this);},terminate(){terminated++;}})}));
 }
 assert.equal(terminated,7);
});
