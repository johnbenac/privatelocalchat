// The one storage interface the app uses for what the person keeps (docs/ENCRYPTION-AT-REST-PLAN.md, phases 2 and 3).
//
// `appLocal` and `appSession` look like localStorage and sessionStorage. With the vault off they ARE those (nothing changes, and the formats CLAUDE.md says to preserve are still
// what is written). With the vault on, every key the inventory classes as user / setting / transient is kept in the encrypted vault instead: reads come from an in-memory copy
// (so the app stays synchronous), writes update that copy at once and are sealed and stored in the background, one write in flight per key, so a streaming reply is stored
// about as often as the page saves it. Keys the inventory calls plain (the side panel, the lock reminder...) stay in the browser's own storage, readable before unlock.
//
// `bootVault()` runs first in every entry point: if a vault exists it shows the unlock screen and resolves once the person is in.

import { KEY_CLASSES, isVaulted } from "./key-classes.mjs";
import { createVault, VaultError } from "./vault.mjs";
import { createIndexedDbAdapter } from "./vault-db.mjs";
import { REGISTRY_KEY, parseRegistry, findNewer, stampedRegistry } from "./data-formats.mjs";

export const VAULT_MARKER = "plc.vault.v1"; // plain: "1" or JSON { autoMinutes }. Lets the page paint the locked state before IndexedDB answers.
const THREADS = "chatThreads", THREAD_ORDER = "l/chatThreads.order", REMEMBER = "meta/rememberKeys";
/** chatConfig holds the current API key too; when keys are not remembered the stored copy has it blanked (this visit keeps the full copy in memory). */
const withoutToken = (json) => { try { const c = JSON.parse(json); if (c && typeof c === "object" && "token" in c) c.token = ""; return JSON.stringify(c); } catch { return json; } };
const ns = (kind, key) => (kind === "local" ? "l/" : "s/") + key;

/** A Storage stand-in that only lives in memory (tests, and the keys that must not be remembered). */
export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}

export function createAppStorage({ realLocal, realSession, onWriteError = () => {}, onChange = () => {}, onReadOnly = () => {}, onRemote = () => {}, onBlockedWrite = () => {}, channel = null } = {}) {
  let session = null;                    // the unlocked vault session, or null (vault off)
  let docsBackend = null;
  const mirror = { local: new Map(), session: new Map() }; // vaulted key -> string (threads are rebuilt from `threadsById`)
  const threadsById = new Map();         // id -> thread object, in order via `order`
  const threadJson = new Map();          // id -> last stored JSON, to find what changed
  let order = [];
  let rememberKeys = true;
  let readOnly = false, readOnlyWarned = false;  // another tab holds the vault's writer lock: this tab reads, and says so when it is asked to write
  const memoryOnly = new Set();          // keys not stored at all (API keys when "remember" is off)
  const blocked = new Set();             // keys whose stored data comes from a newer version: still readable, never written or removed (chat/vault/data-formats.mjs)
  const refuse = (key) => { if (!blocked.has(key)) return false; try { onBlockedWrite(key); } catch { /* a listener must not stop the page */ } return true; };
  let dirty = new Map(), running = null, writes = 0, failures = 0;

  // ---- writing: latest value per key, one batch in flight ----
  function schedule(slot, job) {
    if (readOnly) { if (!readOnlyWarned) { readOnlyWarned = true; try { onReadOnly(); } catch { /* a listener must not stop the page */ } } return; }
    dirty.set(slot, job); pump();
  }
  function pump() {
    if (running) return;
    running = (async () => {
      while (dirty.size) {
        const batch = [...dirty.values()]; dirty = new Map();
        for (const job of batch) { try { await job(); writes++; } catch (error) { failures++; try { onWriteError(error); } catch { /* the listener must not stop the queue */ } } }
        try { channel?.postMessage({ seq: session?.lastSeq }); } catch { /* the other tabs just do not hear about it */ }
      }
    })().finally(() => { running = null; if (dirty.size) pump(); });
  }
  const flush = async () => { while (running || dirty.size) { pump(); await running; } if (session) await session.flush(); };

  const threadsJson = () => JSON.stringify(order.map((id) => threadsById.get(id)).filter(Boolean));
  let threadsCache = null;

  function setThreads(json) {
    let list; try { list = JSON.parse(json); } catch { list = null; }
    if (!Array.isArray(list)) throw new TypeError("chatThreads must be a list");
    const seen = new Set(), nextOrder = [];
    for (const t of list) {
      if (!t || t.id == null) continue;
      const id = String(t.id); seen.add(id); nextOrder.push(id);
      const text = JSON.stringify(t);
      if (threadJson.get(id) !== text) { threadJson.set(id, text); threadsById.set(id, t); schedule("t:" + id, () => session.putThread(id, t)); }
    }
    for (const id of [...threadsById.keys()]) if (!seen.has(id)) { threadsById.delete(id); threadJson.delete(id); schedule("t:" + id, () => session.delThread(id)); }
    if (nextOrder.join("\n") !== order.join("\n")) { order = nextOrder; schedule("order", () => session.setKv(THREAD_ORDER, JSON.stringify(order))); }
    threadsCache = null;
  }

  function makeStore(kind, real) {
    const vaulted = (key) => Boolean(session) && isVaulted(key) && KEY_CLASSES[key]?.store === kind;
    return {
      getItem(key) {
        key = String(key);
        if (!vaulted(key)) return real.getItem(key);
        if (key === THREADS) return (threadsCache ??= threadsJson());
        return mirror[kind].has(key) ? mirror[kind].get(key) : null;
      },
      setItem(key, value) {
        key = String(key); value = String(value);
        if (refuse(key)) return;
        if (!vaulted(key)) return real.setItem(key, value);
        if (key === THREADS) { setThreads(value); onChange(key); return; }
        mirror[kind].set(key, value);
        if (!memoryOnly.has(key)) schedule("k:" + ns(kind, key), () => session.setKv(ns(kind, key), key === "chatConfig" && !rememberKeys ? withoutToken(value) : value));
        onChange(key);
      },
      removeItem(key) {
        key = String(key);
        if (refuse(key)) return;
        if (!vaulted(key)) return real.removeItem(key);
        if (key === THREADS) { setThreads("[]"); onChange(key); return; }
        if (mirror[kind].delete(key)) schedule("k:" + ns(kind, key), () => session.delKv(ns(kind, key)));
        onChange(key);
      },
      clear() {
        if (session) {
          for (const key of [...mirror[kind].keys()]) this.removeItem(key);
          if (kind === "local" && !blocked.has(THREADS)) setThreads("[]");
        }
        if (!blocked.size) { real.clear(); return; }
        const own = []; for (let i = 0; i < real.length; i++) own.push(real.key(i));
        for (const key of own) if (!blocked.has(key)) real.removeItem(key);
      },
      key(i) { const all = [...this.keys()]; return all[i] ?? null; },
      keys() { const own = session ? [...mirror[kind].keys(), ...(kind === "local" && threadsById.size ? [THREADS] : [])] : []; const realKeys = []; for (let i = 0; i < real.length; i++) realKeys.push(real.key(i)); return new Set([...realKeys.filter((k) => !vaulted(k)), ...own]); },
      get length() { return this.keys().size; }
    };
  }
  const local = makeStore("local", realLocal), sessionStore = makeStore("session", realSession);

  // ---- documents ----
  const writable = () => { if (readOnly) throw new VaultError("read-only", "This app is open in another tab, so changes here are not saved."); };
  function makeDocsBackend() {
    return {
      async put(doc) { writable(); await session.putDoc(doc.id, doc); },
      async get(id) { return session.state.docs.get(String(id)); },
      async remove(id) { writable(); await session.delDoc(id); },
      async all() { return [...session.state.docs.values()]; },
      async clear() { writable(); for (const id of [...session.state.docs.keys()]) await session.delDoc(id); }
    };
  }

  /** The vault is unlocked: serve vaulted keys from it. */
  function attach(unlocked, { writer = true } = {}) {
    session = unlocked; readOnly = !writer; readOnlyWarned = false;
    mirror.local.clear(); mirror.session.clear(); threadsById.clear(); threadJson.clear(); order = []; threadsCache = null;
    for (const [k, v] of session.state.kv) {
      if (k === THREAD_ORDER) { try { order = JSON.parse(v); } catch { order = []; } } else if (k.startsWith("l/")) mirror.local.set(k.slice(2), v); else if (k.startsWith("s/")) mirror.session.set(k.slice(2), v); else if (k === REMEMBER) rememberKeys = v !== "0";
    }
    for (const [id, thread] of session.state.threads) { threadsById.set(id, thread); threadJson.set(id, JSON.stringify(thread)); }
    const ids = new Set(order.filter((id) => threadsById.has(id)));
    order = [...ids, ...[...threadsById.keys()].filter((id) => !ids.has(id))];
    memoryOnly.clear(); if (!rememberKeys) memoryOnly.add("chatEndpointTokens");
    docsBackend = makeDocsBackend();
    if (channel) channel.onmessage = (event) => { if (session && readOnly) { try { onRemote(event.data); } catch { /* ignore */ } } };
    onChange("*");
  }
  function detach() { session = null; docsBackend = null; mirror.local.clear(); mirror.session.clear(); threadsById.clear(); threadJson.clear(); order = []; threadsCache = null; memoryOnly.clear(); }

  return {
    local, session: sessionStore, attach, detach, flush,
    get active() { return Boolean(session); },
    /** Keys whose data a newer version wrote: reads still work, writes and removals are refused. */
    setBlocked(keys) { blocked.clear(); for (const k of keys || []) blocked.add(String(k)); },
    get blocked() { return [...blocked].sort(); },
    get readOnly() { return readOnly; },
    get vaultSession() { return session; },
    get docsBackend() { return docsBackend; },
    get stats() { return { writes, failures, pending: dirty.size + (running ? 1 : 0) }; },
    get rememberKeys() { return rememberKeys; },
    setRememberKeys(on) {
      rememberKeys = Boolean(on);
      if (!session) return;
      schedule("meta:remember", () => session.setKv(REMEMBER, on ? "1" : "0"));
      const cfg = mirror.session.get("chatConfig");
      if (cfg != null) schedule("k:" + ns("session", "chatConfig"), () => session.setKv(ns("session", "chatConfig"), on ? cfg : withoutToken(cfg)));
      if (on) { memoryOnly.delete("chatEndpointTokens"); const v = mirror.session.get("chatEndpointTokens"); if (v != null) schedule("k:" + ns("session", "chatEndpointTokens"), () => session.setKv(ns("session", "chatEndpointTokens"), v)); }
      else { memoryOnly.add("chatEndpointTokens"); schedule("k:" + ns("session", "chatEndpointTokens"), () => session.delKv(ns("session", "chatEndpointTokens"))); }
    },
    /** Everything vaulted, as the plain storage would hold it (for turning the vault off, a check after migrating, or a backup). */
    snapshot() {
      const out = { local: {}, session: {} };
      for (const kind of ["local", "session"]) for (const [k, v] of mirror[kind]) out[kind][k] = v;
      if (threadsById.size || order.length) out.local[THREADS] = threadsJson();
      return out;
    }
  };
}

// ---- the page's instance ----------------------------------------------------------------------------------------------------------------------------------------------

const tell = (name, detail = {}) => { try { globalThis.dispatchEvent?.(new CustomEvent(name, { detail })); } catch { /* no window */ } };
const safeStorage = (name) => { try { return globalThis[name]; } catch { return memoryStorage(); } };
export const app = createAppStorage({
  realLocal: safeStorage("localStorage") || memoryStorage(), realSession: safeStorage("sessionStorage") || memoryStorage(),
  onWriteError: (error) => { console.error("vault write failed", error); try { globalThis.dispatchEvent?.(new CustomEvent("plc:vault-write-failed", { detail: { message: String(error?.message || error) } })); } catch { /* no window */ } },
  onChange: () => { try { globalThis.dispatchEvent?.(new CustomEvent("plc:vault-changed")); } catch { /* no window */ } },
  onReadOnly: () => tell("plc:vault-readonly"),
  onBlockedWrite: (key) => tell("plc:format-blocked-write", { key }),
  onRemote: (detail) => tell("plc:vault-remote-change", detail),
  channel: typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("plc-vault") : null // only in a page: in node an open channel would keep the process alive
});
export const appLocal = app.local, appSession = app.session;

/**
 * Only one tab may write to the vault. The first tab holds a Web Lock for as long as it lives; another tab gets { writer: false } and reads only.
 * Without Web Locks the vault is still safe (two writers cannot both store the same seq: the second is refused), so { writer: true, supported: false } is returned.
 */
export function claimWriter({ locks = globalThis.navigator?.locks, name = "plc-vault-writer" } = {}) {
  if (!locks?.request) return Promise.resolve({ writer: true, supported: false, waitUntilFree: () => new Promise(() => {}) });
  return new Promise((resolve) => {
    locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        resolve({ writer: false, supported: true, waitUntilFree: () => new Promise((free) => { locks.request(name, () => { free(); return new Promise(() => {}); }); }) });
        return undefined;
      }
      resolve({ writer: true, supported: true, waitUntilFree: () => new Promise(() => {}) });
      return new Promise(() => {}); // held until this page goes away
    });
  });
}

/**
 * Compare what this browser's stored data says about the versions that wrote it with what this version understands. Keys that hold newer data
 * become read-only (reads work, writes and removals are refused), the record of formats is brought up to date for the rest, and the page is told.
 * The result is kept on globalThis.__plcFormatGuard for the page to show.
 */
export function runFormatGuard({ realLocal = safeStorage("localStorage"), appInfo = globalThis.APP_BUILD } = {}) {
  let storedKeys = [], registry = null;
  try { for (let i = 0; i < realLocal.length; i++) storedKeys.push(realLocal.key(i)); registry = parseRegistry(realLocal.getItem(REGISTRY_KEY)); } catch { /* unreadable storage: nothing to compare */ }
  const found = findNewer({ registry, storedKeys });
  app.setBlocked(found.blocked);
  try {
    const next = stampedRegistry({ current: registry, blocked: found.blocked, app: appInfo ? { version: appInfo.version ?? null, commit: appInfo.commit ?? null } : null });
    if (next) realLocal.setItem(REGISTRY_KEY, next);
  } catch { /* a full or unavailable storage must not stop the page */ }
  const state = { blocked: found.blocked, notes: found.notes, unknown: found.unknown, databases: globalThis.__plcFormatGuard?.databases || [] };
  globalThis.__plcFormatGuard = state;
  if (found.blocked.length) tell("plc:format-guard", state);
  return state;
}

/** A database (the old document store) was written by a newer version: it cannot be opened here. */
export function noteNewerDatabase(name) {
  const state = globalThis.__plcFormatGuard ||= { blocked: [], notes: [], unknown: [], databases: [] };
  if (!state.databases.includes(name)) { state.databases.push(name); tell("plc:format-guard", state); }
}

let booted = null;
/**
 * Run first in every entry point. Resolves { vault: false } when there is no vault, or { vault: true, session } once the person has unlocked it.
 * `ui.unlock({ vault, header, attempt })` must resolve with the unlocked session; it is the unlock screen in the browser and a stub in tests.
 */
export function bootVault({ adapter, ui, realLocal = safeStorage("localStorage") } = {}) {
  return (booted ||= (async () => {
    const result = await bootInner({ adapter, ui, realLocal });
    try { runFormatGuard({ realLocal }); } catch (error) { console.error("format check failed", error); }
    return result;
  })());
}
async function bootInner({ adapter, ui, realLocal }) {
  const marker = (() => { try { return realLocal?.getItem(VAULT_MARKER); } catch { return null; } })();
  if (!marker) return { vault: false };
  const vault = createVault({ adapter: adapter || createIndexedDbAdapter() });
  const header = await vault.readHeader().catch(() => null);
  if (!header) { try { realLocal.removeItem(VAULT_MARKER); } catch { /* ignore */ } tell("plc:vault-missing"); return { vault: false, markerWithoutVault: true }; }
  const screen = ui || (await import("./unlock-screen.mjs")).unlockScreen;
  const session = await screen.unlock({ vault, header, marker: parseMarker(marker) });
  const claim = await claimWriter();
  app.attach(session, { writer: claim.writer });
  if (!claim.writer) claim.waitUntilFree().then(() => tell("plc:vault-writer-free"));
  if (session.damaged?.length) tell("plc:vault-damaged", { count: session.damaged.length });
  return { vault: true, session, writer: claim.writer };
}
export function parseMarker(text) { try { const v = JSON.parse(text); return v && typeof v === "object" ? v : {}; } catch { return {}; } }
/** For tests: forget that the page booted. */
export function resetBootForTests() { booted = null; app.detach(); app.setBlocked([]); try { delete globalThis.__plcFormatGuard; } catch { /* ignore */ } }

// ---- turning the vault on and off --------------------------------------------------------------------------------------------------------------------------------------

const kinds = [["local", "realLocal"], ["session", "realSession"]];

/** Everything the plain storages hold that the vault would take over, { local: {key: json}, session: {...} }. */
export function readPlaintext(realLocal, realSession) {
  const out = { local: {}, session: {} }, real = { local: realLocal, session: realSession };
  for (const [key, info] of Object.entries(KEY_CLASSES)) {
    if (!isVaulted(key)) continue;
    try { const v = real[info.store].getItem(key); if (v != null) out[info.store][key] = v; } catch { /* unreadable: skip */ }
  }
  return out;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Put everything into a new vault and check it by reading it back with the passphrase. Does NOT delete the plaintext (the person is asked after).
 * -> { session, plaintext, documents }. Throws before changing anything the app uses if the check fails.
 */
export async function createAndMigrate({ passphrase, adapter, realLocal, realSession, documents = [], iterations, autoMinutes = 0 }) {
  const vault = createVault({ adapter });
  const plain = readPlaintext(realLocal, realSession);
  const session = await vault.create(passphrase, { iterations });
  try {
    for (const kind of ["local", "session"]) for (const [k, v] of Object.entries(plain[kind])) {
      if (k === THREADS) continue;
      await session.setKv(ns(kind, k), v);
    }
    const threads = (() => { try { const l = JSON.parse(plain.local[THREADS] || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } })();
    for (const t of threads) if (t?.id != null) await session.putThread(String(t.id), t);
    await session.setKv(THREAD_ORDER, JSON.stringify(threads.filter((t) => t?.id != null).map((t) => String(t.id))));
    for (const d of documents) if (!d.temporary) await session.putDoc(d.id, d);
    await session.flush();
    // read it back with the passphrase, as the next visit will, and compare with what was there
    const check = await createVault({ adapter }).unlock(passphrase);
    if (check.damaged.length) throw new VaultError("verify", "The encrypted copy could not be read back completely.");
    for (const kind of ["local", "session"]) for (const [k, v] of Object.entries(plain[kind])) {
      if (k === THREADS) continue;
      if (check.state.kv.get(ns(kind, k)) !== v) throw new VaultError("verify", "The encrypted copy of " + k + " does not match.");
    }
    if (!sameJson(threads.filter((t) => t?.id != null).map((t) => [String(t.id), t]), threads.filter((t) => t?.id != null).map((t) => [String(t.id), check.state.threads.get(String(t.id))]))) throw new VaultError("verify", "The encrypted chats do not match.");
    for (const d of documents) if (!d.temporary && !sameJson(d, check.state.docs.get(d.id))) throw new VaultError("verify", "A document does not match.");
    check.lock();
  } catch (error) {
    session.lock(); await adapter.clear().catch(() => {});
    throw error;
  }
  try { realLocal.setItem(VAULT_MARKER, JSON.stringify({ autoMinutes, createdAt: Date.now() })); } catch { /* the marker is an optimisation */ }
  return { session, plaintext: plain, documents };
}

/** Delete the unencrypted copy the vault replaced (the person confirmed). Returns what was removed. */
export function removePlaintext(realLocal, realSession, { keep = [] } = {}) {
  const real = { local: realLocal, session: realSession }, removed = [];
  for (const [key, info] of Object.entries(KEY_CLASSES)) {
    if (!isVaulted(key) || keep.includes(key)) continue;
    try { if (real[info.store].getItem(key) != null) { real[info.store].removeItem(key); removed.push(key); } } catch { /* ignore */ }
  }
  try { realLocal.removeItem("plc.lock.v1"); } catch { /* ignore */ }
  return removed;
}
export function plaintextRemains(realLocal, realSession) {
  const real = { local: realLocal, session: realSession };
  return Object.entries(KEY_CLASSES).filter(([key, info]) => isVaulted(key) && (() => { try { return real[info.store].getItem(key) != null; } catch { return false; } })()).map(([key]) => key);
}

/** Write everything back to the plain storages (turning the vault off). */
export function restorePlaintext(snapshot, realLocal, realSession) {
  for (const [k, v] of Object.entries(snapshot.local)) realLocal.setItem(k, v);
  for (const [k, v] of Object.entries(snapshot.session)) realSession.setItem(k, v);
}

/** Erase everything this app saved in the browser (the person forgot the passphrase, or chose to start over). Downloaded models are kept. */
export async function eraseEverything({ realLocal = safeStorage("localStorage"), realSession = safeStorage("sessionStorage") } = {}) {
  try { realLocal?.clear(); realSession?.clear(); } catch { /* best effort */ }
  const drop = (name) => new Promise((resolve) => { try { const q = globalThis.indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => resolve(); } catch { resolve(); } });
  await Promise.all([drop("plc-vault"), drop("plc-docs")]);
}
