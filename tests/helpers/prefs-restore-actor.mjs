// One actor process of tests/prefs-restore-crash.test.mjs: the app's real chat/assistant/prefs-store.mjs writing plc.prefs.v1 into a file-backed stand-in for localStorage, under a Web Locks
// stand-in served by the broker in the parent (tests/helpers/preset-crash-broker.mjs). Roles (cfg.kind):
//   restore  a backup's preferences put back (store.restore); its own copy of the preferences (`live`) is deliberately EMPTY: the stale copy of a tab opened before the person chose anything
//   manual   the existing manual writer (store.save, what savePrefs() is): `live` starts as the STALE copy every tab read at start (cfg.seedLive), then the person changes fields (cfg.edits),
//            or makes a run of quick changes of one field (cfg.rapid: n saves without waiting between them, as a slider or a double click does)
//   legacy   (control only) the old whole-object writer: writes its whole `live` straight to the key, with no lock and no patch
// At a chosen point the parent stops it with SIGKILL (this file never kills itself). Storage 'atomic' = temp file, fsync, rename (what a browser's localStorage provides; PROVIDED by the
// storage, not by our code); locks 'none' = no Web Locks at all (the store must then refuse and write nothing).
import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import { createPrefsStore } from '../../chat/assistant/prefs-store.mjs';

const cfg = JSON.parse(process.argv[2]);
const KEY = 'plc.prefs.v1';
const say = (message) => fs.writeSync(1, JSON.stringify(message) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = (ms) => Atomics.wait(sleeper, 0, 0, ms);
function phase(name) {
  if (cfg.killAt !== name) return;
  say({ t: 'phase', name, pid: process.pid });
  pause(60000);
  say({ t: 'survived-the-wait', name });
  process.exit(3);
}

const fileStorage = {
  getItem(key) {
    if (key !== KEY) throw new Error('unexpected key');
    try { return fs.readFileSync(cfg.stateFile, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  setItem(key, value) {
    if (key !== KEY) throw new Error('unexpected key');
    phase('in-lock'); // the first write attempt inside the lock
    if (cfg.windowMs) pause(cfg.windowMs);
    const tmp = cfg.stateFile + '.tmp-' + process.pid;
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, value); fs.fsyncSync(fd); fs.closeSync(fd);
    phase('tmp-written');
    fs.renameSync(tmp, cfg.stateFile);
    phase('renamed');
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

const live = cfg.kind === 'restore' ? {} : JSON.parse(JSON.stringify(cfg.seedLive));
const before = JSON.parse(JSON.stringify(live));
const store = createPrefsStore({ storage: fileStorage, key: KEY, live, locks: cfg.locks === 'none' ? null : brokerLocks(cfg.socket), waitMs: cfg.waitMs ?? 10000 });
const lines = readline.createInterface({ input: process.stdin });
say({ t: 'ready', pid: process.pid });
lines.once('line', async () => {
  let results;
  if (cfg.kind === 'restore') results = [await store.restore(cfg.backupPrefs)];
  else if (cfg.kind === 'legacy') { fileStorage.setItem(KEY, JSON.stringify(live)); results = [{ ok: true, legacy: true }]; }
  else if (cfg.rapid) {
    const pendingSaves = [];
    for (let i = 1; i <= cfg.rapid.n; i++) { live[cfg.rapid.field] = i; pendingSaves.push(store.save()); } // no waiting between them
    results = await Promise.all(pendingSaves);
  } else {
    for (const [field, value] of Object.entries(cfg.edits)) live[field] = value;
    results = [await store.save()];
  }
  say({ t: 'result', role: cfg.role, kind: cfg.kind, results, live, before });
  process.exit(0);
});
