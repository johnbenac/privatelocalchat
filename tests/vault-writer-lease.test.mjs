// The vault writer lease: a real, releasable handle on the Web Lock (claimWriter), the store's live `exclusive`, and the control's enable / disable around it.
// SCOPE: the actual modules against a faithful in-memory Web Locks table (tests/helpers/web-locks-fake.mjs: the provided contract). The real-browser proof of the same behaviour is
// tests/helpers/vault-writer-lease-browser.mjs, and the visible-UI proof is tests/e2e/character-lifecycle.e2e.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppStorage, memoryStorage, claimWriter, VAULT_MARKER } from '../chat/vault/vault-store.mjs';
import { createVaultControl } from '../chat/vault/vault-control.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { createLockTable, providedLease } from './helpers/web-locks-fake.mjs';

globalThis.indexedDB ??= {}; // supported() only asks whether it exists
const WRITER = 'plc-vault-writer', FAST = 1000;
const chats = JSON.stringify([{ id: 'a', title: 'A', messages: [{ role: 'user', content: 'LEASE-MARKER-7' }] }]);
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

/** The shared world: one browser profile (storage, IndexedDB-like adapter, locks) and any number of pages in it. */
const world = (initial = {}) => {
  const realLocal = memoryStorage(initial.local || { chatThreads: chats }), realSession = memoryStorage(initial.session), adapter = createMemoryAdapter(), table = createLockTable();
  const events = [], docsPlain = new Map((initial.docs || []).map((d) => [d.id, d]));
  const page = (name, extra = {}) => {
    const app = createAppStorage({ realLocal, realSession });
    const docs = { all: async () => [...docsPlain.values()], put: async (d) => { if (extra.putFails) throw new Error('docs write failed (injected)'); await extra.beforePut?.(); docsPlain.set(d.id, d); } };
    const control = createVaultControl({ app, adapter, realLocal, realSession, docs, events: { emit: (n) => events.push(name + ':' + n) }, reload: () => {}, iterations: FAST, dropDocsDb: async () => {}, locks: table.page(name) });
    return { name, app, control, docs, locks: table.page(name) };
  };
  return { realLocal, realSession, adapter, table, events, docsPlain, page };
};
const writerOwner = (w) => w.table.heldBy(WRITER);

test('claimWriter: a granted handle is really owned and release() gives the physical lock back, once', async () => {
  const w = world(); const claim = await claimWriter({ locks: w.table.page('A') });
  assert.deepEqual([claim.writer, claim.supported, claim.owned], [true, true, true]); assert.equal(writerOwner(w), 'A');
  assert.equal(await claim.release(), true); assert.equal(claim.owned, false); assert.equal(writerOwner(w), null, 'the lock is free when release() has resolved');
  assert.equal(await claim.release(), false, 'idempotent: the second release does nothing');
});

test('an old handle can never release a newer lease (same page, or another page)', async () => {
  const w = world(); const one = await claimWriter({ locks: w.table.page('A') }); await one.release();
  const two = await claimWriter({ locks: w.table.page('A') }); assert.equal(two.owned, true);
  assert.equal(await one.release(), false); assert.equal(two.owned, true); assert.equal(writerOwner(w), 'A', 'the newer lease of the same page survives the stale release');
  await two.release();
  const three = await claimWriter({ locks: w.table.page('B') }); assert.equal(await one.release(), false); assert.equal(await two.release(), false);
  assert.equal(three.owned, true); assert.equal(writerOwner(w), 'B', 'and so does another page\'s');
});

test('a refused claim is read-only truth: not owned, release() has no power, waitUntilFree keeps no lock and promotes nothing', async () => {
  const w = world(); const owner = await claimWriter({ locks: w.table.page('A') }); const refused = await claimWriter({ locks: w.table.page('B') });
  assert.deepEqual([refused.writer, refused.supported, refused.owned], [false, true, false]);
  assert.equal(await refused.release(), false); assert.equal(writerOwner(w), 'A', 'releasing a refused claim never touches the owner');
  let freed = 0, heldAtNotice = null; refused.waitUntilFree().then(() => { freed++; heldAtNotice = w.table.heldNames(); });
  await tick(); assert.equal(freed, 0, 'no notice while the owner lives'); assert.equal(w.table.queued(WRITER), 1);
  await owner.release(); await tick();
  assert.equal(freed, 1); assert.deepEqual(heldAtNotice, [], 'the temporary request is gone when the notice arrives: ' + JSON.stringify(heldAtNotice)); assert.equal(refused.owned, false); assert.equal(refused.writer, false);
  const next = await claimWriter({ locks: w.table.page('C') }); assert.equal(next.owned, true, 'no invisible waiter blocks a later claim');
});

test('stopWaiting cancels a queued waiter: no notice and no lock later', async () => {
  const w = world(); const owner = await claimWriter({ locks: w.table.page('A') }); const refused = await claimWriter({ locks: w.table.page('B') });
  let freed = 0; refused.waitUntilFree().then(() => { freed++; }); await tick(); refused.stopWaiting(); await owner.release(); await tick();
  assert.equal(freed, 0); assert.deepEqual(w.table.heldNames(), []); assert.equal(w.table.queued(WRITER), 0);
});

test('the owner page closing (crash) frees the lock and notifies the waiter without leaving a hold', async () => {
  const w = world(); await claimWriter({ locks: w.table.page('A') }); const refused = await claimWriter({ locks: w.table.page('B') });
  let freed = false; refused.waitUntilFree().then(() => { freed = true; }); await tick();
  w.table.closePage('A'); await tick();
  assert.equal(freed, true); assert.deepEqual(w.table.heldNames(), [], 'last owner closed: nothing is held, not even by the waiter');
});

test('unsupported (no Web Locks): never exclusive, nothing to release', async () => {
  const claim = await claimWriter({ locks: undefined });
  assert.deepEqual([claim.writer, claim.supported, claim.owned], [true, false, false]); assert.equal(await claim.release(), false);
  const app = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() }); const s = await createVault({ adapter: createMemoryAdapter() }).create('pw', { iterations: FAST });
  app.attach(s, { writer: true, lease: claim }); assert.equal(app.exclusive, false, 'a handle that is not a supported owned lock never makes the app exclusive');
});

test('app.exclusive follows the live handle, not a stale boolean', async () => {
  const w = world(); const p = w.page('A'); const claim = await claimWriter({ locks: p.locks });
  const s = await createVault({ adapter: w.adapter }).create('pw', { iterations: FAST }); p.app.attach(s, { writer: true, lease: claim });
  assert.equal(p.app.exclusive, true); assert.equal(p.app.lease, claim);
  await claim.release(); assert.equal(p.app.exclusive, false, 'released lock: no authority although the page is still attached');
  p.app.detach(); assert.equal(p.app.lease, null);
  const q = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() }); q.attach(s, { writer: true, lease: providedLease() }); assert.equal(q.exclusive, true, 'an explicit provided lease (supported, owned) gives authority');
  const noHandle = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() }); noHandle.attach(s, { writer: true, exclusive: true }); assert.equal(noHandle.exclusive, false, 'there is no boolean path: an old-style exclusive:true without a handle is not authority');
  const refusedLike = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() }); refusedLike.attach(s, { writer: true, lease: providedLease({ owned: false }) }); assert.equal(refusedLike.exclusive, false);
});

test('enable claims BEFORE it writes: another owner makes it refuse with nothing created', async () => {
  const w = world(); const other = await claimWriter({ locks: w.table.page('A') }); const b = w.page('B');
  await assert.rejects(() => b.control.enable('pw'), (e) => e.code === 'read-only');
  assert.equal(await w.adapter.readHeader(), null, 'no vault was created'); assert.equal(w.realLocal.getItem(VAULT_MARKER), null); assert.equal(w.realLocal.getItem('chatThreads'), chats);
  assert.equal(b.app.active, false); assert.equal(writerOwner(w), 'A'); assert.equal(other.owned, true);
});

test('enable without Web Locks refuses before any migration write (an already-open vault keeps its ordinary use)', async () => {
  const w = world(); const app = createAppStorage({ realLocal: w.realLocal, realSession: w.realSession });
  const control = createVaultControl({ app, adapter: w.adapter, realLocal: w.realLocal, realSession: w.realSession, docs: { all: async () => [], put: async () => {} }, iterations: FAST, locks: { request: undefined } });
  await assert.rejects(() => control.enable('pw'), (e) => e.code === 'no-exclusive');
  assert.equal(await w.adapter.readHeader(), null); assert.equal(w.realLocal.getItem(VAULT_MARKER), null); assert.equal(app.active, false);
});

test('enable: the claim it made is given back when the migration fails, and when the lifecycle changed meanwhile', async () => {
  const w = world(); const a = w.page('A');
  const realWrite = w.adapter.writeHeader.bind(w.adapter); w.adapter.writeHeader = async () => { throw new Error('storage write failed (injected)'); };
  await assert.rejects(() => a.control.enable('pw'), /injected/); assert.deepEqual(w.table.heldNames(), [], 'a failed enable holds no lock'); assert.equal(a.app.active, false);
  w.adapter.writeHeader = async (...args) => { a.app.attach(await createVault({ adapter: createMemoryAdapter() }).create('x', { iterations: FAST }), { writer: true }); return realWrite(...args); }; // something else attaches during the migration
  await assert.rejects(() => a.control.enable('pw'), (e) => e.code === 'session-changed'); assert.deepEqual(w.table.heldNames(), [], 'the stale enable gave back its own claim');
});

test('enable overlapping itself or a disable is refused as busy; the loser holds no lock', async () => {
  const w = world(); const a = w.page('A'); const first = a.control.enable('pw');
  await assert.rejects(() => a.control.enable('pw'), (e) => e.code === 'busy'); await first; assert.equal(writerOwner(w), 'A');
  const off = a.control.disable('pw'); await assert.rejects(() => a.control.enable('pw'), (e) => e.code === 'exists' || e.code === 'busy'); await off;
  assert.deepEqual(w.table.heldNames(), []);
});

test('turning off releases the lock after the durable work; the SAME page can turn it on again and clean up (the regression)', async () => {
  const w = world(); const a = w.page('A');
  await a.control.enable('pw'); await a.control.removePlaintext(); assert.equal(writerOwner(w), 'A');
  const lease1 = a.app.lease; await a.control.disable('pw');
  assert.deepEqual(w.table.heldNames(), [], 'after a successful off no physical lock remains'); assert.equal(await w.adapter.readHeader(), null); assert.equal(w.realLocal.getItem(VAULT_MARKER), null); assert.equal(w.realLocal.getItem('chatThreads'), chats, 'the plain copy is back, byte for byte');
  await a.control.enable('pw'); assert.equal(a.app.exclusive, true); const res = await a.control.removePlaintext(); assert.deepEqual(res.removed, ['chatThreads']);
  assert.equal(await lease1.release(), false, 'the old lease cannot release the new one'); assert.equal(a.app.exclusive, true); assert.equal(writerOwner(w), 'A');
});

test('A turns off while A stays open: B gets a REAL exclusive enable; A\'s old action cannot disturb B', async () => {
  const w = world(); const a = w.page('A'), b = w.page('B');
  await a.control.enable('pw'); const old = a.app.lease; await a.control.disable('pw');
  await b.control.enable('pw'); assert.deepEqual([b.app.exclusive, b.app.readOnly, writerOwner(w)], [true, false, 'B']);
  assert.equal(await a.control.disable('pw'), undefined, 'A is plain: a late disable is nothing'); assert.equal(await old.release(), false, 'A\'s old lease cannot release B');
  assert.deepEqual([b.app.exclusive, writerOwner(w)], [true, 'B']); await b.control.removePlaintext();
});

test('a read-only page never disables, cleans up or releases the owner', async () => {
  const w = world(); const a = w.page('A'), b = w.page('B'); await a.control.enable('pw'); await a.control.removePlaintext();
  const claim = await claimWriter({ locks: b.locks }); const s = await createVault({ adapter: w.adapter }).unlock('pw'); b.app.attach(s, { writer: false, lease: claim });
  await assert.rejects(() => b.control.disable('pw'), (e) => e.code === 'read-only'); await assert.rejects(() => b.control.removePlaintext(), (e) => e.code === 'read-only');
  assert.equal(await claim.release(), false); assert.equal(writerOwner(w), 'A'); assert.notEqual(await w.adapter.readHeader(), null); assert.equal(a.app.exclusive, true);
});

test('a failed or canceled disable keeps the rightful lease (wrong passphrase, differing raw, conflict)', async () => {
  const w = world(); const a = w.page('A'); await a.control.enable('pw');
  await assert.rejects(() => a.control.disable('wrong'), (e) => e.code === 'bad-passphrase'); assert.deepEqual([a.app.active, a.app.exclusive, writerOwner(w)], [true, true, 'A']);
  w.realLocal.setItem('chatThreads', JSON.stringify([{ id: 'a', title: 'EDITED ELSEWHERE', messages: [] }]));
  await assert.rejects(() => a.control.disable('pw'), (e) => e.code === 'conflict'); assert.deepEqual([a.app.active, a.app.exclusive, writerOwner(w)], [true, true, 'A']); assert.notEqual(await w.adapter.readHeader(), null);
  assert.match(w.realLocal.getItem('chatThreads'), /EDITED ELSEWHERE/, 'the differing raw copy is untouched');
});

test('a failure after the own detach re-attaches the same session with the same lease; nothing is released or rolled back', async () => {
  const w = world({ docs: [{ id: 'd', name: 'n', text: 't' }] }); const a = w.page('A', { putFails: true }); await a.control.enable('pw'); const lease = a.app.lease;
  await assert.rejects(() => a.control.disable('pw'), /injected/);
  assert.deepEqual([a.app.active, a.app.exclusive, a.app.lease === lease, writerOwner(w)], [true, true, true, 'A'], 'protected origin is not left plain, and the lock is still ours');
  assert.notEqual(await w.adapter.readHeader(), null); assert.equal(w.realLocal.getItem('chatThreads'), chats);
});

test('a replacement attached during the post-detach work is never re-attached over, cleared or released', async () => {
  const w = world({ docs: [{ id: 'd', name: 'n', text: 't' }] }); let replacement = null;
  const a = w.page('A', { beforePut: async () => { replacement = await createVault({ adapter: w.adapter }).unlock('pw'); a.app.attach(replacement, { writer: true, lease: providedLease() }); a.app.local.setItem('plc.prefs.v1', 'replacement-B'); } });
  await a.control.enable('pw'); const lease = a.app.lease;
  await assert.rejects(() => a.control.disable('pw'), (e) => e.code === 'session-changed');
  assert.equal(a.app.vaultSession, replacement, 'the replacement is still what is attached'); assert.equal(a.app.local.getItem('plc.prefs.v1'), 'replacement-B'); assert.notEqual(await w.adapter.readHeader(), null, 'the replacement\'s vault is intact');
  assert.equal(lease.owned, true, 'the stale action did not release a lease it no longer rightfully ends'); assert.equal(writerOwner(w), 'A');
});

test('repeated on/off cycles with another page watching: always exactly one owner or none', async () => {
  const w = world(); const a = w.page('A'), b = w.page('B');
  for (let i = 0; i < 5; i++) {
    await a.control.enable('pw'); assert.deepEqual([writerOwner(w), a.app.exclusive], ['A', true]); await a.control.removePlaintext();
    await assert.rejects(() => b.control.enable('pw'), (e) => e.code === 'read-only' || e.code === 'exists'); assert.equal(writerOwner(w), 'A');
    await a.control.disable('pw'); assert.equal(writerOwner(w), null);
    assert.equal(w.realLocal.getItem('chatThreads'), chats, 'raw bytes preserved in cycle ' + i);
  }
});

// ---- the enable fence at the ACTUAL adapter write boundaries (a stale enable stores nothing more) ----------------------------------------------------------------------------------
const gate = () => { let open; const promise = new Promise((r) => { open = r; }); return { promise, open }; };
/** Make the page's lifecycle change: a replacement session attaches and detaches again (the app is inactive again, but it is a different epoch). */
const bumpEpoch = async (w, p) => { const s = await createVault({ adapter: createMemoryAdapter() }).create('x', { iterations: FAST }); p.app.attach(s, { writer: true, lease: providedLease() }); p.app.detach(); };

test('enable paused BEFORE the header write: the lifecycle changes, the write is never made, the claim is given back', async () => {
  const w = world(); const a = w.page('A'); const g = gate(), reached = gate(); const realWrite = w.adapter.writeHeader.bind(w.adapter);
  w.adapter.writeHeader = async (h, o) => { reached.open(); await g.promise; return realWrite(h, o); };
  const run = a.control.enable('pw'); await reached.promise; await bumpEpoch(w, a); g.open();
  await assert.rejects(() => run, (e) => e.code === 'session-changed');
  assert.equal(await w.adapter.readHeader(), null, 'no header was stored by the stale enable'); assert.deepEqual(await w.adapter.readLog(), []); assert.equal(w.realLocal.getItem(VAULT_MARKER), null);
  assert.equal(w.realLocal.getItem('chatThreads'), chats); assert.deepEqual(w.table.heldNames(), [], 'its own claim was given back');
});

test('enable paused BEFORE a later append: the lifecycle changes, that append is not made, a replacement\'s vault is never cleared', async () => {
  const w = world(); const a = w.page('A'); const g = gate(), reached = gate(); const realAppend = w.adapter.append.bind(w.adapter); let n = 0, replacement = null;
  w.adapter.append = async (r, o) => { n++; if (n === 3) { reached.open(); await g.promise; } return realAppend(r, o); };
  const run = a.control.enable('pw'); await reached.promise;
  const before = (await w.adapter.readLog()).length; replacement = await createVault({ adapter: w.adapter }).unlock('pw'); a.app.attach(replacement, { writer: true, lease: providedLease() }); // a replacement attaches
  g.open(); await assert.rejects(() => run, (e) => e.code === 'session-changed');
  assert.equal((await w.adapter.readLog()).length, before, 'no record was added after the lifecycle changed (the records made before the change stay)'); assert.notEqual(await w.adapter.readHeader(), null, 'the stale failure did not clear the stored vault');
  assert.equal(a.app.vaultSession, replacement); assert.equal(replacement.locked, false); assert.equal(w.realLocal.getItem('chatThreads'), chats); assert.deepEqual(w.table.heldNames(), [], 'its own claim was given back');
});

test('enable whose last write is durable but whose completion is late: the lifecycle then changes: it reports session-changed, keeps what is durable, installs nothing', async () => {
  const w = world(); const a = w.page('A'); const g = gate(), reached = gate(); const realAppend = w.adapter.append.bind(w.adapter); let lastSeq = 0;
  w.adapter.append = async (r, o) => { const out = await realAppend(r, o); lastSeq = r.seq; if (r.seq >= 3) { reached.open(); await g.promise; } return out; };
  const run = a.control.enable('pw'); await reached.promise; await bumpEpoch(w, a); g.open();
  await assert.rejects(() => run, (e) => e.code === 'session-changed');
  assert.ok(lastSeq >= 3 && (await w.adapter.readLog()).length >= 3, 'the committed records are not rolled back or claimed unchanged'); assert.equal(a.app.active, false, 'nothing is attached by the stale action'); assert.deepEqual(w.table.heldNames(), []);
});

test('positive control: the same enable with no lifecycle change completes with every record, the marker and a real lease', async () => {
  const w = world(); const a = w.page('A'); await a.control.enable('pw');
  assert.notEqual(await w.adapter.readHeader(), null); assert.ok((await w.adapter.readLog()).length >= 3); assert.ok(w.realLocal.getItem(VAULT_MARKER)); assert.deepEqual([a.app.exclusive, writerOwner(w)], [true, 'A']);
});
