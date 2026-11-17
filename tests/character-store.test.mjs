// The conflict-safe rich character store (chat/characters/character-store.mjs). Real producer bundles (T415 de5e923), real byte retention, an
// in-memory storage with the localStorage contract and a Web Locks stand-in that really excludes. Real concurrent processes and abrupt death are in
// tests/character-store-crash.test.mjs; a real browser, vault and temporary chat are the following phase and are NOT claimed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { createCharacterStore, createTemporaryCharacterStore, createMemoryStorage, createMemoryLocks, checkStoredRecord, CHARACTER_STORE_LIMITS, CHARACTER_LOCK_NAME } from '../chat/characters/character-store.mjs';
import { encodeCharacterFragment } from '../chat/characters/character-package.mjs';
import { openAuthored, exportAuthored } from '../chat/characters/vendor/t415/contracts/authored-profiles/authored.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };
const KEY = 'plc.characters.v1'; // the key the following wiring phase will own and classify

function newStore(options = {}) {
  const storage = options.storage || createMemoryStorage();
  const locks = options.locks === undefined ? createMemoryLocks() : options.locks;
  const store = createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, now: (() => { let t = 1000; return () => ++t; })(), ...options.extra });
  return { storage, locks, store };
}
async function admit(store, text, extra = {}) {
  const p = await store.prepare({ text, ...extra });
  assert.equal(p.ok, true, JSON.stringify(p));
  const c = await store.commit(p.preparation);
  assert.equal(c.ok, true, JSON.stringify(c));
  return { preparation: p.preparation, outcome: c };
}
const raw = (storage) => storage.getItem(KEY);
async function externalNeri() {
  const opened = await openAuthored(bundle('neri'), { crypto: webcrypto });
  const bytes = opened.inlineBytes;
  const bundleOut = await exportAuthored(opened.document, opened.registry, { selection: opened.selection, visibility: opened.visibility, audience: opened.audience, byteMode: 'external', readAsset: async (h) => (async function* () { yield bytes.get(h); })(), hasherFactory, crypto: webcrypto });
  return { text: JSON.stringify(bundleOut), bytes, openExternal: async (h) => (async function* () { yield bytes.get(h).subarray(0, 9); yield bytes.get(h).subarray(9); })() };
}

test('admission stores the verified package whole: structured meaning, transport manifests and exact bytes, all plain JSON', async () => {
  const { store, storage } = newStore();
  const { outcome } = await admit(store, bundle('neri'));
  assert.equal(outcome.status, 'admitted'); assert.equal(outcome.recordVersion, 1);
  const stored = JSON.parse(raw(storage));
  assert.equal(stored.format, 1); assert.equal(stored.revision, 1); assert.equal(stored.records.length, 1);
  const rec = stored.records[0];
  assert.equal(checkStoredRecord(rec), null);
  assert.match(rec.individualId, /^individual:[0-9a-f-]{36}$/);
  assert.equal(rec.preview.name, 'Neri');
  for (const k of ['lore', 'guidance', 'prepared', 'presentation', 'media', 'evidence']) assert.ok(rec.structured[k].length > 0, k);
  const original = JSON.parse(bundle('neri'));
  assert.deepEqual(rec.source.envelope.records, original.records, 'record manifest kept');
  assert.deepEqual(rec.source.envelope.assets, original.assets.map(({ data, ...d }) => d), 'asset byte manifest kept');
  assert.deepEqual(rec.source.envelope.content, original.content);
  assert.equal(rec.source.bytes.length, 2);
  assert.equal(rec.source.root, original.root);
  assert.ok(!raw(storage).includes('resourceBytes') && !/function/.test(raw(storage)));
  // reopen through the producer validators: exact bytes, same meaning
  const opened = await store.open(rec.individualId);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  for (const r of opened.candidate.resources) assert.equal(opened.candidate.resourceBytes(r.sha256).length, r.size);
  assert.equal(opened.candidate.resources.find((r) => r.id === 'asset:card').preview.text, readFileSync(new URL('resources/tide-card.txt', fx), 'utf8'));
  // the summary list never carries bytes
  const listed = store.list(); assert.equal(listed.ok, true); assert.equal(listed.records[0].name, 'Neri'); assert.ok(!JSON.stringify(listed).includes('"data"'));
});

test('a genuine external-bytes export keeps its resources through admission, a new store instance and reload', async () => {
  const ext = await externalNeri();
  const { store, storage } = newStore();
  const p = await store.prepare({ text: ext.text, openExternal: ext.openExternal, hasherFactory });
  assert.equal(p.ok, true, JSON.stringify(p));
  assert.equal(p.preparation.resources, 2);
  assert.equal((await store.commit(p.preparation)).ok, true);
  const rec = JSON.parse(raw(storage)).records[0];
  assert.deepEqual(rec.source.envelope.assets.map((a) => a.status), ['external', 'external']);
  assert.equal(rec.source.bytes.length, 2);
  // "reload": a brand new store over the same storage, with no opener and no hasher
  const reload = createCharacterStore({ storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto });
  const opened = await reload.open(rec.individualId);
  assert.equal(opened.ok, true, JSON.stringify(opened));
  for (const r of opened.candidate.resources) { assert.equal(r.status, 'verified-external'); assert.deepEqual(opened.candidate.resourceBytes(r.sha256), new Uint8Array(ext.bytes.get(r.sha256))); }
});

test('all three producer packages and a fragment package are admitted', async () => {
  const { store } = newStore();
  for (const n of ['minimal', 'neri', 'bex']) await admit(store, bundle(n));
  const frag = await store.prepare({ hash: encodeCharacterFragment(bundle('minimal')) });
  assert.equal(frag.ok, true); assert.equal(frag.preparation.route, 'fragment');
  assert.equal((await store.commit(frag.preparation)).ok, true);
  assert.deepEqual(store.list().records.map((r) => r.name), ['Pip', 'Neri', 'Bex', 'Pip']);
  assert.equal((await store.prepare({ hash: '#preset=abcd' })).code, 'no-package');
  assert.equal((await store.prepare({})).code, 'no-package');
});

test('fresh and copy identity: a new opaque reference each time, from the injected crypto only', async () => {
  const { store } = newStore();
  const a = (await admit(store, bundle('neri'))).outcome.individualId;
  const b = (await admit(store, bundle('neri'))).outcome.individualId;
  assert.notEqual(a, b, 'the same package admitted twice is two characters, never a merge');
  const rec = store.get(a).record;
  for (const claim of [rec.design.designId, rec.subject.id, rec.source.root, rec.preview.name, rec.design.sourceCandidateId]) assert.ok(claim && !a.includes(claim), 'reference does not contain ' + claim);
  // a crypto that returns known values: the reference is exactly that, so nothing from the package can be part of it
  let n = 0; const fake = { ...webcrypto, subtle: webcrypto.subtle, randomUUID: () => 'fixed-' + String(++n).padStart(4, '0') + '-aaaaaaaa' };
  const seeded = createCharacterStore({ storage: createMemoryStorage(), key: KEY, locks: createMemoryLocks(), crypto: fake });
  const p = await seeded.prepare({ text: bundle('bex') });
  const c = await seeded.commit(p.preparation);
  assert.match(c.individualId, /^individual:fixed-\d{4}-aaaaaaaa$/);
  // copy: new character, lineage recorded as a design lineage, not a continuing life
  const prep = await store.prepare({ purpose: 'copy', source: { individualId: a, recordVersion: 1 } });
  assert.equal(prep.ok, true, JSON.stringify(prep));
  const copied = await store.commit(prep.preparation);
  assert.equal(copied.status, 'copied'); assert.notEqual(copied.individualId, a); assert.notEqual(copied.individualId, b);
  const copy = store.get(copied.individualId).record, orig = store.get(a).record;
  assert.equal(copy.origin.purpose, 'copy'); assert.deepEqual(copy.origin.copiedFrom, { individualId: a, recordVersion: 1 });
  assert.deepEqual(copy.source, orig.source, 'exact verified transport and bytes');
  assert.equal(orig.recordVersion, 1, 'the original is untouched');
  assert.equal((await store.prepare({ purpose: 'copy', source: { individualId: a, recordVersion: 1 }, text: bundle('neri') })).code, 'target');
  assert.equal((await store.prepare({ purpose: 'copy' })).code, 'target');
});

test('update keeps the chosen individualId, never selects by claims, and detects a stale target inside the lock', async () => {
  const { store, storage } = newStore();
  const first = (await admit(store, bundle('neri'))).outcome;
  const other = (await admit(store, bundle('bex'))).outcome;
  const target = { individualId: first.individualId, recordVersion: 1 };
  // two people prepare an update of the same version; one wins, the other is told
  const p1 = await store.prepare({ text: bundle('bex'), purpose: 'update', target });
  const p2 = await store.prepare({ text: bundle('minimal'), purpose: 'update', target });
  assert.equal(p1.ok && p2.ok, true);
  const [r1, r2] = await Promise.all([store.commit(p1.preparation), store.commit(p2.preparation)]);
  const winner = [r1, r2].find((r) => r.ok), loser = [r1, r2].find((r) => !r.ok);
  assert.equal(winner.status, 'updated'); assert.equal(winner.individualId, first.individualId); assert.equal(winner.recordVersion, 2);
  assert.equal(loser.code, 'stale'); assert.equal(loser.currentVersion, 2);
  const stored = store.get(first.individualId).record;
  assert.equal(stored.recordVersion, 2); assert.equal(stored.preview.name, winner === r1 ? 'Bex' : 'Pip', 'the stored result is the winner’s');
  assert.equal(store.get(other.individualId).record.recordVersion, 1, 'another character is untouched');
  assert.equal(store.list().records.length, 2);
  // an update whose package carries the SAME design/subject id as another record does not select it; only the explicit target counts
  const bexAgain = await store.prepare({ text: bundle('bex'), purpose: 'update', target: { individualId: first.individualId, recordVersion: 2 } });
  assert.equal((await store.commit(bexAgain.preparation)).individualId, first.individualId);
  assert.equal(store.get(other.individualId).record.recordVersion, 1);
  // gone target
  const gone = await store.prepare({ text: bundle('bex'), purpose: 'update', target: { individualId: 'individual:nobody', recordVersion: 1 } });
  const before = raw(storage);
  assert.equal((await store.commit(gone.preparation)).code, 'gone'); assert.equal(raw(storage), before);
  // the target is required and well formed; a fresh admission may not name one
  assert.equal((await store.prepare({ text: bundle('bex'), purpose: 'update' })).code, 'target');
  assert.equal((await store.prepare({ text: bundle('bex'), purpose: 'update', target: { individualId: 'x y', recordVersion: 1 } })).code, 'target');
  assert.equal((await store.prepare({ text: bundle('bex'), target })).code, 'target');
  for (const purpose of ['continue', 'attach-existing', 'restore', 'move-authoritative-host', 'report-memory', '', 7]) assert.equal((await store.prepare({ text: bundle('bex'), purpose })).code, 'purpose', String(purpose));
});

test('idempotency: one admission applied twice (double callback, retry) changes the store once; a new preparation is a new admission', async () => {
  const { store, storage } = newStore();
  const p = await store.prepare({ text: bundle('neri') });
  const results = await Promise.all([store.commit(p.preparation), store.commit(p.preparation), store.commit(p.preparation)]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['admitted', 'already-admitted', 'already-admitted']);
  assert.equal(new Set(results.map((r) => r.individualId)).size, 1);
  const text = raw(storage);
  assert.equal(store.list().records.length, 1);
  assert.equal((await store.commit(p.preparation)).status, 'already-admitted'); assert.equal(raw(storage), text, 'a retry writes nothing');
  const again = await store.prepare({ text: bundle('neri') });
  assert.equal((await store.commit(again.preparation)).status, 'admitted'); assert.equal(store.list().records.length, 2);
  // update retry
  const id = results[0].individualId;
  const up = await store.prepare({ text: bundle('bex'), purpose: 'update', target: { individualId: id, recordVersion: 1 } });
  const [u1, u2] = await Promise.all([store.commit(up.preparation), store.commit(up.preparation)]);
  assert.deepEqual([u1.status, u2.status].sort(), ['already-applied', 'updated']);
  assert.equal(store.get(id).record.recordVersion, 2, 'bumped once');
  // remove: the version must match; a second remove reports the record already gone, writes nothing
  assert.equal((await store.remove({ individualId: id, recordVersion: 1 })).code, 'stale');
  assert.equal((await store.remove({ individualId: id, recordVersion: 2 })).status, 'removed');
  const after = raw(storage);
  assert.equal((await store.remove({ individualId: id, recordVersion: 2 })).status, 'already-absent'); assert.equal(raw(storage), after);
  assert.equal((await store.remove({ individualId: id })).code, 'target');
});

test('only a preparation this store made can be committed: forged, copied, foreign and mutated objects refuse', async () => {
  const { store } = newStore(); const { store: other } = newStore();
  const p = await store.prepare({ text: bundle('neri') });
  for (const forged of [null, undefined, 'x', {}, { ...p.preparation }, JSON.parse(JSON.stringify(p.preparation)), { kind: 'character-admission', admissionId: 'admission:x', purpose: 'fresh' }]) assert.equal((await store.commit(forged)).code, 'unknown-preparation');
  assert.equal((await other.commit(p.preparation)).code, 'unknown-preparation', 'another store');
  assert.throws(() => { p.preparation.name = 'Mallory'; }, TypeError);
  // a candidate-shaped object with forged bytes or maps is not an input at all
  const review = await import('../chat/characters/character-package.mjs');
  const real = await review.reviewCharacterPackageFile(bundle('neri'), { crypto: webcrypto });
  assert.equal((await store.commit(real.candidate)).code, 'unknown-preparation');
  assert.equal((await store.commit(p.preparation)).ok, true, 'the genuine preparation still works');
  assert.equal(store.list().records.length, 1);
});

test('every change takes the lock, reads fresh inside it, and writes only inside it', async () => {
  const log = []; let held = false;
  const base = createMemoryLocks();
  const locks = { request: (name, o, cb) => base.request(name, o, async () => { held = true; log.push('lock:' + name); try { return await cb(); } finally { held = false; log.push('release'); } }) };
  const mem = createMemoryStorage();
  const storage = { getItem: (k) => { log.push((held ? 'get-in' : 'get-out')); return mem.getItem(k); }, setItem: (k, v) => { assert.equal(held, true, 'a write outside the lock'); log.push('set'); mem.setItem(k, v); }, removeItem: mem.removeItem };
  const { store } = newStore({ storage, locks });
  const c = await admit(store, bundle('bex'));
  assert.equal(log[0], 'lock:' + CHARACTER_LOCK_NAME);
  const inside = log.slice(1, log.indexOf('release'));
  assert.deepEqual(inside, ['get-in', 'set', 'get-in'], 'fresh read, one write, one read back');
  log.length = 0;
  const rec = c.outcome;
  await store.remove({ individualId: rec.individualId, recordVersion: 1 });
  assert.deepEqual(log.slice(1, log.indexOf('release')), ['get-in', 'set', 'get-in']);
});

test('no lock support, read-only tab, or a lock that cannot be had: nothing is written, nothing falls back', async () => {
  const { store: ok } = newStore();
  const p = await ok.prepare({ text: bundle('bex') });
  const seed = createMemoryStorage();
  for (const [label, options, code] of [['no Web Locks', { locks: null }, 'unsupported'], ['no request()', { locks: {} }, 'unsupported'], ['read-only', { extra: { isReadOnly: () => true } }, 'read-only']]) {
    const { store, storage } = newStore({ storage: seed, ...options });
    const q = await store.prepare({ text: bundle('bex') });
    assert.equal(q.ok, true, label);
    const r = await store.commit(q.preparation);
    assert.equal(r.code, code, label); assert.equal(raw(seed), null, label + ': nothing stored');
    assert.equal((await store.remove({ individualId: 'individual:a', recordVersion: 1 })).code, code, label);
    assert.equal(store.ready().code, code);
  }
  // held by someone else for longer than waitMs: busy, not a bypass
  const base = createMemoryLocks(); let release; const gate = new Promise((r) => { release = r; });
  base.request(CHARACTER_LOCK_NAME, {}, () => gate);
  const { store, storage } = newStore({ locks: base, extra: { waitMs: 40 } });
  const q = await store.prepare({ text: bundle('bex') });
  const r = await store.commit(q.preparation);
  assert.equal(r.code, 'busy'); assert.equal(raw(storage), null);
  release();
  // a lock that is merely slow is waited for
  const slow = newStore({ locks: base, extra: { waitMs: 2000 } });
  const q2 = await slow.store.prepare({ text: bundle('bex') });
  assert.equal((await slow.store.commit(q2.preparation)).ok, true);
  assert.equal(p.ok, true);
});

test('malformed, unreadable and newer-format stored data is refused and never overwritten', async () => {
  const good = newStore(); await admit(good.store, bundle('neri'));
  const goodRec = JSON.parse(raw(good.storage)).records[0];
  const tampered = JSON.parse(raw(good.storage)); tampered.records[0].source.bytes[0].data = 'AAAA';
  const dupes = JSON.parse(raw(good.storage)); dupes.records.push(dupes.records[0]);
  const cases = {
    'not json': ['{nope', 'malformed'], 'an array': ['[]', 'malformed'], 'a number': ['5', 'malformed'], 'no records': ['{"format":1,"revision":0}', 'malformed'],
    'records not a list': ['{"format":1,"revision":0,"records":5}', 'malformed'], 'bad format field': ['{"format":"1","revision":0,"records":[]}', 'malformed'],
    'a half record': [JSON.stringify({ format: 1, revision: 1, records: [{ individualId: 'individual:a' }] }), 'malformed'],
    'bytes that do not match their manifest': [JSON.stringify(tampered), 'malformed'], 'duplicate individual references': [JSON.stringify(dupes), 'malformed'],
    'a newer format': [JSON.stringify({ format: 2, revision: 9, records: [{ whatever: true }], futureField: 1 }), 'newer'],
  };
  for (const [label, [text, code]] of Object.entries(cases)) {
    const storage = createMemoryStorage(); storage.setItem(KEY, text);
    const { store } = newStore({ storage });
    const p = await store.prepare({ text: bundle('bex') });
    const c = await store.commit(p.preparation);
    assert.equal(c.code, code, label); assert.equal(raw(storage), text, label + ': left exactly as it was');
    assert.equal(store.list().code, code); assert.equal(store.ready().code, code);
    assert.equal((await store.remove({ individualId: goodRec.individualId, recordVersion: 1 })).code, code, label);
  }
  const unreadable = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('must not write'); } };
  const { store } = newStore({ storage: unreadable });
  const p = await store.prepare({ text: bundle('bex') });
  assert.equal((await store.commit(p.preparation)).code, 'unreadable');
  // unknown extra fields of the CURRENT format are kept when something else changes
  const withExtra = JSON.parse(raw(good.storage)); withExtra.futureNote = { keep: 'me' }; withExtra.records[0].extraField = [1, 2];
  const s2 = createMemoryStorage(); s2.setItem(KEY, JSON.stringify(withExtra));
  const { store: st2 } = newStore({ storage: s2 });
  await admit(st2, bundle('bex'));
  const after = JSON.parse(raw(s2)); assert.deepEqual(after.futureNote, { keep: 'me' }); assert.deepEqual(after.records[0].extraField, [1, 2]); assert.equal(after.records.length, 2);
});

test('a failed, refused, lying or over-full storage leaves the previous valid store, and nothing is put back over another writer', async () => {
  const base = newStore(); await admit(base.store, bundle('neri'));
  const before = raw(base.storage);
  const wrap = (setItem) => { const s = createMemoryStorage(); s.setItem(KEY, before); return { ...s, getItem: s.getItem, setItem: (k, v) => setItem(s, k, v) }; };
  const tries = {
    'quota error': [wrap(() => { throw new DOMException('full', 'QuotaExceededError'); }), 'write-failed'],
    'silently refused (read-only or blocked key)': [wrap(() => {}), 'write-refused'],
  };
  for (const [label, [storage, code]] of Object.entries(tries)) {
    const { store } = newStore({ storage });
    const p = await store.prepare({ text: bundle('bex') });
    const c = await store.commit(p.preparation);
    assert.equal(c.code, code, label); assert.equal(raw(storage), before, label + ': previous store intact');
    assert.equal(JSON.parse(raw(storage)).records.length, 1);
  }
  // a storage that stores something else (another writer outside the lock): reported, and NOT restored
  const liar = wrap((s, k, v) => s.setItem(k, '{"format":1,"revision":77,"records":[]}'));
  const { store } = newStore({ storage: liar });
  const p = await store.prepare({ text: bundle('bex') });
  assert.equal((await store.commit(p.preparation)).code, 'changed');
  assert.equal(raw(liar), '{"format":1,"revision":77,"records":[]}', 'the other writer’s value is left in place');
  // too many / too large
  const rec = JSON.parse(before).records[0];
  const crowded = { format: 1, revision: 5, records: Array.from({ length: CHARACTER_STORE_LIMITS.records }, (_, i) => ({ ...rec, individualId: 'individual:seed-' + i })) };
  const fullText = JSON.stringify(crowded);
  const s = createMemoryStorage(); s.setItem(KEY, fullText);
  const { store: full } = newStore({ storage: s });
  const pf = await full.prepare({ text: bundle('minimal') });
  assert.equal((await full.commit(pf.preparation)).code, 'too-large'); assert.equal(raw(s), fullText);
});

test('a stored record that no longer verifies is reported by open() and left in place; remove still works', async () => {
  const { store, storage } = newStore(); const { outcome } = await admit(store, bundle('neri'));
  const state = JSON.parse(raw(storage));
  const b = state.records[0].source.bytes[0]; const swapped = b.data.slice(0, 4) === 'AAAA' ? 'BBBB' + b.data.slice(4) : 'AAAA' + b.data.slice(4);
  b.data = swapped; storage.setItem(KEY, JSON.stringify(state));
  const opened = await store.open(outcome.individualId);
  assert.equal(opened.ok, false); assert.equal(opened.code, 'verification-failed');
  assert.equal(JSON.parse(raw(storage)).records.length, 1);
  assert.equal((await store.remove({ individualId: outcome.individualId, recordVersion: 1 })).status, 'removed');
  assert.equal((await store.open('individual:none')).code, 'gone');
});

test('refused packages never touch storage: tampered, required-unsupported, missing required bytes, oversized', async () => {
  const { store, storage } = newStore();
  const b = JSON.parse(bundle('neri')); b.assets[0].data = 'AAAA' + b.assets[0].data.slice(4);
  const strip = JSON.parse(bundle('neri')); delete strip.assets[0].data; strip.assets[0].status = 'missing';
  for (const text of [JSON.stringify(b), JSON.stringify(strip), '{', 'x'.repeat(2_000_000), bundle('neri').replace('cosmogenitor/bundle/0', 'cosmogenitor/bundle/1')]) {
    const p = await store.prepare({ text });
    assert.equal(p.ok, false);
  }
  assert.equal(raw(storage), null);
});

test('the store touches only its own key and no other writer’s storage', async () => {
  const seen = new Set(); const mem = createMemoryStorage();
  const storage = { getItem: (k) => { seen.add(k); return mem.getItem(k); }, setItem: (k, v) => { seen.add(k); mem.setItem(k, v); }, removeItem: (k) => { seen.add(k); mem.removeItem(k); } };
  const { store } = newStore({ storage }); const o = await admit(store, bundle('bex'));
  await store.remove({ individualId: o.outcome.individualId, recordVersion: 1 });
  assert.deepEqual([...seen], [KEY]);
  const src = readFileSync(new URL('../chat/characters/character-store.mjs', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /chatThreads|plc\.presets|plc\.prefs|plc\.encounters|plc\.memory|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|\beval\s*\(/);
});

test('temporary chats: memory only, separate per session, no browser storage, and a changed scope refuses', async () => {
  const traps = {};
  for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) { traps[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { configurable: true, get() { throw new Error(k + ' was touched'); } }); }
  try {
    let session = 'chat-1'; const scope = { current: () => session };
    const temp = createTemporaryCharacterStore({ scope, crypto: webcrypto });
    assert.equal(temp.temporary, true);
    const a = await admit(temp, bundle('neri'));
    assert.equal(temp.list().records.length, 1);
    assert.equal((await temp.open(a.outcome.individualId)).ok, true);
    // the same code path: update, copy and remove
    const up = await temp.prepare({ text: bundle('bex'), purpose: 'update', target: { individualId: a.outcome.individualId, recordVersion: 1 } });
    assert.equal((await temp.commit(up.preparation)).status, 'updated');
    // a scope that changes while the package is being validated
    const slowScope = { current: () => session };
    const t2 = createTemporaryCharacterStore({ scope: slowScope, crypto: webcrypto });
    const pending = t2.prepare({ text: bundle('neri') });
    session = 'chat-2'; // the temporary session was replaced during asynchronous validation
    assert.equal((await pending).code, 'scope-changed');
    // changed between prepare and commit
    session = 'chat-3';
    const t3 = createTemporaryCharacterStore({ scope: slowScope, crypto: webcrypto });
    const prepared = await t3.prepare({ text: bundle('neri') });
    session = 'chat-4';
    assert.equal((await t3.commit(prepared.preparation)).code, 'scope-changed');
    assert.equal(t3.list().records.length, 0);
    // a new session's store knows nothing of the old one
    assert.equal(createTemporaryCharacterStore({ scope: { current: () => 'x' }, crypto: webcrypto }).list().records.length, 0);
    assert.throws(() => createTemporaryCharacterStore({}), TypeError);
  } finally { for (const [k, d] of Object.entries(traps)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } }
});

test('a persistent store may also be bound to a scope (the page that owns it)', async () => {
  let page = 1; const { store, storage } = newStore({ extra: { scope: { current: () => page } } });
  const p = await store.prepare({ text: bundle('bex') }); page = 2;
  assert.equal((await store.commit(p.preparation)).code, 'scope-changed'); assert.equal(raw(storage), null);
});

test('parallel admissions in one tab through the real lock queue: nothing lost, nothing duplicated', async () => {
  const { store } = newStore();
  const preps = await Promise.all(Array.from({ length: 12 }, (_, i) => store.prepare({ text: bundle(['minimal', 'neri', 'bex'][i % 3]) })));
  const out = await Promise.all(preps.map((p) => store.commit(p.preparation)));
  assert.ok(out.every((r) => r.ok && r.status === 'admitted'));
  const rows = store.list().records;
  assert.equal(rows.length, 12); assert.equal(new Set(rows.map((r) => r.individualId)).size, 12);
  assert.equal(JSON.parse(JSON.stringify(store.list())).revision, 12);
});
