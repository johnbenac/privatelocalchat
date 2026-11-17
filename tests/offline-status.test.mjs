import test from 'node:test';
import assert from 'node:assert/strict';
import {createOfflineStatusProbe} from '../runtime/offline-status.mjs';

test('an old controller reply cannot overwrite readiness from the new controller',()=>{
 const channels=[],results=[];let current={postMessage(){}};
 const old=current;
 const probe=createOfflineStatusProbe({getController:()=>current,expectedCache:'new',onResult:r=>results.push(r),makeChannel:()=>{const c={port1:{close(){}},port2:{}};channels.push(c);return c;}});
 probe();current={postMessage(){}};probe();
 channels[1].port1.onmessage({data:{cache:'new'}});
 channels[0].port1.onmessage({data:{cache:'old'}});
 assert.deepEqual(results,[true]);
 current=old;probe();current=null;channels[2].port1.onmessage({data:{cache:'new'}});
 assert.deepEqual(results,[true]);
});

test('only the newest probe can update status, including when the worker is unchanged',()=>{
 const channels=[],results=[];const worker={postMessage(){}};
 const probe=createOfflineStatusProbe({getController:()=>worker,expectedCache:'new',onResult:r=>results.push(r),makeChannel:()=>{const c={port1:{close(){}},port2:{}};channels.push(c);return c;}});
 probe();probe();channels[1].port1.onmessage({data:{cache:'new'}});channels[0].port1.onmessage({data:{cache:'old'}});
 assert.deepEqual(results,[true]);
 probe();channels[2].port1.onmessage({data:{unrelated:true}});assert.deepEqual(results,[true]);
});

test('the worker\'s extra details reach the result',()=>{
  const channels=[],results=[];let worker={postMessage(){}};
  const probe=createOfflineStatusProbe({getController:()=>worker,expectedCache:'new',onResult:(r,d)=>results.push([r,d]),makeChannel:()=>{const c={port1:{close(){}},port2:{}};channels.push(c);return c;}});
  probe();channels[0].port1.onmessage({data:{cache:'new',bulkSaved:3,bulkExpected:8}});
  assert.deepEqual(results,[[true,{cache:'new',bulkSaved:3,bulkExpected:8}]]);
});
