// ACTUAL browser IndexedDB proof of the typed projection seam. Run:
//   node tests/helpers/vault-chat-projection-idb.mjs --media /media/Vivarium/<dedicated folder> --repeat 20
//
// The pages import the app's REAL chat/vault/vault-db.mjs and vault.mjs (served unmodified from this checkout by an owned, ephemeral-port server) and drive the real createIndexedDbAdapter against
// real IndexedDB in a dedicated persistent Chromium profile under --media. Synthetic data only. Nothing here is a mock of the adapter; the only fixtures are a factory that holds an open request,
// a prior transaction that is held open, and an adapter wrapper that never answers (the "killed" page) around the real adapter's replaceLog.
//
// What it proves (once):
//   * ONE readwrite transaction over [header, log]; reads, then (no await, no crypto) header.put and log.add in the callback of the last read
//   * a failed middle add (duplicate seq), an expected-header/log mismatch and a refused guard each leave BOTH header and log exactly as they were
//   * the guard is asked at the open, at the transaction's own activity, in the final compare-read callback and immediately before the mutation: a flip at any of them aborts before a mutation request
//   * queued behind a held prior transaction (observed, not slept): the stale action aborts when it runs; delayed open: it is never initiated
//   * engine level on real IDB: a full P1/P2/P3 commit, header 2 in the same transaction as the owned records, reconcile, uncertain completion
// and, repeated --repeat times (default 20), with 4, 8 and 16 separate pages (actors) over the SAME database:
//   * exactly one actor commits per base; every other is refused (stale/pending) and nothing is corrupt: no duplicate seq, the index has no pending, one entity, nothing damaged
//   * a page KILLED right after P1 or right after P2 durable leaves what the stored state shows; a fresh page's reconcile abandons the P1-only marker (payload unchanged) or settles the verified P2
// PLC_IDB_SABOTAGE=no-compare|no-final-guard serves a deliberately weakened copy of vault-db.mjs: the matching cases MUST fail (negative controls; exit status 1).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { chromium } = createRequire(import.meta.url)('playwright');
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; };
const MEDIA = arg('--media');
const REPEAT = Number(arg('--repeat', '20'));
if (!MEDIA || !MEDIA.startsWith('/media/Vivarium/')) { console.error('--media must name a dedicated folder under /media/Vivarium/'); process.exit(2); }
fs.mkdirSync(MEDIA, { recursive: true });
const profile = fs.mkdtempSync(path.join(MEDIA, 'idb-profile-'));
const SABOTAGE = arg('--sabotage', process.env.PLC_IDB_SABOTAGE || '');
const SABOTAGES = {
  'no-compare': ["if (canon(storedHeader) !== canon(expected.header ?? null) || canon(logRows) !== canon(expected.log)) { fail(mismatch()); return; }", ''],
  'no-final-guard': ["        if (!allowed(guard)) { fail(stale()); return; }\n        try { headers.put(", "        try { headers.put("]
};

const vaultSource = (name) => {
  let text = fs.readFileSync(path.join(ROOT, 'chat', 'vault', name), 'utf8');
  if (SABOTAGE && name === 'vault-db.mjs') { const [from, to] = SABOTAGES[SABOTAGE] || []; assert.ok(from && text.includes(from), 'sabotage target not found: ' + SABOTAGE); text = text.replace(from, to); }
  return text;
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') { res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>typed projection idb</title>'); return; }
  if (!url.pathname.startsWith('/chat/vault/') || !url.pathname.endsWith('.mjs') || url.pathname.includes('..')) { res.statusCode = 404; res.end(); return; }
  try { res.setHeader('content-type', 'text/javascript'); res.end(vaultSource(url.pathname.slice('/chat/vault/'.length))); } catch { res.statusCode = 404; res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); // an owned ephemeral port: no fixed port, nothing else is listening on it
const origin = 'http://127.0.0.1:' + server.address().port;
const context = await chromium.launchPersistentContext(profile, { headless: true });
const newPage = async () => { const page = await context.newPage(); await page.goto(origin + '/'); return page; };
const page = await newPage();

const PRELUDE = `
const { createIndexedDbAdapter } = await import('/chat/vault/vault-db.mjs');
const { createVault } = await import('/chat/vault/vault.mjs');
const uid = () => Math.random().toString(36).slice(2);
const rec = (seq) => ({ seq, keyId: 'dek', iv: 'AA==', data: 'AA==' });
const V = (E) => ({ format: 1, encounter: { id: E, thread: 't1' }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\\u0000h1']: 'p1' } });
const plan = (base, E, rev = 1) => ({ base, operationId: 'op-' + E, threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [{ id: E, owner: { type: 'thread', id: 't1' }, value: V(E) }], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev, epoch: 1 } });
const makeGate = () => { let release, reached; const promise = new Promise((r) => { release = r; }), reachedP = new Promise((r) => { reached = r; }); return { promise, release, reachedP, reached }; };
const delayedFactory = (gate) => ({ open(name, version) {
  const real = indexedDB.open(name, version), fake = {};
  Object.defineProperty(fake, 'result', { get: () => real.result }); Object.defineProperty(fake, 'error', { get: () => real.error });
  real.onupgradeneeded = () => fake.onupgradeneeded && fake.onupgradeneeded();
  real.onsuccess = () => { gate.reached(); gate.promise.then(() => fake.onsuccess && fake.onsuccess()); };
  real.onerror = () => fake.onerror && fake.onerror(); real.onblocked = () => fake.onblocked && fake.onblocked();
  return fake; } });
async function seed(name) { const a = createIndexedDbAdapter({ name }); await a.writeHeader({ format: 'plc-vault/1', wraps: [] }); await a.append(rec(1)); return a; }
const outcome = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, code: e && e.code, message: String(e && e.message) }));
const seqsOf = async (a) => (await a.readLog()).map((r) => r.seq);
const snapshot = async (a) => JSON.stringify({ header: await a.readHeader(), log: await a.readLog() });
const expectedOf = async (a) => ({ header: await a.readHeader(), log: await a.readLog() });
// scoped instrumentation of this page's IndexedDB prototypes, restored by the caller
function observe() {
  const log = [], saved = {};
  const wrap = (proto, method, label) => { saved[proto.constructor.name + '.' + method] = [proto, method, proto[method]]; const original = proto[method]; proto[method] = function (...r) { log.push(label(this, r)); return original.apply(this, r); }; };
  wrap(IDBDatabase.prototype, 'transaction', (t, r) => 'transaction:' + r[1] + ':' + [].concat(r[0]).join(','));
  for (const m of ['get', 'getAll', 'put', 'add', 'delete', 'clear', 'count']) wrap(IDBObjectStore.prototype, m, (t) => m + ':' + t.name);
  return { log, restore() { for (const [proto, method, original] of Object.values(saved)) proto[method] = original; } };
}
const holdPrior = async (name) => {
  const db = await new Promise((resolve) => { const q = indexedDB.open(name, 1); q.onsuccess = () => resolve(q.result); });
  let hold = true; const t = db.transaction(['header', 'log'], 'readwrite'), store = t.objectStore('log'), done = new Promise((r) => { t.oncomplete = r; t.onabort = r; });
  const keep = () => { if (hold) store.get(987654).onsuccess = keep; }; keep();
  return { release: async () => { hold = false; await done; db.close(); } };
};
`;
const inPage = (body, target = page) => target.evaluate(`(async () => { ${PRELUDE}\n${body}\n})()`);
const results = [];
const check = async (name, fn) => { try { await fn(); results.push({ name, pass: true }); console.log('PASS', name); } catch (error) { results.push({ name, pass: false, error: String(error.message).split('\n').slice(0, 6).join(' | ') }); console.log('FAIL', name, '::', String(error.message).split('\n').slice(0, 6).join(' | ')); } };
const NEXT = "{ format: 'plc-vault/2', wraps: [] }";

// ---- the transaction -------------------------------------------------------------------------------------------------------------------------------------------------------------
await check('one readwrite transaction over header+log: both reads first, then header.put and log.add in the callback of the last read; the guard is asked four times', async () => {
  const r = await inPage(`
    const name = 'plc-tp-one-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); const expected = await expectedOf(seeded);
    const obs = observe(); let calls = 0; let out;
    try { out = await outcome(a.replaceLog({ add: [rec(2), rec(3)], removeUpTo: 0, expected, nextHeader: ${NEXT}, guard: () => { calls++; return true; } })); } finally { obs.restore(); }
    return { out, calls, log: obs.log, header: await seeded.readHeader(), seqs: await seqsOf(seeded) };`);
  assert.equal(r.out.ok, true, JSON.stringify(r.out));
  assert.deepEqual(r.log, ['transaction:readwrite:header,log', 'get:header', 'getAll:log', 'put:header', 'add:log', 'add:log']);
  assert.equal(r.calls, 4, 'open, transaction activity, final compare-read callback, immediately before the mutation');
  assert.equal(r.header.format, 'plc-vault/2'); assert.deepEqual(r.seqs, [1, 2, 3]);
});
await check('a failed middle add (duplicate seq) aborts the header AND the log', async () => {
  const r = await inPage(`
    const name = 'plc-tp-dup-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); const expected = await expectedOf(seeded), before = await snapshot(seeded);
    const obs = observe(); let out; try { out = await outcome(a.replaceLog({ add: [rec(2), rec(1), rec(3)], removeUpTo: 0, expected, nextHeader: ${NEXT} })); } finally { obs.restore(); }
    return { out, log: obs.log, same: (await snapshot(seeded)) === before, header: await seeded.readHeader() };`);
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'conflict'); assert.ok(r.log.includes('put:header'), 'the header put WAS requested in the same transaction ...'); assert.equal(r.same, true, '... and rolled back with the log'); assert.equal(r.header.format, 'plc-vault/1');
});
await check('expected header or log that is not what is stored aborts before any mutation request (nothing compared outside the transaction)', async () => {
  const r = await inPage(`
    const name = 'plc-tp-mis-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); const expected = await expectedOf(seeded), before = await snapshot(seeded);
    const wrongHeader = { header: { ...expected.header, format: 'other' }, log: expected.log }, wrongLog = { header: expected.header, log: [] };
    const obs = observe(); let o1, o2; try { o1 = await outcome(a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected: wrongHeader, nextHeader: ${NEXT} })); o2 = await outcome(a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected: wrongLog, nextHeader: ${NEXT} })); } finally { obs.restore(); }
    // a writer slipping in between the read and the write: the caller's expected is now stale
    await seeded.append(rec(2)); const o3 = await outcome(a.replaceLog({ add: [rec(3)], removeUpTo: 0, expected, nextHeader: ${NEXT} }));
    return { o1, o2, o3, log: obs.log, seqs: await seqsOf(seeded), header: await seeded.readHeader(), same: (await snapshot(seeded)) !== before };`);
  assert.equal(r.o1.code, 'expected-mismatch'); assert.equal(r.o2.code, 'expected-mismatch'); assert.equal(r.o3.code, 'expected-mismatch');
  assert.equal(r.log.filter((x) => x.startsWith('put:') || x.startsWith('add:')).length, 0, 'no mutation request was ever placed'); assert.deepEqual(r.seqs, [1, 2]); assert.equal(r.header.format, 'plc-vault/1');
});
for (const flipAt of [1, 2, 3, 4]) await check(`guard flips at ask #${flipAt} (${['before the transaction', 'transaction activity', 'final compare-read callback', 'immediately before the mutation'][flipAt - 1]}): aborted, header and log unchanged, no mutation request`, async () => {
  const r = await inPage(`
    const name = 'plc-tp-flip-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); const expected = await expectedOf(seeded), before = await snapshot(seeded);
    let calls = 0; const obs = observe(); let out; try { out = await outcome(a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected, nextHeader: ${NEXT}, guard: () => ++calls < ${flipAt} })); } finally { obs.restore(); }
    return { out, calls, same: (await snapshot(seeded)) === before, mutated: obs.log.filter((x) => x.startsWith('put:') || x.startsWith('add:')) };`);
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'session-changed'); assert.equal(r.same, true); assert.deepEqual(r.mutated, [], 'no put/add was requested');
});
await check('queued behind a held prior transaction: the action is observed queued (no mutation yet), its lifecycle ends, it aborts when it finally runs', async () => {
  const r = await inPage(`
    const name = 'plc-tp-held-' + uid(), seeded = await seed(name), a = createIndexedDbAdapter({ name }); await a.readHeader(); const expected = await expectedOf(seeded), before = await snapshot(seeded);
    const prior = await holdPrior(name); const obs = observe(); let live = true, calls = []; let out, queued;
    try {
      const stale = outcome(a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected, nextHeader: ${NEXT}, guard: () => { calls.push(live); return live; } }));
      await new Promise((r) => setTimeout(r, 50)); queued = obs.log.filter((x) => x !== 'get:log');      // the (cached) open yields; the transaction exists, its reads are queued behind the prior one (get:log is only the prior's own keep-alive read)
      live = false; await prior.release(); out = await stale;
    } finally { obs.restore(); }
    return { out, queued, after: obs.log.filter((x) => x !== 'get:log'), calls, same: (await snapshot(seeded)) === before };`);
  assert.deepEqual(r.queued, ['transaction:readwrite:header,log', 'get:header', 'getAll:log'], 'observed queued with both reads requested and nothing mutated');
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'session-changed'); assert.deepEqual(r.after, r.queued, 'no mutation request after the prior transaction finished'); assert.equal(r.same, true); assert.deepEqual(r.calls, [true, false]);
});
await check('delayed open + lifecycle change: the stale projection is never initiated; the replacement write survives', async () => {
  const r = await inPage(`
    const name = 'plc-tp-open-' + uid(), seeded = await seed(name), gate = makeGate(), a = createIndexedDbAdapter({ name, factory: delayedFactory(gate) }); const expected = await expectedOf(seeded);
    let live = true; const stale = outcome(a.replaceLog({ add: [rec(2)], removeUpTo: 0, expected, nextHeader: ${NEXT}, guard: () => live })); await gate.reachedP; live = false;
    await seeded.append(rec(2)); gate.release(); const out = await stale;
    return { out, seqs: await seqsOf(seeded), header: await seeded.readHeader() };`);
  assert.equal(r.out.ok, false); assert.equal(r.out.code, 'session-changed'); assert.deepEqual(r.seqs, [1, 2]); assert.equal(r.header.format, 'plc-vault/1');
});
await check('ordinary replaceLog (compaction) without projection arguments keeps its old contract', async () => {
  const r = await inPage(`
    const name = 'plc-tp-old-' + uid(), seeded = await seed(name); await seeded.append(rec(2));
    await seeded.replaceLog({ add: [rec(9)], removeUpTo: 2 }); return { seqs: await seqsOf(seeded), kind: seeded.atomicProjection };`);
  assert.deepEqual(r.seqs, [9]); assert.equal(r.kind, true);
});

// ---- the engine on real IndexedDB ---------------------------------------------------------------------------------------------------------------------------------------------------
const SETUP = `
  const name = 'plc-tp-eng-' + uid(), adapter = createIndexedDbAdapter({ name });
  const session = await createVault({ adapter }).create('pw', { iterations: 1000 });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [] }); await session.setKv('l/chatThreads.order', '["t1"]');
  const G = () => true;`;
await check('engine on real IndexedDB: P1/P2/P3 commit, header 2 arrives with the owned records, readback is exact, a fresh unlock replays it, compaction keeps it', async () => {
  const r = await inPage(`${SETUP}
    const base = await session.readChatProjection({ guard: G });
    const out = await session.commitChatProjection(plan(base.base, 'E1'), { guard: G });
    const fresh = await createVault({ adapter: createIndexedDbAdapter({ name }) }).unlockWithKey(await adapter.readHeader(), session.dekBytes());
    await session.compact();
    const after = await createVault({ adapter: createIndexedDbAdapter({ name }) }).unlockWithKey(await adapter.readHeader(), session.dekBytes());
    return { status: out.status, header: (await adapter.readHeader()).format, e: fresh.state.encounters.has('E1'), e2: after.state.encounters.get('E1').value.events.ev1.text, pending: JSON.parse(fresh.state.kv.get('meta/encounters.index.v1')).pending, damaged: fresh.damaged.length };`);
  assert.equal(r.status, 'committed'); assert.equal(r.header, 'plc-vault/2'); assert.equal(r.e, true); assert.equal(r.e2, 'secret words'); assert.equal(r.pending, null); assert.equal(r.damaged, 0);
});
await check('engine on real IndexedDB: a custom adapter with no atomic capability refuses before any write; a lock during P2 reports unknown and keeps the durable record', async () => {
  const r = await inPage(`${SETUP}
    const plain = { readHeader: () => adapter.readHeader(), readLog: () => adapter.readLog(), writeHeader: (h, o) => adapter.writeHeader(h, o), append: (x, o) => adapter.append(x, o), replaceLog: (x) => adapter.replaceLog(x), clear: (o) => adapter.clear(o) };
    const s2 = await createVault({ adapter: plain }).unlockWithKey(await adapter.readHeader(), session.dekBytes()); const before = await snapshot(adapter);
    const noCap = await s2.commitChatProjection(plan((await s2.readChatProjection({ guard: G })).base, 'E1'), { guard: G });
    const unchanged = (await snapshot(adapter)) === before;
    let calls = 0, live = true; const wrapped = { ...adapter, kind: 'indexeddb', atomicProjection: true, readHeader: () => adapter.readHeader(), readLog: () => adapter.readLog(), replaceLog: async (x) => { calls++; const o = await adapter.replaceLog(x); if (calls === 2) { live = false; s3.lock(); } return o; } };
    const s3 = await createVault({ adapter: wrapped }).unlockWithKey(await adapter.readHeader(), session.dekBytes());
    const lockedOut = await s3.commitChatProjection(plan((await s3.readChatProjection({ guard: () => live })).base, 'E1'), { guard: () => live });
    const durable = await createVault({ adapter: createIndexedDbAdapter({ name }) }).unlockWithKey(await adapter.readHeader(), session.dekBytes());
    return { noCap, unchanged, lockedOut: { status: lockedOut.status, reason: lockedOut.reason }, mem: s3.state.encounters.size, durable: durable.state.encounters.has('E1') };`);
  assert.equal(r.noCap.status, 'not-written'); assert.equal(r.noCap.reason, 'no-atomic-adapter'); assert.equal(r.unchanged, true);
  assert.equal(r.lockedOut.status, 'unknown'); assert.match(r.lockedOut.reason, /authority|locked/); assert.equal(r.mem, 0); assert.equal(r.durable, true);
});

// ---- repeated: actors over one database, and killed pages --------------------------------------------------------------------------------------------------------------------------------------
const ACCEPTED = new Set(['stale-base', 'pending', 'conflict', 'unreadable', 'needs-reconcile']);
async function seedDatabase() {
  return page.evaluate(`(async () => { ${PRELUDE}
    const name = 'plc-tp-act-' + uid(), adapter = createIndexedDbAdapter({ name });
    const session = await createVault({ adapter }).create('pw', { iterations: 1000 });
    await session.putThread('t1', { id: 't1', title: 'one', messages: [] }); await session.setKv('l/chatThreads.order', '["t1"]');
    const out = { name, dek: Array.from(session.dekBytes()) }; await adapter.close(); return out; })()`);
}
const attach = (seedInfo) => `
  const adapter = createIndexedDbAdapter({ name: ${JSON.stringify(seedInfo.name)} }); const header = await adapter.readHeader();
  const s = await createVault({ adapter }).unlockWithKey(header, new Uint8Array(${JSON.stringify(seedInfo.dek)})); const G = () => true;`;
async function verifyFinal(seedInfo, expectEntities) {
  return page.evaluate(`(async () => { ${PRELUDE} ${attach(seedInfo)}
    const index = s.state.kv.has('meta/encounters.index.v1') ? JSON.parse(s.state.kv.get('meta/encounters.index.v1')) : null; const seqs = (await adapter.readLog()).map((r) => r.seq);
    const out = { entities: [...s.state.encounters.keys()], pending: index && index.pending, committed: index && index.committed, damaged: s.damaged.length, unique: new Set(seqs).size === seqs.length, header: header.format, payload: [...s.state.encounters.values()].map((e) => e.value.events.ev1.text) };
    s.lock(); await adapter.close(); return out; })()`);
}
const dropDatabase = (seedInfo) => page.evaluate(`new Promise((resolve) => { const q = indexedDB.deleteDatabase(${JSON.stringify(seedInfo.name)}); q.onsuccess = q.onerror = q.onblocked = () => resolve(true); })`);

const actorsRun = async (count, repeat) => {
  const seedInfo = await seedDatabase();
  const pages = await Promise.all(Array.from({ length: count }, newPage));
  try {
    await Promise.all(pages.map((p) => inPage(`${attach(seedInfo)} window.__s = s; window.__r = await s.readChatProjection({ guard: G }); return true;`, p)));
    const outs = await Promise.all(pages.map((p, i) => inPage(`const out = await window.__s.commitChatProjection(plan(window.__r.base, 'E${i}'), { guard: () => true }); return { status: out.status, reason: out.reason };`, p)));
    const committed = outs.filter((o) => o.status === 'committed'), others = outs.filter((o) => o.status !== 'committed');
    assert.equal(committed.length, 1, `${count} actors, repeat ${repeat}: exactly one commits: ${JSON.stringify(outs)}`);
    for (const o of others) { assert.equal(o.status, 'not-written', JSON.stringify(o)); assert.ok(ACCEPTED.has(o.reason), 'refused for a stated reason: ' + JSON.stringify(o)); }
    const final = await verifyFinal(seedInfo);
    assert.equal(final.entities.length, 1); assert.equal(final.pending, null); assert.ok(final.committed); assert.equal(final.damaged, 0); assert.equal(final.unique, true); assert.equal(final.header, 'plc-vault/2');
  } finally { for (const p of pages) await p.close().catch(() => {}); await dropDatabase(seedInfo); }
};
const killRun = async (afterPhase, repeat) => {
  const seedInfo = await seedDatabase();
  const victim = await newPage();
  try {
    await inPage(`${attach(seedInfo)}
      let n = 0; const wrapped = { kind: 'indexeddb', atomicProjection: true, readHeader: () => adapter.readHeader(), readLog: () => adapter.readLog(), writeHeader: (h, o) => adapter.writeHeader(h, o), append: (r, o) => adapter.append(r, o), clear: (o) => adapter.clear(o),
        replaceLog: async (x) => { const out = await adapter.replaceLog(x); if (x.expected && ++n === ${afterPhase}) { window.__durable = ${afterPhase}; await new Promise(() => {}); /* the page is killed here */ } return out; } };
      const v = await createVault({ adapter: wrapped }).unlockWithKey(header, new Uint8Array(${JSON.stringify(seedInfo.dek)}));
      const base = await v.readChatProjection({ guard: G }); window.__commit = v.commitChatProjection(plan(base.base, 'E1'), { guard: G }); return true;`, victim);
    await victim.waitForFunction(`window.__durable === ${afterPhase}`, null, { timeout: 15000 });
    await victim.close({ runBeforeUnload: false }); // abrupt: the durable phase stays, the page never answers
    const rec = await page.evaluate(`(async () => { ${PRELUDE} ${attach(seedInfo)}
      const before = s.state.encounters.has('E1'); const index = JSON.parse(s.state.kv.get('meta/encounters.index.v1')); const r = await s.reconcileChatProjection({ guard: G });
      const after = await createVault({ adapter }).unlockWithKey(await adapter.readHeader(), new Uint8Array(${JSON.stringify(seedInfo.dek)}));
      const out = { before, pendingBefore: index.pending !== null, status: r.status, entity: after.state.encounters.has('E1'), pendingAfter: JSON.parse(after.state.kv.get('meta/encounters.index.v1')).pending, damaged: after.damaged.length, writable: (await s.setKv('l/after', '1')) > 0 };
      s.lock(); await adapter.close(); return out; })()`);
    assert.equal(rec.pendingBefore, true, 'the killed page left its pending marker durable');
    if (afterPhase === 1) { assert.equal(rec.before, false); assert.equal(rec.status, 'abandoned'); assert.equal(rec.entity, false); }
    else { assert.equal(rec.before, true); assert.equal(rec.status, 'committed'); assert.equal(rec.entity, true); }
    assert.equal(rec.pendingAfter, null); assert.equal(rec.damaged, 0); assert.equal(rec.writable, true);
  } finally { await victim.close().catch(() => {}); await dropDatabase(seedInfo); }
};
const repeated = [];
for (let n = 1; n <= REPEAT; n++) {
  for (const count of [4, 8, 16]) await check(`repeat ${n}/${REPEAT}: ${count} actors over one real database: exactly one commit per base, the rest refused, nothing corrupt`, () => actorsRun(count, n));
  await check(`repeat ${n}/${REPEAT}: a page killed right after P1 is durable: reconcile abandons only the noncontent pending`, () => killRun(1, n));
  await check(`repeat ${n}/${REPEAT}: a page killed right after P2 is durable: reconcile settles the verified P2`, () => killRun(2, n));
  repeated.push(n);
}

await context.close(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* best effort: only the folder this process made */ }
const failed = results.filter((x) => !x.pass);
console.log(JSON.stringify({ sabotage: SABOTAGE || null, total: results.length, passed: results.length - failed.length, repeats: repeated.length, actors: [4, 8, 16], failed: failed.map((f) => f.name) }));
process.exit(failed.length ? 1 : 0);
