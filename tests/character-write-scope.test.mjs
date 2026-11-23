// The page's durable write scope for the rich character store (T1290, chat/characters/write-scope.mjs).
//
// Plain path (vault off): a checked compare-and-swap on the page storage. Vault path (vault on): the real encrypted write mode of chat/vault/vault-store.mjs, with
// the vault's own refusals (locked, blocked, held, read-only, no exclusive lease) turned into a refusal BEFORE anything is written.
//
// The concurrency section states its invariants first (the repository's `concurrency` skill):
//   I1 every intended save is acknowledged EXACTLY once (never from a failed or unconfirmed outcome, never twice for one preparation);
//   I2 the stored value is always a whole, readable store; no acknowledged save is missing from it (no lost update);
//   I3 the stored record count and revision equal the number of intended saves (no duplicate, no phantom write);
//   I4 local ids are unique and each acknowledged id carries exactly its own admission id.
// Run 20 times, with parallel actors, injected quota failures and lost replies. The control without the compare-and-swap loses updates, so the invariants can fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createCharacterStore, createMemoryLocks } from '../chat/characters/character-store.mjs';
import { createCharacterWriteScope } from '../chat/characters/write-scope.mjs';
import { withWriteMode } from '../chat/vault/vault-store.mjs';
import { realKvBackend, plainWriteScope, CHARACTER_KEY as KEY } from './helpers/character-write-scope.mjs';

const bundleText = readFileSync(new URL('./fixtures/characters/examples/minimal.bundle.json', import.meta.url), 'utf8');
const turn = () => new Promise((r) => setImmediate(r));

/** A localStorage-contract object with switches for the failures a browser really has. */
function plainStorage() {
  const map = new Map();
  const s = {
    map, sets: 0, mode: 'ok', failNext: 0, hideReadbackNext: 0, rivalOnNextSet: null, ignoreAll: false,
    getItem(k) { if (s.hideReadbackNext > 0 && s.afterSet) { s.hideReadbackNext -= 1; s.afterSet = false; throw new Error('read failed'); } return map.has(k) ? map.get(k) : null; },
    setItem(k, v) {
      s.sets += 1;
      if (s.failNext > 0) { s.failNext -= 1; const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      if (s.ignoreAll) return;
      if (s.rivalOnNextSet !== null) { map.set(k, s.rivalOnNextSet); s.rivalOnNextSet = null; return; }
      map.set(k, String(v)); s.afterSet = true;
    },
    removeItem(k) { map.delete(k); },
  };
  return s;
}
const idleVault = (extra = {}) => ({ active: false, readOnly: false, exclusive: false, blocked: [], held: [], ...extra });
const scopeOf = (storage, vault = idleVault(), over = {}) => createCharacterWriteScope({ storage, vault, withWriteMode, key: KEY, ...over });
const storeOf = (storage, runWriteScope, locks = createMemoryLocks(), extra = {}) => createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, runWriteScope, ...extra });
const prep = async (store) => { const p = await store.prepare({ text: bundleText }); assert.equal(p.ok, true, JSON.stringify(p)); return p.preparation; };
const run = (scope, fn, options) => scope(fn, options);

// ---- plain path: the mode itself -----------------------------------------------------------------------------------------------------------
test('plain: readDurable is a fresh read of the storage, and a committed receipt carries exactly what was sent', async () => {
  const st = plainStorage(); const scope = scopeOf(st);
  await run(scope, async (mode) => {
    assert.deepEqual(await mode.readDurable([KEY]), { [KEY]: null });
    const r = await mode.putKV(KEY, null, 'one', { operationId: 'op1' });
    assert.equal(r.status, 'committed'); assert.equal(r.observed, 'one'); assert.equal(r.operationId, 'op1');
    st.map.set(KEY, 'changed behind the page'); // a value written by someone else is seen at once: no cached copy
    assert.deepEqual(await mode.readDurable([KEY]), { [KEY]: 'changed behind the page' });
  });
});

test('plain: a changed value is not overwritten (unknown, with what is there); the expected value is compared, not assumed', async () => {
  const st = plainStorage(); st.map.set(KEY, 'theirs'); const scope = scopeOf(st);
  await run(scope, async (mode) => {
    const r = await mode.putKV(KEY, 'mine', 'next');
    assert.equal(r.status, 'unknown'); assert.equal(r.observed, 'theirs'); assert.equal(st.sets, 0, 'nothing was written');
    assert.equal((await mode.putKV(KEY, null, 'next')).status, 'unknown', 'expected absence is not a wildcard either');
    assert.equal(st.map.get(KEY), 'theirs');
  });
});

test('plain: a thrown write (quota) is not-written; a write the storage ignores is not-written; another writer winning the race is unknown', async () => {
  const st = plainStorage(); const scope = scopeOf(st);
  await run(scope, async (mode) => {
    st.failNext = 1; const quota = await mode.putKV(KEY, null, 'x');
    assert.equal(quota.status, 'not-written'); assert.equal(quota.reason, 'write-failed'); assert.equal(st.map.has(KEY), false);
    st.ignoreAll = true; const refused = await mode.putKV(KEY, null, 'x');
    assert.equal(refused.status, 'not-written'); assert.equal(refused.reason, 'refused'); st.ignoreAll = false;
    st.rivalOnNextSet = 'rival'; const raced = await mode.putKV(KEY, null, 'x');
    assert.equal(raced.status, 'unknown'); assert.equal(raced.observed, 'rival'); assert.equal(st.map.get(KEY), 'rival', 'the rival value is kept, nothing put back');
  });
});

test('plain: a lost reply (the write landed, the read-back threw) is unknown, never committed and never not-written', async () => {
  const st = plainStorage(); const scope = scopeOf(st);
  await run(scope, async (mode) => {
    st.hideReadbackNext = 1; const r = await mode.putKV(KEY, null, 'landed');
    assert.equal(r.status, 'unknown'); assert.equal(st.map.get(KEY), 'landed');
  });
});

test('plain: a guard that is false refuses before any read or write; a throwing guard counts as false', async () => {
  const st = plainStorage(); const scope = scopeOf(st);
  await run(scope, async (mode) => {
    await assert.rejects(() => mode.readDurable([KEY]), (e) => e.code === 'authority');
    const r = await mode.putKV(KEY, null, 'x'); assert.equal(r.status, 'not-written'); assert.equal(st.sets, 0);
  }, { guard: () => false });
  await run(scope, async (mode) => { assert.equal((await mode.putKV(KEY, null, 'x')).status, 'not-written'); }, { guard: () => { throw new Error('boom'); } });
  assert.equal(st.sets, 0);
});

test('plain: a key the vault has blocked (newer format) or held, or a read-only tab, refuses before the callback runs', async () => {
  for (const [vault, code] of [[idleVault({ blocked: [KEY] }), 'blocked'], [idleVault({ held: [{ key: KEY, reason: 'newer-format' }] }), 'held'], [idleVault({ readOnly: true }), 'read-only']]) {
    const st = plainStorage(); let ran = false;
    await assert.rejects(() => scopeOf(st, vault)(async () => { ran = true; }), (e) => e.code === code);
    assert.equal(ran, false); assert.equal(st.sets, 0);
  }
  // another key's block does not matter
  const st = plainStorage(); let ran = false; await scopeOf(st, idleVault({ blocked: ['plc.other.v1'] }))(async () => { ran = true; }); assert.equal(ran, true);
});

test('plain: a scope refuses to be made without storage or key, and passes the callback result and errors through', async () => {
  assert.throws(() => createCharacterWriteScope({ vault: idleVault(), withWriteMode, key: KEY }), TypeError);
  assert.throws(() => createCharacterWriteScope({ storage: plainStorage(), vault: idleVault(), withWriteMode }), TypeError);
  const scope = scopeOf(plainStorage());
  assert.equal(await scope(async () => 'result'), 'result');
  await assert.rejects(() => scope(async () => { throw new Error('inner'); }), /inner/);
});

// ---- plain path: through the real store ----------------------------------------------------------------------------------------------------
test('plain + store: Save is committed and read back; the same preparation twice is one character', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st)); const p = await prep(store);
  const a = await store.commit(p); assert.equal(a.ok, true, JSON.stringify(a)); assert.equal(a.status, 'admitted');
  const b = await store.commit(p); assert.equal(b.ok, true); assert.equal(b.status, 'already-admitted'); assert.equal(st.sets, 1);
  assert.equal(JSON.parse(st.map.get(KEY)).records.length, 1);
});

test('plain + store: quota is write-failed and leaves the previous value; an ignoring storage is write-refused', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st)); const p = await prep(store);
  st.failNext = 1; const q = await store.commit(p); assert.equal(q.ok, false); assert.equal(q.code, 'write-failed'); assert.equal(st.map.has(KEY), false);
  st.ignoreAll = true; const r = await store.commit(p); assert.equal(r.ok, false); assert.equal(r.code, 'write-refused'); st.ignoreAll = false;
  const ok = await store.commit(p); assert.equal(ok.ok, true, 'the same preparation can still be saved after a refusal');
});

test('plain + store: a rival value is never overwritten; the outcome is unconfirmed, not success', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st)); const p = await prep(store);
  st.rivalOnNextSet = JSON.stringify({ format: 1, revision: 7, records: [] });
  const out = await store.commit(p); assert.equal(out.ok, false); assert.equal(out.unconfirmed, true); assert.match(out.code, /changed|unconfirmed/);
  assert.equal(JSON.parse(st.map.get(KEY)).revision, 7, 'the rival state stands');
});

test('plain + store: blocked key refuses with write-refused and writes nothing', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st, idleVault({ blocked: [KEY] }))); const p = await prep(store);
  const out = await store.commit(p); assert.equal(out.ok, false); assert.equal(out.code, 'write-refused'); assert.equal(st.sets, 0);
});

test('plain + store: abrupt recovery. The write landed and the reply was lost; the retry of the same preparation writes nothing more, and a new page sees one whole store', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st)); const p = await prep(store);
  st.hideReadbackNext = 1;
  const lost = await store.commit(p); assert.equal(lost.ok, false); assert.equal(lost.unconfirmed, true); assert.equal(lost.code, 'unconfirmed');
  assert.equal(JSON.parse(st.map.get(KEY)).records.length, 1, 'it did become durable');
  const retry = await store.commit(p); assert.equal(retry.ok, true); assert.equal(retry.status, 'already-admitted'); assert.equal(st.sets, 1, 'no second write');
  // the page dies here: a fresh page (new store, new scope, same storage) reads one whole record and can change it
  const reborn = storeOf(st, scopeOf(st)); const listed = reborn.list(); assert.equal(listed.ok, true); assert.equal(listed.records.length, 1);
  const again = await reborn.commit(await prep(reborn)); assert.equal(again.ok, true); assert.equal(reborn.list().records.length, 2);
});

test('plain + store: a page that dies before the write (guard moved) leaves the stored value byte for byte', async () => {
  const st = plainStorage(); const store = storeOf(st, scopeOf(st)); await store.commit(await prep(store));
  const before = st.map.get(KEY); const setsBefore = st.sets; const p = await prep(store);
  const out = await store.commit(p, { fence: () => true }); assert.equal(out.ok, false); assert.equal(out.code, 'scope-changed');
  assert.equal(st.map.get(KEY), before); assert.equal(st.sets, setsBefore);
});

// ---- vault path --------------------------------------------------------------------------------------------------------------------------
test('vault: while the vault is on the encrypted write mode is used and the plain storage is never written', async () => {
  const b = await realKvBackend(); const calls = [];
  const spy = (store, options, runIt) => { calls.push(options.feature); return withWriteMode(store, options, runIt); };
  const st = plainStorage();
  const scope = createCharacterWriteScope({ storage: st, vault: b.app, withWriteMode: spy, key: KEY });
  const store = createCharacterStore({ storage: b.mirrorStorage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: scope });
  const out = await store.commit(await prep(store)); assert.equal(out.ok, true, JSON.stringify(out));
  assert.deepEqual(calls, ['plc-characters']); assert.equal(st.sets, 0);
  assert.equal(JSON.parse(await b.replay()).records.length, 1, 'durable in the encrypted log'); assert.equal(await b.coldRaw(), await b.replay());
});

test('vault: the caller guard is composed into the vault authority (a moved fence writes nothing)', async () => {
  const b = await realKvBackend();
  const scope = createCharacterWriteScope({ storage: plainStorage(), vault: b.app, withWriteMode, key: KEY });
  const store = createCharacterStore({ storage: b.mirrorStorage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: scope });
  const p = await prep(store); let moved = false;
  const out = await store.commit(p, { fence: () => moved }); assert.equal(out.ok, true); moved = true;
  const p2 = await prep(store); const refused = await store.commit(p2, { fence: () => moved });
  assert.equal(refused.ok, false); assert.equal(JSON.parse(await b.replay()).records.length, 1);
});

test('vault: blocked, held, read-only and no-exclusive-lease refuse before anything is written; a locked vault refuses too', async () => {
  const cases = [
    ['blocked', async (b) => b.app.setBlocked([KEY])],
    ['held', async (b) => b.app.setHeld([{ key: KEY, reason: 'newer-format' }])],
    ['no-exclusive', async (b) => { b.lease.owned = false; }],
    ['locked', async (b) => { b.session.lock(); }],
  ];
  for (const [name, arrange] of cases) {
    const b = await realKvBackend();
    const scope = createCharacterWriteScope({ storage: plainStorage(), vault: b.app, withWriteMode, key: KEY });
    const store = createCharacterStore({ storage: b.mirrorStorage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: scope });
    const p = await prep(store); const appends = b.control.appends;
    await arrange(b);
    const out = await store.commit(p);
    assert.equal(out.ok, false, name); assert.match(out.code, /write-refused|write-failed|locked/, name + ' ' + JSON.stringify(out));
    assert.equal(b.control.appends, appends, name + ': nothing was appended');
  }
});

test('vault: with a fake vault handle the scope never reaches the plain path when the vault is on', async () => {
  const st = plainStorage(); let used = 0;
  const scope = createCharacterWriteScope({ storage: st, vault: { active: true, exclusive: true, readOnly: false, blocked: [], held: [] }, withWriteMode: async (store, options, runIt) => { used += 1; return runIt({ marker: 'vault-mode' }); }, key: KEY });
  assert.equal(await scope(async (mode) => mode.marker), 'vault-mode'); assert.equal(used, 1); assert.equal(st.sets, 0);
  const noExclusive = createCharacterWriteScope({ storage: st, vault: { active: true, exclusive: false, readOnly: false, blocked: [], held: [] }, withWriteMode, key: KEY });
  await assert.rejects(() => noExclusive(async () => 'x'), (e) => e.code === 'no-exclusive');
  const noWriter = createCharacterWriteScope({ storage: st, vault: { active: true, exclusive: true }, key: KEY });
  await assert.rejects(() => noWriter(async () => 'x'), (e) => e.code === 'no-store');
});

// ---- concurrency: parallel actors, 20 repeats, stated invariants -------------------------------------------------------------------------------------
/** One round: `actors` stores share ONE lock (tabs of one origin) and ONE plain storage; each makes `opsPer` saves in parallel with injected quota failures and lost replies. */
async function plainRound({ actors, opsPer, round, lockPerActor = false, cas = true }) {
  const st = plainStorage(); const shared = createMemoryLocks();
  const scope = cas ? scopeOf(st) : plainWriteScope(st, { cas: false });
  const stores = Array.from({ length: actors }, () => storeOf(st, scope, lockPerActor ? createMemoryLocks() : shared, { waitMs: 30000 }));
  const preps = await Promise.all(stores.flatMap((store) => Array.from({ length: opsPer }, async () => ({ store, preparation: await prep(store) }))));
  // injected faults, deterministic per round: quota failures on some writes and a lost reply on some
  st.failNext = 1 + (round % 3); st.hideReadbackNext = 1 + (round % 2);
  const acked = []; let retries = 0;
  await Promise.all(preps.map(async ({ store, preparation }, i) => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if ((i + attempt + round) % 3 === 0) await turn();
      const out = await store.commit(preparation);
      if (out.ok) { acked.push({ out, admissionId: preparation.admissionId }); return; }
      assert.ok(['write-failed', 'unconfirmed', 'changed', 'busy'].includes(out.code), 'only a retryable failure is expected: ' + JSON.stringify(out)); retries += 1;
    }
    assert.fail('an intended save was never acknowledged');
  }));
  return { st, acked, retries, total: actors * opsPer };
}
function assertInvariants({ st, acked, total }, label) {
  const state = JSON.parse(st.map.get(KEY)); // I2: whole and readable
  assert.equal(acked.length, total, label + ' I1 every intended save acknowledged exactly once');
  assert.equal(new Set(acked.map((a) => a.admissionId)).size, total, label + ' I1 one acknowledgement per preparation');
  assert.equal(state.records.length, total, label + ' I3 no loss, no duplicate'); assert.equal(state.revision, total, label + ' I3 one revision per save');
  assert.equal(new Set(state.records.map((r) => r.individualId)).size, total, label + ' I4 unique ids');
  for (const a of acked) { const rec = state.records.find((r) => r.individualId === a.out.individualId); assert.ok(rec, label + ' I2 an acknowledged save is stored'); assert.deepEqual(rec.admissions, [a.admissionId], label + ' I4'); }
}

test('concurrency: 20 repeats of 6 parallel actors x 2 saves, one lock, quota failures and lost replies: all invariants hold', async () => {
  let retries = 0;
  for (let round = 0; round < 20; round++) { const r = await plainRound({ actors: 6, opsPer: 2, round }); assertInvariants(r, 'round ' + round); retries += r.retries; }
  assert.ok(retries >= 20, 'the injected failures were really exercised (' + retries + ' retries)');
});

test('concurrency: 20 repeats with NO shared lock (every actor its own lock): the compare-and-swap alone loses no acknowledged save', async () => {
  let retries = 0;
  for (let round = 0; round < 20; round++) { const r = await plainRound({ actors: 5, opsPer: 2, round, lockPerActor: true }); assertInvariants(r, 'nolock round ' + round); retries += r.retries; }
  assert.ok(retries >= 20, 'conflicts were really seen and retried (' + retries + ')');
});

test('concurrency control: without the compare-and-swap AND without a shared lock an acknowledged save IS lost (the invariants can fail)', async () => {
  for (let round = 0; round < 20; round++) {
    const st = plainStorage(); const base = plainWriteScope(st, { cas: false });
    // a barrier: both actors read the same base before either writes (the race the compare-and-swap exists to catch)
    let arrived = 0; let open; const gate = new Promise((r) => { open = r; });
    const scope = (fn, options) => base(async (mode) => fn({ ...mode, readDurable: async (k) => { const v = await mode.readDurable(k); arrived += 1; if (arrived >= 2) open(); await gate; return v; }, putKV: (...a) => mode.putKV(...a) }), options);
    const stores = Array.from({ length: 2 }, () => storeOf(st, scope, createMemoryLocks()));
    const preps = await Promise.all(stores.map(async (store) => ({ store, preparation: await prep(store) })));
    const outs = await Promise.all(preps.map(({ store, preparation }) => store.commit(preparation)));
    assert.deepEqual(outs.map((o) => o.ok), [true, true], 'both were acknowledged');
    assert.equal(JSON.parse(st.map.get(KEY)).records.length, 1, 'round ' + round + ': one acknowledged save is missing from the stored value');
  }
  // the same race through the real scope: the compare-and-swap refuses the second writer instead
  const st = plainStorage(); const real = scopeOf(st); let arrived = 0; let open; const gate = new Promise((r) => { open = r; });
  const scope = (fn, options) => real(async (mode) => fn({ ...mode, readDurable: async (k) => { const v = await mode.readDurable(k); arrived += 1; if (arrived >= 2) open(); await gate; return v; } }), options);
  const stores = Array.from({ length: 2 }, () => storeOf(st, scope, createMemoryLocks()));
  const preps = await Promise.all(stores.map(async (store) => ({ store, preparation: await prep(store) })));
  const outs = await Promise.all(preps.map(({ store, preparation }) => store.commit(preparation)));
  assert.equal(outs.filter((o) => o.ok).length, 1, 'exactly one writer wins'); assert.equal(outs.find((o) => !o.ok).code, 'changed');
  assert.equal(JSON.parse(st.map.get(KEY)).records.length, 1);
});

test('concurrency: 20 repeats over the real vault write mode with lost replies and rejected appends keep every invariant', async () => {
  for (let round = 0; round < 20; round++) {
    const b = await realKvBackend(); const locks = createMemoryLocks();
    const scope = createCharacterWriteScope({ storage: plainStorage(), vault: b.app, withWriteMode, key: KEY });
    const stores = Array.from({ length: 4 }, () => createCharacterStore({ storage: b.mirrorStorage, key: KEY, locks, crypto: webcrypto, runWriteScope: scope }));
    const preps = await Promise.all(stores.flatMap((store) => [0, 1].map(async () => ({ store, preparation: await prep(store) }))));
    b.control.rejectNext = 1 + (round % 2); b.control.dropNext = 1 + (round % 3);
    const acked = []; let handled = 0; let recovering = Promise.resolve();
    const recover = () => { recovering = recovering.then(async () => { if (b.control.afterAppend > handled) { handled = b.control.afterAppend; await b.reload(); } }); return recovering; };
    await Promise.all(preps.map(async ({ store, preparation }) => {
      for (let attempt = 0; attempt < 80; attempt++) {
        await recover();
        const out = await store.commit(preparation);
        if (out.ok) { acked.push({ out, admissionId: preparation.admissionId }); return; }
        assert.ok(['unconfirmed', 'changed', 'write-refused', 'unreadable', 'busy', 'write-failed'].includes(out.code), JSON.stringify(out));
      }
      assert.fail('an intended save was never acknowledged');
    }));
    const state = JSON.parse(await b.replay());
    assert.equal(acked.length, 8); assert.equal(state.records.length, 8); assert.equal(state.revision, 8);
    assert.equal(new Set(acked.map((a) => a.out.individualId)).size, 8);
    for (const a of acked) assert.ok(state.records.find((r) => r.individualId === a.out.individualId && r.admissions.length === 1 && r.admissions[0] === a.admissionId));
    assert.equal(await b.coldRaw(), await b.replay());
  }
});
