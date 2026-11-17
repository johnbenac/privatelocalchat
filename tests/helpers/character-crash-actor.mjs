// One actor process of tests/character-store-crash.test.mjs. It runs the app's real chat/characters/character-store.mjs (and, through it, the real
// producer validators) against two stand-ins and is, at a chosen point, stopped dead by its parent with SIGKILL (the parent signals the process group).
//
//   storage  one file shared by all actors with the localStorage contract the store uses (synchronous getItem/setItem on one key). 'atomic': temp file,
//            fsync, rename: a reader sees all of the old value or all of the new one (PROVIDED by the storage, as a browser's localStorage does, not by our
//            code). 'torn' (control only): truncate and write in two parts.
//   locks    the Web Locks contract the store uses, spoken to a broker in the parent over a unix socket; the broker frees the lock when the holder's
//            connection closes, as a browser frees a dead tab's locks. 'none' (control only): no exclusion. With 'none' the control may also set
//            rendezvous: at the first fresh read inside the (absent) lock the actor says 'parked' with the revision it read and waits, without any timeout of its own, for the
//            parent to create its release file; so which actors hold the same base, and who writes first, is decided by the parent from what it observed, not by a delay.
//
// Everything asynchronous (producer validation, the final byte re-verification) happens BEFORE the "ready" message; "go" starts only the commit, so the
// actors collide at the lock. Configuration is one JSON argument; messages to the parent are JSON lines on stdout; the parent writes "go" to stdin.
import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import { webcrypto } from 'node:crypto';
import { createCharacterStore } from '../../chat/characters/character-store.mjs';

const cfg = JSON.parse(process.argv[2]);
const CHARACTER_STORE_KEY = 'plc.characters.v1'; // the key the following wiring phase will own and classify
const say = (message) => fs.writeSync(1, JSON.stringify(message) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = (ms) => Atomics.wait(sleeper, 0, 0, ms); // blocks this process's only thread
const fixture = (name) => fs.readFileSync(new URL(`../fixtures/characters/examples/${name}.bundle.json`, import.meta.url), 'utf8');

let held = false, readsInLock = 0;
function parkUntilReleased(value) {
  let base = null; try { base = JSON.parse(value).revision; } catch { /* reported as null */ }
  say({ t: 'parked', role: cfg.role, pid: process.pid, base });
  while (!fs.existsSync(cfg.releaseFile)) pause(2); // released by the parent's own observation, never by elapsed time
}
function phase(name) {
  if (cfg.killAt !== name) return;
  say({ t: 'phase', name, pid: process.pid });
  pause(60000);
  say({ t: 'survived-the-wait', name }); // never printed when the kill works
  process.exit(3);
}

const fileStorage = {
  getItem(key) {
    if (key !== CHARACTER_STORE_KEY) throw new Error('unexpected key ' + key);
    let value; try { value = fs.readFileSync(cfg.stateFile, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; value = null; }
    if (held && readsInLock++ === 0) { phase('in-lock'); if (cfg.rendezvous && cfg.locks === 'none') parkUntilReleased(value); } // control only: the actual first fresh read, then wait (the value read stays the value used)
    return value;
  },
  setItem(key, value) {
    if (key !== CHARACTER_STORE_KEY) throw new Error('unexpected key ' + key);
    if (cfg.storage === 'torn') {
      const fd = fs.openSync(cfg.stateFile, 'w'); const half = Math.floor(value.length / 2);
      fs.writeSync(fd, value.slice(0, half)); phase('torn-half'); fs.writeSync(fd, value.slice(half)); fs.closeSync(fd);
      return;
    }
    const tmp = cfg.stateFile + '.tmp-' + process.pid;
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, value); fs.fsyncSync(fd); fs.closeSync(fd);
    phase('tmp-written');
    fs.renameSync(tmp, cfg.stateFile);
    phase('renamed');
  },
  removeItem() { throw new Error('the store never removes its key'); },
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
          held = true; readsInLock = 0;
          try { const result = await callback(); held = false; socket.end(JSON.stringify({ t: 'rel' }) + '\n'); resolve(result); }
          catch (error) { held = false; socket.destroy(); reject(error); }
        });
      });
    },
  };
}
const noLocks = { request: async (name, options, callback) => { held = true; readsInLock = 0; try { return await callback(); } finally { held = false; } } };

const store = createCharacterStore({ storage: fileStorage, key: CHARACTER_STORE_KEY, locks: cfg.locks === 'none' ? noLocks : brokerLocks(cfg.socket), crypto: webcrypto, waitMs: cfg.waitMs ?? 60000 });
const op = cfg.op;
let prepared = null;

async function prepareWork() {
  if (op.kind === 'fresh') { const p = await store.prepare({ text: fixture(op.pkg) }); if (!p.ok) throw new Error('prepare ' + JSON.stringify(p)); prepared = p.preparation; return { admissionId: p.preparation.admissionId, name: p.preparation.name }; }
  if (op.kind === 'double') { const p = await store.prepare({ text: fixture(op.pkg) }); if (!p.ok) throw new Error('prepare ' + JSON.stringify(p)); prepared = p.preparation; return { admissionId: p.preparation.admissionId, name: p.preparation.name }; }
  if (op.kind === 'update') { const p = await store.prepare({ text: fixture(op.pkg), purpose: 'update', target: op.target }); if (!p.ok) throw new Error('prepare ' + JSON.stringify(p)); prepared = p.preparation; return { admissionId: p.preparation.admissionId, name: p.preparation.name }; }
  return {};
}
async function commitWork() {
  if (op.kind === 'remove') return [await store.remove(op.target)];
  if (op.kind === 'double') return Promise.all([store.commit(prepared), store.commit(prepared)]);
  return [await store.commit(prepared)];
}

const lines = readline.createInterface({ input: process.stdin });
let info;
try { info = await prepareWork(); } catch (error) { say({ t: 'result', role: cfg.role, failed: String(error.message).slice(0, 500) }); process.exit(2); }
say({ t: 'ready', pid: process.pid, ...info });
lines.once('line', async () => {
  const outcomes = await commitWork();
  say({ t: 'result', role: cfg.role, ...info, outcomes: outcomes.map((o) => ({ ok: o.ok, code: o.code ?? null, status: o.status ?? null, individualId: o.individualId ?? null, recordVersion: o.recordVersion ?? null })) });
  process.exit(0);
});
