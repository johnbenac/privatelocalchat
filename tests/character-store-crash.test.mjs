// Real parallel processes and abrupt death around the rich character store (chat/characters/character-store.mjs). Board task T222, phase B.
//
// WHAT IS REAL: the store module is the app's file, unchanged (with the vendored producer validators it calls), run in 4 to 16 separate Node processes
// that prepare first and are then released together by a barrier so they collide at the lock; one of them (the victim) is stopped at a chosen point by
// SIGKILL sent by this test to its process group. The test checks that the signal, not an exit, ended it (exit event: signal SIGKILL, no exit code, group gone).
// WHAT IS SIMULATED (and exactly what it models): a browser is not started.
//   * localStorage / appLocal: one file with a synchronous getItem/setItem. A setItem is a temp file, fsync and rename, so a reader sees all of the old value or
//     all of the new one. That atomicity is PROVIDED by the storage (a browser's localStorage), not a property of our code; the 'torn' control shows what a
//     non-atomic storage would do and that this test notices.
//   * Web Locks: a broker in this process grants one holder at a time in order and frees the lock when the holder's connection closes, as a browser frees a
//     dead tab's locks. Whether a real browser does that for the plc-characters lock is the real-tab suite's job in the following phase; a tab teardown is
//     not a process kill and this is not a browser. No power loss, kernel crash, renderer or storage-durability claim is made.
//
// Invariants (stated before the run). Every repeat seeds three valid records (edit, keep, remove) and, per run:
//   death        the victim ended by SIGKILL at the chosen point (holding the lock before its write; temp file written, not renamed; after the rename, before it could answer)
//   no deadlock  the lock the victim held is freed by its death (the broker saw a disconnect, not a release); every other actor finishes inside the timeout
//   no corruption/torn  the stored text parses, has format 1, every record passes the store's own structural check, ids are unique; a reader polling the file
//                and a second reader using the store's read() all the time (never taking the lock) never sees anything else
//   no lost update  every admission that was acknowledged `admitted` is in the final records exactly once (by id AND by its admission id); the final revision equals the seed's
//                plus exactly the number of writes that happened (so no write vanished and none was invented)
//   no duplicate  one preparation committed twice at once gives exactly one `admitted` and one `already-admitted` and one record
//   conflicts reported  two updaters of the same record at the same version: exactly one `updated`, one `stale`; the record keeps its individualId, is at version 2 and is the winner's;
//                the remover removes its record once; the untouched record is byte-identical to its seed
//   victim's change  killed before the rename: absent; killed after it: present exactly once; nothing nobody asked for appears
// Controls (the same checks must FAIL when the thing they guard is missing): no locks, with a staged interleaving the test itself observes (every actor stops at its first
// fresh read, all holding the same base; one is released and its acknowledgement is observed; only then is an actor that already holds the old base released and overwrites it),
// loses an acknowledged update in every repeat, with no delay and no threshold; a lock that a dead holder never frees leaves the others stuck; a storage that writes in
// two parts shows a torn file after a kill.
//   PLC_CRASH_REPEATS (default 20), PLC_CRASH_SCRATCH_ROOT (default: the system temporary folder), PLC_CRASH_EVIDENCE_DIR (when set, crash-evidence.json and per-run logs go there)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto } from 'node:crypto';
import { startBroker } from './helpers/preset-crash-broker.mjs';
import { createCharacterStore, createMemoryStorage, createMemoryLocks, checkStoredRecord } from '../chat/characters/character-store.mjs';
import { plainWriteScope } from './helpers/character-write-scope.mjs'; // contract-only provided scope for the persistent store (this file tests other contracts)

const ACTOR = fileURLToPath(new URL('./helpers/character-crash-actor.mjs', import.meta.url));
const REPEATS = Number(process.env.PLC_CRASH_REPEATS || 20);
const SCRATCH_ROOT = process.env.PLC_CRASH_SCRATCH_ROOT || os.tmpdir();
const EVIDENCE_DIR = process.env.PLC_CRASH_EVIDENCE_DIR || '';
const CHARACTER_STORE_KEY = 'plc.characters.v1'; // the key the following wiring phase will own and classify
const PHASES = ['in-lock', 'tmp-written', 'renamed'];
const PACKAGES = ['minimal', 'neri', 'bex'];
assert.ok(Number.isInteger(REPEATS) && REPEATS > 0, 'PLC_CRASH_REPEATS must be a positive integer');
const evidence = { node: process.version, platform: process.platform, repeats: REPEATS, runs: { kill: [], plain: [], controls: {} } };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
const until = async (cond, ms, what) => { ms *= 4; const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(2); } };
const fixture = (name) => fs.readFileSync(new URL(`./fixtures/characters/examples/${name}.bundle.json`, import.meta.url), 'utf8');

// ---- the seed: three real, valid records made by the real store ----
const seed = await (async () => {
  const storage = createMemoryStorage();
  const store = createCharacterStore({ storage, key: CHARACTER_STORE_KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: plainWriteScope(storage) });
  const ids = {};
  for (const [role, pkg] of [['edit', 'neri'], ['keep', 'bex'], ['remove', 'minimal']]) {
    const p = await store.prepare({ text: fixture(pkg) });
    ids[role] = (await store.commit(p.preparation)).individualId;
  }
  const text = storage.getItem(CHARACTER_STORE_KEY);
  const state = JSON.parse(text);
  return { text, ids, revision: state.revision, keepRecord: JSON.stringify(state.records.find((r) => r.individualId === ids.keep)) };
})();

function startActor(config) {
  const child = spawn(process.execPath, [ACTOR, JSON.stringify(config)], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const actor = { role: config.role, kind: config.op.kind, child, pid: child.pid, messages: [], stderr: '', exited: null };
  let buffer = '';
  child.stdout.on('data', (chunk) => { buffer += chunk; let at; while ((at = buffer.indexOf('\n')) >= 0) { try { actor.messages.push(JSON.parse(buffer.slice(0, at))); } catch { /* not ours */ } buffer = buffer.slice(at + 1); } });
  child.stderr.on('data', (chunk) => { actor.stderr += chunk; });
  actor.exit = new Promise((resolve) => child.once('exit', (code, signal) => { actor.exited = { code, signal }; resolve(actor.exited); }));
  actor.has = (type) => actor.messages.some((m) => m.t === type);
  actor.go = () => child.stdin.write('go\n');
  actor.releaseFile = config.releaseFile || null;
  return actor;
}
const groupGone = (pgid) => { try { process.kill(-pgid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };

/** Roles for a run of `total` actors (4 to 16): two updaters of one record and a double-callback actor always, a remover from 8 on, adders for the rest. */
function rolesFor(total, repeat) {
  const roles = [
    { role: 'upd1', op: { kind: 'update', pkg: 'bex', target: { individualId: seed.ids.edit, recordVersion: 1 } } },
    { role: 'upd2', op: { kind: 'update', pkg: 'minimal', target: { individualId: seed.ids.edit, recordVersion: 1 } } },
    { role: 'double', op: { kind: 'double', pkg: PACKAGES[repeat % 3] } },
  ];
  if (total >= 8) roles.push({ role: 'rem', op: { kind: 'remove', target: { individualId: seed.ids.remove, recordVersion: 1 } } });
  for (let i = 1; roles.length < total; i++) roles.push({ role: 'add' + i, op: { kind: 'fresh', pkg: PACKAGES[(repeat + i) % 3] } });
  return roles;
}

async function run({ repeat, total, killAt = null, staged = false, storage = 'atomic', locks = 'broker', leak = false, rendezvous = false, timeoutMs = 25000 }) {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'plc-char-crash-'));
  const stateFile = path.join(dir, 'characters.json'), socket = path.join(dir, 'b.sock');
  fs.writeFileSync(stateFile, seed.text);
  const broker = await startBroker(socket, { leakOnDisconnect: leak });
  const base = { stateFile, socket, storage, locks, rendezvous, waitMs: 60000 };
  const roles = rolesFor(total - (killAt ? 1 : 0), repeat);
  if (killAt) roles.unshift({ role: 'victim', killAt, op: { kind: 'fresh', pkg: 'minimal' } });
  const actors = roles.map((r) => startActor({ ...base, ...r, releaseFile: path.join(dir, 'release-' + r.role) }));
  const victim = killAt ? actors[0] : null, others = actors.filter((a) => a !== victim);
  const reader = createCharacterStore({ key: CHARACTER_STORE_KEY, storage: { getItem: (k) => { try { return fs.readFileSync(stateFile, 'utf8'); } catch { return null; } }, setItem() { throw new Error('reader must not write'); } }, locks: null, crypto: webcrypto });
  let reads = 0, torn = 0, storeReadFailures = 0;
  const poll = setInterval(() => {
    let text; try { text = fs.readFileSync(stateFile, 'utf8'); } catch { return; }
    reads++; try { const s = JSON.parse(text); if (!s || !Array.isArray(s.records)) torn++; } catch { torn++; }
    const r = reader.read(); if (!r.ok) storeReadFailures++;
  }, 2);
  const record = { repeat, total, killAt, staged, storage, locks, leak, errors: [] };
  try {
    await until(() => actors.every((a) => a.has('ready') || a.has('result')), 40000, 'all actors to prepare');
    if (victim) {
      if (staged) {
        victim.go(); await until(() => victim.has('phase'), 8000, 'the victim to reach ' + killAt);
        others.forEach((a) => a.go());
        const expectQueued = others.length + (others.some((a) => a.kind === 'double') ? 1 : 0);
        await until(() => broker.queued() >= expectQueued, 15000, 'the others to queue behind the victim');
      } else { actors.forEach((a) => a.go()); await until(() => victim.has('phase'), 15000, 'the victim to reach ' + killAt); }
      record.victimPhase = victim.messages.find((m) => m.t === 'phase').name;
      record.queuedAtKill = broker.queued(); record.holderAtKill = broker.holderPid(); record.victimPid = victim.pid;
      process.kill(-victim.pid, 'SIGKILL');
      await Promise.race([victim.exit, wait(5000)]);
      record.victimExit = victim.exited; record.victimGroupGone = victim.exited ? groupGone(victim.pid) : false;
    } else if (rendezvous) {
      // the actual interleaving, driven by what is observed: every actor parks at its first fresh read of the stored state (all hold the same base), then they are released one at a time,
      // each only after the previous one's acknowledgement (its own result message, with the stored state read from the file) has been seen
      actors.forEach((a) => a.go());
      await until(() => actors.every((a) => a.has('parked')), 30000, 'every actor to park at its first fresh read');
      const order = [...actors.filter((a) => a.kind === 'fresh'), ...actors.filter((a) => a.kind !== 'fresh')];
      const first = order[0];
      record.rendezvous = { bases: actors.map((a) => a.messages.find((m) => m.t === 'parked').base), order: order.map((a) => a.role), steps: [] };
      for (const a of order) {
        fs.writeFileSync(a.releaseFile, 'go');
        await until(() => a.has('result'), 30000, a.role + ' to be acknowledged');
        let stored = null; try { stored = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { /* recorded as null */ }
        const firstId = (first.messages.find((m) => m.t === 'result') || {}).admissionId;
        record.rendezvous.steps.push({ role: a.role, acknowledged: (a.messages.find((m) => m.t === 'result').outcomes || []).map((o) => o.status || o.code), revisionAfter: stored ? stored.revision : null, firstStillStored: stored ? stored.records.some((x) => x.admissions.includes(firstId)) : null });
      }
    } else actors.forEach((a) => a.go());
    const finished = await Promise.race([Promise.all(others.map((a) => a.exit)).then(() => true), wait(timeoutMs).then(() => false)]);
    record.deadlock = !finished;
    if (!finished) for (const a of others) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.all(actors.map((a) => a.exit));
  } catch (error) { fs.rmSync(dir, { recursive: true, force: true }); throw error; }
  finally {
    clearInterval(poll); await broker.close();
    for (const a of actors) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.all(actors.map((a) => a.exit));
  }
  record.reads = reads; record.tornReads = torn; record.storeReadFailures = storeReadFailures;
  record.finalText = fs.readFileSync(stateFile, 'utf8');
  record.leftoverTempFiles = fs.readdirSync(dir).filter((f) => f.includes('.tmp-')).length;
  record.actors = actors.map((a) => ({ role: a.role, kind: a.kind, pid: a.pid, exited: a.exited, ready: a.messages.find((m) => m.t === 'ready') || null, result: a.messages.find((m) => m.t === 'result') || null }));
  record.victimAdmissionId = victim ? (victim.messages.find((m) => m.t === 'ready') || {}).admissionId ?? null : null;
  record.brokerEvents = broker.events.slice(); record.stderr = actors.map((a) => a.stderr).join('').slice(0, 2000);
  record.victimSurvivedWait = victim ? victim.has('survived-the-wait') : false;
  if (EVIDENCE_DIR) { const logs = path.join(EVIDENCE_DIR, 'logs'); fs.mkdirSync(logs, { recursive: true }); fs.writeFileSync(path.join(logs, `${leak ? 'leak' : storage === 'torn' ? 'torn' : locks === 'none' ? 'nolock' : killAt ? 'kill' : 'plain'}-${total}-${String(repeat).padStart(2, '0')}-${killAt || 'none'}.json`), JSON.stringify(record, null, 1)); }
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

/** The invariants. Returns the list of violated ones (empty = all held). */
function violations(r, { expectVictim = true } = {}) {
  const bad = [];
  let state = null;
  try { state = JSON.parse(r.finalText); } catch { bad.push('final state does not parse'); }
  if (r.tornReads) bad.push(`a reader saw unparseable state ${r.tornReads} time(s)`);
  if (r.storeReadFailures) bad.push(`the store's own read() refused the stored state ${r.storeReadFailures} time(s) while it was being changed`);
  if (r.deadlock) bad.push('deadlock: the others did not finish');
  const others = r.actors.filter((a) => a.role !== 'victim');
  for (const a of others) if (!a.result || a.result.failed || a.exited?.code !== 0 || !a.result.outcomes) bad.push(`${a.role} did not complete (${a.result?.failed || 'exit ' + a.exited?.code})`);
  if (expectVictim) {
    if (r.victimExit?.signal !== 'SIGKILL' || r.victimExit?.code !== null) bad.push('victim did not end by SIGKILL');
    if (!r.victimGroupGone) bad.push('victim process group still present');
    if (r.victimSurvivedWait) bad.push('victim ran past its stop point');
    if (!r.brokerEvents.some((e) => e.kind === 'free' && e.pid === r.victimPid && e.cause === 'disconnect')) bad.push('the lock was not freed by the victim’s death');
  }
  if (!state || !Array.isArray(state.records)) return bad;
  if (state.format !== 1 || !Number.isSafeInteger(state.revision)) bad.push('state header is not format 1 with a revision');
  const ids = state.records.map((x) => x.individualId);
  if (new Set(ids).size !== ids.length) bad.push('duplicate individual references');
  for (const rec of state.records) { const why = checkStoredRecord(rec); if (why) bad.push('a record is not whole: ' + why); }
  const byId = new Map(state.records.map((x) => [x.individualId, x]));
  const countAdmission = (admissionId) => state.records.filter((x) => x.admissions.includes(admissionId)).length;
  let writes = 0;
  const outcomeOf = (a) => a.result?.outcomes || [];
  for (const a of others) {
    const outs = outcomeOf(a);
    if (a.kind === 'fresh') {
      const o = outs[0];
      if (o?.status === 'admitted') {
        writes++;
        const rec = byId.get(o.individualId);
        if (!rec || !rec.admissions.includes(a.result?.admissionId) || countAdmission(a.result?.admissionId) !== 1) bad.push(`acknowledged admission by ${a.role} is not in the records exactly once (lost update)`);
      } else bad.push(`${a.role} was not admitted: ${o?.code || o?.status}`);
    } else if (a.kind === 'double') {
      const s = outs.map((o) => o.status).sort().join('/');
      if (s !== 'admitted/already-admitted') bad.push('double callback: expected admitted/already-admitted, got ' + s);
      if (countAdmission(a.result?.admissionId) !== 1) bad.push('double callback produced ' + countAdmission(a.result?.admissionId) + ' records');
      writes += outs.filter((o) => o.status === 'admitted').length;
    } else if (a.kind === 'remove') {
      if (outs[0]?.status === 'removed') writes++; else bad.push('remover: ' + (outs[0]?.code || outs[0]?.status));
      if (byId.has(seed.ids.remove)) bad.push('the removed record is still there');
    }
  }
  const upd = others.filter((a) => a.kind === 'update');
  if (upd.length) {
    const statuses = upd.map((a) => outcomeOf(a)[0]?.status || outcomeOf(a)[0]?.code);
    if (statuses.filter((s) => s === 'updated').length !== 1 || statuses.filter((s) => s === 'stale').length !== 1) bad.push('updaters: expected one updated and one stale, got ' + statuses.join('/'));
    writes += statuses.filter((s) => s === 'updated').length;
    const winner = upd.find((a) => outcomeOf(a)[0]?.status === 'updated');
    const stored = byId.get(seed.ids.edit);
    if (!stored || stored.recordVersion !== 2 || (winner && stored.preview.name !== winner.result?.name) || (winner && !stored.admissions.includes(winner.result?.admissionId))) bad.push('the stored update is not the winner’s, at version 2, with its individualId');
  }
  if (JSON.stringify(byId.get(seed.ids.keep)) !== seed.keepRecord) bad.push('the untouched record changed');
  let created = 0;
  for (const a of others) { if (a.kind === 'fresh' || a.kind === 'double') created += outcomeOf(a).filter((o) => o.status === 'admitted').length; }
  const removed = others.some((a) => a.kind === 'remove' && outcomeOf(a)[0]?.status === 'removed') ? 1 : 0;
  if (expectVictim) {
    const count = r.victimAdmissionId ? countAdmission(r.victimAdmissionId) : 0;
    if (r.killAt === 'renamed') { writes++; if (count !== 1) bad.push('victim killed after its rename: change should be present exactly once, found ' + count); }
    else if (count !== 0) bad.push('victim killed before its rename: change should be absent, found ' + count);
  }
  if (state.revision !== seed.revision + writes) bad.push(`revision ${state.revision} != seed ${seed.revision} + ${writes} writes (a write was lost or invented)`);
  const victimRecord = expectVictim && r.killAt === 'renamed' ? 1 : 0;
  if (state.records.length !== 3 + created + victimRecord - removed) bad.push(`${state.records.length} records, expected ${3 + created + victimRecord - removed} (nothing unasked for, nothing missing)`);
  return bad;
}

const summary = (r) => ({ repeat: r.repeat, total: r.total, mode: r.staged ? 'staged' : 'simultaneous', killAt: r.killAt, victimPhase: r.victimPhase ?? null, victimPid: r.victimPid ?? null, victimExit: r.victimExit ?? null, victimGroupGone: r.victimGroupGone ?? null,
  queuedAtKill: r.queuedAtKill ?? null, lockFreedBy: (r.brokerEvents.find((e) => e.kind === 'free' && e.pid === r.victimPid) || {}).cause ?? null, reads: r.reads, tornReads: r.tornReads, storeReadFailures: r.storeReadFailures, leftoverTempFiles: r.leftoverTempFiles,
  results: Object.fromEntries(r.actors.filter((a) => a.role !== 'victim').map((a) => [a.role, (a.result?.outcomes || []).map((o) => o.status || o.code).join('+') || (a.result?.failed ? 'failed' : 'none')])), finalRecords: (() => { try { return JSON.parse(r.finalText).records.length; } catch { return 'UNPARSEABLE'; } })(), finalRevision: (() => { try { return JSON.parse(r.finalText).revision; } catch { return null; } })(), violations: r.__v });

test(`4 to 16 parallel actors, one SIGKILLed at a chosen point, ${REPEATS} repeats per kill point: the others proceed, state whole, nothing acknowledged lost`, { timeout: 3_000_000 }, async () => {
  const seen = { 'in-lock': 0, 'tmp-written': 0, renamed: 0 };
  const totals = new Set();
  for (let repeat = 1; repeat <= REPEATS * PHASES.length; repeat++) {
    const killAt = PHASES[(repeat - 1) % PHASES.length], staged = Math.floor((repeat - 1) / PHASES.length) % 2 === 0;
    const total = [8, 10, 12, 14, 16][Math.floor((repeat - 1) / PHASES.length) % 5];
    totals.add(total);
    const r = await run({ repeat, total, killAt, staged }); r.__v = violations(r); evidence.runs.kill.push(summary(r));
    assert.deepEqual(r.__v, [], `repeat ${repeat} (${killAt}, ${staged ? 'staged' : 'simultaneous'}, ${total} actors): ` + r.stderr);
    assert.equal(r.victimPhase, killAt); assert.equal(r.holderAtKill, r.victimPid, 'victim held the lock at death');
    assert.equal(r.actors.length, total);
    if (staged) assert.ok(r.queuedAtKill >= total - 2, 'staged: the others were waiting for the lock when the holder died (' + r.queuedAtKill + ')');
    seen[killAt]++;
  }
  for (const p of PHASES) assert.equal(seen[p], REPEATS, 'every kill point was exercised: ' + p);
  evidence.killPointCounts = seen; evidence.killActorCounts = [...totals];
});

test(`4, 8, 12 and 16 parallel actors with no death, ${REPEATS} repeats: distinct additions, double callbacks, stale updates and a removal all land exactly once`, { timeout: 3_000_000 }, async () => {
  const sizes = [4, 8, 12, 16];
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const total = sizes[(repeat - 1) % sizes.length];
    const r = await run({ repeat, total }); r.__v = violations(r, { expectVictim: false }); evidence.runs.plain.push(summary(r));
    assert.deepEqual(r.__v, [], `repeat ${repeat} (${total} actors): ` + r.stderr);
    assert.equal(r.actors.length, total);
  }
});

test('control: without locks, a stale writer released after another was acknowledged overwrites it and the same checks catch the lost update', { timeout: 1_200_000 }, async () => {
  const flagged = []; const rows = [];
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, total: 8, locks: 'none', rendezvous: true }); r.__v = violations(r, { expectVictim: false }); rows.push({ ...summary(r), rendezvous: r.rendezvous }); if (r.__v.length) flagged.push(repeat);
    // the interleaving really happened, every time: all eight held the seed's revision; the first released one was acknowledged and stored; the next one, which held the old base, was
    // acknowledged too and its write replaced the stored state, so the first one's acknowledged admission is gone
    const x = r.rendezvous;
    assert.ok(x, `repeat ${repeat}: no rendezvous was recorded`);
    assert.deepEqual(x.bases, Array(8).fill(seed.revision), `repeat ${repeat}: every actor read the same base before anyone wrote`);
    assert.deepEqual(x.steps[0].acknowledged, ['admitted']); assert.equal(x.steps[0].revisionAfter, seed.revision + 1); assert.equal(x.steps[0].firstStillStored, true, `repeat ${repeat}: the first acknowledgement was stored`);
    assert.deepEqual(x.steps[1].acknowledged, ['admitted']); assert.equal(x.steps[1].revisionAfter, seed.revision + 1, `repeat ${repeat}: the stale writer replaced the acknowledged state (same revision)`); assert.equal(x.steps[1].firstStillStored, false, `repeat ${repeat}: the first acknowledged admission was overwritten`);
  }
  evidence.runs.controls.noLocks = { repeats: REPEATS, flagged: flagged.length, rows };
  assert.equal(flagged.length, REPEATS, `the unlocked store was caught in ${flagged.length}/${REPEATS} repeats`);
  assert.ok(rows.some((r) => r.violations.some((v) => v.includes('lost update') || v.includes('revision'))), 'control must lose an acknowledged write, not just report an error');
});

test('control: a lock that a dead holder never frees leaves the others stuck, and the checks say so', { timeout: 1_200_000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, total: 6, killAt: 'in-lock', staged: true, leak: true, timeoutMs: 400 }); r.__v = violations(r); rows.push(summary(r)); if (r.deadlock && r.__v.some((v) => v.startsWith('deadlock:'))) flagged++;
  }
  evidence.runs.controls.leakedLock = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a leaked lock is flagged');
});

test('control: a storage that writes in two parts shows a torn file when the writer is killed, and the checks say so', { timeout: 1_200_000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, total: 6, killAt: 'torn-half', staged: true, storage: 'torn' }); r.__v = violations(r); rows.push(summary(r)); if (r.__v.length) flagged++;
  }
  evidence.runs.controls.tornStorage = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a torn write is flagged');
});

after(() => { if (EVIDENCE_DIR) { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_DIR, 'crash-evidence.json'), JSON.stringify(evidence, null, 1) + '\n'); } });
