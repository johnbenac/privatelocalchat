import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault, applyEvent, emptyState, eventsFor, chatKeyId, VAULT_FORMAT, VaultError, toB64 } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

// Typed owned-entity state: replay, lifetime, generations, compaction, crypto-shredding (docs/OWNED-CONVERSATION-STORE.md).
// Everything here drives the real engine over the real memory adapter and real WebCrypto; nothing is mocked.

const ITER = 1000;
// A local encounter names the chat that owns it (encounter.thread === the owner thread); a standalone one has thread:null and is owned by itself.
const V = (E, extra = {}, thread = null) => ({ format: 1, encounter: { id: E, thread, note: 'n-' + E }, participants: { p1: { id: 'p1', encounter: E, label: 'secret label ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words ' + E } }, holders: { [E + '\u0000h1']: 'p1' }, ...extra });
const fresh = async () => { const adapter = createMemoryAdapter(), vault = createVault({ adapter }); const session = await vault.create('pw', { iterations: ITER }); return { adapter, vault, session }; };
const plan = (base, over = {}) => ({ base, operationId: 'op-' + Math.random(), threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: 1, epoch: 1 }, ...over });
async function seedChat(session, id = 't1') { await session.putThread(id, { id, title: 'chat ' + id, messages: [{ role: 'user', content: 'hi ' + id }] }); await session.setKv('l/chatThreads.order', JSON.stringify([id])); }
async function commitLocal(session, E = 'E1', T = 't1', rev = 1) {
  const r = await session.readChatProjection({ guard: () => true });
  return session.commitChatProjection(plan(r.base, { encounters: { put: [{ id: E, owner: { type: 'thread', id: T }, value: V(E, {}, T) }], remove: [] }, logical: { v: 1, rev, epoch: 1 } }), { guard: () => true });
}
const reopen = (adapter) => createVault({ adapter }).unlock('pw');

test('a typed commit admits an owned entity under the existing chat key: same raw key bytes, a fresh generation, semantic header 2, old data intact', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  const before = session.state.keys.get('c:t1').slice();
  const read = await session.readChatProjection({ guard: () => true });
  assert.equal(read.encounters.length, 0);
  assert.equal(read.threads.length, 1);
  const receipt = await commitLocal(session);
  assert.equal(receipt.status, 'committed', JSON.stringify(receipt));
  assert.ok(receipt.id && receipt.revision && receipt.base);
  const reopened = await reopen(adapter);
  assert.equal((await adapter.readHeader()).format, 'plc-vault/2');
  assert.deepEqual([...reopened.state.keys.get('c:t1')], [...before], 'no key rotation: the same raw bytes are reissued with a generation');
  const generation = reopened.state.keyGenerations.get('c:t1');
  assert.match(generation, /^[A-Za-z0-9_-]{22}$/);
  const e = reopened.state.encounters.get('E1');
  assert.equal(e.owner.generation, generation);
  assert.deepEqual(e.value, V('E1', {}, 't1'));
  assert.equal(reopened.state.threads.get('t1').title, 'chat t1');
  assert.equal(reopened.damaged.length, 0);
  assert.equal(reopened.destroyedRecords, 0);
});

test('the read base carries generation:null for a legacy owner, only inside the branded observation', async () => {
  const { session } = await fresh();
  await seedChat(session);
  const r = await session.readChatProjection({ guard: () => true });
  assert.equal(Object.isFrozen(r.base), true);
  const forged = { ...r.base };
  const p = plan(forged, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1', generation: null }, value: V('E1') }], remove: [] } });
  const out = await session.commitChatProjection(p, { guard: () => true });
  assert.equal(out.status, 'not-written');
  assert.equal(out.reason, 'bad-base');
});

test('replay authenticates scope and generation: a wrong scope, wrong generation, absent owner or rebind is refused', () => {
  const state = emptyState();
  const generation = 'G'.repeat(22);
  applyEvent(state, { t: 'key.put', id: 'c:t1', raw: toB64(new Uint8Array(32)), generation }, 'dek');
  const put = (owner, scope, id = 'E1') => applyEvent(state, { t: 'owned.put', kind: 'encounter', id, owner, value: V(id) }, scope);
  assert.throws(() => put({ type: 'thread', id: 't1', generation }, 'dek'), (e) => e.code === 'owned-invalid');
  assert.throws(() => put({ type: 'thread', id: 't1', generation: 'X'.repeat(22) }, 'c:t1'), (e) => e.code === 'owned-invalid');
  assert.throws(() => put({ type: 'thread', id: 'nope', generation }, 'c:nope'), (e) => e.code === 'owned-invalid');
  put({ type: 'thread', id: 't1', generation }, 'c:t1');
  assert.equal(state.encounters.size, 1);
  applyEvent(state, { t: 'key.put', id: 'c:t2', raw: toB64(new Uint8Array(32)), generation: 'H'.repeat(22) }, 'dek');
  assert.throws(() => applyEvent(state, { t: 'owned.put', kind: 'encounter', id: 'E1', owner: { type: 'thread', id: 't2', generation: 'H'.repeat(22) }, value: V('E1') }, 'c:t2'), (e) => e.code === 'owned-invalid', 'an existing entity cannot be rebound to another owner');
  assert.throws(() => applyEvent(state, { t: 'owned.put', kind: 'other', id: 'E9', owner: { type: 'thread', id: 't1', generation }, value: V('E9') }, 'c:t1'), (e) => e.code === 'owned-invalid', 'only kind encounter exists');
});

test('key.destroy purges owned state, generation and key record centrally; a same-id key.put with a new generation invalidates the old scoped state', () => {
  const state = emptyState();
  const g1 = 'A'.repeat(22), g2 = 'B'.repeat(22);
  applyEvent(state, { t: 'key.put', id: 'e:S1', raw: toB64(new Uint8Array(32).fill(1)), generation: g1 }, 'dek');
  applyEvent(state, { t: 'owned.put', kind: 'encounter', id: 'S1', owner: { type: 'encounter', id: 'S1', generation: g1 }, value: V('S1') }, 'e:S1');
  applyEvent(state, { t: 'key.put', id: 'e:S1', raw: toB64(new Uint8Array(32).fill(2)), generation: g2 }, 'dek');
  assert.equal(state.encounters.size, 0, 'a replaced key invalidates the prior generation and everything it owned');
  applyEvent(state, { t: 'owned.put', kind: 'encounter', id: 'S1', owner: { type: 'encounter', id: 'S1', generation: g2 }, value: V('S1') }, 'e:S1');
  applyEvent(state, { t: 'key.destroy', id: 'e:S1' }, 'dek');
  assert.equal(state.encounters.size, 0); assert.equal(state.keys.size, 0); assert.equal(state.keyGenerations.size, 0); assert.equal(state.keyRecords.size, 0);
});

test('eventsFor keeps key metadata, generations and unknown fields and emits owned entities under their owner scope, never DEK', async () => {
  const state = emptyState();
  const g = 'C'.repeat(22);
  applyEvent(state, { t: 'key.put', id: 'c:t1', raw: toB64(new Uint8Array(32).fill(7)), generation: g, futureMeta: { a: 1 } }, 'dek');
  applyEvent(state, { t: 'thread.put', id: 't1', thread: { id: 't1' } }, 'c:t1');
  applyEvent(state, { t: 'owned.put', kind: 'encounter', id: 'E1', owner: { type: 'thread', id: 't1', generation: g, ownerExtra: 1 }, value: V('E1', {}), futureEventField: [1, 2] }, 'c:t1');
  const events = eventsFor(state);
  const owned = events.filter((x) => x.event.t === 'owned.put');
  assert.equal(owned.length, 1);
  assert.equal(owned[0].keyId, 'c:t1');
  assert.deepEqual(owned[0].event.owner, { type: 'thread', id: 't1', generation: g, ownerExtra: 1 });
  assert.deepEqual(owned[0].event.futureEventField, [1, 2]);
  const key = events.find((x) => x.event.t === 'key.put');
  assert.equal(key.event.generation, g); assert.deepEqual(key.event.futureMeta, { a: 1 });
  assert.equal(events.some((x) => x.keyId === 'dek' && x.event.t === 'kv.set' && JSON.stringify(x.event).includes('secret')), false);
  const replayed = emptyState();
  for (const x of events) applyEvent(replayed, x.event, x.keyId);
  assert.deepEqual(eventsFor(replayed), events);
});

test('compaction preserves typed state exactly; it refuses while an operation is pending', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  assert.equal((await commitLocal(session)).status, 'committed');
  const beforeProjection = (await session.readChatProjection({ guard: () => true }));
  await session.compact();
  const reopened = await reopen(adapter);
  assert.deepEqual(reopened.state.encounters.get('E1').value, V('E1', {}, 't1'));
  assert.equal(reopened.state.keyGenerations.get('c:t1'), session.state.keyGenerations.get('c:t1'));
  const afterProjection = await reopened.readChatProjection({ guard: () => true });
  assert.deepEqual(afterProjection.encounters, beforeProjection.encounters);
  assert.deepEqual(afterProjection.index, beforeProjection.index);
});

test('crypto-shred oracle: after destroy and compact, old owned ciphertext stays unreadable under the current header, with no key reinsertion; old chat ciphertext is the control', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  assert.equal((await commitLocal(session)).status, 'committed');
  const old = adapter.raw().log.filter((r) => r.keyId === 'c:t1');
  assert.ok(old.length >= 2, 'the chat record and the owned record are both under the chat key');
  const r = await session.readChatProjection({ guard: () => true });
  const gone = await session.commitChatProjection(plan(r.base, { threads: { put: [], create: [], remove: ['t1'], order: [] }, logical: { v: 1, rev: 2, epoch: 1 } }), { guard: () => true });
  assert.equal(gone.status, 'committed', JSON.stringify(gone));
  await session.compact();
  const header = await adapter.readHeader();
  assert.equal(header.format, 'plc-vault/2');
  const isolated = createMemoryAdapter();
  await isolated.writeHeader(header);
  const current = adapter.raw().log;
  assert.ok(current.every((rec) => !old.some((o) => o.seq === rec.seq)), 'compaction renumbered above every old seq');
  await isolated.replaceLog({ add: [...old, ...current], removeUpTo: 0 });
  const survivors = await createVault({ adapter: isolated }).unlock('pw');
  assert.equal(survivors.state.encounters.size, 0);
  assert.equal(survivors.state.threads.has('t1'), false);
  assert.equal(survivors.state.keys.has('c:t1'), false, 'the destroyed key is not reinserted');
  assert.equal(survivors.destroyedRecords, old.length, 'every old chat-key record, owned or not, is unreadable');
  assert.equal(JSON.stringify([...survivors.state.kv]).includes('secret'), false);
});

test('same-id re-add gets a fresh raw key and generation; a stale generation owner cannot write', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  assert.equal((await commitLocal(session)).status, 'committed');
  const first = (await reopen(adapter)).state;
  const g1 = first.keyGenerations.get('c:t1'), raw1 = [...first.keys.get('c:t1')];
  let r = await session.readChatProjection({ guard: () => true });
  assert.equal((await session.commitChatProjection(plan(r.base, { threads: { put: [], create: [], remove: ['t1'], order: [] }, logical: { v: 1, rev: 2, epoch: 1 } }), { guard: () => true })).status, 'committed');
  const staleBase = r.base;
  r = await session.readChatProjection({ guard: () => true });
  const re = await session.commitChatProjection(plan(r.base, { threads: { put: [{ id: 't1', title: 'again', messages: [] }], create: ['t1'], remove: [], order: ['t1'] }, encounters: { put: [{ id: 'E2', owner: { type: 'thread', id: 't1' }, value: V('E2', {}, 't1') }], remove: [] }, logical: { v: 1, rev: 3, epoch: 1 } }), { guard: () => true });
  assert.equal(re.status, 'committed', JSON.stringify(re));
  const second = (await reopen(adapter)).state;
  assert.notEqual(second.keyGenerations.get('c:t1'), g1);
  assert.notDeepEqual([...second.keys.get('c:t1')], raw1);
  assert.equal(second.encounters.has('E1'), false);
  const stale = await session.commitChatProjection(plan(staleBase, { encounters: { put: [{ id: 'E3', owner: { type: 'thread', id: 't1' }, value: V('E3', {}, 't1') }], remove: [] } }), { guard: () => true });
  assert.equal(stale.status, 'not-written');
  assert.equal(stale.reason, 'stale-base');
});

test('generic engine routes refuse reserved events/keys and every legacy mutation while typed state exists, before any record is written', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  await seedChat(session, 't2');
  assert.equal((await commitLocal(session)).status, 'committed');
  const log = JSON.stringify(adapter.raw());
  const refused = async (fn, code) => { await assert.rejects(fn, (e) => e instanceof VaultError && e.code === code, code); assert.equal(JSON.stringify(adapter.raw()), log, 'nothing was written'); };
  await refused(() => session.append({ scope: 'dek', event: { t: 'kv.set', k: 'meta/encounters.index.v1', v: '{}' } }), 'reserved');
  await refused(() => session.setKv('meta/encounters.index.v1', '{}'), 'reserved');
  await refused(() => session.append({ scope: 'c:t1', event: { t: 'owned.put', kind: 'encounter', id: 'X', owner: { type: 'thread', id: 't1', generation: 'x' }, value: V('X') } }), 'reserved');
  await refused(() => session.delThread('t1'), 'typed-hold');
  await refused(() => session.delThread('t2'), 'typed-hold');
  await refused(() => session.putThread('t3', { id: 't3' }), 'typed-hold');
  await refused(() => session.append({ scope: 'dek', event: { t: 'key.destroy', id: 'c:t1' } }), 'typed-hold');
  await refused(() => session.setKv('l/chatThreads.order', '[]'), 'typed-hold');
  await session.setKv('l/plc.prefs.v1', '{"a":1}');
  assert.equal(session.state.kv.get('l/plc.prefs.v1'), '{"a":1}', 'unrelated settings stay writable');
});

test('unsupported header formats refuse on both ingress paths; semantic 2 is accepted and the AAD/wrap domain stays plc-vault/1', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  assert.equal((await commitLocal(session)).status, 'committed');
  assert.equal(VAULT_FORMAT, 'plc-vault/1');
  const header = await adapter.readHeader();
  assert.equal(header.format, 'plc-vault/2');
  assert.ok((await createVault({ adapter }).unlock('pw')).state.encounters.has('E1'));
  const dek = session.dekBytes();
  assert.ok((await createVault({ adapter }).unlockWithKey(header, dek)).state.encounters.has('E1'));
  await adapter.writeHeader({ ...header, format: 'plc-vault/3' });
  await assert.rejects(() => createVault({ adapter }).unlock('pw'), (e) => e.code === 'format');
  await assert.rejects(() => createVault({ adapter }).unlockWithKey({ ...header, format: 'plc-vault/3' }, dek), (e) => e.code === 'format');
  await assert.rejects(() => session.compact(), (e) => e.code === 'format', 'a stale session compacting under a stored unsupported header refuses');
});

// Portable only: no historical commit is read. The frozen ReaderN semantic-2 negative is run externally by the coordinator against the pinned commit.
test('semantic 2 is read by the current engine; an unsupported future number (plc-vault/999) is refused on both ingress paths', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  assert.equal((await commitLocal(session)).status, 'committed');
  const stored = await adapter.readHeader();
  assert.equal(stored.format, 'plc-vault/2');
  assert.ok((await createVault({ adapter }).unlock('pw')).state.encounters.has('E1'), 'the current engine reads semantic 2');
  await adapter.writeHeader({ ...stored, format: 'plc-vault/999' });
  await assert.rejects(() => createVault({ adapter }).unlock('pw'), (e) => e.code === 'format');
  await assert.rejects(() => createVault({ adapter }).unlockWithKey({ ...stored, format: 'plc-vault/999' }, session.dekBytes()), (e) => e.code === 'format');
});

test('existing 001/002-shaped data (no typed state) replays unchanged and gains no new state', async () => {
  const { adapter, session } = await fresh();
  await seedChat(session);
  await session.setKv('l/plc.prefs.v1', '{"theme":"dark"}');
  const reopened = await reopen(adapter);
  assert.equal(reopened.state.encounters.size, 0); assert.equal(reopened.state.keyGenerations.size, 0);
  assert.equal((await adapter.readHeader()).format, 'plc-vault/1');
  assert.equal(reopened.state.keyRecords.get('c:t1').generation, undefined);
});
