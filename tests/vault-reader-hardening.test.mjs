// Reader hardening of the accepted vault (docs/DATA-COMPATIBILITY.md, "A vault from a newer version is refused").
// Three defects, tested through the real vault engine, crypto and the memory adapter (no browser, no passkey device):
//   1. known-key unlock must refuse a supported-format mismatch of the supplied OR the freshly read actual header;
//   2. bootVault must reject (and keep the marker) when the header cannot be READ, never answer "plain";
//   3. compaction must refuse when a decoded event is of a type this version does not support.
// The future header is explicitly synthetic: a copy of a real header with another format name.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createVault, VaultError} from '../chat/vault/vault.mjs';
import {createMemoryAdapter} from '../chat/vault/vault-db.mjs';

const FAST = 1000;
const MARKER = 'plc.vault.v1';
const FUTURE = 'plc-vault/2';
const raw = (adapter) => JSON.stringify(adapter.raw());
const storage = (initial = {}) => { const m = new Map(Object.entries(initial)); return {getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; }}; };
let instances = 0;
// An independent module instance each time, so the memoized `booted` of one case is never shared with another.
const freshStore = () => import(new URL('../chat/vault/vault-store.mjs?reader=' + (++instances), import.meta.url).href);
const rejectsWith = (code) => (e) => { assert.equal(e?.code, code, String(e?.stack || e)); return true; };

async function seeded() {
  const adapter = createMemoryAdapter(), vault = createVault({adapter});
  const s = await vault.create('pw one', {iterations: FAST});
  await s.setKv('a', '1'); await s.putThread('t1', {id: 't1', messages: [{role: 'user', content: 'x'}]}); await s.setKv('b', '2');
  const header = adapter.raw().header, dek = s.dekBytes();
  s.lock();
  return {adapter, vault, header, dek};
}
const futureOf = (header) => ({...header, format: FUTURE});

// ---- 1. known-key ingress -------------------------------------------------------------------------------------------------------------
test('control: passphrase unlock and known-key unlock with the same format still work', async () => {
  const {vault, header, dek} = await seeded();
  const a = await vault.unlock('pw one'); assert.equal(a.state.kv.get('a'), '1'); a.lock();
  const b = await vault.unlockWithKey(header, dek); assert.equal(b.state.kv.get('b'), '2'); assert.deepEqual(b.damaged, []); b.lock();
});

test('known-key unlock refuses a supplied future header and changes nothing', async () => {
  const {adapter, vault, header, dek} = await seeded();
  const before = raw(adapter);
  await assert.rejects(() => vault.unlockWithKey(futureOf(header), dek), rejectsWith('format'));
  assert.equal(raw(adapter), before);
});

test('known-key unlock refuses an old supplied header when the persisted header is already newer', async () => {
  const {adapter, vault, header, dek} = await seeded();
  await adapter.writeHeader(futureOf(header));
  const before = raw(adapter);
  await assert.rejects(() => vault.unlockWithKey(header, dek), rejectsWith('format'));
  await assert.rejects(() => vault.unlock('pw one'), rejectsWith('format'));
  assert.equal(raw(adapter), before);
});

test('known-key unlock rejects, and keeps every byte, when the header cannot be read', async () => {
  const {adapter, header, dek} = await seeded();
  const before = raw(adapter), failing = {...adapter, readHeader: async () => { throw Object.assign(new Error('read failed'), {name: 'VersionError'}); }};
  await assert.rejects(() => createVault({adapter: failing}).unlockWithKey(header, dek), (e) => e.name === 'VersionError');
  assert.equal(raw(adapter), before);
});

// ---- 2. boot ---------------------------------------------------------------------------------------------------------------------------
const bootWith = async (adapter, local, ui) => { const store = await freshStore(); return {store, run: () => store.bootVault({adapter, realLocal: local, ui})}; };

for (const [label, error] of [['VersionError', Object.assign(new Error('newer database'), {name: 'VersionError'})], ['an ordinary read failure', new Error('disk gone')]]) {
  test('boot rejects, keeps the marker and never unlocks or attaches when the header read fails with ' + label, async () => {
    const {adapter} = await seeded();
    const before = raw(adapter), local = storage({[MARKER]: '1'});
    let asked = 0;
    const {store, run} = await bootWith({...adapter, readHeader: async () => { throw error; }}, local, {unlock: async () => { asked++; throw new Error('must not be asked'); }});
    await assert.rejects(run, (e) => e.code === 'header-unreadable' && e.cause === error);
    assert.equal(local.getItem(MARKER), '1');
    assert.equal(asked, 0);
    assert.equal(store.app.active, false);
    assert.equal(raw(adapter), before);
  });
}

test('control: a confirmed missing header keeps its own missing-vault behaviour', async () => {
  const local = storage({[MARKER]: '1'});
  const {run} = await bootWith(createMemoryAdapter(), local, {unlock: async () => { throw new Error('no'); }});
  const res = await run();
  assert.equal(res.vault, false); assert.equal(res.markerWithoutVault, true); assert.equal(local.getItem(MARKER), null);
});

test('control: no marker is ordinary plain mode and the adapter is not read', async () => {
  const {adapter} = await seeded();
  const {run} = await bootWith({...adapter, readHeader: async () => { throw new Error('must not be read'); }}, storage(), {unlock: async () => { throw new Error('no'); }});
  assert.deepEqual(await run(), {vault: false});
});

test('control: a readable header still unlocks and attaches', async () => {
  const {adapter} = await seeded();
  const local = storage({[MARKER]: '1'});
  const {store, run} = await bootWith(adapter, local, {unlock: async ({vault}) => vault.unlock('pw one')});
  const res = await run();
  assert.equal(res.vault, true); assert.equal(store.app.active, true); assert.equal(local.getItem(MARKER), '1');
});

// ---- 3. compaction ---------------------------------------------------------------------------------------------------------------------
const UNKNOWN = {t: 'future.event', payload: {n: 1}};

test('control: compaction of known events (with a deleted chat and an unknown FIELD) still works', async () => {
  const {vault} = await seeded();
  const s = await vault.unlock('pw one');
  await s.append({scope: 'dek', event: {t: 'kv.set', k: 'extra', v: 'x', futureField: {deep: true}}});
  await s.putThread('t2', {id: 't2', messages: []}); await s.delThread('t2');
  const out = await s.compact();
  assert.ok(out.records > 0);
  const again = await vault.unlock('pw one');
  assert.equal(again.state.kv.get('extra'), 'x'); assert.equal(again.state.threads.has('t1'), true); assert.equal(again.state.threads.has('t2'), false);
});

test('compaction refuses an unknown event appended in this session and keeps every byte', async () => {
  const {adapter, vault} = await seeded();
  const s = await vault.unlock('pw one');
  await s.append({scope: 'dek', event: UNKNOWN});
  const before = raw(adapter);
  await assert.rejects(() => s.compact(), rejectsWith('unsupported-event'));
  assert.equal(raw(adapter), before);
  await s.setKv('after', 'ok'); // the queue is not wedged by the refusal
  assert.equal(s.state.kv.get('after'), 'ok');
});

test('compaction refuses after a fresh reopen that decoded an unknown event', async () => {
  const {adapter, vault} = await seeded();
  const w = await vault.unlock('pw one'); await w.append({scope: 'dek', event: UNKNOWN}); w.lock();
  const s = await vault.unlock('pw one');
  const before = raw(adapter);
  await assert.rejects(() => s.compact(), rejectsWith('unsupported-event'));
  assert.equal(raw(adapter), before);
});

test('compaction queued behind an unknown append (no await between) refuses', async () => {
  const {adapter, vault} = await seeded();
  const s = await vault.unlock('pw one');
  const appended = s.append({scope: 'dek', event: UNKNOWN}), compacted = s.compact();
  await appended;
  const logBefore = adapter.raw().log.length;
  await assert.rejects(() => compacted, rejectsWith('unsupported-event'));
  assert.equal(adapter.raw().log.length, logBefore);
  assert.equal(adapter.raw().log.length, 5); // key.put, a, thread, b... plus the unknown one, nothing removed
});

test('an unknown event under a chat scope is refused too (no guess from the scope name)', async () => {
  const {adapter, vault} = await seeded();
  const s = await vault.unlock('pw one');
  await s.append({scope: 'c:t1', event: {t: 'future.chat.thing'}});
  const before = raw(adapter);
  await assert.rejects(() => s.compact(), rejectsWith('unsupported-event'));
  assert.equal(raw(adapter), before);
});

test('compaction checks the freshly read header: stale supplied metadata is no escape', async () => {
  const {adapter, vault, header} = await seeded();
  const s = await vault.unlock('pw one');
  await adapter.writeHeader(futureOf(header));
  const before = raw(adapter);
  await assert.rejects(() => s.compact(), rejectsWith('format'));
  assert.equal(raw(adapter), before);
});

// ---- concurrency (skill `concurrency`): scratch in-memory vaults, 20 repeats ---------------------------------------------------------------
// Invariants (stated before running): no lost or duplicated record; every reader sees a whole, undamaged state (never torn);
// a refusal is explicit and replaces/deletes nothing; the serialized writer keeps making progress after its own refusal (no deadlock,
// nothing left held); everything finishes inside a time bound; no false ordinary-plain success.
const REPEATS = 20, ACTORS = 8, BOUND = 20_000;
const within = (promise, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout: ' + what)), BOUND).unref())]);
const barrier = (n) => { let reached = 0, release; const gate = new Promise((r) => { release = r; }); return async () => { if (++reached === n) release(); await gate; }; };

test('concurrency: one serialized writer (queued appends and refused compact) with 7 readers, 20 repeats', async () => {
  for (let round = 0; round < REPEATS; round++) {
    const {adapter, vault, dek} = await seeded(); // a=1, t1, b=2: the three records every reader must see
    const s = await vault.unlock('pw one');
    const arrive = barrier(ACTORS), header = adapter.raw().header;
    const writer = (async () => {
      await arrive();
      const queued = [];
      for (let i = 0; i < 5; i++) queued.push(s.setKv('w' + i, String(i)));
      queued.push(s.append({scope: 'dek', event: UNKNOWN}));
      const refused = s.compact().then(() => 'compacted', (e) => e.code);
      queued.push(s.setKv('last', 'z')); // queued behind the refusal
      await Promise.all(queued);
      return refused;
    })();
    const reader = async () => {
      await arrive();
      const seen = [];
      for (let i = 0; i < 4; i++) {
        const r = await createVault({adapter}).unlockWithKey(header, new Uint8Array(dek)); // lock() zeroes the key it was given: pass a copy
        assert.deepEqual(r.damaged, []);
        assert.equal(r.state.kv.get('a'), '1'); assert.equal(r.state.kv.get('b'), '2'); assert.equal(r.state.threads.get('t1').id, 't1');
        const ws = [...r.state.kv.keys()].filter((k) => /^w\d$/.test(k)).sort();
        assert.equal(ws.length, new Set(ws).size);
        seen.push(ws.length); r.lock();
      }
      return seen;
    };
    const results = await within(Promise.all([writer, ...Array.from({length: ACTORS - 1}, reader)]), 'round ' + round);
    assert.equal(results[0], 'unsupported-event', 'round ' + round);
    const final = await createVault({adapter}).unlockWithKey(header, new Uint8Array(dek));
    assert.deepEqual(final.damaged, []);
    for (let i = 0; i < 5; i++) assert.equal(final.state.kv.get('w' + i), String(i));
    assert.equal(final.state.kv.get('last'), 'z');
    const seqs = adapter.raw().log.map((r) => r.seq);
    assert.deepEqual(seqs, seqs.map((_, i) => seqs[0] + i)); // contiguous, no duplicate, nothing removed by the refusal
    assert.equal(seqs.length, 4 + 5 + 1 + 1); // seeded 4 (key.put t1, a, t1, b) + w0..w4 + unknown + last
    final.lock(); s.lock();
  }
});

test('concurrency: 8 simultaneous known-key reads and boots against a newer persisted header all refuse, 20 repeats', async () => {
  for (let round = 0; round < REPEATS; round++) {
    const {adapter, header, dek} = await seeded();
    await adapter.writeHeader(futureOf(header));
    const before = raw(adapter), arrive = barrier(ACTORS);
    const actor = async (i) => {
      await arrive();
      if (i % 2) return createVault({adapter}).unlockWithKey(header, dek).then(() => 'opened', (e) => e.code);
      const local = storage({[MARKER]: '1'});
      const store = await freshStore();
      const outcome = await store.bootVault({adapter: {...adapter, readHeader: async () => { throw new Error('read failed'); }}, realLocal: local, ui: {unlock: async () => 'unlocked'}}).then((r) => (r.vault ? 'attached' : 'plain'), (e) => e.code);
      assert.equal(local.getItem(MARKER), '1');
      return outcome;
    };
    const out = await within(Promise.all(Array.from({length: ACTORS}, (_, i) => actor(i))), 'refusal round ' + round);
    assert.deepEqual(out, out.map((_, i) => (i % 2 ? 'format' : 'header-unreadable')));
    assert.equal(raw(adapter), before);
  }
});
