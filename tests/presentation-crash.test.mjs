// Kept character looks under parallel actors and abrupt death (board T706, the shared-state rule). 7 separate Node processes run the app's real chat/presentation/presentation-store.mjs on one
// scratch copy (4 keepers of different presets, 2 people turning different parts of one look off, 1 victim) and the victim is stopped by SIGKILL to its process group at a chosen point:
// holding the lock before writing, with the temp file written but not renamed, or after the rename but before it could acknowledge. 20 repeats per kill point (staged: the others are already
// queued when the holder dies; simultaneous: all released together). Stated invariants:
//   death        the victim ended by SIGKILL (no exit code) and its group is gone; the lock was freed BY THE DEATH (the broker saw a disconnect, not a release)
//   no deadlock  all 6 others finish inside the timeout and every one reports ok
//   whole        the stored map parses at all times (a reader polls throughout); every entry is a valid record; the untouched look is unchanged value for value; nothing is invented
//   no loss      every acknowledged keep is present once; both choices on the shared look are present (each was applied to what was stored then)
//   the victim   its keep is absent before the rename and present exactly once after it
// Controls that MUST fail: no locks (a wide read-to-write window loses updates), a lock a dead holder never frees (the others are stuck), a storage that writes in two parts (a torn file).
// What is simulated: no browser. localStorage is a file with temp-file-and-rename setItem (whole-or-absent is the STORAGE's property, not our code's); Web Locks is a broker that frees the lock when the
// holder's connection closes, which the real-tab suite for presets shows a browser doing. Power-loss durability is not tested. PLC_CRASH_REPEATS adjusts the number of repeats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openAuthored } from '../vendor/authored-profiles/neutral/index.mjs';
import { openPresentationBundle } from '../chat/presentation/open-bundle.mjs';
import { makeRecord, checkRecord } from '../chat/presentation/record.mjs';
import { startBroker } from './helpers/preset-crash-broker.mjs';

const ACTOR = fileURLToPath(new URL('./helpers/presentation-crash-actor.mjs', import.meta.url));
const REPEATS = Number(process.env.PLC_CRASH_REPEATS || 20);
const PHASES = ['in-lock', 'tmp-written', 'renamed'];
assert.ok(Number.isInteger(REPEATS) && REPEATS > 0, 'PLC_CRASH_REPEATS must be a positive integer');
const opened = await openPresentationBundle(fs.readFileSync(new URL('./fixtures/presentation/lantern-keeper.bundle.json', import.meta.url), 'utf8'), { openAuthored });
const RECORD = makeRecord({ character: opened.characters[0], assetBytes: opened.assetBytes }).record;
const SEEDS = { 'seed-edit': JSON.parse(JSON.stringify(RECORD)), 'seed-keep': JSON.parse(JSON.stringify({ ...RECORD, source: { id: 'seed:keep', label: 'Kept as it was' } })) };
const wait = ms => new Promise(resolve => setTimeout(resolve, ms).unref());
const until = async (test, ms, what) => { ms *= 4; const end = Date.now() + ms; while (!test()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await wait(2); } };
const groupGone = pgid => { try { process.kill(-pgid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } };

function startActor(config) {
  const child = spawn(process.execPath, [ACTOR, JSON.stringify(config)], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const actor = { role: config.role, child, pid: child.pid, messages: [], stderr: '', exited: null };
  let buffer = '';
  child.stdout.on('data', chunk => { buffer += chunk; let at; while ((at = buffer.indexOf('\n')) >= 0) { try { actor.messages.push(JSON.parse(buffer.slice(0, at))); } catch { /* not ours */ } buffer = buffer.slice(at + 1); } });
  child.stderr.on('data', chunk => { actor.stderr += chunk; });
  actor.exit = new Promise(resolve => child.once('exit', (code, signal) => { actor.exited = { code, signal }; resolve(actor.exited); }));
  actor.has = type => actor.messages.some(m => m.t === type);
  actor.go = () => child.stdin.write('go\n');
  return actor;
}

async function run({ repeat, killAt, staged, storage = 'atomic', locks = 'broker', leak = false, windowMs = 0, withVictim = true, timeoutMs = 15000 }) {
  const dir = fs.mkdtempSync(path.join(process.env.PLC_CRASH_SCRATCH_ROOT || os.tmpdir(), 'plc-pres-crash-'));
  const stateFile = path.join(dir, 'presentations.json'), socket = path.join(dir, 'b.sock'), recordFile = path.join(dir, 'record.json');
  fs.writeFileSync(stateFile, JSON.stringify(SEEDS)); fs.writeFileSync(recordFile, JSON.stringify(RECORD));
  const broker = await startBroker(socket, { leakOnDisconnect: leak });
  const base = { stateFile, socket, recordFile, storage, locks, waitMs: 60000, windowMs };
  const roles = [];
  if (withVictim) roles.push({ role: 'victim', killAt, op: { kind: 'keep', id: 'victim-' + repeat } });
  for (let i = 1; i <= 4; i++) roles.push({ role: 'keep' + i, op: { kind: 'keep', id: `keep${i}-${repeat}` } });
  roles.push({ role: 'choose1', op: { kind: 'choice', id: 'seed-edit', choice: { off: { portrait: true } } } });
  roles.push({ role: 'choose2', op: { kind: 'choice', id: 'seed-edit', choice: { off: { background: true } } } });
  const actors = roles.map(r => startActor({ ...base, ...r }));
  const victim = withVictim ? actors[0] : null, others = actors.filter(a => a !== victim);
  let reads = 0, torn = 0;
  const reader = setInterval(() => { let raw; try { raw = fs.readFileSync(stateFile, 'utf8'); } catch { return; } reads++; try { const m = JSON.parse(raw); if (!m || typeof m !== 'object' || Array.isArray(m)) torn++; } catch { torn++; } }, 1);
  const record = { repeat, killAt: withVictim ? killAt : null, staged, storage, locks, leak };
  try {
    await until(() => actors.every(a => a.has('ready')), 10000, 'all actors to start');
    if (victim) {
      if (staged) { victim.go(); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + killAt); others.forEach(a => a.go()); await until(() => broker.queued() >= others.length, 5000, 'the others to queue behind the victim'); }
      else { actors.forEach(a => a.go()); await until(() => victim.has('phase'), 5000, 'the victim to reach ' + killAt); }
      record.victimPhase = victim.messages.find(m => m.t === 'phase').name; record.victimPid = victim.pid;
      process.kill(-victim.pid, 'SIGKILL');
      await Promise.race([victim.exit, wait(5000)]);
      record.victimExit = victim.exited; record.victimGroupGone = victim.exited ? groupGone(victim.pid) : false;
    } else actors.forEach(a => a.go());
    const finished = await Promise.race([Promise.all(others.map(a => a.exit)).then(() => true), wait(timeoutMs).then(() => false)]);
    record.deadlock = !finished;
    if (!finished) for (const a of others) if (a.exited === null) process.kill(-a.pid, 'SIGKILL');
    await Promise.all(actors.map(a => a.exit));
    // the broker learns of the victim's death when its event loop reads the closed socket; when the victim was last in the queue nothing needed the lock freed, so wait for that event (a soft wait)
    if (victim && locks === 'broker' && !leak) { const end = Date.now() + 10000; while (Date.now() < end && !broker.events.some(e => e.kind === 'free' && e.pid === victim.pid && e.cause === 'disconnect')) await wait(5); }
  } finally {
    clearInterval(reader); await broker.close();
    for (const a of actors) if (a.exited === null) { try { process.kill(-a.pid, 'SIGKILL'); } catch { /* gone */ } }
    await Promise.all(actors.map(a => a.exit));
  }
  record.tornReads = torn; record.reads = reads;
  record.finalText = fs.readFileSync(stateFile, 'utf8');
  record.results = Object.fromEntries(others.map(a => [a.role, { exit: a.exited, ...(a.messages.find(m => m.t === 'result') || { missing: true }) }]));
  record.brokerEvents = broker.events.slice(); record.stderr = actors.map(a => a.stderr).join('').slice(0, 1500);
  record.victimSurvivedWait = victim ? victim.has('survived-the-wait') : false;
  record.leftoverTempFiles = fs.readdirSync(dir).filter(f => f.includes('.tmp-')).length;
  fs.rmSync(dir, { recursive: true, force: true });
  return record;
}

function violations(r, { expectVictim = true } = {}) {
  const bad = []; let map = null;
  try { map = JSON.parse(r.finalText); } catch { bad.push('final state does not parse'); }
  if (r.tornReads) bad.push(`a reader saw unparseable state ${r.tornReads} time(s)`);
  if (r.deadlock) bad.push('deadlock: the others did not finish');
  for (const [role, res] of Object.entries(r.results)) if (res.missing || res.exit?.code !== 0 || !res.ok || res.status !== 'saved') bad.push(`${role} did not complete saved (${res.missing ? 'no result' : res.code || res.status || 'exit ' + res.exit?.code})`);
  if (expectVictim) {
    if (r.victimExit?.signal !== 'SIGKILL' || r.victimExit?.code !== null) bad.push('victim did not end by SIGKILL');
    if (!r.victimGroupGone) bad.push('victim process group still present');
    if (r.victimSurvivedWait) bad.push('victim ran past its stop point');
    if (!r.brokerEvents.some(e => e.kind === 'free' && e.pid === r.victimPid && e.cause === 'disconnect')) bad.push('the lock was not freed by the victim’s death');
  }
  if (!map || typeof map !== 'object' || Array.isArray(map)) return bad;
  for (const [id, value] of Object.entries(map)) if (!checkRecord(value).ok) bad.push('entry ' + id + ' is not a valid record');
  if (JSON.stringify(map['seed-keep']) !== JSON.stringify(SEEDS['seed-keep'])) bad.push('the untouched look changed');
  const edit = map['seed-edit'];
  if (!edit || edit.off?.portrait !== true || edit.off?.background !== true) bad.push('a choice on the shared look was lost: ' + JSON.stringify(edit?.off));
  const allowed = new Set(Object.keys(SEEDS)); for (let i = 1; i <= 4; i++) { const id = `keep${i}-${r.repeat}`; allowed.add(id); if (!map[id]) bad.push('acknowledged keep lost: ' + id); }
  if (expectVictim) { allowed.add('victim-' + r.repeat); const present = Object.keys(map).filter(k => k === 'victim-' + r.repeat).length; if (r.killAt === 'renamed' && present !== 1) bad.push('victim killed after its rename: its keep should be present once, found ' + present); if (r.killAt !== 'renamed' && present !== 0) bad.push('victim killed before its rename: its keep should be absent, found ' + present); }
  for (const id of Object.keys(map)) if (!allowed.has(id)) bad.push('invented entry: ' + id);
  if (r.leftoverTempFiles && r.killAt !== 'tmp-written') bad.push('leftover temp files: ' + r.leftoverTempFiles);
  return bad;
}

test(`7 parallel actors, one SIGKILLed at a chosen point, ${REPEATS} repeats per kill point: the others proceed, state whole, nothing acknowledged lost`, { timeout: 240000 }, async () => {
  const seen = Object.fromEntries(PHASES.map(p => [p, 0]));
  for (let repeat = 1; repeat <= REPEATS * PHASES.length; repeat++) {
    const killAt = PHASES[(repeat - 1) % PHASES.length], staged = Math.floor((repeat - 1) / PHASES.length) % 2 === 0;
    const r = await run({ repeat, killAt, staged });
    assert.deepEqual(violations(r), [], `repeat ${repeat} (${killAt}, ${staged ? 'staged' : 'simultaneous'}): ` + r.stderr);
    assert.equal(r.victimPhase, killAt); seen[killAt]++;
  }
  for (const p of PHASES) assert.equal(seen[p], REPEATS, 'kill point ' + p + ' ran ' + REPEATS + ' times');
});

test('control: without locks (and a wide read-to-write window) the same checks catch lost updates', { timeout: 120000 }, async () => {
  let flagged = 0; const rows = [];
  for (let repeat = 1; repeat <= 10; repeat++) { const r = await run({ repeat, withVictim: false, locks: 'none', windowMs: 60 }); const v = violations(r, { expectVictim: false }); rows.push(v); if (v.some(x => /lost/.test(x))) flagged++; }
  assert.ok(flagged >= 8, `the checks flagged lost updates in ${flagged} of 10 unlocked runs: ` + JSON.stringify(rows.slice(0, 2)));
});
test('control: a lock that a dead holder never frees leaves the others stuck, and the checks say so', { timeout: 120000 }, async () => {
  let flagged = 0;
  for (let repeat = 1; repeat <= 5; repeat++) { const r = await run({ repeat, killAt: 'in-lock', staged: true, leak: true, timeoutMs: 400 }); if (r.deadlock && violations(r).some(v => v.startsWith('deadlock:'))) flagged++; }
  assert.equal(flagged, 5, 'a lock freed only by an explicit release deadlocks every time the holder dies');
});
test('control: a storage that writes in two parts shows a torn file when the writer is killed, and the checks say so', { timeout: 120000 }, async () => {
  let flagged = 0;
  for (let repeat = 1; repeat <= 5; repeat++) { const r = await run({ repeat, killAt: 'torn-half', staged: true, storage: 'torn' }); if (violations(r).length) flagged++; }
  assert.equal(flagged, 5, 'a torn write is caught every time');
});
