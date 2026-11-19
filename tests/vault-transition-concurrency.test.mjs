// Parallel actors and abrupt termination for the newer-store -> older-vault -> newer-reader recovery and cleanup (the shared writer boundary in chat/vault/).
// Each actor is a separate PROCESS running the REAL copied chat/vault modules (key table gets the two supplied new-store classes; nothing else differs), with a shared
// vault folder, a shared localStorage folder and a Web Locks stand-in that frees the lock when the holder dies. Every scenario runs CONC_REPEAT times (default 20) in a fresh scratch.
//
// Stated invariants (checked in every repeat):
//   I1 one writer      exactly one actor holds the single vault-writer claim; no second claim bypass.
//   I2 no lost update  every raw value that existed is still raw, or the stored vault holds an equal value; a value changed by another tab is never overwritten or removed unseen.
//   I3 no duplication  each recovered key and the marker are written once: the stored log has exactly baseline+3 contiguous records and none is damaged.
//   I4 no torn read    every read in every actor is null-free and equals the value that exists (the raw one or the encrypted one): never null, never half, never a third value.
//   I5 conflicts kept  an encrypted value and a different raw value both survive every actor and every cleanup.
//   I6 no deadlock     every actor finishes inside the timeout; after SIGKILL the next actors still get the claim and finish recovery (the lock is freed by the death).
// Negative controls (the old code, no lock, cleanup without verification) must violate these in every repeat.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import readline from 'node:readline';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createVault } from '../chat/vault/vault.mjs';
import { buildModules, loadModules, oldRevAvailable, scratchRoot, fileAdapter, fileStorage, startBroker, NEW_KEYS, skipOld } from './helpers/vault-transition-rig.mjs';

const [CH, EN] = NEW_KEYS, FAST = 1000, REPEAT = Number(process.env.CONC_REPEAT || 20), TIMEOUT = 40000;
const here = path.dirname(fileURLToPath(import.meta.url)), ACTOR = path.join(here, 'helpers', 'vault-transition-actor.mjs');
const root = scratchRoot();
const haveOld = oldRevAvailable();
const built = { new: buildModules(path.join(root, 'new'), 'new'), unverified: buildModules(path.join(root, 'ctl-unverified'), 'new-unverified-cleanup'), absenceProof: buildModules(path.join(root, 'ctl-absence-proof'), 'new-absence-is-proof'), fallbackExclusive: buildModules(path.join(root, 'ctl-fallback-exclusive'), 'new-fallback-is-exclusive') };
if (haveOld) { built.old = buildModules(path.join(root, 'old'), 'old'); built.oldNewTable = buildModules(path.join(root, 'ctl-old-new-table'), 'old-new-table'); }
const chars = JSON.stringify({ v: 1, records: [{ id: 'c-1', name: 'Synthetic Pip', text: 'SYNTH-CHAR-1' }] });
const encs = JSON.stringify({ v: 1, encounters: [{ id: 'e-1', note: 'SYNTH-ENC-1' }] });
const prefs = '{"enterSends":true}', threadsRaw = JSON.stringify([{ id: 't0', title: 'Chat 0', messages: [{ role: 'user', content: 'hi' }] }]);
const EXPECT = { [CH]: chars, [EN]: encs, 'plc.prefs.v1': prefs };
const BASE_RECORDS_TOLD = Symbol('base');

/** A scratch state as the old reader leaves it: vault on (old build migrated the keys it knows), the new stores still raw. */
async function makeState(name, i, { encVault = null, deletedCompacted = false } = {}) {
  const dir = path.join(root, 'conc', name + '-' + i); fs.rmSync(dir, { recursive: true, force: true });
  const paths = { dir, vaultDir: path.join(dir, 'vault'), localDir: path.join(dir, 'local'), sessionDir: path.join(dir, 'session') };
  const local = fileStorage(paths.localDir), session = fileStorage(paths.sessionDir), adapter = fileAdapter(paths.vaultDir);
  for (const [k, v] of Object.entries({ [CH]: chars, [EN]: encs, 'plc.prefs.v1': prefs, chatThreads: threadsRaw })) local.setItem(k, v);
  const mods = await loadModules(built.old, { local, session, locks: undefined });
  const mig = await mods.store.createAndMigrate({ passphrase: 'pw', adapter, realLocal: local, realSession: session, iterations: FAST });
  if (encVault) { for (const [k, v] of Object.entries(encVault)) await mig.session.setKv('l/' + k, v); await mig.session.flush(); }
  if (deletedCompacted) { await mig.session.setKv('l/' + CH, chars); await mig.session.delKv('l/' + CH); await mig.session.compact(); await mig.session.flush(); } // the store was encrypted, deleted, the log compacted; the plaintext copy was retained
  mig.session.lock();
  return { ...paths, local, session, adapter, baseline: adapter.count() };
}

function spawnActor(cfg) {
  const child = spawn(process.execPath, [ACTOR, JSON.stringify(cfg)], { stdio: ['pipe', 'pipe', 'inherit'] });
  const messages = [], waiters = [];
  const actor = { child, messages, cfg, exited: new Promise((resolve) => child.on('exit', (code, signal) => resolve({ code, signal }))) };
  readline.createInterface({ input: child.stdout }).on('line', (line) => { let m; try { m = JSON.parse(line); } catch { return; } messages.push(m); for (const w of [...waiters]) if (w.test(m)) { waiters.splice(waiters.indexOf(w), 1); w.resolve(m); } });
  actor.waitFor = (type) => { const hit = messages.find((m) => m.t === type); if (hit) return Promise.resolve(hit); return new Promise((resolve) => waiters.push({ test: (m) => m.t === type, resolve })); };
  return actor;
}
const deadline = (promise, what) => Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('deadlock/timeout: ' + what)), TIMEOUT))]);

/** Start all actors, release them together, collect results. kill: index of the actor to SIGKILL when it reaches its phase. */
async function runBatch(state, broker, specs, { kill = null } = {}) {
  const actors = specs.map((s, n) => spawnActor({ store: s.kind.store, control: s.kind.control, vaultDir: state.vaultDir, localDir: state.localDir, sessionDir: state.sessionDir, socket: broker.socketPath, locks: s.locks, role: s.role || 'boot', readKeys: [CH, EN, 'plc.prefs.v1'], expected: EXPECT, readLoops: 30, ...s.extra, n }));
  await deadline(Promise.all(actors.map((a) => a.waitFor('ready'))), 'actors ready');
  for (const a of actors) a.child.stdin.write('go\n'); // released together
  const out = [];
  for (const [n, a] of actors.entries()) {
    if (kill === n) { const p = await deadline(a.waitFor('phase'), 'phase ' + a.cfg.killAt); a.child.kill('SIGKILL'); const ex = await deadline(a.exited, 'killed exit'); out.push({ killed: true, phase: p.name, signal: ex.signal, survived: a.messages.some((m) => m.t === 'survived-the-wait') }); continue; }
    out.push(await deadline(a.waitFor('result'), 'result of actor ' + n));
  }
  for (const a of actors) if (!a.messages.some((m) => m.t === 'phase')) a.child.stdin.write('exit\n'); // every tab closes only after all have finished: the writer keeps its claim to the end
  for (const a of actors) await deadline(a.exited, 'exit');
  return out;
}

async function stored(state) {
  const log = await state.adapter.readLog();
  const s = await createVault({ adapter: state.adapter }).unlock('pw');
  const view = { kv: new Map(s.state.kv), damaged: s.damaged.length, seqs: log.map((r) => r.seq) }; s.lock(); return view;
}
const contiguous = (seqs) => seqs.every((s, i) => s === i + 1);
const rawOf = (state, k) => state.local.getItem(k);

/** Invariants common to every scenario; returns the list of violations. */
async function check(state, results, { writers = 1, records = 3, expectKeys = [CH, EN] } = {}) {
  const v = []; const st = await stored(state);
  const live = results.filter((r) => !r.killed);
  if (live.filter((r) => r.writer === true).length !== writers) v.push('I1 writers=' + live.filter((r) => r.writer === true).length);
  for (const r of live) { if (r.error) v.push('actor error ' + r.error); if (r.nullReads || r.torn) v.push('I4 null=' + r.nullReads + ' torn=' + r.torn); for (const k of expectKeys) if (r.reads?.[k] !== EXPECT[k]) v.push('I4 first read of ' + k + ' = ' + String(r.reads?.[k]).slice(0, 30)); }
  if (st.damaged) v.push('I3 damaged records ' + st.damaged);
  if (!contiguous(st.seqs)) v.push('I3 seqs not contiguous ' + st.seqs.join(','));
  if (records != null && st.seqs.length !== state.baseline + records) v.push('I3 records ' + st.seqs.length + ' != ' + (state.baseline + records));
  for (const k of expectKeys) { const raw = rawOf(state, k), enc = st.kv.get('l/' + k); if (raw == null && enc !== EXPECT[k]) v.push('I2 ' + k + ' lost'); if (raw != null && raw !== EXPECT[k]) v.push('I2 raw ' + k + ' changed'); if (enc != null && enc !== EXPECT[k]) v.push('I2 vault ' + k + ' wrong'); }
  return v;
}

async function repeated(name, fn) { const all = []; for (let i = 0; i < REPEAT; i++) all.push(...(await fn(i)).map((x) => `repeat ${i}: ${x}`)); return all; }
let sockets = 0;
async function withBroker(i, name, fn, opts) {
  const sock = path.join(root, `s${++sockets}.sock`); // short: a unix socket path is limited to about 100 characters
  const broker = await startBroker(sock, opts); broker.socketPath = sock;
  try { return await fn(broker); } finally { await broker.close(); try { fs.unlinkSync(sock); } catch { /* gone */ } }
}
/** The most Web Lock grants that were held AT THE SAME TIME (a sequence of claims one after another is not concurrent ownership). */
const maxHolders = (events) => { let now = 0, max = 0; for (const e of events) { if (e.kind === 'grant') max = Math.max(max, ++now); else if (e.kind === 'free') now--; } return max; };
const N = built.new, writerSpec = (role, extra) => ({ kind: N, role, ...extra });

test('A same recovery: 6 parallel tabs start on one vault with two sole raw stores', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('A', async (i) => withBroker(i, 'A', async (broker) => {
    const state = await makeState('A', i);
    const res = await runBatch(state, broker, Array.from({ length: 6 }, () => writerSpec('boot')));
    const v = await check(state, res);
    const first = broker.events.find((e) => e.kind === 'grant'); if (!first || res.find((r) => r.pid === first.pid)?.writer !== true) v.push('I1 the first grant did not go to the writer');
    if (maxHolders(broker.events) !== 1) v.push('I1 simultaneous holders ' + maxHolders(broker.events));
    return v;
  }));
  assert.deepEqual(bad, []);
});

test('B same migration and same cleanup: 6 tabs recover and all try to clean up; only the writer removes, only verified copies', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('B', async (i) => withBroker(i, 'B', async (broker) => {
    const state = await makeState('B', i);
    const res = await runBatch(state, broker, Array.from({ length: 6 }, () => writerSpec('boot-cleanup')));
    const v = await check(state, res, { records: 3 });
    const removers = res.filter((r) => r.removed?.length), roErr = res.filter((r) => r.cleanupError === 'read-only');
    if (removers.length !== 1) v.push('I1 removers ' + removers.length);
    if (roErr.length !== 5) v.push('I1 read-only refusals ' + roErr.length);
    // the writer removed raw only after its own stored readback verified it; afterwards the raw copies of keys it recovered are gone and the vault holds them
    const st = await stored(state);
    for (const k of [CH, EN]) if (st.kv.get('l/' + k) !== EXPECT[k]) v.push('I2 vault lacks ' + k + ' after cleanup');
    if (rawOf(state, CH) != null || rawOf(state, EN) != null) v.push('verified raw copies should be gone');
    // a tab opened afterwards sees everything from the vault alone
    const again = await runBatch(state, broker, [writerSpec('boot')]);
    for (const k of [CH, EN]) if (again[0].reads?.[k] !== EXPECT[k] || again[0].nullReads) v.push('I4 late tab read of ' + k);
    return v;
  }));
  assert.deepEqual(bad, []);
});

test('C different conflicts at once: a conflicting stored value, a raw value changed by another tab, and cleanups, all in parallel', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('C', async (i) => withBroker(i, 'C', async (broker) => {
    const state = await makeState('C', i, { encVault: { [EN]: '{"v":1,"encounters":[{"id":"encrypted-A"}]}' } });
    const changed = '{"v":1,"records":[{"id":"changed-by-other-tab-' + i + '"}]}';
    const res = await runBatch(state, broker, [writerSpec('boot-cleanup'), writerSpec('boot-cleanup'), writerSpec('boot-cleanup'), writerSpec('boot'), { kind: N, role: 'raw-writer', extra: { key: CH, value: changed, delayMs: i % 7 } }, writerSpec('boot')]);
    const v = []; const st = await stored(state);
    const live = res.filter((r) => !r.killed && r.role !== 'raw-writer');
    if (live.filter((r) => r.writer === true).length !== 1) v.push('I1 writers');
    for (const r of live) { if (r.error) v.push('actor error ' + r.error); if (r.nullReads) v.push('I4 null read'); if (r.reads?.[EN] !== '{"v":1,"encounters":[{"id":"encrypted-A"}]}') v.push('I5 conflict read ' + String(r.reads?.[EN]).slice(0, 40)); if (r.reads?.[CH] !== chars && r.reads?.[CH] !== changed) v.push('I4 CH read a third value'); }
    if (rawOf(state, EN) !== encs) v.push('I5 raw EN not preserved'); if (st.kv.get('l/' + EN) !== '{"v":1,"encounters":[{"id":"encrypted-A"}]}') v.push('I5 vault EN changed');
    const raw = rawOf(state, CH), enc = st.kv.get('l/' + CH);
    if (raw == null && enc !== changed) v.push('I2 changed CH lost (raw gone, vault=' + String(enc).slice(0, 30) + ')');
    if (raw != null && raw !== changed) v.push('I2 raw CH is a third value');
    if (enc != null && enc !== chars && enc !== changed) v.push('I2 vault CH third value');
    if (!contiguous(st.seqs) || st.damaged) v.push('I3 log');
    return v;
  }));
  assert.deepEqual(bad, []);
});

const KILLS = ['pre-append:1', 'post-append:1', 'pre-append:2', 'post-append:2', 'pre-append:3', 'post-append:3'];
for (const killAt of KILLS) test(`D abrupt termination of the writer at ${killAt}, then 4 tabs recover`, async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('D', async (i) => withBroker(i, 'D' + killAt, async (broker) => {
    const state = await makeState('D-' + killAt.replace(':', '_'), i);
    const killed = (await runBatch(state, broker, [{ kind: N, role: 'boot', extra: { killAt } }], { kill: 0 }))[0];
    const v = [];
    if (killed.signal !== 'SIGKILL' || killed.survived || killed.phase !== killAt) v.push('kill did not land ' + JSON.stringify(killed));
    const mid = await stored(state); // the half-done state parses, has no damage, no gap
    if (mid.damaged || !contiguous(mid.seqs)) v.push('I3 torn after kill');
    for (const k of [CH, EN]) if (rawOf(state, k) !== EXPECT[k]) v.push('I2 raw changed by the killed writer');
    const res = await runBatch(state, broker, Array.from({ length: 4 }, () => writerSpec('boot-cleanup')));
    v.push(...await check(state, res, { records: null }));
    const st = await stored(state);
    if (st.seqs.length > state.baseline + 3) v.push('I3 duplicate records ' + st.seqs.length);
    for (const k of [CH, EN]) if (st.kv.get('l/' + k) !== EXPECT[k]) v.push('I6 not recovered ' + k);
    return v;
  }));
  assert.deepEqual(bad, []);
});

for (const killAt of ['pre-remove:1', 'post-remove:1', 'pre-remove:2', 'post-remove:2']) test(`D' abrupt termination of the writer during cleanup at ${killAt}`, async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('Dc', async (i) => withBroker(i, 'Dc' + killAt, async (broker) => {
    const state = await makeState('Dc-' + killAt.replace(':', '_'), i);
    const killed = (await runBatch(state, broker, [{ kind: N, role: 'boot-cleanup', extra: { killAt } }], { kill: 0 }))[0];
    const v = []; if (killed.signal !== 'SIGKILL' || killed.survived) v.push('kill did not land ' + JSON.stringify(killed));
    const st = await stored(state);
    for (const k of [CH, EN, 'plc.prefs.v1']) { const raw = rawOf(state, k), enc = st.kv.get('l/' + k); if (raw == null && enc !== EXPECT[k]) v.push('I2 ' + k + ' lost after the cleanup was killed'); if (raw != null && raw !== EXPECT[k]) v.push('I2 raw ' + k + ' changed'); }
    const res = await runBatch(state, broker, Array.from({ length: 3 }, () => writerSpec('boot-cleanup')));
    const after = await stored(state);
    for (const k of [CH, EN]) { const raw = rawOf(state, k), enc = after.kv.get('l/' + k); if (raw == null && enc !== EXPECT[k]) v.push('I2 ' + k + ' lost'); }
    for (const r of res.filter((x) => !x.killed)) { if (r.error || r.nullReads) v.push('I4/I6 ' + (r.error || 'null reads')); for (const k of [CH, EN]) if (r.reads?.[k] !== EXPECT[k]) v.push('I4 read ' + k); }
    if (after.damaged || !contiguous(after.seqs) || after.seqs.length > state.baseline + 3) v.push('I3 log');
    return v;
  }));
  assert.deepEqual(bad, []);
});

test('E ambiguous history: 6 tabs boot on a compacted log that once held the deleted new store; nobody resurrects it, nobody writes, every read is the raw copy', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('E', async (i) => withBroker(i, 'E', async (broker) => {
    const state = await makeState('E', i, { deletedCompacted: true });
    const before = state.adapter.count();
    const res = await runBatch(state, broker, Array.from({ length: 6 }, (_, n) => writerSpec(n % 2 ? 'boot-retry' : 'boot-cleanup', { extra: { discard: true } })));
    const v = []; const st = await stored(state);
    if (st.seqs.length !== before) v.push('I3 records written ' + (st.seqs.length - before)); if (st.kv.has('l/' + CH) || st.kv.has('l/' + EN)) v.push('resurrected');
    if (maxHolders(broker.events) !== 1) v.push('I1 holders ' + maxHolders(broker.events));
    for (const r of res) { if (r.error) v.push('actor error ' + r.error); if (r.nullReads || r.torn) v.push('I4 reads'); for (const k of [CH, EN]) if (r.reads?.[k] !== EXPECT[k]) v.push('I4 read ' + k); if (r.removed?.includes(CH) || r.removed?.includes(EN)) v.push('I2 removed a held sole value'); if (r.retry?.recovered?.length) v.push('retry recovered ' + r.retry.recovered); }
    for (const k of [CH, EN]) if (rawOf(state, k) !== EXPECT[k]) v.push('I2 raw ' + k + ' changed');
    if (!res.some((r) => r.recovery?.held?.some((h) => h.reason === 'history-unproven'))) v.push('not held visibly');
    return v;
  }));
  assert.deepEqual(bad, []);
});

test('F no Web Locks: 4 tabs with the fallback claim all think they are writers, none recovers, cleans up or writes; the baseline stays readable', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('F', async (i) => withBroker(i, 'F', async (broker) => {
    const state = await makeState('F', i); const before = state.adapter.count();
    const res = await runBatch(state, broker, Array.from({ length: 4 }, (_, n) => writerSpec(n % 2 ? 'boot-retry' : 'boot-cleanup', { locks: 'none' })));
    const v = []; const st = await stored(state);
    if (st.seqs.length !== before) v.push('I3 records written ' + (st.seqs.length - before));
    for (const r of res) { if (r.error) v.push('actor error ' + r.error); if (r.nullReads) v.push('I4 null'); if (r.recovery?.recovered?.length) v.push('recovered without exclusivity'); if (r.cleanupError !== undefined && r.cleanupError !== 'no-exclusive') v.push('cleanup error ' + r.cleanupError); if (r.role === 'boot-cleanup' && r.cleanupError !== 'no-exclusive') v.push('cleanup was not refused'); if (r.role === 'boot-retry' && r.retryError !== 'no-exclusive') v.push('retry was not refused'); }
    for (const k of [CH, EN]) if (rawOf(state, k) !== EXPECT[k]) v.push('I2 raw ' + k);
    return v;
  }));
  assert.deepEqual(bad, []);
});

test('G different operations at once on a held state: the writer retries while other tabs retry, clean up and read', async (t) => {
  if (!haveOld) return skipOld(t);
  const bad = await repeated('G', async (i) => withBroker(i, 'G', async (broker) => {
    const state = await makeState('G', i);
    const res = await runBatch(state, broker, [writerSpec('boot-retry'), writerSpec('boot-cleanup'), writerSpec('boot-retry'), writerSpec('boot'), writerSpec('boot-cleanup'), writerSpec('boot')]);
    const v = await check(state, res, { records: 3 });
    const st = await stored(state);
    for (const k of [CH, EN]) if (st.kv.get('l/' + k) !== EXPECT[k]) v.push('I2 vault lacks ' + k);
    const removers = res.filter((r) => r.removed?.length).length; if (removers > 1) v.push('I1 removers ' + removers);
    return v;
  }));
  assert.deepEqual(bad, []);
});

// ---- negative controls: each must violate the invariants in EVERY repeat --------------------------------------------------------------------------------------------------

test('control: the old code with the new key table (no recovery) violates I4 in every repeat', async (t) => {
  if (!haveOld) return skipOld(t);
  let violated = 0;
  for (let i = 0; i < REPEAT; i++) await withBroker(i, 'N1', async (broker) => {
    const state = await makeState('N1', i);
    const res = await runBatch(state, broker, Array.from({ length: 4 }, () => ({ kind: built.oldNewTable, role: 'boot' })));
    if (res.every((r) => r.reads?.[CH] === null && r.nullReads > 0)) violated++;
  });
  assert.equal(violated, REPEAT);
});

test('control: treating the no-Web-Locks fallback as exclusive lets several tabs recover at once (modelled violation, never production behaviour) in every repeat', async (t) => {
  if (!haveOld) return skipOld(t);
  let violated = 0;
  for (let i = 0; i < REPEAT; i++) await withBroker(i, 'N2', async (broker) => {
    const state = await makeState('N2', i);
    const res = await runBatch(state, broker, Array.from({ length: 4 }, () => ({ kind: built.fallbackExclusive, role: 'boot', locks: 'none' })));
    if (res.filter((r) => r.writer === true).length > 1 && res.filter((r) => r.recovery?.recovered?.length).length >= 1) violated++; // several writers, and the multi-await copy ran under them
  });
  assert.equal(violated, REPEAT);
});

test('control: taking absence from a compacted log as proof resurrects the deleted stores in every repeat (E violated)', async (t) => {
  if (!haveOld) return skipOld(t);
  let violated = 0;
  for (let i = 0; i < REPEAT; i++) await withBroker(i, 'N5', async (broker) => {
    const state = await makeState('N5', i, { deletedCompacted: true });
    await runBatch(state, broker, Array.from({ length: 3 }, () => ({ kind: built.absenceProof, role: 'boot' })));
    if ((await stored(state)).kv.get('l/' + CH) === chars) violated++;
  });
  assert.equal(violated, REPEAT);
});

test('control: cleanup without verification removes a conflicting and a sole raw value in every repeat (I2, I5)', async (t) => {
  if (!haveOld) return skipOld(t);
  let violated = 0;
  for (let i = 0; i < REPEAT; i++) await withBroker(i, 'N3', async (broker) => {
    const state = await makeState('N3', i, { encVault: { [EN]: '{"v":1,"encounters":[{"id":"encrypted-A"}]}' } });
    await runBatch(state, broker, [{ kind: built.unverified, role: 'boot-cleanup', extra: { discard: false } }]);
    if (rawOf(state, EN) == null) violated++; // the different raw value was deleted although the vault holds another value
  });
  assert.equal(violated, REPEAT);
});

test('control: a lock that is never freed after a kill (no kernel release) leaves the next tabs read-only: recovery never completes (I6 modelled)', async (t) => {
  if (!haveOld) return skipOld(t);
  let violated = 0;
  for (let i = 0; i < Math.min(REPEAT, 5); i++) await withBroker(i, 'N4', async (broker) => {
    const state = await makeState('N4', i);
    await runBatch(state, broker, [{ kind: N, role: 'boot', extra: { killAt: 'pre-append:1' } }], { kill: 0 });
    const res = await runBatch(state, broker, [writerSpec('boot')]);
    if (res[0].writer === false) violated++;
  }, { leakOnDisconnect: true });
  assert.equal(violated, Math.min(REPEAT, 5));
});
