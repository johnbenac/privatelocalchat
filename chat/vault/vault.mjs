// The vault: everything the person keeps, sealed with AES-256-GCM and appended to a log, readable only with a key that a passphrase (or a passkey) unwraps.
// Pure logic over WebCrypto and a small storage adapter (chat/vault/vault-db.mjs): no DOM, no page globals, so every rule here is tested in node.
// Design and limits: docs/ENCRYPTION-AT-REST-PLAN.md.
//
//   header   one plaintext row: format, and the ways the vault key can be unwrapped (a passphrase, later passkeys). The vault key (DEK) is never stored in the clear.
//   log      records { seq, keyId, iv, data }. data = AES-GCM of one event; the AAD is "plc-vault/1|seq|keyId", so a record cannot be moved, swapped or replayed elsewhere.
//   keys     the DEK seals settings; each chat has its own key ("c:<id>") and each document ("d:<id>"), held (sealed by the DEK) in key.put records. Deleting a chat
//            destroys its key and compaction removes the key record: the chat's old records can no longer be read (crypto-shredding).
//   events   kv.set / kv.del (a setting), thread.put / thread.del, doc.put / doc.del, key.put / key.destroy. State = replay of the log.
//   padding  an event's bytes are rounded up to a bucket (default 1 KB) before sealing, so the length of a short message is not visible.

export const VAULT_FORMAT = "plc-vault/1";
export const DEFAULT_ITERATIONS = 600_000;
export const PAD_BUCKET = 1024;

const enc = new TextEncoder(), dec = new TextDecoder();
const toB64 = (bytes) => { let s = ""; const b = new Uint8Array(bytes); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
export { toB64, fromB64 };

export class VaultError extends Error {
  constructor(code, message, extra = {}) { super(message); this.name = "VaultError"; this.code = code; Object.assign(this, extra); }
}

const KEY_DEK = "dek";
export const chatKeyId = (threadId) => "c:" + threadId;
export const docKeyId = (docId) => "d:" + docId;

const aadFor = (seq, keyId) => enc.encode(`${VAULT_FORMAT}|${seq}|${keyId}`);
const wrapAad = (id) => enc.encode(`${VAULT_FORMAT}|wrap|${id}`);

// ---- padding ----------------------------------------------------------------------------------------------------------------------------------------------------------
/** length (4 bytes) + payload + zeros up to a multiple of `bucket`. */
export function pad(bytes, bucket = PAD_BUCKET) {
  const total = bucket > 0 ? Math.ceil((bytes.length + 4) / bucket) * bucket : bytes.length + 4;
  const out = new Uint8Array(total);
  new DataView(out.buffer).setUint32(0, bytes.length);
  out.set(bytes, 4);
  return out;
}
export function unpad(bytes) {
  if (bytes.length < 4) throw new VaultError("damaged", "A record is too short.");
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
  if (length > bytes.length - 4) throw new VaultError("damaged", "A record's length is wrong.");
  return bytes.subarray(4, 4 + length);
}

// ---- keys -------------------------------------------------------------------------------------------------------------------------------------------------------------
async function passphraseKey(subtle, passphrase, salt, iterations) {
  const material = await subtle.importKey("raw", enc.encode(String(passphrase).normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
const importAes = (subtle, raw) => subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); // not extractable: it cannot be read back out of the page

/** Seal raw key bytes under a wrapping key. */
async function sealBytes(subtle, wrapKey, bytes, aad, random) {
  const iv = random(12);
  return { iv: toB64(iv), data: toB64(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, wrapKey, bytes)) };
}
const openBytes = async (subtle, wrapKey, sealed, aad) => new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromB64(sealed.iv), additionalData: aad }, wrapKey, fromB64(sealed.data)));

// ---- state ------------------------------------------------------------------------------------------------------------------------------------------------------------
export const emptyState = () => ({ kv: new Map(), threads: new Map(), docs: new Map(), keys: new Map() }); // keys: keyId -> raw bytes (the DEK-sealed copies live in the log)

/** The reducer: one event applied to the state. Pure. Unknown events are ignored (a newer app may write more kinds). */
export function applyEvent(state, event) {
  switch (event?.t) {
    case "kv.set": state.kv.set(String(event.k), String(event.v)); break;
    case "kv.del": state.kv.delete(String(event.k)); break;
    case "thread.put": if (event.id != null && event.thread) state.threads.set(String(event.id), event.thread); break;
    case "thread.del": state.threads.delete(String(event.id)); break;
    case "doc.put": if (event.id != null && event.doc) state.docs.set(String(event.id), event.doc); break;
    case "doc.del": state.docs.delete(String(event.id)); break;
    case "key.put": state.keys.set(String(event.id), fromB64(event.raw)); break;
    case "key.destroy": state.keys.delete(String(event.id)); break;
    default: break;
  }
  return state;
}

/** The events that rebuild exactly this state (used by compaction). Keys first, so a replay can read what follows. */
export function eventsFor(state) {
  const out = [];
  for (const [id, raw] of state.keys) out.push({ keyId: KEY_DEK, event: { t: "key.put", id, raw: toB64(raw) } });
  for (const [k, v] of state.kv) out.push({ keyId: KEY_DEK, event: { t: "kv.set", k, v } });
  for (const [id, thread] of state.threads) out.push({ keyId: chatKeyId(id), event: { t: "thread.put", id, thread } });
  for (const [id, doc] of state.docs) out.push({ keyId: docKeyId(id), event: { t: "doc.put", id, doc } });
  return out;
}

// ---- the vault --------------------------------------------------------------------------------------------------------------------------------------------------------
/**
 * createVault({ adapter, crypto, now, bucket }) -> { exists, create, unlock, unlockWithKey }
 * adapter (async): readHeader, writeHeader, readLog, append(record) (rejects if seq exists), replaceLog({ add, removeUpTo }), clear.
 */
export function createVault({ adapter, crypto = globalThis.crypto, now = () => Date.now(), bucket = PAD_BUCKET } = {}) {
  const subtle = crypto.subtle;
  const random = (n) => crypto.getRandomValues(new Uint8Array(n));

  async function exists() { return Boolean(await adapter.readHeader()); }

  async function newPassphraseWrap(dekRaw, passphrase, iterations) {
    const id = "pw-" + toB64(random(6)).replace(/[^A-Za-z0-9]/g, "x");
    const salt = random(16);
    const kek = await passphraseKey(subtle, passphrase, salt, iterations);
    return { id, type: "passphrase", kdf: "PBKDF2-SHA256", iterations, salt: toB64(salt), ...(await sealBytes(subtle, kek, dekRaw, wrapAad(id), random)) };
  }

  /** Create a new vault. Returns an unlocked session. Refuses if one exists. */
  async function create(passphrase, { iterations = DEFAULT_ITERATIONS } = {}) {
    if (!passphrase) throw new VaultError("no-passphrase", "A passphrase is required.");
    if (await exists()) throw new VaultError("exists", "A vault already exists here.");
    const dekRaw = random(32);
    const header = { format: VAULT_FORMAT, createdAt: now(), wraps: [await newPassphraseWrap(dekRaw, passphrase, iterations)] };
    await adapter.writeHeader(header);
    return session(header, dekRaw, emptyState(), 0);
  }

  async function openDek(header, passphrase) {
    for (const wrap of header.wraps || []) {
      if (wrap.type !== "passphrase") continue;
      if (!Number.isInteger(wrap.iterations) || wrap.iterations < 1000 || wrap.iterations > 10_000_000) throw new VaultError("damaged", "The vault header is damaged.");
      try {
        const kek = await passphraseKey(subtle, passphrase, fromB64(wrap.salt), wrap.iterations);
        return await openBytes(subtle, kek, wrap, wrapAad(wrap.id));
      } catch { /* try the next passphrase wrap */ }
    }
    throw new VaultError("bad-passphrase", "That passphrase did not unlock the vault.");
  }

  /** Unlock with the passphrase. Returns a session, with `damaged` listing records that could not be read. */
  async function unlock(passphrase) {
    const header = await adapter.readHeader();
    if (!header) throw new VaultError("no-vault", "There is no vault here.");
    if (header.format !== VAULT_FORMAT) throw new VaultError("format", "This vault was made by a newer version of the app.");
    return unlockWithKey(header, await openDek(header, passphrase));
  }

  /** Unlock when the vault key bytes are already known (a passkey unwrapped them). */
  async function unlockWithKey(header, dekRaw) {
    const log = await adapter.readLog();
    const dek = await importAes(subtle, dekRaw);
    const state = emptyState(), damaged = [];
    let lastSeq = 0, previous = 0;
    const keyOf = async (keyId) => {
      if (keyId === KEY_DEK) return dek;
      const raw = state.keys.get(keyId);
      return raw ? importAes(subtle, raw) : null;
    };
    for (const rec of log) {
      if (previous && rec.seq !== previous + 1) damaged.push({ seq: previous + 1, reason: "missing", through: rec.seq - 1 });
      previous = rec.seq; lastSeq = Math.max(lastSeq, rec.seq);
      const key = await keyOf(rec.keyId);
      if (!key) { damaged.push({ seq: rec.seq, reason: "no-key" }); continue; } // its chat was deleted: this is expected after a destroy, not an error
      try {
        const event = JSON.parse(dec.decode(unpad(new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromB64(rec.iv), additionalData: aadFor(rec.seq, rec.keyId) }, key, fromB64(rec.data))))));
        applyEvent(state, event);
      } catch { damaged.push({ seq: rec.seq, reason: "unreadable" }); }
    }
    const readable = damaged.filter((d) => d.reason !== "no-key");
    const s = session(header, dekRaw, state, lastSeq);
    s.damaged = readable;
    s.destroyedRecords = damaged.length - readable.length;
    return s;
  }

  function session(header, dekRaw, state, lastSeq) {
    let seq = lastSeq, dekPromise = importAes(subtle, dekRaw), locked = false, tail = Promise.resolve();
    const cache = new Map();
    const keyFor = async (keyId) => {
      if (keyId === KEY_DEK) return dekPromise;
      if (!cache.has(keyId)) { const raw = state.keys.get(keyId); if (!raw) throw new VaultError("no-key", "No key for " + keyId); cache.set(keyId, importAes(subtle, raw)); }
      return cache.get(keyId);
    };
    const seal = async (keyId, event, at) => {
      const key = await keyFor(keyId), iv = random(12);
      const body = pad(enc.encode(JSON.stringify(event)), bucket);
      return { seq: at, keyId, iv: toB64(iv), data: toB64(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadFor(at, keyId) }, key, body)) };
    };
    const ensureKey = async (keyId) => {
      if (keyId === KEY_DEK || state.keys.has(keyId)) return;
      const raw = random(32);
      await write({ keyId: KEY_DEK, event: { t: "key.put", id: keyId, raw: toB64(raw) } });
    };
    // writes are strictly ordered: the next seq is taken when the write starts, and applied to the state only once it is stored
    async function write({ keyId, event }) {
      if (locked) throw new VaultError("locked", "The vault is locked.");
      const at = ++seq;
      let record;
      try { record = await seal(keyId, event, at); await adapter.append(record); } catch (error) { seq = at - 1; throw error; }
      applyEvent(state, event);
      return at;
    }
    const enqueue = (fn) => { const run = tail.then(fn); tail = run.catch(() => {}); return run; };

    const api = {
      header, damaged: [], destroyedRecords: 0,
      get state() { return state; },
      get lastSeq() { return seq; },
      get locked() { return locked; },
      /** Append events (each { scope, event }); scope is "dek", or a key id that is created on first use. Resolves when stored. */
      append: (items) => enqueue(async () => { let last = seq; for (const item of [].concat(items)) { await ensureKey(item.scope); last = await write({ keyId: item.scope, event: item.event }); } return last; }),
      setKv: (k, v) => api.append({ scope: KEY_DEK, event: { t: "kv.set", k, v } }),
      delKv: (k) => api.append({ scope: KEY_DEK, event: { t: "kv.del", k } }),
      putThread: (id, thread) => api.append({ scope: chatKeyId(id), event: { t: "thread.put", id, thread } }),
      /** Delete a chat and destroy its key, so its old records are unreadable. */
      delThread: (id) => enqueue(async () => {
        if (state.threads.has(String(id))) await write({ keyId: chatKeyId(id), event: { t: "thread.del", id } });
        if (state.keys.has(chatKeyId(id))) await write({ keyId: KEY_DEK, event: { t: "key.destroy", id: chatKeyId(id) } });
        cache.delete(chatKeyId(id));
      }),
      putDoc: (id, doc) => api.append({ scope: docKeyId(id), event: { t: "doc.put", id, doc } }),
      delDoc: (id) => enqueue(async () => {
        if (state.docs.has(String(id))) await write({ keyId: docKeyId(id), event: { t: "doc.del", id } });
        if (state.keys.has(docKeyId(id))) await write({ keyId: KEY_DEK, event: { t: "key.destroy", id: docKeyId(id) } });
        cache.delete(docKeyId(id));
      }),
      /** Resolves when everything queued so far is stored. */
      flush: () => tail,
      /**
       * Rewrite the live state as fresh records (new seqs), then drop every older record. Superseded writes, deleted chats and destroyed keys disappear.
       * One adapter call, so it is all-or-nothing.
       */
      compact: () => enqueue(async () => {
        const before = seq, add = [];
        for (const item of eventsFor(state)) { const at = ++seq; add.push(await seal(item.keyId, item.event, at)); }
        try { await adapter.replaceLog({ add, removeUpTo: before }); } catch (error) { seq = before; throw error; }
        return { records: add.length, removedUpTo: before };
      }),
      /** Change the passphrase: only the wrapped key changes, no data is re-encrypted. Needs the current passphrase. */
      changePassphrase: async (current, next, { iterations = DEFAULT_ITERATIONS } = {}) => {
        if (!next) throw new VaultError("no-passphrase", "A passphrase is required.");
        const stored = await adapter.readHeader();
        await openDek(stored, current);
        const wraps = (stored.wraps || []).filter((w) => w.type !== "passphrase");
        wraps.unshift(await newPassphraseWrap(dekRaw, next, iterations));
        const updated = { ...stored, wraps };
        await adapter.writeHeader(updated); api.header = updated;
      },
      /** Add another way to unwrap the vault key (a passkey): { id, type, ...sealed } made by chat/vault/passkey.mjs from `dekBytes()`. */
      addWrap: async (wrap) => { const stored = await adapter.readHeader(); const updated = { ...stored, wraps: [...(stored.wraps || []).filter((w) => w.id !== wrap.id), wrap] }; await adapter.writeHeader(updated); api.header = updated; },
      removeWrap: async (id) => {
        const stored = await adapter.readHeader();
        const wraps = (stored.wraps || []).filter((w) => w.id !== id);
        if (!wraps.some((w) => w.type === "passphrase")) throw new VaultError("last-passphrase", "The passphrase cannot be removed.");
        const updated = { ...stored, wraps }; await adapter.writeHeader(updated); api.header = updated;
      },
      /** The raw vault key, for wrapping it under a passkey. Kept off the session object's enumerable properties. */
      dekBytes: () => new Uint8Array(dekRaw),
      lock: () => { locked = true; state.kv.clear(); state.threads.clear(); state.docs.clear(); state.keys.clear(); dekRaw.fill(0); cache.clear(); dekPromise = Promise.reject(new VaultError("locked", "The vault is locked.")); dekPromise.catch(() => {}); }
    };
    return api;
  }

  /** The key a passkey's secret (its PRF output, 32 random-looking bytes) becomes: HKDF-SHA-256, so the secret itself is never used as a key. */
  async function secretKey(secret) {
    const material = await subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
    return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("plc-vault/1 passkey wrap") }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }
  /** A header wrap that lets this secret unlock the vault key. `extra` (credential id, PRF salt, label) is stored beside it, readable and not secret. */
  async function wrapWithSecret(dekRaw, secret, id, extra = {}) {
    return { id, type: "passkey", ...extra, ...(await sealBytes(subtle, await secretKey(secret), dekRaw, wrapAad(id), random)) };
  }
  async function unwrapWithSecret(wrap, secret) {
    try { return await openBytes(subtle, await secretKey(secret), wrap, wrapAad(wrap.id)); } catch { throw new VaultError("bad-key", "That key did not unlock the vault."); }
  }

  /** Remove the vault entirely (the person turned it off, or erased everything). */
  async function destroy() { await adapter.clear(); }

  return { exists, create, unlock, unlockWithKey, wrapWithSecret, unwrapWithSecret, destroy, readHeader: () => adapter.readHeader() };
}
