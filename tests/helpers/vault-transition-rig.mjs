// Shared pieces of the vault-transition tests (tests/vault-transition*.test.mjs). Synthetic data only.
//
//   buildModules(dir, kind)  copies the app's REAL chat/vault/*.mjs into a scratch folder. kind 'new' = the working tree with ONE source transform: the key table gets the two
//                            supplied new-store classes (plc.characters.v1, plc.encounters.v1: local, user, format 1), because production key ownership is added at final integration.
//                            kind 'old' = the same files from git at the old reader (0b0ef275), byte for byte; 'old-new-table' = those old files with only the same key-table transform (the code the review diagnosed). kind 'new-without-recovery' / 'new-unverified-cleanup' = negative controls:
//                            the new files with exactly one guard removed.
//   file adapter / file storage / socket broker: the storage contracts of the vault and of localStorage shared by several PROCESSES (an actor per process).
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OLD_REV = '0b0ef27530a25e9d218ecae5460066162b07a6da';
// the two keys a build with this table recovers from sole raw stores. The plain ledger plc.encounters.v1 is NOT one of them any more: the vault holds it on purpose and never copies it in (LEGACY_HOLD), so the second key is the presentations store.
export const NEW_KEYS = ['plc.characters.v1', 'plc.presentations.v1'];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILES = ['vault-store.mjs', 'vault-control.mjs', 'vault.mjs', 'vault-db.mjs', 'data-formats.mjs', 'key-classes.mjs'];
const ANCHOR = '  "plc.shell.pins.v1": { store: "local", class: "user", format: 1 },\n';

/**
 * A scratch folder this process created and owns: mkdtemp inside PLC_TRANSITION_SCRATCH when set (it is only a PARENT: two test files, or two runs, sharing it never share a subtree),
 * else inside /var/lib/cosmoshot when that is writable (the host's scratch home; /tmp is memory-backed there), else the OS temporary folder (a fresh clone elsewhere).
 * Only that owned folder is removed when the process ends; set PLC_TRANSITION_KEEP=1 to keep it for diagnosis. The trees are a few small files.
 */
export function scratchRoot() {
  if (scratchRoot.owned) return scratchRoot.owned;
  const parents = [process.env.PLC_TRANSITION_SCRATCH, '/var/lib/cosmoshot', process.env.TMPDIR, os.tmpdir()].filter(Boolean);
  let made = null;
  for (const parent of parents) { try { fs.mkdirSync(parent, { recursive: true }); made = fs.mkdtempSync(path.join(parent, 'plc-transition-' + process.pid + '-')); break; } catch { /* try the next parent */ } }
  if (!made) throw new Error('no writable scratch parent');
  scratchRoot.owned = made;
  process.on('exit', () => { if (!process.env.PLC_TRANSITION_KEEP) { try { fs.rmSync(made, { recursive: true, force: true }); } catch { /* best effort */ } } });
  return made;
}
export const oldRevAvailable = () => { try { execFileSync('git', ['cat-file', '-e', OLD_REV + '^{commit}'], { cwd: ROOT, stdio: 'ignore' }); return true; } catch { return false; } };

function replaceOnce(text, from, to, label) {
  if (!text.includes(from)) throw new Error('control transform did not apply: ' + label);
  return text.replace(from, to);
}

/** Copy the vault files into dir/chat/vault/ and return { dir, store, control }. */
export function buildModules(dir, kind = 'new') {
  const target = path.join(dir, 'chat', 'vault');
  fs.mkdirSync(target, { recursive: true });
  for (const file of FILES) {
    let text = kind.startsWith('old')
      ? execFileSync('git', ['show', `${OLD_REV}:chat/vault/${file}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 })
      : fs.readFileSync(path.join(ROOT, 'chat', 'vault', file), 'utf8');
    if (kind !== 'old' && file === 'key-classes.mjs') text = replaceOnce(text, ANCHOR, ANCHOR + NEW_KEYS.map((k) => `  "${k}": { store: "local", class: "user", format: 1 },\n`).join(''), 'new key classes');
    if (kind === 'new-without-recovery' && file === 'vault-store.mjs') text = replaceOnce(text, 'const recovery = await reconcileRaw({ session, adapter: store, realLocal, writer: claim.writer, exclusive });', 'const recovery = { writer: claim.writer, recovered: [], verified: [], conflicts: [], retained: [], stale: [], held: [], blocked: [], unreadable: [], failed: [] };', 'no reconcile');
    if (kind === 'new-unverified-cleanup' && file === 'vault-store.mjs') text = replaceOnce(text, 'const allowed = !entries.damaged && (e.status === "equal" ||', 'const allowed = true || (e.status === "equal" ||', 'unverified cleanup');
    // controls for the history / exclusivity / fence / serialisation guards: the new files with exactly one of them removed
    if (kind === 'new-absence-is-proof' && file === 'vault-store.mjs') { // absence from the (possibly compacted) log is taken as "never encrypted"
      text = replaceOnce(text, '|| marker.has(key) || history.seenKvKeys.has(ns("local", key))) report.stale.push(key);', '|| marker.has(key)) report.stale.push(key);', 'drop seen');
      text = replaceOnce(text, 'else if (!history.observedHistoryComplete) hold(key, "history-unproven", raw);', '', 'drop unproven hold');
      text = replaceOnce(text, 'else if (stored.damaged.length) hold(key, "vault-damaged", raw);', '', 'drop damaged hold');
    }
    if (kind === 'new-fallback-is-exclusive' && file === 'vault-store.mjs') text = replaceOnce(text, 'const exclusive = Boolean(claim.writer && claim.supported);', 'const exclusive = Boolean(claim.writer);', 'fallback exclusive');
    if (kind === 'new-no-fence' && file === 'vault-store.mjs') text = replaceOnce(text, 'isCurrent(fence) { return Boolean(fence) && session !== null && fence.session === session && fence.epoch === epoch && !session.locked; }', 'isCurrent() { return true; }', 'no fence');
    if (kind === 'new-no-serialize' && file === 'vault-store.mjs') text = replaceOnce(text, '      if (inFlight) {\n        if (coalesce', '      if (false) {\n        if (coalesce', 'no serialize');
    if (kind === 'new-memory-readback' && file === 'vault-store.mjs') { // the stored log is never consulted: the in-memory state stands in for it, before and after the copy
      const memory = '{ kv: new Map(session.state.kv), threads: new Map(session.state.threads), damaged: [], history: { observedHistoryComplete: true, seenKvKeys: new Set() } }';
      text = replaceOnce(text, 'try { stored = await readbackState({ adapter, session }); } catch { stored = null; }', 'stored = ' + memory + ';', 'memory readback');
      text = replaceOnce(text, 'const after = await readbackState({ adapter, session });', 'const after = ' + memory + ';', 'memory readback after');
    }
    if (kind === 'new-no-final-recheck' && file === 'vault-control.mjs') text = replaceOnce(text, 'restorePlaintext(snapshot, realLocal, realSession, { allow, blocked: blockedNow });', 'for (const [k, v] of Object.entries(snapshot.local)) realLocal.setItem(k, v); for (const [k, v] of Object.entries(snapshot.session)) realSession.setItem(k, v);', 'no final recheck');
    if (kind === 'new-no-exclusive-gate' && file === 'vault-control.mjs') text = replaceOnce(text, '  if (!app.exclusive) throw new VaultError("no-exclusive"', '  if (false) throw new VaultError("no-exclusive"', 'no exclusive gate');
    if (kind === 'new-no-recheck' && file === 'vault-store.mjs') { // control: the raw values are read BEFORE the stored vault is read back, and not compared again when removed
      text = replaceOnce(text, 'if (real[e.kind].getItem(e.key) !== e.raw) { kept.push({ key: e.key, reason: WHY.changed }); continue; }', '', 'no recheck');
      text = replaceOnce(text, 'export async function inspectPlaintext({ session, adapter, realLocal, realSession }) {\n  await session.flush();', 'export async function inspectPlaintext({ session, adapter, realLocal, realSession }) {\n  const early = new Map(); for (const [kind, real] of [[\"local\", realLocal], [\"session\", realSession]]) for (const key of vaultedKeysOf(kind)) early.set(kind + key, rawGet(real, key));\n  await session.flush();', 'early read');
      text = replaceOnce(text, '    const raw = rawGet(real, key);\n    if (raw == null) continue;\n    if (blocked.includes(key)) { out.push', '    const raw = early.get(kind + key) ?? null;\n    if (raw == null) continue;\n    if (blocked.includes(key)) { out.push', 'early use');
    }
    // controls for the c correction: the corrected files with exactly one guard put back to the rejected candidate's behaviour
    if (kind === 'new-no-legacy-conflict-guard' && file === 'vault-control.mjs') {
      text = replaceOnce(text, '(replaceDiffering && e.status === "conflict")', '(e.status === "conflict" && LEGACY_VAULT_KEYS.includes(e.key))', 'legacy exception');
      text = replaceOnce(text, 'reconcileRaw, plaintextRemains', 'reconcileRaw, LEGACY_VAULT_KEYS, plaintextRemains', 'legacy import');
    }
    if (kind === 'new-undecoded-is-complete' && file === 'vault.mjs') text = replaceOnce(text, 'damaged.push({ seq: rec.seq, reason: "no-key" }); gap = true; continue; }', 'damaged.push({ seq: rec.seq, reason: "no-key" }); if (rec.keyId === KEY_DEK || !/^[cd]:/.test(String(rec.keyId))) gap = true; continue; }', 'undecoded complete');
    if (kind === 'new-no-detached-fence' && file === 'vault-control.mjs') {
      text = replaceOnce(text, 'const afterDetach = () => { if (!stillOurs()) throw changed(); };', 'const afterDetach = () => {};', 'no detached fence');
      text = replaceOnce(text, 'await store().clear({ guard: stillOurs });', 'await store().clear();', 'no clear guard');
    }
    if (kind === 'new-no-append-guard' && file === 'vault.mjs') {
      text = replaceOnce(text, 'if (!authorized(guard)) throw new VaultError("session-changed"', 'if (false) throw new VaultError("session-changed"', 'no append guard');
      text = replaceOnce(text, 'await (guard === undefined || guard === null ? adapter.append(record) : adapter.append(record, { guard }));', 'await adapter.append(record);', 'no adapter guard');
    }
    if (kind === 'new-no-locked-recheck' && file === 'vault.mjs') text = replaceOnce(text, 'if (locked) throw new VaultError("locked", "The vault is locked.");\n        await (guard', 'await (guard', 'no locked recheck');
    if (kind === 'new-rehydrate-after-lock' && file === 'vault.mjs') text = replaceOnce(text, 'if (locked || !authorized(guard)) return at; // durable', 'if (false) return at; // durable', 'rehydrate after lock');
    if (kind === 'new-rehydrate-when-obsolete' && file === 'vault.mjs') text = replaceOnce(text, 'if (locked || !authorized(guard)) return at; // durable', 'if (locked) return at; // durable', 'rehydrate when obsolete');
    fs.writeFileSync(path.join(target, file), text);
  }
  return { dir, store: path.join(target, 'vault-store.mjs'), control: path.join(target, 'vault-control.mjs'), keyClasses: path.join(target, 'key-classes.mjs') };
}

let importCounter = 0;
/** Import a copied module with these storages and Web Locks as the page's globals (the module reads them once, when it loads). */
export async function loadModules(built, { local, session, locks } = {}) {
  globalThis.localStorage = local; globalThis.sessionStorage = session;
  Object.defineProperty(globalThis, 'navigator', { value: { locks }, configurable: true, writable: true });
  const q = '?m=' + (++importCounter);
  const store = await import(pathToFileURL(built.store).href + q);
  const control = await import(pathToFileURL(built.control).href + q);
  const vault = await import(pathToFileURL(path.join(path.dirname(built.store), 'vault.mjs')).href + q);
  return { store, control, vault };
}

// ---- storage contracts shared by processes ----------------------------------------------------------------------------------------------------------------------------

/** localStorage over a folder: one file per key, each write whole-or-absent (temp file, fsync, rename), as a browser's setItem is. */
export function fileStorage(dir, { onBeforeRemove = () => {}, onAfterRemove = () => {}, onAfterSet = () => {} } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, encodeURIComponent(key));
  const names = () => fs.readdirSync(dir).filter((n) => !n.includes('.tmp-')).map(decodeURIComponent).sort();
  return {
    getItem(key) { try { return fs.readFileSync(file(String(key)), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    setItem(key, value) { const tmp = file(String(key)) + '.tmp-' + process.pid; const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, String(value)); fs.fsyncSync(fd); fs.closeSync(fd); fs.renameSync(tmp, file(String(key))); onAfterSet(String(key)); },
    removeItem(key) { onBeforeRemove(String(key)); try { fs.unlinkSync(file(String(key))); } catch (e) { if (e.code !== 'ENOENT') throw e; } onAfterRemove(String(key)); },
    clear() { for (const n of names()) this.removeItem(n); },
    key(i) { return names()[i] ?? null; },
    get length() { return names().length; }
  };
}

/** The vault adapter over a folder: header file, one file per record. append is exclusive (a seq that exists is refused), and whole-or-absent via link(). */
export function fileAdapter(dir, { before = () => {}, after = () => {} } = {}) {
  fs.mkdirSync(path.join(dir, 'log'), { recursive: true });
  const header = path.join(dir, 'header.json');
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const conflict = () => Object.assign(new Error('Another tab wrote to the vault at the same time.'), { code: 'conflict' });
  const seqs = () => fs.readdirSync(path.join(dir, 'log')).filter((n) => /^\d+\.json$/.test(n)).map((n) => parseInt(n, 10)).sort((a, b) => a - b);
  const write = (target, value, exclusive) => {
    const tmp = target + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); fs.closeSync(fd);
    try { if (exclusive) fs.linkSync(tmp, target); else fs.renameSync(tmp, target); } catch (e) { if (e.code === 'EEXIST') throw conflict(); throw e; } finally { try { fs.unlinkSync(tmp); } catch { /* renamed */ } }
  };
  return {
    kind: 'file',
    async readHeader() { try { return JSON.parse(fs.readFileSync(header, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async writeHeader(h) { write(header, clone(h), false); },
    async readLog() { return seqs().map((s) => JSON.parse(fs.readFileSync(path.join(dir, 'log', s + '.json'), 'utf8'))); },
    async append(record) { before(record); write(path.join(dir, 'log', record.seq + '.json'), clone(record), true); after(record); },
    async replaceLog({ add, removeUpTo }) { for (const r of add) write(path.join(dir, 'log', r.seq + '.json'), clone(r), true); for (const s of seqs()) if (s <= removeUpTo) fs.unlinkSync(path.join(dir, 'log', s + '.json')); }, // set-up only (one writer): the new records first, then the old ones go
    async clear() { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(path.join(dir, 'log'), { recursive: true }); },
    count: () => seqs().length
  };
}

// ---- Web Locks stand-in over a socket: freed when the holder's connection closes (a tab or process dying), `ifAvailable` answered at once ------------------------------

export function startBroker(socketPath, { leakOnDisconnect = false } = {}) {
  const queue = []; let holder = null; const events = [];
  const pump = () => { if (holder || !queue.length) return; holder = queue.shift(); events.push({ kind: 'grant', pid: holder.pid }); holder.socket.write('g\n'); };
  const free = (entry, cause) => { if (holder !== entry) return; holder = null; events.push({ kind: 'free', pid: entry.pid, cause }); pump(); };
  const server = net.createServer((socket) => {
    const entry = { socket, pid: null, buffer: '' };
    socket.on('error', () => {});
    socket.on('data', (chunk) => {
      entry.buffer += chunk; let at;
      while ((at = entry.buffer.indexOf('\n')) >= 0) {
        const line = entry.buffer.slice(0, at); entry.buffer = entry.buffer.slice(at + 1);
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.t === 'req') {
          entry.pid = m.pid;
          if (m.ifAvailable && holder) { socket.write('n\n'); continue; }
          queue.push(entry); pump();
        }
      }
    });
    socket.on('close', () => {
      const i = queue.indexOf(entry); if (i >= 0) queue.splice(i, 1);
      if (holder === entry) { if (leakOnDisconnect) { events.push({ kind: 'leaked', pid: entry.pid }); return; } free(entry, 'disconnect'); }
    });
  });
  return new Promise((resolve) => server.listen(socketPath, () => resolve({ events, holderPid: () => holder?.pid ?? null, close: () => new Promise((done) => { for (const e of [holder, ...queue]) e?.socket.destroy(); server.close(() => done()); }) })));
}

/** navigator.locks as one actor process sees it, spoken to the broker. */
export function brokerLocks(socketPath) {
  return {
    request(name, options, callback) {
      if (typeof options === 'function') { callback = options; options = {}; }
      return new Promise((resolve, reject) => {
        const socket = net.connect(socketPath); let buffer = '', done = false;
        socket.on('connect', () => socket.write(JSON.stringify({ t: 'req', name, pid: process.pid, ifAvailable: Boolean(options?.ifAvailable) }) + '\n'));
        socket.on('error', (e) => { if (!done) reject(e); });
        socket.on('data', async (chunk) => {
          buffer += chunk; if (done || !buffer.includes('\n')) return; done = true;
          try {
            if (buffer.startsWith('n')) { socket.destroy(); resolve(await callback(null)); }
            else { const result = await callback({ name }); socket.destroy(); resolve(result); } // held while the callback's promise is pending (a page's lease: until it is released or the process dies); settled: the broker frees it on the closed socket, as a real request resolves after its callback
          } catch (e) { socket.destroy(); reject(e); }
        });
      });
    }
  };
}
