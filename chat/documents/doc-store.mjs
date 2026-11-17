// Attached and library documents live in IndexedDB (conversations stay small in localStorage). A temporary chat's documents are
// kept in memory only.
import { app, noteNewerDatabase } from "../vault/vault-store.mjs";
// With the vault on, documents live in the vault (encrypted, one key each); app.docsBackend is then set and this file stops touching IndexedDB.
const DB = "plc-docs", STORE = "docs";
export const DB_FORMAT = 1; // the IndexedDB version of this database: the highest this version reads and writes (docs/DATA-COMPATIBILITY.md)
const memory = new Map();
let opening = null;
const open = () => (opening ||= new Promise((resolve, reject) => {
  if (typeof indexedDB === "undefined") return reject(new Error("This browser cannot store documents."));
  const r = indexedDB.open(DB, DB_FORMAT);
  r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: "id" }); };
  r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); opening = null; }; resolve(r.result); }; // let the database be deleted (turning the vault on removes the old copy)
  r.onerror = () => {
    opening = null;
    if (r.error?.name === "VersionError") { // a newer version of the app created this database: leave it alone and say so
      noteNewerDatabase(DB);
      const error = new Error("The documents saved in this browser were written by a newer version of the app, so this version cannot open them."); error.code = "newer-format"; reject(error); return;
    }
    reject(r.error || new Error("Document storage is unavailable."));
  };
}));
const run = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); const store = tx.objectStore(STORE); let result;
    Promise.resolve(fn(store)).then((v) => { result = v; }, reject);
    tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error("Document storage was interrupted."));
  });
};
const req = (r) => new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

const vault = () => app.docsBackend;
export const docStore = {
  async put(doc) { if (doc.temporary) { memory.set(doc.id, doc); return; } if (vault()) return vault().put(doc); await run("readwrite", (s) => req(s.put(doc))); },
  async get(id) { if (memory.has(id)) return memory.get(id); if (vault()) return vault().get(id); return run("readonly", (s) => req(s.get(id))); },
  async getMany(ids) { return Promise.all(ids.map((id) => this.get(id))); },
  async remove(id) { memory.delete(id); if (vault()) return vault().remove(id); await run("readwrite", (s) => req(s.delete(id))); },
  /** Records without their text, for lists and the storage screen. */
  async list() {
    const out = [...memory.values()].map(meta);
    if (vault()) { for (const d of await vault().all()) out.push(meta(d)); return out; }
    await run("readonly", (s) => new Promise((resolve, reject) => {
      const c = s.openCursor(); c.onerror = () => reject(c.error);
      c.onsuccess = () => { const cur = c.result; if (!cur) return resolve(); out.push(meta(cur.value)); cur.continue(); };
    }));
    return out;
  },
  async all() { const base = [...memory.values()]; const stored = vault() ? await vault().all() : await run("readonly", (s) => req(s.getAll())); return base.concat(stored); },
  /** Documents with library === true whose scope is everywhere or the given project. */
  async libraryFor(folderId) { return (await this.all()).filter((d) => d.library && d.scope !== "off" && (d.scope === "all" || (folderId && d.scope === folderId))); },
  /** Drop documents that no conversation or library entry refers to any more. */
  async prune(referencedIds) {
    const keep = new Set(referencedIds); let removed = 0;
    for (const d of await this.list()) if (!d.library && !keep.has(d.id)) { await this.remove(d.id); removed++; }
    return removed;
  },
  async clear() { memory.clear(); if (vault()) return vault().clear(); await run("readwrite", (s) => req(s.clear())); }
};
const meta = ({ id, name, kind, size, addedAt, pages, chars, library, scope, temporary, width, height }) => ({ id, name, kind, size, addedAt, pages, chars, library: Boolean(library), scope, temporary: Boolean(temporary), width, height, bytes: (chars ?? 0) * 2 + (size && kind === "image" ? size : 0) });
