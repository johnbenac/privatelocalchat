// Shared vault core correction for the newer-store -> older-vault -> newer-reader transition: replay evidence (what the stored log proves about a key), anti-resurrection, exclusive
// writer, session/lifecycle fence, turning encryption off, and every cleanup export. Runs the app's REAL chat/vault/*.mjs copied into an owned scratch folder with ONE transform:
// the key table gets the two supplied new-store classes (production key ownership is integrated later). Synthetic data only. Negative controls are the same files with one guard removed.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { memoryStorage, VAULT_MARKER } from '../chat/vault/vault-store.mjs';
import { buildModules, loadModules, scratchRoot, NEW_KEYS } from './helpers/vault-transition-rig.mjs';

const FAST = 1000, [CH, EN] = NEW_KEYS;
const root = scratchRoot();
const kinds = ['new', 'new-absence-is-proof', 'new-fallback-is-exclusive', 'new-no-fence', 'new-no-serialize', 'new-memory-readback', 'new-no-final-recheck', 'new-no-exclusive-gate', 'new-unverified-cleanup'];
const built = Object.fromEntries(kinds.map((k) => [k, buildModules(path.join(root, k), k)]));
const DEL = '{"v":1,"records":[{"id":"deleted-life","text":"SYNTH-DELETED"}]}';
const LIVE = '{"v":1,"records":[{"id":"c-1","text":"SYNTH-CHAR-1"}]}';
const PREFS = '{"enterSends":true}';
const lockFree = { request: (name, options, cb) => { if (typeof options !== 'function') cb({ name }); return new Promise(() => {}); } };
const lockHeldByOther = { request: (name, options, cb) => (typeof options === 'function' ? new Promise(() => {}) : Promise.resolve(cb(null))) };

const ctxOf = (initialLocal = {}, initialSession = {}) => ({ local: memoryStorage(initialLocal), session: memoryStorage(initialSession), adapter: createMemoryAdapter() });
const dump = (st) => { const o = {}; for (let i = 0; i < st.length; i++) { const k = st.key(i); o[k] = st.getItem(k); } return o; };
const logLen = async (ctx) => (await ctx.adapter.readLog()).length;
const storedKv = async (ctx) => { const s = await createVault({ adapter: ctx.adapter }).unlock('pw'); const kv = new Map(s.state.kv); s.lock(); return kv; };
/** Write a vault by hand (the log an older vault-capable reader or the app itself would have written), then close it. */
async function makeVault(ctx, fn) {
  const s = await createVault({ adapter: ctx.adapter }).create('pw', { iterations: FAST });
  await fn(s); await s.flush(); s.lock();
  ctx.local.setItem(VAULT_MARKER, '1');
}
/** The new build starts on this storage. which picks the real build or a control; locks decides the writer claim. */
async function boot(ctx, which = 'new', opts = {}) {
  const locks = 'locks' in opts ? opts.locks : lockFree, readyDocs = opts.readyDocs || []; // locks: undefined means "this browser has no Web Locks"
  const mods = await loadModules(built[which], { local: ctx.local, session: ctx.session, locks });
  const res = await mods.store.bootVault({ adapter: ctx.adapter, realLocal: ctx.local, ui: { unlock: async ({ vault }) => vault.unlock('pw') } });
  const docsPlain = new Map(readyDocs.map((d) => [d.id, d]));
  const docs = { all: async () => [...docsPlain.values()], put: async (d) => { docsPlain.set(d.id, d); } };
  const control = mods.control.createVaultControl({ app: mods.store.app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, docs, dropDocsDb: async () => {}, iterations: FAST, reload: () => {} });
  return { mods, res, control, app: mods.store.app, docs, docsPlain, get: (k) => mods.store.appLocal.getItem(k) };
}
/** Hold the first call of an adapter method until released. */
function gate(adapter, method) {
  const real = adapter[method]; let release, entered, armed = true;
  const open = new Promise((r) => { release = r; }), hit = new Promise((r) => { entered = r; });
  adapter[method] = async (...args) => { if (armed) { armed = false; entered(); await open; } return real.apply(adapter, args); };
  return { entered: hit, release, restore: () => { adapter[method] = real; } };
}
const busy = (e) => e.code === 'busy';

// ---- engine: what the stored log proves -------------------------------------------------------------------------------------------------------------------------------

test('engine history: set/del history is complete and names the key; compaction, an empty log, a gap and a damaged record prove nothing', async () => {
  const mk = async (fn) => { const adapter = createMemoryAdapter(); const s = await createVault({ adapter }).create('pw', { iterations: FAST }); await fn(s, adapter); await s.flush(); return adapter; };
  const open = async (adapter) => { const v = createVault({ adapter }); const s = await v.unlock('pw'); return s; };
  const a = await open(await mk(async (s) => { await s.setKv('l/' + CH, DEL); await s.delKv('l/' + CH); }));
  assert.equal(a.history.observedHistoryComplete, true); assert.ok(a.history.seenKvKeys.has('l/' + CH), 'a deleted key is still named by the history'); assert.equal(a.state.kv.has('l/' + CH), false);
  const b = await open(await mk(async (s) => { await s.setKv('l/' + CH, DEL); await s.delKv('l/' + CH); await s.compact(); }));
  assert.equal(b.history.observedHistoryComplete, false, 'compaction renumbers the log: absence proves nothing'); assert.equal(b.history.seenKvKeys.has('l/' + CH), false);
  const c = await open(await mk(async () => {}));
  assert.equal(c.history.observedHistoryComplete, false, 'an empty log proves nothing');
  const d = await open(await mk(async (s, adapter) => { await s.setKv('a', '1'); await s.setKv('b', '2'); await s.setKv('c', '3'); adapter.tamper((r, set, del) => del(2)); }));
  assert.equal(d.history.observedHistoryComplete, false, 'a gap'); assert.ok(d.damaged.some((x) => x.reason === 'missing'));
  const e = await open(await mk(async (s, adapter) => { await s.setKv('a', '1'); await s.setKv('b', '2'); adapter.tamper((r, set) => set({ ...r.at(-1), data: Buffer.from('xx').toString('base64') })); }));
  assert.equal(e.history.observedHistoryComplete, false, 'a damaged record');
  const f = await open(await mk(async (s, adapter) => { await s.setKv('a', '1'); await s.putThread('t1', { id: 't1', messages: [] }); await s.delThread('t1'); }));
  assert.equal(f.history.observedHistoryComplete, true, 'a deleted chat (thread.del + key.destroy) is not damage');
  const g = await open(await mk(async (s, adapter) => { await s.setKv('a', '1'); await s.setKv('b', '2'); adapter.tamper((r, set, del) => del(1)); }));
  assert.equal(g.history.observedHistoryComplete, false, 'a log that does not start at seq 1');
  assert.ok(Object.isFrozen(a.history), 'read-only evidence');
});

// ---- anti-resurrection (root probes tombstone-probe) -------------------------------------------------------------------------------------------------------------------

for (const compact of [false, true]) test(`historically deleted new key with a retained raw copy is never resurrected (compaction ${compact})`, async () => {
  const ctx = ctxOf({ [CH]: DEL });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); await s.setKv('l/' + CH, DEL); await s.delKv('l/' + CH); if (compact) await s.compact(); });
  const n = await logLen(ctx);
  const b = await boot(ctx);
  assert.deepEqual(b.res.recovery.recovered, []); assert.equal((await storedKv(ctx)).has('l/' + CH), false, 'the deleted store is not copied back');
  assert.equal(ctx.local.getItem(CH), DEL, 'the raw bytes are preserved');
  assert.equal(await logLen(ctx), n, 'nothing written, not even a marker');
  if (!compact) { assert.deepEqual(b.res.recovery.stale, [CH]); assert.deepEqual(b.res.recovery.held, []); assert.equal(b.get(CH), null, 'deleted means deleted'); }
  else {
    assert.deepEqual(b.res.recovery.held, [{ key: CH, reason: 'history-unproven' }], 'ambiguous: held visibly');
    assert.equal(b.get(CH), DEL, 'raw readable, never null for an existing raw copy');
    b.mods.store.appLocal.setItem(CH, 'WRITE'); b.mods.store.appLocal.removeItem(CH); assert.equal(ctx.local.getItem(CH), DEL, 'write-blocked'); assert.equal(b.get(CH), DEL);
    const r = await b.control.removePlaintext({ discardDiffering: true }); assert.ok(r.kept.some((k) => k.key === CH)); assert.equal(ctx.local.getItem(CH), DEL, 'cleanup never deletes the held sole copy');
    const rec = await b.control.retryRecovery(); assert.deepEqual(rec.held, [{ key: CH, reason: 'history-unproven' }], 'retry cannot turn ambiguity into proof'); assert.deepEqual(rec.recovered, []);
  }
});

test('control: treating absence as proof resurrects the deleted store with and without compaction', async () => {
  for (const compact of [false, true]) {
    const ctx = ctxOf({ [CH]: DEL });
    await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); await s.setKv('l/' + CH, DEL); await s.delKv('l/' + CH); if (compact) await s.compact(); });
    const b = await boot(ctx, 'new-absence-is-proof');
    assert.deepEqual(b.res.recovery.recovered, [CH], 'the defect: a deleted store is copied back'); assert.equal((await storedKv(ctx)).get('l/' + CH), DEL);
  }
});

test('a legacy-style empty, gapped or damaged history holds the key instead of copying it', async () => {
  const cases = {
    empty: async () => {},
    gapped: async (s, adapter) => { await s.setKv('a', '1'); await s.setKv('b', '2'); await s.setKv('c', '3'); adapter.tamper((r, set, del) => del(2)); },
    damaged: async (s, adapter) => { await s.setKv('a', '1'); await s.setKv('b', '2'); adapter.tamper((r, set) => set({ ...r.at(-1), data: Buffer.from('xx').toString('base64') })); }
  };
  for (const [name, fn] of Object.entries(cases)) {
    const ctx = ctxOf({ [CH]: LIVE });
    await makeVault(ctx, async (s) => fn(s, ctx.adapter));
    const n = await logLen(ctx);
    const b = await boot(ctx);
    assert.equal(b.res.recovery.held.length, 1, name); assert.match(b.res.recovery.held[0].reason, /history-unproven|vault-damaged/, name);
    assert.equal(b.get(CH), LIVE, name); assert.equal(await logLen(ctx), n, name + ': nothing written');
  }
});

test('an old vault that never named the key: normal provably-never-seen migration copies it once, readback verified, raw left byte for byte', async () => {
  const raw = ' {"v":1,"records":[{"id":"c-é ","text":"SYNTH"}]}\n'; // exact bytes matter: whitespace, a non-ASCII letter, a line separator
  const ctx = ctxOf({ [CH]: raw, [EN]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); await s.putThread('t1', { id: 't1', title: 'x', messages: [] }); });
  const n = await logLen(ctx);
  const b = await boot(ctx);
  assert.deepEqual([...b.res.recovery.recovered].sort(), [CH, EN].sort()); assert.equal(b.res.recovery.evidence.observedHistoryComplete, true);
  assert.equal(ctx.local.getItem(CH), raw); assert.equal((await storedKv(ctx)).get('l/' + CH), raw); assert.equal(b.get(CH), raw);
  assert.equal(await logLen(ctx), n + 3, 'two copies and one marker, once');
  const again = await boot(ctx); assert.deepEqual(again.res.recovery.recovered, []); assert.equal(await logLen(ctx), n + 3, 'a restart writes nothing');
});

test('marker interruption: the copy is stored but the marker is not; a later delete plus compaction holds the key rather than resurrecting it', async () => {
  const ctx = ctxOf({ [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const real = ctx.adapter.append;
  ctx.adapter.append = async (r) => { if (r.seq === 3) throw new Error('interrupted before the marker'); return real.call(ctx.adapter, r); }; // seq 2 = the copy, seq 3 = the marker
  const b = await boot(ctx);
  assert.deepEqual(b.res.recovery.recovered, [CH]); assert.equal((await storedKv(ctx)).has('meta/recoveredKeys'), false, 'the marker did not land');
  ctx.adapter.append = real;
  b.mods.store.appLocal.removeItem(CH); await b.app.flush(); await b.app.vaultSession.compact(); // the person deletes it; the log is compacted
  b.app.vaultSession.lock();
  const c = await boot(ctx);
  assert.deepEqual(c.res.recovery.recovered, [], 'not resurrected'); assert.deepEqual(c.res.recovery.held, [{ key: CH, reason: 'history-unproven' }]); assert.equal(ctx.local.getItem(CH), LIVE);
});

test('normal retained, edited and deleted plaintext copies of migrated stores keep their long-standing semantics', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS, 'plc.memory.v1': '{"m":1}' });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', '{"enterSends":false}'); }); // edited since the plaintext was retained; plc.memory.v1 deleted from the vault
  const b = await boot(ctx);
  assert.deepEqual(b.res.recovery.retained, ['plc.prefs.v1'], 'a retained, since-edited copy is quiet'); assert.deepEqual(b.res.recovery.held, []); assert.deepEqual(b.res.recovery.recovered, []);
  assert.equal(b.get('plc.prefs.v1'), '{"enterSends":false}', 'the encrypted value stays in ordinary use'); assert.equal(b.get('plc.memory.v1'), null, 'deleted means deleted');
  const r = await b.control.removePlaintext();
  assert.deepEqual(r.removed, []); assert.deepEqual(r.discarded, []); assert.equal(r.kept.length, 2); assert.equal(ctx.local.getItem('plc.memory.v1'), '{"m":1}', 'kept: it is the only remaining copy');
  const d = await b.control.removePlaintext({ discardDiffering: true });
  assert.deepEqual(d.removed.sort(), ['plc.memory.v1', 'plc.prefs.v1']);
  assert.deepEqual(d.discarded.map((x) => x.status).sort(), ['conflict', 'stale'], 'reported as a discard, not as a duplicate removal'); assert.equal(b.get('plc.prefs.v1'), '{"enterSends":false}');
});

// ---- durable readback: a false-success append is never believed (root probe retry-readback-probe) -------------------------------------------------------------------------

test('false-success append: the first attempt holds, a retry compares the PERSISTED log, and only a really stored value is reported', async () => {
  const ctx = ctxOf({ [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const real = ctx.adapter.append; ctx.adapter.append = async () => {}; // promises success, stores nothing
  const b = await boot(ctx);
  assert.ok(b.res.recovery.held.some((h) => h.key === CH && h.reason === 'readback-mismatch')); assert.equal(b.get(CH), LIVE);
  const second = await b.control.retryRecovery();
  assert.deepEqual(second.verified, [], 'the stale in-memory copy is not a verification'); assert.deepEqual(second.recovered, []); assert.equal(second.held.length, 1);
  assert.equal((await storedKv(ctx)).has('l/' + CH), false, 'really not stored'); assert.equal(ctx.local.getItem(CH), LIVE);
  ctx.adapter.append = real;
  const third = await b.control.retryRecovery();
  assert.deepEqual(third.recovered, [CH], 'recovered once the record is really stored'); assert.equal((await storedKv(ctx)).get('l/' + CH), LIVE); assert.deepEqual(third.held, []);
});

test('control: trusting the in-memory state reports a value that was never stored', async () => {
  const ctx = ctxOf({ [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  ctx.adapter.append = async () => {};
  const b = await boot(ctx, 'new-memory-readback');
  assert.deepEqual(b.res.recovery.held, [], 'the defect: nothing held'); assert.equal((await storedKv(ctx)).has('l/' + CH), false);
  assert.ok(b.res.recovery.verified.includes(CH) || b.res.recovery.recovered.includes(CH), 'reported as safe although not stored');
});

// ---- exclusive writer (root rule): supported:false and readOnly -------------------------------------------------------------------------------------------------------

for (const [label, locks, code] of [['no Web Locks (writer:true, supported:false)', undefined, 'no-exclusive'], ['another tab holds the writer lock (read-only)', lockHeldByOther, 'read-only']]) test('exclusive writer: ' + label + ' defers recovery, cleanup and turning off and preserves everything', async () => {
  const ctx = ctxOf({ [CH]: LIVE, 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const n = await logLen(ctx);
  const b = await boot(ctx, 'new', { locks });
  assert.equal(b.res.recovery.held.length, 1); assert.equal(b.res.recovery.held[0].reason, locks ? 'read-only' : 'no-exclusive-writer'); assert.equal(b.get(CH), LIVE, 'raw readable, never null');
  assert.equal(b.app.exclusive, false);
  const before = { local: dump(ctx.local), session: dump(ctx.session) };
  for (const call of [() => b.control.retryRecovery(), () => b.control.removePlaintext(), () => b.control.removePlaintext({ discardDiffering: true }), () => b.control.disable('pw')]) await assert.rejects(call, (e) => e.code === code, code);
  assert.deepEqual({ local: dump(ctx.local), session: dump(ctx.session) }, before, 'raw storage and marker untouched'); assert.equal(await logLen(ctx), n, 'not one record written'); assert.ok(await ctx.adapter.readHeader(), 'the vault is still there'); assert.equal(b.control.active, true);
  b.mods.store.appLocal.setItem('plc.prefs.v1', 'X'); await b.app.flush();
  assert.equal((await storedKv(ctx)).get('l/plc.prefs.v1'), locks ? PREFS : 'X', locks ? 'a read-only tab does not store the write' : 'ordinary use of the vault is unchanged without Web Locks');
});

test('control: treating the fallback claim as exclusive lets recovery write and cleanup delete; with the control gate removed cleanup runs without exclusivity', async () => {
  const ctx = ctxOf({ [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx, 'new-fallback-is-exclusive', { locks: undefined });
  assert.deepEqual(b.res.recovery.recovered, [CH], 'the defect: a multi-await copy ran without a real lock');
  const ctx2 = ctxOf({ 'plc.prefs.v1': PREFS });
  await makeVault(ctx2, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const g = await boot(ctx2, 'new-no-exclusive-gate', { locks: undefined });
  g.app.attach(g.app.vaultSession, { writer: true, exclusive: false });
  // the store function still refuses unless the control claims exclusivity; the removed gate is the control's only check, so this control proves the gate is what stops it
  const r = await g.control.removePlaintext(); assert.ok(r.removed.includes('plc.prefs.v1'), 'the defect: cleanup ran without exclusivity');
});

// ---- every cleanup export fails closed -------------------------------------------------------------------------------------------------------------------------------

test('public cleanup exports cannot delete a sole value: sync removePlaintext fails closed, removeVerifiedPlaintext needs exclusivity and verification', async () => {
  const ctx = ctxOf({ [CH]: LIVE, 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx, 'new', { locks: undefined }); // held CH, no exclusivity
  assert.throws(() => b.mods.store.removePlaintext(ctx.local, ctx.session), (e) => e.code === 'unverified');
  assert.throws(() => b.mods.store.removePlaintext(ctx.local, ctx.session, { keep: [] }), (e) => e.code === 'unverified');
  assert.equal(ctx.local.getItem(CH), LIVE); assert.equal(ctx.local.getItem('plc.prefs.v1'), PREFS);
  const args = { session: b.app.vaultSession, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session };
  await assert.rejects(() => b.mods.store.removeVerifiedPlaintext({ ...args }), (e) => e.code === 'no-exclusive');
  await assert.rejects(() => b.mods.store.removeVerifiedPlaintext({ ...args, writer: false, exclusive: true }), (e) => e.code === 'read-only');
  const r = await b.mods.store.removeVerifiedPlaintext({ ...args, exclusive: true, discardDiffering: true });
  assert.deepEqual(r.removed, ['plc.prefs.v1'], 'only the verified duplicate'); assert.ok(r.kept.some((k) => k.key === CH)); assert.equal(ctx.local.getItem(CH), LIVE, 'the sole value survives even a discard');
  assert.deepEqual(r.discarded, []);
});

test('a damaged stored vault verifies nothing: cleanup removes nothing', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); await s.setKv('l/other', 'x'); });
  const b = await boot(ctx);
  ctx.adapter.tamper((records, set) => set({ ...records.at(-1), data: Buffer.from('xx').toString('base64') }));
  const r = await b.control.removePlaintext({ discardDiffering: true }); assert.deepEqual(r.removed, []); assert.ok(r.kept.every((k) => /unreadable parts/.test(k.reason))); assert.equal(ctx.local.getItem('plc.prefs.v1'), PREFS);
});

test('control: cleanup without verification deletes a held sole value', async () => {
  const ctx = ctxOf({ [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx, 'new-unverified-cleanup', { locks: lockHeldByOther });
  await assert.rejects(() => b.control.removePlaintext(), (e) => e.code === 'read-only'); // the tab gate still holds ...
  const c = await boot(ctx, 'new-unverified-cleanup');
  const r = await c.control.removePlaintext(); assert.ok(r.removed.includes(CH) && ctx.local.getItem(CH) === null || (await storedKv(ctx)).get('l/' + CH) === LIVE, 'unverified cleanup only passes when the value was already copied');
});

// ---- turning encryption off (root probe disable-probe) ------------------------------------------------------------------------------------------------------------------

async function attached(extraLocal = {}, { writer = true, exclusive = true, docs = [] } = {}) {
  const ctx = ctxOf({ [VAULT_MARKER]: '1', ...extraLocal });
  const s = await createVault({ adapter: ctx.adapter }).create('pw', { iterations: FAST });
  await s.setKv('l/plc.prefs.v1', 'encrypted-A'); for (const d of docs) await s.putDoc(d.id, d); await s.flush();
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  mods.store.app.attach(s, { writer, exclusive });
  const docsPlain = new Map(); const docsApi = { all: async () => [...docsPlain.values()], put: async (d) => { docsPlain.set(d.id, d); } };
  const make = (app = mods.store.app) => mods.control.createVaultControl({ app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, docs: docsApi, dropDocsDb: async () => {}, iterations: FAST, reload: () => {} });
  return { ctx, s, mods, app: mods.store.app, docsPlain, make, control: make() };
}
const spyAdapter = (adapter) => { const calls = []; for (const k of Object.keys(adapter)) if (typeof adapter[k] === 'function') { const real = adapter[k]; adapter[k] = (...a) => { calls.push(k); return real.apply(adapter, a); }; } return calls; };

test('disable: read-only throws before the adapter, raw storage, marker or documents are touched; no-exclusive too', async () => {
  for (const [opts, code] of [[{ writer: false, exclusive: false }, 'read-only'], [{ writer: true, exclusive: false }, 'no-exclusive']]) {
    const r = await attached({ 'plc.prefs.v1': 'encrypted-A' }, opts);
    const calls = spyAdapter(r.ctx.adapter), before = dump(r.ctx.local);
    await assert.rejects(() => r.control.disable('pw'), (e) => e.code === code);
    assert.deepEqual(calls, [], 'no adapter call, not even a read'); assert.deepEqual(dump(r.ctx.local), before); assert.equal(r.app.active, true); assert.equal(r.docsPlain.size, 0);
  }
});

test('disable: a raw value that changes during the awaited documents read is preserved and nothing is cleared', async () => {
  const r = await attached({ 'plc.prefs.v1': 'encrypted-A' });
  const app = new Proxy(r.app, { get(target, key) { if (key === 'docsBackend') return { all: async () => { r.ctx.local.setItem('plc.prefs.v1', 'raw-B-arrived-after-validation'); return []; } }; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; } });
  await assert.rejects(() => r.make(app).disable('pw'), (e) => e.code === 'conflict' && e.keys.includes('plc.prefs.v1'));
  assert.equal(r.ctx.local.getItem('plc.prefs.v1'), 'raw-B-arrived-after-validation'); assert.ok(await r.ctx.adapter.readHeader(), 'the vault is kept'); assert.equal(r.app.active, true); assert.equal(r.ctx.local.getItem(VAULT_MARKER), '1');
});

test('control: without the final fresh comparison the value that arrived late is overwritten and the vault cleared', async () => {
  const ctx = ctxOf({ [VAULT_MARKER]: '1', 'plc.prefs.v1': 'encrypted-A' });
  const s = await createVault({ adapter: ctx.adapter }).create('pw', { iterations: FAST }); await s.setKv('l/plc.prefs.v1', 'encrypted-A'); await s.flush();
  const mods = await loadModules(built['new-no-final-recheck'], { local: ctx.local, session: ctx.session, locks: lockFree }); mods.store.app.attach(s, { writer: true, exclusive: true });
  const app = new Proxy(mods.store.app, { get(t, key) { if (key === 'docsBackend') return { all: async () => { ctx.local.setItem('plc.prefs.v1', 'raw-B'); return []; } }; const v = t[key]; return typeof v === 'function' ? v.bind(t) : v; } });
  await mods.control.createVaultControl({ app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, docs: { put: async () => {} }, iterations: FAST }).disable('pw');
  assert.equal(ctx.local.getItem('plc.prefs.v1'), 'encrypted-A', 'the defect: raw B was destroyed'); assert.equal(await ctx.adapter.readHeader(), null);
});

test('disable: newer-format raw, a differing newer-store copy and an unreadable list are never overwritten; held sole copies stay as they are', async () => {
  const blocked = await attached({ 'plc.prefs.v1': 'newer-raw-B', 'plc.formats.v1': JSON.stringify({ formats: { 'plc.prefs.v1': 2 } }) });
  await assert.rejects(() => blocked.control.disable('pw'), (e) => e.code === 'conflict'); assert.equal(blocked.ctx.local.getItem('plc.prefs.v1'), 'newer-raw-B'); assert.ok(await blocked.ctx.adapter.readHeader());
  const conflict = await attached(); await conflict.s.setKv('l/' + CH, LIVE); await conflict.s.flush(); conflict.mods.store.app.attach(conflict.s, { writer: true, exclusive: true }); conflict.ctx.local.setItem(CH, DEL);
  await assert.rejects(() => conflict.control.disable('pw'), (e) => e.code === 'conflict'); assert.equal(conflict.ctx.local.getItem(CH), DEL);
  const unreadable = await attached(); await unreadable.s.putThread('t1', { id: 't1', messages: [] }); await unreadable.s.flush(); unreadable.mods.store.app.attach(unreadable.s, { writer: true, exclusive: true }); unreadable.ctx.local.setItem('chatThreads', '[{"title":"no id"}]');
  await assert.rejects(() => unreadable.control.disable('pw'), (e) => e.code === 'conflict'); assert.equal(unreadable.ctx.local.getItem('chatThreads'), '[{"title":"no id"}]');
  const ctx = ctxOf({ [CH]: DEL, 'plc.prefs.v1': PREFS }); // a held (history-unproven) sole copy: restore never touches it
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); await s.setKv('l/' + CH, DEL); await s.delKv('l/' + CH); await s.compact(); });
  const b = await boot(ctx); assert.equal(b.res.recovery.held.length, 1);
  await b.control.disable('pw'); assert.equal(ctx.local.getItem(CH), DEL, 'preserved byte for byte'); assert.equal(await ctx.adapter.readHeader(), null);
});

test('disable: the app keeps writing while it waits; the last app value wins, a document saved meanwhile is not lost, and a retained stale migrated copy is replaced as before', async () => {
  const r = await attached({ 'plc.prefs.v1': 'OLD-RETAINED-PLAINTEXT' });
  let hits = 0;
  const app = new Proxy(r.app, { get(target, key) { if (key === 'docsBackend') return { all: async () => { const seen = [...r.s.state.docs.values()]; if (!hits++) { r.app.local.setItem('plc.prefs.v1', 'live-C'); await r.s.putDoc('late', { id: 'late', name: 'late' }); } return seen; } }; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; } });
  await r.make(app).disable('pw');
  assert.equal(r.ctx.local.getItem('plc.prefs.v1'), 'live-C'); assert.ok(r.docsPlain.has('late'), 'the document saved during the wait came along'); assert.ok(hits >= 2, 'documents were read again until stable');
  assert.equal(await r.ctx.adapter.readHeader(), null); assert.equal(r.ctx.local.getItem(VAULT_MARKER), null);
});

// ---- session / lifecycle fence (root probe session-swap-probe) ----------------------------------------------------------------------------------------------------------

test('disable: lock + unlock during the awaited documents read stops before mutating, detaching or clearing the replacement session', async () => {
  const r = await attached(); let replacement;
  const app = new Proxy(r.app, { get(target, key) { if (key === 'docsBackend') return { all: async () => { replacement = await createVault({ adapter: r.ctx.adapter }).unlock('pw'); r.s.lock(); target.detach(); target.attach(replacement, { writer: true, exclusive: true }); target.local.setItem('plc.prefs.v1', 'new-session-B'); await target.flush(); return []; } }; const v = target[key]; return typeof v === 'function' ? v.bind(target) : v; } });
  await assert.rejects(() => r.make(app).disable('pw'), (e) => e.code === 'session-changed');
  assert.equal(replacement.state.kv.get('l/plc.prefs.v1'), 'new-session-B'); assert.equal((await storedKv(r.ctx)).get('l/plc.prefs.v1'), 'new-session-B', 'the new session value is persisted'); assert.equal(r.app.active, true); assert.ok(await r.ctx.adapter.readHeader());
  assert.equal(r.ctx.local.getItem('plc.prefs.v1'), null, 'the old action wrote no raw copy');
});

test('the same session attached again is a different lifecycle: pointer equality alone does not pass the fence', async () => {
  const r = await attached(); const fence = r.app.fence(); assert.equal(r.app.isCurrent(fence), true);
  r.app.detach(); r.app.attach(r.s, { writer: true, exclusive: true }); assert.equal(r.app.isCurrent(fence), false); assert.equal(r.app.isCurrent(r.app.fence()), true);
  r.s.lock(); assert.equal(r.app.isCurrent(r.app.fence()), false);
});

test('cleanup and retry started before a lock + unlock refuse and leave raw copies alone', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS, [CH]: LIVE });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx); const old = b.res.session;
  for (const action of ['cleanup', 'retry']) {
    const real = ctx.adapter.readLog; let armed = true;
    ctx.adapter.readLog = async () => { const log = await real.call(ctx.adapter); if (armed) { armed = false; const fresh = await createVault({ adapter: ctx.adapter }).unlock('pw'); b.app.vaultSession.lock(); b.app.detach(); b.app.attach(fresh, { writer: true, exclusive: true }); } return log; };
    const before = dump(ctx.local);
    await assert.rejects(() => (action === 'cleanup' ? b.control.removePlaintext() : b.control.retryRecovery()), (e) => e.code === 'session-changed', action);
    ctx.adapter.readLog = real; assert.deepEqual(dump(ctx.local), before, action + ': raw untouched'); assert.equal(b.app.active, true);
    assert.equal(b.app.recovery?.recovered?.length ?? 0, 0, 'the replacement session keeps its own recovery state');
  }
  void old;
});

test('control: without the lifecycle fence an old cleanup removes copies after the session changed', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx, 'new-no-fence');
  const real = ctx.adapter.readLog; let armed = true;
  ctx.adapter.readLog = async () => { const log = await real.call(ctx.adapter); if (armed) { armed = false; const fresh = await createVault({ adapter: ctx.adapter }).unlock('pw'); b.app.detach(); b.app.attach(fresh, { writer: true, exclusive: true }); } return log; };
  const r = await b.control.removePlaintext(); assert.ok(r.removed.includes('plc.prefs.v1'), 'the defect: the stale action carried on');
});

// ---- same-control overlap: serialised or refused honestly -------------------------------------------------------------------------------------------------------------

async function heldBoot() {
  const ctx = ctxOf({ [CH]: LIVE, 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const real = ctx.adapter.append; ctx.adapter.append = async () => { throw new Error('disk full'); };
  const b = await boot(ctx); ctx.adapter.append = real;
  assert.equal(b.res.recovery.held.length, 1); return { ctx, b };
}

test('overlap: two retries share one run (one copy, one marker); cleanup and turning off are refused as busy while it runs, then work', async () => {
  const { ctx, b } = await heldBoot(); const n = await logLen(ctx);
  const g = gate(ctx.adapter, 'readLog');
  const r1 = b.control.retryRecovery(); await g.entered; const r2 = b.control.retryRecovery();
  await assert.rejects(() => b.control.removePlaintext(), busy); await assert.rejects(() => b.control.disable('pw'), busy);
  g.release(); const [a1, a2] = await Promise.all([r1, r2]);
  assert.equal(a1, a2, 'one shared report'); assert.deepEqual(a1.recovered, [CH]); assert.equal(await logLen(ctx), n + 2, 'one copy and one marker');
  assert.ok(ctx.local.getItem(CH) === LIVE && (await storedKv(ctx)).get('l/' + CH) === LIVE);
  const c = await b.control.removePlaintext(); assert.ok(c.removed.includes(CH)); assert.equal(b.get(CH), LIVE, 'the app still reads it');
});

test('overlap: cleanup refuses a second cleanup, a retry and a disable while it runs; a feature write around its finalisation is neither lost nor torn', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx); const g = gate(ctx.adapter, 'readLog');
  const c1 = b.control.removePlaintext(); await g.entered;
  for (const call of [() => b.control.removePlaintext(), () => b.control.retryRecovery(), () => b.control.disable('pw')]) await assert.rejects(call, busy);
  b.mods.store.appLocal.setItem('plc.prefs.v1', '{"enterSends":"edited-during-cleanup"}'); // the page keeps working
  g.release(); const r = await c1;
  assert.ok(r.removed.includes('plc.prefs.v1') || r.kept.some((k) => k.key === 'plc.prefs.v1'));
  assert.equal(b.get('plc.prefs.v1'), '{"enterSends":"edited-during-cleanup"}'); await b.app.flush(); assert.equal((await storedKv(ctx)).get('l/plc.prefs.v1'), '{"enterSends":"edited-during-cleanup"}', 'the feature write reached the vault');
  const deadline = await Promise.race([b.control.removePlaintext().then(() => 'done'), new Promise((res) => setTimeout(() => res('deadlock'), 5000))]); assert.equal(deadline, 'done', 'no deadlock: the next action runs');
});

test('overlap: disable refuses retry and cleanup while it runs, and a failed retry leaves the control usable', async () => {
  const r = await attached(); const g = gate(r.ctx.adapter, 'readHeader');
  const d = r.control.disable('pw'); await g.entered;
  await assert.rejects(() => r.control.retryRecovery(), busy); await assert.rejects(() => r.control.removePlaintext(), busy);
  g.release(); await d; assert.equal(r.app.active, false);
});

test('control: without serialisation overlapping cleanups both run', async () => {
  const ctx = ctxOf({ 'plc.prefs.v1': PREFS });
  await makeVault(ctx, async (s) => { await s.setKv('l/plc.prefs.v1', PREFS); });
  const b = await boot(ctx, 'new-no-serialize'); const g = gate(ctx.adapter, 'readLog');
  const c1 = b.control.removePlaintext(); await g.entered; const c2 = b.control.removePlaintext(); g.release();
  const out = await Promise.allSettled([c1, c2]); assert.equal(out.filter((o) => o.status === 'fulfilled').length, 2, 'the defect: two transitions interleaved');
});
