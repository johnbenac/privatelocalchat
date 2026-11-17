// newer store -> older vault -> newer reader (docs/DATA-COMPATIBILITY.md "A newer store, an older vault, then the newer build again").
// Runs the app's REAL chat/vault/*.mjs, copied into a scratch folder with one transform: the key table gets the two supplied new-store classes
// (plc.characters.v1, plc.encounters.v1). The old reader is the same files from git 0b0ef275. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { memoryStorage } from '../chat/vault/vault-store.mjs';
import { buildModules, loadModules, oldRevAvailable, scratchRoot, NEW_KEYS } from './helpers/vault-transition-rig.mjs';

const FAST = 1000, [CH, EN] = NEW_KEYS;
const root = scratchRoot();
const built = { new: buildModules(path.join(root, 'new'), 'new'), noRecovery: buildModules(path.join(root, 'ctl-no-recovery'), 'new-without-recovery'), unverified: buildModules(path.join(root, 'ctl-unverified'), 'new-unverified-cleanup'), noRecheck: buildModules(path.join(root, 'ctl-no-recheck'), 'new-no-recheck') };
const haveOld = oldRevAvailable();
if (haveOld) { built.old = buildModules(path.join(root, 'old'), 'old'); built.oldNewTable = buildModules(path.join(root, 'ctl-old-new-table'), 'old-new-table'); }
const chars = JSON.stringify({ v: 1, records: [{ id: 'c-1', name: 'Synthetic Pip', text: 'SYNTH-CHAR-1' }] });
const encs = JSON.stringify({ v: 1, encounters: [{ id: 'e-1', note: 'SYNTH-ENC-1' }] });
const threads = (n, tag = 'x') => Array.from({ length: n }, (_, i) => ({ id: 't' + i, title: 'Chat ' + i + tag, messages: [{ role: 'user', content: 'hi ' + i }] }));
const noLocks = undefined;
const lockHeldByOther = { request: (name, options, cb) => (typeof options === 'function' ? new Promise(() => {}) : Promise.resolve(cb(null))) }; // someone else holds it for ever
const lockFree = { request: (name, options, cb) => { if (typeof options !== 'function') cb({ name }); return new Promise(() => {}); } };

function ctxOf(initialLocal = {}, initialSession = {}) { return { local: memoryStorage(initialLocal), session: memoryStorage(initialSession), adapter: createMemoryAdapter() }; }
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/** The OLD reader turns the vault on (it migrates only the keys it knows) and the page closes. */
async function oldReaderEnables(ctx) {
  const mods = await loadModules(built.old, { local: ctx.local, session: ctx.session, locks: noLocks });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  await session.flush(); session.lock();
}
/** The NEW build starts (kind picks the real build or a control). */
async function boot(ctx, which = 'new', { locks = lockFree, unlock } = {}) {
  const mods = await loadModules(built[which], { local: ctx.local, session: ctx.session, locks });
  const res = await mods.store.bootVault({ adapter: ctx.adapter, realLocal: ctx.local, ui: { unlock: unlock || (async ({ vault }) => vault.unlock('pw')) } });
  const control = mods.control.createVaultControl({ app: mods.store.app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, docs: { all: async () => [], put: async () => {} }, dropDocsDb: async () => {}, iterations: FAST, reload: () => {} });
  return { mods, res, control, app: mods.store.app, get: (k) => mods.store.appLocal.getItem(k) };
}
const stored = async (ctx, session) => { const m = await import('../chat/vault/vault-store.mjs'); return m.readbackState({ adapter: ctx.adapter, session }); };
const storedKv = async (ctx, pass = 'pw') => { const s = await createVault({ adapter: ctx.adapter }).unlock(pass); const kv = new Map(s.state.kv), th = new Map(s.state.threads); s.lock(); return { kv, th }; };
const oldInitial = () => ({ [CH]: chars, [EN]: encs, 'plc.prefs.v1': '{"enterSends":true}', chatThreads: JSON.stringify(threads(2)) });

test('source: the copied modules are the working-tree files; only the key table differs', () => {
  for (const f of ['vault-store.mjs', 'vault-control.mjs', 'vault.mjs']) assert.equal(sha(path.join(built.new.dir, 'chat/vault', f)), sha(new URL('../chat/vault/' + f, import.meta.url).pathname), f);
  const table = fs.readFileSync(built.new.keyClasses, 'utf8');
  for (const k of NEW_KEYS) assert.match(table, new RegExp('"' + k.replace(/\./g, '\\.') + '": \\{ store: "local", class: "user", format: 1 \\}'));
});

test('ordinary enable on the new build migrates the new stores, writes the reconciled marker, and cleanup removes verified copies', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  await session.flush();
  const s = await stored(ctx, session);
  assert.equal(s.kv.get('l/' + CH), chars); assert.equal(s.kv.get('l/' + EN), encs);
  assert.deepEqual(JSON.parse(s.kv.get('meta/recoveredKeys')), [CH, EN].sort());
  mods.store.app.attach(session, { writer: true, exclusive: true });
  const control = mods.control.createVaultControl({ app: mods.store.app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, dropDocsDb: async () => {} });
  const r = await control.removePlaintext();
  assert.deepEqual(r.kept, []); assert.ok(r.removed.includes(CH) && r.removed.includes(EN));
  assert.equal(ctx.local.getItem(CH), null);
  assert.equal(mods.store.appLocal.getItem(CH), chars);
});

test('old reader enables the vault, the new build returns: the new stores are recovered before any read, copy left in place, read back from storage', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial());
  await oldReaderEnables(ctx);
  const before = await storedKv(ctx);
  assert.equal(before.kv.has('l/' + CH), false, 'the old reader did not encrypt the unknown store');
  assert.equal(ctx.local.getItem(CH), chars, 'it is still raw');
  const b = await boot(ctx);
  assert.equal(b.get(CH), chars); assert.equal(b.get(EN), encs);
  assert.deepEqual([...b.res.recovery.recovered].sort(), [CH, EN]);
  assert.ok(b.res.recovery.verified.includes('plc.prefs.v1'));
  assert.equal(ctx.local.getItem(CH), chars, 'nothing is removed at start-up');
  const after = await storedKv(ctx);
  assert.equal(after.kv.get('l/' + CH), chars); assert.equal(after.kv.get('l/' + EN), encs);
  const r = await b.control.removePlaintext();
  assert.ok(r.removed.includes(CH) && r.removed.includes(EN) && r.kept.length === 0, JSON.stringify(r));
  const again = await boot(ctx);
  assert.equal(again.get(CH), chars); assert.deepEqual(again.res.recovery.recovered, []);
});

test('a passkey unlock (raw key, no passphrase) recovers and verifies the same way', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const b = await boot(ctx, 'new', { unlock: async ({ vault, header }) => { const open = await vault.unlock('pw'); const dek = open.dekBytes(); open.lock(); return vault.unlockWithKey(header, dek); } });
  assert.deepEqual([...b.res.recovery.recovered].sort(), [CH, EN]); assert.equal((await storedKv(ctx)).kv.get('l/' + CH), chars);
});

test('equal copy: nothing is written, it is a verified duplicate', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST }); session.lock();
  const n = (await ctx.adapter.readLog()).length;
  const b = await boot(ctx);
  assert.ok(b.res.recovery.verified.includes(CH) && b.res.recovery.recovered.length === 0);
  assert.equal((await ctx.adapter.readLog()).length, n, 'no records written');
});

test('conflicts: an existing different encrypted value and a different raw value are both kept, the encrypted one is served, nothing is chosen', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST }); session.lock();
  ctx.local.setItem(CH, '{"v":1,"records":[{"id":"other-raw"}]}'); ctx.local.setItem('plc.prefs.v1', '{"enterSends":false}'); // raw copies drift
  const b = await boot(ctx);
  assert.deepEqual(b.res.recovery.conflicts.map((c) => c.key), [CH]);
  assert.deepEqual(b.res.recovery.retained, ['plc.prefs.v1'], 'a retained copy of a store every reader migrates is normal and quiet');
  assert.equal(b.get(CH), chars, 'the encrypted value is used'); assert.equal(ctx.local.getItem(CH), '{"v":1,"records":[{"id":"other-raw"}]}');
  const r = await b.control.removePlaintext();
  assert.ok(!r.removed.includes(CH) && !r.removed.includes('plc.prefs.v1'));
  assert.ok(r.kept.some((k) => k.key === CH && /differs/.test(k.reason)));
  assert.equal(ctx.local.getItem(CH), '{"v":1,"records":[{"id":"other-raw"}]}', 'the raw value survives cleanup');
  const d = await b.control.removePlaintext({ discardDiffering: true });
  assert.ok(d.removed.includes(CH)); assert.equal(b.get(CH), chars, 'the encrypted value is untouched by the confirmed discard');
});

test('a stale retained copy of a deleted store is never copied back, and is kept until the person says', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  mods.store.app.attach(session, { writer: true, exclusive: true });
  mods.store.appLocal.removeItem(CH); await mods.store.app.flush(); session.lock(); // deleted in the vault; the plaintext copy was retained
  const b = await boot(ctx);
  assert.equal(b.get(CH), null, 'not resurrected'); assert.deepEqual(b.res.recovery.recovered, []);
  assert.ok(b.res.recovery.stale.includes(CH) && ctx.local.getItem(CH) === chars);
  const r = await b.control.removePlaintext(); assert.ok(r.kept.some((k) => k.key === CH));
  assert.equal(ctx.local.getItem(CH), chars);
});

test('raw value changed while the copy is being verified: both kept as a conflict, cleanup never removes it', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const realAppend = ctx.adapter.append; let n = 0;
  ctx.adapter.append = async (r) => { await realAppend.call(ctx.adapter, r); if (++n === 1) ctx.local.setItem(CH, 'CHANGED-BY-OTHER-TAB'); };
  const b = await boot(ctx);
  assert.ok(b.res.recovery.conflicts.some((c) => c.key === CH && c.changed));
  assert.equal(ctx.local.getItem(CH), 'CHANGED-BY-OTHER-TAB');
  ctx.adapter.append = realAppend;
  const r = await b.control.removePlaintext(); assert.ok(r.kept.some((k) => k.key === CH)); assert.equal(ctx.local.getItem(CH), 'CHANGED-BY-OTHER-TAB');
});

test('cleanup: a copy that changes while the stored vault is being read back is kept; a copy missing from the STORED log is kept even if memory has it', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  mods.store.app.attach(session, { writer: true, exclusive: true });
  const control = mods.control.createVaultControl({ app: mods.store.app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, dropDocsDb: async () => {} });
  const realRead = ctx.adapter.readLog; let armed = true;
  ctx.adapter.readLog = async () => { const log = await realRead.call(ctx.adapter); if (armed) { armed = false; ctx.local.setItem(CH, 'CHANGED-DURING-READBACK'); } return log; };
  const r = await control.removePlaintext();
  assert.ok(r.kept.some((k) => k.key === CH)); assert.equal(ctx.local.getItem(CH), 'CHANGED-DURING-READBACK'); assert.ok(r.removed.includes(EN));
  ctx.adapter.readLog = realRead;
  // the stored log loses a record the in-memory session still holds: the persisted truth decides
  const ctx2 = ctxOf({ [EN]: encs });
  const m2 = await loadModules(built.new, { local: ctx2.local, session: ctx2.session, locks: lockFree });
  const mig = await m2.store.createAndMigrate({ passphrase: 'pw', adapter: ctx2.adapter, realLocal: ctx2.local, realSession: ctx2.session, iterations: FAST });
  m2.store.app.attach(mig.session, { writer: true, exclusive: true });
  ctx2.adapter.tamper((records, set, del) => { del(records.find((r) => r.seq === 1).seq); });
  const c2 = m2.control.createVaultControl({ app: m2.store.app, adapter: ctx2.adapter, realLocal: ctx2.local, realSession: ctx2.session, dropDocsDb: async () => {} });
  assert.equal(m2.store.appLocal.getItem(EN), encs, 'memory still has it');
  const r2 = await c2.removePlaintext(); assert.ok(r2.kept.some((k) => k.key === EN)); assert.equal(ctx2.local.getItem(EN), encs);
});

test('read-only tab: no write of any kind, the raw value is served (not null), writes/clear/cleanup refused, bytes preserved', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const n = (await ctx.adapter.readLog()).length;
  const b = await boot(ctx, 'new', { locks: lockHeldByOther });
  assert.equal(b.res.writer, false);
  assert.deepEqual(b.res.recovery.held.map((h) => h.reason), ['read-only', 'read-only']);
  assert.equal(b.get(CH), chars, 'never null while a sole copy exists');
  b.mods.store.appLocal.setItem(CH, 'OVERWRITE'); b.mods.store.appLocal.removeItem(EN); b.mods.store.appLocal.clear();
  assert.equal(ctx.local.getItem(CH), chars); assert.equal(ctx.local.getItem(EN), encs);
  assert.equal(b.get(CH), chars);
  assert.ok(new Set([...Array(b.mods.store.appLocal.length).keys()].map((i) => b.mods.store.appLocal.key(i))).has(CH));
  await assert.rejects(() => b.control.removePlaintext(), (e) => e.code === 'read-only');
  await assert.rejects(() => b.control.retryRecovery(), (e) => e.code === 'read-only');
  assert.equal((await ctx.adapter.readLog()).length, n, 'not one record written, not even the marker');
});

test('format-blocked (newer data): readable, never written, never removed', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf({ ...oldInitial(), 'plc.formats.v1': JSON.stringify({ v: 1, formats: { [CH]: 2 } }) }); await oldReaderEnables(ctx);
  const n = (await ctx.adapter.readLog()).length;
  const b = await boot(ctx);
  assert.ok(b.res.recovery.blocked.includes(CH)); assert.deepEqual(b.res.recovery.held, [{ key: CH, reason: 'newer-format' }]);
  assert.equal(b.get(CH), chars); b.mods.store.appLocal.setItem(CH, 'X'); assert.equal(ctx.local.getItem(CH), chars);
  assert.equal((await storedKv(ctx)).kv.has('l/' + CH), false, 'not copied');
  const r = await b.control.removePlaintext({ discardDiffering: true }); assert.ok(r.kept.some((k) => k.key === CH && /newer/.test(k.reason))); assert.equal(ctx.local.getItem(CH), chars);
  assert.ok((await ctx.adapter.readLog()).length >= n);
});

test('interruption and retry: a failed write holds the key (raw served), a later retry or restart recovers it once, with no duplicate record', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const realAppend = ctx.adapter.append; let failing = true;
  ctx.adapter.append = async (r) => { if (failing) throw new Error('disk full'); return realAppend.call(ctx.adapter, r); };
  const b = await boot(ctx);
  assert.equal(b.res.recovery.failed.length, 2); assert.equal(b.get(CH), chars); assert.equal(b.get(EN), encs);
  b.mods.store.appLocal.setItem(CH, 'NO'); assert.equal(ctx.local.getItem(CH), chars);
  failing = false;
  const rec = await b.control.retryRecovery();
  assert.deepEqual(rec.held, []); assert.deepEqual([...rec.recovered].sort(), [CH, EN]); assert.equal(b.get(CH), chars);
  const kv = await storedKv(ctx); assert.equal(kv.kv.get('l/' + CH), chars);
  const count = (await ctx.adapter.readLog()).length;
  const again = await boot(ctx); assert.deepEqual(again.res.recovery.recovered, []); assert.equal((await ctx.adapter.readLog()).length, count, 'idempotent: a restart writes nothing more');
});

test('durable readback failure: a record that is not really stored (or is damaged) is never trusted from memory', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const realAppend = ctx.adapter.append;
  ctx.adapter.append = async (r) => { if (r.keyId === 'dek') { await realAppend.call(ctx.adapter, { ...r, data: Buffer.from('garbage').toString('base64') }); return; } return realAppend.call(ctx.adapter, r); };
  const b = await boot(ctx);
  assert.ok(b.res.recovery.held.some((h) => h.key === CH && h.reason === 'readback-mismatch'), JSON.stringify(b.res.recovery));
  assert.equal(b.get(CH), chars); assert.equal(ctx.local.getItem(CH), chars);
  const r = await b.control.removePlaintext({ discardDiffering: true }); assert.ok(r.kept.some((k) => k.key === CH)); assert.equal(ctx.local.getItem(CH), chars);
});

test('damaged vault: a sole raw value is held, nothing is written over damage', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  ctx.adapter.tamper((records, set) => { const r = records.at(-1); set({ ...r, data: Buffer.from('xx').toString('base64') }); });
  const n = (await ctx.adapter.readLog()).length;
  const b = await boot(ctx);
  assert.ok(b.res.recovery.held.every((h) => h.reason === 'vault-damaged') && b.res.recovery.held.length === 2); assert.equal(b.get(CH), chars);
  assert.equal((await ctx.adapter.readLog()).length, n);
});

test('session keys are never copied; the remember-keys rule decides what counts as a verified copy', async () => {
  const ctx = ctxOf({}, { chatConfig: '{"endpoint":"https://x","token":"SYNTH-TOKEN","model":"m"}', chatEndpointTokens: '{"https://x":"SYNTH-TOKEN"}', 'plc.draft': 'unsent' });
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  mods.store.app.attach(session, { writer: true, exclusive: true }); mods.store.app.setRememberKeys(false); await mods.store.app.flush(); session.lock();
  ctx.session.setItem('plc.pendingToken.v1', 'only-raw');
  const b = await boot(ctx);
  assert.equal((await storedKv(ctx)).kv.has('s/plc.pendingToken.v1'), false, 'never copied');
  const r = await b.control.removePlaintext();
  assert.ok(r.removed.includes('chatConfig') && r.removed.includes('chatEndpointTokens') && r.removed.includes('plc.draft'), JSON.stringify(r));
  assert.ok(r.kept.some((k) => k.key === 'plc.pendingToken.v1')); assert.equal(ctx.session.getItem('plc.pendingToken.v1'), 'only-raw');
  assert.ok(!(await storedKv(ctx)).kv.get('s/chatConfig').includes('SYNTH-TOKEN'), 'the token was not stored');
});

test('chatThreads: raw list compared per thread id; id-less lists are unreadable; stale raw chats are not resurrected', async () => {
  const ctx = ctxOf({ chatThreads: JSON.stringify(threads(2)) });
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  mods.store.app.attach(session, { writer: true, exclusive: true });
  const grown = threads(2); grown.push({ id: 't9', title: 'new', messages: [] });
  mods.store.appLocal.setItem('chatThreads', JSON.stringify(grown)); await mods.store.app.flush(); session.lock();
  const b = await boot(ctx);
  assert.equal(JSON.parse(b.get('chatThreads')).length, 3);
  const r = await b.control.removePlaintext(); assert.ok(r.removed.includes('chatThreads'), 'raw subset of the vault chats is a verified copy');
  ctx.local.setItem('chatThreads', JSON.stringify([{ id: 'gone', title: 'deleted earlier', messages: [] }]));
  const r2 = await b.control.removePlaintext(); assert.ok(r2.kept.some((k) => k.key === 'chatThreads'));
  assert.equal(JSON.parse(b.get('chatThreads')).some((t) => t.id === 'gone'), false);
  ctx.local.setItem('chatThreads', JSON.stringify([{ title: 'no id' }]));
  const r3 = await b.control.removePlaintext({ discardDiffering: true }); assert.ok(r3.kept.some((k) => k.key === 'chatThreads' && /cannot be checked/.test(k.reason)));
  assert.ok(ctx.local.getItem('chatThreads'));
});

test('turning encryption off keeps a differing raw copy of a newer store; the long-standing overwrite of migrated keys is unchanged', async () => {
  const ctx = ctxOf(oldInitial());
  const mods = await loadModules(built.new, { local: ctx.local, session: ctx.session, locks: lockFree });
  const { session } = await mods.store.createAndMigrate({ passphrase: 'pw', adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, iterations: FAST });
  mods.store.app.attach(session, { writer: true, exclusive: true });
  const control = mods.control.createVaultControl({ app: mods.store.app, adapter: ctx.adapter, realLocal: ctx.local, realSession: ctx.session, docs: { all: async () => [], put: async () => {} }, dropDocsDb: async () => {}, iterations: FAST });
  ctx.local.setItem(CH, 'RAW-DIFFERENT');
  await assert.rejects(() => control.disable('pw'), (e) => e.code === 'conflict');
  assert.equal(ctx.local.getItem(CH), 'RAW-DIFFERENT'); assert.equal(control.active, true);
  ctx.local.setItem(CH, chars); ctx.local.setItem('plc.prefs.v1', 'STALE-RAW');
  await control.disable('pw');
  assert.equal(ctx.local.getItem('plc.prefs.v1'), '{"enterSends":true}'); assert.equal(ctx.local.getItem(CH), chars);
});

// ---- negative controls: the guard removed, or the old code, must FAIL the same invariants -----------------------------------------------------------------------------

test('control: the old code with the new key table reads null for the sole raw store and its cleanup deletes the only copy', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const b = await boot(ctx, 'oldNewTable');
  assert.equal(b.get(CH), null, 'the defect: the store looks empty'); assert.equal(ctx.local.getItem(CH), chars);
  const removed = b.mods.store.removePlaintext(ctx.local, ctx.session); // the OLD code's unverified sync export
  assert.ok(removed.includes(CH)); assert.equal(ctx.local.getItem(CH), null, 'the defect: the only copy is gone'); assert.equal((await storedKv(ctx)).kv.has('l/' + CH), false);
});

test('control: the revised code without the boot reconciliation fails the same invariant', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const b = await boot(ctx, 'noRecovery');
  assert.equal(b.get(CH), null);
});

test('control: cleanup without the verification deletes a sole and a conflicting value; without the recheck it deletes a value changed during the check', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const ctx2 = ctxOf(oldInitial()); await oldReaderEnables(ctx2);
  const w = await boot(ctx2, 'unverified');
  ctx2.local.setItem(CH, 'ONLY-RAW-AND-DIFFERENT');
  const r = await w.control.removePlaintext();
  assert.ok(r.removed.includes(CH) && ctx2.local.getItem(CH) === null, 'unguarded cleanup destroys an unverified value');
  const ctx3 = ctxOf(oldInitial()); await oldReaderEnables(ctx3);
  const n = await boot(ctx3, 'noRecheck');
  const realRead = ctx3.adapter.readLog; let armed = true;
  ctx3.adapter.readLog = async () => { const log = await realRead.call(ctx3.adapter); if (armed) { armed = false; ctx3.local.setItem(CH, 'CHANGED-DURING-READBACK'); } return log; };
  const r3 = await n.control.removePlaintext();
  assert.ok(r3.removed.includes(CH) && ctx3.local.getItem(CH) === null, 'without the recheck a value that changed during the check is deleted');
});

test('control: the old reader itself (no new classes) leaves the unknown stores raw and reports no remaining copy', async (t) => {
  if (!haveOld) return t.skip('old revision not present');
  const ctx = ctxOf(oldInitial()); await oldReaderEnables(ctx);
  const mods = await loadModules(built.old, { local: ctx.local, session: ctx.session, locks: lockFree });
  assert.deepEqual(mods.store.plaintextRemains(ctx.local, ctx.session).filter((k) => NEW_KEYS.includes(k)), []);
  assert.equal(ctx.local.getItem(CH), chars);
});
