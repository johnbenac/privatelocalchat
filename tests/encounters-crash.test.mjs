// Real separate processes writing the app's actual conversation save path at once, one of them SIGKILLed at a chosen point, inspected in BOTH stores (chatThreads and the encounter ledger).
//
// WHAT IS REAL: chat/encounters/* (createEncounters -> thread commit -> ledger store, records, patch) and chat/threads.mjs run unchanged in 9 separate Node processes released together by a
// barrier; the ordinary writer operations are the app's own (send, edit a prompt, regenerate, delete a chat, import a chat, an explicit receive through the facade, a holder mapping) or, in
// the Clear scenario, Clear history; the victim is stopped at a chosen point by SIGKILL sent by this test to its process group (the test checks that a signal, not an exit, ended it).
// WHAT IS SIMULATED (and what it models): no browser starts. localStorage is a directory of files with synchronous getItem/setItem/removeItem and an atomic temp+rename write (a browser's
// setItem is whole or absent: PROVIDED by the storage, not by our code; the 'torn' control shows what a non-atomic storage would do). Web Locks is a broker in this process that
// grants one holder at a time and frees the lock when the holder's connection closes, as a browser frees a dead tab's locks. The real-tab suite (tests/e2e/encounters-concurrency.e2e.mjs)
// covers real Web Locks and tab teardown; neither covers power loss, which is not claimed.
//
// Invariants (stated before the run), 9 actors per repeat + an auditor that commits once after the crash, 20 repeats per kill point:
//   no deadlock           the lock the victim held is freed by its death; the others finish inside the timeout and every one reports ok (no silent refusal, no unexplained conflict)
//   no corruption / torn  chatThreads and the ledger parse at every moment a lock-free reader looks, and at the end; no intent is left after the auditor
//   no lost update        every acknowledged send/edit/regenerate/import/receive is in the stored transcript exactly once and (except legacy/imported) has exactly one matching ledger event
//   no resurrection       a deleted chat has no transcript, encounter or events; after Clear nothing of the cleared history is stored, in either store; a stale tab is refused with an explicit code
//   no duplicates         message ids are unique in a chat; one event per acknowledged message
//   crash atomicity       victim killed before its chatThreads rename: message and event both absent; at or after it: both present exactly once (after the auditor's recovery)
//   transcript = ledger   every event that says inTranscript has its message in a stored chat; every non-legacy stored message is recorded
// Controls (the same checks must FAIL when what they guard is missing): a whole-list chatThreads writer (draft b) loses acknowledged messages; no locks loses/duplicates; a lock a dead holder
// never frees leaves the others stuck; a storage that writes in two parts shows a torn file after a kill.
//   PLC_CRASH_REPEATS (default 20), PLC_CRASH_SCRATCH_ROOT (default: the system temporary folder), PLC_CRASH_EVIDENCE_DIR (when set: encounters-crash-evidence.json and per-repeat logs)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startBroker } from './helpers/preset-crash-broker.mjs';
import { emptyLedger, ensureEncounter, openExternalEncounter, addParticipant, legacyEventId } from '../chat/encounters/records.mjs';

const ACTOR = fileURLToPath(new URL('./helpers/encounters-crash-actor.mjs', import.meta.url));
const REPEATS = Number(process.env.PLC_CRASH_REPEATS || 20);
const SCRATCH_ROOT = process.env.PLC_CRASH_SCRATCH_ROOT || os.tmpdir();
const EVIDENCE_DIR = process.env.PLC_CRASH_EVIDENCE_DIR || '';
assert.ok(Number.isInteger(REPEATS) && REPEATS > 0, 'PLC_CRASH_REPEATS must be a positive integer');
const KEYS = { chat: 'chatThreads', ledger: 'plc.encounters.v1' };
// kill points: [name, nth occurrence, does the victim's message survive?]
const POINTS = [['in-lock', 1, false], ['planned', 1, false], ['intent-written', 1, false], ['before-threads', 1, false], ['tmp:chatThreads', 1, false], ['renamed:chatThreads', 1, true], ['threads-written', 1, true], ['tmp:plc.encounters.v1', 2, true], ['finalized', 1, true]];
// kill points inside Clear history: [name, nth, does the Clear take effect (finished by the next commit)?]
const CLEAR_POINTS = [['in-lock', 1, false], ['tmp:plc.encounters.v1', 1, false], ['renamed:plc.encounters.v1', 1, true], ['clear-intent', 1, true], ['clear-removed', 1, true]];
const evidence = { node: process.version, platform: process.platform, repeats: REPEATS, actors: 9, runs: { kill: [], clear: [], controls: {} } };
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
const until = async (cond, ms, what) => { ms *= 4; const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(2); } };

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
const put = (dir, key, value) => fs.writeFileSync(path.join(dir, encodeURIComponent(key)), typeof value === 'string' ? value : JSON.stringify(value));
const coordOf = (dir) => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'coord.json'), 'utf8')); } catch { return null; } };
const get = (dir, key) => { try { return fs.readFileSync(path.join(dir, encodeURIComponent(key)), 'utf8'); } catch { return null; } };

function seed(dir) {
  const msg = (id, role, content, extra = {}) => ({ id, role, content, at: 1, ...extra });
  put(dir, KEYS.chat, [
    { id: 't1', title: 'one', systemPrompt: '', messages: [msg('u1', 'user', 'seed one'), msg('a1', 'assistant', 'seed answer', { model: 'M' })], createdAt: 1, updatedAt: 1 },
    { id: 't2', title: 'two', systemPrompt: '', messages: [msg('n1', 'user', 'seed two')], createdAt: 1, updatedAt: 1 },
  ]);
  const ledger = emptyLedger(); openExternalEncounter(ledger, 'seed', 1);
  addParticipant(ledger, 'enc:ext:seed', { id: 'p:seed', name: 'Seeded', kind: 'human' }, 1);
  put(dir, KEYS.ledger, ledger);
}

/** One repeat: seed a scratch copy, start the actors, release them, kill the victim at its point, let the rest finish, run the auditor, return everything observed. */
async function run({ repeat, kill = null, staged = false, scenario = 'writers', storage = 'atomic', locks = 'broker', legacy = false, leak = false, windowMs = 0, timeoutMs = 20000, audit = true }) {
  const dir = fs.mkdtempSync(path.join(SCRATCH_ROOT, 'plc-enc-crash-'));
  const socket = path.join(dir, 'b.sock');
  seed(dir);
  const broker = await startBroker(socket, { leakOnDisconnect: leak });
  const base = { dir, socket, storage, locks, legacy, windowMs };
  const roles = [];
  const acks = (op) => op;
  if (scenario === 'writers') {
    if (kill) roles.push({ role: 'victim', killAt: kill[0], killNth: kill[1], op: { kind: 'send', id: 'victim-msg', text: 'victim words ' + 'v'.repeat(300) } });
    roles.push({ role: 'send1', op: { kind: 'send', id: 'send1-msg', text: 'first sender ' + 'a'.repeat(5000) } }, { role: 'send2', op: { kind: 'send', id: 'send2-msg', text: 'second sender' } },
      { role: 'edit', op: { kind: 'edit', text: 'edited by edit' } }, { role: 'regen', op: { kind: 'regen', text: 'regenerated answer' } }, { role: 'del', op: { kind: 'delete' } },
      { role: 'imp', op: { kind: 'import' } }, { role: 'recv', op: { kind: 'receive', id: 'recv-1', participant: 'p:rx-' + repeat, text: 'received text' } }, { role: 'holder', op: { kind: 'holder', participant: 'p:seed', holder: 'holder-' + repeat } });
  } else {
    // Clear history against concurrent senders and a delete; the victim (if any) IS the clear
    roles.push({ role: kill ? 'victim' : 'clear', killAt: kill?.[0], killNth: kill?.[1], op: { kind: 'clear' } });
    for (let i = 1; i <= 4; i++) roles.push({ role: 'send' + i, op: { kind: 'send', id: `send${i}-msg`, text: 'sender ' + i } });
    roles.push({ role: 'edit', op: { kind: 'edit', text: 'edited by edit' } }, { role: 'del', op: { kind: 'delete' } });
  }
  const actors = roles.map((r) => startActor({ ...acks(base), ...r }));
  const victim = actors.find((a) => a.role === 'victim') || null, others = actors.filter((a) => a !== victim);
  let reads = 0, torn = 0;
  const reader = setInterval(() => {   // a reader that never takes the lock
    for (const key of [KEYS.chat, KEYS.ledger]) {
      const raw = get(dir, key); if (raw == null) continue; reads++;
      try { JSON.parse(raw); } catch { torn++; }
    }
  }, 1);
  const record = { repeat, scenario, kill: kill ? kill[0] : null, staged, storage, locks, legacy, leak, errors: [] };
  try {
    await until(() => actors.every((a) => a.has('ready')), 10000, 'all actors to start');
    if (victim) {
      if (staged) { victim.go(); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + kill[0]); others.forEach((a) => a.go()); await until(() => broker.queued() >= others.length, 5000, 'the others to queue behind the victim'); }
      else { actors.forEach((a) => a.go()); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + kill[0]); }
      record.victimPhase = victim.messages.find((m) => m.t === 'phase').name;
      record.queuedAtKill = broker.queued(); record.holderAtKill = broker.holderPid(); record.victimPid = victim.pid;
      // The record is read BEFORE the kill, while the victim stands still at its stop point holding the lock and the others are queued behind it, so nothing else can change it. Reading it after the
      // kill raced the survivors: the lock is freed at once, a queued tab recovers the open record (open to stable) and, on a loaded machine, did so before this read (a false failure).
      record.coordAtKill = coordOf(dir);
      process.kill(-victim.pid, 'SIGKILL');
      await Promise.race([victim.exit, wait(5000)]);
      record.victimExit = victim.exited; record.victimGroupGone = victim.exited ? groupGone(victim.pid) : false;
    } else actors.forEach((a) => a.go());
    const finished = await Promise.race([Promise.all(others.map((a) => a.exit)).then(() => true), wait(timeoutMs).then(() => false)]);
    record.deadlock = !finished;
    if (!finished) for (const a of others) if (a.exited === null) process.kill(-a.pid, 'SIGKILL');
    await Promise.all(actors.map((a) => a.exit));
    record.beforeAudit = { chat: get(dir, KEYS.chat), ledger: get(dir, KEYS.ledger) };
    if (audit && !record.deadlock && locks === 'broker') {          // the next tab that commits after the crash: recovers before it does anything else
      const auditor = startActor({ ...base, role: 'auditor', op: { kind: 'noop' } });
      await until(() => auditor.has('ready'), 10000, 'the auditor'); auditor.go();
      await Promise.race([auditor.exit, wait(timeoutMs)]);
      if (auditor.exited === null) process.kill(-auditor.pid, 'SIGKILL');
      await auditor.exit; record.auditor = auditor.messages.find((m) => m.t === 'result') || { missing: true };
    }
  } finally {
    clearInterval(reader);
    await broker.close();
    for (const a of actors) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.all(actors.map((a) => a.exit));
  }
  record.reads = reads; record.tornReads = torn;
  record.chat = get(dir, KEYS.chat); record.ledger = get(dir, KEYS.ledger); record.coord = coordOf(dir);
  record.leftoverTempFiles = fs.readdirSync(dir).filter((f) => f.includes('.tmp-')).length;
  record.results = Object.fromEntries(others.map((a) => [a.role, { exit: a.exited, ...(a.messages.find((m) => m.t === 'result') || { missing: true }) }]));
  record.brokerEvents = broker.events.slice();
  record.stderr = actors.map((a) => a.stderr).join('').slice(0, 2000);
  record.victimSurvivedWait = victim ? victim.has('survived-the-wait') : false;
  if (EVIDENCE_DIR) { const logs = path.join(EVIDENCE_DIR, 'logs'); fs.mkdirSync(logs, { recursive: true }); fs.writeFileSync(path.join(logs, `${scenario}-${kill ? kill[0].replace(/[:]/g, '_') : legacy ? 'legacy' : locks === 'none' ? 'nolock' : leak ? 'leak' : storage === 'torn' ? 'torn' : 'plain'}-${String(repeat).padStart(2, '0')}.json`), JSON.stringify({ ...record, actors: actors.map((a) => ({ role: a.role, pid: a.pid, exited: a.exited, messages: a.messages })) }, null, 1)); }
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

const parse = (raw) => { try { return JSON.parse(raw); } catch { return undefined; } };
/** The invariants. Returns the list of violated ones (empty = all held). */
function violations(r, { expectVictim = true } = {}) {
  const bad = [];
  if (r.tornReads) bad.push(`a lock-free reader saw unparseable state ${r.tornReads} time(s)`);
  if (r.deadlock) bad.push('deadlock: the others did not finish');
  const chat = r.chat == null ? null : parse(r.chat), ledger = r.ledger == null ? null : parse(r.ledger);
  if (r.chat != null && !Array.isArray(chat)) bad.push('chatThreads does not parse as a list');
  if (r.ledger != null && !ledger) bad.push('the ledger does not parse');
  for (const [role, res] of Object.entries(r.results)) if (res.missing || res.exit?.code !== 0) bad.push(`${role} did not finish (${res.missing ? 'no result' : 'exit ' + res.exit?.code})`);
  if (expectVictim) {
    if (r.victimExit?.signal !== 'SIGKILL' || r.victimExit?.code !== null) bad.push('victim did not end by SIGKILL');
    if (!r.victimGroupGone) bad.push('victim process group still present');
    if (r.victimSurvivedWait) bad.push('victim ran past its stop point');
    if (!r.brokerEvents.some((e) => e.kind === 'free' && e.pid === r.victimPid && e.cause === 'disconnect')) bad.push('the lock was not freed by the victim’s death');
  }
  // the durable coordination record (a file stand-in for IndexedDB): a hold killed after it planned leaves it OPEN; the next commit finishes it; at the end it is stable and names the stored state
  if (r.kill && expectVictim && r.scenario === 'writers') {
    const opened = !['in-lock'].includes(r.kill);
    if (opened && r.coordAtKill?.state !== 'open') bad.push(`killed at ${r.kill}: the coordination record should be open, it is ${r.coordAtKill?.state}`);
    if (!opened && r.coordAtKill?.state === 'open') bad.push('killed before it planned: the record must not be open');
  }
  if (r.auditor && r.coord && r.coord.state !== 'stable') bad.push('the coordination record is still open after the next commit');
  if (r.auditor && (r.auditor.missing || !r.auditor.ok)) bad.push('the auditor commit after the crash did not succeed: ' + (r.auditor.code || 'no result'));
  if (!Array.isArray(chat) && r.scenario === 'writers') { bad.push('chat history missing'); return bad; }
  const threads = Array.isArray(chat) ? chat : [];
  if (ledger && ledger.intent) bad.push('an intent is still in the ledger after the next commit (recovery did not run)');
  const t1 = threads.find((t) => t.id === 't1'), t2 = threads.find((t) => t.id === 't2'), imp = threads.find((t) => t.id === 'imp1');
  const events = ledger ? Object.values(ledger.events) : [];
  const ofMsg = (mid) => events.filter((e) => e.message === mid);
  for (const t of threads) { const ids = t.messages.map((m) => m.id); if (new Set(ids).size !== ids.length) bad.push('duplicate message ids in ' + t.id + ': ' + ids.join(',')); }
  const allMsgIds = new Set(threads.flatMap((t) => t.messages.map((m) => m.id)));
  for (const e of events) if (e.inTranscript && e.message && !allMsgIds.has(e.message)) bad.push(`event ${e.id} says in transcript but message ${e.message} is not stored (transcript/ledger disagree)`);
  for (const e of events) if (e.thread && !threads.some((t) => t.id === e.thread)) bad.push(`an event of the absent chat ${e.thread} survived (resurrection/leak)`);

  if (r.scenario === 'clear') {
    const cleared = ledger && ledger.epoch >= 1;
    const senders = ['send1', 'send2', 'send3', 'send4'];
    const clearRole = r.results.clear ? 'clear' : null;
    if (clearRole && !r.results.clear.ok) bad.push('the Clear did not report success: ' + r.results.clear.code);
    const effective = r.kill ? CLEAR_POINTS.find(([n]) => n === r.kill)[2] : true;
    if (effective && !cleared) bad.push('the Clear (or the interrupted Clear, finished by the next commit) did not take effect: the epoch did not move');
    if (!effective && cleared) bad.push('a Clear killed before it wrote anything took effect anyway');
    for (const [role, res] of Object.entries(r.results)) if (role !== 'clear' && res && !res.ok && res.code !== 'stale') bad.push(`${role} was refused with an unexplained code: ${res.code}`);
    for (const s of senders) {
      const res = r.results[s], present = Boolean(t1?.messages.some((m) => m.id === `${s}-msg`));
      if (res?.ok && !present && !cleared) bad.push(`${s} was told it saved but its message is not stored and nothing was cleared (silent loss)`);
      if (!res?.ok && res && res.code !== 'stale' && res.code !== 'no-such-conversation') bad.push(`${s} was refused with an unexplained code: ${res.code}`);
      if (present && cleared && !ofMsg(`${s}-msg`).length) bad.push(`${s}-msg survived Clear without a record`);
    }
    if (cleared) {
      if (threads.length) bad.push('chats exist after Clear: ' + threads.map((t) => t.id).join(','));   // nothing resurrects, even from a slow stale tab
      if (events.length) bad.push('records exist after Clear: ' + events.length);
    }
    return bad;
  }

  // ---- writers scenario ----
  if (!t1) { bad.push('chat t1 missing'); return bad; }
  const allowedT1 = new Set(['u1', 'a1', 'send1-msg', 'send2-msg', 'victim-msg']);
  for (const m of t1.messages) if (!allowedT1.has(m.id) && !m.id.startsWith('rx-')) bad.push('unexpected message in t1: ' + m.id);
  for (const id of ['u1', 'a1']) if (!t1.messages.some((m) => m.id === id)) bad.push('seeded message lost: ' + id);
  const ok = (role) => r.results[role]?.ok === true;
  for (const role of Object.keys(r.results)) if (!ok(role)) bad.push(`${role} was not acknowledged ok (${r.results[role].code || 'missing'}): refused or silently failed`);
  for (const [role, id, text] of [['send1', 'send1-msg', 'first sender ' + 'a'.repeat(5000)], ['send2', 'send2-msg', 'second sender']]) {
    if (!ok(role)) continue;
    const have = t1.messages.filter((m) => m.id === id);
    if (have.length !== 1) bad.push(`acknowledged ${role} message is stored ${have.length} times (lost update or duplicate)`);
    const evs = ofMsg(id);
    if (evs.length !== 1) bad.push(`acknowledged ${role} message has ${evs.length} events`);
    else if (evs[0].state !== 'final' || evs[0].content?.text !== text || evs[0].standing !== 'recorded') bad.push(`${role} event is not final/complete/recorded`);
  }
  if (ok('edit')) {
    if (t1.messages.find((m) => m.id === 'u1')?.content !== 'edited by edit') bad.push('acknowledged edit is not stored');
    const l = ledger?.events?.[legacyEventId('t1', 'u1')], fix = ofMsg('u1').find((e) => e.standing === 'correction');
    if (!l || l.content?.text !== 'seed one' || l.standing !== 'legacy' || l.observed !== false) bad.push('the edited prompt did not keep its legacy original under the stable id');
    if (!fix || fix.corrects !== legacyEventId('t1', 'u1') || fix.content?.text !== 'edited by edit') bad.push('the edit correction event is missing or wrong');
  }
  if (ok('regen')) {
    const a1 = t1.messages.find((m) => m.id === 'a1');
    if (!a1?.versions || a1.versions.length !== 2 || a1.content !== 'regenerated answer') bad.push('acknowledged regenerate is not stored');
    const evs = ofMsg('a1'); if (evs.length !== 1 || evs[0].standing !== 'regenerated' || evs[0].content?.text !== 'regenerated answer') bad.push('regenerate event wrong: ' + evs.length);
  }
  if (ok('del')) {
    if (t2) bad.push('acknowledged delete: the chat is still stored (or came back)');
    if (ledger && (ledger.encounters['enc:t2'] || events.some((e) => e.thread === 't2'))) bad.push('acknowledged delete: records of the chat remain');
  } else if (!t2) bad.push('delete not acknowledged but chat t2 is gone');
  if (ok('imp')) {
    if (!imp?.messages.some((m) => m.id === 'imp-m1')) bad.push('acknowledged import is not stored');
    if (ofMsg('imp-m1').length) bad.push('an imported message was given a record of its own (it must stay legacy)');
    if (ledger && ledger.encounters['enc:imp1']?.origin !== 'imported') bad.push('the import is not marked imported');
  }
  if (ok('recv')) {
    const m = t1.messages.filter((x) => x.id.startsWith('rx-recv'));
    if (m.length !== 1) bad.push('acknowledged receive is stored ' + m.length + ' times');
    const evs = events.filter((e) => e.occ.source === 'surface:test' && e.occ.id === 'recv-1');
    if (evs.length !== 1 || evs[0].expression !== 'external' || evs[0].speaker !== 'p:rx-' + r.repeat || evs[0].content?.text !== 'received text') bad.push('receive event missing or wrong: ' + evs.length);
  }
  if (ok('holder') && !(ledger?.holders && Object.entries(ledger.holders).some(([k, v]) => k.endsWith('holder-' + r.repeat) && v === 'p:seed'))) bad.push('acknowledged holder mapping is not stored');
  if (r.kill && expectVictim) {
    const survives = POINTS.find(([n]) => n === r.kill)[2];
    const have = t1.messages.filter((m) => m.id === 'victim-msg').length, evs = ofMsg('victim-msg').length;
    if (survives && (have !== 1 || evs !== 1)) bad.push(`victim killed at ${r.kill}: message/event should be present exactly once, found ${have}/${evs}`);
    if (!survives && (have !== 0 || evs !== 0)) bad.push(`victim killed at ${r.kill}: message/event should both be absent, found ${have}/${evs}`);
  }
  // transcript = ledger: every stored non-seed message of t1 that is not an import has an event
  for (const m of t1.messages) if (!['u1', 'a1'].includes(m.id) && !ofMsg(m.id).length) bad.push(`stored message ${m.id} has no record (transcript/ledger disagree)`);
  return bad;
}

const summary = (r) => ({ repeat: r.repeat, scenario: r.scenario, kill: r.kill, mode: r.staged ? 'staged' : 'simultaneous', victimPhase: r.victimPhase ?? null, victimExit: r.victimExit ?? null, victimGroupGone: r.victimGroupGone ?? null, queuedAtKill: r.queuedAtKill ?? null,
  lockFreedBy: (r.brokerEvents.find((e) => e.kind === 'free' && e.pid === r.victimPid) || {}).cause ?? null, reads: r.reads, tornReads: r.tornReads, leftoverTempFiles: r.leftoverTempFiles, recoveredBy: r.auditor?.recovered ?? null,
  results: Object.fromEntries(Object.entries(r.results).map(([k, v]) => [k, v.ok ? (v.status || 'ok') : (v.code || 'failed')])), violations: r.__v });

test(`9 actors on the real save path (send, edit, regenerate, delete, import, receive, holder), one SIGKILLed at each of ${POINTS.length} points, ${REPEATS} repeats per point`, { timeout: 900000 }, async () => {
  const seen = Object.fromEntries(POINTS.map(([n]) => [n, 0]));
  for (let repeat = 1; repeat <= REPEATS * POINTS.length; repeat++) {
    const kill = POINTS[(repeat - 1) % POINTS.length], staged = Math.floor((repeat - 1) / POINTS.length) % 2 === 0;
    const r = await run({ repeat, kill, staged }); r.__v = violations(r); evidence.runs.kill.push(summary(r));
    assert.deepEqual(r.__v, [], `repeat ${repeat} (${kill[0]}, ${staged ? 'staged' : 'simultaneous'}): ` + r.stderr);
    assert.equal(r.victimPhase, kill[0]);
    assert.equal(r.holderAtKill, r.victimPid, 'victim held the lock at death');
    if (staged) assert.equal(r.queuedAtKill, 8, 'staged: all eight others were waiting when the holder died');
    seen[kill[0]]++;
  }
  for (const [n] of POINTS) assert.equal(seen[n], REPEATS, 'every kill point exercised: ' + n);
  evidence.killPointCounts = seen;
});

test(`Clear history against 4 senders, an edit and a delete (7 actors), killed at ${CLEAR_POINTS.length} points inside Clear and uninterrupted, ${REPEATS} repeats each`, { timeout: 900000 }, async () => {
  const modes = [null, ...CLEAR_POINTS];
  for (let repeat = 1; repeat <= REPEATS * modes.length; repeat++) {
    const kill = modes[(repeat - 1) % modes.length], staged = kill ? Math.floor((repeat - 1) / modes.length) % 2 === 0 : false;
    const r = await run({ repeat, kill, staged, scenario: 'clear' }); r.__v = violations(r, { expectVictim: Boolean(kill) }); evidence.runs.clear.push(summary(r));
    assert.deepEqual(r.__v, [], `repeat ${repeat} (clear ${kill ? kill[0] : 'uninterrupted'}): ` + r.stderr);
  }
});

test('control: the b design (whole-list chatThreads writers from stale tab memory) loses acknowledged messages and the checks say so', { timeout: 300000 }, async () => {
  const rows = []; let flagged = 0, lost = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, legacy: true, audit: false }); r.__v = violations(r, { expectVictim: false }); rows.push(summary(r)); if (r.__v.length) flagged++;
    if (r.__v.some((v) => /lost update|silent loss|lost:|not stored|is stored 0/.test(v))) lost++;
  }
  evidence.runs.controls.wholeListWriters = { repeats: REPEATS, flagged, lostAcknowledged: lost, rows };
  assert.equal(flagged, REPEATS, 'every repeat of the old design is flagged');
  assert.ok(lost >= Math.ceil(REPEATS * 0.9), 'the old design loses an acknowledged write in ' + lost + '/' + REPEATS);
});

test('control: without locks (and a wide read-to-write window) the commit protocol itself loses updates, and the checks say so', { timeout: 300000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, locks: 'none', windowMs: 5, audit: false }); r.__v = violations(r, { expectVictim: false }); rows.push(summary(r)); if (r.__v.length) flagged++;
  }
  evidence.runs.controls.noLocks = { repeats: REPEATS, flagged, rows };
  assert.ok(flagged >= Math.ceil(REPEATS * 0.9), `the unlocked protocol was caught in ${flagged}/${REPEATS} repeats`);
});

test('control: a lock that a dead holder never frees leaves the others stuck, and the checks say so', { timeout: 300000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, kill: ['in-lock', 1, false], staged: true, leak: true, timeoutMs: 400, audit: false }); r.__v = violations(r); rows.push(summary(r)); if (r.deadlock && r.__v.some((v) => v.startsWith('deadlock:'))) flagged++;
  }
  evidence.runs.controls.leakedLock = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a leaked lock is flagged');
});

test('control: a storage that writes in two parts shows a torn chatThreads after a kill, and the checks say so', { timeout: 300000 }, async () => {
  const rows = []; let flagged = 0;
  for (let repeat = 1; repeat <= REPEATS; repeat++) {
    const r = await run({ repeat, kill: ['torn-half', 1, false], staged: true, storage: 'torn', audit: false }); r.__v = violations(r); rows.push(summary(r)); if (r.__v.length) flagged++;
  }
  evidence.runs.controls.tornStorage = { repeats: REPEATS, flagged, rows };
  assert.equal(flagged, REPEATS, 'every repeat with a torn write is flagged');
});

after(() => { if (EVIDENCE_DIR) { fs.mkdirSync(EVIDENCE_DIR, { recursive: true }); fs.writeFileSync(path.join(EVIDENCE_DIR, 'encounters-crash-evidence.json'), JSON.stringify(evidence, null, 1) + '\n'); } });
