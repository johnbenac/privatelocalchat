import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault, chatKeyId} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';

const FAST = 1000;

// Guarded delThread: optional guard forwards to BOTH thread.del and key.destroy write calls

test('guard=false before first write: thread.del never reaches adapter, thread and key preserved', async () => {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('pass', { iterations: FAST });
  await session.putThread('t1', { id: 't1', messages: [{ role: 'user', content: 'hello' }] });
  const initialLogLen = adapter.raw().log.length;
  let appendCalled = false;
  const originalAppend = adapter.append.bind(adapter);
  adapter.append = async (record, options) => {
    appendCalled = true;
    return originalAppend(record, options);
  };
  await assert.rejects(
    () => session.delThread('t1', { guard: () => false }),
    (e) => e.code === 'session-changed'
  );
  assert.equal(appendCalled, false, 'no append was called when guard returned false before first write');
  assert.equal(adapter.raw().log.length, initialLogLen, 'log unchanged');
  const fresh = await vault.unlock('pass');
  assert.ok(fresh.state.threads.has('t1'), 'thread still exists');
  assert.ok(fresh.state.keys.has(chatKeyId('t1')), 'key still exists');
  fresh.lock();
  session.lock();
});

test('guard lost between thread.del and key.destroy: thread.del is durable, key.destroy rejected, key preserved', async () => {
  // Use the observer pattern from probe.mjs: guard closure is shared, adapter flips it after first append
  let allow = true;
  let hit = 0;
  const base = createMemoryAdapter();
  const adapter = {
    ...base,
    async append(...args) {
      const out = await base.append(...args);
      if (hit === 0) { hit++; allow = false; }
      return out;
    }
  };
  const vault = createVault({ adapter });
  const session = await vault.create('pass', { iterations: FAST });
  await session.putThread('t1', { id: 't1', messages: [{ role: 'user', content: 'hello' }] });
  hit = 0;
  allow = true;
  // Pass the SAME guard closure to delThread; the adapter flips allow=false after first append commits
  await assert.rejects(
    () => session.delThread('t1', { guard: () => allow }),
    (e) => e.code === 'session-changed'
  );
  // Exactly one new record (thread.del) was stored before guard was lost
  const raw = adapter.raw();
  const newRecords = raw.log.filter(r => r.seq > 2);
  assert.equal(newRecords.length, 1, 'exactly one new record (thread.del) stored');
  const fresh = await vault.unlock('pass');
  assert.ok(!fresh.state.threads.has('t1'), 'thread removed (durable)');
  assert.ok(fresh.state.keys.has(chatKeyId('t1')), 'key preserved (destroy rejected)');
  fresh.lock();
  session.lock();
});

test('no-option delThread: both writes succeed, thread and key removed', async () => {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('pass', { iterations: FAST });
  await session.putThread('t1', { id: 't1', messages: [{ role: 'user', content: 'hello' }] });
  const initialLogLen = adapter.raw().log.length;
  await session.delThread('t1');
  assert.equal(adapter.raw().log.length, initialLogLen + 2, 'both thread.del and key.destroy written');
  assert.ok(!session.state.threads.has('t1'), 'thread removed from state');
  assert.ok(!session.state.keys.has(chatKeyId('t1')), 'key removed from state');
  const fresh = await vault.unlock('pass');
  assert.ok(!fresh.state.threads.has('t1'), 'thread absent from fresh state');
  assert.ok(!fresh.state.keys.has(chatKeyId('t1')), 'key absent from fresh state');
  fresh.lock();
  session.lock();
});

// Repeat guard/barrier cases on synthetic memory adapter with explicit counts
test('delThread captures the original guard before queued work', async () => {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('pass', { iterations: FAST });
  await session.putThread('t1', { id: 't1', messages: [{ role: 'user', content: 'hello' }] });
  const initialLogLen = adapter.raw().log.length;
  const options = { guard: () => false };
  const deletion = session.delThread('t1', options);
  options.guard = () => true;
  await assert.rejects(
    deletion,
    (e) => e.code === 'session-changed'
  );
  assert.equal(adapter.raw().log.length, initialLogLen, 'no log growth');
  const fresh = await vault.unlock('pass');
  assert.ok(fresh.state.threads.has('t1'), 'thread preserved');
  assert.ok(fresh.state.keys.has(chatKeyId('t1')), 'key preserved');
  fresh.lock();
  session.lock();
});

test('guard barrier: 20 repeats false-beforefirst', async () => {
  for (let i = 0; i < 20; i++) {
    const adapter = createMemoryAdapter();
    const vault = createVault({ adapter });
    const session = await vault.create('pass', { iterations: FAST });
    await session.putThread('t1', { id: 't1', messages: [] });
    let appendCalled = false;
    const orig = adapter.append.bind(adapter);
    adapter.append = async (r, o) => { appendCalled = true; return orig(r, o); };
    await assert.rejects(
      () => session.delThread('t1', { guard: () => false }),
      (e) => e.code === 'session-changed'
    );
    assert.equal(appendCalled, false, `repeat ${i}: no append called`);
    const fresh = await vault.unlock('pass');
    assert.ok(fresh.state.threads.has('t1'), `repeat ${i}: thread preserved`);
    assert.ok(fresh.state.keys.has(chatKeyId('t1')), `repeat ${i}: key preserved`);
    fresh.lock();
    session.lock();
  }
});

test('guard barrier: 20 repeats no-option-positive', async () => {
  for (let i = 0; i < 20; i++) {
    const adapter = createMemoryAdapter();
    const vault = createVault({ adapter });
    const session = await vault.create('pass', { iterations: FAST });
    await session.putThread('t1', { id: 't1', messages: [] });
    const initialLogLen = adapter.raw().log.length;
    await session.delThread('t1');
    assert.equal(adapter.raw().log.length, initialLogLen + 2, `repeat ${i}: initial+2 records`);
    const fresh = await vault.unlock('pass');
    assert.ok(!fresh.state.threads.has('t1'), `repeat ${i}: thread gone`);
    assert.ok(!fresh.state.keys.has(chatKeyId('t1')), `repeat ${i}: key gone`);
    fresh.lock();
    session.lock();
  }
});

test('guard barrier: 20 repeats between-writes', async () => {
  for (let i = 0; i < 20; i++) {
    let allow = true;
    let hit = 0;
    const base = createMemoryAdapter();
    const adapter = {
      ...base,
      async append(...args) {
        const out = await base.append(...args);
        if (hit === 0) { hit++; allow = false; }
        return out;
      }
    };
    const vault = createVault({ adapter });
    const session = await vault.create('pass', { iterations: FAST });
    await session.putThread('t1', { id: 't1', messages: [] });
    hit = 0;
    allow = true;
    // Pass the SAME guard closure; adapter flips allow after first append commits
    await assert.rejects(
      () => session.delThread('t1', { guard: () => allow }),
      (e) => e.code === 'session-changed'
    );
    const raw = adapter.raw();
    const newRecords = raw.log.filter(r => r.seq > 2);
    assert.equal(newRecords.length, 1, `repeat ${i}: exactly one new record`);
    const fresh = await vault.unlock('pass');
    assert.ok(!fresh.state.threads.has('t1'), `repeat ${i}: thread removed`);
    assert.ok(fresh.state.keys.has(chatKeyId('t1')), `repeat ${i}: key preserved`);
    fresh.lock();
    session.lock();
  }
});
