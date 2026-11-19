// compact() rewrites the whole stored log. It must never run for a session that is locked or whose authority has gone, because it would replace the log with what that session
// holds in memory (nothing, after a lock) and every record, typed ones included, would be lost. Synthetic data only; real engine, real WebCrypto, real memory adapter.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

const ITER = 1000;
async function fresh() {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('synthetic', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'synthetic transcript one' }] });
  await session.setKv('l/chatThreads.order', '["t1"]');
  await session.setKv('l/plc.prefs.v1', '{"synthetic":true}');
  return { adapter, session };
}
const raw = (adapter) => JSON.stringify(adapter.raw());
const stored = async (adapter) => (await createVault({ adapter }).unlock('synthetic')).state;

test('compact refuses on a locked session and the stored log is untouched', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  session.lock();
  await assert.rejects(() => session.compact(), (e) => e.code === 'locked', 'a locked session must refuse with the locked code');
  assert.equal(raw(adapter), before, 'the stored header and log are byte-identical');
  const state = await stored(adapter);
  assert.ok(state.kv.get('l/plc.prefs.v1'), 'the records are still readable by a new unlock');
  assert.equal(state.kv.get('l/chatThreads.order'), '["t1"]');
});

test('compact refuses when its guard no longer authorizes, before anything is sealed or stored', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  await assert.rejects(() => session.compact({ guard: () => false }), (e) => e.code === 'session-changed');
  await assert.rejects(() => session.compact({ guard: () => { throw new Error('guard failed'); } }), (e) => e.code === 'session-changed', 'a throwing guard refuses too');
  await assert.rejects(() => session.compact({ guard: () => 1 }), (e) => e.code === 'session-changed', 'only exactly true authorizes');
  assert.equal(raw(adapter), before, 'nothing was written');
});

test('compact refuses when the guard stops authorizing AFTER the records were sealed, at the append boundary', async () => {
  const { adapter, session } = await fresh();
  const before = raw(adapter);
  let asked = 0;
  const guard = () => { asked += 1; return asked === 1; };   // authorizes the first question only: the check made when compaction starts
  await assert.rejects(() => session.compact({ guard }), (e) => e.code === 'session-changed');
  assert.ok(asked >= 2, 'the guard was asked again at the boundary where the log is replaced: ' + asked);
  assert.equal(raw(adapter), before, 'the stored log is byte-identical');
  const next = await session.setKv('l/plc.prefs.v1', '{"synthetic":false}').then(() => true, (e) => e.code);
  assert.equal(next, true, 'the session can still write: a refused compaction gave its sequence numbers back');
});

test('control: an authorized compact still rewrites the log and keeps every record', async () => {
  const { adapter, session } = await fresh();
  const out = await session.compact({ guard: () => true });
  assert.ok(out.records > 0);
  const state = await stored(adapter);
  assert.equal(state.kv.get('l/plc.prefs.v1'), '{"synthetic":true}');
  assert.equal(state.kv.get('l/chatThreads.order'), '["t1"]');
  const plain = await fresh();
  await plain.session.compact();
  assert.equal((await stored(plain.adapter)).kv.get('l/plc.prefs.v1'), '{"synthetic":true}', 'no guard: unchanged behaviour');
});
