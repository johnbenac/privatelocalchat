// The rich character store's durable receipt consumer (T222, chat/characters/character-store.mjs). A persistent store takes an injected `runWriteScope(fn)`; every
// Save / update / copy / remove enters it BEFORE the "plc-characters" lock, reads the FRESH stored raw through `mode.readDurable`, computes the whole next raw from that,
// and is acknowledged only by a committed `mode.putKV` receipt whose observed value is exactly what was sent.
//
// The backend in the cases below is the ACTUAL accepted encrypted same-backend KV (chat/vault/vault-store.mjs withWriteMode/createWriteMode on real engine + real WebCrypto + a
// custom memory adapter whose append is held, rejected, or loses its reply AFTER the record became durable). Backend assertions read a FRESH replay of the stored log, never
// the mirror. The supported owned lease is a HARNESS contract, not the real global browser authority; host wiring and the shared mode transition are later work and are
// NOT claimed here. Cases labelled "contract only" use the plain provided scope and claim no physical stale-cache or mode coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createCharacterStore, createTemporaryCharacterStore, createMemoryStorage, createMemoryLocks, CHARACTER_LOCK_NAME } from '../chat/characters/character-store.mjs';
import { realKvBackend, plainWriteScope, CHARACTER_KEY } from './helpers/character-write-scope.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const KEY = CHARACTER_KEY;
const settled = (p) => { let done = false; p.then(() => { done = true; }, () => { done = true; }); return new Promise((r) => setImmediate(() => r(done))); };
const turns = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

/** A persistent store over the real KV backend. The storage given to it is a plain mirror that counts any write: the store must never use it as an acknowledgement. */
async function rig({ withScope = true, locks = createMemoryLocks(), scope, extra = {} } = {}) {
  const b = await realKvBackend();
  // The page's actual vault-aware storage (app.local over the attached encrypted session): an old-path setItem here schedules a REAL engine append. The wrapper only counts.
  const mirrorStats = { sets: 0, removes: 0 };
  // Display reads: the page's mirror first (only an old-path write ever sets it), else the live session state (the supplied display contract; the final host publication of a
  // confirmed value is the shared scope's later work, not this component's). The fixed consumer never writes here and never reads it to decide a write.
  const storage = { getItem: (k) => b.app.local.getItem(k) ?? b.mirrorStorage.getItem(k), setItem: (k, v) => { mirrorStats.sets += 1; b.app.local.setItem(k, v); }, removeItem: (k) => { mirrorStats.removes += 1; b.app.local.removeItem(k); } };
  let t = 1000;
  const store = createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, now: () => ++t, ...(withScope ? { runWriteScope: scope || b.runWriteScope } : {}), ...extra });
  const parsed = async () => { const raw = await b.replay(); return raw === null ? null : JSON.parse(raw); };
  return { b, store, storage, mirrorStats, parsed, locks };
}
const prep = async (store, input) => { const p = await store.prepare(input); assert.equal(p.ok, true, JSON.stringify(p)); return p.preparation; };
/** Holds the next append at the real adapter, and resolves once it has actually been reached. */
function holdNextAppend(b) { b.control.mode = 'hold'; return new Promise((resolve) => { b.control.reached = resolve; }); }
const release = (b) => { b.control.mode = 'pass'; b.control.release?.(); b.control.release = null; };
/** Races the operation against the real append barrier: the barrier must be reached with the operation still unacknowledged. */
async function untilBarrier(operation, reached, label) {
  const first = await Promise.race([reached.then(() => ({ barrier: true })), operation.then((value) => ({ early: value }))]);
  if (first.early !== undefined) {
    // record whether the real append was physically reached while the operation had already answered (the old path schedules it behind the acknowledgement)
    const physical = await Promise.race([reached.then(() => true), new Promise((r) => setTimeout(() => r(false), 1500))]);
    assert.fail(label + ': acknowledged ' + JSON.stringify(first.early) + ' while the real append was still pending (append physically reached afterwards: ' + physical + ')');
  }
  assert.equal(first.barrier, true, label);
}

test('CH no write scope refuses persistent mutation', async () => {
  const r = await rig({ withScope: false });
  const p = await prep(r.store, { text: bundle('minimal') });
  const c = await r.store.commit(p);
  assert.equal(c.ok, false, 'persistent save without the capability must refuse, got ' + JSON.stringify(c));
  assert.equal(c.code, 'no-durable-scope');
  assert.equal(r.mirrorStats.sets, 0, 'no fallback to storage.setItem');
  assert.equal(r.storage.getItem(KEY), null);
  assert.equal(await r.b.replay(), null, 'the backend was never written');
  assert.equal(r.b.control.appends, 0);
  assert.equal(r.store.ready().ok, false, 'the screen can say save is unavailable');
  assert.equal(r.store.ready().code, 'no-durable-scope');
  assert.equal((await r.store.remove({ individualId: 'individual:x', recordVersion: 1 })).code, 'no-durable-scope');
  // an arbitrary persistent storage that merely CLAIMS memoryOnly does not skip the capability
  const claimed = createMemoryStorage();
  const sneaky = createCharacterStore({ storage: claimed, key: KEY, locks: createMemoryLocks(), crypto: webcrypto });
  const sp = await prep(sneaky, { text: bundle('minimal') });
  assert.equal((await sneaky.commit(sp)).code, 'no-durable-scope');
  assert.equal(claimed.getItem(KEY), null);
  // reads stay available without the capability
  assert.equal(r.store.list().ok, true);
});

test('CH durable pending append never acknowledges early', async () => {
  const r = await rig();
  // fresh save of Neri held at the real append
  const pn = await prep(r.store, { text: bundle('neri') });
  let reached = holdNextAppend(r.b);
  const saving = r.store.commit(pn);
  await untilBarrier(saving, reached, 'fresh');
  assert.equal(await settled(saving), false, 'still pending while the append is held');
  assert.equal(await r.b.replay(), null, 'fresh replay: nothing durable yet');
  release(r.b);
  const saved = await saving;
  assert.equal(saved.ok, true, JSON.stringify(saved)); assert.equal(saved.status, 'admitted');
  let state = await r.parsed();
  assert.equal(state.records.length, 1); assert.equal(state.records[0].individualId, saved.individualId); assert.equal(state.records[0].admissions[0], pn.admissionId);
  assert.equal(r.mirrorStats.sets, 0);
  // update, copy and remove held the same way
  const target = { individualId: saved.individualId, recordVersion: 1 };
  const pu = await prep(r.store, { text: bundle('bex'), purpose: 'update', target });
  reached = holdNextAppend(r.b);
  let op = r.store.commit(pu); await untilBarrier(op, reached, 'update');
  assert.equal((await r.parsed()).records[0].recordVersion, 1, 'update not durable yet');
  release(r.b); assert.equal((await op).status, 'updated');
  const pc = await prep(r.store, { purpose: 'copy', source: { individualId: saved.individualId, recordVersion: 2 } });
  reached = holdNextAppend(r.b);
  op = r.store.commit(pc); await untilBarrier(op, reached, 'copy');
  assert.equal((await r.parsed()).records.length, 1, 'copy not durable yet');
  release(r.b); const copied = await op; assert.equal(copied.status, 'copied');
  reached = holdNextAppend(r.b);
  op = r.store.remove({ individualId: copied.individualId, recordVersion: 1 }); await untilBarrier(op, reached, 'remove');
  assert.equal((await r.parsed()).records.length, 2, 'removal not durable yet');
  release(r.b); assert.equal((await op).status, 'removed');
  state = await r.parsed();
  assert.deepEqual(state.records.map((x) => x.individualId), [saved.individualId]); assert.equal(state.records[0].recordVersion, 2);
  assert.equal(r.mirrorStats.sets, 0, 'the mirror was never the acknowledgement');
});

test('CH durable KV rejection never acknowledges admission', async () => {
  const r = await rig();
  const p = await prep(r.store, { text: bundle('minimal') });
  r.b.control.mode = 'reject';
  const c = await r.store.commit(p);
  assert.equal(c.ok, false, 'a rejected append must not acknowledge: ' + JSON.stringify(c));
  assert.equal(r.b.control.appends, 1, 'the real append was reached and rejected');
  assert.notEqual(c.status, 'admitted');
  assert.equal(c.code, 'unconfirmed'); assert.doesNotMatch(c.message, /Nothing was changed/);
  assert.equal(await r.b.replay(), null);
  assert.equal(r.mirrorStats.sets, 0);
  // the retry of the SAME preparation, once the backend works, saves exactly once under the same admission identity
  r.b.control.mode = 'pass';
  const again = await r.store.commit(p);
  assert.equal(again.ok, true, JSON.stringify(again)); assert.equal(again.status, 'admitted');
  const state = await r.parsed();
  assert.equal(state.records.length, 1); assert.deepEqual(state.records[0].admissions, [p.admissionId]);
  assert.equal(state.revision, 1);
});

test('CH lost reply retries the same admission identity', async () => {
  const r = await rig();
  const p = await prep(r.store, { text: bundle('minimal') });
  r.b.control.mode = 'drop-reply';
  const first = await r.store.commit(p);
  assert.equal(first.ok, false, 'a lost reply is non-success: ' + JSON.stringify(first));
  assert.equal(r.b.control.afterAppend, 1, 'the record really became durable before the reply was lost');
  assert.equal(first.code, 'unconfirmed');
  assert.doesNotMatch(first.message, /Nothing was changed/);
  const durable = await r.parsed();
  assert.equal(durable.records.length, 1, 'fresh replay: it is there');
  r.b.control.mode = 'pass';
  const appends = r.b.control.appends;
  // cold session reload over the same stored log, then the same preparation again
  await r.b.reload();
  const retry = await r.store.commit(p);
  assert.equal(retry.ok, true, JSON.stringify(retry)); assert.equal(retry.status, 'already-admitted', 'reconciled against the durable admissions, not re-applied');
  assert.equal(retry.individualId, durable.records[0].individualId, 'no new identity');
  assert.equal(r.b.control.appends, appends, 'nothing was appended again');
  const after = await r.parsed();
  assert.deepEqual(after, durable, 'byte-for-byte the same store');
  assert.deepEqual(after.records[0].admissions, [p.admissionId]);
  assert.equal(after.revision, 1);
  assert.equal(await r.b.coldRaw(), await r.b.replay(), 'a cold session sees the same raw');
});

test('CH lost reply identity holds for update, copy and remove, retried on the same operation', async () => {
  const r = await rig();
  const saved = await r.store.commit(await prep(r.store, { text: bundle('neri') }));
  const id = saved.individualId;
  // update: reply lost, retry reconciles to already-applied, version bumped once
  const pu = await prep(r.store, { text: bundle('bex'), purpose: 'update', target: { individualId: id, recordVersion: 1 } });
  r.b.control.dropNext = 1;
  const u1 = await r.store.commit(pu); assert.equal(u1.ok, false); assert.equal(u1.code, 'unconfirmed');
  await r.b.reload(); // the engine session that lost an append reply must be re-opened (its next append would collide); the retry runs on the cold session
  assert.equal((await r.parsed()).records[0].recordVersion, 2);
  const u2 = await r.store.commit(pu); assert.equal(u2.ok, true); assert.equal(u2.status, 'already-applied'); assert.equal(u2.recordVersion, 2);
  assert.equal((await r.parsed()).records[0].recordVersion, 2, 'not bumped twice');
  // copy
  const pc = await prep(r.store, { purpose: 'copy', source: { individualId: id, recordVersion: 2 } });
  r.b.control.dropNext = 1;
  const c1 = await r.store.commit(pc); assert.equal(c1.ok, false);
  await r.b.reload();
  assert.equal((await r.parsed()).records.length, 2);
  const c2 = await r.store.commit(pc); assert.equal(c2.ok, true); assert.equal(c2.status, 'already-admitted');
  const records = (await r.parsed()).records; assert.equal(records.length, 2); assert.equal(new Set(records.map((x) => x.individualId)).size, 2);
  const copyId = records.find((x) => x.individualId !== id).individualId; assert.equal(c2.individualId, copyId);
  // remove: reply lost, the retry (same target and version) finishes as removed, never as a stale or a lie
  r.b.control.dropNext = 1;
  const m1 = await r.store.remove({ individualId: copyId, recordVersion: 1 }); assert.equal(m1.ok, false); assert.equal(m1.code, 'unconfirmed');
  await r.b.reload();
  assert.equal((await r.parsed()).records.length, 1, 'the removal did become durable');
  const m2 = await r.store.remove({ individualId: copyId, recordVersion: 1 }); assert.equal(m2.ok, true); assert.equal(m2.status, 'removed');
  assert.deepEqual((await r.parsed()).records.map((x) => x.individualId), [id]);
});

test('CH unwritten failure retries the same preparation once and a stale target stays refused', async () => {
  const r = await rig();
  const saved = await r.store.commit(await prep(r.store, { text: bundle('minimal') }));
  const target = { individualId: saved.individualId, recordVersion: 1 };
  const pu = await prep(r.store, { text: bundle('bex'), purpose: 'update', target });
  r.b.control.rejectNext = 2;
  assert.equal((await r.store.commit(pu)).ok, false);
  assert.equal((await r.store.commit(pu)).ok, false);
  assert.equal((await r.parsed()).records[0].recordVersion, 1);
  const done = await r.store.commit(pu); assert.equal(done.status, 'updated'); assert.equal(done.recordVersion, 2);
  const stale = await prep(r.store, { text: bundle('neri'), purpose: 'update', target });
  const refused = await r.store.commit(stale);
  assert.equal(refused.code, 'stale'); assert.equal((await r.parsed()).records[0].recordVersion, 2, 'no lost update');
});

test('CH computes the next bytes from the fresh durable raw, never from a stale mirror, and keeps unknown fields', async () => {
  const r = await rig();
  // (the one named case with an explicit stale-read override: this store's display reads are dead stale, so only the fresh durable read can be right)
  const staleStorage = { getItem: () => null, setItem() { throw new Error('the store must not write through the mirror'); }, removeItem() {} };
  const stale = createCharacterStore({ storage: staleStorage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: r.b.runWriteScope });
  r.store = stale;
  const first = await r.store.commit(await prep(r.store, { text: bundle('minimal') }));
  // another writer (another tab through the same backend) adds a record and a field this version does not know; the mirror this store reads stays empty
  const state = await r.parsed();
  state.futureTopLevel = { keep: ['me'] }; state.records[0].futureRecordField = 7;
  const other = JSON.parse(JSON.stringify(state.records[0])); other.individualId = 'individual:other-writer'; other.admissions = ['admission:other']; other.origin = { ...other.origin, admissionId: 'admission:other' }; state.records.push(other); state.revision += 1;
  const raw0 = await r.b.replay();
  const injected = await r.b.session.setKv('l/' + KEY, JSON.stringify(state));
  assert.ok(injected >= 1);
  assert.equal(staleStorage.getItem(KEY), null, 'the display mirror is stale');
  const p = await prep(r.store, { text: bundle('bex') });
  const c = await r.store.commit(p); assert.equal(c.ok, true, JSON.stringify(c));
  const after = await r.parsed();
  assert.equal(after.records.length, 3, 'the other writer\'s record survives');
  assert.deepEqual(after.futureTopLevel, { keep: ['me'] }); assert.equal(after.records[0].futureRecordField, 7);
  assert.equal(after.revision, state.revision + 1);
  assert.deepEqual(after.records.map((x) => x.individualId).slice(0, 2), [first.individualId, 'individual:other-writer']);
  void raw0;
});

test('CH a competing write between the fresh read and the put is not lost; the retry reconciles', async () => {
  const r = await rig();
  const p = await prep(r.store, { text: bundle('minimal') });
  const competitor = await prep(r.store, { text: bundle('bex') });
  // wrap the scope so that a competitor lands durably AFTER this store read but BEFORE its put
  let raced = false;
  const racing = (fn) => r.b.runWriteScope(async (mode) => fn({ readDurable: (k) => mode.readDurable(k), putKV: async (...a) => {
    if (!raced) { raced = true; const side = createCharacterStore({ storage: createMemoryStorage(), key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: r.b.runWriteScope }); void side; await r.b.session.setKv('l/' + KEY, JSON.stringify({ format: 1, revision: 0, records: [], competitor: true })); }
    return mode.putKV(...a);
  } }));
  const store = createCharacterStore({ storage: r.storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: racing });
  const sp = await prep(store, { text: bundle('minimal') });
  const first = await store.commit(sp);
  assert.equal(first.ok, false, 'a mismatching target is never acknowledged'); assert.equal(first.code, 'changed');
  assert.equal((await r.parsed()).competitor, true, 'the competitor value was not overwritten');
  const retry = await store.commit(sp);
  assert.equal(retry.ok, true, JSON.stringify(retry));
  const after = await r.parsed(); assert.equal(after.competitor, true); assert.equal(after.records.length, 1);
  void p; void competitor;
});

test('CH refusals preserve the backend: read failure, held, blocked, read-only, unsupported lease, guard, caller fence', async () => {
  const r = await rig();
  const first = await r.store.commit(await prep(r.store, { text: bundle('minimal') }));
  const before = await r.b.replay(); const appends = r.b.control.appends;
  const p = await prep(r.store, { text: bundle('bex') });
  const refused = async (label, expectCodes, undo) => {
    const c = await r.store.commit(p);
    undo?.();
    assert.equal(c.ok, false, label + ': ' + JSON.stringify(c)); assert.ok(expectCodes.includes(c.code), label + ' code ' + c.code);
    assert.equal(await r.b.replay(), before, label + ': backend untouched'); assert.equal(r.b.control.appends, appends, label + ': no append'); return c;
  };
  // fresh read fails
  const readHeader = r.b.adapter.readHeader; r.b.adapter.readHeader = async () => { throw new Error('read failed'); };
  await refused('read failure', ['unreadable'], () => { r.b.adapter.readHeader = readHeader; });
  // held / blocked
  // (a refusal thrown by the write mode once the put began is NOT claimed as "nothing changed": it is unconfirmed, and the fresh replay proves the backend untouched)
  r.b.app.setHeld([{ key: KEY, reason: 'test' }]); const held = await refused('held', ['unconfirmed'], () => r.b.app.setHeld([])); assert.doesNotMatch(held.message, /Nothing was changed/);
  r.b.app.setBlocked([KEY]); await refused('blocked', ['unconfirmed'], () => r.b.app.setBlocked([]));
  // read-only tab (the engine's own read-only state)
  r.b.app.attach(r.b.session, { writer: false, adapter: r.b.adapter });
  await refused('read-only', ['unconfirmed'], () => r.b.app.attach(r.b.session, { writer: true, lease: r.b.lease, adapter: r.b.adapter }));
  // unsupported lease
  r.b.lease.supported = false; await refused('unsupported lease', ['unconfirmed'], () => { r.b.lease.supported = true; });
  // guard (authority) lost
  r.b.setGuard(false); await refused('guard', ['write-refused'], () => r.b.setGuard(true));
  // caller fence moved
  const fenceMoved = await r.store.commit(p, { fence: () => true });
  assert.equal(fenceMoved.code, 'scope-changed'); assert.equal(await r.b.replay(), before);
  // still fine afterwards, and the first record is intact
  const ok = await r.store.commit(p); assert.equal(ok.ok, true);
  assert.equal((await r.parsed()).records[0].individualId, first.individualId);
});

test('CH a caller fence that moves after the fresh read stops the write before any append', async () => {
  const r = await rig();
  const p = await prep(r.store, { text: bundle('minimal') });
  let moved = false;
  const scope = (fn) => r.b.runWriteScope((mode) => fn({ ...mode, readDurable: async (k) => { const v = await mode.readDurable(k); moved = true; return v; }, putKV: mode.putKV }));
  const store = createCharacterStore({ storage: r.storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: scope });
  const sp = await prep(store, { text: bundle('minimal') });
  const c = await store.commit(sp, { fence: () => moved });
  assert.equal(c.code, 'scope-changed'); assert.equal(r.b.control.appends, 0); assert.equal(await r.b.replay(), null);
  void p;
});

test('CH caller loss during REAL crypto stops the append before the backend is changed', async () => {
  const r = await rig();
  const p = await prep(r.store, { text: bundle('neri') });
  let moved = false;
  const reached = new Promise((resolve) => { r.b.control.cryptoReached = resolve; });
  r.b.control.holdCrypto = true;
  const task = r.store.commit(p, { fence: () => moved });
  await reached; // the engine is inside the real subtle.encrypt of the append
  moved = true;
  r.b.control.cryptoRelease();
  const out = await task;
  assert.equal(out.ok, false, JSON.stringify(out));
  assert.equal(await r.b.replay(), null, 'nothing durable: the composed caller guard refused at the append');
  assert.equal(r.b.control.appends, 0, 'no physical append reached the adapter');
  assert.equal(r.mirrorStats.sets, 0);
  // the same preparation is still good for the caller once its session is back
  moved = false;
  const retry = await r.store.commit(p, { fence: () => moved }); assert.equal(retry.ok, true, JSON.stringify(retry)); assert.equal((await r.parsed()).records.length, 1);
});

test('CH a caller fence that moves after a committed receipt is not published as success; the retry reconciles', async () => {
  const r = await rig();
  let moved = false;
  const scope = (fn) => r.b.runWriteScope((mode) => fn({ readDurable: mode.readDurable, putKV: async (...a) => { const receipt = await mode.putKV(...a); moved = true; return receipt; } }));
  const store = createCharacterStore({ storage: r.storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: scope });
  const sp = await prep(store, { text: bundle('minimal') });
  const out = await store.commit(sp, { fence: () => moved });
  assert.equal(out.ok, false, 'the caller session moved before the receipt returned: ' + JSON.stringify(out)); assert.equal(out.code, 'unconfirmed');
  assert.doesNotMatch(out.message, /Nothing was changed/);
  const durable = await r.parsed(); assert.equal(durable.records.length, 1, 'the write itself is durable and kept');
  moved = false;
  const retry = await store.commit(sp, { fence: () => moved });
  assert.equal(retry.ok, true); assert.equal(retry.status, 'already-admitted'); assert.equal(retry.individualId, durable.records[0].individualId);
  assert.equal(r.b.control.appends, 1); assert.equal((await r.parsed()).revision, 1);
  // a scope that finishes after the fence moved never publishes a no-write result either
  let late = false;
  const lateScope = (fn) => r.b.runWriteScope(async (mode) => { const v = await fn(mode); late = true; return v; });
  const again = createCharacterStore({ storage: r.storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: lateScope });
  const same = await store.commit(sp);
  assert.equal(same.status, 'already-admitted'); void again;
  const done = await again.remove({ individualId: 'individual:nobody', recordVersion: 1 }, { fence: () => late });
  assert.equal(done.ok, false); assert.equal(done.code, 'scope-changed');
});

test('CH enters the write scope before the characters lock and leaves after releasing it', async () => {
  const log = []; const inner = createMemoryLocks();
  const locks = { request: (name, o, cb) => inner.request(name, o, async () => { log.push('lock:' + name); try { return await cb(); } finally { log.push('release'); } }) };
  const r = await rig({ locks });
  const scope = (fn) => r.b.runWriteScope((mode) => { log.push('scope:enter'); return fn(mode).finally(() => log.push('scope:exit')); });
  const store = createCharacterStore({ storage: r.storage, key: KEY, locks, crypto: webcrypto, runWriteScope: scope });
  const c = await store.commit(await prep(store, { text: bundle('minimal') }));
  assert.equal(c.ok, true);
  assert.deepEqual(log, ['scope:enter', 'lock:' + CHARACTER_LOCK_NAME, 'release', 'scope:exit']);
});

test('CH temporary chat memory stays per-chat memory only and never touches the capability or the backend', async () => {
  const r = await rig();
  let scopeCalls = 0; let token = 'a';
  const temp = createTemporaryCharacterStore({ scope: { current: () => token }, crypto: webcrypto });
  const c = await temp.commit(await prep(temp, { text: bundle('neri') }));
  assert.equal(c.ok, true); assert.equal(temp.list().records.length, 1);
  assert.equal(r.b.control.appends, 0); assert.equal(scopeCalls, 0);
  token = 'b'; assert.equal(temp.read().code, 'scope-changed'); assert.equal(await r.b.replay(), null);
  assert.equal(temp.temporary, true);
  // handing a scope to the temporary constructor is not a path to the durable backend
  const spy = createTemporaryCharacterStore({ scope: { current: () => 'x' }, crypto: webcrypto, runWriteScope: () => { scopeCalls += 1; throw new Error('must not be called'); } });
  assert.equal((await spy.commit(await prep(spy, { text: bundle('minimal') }))).ok, true); assert.equal(scopeCalls, 0);
});

test('CH positive control: real producer Neri and Pip persist, reload cold, and reopen with their exact resources', async () => {
  const r = await rig();
  const neri = await r.store.commit(await prep(r.store, { text: bundle('neri') }));
  const pip = await r.store.commit(await prep(r.store, { text: bundle('minimal') }));
  assert.equal(neri.ok && pip.ok, true);
  await r.b.reload();
  const cold = JSON.parse(await r.b.coldRaw());
  assert.deepEqual(cold.records.map((x) => x.preview.name), ['Neri', 'Pip']);
  const reader = createCharacterStore({ storage: { getItem: () => JSON.stringify(cold), setItem() { throw new Error('read only'); } }, key: KEY, locks: null, crypto: webcrypto });
  const opened = await reader.open(neri.individualId);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  for (const x of opened.candidate.resources) assert.equal(opened.candidate.resourceBytes(x.sha256).length, x.size);
});

test('CH harness control: real Neri and Pip stored through the real KV append are visible to fresh replay, a cold session and a reopening reader', async () => {
  // Independent of the store under test: the raw is produced by an ordinary store over a plain memory storage, then put through the REAL backend append, proving the
  // held/rejected/lost-reply harness and the replay/cold readers observe a genuine append (so a missing record elsewhere is the store's doing, not the harness's).
  const mem = createMemoryStorage();
  const maker = createCharacterStore({ storage: mem, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: plainWriteScope(mem) });
  const neri = await maker.commit(await prep(maker, { text: bundle('neri') })); const pip = await maker.commit(await prep(maker, { text: bundle('minimal') }));
  assert.equal(neri.ok && pip.ok, true);
  const b = await realKvBackend(); const raw = mem.getItem(KEY);
  assert.equal(await b.replay(), null);
  await b.session.setKv('l/' + KEY, raw);
  assert.equal(b.control.appends >= 1, true, 'the real adapter append was reached');
  assert.equal(await b.replay(), raw); assert.equal(await b.coldRaw(), raw);
  const reader = createCharacterStore({ storage: { getItem: () => raw, setItem() { throw new Error('read only'); } }, key: KEY, locks: null, crypto: webcrypto });
  assert.equal((await reader.open(neri.individualId)).ok, true);
});

test('CH contract only: the plain provided scope drives the same store without a backend claim', async () => {
  const storage = createMemoryStorage(); const log = [];
  const store = createCharacterStore({ storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: plainWriteScope(storage, { log }) });
  const c = await store.commit(await prep(store, { text: bundle('minimal') }));
  assert.equal(c.ok, true); assert.deepEqual(log, ['scope:enter', 'scope:exit']); assert.equal(JSON.parse(storage.getItem(KEY)).records.length, 1);
});

// ---- concurrency: parallel actors over ONE real encrypted writer / KV backend ----
// Invariants (stated before the run): every acknowledged admission is present exactly once with its own admission id; local individual ids are unique; the stored revision equals
// the number of durable writes; nothing acknowledged is lost; an operation that was not acknowledged is retried with the SAME preparation until it is, and then appears once; nothing
// is acknowledged while its append is still held. Injected failures: rejected appends and appends whose reply is lost.
const REPEATS = Number(process.env.PLC_CONC_REPEATS || 20) || 20;
for (const actors of [4, 8, 16]) {
  test(`CH concurrency: ${actors} parallel actors x1 save over one real KV backend, repeated ${REPEATS} times, with injected failures`, { timeout: 280000 }, async () => {
    for (let round = 0; round < REPEATS; round++) {
      const r = await rig({ locks: createMemoryLocks() });
      const stores = Array.from({ length: actors }, () => createCharacterStore({ storage: r.storage, key: KEY, locks: r.locks, crypto: webcrypto, runWriteScope: r.b.runWriteScope })); // DEFAULT waitMs: a pre-put busy is retried with the same preparation, never waited out longer
      const preps = await Promise.all(stores.flatMap((s) => [0].map(async () => ({ store: s, preparation: await prep(s, { text: bundle('minimal') }) }))));
      r.b.control.rejectNext = 1 + (round % 2); r.b.control.dropNext = 1 + (round % 3);
      const acked = [];
      let unconfirmed = 0; let handled = 0; let recovering = Promise.resolve();
      // A session that lost an append REPLY is re-opened (the realistic recovery: its next append would collide); actors in flight then fail closed and retry the same preparation.
      const recover = () => { recovering = recovering.then(async () => { if (r.b.control.afterAppend > handled) { handled = r.b.control.afterAppend; await r.b.reload(); } }); return recovering; };
      await Promise.all(preps.map(async ({ store, preparation }) => {
        for (let attempt = 0; attempt < 60; attempt++) {
          await recover();
          const out = await store.commit(preparation);
          if (out.ok) { acked.push({ out, admissionId: preparation.admissionId }); return; }
          assert.ok(['unconfirmed', 'changed', 'write-refused', 'unreadable', 'busy'].includes(out.code), 'only a failure that left the preparation retryable is expected: ' + JSON.stringify(out)); unconfirmed += 1;
        }
        assert.fail('never acknowledged');
      }));
      assert.ok(unconfirmed >= 1, 'the injected failures were really exercised');
      const state = await r.parsed();
      const total = actors;
      assert.equal(acked.length, total); assert.equal(state.records.length, total, 'no loss, no duplicate');
      assert.equal(new Set(state.records.map((x) => x.individualId)).size, total, 'unique local ids');
      for (const a of acked) { const rec = state.records.find((x) => x.individualId === a.out.individualId); assert.ok(rec, 'acknowledged record present'); assert.deepEqual(rec.admissions, [a.admissionId]); assert.equal(rec.recordVersion, 1); }
      assert.equal(new Set(acked.map((a) => a.out.individualId)).size, total);
      assert.equal(state.revision, total, 'one revision per admission');
      assert.equal(await r.b.coldRaw(), await r.b.replay());
      assert.equal(r.mirrorStats.sets, 0);
    }
  });
}
