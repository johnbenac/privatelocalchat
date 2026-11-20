// The generic write routes (append, setKv, delKv) must refuse typed events and the typed index BEFORE anything is sealed or stored: typed records are written only by the typed
// projection (P1/P2/P3). Synthetic data only; real engine, real WebCrypto, real memory adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, INDEX_KEY } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

const ITER = 1000;
async function fresh() {
  const adapter = createMemoryAdapter();
  const session = await createVault({ adapter }).create('synthetic', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [] });
  return { adapter, session };
}
const raw = (adapter) => JSON.stringify(adapter.raw());
const owner = { type: 'thread', id: 't1', generation: null };

test('append refuses owned.put and owned.del before sealing or storing anything', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter), seq = session.lastSeq;
  for (const event of [{ t: 'owned.put', kind: 'encounter', id: 'enc:t1', owner, value: { format: 1 } }, { t: 'owned.del', kind: 'encounter', id: 'enc:t1', owner }]) {
    await assert.rejects(() => session.append({ scope: 'dek', event }), (e) => e.code === 'reserved', event.t + ' must be refused with the reserved code');
  }
  assert.equal(raw(adapter), before, 'nothing was stored');
  assert.equal(session.lastSeq, seq, 'and no sequence number was used');
});

test('setKv and delKv refuse the typed index key, and the refusal stores nothing', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  await assert.rejects(() => session.setKv(INDEX_KEY, '{"v":1}'), (e) => e.code === 'reserved');
  await assert.rejects(() => session.delKv(INDEX_KEY), (e) => e.code === 'reserved');
  assert.equal(raw(adapter), before);
});

test('one refused event refuses the whole batch: an ordinary record in the same call is not stored', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  await assert.rejects(() => session.append([{ scope: 'dek', event: { t: 'kv.set', k: 'l/plc.prefs.v1', v: '{"a":1}' } }, { scope: 'dek', event: { t: 'owned.put', kind: 'encounter', id: 'enc:t1', owner, value: { format: 1 } } }]), (e) => e.code === 'reserved');
  assert.equal(raw(adapter), before, 'the ordinary record was not stored either');
});

test('control: an ordinary key still writes through the same route', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  assert.notEqual(raw(adapter), before);
});
