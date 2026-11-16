import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresetStore, editPresetChange } from '../chat/assistant/preset-store.mjs';
import { createPresetImport } from '../chat/assistant/preset-import.mjs';
import { admitPreset, mergeBackupPresets } from '../chat/assistant/preset-candidate.mjs';
import { memoryStorage } from '../chat/vault/vault-store.mjs';

const KEY = 'plc.presets.v1';
const tick = () => new Promise((r) => setImmediate(r));

/** A Web Locks stand-in: one holder at a time, others wait in order, an aborted wait rejects with AbortError (as the browser does). */
function fakeLocks() {
  const queue = []; let held = false;
  const next = () => { if (held || !queue.length) return; const w = queue.shift(); if (w.aborted) return next(); held = true; w.start(); };
  return {
    get held() { return held; },
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const waiter = { aborted: false, start: async () => { try { resolve(await callback({ name })); } catch (e) { reject(e); } finally { held = false; next(); } } };
        options?.signal?.addEventListener('abort', () => { waiter.aborted = true; const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
        queue.push(waiter); next();
      });
    }
  };
}
const ids = (tag) => { let n = 0; return () => 'preset-' + tag + '-' + (++n); };
const stored = (storage) => JSON.parse(storage.getItem(KEY) || '[]');
const append = (id) => (l) => ({ list: [...l, { id, name: id.toUpperCase(), prompt: 'p' }] });

test('a change reads what is stored now, writes, and checks it by reading back', async () => {
  const storage = memoryStorage(); const store = createPresetStore({ storage, key: KEY, locks: fakeLocks() });
  assert.deepEqual((await store.mutate((l) => ({ list: [...l, { id: 'a', name: 'A', prompt: 'p' }] }))).list.map((p) => p.id), ['a']);
  storage.setItem(KEY, JSON.stringify([{ id: 'x', name: 'X', prompt: 'other tab wrote this' }]));
  const r = await store.mutate((l) => ({ list: [...l, { id: 'b', name: 'B', prompt: 'q' }] }));
  assert.deepEqual(stored(storage).map((p) => p.id), ['x', 'b'], 'the other tab\'s change was not lost');
  assert.equal(r.ok, true);
  const noop = await store.mutate(() => ({ result: 'nothing to do' }));
  assert.equal(noop.result, 'nothing to do'); assert.deepEqual(stored(storage).map((p) => p.id), ['x', 'b'], 'no write when the change makes no list');
});

test('stored text that is not a list, a storage that cannot be read, a read-only tab and a refused write change nothing', async () => {
  const bad = memoryStorage({ [KEY]: '{"not":"a list"' }); const store = createPresetStore({ storage: bad, key: KEY, locks: fakeLocks() });
  const r = await store.mutate(append('a'));
  assert.equal(r.ok, false); assert.equal(r.code, 'malformed'); assert.equal(bad.getItem(KEY), '{"not":"a list"', 'the malformed text is left exactly as it was');
  assert.equal(store.read().code, 'malformed'); assert.equal(store.ready().code, 'malformed');
  const object = memoryStorage({ [KEY]: '{"a":1}' }); assert.equal(createPresetStore({ storage: object, key: KEY, locks: fakeLocks() }).read().code, 'malformed', 'valid JSON that is not a list is malformed too');
  const denied = memoryStorage({ [KEY]: '[]' }); denied.getItem = () => { throw new DOMException('denied', 'SecurityError'); }; const writes = []; denied.setItem = (...a) => writes.push(a);
  const deniedStore = createPresetStore({ storage: denied, key: KEY, locks: fakeLocks() });
  assert.equal(deniedStore.read().code, 'unreadable'); assert.equal((await deniedStore.mutate(append('a'))).code, 'unreadable'); assert.deepEqual(writes, [], 'nothing was written to a store that could not be read');
  const ro = memoryStorage({ [KEY]: '[]' }); const roStore = createPresetStore({ storage: ro, key: KEY, locks: fakeLocks(), isReadOnly: () => true });
  assert.equal((await roStore.mutate(append('z'))).code, 'read-only'); assert.equal(ro.getItem(KEY), '[]'); assert.equal(roStore.ready().code, 'read-only');
  const full = memoryStorage({ [KEY]: '[{"id":"a","name":"A","prompt":"p"}]' }); const before = full.getItem(KEY);
  const set = full.setItem; full.setItem = () => { throw new Error('QuotaExceededError'); };
  const q = await createPresetStore({ storage: full, key: KEY, locks: fakeLocks() }).mutate(append('b'));
  full.setItem = set; assert.equal(q.code, 'write-failed'); assert.equal(full.getItem(KEY), before, 'a full disk leaves the old list');
  const silent = memoryStorage({ [KEY]: '[]' }); silent.setItem = () => {}; // a storage that accepts and drops the write
  assert.equal((await createPresetStore({ storage: silent, key: KEY, locks: fakeLocks() }).mutate(append('z'))).code, 'changed', 'the read-back catches a write that did not happen');
});

test('NO Web Locks: nothing is written, whatever the change; reading and ready() say why', async () => {
  const storage = memoryStorage({ [KEY]: '[{"id":"a","name":"A","prompt":"p"}]' }); const before = storage.getItem(KEY);
  const writes = []; const set = storage.setItem; storage.setItem = (...a) => { writes.push(a); return set.apply(storage, a); };
  for (const locks of [undefined, null, {}, { request: undefined }]) {
    const store = createPresetStore({ storage, key: KEY, locks });
    let called = 0;
    const r = await store.mutate((l) => { called++; return { list: [...l, { id: 'b', name: 'B', prompt: 'q' }] }; });
    assert.equal(r.ok, false); assert.equal(r.code, 'unsupported'); assert.match(r.message, /Web Locks/); assert.equal(called, 0, 'the change is never even attempted');
    assert.equal(store.ready().code, 'unsupported');
    assert.deepEqual(store.read().list.map((p) => p.id), ['a'], 'saved presets can still be read and used');
  }
  assert.deepEqual(writes, []); assert.equal(storage.getItem(KEY), before);
});

test('there is NO rollback: a write that cannot be confirmed leaves whatever is stored, so a newer write by someone else is never erased', async () => {
  const storage = memoryStorage({ [KEY]: '[{"id":"a","name":"A","prompt":"p"}]' });
  const set = storage.setItem; const newer = [{ id: 'a', name: 'A', prompt: 'p' }, { id: 'other', name: 'Other tab', prompt: 'written outside the lock by another writer' }];
  // a writer that does not take the lock (an older copy of the app in another tab) writes right after ours
  storage.setItem = (k, v) => { set.call(storage, k, v); storage.setItem = set; set.call(storage, k, JSON.stringify(newer)); };
  const r = await createPresetStore({ storage, key: KEY, locks: fakeLocks() }).mutate(append('mine'));
  assert.equal(r.ok, false); assert.equal(r.code, 'changed'); assert.match(r.message, /changed while/);
  assert.deepEqual(stored(storage), newer, 'the other writer\'s newer, successful write is still there: nothing was put back');
});

// An exception inside the change, with an in-memory lock stand-in: this is NOT a process death (that is tests/preset-crash.test.mjs, which SIGKILLs a writer process).
test('a change that throws releases the lock, writes nothing, and the next change proceeds (exception while holding the lock)', async () => {
  const storage = memoryStorage({ [KEY]: '[{"id":"a","name":"A","prompt":"p"}]' }); const locks = fakeLocks(); const store = createPresetStore({ storage, key: KEY, locks });
  const before = storage.getItem(KEY);
  const crashed = await store.mutate(() => { throw new Error('tab died'); });
  assert.equal(crashed.ok, false); assert.equal(locks.held, false, 'the lock is free again'); assert.equal(storage.getItem(KEY), before);
  assert.equal((await store.mutate(append('b'))).ok, true);
});

test('a lock that is never released ends in "busy" inside the wait, not a hang (no deadlock)', async () => {
  const storage = memoryStorage({ [KEY]: '[]' }); const locks = fakeLocks();
  const hold = locks.request('plc-presets', {}, () => new Promise(() => {})); hold.catch(() => {});
  const store = createPresetStore({ storage, key: KEY, locks, waitMs: 50 });
  const started = Date.now(); const r = await store.mutate(append('z'));
  assert.equal(r.code, 'busy'); assert.ok(Date.now() - started < 2000); assert.equal(storage.getItem(KEY), '[]');
});

// ---- the review box against a store that cannot be used (the reproduced crash: "store.read.list is not iterable") ---------------------------------------------------------------
function fakeHost(store, { builtins = [] } = {}) {
  const el = (tag, className, text) => ({ tag, className, textContent: text || '', value: '', children: [], attrs: {}, listeners: {}, style: {}, append(...c) { this.children.push(...c); }, appendChild(c) { this.children.push(c); },
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, addEventListener(t, f) { this.listeners[t] = f; }, focus() {}, remove() {} });
  const seen = { toasts: [], alerts: [], added: [], dialogs: [] };
  const primary = { textContent: 'Add preset', disabled: false, setAttribute() {}, removeAttribute() {} };
  const openAppDialog = ({ title, content, actions }) => {
    const handle = { title, content, closed: false, close() { this.closed = true; }, root: { querySelector: () => primary }, add: () => actions[1].run(handle, primary) };
    seen.dialogs.push(handle); return handle;
  };
  const host = { el, openAppDialog, showToast: (t) => seen.toasts.push(t), store, builtins: () => builtins, generateId: ids('imp'), onAdded: (p, l) => seen.added.push([p, l]), alert: async (t, m) => { seen.alerts.push([t, m]); } };
  return { host, seen, primary };
}
const status = (seen) => seen.dialogs.at(-1).content.children.find((c) => c.className === 'preset-review-status').textContent;
const candidate = { ok: true, candidate: { sourceId: 'x', name: 'Emma', prompt: 'You are Emma.' } };

test('the review box with unreadable saved presets explains, disables adding, and never touches the stored bytes (no crash)', async () => {
  for (const [label, make, pattern] of [
    ['malformed', () => memoryStorage({ [KEY]: '{"broken": ' }), /not in a form this version can read/],
    ['not a list', () => memoryStorage({ [KEY]: '{"a":1}' }), /not in a form this version can read/],
    ['read error', () => { const s = memoryStorage({ [KEY]: '[]' }); s.getItem = () => { throw new DOMException('denied', 'SecurityError'); }; return s; }, /could not be read/]]) {
    const storage = make(); const writes = []; const set = storage.setItem; storage.setItem = (...a) => { writes.push(a); return set.apply(storage, a); };
    const raw = (() => { try { return storage.getItem(KEY); } catch { return 'unreadable'; } })();
    const { host, seen, primary } = fakeHost(createPresetStore({ storage, key: KEY, locks: fakeLocks() }));
    await createPresetImport(host).reviewResult(candidate, 'file'); // used to throw "store.read.list is not iterable"
    assert.equal(seen.dialogs.length, 1, label + ': the review still opens so the person can read the instructions');
    assert.match(status(seen), pattern, label); assert.equal(primary.disabled, true, label + ': adding is disabled');
    await seen.dialogs[0].add(); // even a click that gets through (Enter) adds nothing
    assert.deepEqual(writes, [], label + ': nothing was written'); assert.deepEqual(seen.added, []);
    assert.equal(raw === 'unreadable' ? raw : storage.getItem(KEY), raw, label + ': the stored bytes are unchanged');
  }
});

test('the review box without Web Locks and in a read-only tab: reason shown, adding disabled, nothing written', async () => {
  for (const [label, store, pattern] of [
    ['no Web Locks', createPresetStore({ storage: memoryStorage({ [KEY]: '[]' }), key: KEY, locks: undefined }), /Web Locks/],
    ['read-only tab', createPresetStore({ storage: memoryStorage({ [KEY]: '[]' }), key: KEY, locks: fakeLocks(), isReadOnly: () => true }), /open in another tab/]]) {
    const { host, seen, primary } = fakeHost(store);
    await createPresetImport(host).reviewResult(candidate, 'link');
    assert.match(status(seen), pattern, label); assert.equal(primary.disabled, true, label);
    await seen.dialogs[0].add(); assert.deepEqual(seen.added, [], label); assert.equal(store.read().list.length, 0, label);
  }
});

test('the review box asks the store again at the click: a store that stops being usable after opening adds nothing', async () => {
  const storage = memoryStorage({ [KEY]: '[]' });
  const { host, seen, primary } = fakeHost(createPresetStore({ storage, key: KEY, locks: fakeLocks() }));
  await createPresetImport(host).reviewResult(candidate, 'file');
  assert.equal(primary.disabled, false, 'usable when opened'); assert.equal(storage.getItem(KEY), '[]');
  storage.setItem(KEY, '{"became": "malformed"'); const bytes = storage.getItem(KEY);
  await seen.dialogs[0].add();
  assert.equal(storage.getItem(KEY), bytes, 'nothing overwrote what the store became'); assert.equal(seen.added.length, 0); assert.match(status(seen), /not in a form this version can read/); assert.equal(primary.disabled, true);
});

test('a collision that appears after the person last looked is shown and asked about: the click is never counted as "keep separate" (found by the two-tabs Add race)', async () => {
  const storage = memoryStorage({ [KEY]: '[]' });
  const { host, seen, primary } = fakeHost(createPresetStore({ storage, key: KEY, locks: fakeLocks() }));
  await createPresetImport(host).reviewResult(candidate, 'file');
  assert.equal(primary.textContent, 'Add preset');
  storage.setItem(KEY, JSON.stringify([{ id: 'other-tab', name: 'Emma', prompt: 'You are Emma.' }])); // another tab added the same preset while this box was open
  await seen.dialogs[0].add();
  assert.deepEqual(stored(storage).map((p) => p.id), ['other-tab'], 'the first click added nothing');
  assert.equal(primary.textContent, 'Keep as a separate preset'); assert.match(status(seen), /already have a preset/); assert.equal(seen.added.length, 0);
  await seen.dialogs[0].add(); // now the person has seen the question and answers it
  assert.deepEqual(stored(storage).map((p) => p.id), ['other-tab', 'preset-imp-1']); assert.equal(seen.added.length, 1);
});

test('the review box adds one fresh preset when the store is usable, from the store\'s list read just now', async () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify([{ id: 'preset-own', name: 'Mine', prompt: 'm' }]) });
  const { host, seen } = fakeHost(createPresetStore({ storage, key: KEY, locks: fakeLocks() }));
  await createPresetImport(host).reviewResult(candidate, 'file');
  await seen.dialogs[0].add();
  assert.deepEqual(stored(storage).map((p) => [p.id, p.name]), [['preset-own', 'Mine'], ['preset-imp-1', 'Emma']]);
  assert.equal(seen.added.length, 1); assert.equal(seen.dialogs[0].closed, true); assert.equal(seen.alerts.length, 0);
  await createPresetImport(host).reviewResult({ ok: false, message: 'Refused plainly.' }, 'file'); assert.deepEqual(seen.alerts, [['Preset not added', 'Refused plainly.']]);
});

// ---- parallel actors: imports, manual changes and backup restores against one stored record ----------------------------------------------------------------------------------
// Actors are released together and interleave at every await. 8 workers x 20 repeats. Invariants: no lost update, no duplicate id, no silent replacement, the stored text always parses,
// a conflicting name is reported to its actor (never silently added or dropped), and everything finishes.
const WORKERS = 8, REPEATS = 20;

async function importAs(store, n, name, prompt, keepSeparate) {
  return store.mutate((list) => {
    const admitted = admitPreset(list, { name, prompt }, { makeId: ids('imp' + n), keepSeparate });
    return admitted.ok ? { list: admitted.list, result: admitted } : { result: admitted };
  });
}

test('parallel imports, manual saves, edits, deletes and backup restores never lose an update (8 workers x 20 repeats)', async () => {
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const seed = [{ id: 'seed-edit', name: 'Edit me', prompt: 'v0' }, { id: 'seed-del', name: 'Delete me', prompt: 'gone' }, { id: 'seed-keep', name: 'Keep', prompt: 'k' }];
    const storage = memoryStorage({ [KEY]: JSON.stringify(seed) }); const locks = fakeLocks();
    const actors = Array.from({ length: WORKERS }, () => createPresetStore({ storage, key: KEY, locks })); // each "tab" has its own store over the one storage
    let go; const barrier = new Promise((r) => { go = r; });
    const jobs = [];
    for (let i = 0; i < WORKERS; i++) {
      jobs.push((async () => { await barrier; await tick(); return { kind: 'import', n: i, out: await importAs(actors[i], i, 'Imported ' + i, 'text ' + i, false) }; })());
    }
    jobs.push((async () => { await barrier; return { kind: 'save', out: await actors[0].mutate((l) => ({ list: [...l, { id: 'manual-1', name: 'Manual', prompt: 'm' }] })) }; })());
    jobs.push((async () => { await barrier; return { kind: 'edit', out: await actors[1].mutate(editPresetChange(seed[0], 'v1')) }; })());
    jobs.push((async () => { await barrier; return { kind: 'delete', out: await actors[2].mutate((l) => ({ list: l.filter((p) => p.id !== 'seed-del') })) }; })());
    jobs.push((async () => { await barrier; return { kind: 'restore', out: await actors[5].mutate((l) => { const m = mergeBackupPresets(l, [{ name: 'Restored 1', prompt: 'r1' }, { name: 'Keep', prompt: 'never replaces' }, { name: 'Restored 2', prompt: 'r2' }], ids('res')); return { list: m.list, result: m.added }; }) }; })());
    // two actors import the very same name at once: exactly one wins, the other is told of the conflict
    jobs.push((async () => { await barrier; return { kind: 'same-a', out: await importAs(actors[3], 'a', 'Twin', 'a', false) }; })());
    jobs.push((async () => { await barrier; return { kind: 'same-b', out: await importAs(actors[4], 'b', 'Twin', 'b', false) }; })());
    go();
    const results = await Promise.race([Promise.all(jobs), new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock: actors did not finish')), 10000).unref())]);
    const final = stored(storage); // parses: no corruption
    const idsList = final.map((p) => p.id);
    assert.equal(new Set(idsList).size, idsList.length, 'no duplicate ids (repeat ' + repeat + ')');
    for (const r of results) assert.equal(r.out.ok, true, r.kind + ' ran');
    for (let i = 0; i < WORKERS; i++) assert.ok(final.some((p) => p.name === 'Imported ' + i && p.prompt === 'text ' + i), 'import ' + i + ' survived (repeat ' + repeat + ')');
    assert.ok(final.some((p) => p.id === 'manual-1'), 'the manual save survived');
    assert.equal(final.find((p) => p.id === 'seed-edit').prompt, 'v1', 'the manual edit survived'); assert.ok(!final.some((p) => p.id === 'seed-del'), 'the delete held'); assert.equal(final.find((p) => p.id === 'seed-keep').prompt, 'k', 'the restore replaced nothing');
    assert.ok(final.some((p) => p.name === 'Restored 1') && final.some((p) => p.name === 'Restored 2'), 'the restore survived');
    const twins = final.filter((p) => p.name === 'Twin'); assert.equal(twins.length, 1, 'one winner for a name two actors imported at once');
    const [a, b] = [results.find((r) => r.kind === 'same-a').out.result, results.find((r) => r.kind === 'same-b').out.result];
    assert.equal([a, b].filter((x) => x.ok).length, 1); assert.equal([a, b].filter((x) => !x.ok && x.code === 'conflict').length, 1, 'the loser is told, not silently dropped');
    assert.equal(final.length, seed.length - 1 + WORKERS + 1 + 2 + 1, 'the total is exactly what was meant to be written (repeat ' + repeat + ')');
    assert.equal(locks.held, false);
  }
});

// ---- two editors of one record: the stale one is told and stores nothing (the reproduced item: both reported success and the second erased the first) -----------------------------
// Invariants: exactly one editor is 'saved' and its text is what is stored; every other editor gets 'stale' with the newer record and writes nothing (zero setItem calls from it);
// nothing else in the list changes; a retry from the newer record is saved; a removed preset is reported 'gone'; everything finishes.
test('competing edits of one record: one committed, the others stale and storing nothing (8 editors x 20 repeats, barrier-released, with a manual save beside them)', async () => {
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const rec = { id: 'seed-edit', name: 'Edit me', prompt: 'v0' }; const other = { id: 'other', name: 'Other', prompt: 'o' };
    const storage = memoryStorage({ [KEY]: JSON.stringify([other, rec]) }); const locks = fakeLocks();
    const writers = []; const set = storage.setItem; storage.setItem = (k, v) => { writers.push(v); return set.call(storage, k, v); };
    const editors = Array.from({ length: WORKERS }, () => createPresetStore({ storage, key: KEY, locks })); // every editor opened its dialog on rec (prompt v0)
    let go; const barrier = new Promise((r) => { go = r; });
    const jobs = editors.map((store, i) => (async () => { await barrier; if (i % 2) await tick(); return { i, out: await store.mutate(editPresetChange(rec, 'edit ' + i)) }; })());
    const neighbour = (async () => { await barrier; return editors[0].mutate(append('manual')); })();
    go();
    const results = await Promise.race([Promise.all([...jobs, neighbour]), new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock: editors did not finish')), 10000).unref())]);
    const edits = results.slice(0, WORKERS);
    for (const r of edits) assert.equal(r.out.ok, true, 'the store call itself finished');
    const saved = edits.filter((r) => r.out.result.status === 'saved'), stale = edits.filter((r) => r.out.result.status === 'stale');
    assert.equal(saved.length, 1, 'exactly one edit committed (repeat ' + repeat + ')'); assert.equal(stale.length, WORKERS - 1, 'every other editor was told it is stale');
    const final = stored(storage); const winnerText = 'edit ' + saved[0].i;
    assert.equal(final.find((p) => p.id === 'seed-edit').prompt, winnerText, 'the committed edit survives, no later submit erased it');
    for (const r of stale) assert.equal(r.out.result.current.prompt, winnerText, 'the stale editor is handed the newer record');
    assert.deepEqual(final.find((p) => p.id === 'other'), other); assert.ok(final.some((p) => p.id === 'manual'), 'the neighbouring save was not lost');
    assert.equal(writers.length, 2, 'only two writes happened (the winning edit and the manual save): a stale editor writes nothing');
    // retry from the newer record, using the refused text: now it is the newer record's turn
    const retry = await editors[stale[0].i].mutate(editPresetChange(stale[0].out.result.current, 'edit ' + stale[0].i));
    assert.equal(retry.result.status, 'saved'); assert.equal(stored(storage).find((p) => p.id === 'seed-edit').prompt, 'edit ' + stale[0].i);
    assert.equal(locks.held, false);
  }
});

test('a stale edit changes no stored byte, also when the other writer changed only the name, and a removed preset is reported gone', async () => {
  const rec = { id: 'a', name: 'Alpha', prompt: 'v0' };
  for (const [label, newer, status] of [
    ['prompt changed', { ...rec, prompt: 'v1' }, 'stale'], ['name changed', { ...rec, name: 'Alpha 2' }, 'stale'], ['unchanged', rec, 'saved'], ['removed', null, 'gone']]) {
    const storage = memoryStorage({ [KEY]: JSON.stringify(newer ? [newer] : []) }); const before = storage.getItem(KEY);
    const r = await createPresetStore({ storage, key: KEY, locks: fakeLocks() }).mutate(editPresetChange(rec, 'mine'));
    assert.equal(r.ok, true, label); assert.equal(r.result.status, status, label);
    if (status !== 'saved') assert.equal(storage.getItem(KEY), before, label + ': the stored bytes are exactly as they were');
    else assert.equal(stored(storage)[0].prompt, 'mine');
  }
});

test('a failed save of an edit leaves the original record and the proposal can be tried again', async () => {
  const rec = { id: 'a', name: 'Alpha', prompt: 'v0' }; const storage = memoryStorage({ [KEY]: JSON.stringify([rec]) }); const before = storage.getItem(KEY);
  const store = createPresetStore({ storage, key: KEY, locks: fakeLocks() }); const set = storage.setItem; storage.setItem = () => { throw new Error('QuotaExceededError'); };
  const failed = await store.mutate(editPresetChange(rec, 'mine')); assert.equal(failed.ok, false); assert.equal(failed.code, 'write-failed'); assert.equal(storage.getItem(KEY), before, 'the original is untouched');
  storage.setItem = set; const again = await store.mutate(editPresetChange(rec, 'mine')); assert.equal(again.result.status, 'saved'); assert.equal(stored(storage)[0].prompt, 'mine');
});

test('control: the earlier pattern (a list read once at start and written whole) DOES lose updates under the same schedule', async () => {
  let lost = 0;
  for (let repeat = 0; repeat < REPEATS; repeat++) {
    const storage = memoryStorage({ [KEY]: '[]' });
    const tabs = Array.from({ length: 4 }, () => JSON.parse(storage.getItem(KEY))); // each tab's in-memory list, read at start
    await Promise.all(tabs.map(async (list, i) => { await tick(); list.push({ id: 'p' + i, name: 'P' + i, prompt: 'x' }); storage.setItem(KEY, JSON.stringify(list)); }));
    if (stored(storage).length < 4) lost++;
  }
  assert.equal(lost, REPEATS, 'the old pattern loses updates every time, so the test above would notice it');
});

test('cancel and repeat: nothing is written until an explicit admit, and repeating the same input needs the explicit answer again', async () => {
  const storage = memoryStorage(); const store = createPresetStore({ storage, key: KEY, locks: fakeLocks() });
  assert.equal(storage.getItem(KEY), null, 'reading and reviewing write nothing');
  const first = await importAs(store, 1, 'Emma', 'You are Emma.', false); assert.equal(first.result.ok, true);
  const again = await importAs(store, 2, 'Emma', 'You are Emma.', false);
  assert.equal(again.ok, true); assert.equal(again.result.ok, false); assert.equal(again.result.conflicts.identical, true); assert.equal(stored(storage).length, 1, 'no silent second copy');
  const kept = await importAs(store, 3, 'Emma', 'You are Emma.', true); assert.equal(kept.result.ok, true); assert.deepEqual(stored(storage).map((p) => p.id), ['preset-imp1-1', 'preset-imp3-1']);
});
