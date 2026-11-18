// One actor process of tests/presentation-crash.test.mjs. It runs the app's real chat/presentation/presentation-store.mjs against the same two stand-ins as tests/helpers/preset-crash-actor.mjs
// (a file with whole-or-absent writes as localStorage's contract; a lock broker in the parent that frees the lock when the holder's connection closes) and is, at a chosen point, stopped
// dead by its parent with SIGKILL (the parent signals the process group; this file never kills itself). Configuration is one JSON argument; messages are JSON lines on stdout; "go" arrives on stdin.
import net from 'node:net';
import fs from 'node:fs';
import readline from 'node:readline';
import { createPresentationStore, keepChange, choiceChange } from '../../chat/presentation/presentation-store.mjs';

const cfg = JSON.parse(process.argv[2]);
const KEY = 'plc.presentations.v1';
const record = JSON.parse(fs.readFileSync(cfg.recordFile, 'utf8'));
const say = message => fs.writeSync(1, JSON.stringify(message) + '\n');
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const pause = ms => Atomics.wait(sleeper, 0, 0, ms);
function phase(name) { if (cfg.killAt !== name) return; say({ t: 'phase', name, pid: process.pid }); pause(60000); say({ t: 'survived-the-wait', name }); process.exit(3); }

const fileStorage = {
  getItem(key) { if (key !== KEY) throw new Error('unexpected key'); try { return fs.readFileSync(cfg.stateFile, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
  setItem(key, value) {
    if (key !== KEY) throw new Error('unexpected key');
    if (cfg.storage === 'torn') { const fd = fs.openSync(cfg.stateFile, 'w'); const half = Math.floor(value.length / 2); fs.writeSync(fd, value.slice(0, half)); phase('torn-half'); fs.writeSync(fd, value.slice(half)); fs.closeSync(fd); return; }
    const tmp = cfg.stateFile + '.tmp-' + process.pid;
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, value); fs.fsyncSync(fd); fs.closeSync(fd);
    phase('tmp-written'); fs.renameSync(tmp, cfg.stateFile); phase('renamed');
  },
};
function brokerLocks(socketPath) {
  return { request(name, options, callback) {
    return new Promise((resolve, reject) => {
      const socket = net.connect(socketPath); let granted = false, buffer = '';
      const abort = () => { if (granted) return; socket.destroy(); const error = new Error('aborted'); error.name = 'AbortError'; reject(error); };
      const signal = options?.signal; if (signal) { if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); }
      socket.on('connect', () => socket.write(JSON.stringify({ t: 'req', name, pid: process.pid }) + '\n'));
      socket.on('error', error => { if (!granted) reject(error); });
      socket.on('data', async chunk => { buffer += chunk; if (granted || !buffer.includes('\n')) return; granted = true;
        try { const result = await callback(); socket.end(JSON.stringify({ t: 'rel' }) + '\n'); resolve(result); } catch (error) { socket.destroy(); reject(error); } });
    });
  } };
}
const noLocks = { request: (name, options, callback) => Promise.resolve().then(callback) };
const store = createPresentationStore({ storage: fileStorage, key: KEY, locks: cfg.locks === 'none' ? noLocks : brokerLocks(cfg.socket), waitMs: cfg.waitMs ?? 10000 });

function change() {
  const inner = cfg.op.kind === 'keep' ? keepChange(cfg.op.id, record) : choiceChange(cfg.op.id, cfg.op.choice);
  return map => { phase('in-lock'); if (cfg.windowMs) pause(cfg.windowMs); return inner(map); };
}
const lines = readline.createInterface({ input: process.stdin });
say({ t: 'ready', pid: process.pid });
lines.once('line', async () => {
  const outcome = await store.mutate(change());
  say({ t: 'result', role: cfg.role, ok: outcome.ok, code: outcome.code ?? null, status: outcome.result?.status ?? null });
  process.exit(0);
});
