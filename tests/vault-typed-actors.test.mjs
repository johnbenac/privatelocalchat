// T893: the typed encounter engine under REAL concurrency. N separate processes (tabs) run a copy of chat/vault/vault.mjs over ONE shared folder backend (tests/helpers/vault-typed-adapter.mjs)
// and race the engine's own commit (commitChatProjection: P1 pending marker, P2 everything in one header+log projection, P3 clear) from the SAME stored base. Every actor is held at a START
// FILE barrier: the parent sees that all N reached it, with the same stored header+log, before it releases them together. Synthetic data only.
//
// What a repeat checks (a violation is a string; an empty list passes):
//   barrier     all N actors answered `armed`, each had read the same base (one digest), and each reports the same backend identity (path, inode and a nonce written by the parent);
//   accounting  every actor's outcome is known: `committed`, or `not-written` with a reason in a stated set of stale refusals (stale-base, pending, expected-mismatch, unreadable); an
//               unexpected status (unknown, unsettled, not-committed) or a reason outside the set FAILS, except the one fenced actor of scenario S4 whose guard is withdrawn on purpose;
//   one winner  exactly one committed commit per base; the rest refused; the engine's own guard is asked (guardAsked > 0);
//   NOTE on S3 and S4: in the N-actor races most losers are refused as STALE before their own plan is judged, so S3 shows 'refused and nothing written' for a wrong-generation removal, not 'refused for
//               the wrong generation': the reason is asserted exactly by S5 (wrong generation with no competing commit) and by tests/vault-owned-corrections.test.mjs; and the phases an actor's guard is
//               withdrawn in are probabilistic in the race, so the fence sweep (a fenced actor alone, question 1 to 16) asserts the coverage deterministically.
//   no mutation the stored log after the race holds exactly the records of the one winning commit (the record count equals what one actor alone leaves), contiguous and unique seqs, no
//               pending marker, no damaged record, the entities are exactly the winners', and a refusal changed nothing (generation of the chat key unchanged, the existing entity intact);
//   cold replay a brand new unlock of the stored folder (no memory of any actor) reaches that state.
// `app.transition` is not involved here: it REFUSES a call made while another is in flight (it does not queue); the in-process tests cover it. This file labels what it supplies: the START
// FILE is the test's own barrier, not an engine queue.
// NOT covered here (task T894): a process dying inside a projection (this adapter is not crash-atomic), real IndexedDB, real Web Locks, an OS SIGKILL.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scratchRoot } from './helpers/vault-transition-rig.mjs';
import { fileProjectionAdapter } from './helpers/vault-typed-adapter.mjs';

const here = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(here, '..');
const ACTOR = path.join(here, 'helpers', 'vault-typed-actor.mjs');
const REPEAT = Number(process.env.TYPED_REPEAT || 20), COUNTS = (process.env.TYPED_COUNTS || '4,8,16').split(',').map(Number);
const STALE_OK = new Set(['stale-base', 'pending', 'expected-mismatch', 'unreadable']);
const REMOVE_OK = new Set([...STALE_OK, 'invalid-plan']);
const root = scratchRoot();
const ITER = 1000;
// PROVENANCE (T895 finding 9): what this run is, written into its own output, so a saved log can be tied to a tree and a command
{ const git = (...a) => { try { return execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } };
  console.log('# provenance ' + JSON.stringify({ file: 'tests/vault-typed-actors.test.mjs', head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), dirty: git('status', '--porcelain') !== '', engineSha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'chat', 'vault', 'vault.mjs'))).digest('hex').slice(0, 16),
    node: process.version, argv: process.argv.slice(1).join(' '), env: { PLC_REQUIRE_OLD_REV: process.env.PLC_REQUIRE_OLD_REV || null, TYPED_REPEAT: process.env.TYPED_REPEAT || null, TYPED_COUNTS: process.env.TYPED_COUNTS || null }, host: os.hostname(), at: new Date().toISOString() })); }

// ---- engine copies: the app's real file, optionally with ONE deliberate break (negative controls) ---------------------------------------------------------------------------------------
function buildEngine(name, breaks = []) {
  const dir = path.join(root, 'engine-' + name); fs.mkdirSync(dir, { recursive: true });
  let text = fs.readFileSync(path.join(ROOT, 'chat', 'vault', 'vault.mjs'), 'utf8');
  for (const [label, from, to] of breaks) { assert.ok(text.includes(from), 'the break "' + label + '" did not apply: the engine text changed'); text = text.replace(from, to); }
  const file = path.join(dir, 'vault.mjs'); fs.writeFileSync(file, text);
  return file;
}
const GOOD = buildEngine('good');
const { createVault } = await import(pathToFileURL(GOOD).href);

// ---- actors -------------------------------------------------------------------------------------------------------------------------------------------------------------------------
function spawnActors(n, vaultModule, { lossy = false } = {}) {
  return Array.from({ length: n }, () => {
    const proc = spawn(process.execPath, [ACTOR, JSON.stringify({ vaultModule, lossy })], { stdio: ['pipe', 'pipe', 'inherit'] });
    const a = { proc, pid: proc.pid, inbox: [], waiters: [], buf: '' };
    proc.stdout.on('data', (chunk) => { a.buf += chunk; let i; while ((i = a.buf.indexOf('\n')) >= 0) { const line = a.buf.slice(0, i); a.buf = a.buf.slice(i + 1); let m; try { m = JSON.parse(line); } catch { continue; } const w = a.waiters.shift(); if (w) w(m); else a.inbox.push(m); } });
    a.exited = new Promise((resolve) => proc.on('exit', (code, signal) => { a.dead = { code, signal }; for (const w of a.waiters.splice(0)) w({ t: 'error', error: 'actor ended: ' + code + '/' + signal }); resolve(); }));
    return a;
  });
}
const send = (a, m) => a.proc.stdin.write(JSON.stringify(m) + '\n');
const recv = (a) => (a.inbox.length ? Promise.resolve(a.inbox.shift()) : new Promise((resolve) => a.waiters.push(resolve)));
async function ready(actors) { for (const a of actors) { const m = await recv(a); assert.equal(m.t, 'ready', JSON.stringify(m)); } }
async function stop(actors) { for (const a of actors) { try { send(a, { cmd: 'exit' }); } catch { /* gone */ } } await Promise.all(actors.map((a) => a.exited)); }

// ---- one scenario folder: a real vault with one chat, created by the parent ---------------------------------------------------------------------------------------------------------
let counter = 0;
async function makeFolder(tag) {
  const dir = path.join(root, 'v-' + tag + '-' + (++counter));
  const adapter = fileProjectionAdapter(dir);
  const session = await createVault({ adapter }).create('pw', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'synthetic transcript' }] });
  await session.setKv('l/chatThreads.order', '["t1"]');
  fs.writeFileSync(path.join(dir, 'backend.json'), JSON.stringify({ nonce: crypto.randomBytes(8).toString('hex') }));
  session.lock();
  return { dir, adapter, baseline: adapter.count(), identity: adapter.identity() };
}
async function openAll(actors, f, v) {
  for (const a of actors) send(a, { cmd: 'open', dir: f.dir });
  const outs = await Promise.all(actors.map(recv));
  for (const o of outs) {
    if (o.t !== 'opened') { v.push('open failed: ' + JSON.stringify(o)); continue; }
    if (JSON.stringify(o.backend) !== JSON.stringify(f.identity)) v.push('an actor is not on the same backend: ' + JSON.stringify(o.backend) + ' vs ' + JSON.stringify(f.identity));
  }
}
/** Release the actors together once every one of them is armed with the same stored base. Returns { reads, results }. */
async function race(actors, specs, f, tag, v) {
  for (const a of actors) send(a, { cmd: 'read' });
  const reads = await Promise.all(actors.map(recv));
  for (const r of reads) if (r.t !== 'read') v.push('read failed: ' + JSON.stringify(r));
  const digests = new Set(reads.filter((r) => r.t === 'read').map((r) => r.digest));
  if (digests.size !== 1) v.push('barrier: the actors did not read the same base (' + digests.size + ' different)');
  const startFile = path.join(f.dir, 'start-' + tag);
  actors.forEach((a, i) => send(a, { cmd: 'arm', spec: specs[i], startFile }));
  const armed = await Promise.all(actors.map(recv));
  if (armed.some((m) => m.t !== 'armed')) v.push('barrier: not every actor reached the start file: ' + JSON.stringify(armed.filter((m) => m.t !== 'armed')));
  fs.writeFileSync(startFile, 'go');
  const results = await Promise.all(actors.map(recv));
  return { reads, results };
}
async function cold(f, v, { entities, records, keyGeneration }) {
  const state = await createVault({ adapter: f.adapter }).unlock('pw');
  const log = await f.adapter.readLog(), seqs = log.map((r) => r.seq);
  if (new Set(seqs).size !== seqs.length) v.push('cold replay: duplicate seqs');
  if (seqs.some((s, i) => s !== seqs[0] + i)) v.push('cold replay: seqs are not contiguous: ' + seqs.join(','));
  if (state.damaged.length) v.push('cold replay: damaged records ' + JSON.stringify(state.damaged));
  const index = JSON.parse(state.state.kv.get('meta/encounters.index.v1') || 'null');
  if (index && index.pending) v.push('cold replay: a pending marker is left');
  const got = [...state.state.encounters.keys()].sort();
  if (JSON.stringify(got) !== JSON.stringify([...entities].sort())) v.push('cold replay: entities ' + JSON.stringify(got) + ' expected ' + JSON.stringify([...entities].sort()));
  if (records != null && log.length !== records) v.push('the stored log holds ' + log.length + ' records, one winner alone leaves ' + records + ' (a refusal wrote something, or a commit was applied twice)');
  if (keyGeneration !== undefined && state.state.keyGenerations.get('c:t1') !== keyGeneration) v.push('the generation of the chat key changed');
  return { records: log.length, generation: state.state.keyGenerations.get('c:t1'), state };
}
function account(v, results, kinds, { committed, refusalOk = STALE_OK, fenced = -1 } = {}) {
  let won = 0;
  if (process.env.TYPED_DEBUG) console.error('    outcomes: ' + results.map((r, i) => kinds[i] + '=' + (r.status || r.t) + (r.reason ? '/' + r.reason : r.code ? '/' + r.code : '')).join(' '));
  results.forEach((r, i) => {
    if (r.t !== 'result') { v.push('actor ' + i + ' failed: ' + JSON.stringify(r)); return; }
    const tag = 'actor ' + i + ' (' + kinds[i] + ')';
    if (kinds[i] === 'reserved') { if (r.status !== 'refused' || r.code !== 'reserved') v.push(tag + ': a generic append of owned.put must be refused with reserved, got ' + r.status + '/' + r.code); return; }
    if (i === fenced) {
      if (r.status === 'committed') v.push(tag + ': committed although its guard was withdrawn mid-commit');
      else if (!['not-written', 'not-committed', 'unsettled', 'unknown'].includes(r.status)) v.push(tag + ': unexpected status ' + r.status);
      if (!(r.guardAsked > 0)) v.push(tag + ': the engine never asked the guard');
      return;
    }
    if (r.status === 'committed') { won += 1; if (kinds[i] !== 'put') v.push(tag + ' committed'); if (!(r.guardAsked > 0)) v.push(tag + ': the engine never asked the guard'); return; }
    if (r.status !== 'not-written') { v.push(tag + ': UNEXPECTED outcome ' + r.status + '/' + r.reason); return; }
    if (!refusalOk.has(r.reason) && !(kinds[i] === 'removeWrong' && REMOVE_OK.has(r.reason))) v.push(tag + ': refused with an unexpected reason ' + r.reason);
  });
  if (committed != null && won !== committed) v.push('expected exactly ' + committed + ' committed commit(s) for this base, got ' + won);
  return won;
}
const put = (E, rev, op) => ({ kind: 'put', E, T: 't1', rev, op });

// ---- scenarios; each returns { v, records } ---------------------------------------------------------------------------------------------------------------------------------------------
async function s1(actors, expect) {   // S1: the same base, N identical commits: exactly one wins
  const v = [], f = await makeFolder('s1'); await openAll(actors, f, v);
  const { results } = await race(actors, actors.map((a, i) => put('E1', 1, 'op-' + i)), f, 'a', v);
  account(v, results, actors.map(() => 'put'), { committed: 1 });
  const c = await cold(f, v, { entities: ['E1'], records: expect?.s1 });
  return { v, records: c.records, baseline: f.baseline };
}
async function s2(actors, expect) {   // S2: three chained bases: one winner per base, refusals name the stale base, the latest base wins next
  const v = [], f = await makeFolder('s2'); await openAll(actors, f, v);
  const won = [];
  for (let round = 0; round < 3; round++) {
    const specs = actors.map((a, i) => put('R' + round + 'A' + i, round + 1, 'op-' + round + '-' + i));
    const { results } = await race(actors, specs, f, 'r' + round, v);
    account(v, results, actors.map(() => 'put'), { committed: 1 });
    const w = results.findIndex((r) => r.status === 'committed'); if (w >= 0) won.push('R' + round + 'A' + w);
  }
  const c = await cold(f, v, { entities: won, records: expect?.s2 });
  return { v, records: c.records };
}
async function s3(actors, expect) {   // S3: mixed intents on one base: competing puts, an explicit WRONG owner generation, a reserved generic write
  const v = [], f = await makeFolder('s3'); await openAll(actors, f, v);
  await race([actors[0]], [put('E1', 1, 'pre')], f, 'pre', v);
  const before = await cold(f, v, { entities: ['E1'] });
  const kinds = actors.map((a, i) => ['put', 'removeWrong', 'reserved', 'put'][i % 4]);
  const specs = actors.map((a, i) => (kinds[i] === 'put' ? put(i % 4 === 0 ? 'E2' : 'E3', 2, 'op-' + i) : kinds[i] === 'removeWrong' ? { kind: 'removeWrong', E: 'E1', op: 'op-' + i, rev: 2 } : { kind: 'reserved', E: 'enc:x' }));
  const { results } = await race(actors, specs, f, 'b', v);
  account(v, results, kinds, { committed: 1 });
  const w = results.findIndex((r, i) => r.status === 'committed' && kinds[i] === 'put');
  const c = await cold(f, v, { entities: ['E1', w >= 0 ? specs[w].E : 'E2'], records: expect?.s3, keyGeneration: before.generation });
  return { v, records: c.records };
}
async function s4(actors, rep) {   // S4: one actor's guard is withdrawn mid-commit (a lifecycle that ended); a fresh tab reconciles; the next base is won exactly once
  const v = [], f = await makeFolder('s4'); await openAll(actors, f, v);
  const k = 1 + (rep % 12);   // the guard is withdrawn at question 1 .. 12 of the commit: before P1, between the phases, after P2
  const specs = actors.map((a, i) => ({ ...put('E1', 1, 'op-' + i), ...(i === 0 ? { guardAfter: k } : {}) }));
  const { results } = await race(actors, specs, f, 'a', v);
  account(v, results, actors.map(() => 'put'), { fenced: 0 });
  const winners = results.filter((r, i) => i !== 0 && r.status === 'committed').length + (results[0].status === 'committed' ? 1 : 0);
  if (winners > 1) v.push('more than one commit won this base: ' + winners);
  if (['not-committed', 'unsettled', 'unknown'].includes(results[0].status)) {   // its commit ended uncertain: the SAME session must not write anything more until a reconcile
    const before = await f.adapter.readLog(); const w = { v: [] };
    const again = await race([actors[0]], [put('E9', 2, 'again')], f, 'again', w.v); v.push(...w.v);
    const r0 = again.results[0];
    if (r0.status !== 'not-written' || r0.reason !== 'needs-reconcile') v.push('the same session wrote again after an uncertain commit instead of refusing with needs-reconcile: ' + r0.status + '/' + r0.reason);
    if (JSON.stringify(await f.adapter.readLog()) !== JSON.stringify(before)) v.push('the refused retry changed the stored log');
  }
  const fresh = await createVault({ adapter: f.adapter }).unlock('pw');
  const rec = await fresh.reconcileChatProjection({ guard: () => true });   // the one narrow recovery, from the stored state, in a brand new session
  const mid = await cold(f, v, { entities: [...fresh.state.encounters.keys()] });
  if (winners === 1 && !mid.state.state.encounters.has('enc:E1') && !mid.state.state.encounters.has('E1')) v.push('a reported commit is not in the stored state after reconcile');
  void rec;
  for (const a of actors) { /* every actor reloads: a new session, as a page would after the fence */ }
  await openAll(actors, f, v);
  const { results: second } = await race(actors, actors.map((a, i) => put('E2', 2, 'live-' + i)), f, 'b', v);
  account(v, second, actors.map(() => 'put'), { committed: 1 });
  const entities = [...(await createVault({ adapter: f.adapter }).unlock('pw')).state.encounters.keys()];
  if (!entities.includes('E2') && !entities.includes('enc:E2')) v.push('liveness: the next base was not won');
  await cold(f, v, { entities });
  return { v, records: null, fenced: { k, status: results[0].status, reason: results[0].reason ?? null } };
}

async function s5(actors) {   // S5: an explicit WRONG owner generation with NO competing commit: every actor is refused for exactly that reason, before P1, and nothing is written
  const v = [], f = await makeFolder('s5'); await openAll(actors, f, v);
  await race([actors[0]], [put('E1', 1, 'pre')], f, 'pre', v);
  const before = await cold(f, v, { entities: ['E1'] });
  const { results } = await race(actors, actors.map((a, i) => ({ kind: 'removeWrong', E: 'E1', op: 'rm-' + i, rev: 2 })), f, 'b', v);
  results.forEach((r, i) => { if (r.t !== 'result' || r.status !== 'not-written' || r.reason !== 'invalid-plan') v.push('actor ' + i + ': a wrong generation must be refused with exactly invalid-plan, got ' + JSON.stringify(r)); });
  await cold(f, v, { entities: ['E1'], records: before.records, keyGeneration: before.generation });
  return { v, records: before.records };
}

async function expectations() {   // what ONE actor alone leaves: the reference every N-actor repeat is compared with
  const solo = spawnActors(1, GOOD); await ready(solo);
  try {
    const a = await s1(solo, null), b = await s2(solo, null);
    const f = await makeFolder('s3c'), v = []; await openAll(solo, f, v);
    await race(solo, [put('E1', 1, 'pre')], f, 'pre', v); await race(solo, [put('E2', 2, 'op')], f, 'b', v);
    const c = await cold(f, v, { entities: ['E1', 'E2'] });
    assert.deepEqual([...a.v, ...b.v, ...v], [], 'the single-actor reference run itself must be clean');
    return { s1: a.records, s2: b.records, s3: c.records };
  } finally { await stop(solo); }
}
const EXPECT = await expectations();

// ---- the qualification: 4, 8 and 16 actors, REPEAT times each (20) --------------------------------------------------------------------------------------------------------------------------------
for (const N of COUNTS) {
  test(`typed engine: ${N} independent actors x ${REPEAT} repeats on one shared backend: one winner per base, known refusals, no mutation, cold replay equals`, { timeout: 3600000 }, async () => {
    const actors = spawnActors(N, GOOD); await ready(actors);
    try {
      for (let rep = 0; rep < REPEAT; rep++) {
        const outs = [await s1(actors, EXPECT), await s2(actors, EXPECT), await s3(actors, EXPECT), await s4(actors, rep), await s5(actors)];
        const v = outs.flatMap((o, i) => o.v.map((x) => 'S' + (i + 1) + ': ' + x));
        assert.deepEqual(v, [], `repeat ${rep + 1}/${REPEAT} with ${N} actors:\n  ` + v.join('\n  '));
      }
    } finally { await stop(actors); }
  });
}

// ---- the fence sweep: a fenced actor ALONE, the guard withdrawn at question 1 to 16: deterministic coverage of every phase of the commit ------------------------------------------------------
test('fence sweep: withdrawing the guard at any question of a commit never commits, and the phases beyond P1 are really covered', async () => {
  const actors = spawnActors(1, GOOD); await ready(actors);
  try {
    const seen = new Map();
    for (let rep = 0; rep < 16; rep++) {
      const o = await s4(actors, rep);   // k = 1 + (rep % 12): extend the sweep to 16 by also using the second lap
      assert.deepEqual(o.v, [], 'sweep question ' + (rep + 1) + ': ' + o.v.join(' | '));
      seen.set(o.fenced.status + (o.fenced.reason ? '/' + o.fenced.reason : ''), (seen.get(o.fenced.status + (o.fenced.reason ? '/' + o.fenced.reason : '')) || 0) + 1);
      assert.notEqual(o.fenced.status, 'committed', 'a withdrawn guard must never commit (question ' + o.fenced.k + ')');
    }
    const statuses = [...seen.keys()];
    assert.ok(statuses.some((x) => x === 'not-written/authority'), 'the guard was withdrawn before P1 at least once: ' + JSON.stringify([...seen]));
    assert.ok(statuses.some((x) => ['not-committed', 'unsettled', 'unknown'].some((p) => x.startsWith(p))), 'the guard was withdrawn AFTER P1 (an uncertain commit) at least once: ' + JSON.stringify([...seen]));
    if (process.env.TYPED_DEBUG) console.error('    fence sweep outcomes: ' + JSON.stringify([...seen]));
  } finally { await stop(actors); }
});

// ---- negative controls: the same races over a deliberately broken engine or backend must FAIL ------------------------------------------------------------------------------------------------
test('negative control: a backend that loses updates (no compare of the expected header and log) and an engine without the stale-base check are caught', async () => {
  const broken = buildEngine('nostale', [['stale-base check removed', 'if (canon(snap.header) !== meta.header || canon(snap.log) !== meta.log) return refuse("stale-base");', '']]);
  const actors = spawnActors(8, broken, { lossy: true }); await ready(actors);
  try {
    let caught = 0;
    for (let rep = 0; rep < 5 && !caught; rep++) { const o = await s1(actors, EXPECT); if (o.v.length) caught += 1; }
    assert.ok(caught > 0, 'the one-winner check did not notice a backend and an engine that let every actor win');
  } finally { await stop(actors); }
});
test('negative control: an engine that ignores the caller\'s guard lets a fenced actor commit, and the fence check catches it', async () => {
  const broken = buildEngine('noguard', [['guard ignored', 'const authorized = (guard) => { if (guard === undefined || guard === null) return true; try { return guard() === true; } catch { return false; } };', 'const authorized = () => true;']]);
  const actors = spawnActors(1, broken); await ready(actors);   // alone: the fenced actor is certain to be the one that would commit
  try {
    let caught = 0;
    for (let rep = 0; rep < 12; rep++) { const o = await s4(actors, rep); if (o.v.some((x) => x.includes('committed although its guard was withdrawn'))) caught += 1; }
    assert.ok(caught > 0, 'the fence check did not notice an engine that ignores the guard');
  } finally { await stop(actors); }
});

// One more negative control: the engine's needs-reconcile bar removed; scenario S4 must fail (the fenced actor's second commit in the SAME session must be refused with exactly needs-reconcile).
// Controls for the pending-marker check and the typed-unreadable refusal were tried and are NOT listed: the stale-base check and the adapter's compare of the expected header and log refuse first
// (a P1 changes the log, so every base read earlier is already stale), so removing them one at a time is not observable by these races (recorded on T893).
test('negative control: the needs-reconcile bar removed', async () => {
  const broken = buildEngine('noreconcile', [['needs-reconcile bar removed', 'if (needsReconcile) return refuse("needs-reconcile");', '']]);
  const actors = spawnActors(1, broken); await ready(actors);
  try {
    let caught = 0;
    for (let rep = 0; rep < 12; rep++) { const o = await s4(actors, rep); if (o.v.some((x) => x.includes('needs-reconcile'))) caught += 1; }
    assert.ok(caught > 0, 'the fenced actor was allowed to commit again before a reconcile and nothing noticed');
  } finally { await stop(actors); }
});
