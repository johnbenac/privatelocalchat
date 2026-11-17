import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDownload,retryDelay} from '../runtime/providers/download-retry.mjs';

test('transient failures retry with bounded backoff and preserve the successful result',async()=>{
  let calls=0;const progress=[],delays=[];
  const result=await retryDownload(async()=>{if(++calls<3)throw new TypeError('Failed to fetch');return 'verified';},{onRetry:p=>progress.push(p),pause:async ms=>delays.push(ms)});
  assert.equal(result,'verified');assert.equal(calls,3);assert.deepEqual(delays,[1000,2000]);assert.equal(progress[1].retryAttempt,2);
  calls=0;await assert.rejects(()=>retryDownload(async()=>{calls++;throw Error('HTTP 503');},{pause:async()=>{}}),/503/);assert.equal(calls,4);
});
test('cancellation, exhausted quota and permanent HTTP failures do not retry',async()=>{
  for(const error of [new DOMException('Stopped','AbortError'),new DOMException('Full','QuotaExceededError'),Error('HTTP 404'),Error('HTTP 403'),Error('out of memory')]){
    let calls=0;await assert.rejects(()=>retryDownload(async()=>{calls++;throw error;}));assert.equal(calls,1);
  }
});
test('Cancel interrupts retry sleep without another transfer',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(()=>retryDownload(async()=>{calls++;throw Error('Network failure');},{signal:controller.signal,pause:async(ms,signal)=>{const waiting=retryDelay(ms,signal);controller.abort();await waiting;}}),{name:'AbortError'});
  assert.equal(calls,1);
});
