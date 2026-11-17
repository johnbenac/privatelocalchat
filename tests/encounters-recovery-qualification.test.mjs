// U: plain physical recovery qualification smoke tests.
// Exercises the actual createLedgerStore.critical -> store.settlePending path, the direct
// settlePending fast path, and the raw settled-then-refused liveness case.
// Uses relative imports from the clone-owned checkout.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memStorage, fakeLocks, openTab, thread, msg, makeMessage, coordFor } from './helpers/encounters-env.mjs';
import { browser, lockManager, sleep, within } from './helpers/browser-model.mjs';
import { memoryBackend, createCoordination, sha256Hex } from '../chat/encounters/coordination.mjs';
import { createLedgerStore } from '../chat/encounters/ledger-store.mjs';
import { outcomeOf } from '../chat/encounters/save-outcome.mjs';

// ============================================================================ U physical smoke: four actors, distinct views, one shared backend, one round
test('U physical smoke: four actors, distinct Storage views, one shared metadata backend, one round', async () => {
  // Existing store-safety world()/round() pattern at n=4, K=1: ONE browser physical truth with four lagging own views, ONE lock manager, ONE metadata backend.
  const n = 4;
  const b = browser(n, { lag: 8 }); const locks = lockManager(); const sameBackend = memoryBackend();
  b.tabs[0].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  await sleep(8 + 20);   // seed delivery before any actor starts
  const open = b.tabs.map((storage) => openTab({ storage, locks, storeOptions: { coordination: coordFor(storage, sameBackend, { freshMs: 3000 }) } }));
  const acked = [];
  let go; const barrier = new Promise((res) => { go = res; });
  const running = Promise.all(open.map(async (tab, i) => {
    await barrier;
    const m = makeMessage('user', `smoke ${i}`); m.id = `m-${i}`;
    tab.thread('shared').messages.push(m);
    const r = await tab.save();
    if (r.ok && !(r.conflicts || []).length) acked.push(m.id); else tab.thread('shared').messages.pop();
  }));
  go();
  await within(running, 20000, 'four smoke actors');
  await sleep(60);
  const ids = JSON.parse(b.truth('chatThreads')).find((t) => t.id === 'shared').messages.map((m) => m.id);
  const ledger = JSON.parse(b.truth('plc.encounters.v1'));
  assert.equal(acked.length, 4, 'ALL4 ACKs');
  assert.deepEqual([...acked].sort(), ['m-0', 'm-1', 'm-2', 'm-3'], 'unique intended ids acknowledged');
  assert.deepEqual(acked.filter((id) => !ids.includes(id)), [], 'every ACKed id is in the physical truth');
  assert.equal(new Set(ids).size, ids.length, 'no duplicate message ids');
  assert.ok(acked.every((id) => Object.values(ledger.events).some((e) => e.message === id)), 'every ACKed id has its ledger event');
  assert.equal(ledger.intent, undefined, 'no intent left');
  // Backend and view identity: four distinct own views, every ACTUAL backend is the one shared object
  const backends = open.map((t) => t.store.coordination && t.store.coordination.backend);
  assert.equal(backends.length, 4, 'one actual backend per actor');
  assert.equal(backends.every((x) => x === sameBackend), true, 'every actual backend is sameBackend');
  assert.equal(new Set(b.views).size, 4, 'four distinct lagging views');
  assert.equal(new Set(b.tabs).size, 4, 'four distinct own-view storages');
  console.log('U_BACKEND_IDENTITY', JSON.stringify({ actors: 4, views: new Set(b.views).size, backends: new Set(backends).size }));
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
  // Recovery actor: resolve back (rollback) but CAS fails; its OWN view v1 is updated with every write (the root input contract)
  const v1 = { ...physical };
  const recovery1 = make(v1);
  assert.equal((await recovery1.acquire()).ok, true);
  const first = await recovery1.resolve({
    target: 'back',
    texts: { 'plc.encounters.v1': L0, chatThreads: '[]' },
    order: KEYS,
    write: (k, v) => { physical[k] = v; v1[k] = v; backend.failing.cas = true; return true; }
  });
  assert.equal(first.ok, false);
  assert.equal(first.code, 'coordination-unavailable', 'the intended ACK CAS fault was reached: ' + JSON.stringify(first));
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
