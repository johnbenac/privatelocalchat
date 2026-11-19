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

//   typed    (semantic header 2) one entity per encounter, owned by the chat or standalone encounter it belongs to, sealed under that owner's key (docs/OWNED-CONVERSATION-STORE.md).
//            owned.put / owned.del events; a key.put may carry the owner's `generation`. Only commitChatProjection (P1/P2/P3) and its reconcile write them.

/** The encryption domain: the AAD of every record and wrap. It never changes with the semantic header below. */
export const VAULT_FORMAT = "plc-vault/1";
/** The semantic header format that names typed owned state. Same envelope/AAD domain as VAULT_FORMAT; the IndexedDB schema is unchanged. */
export const SEMANTIC_FORMAT = "plc-vault/2";
const SUPPORTED_FORMATS = new Set([VAULT_FORMAT, SEMANTIC_FORMAT]);
export const INDEX_KEY = "meta/encounters.index.v1"; // the engine's one noncontent index (DEK-sealed kv); never a browser storage key
const ORDER_KEY = "l/chatThreads.order";
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
export const encounterKeyId = (encounterId) => "e:" + encounterId;
/** keys: keyId -> raw bytes (the DEK-sealed copies live in the log). keyRecords: keyId -> the complete key.put event (metadata, generation, unknown fields). keyGenerations: keyId -> generation.
 *  encounters: entityId -> { ownerKeyId, owner, value, extra } (the typed owned entities, kept with the owner that seals them). */
export const emptyState = () => ({ kv: new Map(), threads: new Map(), docs: new Map(), keys: new Map(), keyGenerations: new Map(), keyRecords: new Map(), encounters: new Map() });

const KNOWN_EVENTS = new Set(["kv.set", "kv.del", "thread.put", "thread.del", "doc.put", "doc.del", "key.put", "key.destroy", "owned.put", "owned.del"]); // the types applyEvent understands
const ownedInvalid = (why) => new VaultError("owned-invalid", "A typed record was refused: " + why + ".");
/** The key id that seals an owner ({type:"thread"|"encounter", id}), or null for an owner this version does not know. */
const ownerKeyOf = (owner) => (owner && typeof owner === "object" && typeof owner.id === "string" && owner.id ? (owner.type === "thread" ? chatKeyId(owner.id) : owner.type === "encounter" ? encounterKeyId(owner.id) : null) : null);
const purgeOwned = (state, keyId) => { for (const [id, entity] of state.encounters) if (entity.ownerKeyId === keyId) state.encounters.delete(id); };
function applyOwned(state, event, scope) {
  if (event.kind !== "encounter" || typeof event.id !== "string" || !event.id) throw ownedInvalid("only kind encounter with an id exists");
  const keyId = ownerKeyOf(event.owner);
  if (!keyId || typeof event.owner.generation !== "string" || !event.owner.generation) throw ownedInvalid("the owner is unknown");
  if (scope !== keyId) throw ownedInvalid("the authenticated scope is not the owner's key");
  if (!state.keys.has(keyId) || state.keyGenerations.get(keyId) !== event.owner.generation) throw ownedInvalid("the owner's generation is not live");
  const existing = state.encounters.get(event.id);
  if (existing && existing.ownerKeyId !== keyId) throw ownedInvalid("an existing entity cannot be rebound to another owner");
  if (event.t === "owned.del") { state.encounters.delete(event.id); return; }
  if (!event.value || typeof event.value !== "object" || Array.isArray(event.value)) throw ownedInvalid("the value is not an object");
  const { t, kind, id, owner, value, ...extra } = event; // unknown event fields stay with the record
  state.encounters.set(event.id, { ownerKeyId: keyId, owner, value, extra });
}
/**
 * The reducer: one event applied to the state. `scope` is the AUTHENTICATED key id the record was sealed under (replay passes it): typed events are valid only under their owner's key.
 * Unknown events are ignored here (a newer app may write more kinds); the session records that it saw one and refuses to compact it away.
 */
export function applyEvent(state, event, scope) {
  switch (event?.t) {
    case "kv.set": state.kv.set(String(event.k), String(event.v)); break;
    case "kv.del": state.kv.delete(String(event.k)); break;
    case "thread.put": if (event.id != null && event.thread) state.threads.set(String(event.id), event.thread); break;
    case "thread.del": state.threads.delete(String(event.id)); break;
    case "doc.put": if (event.id != null && event.doc) state.docs.set(String(event.id), event.doc); break;
    case "doc.del": state.docs.delete(String(event.id)); break;
    case "key.put": {
      const id = String(event.id), generation = typeof event.generation === "string" && event.generation ? event.generation : null;
      const had = state.keyGenerations.get(id);
      if (had !== undefined && had !== generation) purgeOwned(state, id); // a replaced key invalidates the generation it carried and everything that generation owned
      state.keys.set(id, fromB64(event.raw)); state.keyRecords.set(id, { ...event });
      if (generation) state.keyGenerations.set(id, generation); else state.keyGenerations.delete(id);
      break;
    }
    case "key.destroy": { const id = String(event.id); state.keys.delete(id); state.keyRecords.delete(id); state.keyGenerations.delete(id); purgeOwned(state, id); break; }
    case "owned.put": case "owned.del": applyOwned(state, event, scope); break;
    default: break;
  }
  return state;
}

/** The events that rebuild exactly this state (used by compaction). Keys first (with their generation and every recorded field), then the rest; owned entities under their owner's key, never DEK. */
export function eventsFor(state) {
  const out = [];
  for (const [id, raw] of state.keys) out.push({ keyId: KEY_DEK, event: { ...(state.keyRecords.get(id) || {}), t: "key.put", id, raw: toB64(raw), ...(state.keyGenerations.has(id) ? { generation: state.keyGenerations.get(id) } : {}) } });
  for (const [k, v] of state.kv) out.push({ keyId: KEY_DEK, event: { t: "kv.set", k, v } });
  for (const [id, thread] of state.threads) out.push({ keyId: chatKeyId(id), event: { t: "thread.put", id, thread } });
  for (const [id, doc] of state.docs) out.push({ keyId: docKeyId(id), event: { t: "doc.put", id, doc } });
  for (const [id, entity] of state.encounters) out.push({ keyId: entity.ownerKeyId, event: { ...entity.extra, t: "owned.put", kind: "encounter", id, owner: entity.owner, value: entity.value } });
  return out;
}

// ---- typed projection helpers (pure) ----------------------------------------------------------------------------------------------------------------------------------
const canon = (value) => JSON.stringify(value, (key, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, v[k]])) : v));
const jclone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const byKey = (a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const MAPS = ["kv", "threads", "docs", "keys", "keyGenerations", "keyRecords", "encounters"];
/** The complete state as text, for exact comparison of what was staged with what a fresh replay of the stored log shows. */
const canonState = (st, { skipIndex = false } = {}) => canon({
  kv: [...st.kv].filter(([k]) => !(skipIndex && k === INDEX_KEY)).sort(byKey), threads: [...st.threads].sort(byKey), docs: [...st.docs].sort(byKey), keys: [...st.keys].map(([k, v]) => [k, toB64(v)]).sort(byKey),
  generations: [...st.keyGenerations].sort(byKey), records: [...st.keyRecords].sort(byKey), encounters: [...st.encounters].sort(byKey)
});
const cloneState = (st) => ({
  kv: new Map(st.kv), threads: new Map([...st.threads].map(([k, v]) => [k, jclone(v)])), docs: new Map([...st.docs].map(([k, v]) => [k, jclone(v)])), keys: new Map([...st.keys].map(([k, v]) => [k, new Uint8Array(v)])),
  keyGenerations: new Map(st.keyGenerations), keyRecords: new Map([...st.keyRecords].map(([k, v]) => [k, jclone(v)])), encounters: new Map([...st.encounters].map(([k, e]) => [k, { ownerKeyId: e.ownerKeyId, owner: jclone(e.owner), value: jclone(e.value), extra: jclone(e.extra) }]))
});
class PlanError extends Error { constructor(reason, message) { super(message || reason); this.reason = reason; } }
const defaultIndex = () => ({ v: 1, logical: { v: 1, rev: 0, epoch: 0 }, revision: "0", entities: [], pending: null, committed: null });
const refsOf = (st) => [...st.encounters].map(([id, e]) => ({ id, owner: { type: e.owner.type, id: e.owner.id, generation: e.owner.generation } })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const isPlain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const VALUE_KEYS = new Set(["format", "encounter", "participants", "events", "holders"]);
/** The engine-side checks of one encounter value (the exact T418 projection): ids, one unambiguous holder split, no payload of another encounter, no unassignable root field. */
function validateValue(id, value, owner) {
  if (!isPlain(value)) throw new PlanError("invalid-plan", "the value of " + id + " is not an object");
  for (const key of Object.keys(value)) if (!VALUE_KEYS.has(key)) throw new PlanError("unsupported-ownership", "the value has a field with no provable owner (" + key + ")");
  if (value.format !== 1 || !isPlain(value.encounter) || String(value.encounter.id) !== id) throw new PlanError("invalid-plan", "the value is not format 1 for " + id);
  // The owner is the entity's own record, never a caller's claim: a local encounter names the chat that holds it, a standalone one is owned by itself and has no chat.
  if (owner.type === "thread" ? value.encounter.thread !== owner.id : (owner.id !== id || value.encounter.thread !== null)) throw new PlanError("invalid-plan", "the owner of " + id + " does not match the encounter record");
  for (const name of ["participants", "events", "holders"]) if (!isPlain(value[name])) throw new PlanError("invalid-plan", name + " must be a map");
  for (const [pid, p] of Object.entries(value.participants)) if (!isPlain(p) || String(p.encounter) !== id) throw new PlanError("invalid-plan", "participant " + pid + " belongs to another encounter");
  for (const [eid, e] of Object.entries(value.events)) if (!isPlain(e) || String(e.encounter) !== id) throw new PlanError("invalid-plan", "event " + eid + " belongs to another encounter");
  for (const [holder, pid] of Object.entries(value.holders)) {
    const parts = holder.split("\u0000");
    if (parts.length !== 2 || parts[0] !== id || !parts[1]) throw new PlanError("invalid-plan", "a holder key does not split into this encounter and one holder");
    if (typeof pid !== "string" || !Object.hasOwn(value.participants, pid)) throw new PlanError("invalid-plan", "a holder names a participant that is not in this encounter");
  }
}
const BASES = new WeakMap(); // frozen base capability -> what it was read from; only the engine can make or read one
const KNOWN_ABORT = new Set(["conflict", "session-changed", "expected-mismatch", "invalid"]); // adapter errors that prove the transaction was refused or aborted

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
  async function create(passphrase, { iterations = DEFAULT_ITERATIONS, guard } = {}) {
    if (!passphrase) throw new VaultError("no-passphrase", "A passphrase is required.");
    if (await exists()) throw new VaultError("exists", "A vault already exists here.");
    const dekRaw = random(32);
    const header = { format: VAULT_FORMAT, createdAt: now(), wraps: [await newPassphraseWrap(dekRaw, passphrase, iterations)] };
    // `guard` (optional, strict true, from the action that started this) is asked by the adapter where the header is actually written, after its own waits: a stale creator writes nothing.
    await (guard === undefined || guard === null ? adapter.writeHeader(header) : adapter.writeHeader(header, { guard }));
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

  const newerFormat = () => new VaultError("format", "This vault was made by a newer version of the app.");
  /** Refuse a format this version does not support: the supplied header AND the header actually stored now (a read failure rejects; nothing is written). */
  const noVault = () => new VaultError("no-vault", "There is no vault here.");
  const requireSupported = (header) => { if (!header) throw noVault(); if (!SUPPORTED_FORMATS.has(header.format)) throw newerFormat(); };
  async function requireSupportedFormat(supplied) {
    requireSupported(supplied);
    requireSupported(await adapter.readHeader());
  }

  /** Unlock with the passphrase. Returns a session, with `damaged` listing records that could not be read. */
  async function unlock(passphrase) {
    const header = await adapter.readHeader();
    if (!header) throw new VaultError("no-vault", "There is no vault here.");
    if (!SUPPORTED_FORMATS.has(header.format)) throw new VaultError("format", "This vault was made by a newer version of the app.");
    return unlockWithKey(header, await openDek(header, passphrase));
  }

  /**
   * Replay one stored header + log (as read) with the vault key: the state, what could not be read, the last seq and what the history shows. Pure over its arguments (no adapter access), so the same
   * raw bytes that a transaction compares are the bytes that were decoded. A typed record is valid only under a semantic-2 header; one that is not valid marks the log unsupported (never compacted away).
   */
  async function replay(header, log, dek) {
    const state = emptyState(), damaged = [];
    // An existing empty log reserves seq 1 so the first later append becomes seq 2, keeping the
    // beginning unproven (the initial empty state was never observed). A fresh CREATE starts at 0
    // so its first append is legitimately seq 1.
    let lastSeq = log.length === 0 ? 1 : 0, previous = 0, firstSeq = null, gap = false;
    const seenKvKeys = new Set();
    let unsupported = false;
    const keyOf = async (keyId) => {
      if (keyId === KEY_DEK) return dek;
      const raw = state.keys.get(keyId);
      return raw ? importAes(subtle, raw) : null;
    };
    for (const rec of log) {
      if (firstSeq === null) firstSeq = rec.seq;
      if (previous && rec.seq !== previous + 1) { gap = true; damaged.push({ seq: previous + 1, reason: "missing", through: rec.seq - 1 }); }
      previous = rec.seq; lastSeq = Math.max(lastSeq, rec.seq);
      const key = await keyOf(rec.keyId);
      // A record with no key (its chat or document was deleted, or its key never existed) is expected after a destroy and is NOT reported as damage, but it was NOT read either: whatever event it
      // carried (any kv event can be appended under any scope) is unknown, so the history is not completely observed. No inference from the scope's name.
      if (!key) { damaged.push({ seq: rec.seq, reason: "no-key" }); gap = true; continue; }
      try {
        const event = JSON.parse(dec.decode(unpad(new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: fromB64(rec.iv), additionalData: aadFor(rec.seq, rec.keyId) }, key, fromB64(rec.data))))));
        if (!KNOWN_EVENTS.has(event?.t)) unsupported = true;
        if ((event?.t === "owned.put" || event?.t === "owned.del") && header.format !== SEMANTIC_FORMAT) throw ownedInvalid("typed records need the semantic header");
        applyEvent(state, event, rec.keyId);
        if (event?.t === "kv.set" || event?.t === "kv.del") seenKvKeys.add(String(event.k));
      } catch (error) { if (error?.code === "owned-invalid") unsupported = true; gap = true; damaged.push({ seq: rec.seq, reason: "unreadable" }); }
    }
    return { state, damaged, lastSeq, firstSeq, gap, unsupported, seenKvKeys, count: log.length };
  }

  /** Unlock when the vault key bytes are already known (a passkey unwrapped them). */
  async function unlockWithKey(header, dekRaw) {
    await requireSupportedFormat(header);
    const log = await adapter.readLog();
    const dek = await importAes(subtle, dekRaw);
    const { state, damaged, lastSeq, firstSeq, gap, unsupported, seenKvKeys } = await replay(header, log, dek);
    // The replay above awaited the adapter: the stored header may have changed meanwhile. Read the ACTUAL current header once more; the session is built right after, with no await between.
    requireSupported(await adapter.readHeader());
    const readable = damaged.filter((d) => d.reason !== "no-key");
    const s = session(header, dekRaw, state, lastSeq, unsupported);
    s.damaged = readable;
    s.destroyedRecords = damaged.length - readable.length;
    // Read-only replay evidence. A key that no kv event of the stored log ever named was never encrypted ONLY when the whole history was observed: a non-empty log that starts at seq 1,
    // is contiguous and in which EVERY record was decoded (no missing seq, no unreadable record, no record without a key). Compaction renumbers the log (it starts after 1), so a compacted,
    // empty, gapped, damaged or partly undecoded log proves nothing about absence.
    s.history = Object.freeze({ observedHistoryComplete: log.length > 0 && firstSeq === 1 && !gap, seenKvKeys });
    return s;
  }

  function session(header, dekRaw, state, lastSeq, sawUnsupported = false) {
    let seq = lastSeq, dekPromise = importAes(subtle, dekRaw), locked = false, tail = Promise.resolve();
    const cache = new Map();
    const keyFor = async (keyId) => {
      if (keyId === KEY_DEK) return dekPromise;
      if (!cache.has(keyId)) { const raw = state.keys.get(keyId); if (!raw) throw new VaultError("no-key", "No key for " + keyId); cache.set(keyId, importAes(subtle, raw)); }
      return cache.get(keyId);
    };
    const sealUsing = async (resolve, keyId, event, at) => {
      const key = await resolve(keyId), iv = random(12);
      const body = pad(enc.encode(JSON.stringify(event)), bucket);
      return { seq: at, keyId, iv: toB64(iv), data: toB64(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aadFor(at, keyId) }, key, body)) };
    };
    const seal = (keyId, event, at) => sealUsing(keyFor, keyId, event, at);
    // ---- typed-state admission (docs/OWNED-CONVERSATION-STORE.md) ----
    // needsReconcile: a typed operation's completion was uncertain, or something durable lost its authority. Until reconcileChatProjection has replayed the stored state under a new live guard
    // NO write, append, compaction or sequence number is used (no blind seq rollback).
    let needsReconcile = false, uncertain = null, authorityLost = false; // authorityLost: a write became durable after its guard stopped authorizing it; the bar reports the same code the guard gives
    const requireAdmission = () => { if (needsReconcile) throw new VaultError(authorityLost ? "session-changed" : "needs-reconcile", "An earlier typed write has not been settled yet. Reconcile it before anything else is written."); };
    const indexOf = (st) => { // -> the parsed noncontent index, or null when none was ever written; an unreadable one is a typed-unreadable refusal
      const raw = st.kv.get(INDEX_KEY);
      if (raw === undefined) return null;
      let v; try { v = JSON.parse(raw); } catch { v = null; }
      const refOk = (r, keys) => r === null || (r && typeof r === "object" && keys.every((k) => typeof r[k] === "string"));
      if (!v || v.v !== 1 || typeof v.revision !== "string" || !Array.isArray(v.entities) || !v.logical || !refOk(v.pending, ["id", "baseRevision"]) || !refOk(v.committed, ["id", "baseRevision", "revision"])) throw new VaultError("typed-unreadable", "The typed index could not be read.");
      return v;
    };
    /** Why the legacy whole-chat routes are held now ("pending" or "typed-encounters"), or null. */
    const typedHoldReason = () => {
      if (state.encounters.size) return "typed-encounters";
      let index; try { index = indexOf(state); } catch { return "typed-encounters"; }
      return index && (index.pending !== null || index.entities.length) ? (index.pending !== null ? "pending" : "typed-encounters") : null;
    };
    const typedHold = () => new VaultError("typed-hold", "Typed encounters exist (or an operation is pending), so this whole-chat change is refused. Use the typed projection.");
    /** Every generic route is checked BEFORE anything is sealed or written. */
    const checkGeneric = (event) => {
      const t = event?.t;
      if (t === "owned.put" || t === "owned.del") throw new VaultError("reserved", "Typed records are written only by the typed projection.");
      if ((t === "kv.set" || t === "kv.del") && String(event.k) === INDEX_KEY) throw new VaultError("reserved", "The typed index is written only by the typed projection.");
      if (!typedHoldReason()) return;
      const owner = t === "key.put" && /^[ce]:/.test(String(event.id));
      if (t === "thread.put" || t === "thread.del" || t === "key.destroy" || owner || ((t === "kv.set" || t === "kv.del") && String(event.k) === ORDER_KEY)) throw typedHold();
    };
    const ensureKey = async (keyId, guard) => {
      if (keyId === KEY_DEK || state.keys.has(keyId)) return;
      const raw = random(32);
      await write({ keyId: KEY_DEK, event: { t: "key.put", id: keyId, raw: toB64(raw) } }, guard);
    };
    // A guard (optional, from the action that started the write) authorizes only by returning exactly true; anything else, or a throw, refuses.
    const authorized = (guard) => { if (guard === undefined || guard === null) return true; try { return guard() === true; } catch { return false; } };
    // writes are strictly ordered: the next seq is taken when the write starts, and applied to the state only once it is stored
    async function write({ keyId, event }, guard) {
      if (locked) throw new VaultError("locked", "The vault is locked.");
      requireAdmission();
      const at = ++seq;
      let record, appending = false;
      try {
        record = await seal(keyId, event, at);
        // The crypto above is awaited: the page may have locked or swapped its session meanwhile. This is the actual append boundary, so check HERE (not only before the crypto, not only after
        // the append): a stale write is never handed to the adapter, and the adapter checks the same guard again after ITS own waits (chat/vault/vault-db.mjs).
        appending = true; if (!authorized(guard)) throw new VaultError("session-changed", "The vault was locked or replaced while this was waiting, so it was not written.");
        if (locked) throw new VaultError("locked", "The vault is locked.");
        await (guard === undefined || guard === null ? adapter.append(record) : adapter.append(record, { guard }));
      } catch (error) {
        // Only a failure that PROVES nothing was stored may give the seq back: a failure before the adapter was called, or an adapter refusal with a known abort code. An unknown completion (a lost
        // reply, a timeout) may have stored the record: the seq stays used and nothing more is written until reconcileChatProjection has replayed the stored state under a live guard.
        if (!appending || KNOWN_ABORT.has(error?.code) || error?.code === "locked") seq = at - 1;
        else {
          // Unknown completion: ask the store. Only a successful read that shows NO record with this seq proves nothing was stored (then the seq is given back); anything else keeps the seq used
          // and bars the next write until reconcileChatProjection has replayed the stored state.
          let proven = false;
          try { const stored = await adapter.readLog(); proven = Array.isArray(stored) && !stored.some((r) => r?.seq >= at); } catch { proven = false; }
          if (proven) seq = at - 1; else needsReconcile = true;
        }
        throw error;
      }
      // The record is durable. If the session was locked while the adapter's completion was pending, lock() already cleared the in-memory state: applying the event now would put plaintext back
      // into a locked session. The same holds for an OBSOLETE session (the guard no longer authorizes: the lifecycle that started this write ended, the session may still be unlocked): its memory
      // is not written to either. The stored record stays (it was legitimate when written), its sequence is reported truthfully (no rollback, no resend), and memory is left as it is.
      if (!KNOWN_EVENTS.has(event?.t)) sawUnsupported = true; // durable, even when the session is locked or obsolete: compaction must not drop it
      if (!locked && !authorized(guard)) { needsReconcile = true; authorityLost = true; } // durable but not in memory: nothing more is written until a verified replay
      if (locked || !authorized(guard)) return at; // durable
      applyEvent(state, event);
      return at;
    }
    const enqueue = (fn) => { const run = tail.then(fn); tail = run.catch(() => {}); return run; };

    // ---- the typed projection: ONE commit (P1, P2, P3) and ONE narrow reconcile, inside the engine queue -----------------------------------------------------------------------
    const rid = () => toB64(random(16)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); // 128 random bits: operation, revision and generation tokens
    const gone = (guard) => locked || !authorized(guard);
    const dekOnly = async (keyId) => { if (keyId !== KEY_DEK) throw new VaultError("no-key", "Only the vault key seals the index."); return dekPromise; };
    const resolverFor = (keys, staged) => { const imported = new Map(); return async (keyId) => { if (keyId === KEY_DEK) return dekPromise; if (!imported.has(keyId)) { const raw = staged.get(keyId) || keys.get(keyId); if (!raw) throw new VaultError("no-key", "No key for " + keyId); imported.set(keyId, importAes(subtle, raw)); } return imported.get(keyId); }; };
    const damagedOf = (snap) => snap.damaged.filter((d) => d.reason !== "no-key");
    /** The stored header and log read once, consistently (the header is read before and after the log), and replayed from exactly those bytes. */
    async function readSnapshot() {
      const first = await adapter.readHeader();
      requireSupported(first);
      const log = await adapter.readLog();
      const second = await adapter.readHeader();
      if (canon(first) !== canon(second)) throw new VaultError("busy", "The stored header changed while it was being read.");
      return { header: first, log, ...(await replay(first, log, await dekPromise)) };
    }
    const makeBase = (snap) => { const base = Object.freeze({}); BASES.set(base, { owner: api, adapter, header: canon(snap.header), log: canon(snap.log) }); return base; };
    /** Replace the live memory with a verified stored snapshot, only while this session is still unlocked and the caller's authority holds. */
    function publish(snap, guard) {
      if (gone(guard)) return false;
      for (const name of MAPS) { state[name].clear(); for (const [k, v] of snap.state[name]) state[name].set(k, v); }
      seq = snap.lastSeq; api.header = snap.header; cache.clear(); if (snap.unsupported) sawUnsupported = true;
      return true;
    }
    async function runProjection(snap, add, nextHeader, guard) {
      try { await adapter.replaceLog({ add, removeUpTo: 0, guard: () => !locked && authorized(guard), expected: { header: snap.header, log: snap.log }, nextHeader }); return { ok: true }; } catch (error) { return { ok: false, known: KNOWN_ABORT.has(error?.code), error }; }
    }
    /** One noncontent index record, appended atomically against the exact snapshot, read back and compared with the complete expected state. -> { ok, snap } | { ok:false, phase, reason } */
    async function writeIndexOnly(snap, nextIndex, guard) {
      const event = { t: "kv.set", k: INDEX_KEY, v: JSON.stringify(nextIndex) };
      let record;
      try { record = await sealUsing(dekOnly, KEY_DEK, event, snap.lastSeq + 1); } catch (error) { return { ok: false, phase: "pre", reason: "seal-failed" }; }
      if (gone(guard)) return { ok: false, phase: "pre", reason: "authority" };
      const ran = await runProjection(snap, [record], snap.header, guard);
      if (!ran.ok) return { ok: false, phase: ran.known ? "known" : "unknown", reason: ran.known ? (ran.error.code === "session-changed" ? "authority" : ran.error.code === "expected-mismatch" ? "stale-base" : "conflict") : "write-unconfirmed" };
      if (gone(guard)) return { ok: false, phase: "unknown", reason: "authority-lost-after-write" };
      let after, index;
      try { after = await readSnapshot(); index = indexOf(after.state); } catch { return { ok: false, phase: "unknown", reason: "readback-failed" }; }
      const expect = cloneState(snap.state); applyEvent(expect, event, KEY_DEK);
      if (!index || canon(index) !== canon(nextIndex) || canonState(after.state) !== canonState(expect) || canon(after.header) !== canon(snap.header) || after.unsupported) return { ok: false, phase: "unknown", reason: "readback-mismatch" };
      if (!publish(after, guard)) return { ok: false, phase: "unknown", reason: "authority-lost-after-write" };
      return { ok: true, snap: after };
    }
    /** The complete, validated result of a plan over a stored state: events in the order they must be sealed, the staged raw keys, and the resulting state. Throws PlanError. */
    function buildPlan(S, target) {
      const bad = (message) => new PlanError("invalid-plan", message);
      if (!isPlain(target)) throw bad("the plan is not an object");
      for (const name of ["threads", "encounters", "standalone"]) if (target[name] !== undefined && !isPlain(target[name])) throw bad(name + " must be an object");
      const th = target.threads || {}, en = target.encounters || {}, sa = target.standalone || {};
      const list = (v, what) => { if (v === undefined) return []; if (!Array.isArray(v)) throw bad(what + " must be a list"); return v; };
      const ids = (v, what) => { const out = list(v, what).map((x) => { if (typeof x !== "string" || !x) throw bad(what + " must hold ids"); return x; }); if (new Set(out).size !== out.length) throw bad("duplicate in " + what); return out; };
      const logical = target.logical;
      if (!isPlain(logical) || logical.v !== 1 || !Number.isInteger(logical.rev) || logical.rev < 0 || !Number.isInteger(logical.epoch) || logical.epoch < 0) throw bad("logical must be {v:1, rev, epoch}");
      const puts = list(th.put, "threads.put"), creates = ids(th.create, "threads.create"), removes = ids(th.remove, "threads.remove");
      const putIds = puts.map((t) => { if (!isPlain(t) || t.id == null) throw bad("a thread has no id"); return String(t.id); });
      if (new Set(putIds).size !== putIds.length) throw bad("duplicate in threads.put");
      const sCreate = ids(sa.create, "standalone.create"), sDestroy = list(sa.destroy, "standalone.destroy");
      const encPuts = list(en.put, "encounters.put"), encRemoves = list(en.remove, "encounters.remove");
      const work = cloneState(S), events = [], staged = new Map();
      const emit = (keyId, event) => { applyEvent(work, event, keyId); events.push({ keyId, event }); };
      const mint = (keyId) => { const raw = random(32); staged.set(keyId, raw); emit(KEY_DEK, { t: "key.put", id: keyId, raw: toB64(raw), generation: rid() }); };
      for (const id of creates) { if (S.threads.has(id) || S.keys.has(chatKeyId(id))) throw bad("thread " + id + " already exists"); if (!putIds.includes(id)) throw bad("a created thread must be put"); }
      for (const id of putIds) if (!creates.includes(id) && !S.threads.has(id)) throw bad("thread " + id + " would be created implicitly");
      for (const id of removes) { if (!S.threads.has(id)) throw bad("thread " + id + " does not exist"); if (putIds.includes(id)) throw bad("thread " + id + " is both put and removed"); }
      for (const id of sCreate) if (S.keys.has(encounterKeyId(id))) throw bad("standalone encounter " + id + " already exists");
      const destroys = sDestroy.map((d) => { if (!isPlain(d) || typeof d.id !== "string" || typeof d.generation !== "string" || S.keyGenerations.get(encounterKeyId(d.id)) !== d.generation) throw bad("a standalone destroy does not name a live generation"); return d.id; });
      if (new Set(destroys).size !== destroys.length || destroys.some((id) => sCreate.includes(id))) throw bad("a standalone encounter is created and destroyed or destroyed twice");
      const finalThreads = new Set([...S.threads.keys(), ...creates].filter((id) => !removes.includes(id)));
      const parsedPuts = encPuts.map((p) => {
        if (!isPlain(p) || typeof p.id !== "string" || !p.id) throw bad("an encounter has no id");
        const keyId = ownerKeyOf(p.owner);
        if (!keyId) throw bad("an encounter names an unknown owner");
        if (p.owner.type === "thread" ? !finalThreads.has(p.owner.id) : !(S.keys.has(keyId) || sCreate.includes(p.owner.id)) || destroys.includes(p.owner.id)) throw bad("the owner of " + p.id + " does not exist in the result");
        validateValue(p.id, p.value, p.owner);
        return { id: p.id, owner: p.owner, keyId, value: p.value };
      });
      for (const id of sCreate) if (!parsedPuts.some((p) => p.owner.type === "encounter" && p.owner.id === id && p.id === id)) throw bad("standalone encounter " + id + " is created without its first entity");
      const putEncIds = parsedPuts.map((p) => p.id), removeEncIds = encRemoves.map((r) => (isPlain(r) ? r.id : null));
      if (new Set(putEncIds).size !== putEncIds.length || new Set(removeEncIds).size !== removeEncIds.length || putEncIds.some((id) => removeEncIds.includes(id))) throw bad("duplicate or conflicting encounter ids");
      // 1. new owners: a fresh raw key and generation, created here and nowhere else
      for (const id of creates) mint(chatKeyId(id));
      for (const id of sCreate) mint(encounterKeyId(id));
      // 2. an existing legacy owner (no generation) gets one by reissuing the SAME raw bytes and metadata; an absent owner is never recreated
      for (const keyId of new Set(parsedPuts.map((p) => p.keyId))) {
        if (!work.keys.has(keyId)) throw bad("owner key " + keyId + " does not exist");
        if (!work.keyGenerations.has(keyId)) emit(KEY_DEK, { ...(work.keyRecords.get(keyId) || {}), t: "key.put", id: keyId, raw: toB64(work.keys.get(keyId)), generation: rid() });
      }
      for (const t of puts) emit(chatKeyId(String(t.id)), { t: "thread.put", id: String(t.id), thread: t });
      for (const r of encRemoves) {
        const entity = isPlain(r) ? work.encounters.get(r.id) : null;
        if (!entity || ownerKeyOf(r.owner) !== entity.ownerKeyId) throw bad("a removed encounter is not owned as named");
        const keyId = entity.ownerKeyId;
        const observed = S.keys.has(keyId) ? (S.keyGenerations.get(keyId) ?? null) : undefined;
        if (Object.hasOwn(r.owner, "generation")) {
          if (observed === undefined || r.owner.generation !== observed) throw bad("the owner generation of " + r.id + " is not the one observed");
        }
        emit(keyId, { t: "owned.del", kind: "encounter", id: r.id, owner: { type: entity.owner.type, id: entity.owner.id, generation: entity.owner.generation } });
      }
      for (const p of parsedPuts) {
        const live = work.keyGenerations.get(p.keyId);
        // A supplied generation (null included) must be exactly what the base observed for an EXISTING owner: a string is the live generation, null means only "a live legacy key without one". It is never
        // a way to ask for creation or to skip the fence of an owner that already has a generation; a new owner's generation is the engine's, so none may be named for it.
        if (Object.hasOwn(p.owner, "generation")) {
          const observed = S.keys.has(p.keyId) ? (S.keyGenerations.get(p.keyId) ?? null) : undefined;
          if (observed === undefined || p.owner.generation !== observed) throw bad("the owner generation of " + p.id + " is not the one observed");
        }
        const existing = work.encounters.get(p.id);
        if (existing && existing.ownerKeyId !== p.keyId) throw bad("an existing entity cannot be rebound to another owner");
        emit(p.keyId, { t: "owned.put", kind: "encounter", id: p.id, owner: { type: p.owner.type, id: p.owner.id, generation: live }, value: p.value });
      }
      // 3. removals: the thread record, then its key (which purges whatever it owned); standalone owners are destroyed by key alone
      for (const id of removes) { emit(chatKeyId(id), { t: "thread.del", id }); if (work.keys.has(chatKeyId(id))) emit(KEY_DEK, { t: "key.destroy", id: chatKeyId(id) }); }
      for (const id of destroys) emit(KEY_DEK, { t: "key.destroy", id: encounterKeyId(id) });
      // 4. order: complete over the resulting threads, required whenever the set changed
      const finalIds = [...work.threads.keys()];
      if (th.order !== undefined) {
        const order = ids(th.order, "threads.order");
        if (order.length !== finalIds.length || order.some((id) => !work.threads.has(id))) throw bad("the order must list exactly the threads that remain");
        emit(KEY_DEK, { t: "kv.set", k: ORDER_KEY, v: JSON.stringify(order) });
      } else if (creates.length || removes.length) throw bad("an order is required when threads are created or removed");
      for (const [id, e] of work.encounters) if (e.owner.type === "thread" && !work.threads.has(e.owner.id)) throw bad("the owner thread of " + id + " does not exist");
      return { events, staged, work };
    }

    async function doCommit(baseRef, target, guard) {
      const P = rid();
      const done = (status, extra = {}) => ({ status, id: P, operationId: typeof target?.operationId === "string" ? target.operationId : null, ...extra });
      const refuse = (reason, message) => done("not-written", { reason, ...(message ? { message } : {}) });
      const unresolved = (status, reason, extra = {}) => { needsReconcile = true; return done(status, { reason, ...extra }); };
      let wrote = false;
      try {
        if (locked) return refuse("locked");
        if (!authorized(guard)) return refuse("authority");
        if (needsReconcile) return refuse("needs-reconcile");
        if (adapter.atomicProjection !== true) return refuse("no-atomic-adapter"); // no sequential fallback: nothing is written
        const meta = BASES.get(baseRef);
        if (!meta || meta.owner !== api || meta.adapter !== adapter) return refuse("bad-base");
        let snap;
        try { snap = await readSnapshot(); } catch (error) { return refuse("unreadable", String(error?.message || error)); }
        if (gone(guard)) return refuse("authority");
        if (canon(snap.header) !== meta.header || canon(snap.log) !== meta.log) return refuse("stale-base");
        if (snap.unsupported || damagedOf(snap).length) return refuse("typed-unreadable");
        let index;
        try { index = indexOf(snap.state); } catch { return refuse("typed-unreadable"); }
        const current = index || defaultIndex();
        if (current.pending) return refuse("pending");
        try { buildPlan(snap.state, target); } catch (error) { return refuse(error instanceof PlanError ? error.reason : "invalid-plan", String(error?.message || error)); }
        // ---- P1: only the noncontent pending marker; the header, the payload and the last committed receipt are unchanged
        const X = current.revision, idx1 = { ...current, pending: { id: P, baseRevision: X } };
        uncertain = { id: P, baseRevision: X }; wrote = true;
        const p1 = await writeIndexOnly(snap, idx1, guard);
        if (!p1.ok) {
          if (p1.phase !== "unknown") { uncertain = null; wrote = false; return refuse(p1.reason); }
          return unresolved("unknown", "p1-" + p1.reason);
        }
        const s1 = p1.snap;
        // ---- P2: everything in ONE header+log transaction (key lifecycle, threads, owned values, order, index revision Y + committed receipt, semantic header)
        let built;
        try { built = buildPlan(s1.state, target); } catch (error) { return unresolved("not-committed", "invalid-plan", { pending: true, message: String(error?.message || error) }); }
        const Y = rid();
        const idx2 = { v: 1, logical: { v: 1, rev: target.logical.rev, epoch: target.logical.epoch }, revision: Y, entities: refsOf(built.work), pending: idx1.pending, committed: { id: P, baseRevision: X, revision: Y } };
        const indexEvent = { t: "kv.set", k: INDEX_KEY, v: JSON.stringify(idx2) };
        applyEvent(built.work, indexEvent, KEY_DEK);
        const resolve = resolverFor(s1.state.keys, built.staged), add = [];
        try { let at = s1.lastSeq; for (const item of [...built.events, { keyId: KEY_DEK, event: indexEvent }]) add.push(await sealUsing(resolve, item.keyId, item.event, ++at)); } catch { return unresolved("not-committed", "seal-failed", { pending: true }); }
        if (gone(guard)) return unresolved("not-committed", "authority", { pending: true });
        const p2 = await runProjection(s1, add, { ...s1.header, format: SEMANTIC_FORMAT }, guard);
        if (!p2.ok) return unresolved(p2.known ? "not-committed" : "unknown", p2.known ? "p2-aborted" : "p2-unconfirmed", { pending: true });
        if (gone(guard)) return unresolved("unknown", "authority-lost-after-p2", { revision: Y });
        let s2;
        try { s2 = await readSnapshot(); } catch { return unresolved("unknown", "p2-readback-failed", { revision: Y }); }
        if (s2.header.format !== SEMANTIC_FORMAT || s2.unsupported || damagedOf(s2).length || canonState(s2.state) !== canonState(built.work)) return unresolved("unknown", "p2-readback-mismatch", { revision: Y });
        if (!publish(s2, guard)) return unresolved("unknown", "authority-lost-after-p2", { revision: Y });
        // ---- P3: clear ONLY this pending, after the exact pending(P,X) + committed(P,X,Y) + revision Y are seen in the snapshot the write is compared against
        const p3 = await writeIndexOnly(s2, { ...idx2, pending: null }, guard);
        if (!p3.ok) return unresolved(p3.phase === "unknown" ? "unknown" : "unsettled", "p3-" + p3.reason, { revision: Y });
        uncertain = null;
        return done("committed", { revision: Y, base: makeBase(p3.snap) });
      } catch (error) {
        if (!wrote) return refuse("internal", String(error?.message || error));
        return unresolved("unknown", "internal", { message: String(error?.message || error) });
      }
    }

    const projectionConsistent = (st, index) => canon(refsOf(st)) === canon(index.entities) && [...st.encounters.values()].every((e) => e.owner.type !== "thread" || st.threads.has(e.owner.id));
    async function doReconcile(guard) {
      if (locked) throw new VaultError("locked", "The vault is locked.");
      const out = (status, extra = {}) => ({ status, ...extra });
      if (!authorized(guard)) return out("refused", { reason: "authority" });
      let snap, index;
      try { snap = await readSnapshot(); } catch { return out("unresolved", { reason: "unreadable" }); }
      if (gone(guard)) return out("refused", { reason: "authority" });
      if (snap.unsupported || damagedOf(snap).length) return out("unresolved", { reason: "typed-unreadable" });
      try { index = indexOf(snap.state); } catch { return out("unresolved", { reason: "typed-unreadable" }); }
      const settled = (s) => { if (!publish(s, guard)) return false; needsReconcile = false; authorityLost = false; uncertain = null; return true; };
      if (!index || !index.pending) {
        const revision = index ? index.revision : "0";
        if (uncertain && index && index.committed && index.committed.id === uncertain.id) { const id = uncertain.id; return settled(snap) ? out("committed", { id, revision: index.committed.revision, base: makeBase(snap) }) : out("refused", { reason: "authority" }); }
        if (uncertain && revision !== uncertain.baseRevision) return out("unresolved", { reason: "superseded", id: uncertain.id });
        const id = uncertain?.id ?? null, was = Boolean(uncertain);
        return settled(snap) ? out(was ? "abandoned" : "clean", { id, committed: index ? index.committed : null }) : out("refused", { reason: "authority" });
      }
      const { id: P, baseRevision: X } = index.pending, c = index.committed;
      if (uncertain && uncertain.id !== P) return out("unresolved", { reason: "foreign-pending", id: P });
      if (c && c.id === P && c.baseRevision === X && index.revision === c.revision && projectionConsistent(snap.state, index)) {
        const done = await writeIndexOnly(snap, { ...index, pending: null }, guard);
        if (!done.ok) return out("unresolved", { reason: "p3-" + done.reason, id: P });
        return settled(done.snap) ? out("committed", { id: P, revision: c.revision, base: makeBase(done.snap) }) : out("refused", { reason: "authority" });
      }
      if (!(c && c.id === P) && index.revision === X && projectionConsistent(snap.state, index)) { // P1 only: the payload is the one revision X describes and no P2 exists
        const done = await writeIndexOnly(snap, { ...index, pending: null }, guard);
        if (!done.ok) return out("unresolved", { reason: "abandon-" + done.reason, id: P });
        return settled(done.snap) ? out("abandoned", { id: P }) : out("refused", { reason: "authority" });
      }
      return out("unresolved", { reason: "ambiguous", id: P });
    }
    function doRead(guard) {
      return enqueue(async () => {
        const lost = () => new VaultError("session-changed", "The vault was locked or replaced while this was waiting.");
        if (locked) throw new VaultError("locked", "The vault is locked.");
        if (!authorized(guard)) throw lost();
        const snap = await readSnapshot();
        if (gone(guard)) throw lost();
        if (snap.unsupported || damagedOf(snap).length) throw new VaultError("typed-unreadable", "The stored vault holds records this version cannot read completely.");
        const index = indexOf(snap.state) || defaultIndex(), st = snap.state;
        let stored; try { const v = JSON.parse(st.kv.get(ORDER_KEY) ?? "[]"); stored = Array.isArray(v) ? v.map(String) : []; } catch { stored = []; }
        const first = new Set(stored.filter((id) => st.threads.has(id))), order = [...first, ...[...st.threads.keys()].filter((id) => !first.has(id))];
        const owners = [...st.keys.keys()].filter((id) => /^[ce]:/.test(id)).map((id) => ({ type: id[0] === "c" ? "thread" : "encounter", id: id.slice(2), generation: st.keyGenerations.get(id) ?? null })); // null: a live legacy key, meaningful only inside this base
        return { threads: order.map((id) => jclone(st.threads.get(id))), order, owners, encounters: refsOf(st).map((r) => ({ ...r, value: jclone(st.encounters.get(r.id).value) })), index: jclone(index), base: makeBase(snap) };
      });
    }

    const api = {
      header, damaged: [], destroyedRecords: 0,
      history: Object.freeze({ observedHistoryComplete: false, seenKvKeys: new Set() }), // replaced by unlockWithKey with what the stored log showed
      get state() { return state; },
      get lastSeq() { return seq; },
      get locked() { return locked; },
      /**
       * Append events (each { scope, event }); scope is "dek", or a key id that is created on first use. Resolves when stored.
       * options.guard (optional, () => true to proceed) is the lifecycle check of a multi-step action: it is asked when each record is actually about to be appended (after its crypto) and the
       * write fails with code "session-changed" without being stored when it does not return exactly true.
       */
      append: (items, options) => { const guard = options?.guard; return enqueue(async () => { const list = [].concat(items); for (const item of list) checkGeneric(item.event); requireAdmission(); let last = seq; for (const item of list) { await ensureKey(item.scope, guard); last = await write({ keyId: item.scope, event: item.event }, guard); } return last; }); },
      setKv: (k, v, options) => api.append({ scope: KEY_DEK, event: { t: "kv.set", k, v } }, options),
      delKv: (k, options) => api.append({ scope: KEY_DEK, event: { t: "kv.del", k } }, options),
      putThread: (id, thread, options) => api.append({ scope: chatKeyId(id), event: { t: "thread.put", id, thread } }, options),
      /** Delete a chat and destroy its key, so its old records are unreadable. */
      delThread: (id, options) => {
        const guard = options?.guard;
        return enqueue(async () => {
          if (typedHoldReason()) throw typedHold(); // before any record: a typed owner is deleted only through the typed projection
          requireAdmission();
          if (state.threads.has(String(id))) await write({ keyId: chatKeyId(id), event: { t: "thread.del", id } }, guard);
          if (state.keys.has(chatKeyId(id))) await write({ keyId: KEY_DEK, event: { t: "key.destroy", id: chatKeyId(id) } }, guard);
          cache.delete(chatKeyId(id));
        });
      },
      putDoc: (id, doc, options) => api.append({ scope: docKeyId(id), event: { t: "doc.put", id, doc } }, options),
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
      // `guard` (optional, strict true, from the action that started this) is asked when compaction starts, again at the boundary where the log is replaced, and by the adapter where it
      // is actually replaced. A locked session, or one whose authority has gone, never rewrites the log: it would replace the stored records with whatever that session holds in memory
      // (nothing after a lock), and every record, typed ones included, would be lost.
      compact: ({ guard } = {}) => enqueue(async () => {
        if (locked) throw new VaultError("locked", "The vault is locked.");
        if (!authorized(guard)) throw new VaultError("session-changed", "The vault was locked or replaced while this was waiting, so it was not compacted.");
        // Refused before any record is sealed or replaced: a decoded event this version cannot apply would be dropped, and the stored header may be newer than the supplied one.
        if (sawUnsupported) throw new VaultError("unsupported-event", "This vault holds data written by a newer version of the app, so it was not compacted.");
        requireAdmission();
        await requireSupportedFormat(api.header);
        // A pending typed operation is not compacted: nothing here proves a rewrite preserves its phase, so the pending record is refused, never dropped or finished by accident.
        { let index; try { index = indexOf(state); } catch { throw new VaultError("typed-unreadable", "The typed index could not be read, so nothing was compacted."); } if (index && index.pending !== null) throw new VaultError("typed-hold", "A typed operation is pending, so the vault was not compacted."); }
        const before = seq, add = [];
        try {
          for (const item of eventsFor(state)) { const at = ++seq; add.push(await seal(item.keyId, item.event, at)); }
          // The crypto above is awaited: the page may have locked or replaced this session meanwhile. This is the boundary where the stored log is replaced, so check HERE.
          if (locked) throw new VaultError("locked", "The vault is locked.");
          if (!authorized(guard)) throw new VaultError("session-changed", "The vault was locked or replaced while this was waiting, so it was not compacted.");
        } catch (error) { seq = before; throw error; }   // nothing was handed to the adapter: the sequence numbers are given back
        try { await adapter.replaceLog({ add, removeUpTo: before, guard: () => !locked && authorized(guard) }); } catch (error) { seq = before; throw error; }
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
      /**
       * readChatProjection({ guard }) -> { threads, order, owners, encounters, index, base }: the stored typed projection, freshly read and cloned (never aliasing live state), with a frozen
       * engine-private base bound to this session, adapter and the exact stored header and log. `owners[].generation` is null only for a live legacy key, and only means something inside this base.
       */
      readChatProjection: (options) => doRead(options?.guard),
      /**
       * commitChatProjection(plan, { guard }) -> receipt. Owns P1, P2 and P3 inside the engine queue. The guard and the JSON plan are captured HERE, before the queue; the base keeps its identity.
       * plan: { base, operationId, threads:{put,create,remove,order}, encounters:{put:[{id,owner:{type,id},value}],remove:[{id,owner}]}, standalone:{create:[E],destroy:[{id,generation}]}, logical:{v:1,rev,epoch} }.
       * -> { status: "committed", id, revision, base } only for a verified, settled result under current authority; "not-written" (reason) before any record; "not-committed" (P1 only, pending kept),
       * "unsettled" (P2 durable, P3 not) and "unknown" otherwise: the session then needs reconcileChatProjection before anything else is written.
       */
      commitChatProjection: (plan, options) => {
        const guard = options?.guard; // captured now, before the queue
        let baseRef, target;
        try { baseRef = plan?.base; target = JSON.parse(JSON.stringify({ ...plan, base: undefined })); } catch { return Promise.resolve({ status: "not-written", reason: "invalid-plan", id: null, operationId: null }); }
        return enqueue(() => doCommit(baseRef, target, guard));
      },
      /** reconcileChatProjection({ guard }): the one narrow recovery of an uncertain or pending typed operation, from the stored header and log under this live authority. No caller receipt. */
      reconcileChatProjection: (options) => { const guard = options?.guard; return enqueue(() => doReconcile(guard)); },
      get needsReconcile() { return needsReconcile; },
      /** Why legacy whole-chat writes are held right now ("typed-encounters" | "pending"), or null. Read from the live state. */
      get typedHold() { return locked ? null : typedHoldReason(); },
      lock: () => { locked = true; state.kv.clear(); state.threads.clear(); state.docs.clear(); state.keys.clear(); state.keyGenerations.clear(); state.keyRecords.clear(); state.encounters.clear(); dekRaw.fill(0); cache.clear(); dekPromise = Promise.reject(new VaultError("locked", "The vault is locked.")); dekPromise.catch(() => {}); }
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
