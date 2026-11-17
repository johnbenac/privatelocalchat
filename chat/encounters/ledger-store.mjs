// The one place the conversation records (plc.encounters.v1) are written. Same discipline as chat/assistant/preset-store.mjs and prefs-store.mjs:
//   take the Web Lock "plc-encounters" -> read the stored ledger afresh -> apply a SYNCHRONOUS change -> write -> read back to check -> release.
// The browser frees the lock if the tab dies in the middle. WITHOUT Web Locks, in a read-only tab, or when the lock cannot be had within waitMs, NOTHING is written: there is
// no unlocked fallback for the ledger. Stored text that is not a ledger, or that a newer version wrote, is never overwritten. After a write the key is read back; if what is there is
// not what was written, the outcome is reported as a failure ('changed': ambiguous) and NOTHING IS PUT BACK (an earlier copy could erase another writer's newer, successful write).
// Stored state whose recognised header, containers or record references are malformed, or whose counters are not nonnegative safe integers, is refused ('malformed') and left byte for byte as it is.
//
// The same lock also covers the conversations (chat/encounters/thread-commit.mjs): `critical(fn)` hands fn a transaction that reads and writes the ledger inside the lock, so the
// commit of a transcript change and of its records is one critical section (with an `intent` in the ledger for crash recovery between the two stores).
//
// `epoch` makes "Clear history" final: clearing bumps the epoch; a tab that still holds the epoch it started with cannot write (code 'stale') until it is reloaded, so a slow or
// stale tab cannot bring cleared records or conversations back.
//
// createLedgerStore({ storage, key, locks?, isReadOnly?, lockName?, waitMs? }) -> { read(), ready(), mutate(change, { epoch? }), critical(fn) }
//   mutate -> { ok: true, ledger, result, wrote } | { ok: false, code: 'unsupported' | 'read-only' | 'unreadable' | 'malformed' | 'newer' | 'busy' | 'write-failed' | 'changed' | 'stale' | <a change's own refusal>, message }
import { parseLedger } from './records.mjs';

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const bare = (ledger) => JSON.stringify({ ...ledger, rev: 0 });

export function createLedgerStore({ storage, key = 'plc.encounters.v1', locks = globalThis.navigator?.locks, isReadOnly = () => false, isNewer = () => false, lockName = 'plc-encounters', waitMs = 10000 } = {}) {
  function read() {
    if (isNewer()) return fail('newer', 'The saved conversation records were made by a newer version of the app, so this version leaves them exactly as they are.');
    let raw; try { raw = storage.getItem(key); } catch { return fail('unreadable', 'The saved conversation records could not be read from this browser’s storage, so they were left alone.'); }
    const parsed = parseLedger(raw);
    return parsed.ok ? { ok: true, ledger: parsed.ledger, raw } : parsed;
  }
  const writeBlock = () => {
    if (!locks?.request) return fail('unsupported', 'This browser cannot keep conversation records safely when the app is open in more than one tab (it lacks Web Locks), so they are shown but not updated. Nothing was changed.');
    if (isReadOnly()) return fail('read-only', 'This app is open in another tab, so changes here are not saved.');
    return null;
  };
  const ready = () => writeBlock() || read();

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
  const tx = { read, write };

  function step(change, { epoch }) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const current = read(); if (!current.ok) return current;
    if (epoch != null && current.ledger.epoch !== epoch) return { ...fail('stale', 'The conversation records were cleared or reset in another tab. Reload this tab to continue recording.'), epoch: current.ledger.epoch };
    const draft = JSON.parse(JSON.stringify(current.ledger));
    const made = change(draft) || {};
    if (made.refuse) return fail(made.refuse, made.message || 'Refused.');
    if (bare(draft) === bare(current.ledger)) return { ok: true, ledger: current.ledger, result: made.result, wrote: false };
    const written = write(draft); if (!written.ok) return written;
    return { ok: true, ledger: written.ledger, result: made.result, wrote: true };
  }

  async function critical(fn) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => { if (timer) clearTimeout(timer); return fn(tx); });
    } catch (error) {
      if (error?.name === 'AbortError') return fail('busy', 'Another tab is updating conversation records. Try again in a moment.');
      return fail('write-failed', 'The conversation records could not be saved.');
    } finally { if (timer) clearTimeout(timer); }
  }
  const mutate = (change, { epoch = null } = {}) => critical(() => step(change, { epoch }));

  return { read, ready, mutate, critical };
}
