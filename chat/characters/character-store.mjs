// The one place admitted rich characters are changed. Board task T222, phase B: the conflict-safe store.
//
// What is stored is a record per admitted character: the exact verified package transport (the bundle envelope with its record manifest, asset byte
// manifest, content, definitions and receipts, and the verified bytes of every resource), the structured capabilities derived from it, and ONE local
// individual reference made here. Nothing is a prompt appended text: lore, guidance, prepared, presentation, media and evidence stay structured for
// the tasks that own them (T429/T442/T455/T444/T456/T428). Admission is NOT runtime readiness, a conversation participant or a continuation.
//
// Every real change (admit a new character, update a chosen one, copy one, remove one) is
//   take the Web Lock "plc-characters" -> read the stored state afresh -> apply a SYNCHRONOUS change -> write -> read back to check -> release.
// Asynchronous work (the producer's validation, the final byte re-verification) happens BEFORE the lock, on a private preparation this module made itself;
// what is decided INSIDE the lock is only what the fresh stored state says: does the chosen record still exist at the version the person chose, was this
// admission already applied, do the limits hold. WITHOUT Web Locks, in a read-only tab, or when the lock cannot be had within `waitMs` NOTHING is written (no
// unlocked, busy-ignoring or "held lock" fallback). A write is read back; if what is there is not what was written the outcome is a failure and NOTHING IS
// PUT BACK (a restore could erase another writer's newer, successful write). Stored text that cannot be read, is malformed, or comes from a newer format is
// never overwritten, and a refused or failed change leaves the previous valid store exactly as it was.
//
// Identity (docs/CHARACTER-STORE.md): a fresh admission and an explicit copy each make a NEW opaque local `individual:<crypto uuid>`, drawn from the injected
// crypto, independent of the package's design, revision, hash, source ids, preset id or name. An update names ONE existing local record (individualId plus the
// recordVersion the person was looking at) and keeps its individualId; it is never selected by anything the package claims. The same package admitted twice is two
// characters (an explicit choice each time), never a merge.
//
// Idempotency: prepare() makes a single-use admission with a random id that is stored on the record it creates or changes. Committing the same preparation again
// (a double click, a retry after a crash that may have written) finds that id in the stored records and reports `already-admitted` / `already-applied` without
// writing. A NEW preparation of the same package is a new, deliberate admission.
//
// Durable receipts (persistent stores): the store is given `runWriteScope(fn, { guard })` (`guard` is the caller's own predicate: true while its fence and lifecycle still hold). Every change enters it BEFORE the "plc-characters" lock; `fn(mode)` gets
// mode.readDurable(keys) -> { key: raw|null } (a FRESH read of the authoritative stored value) and mode.putKV(key, expectedRaw, nextRaw, { operationId }) -> receipt
// { status: 'committed' | 'not-written' | 'unknown', observed }. The next bytes are computed from that fresh raw, and a change is acknowledged ONLY by a committed receipt
// whose observed value is exactly what was sent. Anything else after a possible write is `unconfirmed`: not a success, never "nothing was changed", and the same preparation
// (same admission id) is reconciled against the durable admissions on retry. Without the capability a persistent store refuses every change (`no-durable-scope`): there is
// no fallback to storage.setItem and no flush substitute. Reading (list/get/open/ready) still uses `storage.getItem`.
//
// Temporary chats: createTemporaryCharacterStore() backs the same code with memory only (no browser storage of any kind, and not the vault) and is
// bound to a session `scope`; a scope that changed between prepare and commit refuses with `scope-changed`.
//
// createCharacterStore({ storage, key, locks?, runWriteScope?, isReadOnly?, crypto?, now?, scope?, lockName?, waitMs? })
//   -> { read, ready, list, get, open, prepare, commit, remove }
//   commit(preparation, { fence? }) and remove(target, { fence? }): `fence()` returns true when the caller's own session (UI lifecycle epoch, normal or temporary session, vault state)
//   is no longer the one the action began in. It is asked before the work, after the asynchronous validation AND INSIDE the lock, in the same synchronous step as the stored-state
//   check, so an action that waited for the lock across a lock/unlock or a session change refuses with `scope-changed` and writes nothing. It throws or returns true => refused.
//   outcome: { ok: true, ... } | { ok: false, code, message }
//   code: unsupported | read-only | busy | unreadable | malformed | newer | too-large | write-failed | write-refused | changed | stale | gone | scope-changed |
//         unknown-preparation | verification-failed | crypto-unavailable | id-collision | purpose | target | no-package | no-durable-scope | unconfirmed

import { reviewCharacterPackageFile, reviewCharacterPackageFragment, reopenCharacterSource, decodeBytes, checkSourceBounds } from './character-package.mjs';

// The storage key is NOT named here: the page that wires this store owns, classifies and passes it (key-classes, inventory, format snapshot), docs/CHARACTER-STORE.md.
export const CHARACTER_STORE_FORMAT = 1;
export const CHARACTER_LOCK_NAME = 'plc-characters';
export const CHARACTER_STORE_LIMITS = Object.freeze({ records: 64, recordChars: 2_500_000, storeChars: 4_000_000, admissionsKept: 16 });

const fail = (code, message, extra) => ({ ok: false, code, message, ...(extra || {}) });
const MESSAGES = {
  unsupported: 'This browser cannot change saved characters safely when the app is open in more than one tab (it lacks Web Locks), so nothing was changed.',
  'read-only': 'This app is open in another tab, so changes here are not saved. Nothing was changed.',
  busy: 'Another tab is changing saved characters. Nothing was changed; try again in a moment.',
  unreadable: 'Your saved characters could not be read from this browser’s storage, so they were left alone and nothing was changed.',
  malformed: 'Your saved characters are not in a form this version can read, so they were left exactly as they are and nothing was changed.',
  newer: 'Your saved characters were written by a newer version of this app, so they were left exactly as they are and nothing was changed. Update the app to change them.',
  'too-large': 'This does not fit in the space kept for saved characters. Nothing was changed.',
  'write-failed': 'The character could not be saved on this device (its storage may be full). Nothing was changed.',
  'write-refused': 'The storage did not accept the change (it may be read-only or held for a newer version). Nothing was changed.',
  exhausted: 'The saved characters have used up their change counter, so nothing was changed. Export what you need and start a fresh store.',
  locked: 'The app is locked, so nothing was changed. Unlock it and try again.',
  'scope-ended': 'This chat session has ended, so its characters are gone and nothing was changed.',
  'fence-moved': 'The vault or the chat session changed before this was saved, so nothing was changed.',
  'no-durable-scope': 'Saving characters is not available here yet: this page has no way to confirm that a save really reached storage, so nothing was changed.',
  unconfirmed: 'This could not be confirmed: the character may or may not have been saved. Check your characters, or try the same save again; it will not be saved twice.',
  changed: 'The saved characters changed while this was being saved, so the result could not be confirmed. Check your characters and try again.',
};
const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^individual:[A-Za-z0-9._-]{1,120}$/;
const OPAQUE = /^[A-Za-z0-9:._-]{1,200}$/;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const json = (v) => JSON.parse(JSON.stringify(v));
// A caller's fence fails closed: absent means no extra check, a fence that throws or answers anything but exactly false counts as moved.
const fenced = (fence) => { if (fence === undefined || fence === null) return false; try { return fence() !== false; } catch { return true; } };
const fenceOk = (fence) => fence === undefined || fence === null || typeof fence === 'function';
const isVersion = (v) => Number.isSafeInteger(v) && v >= 1;
// A write scope that threw one of these refused BEFORE anything was appended (the vault write mode checks them first), so nothing was changed.
const REFUSED_BEFORE_WRITE = new Set(['session-changed', 'adapter-changed', 'lease-changed', 'no-exclusive', 'read-only', 'blocked', 'held', 'authority', 'not-vaulted', 'no-session', 'no-store', 'no-adapter']);
// Private to this module: only createTemporaryCharacterStore can mark a store as the per-chat memory-only one. A caller's storage that merely says `memoryOnly` is persistent.
const TEMPORARY_PATH = Symbol('temporary-character-store');

// ---- memory-only backing for temporary chats --------------------------------------------------------------------------------
/** A Storage stand-in that lives only in this object. Nothing reaches any browser storage or the vault. */
export function createMemoryStorage() {
  const m = new Map();
  return { memoryOnly: true, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); } };
}
/** A first-in first-out Web Locks stand-in for ONE tab's memory-only store (the contract the store uses: request(name, { signal }, callback)). */
export function createMemoryLocks() {
  const tails = new Map();
  return {
    request(name, options, callback) {
      return new Promise((resolve, reject) => {
        const signal = options?.signal; let granted = false;
        const previous = tails.get(name) || Promise.resolve();
        const abort = () => { if (!granted) { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); } };
        if (signal) { if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true }); }
        const mine = previous.then(async () => {
          if (signal?.aborted) return;
          granted = true;
          try { resolve(await callback()); } catch (error) { reject(error); }
        });
        tails.set(name, mine.catch(() => {}));
      });
    },
  };
}

// ---- the stored record ------------------------------------------------------------------------------------------------------
/**
 * Synchronous structural check of one stored record (nothing here proves the package: reopen does that through the producer validators).
 * Returns null when whole, else a short reason.
 */
export function checkStoredRecord(record) {
  if (!isObject(record)) return 'record';
  if (typeof record.individualId !== 'string' || !ID.test(record.individualId)) return 'individualId';
  if (!isVersion(record.recordVersion)) return 'recordVersion';
  if (!isObject(record.origin) || !['fresh', 'copy'].includes(record.origin.purpose) || typeof record.origin.admissionId !== 'string') return 'origin';
  if (!Array.isArray(record.admissions) || !record.admissions.length || record.admissions.length > CHARACTER_STORE_LIMITS.admissionsKept || record.admissions.some((a) => typeof a !== 'string')) return 'admissions';
  if (!isObject(record.preview) || typeof record.preview.name !== 'string' || typeof record.preview.instructions !== 'string') return 'preview';
  if (!isObject(record.subject) || typeof record.subject.id !== 'string') return 'subject';
  for (const field of ['design', 'transport', 'capabilities', 'structured']) if (!isObject(record[field])) return field;
  for (const field of ['omissions', 'resources', 'unverifiedSourceClaims']) if (!Array.isArray(record[field])) return field;
  if (checkSourceBounds(record.source)) return 'source';
  if (record.createdAt !== undefined && !Number.isFinite(record.createdAt)) return 'createdAt';
  return null;
}

/** The parts of a record that carry the verified meaning (not the route or the size of the text it first arrived in). */
const MEANING = ['preview', 'subject', 'design', 'capabilities', 'structured', 'omissions', 'resources', 'unverifiedSourceClaims', 'source'];
function bodyOf(candidate) {
  const body = {};
  for (const k of MEANING) body[k] = json(candidate[k]);
  body.transport = json({ ...candidate.transport });
  return body;
}
const meaningText = (body) => JSON.stringify([...MEANING.map((k) => body[k]), { ...body.transport, bytes: null }]);

const summary = (r) => ({
  individualId: r.individualId, recordVersion: r.recordVersion, name: r.preview.name, origin: r.origin.purpose,
  subject: { id: r.subject.id, label: r.subject.label }, design: { designId: r.design.designId, revision: r.design.revision },
  capabilities: Object.fromEntries(Object.entries(r.capabilities).map(([k, v]) => [k, v.present === true ? v.status : v.present === false ? 'absent' : v.status])),
  resources: r.resources.map((x) => ({ id: x.id, status: x.status, size: x.size, mediaType: x.mediaType, required: x.required === true })),
  omissions: r.omissions.length, createdAt: r.createdAt ?? null, updatedAt: r.updatedAt ?? null,
});

// Preparations are private: only what this module made, held here, can be committed. A caller's object that merely looks like one is refused.
const PREPARED = new WeakMap();

export function createCharacterStore({ storage, locks = globalThis.navigator?.locks, runWriteScope = null, isReadOnly = () => false, isLocked = () => false, crypto = globalThis.crypto, now = () => Date.now(), scope = null, bindToSession = false, key, lockName = CHARACTER_LOCK_NAME, waitMs = 10000, [TEMPORARY_PATH]: temporaryPath = false } = {}) {
  if (typeof key !== 'string' || !key) throw new TypeError('A character store needs the storage key its owner assigned.');
  const self = {};
  const scopeToken = () => (scope ? scope.current() : null);
  const scopeMoved = (token) => Boolean(scope) && scope.current() !== token;
  // A store bound to its session (a temporary chat) lives and dies with the scope it was made for. Once that scope moves, every read and every
  // new operation refuses and what the store held in memory is dropped: nothing is carried into another session.
  const sessionToken = bindToSession && scope ? scope.current() : null;
  let sessionOver = false; // sticky: a session that ended never comes back, even if its token value is seen again
  const ended = () => {
    if (!bindToSession || !scope) return false;
    if (!sessionOver && scope.current() === sessionToken) return false;
    sessionOver = true;
    if (storage?.memoryOnly) { try { storage.clear?.(); storage.removeItem(key); } catch { /* memory only */ } }
    return true;
  };
  const sessionEnded = () => fail('scope-changed', MESSAGES['scope-ended']);
  const durable = !temporaryPath; // every store but the private temporary path is persistent and needs the durable write scope
  const pendingRemovals = new Set(); // removals whose outcome was unconfirmed: a retry that finds the record gone finishes as `removed`
  const emptyState = () => ({ format: CHARACTER_STORE_FORMAT, revision: 0, records: [] });

  /** The stored state, or the reason it cannot be used (and then it is never overwritten). */
  function read() {
    if (ended()) return sessionEnded();
    let raw;
    try { raw = storage.getItem(key); } catch { return fail('unreadable', MESSAGES.unreadable); }
    return parseRaw(raw);
  }
  /** The stored raw text (however it was read) as a state, or the reason it cannot be used. */
  function parseRaw(raw) {
    if (raw == null) return { ok: true, state: emptyState(), raw: null };
    if (raw === '') return { ok: true, state: emptyState(), raw: '' };
    // Bounds first: text over the declared size is never parsed.
    if (typeof raw !== 'string' || raw.length > CHARACTER_STORE_LIMITS.storeChars) return fail('malformed', MESSAGES.malformed);
    let state;
    try { state = JSON.parse(raw); } catch { return fail('malformed', MESSAGES.malformed); }
    if (!isObject(state) || !Number.isInteger(state.format) || state.format < 1) return fail('malformed', MESSAGES.malformed);
    if (state.format > CHARACTER_STORE_FORMAT) return fail('newer', MESSAGES.newer);
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || !Array.isArray(state.records) || state.records.length > CHARACTER_STORE_LIMITS.records) return fail('malformed', MESSAGES.malformed);
    const seen = new Set();
    for (const r of state.records) { if (checkStoredRecord(r) || seen.has(r.individualId)) return fail('malformed', MESSAGES.malformed); seen.add(r.individualId); }
    return { ok: true, state, raw };
  }
  const writeBlock = () => {
    if (!locks?.request) return fail('unsupported', MESSAGES.unsupported);
    if (durable && typeof runWriteScope !== 'function') return fail('no-durable-scope', MESSAGES['no-durable-scope']);
    if (ended()) return sessionEnded();
    if (isLocked()) return fail('locked', MESSAGES.locked);
    if (isReadOnly()) return fail('read-only', MESSAGES['read-only']);
    return null;
  };
  const ready = () => writeBlock() || (() => { const r = read(); return r.ok ? { ok: true } : r; })();

  /** Decide and encode one change against a read state (synchronous, no storage touched): { failure } | { done: result } | { text, result }. */
  function plan(change, current) {
    const made = change(current.state);
    if (made.failure) return { failure: made.failure };
    if (!made.write) return { done: { ok: true, ...made.result } };
    const state = current.state;
    // An exhausted counter would write a value this module itself refuses to read: refuse before any write.
    if (!Number.isSafeInteger(state.revision + 1)) return { failure: fail('exhausted', MESSAGES.exhausted) };
    state.revision += 1;
    if (state.records.length > CHARACTER_STORE_LIMITS.records) return { failure: fail('too-large', MESSAGES['too-large']) };
    for (const r of state.records) { const bad = checkStoredRecord(r); if (bad) return { failure: fail('verification-failed', 'The character record is not whole (' + bad + '). Nothing was changed.') }; }
    const text = JSON.stringify(state);
    if (text.length > CHARACTER_STORE_LIMITS.storeChars || made.touched && JSON.stringify(made.touched).length > CHARACTER_STORE_LIMITS.recordChars) return { failure: fail('too-large', MESSAGES['too-large']) };
    return { text, result: { ok: true, ...made.result } };
  }

  /** The temporary chat's one synchronous step, inside its own lock: memory only. */
  function step(change, fence) {
    const blocked = writeBlock(); if (blocked) return blocked;
    if (fenced(fence)) return fail('scope-changed', MESSAGES['fence-moved']);
    const current = read(); if (!current.ok) return current;
    const planned = plan(change, current);
    if (planned.failure) return planned.failure;
    if (planned.done) return planned.done;
    const { text } = planned;
    try { storage.setItem(key, text); } catch { return fail('write-failed', MESSAGES['write-failed']); }
    let back; try { back = storage.getItem(key); } catch { back = null; }
    if (back !== text) {
      let same = false; try { same = JSON.stringify(JSON.parse(back)) === text; } catch { /* not what was written */ }
      if (!same) return back === current.raw ? fail('write-refused', MESSAGES['write-refused']) : fail('changed', MESSAGES.changed);
    }
    return planned.result;
  }

  /**
   * The persistent step, inside the write scope AND the lock. The authoritative raw is read FRESH through the scope, the whole next raw is computed from it, and the change is
   * acknowledged only by a committed receipt for exactly those bytes. `track.attempted` is set before the put so that anything unexpected afterwards is reported as unconfirmed.
   */
  async function durableStep(mode, change, fence, operationId, track) {
    const blocked = writeBlock(); if (blocked) return blocked;
    if (fenced(fence)) return fail('scope-changed', MESSAGES['fence-moved']);
    let got;
    try { got = await mode.readDurable([key]); } catch (error) { return REFUSED_BEFORE_WRITE.has(error?.code) ? fail('write-refused', MESSAGES['write-refused']) : fail('unreadable', MESSAGES.unreadable); }
    if (!got || typeof got !== 'object' || !Object.hasOwn(got, key)) return fail('unreadable', MESSAGES.unreadable);
    const afterRead = writeBlock() || (fenced(fence) ? fail('scope-changed', MESSAGES['fence-moved']) : null); if (afterRead) return afterRead;
    const current = parseRaw(got[key]); if (!current.ok) return current;
    const planned = plan(change, current);
    if (planned.failure) return planned.failure;
    if (planned.done) return planned.done;
    const { text } = planned;
    track.attempted = true;
    let receipt;
    try { receipt = await mode.putKV(key, current.raw, text, { operationId }); }
    // Once the put has begun, anything but an explicit `not-written` receipt may have written: a thrown refusal is NOT taken as proof that nothing was appended.
    catch { return fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true }); }
    // Only an explicit not-written receipt proves nothing was appended.
    if (receipt?.status === 'not-written') { track.attempted = false; return receipt.reason === 'write-failed' ? fail('write-failed', MESSAGES['write-failed']) : fail('write-refused', MESSAGES['write-refused']); }
    if (receipt?.status === 'committed' && receipt.observed === text && (receipt.operationId === undefined || receipt.operationId === operationId)) {
      // The write is durable, but the caller's own session may have moved while the receipt came back: that is not a success this caller may publish. Retrying reconciles.
      if (fenced(fence) || writeBlock()) return fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true });
      return planned.result;
    }
    // The stored value is now neither what this change started from nor what it sent: another writer's value. Not a success, not "nothing changed"; the same preparation reconciles.
    if (typeof receipt?.observed === 'string' && receipt.observed !== current.raw && receipt.observed !== text) return fail('changed', MESSAGES.changed, { unconfirmed: true });
    return fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true });
  }

  async function mutate(change, fence, operationId) {
    const blocked = writeBlock(); if (blocked) return blocked;
    if (fenced(fence)) return fail('scope-changed', MESSAGES['fence-moved']);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    let timer = null;
    const track = { attempted: false };
    try {
      if (!durable) {
        timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
        return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => { if (timer) clearTimeout(timer); return step(change, fence); });
      }
      // The write scope is entered BEFORE the characters lock, and left after it is released.
      let outcome;
      // The caller's guard is captured NOW and handed to the scope, which composes it into the write authority it asks of the engine: a caller whose session or fence has moved
      // (even during real crypto or a queued append) is refused before the backend is changed.
      const callerGuard = () => !fenced(fence) && !writeBlock();
      await runWriteScope(async (mode) => {
        timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
        outcome = await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => { if (timer) clearTimeout(timer); return durableStep(mode, change, fence, operationId, track); });
        return outcome;
      }, { guard: callerGuard });
      if (outcome === undefined) return track.attempted ? fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true }) : fail('write-failed', MESSAGES['write-failed']);
      // Leaving the write scope was another await: the caller's session may have moved meanwhile, so nothing is published as a success from a stale session.
      if (outcome.ok && (fenced(fence) || writeBlock())) return track.attempted ? fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true }) : fail('scope-changed', MESSAGES['fence-moved']);
      return outcome;
    } catch (error) {
      if (error?.name === 'AbortError' && !track.attempted) return fail('busy', MESSAGES.busy);
      if (track.attempted) return fail('unconfirmed', MESSAGES.unconfirmed, { unconfirmed: true });
      if (durable && REFUSED_BEFORE_WRITE.has(error?.code)) return fail('write-refused', MESSAGES['write-refused']);
      return fail('write-failed', MESSAGES['write-failed']);
    } finally { if (timer) clearTimeout(timer); }
  }

  const uuid = () => { try { const v = crypto.randomUUID(); return typeof v === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(v) ? v : null; } catch { return null; } };

  // ---- reading ----
  function list() {
    const r = read(); if (!r.ok) return r;
    return { ok: true, revision: r.state.revision, records: r.state.records.map(summary) };
  }
  function get(individualId) {
    const r = read(); if (!r.ok) return r;
    const found = r.state.records.find((x) => x.individualId === individualId);
    return found ? { ok: true, record: json(found) } : fail('gone', 'That saved character is no longer there.');
  }
  /** Reopen a stored record through the producer validators: a frozen candidate with exact retained resource bytes, or a refusal. */
  async function open(individualId) {
    const got = get(individualId); if (!got.ok) return got;
    const again = await reopenCharacterSource(got.record.source, { subjectId: got.record.subject.id, crypto });
    if (ended()) return sessionEnded();
    if (!again.ok) return fail('verification-failed', 'The saved character no longer verifies (' + again.code + '). It was left as it is.', { reason: again });
    if (meaningText(bodyOf(again.candidate)) !== meaningText(got.record)) return fail('verification-failed', 'The saved character does not match its own package. It was left as it is.');
    return { ok: true, candidate: again.candidate, record: got.record };
  }

  // ---- preparing (asynchronous, outside the lock, private) ----
  const hold = (held) => {
    const view = Object.freeze({ kind: 'character-admission', admissionId: held.admissionId, purpose: held.purpose, name: held.body.preview.name, route: held.route, subject: Object.freeze({ id: held.body.subject.id, label: held.body.subject.label }), resources: held.body.resources.length, omissions: held.body.omissions.length });
    PREPARED.set(view, { ...held, owner: self });
    return { ok: true, preparation: view };
  };
  const ids = () => { const a = uuid(), b = uuid(); return a && b ? { individual: 'individual:' + a, admission: 'admission:' + b } : null; };

  /**
   * prepare({ text | hash, purpose: 'fresh' | 'update' | 'copy', target?, source?, subjectId?, openExternal?, hasherFactory? })
   *   fresh   a package (`text` for a file, `hash` for an address fragment) becomes a new character
   *   update  the same, replacing the design of ONE chosen record: target { individualId, recordVersion } as the person saw it
   *   copy    an installed record, source { individualId, recordVersion }, becomes a new authored character (no package input)
   */
  async function prepare(input = {}) {
    const { text, hash, purpose = 'fresh', target, source, subjectId, openExternal, hasherFactory } = input;
    if (ended()) return sessionEnded();
    if (isLocked()) return fail('locked', MESSAGES.locked);
    if (!['fresh', 'update', 'copy'].includes(purpose)) return fail('purpose', 'This purpose is not supported: a package makes a new character or updates one you choose, and a copy is a new character. Nothing was changed.');
    const token = scopeToken();
    const id = ids(); if (!id) return fail('crypto-unavailable', 'This browser cannot make a private reference for a new character. Nothing was changed.');
    if (purpose === 'copy') {
      if (!isObject(source) || !OPAQUE.test(String(source.individualId)) || !isVersion(source.recordVersion) || text !== undefined || hash !== undefined || target !== undefined) return fail('target', 'Copying needs one chosen saved character and its version, and takes no package. Nothing was changed.');
      const opened = await open(source.individualId); if (!opened.ok) return opened;
      if (opened.record.recordVersion !== source.recordVersion) return fail('stale', 'That character was changed since you chose it. Nothing was copied.', { currentVersion: opened.record.recordVersion });
      if (scopeMoved(token)) return fail('scope-changed', 'This chat session ended before the copy was made. Nothing was changed.');
      return hold({ admissionId: id.admission, purpose, individualId: id.individual, copiedFrom: { individualId: source.individualId, recordVersion: source.recordVersion }, body: bodyOf(opened.candidate), route: 'stored', token });
    }
    if (purpose === 'update') { if (!isObject(target) || !OPAQUE.test(String(target.individualId)) || !isVersion(target.recordVersion) || source !== undefined) return fail('target', 'Updating needs one explicitly chosen saved character and its version. Nothing was changed.'); }
    else if (target !== undefined || source !== undefined) return fail('target', 'Only an update names an existing character. Nothing was changed.');
    const options = { purpose, subjectId, crypto, openExternal, hasherFactory, ...(purpose === 'update' ? { targetIndividualId: target.individualId } : {}) };
    let reviewed;
    if (text !== undefined) reviewed = await reviewCharacterPackageFile(text, options);
    else if (hash !== undefined) reviewed = await reviewCharacterPackageFragment(hash, options) ?? fail('no-package', 'This address carries no character package. Nothing was changed.');
    else return fail('no-package', 'Choose a character package. Nothing was changed.');
    if (!reviewed.ok) return reviewed;
    if (scopeMoved(token)) return fail('scope-changed', 'This chat session ended before the package could be admitted. Nothing was changed.');
    return hold({ admissionId: id.admission, purpose, individualId: purpose === 'update' ? target.individualId : id.individual, expectedVersion: purpose === 'update' ? target.recordVersion : null, body: bodyOf(reviewed.candidate), route: reviewed.candidate.route, token });
  }

  // ---- committing ----
  /** Commit a preparation made by this store. Safe to call again with the same preparation: the second call writes nothing. */
  async function commit(preparation, { fence } = {}) {
    const held = isObject(preparation) ? PREPARED.get(preparation) : undefined;
    if (ended()) return sessionEnded();
    if (!fenceOk(fence)) return fail('target', 'The session check for this change is not valid. Nothing was changed.');
    if (fenced(fence)) return fail('scope-changed', MESSAGES['fence-moved']);
    if (!held || held.owner !== self) return fail('unknown-preparation', 'This admission was not prepared here (or is no longer valid). Nothing was changed.');
    if (scopeMoved(held.token)) return fail('scope-changed', 'This chat session ended before the character was saved. Nothing was changed.');
    const blocked = writeBlock(); if (blocked) return blocked;
    // The last asynchronous check, before the lock: the held bytes and metadata are verified once more by the producer validators from the
    // serialisable source, and must still mean exactly what was prepared. What is stored is what passed THIS, not a caller's object.
    const again = await reopenCharacterSource(held.body.source, { subjectId: held.body.subject.id, crypto });
    if (!again.ok || meaningText(bodyOf(again.candidate)) !== meaningText(held.body)) return fail('verification-failed', 'The package no longer verifies, so nothing was saved.');
    if (scopeMoved(held.token) || fenced(fence)) return fail('scope-changed', 'This chat session ended before the character was saved. Nothing was changed.');

    return mutate((state) => {
      if (scopeMoved(held.token)) return { failure: fail('scope-changed', 'This chat session ended before the character was saved. Nothing was changed.') };
      const done = state.records.find((r) => r.admissions.includes(held.admissionId));
      if (done) return { result: { status: held.purpose === 'update' ? 'already-applied' : 'already-admitted', individualId: done.individualId, recordVersion: done.recordVersion } };
      const at = now();
      if (held.purpose === 'update') {
        const i = state.records.findIndex((r) => r.individualId === held.individualId);
        if (i < 0) return { failure: fail('gone', 'The character you chose to update is no longer saved. Nothing was changed.') };
        const stored = state.records[i];
        if (stored.recordVersion !== held.expectedVersion) return { failure: fail('stale', 'That character was changed since you chose it, so nothing was updated. Choose it again to see the newer version.', { currentVersion: stored.recordVersion, name: stored.preview.name }) };
        const next = { ...stored, ...json(held.body), individualId: stored.individualId, recordVersion: stored.recordVersion + 1, updatedAt: at, admissions: [...stored.admissions, held.admissionId].slice(-CHARACTER_STORE_LIMITS.admissionsKept), lastUpdate: { admissionId: held.admissionId, fromRecordVersion: stored.recordVersion } };
        state.records[i] = next;
        return { write: true, touched: next, result: { status: 'updated', individualId: next.individualId, recordVersion: next.recordVersion } };
      }
      if (held.purpose === 'copy') {
        const from = state.records.find((r) => r.individualId === held.copiedFrom.individualId);
        if (!from) return { failure: fail('gone', 'The character you chose to copy is no longer saved. Nothing was changed.') };
        if (from.recordVersion !== held.copiedFrom.recordVersion) return { failure: fail('stale', 'That character was changed since you chose it, so nothing was copied.', { currentVersion: from.recordVersion }) };
      }
      if (state.records.some((r) => r.individualId === held.individualId)) return { failure: fail('id-collision', 'A reference collision was detected; nothing was changed. Try again.') };
      const record = { individualId: held.individualId, recordVersion: 1, origin: { purpose: held.purpose, admissionId: held.admissionId, route: held.route, ...(held.copiedFrom ? { copiedFrom: held.copiedFrom } : {}) }, admissions: [held.admissionId], createdAt: at, updatedAt: at, ...json(held.body) };
      state.records.push(record);
      return { write: true, touched: record, result: { status: held.purpose === 'copy' ? 'copied' : 'admitted', individualId: record.individualId, recordVersion: 1 } };
    }, fence, held.admissionId);
  }

  /** Remove one saved character: it must still be the version the person chose. A record already gone is reported as such and nothing is written. */
  function remove({ individualId, recordVersion } = {}, { fence } = {}) {
    if (!fenceOk(fence)) return Promise.resolve(fail('target', 'The session check for this change is not valid. Nothing was changed.'));
    if (!OPAQUE.test(String(individualId)) || !isVersion(recordVersion)) return Promise.resolve(fail('target', 'Removing needs one chosen saved character and its version. Nothing was changed.'));
    const removal = individualId + '@' + recordVersion;
    return mutate((state) => {
      const i = state.records.findIndex((r) => r.individualId === individualId);
      if (i < 0) return { result: { status: pendingRemovals.has(removal) ? 'removed' : 'already-absent', individualId } };
      if (state.records[i].recordVersion !== recordVersion) return { failure: fail('stale', 'That character was changed since you chose it, so it was not removed.', { currentVersion: state.records[i].recordVersion }) };
      state.records.splice(i, 1);
      return { write: true, result: { status: 'removed', individualId } };
    }, fence, 'removal:' + removal).then((outcome) => { if (outcome.unconfirmed) pendingRemovals.add(removal); else if (outcome.ok) pendingRemovals.delete(removal); return outcome; });
  }

  return Object.assign(self, { read, ready, list, get, open, prepare, commit, remove, temporary: Boolean(storage?.memoryOnly) });
}

/**
 * The store for a temporary chat: memory only, one tab's own FIFO lock, bound to the session `scope` ({ current(): token }). The session ending or
 * being replaced changes the token and every pending admission refuses. No browser storage object is ever touched.
 */
export function createTemporaryCharacterStore({ scope, crypto, now, waitMs } = {}) {
  if (!scope || typeof scope.current !== 'function') throw new TypeError('A temporary character store needs the session scope it belongs to.');
  return createCharacterStore({ storage: createMemoryStorage(), key: 'temporary-characters', locks: createMemoryLocks(), scope, bindToSession: true, crypto, now, waitMs, [TEMPORARY_PATH]: true });
}

export { decodeBytes };
