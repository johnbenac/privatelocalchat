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
const TOKEN = 'plc-enc-seq|';
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };
const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const yieldTask = () => new Promise((resolve) => {
  if (typeof MessageChannel === 'function') { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); resolve(); }; c.port2.postMessage(0); } else setTimeout(resolve, 0);
});

// watch: other keys written in the same lock hold (chatThreads); fresh: false turns the freshness wait off (only a test's control uses it); freshMs: the longest wait for a value to arrive
export function createLedgerStore({ storage, key = 'plc.encounters.v1', locks = globalThis.navigator?.locks, isReadOnly = () => false, isNewer = () => false, lockName = 'plc-encounters', waitMs = 10000, watch = [], fresh = true, freshMs = 400 } = {}) {
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

  // ---- freshness: the lock orders the tabs, but not what each tab's storage cache has already received ------------------------------------------
  // Measured in real Chromium (logs/baseline-race-diag4-r12.log): a tab that has just been given the Web Lock can still read a browser-storage value that is a few milliseconds old, because the
  // previous holder's write is still travelling between the two renderer processes. A compare-and-set on that stale read then erases the previous holder's work (lost edit / send / import /
  // participant registration). The lock manager is the one thing every tab sees at once, so a writer leaves its token in it: before it lets go of `plc-encounters` it holds a shared lock named
  //   plc-enc-seq|<tab>|<seq>|<digest of the keys it just stored>      (one per tab; the previous one is released once the new one is granted; it goes with the tab)
  // and the next holder reads `locks.query()`, takes the highest seq and waits (task yields, not timers, so a background tab is not throttled) until its own view of the keys has that digest.
  // Limits, stated: without `locks.query` nothing is waited for; a value never seen within `freshMs` (a writer that does not leave tokens, a writer that closed at once) is taken as it is.
  const watched = [key, ...watch];
  const tabId = Math.random().toString(36).slice(2, 10);
  const digestOf = () => watched.map((k) => { let raw; try { raw = storage.getItem(k); } catch { raw = null; } return raw == null ? '-' : raw.length + '.' + fnv(raw); }).join('/');
  const parseToken = (name) => { if (!name.startsWith(TOKEN)) return null; const [tab, seq, digest] = name.slice(TOKEN.length).split('|'); const n = Number(seq); return Number.isSafeInteger(n) && digest ? { tab, seq: n, digest, name } : null; };
  let mine = null;                 // { release, seq, digest }: this tab's own current token
  let settledOn = null;            // the token name this tab already waited for (so a token nobody can satisfy costs one wait, not one per save)
  async function topToken() {
    if (!fresh || typeof locks.query !== 'function') return { top: null, supported: false };
    let held; try { held = (await locks.query())?.held || []; } catch { return { top: null, supported: false }; }
    let top = null; for (const h of held) { const t = parseToken(String(h.name)); if (t && (!top || t.seq > top.seq)) top = t; }
    return { top, supported: true };
  }
  async function barrier() {
    const { top, supported } = await topToken();
    if (!supported || !top || top.tab === tabId || settledOn === top.name) return { top, supported };
    const end = clock() + freshMs;
    while (digestOf() !== top.digest) { if (clock() > end) { settledOn = top.name; break; } await yieldTask(); }
    return { top, supported };
  }
  function holdToken(name) {
    return new Promise((granted) => {
      let release; const held = new Promise((r) => { release = r; });
      Promise.resolve(locks.request(name, { mode: 'shared' }, () => { granted(release); return held; })).catch(() => granted(null));
    });
  }
  async function publish({ top, supported }, entry) {
    if (!supported) return;
    const digest = digestOf();
    if (digest === entry) return;                                                  // this hold wrote nothing: the newest token stays the newest
    const seq = Math.max(top?.seq ?? 0, mine?.seq ?? 0) + 1;
    const release = await holdToken(`${TOKEN}${tabId}|${seq}|${digest}`);
    if (!release) return;
    const old = mine; mine = { release, seq, digest };
    try { old?.release(); } catch { /* the old token goes with its lock */ }
  }
  try { globalThis.addEventListener?.('pagehide', () => { try { mine?.release(); } catch { /* ignore */ } mine = null; }); } catch { /* no window */ }

  async function critical(fn) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => {
        if (timer) clearTimeout(timer);
        const seen = await barrier();
        const entry = digestOf();
        const out = await fn(tx);
        try { await publish(seen, entry); } catch { /* the token only shortens a wait for the next holder */ }
        return out;
      });
    } catch (error) {
      if (error?.name === 'AbortError') return fail('busy', 'Another tab is updating conversation records. Try again in a moment.');
      return fail('write-failed', 'The conversation records could not be saved.');
    } finally { if (timer) clearTimeout(timer); }
  }
  const mutate = (change, { epoch = null } = {}) => critical(() => step(change, { epoch }));

  return { read, ready, mutate, critical };
}
