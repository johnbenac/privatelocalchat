// U: plain physical recovery qualification smoke tests.
// Exercises the actual createLedgerStore.critical -> store.settlePending path, the direct
// settlePending fast path, and the raw settled-then-refused liveness case.
// Uses relative imports from the clone-owned checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memStorage, fakeLocks, openTab, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { memoryBackend, createCoordination, sha256Hex } from '../chat/encounters/coordination.mjs';
import { createLedgerStore } from '../chat/encounters/ledger-store.mjs';
import { outcomeOf } from '../chat/encounters/save-outcome.mjs';

// ============================================================================ U physical smoke: four actors, distinct views, one shared backend, one round
test('U physical smoke: four actors, distinct Storage views, one shared metadata backend, one round', async () => {
  const backend = memoryBackend();
  const views = [];
  for (let i = 0; i < 4; i++) {
    const storage = memStorage({ chatThreads: JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]) });
    views.push(storage);
  }
  const tabs = views.map((storage) => openTab({ storage, locks: fakeLocks(), storeOptions: { coordination: coordFor(storage, backend, { freshMs: 10 }) } }));
  const acked = [];
  for (const tab of tabs) {
    const m = { id: `m-${tab.threads[0].id}`, content: 'smoke', role: 'user', at: 1 };
    tab.threads[0].messages.push(m);
    const r = await tab.save();
    if (r.ok && !(r.conflicts || []).length) acked.push(m.id);
  }
  await new Promise((r) => setTimeout(r, 50));
  const chat = JSON.parse(views[0].getItem('chatThreads'));
  const ids = chat.find((t) => t.id === 'shared').messages.map((m) => m.id);
  const missing = acked.filter((id) => !ids.includes(id));
  assert.deepEqual(missing, [], 'all acknowledged messages survived');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate message ids');
  const ledger = JSON.parse(views[0].getItem('plc.encounters.v1'));
  assert.equal(ledger.intent, undefined, 'no intent left');
  // Backend identity: all four actors share the same coordination.backend object
  const backends = tabs.map((t) => t.store.coordination.backend);
  assert.equal(backends.every((b) => b === backends[0]), true, 'all four actors share the same backend');
  const storageViews = views.map((v) => v._m);
  assert.equal(storageViews[0] !== storageViews[1] && storageViews[0] !== storageViews[2] && storageViews[0] !== storageViews[3] && storageViews[1] !== storageViews[2] && storageViews[1] !== storageViews[3] && storageViews[2] !== storageViews[3], true, 'four distinct Storage views');
  console.log('U_BACKEND_IDENTITY', JSON.stringify({ actors: 4, views: 4, backends: 1 }));
});

// ============================================================================ U direct settlePending: actual createLedgerStore.critical -> store.settlePending path
test('U direct settlePending: rollback lands physically, ACK fails, next actor has stale forward view', async () => {
  const KEYS = ['plc.encounters.v1', 'chatThreads'];
  const L0 = JSON.stringify({ v: 1, rev: 0, epoch: 0, encounters: {}, participants: {}, events: {}, holders: {} });
  const L1 = JSON.stringify({ v: 1, rev: 1, epoch: 0, encounters: {}, participants: {}, events: {}, holders: {}, future: 'unacknowledged ledger mutation' });
  const backend = memoryBackend();
  let physical = { 'plc.encounters.v1': L0, chatThreads: '[]' };
  const aView = { ...physical };
  const make = (view) => createCoordination({ backend, keys: KEYS, read: (k) => view[k], freshMs: 1 });
  const a = make(aView);
  assert.equal((await a.acquire()).ok, true);
  assert.equal((await a.begin([{'plc.encounters.v1': L1}], { op: 'op-ledger', back: { 'plc.encounters.v1': L0 } })).ok, true);
  assert.equal((await a.beforeWrite(1)).ok, true);
  physical['plc.encounters.v1'] = L1;
  aView['plc.encounters.v1'] = L1;
  // Recovery actor: resolve back (rollback) but CAS fails
  const recovery1 = make({ ...physical });
  assert.equal((await recovery1.acquire()).ok, true);
  const first = await recovery1.resolve({
    target: 'back',
    texts: { 'plc.encounters.v1': L0, chatThreads: '[]' },
    order: KEYS,
    write: (k, v) => { physical[k] = v; backend.failing.cas = true; return true; }
  });
  assert.equal(first.ok, false);
  backend.failing.cas = false;
  assert.equal(physical['plc.encounters.v1'], L0, 'rollback landed physically');
  assert.equal(backend.peek().state, 'open', 'record still open');
  // Now use the actual settlePending fast path through createLedgerStore
  const oldView = { 'plc.encounters.v1': L1, chatThreads: '[]' };
  let writes = 0;
  const storage = {
    getItem: (k) => oldView[k] ?? null,
    setItem: (k, v) => { writes++; oldView[k] = String(v); physical[k] = String(v); },
    removeItem: (k) => { writes++; delete oldView[k]; delete physical[k]; }
  };
  const locks = { request: async (name, opts, fn) => fn({ name }) };
  const store = createLedgerStore({ storage, locks, coordination: make(oldView) });
  const second = await store.critical((tx) => store.settlePending(tx));
  const head = backend.peek();
  const actual = await sha256Hex(physical['plc.encounters.v1']);
  const freshResult = await make({ ...physical }).acquire();
  assert.equal(head.state, 'stable');
  assert.equal(head.keys['plc.encounters.v1'], actual, 'acknowledged pair must equal physical');
  assert.equal(freshResult.ok, true, 'fresh actor can acquire');
  console.log('SAFE DIRECT CASE: stable physical pair agrees after actual settlePending');
});

// ============================================================================ U raw settled-then-refused: liveness probe
test('U raw settled-then-refused: alpha settles/ACKs, beta conflicts because base remains0, new begin never occurs', async () => {
  const root = new URL('../', import.meta.url).href;
  const { outcomeOf: outcomeOfLocal } = await import('../chat/encounters/save-outcome.mjs');
  const storage = memStorage({ chatThreads: '[]' });
  const backend = memoryBackend();
  let failFirstAck = true;
  const tab = openTab({
    storage, locks: fakeLocks(),
    storeOptions: { coordination: coordFor(storage, backend, { freshMs: 10 }) },
    onPhase: (phase) => { if (phase === 'finalized' && failFirstAck) backend.failing.cas = true; }
  });
  tab.threads.push(thread('t', [msg('alpha', 'user', 'alpha')]));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome');
  assert.equal(backend.peek().state, 'open');
  // Second save: ACK now succeeds for the first operation
  failFirstAck = false;
  backend.failing.cas = false;
  backend.failing.casCount = 1;
  tab.thread('t').messages.push(msg('beta', 'user', 'beta'));
  const second = await tab.save();
  const outcome = outcomeOfLocal(second);
  const record = backend.peek();
  const stored = tab.stored();
  assert.equal(record.state, 'stable', 'earlier operation recovery ACK actually succeeded');
  assert.equal(record.last.op, first.unknown.op);
  assert.equal(record.last.outcome, 'applied');
  assert.deepEqual(stored[0].messages.map((m) => m.id), ['alpha'], 'new beta never reached payload storage');
  console.log(JSON.stringify({
    scope: 'actual S producer/commit/coordination/consumer; actual memory backend and supplied Storage/WebLocks/CAS limit, no UI/browser proof',
    first, second, outcome, oldOperationRecord: record, storedIds: stored[0].messages.map((m) => m.id)
  }, null, 2));
  assert.equal(outcome.unknown, false, 'a settled earlier operation must not be reopened as unknown when the new operation never began');
});
