// One actor process of tests/encounters-crash.test.mjs: a "tab" that runs the app's REAL chat/encounters/ modules (createEncounters -> thread commit -> ledger store, records, patch)
// against two stand-ins, doing one ordinary writer operation, and is at a chosen point stopped dead by its parent with SIGKILL (the parent signals the process group).
//   storage  a directory shared by all actors, one file per key, with the synchronous getItem/setItem/removeItem localStorage contract.
//            'atomic': temp file + fsync + rename (a browser's setItem is whole or absent: PROVIDED by the storage). 'torn' (control): truncate and write in two parts.
//   locks    the Web Locks contract (request(name, {signal}, callback)) spoken to the broker in the parent (tests/helpers/preset-crash-broker.mjs), which frees the lock when the holder's
//            connection closes, as a browser frees a dead tab's locks. 'none' (control): no exclusion.
//   legacy   (control) the b design: a whole-list chatThreads write from this tab's memory, no commit.
// Configuration is one JSON argument; messages to the parent are JSON lines on stdout; the parent writes "go" lines to stdin.
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { createEncounters } from '../../chat/encounters/encounters.mjs';
import { normalizeThread } from '../../chat/threads.mjs';
import { createCoordination } from '../../chat/encounters/coordination.mjs';

const cfg = JSON.parse(process.argv[2]);
const KEYS_LEDGER = 'plc.encounters.v1';
const say = (message) => fs.writeSync(1, JSON.stringify(message) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = (ms) => Atomics.wait(sleeper, 0, 0, ms);
const counts = new Map();
/** Announce a point in the code and, when the parent chose it for this actor (and this is the chosen occurrence), stand still there until the parent's SIGKILL arrives. */
function phase(name) {
  const n = (counts.get(name) || 0) + 1; counts.set(name, n);
  if (cfg.killAt !== name || n !== (cfg.killNth || 1)) return;
  say({ t: 'phase', name, pid: process.pid });
  pause(60000);
  say({ t: 'survived-the-wait', name });
  process.exit(3);
}

const file = (key) => path.join(cfg.dir, encodeURIComponent(key));
const fileStorage = {
  getItem(key) { try { return fs.readFileSync(file(key), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
  removeItem(key) { try { fs.unlinkSync(file(key)); } catch (error) { if (error.code !== 'ENOENT') throw error; } },
  setItem(key, value) {
    if (cfg.storage === 'torn' && key === 'chatThreads') {
      const fd = fs.openSync(file(key), 'w'); const half = Math.floor(value.length / 2);
      fs.writeSync(fd, value.slice(0, half)); phase('torn-half'); fs.writeSync(fd, value.slice(half)); fs.closeSync(fd);
      return;
    }
    const tmp = file(key) + '.tmp-' + process.pid;
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, value); fs.fsyncSync(fd); fs.closeSync(fd);
    phase('tmp:' + key);
    fs.renameSync(tmp, file(key));
    phase('renamed:' + key);
  },
};

function brokerLocks(socketPath) {
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const socket = net.connect(socketPath); let granted = false, buffer = '';
        const abort = () => { if (granted) return; socket.destroy(); const error = new Error('aborted'); error.name = 'AbortError'; reject(error); };
        const signal = options?.signal;
        if (signal) { if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); }
        socket.on('connect', () => socket.write(JSON.stringify({ t: 'req', name, pid: process.pid }) + '\n'));
        socket.on('error', (error) => { if (!granted) reject(error); });
        socket.on('data', async (chunk) => {
          buffer += chunk; if (granted || !buffer.includes('\n')) return; granted = true;
          try { const result = await callback(); socket.end(JSON.stringify({ t: 'rel' }) + '\n'); resolve(result); }
          catch (error) { socket.destroy(); reject(error); }
        });
      });
    },
  };
}
// The durable coordination record (IndexedDB in a browser): a STAND-IN file shared by all actors, compare-and-set by gen, written whole (temp + fsync + rename). The lock serialises every call.
// These actors' file views cannot lag (a file read is never a cache); an interrupted hold is finished from the recorded phase pairs. The lag refusals are exercised in
// tests/encounters-store-safety.test.mjs. cfg.coordination === 'off': the unprotected design (control).
const coordFile = path.join(cfg.dir, 'coord.json');
const readCoord = () => { try { return JSON.parse(fs.readFileSync(coordFile, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const fileBackend = { kind: 'file stand-in', get: async () => readCoord(), cas: async (expect, record) => {
  const cur = readCoord(); if ((cur ? cur.gen : null) !== expect) return false;
  const tmp = coordFile + '.t' + process.pid; const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(tmp, coordFile); return true;
} };
const coordination = cfg.coordination === 'off' ? undefined : createCoordination({ backend: fileBackend, keys: [KEYS_LEDGER, 'chatThreads'], read: (k) => fileStorage.getItem(k), freshMs: 150,
  hasIntent: () => { try { return Boolean(JSON.parse(fileStorage.getItem(KEYS_LEDGER) || 'null')?.intent); } catch { return false; } } });
const noLocks = { request: (name, options, callback) => Promise.resolve().then(callback) };

// ---- the tab: load the stored chats like loadThreads, then do one ordinary operation ----
const load = () => { const raw = fileStorage.getItem('chatThreads'); return (raw ? JSON.parse(raw) : []).map((t) => normalizeThread(t)).filter(Boolean); };
const list = load();
const enc = createEncounters({ storage: fileStorage, coordination, unsafeNoCoordination: cfg.coordination === 'off', locks: cfg.locks === 'none' ? noLocks : brokerLocks(cfg.socket), threads: () => list, normalizeThread, newId: () => `rx-${cfg.role}-${process.pid}`, showToast: () => {},
  now: () => Date.now(), onPhase: (p) => { phase(p); if (p === 'in-lock' && cfg.windowMs) pause(cfg.windowMs); } });
enc.init();
const t1 = () => list.find((t) => t.id === 't1');
const op = cfg.op;

async function operate() {
  if (op.kind === 'send') { t1().messages.push({ id: op.id, role: 'user', content: op.text, at: Date.now() }); }
  else if (op.kind === 'edit') { t1().messages.find((m) => m.id === 'u1').content = op.text; }
  else if (op.kind === 'regen') { const m = t1().messages.find((x) => x.id === 'a1'); m.versions = [{ content: m.content, at: 1 }, { content: op.text, at: 2 }]; m.versionIndex = 1; m.content = op.text; }
  else if (op.kind === 'delete') { list.splice(list.findIndex((t) => t.id === 't2'), 1); }
  else if (op.kind === 'import') { enc.markImported(['imp1']); list.push({ id: 'imp1', title: 'Imported', systemPrompt: '', messages: [{ id: 'imp-m1', role: 'user', content: 'imported words', at: 1 }], createdAt: 1, updatedAt: 1 }); }
  else if (op.kind === 'receive') {
    const p = await enc.facade.registerParticipant({ thread: 't1', id: op.participant, name: 'Remote', kind: 'human' });
    if (!p.ok) return { ok: false, code: p.code };
    const r = await enc.facade.receive({ thread: 't1', speaker: op.participant, expression: 'external', modality: 'text', text: op.text, occurrence: { source: 'surface:test', id: op.id }, transcript: true });
    return { ok: r.ok, code: r.code ?? null, status: 'received' };
  } else if (op.kind === 'holder') { const r = await enc.facade.mapHolder({ participant: op.participant, holder: op.holder }); return { ok: r.ok, code: r.code ?? null, status: 'mapped' }; }
  else if (op.kind === 'clear') { const r = await enc.clearAll(); return { ok: r.ok, code: r.code ?? null, status: 'cleared' }; }
  if (cfg.legacy) {            // control: b's whole-list write from this tab's memory
    fileStorage.setItem('chatThreads', JSON.stringify(list.filter((t) => !t.temporary)));
    return { ok: true, status: 'legacy-written' };
  }
  const r = await enc.saveThreads();
  return { ok: r.ok, code: r.code ?? null, status: 'saved', conflicts: (r.conflicts || []).length, recording: r.recording, recovered: r.recovered || null };
}

const lines = readline.createInterface({ input: process.stdin });
say({ t: 'ready', pid: process.pid });
lines.once('line', async () => {
  let outcome; try { outcome = await operate(); } catch (error) { outcome = { ok: false, code: 'exception', message: String(error?.message || error) }; }
  say({ t: 'result', role: cfg.role, ...outcome });
  process.exit(0);
});
