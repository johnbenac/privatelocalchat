// Regression tests for the reviewed store defects: a temporary store lives only as long as its own session, stored state and source are bounded
// BEFORE they are parsed or decoded, and an exhausted revision counter is refused before any write. They drive the real store methods on real producer bundles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createCharacterStore, createTemporaryCharacterStore, createMemoryStorage, createMemoryLocks, CHARACTER_STORE_LIMITS } from '../chat/characters/character-store.mjs';
import { reopenCharacterSource, bundleTextFromSource, checkSourceBounds } from '../chat/characters/character-package.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const KEY = 'plc.characters.v1';
const persistent = (extra = {}) => {
  const storage = createMemoryStorage();
  const store = createCharacterStore({ storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, ...extra });
  return { storage, store };
};
const admit = async (store, name = 'minimal') => {
  const p = await store.prepare({ text: bundle(name) }); assert.equal(p.ok, true, JSON.stringify(p));
  const c = await store.commit(p.preparation); assert.equal(c.ok, true, JSON.stringify(c));
  return c;
};

// ---- 1. a temporary store belongs to its own session ----
test('temporary store: after the session is replaced every read and every new operation refuses and the memory is dropped', async () => {
  let token = 'tempA'; const scope = { current: () => token };
  const a = createTemporaryCharacterStore({ scope, crypto: webcrypto });
  const admitted = await admit(a, 'neri');
  assert.equal(a.list().records.length, 1);
  const kept = await a.prepare({ text: bundle('bex') }); // pending across the replacement
  token = 'tempB';
  for (const [name, result] of [['read', a.read()], ['ready', a.ready()], ['list', a.list()], ['get', a.get(admitted.individualId)]]) assert.equal(result.code, 'scope-changed', name);
  assert.equal((await a.open(admitted.individualId)).code, 'scope-changed');
  assert.equal((await a.prepare({ text: bundle('minimal') })).code, 'scope-changed');
  assert.equal((await a.prepare({ purpose: 'copy', source: { individualId: admitted.individualId, recordVersion: 1 } })).code, 'scope-changed');
  assert.equal((await a.prepare({ purpose: 'update', text: bundle('bex'), target: { individualId: admitted.individualId, recordVersion: 1 } })).code, 'scope-changed');
  assert.equal((await a.commit(kept.preparation)).code, 'scope-changed');
  assert.equal((await a.remove({ individualId: admitted.individualId, recordVersion: 1 })).code, 'scope-changed');
  // the old memory is gone: nothing is left to be read even if the scope came back
  token = 'tempA';
  const back = a.list();
  assert.equal(back.code, 'scope-changed');
});

test('temporary store: a different session gets a different, empty store; nothing is carried over', async () => {
  let token = 'tempA'; const scope = { current: () => token };
  const a = createTemporaryCharacterStore({ scope, crypto: webcrypto });
  const first = await admit(a, 'minimal');
  token = 'tempB';
  const b = createTemporaryCharacterStore({ scope, crypto: webcrypto });
  assert.deepEqual(b.list().records, []);
  const copyFromOld = await b.prepare({ purpose: 'copy', source: { individualId: first.individualId, recordVersion: 1 } });
  assert.equal(copyFromOld.ok, false); assert.equal(copyFromOld.code, 'gone');
  await admit(b, 'bex');
  assert.equal(b.list().records.length, 1);
  assert.equal(a.list().code, 'scope-changed');
});

test('temporary store: the session ending while a read-for-copy is open stops the copy', async () => {
  let token = 'tempA'; const scope = { current: () => token };
  const a = createTemporaryCharacterStore({ scope, crypto: webcrypto });
  const first = await admit(a, 'neri');
  const pending = a.prepare({ purpose: 'copy', source: { individualId: first.individualId, recordVersion: 1 } });
  token = 'tempB';
  assert.equal((await pending).code, 'scope-changed');
  assert.equal(a.list().code, 'scope-changed');
});

test('a locked app refuses new work, and a preparation made before the lock cannot be committed after it', async () => {
  let locked = false, epoch = 1;
  const { store, storage } = persistent({ isLocked: () => locked, scope: { current: () => epoch } });
  const pending = await store.prepare({ text: bundle('neri') });
  locked = true; epoch = 2; // the vault locked: the session changes
  const afterLock = await store.commit(pending.preparation);
  assert.equal(afterLock.ok, false); assert.ok(['locked', 'scope-changed'].includes(afterLock.code), afterLock.code);
  assert.equal(storage.getItem(KEY), null);
  assert.equal((await store.prepare({ text: bundle('neri') })).code, 'locked');
  locked = false; epoch = 3; // unlock does not revive the old work
  assert.equal((await store.commit(pending.preparation)).code, 'scope-changed');
  assert.equal(storage.getItem(KEY), null);
});

test('the lock is rechecked inside the shared write lock, after the work was queued', async () => {
  let locked = false;
  const { store, storage } = persistent({ isLocked: () => locked });
  const p = await store.prepare({ text: bundle('neri') });
  let release; const gate = new Promise((r) => { release = r; });
  const holder = store.constructor === Object ? null : null; void holder;
  // take the same lock first so the commit queues behind it
  const locks = createMemoryLocks();
  const s2 = createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, isLocked: () => locked });
  const p2 = await s2.prepare({ text: bundle('neri') });
  const hold = locks.request('plc-characters', {}, () => gate);
  const queued = s2.commit(p2.preparation);
  locked = true; release(); await hold;
  assert.equal((await queued).code, 'locked');
  assert.equal(storage.getItem(KEY), null);
  void p;
});

// ---- 2. bounds before parsing and decoding ----
test('stored state over the declared size is never parsed', async () => {
  const { store, storage } = persistent();
  const big = JSON.stringify({ format: 1, revision: 0, records: [], pad: 'x'.repeat(CHARACTER_STORE_LIMITS.storeChars + 10) });
  storage.setItem(KEY, big);
  const parse = JSON.parse; let parsedBig = 0;
  JSON.parse = (t, r) => { if (typeof t === 'string' && t.length > CHARACTER_STORE_LIMITS.storeChars) parsedBig++; return parse(t, r); };
  let read, listed, prepared;
  try { read = store.read(); listed = store.list(); prepared = await store.prepare({ text: bundle('minimal') }); await store.remove({ individualId: 'individual:x', recordVersion: 1 }); } finally { JSON.parse = parse; }
  assert.equal(parsedBig, 0, 'oversized stored text must not reach JSON.parse');
  assert.equal(read.code, 'malformed'); assert.equal(listed.code, 'malformed'); assert.equal(prepared.ok, true);
  assert.equal(storage.getItem(KEY), big, 'left exactly as it was');
  const c = await store.commit(prepared.preparation); assert.equal(c.code, 'malformed'); assert.equal(storage.getItem(KEY), big);
});

test('a stored list with more records than allowed is refused before any record is examined', async () => {
  const { store, storage } = persistent();
  storage.setItem(KEY, JSON.stringify({ format: 1, revision: 0, records: [] }));
  let touched = 0;
  const records = new Proxy(Array.from({ length: CHARACTER_STORE_LIMITS.records + 1 }, () => ({})), { get(t, k, r) { if (/^\d+$/.test(String(k))) touched++; return Reflect.get(t, k, r); } });
  const parse = JSON.parse;
  JSON.parse = (t, rv) => { const v = parse(t, rv); if (v && Array.isArray(v.records)) v.records = records; return v; };
  try { assert.equal(store.read().code, 'malformed'); } finally { JSON.parse = parse; }
  assert.equal(touched, 0);
  storage.setItem(KEY, JSON.stringify({ format: 1, revision: 0, records: Array.from({ length: 5000 }, () => ({})) }));
  assert.equal(store.read().code, 'malformed');
});

test('a newer stored format is still refused as newer, not as oversized or malformed', async () => {
  const { store, storage } = persistent();
  const text = JSON.stringify({ format: 2, revision: 3, records: [{ future: true }] });
  storage.setItem(KEY, text);
  assert.equal(store.read().code, 'newer'); assert.equal((await store.remove({ individualId: 'individual:x', recordVersion: 1 })).code, 'newer');
  assert.equal(storage.getItem(KEY), text);
});

test('reopening a source checks counts, sizes and encodings before decoding any bytes', async () => {
  const { store, storage } = persistent();
  const done = await admit(store, 'neri');
  const source = JSON.parse(storage.getItem(KEY)).records[0].source;
  assert.equal(checkSourceBounds(source), null);
  let atobCalls = 0; const atob = globalThis.atob;
  globalThis.atob = (t) => { atobCalls++; return atob(t); };
  try {
    const huge = JSON.parse(JSON.stringify(source)); huge.bytes[0].data = 'QUJD'.repeat(2_000_000);
    const r1 = await reopenCharacterSource(huge, { crypto: webcrypto });
    assert.equal(r1.ok, false); assert.equal(atobCalls, 0, 'oversized supplied bytes are not decoded');
    const lying = JSON.parse(JSON.stringify(source)); lying.bytes[0].size = 1;
    assert.equal((await reopenCharacterSource(lying, { crypto: webcrypto })).ok, false); assert.equal(atobCalls, 0);
    const extra = JSON.parse(JSON.stringify(source)); extra.bytes.push({ hash: 'sha256:' + '0'.repeat(64), size: 3, data: 'QUJD' });
    assert.equal((await reopenCharacterSource(extra, { crypto: webcrypto })).ok, false); assert.equal(atobCalls, 0);
    const many = JSON.parse(JSON.stringify(source)); many.bytes = Array.from({ length: 5000 }, (_, i) => ({ hash: 'sha256:' + String(i).padStart(64, '0'), size: 0, data: '' }));
    assert.equal(checkSourceBounds(many), 'source-limit');
    assert.throws(() => bundleTextFromSource(many));
    const notBase64 = JSON.parse(JSON.stringify(source)); notBase64.bytes[0].data = '!'.repeat(Math.ceil(notBase64.bytes[0].size / 3) * 4);
    assert.equal(checkSourceBounds(notBase64), 'resource bytes');
    const bigAsset = JSON.parse(JSON.stringify(source)); bigAsset.envelope.assets[0].size = 2 ** 40;
    assert.equal(checkSourceBounds(bigAsset), 'source-limit');
    assert.equal((await reopenCharacterSource(source, { crypto: webcrypto })).ok, true); // the genuine source still reopens
    assert.ok(atobCalls > 0);
  } finally { globalThis.atob = atob; }
  assert.equal((await store.open(done.individualId)).ok, true);
});

test('a stored record with oversized or mismatched bytes makes the store malformed, unchanged', async () => {
  const { store, storage } = persistent();
  await admit(store, 'neri');
  const state = JSON.parse(storage.getItem(KEY));
  state.records[0].source.bytes[0].data = 'QUJD'.repeat(100);
  const text = JSON.stringify(state); storage.setItem(KEY, text);
  assert.equal(store.read().code, 'malformed');
  assert.equal((await store.remove({ individualId: state.records[0].individualId, recordVersion: 1 })).code, 'malformed');
  assert.equal(storage.getItem(KEY), text);
});

// ---- 3. revision boundary ----
test('an exhausted revision counter is refused before any write: admission, update, copy and removal', async () => {
  const { store, storage } = persistent();
  const first = await admit(store, 'minimal');
  const prepared = [];
  prepared.push(await store.prepare({ text: bundle('bex') }));
  prepared.push(await store.prepare({ purpose: 'update', text: bundle('bex'), target: { individualId: first.individualId, recordVersion: 1 } }));
  prepared.push(await store.prepare({ purpose: 'copy', source: { individualId: first.individualId, recordVersion: 1 } }));
  const state = JSON.parse(storage.getItem(KEY)); state.revision = Number.MAX_SAFE_INTEGER;
  const text = JSON.stringify(state); storage.setItem(KEY, text);
  assert.equal(store.read().ok, true, 'a store at the limit is still readable');
  for (const p of prepared) { assert.equal(p.ok, true); const out = await store.commit(p.preparation); assert.equal(out.ok, false); assert.equal(out.code, 'exhausted'); }
  const removed = await store.remove({ individualId: first.individualId, recordVersion: 1 });
  assert.equal(removed.ok, false); assert.equal(removed.code, 'exhausted');
  assert.equal(storage.getItem(KEY), text, 'nothing was written');
  assert.equal(store.read().ok, true, 'and the store is still readable by the same module');
  // one below the limit still works exactly once, then reads back fine
  state.revision = Number.MAX_SAFE_INTEGER - 1; storage.setItem(KEY, JSON.stringify(state));
  const last = await store.prepare({ text: bundle('neri') });
  assert.equal((await store.commit(last.preparation)).status, 'admitted');
  assert.equal(JSON.parse(storage.getItem(KEY)).revision, Number.MAX_SAFE_INTEGER);
  assert.equal(store.read().ok, true);
});
