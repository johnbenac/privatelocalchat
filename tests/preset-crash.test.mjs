// Abrupt death of a writer process around the preset store (chat/assistant/preset-store.mjs): the part of the T465 concurrency evidence that tab closes cannot give.
//
// WHAT IS REAL: the store module is the app's file, unchanged, run in 7 separate Node processes that are released together by a barrier; one of them (the victim) is stopped at a chosen
// point by SIGKILL, sent by this test to its process group. The test checks that the signal, not an exit or an exception, ended it (exit event: signal SIGKILL, no exit code, the group gone).
// WHAT IS SIMULATED (and exactly what it models): a browser is not started. Its two contracts that the store leans on are stood in for:
//   * localStorage: one file with a synchronous getItem/setItem. A setItem is a temp file, fsync and rename, so a reader sees all of the old value or all of the new one. That atomicity is
//     PROVIDED by the storage (a browser's localStorage), not a property of our code; the 'torn' control shows what a non-atomic storage would do and that this test notices.
//   * Web Locks: a broker in this process grants one holder at a time in order and frees the lock when the holder's connection closes, as a browser frees a dead tab's locks. Whether a real
//     browser does that is proven by the real-tab suite (tests/e2e/preset-concurrency.e2e.mjs, a tab closed with runBeforeUnload:false while it holds the lock). That suite tears a tab
//     down; it is NOT a process kill, and this one is not a browser. Together they cover teardown in a real browser and abrupt process death around the real module.
//   Durability across power loss or a kernel crash is not tested or claimed.
//
// Invariants (stated before the run), 7 actors per repeat, 20 repeats per kill point:
//   death        the victim ended by SIGKILL (not an exit), at the chosen point: holding the lock before writing, with the temp file written but not renamed, or after the rename but before it could acknowledge
//   no deadlock  the lock the victim held is freed by its death (the broker saw a disconnect, not a release); all 6 others finish inside the timeout and every one reports ok
//   no corruption/torn  the stored text parses as a list of {id,name,prompt} with unique ids; a reader polling the file all the time never sees anything else
//   no lost update  every add that reported success is in the final list exactly once; the other seeded preset is unchanged
//   victim's change  killed before the rename: absent; killed after it: present exactly once (no duplicate); nothing else appears that nobody asked for
//   conflicts reported  two editors of one preset: exactly one 'saved', one 'stale'; the stored text is the saved editor's
// Controls (the same checks must FAIL when the thing they guard is missing): no locks and a wide read-to-write window loses updates; a lock that a dead holder never frees leaves the others stuck;
// a storage that writes in two parts shows a torn file after a kill.
//   PLC_CRASH_REPEATS (default 20), PLC_CRASH_SCRATCH_ROOT (default: the system temporary folder), PLC_CRASH_EVIDENCE_DIR (when set, crash-evidence.json and the per-repeat logs go there)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBroker } from './helpers/preset-crash-broker.mjs';

const ACTOR = fileURLToPath(new URL('./helpers/preset-crash-actor.mjs', import.meta.url));
const REPEATS = Number(process.env.PLC_CRASH_REPEATS || 20);
const SCRATCH_ROOT = process.env.PLC_CRASH_SCRATCH_ROOT || os.tmpdir();
const EVIDENCE_DIR = process.env.PLC_CRASH_EVIDENCE_DIR || '';
const SEEDS = [{ id: 'seed-edit', name: 'Edit me', prompt: 'v0' }, { id: 'seed-keep', name: 'Keep me', prompt: 'k' }];
const PHASES = ['in-lock', 'tmp-written', 'renamed'];
assert.ok(Number.isInteger(REPEATS) && REPEATS > 0, "PLC_CRASH_REPEATS must be a positive integer");
const evidence = { node: process.version, platform: process.platform, repeats: REPEATS, runs: { kill: [], controls: {} } };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms).unref()); // unref: a timer that lost a race must not keep the test process alive
const until = async (test, ms, what) => { ms *= 4; /* the machine may be busy with other test files: a slow start is not a deadlock */ const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(2); } };

function startActor(config) {
  const child = spawn(process.execPath, [ACTOR, JSON.stringify(config)], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] }); // own process group: the group is what is killed
  const actor = { role: config.role, child, pid: child.pid, messages: [], stderr: '', exited: null };
  let buffer = '';
  child.stdout.on('data', chunk => { buffer += chunk; let at; while ((at = buffer.indexOf('\n')) >= 0) { try { actor.messages.push(JSON.parse(buffer.slice(0, at))); } catch { /* not ours */ } buffer = buffer.slice(at + 1); } });
  child.stderr.on('data', chunk => { actor.stderr += chunk; });
  actor.exit = new Promise(resolve => child.once('exit', (code, signal) => { actor.exited = { code, signal }; resolve(actor.exited); }));
  // Exit establishes the signal/code. Close also waits for the result pipe to drain.
  actor.closed = new Promise(resolve => child.once('close', resolve));
  actor.has = type => actor.messages.some(m => m.t === type);
  actor.go = () => child.stdin.write('go\n');
  return actor;
}

const groupGone = pgid => { try { process.kill(-pgid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };

/** One repeat: seed a scratch copy, start the actors, release them, kill the victim at its point, let the rest finish, return everything observed. */
async function run({ repeat, killAt, staged, storage = 'atomic', locks = 'broker', leak = false, waitMs = 60000, windowMs = 0, withVictim = true, timeoutMs = 15000 }) {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'plc-crash-'));
  const stateFile = path.join(dir, 'presets.json'), socket = path.join(dir, 'b.sock');
  fs.writeFileSync(stateFile, JSON.stringify(SEEDS));
  const broker = await startBroker(socket, { leakOnDisconnect: leak });
  const base = { stateFile, socket, storage, locks, waitMs, windowMs };
  const roles = [];
  if (withVictim) roles.push({ role: 'victim', killAt, op: { kind: 'add', id: 'victim-' + repeat, name: 'Victim ' + repeat, prompt: 'v' } });
  for (let i = 1; i <= 4; i++) roles.push({ role: 'add' + i, op: { kind: 'add', id: `add${i}-${repeat}`, name: `Added ${i} ${repeat}`, prompt: 'p' + i } });
  for (let i = 1; i <= 2; i++) roles.push({ role: 'edit' + i, op: { kind: 'edit', expected: SEEDS[0], prompt: 'edited by ' + i } });
  const actors = roles.map(r => startActor({ ...base, ...r }));
  const victim = withVictim ? actors[0] : null, others = actors.filter(a => a !== victim);
  let reads = 0, torn = 0;
  const reader = setInterval(() => { // a reader that never takes the lock
    let raw; try { raw = fs.readFileSync(stateFile, 'utf8'); } catch { return; }
    reads++; try { if (!Array.isArray(JSON.parse(raw))) torn++; } catch { torn++; }
  }, 1);
  const record = { repeat, killAt: withVictim ? killAt : null, staged, storage, locks, leak, dir: undefined, errors: [] };
  try {
    await until(() => actors.every(a => a.has('ready')), 10000, 'all actors to start');
    if (victim) {
      if (staged) { victim.go(); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + killAt); others.forEach(a => a.go()); await until(() => broker.queued() >= others.length, 5000, 'the others to queue behind the victim'); }
      else { actors.forEach(a => a.go()); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + killAt); }
      record.victimPhase = victim.messages.find(m => m.t === 'phase').name;
      record.queuedAtKill = broker.queued(); record.holderAtKill = broker.holderPid();
      record.victimPid = victim.pid; record.killedAt = Date.now();
      process.kill(-victim.pid, 'SIGKILL'); // the actual abrupt death: SIGKILL to the victim's process group
      await Promise.race([victim.exit, wait(5000)]);
      record.victimExit = victim.exited; record.victimGroupGone = victim.exited ? groupGone(victim.pid) : false;
    } else actors.forEach(a => a.go());
    const finished = await Promise.race([Promise.all(others.map(a => a.exit)).then(() => true), wait(timeoutMs).then(() => false)]);
    record.deadlock = !finished;
    if (!finished) for (const a of others) if (a.exited === null) process.kill(-a.pid, 'SIGKILL'); // our own stuck scratch actors only
    await Promise.all(actors.map(a => a.exit));
    // The broker learns of the victim's death when its event loop reads the closed socket. When the victim was last in the queue, every other actor had already finished and
    // nothing needed the lock freed, so without this wait a busy machine can close the broker first and the disconnect is never logged (a race in the test, not in the store).
    // A soft wait: it never throws, so a lock that really is never freed is still reported by violations() below.
    if (victim && locks === 'broker' && !leak) { const end = Date.now() + 10000; while (Date.now() < end && !broker.events.some(e => e.kind === 'free' && e.pid === victim.pid && e.cause === 'disconnect')) await wait(5); }
  } catch (error) {
    fs.rmSync(dir, { recursive: true, force: true }); throw error;
  } finally {
    clearInterval(reader);
    await broker.close();
    // whatever happened above (a timeout while the machine is busy, a failed wait), none of this run's own actors may outlive it: they would hold the test process open
    for (const a of actors) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* already gone */ } }
    await Promise.all(actors.map(a => a.closed));
  }
  record.reads = reads; record.tornReads = torn;
  record.finalText = fs.readFileSync(stateFile, 'utf8');
  record.leftoverTempFiles = fs.readdirSync(dir).filter(f => f.includes('.tmp-')).length;
  record.results = Object.fromEntries(others.map(a => [a.role, { exit: a.exited, ...(a.messages.find(m => m.t === 'result') || { missing: true }) }]));
  record.brokerEvents = broker.events.slice();
  record.stderr = actors.map(a => a.stderr).join('').slice(0, 2000);
  record.victimSurvivedWait = victim ? victim.has('survived-the-wait') : false;
  await broker.close();
  if (EVIDENCE_DIR) { const logs = path.join(EVIDENCE_DIR, 'logs'); fs.mkdirSync(logs, { recursive: true }); fs.writeFileSync(path.join(logs, `${record.leak ? 'leak' : record.storage === 'torn' ? 'torn' : record.locks === 'none' ? 'nolock' : 'kill'}-${String(repeat).padStart(2, '0')}.json`), JSON.stringify({ ...record, actors: actors.map(a => ({ role: a.role, pid: a.pid, exited: a.exited, messages: a.messages })) }, null, 1)); }
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

/** The invariants. Returns the list of violated ones (empty = all held). */
function violations(r, { expectVictim = true } = {}) {
  const bad = [];
  let list = null;
  try { list = JSON.parse(r.finalText); } catch { bad.push('final state does not parse'); }
  if (r.tornReads) bad.push(`a reader saw unparseable state ${r.tornReads} time(s)`);
  if (r.deadlock) bad.push('deadlock: the others did not finish');
  for (const [role, res] of Object.entries(r.results)) if (res.missing || res.exit?.code !== 0 || !res.ok) bad.push(`${role} did not complete ok (${res.missing ? 'no result' : res.code || 'exit ' + res.exit?.code})`);
  if (expectVictim) {
    if (r.victimExit?.signal !== 'SIGKILL' || r.victimExit?.code !== null) bad.push('victim did not end by SIGKILL');
    if (!r.victimGroupGone) bad.push('victim process group still present');
    if (r.victimSurvivedWait) bad.push('victim ran past its stop point');
    if (!r.brokerEvents.some(e => e.kind === 'free' && e.pid === r.victimPid && e.cause === 'disconnect')) bad.push('the lock was not freed by the victim’s death');
  }
  if (!Array.isArray(list)) return bad;
  const ids = list.map(x => x.id);
  if (new Set(ids).size !== ids.length) bad.push('duplicate ids: ' + ids.join(','));
  if (!list.every(x => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.prompt === 'string')) bad.push('a record is not whole');
  if (JSON.stringify(list.find(x => x.id === 'seed-keep')) !== JSON.stringify(SEEDS[1])) bad.push('the untouched preset changed');
  const allowed = new Set([...SEEDS.map(s => s.id)]);
  for (let i = 1; i <= 4; i++) {
    const id = `add${i}-${r.repeat}`; allowed.add(id);
    if (r.results['add' + i]?.ok && r.results['add' + i].status === 'added' && ids.filter(x => x === id).length !== 1) bad.push(`acknowledged add ${i} is not in the list exactly once (lost update)`);
  }
  const edits = ['edit1', 'edit2'].map(k => r.results[k]?.status);
  if (edits.filter(s => s === 'saved').length !== 1 || edits.filter(s => s === 'stale').length !== 1) bad.push('editors: expected one saved and one stale, got ' + edits.join('/'));
  const winner = ['edit1', 'edit2'].find(k => r.results[k]?.status === 'saved');
  const stored = list.find(x => x.id === 'seed-edit');
  if (!stored || (winner && stored.prompt !== 'edited by ' + winner.slice(4))) bad.push('the stored edit is not the saved editor’s');
  if (expectVictim) {
    const vid = 'victim-' + r.repeat; allowed.add(vid); const count = ids.filter(x => x === vid).length;
    if (r.killAt === 'renamed' && count !== 1) bad.push('victim killed after its rename: change should be present exactly once, found ' + count);
    if (r.killAt !== 'renamed' && count !== 0) bad.push('victim killed before its rename: change should be absent, found ' + count);
  }
  const extra = ids.filter(x => !allowed.has(x)); if (extra.length) bad.push('unexpected records: ' + extra.join(','));
  return bad;
}

const summary = r => ({ repeat: r.repeat, mode: r.staged ? 'staged' : 'simultaneous', killAt: r.killAt, victimPhase: r.victimPhase ?? null, victimPid: r.victimPid ?? null, victimExit: r.victimExit ?? null, victimGroupGone: r.victimGroupGone ?? null,
  queuedAtKill: r.queuedAtKill ?? null, lockFreedBy: (r.brokerEvents.find(e => e.kind === 'free' && e.pid === r.victimPid) || {}).cause ?? null, reads: r.reads, tornReads: r.tornReads, leftoverTempFiles: r.leftoverTempFiles,
  results: Object.fromEntries(Object.entries(r.results).map(([k, v]) => [k, v.ok ? (v.status || 'ok') : (v.code || 'failed')])), finalIds: (() => { try { return JSON.parse(r.finalText).map(x => x.id); } catch { return 'UNPARSEABLE'; } })(), violations: r.__v });

test(`7 parallel actors, one SIGKILLed at a chosen point, ${REPEATS} repeats per kill point: the others proceed, state whole, nothing acknowledged lost`, { timeout: 180000 }, async () => {
  const seen = { 'in-lock': 0, 'tmp-written': 0, renamed: 0 };
  for (let repeat = 1; repeat <= REPEATS * PHASES.length; repeat++) {
    const killAt = PHASES[(repeat - 1) % PHASES.length], staged = Math.floor((repeat - 1) / PHASES.length) % 2 === 0;
    const r = await run({ repeat, killAt, staged }); r.__v = violations(r); evidence.runs.kill.push(summary(r));
    assert.deepEqual(r.__v, [], `repeat ${repeat} (${killAt}, ${staged ? 'staged' : 'simultaneous'}): ` + r.stderr);
    assert.equal(r.victimPhase, killAt);
    assert.equal(r.holderAtKill, r.victimPid, "victim held the lock at death");
    seen[killAt]++;
    if (staged) assert.equal(r.queuedAtKill, 6, 'staged: all six others were waiting for the lock when the holder died');
  }
  for (const p of PHASES) assert.equal(seen[p], REPEATS, 'every kill point was exercised: ' + p);
  evidence.killPointCounts = seen;
});

test(`control: without locks (and a wide read-to-write window) the same checks catch lost updates`, { timeout: 120000 }, async () => {
  const flagged = []; const rows = [];
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, staged: false, locks: 'none', windowMs: 5, withVictim: false }); r.__v = violations(r, { expectVictim: false }); rows.push(summary(r)); if (r.__v.length) flagged.push(repeat);
  }
  evidence.runs.controls.noLocks = { repeats: REPEATS, flagged: flagged.length, rows };
  assert.ok(flagged.length >= Math.ceil(REPEATS * 0.9), `the unlocked store was caught in ${flagged.length}/${REPEATS} repeats`);
  assert.ok(rows.some(r => r.violations.some(v => v.includes('lost update'))), 'control must lose an acknowledged add, not just report an error');
});

test(`control: a lock that a dead holder never frees leaves the others stuck, and the checks say so`, { timeout: 120000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, killAt: 'in-lock', staged: true, leak: true, timeoutMs: 250 }); r.__v = violations(r); rows.push(summary(r)); if (r.deadlock && r.__v.some(v => v.startsWith('deadlock:'))) flagged++;
  }
  evidence.runs.controls.leakedLock = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a leaked lock is flagged');
});

test(`control: a storage that writes in two parts shows a torn file when the writer is killed, and the checks say so`, { timeout: 120000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, killAt: 'torn-half', staged: true, storage: 'torn' }); r.__v = violations(r); rows.push(summary(r)); if (r.__v.length) flagged++;
  }
  evidence.runs.controls.tornStorage = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a torn write is flagged');
});

after(() => { if (EVIDENCE_DIR) { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_DIR, 'crash-evidence.json'), JSON.stringify(evidence, null, 1) + '\n'); } });
