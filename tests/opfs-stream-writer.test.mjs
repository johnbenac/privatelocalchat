import test from 'node:test';import assert from 'node:assert/strict';
import {writeOpfsStream} from '../runtime/providers/opfs-stream-writer.mjs';
function fixture({failAt,hangAt}={}){
 let terminated=0,cancelled=0,inFlight=0,maxInFlight=0;const operations=[],bytes=[];
 const worker={postMessage(m){operations.push(m.operation);maxInFlight=Math.max(maxInFlight,++inFlight);if(m.operation===hangAt)return;queueMicrotask(()=>{inFlight--;if(m.operation==='write')bytes.push(...m.chunk);worker.onmessage({data:{id:m.id,...(m.operation===failAt?{error:{name:'InvalidStateError',message:'fixture failure',operation:m.operation}}:{ok:true})}});});},terminate(){terminated++;}};
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));},cancel(){cancelled++;}});
 return {worker,stream,operations,stats:()=>({terminated,cancelled,maxInFlight,bytes})};
}
test('failed worker open, write and close always terminate the worker and cancel remaining input',async()=>{
 for(const failAt of ['open','write','close']){
  const f=fixture({failAt});let stream=f.stream;
  if(failAt==='close')stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1]));c.close();}});
  await assert.rejects(writeOpfsStream('cache-key',stream,{createWorker:()=>f.worker}),{name:'InvalidStateError',phase:failAt});assert.equal(f.stats().terminated,1);if(failAt!=='close')assert.equal(f.stats().cancelled,1);
 }
});
test('a hung operation times out, terminates and cancels without another operation in flight',async()=>{
 const f=fixture({hangAt:'write'});await assert.rejects(writeOpfsStream('cache-key',f.stream,{createWorker:()=>f.worker,timeoutMs:10}),{code:'opfs-write-timeout'});assert.equal(f.stats().terminated,1);assert.equal(f.stats().cancelled,1);assert.equal(f.stats().maxInFlight,1);
});
test('a stalled network read cancels the stream and releases the cache worker',async()=>{
 const f=fixture();await assert.rejects(writeOpfsStream('cache-key',f.stream,{createWorker:()=>f.worker,readTimeoutMs:10}),{code:'download-read-timeout'});assert.equal(f.stats().terminated,1);assert.equal(f.stats().cancelled,1);
});
test('successful writes are serial and close before worker termination',async()=>{
 const f=fixture(),stream=new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2]));c.enqueue(new Uint8Array([3]));c.close();}});
 await writeOpfsStream('cache-key',stream,{createWorker:()=>f.worker});assert.deepEqual(f.operations,['open','write','write','close']);assert.deepEqual(f.stats(),{terminated:1,cancelled:0,maxInFlight:1,bytes:[1,2,3]});
});
