import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';
import {syntheticThreads} from '../scripts/encryption-baseline.mjs';

// A heavy user (500 chats, 10,000 messages, 6 MB of text) must still open the vault, write, and compact in reasonable time. The limits are generous (node on a busy CI
// machine, no device speed implied): they exist to catch an accidental quadratic step, not to promise a phone's speed (docs/evidence/encryption/ has the device numbers).
const FAST=1000;
test('500 chats and 10,000 messages: store, unlock, rewrite one chat, compact',async()=>{
  const adapter=createMemoryAdapter(),vault=createVault({adapter});
  const threads=syntheticThreads(500,10000);
  const s=await vault.create('pw',{iterations:FAST});
  let t=performance.now();
  for(const th of threads)await s.putThread(th.id,th);
  const writeAll=performance.now()-t;
  const records=adapter.raw().log.length;
  t=performance.now();const again=await vault.unlock('pw');const unlockMs=performance.now()-t;
  assert.equal(again.state.threads.size,500);assert.deepEqual(again.damaged,[]);
  t=performance.now();for(let i=0;i<20;i++)await s.putThread('t7',{...threads[7],title:'edit '+i});const oneWriteMs=(performance.now()-t)/20;
  t=performance.now();await s.compact();const compactMs=performance.now()-t;
  const compacted=adapter.raw().log.length;
  console.log(JSON.stringify({writeAllMs:Math.round(writeAll),records,unlockMs:Math.round(unlockMs),oneWriteMs:+oneWriteMs.toFixed(1),compactMs:Math.round(compactMs),recordsAfterCompaction:compacted}));
  assert.ok(unlockMs<8000,'unlock '+unlockMs);
  assert.ok(oneWriteMs<150,'one chat write '+oneWriteMs);
  assert.ok(compactMs<8000,'compaction '+compactMs);
  assert.ok(compacted<=1000+2,'compaction leaves about one record per live chat plus keys: '+compacted);
  const after=await vault.unlock('pw');
  assert.equal(after.state.threads.size,500);assert.equal(after.state.threads.get('t7').title,'edit 19');
});
