// A vault adapter over a SHARED FOLDER that several PROCESSES use at once, and that supports the engine's atomic projection (replaceLog with `expected` + `nextHeader`), which the plain
// file adapter of the transition rig does not. It exists so that tests/vault-typed-actors.test.mjs can race real processes against ONE backend.
//
//   * every read and every projection runs under one cross-process mutex (a directory created exclusively), so a reader never sees a half-published projection and the engine's own
//     double read of the header (readSnapshot) sees either a whole state or `busy`, as it would over IndexedDB, whose transactions are also separate;
//   * a projection compares the header AND the whole log with exactly what the caller read (the same canonical text as chat/vault/vault-db.mjs) and publishes the new records and the new
//     header together under that mutex, or refuses with `expected-mismatch`; a seq that exists is a `conflict`; a guard that does not return exactly true is `session-changed`.
//
// WHAT THIS IS NOT: it is not crash-atomic (the new records are linked in before the header is replaced), so it says nothing about a process dying inside a projection. That is the real
// browser's job (tests/helpers/vault-chat-projection-idb.mjs, task T894) and of the in-process crash tests. A mutex left behind by a killed process would block everyone, so a test that
// kills an actor must not use this adapter. Synthetic data only.
import fs from 'node:fs';
import path from 'node:path';

const clone = (v) => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
const canon = (value) => JSON.stringify(value, (key, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const err = (message, code) => Object.assign(new Error(message), { code });
const allowed = (guard) => { if (guard === undefined || guard === null) return true; try { return guard() === true; } catch { return false; } };
const sleeper = new Int32Array(new SharedArrayBuffer(4));

// lossy: a NEGATIVE CONTROL only: the expected header and log are not compared, so the last writer wins (a backend that would lose updates).
export function fileProjectionAdapter(dir, { onProjection = () => {}, lossy = false } = {}) {
  fs.mkdirSync(path.join(dir, 'log'), { recursive: true });
  const header = path.join(dir, 'header.json'), lockDir = path.join(dir, 'mutex');
  const seqs = () => fs.readdirSync(path.join(dir, 'log')).filter((n) => /^\d+\.json$/.test(n)).map((n) => parseInt(n, 10)).sort((a, b) => a - b);
  const readHeaderNow = () => { try { return JSON.parse(fs.readFileSync(header, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } };
  const readLogNow = () => seqs().map((s) => JSON.parse(fs.readFileSync(path.join(dir, 'log', s + '.json'), 'utf8')));
  const locked = (fn) => {
    const started = Date.now();
    for (;;) {
      try { fs.mkdirSync(lockDir); break; } catch (e) { if (e.code !== 'EEXIST') throw e; if (Date.now() - started > 30000) throw err('the shared mutex was not released in 30 s', 'mutex-timeout'); Atomics.wait(sleeper, 0, 0, 1); }
    }
    try { return fn(); } finally { fs.rmdirSync(lockDir); }
  };
  const put = (target, value, exclusive) => {
    const tmp = target + '.tmp-' + process.pid + '-' + Math.random().toString(36).slice(2);
    const fd = fs.openSync(tmp, 'w'); fs.writeSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); fs.closeSync(fd);
    try { if (exclusive) fs.linkSync(tmp, target); else fs.renameSync(tmp, target); } catch (e) { if (e.code === 'EEXIST') throw err('Another tab wrote to the vault at the same time.', 'conflict'); throw e; } finally { try { fs.unlinkSync(tmp); } catch { /* renamed */ } }
  };
  return {
    kind: 'file-projection', atomicProjection: true,
    async readHeader() { return locked(readHeaderNow); },
    async readLog() { return locked(readLogNow); },
    async writeHeader(h, options) { if (!allowed(options?.guard)) throw err('The vault was locked or replaced while this was waiting, so it was not written.', 'session-changed'); locked(() => put(header, clone(h), false)); },
    async append(record, options) { if (!allowed(options?.guard)) throw err('The vault was locked or replaced while this was waiting, so it was not written.', 'session-changed'); locked(() => put(path.join(dir, 'log', record.seq + '.json'), clone(record), true)); },
    async clear() { locked(() => { for (const s of seqs()) fs.unlinkSync(path.join(dir, 'log', s + '.json')); try { fs.unlinkSync(header); } catch { /* none */ } }); },
    async replaceLog({ add, removeUpTo, guard, expected, nextHeader }) {
      if (!allowed(guard)) throw err('The vault was locked or replaced while this was waiting, so it was not written.', 'session-changed');
      locked(() => {
        if (expected !== undefined || nextHeader !== undefined) {
          if (!expected || !Array.isArray(expected.log) || !('header' in expected) || !nextHeader || removeUpTo) throw Object.assign(new TypeError('a projection needs expected, nextHeader and removeUpTo 0'), { code: 'invalid' });
          if (!lossy && canon(readHeaderNow()) !== canon(expected.header ?? null)) throw err('The stored vault is not what this write expected, so nothing was written.', 'expected-mismatch');
          if (!lossy && canon(readLogNow()) !== canon(expected.log)) throw err('The stored vault is not what this write expected, so nothing was written.', 'expected-mismatch');
          for (const r of add) if (fs.existsSync(path.join(dir, 'log', r.seq + '.json'))) { if (lossy) fs.unlinkSync(path.join(dir, 'log', r.seq + '.json')); else throw err('Another tab wrote to the vault at the same time.', 'conflict'); }
          onProjection({ adds: add.length });
          for (const r of add) put(path.join(dir, 'log', r.seq + '.json'), clone(r), true);
          put(header, clone(nextHeader), false);
          return;
        }
        for (const r of add) put(path.join(dir, 'log', r.seq + '.json'), clone(r), true);
        for (const s of seqs()) if (s <= removeUpTo) fs.unlinkSync(path.join(dir, 'log', s + '.json'));
      });
    },
    count: () => seqs().length,
    identity: () => { const f = path.join(dir, 'backend.json'); const st = fs.statSync(f); return { real: fs.realpathSync(dir), ino: st.ino, nonce: JSON.parse(fs.readFileSync(f, 'utf8')).nonce }; }
  };
}
