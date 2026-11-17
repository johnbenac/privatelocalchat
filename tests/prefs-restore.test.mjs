import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeBackupPrefs } from '../chat/transfer/prefs-restore.mjs';
import { createPrefsStore } from '../chat/assistant/prefs-store.mjs';
import { createBackups } from '../chat/transfer/backups.mjs';
import { memoryStorage } from '../chat/vault/vault-store.mjs';

const KEY = 'plc.prefs.v1';
function fakeLocks() { // first in, first out, one holder at a time, like Web Locks (no abort needed: these are always granted)
  const queue = []; let held = false;
  const next = () => { if (held || !queue.length) return; const w = queue.shift(); held = true; w.start(); };
  return { request: (name, options, cb) => new Promise((resolve, reject) => { queue.push({ start: async () => { try { resolve(await cb({ name })); } catch (e) { reject(e); } finally { held = false; next(); } } }); next(); }) };
}
const neverGranted = { request: (name, options) => new Promise((resolve, reject) => options.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); })) };
const all = { instructions: 'be brief', enterSends: false, voiceURI: 'voice-1', speechRate: 1.2 };
const seed = (o) => memoryStorage({ [KEY]: JSON.stringify(o) });
const stored = (s) => JSON.parse(s.getItem(KEY));
function make({ initial, live, locks = fakeLocks(), isReadOnly, waitMs } = {}) {
  const storage = initial === undefined ? memoryStorage() : seed(initial);
  const lv = live ?? { enterSends: null, ...(initial || {}) }; const log = { conflicts: [], refused: [], changed: [] };
  const store = createPrefsStore({ storage, key: KEY, live: lv, locks, isReadOnly, waitMs, onConflict: (c) => log.conflicts.push(c), onRefused: (o) => log.refused.push(o.code), onLiveChanged: (f) => log.changed.push(f) });
  return { storage, live: lv, store, log };
}

test('merge: an unset target takes every valid included value, false included', () => {
  const r = mergeBackupPrefs({ enterSends: null }, all);
  assert.deepEqual(r.prefs, all); assert.deepEqual(r.added.sort(), ['enterSends', 'instructions', 'speechRate', 'voiceURI']);
  assert.equal(mergeBackupPrefs({}, { enterSends: false }).prefs.enterSends, false, 'false is a value, not "missing"');
  assert.equal(mergeBackupPrefs({ enterSends: undefined }, { enterSends: true }).prefs.enterSends, true);
});

test('merge: what the person already chose here is kept, true or false, and reported as kept', () => {
  const mine = { instructions: 'mine', enterSends: true, voiceURI: 'mine-voice', speechRate: 0.7 };
  const r = mergeBackupPrefs(mine, all); assert.deepEqual(r.prefs, mine); assert.deepEqual(r.added, []); assert.deepEqual(r.kept.sort(), ['enterSends', 'instructions', 'speechRate', 'voiceURI']);
  assert.equal(mergeBackupPrefs({ enterSends: false }, { enterSends: true }).prefs.enterSends, false, 'an explicit false here beats the backup’s true');
});

test('merge: missing, null and older-backup fields add nothing and break nothing', () => {
  for (const incoming of [undefined, null, {}, { instructions: '' }, { enterSends: null }, [], 'x', 5, { instructions: 'only this' }]) {
    const r = mergeBackupPrefs({ enterSends: null, lastExportAt: 1 }, incoming);
    assert.equal(r.prefs.lastExportAt, 1); assert.equal(r.prefs.enterSends, null);
  }
  assert.deepEqual(mergeBackupPrefs({}, { instructions: 'only this' }).prefs, { instructions: 'only this' }, 'an older backup (instructions only) behaves as before');
});

test('merge: wrong types and out-of-range speeds are skipped, never coerced; valid text is kept EXACTLY (no invented length limit)', () => {
  assert.deepEqual(mergeBackupPrefs({}, { instructions: 5, enterSends: 'false', voiceURI: '   ', speechRate: '1.2' }), { prefs: {}, added: [], kept: [] });
  for (const speechRate of [0, 0.59, 1.61, NaN, Infinity, -1, null, true]) assert.equal('speechRate' in mergeBackupPrefs({}, { speechRate }).prefs, false, String(speechRate));
  for (const enterSends of [0, 1, 'true', {}, []]) assert.equal('enterSends' in mergeBackupPrefs({}, { enterSends }).prefs, false);
  const longVoice = 'urn:voice:' + 'v'.repeat(900), longInstr = 'y'.repeat(4000), odd = ' Microsoft Zira – English (US) ';
  assert.equal(mergeBackupPrefs({}, { voiceURI: longVoice }).prefs.voiceURI, longVoice, 'a long opaque voice id is kept as exported');
  assert.equal(mergeBackupPrefs({}, { instructions: longInstr }).prefs.instructions, longInstr);
  assert.equal(mergeBackupPrefs({}, { voiceURI: odd }).prefs.voiceURI, odd, 'not trimmed or rewritten');
  for (const speechRate of [0.6, 1, 1.6]) assert.equal(mergeBackupPrefs({}, { speechRate }).prefs.speechRate, speechRate);
  assert.equal(mergeBackupPrefs({}, { callSounds: true, __proto__: { enterSends: true } }).prefs.callSounds, undefined, 'only the four included fields are ever read');
});

test('merge never changes its inputs', () => { mergeBackupPrefs(Object.freeze({ enterSends: null }), Object.freeze({ ...all })); });

test('restore reads the stored preferences afresh (a stale tab does not erase another tab’s choice) and levels this tab', async () => {
  const { storage, live, store } = make({ initial: { voiceURI: 'chosen-elsewhere', lastExportAt: 9, unknownNew: { a: 1 } }, live: {} });
  const r = await store.restore(all);
  assert.equal(r.ok, true); assert.deepEqual(r.added.sort(), ['enterSends', 'instructions', 'speechRate']); assert.deepEqual(r.kept, ['voiceURI']);
  const s = stored(storage);
  assert.deepEqual(s, { voiceURI: 'chosen-elsewhere', lastExportAt: 9, unknownNew: { a: 1 }, instructions: 'be brief', enterSends: false, speechRate: 1.2 });
  assert.deepEqual(live, s, 'this tab’s copy now matches what is stored');
});

test('restore twice adds nothing the second time (idempotent) and does not write', async () => {
  const { storage, store } = make({});
  assert.equal((await store.restore(all)).added.length, 4);
  let writes = 0; const set = storage.setItem.bind(storage); storage.setItem = (...a) => { writes++; return set(...a); };
  assert.deepEqual((await store.restore(all)).added, []); assert.equal(writes, 0);
});

// ---- parent finding 1: no lock and a lock never granted write NOTHING and change NOTHING live ----
test('REGRESSION no lock: restoring enterSends=false while another tab holds instructions is REFUSED; storage and live are untouched', async () => {
  const before = { instructions: 'other tab instructions' };
  const { storage, live, store } = make({ initial: before, live: { enterSends: null }, locks: null });
  const text = storage.getItem(KEY);
  const r = await store.restore({ enterSends: false });
  assert.equal(r.ok, false); assert.equal(r.code, 'unsupported');
  assert.equal(storage.getItem(KEY), text, 'storage byte-identical'); assert.deepEqual(live, { enterSends: null }, 'live state untouched');
});

test('REGRESSION lock never granted (aborted at 5 ms): REFUSED busy; storage and live are untouched', async () => {
  const { storage, live, store } = make({ initial: { instructions: 'other tab instructions' }, live: { enterSends: null }, locks: neverGranted, waitMs: 5 });
  const text = storage.getItem(KEY);
  const r = await store.restore({ enterSends: false });
  assert.equal(r.ok, false); assert.equal(r.code, 'busy');
  assert.equal(storage.getItem(KEY), text); assert.deepEqual(live, { enterSends: null });
});

test('a tab that holds the storage read-only neither restores nor saves', async () => {
  const { storage, live, store } = make({ initial: { instructions: 'x' }, isReadOnly: () => true });
  const text = storage.getItem(KEY);
  assert.equal((await store.restore(all)).code, 'read-only');
  live.callSounds = true; assert.equal((await store.save()).code, 'read-only');
  assert.equal(storage.getItem(KEY), text); assert.equal('callSounds' in live, false, 'the unsaved change is put back');
});

// ---- parent finding 2: the manual savePrefs writer joins the same coordination ----
test('manual save writes only the changed field: another tab’s different field survives, and so does a field this build does not know', async () => {
  const a = make({ initial: { instructions: 'mine', unknownNew: { a: 1 } } });
  const live2 = { enterSends: null, instructions: 'mine', unknownNew: { a: 1 } }; // a second tab read the same start
  const b = createPrefsStore({ storage: a.storage, key: KEY, live: live2, locks: fakeLocks() });
  a.live.callSounds = true; assert.equal((await a.store.save()).ok, true);
  live2.enterSends = false; live2.speechRate = 1.3; const r = await b.save();
  assert.deepEqual(r.applied.sort(), ['enterSends', 'speechRate']); assert.deepEqual(r.conflicts, []);
  assert.deepEqual(stored(a.storage), { instructions: 'mine', unknownNew: { a: 1 }, callSounds: true, enterSends: false, speechRate: 1.3 }, 'whole-object overwrite would have erased callSounds');
  assert.equal(live2.callSounds, true, 'the second tab learns the other tab’s field when it saves');
});

test('manual vs restore on DIFFERENT fields: both survive in either order', async () => {
  for (const order of ['restore-first', 'manual-first']) {
    const { storage, live, store } = make({ initial: { instructions: 'mine' } });
    live.callSounds = true;
    const jobs = order === 'restore-first' ? [store.restore({ voiceURI: 'v', enterSends: false }), store.save()] : [store.save(), store.restore({ voiceURI: 'v', enterSends: false })];
    const [x, y] = await Promise.all(jobs); assert.ok(x.ok && y.ok);
    assert.deepEqual(stored(storage), { instructions: 'mine', callSounds: true, voiceURI: 'v', enterSends: false }, order);
  }
});

test('manual vs restore on the SAME field: the restore never overrides a choice; a stale manual change is reported, not written over a newer value', async () => {
  const staleManual = make({ initial: {} }); // this tab thinks enterSends is not chosen
  const other = createPrefsStore({ storage: staleManual.storage, key: KEY, live: { enterSends: null }, locks: fakeLocks() });
  const r = await other.restore({ enterSends: false }); assert.deepEqual(r.added, ['enterSends']);
  staleManual.live.enterSends = true; // the person toggles in the stale tab
  const s = await staleManual.store.save();
  assert.equal(s.ok, true); assert.deepEqual(s.conflicts, [{ field: 'enterSends', kept: false, wanted: true }]);
  assert.equal(stored(staleManual.storage).enterSends, false, 'stored value kept, not silently overwritten');
  assert.equal(staleManual.live.enterSends, false, 'the stale tab shows the kept value'); assert.equal(staleManual.log.conflicts.length, 1);
  assert.ok(staleManual.log.changed.some((f) => f.includes('enterSends')), 'the page is told to redraw the Enter hint');
  // and when the person's manual choice was first, the restore keeps it
  const first = make({ initial: {} }); first.live.enterSends = true; await first.store.save();
  const late = await first.store.restore({ enterSends: false }); assert.deepEqual(late.added, []); assert.deepEqual(late.kept, ['enterSends']); assert.equal(stored(first.storage).enterSends, true);
});

test('two stale tabs changing the same field: one winner, one reported conflict', async () => {
  const storage = seed({ lastExportAt: 1 });
  const tab = () => { const live = { enterSends: null, lastExportAt: 1 }; return { live, store: createPrefsStore({ storage, key: KEY, live, locks: fakeLocks() }) }; };
  const one = tab(), two = tab(); one.live.lastExportAt = 100; two.live.lastExportAt = 200;
  const [a, b] = await Promise.all([one.store.save(), two.store.save()]);
  assert.deepEqual(a.conflicts, []); assert.deepEqual(b.conflicts, [{ field: 'lastExportAt', kept: 100, wanted: 200 }]);
  assert.equal(stored(storage).lastExportAt, 100); assert.equal(two.live.lastExportAt, 100);
});

test('a conflict-free change to the SAME value another tab already stored is not a conflict', async () => {
  const { storage, live, store } = make({ initial: { enterSends: true }, live: { enterSends: null } });
  live.enterSends = true; const r = await store.save(); assert.deepEqual(r, { ok: true, applied: [], conflicts: [] }); assert.equal(stored(storage).enterSends, true);
});

test('rapid same-tab saves: queued in order, each sees the one before, the last value wins, none conflicts', async () => {
  const { storage, live, store } = make({ initial: { instructions: 'i' } });
  const writes = []; const set = storage.setItem.bind(storage); storage.setItem = (k, v) => { writes.push(JSON.parse(v).speechRate); return set(k, v); };
  const jobs = []; for (let i = 1; i <= 10; i++) { live.speechRate = 0.5 + i / 10; jobs.push(store.save()); }
  const results = await Promise.all(jobs);
  assert.ok(results.every((r) => r.ok && r.conflicts.length === 0)); assert.equal(stored(storage).speechRate, 1.5);
  assert.deepEqual(writes, [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5].map((n) => Number(n.toFixed(1))), 'written in the order made');
  assert.equal(live.speechRate, 1.5);
});

test('a save while an earlier one is still queued is not undone by the earlier one’s result', async () => {
  const { storage, live, store } = make({ initial: { instructions: 'i' } });
  live.instructions = 'first'; const a = store.save(); live.instructions = 'second'; const b = store.save();
  await Promise.all([a, b]); assert.equal(stored(storage).instructions, 'second'); assert.equal(live.instructions, 'second');
});

test('a refused manual save (no lock) writes nothing and puts live back; the person is told', async () => {
  const { storage, live, store, log } = make({ initial: { instructions: 'i' }, locks: null });
  const text = storage.getItem(KEY); live.enterSends = false; live.instructions = 'changed';
  const r = await store.save();
  assert.equal(r.ok, false); assert.equal(storage.getItem(KEY), text); assert.deepEqual(live, { enterSends: null, instructions: 'i' });
  assert.deepEqual(log.refused, ['unsupported']); assert.ok(log.changed.flat().includes('enterSends'));
});

test('a manual save whose lock is never granted is refused busy, not saved on this tab’s copy', async () => {
  const { storage, live, store } = make({ initial: { instructions: 'i' }, locks: neverGranted, waitMs: 5 });
  const text = storage.getItem(KEY); live.callSounds = true;
  assert.equal((await store.save()).code, 'busy'); assert.equal(storage.getItem(KEY), text); assert.equal('callSounds' in live, false);
});

test('unreadable, malformed and refused storage are never overwritten and are reported', async () => {
  for (const bad of ['{"half":', '[1]', '"s"']) {
    const s = memoryStorage({ [KEY]: bad }); const live = {};
    const st = createPrefsStore({ storage: s, key: KEY, live, locks: fakeLocks() });
    assert.equal((await st.restore(all)).code, 'unreadable'); live.callSounds = true; assert.equal((await st.save()).code, 'unreadable');
    assert.equal(s.getItem(KEY), bad); assert.deepEqual(live, {});
  }
  const full = memoryStorage(); full.setItem = () => { throw new Error('Quota'); };
  const live = {}; const st = createPrefsStore({ storage: full, key: KEY, live, locks: fakeLocks() });
  assert.equal((await st.restore(all)).code, 'write-failed'); assert.deepEqual(live, {}, 'this tab is not changed by a write that did not happen');
  const silent = memoryStorage(); silent.setItem = () => {}; // a store a newer version owns refuses writes without throwing
  assert.equal((await createPrefsStore({ storage: silent, key: KEY, live: {}, locks: fakeLocks() }).restore(all)).code, 'changed');
});

// ---- backups: restoreExtras uses the store ----
function backupsHost({ initial, live = { enterSends: null }, locks = fakeLocks(), isReadOnly }) {
  const storage = initial ? seed(initial) : memoryStorage(); const toasts = []; const redraws = [];
  const prefsStore = createPrefsStore({ storage, key: KEY, live, locks, isReadOnly, onLiveChanged: (f) => redraws.push(f) });
  const host = { el() {}, assistant: { restorePresets: async () => ({ added: 0 }) }, addMemory: () => false, prefs: live, prefsStore,
    generateThreadId: () => 'x', promptDialog: async () => null, showToast: (m) => toasts.push(m), saveFolders() {}, folders: () => [], threads: () => [] };
  return { b: createBackups(host), storage, toasts, redraws, live };
}

test('restoreExtras: the exported enterSends=false comes back, counts as restored and the page redraws the Enter hint; skip leaves it alone', async () => {
  const { b, storage, redraws, live } = backupsHost({});
  const exported = { prefs: { instructions: '', enterSends: false, voiceURI: undefined, speechRate: undefined } }; // what buildBackup writes for a person who only changed Enter
  assert.equal(await b.restoreExtras(JSON.parse(JSON.stringify(exported))), 1);
  assert.equal(stored(storage).enterSends, false); assert.equal(live.enterSends, false); assert.deepEqual(redraws, [['enterSends']]);
  const held = backupsHost({}); assert.equal(await held.b.restoreExtras({ prefs: all }, { skip: new Set(['prefs']) }), 0);
  assert.equal(held.storage.getItem(KEY), null, 'a read-only (skipped) preferences store is not written'); assert.deepEqual(held.redraws, []);
});

test('restoreExtras: an older backup (instructions only), a refusal with no lock and an unreadable store', async () => {
  const old = backupsHost({}); assert.equal(await old.b.restoreExtras({ prefs: { instructions: 'x' } }), 1); assert.equal(old.live.instructions, 'x');
  const nolock = backupsHost({ initial: { instructions: 'other tab' }, locks: null }); const text = nolock.storage.getItem(KEY);
  assert.equal(await nolock.b.restoreExtras({ prefs: { enterSends: false } }), 0);
  assert.equal(nolock.storage.getItem(KEY), text); assert.deepEqual(nolock.live, { enterSends: null }); assert.equal(nolock.toasts.length, 1); assert.match(nolock.toasts[0], /not restored/);
  const broken = backupsHost({}); broken.storage.setItem(KEY, '{"half":'); assert.equal(await broken.b.restoreExtras({ prefs: all }), 0);
  assert.equal(broken.toasts.length, 1); assert.equal(broken.storage.getItem(KEY), '{"half":');
});
