import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createAppStorage, memoryStorage, VAULT_MARKER } from '../chat/vault/vault-store.mjs';
import { createVaultControl } from '../chat/vault/vault-control.mjs';
import { providedLease } from '../tests/helpers/web-locks-fake.mjs';

const ITER = 1000;
const G = () => true;

// Minimal synthetic fixture matching the actual EN fixture structure (values[] wrapper format)
// Each entity: { id, owner: {type, id, generation}, value: { format, encounter: {id, thread, ...}, participants, events, holders } }
const FIXTURE = {
  threads: [
    { id: 'synthetic-a', title: 'synthetic title synthetic-a', messages: [{ id: 'm-synthetic-a', role: 'user', content: 'synthetic transcript synthetic-a' }] },
    { id: 'synthetic-b', title: 'synthetic title synthetic-b', messages: [{ id: 'm-synthetic-b', role: 'user', content: 'synthetic transcript synthetic-b' }] }
  ],
  values: [
    {
      id: 'enc:synthetic-a',
      owner: { type: 'thread', id: 'synthetic-a', generation: null },
      value: {
        format: 1,
        encounter: { id: 'enc:synthetic-a', thread: 'synthetic-a', createdAt: 1, seq: 1, msgs: { 'm-synthetic-a': 'ev:legacy:5bd245e19e1e2057b6f40ec84536e87b1bae439b35ea6497dc084c4877d3c69d' }, origin: 'local', futureOwned: { unrecognizedText: 'synthetic owner unknown synthetic-a' } },
        participants: {
          'p:synthetic-a:person': { id: 'p:synthetic-a:person', encounter: 'enc:synthetic-a', kind: 'human', name: 'You', standing: 'local-device', individualId: null, origin: { kind: 'local' }, holders: ['opaque-holder-synthetic-a'] },
          'p:synthetic-a:assistant': { id: 'p:synthetic-a:assistant', encounter: 'enc:synthetic-a', kind: 'agent', name: 'Assistant', standing: 'runtime-projection', individualId: null, origin: { kind: 'local' } }
        },
        events: {
          'ev:legacy:5bd245e19e1e2057b6f40ec84536e87b1bae439b35ea6497dc084c4877d3c69d': { id: 'ev:legacy:5bd245e19e1e2057b6f40ec84536e87b1bae439b35ea6497dc084c4877d3c69d', encounter: 'enc:synthetic-a', thread: 'synthetic-a', message: 'm-synthetic-a', version: null, occ: { source: 'plc:legacy', id: 'leg:8bb3a9e32b1bf8268cdfba4cbeab044dde9df56421dfb4449a34f9f83b36993c', digest: 'sha256:7b34d2d0c9a2a32b2778fdd0a7605aaedb1dc1e6550ac80ae5c0e4bcb67c3223' }, speaker: 'p:synthetic-a:person', audience: { scope: 'encounter' }, expression: 'person', modality: 'text', standing: 'legacy', state: 'final', outcome: 'complete', content: { text: 'synthetic transcript synthetic-a', digest: 'sha256:7b34d2d0c9a2a32b2778fdd0a7605aaedb1dc1e6550ac80ae5c0e4bcb67c3223' }, inTranscript: true, authority: 'none', observed: false, clock: { domain: 'encounter:enc:synthetic-a', position: 1, receivedMs: 1 }, note: 'stored before conversation records existed; written down when first rewritten' }
        },
        holders: { 'enc:synthetic-a\u0000opaque-holder-synthetic-a': 'p:synthetic-a:person' }
      }
    },
    {
      id: 'enc:synthetic-b',
      owner: { type: 'thread', id: 'synthetic-b', generation: null },
      value: {
        format: 1,
        encounter: { id: 'enc:synthetic-b', thread: 'synthetic-b', createdAt: 1, seq: 1, msgs: { 'm-synthetic-b': 'ev:legacy:655ba0174e325dcf5386c5bcdfc234ae5212da9f549de1a11cc786f711e72e9c' }, origin: 'local', futureOwned: { unrecognizedText: 'synthetic owner unknown synthetic-b' } },
        participants: {
          'p:synthetic-b:person': { id: 'p:synthetic-b:person', encounter: 'enc:synthetic-b', kind: 'human', name: 'You', standing: 'local-device', individualId: null, origin: { kind: 'local' }, holders: ['opaque-holder-synthetic-b'] },
          'p:synthetic-b:assistant': { id: 'p:synthetic-b:assistant', encounter: 'enc:synthetic-b', kind: 'agent', name: 'Assistant', standing: 'runtime-projection', individualId: null, origin: { kind: 'local' } }
        },
        events: {
          'ev:legacy:655ba0174e325dcf5386c5bcdfc234ae5212da9f549de1a11cc786f711e72e9c': { id: 'ev:legacy:655ba0174e325dcf5386c5bcdfc234ae5212da9f549de1a11cc786f711e72e9c', encounter: 'enc:synthetic-b', thread: 'synthetic-b', message: 'm-synthetic-b', version: null, occ: { source: 'plc:legacy', id: 'leg:98469c4b01576b3339a9a45cec1154e39f3b74b1d526b6efabe72707cc66eb70', digest: 'sha256:a824c2b3eaa91512fe86475f4faaff8112c0e8db20337695abac0e5040b773ce' }, speaker: 'p:synthetic-b:person', audience: { scope: 'encounter' }, expression: 'person', modality: 'text', standing: 'legacy', state: 'final', outcome: 'complete', content: { text: 'synthetic transcript synthetic-b', digest: 'sha256:a824c2b3eaa91512fe86475f4faaff8112c0e8db20337695abac0e5040b773ce' }, inTranscript: true, authority: 'none', observed: false, clock: { domain: 'encounter:enc:synthetic-b', position: 1, receivedMs: 1 }, note: 'stored before conversation records existed; written down when first rewritten' }
        },
        holders: { 'enc:synthetic-b\u0000opaque-holder-synthetic-b': 'p:synthetic-b:person' }
      }
    }
  ]
};

const plan = (base, over = {}) => ({ base, operationId: 'op-' + Math.random(), threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: 1, epoch: 1 }, ...over });

async function fresh() {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('synthetic', { iterations: ITER });
  return { adapter, vault, session };
}

// The thread actually put through putThread: its messages carry no id (the fixture's messages do; that difference is never compared).
const seedThread = async (session, id = 'synthetic-a') => {
  const thread = { id, title: 'synthetic title ' + id, messages: [{ role: 'user', content: 'synthetic transcript ' + id }] };
  await session.putThread(id, thread);
  await session.setKv('l/chatThreads.order', JSON.stringify([id]));
  return thread;
};

// ---- Encounter removal generation validation ----

test('owned removal controls accept live and omitted base-bound generations', async () => {
  // Two INDEPENDENT fresh vaults, both on the SAME UNCHANGED synthetic-a fixture: one removal names the live generation, one omits it.
  for (const named of [true, false]) {
    const { adapter, session } = await fresh();
    await seedThread(session);

    // Commit the fixture entity under the owner that the fresh read actually observed.
    const r1 = await session.readChatProjection({ guard: G });
    const entity = structuredClone(FIXTURE.values.find(v => v.owner.type === 'thread' && v.owner.id === 'synthetic-a'));
    entity.owner = r1.owners.find(o => o.type === 'thread' && o.id === 'synthetic-a');
    assert.equal((await session.commitChatProjection(plan(r1.base, { encounters: { put: [entity], remove: [] } }), { guard: G })).status, 'committed');

    // Remove it with the owner exactly as the fresh read observed it: named with the live generation, or with the field omitted whole.
    const r = await session.readChatProjection({ guard: G });
    const actualOwner = r.encounters.find(e => e.id === entity.id).owner;
    assert.match(actualOwner.generation, /^[A-Za-z0-9_-]{22}$/);
    const namedOwner = named ? { ...actualOwner } : (() => { const { generation, ...rest } = actualOwner; return rest; })();

    const removal = await session.commitChatProjection(plan(r.base, { encounters: { put: [], remove: [{ id: entity.id, owner: namedOwner }] } }), { guard: G });
    assert.equal(removal.status, 'committed', JSON.stringify(removal));
    const after = await createVault({ adapter }).unlock('synthetic');
    assert.equal(after.state.encounters.has(entity.id), false, named ? 'the named-generation removal did not commit' : 'the omitted-generation removal did not commit');
  }
});

test('owned removal rejects an explicit wrong generation before P1', async () => {
  const { adapter, session } = await fresh();
  await seedThread(session);
  const r1 = await session.readChatProjection({ guard: G });
  const entity = structuredClone(FIXTURE.values.find(v => v.owner.type === 'thread' && v.owner.id === 'synthetic-a'));
  entity.owner = r1.owners.find(o => o.type === 'thread' && o.id === 'synthetic-a');
  assert.equal((await session.commitChatProjection(plan(r1.base, { encounters: { put: [entity], remove: [] } }), { guard: G })).status, 'committed');

  const r = await session.readChatProjection({ guard: G });
  const actualOwner = r.encounters.find(e => e.id === entity.id).owner;
  const requested = { ...actualOwner, generation: 'X'.repeat(22) };

  const beforeRaw = JSON.stringify(adapter.raw());
  const receipt = await session.commitChatProjection(plan(r.base, { encounters: { put: [], remove: [{ id: entity.id, owner: requested }] } }), { guard: G });
  const after = await createVault({ adapter }).unlock('synthetic');

  assert.equal(receipt.status, 'not-written', JSON.stringify(receipt));
  assert.equal(receipt.reason, 'invalid-plan');
  assert.equal(JSON.stringify(adapter.raw()), beforeRaw, 'header and log unchanged, no P1');
  assert.equal(after.state.encounters.has(entity.id), true, 'entity still present');
  assert.equal(after.state.keyGenerations.get('c:synthetic-a'), actualOwner.generation);
});

test('owned removal rejects explicit null on a typed owner before P1', async () => {
  const { adapter, session } = await fresh();
  await seedThread(session);
  const r1 = await session.readChatProjection({ guard: G });
  const entity = structuredClone(FIXTURE.values.find(v => v.owner.type === 'thread' && v.owner.id === 'synthetic-a'));
  entity.owner = r1.owners.find(o => o.type === 'thread' && o.id === 'synthetic-a');
  assert.equal((await session.commitChatProjection(plan(r1.base, { encounters: { put: [entity], remove: [] } }), { guard: G })).status, 'committed');

  const r = await session.readChatProjection({ guard: G });
  const actualOwner = r.encounters.find(e => e.id === entity.id).owner;
  const requested = { ...actualOwner, generation: null };

  const beforeRaw = JSON.stringify(adapter.raw());
  const receipt = await session.commitChatProjection(plan(r.base, { encounters: { put: [], remove: [{ id: entity.id, owner: requested }] } }), { guard: G });
  const after = await createVault({ adapter }).unlock('synthetic');

  assert.equal(receipt.status, 'not-written', JSON.stringify(receipt));
  assert.equal(receipt.reason, 'invalid-plan');
  assert.equal(JSON.stringify(adapter.raw()), beforeRaw, 'header and log unchanged, no P1');
  assert.equal(after.state.encounters.has(entity.id), true, 'entity still present');
  assert.equal(after.state.keyGenerations.get('c:synthetic-a'), actualOwner.generation);
});

// ---- Legacy OFF passive snapshot refusal ----

async function setupVaultWithTyped(typed) {
  const adapter = createMemoryAdapter();
  const vault = createVault({ adapter });
  const session = await vault.create('synthetic', { iterations: ITER });
  const thread = await seedThread(session);
  if (typed) {
    const r = await session.readChatProjection({ guard: G });
    const entity = structuredClone(FIXTURE.values.find(v => v.owner.type === 'thread' && v.owner.id === 'synthetic-a'));
    entity.owner = r.owners.find(o => o.type === 'thread' && o.id === 'synthetic-a');
    assert.equal((await session.commitChatProjection(plan(r.base, { encounters: { put: [entity], remove: [] } }), { guard: G })).status, 'committed');
  }
  const realLocal = memoryStorage({ [VAULT_MARKER]: '1' });
  const realSession = memoryStorage();
  const lease = providedLease();
  const app = createAppStorage({ realLocal, realSession });
  app.attach(session, { writer: true, lease, adapter });
  assert.equal(app.exclusive, true);
  const control = createVaultControl({ app, adapter, realLocal, realSession, docs: { all: async () => [], put: async () => {} }, dropDocsDb: async () => {}, reload: () => {}, iterations: ITER });
  return { adapter, realLocal, realSession, session, app, lease, control, thread };
}

test('legacy OFF refuses typed state without clearing any owned data', async () => {
  const { adapter, realLocal, realSession, session, app, lease, control } = await setupVaultWithTyped(true);

  const beforeRaw = JSON.stringify(adapter.raw());
  let error = null;
  try { await control.disable('synthetic'); } catch (e) { error = { code: e.code, message: e.message }; }
  const afterRaw = JSON.stringify(adapter.raw());

  assert.ok(error, 'typed-aware handoff absent: legacy OFF must refuse, preserving sole typed data');
  assert.equal(afterRaw, beforeRaw, 'adapter raw exactly unchanged');
  const after = await createVault({ adapter }).unlock('synthetic');
  assert.equal(after.state.encounters.has('enc:synthetic-a'), true, 'owned encounter still present');
  assert.equal(after.state.keyGenerations.has('c:synthetic-a'), true);
  assert.equal(after.header.format, 'plc-vault/2');
  assert.equal(after.damaged.length, 0);
  assert.equal(after.destroyedRecords, 0);
  assert.equal(app.active, true, 'session still attached');
  assert.equal(app.lease, lease, 'lease preserved');
  assert.equal(app.lease.owned, true, 'lease still owned');
  assert.equal(app.vaultSession, session, 'the same session is still attached');
  assert.equal(realLocal.getItem(VAULT_MARKER), '1', 'marker preserved');
  assert.equal(realLocal.getItem('chatThreads'), null, 'raw threads not resurrected');
});

test('legacy OFF ordinary control still restores plain data', async () => {
  const { adapter, realLocal, realSession, session, app, lease, control, thread } = await setupVaultWithTyped(false);

  const beforeRaw = JSON.stringify(adapter.raw());
  await control.disable('synthetic');
  const afterRaw = JSON.stringify(adapter.raw());

  assert.notEqual(afterRaw, beforeRaw, 'vault was cleared');
  assert.equal(await adapter.readHeader(), null, 'vault header removed');
  assert.equal(realLocal.getItem(VAULT_MARKER), null, 'marker removed');
  assert.equal(app.active, false, 'session detached');
  // Ordinary OFF restored the EXACT original threadJSON that was put through putThread, byte for byte.
  assert.equal(realLocal.getItem('chatThreads'), JSON.stringify([thread]), 'the exact original threadJSON is back in the plain storage');
  assert.equal(app.lease, null, 'the detach forgot the lease handle');
  assert.equal(lease.owned, false, 'the action gave its own writer lock back');
  assert.equal(app.vaultSession, null, 'no session remains attached');
});

test('ordinary thread export preserves its projection with typed state', async () => {
  const { adapter, session } = await fresh();
  const thread = await seedThread(session);
  const r1 = await session.readChatProjection({ guard: G });
  const entity = structuredClone(FIXTURE.values.find(v => v.owner.type === 'thread' && v.owner.id === 'synthetic-a'));
  entity.owner = r1.owners.find(o => o.type === 'thread' && o.id === 'synthetic-a');
  assert.equal((await session.commitChatProjection(plan(r1.base, { encounters: { put: [entity], remove: [] } }), { guard: G })).status, 'committed');

  // readChatProjection (the ordinary thread export route) must still work with typed state, and carry the FULL original thread.
  const r = await session.readChatProjection({ guard: G });
  assert.equal(r.threads.length, 1);
  assert.deepEqual(r.threads[0], thread, 'the full original thread, as putThread received it');
  assert.equal(r.threads[0].id, 'synthetic-a');
  assert.equal(r.encounters.length, 1);
  assert.equal(r.encounters[0].id, 'enc:synthetic-a');
  assert.equal(r.encounters[0].owner.type, 'thread');
  assert.equal(r.encounters[0].owner.id, 'synthetic-a');
  assert.match(r.encounters[0].owner.generation, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(r.base);

  // The FULL original thread projection through app.local.getItem, with the typed state committed.
  const realLocal = memoryStorage({ [VAULT_MARKER]: '1' });
  const realSession = memoryStorage();
  const lease = providedLease();
  const app = createAppStorage({ realLocal, realSession });
  app.attach(session, { writer: true, lease, adapter });
  const threadsJson = app.local.getItem('chatThreads');
  assert.ok(threadsJson);
  assert.equal(threadsJson, JSON.stringify([thread]), 'the export is the full original thread projection');
  const threads = JSON.parse(threadsJson);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0], thread);
  assert.equal(threads[0].id, 'synthetic-a');
});
