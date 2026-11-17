// The one place the conversation records (plc.encounters.v1) are written. Same discipline as chat/assistant/preset-store.mjs and prefs-store.mjs:
//   take the Web Lock "plc-encounters" -> prove the view of storage is the last committed state -> apply a SYNCHRONOUS change -> write -> read back to check -> record the new state -> release.
// The browser frees the lock if the tab dies in the middle. WITHOUT Web Locks, in a read-only tab, when the lock cannot be had within waitMs, or when the view of storage cannot be shown to be
// fresh, NOTHING is written: there is no unlocked or unproven fallback for the ledger. Stored text that is not a ledger, or that a newer version wrote, is never overwritten. After a write the
// key is read back; if what is there is not what was written, the outcome is reported as a failure ('changed': ambiguous) and NOTHING IS PUT BACK (an earlier copy could erase another writer's
// newer, successful write). Stored state whose recognised header, containers or record references are malformed, or whose counters are not nonnegative safe integers, is refused ('malformed')
// and left byte for byte as it is.
//
// The same lock also covers the conversations (chat/encounters/thread-commit.mjs): `critical(fn)` hands fn a transaction that reads and writes the ledger inside the lock, so the
// commit of a transcript change and of its records is one critical section (with an `intent` in the ledger for crash recovery between the two stores).
//
// FRESHNESS (chat/encounters/coordination.mjs): the lock orders the tabs, not what each tab's storage cache has received. Before a hold decides anything, `coordination.acquire()` shows that the
// tab's view of the ledger and the chats has exactly the digests the last complete hold left in a durable IndexedDB record (or finishes/adopts an interrupted one, see there). The first write of a hold
// is preceded by `tx.plan(finals)`; the end of every hold `settle()`s the new digests, which is the acknowledgement point. A refusal at any of these steps writes nothing.
//
// `epoch` makes "Clear history" final: clearing bumps the epoch; a tab that still holds the epoch it started with cannot write (code 'stale') until it is reloaded, so a slow or
// stale tab cannot bring cleared records or conversations back.
//
// createLedgerStore({ storage, key, locks?, isReadOnly?, lockName?, waitMs?, watch?, coordination?, exclusiveWriter? }) -> { read(), ready(), mutate(change, { epoch? }), critical(fn) }
//   mutate -> { ok: true, ledger, result, wrote } | { ok: false, code: 'unsupported' | 'read-only' | 'unreadable' | 'malformed' | 'newer' | 'busy' | 'write-failed' | 'changed' | 'stale'
//             | 'stale-view' | 'recovery-unproven' | 'coordination-unavailable' | 'coordination-conflict' | <a change's own refusal>, message }
import { parseLedger, sweepThreads, applyUndo } from './records.mjs';
import { createCoordination, idbBackend, standInFor } from './coordination.mjs';

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const bare = (ledger) => JSON.stringify({ ...ledger, rev: 0 });
const NO_COORD = 'This browser cannot keep the record that makes saving safe across tabs (no IndexedDB), so chats are shown but not saved. Nothing was changed.';

// watch: the other key written in the same lock hold (the chats). coordination: a createCoordination() object (tests); exclusiveWriter: the host states that one encrypted writer with synchronous
// in-memory storage makes stale views impossible (vault on: then NO digest of the payload is stored anywhere); unsafeNoCoordination: a TEST control only (the unprotected design).
// With none of them: a browser with IndexedDB gets the real record; a browser without it refuses ('coordination-unavailable'); plain Node (the unit tests) gets a process-local stand-in.
export function createLedgerStore({ storage, key = 'plc.encounters.v1', locks = globalThis.navigator?.locks, isReadOnly = () => false, isNewer = () => false, lockName = 'plc-encounters', waitMs = 10000, watch = ['chatThreads'], coordination, exclusiveWriter = false, vaultOn = () => false, unsafeNoCoordination = false, coordOptions = {} } = {}) {
  function read() {
    if (isNewer()) return fail('newer', 'The saved conversation records were made by a newer version of the app, so this version leaves them exactly as they are.');
    let raw; try { raw = storage.getItem(key); } catch { return fail('unreadable', 'The saved conversation records could not be read from this browser’s storage, so they were left alone.'); }
    const parsed = parseLedger(raw);
    return parsed.ok ? { ok: true, ledger: parsed.ledger, raw } : parsed;
  }
  const watched = [key, ...watch];
  const opts = { keys: watched, read: (k) => storage.getItem(k), hasIntent: () => { const r = read(); return Boolean(r.ok && r.ledger.intent); }, ...coordOptions };
  // exclusiveWriter may be a function (the vault can be turned on while the page lives): evaluated at every hold
  const exclusive = () => (typeof exclusiveWriter === 'function' ? Boolean(exclusiveWriter()) : Boolean(exclusiveWriter));
  const coordObj = coordination || (globalThis.indexedDB ? createCoordination({ backend: idbBackend(), ...opts }) : typeof window === 'undefined' ? standInFor(storage, opts) : null);
  let forgot = false;
  const forgetIfVault = () => { if (unsafeNoCoordination || !coordObj) return; if (!exclusive()) { forgot = false; return; } if (!forgot) { forgot = true; Promise.resolve(coordObj.forget?.()).catch(() => {}); } };
  const activeCoord = () => (unsafeNoCoordination || exclusive() ? null : coordObj);
  const coordMissing = () => !unsafeNoCoordination && !exclusive() && !coordObj;
  const writeBlock = () => {
    if (!locks?.request) return fail('unsupported', 'This browser cannot keep conversation records safely when the app is open in more than one tab (it lacks Web Locks), so they are shown but not updated. Nothing was changed.');
    if (isReadOnly()) return fail('read-only', 'This app is open in another tab, so changes here are not saved.');
    // the vault is on but the shared vault does not report an ACTUAL exclusive-writer claim: the plain record must not hold digests of vault payload and a stale plain view cannot be proven, so refuse
    if (!unsafeNoCoordination && vaultOn() && !exclusive()) return fail('vault-writer-unverified', 'The encrypted vault is on but this tab could not verify that it is the only writer, so chats are shown but not saved. Nothing was changed.');
    if (coordMissing()) return fail('coordination-unavailable', NO_COORD);
    return null;
  };
  const ready = () => writeBlock() || read();

  /** The text write() will store for `ledger` (rev + 1): plans use it to name the end state before anything is written. */
  const preview = (ledger) => JSON.stringify({ ...ledger, rev: ledger.rev + 1 });
  /** Inside the lock: write a ledger (rev + 1) and read it back. */
  function write(ledger) {
    const base = ledger.rev;
    if (!Number.isSafeInteger(base) || base < 0) return fail('malformed', 'The conversation records have an invalid revision; they were left exactly as they are.');   // never reset to 0: that would defeat the fence
    if (base >= Number.MAX_SAFE_INTEGER) return fail('exhausted', 'The conversation records have used every safe integer revision; they cannot be advanced further.');
    if (!Number.isSafeInteger(ledger.epoch) || ledger.epoch < 0) return fail('malformed', 'The conversation records have an invalid epoch; they were left exactly as they are.');
    const draft = { ...ledger, rev: base + 1 };
    const text = JSON.stringify(draft);
    try { storage.setItem(key, text); } catch { return fail('write-failed', 'The conversation records could not be saved on this device (its storage may be full). Nothing was changed.'); }
    let back; try { back = storage.getItem(key); } catch { back = null; }
    if (back !== text) return fail('changed', 'The saved conversation records changed while this was being saved, so the result could not be confirmed.', { text });
    return { ok: true, ledger: draft, text };
  }
  /** A raw write of an exact, already-decided text (recovery): store and read back. */
  const put = (k, text) => {
    try { if (text == null) storage.removeItem(k); else storage.setItem(k, text); } catch { return false; }
    try { return storage.getItem(k) === (text == null ? null : text); } catch { return false; }
  };
  /** One transaction object per lock hold. begin/beforeWrite/ack are write-ahead durable steps of the coordination record (no-ops when no coordination protects this hold). */
  function makeTx(coord, pending) {
    const none = { ok: true };
    let armed = false;      // true once this hold may have issued a raw write (a write-ahead step succeeded, or a recovery wrote): from then on a failure is not provably "nothing changed"
    return {
      read, write, preview, key, put, pending: pending || null, coordinated: Boolean(coord),
      /** BEFORE the first raw write: patches = ordered { key: text|null } steps, back = patch of the rollback pair. A refusal means nothing was written. */
      begin: async (patches, o = {}) => (coord ? coord.begin(patches, o) : none),
      beforeWrite: async (i, from) => { const r = coord ? await coord.beforeWrite(i, from) : none; if (r.ok) armed = true; return r; },
      ack: async (outcome = 'applied', o) => (coord ? coord.ack(outcome, o) : none),
      resolve: async (o) => { armed = true; return coord ? coord.resolve({ ...o, write: put }) : fail('recovery-unproven', 'No coordination record.'); },
      openOp: () => (coord ? coord.openOp() : null),
      mayHaveWritten: () => armed,
    };
  }

  function step(change, { epoch }) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const current = read(); if (!current.ok) return current;
    if (epoch != null && current.ledger.epoch !== epoch) return { ...fail('stale', 'The conversation records were cleared or reset in another tab. Reload this tab to continue recording.'), epoch: current.ledger.epoch };
    const draft = JSON.parse(JSON.stringify(current.ledger));
    const made = change(draft) || {};
    if (made.refuse) return fail(made.refuse, made.message || 'Refused.');
    if (bare(draft) === bare(current.ledger)) return { ok: true, ledger: current.ledger, result: made.result, wrote: false };
    return { draft, made };
  }
  async function mutateStep(change, o, tx) {
    const s = step(change, o); if (!s.draft) return s;
    const text = preview(s.draft);
    const l0 = read();
    const begun = await tx.begin([{ [key]: text }], { op: null, back: { [key]: l0.ok ? l0.raw : null } }); if (!begun.ok) return begun;
    const before = await tx.beforeWrite(1); if (!before.ok) return before;
    const written = write(s.draft); if (!written.ok) return written;
    return { ok: true, ledger: written.ledger, result: s.made.result, wrote: true };
  }

  /**
   * One lock hold. A hold is acknowledged ONLY by the stable record: `fn` returns ok -> the record is acknowledged here, and a failure of that step returns
   * { ok:false, code, unknown:{ op } } (the data may be durable; the caller must not claim it unchanged, advance its base or resend blindly). An interrupted earlier operation is handed to
   * `fn` as tx.pending and must be finished (tx.resolve) before anything else is decided.
   */
  async function critical(fn) {
    forgetIfVault();
    const blocked = writeBlock(); if (blocked) return blocked;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => {
        if (timer) clearTimeout(timer);
        const coord = activeCoord();
        let pending = null;
        if (coord) { const a = await coord.acquire(); if (!a.ok) { return a; } pending = a.pending || null; }
        const tx = makeTx(coord, pending);
        const out = await fn(tx);
        const op = coord ? coord.openOp() : null;
        if (!op) { return out; }
        // RESULT CONTRACT. success = the stable ACK only. A failure is DEFINITE (original code, no `unknown`) only when nothing can have changed: this hold never armed a raw write, or the
        // rolled-back ACK proved the start/rollback pair. Anything else is UNCERTAIN: code 'unknown-outcome' (the code the screen's outcomeOf recognises) with the cause kept beside it.
        const uncertain = (cause, extra = {}) => ({ ...extra, ok: false, code: 'unknown-outcome', cause, message: 'The result could not be confirmed. Look at the chat before trying again, so nothing is sent twice.', unknown: { op } });
        if (out && out.ok) {
          const a = await coord.ack('applied');
          if (a.ok) return out;
          return uncertain(a.code);
        }
        const definite = () => { if (!out || typeof out !== 'object') return out; const { unknown, ...rest } = out; return rest; };
        // the open operation is an EARLIER holder's and this hold's own change was never begun (a refused recovery): this caller's change is definitely not stored
        // unless the earlier holder's intent was already written to storage, in which case the outcome is uncertain
        if (pending && op === pending.op) { const L = tx.read(); if (L.ok && L.ledger?.intent) return uncertain(out?.code || 'failed'); return uncertain(out?.code || 'failed'); }
        const closed = await coord.ack('rolled-back');
        if (closed.ok) return out;
        // `notStored` (set by the writer at a site BEFORE the person's own chats were written) = the caller's change is certainly not stored even though the records may still hold an intent
        // that the next holder settles; that is a definite failure for the caller, never "unknown"
        if (out?.notStored) return definite();
        if (!tx.mayHaveWritten()) { const c = out?.code; return (c === 'recovery-unproven' || c === 'coordination-unavailable') ? uncertain(c) : definite(); }
        return uncertain(out?.code || 'failed', { conflicts: out?.conflicts, refused: out?.refused });
      });
    } catch (error) {
      if (error?.name === 'AbortError') return fail('busy', 'Another tab is updating conversation records. Try again in a moment.');
      return fail('write-failed', 'The conversation records could not be saved.');
    } finally { if (timer) clearTimeout(timer); }
  }
  const mutate = (change, { epoch = null } = {}) => critical(async (tx) => {
    if (tx.pending) { const r = await settlePending(tx); if (!r.ok) return r; }
    return mutateStep(change, { epoch }, tx);
  });
  /**
   * Finish the interrupted operation the record says is open (tx.pending) BEFORE anything is decided. The view (a member of the recorded `pos`) is the only evidence:
   *   * it is the last forward phase                           -> acknowledge `applied` (nothing to write);
   *   * otherwise forward when every needed text is in the view or derivable from the ledger's own intent (and every intermediate is a phase pair);
   *   * otherwise back to the recorded rollback pair, likewise;
   *   * otherwise nothing is changed ('recovery-unproven'): honest, retriable, never adopted by age.
   * Order of raw writes is chats first, then the ledger (so every intermediate is a phase pair of the operation).
   */
  async function settlePending(tx) {
    const rec = tx.pending.record;
    // the view shortcut acknowledges only when EVERY possible pair is already the last forward pair (coordination.ack); otherwise recovery below writes/proves every key itself
    if (tx.pending.viewIndex === rec.fw) { const a = await tx.ack('applied', { pending: true }); if (a.ok) return { ok: true, outcome: 'applied', recovered: 'forward' }; if (a.code !== 'unknown-outcome' && a.code !== 'coordination-unavailable' && a.code !== 'coordination-conflict') return a; }
    const r = read(); const ledgerRaw = r.ok ? r.raw : (() => { try { return storage.getItem(key); } catch { return null; } })();
    const base = Object.fromEntries(watched.map((k) => { try { return [k, storage.getItem(k)]; } catch { return [k, null]; } }));
    const texts = { forward: { ...base }, back: { ...base } };
    const parsed = parseLedger(ledgerRaw);
    if (parsed.ok && parsed.ledger.intent) {
      const intent = parsed.ledger.intent, d = JSON.parse(JSON.stringify(parsed.ledger)); delete d.intent;
      if (intent.kind === 'clear') { texts.forward[key] = preview(d); texts.forward[watch[0]] = null; }
      else {
        const f = JSON.parse(JSON.stringify(d)); sweepThreads(f, intent.sweep || intent.removed || []); texts.forward[key] = preview(f);
        const b = JSON.parse(JSON.stringify(d)); applyUndo(b, intent.undo || {}); texts.back[key] = preview(b);
      }
    }
    const order = [...watch, key];
    // every text this view can supply (the view's own, and what the ledger's intent derives for each end): resolve uses a text only when its digest is a recorded value of that key
    const pool = Object.fromEntries(order.map((k) => [k, [base[k], texts.forward[k], texts.back[k]]]));
    const fw = await tx.resolve({ target: 'forward', texts: pool, order });
    if (fw.ok) return { ...fw, recovered: 'forward' };
    if (fw.code !== 'recovery-unproven') return fw;
    if (rec.bk != null) { const bk = await tx.resolve({ target: 'back', texts: pool, order }); if (bk.ok) return { ...bk, recovered: 'back' }; if (bk.code !== 'recovery-unproven') return bk; }
    // the start pair, only from texts a view actually holds (a lagging view of the start pair holds them)
    const st = await tx.resolve({ target: 'start', texts: pool, order });
    return st.ok ? { ...st, recovered: 'back' } : fw;
  }

  return { read, ready, mutate, critical, settlePending, get coordination() { return activeCoord(); } };
}
