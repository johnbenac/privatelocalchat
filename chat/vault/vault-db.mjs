// Where the vault's header and log are kept: an IndexedDB database in the browser, and a plain in-memory twin for tests. Both give the vault the same async interface:
//   readHeader() -> header | null          writeHeader(header)
//   readLog() -> records ordered by seq    append(record)  (rejects with code "conflict" if that seq exists: two writers)
//   replaceLog({ add, removeUpTo })        add the records and remove every record with seq <= removeUpTo, all or nothing
//   clear()                                remove everything
// A write counts as stored when its IndexedDB transaction completes (`durability: "strict"` where the browser supports asking for it).

const conflict = () => Object.assign(new Error("Another tab wrote to the vault at the same time."), { code: "conflict" });
const clone = (value) => (value === null || value === undefined ? value : JSON.parse(JSON.stringify(value)));

export function createMemoryAdapter() {
  let header = null, log = new Map();
  return {
    kind: "memory",
    async readHeader() { return clone(header); },
    async writeHeader(h) { header = clone(h); },
    async readLog() { return [...log.values()].sort((a, b) => a.seq - b.seq).map(clone); },
    async append(record) { if (log.has(record.seq)) throw conflict(); log.set(record.seq, clone(record)); },
    async replaceLog({ add, removeUpTo }) {
      const next = new Map(log);
      for (const seq of [...next.keys()]) if (seq <= removeUpTo) next.delete(seq);
      for (const r of add) { if (next.has(r.seq)) throw conflict(); next.set(r.seq, clone(r)); }
      log = next;
    },
    async clear() { header = null; log = new Map(); },
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
  const tx = async (stores, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let t;
      try { t = db.transaction(stores, mode, mode === "readwrite" ? { durability: "strict" } : undefined); } catch (error) { reject(error); return; }
      let result;
      t.oncomplete = () => resolve(result);
      t.onabort = () => reject(t.error && t.error.name === "ConstraintError" ? conflict() : t.error || new Error("The vault write was interrupted."));
      t.onerror = () => { /* the abort handler reports it */ };
      try { Promise.resolve(fn(...[].concat(stores).map((s) => t.objectStore(s)))).then((v) => { result = v; }, (error) => { try { t.abort(); } catch { /* done */ } reject(error); }); } catch (error) { try { t.abort(); } catch { /* done */ } reject(error); }
    });
  };
  const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  return {
    kind: "indexeddb",
    async readHeader() { const row = await tx("header", "readonly", (s) => req(s.get("header"))); if (!row) return null; const { id, ...header } = row; return header; },
    async writeHeader(h) { await tx("header", "readwrite", (s) => req(s.put({ ...h, id: "header" }))); },
    async readLog() { return tx("log", "readonly", (s) => req(s.getAll())); },
    async append(record) { await tx("log", "readwrite", (s) => req(s.add(record))); },
    async replaceLog({ add, removeUpTo }) {
      await tx("log", "readwrite", (s) => Promise.all([req(s.delete(IDBKeyRange.upperBound(removeUpTo))), ...add.map((r) => req(s.add(r)))])); // all queued at once: the transaction never waits between requests
    },
    async clear() { await tx(["header", "log"], "readwrite", (h, l) => Promise.all([req(h.clear()), req(l.clear())])); },
    close: async () => { if (opening) { try { (await opening).close(); } catch { /* ignore */ } opening = null; } }
  };
}
