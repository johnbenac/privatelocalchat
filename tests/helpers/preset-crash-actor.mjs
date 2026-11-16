// One actor process of tests/preset-crash.test.mjs. It runs the app's real chat/assistant/preset-store.mjs against two stand-ins and is,
// at a chosen point, stopped dead by its parent with SIGKILL (the parent signals the process group; this file never kills itself).
//
//   storage  a file shared by all actors with the localStorage contract the store uses (synchronous getItem/setItem on one key).
//            'atomic': write a temp file, fsync, rename over the key's file. This models what a browser's localStorage gives us (a setItem is
//            whole or absent). It is PROVIDED by the storage, not by our code. 'torn' (control only): truncate and write in two parts.
//   locks    the Web Locks contract the store uses (request(name, {signal}, callback)), spoken to a broker in the parent over a unix socket.
//            The broker frees the lock when the holder's connection closes, which is what a browser does when a tab or its process dies.
//            'none' (control only): no exclusion at all.
//
// Configuration is one JSON argument; messages to the parent are JSON lines on stdout; the parent writes "go" lines to stdin.
import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import { createPresetStore, editPresetChange } from '../../chat/assistant/preset-store.mjs';

const cfg = JSON.parse(process.argv[2]);
const KEY = 'plc.presets.v1';
const say = message => fs.writeSync(1, JSON.stringify(message) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = ms => Atomics.wait(sleeper, 0, 0, ms); // blocks this process's only thread: nothing else of the actor runs meanwhile

/** Announce a point in the code and, when the parent chose it for this actor, stand still there until the parent's SIGKILL arrives. */
function phase(name) {
  if (cfg.killAt !== name) return;
  say({ t: 'phase', name, pid: process.pid });
  pause(60000);
  say({ t: 'survived-the-wait', name }); // never printed when the kill works
  process.exit(3);
}

const fileStorage = {
  getItem(key) {
    if (key !== KEY) throw new Error('unexpected key');
    try { return fs.readFileSync(cfg.stateFile, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  },
  setItem(key, value) {
    if (key !== KEY) throw new Error('unexpected key');
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
        socket.on('error', error => { if (!granted) reject(error); });
        socket.on('data', async chunk => {
          buffer += chunk; if (granted || !buffer.includes('\n')) return; granted = true;
          try { const result = await callback(); socket.end(JSON.stringify({ t: 'rel' }) + '\n'); resolve(result); }
          catch (error) { socket.destroy(); reject(error); }
        });
      });
    },
  };
}

const noLocks = { request: (name, options, callback) => Promise.resolve().then(callback) };
const store = createPresetStore({ storage: fileStorage, key: KEY, locks: cfg.locks === 'none' ? noLocks : brokerLocks(cfg.socket), waitMs: cfg.waitMs ?? 10000 });

/** The operation, as the app writes it: a synchronous change to the fresh list. */
function change() {
  const op = cfg.op;
  return list => {
    phase('in-lock');
    if (cfg.windowMs) pause(cfg.windowMs); // control only: widen the read-to-write window so an unlocked store visibly loses updates
    if (op.kind === 'add') { list.push({ id: op.id, name: op.name, prompt: op.prompt }); return { list, result: { status: 'added' } }; }
    return editPresetChange(op.expected, op.prompt)(list);
  };
}

const lines = readline.createInterface({ input: process.stdin });
say({ t: 'ready', pid: process.pid });
lines.once('line', async () => {
  const outcome = await store.mutate(change());
  say({ t: 'result', role: cfg.role, ok: outcome.ok, code: outcome.code ?? null, status: outcome.result?.status ?? null });
  process.exit(0);
});
