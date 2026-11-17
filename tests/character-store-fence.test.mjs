// The initiating-session fence of the rich character store (chat/characters/character-store.mjs): commit(preparation, { fence }) and remove(target, { fence }).
// A fence is the caller's own "my session is no longer the one I began in" check. The store asks it before the work, after the asynchronous validation, and INSIDE the lock in the same
// synchronous step as the stored-state check, so an action that waited for the lock across a session change or a vault epoch change writes nothing. REAL producer bundles and validators,
// the real writer code, a Web Locks stand-in that really excludes (and counts requests, so a test waits for "queued" as a condition, never a sleep). Nothing here claims a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createCharacterStore, createMemoryStorage, createMemoryLocks, CHARACTER_LOCK_NAME } from '../chat/characters/character-store.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const KEY = 'plc.characters.v1';
const until = async (condition, what, ms = 10000) => { const end = Date.now() + ms; while (!condition()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 1)); } };

function newStore() {
  const storage = createMemoryStorage(); const inner = createMemoryLocks();
  const stat = { requests: 0 };
  const locks = { request: (...a) => { stat.requests += 1; return inner.request(...a); } };
  const store = createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, now: (() => { let t = 1000; return () => ++t; })() });
  /** Hold the lock; resolves once it is really held. */
  const holdLock = async () => {
    let release; let entered = false;
    const done = locks.request(CHARACTER_LOCK_NAME, {}, async () => { entered = true; await new Promise((r) => { release = r; }); });
    await until(() => entered, 'the lock to be held');
    return { release: () => release(), done };
  };
  const queued = (before) => until(() => stat.requests > before, 'the operation to be queued behind the lock');
  return { storage, store, stat, holdLock, queued };
}
const records = (storage) => { const t = storage.getItem(KEY); return t === null ? [] : JSON.parse(t).records; };
async function admitted(store, name = 'minimal') {
  const p = await store.prepare({ text: bundle(name) }); assert.equal(p.ok, true, JSON.stringify(p));
  const c = await store.commit(p.preparation); assert.equal(c.ok, true, JSON.stringify(c)); return c;
}

test('commit: a fence that moves while the commit waits for the lock refuses inside the lock and writes nothing; the same commit with a still-valid fence is written', async () => {
  for (const moves of [true, false]) {
    const { store, storage, stat, holdLock, queued } = newStore();
    const p = await store.prepare({ text: bundle('minimal') }); assert.equal(p.ok, true);
    let stale = false;
    const held = await holdLock(); const before = stat.requests;
    const committing = store.commit(p.preparation, { fence: () => stale });
    await queued(before);
    if (moves) stale = true; // the session changed while queued behind another writer
    held.release(); await held.done;
    const out = await committing;
    if (moves) { assert.equal(out.ok, false); assert.equal(out.code, 'scope-changed'); assert.equal(storage.getItem(KEY), null, 'nothing was written'); }
    else { assert.equal(out.ok, true, 'control: the intended write still happens'); assert.equal(records(storage).length, 1); }
  }
});

test('commit: a fence that moves while the package is still being validated (before the lock) refuses; nothing written, nothing queued', async () => {
  const { store, storage, stat } = newStore();
  const p = await store.prepare({ text: bundle('minimal') });
  let stale = false; const before = stat.requests;
  const committing = store.commit(p.preparation, { fence: () => stale }); stale = true; // flips during the re-verification
  const out = await committing;
  assert.equal(out.code, 'scope-changed'); assert.equal(storage.getItem(KEY), null); assert.equal(stat.requests, before, 'it never asked for the lock');
});

test('copy and update commits are fenced inside the lock too', async () => {
  const { store, storage, stat, holdLock, queued } = newStore();
  const first = await admitted(store);
  const version = first.recordVersion; const id = first.individualId;
  for (const kind of ['copy', 'update']) {
    const p = await store.prepare(kind === 'copy' ? { purpose: 'copy', source: { individualId: id, recordVersion: version } } : { purpose: 'update', text: bundle('minimal'), target: { individualId: id, recordVersion: version } });
    assert.equal(p.ok, true, JSON.stringify(p));
    let stale = false; const held = await holdLock(); const before = stat.requests;
    const committing = store.commit(p.preparation, { fence: () => stale }); await queued(before);
    stale = true; held.release(); await held.done;
    const out = await committing;
    assert.equal(out.code, 'scope-changed', kind);
    assert.equal(records(storage).length, 1, kind + ': no copy added'); assert.equal(records(storage)[0].recordVersion, version, kind + ': no update applied');
  }
  // controls: the same two with a valid fence DO write
  const copy = await store.prepare({ purpose: 'copy', source: { individualId: id, recordVersion: version } });
  assert.equal((await store.commit(copy.preparation, { fence: () => false })).status, 'copied');
  const update = await store.prepare({ purpose: 'update', text: bundle('minimal'), target: { individualId: id, recordVersion: version } });
  assert.equal((await store.commit(update.preparation, { fence: () => false })).status, 'updated');
});

test('remove: a fence that moves while the removal waits for the lock keeps the record; a valid fence removes it', async () => {
  for (const moves of [true, false]) {
    const { store, storage, stat, holdLock, queued } = newStore();
    const c = await admitted(store);
    let stale = false; const held = await holdLock(); const before = stat.requests;
    const removing = store.remove({ individualId: c.individualId, recordVersion: c.recordVersion }, { fence: () => stale }); await queued(before);
    if (moves) stale = true;
    held.release(); await held.done;
    const out = await removing;
    if (moves) { assert.equal(out.code, 'scope-changed'); assert.equal(records(storage).length, 1, 'the record is still there'); }
    else { assert.equal(out.status, 'removed'); assert.equal(records(storage).length, 0); }
  }
});

test('a fence fails closed: a throwing fence or any answer other than exactly false refuses; a non-function is refused as invalid; no fence is the old behaviour', async () => {
  const { store, storage } = newStore();
  for (const fence of [() => { throw new Error('boom'); }, () => true, () => undefined, () => 0, () => null]) {
    const p = await store.prepare({ text: bundle('minimal') });
    assert.equal((await store.commit(p.preparation, { fence })).code, 'scope-changed');
  }
  const p = await store.prepare({ text: bundle('minimal') });
  assert.equal((await store.commit(p.preparation, { fence: 'yes' })).code, 'target');
  assert.equal((await store.remove({ individualId: 'individual:x', recordVersion: 1 }, { fence: 5 })).code, 'target');
  assert.equal(storage.getItem(KEY), null, 'nothing written by any refused call');
  const ok = await store.commit(p.preparation); assert.equal(ok.ok, true, 'no fence: unchanged behaviour');
});

test('mixed fenced and unfenced writers (8 actors, 20 repeats): only unfenced writes land, none lost, store whole', async () => {
  for (let round = 0; round < 20; round++) {
    const { store, storage } = newStore();
    const actors = await Promise.all(Array.from({ length: 8 }, async (_, i) => ({ i, fenced: i % 2 === 1, p: await store.prepare({ text: bundle('minimal') }) })));
    let start; const gate = new Promise((r) => { start = r; });
    const running = actors.map((a) => gate.then(() => store.commit(a.p.preparation, { fence: () => a.fenced })));
    start();
    const results = await Promise.all(running);
    actors.forEach((a, i) => { if (a.fenced) assert.equal(results[i].code, 'scope-changed', 'fenced actor ' + a.i + ' refused'); else assert.equal(results[i].status, 'admitted', 'unfenced actor ' + a.i + ' admitted'); });
    const state = JSON.parse(storage.getItem(KEY));
    assert.equal(state.records.length, 4, 'no lost update, no fenced write');
    assert.equal(new Set(state.records.map((r) => r.individualId)).size, 4, 'no duplicates');
    assert.equal(state.revision, 4, 'one revision per real write');
  }
});
