import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';

const FAST = 1000;

test('fresh CREATE: first append is seq 1, reopen shows history complete', async () => {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('pass', { iterations: FAST });
  await session.putThread('t1', { id: 't1', messages: [{ role: 'user', content: 'hello' }] });
  // putThread writes key.put (seq 1) + thread.put (seq 2), so lastSeq=2
  assert.equal(session.lastSeq, 2);
  assert.equal(session.history.observedHistoryComplete, false);
  session.lock();
  const fresh = await vault.unlock('pass');
  // Log has 2 records (key.put + thread.put), starts at seq 1, contiguous, all readable
  assert.equal(fresh.lastSeq, 2);
  assert.equal(fresh.history.observedHistoryComplete, true);
  assert.equal(fresh.state.threads.size, 1);
  assert.deepEqual(fresh.damaged, []);
  fresh.lock();
});

test('existing empty UNLOCK -> failed append -> retry -> reopen: history false', async () => {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  // Create and lock to establish the vault with an empty log (reserves seq 1)
  const s1 = await vault.create('pass', { iterations: FAST });
  s1.lock();
  // Unlock: log is empty, so lastSeq=1 (reserved), history is NOT complete
  const s2 = await vault.unlock('pass');
  assert.equal(s2.lastSeq, 1);
  assert.equal(s2.history.observedHistoryComplete, false);
  // Try an append that will fail (guard returns false)
  let guardCalled = false;
  await assert.rejects(
    () => s2.append({ scope: 'c:x', event: { t: 'thread.put', id: 'x', thread: { id: 'x' } } }, { guard: () => { guardCalled = true; return false; } }),
    (e) => e.code === 'session-changed' && guardCalled
  );
  // Retry with setKv (writes 1 record since keyId=KEY_DEK): seq 2
  await s2.setKv('x', '1');
  assert.equal(s2.lastSeq, 2);
  s2.lock();
  // Reopen: history should be false because the log started at seq 1 but seq 1 was never observed (empty log reserved it)
  const s3 = await vault.unlock('pass');
  assert.equal(s3.lastSeq, 2);
  assert.equal(s3.history.observedHistoryComplete, false);
  assert.equal(s3.state.kv.get('x'), '1');
  s3.lock();
});
