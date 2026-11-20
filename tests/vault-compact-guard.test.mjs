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

// ---- the same refusals on a vault that HOLDS TYPED RECORDS (T895 finding 7), and the stale session (finding 1) ---------------------------------------------------------------------------
const V = (E, T) => ({ format: 1, encounter: { id: E, thread: T }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\u0000h1']: 'p1' } });
const plan = (base, over = {}) => ({ base, operationId: 'op', threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: 1, epoch: 1 }, ...over });
const G = () => true;
async function typed(chats = ['t1']) {
  const adapter = createMemoryAdapter();
  const session = await createVault({ adapter }).create('synthetic', { iterations: ITER });
  for (const id of chats) await session.putThread(id, { id, title: id, messages: [{ role: 'user', content: 'synthetic ' + id }] });
  await session.setKv('l/chatThreads.order', JSON.stringify(chats));
  let rev = 0;
  for (const id of chats) { const r = await session.readChatProjection({ guard: G }); const out = await session.commitChatProjection(plan(r.base, { encounters: { put: [{ id: 'E-' + id, owner: { type: 'thread', id }, value: V('E-' + id, id) }], remove: [] }, logical: { v: 1, rev: ++rev, epoch: 1 } }), { guard: G }); assert.equal(out.status, 'committed', JSON.stringify(out)); }
  return { adapter, session };
}
const entities = async (adapter) => [...(await stored(adapter)).encounters.keys()].sort();

test('typed records: a locked session and a withdrawn guard refuse compaction and every typed record survives', async () => {
  const { adapter, session } = await typed();
  const before = raw(adapter);
  await assert.rejects(() => session.compact({ guard: () => false }), (e) => e.code === 'session-changed');
  assert.equal(raw(adapter), before, 'a withdrawn guard stored nothing');
  session.lock();
  await assert.rejects(() => session.compact(), (e) => e.code === 'locked');
  assert.equal(raw(adapter), before, 'a locked session stored nothing');
  assert.deepEqual(await entities(adapter), ['E-t1'], 'the typed entity is still there for a new unlock');
});

test('a STALE session cannot compact: a chat that another session deleted and compacted stays deleted (T895 finding 1)', async () => {
  const { adapter, session: a } = await typed(['t1', 'c2']);
  const b = await createVault({ adapter }).unlock('synthetic');   // B reads the vault while c2 and its entity exist
  const r = await a.readChatProjection({ guard: G });
  const del = await a.commitChatProjection(plan(r.base, { threads: { put: [], create: [], remove: ['c2'], order: ['t1'] }, encounters: { put: [], remove: [{ id: 'E-c2', owner: { type: 'thread', id: 'c2', generation: r.owners.find((o) => o.id === 'c2').generation } }] }, logical: { v: 1, rev: 9, epoch: 1 } }), { guard: G });
  assert.equal(del.status, 'committed', JSON.stringify(del));
  await a.compact();   // c2, its key and its typed entity are now gone from the stored log
  const gone = await stored(adapter);
  assert.equal(gone.threads.has('c2'), false); assert.deepEqual([...gone.encounters.keys()], ['E-t1']);
  const afterA = raw(adapter);
  await assert.rejects(() => b.compact(), (e) => e.code === 'stale-session', 'the stale session must refuse');
  assert.equal(raw(adapter), afterA, 'and store nothing');
  const again = await stored(adapter);
  assert.equal(again.threads.has('c2'), false, 'the deleted chat did not come back'); assert.equal(again.keys.has('c:c2'), false, 'nor its key'); assert.deepEqual([...again.encounters.keys()], ['E-t1'], 'nor its typed entity'); assert.equal((await createVault({ adapter }).unlock('synthetic')).damaged.length, 0);
});

test('a writer that slips in between the read and the replace makes compaction conflict and replace nothing', async () => {
  const real = createMemoryAdapter();
  const session = await createVault({ adapter: real }).create('synthetic', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'x' }] });
  const other = await createVault({ adapter: real }).unlock('synthetic');
  let slipped = false;
  const racing = { ...real, async replaceLog(a) { if (!slipped && !a.expected) { slipped = true; await other.setKv('l/plc.prefs.v1', '{"slipped":true}'); } return real.replaceLog(a); } };
  const mine = await createVault({ adapter: racing }).unlock('synthetic');
  const before = raw(real);
  await assert.rejects(() => mine.compact(), (e) => e.code === 'conflict');
  assert.equal(slipped, true);
  const state = await stored(real);
  assert.equal(state.kv.get('l/plc.prefs.v1'), '{"slipped":true}', 'the other writer\'s record is intact');
  assert.ok(raw(real) !== before, 'only the other writer stored something');
  await mine.setKv('l/plc.prefs.v1', '{"mine":true}').then(() => assert.fail('a stale session may not write'), (e) => assert.ok(e.code));   // memory is stale: the engine refuses or conflicts, it never overwrites silently
});

test('an unknown adapter outcome is SETTLED by reading the store (T895 finding 6)', async () => {
  // (a) the replace happened but the reply was lost: compaction reports it, the sequence numbers stay used, the next write works
  { const real = createMemoryAdapter(); const s = await createVault({ adapter: real }).create('synthetic', { iterations: ITER });
    await s.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'x' }] }); await s.setKv('l/plc.prefs.v1', '{"a":1}');
    const lost = { ...real, async replaceLog(a) { await real.replaceLog(a); if (!a.expected) throw Object.assign(new Error('reply lost'), { code: 'timeout' }); } };
    const mine = await createVault({ adapter: lost }).unlock('synthetic');
    const out = await mine.compact(); assert.equal(out.settled, 'read-back');
    await mine.setKv('l/plc.prefs.v1', '{"a":2}'); assert.equal((await stored(real)).kv.get('l/plc.prefs.v1'), '{"a":2}', 'the next write did not conflict'); }
  // (b) it did not happen: proven by the read, so the numbers are given back and the next write works
  { const real = createMemoryAdapter(); const s = await createVault({ adapter: real }).create('synthetic', { iterations: ITER });
    await s.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'x' }] });
    const dead = { ...real, async replaceLog(a) { if (!a.expected) throw Object.assign(new Error('network'), { code: 'timeout' }); return real.replaceLog(a); } };
    const mine = await createVault({ adapter: dead }).unlock('synthetic'); const before = raw(real);
    await assert.rejects(() => mine.compact(), (e) => e.code === 'timeout'); assert.equal(raw(real), before);
    await mine.setKv('l/plc.prefs.v1', '{"b":1}'); assert.equal((await stored(real)).kv.get('l/plc.prefs.v1'), '{"b":1}'); }
});
