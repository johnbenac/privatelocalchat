// Targeted ACTUAL browser IndexedDB proof of the vault adapter's wait boundary (not an application end-to-end test). Run: node tests/helpers/vault-transition-idb.mjs
//
// The page imports the app's REAL chat/vault/vault-db.mjs and vault.mjs (served unmodified from this checkout) and drives the real createIndexedDbAdapter against a real IndexedDB database
// in a dedicated persistent Chromium profile. The only fixture is a factory that holds the database's open request until the test releases it: that is how an action sits inside
// `await open()` (even a cached open yields) while the page locks / swaps its session. Synthetic data only.
//
// What it proves, per mutator (append and the destructive clear; writeHeader and replaceLog share the same path):
//   * delayed open, lifecycle changes while waiting -> the mutation is NEVER initiated (no transaction is created), existing data and a replacement's later write are preserved;
//   * positive controls: a still-valid guard, no guard (every existing caller), a cached open;
//   * queued behind a HELD PRIOR transaction (observed, not slept): the action's transaction exists and its activity probe is queued, its first guard was live; the lifecycle ends; the prior
//     transaction is released; the guard is asked again at the transaction's activity, refuses, and the transaction aborts before any mutation request exists;
//   * linearization: the guard, the readwrite transaction and the activity probe are one synchronous run after the open; the guard is asked again in the callback that places the mutation;
//   * queued actions behind one slow open: each decides at its own turn. Creating a transaction or queueing a request is NOT a commitment (it can still be aborted); only the commit after the mutation
//     was placed under a true activity guard cannot be taken back, and its completion may be reported later (a notification, not a new start);
//   * engine level: a vault session whose append waits in a delayed open does not persist after its guard fails.
// Exit status 1 when any assertion fails (on the unguarded adapter of the rejected candidate the delayed-open cases FAIL: that is the RED proof).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const PROFILE_ROOT = process.env.PLC_IDB_PROFILE_ROOT || (fs.existsSync('/media/Vivarium/plc-vault-transition-20261117-c') ? '/media/Vivarium/plc-vault-transition-20261117-c' : path.join(os.tmpdir(), 'plc-vault-transition-idb'));
fs.mkdirSync(PROFILE_ROOT, { recursive: true });
// PLC_IDB_VAULT_DIR (a folder holding vault.mjs / vault-db.mjs) lets the SAME proof run against another copy of the modules: the negative control runs it on the rejected candidate's files.
const VAULT_DIR = process.env.PLC_IDB_VAULT_DIR || path.join(ROOT, 'chat', 'vault');
const profile = fs.mkdtempSync(path.join(PROFILE_ROOT, 'idb-profile-')); // owned by this process; removed at the end

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>vault idb</title>'); return; }
  if (!url.pathname.startsWith('/chat/vault/') || !url.pathname.endsWith('.mjs') || url.pathname.includes('..')) { res.statusCode = 404; res.end(); return; }
  const file = path.join(VAULT_DIR, url.pathname.slice('/chat/vault/'.length));
  try { res.setHeader('content-type', 'text/javascript'); res.end(fs.readFileSync(file)); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port;

const context = await chromium.launchPersistentContext(profile, { headless: true });
const page = context.pages()[0] || await context.newPage();
await page.goto(origin + '/');

/** Runs inside the page: shared fixtures, then one case. Results are plain data. */
const PRELUDE = `
const { createIndexedDbAdapter } = await import('/chat/vault/vault-db.mjs');
const { createVault } = await import('/chat/vault/vault.mjs');
const uid = () => Math.random().toString(36).slice(2);
const rec = (seq) => ({ seq, keyId: 'dek', iv: 'AA==', data: 'AA==' });
const makeGate = () => { let release, reached; const promise = new Promise((r) => { release = r; }), reachedP = new Promise((r) => { reached = r; }); return { promise, release, reachedP, reached }; };
// a factory whose open request succeeds only after the gate is released (the database itself is real)
const delayedFactory = (gate) => ({ open(name, version) {
  const real = indexedDB.open(name, version), fake = {};
  Object.defineProperty(fake, 'result', { get: () => real.result }); Object.defineProperty(fake, 'error', { get: () => real.error });
  real.onupgradeneeded = () => fake.onupgradeneeded && fake.onupgradeneeded();
  real.onsuccess = () => { gate.reached(); gate.promise.then(() => fake.onsuccess && fake.onsuccess()); };
  real.onerror = () => fake.onerror && fake.onerror(); real.onblocked = () => fake.onblocked && fake.onblocked();
  return fake; } });
async function seed(name) { const a = createIndexedDbAdapter({ name }); await a.writeHeader({ format: 'seed', wraps: [] }); await a.append(rec(1)); return a; }
const outcome = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: e && e.code, message: String(e && e.message) }));
const seqsOf = async (a) => (await a.readLog()).map((r) => r.seq);
`;
const inPage = (body) => page.evaluate(`(async () => { ${PRELUDE}\n${body}\n})()`);

const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (error) { results.push({ name, pass: false, error: String(error.message).split('\n').slice(0, 6).join(' | ') }); console.log('FAIL', name, '::', String(error.message).split('\n').slice(0, 6).join(' | ')); } };

// ---- delayed open: append ----------------------------------------------------------------------------------------------------------------------------------------------------
await check('delayed open + lifecycle change: the stale append is never initiated; data and a replacement write survive', async () => {
  const r = await inPage(`
    const name = 'plc-idb-append-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    let live = true; const stale = outcome(a.append(rec(2), { guard: () => live }));
    await gate.reachedP; live = false;               // the page locks / swaps its session while the append waits for the open
    await seeded.append(rec(2));                       // the replacement session's own write lands at that seq meanwhile
    gate.release(); const out = await stale;
    return { out, seqs: await seqsOf(seeded), header: Boolean(await seeded.readHeader()) };`);
  assert.equal(r.out.ok, false, 'the stale append must not report success'); assert.equal(r.out.code, 'session-changed');
  assert.deepEqual(r.seqs, [1, 2], 'only the replacement record exists (if the stale one had been initiated it would have conflicted or replaced it)'); assert.equal(r.header, true);
});
await check('delayed open + lifecycle change: the stale append does not persist even when nothing else writes (no phantom record)', async () => {
  const r = await inPage(`
    const name = 'plc-idb-append2-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    let live = true; const stale = outcome(a.append(rec(2), { guard: () => live })); await gate.reachedP; live = false; gate.release(); const out = await stale;
    return { out, seqs: await seqsOf(seeded) };`);
  assert.equal(r.out.ok, false); assert.deepEqual(r.seqs, [1], 'the stored log is exactly what it was');
});
// ---- delayed open: destructive clear -----------------------------------------------------------------------------------------------------------------------------------------
await check('delayed open + lifecycle change: the stale clear is never initiated; header, log and the replacement survive', async () => {
  const r = await inPage(`
    const name = 'plc-idb-clear-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    let live = true; const stale = outcome(a.clear({ guard: () => live })); await gate.reachedP; live = false;
    await seeded.append(rec(2)); gate.release(); const out = await stale;
    return { out, header: await seeded.readHeader(), seqs: await seqsOf(seeded) };`);
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'session-changed'); assert.ok(r.header, 'the vault header survives'); assert.deepEqual(r.seqs, [1, 2], 'the existing log and the replacement record survive');
});
// ---- QUEUED behind a held prior transaction (root-required): creating the transaction / queueing a request is NOT a commitment; the queued action is only decided when it RUNS --------------
// The test OBSERVES (scoped instrumentation of this page's IndexedDB prototypes, restored in a finally) that the stale action's readwrite transaction exists and its activity probe is queued, and that its
// initial guard was live, BEFORE it flips the lifecycle and releases the prior transaction. No sleeps stand in for that observation.
const HELD = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function holdPrior(name) {                       // a real prior readwrite transaction that stays open (it keeps issuing reads) until released
    const db = await new Promise((resolve) => { const q = indexedDB.open(name, 1); q.onsuccess = () => resolve(q.result); });
    let hold = true; const t = db.transaction(['header', 'log'], 'readwrite'), store = t.objectStore('log'), done = new Promise((r) => { t.oncomplete = r; t.onabort = r; });
    const keep = () => { if (hold) store.get(987654).onsuccess = keep; }; keep();
    return { release: async () => { hold = false; await done; db.close(); } };
  }
  function observe() {                                    // installed AFTER the prior transaction exists, so it only sees the action under test
    const log = [], T = IDBDatabase.prototype.transaction, N = IDBObjectStore.prototype.count, A = IDBObjectStore.prototype.add, C = IDBObjectStore.prototype.clear;
    let reached; const probe = new Promise((r) => { reached = r; });
    IDBDatabase.prototype.transaction = function (s, m, ...r) { log.push('transaction:' + m); return T.call(this, s, m, ...r); };
    IDBObjectStore.prototype.count = function (...r) { log.push('activity-probe'); reached(true); return N.apply(this, r); };
    IDBObjectStore.prototype.add = function (...r) { log.push('add'); return A.apply(this, r); };
    IDBObjectStore.prototype.clear = function (...r) { log.push('clear:' + this.name); return C.apply(this, r); };
    return { log, probe, restore() { IDBDatabase.prototype.transaction = T; IDBObjectStore.prototype.count = N; IDBObjectStore.prototype.add = A; IDBObjectStore.prototype.clear = C; } };
  }
  const barrier = (obs) => Promise.race([obs.probe, sleep(3000).then(() => false)]);   // a bounded wait for the OBSERVATION (false = never queued, e.g. an adapter without the activity check)`;
for (const action of ['append', 'clear']) await check(`queued behind a held prior transaction: a ${action} whose lifecycle ended while it waited aborts at transaction activity, preserving data and the replacement`, async () => {
  const r = await inPage(`${HELD}
    const name = 'plc-idb-held-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); await a.readHeader();      // the open is cached: the action is queued by the TRANSACTION, not by the open
    const prior = await holdPrior(name); const obs = observe(), guards = []; let live = true; const guard = () => { guards.push(live); return live; };
    let out, queued, before, guardsBefore, after, guardsAfter;
    try {
      const stale = outcome('${action}' === 'append' ? a.append(rec(2), { guard }) : a.clear({ guard }));
      queued = await barrier(obs);                          // OBSERVED: the readwrite transaction is created and its first request (the activity probe) is queued behind the prior transaction
      before = obs.log.slice(); guardsBefore = guards.slice();
      live = false; await prior.release(); out = await stale;   // the lifecycle ends while it waits; only now does the prior transaction finish and the queued one run
      after = obs.log.slice(); guardsAfter = guards.slice();
    } finally { obs.restore(); }
    const afterStale = { header: await seeded.readHeader(), seqs: await seqsOf(seeded) };
    await seeded.append(rec(2)); return { out, queued, before, guardsBefore, after, guardsAfter, afterStale, final: await seqsOf(seeded) };`);
  assert.equal(r.queued, true, 'the stale action was observed queued (transaction + activity probe) before the lifecycle changed');
  assert.deepEqual(r.before, ['transaction:readwrite', 'activity-probe'], 'queued, and no mutation had been requested'); assert.deepEqual(r.guardsBefore, [true], 'its initial guard (after the open) was observed live');
  assert.deepEqual(r.guardsAfter, [true, false], 'asked again at the transaction\'s activity, and refused'); assert.deepEqual(r.after, r.before, 'no mutation request was ever placed after the prior transaction finished');
  assert.equal(r.out.ok, false, 'the stale action must not report success'); assert.equal(r.out.code, 'session-changed');
  assert.ok(r.afterStale.header, 'the header survives'); assert.deepEqual(r.afterStale.seqs, [1], 'the stored log is unchanged'); assert.deepEqual(r.final, [1, 2], 'the replacement write is not displaced');
});
await check('queued behind a held prior transaction, positive: a still-live append is observed queued, then runs in order once the prior transaction finishes', async () => {
  const r = await inPage(`${HELD}
    const name = 'plc-idb-held2-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); await a.readHeader();
    const prior = await holdPrior(name); const obs = observe(); let queued, before, after, out;
    try { const p = outcome(a.append(rec(2), { guard: () => true })); queued = await barrier(obs); before = obs.log.slice(); await prior.release(); out = await p; after = obs.log.slice(); } finally { obs.restore(); }
    return { out, queued, before, after, seqs: await seqsOf(seeded) };`);
  assert.equal(r.queued, true); assert.deepEqual(r.before, ['transaction:readwrite', 'activity-probe']); assert.deepEqual(r.after, ['transaction:readwrite', 'activity-probe', 'add'], 'the mutation is placed only when the transaction runs');
  assert.equal(r.out.ok, true); assert.deepEqual(r.seqs, [1, 2]);
});
// ---- writeHeader and replaceLog (same transaction path) -----------------------------------------------------------------------------------------------------------------------
await check('delayed open + lifecycle change: writeHeader and replaceLog are not initiated either', async () => {
  const r = await inPage(`
    const name = 'plc-idb-other-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    let live = true; const h = outcome(a.writeHeader({ format: 'stale', wraps: [] }, { guard: () => live })), l = outcome(a.replaceLog({ add: [rec(5)], removeUpTo: 1, guard: () => live }));
    await gate.reachedP; live = false; gate.release(); const [ho, lo] = [await h, await l];
    return { ho, lo, header: await seeded.readHeader(), seqs: await seqsOf(seeded) };`);
  assert.equal(r.ho.ok, false); assert.equal(r.lo.ok, false); assert.equal(r.header.format, 'seed'); assert.deepEqual(r.seqs, [1]);
});
// ---- cached open still yields ---------------------------------------------------------------------------------------------------------------------------------------------------
await check('a CACHED open still yields: a guard that fails in that gap stops append and clear', async () => {
  const r = await inPage(`
    const name = 'plc-idb-cached-' + uid(), a = createIndexedDbAdapter({ name }); await a.writeHeader({ format: 'seed', wraps: [] }); await a.append(rec(1));
    let live = true; const p = outcome(a.append(rec(2), { guard: () => live })); live = false; const out = await p;           // flips before the continuation after await open() runs
    live = true; const c = outcome(a.clear({ guard: () => live })); live = false; const cout = await c;
    return { out, cout, seqs: await seqsOf(a), header: Boolean(await a.readHeader()) };`);
  assert.equal(r.out.ok, false); assert.equal(r.cout.ok, false); assert.deepEqual(r.seqs, [1]); assert.equal(r.header, true);
});
// ---- strict guard: only the boolean true authorizes -------------------------------------------------------------------------------------------------------------------------------
await check('the guard is strict: false, undefined, a truthy non-boolean, a Promise and a throw all refuse; an absent guard keeps every existing caller working', async () => {
  const r = await inPage(`
    const name = 'plc-idb-strict-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }), out = {};
    const guards = { 'false': () => false, 'undefined': () => undefined, 'truthy-string': () => 'yes', 'one': () => 1, 'promise-true': () => Promise.resolve(true), 'throws': () => { throw new Error('boom'); } };
    let seq = 2; for (const [label, guard] of Object.entries(guards)) out[label] = (await outcome(a.append(rec(seq++), { guard }))).ok;
    out.absent = (await outcome(a.append(rec(50)))).ok; out.seqs = await seqsOf(seeded); return out;`);
  for (const k of ['false', 'undefined', 'truthy-string', 'one', 'promise-true', 'throws']) assert.equal(r[k], false, k + ' must not authorize');
  assert.equal(r.absent, true); assert.deepEqual(r.seqs, [1, 50]);
});
// ---- positive controls ----------------------------------------------------------------------------------------------------------------------------------------------------------
await check('positive controls: a valid guard, no guard and a delayed open with a still-valid guard all behave exactly as before', async () => {
  const r = await inPage(`
    const name = 'plc-idb-pos-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    const p = outcome(a.append(rec(2), { guard: () => true })); await gate.reachedP; gate.release(); const delayedOk = await p;
    const noGuard = await outcome(a.append(rec(3))); const second = await outcome(a.append(rec(3), { guard: () => true }));
    const headerOk = await outcome(a.writeHeader({ format: 'seed2', wraps: [] }, { guard: () => true })); const replaced = await outcome(a.replaceLog({ add: [rec(9)], removeUpTo: 3, guard: () => true }));
    const seqs = await seqsOf(seeded); const cleared = await outcome(a.clear({ guard: () => true }));
    return { delayedOk, noGuard, second, headerOk, replaced, seqs, afterClear: { header: await seeded.readHeader(), seqs: await seqsOf(seeded) } };`);
  assert.equal(r.delayedOk.ok, true); assert.equal(r.noGuard.ok, true); assert.equal(r.second.ok, false, 'a duplicate seq is still refused exactly as before (the existing refusal, whatever its error object)');
  assert.equal(r.headerOk.ok, true); assert.equal(r.replaced.ok, true); assert.deepEqual(r.seqs, [9]); assert.equal(r.afterClear.header, null); assert.deepEqual(r.afterClear.seqs, []);
});
// ---- linearization: where the guard sits relative to the transaction ------------------------------------------------------------------------------------------------------------
await check('linearization: guard + transaction + activity probe are one synchronous run; the guard is checked AGAIN at transaction activity, in the same run that places the mutation', async () => {
  const r = await inPage(`
    const name = 'plc-idb-lin-' + uid(); const a = createIndexedDbAdapter({ name }); await a.writeHeader({ format: 'seed', wraps: [] });
    const log = [], T = IDBDatabase.prototype.transaction, A = IDBObjectStore.prototype.add, C = IDBObjectStore.prototype.clear, N = IDBObjectStore.prototype.count;
    IDBDatabase.prototype.transaction = function (stores, mode, ...r) { log.push('transaction:' + mode); return T.call(this, stores, mode, ...r); };
    IDBObjectStore.prototype.add = function (...r) { log.push('add'); return A.apply(this, r); };
    IDBObjectStore.prototype.clear = function (...r) { log.push('clear:' + this.name); return C.apply(this, r); };
    IDBObjectStore.prototype.count = function (...r) { log.push('activity-probe'); return N.apply(this, r); };
    const guard = (label) => () => { log.push('guard:' + label); Promise.resolve().then(() => log.push('microtask:' + label)); return true; };
    try { await a.append(rec(1), { guard: guard('append') }); await a.clear({ guard: guard('clear') }); } finally { IDBDatabase.prototype.transaction = T; IDBObjectStore.prototype.add = A; IDBObjectStore.prototype.clear = C; IDBObjectStore.prototype.count = N; }
    return log;`);
  assert.deepEqual(r, ['guard:append', 'transaction:readwrite', 'activity-probe', 'microtask:append', 'guard:append', 'add', 'microtask:append', 'guard:clear', 'transaction:readwrite', 'activity-probe', 'microtask:clear', 'guard:clear', 'clear:header', 'clear:log', 'microtask:clear'], JSON.stringify(r));
});
// ---- queued actions: ordering model ---------------------------------------------------------------------------------------------------------------------------------------------
await check('queued behind one slow open: each action decides at its own initiation; one whose mutation was already placed under a true guard commits and only notifies later', async () => {
  const r = await inPage(`
    const name = 'plc-idb-queue-' + uid(), seeded = await seed(name), gate = makeGate();
    const a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    let liveA = true, liveB = true, liveC = true; const log = [];
    const A = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function (v, ...r) { log.push('add:' + v.seq); if (v.seq === 4) liveC = false; /* C's lifecycle ends right AFTER its request was placed */ return A.call(this, v, ...r); };
    try {
      const pa = outcome(a.append(rec(2), { guard: () => liveA })), pb = outcome(a.append(rec(3), { guard: () => liveB })), pc = outcome(a.append(rec(4), { guard: () => liveC }));
      await gate.reachedP; liveB = false;                      // B belongs to a lifecycle that ended while queued; A and C are still live when their turn comes
      gate.release(); var [oa, ob, oc] = [await pa, await pb, await pc];
    } finally { IDBObjectStore.prototype.add = A; }
    return { oa, ob, oc, log, seqs: await seqsOf(seeded) };`);
  assert.equal(r.oa.ok, true); assert.equal(r.ob.ok, false); assert.equal(r.ob.code, 'session-changed'); assert.equal(r.oc.ok, true, 'C was initiated while live: ending its lifecycle afterwards cannot cancel a created transaction');
  assert.deepEqual(r.seqs, [1, 2, 4], 'B never exists; A and C are stored in creation order'); assert.ok(!r.log.includes('add:3'), 'no request was ever placed for the stale action');
});
// ---- engine level: crypto -> delayed open -> append ----------------------------------------------------------------------------------------------------------------------------
await check('engine: a vault session whose append waits in a delayed open persists nothing once its guard fails', async () => {
  const r = await inPage(`
    const name = 'plc-idb-engine-' + uid(), normal = createIndexedDbAdapter({ name }), gate = makeGate(), delayed = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    const adapter = { readHeader: () => normal.readHeader(), readLog: () => normal.readLog(), writeHeader: (h, o) => normal.writeHeader(h, o), append: (r, o) => delayed.append(r, o), replaceLog: (x) => normal.replaceLog(x), clear: (o) => normal.clear(o) };
    const session = await createVault({ adapter }).create('pw', { iterations: 1000 });
    let live = true; const stale = outcome(session.setKv('k', 'stale', { guard: () => live })); await gate.reachedP; live = false; gate.release(); const out = await stale;
    const reopened = await createVault({ adapter: normal }).unlock('pw');
    return { out, kv: [...reopened.state.kv.entries()], seqs: await seqsOf(normal) };`);
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'session-changed'); assert.deepEqual(r.kv, [], 'nothing stale was stored'); assert.deepEqual(r.seqs, []);
});
await check('engine positive control: the same delayed open with a valid guard stores the value', async () => {
  const r = await inPage(`
    const name = 'plc-idb-engine2-' + uid(), normal = createIndexedDbAdapter({ name }), gate = makeGate(), delayed = createIndexedDbAdapter({ name, factory: delayedFactory(gate) });
    const adapter = { readHeader: () => normal.readHeader(), readLog: () => normal.readLog(), writeHeader: (h) => normal.writeHeader(h), append: (r, o) => delayed.append(r, o), replaceLog: (x) => normal.replaceLog(x), clear: (o) => normal.clear(o) };
    const session = await createVault({ adapter }).create('pw', { iterations: 1000 });
    const p = outcome(session.setKv('k', 'fresh', { guard: () => true })); await gate.reachedP; gate.release(); const out = await p;
    const reopened = await createVault({ adapter: normal }).unlock('pw'); return { out, kv: [...reopened.state.kv.entries()] };`);
  assert.equal(r.out.ok, true); assert.deepEqual(r.kv, [['k', 'fresh']]);
});

await context.close(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort: only the folder this process made */ }
const failed = results.filter((x) => !x.pass);
console.log(JSON.stringify({ total: results.length, passed: results.length - failed.length, failed: failed.map((f) => f.name) }));
process.exit(failed.length ? 1 : 0);
