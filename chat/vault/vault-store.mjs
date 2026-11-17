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

const RECOVERED_KEYS = "meta/recoveredKeys"; // JSON list of keys whose raw copy was reconciled into the vault: a later stale raw copy of one is never copied back
/** The vaulted keys every earlier vault-capable reader (canonical dev 0b0ef275) already migrates itself. For these a raw value that the vault lacks is a stale retained copy, never recovered. */
export const LEGACY_VAULT_KEYS = Object.freeze(["chatThreads", "plc.activeThread.v1", "plc.drafts.v1", "plc.prefs.v1", "plc.folders.v1", "plc.presets.v1", "plc.memory.v1", "plc.modelMemory.v1", "plc.voice.v2", "plc.voice.v1", "plc.inferenceMode.v1", "plc.models.v1", "plc.shell.pins.v1", "chatConfig", "chatModels", "chatEndpointTokens", "plc.draft", "plc.pendingToken.v1"]);

export function createAppStorage({ realLocal, realSession, onWriteError = () => {}, onChange = () => {}, onReadOnly = () => {}, onRemote = () => {}, onBlockedWrite = () => {}, onHeldWrite = () => {}, channel = null } = {}) {
  let session = null;                    // the unlocked vault session, or null (vault off)
  let docsBackend = null;
  const mirror = { local: new Map(), session: new Map() }; // vaulted key -> string (threads are rebuilt from `threadsById`)
  const threadsById = new Map();         // id -> thread object, in order via `order`
  const threadJson = new Map();          // id -> last stored JSON, to find what changed
  let order = [];
  let rememberKeys = true;
  let readOnly = false, readOnlyWarned = false;  // another tab holds the vault's writer lock: this tab reads, and says so when it is asked to write
  let exclusive = false;                 // the writer claim is a REAL Web Lock (claimWriter supported:true). Only then may multi-step migration, cleanup and turning-off run; { writer: true, supported: false } is not authority for them
  let lease = null;                      // the claimWriter handle attached with the session (its live ownership decides `exclusive`)
  let epoch = 0;                      // bumped by every attach and detach: a multi-await action captured (session, epoch) and refuses once either changed, even if the same session is attached again
  let inFlight = null;                   // the one scoped transition (retry, cleanup, turning off) that may run at a time on this page: { kind, promise }
  const memoryOnly = new Set();          // keys not stored at all (API keys when "remember" is off)
  const blocked = new Set();             // keys whose stored data comes from a newer version: still readable, never written or removed (chat/vault/data-formats.mjs)
  const refuse = (key) => { if (!blocked.has(key)) return false; try { onBlockedWrite(key); } catch { /* a listener must not stop the page */ } return true; };
  const held = new Map();                // key -> reason: a raw (unencrypted) value that is the only copy and could not be moved into the vault safely; read as is, never written or removed here
  const heldValue = new Map();           // key -> the raw value seen when it was held (served if another tab removes the raw copy after saving it into the vault)
  let recovery = null;                   // the report of the start-up reconciliation (reconcileRaw)
  const refuseHeld = (key) => { if (!held.has(key)) return false; try { onHeldWrite(key, held.get(key)); } catch { /* a listener must not stop the page */ } return true; };
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
        if (held.has(key)) return real.getItem(key) ?? heldValue.get(key) ?? null; // the sole copy: never answer null for a value that exists
        if (key === THREADS) return (threadsCache ??= threadsJson());
        return mirror[kind].has(key) ? mirror[kind].get(key) : null;
      },
      setItem(key, value) {
        key = String(key); value = String(value);
        if (refuse(key) || (vaulted(key) && refuseHeld(key))) return;
        if (!vaulted(key)) return real.setItem(key, value);
        if (key === THREADS) { setThreads(value); onChange(key); return; }
        mirror[kind].set(key, value);
        if (!memoryOnly.has(key)) schedule("k:" + ns(kind, key), () => session.setKv(ns(kind, key), key === "chatConfig" && !rememberKeys ? withoutToken(value) : value));
        onChange(key);
      },
      removeItem(key) {
        key = String(key);
        if (refuse(key) || (vaulted(key) && refuseHeld(key))) return;
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
        if (!blocked.size && !held.size) { real.clear(); return; }
        const own = []; for (let i = 0; i < real.length; i++) own.push(real.key(i));
        for (const key of own) if (!blocked.has(key) && !held.has(key)) real.removeItem(key); // a sole unencrypted copy is never swept away by a clear
      },
      key(i) { const all = [...this.keys()]; return all[i] ?? null; },
      keys() { const own = session ? [...mirror[kind].keys(), ...(kind === "local" && threadsById.size ? [THREADS] : []), ...(kind === "local" ? [...held.keys()] : [])] : []; const realKeys = []; for (let i = 0; i < real.length; i++) realKeys.push(real.key(i)); return new Set([...realKeys.filter((k) => !vaulted(k)), ...own]); },
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
  function attach(unlocked, { writer = true, lease: given = null } = {}) {
    // `lease` is the exact claimWriter handle of this page. Exclusive authority is read ONLY from that handle's live ownership (a supported, still-owned lock): there is no boolean to pass, so none can go stale
    // or be invented (no handle, a refused claim, no Web Locks: never exclusive).
    epoch++; session = unlocked; readOnly = !writer; lease = given; exclusive = Boolean(writer && given && given.owned === true && given.supported === true); readOnlyWarned = false;
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
  function detach() { epoch++; exclusive = false; lease = null; session = null; docsBackend = null; held.clear(); heldValue.clear(); recovery = null; mirror.local.clear(); mirror.session.clear(); threadsById.clear(); threadJson.clear(); order = []; threadsCache = null; memoryOnly.clear(); }

  return {
    local, session: sessionStore, attach, detach, flush,
    get active() { return Boolean(session); },
    /** Keys whose data a newer version wrote: reads still work, writes and removals are refused. */
    setBlocked(keys) { blocked.clear(); for (const k of keys || []) blocked.add(String(k)); },
    get blocked() { return [...blocked].sort(); },
    /** Raw values kept readable as they are because they could not be moved into the vault safely: [{ key, reason }]. Writes and removals of them are refused. */
    setHeld(entries, values = null) { held.clear(); heldValue.clear(); for (const { key, reason } of entries || []) { held.set(String(key), String(reason)); if (values?.has(key)) heldValue.set(String(key), values.get(key)); } onChange("*"); },
    get held() { return [...held].map(([key, reason]) => ({ key, reason })).sort((a, b) => a.key.localeCompare(b.key)); },
    /** Serve keys that a later recovery moved into the vault (only those not changed on this page since). */
    adopt(keys) { if (!session) return; for (const k of keys || []) { const v = session.state.kv.get(ns("local", k)); if (v !== undefined && !dirty.has("k:" + ns("local", k))) mirror.local.set(String(k), v); } onChange("*"); },
    setRecovery(report) { recovery = report; },
    get recovery() { return recovery; },
    get readOnly() { return readOnly; },
    get exclusive() { return exclusive && !readOnly && lease !== null && lease.owned === true && lease.supported === true; },
    /** The writer-lock handle attached with the session (claimWriter's), or null. Detaching forgets it but never releases it: only the action that owns it releases it (vault-control disable). */
    get lease() { return lease; },
    /** The lifecycle counter: bumped by every attach and detach. A multi-await action that detaches ITSELF notes the value right after its own detach and stops if it ever differs (a replacement attached). */
    get epoch() { return epoch; },
    /** The identity of what is attached now: { session, epoch }. A multi-await action takes one at its start and asks `isCurrent` after every await and before it changes anything. */
    fence() { return { session, epoch }; },
    isCurrent(fence) { return Boolean(fence) && session !== null && fence.session === session && fence.epoch === epoch && !session.locked; },
    /**
     * Run one scoped transition (recovery retry, cleanup, turning the vault off) at a time on this page. A second call of the SAME kind that asks for coalescing shares the running one;
     * anything else is refused as busy (never queued behind it, never interleaved). The vault's append queue orders single records, not these multi-step checks.
     */
    transition(kind, run, { coalesce = false } = {}) {
      if (inFlight) {
        if (coalesce && inFlight.kind === kind) return inFlight.promise;
        return Promise.reject(new VaultError("busy", "Another encryption action is still running (" + inFlight.kind + "). Try again when it has finished."));
      }
      const entry = { kind, promise: null };
      entry.promise = (async () => run({ session, epoch }))().finally(() => { if (inFlight === entry) inFlight = null; });
      inFlight = entry;
      return entry.promise;
    },
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
  onHeldWrite: (key, reason) => tell("plc:vault-held-write", { key, reason }),
  onRemote: (detail) => tell("plc:vault-remote-change", detail),
  channel: typeof window !== "undefined" && typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("plc-vault") : null // only in a page: in node an open channel would keep the process alive
});
export const appLocal = app.local, appSession = app.session;

/**
 * Only one tab may write to the vault. The first tab holds a Web Lock for as long as it lives; another tab gets { writer: false } and reads only.
 * Without Web Locks the vault is still safe (two writers cannot both store the same seq: the second is refused), so { writer: true, supported: false } is returned.
 */
export function claimWriter({ locks = globalThis.navigator?.locks, name = "plc-vault-writer" } = {}) {
  if (!locks?.request) return Promise.resolve({ writer: true, supported: false, owned: false, release: async () => false, stopWaiting() {}, waitUntilFree: () => new Promise(() => {}) }); // no Web Locks: never exclusive, nothing to release
  return new Promise((resolve) => {
    let request;
    request = locks.request(name, { ifAvailable: true }, (lock) => {
      if (!lock) {
        // Refused: another page owns the lock. This handle can only watch. waitUntilFree takes a temporary request that is given up the moment it is granted, and tells
        // only after that request has really finished (the lock is free again): it never keeps the lock and never makes this page a writer.
        const waiting = new Set();
        resolve({
          writer: false, supported: true, owned: false, release: async () => false,
          stopWaiting() { for (const c of waiting) c.abort(); waiting.clear(); },
          waitUntilFree: () => new Promise((free) => {
            const ctrl = new AbortController(); waiting.add(ctrl);
            Promise.resolve(locks.request(name, { signal: ctrl.signal }, () => undefined)).then(() => { waiting.delete(ctrl); free(); }, () => { waiting.delete(ctrl); }); // aborted: no notice
          })
        });
        return undefined;
      }
      // Granted: THIS callback's promise is the hold. Resolving it is the only way the lock ends, and `done` (the request's own completion) says it really ended.
      let end, owned = true, released = null;
      const hold = new Promise((r) => { end = r; });
      const done = () => Promise.resolve(request).catch(() => {});
      resolve({
        writer: true, supported: true,
        get owned() { return owned; },
        /** Give this page's writer lock back. Idempotent; resolves true once for the call that released, after the lock is physically free. It can only end its OWN request. */
        release() { if (released) return released.then(() => false); owned = false; end(); released = done().then(() => true); return released; },
        stopWaiting() {},
        waitUntilFree: () => new Promise(() => {})
      });
      return hold;
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
  const store = adapter || createIndexedDbAdapter();
  const vault = createVault({ adapter: store });
  const header = await vault.readHeader().catch(() => null);
  if (!header) { try { realLocal.removeItem(VAULT_MARKER); } catch { /* ignore */ } tell("plc:vault-missing"); return { vault: false, markerWithoutVault: true }; }
  const screen = ui || (await import("./unlock-screen.mjs")).unlockScreen;
  const session = await screen.unlock({ vault, header, marker: parseMarker(marker) });
  const claim = await claimWriter();
  // Before any feature can read: raw values the vault lacks are moved in (the one writer, read back from storage) or held readable as they are. Never throws.
  const exclusive = Boolean(claim.writer && claim.supported);
  const recovery = await reconcileRaw({ session, adapter: store, realLocal, writer: claim.writer, exclusive });
  app.attach(session, { writer: claim.writer, lease: claim });
  app.setHeld(recovery.held, recovery.heldValues); app.setRecovery(recovery);
  if (!claim.writer) claim.waitUntilFree().then(() => tell("plc:vault-writer-free")); // told after the temporary request is gone; this page stays read-only until it is reloaded
  if (session.damaged?.length) tell("plc:vault-damaged", { count: session.damaged.length });
  if (recovery.recovered.length || recovery.held.length || recovery.conflicts.length || recovery.unreadable.length) tell("plc:vault-recovery", { recovered: recovery.recovered, held: recovery.held.map((h) => ({ ...h })), conflicts: recovery.conflicts.map((c) => c.key), unreadable: recovery.unreadable });
  return { vault: true, session, writer: claim.writer, recovery };
}

// ---- raw values the vault does not hold (the newer-store -> older vault -> newer reader transition; docs/DATA-COMPATIBILITY.md) --------------------------------------

const rawGet = (storage, key) => { try { return storage.getItem(key); } catch { return null; } };
const vaultedKeysOf = (kind) => Object.entries(KEY_CLASSES).filter(([key, info]) => isVaulted(key) && info.store === kind).map(([key]) => key);

/**
 * Compare one raw (unencrypted) value with what the vault holds, `state` being a replay of the vault's STORED records ({ kv, threads }).
 * -> { status: "equal" | "sole" | "conflict" | "unreadable", ... }. equal: the vault holds the same value (a verified duplicate). sole: the vault holds nothing for the key.
 * conflict: the vault holds a different value. unreadable: chatThreads that is not a list of objects with distinct ids (cannot be verified, never removed).
 * Session keys follow the remember-keys policy: with it off, a provider token is not stored, so a blanked copy (or no copy) of it is the expected equal.
 */
export function compareRaw(key, raw, state, { kind = "local", rememberKeys = true } = {}) {
  if (key === THREADS && kind === "local") {
    let list; try { list = JSON.parse(raw); } catch { list = null; }
    if (!Array.isArray(list)) return { status: "unreadable", reason: "not-a-list" };
    const seen = new Set(), missing = [], differ = [];
    for (const t of list) {
      if (!t || typeof t !== "object" || t.id == null) return { status: "unreadable", reason: "no-id" };
      const id = String(t.id);
      if (seen.has(id)) return { status: "unreadable", reason: "duplicate-id" };
      seen.add(id);
      const stored = state.threads.get(id);
      if (!stored) missing.push(id); else if (JSON.stringify(stored) !== JSON.stringify(t)) differ.push(id);
    }
    return { status: differ.length ? "conflict" : missing.length ? "sole" : "equal", missing, differ };
  }
  const stored = state.kv.get(ns(kind, key));
  if (stored === undefined) return kind === "session" && key === "chatEndpointTokens" && !rememberKeys ? { status: "equal", policy: true } : { status: "sole" };
  if (stored === raw) return { status: "equal" };
  if (kind === "session" && key === "chatConfig" && !rememberKeys && stored === withoutToken(raw)) return { status: "equal", policy: true };
  return { status: "conflict" };
}

/** The vault as it is STORED: its log read through the adapter and decrypted with the session's raw key (no passphrase needed, so it works after a passkey unlock). */
export async function readbackState({ adapter, session }) {
  const header = await adapter.readHeader();
  if (!header) throw new VaultError("verify", "The encrypted copy could not be found to check it.");
  const fresh = await createVault({ adapter }).unlockWithKey(header, session.dekBytes());
  const out = { kv: new Map(fresh.state.kv), threads: new Map(fresh.state.threads), damaged: fresh.damaged, history: { observedHistoryComplete: fresh.history.observedHistoryComplete, seenKvKeys: new Set(fresh.history.seenKvKeys) } };
  fresh.lock();
  return out;
}

const recoveredMarker = (kv) => { try { const v = JSON.parse(kv.get(RECOVERED_KEYS) || "[]"); return new Set(Array.isArray(v) ? v.map(String) : []); } catch { return new Set(); } };
const sessionChanged = () => new VaultError("session-changed", "The vault was locked or replaced while this was running, so it was stopped before it changed anything more.");
const noExclusive = (what) => new VaultError("no-exclusive", "This browser cannot guarantee that only this tab is changing the encrypted vault (no Web Locks), so " + what + " is not done here. Your saved data is untouched; use a browser with Web Locks.");

/**
 * Run at start-up, after unlock and the writer claim, before the app is attached or any feature reads (and again from the Security dialog). For every vaulted local key with a raw value,
 * judged against the STORED vault (the log read back and decrypted fresh with the session's raw key; never the in-memory state, never a marker's absence):
 *   equal -> verified duplicate; different -> conflict (both kept, the encrypted one is served);
 *   absent from the vault -> stale when the key is a legacy key, listed in the recovered-keys marker, or named by a kv event in the stored log (it WAS encrypted and was deleted: never copied back);
 *   otherwise only a replay that shows the WHOLE history (observedHistoryComplete: non-empty, from seq 1, contiguous, undamaged) proves "never encrypted", and only then a candidate to copy.
 *   A compacted, empty, gapped or damaged log proves nothing: the key is HELD (history-unproven / vault-damaged), served raw, never written or removed.
 * Copying needs an EXCLUSIVE writer (a real Web Lock). A read-only tab or { writer: true, supported: false } HOLDS candidates too (read-only / no-exclusive-writer).
 * `fence` (optional) answers "is the attached session still the one this started with?"; when it says no the run stops before its next change and throws session-changed.
 * The raw value is never removed here. Never throws except session-changed.
 * -> { writer, exclusive, recovered, verified, conflicts:[{key,ids?,changed?}], retained, stale, held:[{key,reason}], blocked, unreadable, failed:[{key,message}], evidence }
 */
export async function reconcileRaw({ session, adapter, realLocal, writer, exclusive = false, fence = null }) {
  const canWrite = Boolean(writer && exclusive);
  const report = { writer: Boolean(writer), exclusive: canWrite, recovered: [], verified: [], conflicts: [], retained: [], stale: [], held: [], blocked: [], unreadable: [], failed: [], evidence: null };
  Object.defineProperty(report, "heldValues", { value: new Map(), enumerable: false });
  const hold = (key, reason, value) => { if (!report.held.some((h) => h.key === key)) report.held.push({ key, reason }); if (value != null) report.heldValues.set(key, value); };
  const check = () => { if (fence && !fence()) throw sessionChanged(); };
  const guard = fence ? () => fence() === true : undefined; // asked again by the session at the actual append (after its crypto) and by the adapter after its own waits
  const candidates = [];
  try {
    // The raw values are read FIRST and the stored vault second: a value that another tab removes after saving it was in the vault before it left the browser storage, so it is seen in one place or the other.
    const raws = new Map(); for (const key of vaultedKeysOf("local")) { const raw = rawGet(realLocal, key); if (raw != null) raws.set(key, raw); }
    check();
    if (writer) { try { await session.flush(); } catch { /* a failed queued write is reported by the page; the stored log below is what counts */ } }
    let stored = null;
    try { stored = await readbackState({ adapter, session }); } catch { stored = null; }
    check();
    if (stored && !writer) { for (const [k, v] of stored.kv) session.state.kv.set(k, v); for (const [id, t] of stored.threads) session.state.threads.set(id, t); } // a read-only tab may have unlocked before the writer saved something
    let blocked = [];
    try { const keys = []; for (let i = 0; i < realLocal.length; i++) keys.push(realLocal.key(i)); blocked = findNewer({ registry: parseRegistry(realLocal.getItem(REGISTRY_KEY)), storedKeys: keys }).blocked; } catch { /* unreadable storage: nothing to compare */ }
    const history = stored?.history || { observedHistoryComplete: false, seenKvKeys: new Set() };
    report.evidence = { observedHistoryComplete: history.observedHistoryComplete, damaged: stored ? stored.damaged.length : null, readback: Boolean(stored) };
    const marker = stored ? recoveredMarker(stored.kv) : new Set(), rememberKeys = stored ? stored.kv.get(REMEMBER) !== "0" : true;
    const reconciled = new Set(marker);
    for (const key of vaultedKeysOf("local")) {
      const raw = raws.get(key);
      if (raw == null) continue;
      if (!stored) { if (blocked.includes(key)) report.blocked.push(key); if (!LEGACY_VAULT_KEYS.includes(key)) hold(key, "readback-failed", raw); continue; } // nothing can be judged: the raw value is served as it is
      const cmp = compareRaw(key, raw, stored, { kind: "local", rememberKeys });
      if (blocked.includes(key)) { report.blocked.push(key); if (cmp.status === "sole") hold(key, "newer-format", raw); continue; }
      if (cmp.status === "equal") { report.verified.push(key); if (!LEGACY_VAULT_KEYS.includes(key)) reconciled.add(key); }
      else if (cmp.status === "conflict" && LEGACY_VAULT_KEYS.includes(key)) report.retained.push(key); // the normal retained plaintext copy of a store every reader migrates, edited since: kept quietly, listed at cleanup
      else if (cmp.status === "conflict") { report.conflicts.push({ key, ids: cmp.differ }); reconciled.add(key); }
      else if (cmp.status === "unreadable") report.unreadable.push(key);
      else if (LEGACY_VAULT_KEYS.includes(key) || marker.has(key) || history.seenKvKeys.has(ns("local", key))) report.stale.push(key); // it was encrypted once: its absence means it was deleted, so the raw copy is old
      else if (stored.damaged.length) hold(key, "vault-damaged", raw);
      else if (!history.observedHistoryComplete) hold(key, "history-unproven", raw); // compacted / empty / gapped history: absence proves nothing, so it is not copied (it could be a deleted store)
      else if (!writer) hold(key, "read-only", raw);
      else if (!exclusive) hold(key, "no-exclusive-writer", raw);
      else candidates.push({ key, raw });
    }
    const unresolved = new Set(candidates.map((c) => c.key));
    try {
      for (const { key, raw } of candidates) {
        check();
        try { await session.setKv(ns("local", key), raw, { guard }); } catch (error) { if (error?.code === "session-changed") throw error; report.failed.push({ key, message: String(error?.message || error) }); hold(key, "write-failed", raw); unresolved.delete(key); }
      }
      if (unresolved.size) {
        await session.flush();
        check();
        const after = await readbackState({ adapter, session });
        check();
        for (const { key, raw } of candidates) {
          if (!unresolved.has(key)) continue;
          unresolved.delete(key);
          if (after.kv.get(ns("local", key)) !== raw) { report.failed.push({ key, message: "The stored copy did not match." }); hold(key, "readback-mismatch", raw); continue; }
          if (rawGet(realLocal, key) !== raw) { report.conflicts.push({ key, changed: true }); reconciled.add(key); continue; } // the raw value changed while it was being checked: both stay
          report.recovered.push(key); reconciled.add(key);
        }
      }
      if (canWrite && [...reconciled].sort().join("\n") !== [...marker].sort().join("\n") && !stored.damaged.length) {
        check();
        try { await session.setKv(RECOVERED_KEYS, JSON.stringify([...reconciled].sort()), { guard }); await session.flush(); } catch (error) { if (error?.code === "session-changed") throw error; /* the marker only limits later copying; with it missing a deleted key is HELD, not copied */ }
      }
    } catch (error) {
      if (error?.code === "session-changed") throw error;
      for (const key of unresolved) { report.failed.push({ key, message: String(error?.message || error) }); hold(key, "write-failed", candidates.find((c) => c.key === key)?.raw); }
    }
  } catch (error) {
    if (error?.code === "session-changed") throw error;
    for (const { key, raw } of candidates) { report.failed.push({ key, message: String(error?.message || error) }); hold(key, "write-failed", raw); }
  }
  return report;
}

/**
 * What each unencrypted copy is against the STORED vault: [{ key, kind, status, ... }] for every vaulted key that still has a raw value.
 * status: equal (verified copy) | conflict | sole | stale (sole, but legacy, recovered-before or named by the stored history: deleted from the vault, or old) | unreadable | blocked.
 * `damaged` on the array is the number of unreadable stored records: while it is above 0 nothing is called equal-and-removable (see removeVerifiedPlaintext).
 */
export async function inspectPlaintext({ session, adapter, realLocal, realSession }) {
  await session.flush();
  const stored = await readbackState({ adapter, session });
  const rememberKeys = stored.kv.get(REMEMBER) !== "0", marker = recoveredMarker(stored.kv);
  let blocked = [];
  try { const keys = []; for (let i = 0; i < realLocal.length; i++) keys.push(realLocal.key(i)); blocked = findNewer({ registry: parseRegistry(realLocal.getItem(REGISTRY_KEY)), storedKeys: keys }).blocked; } catch { /* nothing to compare */ }
  const out = [];
  Object.defineProperty(out, "damaged", { value: stored.damaged.length, enumerable: false });
  for (const [kind, real] of [["local", realLocal], ["session", realSession]]) for (const key of vaultedKeysOf(kind)) {
    const raw = rawGet(real, key);
    if (raw == null) continue;
    if (blocked.includes(key)) { out.push({ key, kind, status: "blocked", raw }); continue; }
    const cmp = compareRaw(key, raw, stored, { kind, rememberKeys });
    const gone = cmp.status === "sole" && (LEGACY_VAULT_KEYS.includes(key) || marker.has(key) || stored.history.seenKvKeys.has(ns(kind, key)));
    out.push({ key, kind, raw, ...cmp, status: gone ? "stale" : cmp.status });
  }
  return out;
}

const WHY = { sole: "not in the encrypted copy", conflict: "differs from the encrypted copy", unreadable: "cannot be checked", blocked: "written by a newer version", changed: "changed while it was being checked", stale: "not in the encrypted copy", damaged: "the encrypted copy has unreadable parts, so nothing can be verified" };
/**
 * Delete unencrypted copies that the STORED vault holds equal (a verified duplicate), and nothing else; every value is compared again at the moment it is removed, so a copy
 * that changed while the check ran is kept. Needs the exclusive writer (a real Web Lock; read-only and { supported: false } tabs are refused) and, when given, a `fence` that must still hold.
 * With discardDiffering (the person confirmed a SEPARATE question that names what is lost) a copy that differs from the encrypted one is deleted, and so is a copy that exists only unencrypted
 * because it was deleted from the vault or is old: that is the only remaining copy, deleted for good, and is listed in `discarded` (never as a duplicate). A key that was never in the vault,
 * an unreadable list and a newer-format value are never removed. -> { removed: [key], kept: [{ key, reason }], discarded: [{ key, status }] }
 */
export async function removeVerifiedPlaintext({ session, adapter, realLocal, realSession, discardDiffering = false, writer = true, exclusive = false, fence = null }) {
  if (!writer) throw new VaultError("read-only", "This app is open in another tab, so nothing can be removed here.");
  if (!exclusive) throw noExclusive("removing the unencrypted copy");
  if (fence && !fence()) throw sessionChanged();
  const entries = await inspectPlaintext({ session, adapter, realLocal, realSession });
  if (fence && !fence()) throw sessionChanged();
  const real = { local: realLocal, session: realSession }, removed = [], kept = [], discarded = [];
  for (const e of entries) {
    const allowed = !entries.damaged && (e.status === "equal" || (discardDiffering && (e.status === "conflict" || e.status === "stale")));
    if (!allowed) { kept.push({ key: e.key, reason: entries.damaged ? WHY.damaged : WHY[e.status] || "not verified" }); continue; }
    try {
      if (fence && !fence()) throw sessionChanged();
      if (real[e.kind].getItem(e.key) !== e.raw) { kept.push({ key: e.key, reason: WHY.changed }); continue; }
      real[e.kind].removeItem(e.key); removed.push(e.key); if (e.status !== "equal") discarded.push({ key: e.key, status: e.status });
    } catch (error) { if (error?.code === "session-changed") throw error; kept.push({ key: e.key, reason: "could not be removed" }); }
  }
  if (!entries.damaged) { try { realLocal.removeItem("plc.lock.v1"); } catch { /* ignore */ } }
  return { removed, kept, discarded };
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
export async function createAndMigrate({ passphrase, adapter, realLocal, realSession, documents = [], iterations, autoMinutes = 0, guard = undefined }) {
  // `guard` (optional; the action's live lease + inactive-lifecycle check, strict true) is asked where every record is actually written (header, each append) and again before the marker. A stale
  // creator stops there with session-changed; what it had already made durable is not claimed unchanged, and it never clears a vault that may now belong to a replacement.
  const options = guard ? { guard } : undefined, okNow = () => { try { return !guard || guard() === true; } catch { return false; } };
  const vault = createVault({ adapter });
  const plain = readPlaintext(realLocal, realSession);
  const session = await vault.create(passphrase, { iterations, guard });
  try {
    for (const kind of ["local", "session"]) for (const [k, v] of Object.entries(plain[kind])) {
      if (k === THREADS) continue;
      await session.setKv(ns(kind, k), v, options);
    }
    const threads = (() => { try { const l = JSON.parse(plain.local[THREADS] || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } })();
    const newer = Object.keys(plain.local).filter((k) => k !== THREADS && !LEGACY_VAULT_KEYS.includes(k)).sort();
    if (newer.length) await session.setKv(RECOVERED_KEYS, JSON.stringify(newer), options); // these are in the vault now: a stale plaintext copy kept after a later delete is never copied back
    for (const t of threads) if (t?.id != null) await session.putThread(String(t.id), t, options);
    await session.setKv(THREAD_ORDER, JSON.stringify(threads.filter((t) => t?.id != null).map((t) => String(t.id))), options);
    for (const d of documents) if (!d.temporary) await session.putDoc(d.id, d, options);
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
    if (!okNow()) throw new VaultError("session-changed", "The vault enable was interrupted; some setup data may already be saved; the original unencrypted data was kept.");
  } catch (error) {
    session.lock();
    // A failed creator removes its own half-made vault, but only while it is still the rightful creator: a stale one (lifecycle changed, lease gone) leaves what is stored alone.
    if (okNow()) await adapter.clear(options).catch(() => {});
    // vault.create() already committed the header before this block, so a session-changed from a later guarded write is an interruption AFTER durable setup data: say so (the original unencrypted data was never touched).
    if (error?.code === "session-changed") {
      throw new VaultError("session-changed", "The vault enable was interrupted; some setup data may already be saved; the original unencrypted data was kept.");
    }
    throw error;
  }
  if (!okNow()) { session.lock(); throw new VaultError("session-changed", "The vault enable was interrupted; some setup data may already be saved; the original unencrypted data was kept."); }
  try { realLocal.setItem(VAULT_MARKER, JSON.stringify({ autoMinutes, createdAt: Date.now() })); } catch { /* the marker is an optimisation */ }
  return { session, plaintext: plain, documents };
}

/**
 * FAILS CLOSED. This used to delete every vaulted raw key by name without comparing it with the vault, which can destroy the only copy of a value (a newer store an older vault never
 * encrypted, or a deleted store). A synchronous call cannot read the stored vault back, so it removes NOTHING and throws; use removeVerifiedPlaintext (the stored vault is read back,
 * each value is compared again at the moment it is removed, and it needs the exclusive writer) or the vault control's removePlaintext.
 */
export function removePlaintext() {
  throw new VaultError("unverified", "Unencrypted copies are only removed after the stored vault has been read back and compared (removeVerifiedPlaintext). Nothing was removed.");
}
export function plaintextRemains(realLocal, realSession) {
  const real = { local: realLocal, session: realSession };
  return Object.entries(KEY_CLASSES).filter(([key, info]) => isVaulted(key) && (() => { try { return real[info.store].getItem(key) != null; } catch { return false; } })()).map(([key]) => key);
}

/**
 * Write everything back to the plain storages (turning the vault off). Synchronous and all-or-nothing as far as the checks go: before anything is written, every raw value that this would
 * overwrite is compared (now, synchronously). A raw value that differs from what would be written is only replaced when `allow` names that EXACT raw text for the key
 * ({ local: { key: rawSeenAndAccepted }, session: {...} }); anything else (a value that changed since it was checked, a newer-format value, a held sole copy) makes it throw
 * VaultError("conflict") with the keys, and nothing is written. `blocked` keys (newer format) are never overwritten.
 */
export function restorePlaintext(snapshot, realLocal, realSession, { allow = {}, blocked = [] } = {}) {
  const real = { local: realLocal, session: realSession }, clashes = [];
  for (const kind of ["local", "session"]) for (const [k, v] of Object.entries(snapshot[kind])) {
    const now = rawGet(real[kind], k);
    if (now == null || now === v) continue;
    if (kind === "local" && blocked.includes(k)) { clashes.push(k); continue; }
    if (allow[kind]?.[k] !== now) clashes.push(k);
  }
  if (clashes.length) throw new VaultError("conflict", "Some unencrypted values changed or differ from the encrypted ones (" + clashes.join(", ") + "), so nothing was written back and encryption was not turned off.", { keys: clashes });
  for (const [k, v] of Object.entries(snapshot.local)) realLocal.setItem(k, v);
  for (const [k, v] of Object.entries(snapshot.session)) realSession.setItem(k, v);
}

/** Erase everything this app saved in the browser (the person forgot the passphrase, or chose to start over). Downloaded models are kept. */
export async function eraseEverything({ realLocal = safeStorage("localStorage"), realSession = safeStorage("sessionStorage") } = {}) {
  try { realLocal?.clear(); realSession?.clear(); } catch { /* best effort */ }
  const drop = (name) => new Promise((resolve) => { try { const q = globalThis.indexedDB.deleteDatabase(name); q.onsuccess = q.onerror = q.onblocked = () => resolve(); } catch { resolve(); } });
  await Promise.all([drop("plc-vault"), drop("plc-docs")]);
}
