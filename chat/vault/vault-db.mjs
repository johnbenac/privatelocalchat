// Where the vault's header and log are kept: an IndexedDB database in the browser, and a plain in-memory twin for tests. Both give the vault the same async interface:
//   readHeader() -> header | null          writeHeader(header)
//   readLog() -> records ordered by seq    append(record)  (rejects with code "conflict" if that seq exists: two writers)
//   replaceLog({ add, removeUpTo })        add the records and remove every record with seq <= removeUpTo, all or nothing
//   clear()                                remove everything
// A write counts as stored when its IndexedDB transaction completes (`durability: "strict"` where the browser supports asking for it).
//
// Every mutator (writeHeader, append, replaceLog, clear) also takes an OPTIONAL local guard: { guard } (replaceLog: a guard beside add / removeUpTo). It is for an action that was started by
// a lifecycle (an unlocked session, a multi-step transition) which may have ended while the action waited. A guard authorizes ONLY by returning exactly true: false, undefined, any other
// value, a Promise or a throw refuse, and the mutation fails with code "session-changed" before it starts. No guard (every existing caller) changes nothing. It is not stored and is not a format.
//   memory adapter     checked on entry (its bodies never wait, so that is the point the write starts).
//   IndexedDB adapter  checked (1) after the awaited open() resolves (even a cached open yields), in the same synchronous run that creates the readwrite transaction, and (2) AGAIN at the
//                      transaction's own activity: a queued readwrite transaction does not run until the transactions before it finish, and until it runs nothing has been requested. A cheap
//                      read is queued first; when ITS callback fires the transaction is running, the guard is asked again and, if it fails, the transaction is aborted before the mutation
//                      request is placed. After a true guard at activity the mutation request is placed in that same callback (no await between) and the transaction commits when that
//                      callback returns: that commit cannot be taken back, and its completion may be reported after the page has locked.

const conflict = () => Object.assign(new Error("Another tab wrote to the vault at the same time."), { code: "conflict" });
const stale = () => Object.assign(new Error("The vault was locked or replaced while this was waiting, so it was not written."), { code: "session-changed" });
const allowed = (guard) => { if (guard === undefined || guard === null) return true; try { return guard() === true; } catch { return false; } };
const clone = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));
const mismatch = () => Object.assign(new Error("The stored vault is not what this write expected, so nothing was written."), { code: "expected-mismatch" });
const invalid = (message) => Object.assign(new TypeError(message), { code: "invalid" });
/** Stable text of a JSON value (sorted keys): two copies of the same stored row compare equal whatever their property order. */
const canon = (value) => JSON.stringify(value, (key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
// Atomic projection (replaceLog with `expected` + `nextHeader`): the header AND the log are compared with exactly what the caller read, and changed together or not at all (docs/OWNED-CONVERSATION-STORE.md).
//   replaceLog({ add, removeUpTo: 0, guard, expected: { header, log }, nextHeader })
// Both adapters advertise `atomicProjection: true`; an adapter without it is refused by the engine before anything is written (there is no sequential fallback).
const checkProjection = ({ add, removeUpTo, expected, nextHeader }) => {
  if (!expected || typeof expected !== "object" || !Array.isArray(expected.log) || !("header" in expected)) throw invalid("expected must hold the header and the ordered log that were read");
  if (!nextHeader || typeof nextHeader !== "object" || Array.isArray(nextHeader)) throw invalid("nextHeader must be the header to store");
  if (removeUpTo) throw invalid("an atomic projection never removes records");
  if (!Array.isArray(add) || add.some((r) => !r || !Number.isInteger(r.seq))) throw invalid("add must be records with a seq");
};

export function createMemoryAdapter() {
  let header = null, log = new Map();
  return {
    kind: "memory",
    atomicProjection: true,
    async readHeader() { return clone(header); },
    async writeHeader(h, options) { if (!allowed(options?.guard)) throw stale(); header = clone(h); },
    async readLog() { return [...log.values()].sort((a, b) => a.seq - b.seq).map(clone); },
    async append(record, options) { if (!allowed(options?.guard)) throw stale(); if (log.has(record.seq)) throw conflict(); log.set(record.seq, clone(record)); },
    async replaceLog({ add, removeUpTo, guard, expected, nextHeader }) {
      if (!allowed(guard)) throw stale();
      if (expected !== undefined || nextHeader !== undefined) {
        checkProjection({ add, removeUpTo, expected, nextHeader });
        // Both copies are made and validated first; header and log are published together, after everything passed (the bodies never wait, so nothing can interleave).
        if (canon(header) !== canon(expected.header ?? null)) throw mismatch();
        const stored = [...log.values()].sort((a, b) => a.seq - b.seq);
        if (canon(stored) !== canon(expected.log)) throw mismatch();
        const nextLog = new Map(log);
        for (const r of add) { if (nextLog.has(r.seq)) throw conflict(); nextLog.set(r.seq, clone(r)); }
        const nextHead = clone(nextHeader);
        header = nextHead; log = nextLog;
        return;
      }
      const next = new Map(log);
      for (const seq of [...next.keys()]) if (seq <= removeUpTo) next.delete(seq);
      for (const r of add) { if (next.has(r.seq)) throw conflict(); next.set(r.seq, clone(r)); }
      log = next;
    },
    async clear(options) { if (!allowed(options?.guard)) throw stale(); header = null; log = new Map(); },
    /** test helpers: the raw stored records, and a way to change them behind the vault's back */
    raw: () => ({ header: clone(header), log: [...log.values()].map(clone) }),
    tamper(fn) { const records = [...log.values()]; fn(records, (r) => log.set(r.seq, r), (seq) => log.delete(seq)); }
  };
}

export function createIndexedDbAdapter({ name = "plc-vault", factory = globalThis.indexedDB } = {}) {
  let opening = null;
  const open = () => (opening ||= new Promise((resolve, reject) => {
    if (!factory) return reject(new Error("This browser cannot keep an encrypted vault (no IndexedDB)."));
    const r = factory.open(name, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("header", { keyPath: "id" }); r.result.createObjectStore("log", { keyPath: "seq" }); };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); opening = null; }; resolve(r.result); };
    r.onerror = () => { opening = null; reject(r.error || new Error("The vault could not be opened.")); };
    r.onblocked = () => { opening = null; reject(new Error("The vault is open in another tab that must be reloaded.")); };
  }));
  const tx = async (stores, mode, fn, guard) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const guarded = guard !== undefined && guard !== null && mode === "readwrite";
      if (guarded && !allowed(guard)) { reject(stale()); return; } // the open has resolved: nothing exists yet, so nothing is started
      let t;
      try { t = db.transaction(stores, mode, mode === "readwrite" ? { durability: "strict" } : undefined); } catch (error) { reject(error); return; }
      let result, refused = null;
      t.oncomplete = () => resolve(result);
      t.onabort = () => reject(refused || (t.error && t.error.name === "ConstraintError" ? conflict() : t.error || new Error("The vault write was interrupted.")));
      t.onerror = () => { /* the abort handler reports it */ };
      const run = () => { try { Promise.resolve(fn(...[].concat(stores).map((s) => t.objectStore(s)))).then((v) => { result = v; }, (error) => { try { t.abort(); } catch { /* done */ } reject(error); }); } catch (error) { try { t.abort(); } catch { /* done */ } reject(error); } };
      if (!guarded) { run(); return; }
      // Queued behind earlier transactions? This one has requested nothing yet. The first request below is answered only when the transaction RUNS: ask the guard again then, and abort
      // before placing the mutation if the lifecycle ended while it waited.
      let probe;
      try { probe = t.objectStore([].concat(stores)[0]).count(); } catch (error) { try { t.abort(); } catch { /* done */ } reject(error); return; }
      probe.onsuccess = () => { if (!allowed(guard)) { refused = stale(); try { t.abort(); } catch { /* done */ } return; } run(); };
      probe.onerror = () => { /* the abort handler reports it */ };
    });
  };
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  /**
   * ONE readwrite transaction over [header, log]. The expected header and log are READ in that transaction and compared in the callback of the last read; the guard is asked at the open, when
   * the (possibly queued) transaction first runs, in the final compare-read callback, and once more immediately before the mutation requests. header.put and every log.add are then placed in that
   * same callback (no await, no crypto, no promise between the comparison and the mutation). Any mismatch, refused guard or failed request aborts the transaction, so header and log stay as they were.
   */
  const projectionTx = async ({ add, expected, nextHeader, guard }) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const guarded = guard !== undefined && guard !== null;
      if (guarded && !allowed(guard)) { reject(stale()); return; }
      let t;
      try { t = db.transaction(["header", "log"], "readwrite", { durability: "strict" }); } catch (error) { reject(error); return; }
      let refused = null, left = 2, headerRow, logRows;
      t.oncomplete = () => resolve();
      t.onabort = () => reject(refused || (t.error && t.error.name === "ConstraintError" ? conflict() : t.error || new Error("The vault write was interrupted.")));
      t.onerror = () => { /* the abort handler reports it */ };
      const fail = (error) => { refused ||= error; try { t.abort(); } catch { /* already finished */ } };
      const headers = t.objectStore("header"), logs = t.objectStore("log");
      const rh = headers.get("header"), rl = logs.getAll();
      const finish = () => {
        if (--left) return;
        // the final compare-read callback: the transaction is running, both reads are in
        if (!allowed(guard)) { fail(stale()); return; }
        let storedHeader = null; if (headerRow) { const { id, ...rest } = headerRow; storedHeader = rest; }
        if (canon(storedHeader) !== canon(expected.header ?? null) || canon(logRows) !== canon(expected.log)) { fail(mismatch()); return; }
        if (!allowed(guard)) { fail(stale()); return; }
        try { headers.put({ ...nextHeader, id: "header" }); for (const r of add) logs.add(r); } catch (error) { fail(error); }
      };
      rh.onsuccess = () => { if (!allowed(guard)) { fail(stale()); return; } headerRow = rh.result; finish(); }; // first callback = the transaction's own activity
      rl.onsuccess = () => { logRows = rl.result; finish(); };
      rh.onerror = rl.onerror = () => { /* the abort handler reports it */ };
    });
  };
  return {
    kind: "indexeddb",
    atomicProjection: true,
    async readHeader() { const row = await tx("header", "readonly", (s) => req(s.get("header"))); if (!row) return null; const { id, ...header } = row; return header; },
    async writeHeader(h, options) { await tx("header", "readwrite", (s) => req(s.put({ ...h, id: "header" })), options?.guard); },
    async readLog() { return tx("log", "readonly", (s) => req(s.getAll())); },
    async append(record, options) { await tx("log", "readwrite", (s) => req(s.add(record)), options?.guard); },
    async replaceLog({ add, removeUpTo, guard, expected, nextHeader }) {
      if (expected !== undefined || nextHeader !== undefined) { checkProjection({ add, removeUpTo, expected, nextHeader }); await projectionTx({ add, expected, nextHeader, guard }); return; }
      await tx("log", "readwrite", (s) => Promise.all([req(s.delete(IDBKeyRange.upperBound(removeUpTo))), ...add.map((r) => req(s.add(r)))]), guard); // all queued at once: the transaction never waits between requests
    },
    async clear(options) { await tx(["header", "log"], "readwrite", (h, l) => Promise.all([req(h.clear()), req(l.clear())]), options?.guard); },
    close: async () => { if (opening) { try { (await opening).close(); } catch { /* ignore */ } opening = null; } }
  };
}
