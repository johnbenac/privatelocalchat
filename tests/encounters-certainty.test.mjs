// Synthetic READ-ONLY causal probes. Actual store/commit/consumer, supplied Storage/WebLocks/get failure.
// No browser, UI, real-provider or physical-durability claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createLedgerStore } from '../chat/encounters/ledger-store.mjs';
import { memoryBackend, createCoordination } from '../chat/encounters/coordination.mjs';
import { outcomeOf } from '../chat/encounters/save-outcome.mjs';
import { memStorage, fakeLocks, openTab, thread, msg, coordFor } from '../tests/helpers/encounters-env.mjs';

const root = new URL('../', import.meta.url).href;
const files = ['chat/encounters/ledger-store.mjs', 'chat/encounters/coordination.mjs', 'chat/encounters/thread-commit.mjs', 'chat/encounters/save-outcome.mjs'];
const hashes = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(new URL(file, root))).digest('hex')]));

test('CAUSAL initial metadata read refusal before any operation is not unknown', async () => {
  const before = hashes();
  const initial = JSON.stringify([{ id: 'synthetic', title: 'synthetic', messages: [] }]);
  const map = new Map([['chatThreads', initial]]);
  let writes = 0, entered = 0;
  const storage = {
    getItem: key => map.get(key) ?? null,
    setItem(key, value) { writes++; map.set(key, String(value)); },
    removeItem(key) { writes++; map.delete(key); }
  };
  const backend = memoryBackend(); backend.failing.get = true;
  const coordination = createCoordination({ backend, keys: ['plc.encounters.v1', 'chatThreads'], read: storage.getItem });
  const locks = { request: async (_name, _options, fn) => fn() };
  const store = createLedgerStore({ storage, locks, coordination });
  const result = await store.critical(async () => { entered++; return { ok: true }; });
  const outcome = outcomeOf(result);
  assert.equal(entered, 0); assert.equal(writes, 0);
  assert.equal(storage.getItem('chatThreads'), initial);
  assert.equal(storage.getItem('plc.encounters.v1'), null);
  assert.equal(backend.peek(), null, 'there was no earlier or current operation');
  assert.deepEqual(hashes(), before);
  console.log(JSON.stringify({ synthetic: true, case: 'initial-read', entered, writes, priorOperation: backend.peek(), result, outcome }));
  assert.equal(outcome.unknown, false, 'known initial no-write refusal cannot become unknown by code family');
});

test('CAUSAL finalized original without ledger intent remains unconfirmed at the producer', async () => {
  const before = hashes();
  const storage = memStorage({ chatThreads: '[]' }), backend = memoryBackend();
  const tab = openTab({ storage, locks: fakeLocks(), storeOptions: { coordination: coordFor(storage, backend) },
    onPhase: phase => { if (phase === 'finalized') backend.failing.cas = true; } });
  tab.threads.push(thread('t', [msg('original-alpha', 'user', 'alpha')]));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome');
  const originalOp = first.unknown?.op;
  assert.equal(typeof originalOp, 'string');
  assert.equal(tab.stored()[0].messages[0].id, 'original-alpha');
  assert.equal(tab.ledger().intent, undefined, 'final ledger was written before the stable ACK failed');
  assert.equal(backend.peek().state, 'open');
  assert.equal(tab.commit.baseSize(), 0, 'unACKed original did not advance baseline');
  const second = await tab.save();
  assert.equal(tab.stored()[0].messages.length, 1);
  assert.equal(tab.stored()[0].messages[0].id, 'original-alpha');
  assert.equal(tab.commit.baseSize(), 0);
  assert.deepEqual(hashes(), before);
  console.log(JSON.stringify({ synthetic: true, case: 'finalized-original', originalOp, first, second, ledgerIntent: tab.ledger().intent ?? null, remainingRecord: backend.peek().state }));
  assert.equal(second.code, 'unknown-outcome', 'producer must retain uncertainty of the original finalized operation');
  assert.equal(second.unknown?.op, originalOp, 'the original operation identity remains unconfirmed');
  assert.equal(second.cause, 'coordination-unavailable', 'actual failed-recovery cause is retained');
});
