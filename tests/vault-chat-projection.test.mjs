import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createVault, VaultError } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createAppStorage, memoryStorage, reconcileRaw, createAndMigrate } from '../chat/vault/vault-store.mjs';

// The one engine-owned commitChatProjection (P1/P2/P3), reconcileChatProjection, the atomic header+log adapter seam and the legacy holds.
// Real engine, real WebCrypto, real memory adapter; faults are injected only around the adapter's replaceLog (the single place the engine can fail durably).

const ITER = 1000;
const V = (E, extra = {}, thread = null) => ({ format: 1, encounter: { id: E, thread }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\u0000h1']: 'p1' }, ...extra });
const plan = (base, over = {}) => ({ base, operationId: 'op', threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: 1, epoch: 1 }, ...over });
const local = (base, E = 'E1', T = 't1', rev = 1, extra = {}) => plan(base, { encounters: { put: [{ id: E, owner: { type: 'thread', id: T }, value: V(E, {}, T) }], remove: [] }, logical: { v: 1, rev, epoch: 1 }, ...extra });
const G = () => true;
async function fresh(adapter = createMemoryAdapter()) {
  const vault = createVault({ adapter }); const session = await vault.create('pw', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [] }); await session.setKv('l/chatThreads.order', '["t1"]');
  return { adapter, session };
}
/** An adapter that forwards to the real one and lets a test fail the Nth projection call (1=P1, 2=P2, 3=P3) before or after it reached the store. */
function faulty(real, hooks = {}) {
  const projections = [];
  const wrapped = {
    kind: 'memory', atomicProjection: true, projections,
    readHeader: () => real.readHeader(), readLog: () => real.readLog(), writeHeader: (h, o) => real.writeHeader(h, o), append: (r, o) => real.append(r, o), clear: (o) => real.clear(o), raw: () => real.raw(),
    async replaceLog(args) {
      if (!args.expected) return real.replaceLog(args);
      projections.push(args); const n = projections.length, hook = hooks[n] || {};
      if (hook.before) await hook.before(args);
      const out = await real.replaceLog(args);
      if (hook.after) await hook.after(args);
      return out;
    }
  };
  return wrapped;
}
const state = async (adapter) => createVault({ adapter }).unlock('pw');
const indexOf = async (adapter) => JSON.parse((await state(adapter)).state.kv.get('meta/encounters.index.v1'));

// ---- the adapter seam: one transaction over header AND log -------------------------------------------------------------------------------------------------------------------
test('adapter: expected header+log and nextHeader are applied together or not at all (mismatch, duplicate in the middle, guard)', async () => {
  const a = createMemoryAdapter();
  assert.equal(a.atomicProjection, true);
  const rec = (seq) => ({ seq, keyId: 'dek', iv: 'AA==', data: 'AA==' });
  await a.writeHeader({ format: 'plc-vault/1', wraps: [] }); await a.append(rec(1));
  const expected = { header: await a.readHeader(), log: await a.readLog() };
  const snap = () => JSON.stringify(a.raw());
  const before = snap();
  await assert.rejects(() => a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected: { header: { ...expected.header, format: 'other' }, log: expected.log }, nextHeader: { format: 'plc-vault/2', wraps: [] } }), (e) => e.code === 'expected-mismatch');
  await assert.rejects(() => a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected: { header: expected.header, log: [] }, nextHeader: { format: 'plc-vault/2', wraps: [] } }), (e) => e.code === 'expected-mismatch');
  await assert.rejects(() => a.replaceLog({ add: [rec(2), rec(1)], removeUpTo: 0, expected, nextHeader: { format: 'plc-vault/2', wraps: [] } }), (e) => e.code === 'conflict');
  await assert.rejects(() => a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected, nextHeader: { format: 'plc-vault/2', wraps: [] }, guard: () => false }), (e) => e.code === 'session-changed');
  assert.equal(snap(), before, 'every failed attempt left BOTH header and log unchanged');
  await a.replaceLog({ add: [rec(2), rec(3)], removeUpTo: 0, expected, nextHeader: { format: 'plc-vault/2', wraps: [] }, guard: () => true });
  assert.equal((await a.readHeader()).format, 'plc-vault/2'); assert.deepEqual((await a.readLog()).map((r) => r.seq), [1, 2, 3]);
  const again = { header: await a.readHeader(), log: await a.readLog() };
  await assert.rejects(() => a.replaceLog({ add: [rec(9)], removeUpTo: 1, expected: again, nextHeader: again.header }), (e) => e instanceof TypeError || e.code === 'invalid', 'removeUpTo must stay 0 with projection arguments');
  await a.replaceLog({ add: [rec(10)], removeUpTo: 3 }); assert.deepEqual((await a.readLog()).map((r) => r.seq), [10], 'the ordinary contract is unchanged');
});

test('a custom adapter without the exact atomic capability refuses before any write (no sequential fallback)', async () => {
  const real = createMemoryAdapter();
  const { session } = await fresh(real);
  const adapter = { readHeader: () => real.readHeader(), readLog: () => real.readLog(), writeHeader: (h, o) => real.writeHeader(h, o), append: (r, o) => real.append(r, o), replaceLog: (x) => real.replaceLog(x), clear: (o) => real.clear(o) };
  const s2 = await createVault({ adapter }).unlock('pw');
  const r = await s2.readChatProjection({ guard: G });
  const before = JSON.stringify(real.raw());
  const out = await s2.commitChatProjection(local(r.base), { guard: G });
  assert.equal(out.status, 'not-written'); assert.equal(out.reason, 'no-atomic-adapter');
  assert.equal(JSON.stringify(real.raw()), before);
  void session;
});

// ---- phases -----------------------------------------------------------------------------------------------------------------------------------------------------------------
test('P1/P2/P3: P1 changes only the noncontent pending marker, P2 carries everything plus header 2, P3 clears only this pending', async () => {
  const real = createMemoryAdapter(); const seen = [];
  const { session } = await fresh(real);
  const adapter = faulty(real, { 1: { after: async () => seen.push({ p: 1, header: (await real.readHeader()).format, index: await indexOf(real) }) }, 2: { after: async () => seen.push({ p: 2, header: (await real.readHeader()).format, index: await indexOf(real) }) }, 3: { after: async () => seen.push({ p: 3, header: (await real.readHeader()).format, index: await indexOf(real) }) } });
  const s = await createVault({ adapter }).unlock('pw');
  const r = await s.readChatProjection({ guard: G });
  const out = await s.commitChatProjection(local(r.base), { guard: G });
  assert.equal(out.status, 'committed', JSON.stringify(out));
  assert.equal(adapter.projections.length, 3);
  assert.deepEqual(adapter.projections.map((p) => p.add.length > 0), [true, true, true]);
  assert.equal(adapter.projections[0].add.length, 1, 'P1 is one noncontent record'); assert.equal(adapter.projections[0].nextHeader.format, 'plc-vault/1', 'P1 does not advance the header');
  assert.equal(adapter.projections[1].nextHeader.format, 'plc-vault/2', 'P2 carries the first semantic header in the same transaction');
  assert.equal(adapter.projections[2].add.length, 1, 'P3 is one noncontent record');
  const [p1, p2, p3] = seen;
  assert.equal(p1.header, 'plc-vault/1'); assert.equal(p1.index.pending.baseRevision, p1.index.revision); assert.equal(p1.index.entities.length, 0); assert.equal(p1.index.committed, null);
  assert.equal(p2.header, 'plc-vault/2'); assert.equal(p2.index.pending.id, p1.index.pending.id); assert.equal(p2.index.committed.id, p1.index.pending.id); assert.equal(p2.index.committed.baseRevision, p1.index.revision); assert.equal(p2.index.revision, p2.index.committed.revision); assert.equal(p2.index.entities.length, 1);
  assert.equal(p3.index.pending, null); assert.deepEqual(p3.index.committed, p2.index.committed); assert.equal(out.id, p1.index.pending.id); assert.equal(out.revision, p2.index.revision);
  assert.equal(JSON.stringify(p1.index).includes('secret'), false); assert.equal(JSON.stringify(p3.index).includes('secret'), false, 'no payload or label in the index');
  assert.deepEqual(Object.keys(p3.index).sort(), ['committed', 'entities', 'logical', 'pending', 'revision', 'v']);
  assert.deepEqual(p3.index.logical, { v: 1, rev: 1, epoch: 1 });
  assert.equal(s.state.encounters.has('E1'), true, 'live memory is published only after the verified settlement');
  void session;
});

test('crash cases: before P1, after P1, before P2, after P2, before P3, after P3; reconcile gives the exact durable outcome and never reuses a seq blindly', async () => {
  const cases = [
    { name: 'before P1', hooks: { 1: { before: async () => { throw new Error('crash'); } } }, expect: 'abandoned-or-clean', payload: false },
    { name: 'after P1 (completion lost)', hooks: { 1: { after: async () => { throw new Error('crash'); } } }, expect: 'abandoned', payload: false },
    { name: 'before P2', hooks: { 2: { before: async () => { throw new Error('crash'); } } }, expect: 'abandoned', payload: false },
    { name: 'after P2 (completion lost)', hooks: { 2: { after: async () => { throw new Error('crash'); } } }, expect: 'committed', payload: true },
    { name: 'before P3', hooks: { 3: { before: async () => { throw new Error('crash'); } } }, expect: 'committed', payload: true },
    { name: 'after P3 (completion lost)', hooks: { 3: { after: async () => { throw new Error('crash'); } } }, expect: 'committed', payload: true, self: true }
  ];
  for (const c of cases) {
    const real = createMemoryAdapter(); await fresh(real);
    const s = await createVault({ adapter: faulty(real, c.hooks) }).unlock('pw');
    const r = await s.readChatProjection({ guard: G });
    const out = await s.commitChatProjection(local(r.base), { guard: G });
    assert.ok(['unknown', 'unsettled', 'not-committed'].includes(out.status), c.name + ' => ' + JSON.stringify(out));
    assert.ok(out.id, c.name + ': the original operation id is retained');
    assert.equal(s.needsReconcile, true, c.name);
    const logBefore = JSON.stringify(real.raw());
    for (const fn of [() => s.setKv('l/x', '1'), () => s.append({ scope: 'dek', event: { t: 'kv.set', k: 'l/y', v: '1' } }), () => s.compact()]) {
      await assert.rejects(fn, (e) => e.code === 'needs-reconcile', c.name);
    }
    const blocked = await s.commitChatProjection(local(r.base, 'E2'), { guard: G });
    assert.equal(blocked.status, 'not-written', c.name); assert.equal(blocked.reason, 'needs-reconcile', c.name);
    assert.equal(JSON.stringify(real.raw()), logBefore, c.name + ': nothing was appended while unresolved (no seq reuse)');
    const other = await createVault({ adapter: real }).unlock('pw');
    // A settled exact receipt is only reportable by the session that owns the uncertain operation; a fresh session just reports a clean store.
    const fresh2 = c.self ? s : other;
    const rec = await fresh2.reconcileChatProjection({ guard: G });
    if (c.self) assert.equal((await other.reconcileChatProjection({ guard: G })).status, 'clean', 'a fresh session has no operation to claim');
    const durable = await state(real);
    assert.equal(durable.state.encounters.has('E1'), c.payload, c.name + ' payload');
    if (c.payload) { assert.equal(rec.status, 'committed', c.name + ' ' + JSON.stringify(rec)); assert.equal(rec.id, out.id); }
    else assert.ok(['abandoned', 'clean'].includes(rec.status), c.name + ' ' + JSON.stringify(rec));
    const index = JSON.parse(durable.state.kv.get('meta/encounters.index.v1') ?? 'null');
    assert.equal(index === null || index.pending === null, true, c.name + ': no pending survives reconcile');
    assert.equal(fresh2.needsReconcile, false);
    assert.equal((await fresh2.setKv('l/after', '1')) > 0, true, c.name + ': writes resume at a fresh verified seq');
    assert.equal(durable.damaged.length, 0, c.name);
  }
});

test('an uncertain completion keeps the possibly durable result and blocks the SAME session until a verified fresh replay (reconcile on the same session works)', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  const s = await createVault({ adapter: faulty(real, { 2: { after: async () => { throw new Error('lost completion'); } } }) }).unlock('pw');
  const r = await s.readChatProjection({ guard: G });
  const out = await s.commitChatProjection(local(r.base), { guard: G });
  assert.equal(out.status, 'unknown');
  assert.equal(s.state.encounters.size, 0, 'no stale memory publication for an unverified result');
  const rec = await s.reconcileChatProjection({ guard: G });
  assert.equal(rec.status, 'committed'); assert.equal(s.state.encounters.has('E1'), true);
});

test('stale base, stale settlement and a newer pending are never cleared by a delayed or foreign settlement', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  const a = await createVault({ adapter: faulty(real, { 3: { before: async () => { throw new Error('crash before P3'); } } }) }).unlock('pw');
  const ra = await a.readChatProjection({ guard: G });
  const outA = await a.commitChatProjection(local(ra.base), { guard: G });
  assert.equal(outA.status, 'unknown');
  // b's first projection call is its own settlement of P (#1); the fault hits the P1 of Q (#2).
  const b = await createVault({ adapter: faulty(real, { 2: { after: async () => { throw new Error('crash after P1 of Q'); } } }) }).unlock('pw');
  const settled = await b.reconcileChatProjection({ guard: G });
  assert.equal(settled.status, 'committed');
  const rb = await b.readChatProjection({ guard: G });
  const outQ = await b.commitChatProjection(local(rb.base, 'E2', 't1', 2), { guard: G });
  assert.equal(outQ.status, 'unknown');
  const pendingQ = (await indexOf(real)).pending;
  assert.ok(pendingQ && pendingQ.id === outQ.id);
  const lateA = await a.reconcileChatProjection({ guard: G });
  assert.equal(lateA.status, 'unresolved', JSON.stringify(lateA));
  assert.deepEqual((await indexOf(real)).pending, pendingQ, 'a delayed settlement of P did not clear the newer pending');
  const stale = await a.commitChatProjection(local(ra.base, 'E3'), { guard: G });
  assert.equal(stale.status, 'not-written'); assert.ok(['stale-base', 'needs-reconcile'].includes(stale.reason));
  const fixed = await b.reconcileChatProjection({ guard: G });
  assert.equal(fixed.status, 'abandoned');
  assert.equal((await state(real)).state.encounters.has('E2'), false); assert.equal((await state(real)).state.encounters.has('E1'), true);
});

test('post-commit lock or lost authority keeps the durable result, reports unknown, and never repopulates obsolete memory', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  let live = true, session;
  const adapter = faulty(real, { 2: { after: async () => { live = false; session.lock(); } } });
  session = await createVault({ adapter }).unlock('pw');
  const r = await session.readChatProjection({ guard: () => live });
  const out = await session.commitChatProjection(local(r.base), { guard: () => live });
  assert.equal(out.status, 'unknown'); assert.match(out.reason, /authority|locked/);
  assert.equal(session.state.encounters.size, 0); assert.equal(session.state.threads.size, 0);
  assert.equal((await state(real)).state.encounters.has('E1'), true, 'the legitimately durable P2 stays');
});

test('the guard and the JSON plan are captured at invocation: later caller mutation substitutes neither', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  const s = await createVault({ adapter: real }).unlock('pw');
  const r = await s.readChatProjection({ guard: G });
  const p = local(r.base), options = { guard: () => false };
  const pending = s.commitChatProjection(p, options);
  options.guard = () => true; p.encounters.put[0].value.events.ev1.text = 'CHANGED'; p.encounters.put[0].id = 'E9'; p.logical.rev = 99;
  const out = await pending;
  assert.equal(out.status, 'not-written', 'the captured false guard refused; the swapped guard was ignored');
  assert.equal(JSON.stringify((await real.raw()).log).length > 0, true);
  assert.equal((await state(real)).state.encounters.size, 0);
  const options2 = { guard: G }, p2 = local((await s.readChatProjection({ guard: G })).base);
  const pending2 = s.commitChatProjection(p2, options2);
  p2.encounters.put[0].value.events.ev1.text = 'CHANGED'; p2.encounters.put[0].id = 'E9'; options2.guard = () => false;
  const out2 = await pending2;
  assert.equal(out2.status, 'committed', JSON.stringify(out2));
  const durable = (await state(real)).state.encounters;
  assert.equal(durable.get('E1').value.events.ev1.text, 'secret words'); assert.equal(durable.has('E9'), false);
});

test('read snapshots do not alias live state and survive a lock; a fresh read after lock refuses', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const r = await session.readChatProjection({ guard: G });
  assert.equal((await session.commitChatProjection(local(r.base), { guard: G })).status, 'committed');
  const read = await session.readChatProjection({ guard: G });
  const copy = JSON.stringify({ t: read.threads, e: read.encounters, i: read.index, o: read.order });
  session.lock();
  assert.equal(JSON.stringify({ t: read.threads, e: read.encounters, i: read.index, o: read.order }), copy, 'lock cleared live state, not the snapshot');
  read.encounters[0].value.events.ev1.text = 'tamper';
  await assert.rejects(() => session.readChatProjection({ guard: G }), (e) => e.code === 'locked');
  assert.equal((await state(real)).state.encounters.get('E1').value.events.ev1.text, 'secret words');
});

test('plan validation happens before any P1: bad owner, dangling local owner, duplicate ids, unknown root, unsupported kind, wrong order, wrong generation', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const r = await session.readChatProjection({ guard: G });
  const before = JSON.stringify(real.raw());
  const bad = async (name, p, reason) => { const out = await session.commitChatProjection(p, { guard: G }); assert.equal(out.status, 'not-written', name + JSON.stringify(out)); if (reason) assert.equal(out.reason, reason, name); assert.equal(JSON.stringify(real.raw()), before, name + ': no P1 was written'); };
  await bad('absent owner', local(r.base, 'E1', 'nothread'), 'invalid-plan');
  await bad('implicit creation of a thread owner', plan(r.base, { threads: { put: [{ id: 't9', title: 'x' }], create: [], remove: [], order: ['t1', 't9'] } }), 'invalid-plan');
  await bad('duplicate entity ids', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', {}, 't1') }, { id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', {}, 't1') }], remove: [] } }), 'invalid-plan');
  await bad('unknown root field in the value', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', { intent: { kind: 'x' } }, 't1') }], remove: [] } }), 'unsupported-ownership');
  await bad('holder prefix mismatch', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: { ...V('E1', {}, 't1'), holders: { ['E7\u0000h']: 'p1' } } }], remove: [] } }), 'invalid-plan');
  await bad('participant of another encounter', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: { ...V('E1', {}, 't1'), participants: { p1: { id: 'p1', encounter: 'E2' } } } }], remove: [] } }), 'invalid-plan');
  // a contradictory record: the encounter says it belongs to no chat / another chat, the plan assigns it to t1; and a standalone record that names a chat
  await bad('local value whose encounter.thread is null under a thread owner', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', {}, null) }], remove: [] } }), 'invalid-plan');
  await bad('local value whose encounter.thread names another chat', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', {}, 't2') }], remove: [] } }), 'invalid-plan');
  await bad('standalone value that names a chat', plan(r.base, { standalone: { create: ['S1'], destroy: [] }, encounters: { put: [{ id: 'S1', owner: { type: 'encounter', id: 'S1' }, value: V('S1', {}, 't1') }], remove: [] } }), 'invalid-plan');
  await bad('standalone entity owned by a different encounter id', plan(r.base, { standalone: { create: ['S2'], destroy: [] }, encounters: { put: [{ id: 'S1', owner: { type: 'encounter', id: 'S2' }, value: V('S1') }], remove: [] } }), 'invalid-plan');
  await bad('standalone.create with no first entity (orphan owner)', plan(r.base, { standalone: { create: ['S1'], destroy: [] } }), 'invalid-plan');
  await bad('standalone.create whose only entity is another encounter', plan(r.base, { standalone: { create: ['S1'], destroy: [] }, encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value: V('E1', {}, 't1') }], remove: [] } }), 'invalid-plan');
  await bad('a generation chosen for a new owner', plan(r.base, { standalone: { create: ['S1'], destroy: [] }, encounters: { put: [{ id: 'S1', owner: { type: 'encounter', id: 'S1', generation: 'chosen' }, value: V('S1') }], remove: [] } }), 'invalid-plan');
  await bad('generation:null for an owner that does not exist', plan(r.base, { standalone: { create: ['S1'], destroy: [] }, encounters: { put: [{ id: 'S1', owner: { type: 'encounter', id: 'S1', generation: null }, value: V('S1') }], remove: [] } }), 'invalid-plan');
  await bad('a made-up generation for a legacy owner', plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1', generation: 'made-up' }, value: V('E1', {}, 't1') }], remove: [] } }), 'invalid-plan');
  await bad('removing a thread without an order that covers the result', plan(r.base, { threads: { put: [], create: [], remove: ['t1'], order: ['t1'] } }), 'invalid-plan');
  await bad('wrong standalone generation', plan(r.base, { standalone: { create: [], destroy: [{ id: 'S9', generation: 'zzz' }] } }), 'invalid-plan');
  await bad('non-object plan target', { ...local(r.base), encounters: 'nope' }, 'invalid-plan');
  await bad('a base from another session', local({ ...r.base }), 'bad-base');
});

test('an ordinary write whose reply is lost keeps the durable record and bars every next write until a verified replay (no seq reuse)', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  let lose = true;
  const lossy = { ...faulty(real), append: async (r, o) => { await real.append(r, o); if (lose) { lose = false; throw new Error('reply lost'); } } };
  const s = await createVault({ adapter: lossy }).unlock('pw');
  await assert.rejects(() => s.setKv('l/a', '1'), /reply lost/);
  const afterLoss = JSON.stringify(real.raw());
  assert.ok((await real.readLog()).length >= 1);
  assert.equal(s.needsReconcile, true);
  await assert.rejects(() => s.setKv('l/b', '2'), (e) => e.code === 'needs-reconcile');
  await assert.rejects(() => s.append({ scope: 'dek', event: { t: 'kv.set', k: 'l/c', v: '3' } }), (e) => e.code === 'needs-reconcile');
  await assert.rejects(() => s.compact(), (e) => e.code === 'needs-reconcile');
  assert.equal(JSON.stringify(real.raw()), afterLoss, 'nothing was written, no seq reused, the durable record is untouched');
  assert.equal((await state(real)).state.kv.get('l/a'), '1', 'the first write is durable');
  assert.equal((await s.reconcileChatProjection({ guard: G })).status, 'clean');
  assert.equal(s.needsReconcile, false);
  assert.equal(s.state.kv.get('l/a'), '1', 'memory now shows the verified durable state');
  await s.setKv('l/b', '2'); // the positive control: writes work again with the next real seq
  const log = await real.readLog(); assert.deepEqual(log.map((r) => r.seq), [...new Set(log.map((r) => r.seq))].sort((x, y) => x - y), 'no duplicate seq');
  assert.equal((await state(real)).state.kv.get('l/b'), '2');
  // a KNOWN refusal before storage still rolls the seq back and does not bar the session
  const s2 = await createVault({ adapter: real }).unlock('pw');
  await assert.rejects(() => s2.setKv('l/x', '1', { guard: () => false }), (e) => e.code === 'session-changed');
  assert.equal(s2.needsReconcile, false); await s2.setKv('l/x', '1');
});

test('owner generations are exactly what the base observed: null only for a live legacy key, the live string for a typed owner; neither is a bypass', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const put = (base, generation, E = 'E1', rev = 1) => plan(base, { encounters: { put: [{ id: E, owner: { type: 'thread', id: 't1', ...(generation === undefined ? {} : { generation }) }, value: V(E, {}, 't1') }], remove: [] }, logical: { v: 1, rev, epoch: 1 } });
  let r = await session.readChatProjection({ guard: G });
  assert.deepEqual(r.owners.filter((o) => o.id === 't1'), [{ type: 'thread', id: 't1', generation: null }], 'the observation of a legacy key');
  const raw = JSON.stringify(real.raw());
  assert.equal((await session.commitChatProjection(put(r.base, 'invented'), { guard: G })).status, 'not-written');
  assert.equal(JSON.stringify(real.raw()), raw);
  const first = await session.commitChatProjection(put(r.base, null), { guard: G }); // the exact observed ref, carried in the plan
  assert.equal(first.status, 'committed', JSON.stringify(first));
  r = await session.readChatProjection({ guard: G });
  const live = r.owners.find((o) => o.id === 't1').generation;
  assert.match(live, /^[A-Za-z0-9_-]{22}$/);
  const after = JSON.stringify(real.raw());
  for (const [name, generation] of [['null on an owner that already has a generation', null], ['a wrong string', 'x'.repeat(22)]]) {
    const out = await session.commitChatProjection(put(r.base, generation, 'E2', 2), { guard: G });
    assert.equal(out.status, 'not-written', name); assert.equal(out.reason, 'invalid-plan', name); assert.equal(JSON.stringify(real.raw()), after, name + ': header and log unchanged, no P1');
  }
  assert.equal((await session.commitChatProjection(put(r.base, live, 'E2', 2), { guard: G })).status, 'committed', 'the live generation, carried exactly, is accepted');
  r = await session.readChatProjection({ guard: G });
  assert.equal((await session.commitChatProjection(put(r.base, undefined, 'E3', 3), { guard: G })).status, 'committed', 'omitting it takes the observed one');
});

test('standalone encounter: explicit create with its own e: owner, no fake chat; destroy with the right generation removes owner, key and payload; recreate gets a new generation', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  let r = await session.readChatProjection({ guard: G });
  const make = (base, rev) => plan(base, { standalone: { create: ['S1'], destroy: [] }, encounters: { put: [{ id: 'S1', owner: { type: 'encounter', id: 'S1' }, value: V('S1') }], remove: [] }, logical: { v: 1, rev, epoch: 1 } });
  assert.equal((await session.commitChatProjection(make(r.base, 1), { guard: G })).status, 'committed');
  let d = await state(real);
  assert.equal(d.state.threads.size, 1, 'no fake chat or doc was created'); assert.equal(d.state.docs.size, 0);
  assert.ok(d.state.keys.has('e:S1')); const g1 = d.state.keyGenerations.get('e:S1');
  r = await session.readChatProjection({ guard: G });
  const ref = r.encounters.find((e) => e.id === 'S1').owner;
  assert.equal(ref.generation, g1);
  const wrong = await session.commitChatProjection(plan(r.base, { standalone: { create: [], destroy: [{ id: 'S1', generation: 'nope' }] } }), { guard: G });
  assert.equal(wrong.status, 'not-written');
  const cleared = await session.commitChatProjection(plan(r.base, { standalone: { create: [], destroy: [{ id: 'S1', generation: g1 }] }, logical: { v: 1, rev: 2, epoch: 1 } }), { guard: G });
  assert.equal(cleared.status, 'committed', JSON.stringify(cleared));
  d = await state(real);
  assert.equal(d.state.encounters.size, 0); assert.equal(d.state.keys.has('e:S1'), false); assert.equal((await indexOf(real)).entities.length, 0);
  r = await session.readChatProjection({ guard: G });
  assert.equal((await session.commitChatProjection(make(r.base, 3), { guard: G })).status, 'committed');
  assert.notEqual((await state(real)).state.keyGenerations.get('e:S1'), g1);
});

test('unknown fields inside a recognized value survive commit, replay and compaction byte-for-byte', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const value = V('E1', {}, 't1'); value.encounter.futureField = { deep: [1, { x: null }] }; value.participants.p1.unknownP = 'p'; value.events.ev1.unknownEv = [true];
  const r = await session.readChatProjection({ guard: G });
  assert.equal((await session.commitChatProjection(plan(r.base, { encounters: { put: [{ id: 'E1', owner: { type: 'thread', id: 't1' }, value }], remove: [] } }), { guard: G })).status, 'committed');
  await session.compact();
  assert.deepEqual((await state(real)).state.encounters.get('E1').value, value);
});

test('compaction refuses while a pending operation exists', async () => {
  const real = createMemoryAdapter(); await fresh(real);
  const s = await createVault({ adapter: faulty(real, { 2: { before: async () => { throw new Error('crash'); } } }) }).unlock('pw');
  const r = await s.readChatProjection({ guard: G });
  await s.commitChatProjection(local(r.base), { guard: G });
  const s2 = await createVault({ adapter: real }).unlock('pw');
  await assert.rejects(() => s2.compact(), (e) => e.code === 'typed-hold' || e.code === 'pending');
});

test('queued commits from 4, 8 and 16 callers on one session: exactly one wins per base, the rest are refused stale, nothing is corrupt (repeated)', async () => {
  const repeats = Number(process.env.CONC_REPEAT || 5);
  for (const actors of [4, 8, 16]) for (let n = 0; n < repeats; n++) {
    const real = createMemoryAdapter(); const { session } = await fresh(real);
    const r = await session.readChatProjection({ guard: G });
    const outs = await Promise.all(Array.from({ length: actors }, (_, i) => session.commitChatProjection(local(r.base, 'E' + i, 't1', 1), { guard: G })));
    const committed = outs.filter((o) => o.status === 'committed'), refused = outs.filter((o) => o.status === 'not-written');
    assert.equal(committed.length, 1, actors + ' actors: exactly one winner ' + JSON.stringify(outs.map((o) => o.status)));
    assert.equal(refused.length, actors - 1); assert.ok(refused.every((o) => o.reason === 'stale-base'));
    const d = await state(real);
    assert.equal(d.state.encounters.size, 1); assert.equal(d.damaged.length, 0); assert.equal(JSON.parse(d.state.kv.get('meta/encounters.index.v1')).pending, null);
    const seqs = real.raw().log.map((x) => x.seq); assert.equal(new Set(seqs).size, seqs.length);
  }
});

// ---- legacy holds ---------------------------------------------------------------------------------------------------------------------------------------------------------------
async function typedStore() {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const r = await session.readChatProjection({ guard: G });
  assert.equal((await session.commitChatProjection(local(r.base), { guard: G })).status, 'committed');
  const store = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() });
  store.attach(session, { writer: true, adapter: real });
  return { real, session, store };
}
test('legacy facade holds BEFORE the optimistic mirror and the queue while typed state exists: setItem, removeItem and clear of chatThreads', async () => {
  const { real, store } = await typedStore();
  const held = [];
  const store2 = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage(), onHeldWrite: (k, why) => held.push([k, why]) });
  store2.attach(store.vaultSession, { writer: true, adapter: real });
  const raw = JSON.stringify([{ id: 't1', title: 'one', messages: [] }]);
  const before = JSON.stringify(real.raw()), shown = store2.local.getItem('chatThreads');
  store2.local.setItem('chatThreads', JSON.stringify([{ id: 't1', title: 'EDITED', messages: [] }, { id: 'tx', title: 'new' }]));
  store2.local.removeItem('chatThreads'); store2.local.clear();
  assert.equal(store2.local.getItem('chatThreads'), shown, 'the mirror did not change');
  assert.equal(store2.stats.pending, 0, 'no job was queued'); await store2.flush();
  assert.equal(JSON.stringify(real.raw()), before);
  assert.equal(held.length >= 3, true); assert.ok(held.every(([k, why]) => k === 'chatThreads' && why === 'typed-encounters'));
  void raw;
});

// Classifying plc.encounters.v1 in the production key table is a data-format change that needs a snapshot from a build that writes it (docs/DATA-COMPATIBILITY.md), so production does not classify it yet and
// every route leaves it alone. The hold is written so it applies the moment it IS classified; these tests apply that classification to a scratch copy of the real modules (the way the transition rig does).
const ANCHOR = '  "plc.shell.pins.v1": { store: "local", class: "user", format: 1 },\n';
async function classifiedModules() {
  const dir = mkdtempSync(path.join(tmpdir(), 'plc-classified-'));
  try {
    for (const f of ['vault-store.mjs', 'vault.mjs', 'vault-db.mjs', 'data-formats.mjs', 'key-classes.mjs']) {
      let text = readFileSync(new URL('../chat/vault/' + f, import.meta.url), 'utf8');
      if (f === 'key-classes.mjs') { assert.ok(text.includes(ANCHOR), 'the key table anchor'); text = text.replace(ANCHOR, ANCHOR + '  "plc.encounters.v1": { store: "local", class: "user", format: 1 },\n'); }
      writeFileSync(path.join(dir, f), text);
    }
    return await import(pathToFileURL(path.join(dir, 'vault-store.mjs')).href);
  } finally { rmSync(dir, { recursive: true, force: true }); } // the modules are loaded; only this owned folder is removed
}
const classified = await classifiedModules();
const LEDGER_TEXT = JSON.stringify({ v: 1, rev: 1, epoch: 1, encounters: { E1: { id: 'E1', thread: 't1' } }, participants: {}, events: { ev: { text: 'secret legacy' } }, holders: {} });
test('production key table: the unclassified legacy ledger is left alone by every route (never copied, never served from the vault)', async () => {
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const realLocal = memoryStorage({ 'plc.encounters.v1': LEDGER_TEXT, 'plc.prefs.v1': '{"a":1}' });
  const before = JSON.stringify(real.raw());
  const report = await reconcileRaw({ session, adapter: real, realLocal, writer: true, exclusive: true });
  assert.equal(report.held.some((h) => h.key === 'plc.encounters.v1'), false); assert.equal(report.recovered.includes('plc.encounters.v1'), false);
  assert.equal(JSON.stringify(real.raw()), before); assert.equal(realLocal.getItem('plc.encounters.v1'), LEDGER_TEXT);
  const adapter2 = createMemoryAdapter(), local2 = memoryStorage({ 'plc.encounters.v1': LEDGER_TEXT });
  const made = await createAndMigrate({ passphrase: 'pw', adapter: adapter2, realLocal: local2, realSession: memoryStorage(), iterations: ITER });
  assert.equal((await createVault({ adapter: adapter2 }).unlock('pw')).state.kv.has('l/plc.encounters.v1'), false); assert.equal(local2.getItem('plc.encounters.v1'), LEDGER_TEXT);
  assert.deepEqual(made.heldLegacy, []);
  made.session.lock();
  const store = createAppStorage({ realLocal: memoryStorage({ 'plc.encounters.v1': LEDGER_TEXT }), realSession: memoryStorage() });
  store.attach(session, { writer: true, adapter: real });
  assert.equal(store.local.getItem('plc.encounters.v1'), LEDGER_TEXT, 'an unclassified key is the browser\'s own storage');
  store.local.setItem('plc.encounters.v1', 'x'); await store.flush();
  assert.equal(JSON.stringify(real.raw()), before, 'and nothing reaches the vault');
});
test('legacy ledger plc.encounters.v1 is held once classified, never copied into the vault: reconcileRaw, createAndMigrate and appLocal named routes', async () => {
  const { reconcileRaw, createAndMigrate, createAppStorage, memoryStorage } = classified;
  const LEDGER = LEDGER_TEXT;
  // reconcileRaw: raw present, vault lacks it
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  const realLocal = memoryStorage({ 'plc.encounters.v1': LEDGER });
  const before = JSON.stringify(real.raw());
  const report = await reconcileRaw({ session, adapter: real, realLocal, writer: true, exclusive: true });
  assert.deepEqual(report.held.map((h) => [h.key, h.reason]).filter(([k]) => k === 'plc.encounters.v1'), [['plc.encounters.v1', 'legacy-encounters']]);
  assert.equal(report.recovered.includes('plc.encounters.v1'), false);
  assert.equal(JSON.stringify(real.raw()), before, 'reconcileRaw wrote nothing for the legacy ledger');
  assert.equal(realLocal.getItem('plc.encounters.v1'), LEDGER, 'the raw bytes are preserved');
  // createAndMigrate: new vault, ledger present
  const adapter2 = createMemoryAdapter(); const local2 = memoryStorage({ 'plc.encounters.v1': LEDGER, 'plc.prefs.v1': '{"a":1}' });
  const made = await createAndMigrate({ passphrase: 'pw', adapter: adapter2, realLocal: local2, realSession: memoryStorage(), iterations: ITER });
  const copy = await createVault({ adapter: adapter2 }).unlock('pw');
  assert.equal(copy.state.kv.has('l/plc.encounters.v1'), false, 'no DEK copy of the ledger');
  assert.equal(copy.state.kv.get('l/plc.prefs.v1'), '{"a":1}', 'other keys migrate as before');
  assert.equal(local2.getItem('plc.encounters.v1'), LEDGER);
  assert.deepEqual(made.heldLegacy, ['plc.encounters.v1']);
  made.session.lock();
  // appLocal route: a write through the vault-backed storage is refused
  const held = [];
  const store = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage(), onHeldWrite: (k, why) => held.push([k, why]) });
  store.attach(session, { writer: true, adapter: real });
  const logBefore = JSON.stringify(real.raw());
  store.local.setItem('plc.encounters.v1', LEDGER); store.local.removeItem('plc.encounters.v1'); await store.flush();
  assert.equal(JSON.stringify(real.raw()), logBefore);
  assert.deepEqual(held.map((h) => h[0]), ['plc.encounters.v1', 'plc.encounters.v1']);
});

test('an existing private DEK copy of the legacy ledger keeps its bytes and stays readable (once classified)', async () => {
  const { reconcileRaw, createAppStorage, memoryStorage } = classified;
  const LEDGER = JSON.stringify({ v: 1, rev: 4, epoch: 1, encounters: {}, participants: {}, events: {}, holders: {} });
  const real = createMemoryAdapter(); const { session } = await fresh(real);
  await session.setKv('l/plc.encounters.v1', LEDGER);
  const store = createAppStorage({ realLocal: memoryStorage({ 'plc.encounters.v1': LEDGER }), realSession: memoryStorage() });
  const report = await reconcileRaw({ session, adapter: real, realLocal: memoryStorage({ 'plc.encounters.v1': LEDGER }), writer: true, exclusive: true });
  assert.equal(report.recovered.length, 0);
  store.attach(session, { writer: true, adapter: real });
  assert.equal(store.local.getItem('plc.encounters.v1'), LEDGER);
  assert.equal((await state(real)).state.kv.get('l/plc.encounters.v1'), LEDGER);
});

test('error codes are VaultError instances with a stable code', async () => {
  const { session } = await fresh();
  await assert.rejects(() => session.setKv('meta/encounters.index.v1', '{}'), (e) => e instanceof VaultError && e.code === 'reserved');
});
