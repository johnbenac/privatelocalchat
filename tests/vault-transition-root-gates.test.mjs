// The four root-reproduced failures of the shared vault core candidate d79ce40f, as regression tests (the root probes root-policy-probe, post-detach-swap-probe and crypto-lock-probe).
// Every case sets up a POSITIVE exclusive writer ({ writer: true, exclusive: true }) so a refusal can never be an unrelated "no exclusive / read-only / busy" refusal: each test
// first asserts the authority it relies on, and each has an unchanged positive control. Runs the app's REAL chat/vault/*.mjs copied into an owned scratch folder with ONE transform
// (the key table gets the two supplied classes plc.characters.v1 / plc.encounters.v1). Synthetic data only. Negative controls are the same files with one guard removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { memoryStorage, VAULT_MARKER } from '../chat/vault/vault-store.mjs';
import { buildModules, loadModules, scratchRoot, NEW_KEYS } from './helpers/vault-transition-rig.mjs';

const FAST = 1000, [CH] = NEW_KEYS;
const root = scratchRoot();
const cache = new Map(); // built lazily: a control whose guard text is not in the source (the unmodified candidate) fails its own test only
const B = (k) => { if (!cache.has(k)) cache.set(k, buildModules(path.join(root, 'gates-' + k), k)); return cache.get(k); };
const lockFree = { request: (name, options, cb) => { if (typeof options !== 'function') cb({ name }); return new Promise(() => {}); } };

/** A positive exclusive writer over a fresh vault: { adapter, session, realLocal, realSession, app, mods, control }. */
async function rig(which, { local = {}, crypto, docs = { put: async () => {} }, setup = async () => {} } = {}) {
  const adapter = createMemoryAdapter();
  const realLocal = memoryStorage({ [VAULT_MARKER]: '1', ...local }), realSession = memoryStorage();
  const mods = await loadModules(B(which), { local: realLocal, session: realSession, locks: lockFree });
  const session = await mods.vault.createVault({ adapter, crypto }).create('scratch', { iterations: FAST });
  await setup(session, adapter);
  const app = mods.store.createAppStorage({ realLocal, realSession });
  app.attach(session, { writer: true, exclusive: true });
  assert.equal(app.exclusive, true, 'positive authority: a real exclusive writer is established'); assert.equal(app.readOnly, false);
  const control = mods.control.createVaultControl({ app, adapter, realLocal, realSession, docs, iterations: FAST, reload: () => {}, dropDocsDb: async () => {} });
  return { adapter, session, realLocal, realSession, mods, app, control, vault: (c) => mods.vault.createVault({ adapter, crypto: c }) };
}
const codeOf = async (p) => { try { await p; return null; } catch (e) { return e.code || e.message; } };
const storedKv = async (adapter) => { const s = await createVault({ adapter }).unlock('scratch'); const kv = new Map(s.state.kv); s.lock(); return kv; };

// ---- RED 1: an unexplained legacy raw copy that differs from the encrypted value is never overwritten by turning encryption off --------------------------------------------

for (const key of ['plc.prefs.v1', CH]) test(`gate 1: disable does not overwrite an unexplained differing raw ${key} and does not clear the header (no key-name exception)`, async () => {
  const r = await rig('new', { local: { [key]: 'unknown-raw-C' }, setup: async (s) => { await s.setKv('l/' + key, 'encrypted-B'); } });
  const code = await codeOf(r.control.disable('scratch'));
  assert.equal(code, 'conflict', 'refused as a conflict, not as an unrelated no-exclusive / read-only / busy refusal');
  assert.equal(r.realLocal.getItem(key), 'unknown-raw-C', 'raw C preserved byte for byte'); assert.ok(await r.adapter.readHeader(), 'header kept');
  assert.equal(r.realLocal.getItem(VAULT_MARKER), '1'); assert.equal(r.app.active, true); assert.equal((await storedKv(r.adapter)).get('l/' + key), 'encrypted-B', 'encrypted copy kept and in use');
});

test('gate 1 positives: an equal raw copy is replaced; the SEPARATE explicit choice replaces a differing one; normal encrypted use is unchanged', async () => {
  const eq = await rig('new', { local: { 'plc.prefs.v1': 'encrypted-B' }, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'encrypted-B'); } });
  assert.equal(await codeOf(eq.control.disable('scratch')), null); assert.equal(eq.realLocal.getItem('plc.prefs.v1'), 'encrypted-B'); assert.equal(await eq.adapter.readHeader(), null);
  const r = await rig('new', { local: { 'plc.prefs.v1': 'unknown-raw-C' }, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'encrypted-B'); } });
  r.app.local.setItem('plc.prefs.v1', 'encrypted-B2'); await r.app.flush(); assert.equal(r.app.local.getItem('plc.prefs.v1'), 'encrypted-B2', 'ordinary encrypted use stays available while the copy is unresolved');
  assert.equal(await codeOf(r.control.disable('scratch', { replaceDiffering: true })), null);
  assert.equal(r.realLocal.getItem('plc.prefs.v1'), 'encrypted-B2', 'the explicit choice replaced the differing raw copy with the live value'); assert.equal(await r.adapter.readHeader(), null);
  const held = await rig('new', { local: { [CH]: 'sole-raw' } }); // a sole value (the vault holds nothing for it) is never touched, even with the choice
  assert.equal(await codeOf(held.control.disable('scratch', { replaceDiffering: true })), null); assert.equal(held.realLocal.getItem(CH), 'sole-raw');
  const late = await rig('new', { local: { 'plc.prefs.v1': 'unknown-raw-C' }, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'encrypted-B'); }, docs: { put: async () => {} } });
  const app = new Proxy(late.app, { get(t, k) { if (k === 'docsBackend') return { all: async () => { late.realLocal.setItem('plc.prefs.v1', 'raw-changed-after-the-choice'); return []; } }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const c2 = late.mods.control.createVaultControl({ app, adapter: late.adapter, realLocal: late.realLocal, realSession: late.realSession, docs: { put: async () => {} }, iterations: FAST });
  assert.equal(await codeOf(c2.disable('scratch', { replaceDiffering: true })), 'conflict', 'the choice names the exact raw text seen; a later change is still preserved');
  assert.equal(late.realLocal.getItem('plc.prefs.v1'), 'raw-changed-after-the-choice');
});

test('control: with the legacy-name exception back, the unexplained raw C is overwritten and the header cleared', async () => {
  const r = await rig('new-no-legacy-conflict-guard', { local: { 'plc.prefs.v1': 'unknown-raw-C' }, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'encrypted-B'); } });
  assert.equal(await codeOf(r.control.disable('scratch')), null, 'the defect: success'); assert.equal(r.realLocal.getItem('plc.prefs.v1'), 'encrypted-B'); assert.equal(await r.adapter.readHeader(), null);
});

// ---- RED 2: any undecoded record makes the history incomplete -----------------------------------------------------------------------------------------------------------------

for (const scope of ['c:opaque-missing-key', 'd:opaque-missing-key', 'x:other-scope']) test(`gate 2: a contiguous undecoded ${scope} record makes the history incomplete; raw is preserved and held, nothing is written`, async () => {
  const adapter = createMemoryAdapter();
  const first = await createVault({ adapter }).create('scratch', { iterations: FAST }); await first.setKv('seed', 'complete-start');
  await adapter.append({ seq: 2, keyId: scope, iv: 'AA==', data: 'AA==' });
  const reopened = await createVault({ adapter }).unlock('scratch');
  assert.equal(reopened.destroyedRecords + reopened.damaged.length >= 1, true, 'the record is reported as before'); assert.equal(reopened.history.observedHistoryComplete, false, 'never "the whole history was observed"');
  const mods = await loadModules(B('new'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree });
  const realLocal = memoryStorage({ [CH]: 'raw-character' }), before = (await adapter.readLog()).length;
  const report = await mods.store.reconcileRaw({ session: reopened, adapter, realLocal, writer: true, exclusive: true });
  assert.deepEqual(report.recovered, [], 'no auto-recovery'); assert.equal(report.evidence.observedHistoryComplete, false);
  assert.ok(report.held.some((h) => h.key === CH && /history-unproven|vault-damaged/.test(h.reason)), 'held visibly'); assert.equal(realLocal.getItem(CH), 'raw-character'); assert.equal((await adapter.readLog()).length, before, 'no record appended');
});

test('gate 2 positives: a complete, actually never-seen history still recovers with durable readback; an uncompacted deleted chat still decodes in order', async () => {
  const adapter = createMemoryAdapter();
  const s = await createVault({ adapter }).create('scratch', { iterations: FAST }); await s.setKv('seed', 'complete-start'); await s.flush();
  const reopened = await createVault({ adapter }).unlock('scratch'); assert.equal(reopened.history.observedHistoryComplete, true);
  const mods = await loadModules(B('new'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree });
  const realLocal = memoryStorage({ [CH]: 'raw-character' });
  const report = await mods.store.reconcileRaw({ session: reopened, adapter, realLocal, writer: true, exclusive: true });
  assert.deepEqual(report.recovered, [CH]); assert.equal((await storedKv(adapter)).get('l/' + CH), 'raw-character', 'durable: read back from the stored log'); assert.equal(realLocal.getItem(CH), 'raw-character');
  const a2 = createMemoryAdapter(); const t = await createVault({ adapter: a2 }).create('scratch', { iterations: FAST }); await t.setKv('seed', '1'); await t.putThread('t1', { id: 't1', messages: [] }); await t.delThread('t1');
  assert.equal((await createVault({ adapter: a2 }).unlock('scratch')).history.observedHistoryComplete, true, 'a chat deleted in an uncompacted log is replayed in order (every record decodes): still a complete history');
  const a3 = createMemoryAdapter(); const u = await createVault({ adapter: a3 }).create('scratch', { iterations: FAST }); await u.setKv('seed', '1'); await u.putThread('t1', { id: 't1', messages: [] }); await u.flush();
  a3.tamper((records, set) => { const r = records.find((x) => x.keyId === 'c:t1'); set({ ...r, seq: r.seq }); }); await a3.append({ seq: 99, keyId: 'c:t1', iv: 'AA==', data: 'AA==' });
  assert.equal((await createVault({ adapter: a3 }).unlock('scratch')).history.observedHistoryComplete, false, 'a gap or an undecodable record is not proof');
});

test('control: treating an undecoded c: record as expected lets recovery run (the root defect)', async () => {
  const adapter = createMemoryAdapter();
  const first = await mods0().then((m) => m.vault.createVault({ adapter }).create('scratch', { iterations: FAST })); await first.setKv('seed', 'complete-start');
  await adapter.append({ seq: 2, keyId: 'c:opaque-missing-key', iv: 'AA==', data: 'AA==' });
  const m = await mods0(); const reopened = await m.vault.createVault({ adapter }).unlock('scratch'); assert.equal(reopened.history.observedHistoryComplete, true, 'the defect');
  async function mods0() { return loadModules(B('new-undecoded-is-complete'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree }); }
});

// ---- RED 3: an old disable stops after its OWN detach when a replacement attached during the document write ---------------------------------------------------------------

test('gate 3: replacement attached and written during the old disable docs.put is preserved; the old disable stops without clearing the header or marker', async () => {
  let replacement, r;
  const docs = { put: async () => { replacement = await r.vault().unlock('scratch'); r.app.attach(replacement, { writer: true, exclusive: true }); r.app.local.setItem('plc.prefs.v1', 'replacement-B'); await r.app.flush(); } };
  r = await rig('new', { docs, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'old-A'); await s.putDoc('d', { id: 'd', text: 'old-doc' }); } });
  const code = await codeOf(r.control.disable('scratch'));
  assert.equal(code, 'session-changed'); assert.equal(r.app.active, true); assert.equal(r.app.vaultSession, replacement); assert.equal(r.app.local.getItem('plc.prefs.v1'), 'replacement-B');
  assert.ok(await r.adapter.readHeader(), 'header kept'); assert.equal(r.realLocal.getItem(VAULT_MARKER), '1', 'marker kept'); assert.equal((await storedKv(r.adapter)).get('l/plc.prefs.v1'), 'replacement-B', 'the replacement value is persisted');
});

test('gate 3: the SAME session object attached again during docs.put is also a different lifecycle', async () => {
  let r;
  const docs = { put: async () => { r.app.attach(r.session, { writer: true, exclusive: true }); } };
  r = await rig('new', { docs, setup: async (s) => { await s.putDoc('d', { id: 'd', text: 'old-doc' }); } });
  assert.equal(await codeOf(r.control.disable('scratch')), 'session-changed'); assert.ok(await r.adapter.readHeader()); assert.equal(r.realLocal.getItem(VAULT_MARKER), '1'); assert.equal(r.app.active, true);
});

test('gate 3 positives: an undisturbed disable with documents completes (docs written, header and marker removed); a swap before the detach still stops it', async () => {
  const put = [];
  const r = await rig('new', { docs: { put: async (d) => { put.push(d.id); } }, setup: async (s) => { await s.putDoc('a', { id: 'a' }); await s.putDoc('b', { id: 'b' }); } });
  assert.equal(await codeOf(r.control.disable('scratch')), null); assert.deepEqual(put.sort(), ['a', 'b']); assert.equal(await r.adapter.readHeader(), null); assert.equal(r.realLocal.getItem(VAULT_MARKER), null); assert.equal(r.app.active, false);
  let replacement; const r2 = await rig('new', { setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'A'); } });
  const app = new Proxy(r2.app, { get(t, k) { if (k === 'docsBackend') return { all: async () => { replacement = await r2.vault().unlock('scratch'); r2.session.lock(); t.detach(); t.attach(replacement, { writer: true, exclusive: true }); return []; } }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  const c2 = r2.mods.control.createVaultControl({ app, adapter: r2.adapter, realLocal: r2.realLocal, realSession: r2.realSession, docs: { put: async () => {} }, iterations: FAST });
  assert.equal(await codeOf(c2.disable('scratch')), 'session-changed'); assert.ok(await r2.adapter.readHeader()); assert.equal(r2.app.vaultSession, replacement);
});

test('control: without the detached-epoch fence the old disable clears the replacement vault (the root defect)', async () => {
  let replacement, r;
  const docs = { put: async () => { replacement = await r.vault().unlock('scratch'); r.app.attach(replacement, { writer: true, exclusive: true }); r.app.local.setItem('plc.prefs.v1', 'replacement-B'); await r.app.flush(); } };
  r = await rig('new-no-detached-fence', { docs, setup: async (s) => { await s.setKv('l/plc.prefs.v1', 'old-A'); await s.putDoc('d', { id: 'd', text: 'old-doc' }); } });
  assert.equal(await codeOf(r.control.disable('scratch')), null, 'the defect: success'); assert.equal(await r.adapter.readHeader(), null, 'the replacement header was cleared');
});

// ---- RED 4: an old action paused in crypto must not append after the lifecycle changed ------------------------------------------------------------------------------------

/** WebCrypto whose encrypt() pauses AFTER encrypting (once armed) until released: the async crypto the old action is waiting in. */
function pausingCrypto() {
  const native = globalThis.crypto; let hold = false, enteredResolve; const state = { arm() { hold = true; }, entered: new Promise((r) => { enteredResolve = r; }), release: null };
  const released = new Promise((r) => { state.release = r; });
  const subtle = new Proxy(native.subtle, { get(t, k) { if (k === 'encrypt') return async (...a) => { const result = await t.encrypt(...a); if (hold) { hold = false; enteredResolve(); await released; } return result; }; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
  state.crypto = { subtle, getRandomValues: (a) => native.getRandomValues(a) };
  return state;
}

for (const variant of ['lock+replacement', 'lock only', 'same session detach+reattach', 'replacement without lock']) test(`gate 4: old recovery paused in crypto then ${variant}: session-changed AND nothing stale is persisted`, async () => {
  const p = pausingCrypto();
  const r = await rig('new', { crypto: p.crypto, local: { [CH]: 'stale-action-character' }, setup: async (s) => { await s.setKv('seed', 'complete-history'); } });
  p.arm(); const pending = codeOf(r.control.retryRecovery()); await p.entered;
  let replacement = null;
  if (variant === 'lock+replacement') { replacement = await r.vault().unlock('scratch'); r.session.lock(); r.app.detach(); r.app.attach(replacement, { writer: true, exclusive: true }); }
  if (variant === 'lock only') { r.session.lock(); r.app.detach(); }
  if (variant === 'same session detach+reattach') { r.app.detach(); r.app.attach(r.session, { writer: true, exclusive: true }); }
  if (variant === 'replacement without lock') { replacement = await r.vault().unlock('scratch'); r.app.detach(); r.app.attach(replacement, { writer: true, exclusive: true }); }
  p.release();
  assert.equal(await pending, 'session-changed'); const persisted = await storedKv(r.adapter);
  assert.equal(persisted.get('l/' + CH) ?? null, null, 'no stale record was appended to the persisted log'); assert.equal(persisted.has('meta/recoveredKeys'), false);
  assert.equal(r.realLocal.getItem(CH), 'stale-action-character', 'raw preserved');
});

test('gate 4 positive: an undisturbed recovery with the same slow crypto copies once and verifies it durably', async () => {
  const p = pausingCrypto();
  const r = await rig('new', { crypto: p.crypto, local: { [CH]: 'live-character' }, setup: async (s) => { await s.setKv('seed', 'complete-history'); } });
  p.arm(); const pending = r.control.retryRecovery(); await p.entered; p.release();
  const report = await pending; assert.deepEqual(report.recovered, [CH]); assert.equal((await storedKv(r.adapter)).get('l/' + CH), 'live-character'); assert.equal(r.realLocal.getItem(CH), 'live-character');
});

test('control: without the pre-append lifecycle guard the stale action is appended after the lock (the root defect)', async () => {
  const p = pausingCrypto();
  const r = await rig('new-no-append-guard', { crypto: p.crypto, local: { [CH]: 'stale-action-character' }, setup: async (s) => { await s.setKv('seed', 'complete-history'); } });
  p.arm(); const pending = codeOf(r.control.retryRecovery()); await p.entered;
  const replacement = await r.vault().unlock('scratch'); r.app.detach(); r.app.attach(replacement, { writer: true, exclusive: true }); p.release(); // a replacement WITHOUT a lock: only the append guard can stop it
  assert.equal(await pending, 'session-changed'); assert.equal((await storedKv(r.adapter)).get('l/' + CH), 'stale-action-character', 'the defect: persisted after the lifecycle changed');
});

test('control: without the locked re-check after crypto a locked session still appends', async () => {
  const p = pausingCrypto();
  const adapter = createMemoryAdapter(); const m = await loadModules(B('new-no-locked-recheck'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree });
  const s = await m.vault.createVault({ adapter, crypto: p.crypto }).create('scratch', { iterations: FAST });
  p.arm(); const pending = s.setKv('k', 'v').then(() => 'stored', (e) => e.code); await p.entered; s.lock(); p.release();
  assert.equal(await pending, 'stored', 'the defect: a locked session appended'); assert.equal((await storedKv(adapter)).get('k'), 'v');
});

test('gate 4: a locked session never appends after its crypto resumes (engine writer, no guard needed)', async () => {
  const p = pausingCrypto();
  const adapter = createMemoryAdapter(); const s = await createVault({ adapter, crypto: p.crypto }).create('scratch', { iterations: FAST });
  p.arm(); const pending = s.setKv('k', 'v').then(() => 'stored', (e) => e.code); await p.entered; s.lock(); p.release();
  assert.equal(await pending, 'locked'); assert.equal((await adapter.readLog()).length, 0);
});

// ---- strict guards and the other authority classes (separately from the positive exclusive writer above) ---------------------------------------------------------------------------

test('guards are STRICT on the memory adapter and the session: only exactly true authorizes; absent keeps every caller working', async () => {
  const adapter = createMemoryAdapter();
  const s = await createVault({ adapter }).create('scratch', { iterations: FAST });
  const guards = { false: () => false, undefined: () => undefined, string: () => 'yes', one: () => 1, promise: () => Promise.resolve(true), throws: () => { throw new Error('x'); } };
  let n = 0;
  for (const [label, guard] of Object.entries(guards)) {
    assert.equal(await codeOf(s.setKv('k' + n++, 'v', { guard })), 'session-changed', 'session ' + label);
    assert.equal(await codeOf(adapter.append({ seq: 500 + n, keyId: 'dek', iv: 'AA==', data: 'AA==' }, { guard })), 'session-changed', 'adapter append ' + label);
    assert.equal(await codeOf(adapter.clear({ guard })), 'session-changed', 'adapter clear ' + label);
    assert.equal(await codeOf(adapter.writeHeader({ format: 'x' }, { guard })), 'session-changed', 'adapter header ' + label);
    assert.equal(await codeOf(adapter.replaceLog({ add: [], removeUpTo: 0, guard })), 'session-changed', 'adapter replaceLog ' + label);
  }
  assert.equal((await adapter.readLog()).length, 0, 'nothing stored by any refused write'); assert.ok(await adapter.readHeader(), 'header kept');
  assert.equal(await codeOf(s.setKv('ok', '1')), null); assert.equal(await codeOf(s.setKv('ok2', '2', { guard: () => true })), null);
  const reopened = await createVault({ adapter }).unlock('scratch'); assert.equal(reopened.state.kv.get('ok'), '1'); assert.equal(reopened.state.kv.get('ok2'), '2'); assert.equal(reopened.lastSeq, 2, 'refused writes did not consume a seq');
});

for (const [label, opts, code] of [['supported:false (no real exclusive lock)', { writer: true, exclusive: false }, 'no-exclusive'], ['read-only tab', { writer: false, exclusive: false }, 'read-only']]) test('other authority classes stay refused before any mutation: ' + label, async () => {
  const adapter = createMemoryAdapter(); const realLocal = memoryStorage({ [VAULT_MARKER]: '1', 'plc.prefs.v1': 'unknown-raw-C', [CH]: 'sole' }), realSession = memoryStorage();
  const mods = await loadModules(B('new'), { local: realLocal, session: realSession, locks: lockFree });
  const session = await mods.vault.createVault({ adapter }).create('scratch', { iterations: FAST }); await session.setKv('l/plc.prefs.v1', 'encrypted-B'); await session.flush();
  const app = mods.store.createAppStorage({ realLocal, realSession }); app.attach(session, opts);
  const control = mods.control.createVaultControl({ app, adapter, realLocal, realSession, docs: { put: async () => {} }, iterations: FAST });
  const before = (await adapter.readLog()).length;
  for (const call of [() => control.disable('scratch'), () => control.disable('scratch', { replaceDiffering: true }), () => control.retryRecovery(), () => control.removePlaintext({ discardDiffering: true })]) assert.equal(await codeOf(call()), code);
  assert.equal(realLocal.getItem('plc.prefs.v1'), 'unknown-raw-C'); assert.equal(realLocal.getItem(CH), 'sole'); assert.equal((await adapter.readLog()).length, before); assert.ok(await adapter.readHeader()); assert.equal(realLocal.getItem(VAULT_MARKER), '1');
});

// ---- root-added gate: a write that became durable BEFORE the lock must not rehydrate the cleared, locked session when its completion arrives later (root-c-probe-0108 locked-apply-probe) ----

/** An adapter whose append commits durably and THEN holds its completion until released (the transaction already committed; only the notification is late). */
function lateCompletionAdapter() {
  const base = createMemoryAdapter(); let hold = false, enter, release; const entered = new Promise((r) => { enter = r; }), gate = new Promise((r) => { release = r; });
  const adapter = { ...base, async append(...args) { await base.append(...args); if (hold) { enter(); await gate; } } };
  return { adapter, base, arm() { hold = true; }, entered, release };
}
for (const [label, options] of [['no guard', undefined], ['with the transition guard (true at append time)', { guard: () => true }]]) test('post-durable completion after lock does not rehydrate the locked session (' + label + '); the pre-lock record stays durable and the committed seq is reported', async () => {
  const late = lateCompletionAdapter();
  const session = await createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  late.arm(); const pending = session.setKv('secret', 'private-after-lock', options); await late.entered;
  session.lock(); const before = session.state.kv.size; late.release();
  const seq = await pending;
  assert.equal(session.locked, true); assert.equal(before, 0); assert.equal(session.state.kv.size, 0, 'the locked session holds nothing'); assert.equal(session.state.kv.get('secret') ?? null, null, 'no plaintext came back into memory');
  assert.equal(seq, 2, 'the truthful committed sequence is reported (no rollback, no resend)'); assert.equal(session.lastSeq, 2);
  const persisted = await createVault({ adapter: late.base }).unlock('scratch'); assert.equal(persisted.state.kv.get('secret'), 'private-after-lock', 'the pre-lock record is legitimate and stays'); assert.equal(persisted.lastSeq, 2);
});

test('post-durable completion positive control: an unlocked session applies the stored event to its memory as before', async () => {
  const late = lateCompletionAdapter();
  const session = await createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  late.arm(); const pending = session.setKv('k', 'v', { guard: () => true }); await late.entered; late.release(); assert.equal(await pending, 2); assert.equal(session.state.kv.get('k'), 'v');
});

test('control: applying the stored event without the locked check rehydrates plaintext into the locked session (the root defect)', async () => {
  const late = lateCompletionAdapter();
  const m = await loadModules(B('new-rehydrate-after-lock'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree });
  const session = await m.vault.createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  late.arm(); const pending = session.setKv('secret', 'private-after-lock'); await late.entered; session.lock(); late.release(); await pending;
  assert.equal(session.state.kv.get('secret'), 'private-after-lock', 'the defect');
});

// ---- the OBSOLETE half of the same gate (root draft-c-postdurable-probe/obsolete-apply-probe): the guard turns false WITHOUT a lock while the completion is pending ----------------------------

test('post-durable completion after the guard turned false WITHOUT a lock does not apply the event to the obsolete session memory; the record stays and its seq is reported', async () => {
  const late = lateCompletionAdapter();
  const session = await createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  let live = true; late.arm(); const pending = session.setKv('secret', 'private-after-obsolete', { guard: () => live }); await late.entered;
  live = false; const before = session.state.kv.size; late.release();
  const seq = await pending;
  assert.equal(session.locked, false, 'this is the unlocked variant: only the guard changed'); assert.equal(before, 1); assert.equal(session.state.kv.size, 1, 'the obsolete memory did not gain the value'); assert.equal(session.state.kv.get('secret') ?? null, null);
  assert.equal(seq, 2, 'the truthful committed seq, no rollback or resend'); assert.equal(session.lastSeq, 2);
  const persisted = await createVault({ adapter: late.base }).unlock('scratch'); assert.equal(persisted.state.kv.get('secret'), 'private-after-obsolete', 'the pre-change record is legitimate and stays');
});

test('obsolete-guard positive controls: a guard still true at completion applies the event; a throwing guard at completion counts as obsolete', async () => {
  const late = lateCompletionAdapter();
  const session = await createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  late.arm(); const pending = session.setKv('k', 'v', { guard: () => true }); await late.entered; late.release(); assert.equal(await pending, 2); assert.equal(session.state.kv.get('k'), 'v');
  const late2 = lateCompletionAdapter(); const s2 = await createVault({ adapter: late2.adapter }).create('scratch', { iterations: FAST }); await s2.setKv('seed', 'seed');
  let calls = 0; late2.arm(); const p2 = s2.setKv('k', 'v', { guard: () => { if (++calls > 2) throw new Error('gone'); return true; } }); await late2.entered; late2.release(); assert.equal(await p2, 2); assert.equal(s2.state.kv.get('k') ?? null, null, 'fail closed: not applied');
});

test('control: applying the event when only the lock is checked rehydrates an obsolete (unlocked) session', async () => {
  const late = lateCompletionAdapter();
  const m = await loadModules(B('new-rehydrate-when-obsolete'), { local: memoryStorage(), session: memoryStorage(), locks: lockFree });
  const session = await m.vault.createVault({ adapter: late.adapter }).create('scratch', { iterations: FAST }); await session.setKv('seed', 'seed');
  let live = true; late.arm(); const pending = session.setKv('secret', 'private-after-obsolete', { guard: () => live }); await late.entered; live = false; late.release(); await pending;
  assert.equal(session.state.kv.get('secret'), 'private-after-obsolete', 'the defect');
});
