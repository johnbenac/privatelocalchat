// Parallel and abrupt-death proof for the preferences writer (chat/assistant/prefs-store.mjs) used by BOTH the manual savePrefs writer and a protected backup's restore (T34).
//
// WHAT IS REAL: the app's own prefs-store.mjs (and prefs-restore.mjs) run unchanged in 12 separate Node processes released together by a barrier: 6 restorers (one of them the victim),
// 6 manual writers (the existing savePrefs path: a stale tab copy, then fields changed; one makes 10 quick saves in a row). The victim is stopped by SIGKILL, sent by this test to its process
// group, at a chosen point inside the lock; the test checks the signal ended it (no exit code, group gone). Every restorer starts with an EMPTY copy of the preferences and every manual writer with
// the STALE copy every tab read at start, while the stored preferences already hold the person's choices: what the old whole-object writer would have erased.
// WHAT IS SIMULATED: no browser. localStorage = one file, atomic temp-file rename (PROVIDED by a browser's storage, not our code); Web Locks = the broker of tests/helpers/preset-crash-broker.mjs
// (one holder at a time, first in first out, freed when the holder's connection dies, as a browser frees a dead tab's locks; real tabs are shown by tests/e2e/prefs-backup-restore.e2e.mjs).
// Not claimed: power loss, kernel crash, renderer kill, writers that bypass the store (nothing in the app does: every savePrefs call and the backup restore go through it).
//
// Invariants, stated before the run (12 actors per repeat, 20 repeats per kill point, 3 kill points; plus 20 repeats with no victim):
//   death           the victim ended by SIGKILL and its group is gone; the lock was freed by its death (a disconnect)
//   no deadlock     the eleven others finish inside the timeout, every save/restore reports ok
//   no corruption   the stored text parses as an object at every poll of a reader running all the time (a temp file left by a kill before the rename is never the key)
//   no lost update  the manual changes of DIFFERENT fields all survive the stale tabs and the restores: callSounds=true, instructions='edited by manual', nudgeUntil=10 (last of 10 quick saves);
//                   the person's other values (a field this build does not know) are unchanged
//   same field      two manual writers change lastExportAt from the same stale value: exactly one wins, the other gets a reported conflict, the stored value is the winner's, and the loser's
//                   own copy was put back to it (no silent overwrite either way)
//   restore vs me   enterSends: a manual true and a restore race. No conflict reported => stored true. A conflict reported => stored is the restore's value and the loser's copy matches it.
//   whole winner    voiceURI and speechRate (unset in the seed) come from ONE backup (X or Y), never a mixture, taken by exactly one restorer (none when the victim's rename got in first and
//                   already wrote them: then they are X's)
//   quick saves     10 saves made without waiting are applied in the order made: the last one is stored, none reports a conflict
// Controls (the checks must FAIL when the thing they guard is missing):
//   no Web Locks    every actor is REFUSED ('unsupported'), the stored text is byte-identical to the seed and each actor's own copy is back to what it started with: no unlocked fallback
//   held lock       a lock a dead holder never frees, waitMs 300: every waiter is refused 'busy', stored text byte-identical, own copies back: no timeout fallback
//   leaked lock     the same with a long wait: the others are stuck and the checker reports the deadlock
//   old writer      a whole-object write of a stale copy (what savePrefs did) after the others: the checker reports the lost choices
//   PLC_PREFS_REPEATS (default 20), PLC_PREFS_SCRATCH_ROOT (default: the system temporary folder), PLC_PREFS_EVIDENCE_DIR (when set, prefs-restore-evidence.json goes there)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBroker } from './helpers/preset-crash-broker.mjs';

const ACTOR = fileURLToPath(new URL('./helpers/prefs-restore-actor.mjs', import.meta.url));
const REPEATS = Number(process.env.PLC_PREFS_REPEATS || 20);
const SCRATCH_ROOT = process.env.PLC_PREFS_SCRATCH_ROOT || os.tmpdir();
const EVIDENCE_DIR = process.env.PLC_PREFS_EVIDENCE_DIR || '';
assert.ok(Number.isInteger(REPEATS) && REPEATS > 0, 'PLC_PREFS_REPEATS must be a positive integer');
const SEED = { instructions: 'mine', enterSends: null, callSounds: false, lastExportAt: 123, fromNewerBuild: { keep: ['me'] } };
const X = { instructions: 'from X', enterSends: false, voiceURI: 'voice-x', speechRate: 1.2 };
const Y = { instructions: 'from Y', enterSends: true, voiceURI: 'voice-y', speechRate: 0.8 };
const PHASES = ['in-lock', 'tmp-written', 'renamed'];
const OTHERS_REQUESTS = 5 + 5 + 10; // lock requests made by the actors that are not the victim: 5 restorers, 5 single manual saves, 10 quick saves
const evidence = { node: process.version, platform: process.platform, repeats: REPEATS, kill: [], controls: {} };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
const until = async (cond, ms, what) => { const end = Date.now() + ms * 4; while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(5); } };
const manual = (role, edits) => ({ role, kind: 'manual', edits });

function startActor(config) {
  const child = spawn(process.execPath, [ACTOR, JSON.stringify(config)], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const actor = { role: config.role, child, pid: child.pid, messages: [], stderr: '', exited: null };
  let buffer = '';
  child.stdout.on('data', (chunk) => { buffer += chunk; let at; while ((at = buffer.indexOf('\n')) >= 0) { try { actor.messages.push(JSON.parse(buffer.slice(0, at))); } catch { /* not ours */ } buffer = buffer.slice(at + 1); } });
  child.stderr.on('data', (chunk) => { actor.stderr += chunk; });
  actor.exit = new Promise((resolve) => child.once('exit', (code, signal) => { actor.exited = { code, signal }; resolve(actor.exited); }));
  actor.has = (type) => actor.messages.some((m) => m.t === type);
  actor.go = () => child.stdin.write('go\n');
  return actor;
}
const groupGone = (pgid) => { try { process.kill(-pgid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };

async function run({ repeat, killAt = null, locks = 'broker', leak = false, timeoutMs = 15000, waitMs = 60000, legacyLast = false }) {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'plc-prefs-'));
  const stateFile = path.join(dir, 'prefs.json'), socket = path.join(dir, 'b.sock');
  const seedText = JSON.stringify(SEED);
  fs.writeFileSync(stateFile, seedText);
  const broker = await startBroker(socket, { leakOnDisconnect: leak });
  const base = { stateFile, socket, locks, waitMs, seedLive: SEED };
  const roles = [];
  if (killAt) roles.push({ role: 'victim', kind: 'restore', killAt, backupPrefs: X });
  [['x1', X], ['y1', Y], ['x2', X], ['y2', Y], ['x3', X]].forEach(([role, backupPrefs]) => roles.push({ role, kind: 'restore', backupPrefs }));
  roles.push(manual('callSounds', { callSounds: true }), manual('instructions', { instructions: 'edited by manual' }), manual('enter', { enterSends: true }),
    manual('export1', { lastExportAt: 1001 }), manual('export2', { lastExportAt: 1002 }), { role: 'rapid', kind: 'manual', rapid: { field: 'nudgeUntil', n: 10 } });
  const actors = roles.map((r) => startActor({ ...base, ...r }));
  const victim = killAt ? actors[0] : null, others = actors.filter((a) => a !== victim);
  let reads = 0, torn = 0;
  const reader = setInterval(() => { let raw; try { raw = fs.readFileSync(stateFile, 'utf8'); } catch { return; } reads++; try { const v = JSON.parse(raw); if (!v || typeof v !== 'object' || Array.isArray(v)) torn++; } catch { torn++; } }, 1);
  const record = { repeat, killAt, locks, leak, seedText };
  let legacy = null;
  try {
    await until(() => actors.every((a) => a.has('ready')), 10000, 'all actors to start');
    if (victim) {
      victim.go(); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + killAt);
      others.forEach((a) => a.go());
      if (locks === 'broker' && waitMs > 1000) await until(() => broker.queued() >= OTHERS_REQUESTS, 5000, 'the others to queue behind the victim');
      else await wait(50);
      record.victimPid = victim.pid; record.holderAtKill = broker.holderPid(); record.queuedAtKill = broker.queued();
      process.kill(-victim.pid, 'SIGKILL');
      await Promise.race([victim.exit, wait(5000)]);
      record.victimExit = victim.exited; record.victimGroupGone = victim.exited ? groupGone(victim.pid) : false;
    } else actors.forEach((a) => a.go());
    const finished = await Promise.race([Promise.all(others.map((a) => a.exit)).then(() => true), wait(timeoutMs).then(() => false)]);
    record.deadlock = !finished;
    if (!finished) for (const a of others) if (a.exited === null) process.kill(-a.pid, 'SIGKILL');
    await Promise.all(actors.map((a) => a.exit));
    if (legacyLast) { legacy = startActor({ ...base, role: 'legacy', kind: 'legacy' }); await until(() => legacy.has('ready'), 5000, 'legacy'); legacy.go(); await legacy.exit; }
  } finally {
    clearInterval(reader); await broker.close();
    for (const a of [...actors, legacy].filter(Boolean)) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.all([...actors, legacy].filter(Boolean).map((a) => a.exit));
  }
  record.reads = reads; record.tornReads = torn; record.finalText = fs.readFileSync(stateFile, 'utf8');
  record.results = Object.fromEntries(others.map((a) => [a.role, { exit: a.exited, ...(a.messages.find((m) => m.t === 'result') || { missing: true }) }]));
  record.brokerEvents = broker.events.slice(); record.stderr = actors.map((a) => a.stderr).join('').slice(0, 2000);
  record.victimSurvivedWait = victim ? victim.has('survived-the-wait') : false;
  record.leftovers = fs.readdirSync(dir).filter((f) => f.startsWith('prefs.json.tmp'));
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

const outcomes = (r, role) => r.results[role]?.results || [];
function violations(r) {
  const bad = []; let stored = null;
  try { stored = JSON.parse(r.finalText); } catch { bad.push('final state does not parse'); }
  if (r.tornReads) bad.push(`a reader saw unparseable state ${r.tornReads} time(s)`);
  if (r.deadlock) bad.push('deadlock: the others did not finish');
  for (const [role, res] of Object.entries(r.results)) {
    if (res.missing || res.exit?.code !== 0) { bad.push(`${role} did not complete (${res.missing ? 'no result' : 'exit ' + res.exit?.code})`); continue; }
    for (const o of res.results) if (!o.ok) bad.push(`${role} was refused: ${o.code}`);
  }
  if (r.killAt) {
    if (r.victimExit?.signal !== 'SIGKILL' || r.victimExit?.code !== null) bad.push('victim did not end by SIGKILL');
    if (!r.victimGroupGone) bad.push('victim process group still present');
    if (r.victimSurvivedWait) bad.push('victim ran past its stop point');
    if (!r.brokerEvents.some((e) => e.kind === 'free' && e.pid === r.victimPid && e.cause === 'disconnect')) bad.push('the lock was not freed by the victim’s death');
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored) || r.deadlock) return bad;
  if (stored.callSounds !== true) bad.push('lost update: a manual callSounds=true is gone: ' + JSON.stringify(stored.callSounds));
  if (stored.instructions !== 'edited by manual') bad.push('lost update: the manual instructions edit is gone: ' + JSON.stringify(stored.instructions));
  if (stored.nudgeUntil !== 10) bad.push('quick saves: the last of 10 is not what is stored: ' + JSON.stringify(stored.nudgeUntil));
  if (JSON.stringify(stored.fromNewerBuild) !== JSON.stringify(SEED.fromNewerBuild)) bad.push('a field this build does not know was lost');
  for (const o of outcomes(r, 'rapid')) if (o.conflicts?.length) bad.push('a quick save reported a conflict with itself');
  if (r.results.rapid?.live?.nudgeUntil !== 10) bad.push('the quick-saving tab ended with ' + JSON.stringify(r.results.rapid?.live?.nudgeUntil));
  // same field, stale tabs
  const lost = ['export1', 'export2'].filter((role) => outcomes(r, role)[0]?.conflicts?.length === 1);
  const won = ['export1', 'export2'].filter((role) => outcomes(r, role)[0]?.conflicts?.length === 0);
  if (lost.length !== 1 || won.length !== 1) bad.push('same field: expected exactly one winner and one reported conflict, got winners ' + won + ' losers ' + lost);
  else {
    const want = { export1: 1001, export2: 1002 };
    if (stored.lastExportAt !== want[won[0]]) bad.push('same field: stored lastExportAt is not the winner’s: ' + stored.lastExportAt);
    if (r.results[lost[0]].live.lastExportAt !== stored.lastExportAt) bad.push('same field: the loser’s own copy was not put back to the stored value');
    if (outcomes(r, lost[0])[0].conflicts[0].kept !== stored.lastExportAt || outcomes(r, lost[0])[0].conflicts[0].field !== 'lastExportAt') bad.push('same field: the conflict does not name the kept value');
  }
  // Enter sends: manual vs restore
  const enter = outcomes(r, 'enter')[0];
  if (typeof stored.enterSends !== 'boolean') bad.push('enterSends is not a boolean: ' + JSON.stringify(stored.enterSends));
  else if (!enter?.conflicts?.length) { if (stored.enterSends !== true) bad.push('no conflict was reported for the manual Enter sends=true yet stored is ' + stored.enterSends); }
  else if (r.results.enter.live.enterSends !== stored.enterSends) bad.push('Enter sends: the loser’s own copy was not put back to the stored value');
  // the restored voice and speed: one whole winner, taken once
  const winner = [X, Y].find((b) => stored.voiceURI === b.voiceURI && stored.speechRate === b.speechRate);
  if (!winner) bad.push('voiceURI/speechRate are not whole from one backup: ' + JSON.stringify([stored.voiceURI, stored.speechRate]));
  const took = Object.entries(r.results).filter(([, v]) => v.kind === 'restore' && v.results?.[0]?.added?.includes('voiceURI'));
  for (const [, v] of took) if (!['voiceURI', 'speechRate'].every((f) => v.results[0].added.includes(f))) bad.push('a restorer took voiceURI without speechRate');
  const expectTook = r.killAt === 'renamed' ? 0 : 1;
  if (took.length !== expectTook) bad.push(`expected ${expectTook} restorer(s) to take the voice, got ${took.length}`);
  if (r.killAt === 'renamed' && winner !== X) bad.push('victim renamed its write (backup X) but X is not the stored winner');
  return bad;
}

test(`12 parallel actors (6 restore, 6 manual), one restorer SIGKILLed at a chosen point, ${REPEATS} repeats per kill point: no lost update, no silent conflict`, { timeout: 480000 }, async () => {
  const seen = { 'in-lock': 0, 'tmp-written': 0, renamed: 0 };
  for (let repeat = 1; repeat <= REPEATS * PHASES.length; repeat++) {
    const killAt = PHASES[(repeat - 1) % PHASES.length];
    const r = await run({ repeat, killAt }); const v = violations(r);
    evidence.kill.push({ repeat, killAt, victimExit: r.victimExit, queuedAtKill: r.queuedAtKill, reads: r.reads, final: r.finalText, violations: v, results: r.results });
    assert.deepEqual(v, [], `repeat ${repeat} (${killAt}): ` + r.stderr);
    assert.equal(r.holderAtKill, r.victimPid, 'the victim held the lock at death');
    assert.equal(r.queuedAtKill, OTHERS_REQUESTS, 'every other request was waiting when the holder died');
    seen[killAt]++;
  }
  for (const p of PHASES) assert.equal(seen[p], REPEATS);
  evidence.killPointCounts = seen;
});

test(`11 simultaneous actors (5 restore, 6 manual), no victim, ${REPEATS} repeats: every different-field change survives, one winner per same field`, { timeout: 240000 }, async () => {
  const rows = [];
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat }); const v = violations(r); rows.push({ repeat, final: r.finalText, violations: v });
    assert.deepEqual(v, [], `repeat ${repeat}: ` + r.stderr);
  }
  evidence.simultaneous = { repeats: REPEATS, rows };
});

function refusedEverywhere(r, code) {
  const bad = [];
  if (r.finalText !== r.seedText) bad.push('storage changed: ' + r.finalText);
  for (const [role, res] of Object.entries(r.results)) {
    if (res.missing || res.exit?.code !== 0) { bad.push(role + ' did not complete'); continue; }
    for (const o of res.results) if (o.ok || o.code !== code) bad.push(`${role} was not refused with ${code}: ${JSON.stringify(o)}`);
    if (JSON.stringify(res.live) !== JSON.stringify(res.before)) bad.push(`${role}'s own copy changed although nothing was written: ${JSON.stringify(res.live)}`);
  }
  return bad;
}

test('control: with no Web Locks every restore and manual save is refused, nothing is written and no live state changes (no unlocked fallback)', { timeout: 240000 }, async () => {
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, locks: 'none' });
    assert.deepEqual(refusedEverywhere(r, 'unsupported'), [], `repeat ${repeat}`);
    assert.equal(r.tornReads, 0);
  }
  evidence.controls.noLocks = { repeats: REPEATS, refused: REPEATS };
});

test('control: a lock held by a dead holder that is never freed: every waiter times out BUSY, nothing is written, no live state changes (no timeout fallback)', { timeout: 240000 }, async () => {
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, killAt: 'in-lock', leak: true, waitMs: 300, timeoutMs: 15000 });
    assert.equal(r.deadlock, false, 'the waiters gave up instead of waiting for ever');
    assert.deepEqual(refusedEverywhere(r, 'busy'), [], `repeat ${repeat}`);
  }
  evidence.controls.heldLockTimeout = { repeats: REPEATS, refused: REPEATS };
});

test('control: a leaked lock with a long wait leaves the others stuck, and the checks say so', { timeout: 240000 }, async () => {
  let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) { const r = await run({ repeat, killAt: 'in-lock', leak: true, timeoutMs: 250 }); if (r.deadlock && violations(r).some((x) => x.startsWith('deadlock:'))) flagged++; }
  evidence.controls.leakedLock = { repeats: REPEATS, flagged };
  assert.equal(flagged, REPEATS);
});

test('control: the old whole-object writer (a stale copy written whole, with no patch) is caught by the checks as lost updates', { timeout: 240000 }, async () => {
  let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) { const r = await run({ repeat, legacyLast: true }); if (violations(r).some((x) => x.startsWith('lost update'))) flagged++; }
  evidence.controls.oldWholeObjectWriter = { repeats: REPEATS, flagged };
  assert.equal(flagged, REPEATS);
});

after(() => { if (EVIDENCE_DIR) { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_DIR, 'prefs-restore-evidence.json'), JSON.stringify(evidence, null, 1) + '\n'); } });
