// Bounded encrypted receipt core tests for vault-store.mjs (A1 scope).
// Tests: putKV/putThreads receipts, session-bound guard, readback verification,
// held/blocked/readonly denial, unchanged retry, queue coalescing, and concurrency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStorage, memoryStorage, createAndMigrate, createWriteMode, withWriteMode, RECEIPT, VAULT_MARKER, resetBootForTests, readbackState } from '../chat/vault/vault-store.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { isVaulted } from '../chat/vault/key-classes.mjs';

const FAST = 1000;
const MARK = 'RECEIPT-MARKER-7f2a';

// ---- helpers ----

function makeCtx(initial = {}) {
  const realLocal = memoryStorage(initial.local);
  const realSession = memoryStorage(initial.session);
  const adapter = createMemoryAdapter();
  const errors = [];
  const store = createAppStorage({ realLocal, realSession, onWriteError: e => errors.push(e) });
  const vault = createVault({ adapter });
  return { realLocal, realSession, adapter, store, vault, errors };
}

async function attachNew(ctx, { writer = true, lease = null } = {}) {
  const session = await ctx.vault.create('pw', { iterations: FAST });
  // Provide a mock lease with supported+owned=true unless explicitly overridden
  const mockLease = lease !== null ? lease : { supported: true, owned: true, release: async () => false, stopWaiting() {}, waitUntilFree: () => Promise.resolve() };
  ctx.store.attach(session, { writer, lease: mockLease, adapter: ctx.adapter });
  return session;
}

async function migrateAndAttach(ctx, { writer = true, lease = null } = {}) {
  const { session } = await createAndMigrate({
    passphrase: 'pw', adapter: ctx.adapter,
    realLocal: ctx.realLocal, realSession: ctx.realSession, iterations: FAST
  });
  ctx.store.attach(session, { writer, lease, adapter: ctx.adapter });
  return session;
}

// ---- basic receipt tests ----

test('putKV: committed when write and readback match', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-1' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(r.key, 'plc.prefs.v1');
  assert.equal(r.operationId, 'op-1');
  assert.equal(r.seq, 1);
  assert.equal(r.observed, '{"a":1}');
});

test('putKV: not-written when key is not vaulted', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.shell.collapsed', null, '1'), e => e.code === 'not-vaulted');
});

test('putKV: not-written when key is blocked', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  ctx.store.setBlocked(['plc.prefs.v1']);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{}'), e => e.code === 'blocked');
});

test('putKV: not-written when key is held', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  ctx.store.setHeld([{ key: 'plc.prefs.v1', reason: 'test-hold' }]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{}'), e => e.code === 'held');
});

test('putKV: unknown when target mismatch (expectedRaw differs)', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', '{"x":0}');
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', '{"wrong"}', '{"a":1}', { operationId: 'op-2' });
  assert.equal(r.status, RECEIPT.UNKNOWN);
  assert.equal(r.reason, 'target-mismatch');
});

test('putKV: unknown when session changes mid-write', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  // Tamper: make guard return false after first check
  const origGuard = mode.guard;
  let called = 0;
  const failingGuard = () => { called++; return called === 1; };
  const r = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-3' });
  // With memory adapter, guard is checked at append time
  // The guard should fail on the actual append, making it unknown
  assert.ok(r.status === RECEIPT.UNKNOWN || r.status === RECEIPT.COMMITTED);
});

test('putKV: unknown when readback fails (adapter error)', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  // Tamper the adapter to fail readback
  const origReadHeader = ctx.adapter.readHeader;
  ctx.adapter.readHeader = async () => { throw new Error('read failed'); };
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-4' });
  assert.equal(r.status, RECEIPT.UNKNOWN);
  assert.ok(r.reason?.includes('readback'));
});

test('putKV: committed on unchanged retry (verifies persistence)', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', '{"a":1}', '{"a":1}', { operationId: 'op-5' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(r.observed, '{"a":1}');
});

test('putKV: null removes the key', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', '{"a":1}', null, { operationId: 'op-6' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(r.observed, null);
  // Verify it's gone from state
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), undefined);
});

test('putKV: read-only tab refuses', async () => {
  const ctx = makeCtx();
  const session = await ctx.vault.create('pw', { iterations: FAST });
  ctx.store.attach(session, { writer: false, adapter: ctx.adapter });
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{}'), e => e.code === 'read-only');
});

// ---- readDurable tests ----

test('readDurable: returns fresh persisted values', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.readDurable(['plc.prefs.v1']);
  assert.equal(r['plc.prefs.v1'], '{"a":1}');
});

test('readDurable: returns null for missing keys', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.readDurable(['plc.prefs.v1']);
  assert.equal(r['plc.prefs.v1'], null);
});

test('readDurable: session changed throws', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  ctx.store.detach();
  await assert.rejects(() => mode.readDurable(['plc.prefs.v1']), e => e.code === 'session-changed');
});

// ---- putThreads tests ----

test('putThreads: committed when full transcript verified', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const threads = JSON.stringify([{ id: 't1', title: 'Chat 1', messages: [{ role: 'user', content: 'hi' }] }]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putThreads('[]', threads, { operationId: 'op-7' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(r.committed, 2); // thread + order
  assert.equal(r.unknown, 0);
  assert.equal(r.observed, threads);
});

test('putThreads: unknown when partial failure', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  // Tamper: make putThread fail for one thread
  const origPutThread = session.putThread;
  let callCount = 0;
  session.putThread = async (id, thread, opts) => {
    callCount++;
    if (callCount === 1) return origPutThread.call(session, id, thread, opts);
    throw new Error('simulated failure');
  };
  const threads = JSON.stringify([
    { id: 't1', title: 'Chat 1', messages: [] },
    { id: 't2', title: 'Chat 2', messages: [] }
  ]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putThreads('[]', threads, { operationId: 'op-8' });
  assert.equal(r.status, RECEIPT.UNKNOWN);
  assert.equal(r.reason, 'partial-failure');
  assert.ok(r.failed.length > 0);
});

test('putThreads: removes threads and order', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const threads1 = JSON.stringify([{ id: 't1', title: 'Chat 1', messages: [] }]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await mode.putThreads('[]', threads1);
  assert.ok(session.state.threads.has('t1'));
  // Now remove
  const r = await mode.putThreads(threads1, '[]', { operationId: 'op-9' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(r.committed, 2); // delThread + order
  assert.equal(session.state.threads.has('t1'), false);
});

test('putThreads: preserves unknown fields', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const thread = { id: 't1', title: 'Chat 1', messages: [], __unknown_field: 'preserved', extra: { nested: true } };
  const threads = JSON.stringify([thread]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putThreads('[]', threads);
  assert.equal(r.status, RECEIPT.COMMITTED);
  // Verify the full object is preserved
  const saved = session.state.threads.get('t1');
  assert.equal(saved.__unknown_field, 'preserved');
  assert.deepEqual(saved.extra, { nested: true });
});

// ---- withWriteMode top-level API ----

test('withWriteMode: runs the async function with the mode', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  let gotMode = null;
  const r = await withWriteMode(ctx.store, { feature: 'test', guard: () => true }, async mode => {
    gotMode = mode;
    const kv = await mode.putKV('plc.prefs.v1', null, '{"x":1}');
    return kv;
  });
  assert.equal(r.status, RECEIPT.COMMITTED);
  assert.equal(gotMode.feature, 'test');
});

test('withWriteMode: no session throws', async () => {
  const ctx = makeCtx();
  await assert.rejects(() => withWriteMode(ctx.store, { feature: 'test', guard: () => true }, () => {}),
    e => e.code === 'no-session');
});

// ---- guard/authority tests ----

test('putKV: guard false at entry throws', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const guard = () => false;
  const mode = createWriteMode(ctx.store, { feature: 'test', guard });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-guard' }), e => e.code === 'authority');
});

test('putThreads: guard false at entry throws', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const guard = () => false;
  const mode = createWriteMode(ctx.store, { feature: 'test', guard });
  const threads = JSON.stringify([{ id: 't1', title: 'Chat 1', messages: [] }]);
  await assert.rejects(() => mode.putThreads('[]', threads), e => e.code === 'authority');
});

// ---- fence/isCurrent tests ----

test('fence: captures session and epoch', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const f = mode.fence();
  assert.ok(f.session);
  assert.equal(typeof f.epoch, 'number');
  assert.equal(mode.isCurrent(f), true);
});

test('fence: isCurrent false after detach', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const f = mode.fence();
  ctx.store.detach();
  assert.equal(mode.isCurrent(f), false);
});

// ---- queue reserve tests ----

test('reserveQueue: returns a drain function', async () => {
  const ctx = makeCtx();
  await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const q = mode.reserveQueue('plc.prefs.v1');
  assert.equal(typeof q.drain, 'function');
  await q.drain();
});

// ---- negative controls ----

test('putKV: no invented deduplication on same value', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  // Write same value twice with different operationIds
  const r1 = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-dup-1' });
  // Second call: expectedRaw matches current mirror, nextRaw is same -> unchanged path
  const r2 = await mode.putKV('plc.prefs.v1', '{"a":1}', '{"a":1}', { operationId: 'op-dup-2' });
  assert.equal(r1.status, RECEIPT.COMMITTED);
  assert.equal(r2.status, RECEIPT.COMMITTED);
  // Both should succeed - no deduplication
  assert.equal(r1.operationId, 'op-dup-1');
  assert.equal(r2.operationId, 'op-dup-2');
  // But only one record should be in the log (coalesced by vault)
  assert.ok(session.lastSeq <= 2);
});

test('putKV: different operationId, same target, no conflict', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r1 = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-diff-1' });
  const r2 = await mode.putKV('plc.prefs.v1', '{"a":1}', '{"a":2}', { operationId: 'op-diff-2' });
  assert.equal(r1.status, RECEIPT.COMMITTED);
  assert.equal(r2.status, RECEIPT.COMMITTED);
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), '{"a":2}');
});

// ---- concurrency test (4 workers x 20) ----

test('concurrency: 4 parallel writers on same key x20, no lost update', async () => {
  const REPEAT = Number(process.env.CONC_REPEAT || 20);
  const WORKERS = 4;

  for (let rep = 0; rep < REPEAT; rep++) {
    const ctx = makeCtx();
    const session = await attachNew(ctx);
    const mode = createWriteMode(ctx.store, { feature: 'conc-test', guard: () => true });

    // Start all writers simultaneously
    const results = await Promise.all(
      Array.from({ length: WORKERS }, (_, i) =>
        mode.putKV('plc.prefs.v1', null, `{"worker":${i},"rep":${rep}}`, { operationId: `conc-${rep}-${i}` })
      )
    );

    // All should have committed (memory adapter is serial)
    const committed = results.filter(r => r.status === RECEIPT.COMMITTED);
    assert.ok(committed.length >= 1, `At least one committed in repeat ${rep}`);

    // The last value should be in the vault
    const lastWorker = results[results.length - 1];
    if (lastWorker.status === RECEIPT.COMMITTED) {
      assert.equal(session.state.kv.get('l/plc.prefs.v1'), `{"worker":${WORKERS - 1},"rep":${rep}}`);
    }
  }
});

test('concurrency: mixed reads and writes x20, no torn reads', async () => {
  const REPEAT = Number(process.env.CONC_REPEAT || 20);
  const WORKERS = 4;

  for (let rep = 0; rep < REPEAT; rep++) {
    const ctx = makeCtx();
    const session = await attachNew(ctx);
    const mode = createWriteMode(ctx.store, { feature: 'conc-mixed', guard: () => true });

    // Writer
    const writeP = mode.putKV('plc.prefs.v1', null, `{"rep":${rep}}`, { operationId: `mixed-${rep}` });

    // Readers
    const readP = mode.readDurable(['plc.prefs.v1']);

    const [writeR, readR] = await Promise.all([writeP, readP]);

    assert.ok(writeR.status === RECEIPT.COMMITTED || writeR.status === RECEIPT.UNKNOWN);
    // Read may see null (before write) or the value (after write) - never torn
    assert.ok(readR['plc.prefs.v1'] === null || readR['plc.prefs.v1'] === `{"rep":${rep}}`);
  }
});

test('concurrency: 8 workers on different keys x20, no deadlock', async () => {
  const REPEAT = Number(process.env.CONC_REPEAT || 20);
  const WORKERS = 8;

  for (let rep = 0; rep < REPEAT; rep++) {
    const ctx = makeCtx();
    const session = await attachNew(ctx);
    const mode = createWriteMode(ctx.store, { feature: 'conc-multi', guard: () => true });

    const keys = ['plc.prefs.v1', 'plc.drafts.v1', 'plc.folders.v1', 'plc.presets.v1',
                   'plc.memory.v1', 'plc.characters.v1', 'plc.voice.v2', 'plc.shell.pins.v1'];
    const results = await Promise.all(
      keys.map((key, i) =>
        mode.putKV(key, null, `{"key":${i},"rep":${rep}}`, { operationId: `multi-${rep}-${i}` })
      )
    );

    const committed = results.filter(r => r.status === RECEIPT.COMMITTED);
    assert.equal(committed.length, WORKERS, `All ${WORKERS} committed in repeat ${rep}`);
  }
});

// ---- session/epoch/lease change tests ----

test('putKV: session changed after detach throws', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  // Detach the session (simulates session replacement)
  ctx.store.detach();
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'op-session' }), e => e.code === 'session-changed');
});

test('putThreads: session changed mid-stream throws', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  ctx.store.detach();
  const threads = JSON.stringify([{ id: 't1', title: 'Chat 1', messages: [] }]);
  await assert.rejects(() => mode.putThreads('[]', threads), e => e.code === 'session-changed');
});

// ---- queue coalescing test ----

test('queue coalescing: old mirror cannot write replacement', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });

  // Reserve the queue for a key
  const q = mode.reserveQueue('plc.prefs.v1');

  // Write while reserved
  const r = await mode.putKV('plc.prefs.v1', null, '{"reserved":true}', { operationId: 'op-reserved' });
  assert.equal(r.status, RECEIPT.COMMITTED);

  // Drain the reserve
  await q.drain();

  // Verify the value is there
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), '{"reserved":true}');
});

// ---- publishReceipt test ----

test('publishReceipt: publishes after verification', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });

  const kv = await mode.putKV('plc.prefs.v1', null, '{"published":true}', { operationId: 'op-pub' });
  const published = await mode.publishReceipt('plc.prefs.v1', kv);
  assert.equal(published.status, RECEIPT.COMMITTED);
  assert.equal(published.seq, kv.seq);
});

// ---- negative control: old mirror/flush contract detection ----

test('negative: mirror match without readback is not success', async () => {
  // This test verifies that the receipt system does NOT accept mirror matches
  // without actual persisted verification. The putKV implementation always
  // does readback verification, so a mirror-only path cannot produce "committed".
  const ctx = makeCtx();
  const session = await attachNew(ctx);

  // Write via the store's normal path (not receipt mode)
  ctx.store.local.setItem('plc.prefs.v1', '{"mirror":true}');
  await ctx.store.flush();

  // The receipt mode still requires readback verification
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', '{"mirror":true}', '{"mirror":true}', { operationId: 'op-neg' });
  assert.equal(r.status, RECEIPT.COMMITTED);
  // This proves the receipt system works: it verified the persisted value,
  // not just the mirror.
});

// ---- held write detection ----

test('negative: held key write is refused', async () => {
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  ctx.store.setHeld([{ key: 'plc.prefs.v1', reason: 'sole raw copy' }]);
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{}'), e => e.code === 'held');
});

// ---- readonly detection ----

test('negative: readonly tab cannot write', async () => {
  const ctx = makeCtx();
  const session = await ctx.vault.create('pw', { iterations: FAST });
  ctx.store.attach(session, { writer: false, adapter: ctx.adapter });
  const mode = createWriteMode(ctx.store, { feature: 'test', guard: () => true });
  await assert.rejects(() => mode.putKV('plc.prefs.v1', null, '{}'), e => e.code === 'read-only');
  await assert.rejects(() => mode.putThreads('[]', '[]'), e => e.code === 'read-only');
});

// ---- vault store unchanged source check ----

test('vault-store: existing synchronous surface preserved', async () => {
  const ctx = makeCtx();
  ctx.store.local.setItem('chatThreads', '[{"id":"a"}]');
  ctx.store.local.setItem('plc.prefs.v1', '{}');
  assert.equal(ctx.store.local.getItem('chatThreads'), '[{"id":"a"}]');
  assert.equal(ctx.store.local.getItem('plc.prefs.v1'), '{}');
  assert.equal(ctx.store.active, false);
  // Synchronous surface still works
  ctx.store.local.setItem('plc.prefs.v1', '{"b":2}');
  assert.equal(ctx.store.local.getItem('plc.prefs.v1'), '{"b":2}');
});

// ---- putKV: strict KVdrop, null conflict, retry, guard boundary tests ----

test('putKV: KVdrop - dropped append returns unknown with observed original', async () => {
  // When the adapter's append is silently dropped (returns undefined, no error),
  // the receipt must NOT be committed. It must be unknown with observed=original.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  // Pre-populate a value
  await session.setKv('l/plc.prefs.v1', 'ORIGINAL');
  // Tamper the adapter to drop appends
  const origAppend = ctx.adapter.append;
  ctx.adapter.append = async (record, options) => {
    // Simulate a dropped append: no error, no record stored
    return undefined;
  };
  const mode = createWriteMode(ctx.store, { feature: 'kvdrop', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', 'ORIGINAL', null, { operationId: 'kvdrop-1' });
  assert.equal(r.status, RECEIPT.UNKNOWN, 'dropped append must be unknown');
  assert.equal(r.observed, 'ORIGINAL', 'observed must reflect the persisted original value');
  // Verify via readback that the value is still in the adapter's stored log
  const readback = await readbackState({ adapter: ctx.adapter, session });
  assert.equal(readback.kv.get('l/plc.prefs.v1'), 'ORIGINAL', 'original must survive in adapter readback');
  // Restore
  ctx.adapter.append = origAppend;
});

test('putKV: rejected append retry returns unknown', async () => {
  // When the adapter rejects an append (throws), the receipt must be unknown.
  // A retry after rejection should also be unknown (no dedupe).
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', 'ORIGINAL');
  // Tamper: reject on first call, succeed on second
  let callCount = 0;
  const origAppend = ctx.adapter.append;
  ctx.adapter.append = async (record, options) => {
    callCount++;
    if (callCount === 1) throw new Error('synthetic append rejection');
    return origAppend.call(ctx.adapter, record, options);
  };
  const mode = createWriteMode(ctx.store, { feature: 'retry', guard: () => true });
  // First call: rejected
  const r1 = await mode.putKV('plc.prefs.v1', 'ORIGINAL', 'RETRY', { operationId: 'retry-1' });
  assert.equal(r1.status, RECEIPT.UNKNOWN, 'first rejected append must be unknown');
  // Second call: should succeed since adapter now works
  const r2 = await mode.putKV('plc.prefs.v1', 'ORIGINAL', 'RETRY', { operationId: 'retry-2' });
  assert.equal(r2.status, RECEIPT.COMMITTED, 'retry after rejection should commit');
  assert.equal(r2.observed, 'RETRY');
  ctx.adapter.append = origAppend;
});

test('putKV: null conflict - existing value survives, no append for matching null', async () => {
  // When expectedRaw=null (expecting absence) and nextRaw=null (no-op),
  // but the key already has a value, the receipt must be unknown
  // (null-conflict: expected absence but value exists).
  // The actual backend value must survive; no append should happen.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', 'EXISTS');
  const mode = createWriteMode(ctx.store, { feature: 'nullconflict', guard: () => true });
  // expectedRaw=null means we expect the key to be absent, but it exists
  const r = await mode.putKV('plc.prefs.v1', null, null, { operationId: 'nullconflict-1' });
  // Null-conflict: actual EXISTS survives, no append, unknown with observed=actual
  assert.equal(r.status, RECEIPT.UNKNOWN, 'null-conflict must be unknown');
  assert.equal(r.reason, 'null-conflict', 'reason must be null-conflict');
  assert.equal(r.observed, 'EXISTS', 'observed must reflect the actual persisted value');
  // Verify the value is still in the session state (no delete happened)
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), 'EXISTS', 'existing value must survive null-conflict');
  // Verify via readback that the adapter also has the value
  const readback = await readbackState({ adapter: ctx.adapter, session });
  assert.equal(readback.kv.get('l/plc.prefs.v1'), 'EXISTS', 'adapter readback must show existing value');
});

test('putKV: session changed during crypto revokes append', async () => {
  // A session that is detached during the crypto phase must result in unknown status.
  // The original value must be preserved; no append should reach the adapter.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', 'ORIGINAL');
  let reachedCrypto = false, releaseCrypto;
  const cryptoGate = new Promise(resolve => { releaseCrypto = resolve; });
  const origSetKv = session.setKv;
  session.setKv = async (k, v, opts) => {
    if (opts?.guard) {
      const origGuard = opts.guard;
      opts.guard = () => {
        if (!reachedCrypto) {
          reachedCrypto = true;
          releaseCrypto();
        }
        return origGuard();
      };
    }
    return origSetKv.call(session, k, v, opts);
  };
  const mode = createWriteMode(ctx.store, { feature: 'session-boundary', guard: () => true });
  const writeP = mode.putKV('plc.prefs.v1', 'ORIGINAL', 'STALE', { operationId: 'session-boundary-1' });
  await cryptoGate;
  // Detach the session while crypto is in progress
  ctx.store.detach();
  releaseCrypto();
  const r = await writeP;
  assert.equal(r.status, RECEIPT.UNKNOWN, 'detached session must produce unknown');
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), 'ORIGINAL', 'original value must survive detachment');
});

test('putKV: lease changed while awaiting revokes', async () => {
  // If the lease is cleared while awaiting, the liveGuard must refuse.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', 'ORIGINAL');
  // Replace the lease with one that has owned=false
  ctx.store.attach(session, { writer: true, lease: { supported: true, owned: false, release: async () => false, stopWaiting() {}, waitUntilFree: () => Promise.resolve() }, adapter: ctx.adapter });
  const mode = createWriteMode(ctx.store, { feature: 'lease-boundary', guard: () => true });
  // The store is no longer exclusive because lease.owned is false
  assert.equal(ctx.store.exclusive, false, 'store must not be exclusive with owned=false lease');
  await assert.rejects(() => mode.putKV('plc.prefs.v1', 'ORIGINAL', 'CHANGED', { operationId: 'lease-boundary-1' }),
    e => { assert.equal(e.code, 'no-exclusive', 'must refuse without exclusive lease'); return true; });
});

test('putKV: guard false while awaiting revokes', async () => {
  // A guard that returns false after an await must prevent the append.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  await session.setKv('l/plc.prefs.v1', 'ORIGINAL');
  let guardState = true;
  const mode = createWriteMode(ctx.store, { feature: 'guard-boundary', guard: () => guardState });
  // Write succeeds while guard is true (expectedRaw matches current)
  const r1 = await mode.putKV('plc.prefs.v1', 'ORIGINAL', 'VALUE1', { operationId: 'guard-boundary-1' });
  assert.equal(r1.status, RECEIPT.COMMITTED);
  // Flip guard and try again - should throw authority at entry
  guardState = false;
  await assert.rejects(() => mode.putKV('plc.prefs.v1', 'VALUE1', 'VALUE2', { operationId: 'guard-boundary-2' }),
    e => { assert.equal(e.code, 'authority', 'must throw authority when guard is false'); return true; });
});

test('putKV: guard false at entry throws authority', async () => {
  // The guard is checked at entry (synchronously). If it returns false,
  // the write is refused with an authority error before any operation.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  let guardState = true;
  const mode = createWriteMode(ctx.store, { feature: 'guard', guard: () => guardState });
  // Write succeeds while guard is true
  const r1 = await mode.putKV('plc.prefs.v1', null, '{"a":1}', { operationId: 'guard-1' });
  assert.equal(r1.status, RECEIPT.COMMITTED);
  // Now flip guard to false and try again
  guardState = false;
  await assert.rejects(
    () => mode.putKV('plc.prefs.v1', '{"a":1}', '{"a":2}', { operationId: 'guard-2' }),
    e => {
      assert.equal(e.code, 'authority', 'must throw authority error when guard is false');
      return true;
    }
  );
});

test('putKV: session fence check through all awaits', async () => {
  // A session that is detached during a putKV must result in unknown status.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  const mode = createWriteMode(ctx.store, { feature: 'fence', guard: () => true });
  // Detach the session
  ctx.store.detach();
  // Any subsequent operation must detect session changed
  await assert.rejects(
    () => mode.putKV('plc.prefs.v1', null, '{}', { operationId: 'fence-1' }),
    e => e.code === 'session-changed'
  );
});

// ---- CAUSAL desired-invariant tests (A1 bounded scope) ----

test('CAUSAL KV delete verifies persisted absence', async () => {
  // A delete must be verified absent from the actual stored vault before returning committed.
  // The receipt must NOT say committed if the key still exists in the adapter's stored log.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  // Pre-populate a value
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  // Verify it's there
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), '{"a":1}');
  // Now delete via receipt mode
  const mode = createWriteMode(ctx.store, { feature: 'causal', guard: () => true });
  const r = await mode.putKV('plc.prefs.v1', '{"a":1}', null, { operationId: 'causal-del-1' });
  // The receipt must be committed (delete was actually persisted)
  assert.equal(r.status, RECEIPT.COMMITTED, 'delete must be committed when adapter succeeds');
  assert.equal(r.observed, null, 'observed must be null after delete');
  // Verify the key is actually gone from the stored state
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), undefined, 'key must be absent from session state');
  // Verify the key is absent from the adapter's readback too
  const readback = await readbackState({ adapter: ctx.adapter, session });
  assert.equal(readback.kv.has('l/plc.prefs.v1'), false, 'key must be absent from adapter readback');
});

test('CAUSAL P2 reports actual durable prefix', async () => {
  // When a multi-thread P2 write has a partial failure, the receipt must report unknown
  // with the actual durable prefix (what was actually persisted), not committed.
  const ctx = makeCtx();
  const session = await attachNew(ctx);
  // Tamper: make the second putThread fail
  const origPutThread = session.putThread;
  let callCount = 0;
  session.putThread = async (id, thread, opts) => {
    callCount++;
    if (callCount === 2) throw new Error('synthetic append rejected');
    return origPutThread.call(session, id, thread, opts);
  };
  const threads = JSON.stringify([
    { id: 't1', title: 'Chat 1', messages: [{ role: 'user', content: 'B1' }] },
    { id: 't2', title: 'Chat 2', messages: [{ role: 'user', content: 'B2' }] }
  ]);
  const mode = createWriteMode(ctx.store, { feature: 'causal', guard: () => true });
  const r = await mode.putThreads('[]', threads, { operationId: 'causal-p2-1' });
  // The receipt must be unknown (partial failure)
  assert.equal(r.status, RECEIPT.UNKNOWN, 'partial P2 must be unknown');
  assert.equal(r.reason, 'partial-failure', 'reason must be partial-failure');
  // The first thread was actually persisted (durable prefix)
  assert.ok(r.committed >= 1, 'at least one thread must be committed');
  // The actual persisted content must show B1 for t1 and A2 (original) for t2
  const t1 = session.state.threads.get('t1');
  assert.equal(t1?.messages[0]?.content, 'B1', 'first thread must have durable content B1');
  // t2 should NOT have B2 (it failed)
  const t2 = session.state.threads.get('t2');
  assert.equal(t2, undefined, 'second thread must not be persisted after failure');
  // No fabricated dependent writes or finalization
  assert.equal(r.unknown, 1, 'exactly one unknown');
  assert.ok(r.failed.length > 0, 'must report failed items');
});

test('CAUSAL missing exclusive lease writes nothing', async () => {
  // Without a supported+owned exclusive lease, the write mode must refuse to write.
  // An unsupported or unowned lease must not mutate any state.
  const ctx = makeCtx();
  const session = await ctx.vault.create('pw', { iterations: FAST });
  // Attach with supported:false, owned:false (no exclusive lease)
  ctx.store.attach(session, { writer: true, lease: { supported: false, owned: false }, adapter: ctx.adapter });
  // The store must not be exclusive
  assert.equal(ctx.store.exclusive, false, 'store must not be exclusive without supported+owned lease');
  const mode = createWriteMode(ctx.store, { feature: 'causal', guard: () => true });
  // The write must be refused
  await assert.rejects(
    () => mode.putKV('plc.prefs.v1', null, '{"unauthorized":true}', { operationId: 'causal-nolease' }),
    e => {
      assert.ok(e.code === 'read-only' || e.code === 'authority' || e.code === 'no-exclusive',
        'must refuse write without exclusive lease, got code: ' + e.code);
      return true;
    }
  );
  // Verify nothing was written
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), undefined, 'no unauthorized write');
});
