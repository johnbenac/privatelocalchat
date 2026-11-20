// Durable, proof-based coordination of the paired conversation stores (chatThreads + plc.encounters.v1). See ledger-store.mjs / thread-commit.mjs for use and
// store-m/safety-plan.md for the transition table.
//
// WHY: the Web Lock orders the tabs, not what each tab's storage cache has received (a tab can hold the lock and still read a value that is a few ms old). Nothing ephemeral and no
// amount of elapsed time proves a view fresh, so authority is a small DURABLE record in IndexedDB (compare-and-set on `gen`; every tab sees its transactions in order). It holds only
// digests (SHA-256 of the exact stored text of each key, '-' = absent), an op id and counters: never a payload.
//
//   stable: { v:1, gen, state:'stable', keys, last:{op,outcome}|null, at, doc }          keys = the last ACKNOWLEDGED pair
//   open:   { v:1, gen, state:'open', op, keys(P0), ph:[P0..Pn(,B)], fw, bk, pos:[pair..], at, doc }
//           ph = every coherent phase pair of the operation (recorded BEFORE its first raw write), fw = last forward index, bk = index of the rollback pair (or null),
//           pos = the pairs the real storage may hold right now (invariant: real is in pos; widened by a CAS BEFORE every raw write).
//
// A stable view is trusted only if it is EXACTLY `keys`; an open view only if it is a member of `pos`. Anything else is never adopted: bounded wait for the (already landed) write to
// become visible, then a refusal that writes nothing. Time never authorises anything. Only the stable CAS acknowledges.
//
//   acquire()                  inside the lock, before any decision -> { ok:true, pending? } | { ok:false, code }
//   begin(patches,{op,back})   BEFORE the first raw write: patches = ordered { key: text|null } steps; back = patch of the rollback pair (relative to P0)
//   beforeWrite(i)             BEFORE raw write number i (1..fw)
//   ack(outcome)               the acknowledgement point (stable CAS); the view must be the pair it names
//   resolve({target,texts,order,write}) finish an interrupted op: forward to the last phase or back to the rollback pair, only through phase pairs
const DB_NAME = 'plc-encounters-coord', STORE = 'state', RECORD = 'main';
const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const UNAVAILABLE = 'This browser could not update the record that keeps saved chats safe across tabs, so the result is not confirmed. Try again; if it keeps happening, reload the app.';

export async function sha256Hex(text) {
  if (text == null) return '-';
  const bytes = new TextEncoder().encode(String(text));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The browser's IndexedDB: one record, compare-and-set by `gen` inside one readwrite transaction (complete = committed, visible to every tab's next transaction). */
export function idbBackend(idb = globalThis.indexedDB) {
  let opening = null;
  const open = () => opening || (opening = new Promise((resolve, reject) => {
    if (!idb) { reject(new Error('no indexedDB')); return; }
    const request = idb.open(DB_NAME, 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { try { db.close(); } catch { /* ignore */ } opening = null; }; resolve(db); };
    request.onerror = () => reject(request.error || new Error('indexedDB open failed'));
    request.onblocked = () => reject(new Error('indexedDB open blocked'));
  }).catch((error) => { opening = null; throw error; }));
  const run = async (mode, work) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      let result, tx; try { tx = db.transaction(STORE, mode); } catch (error) { opening = null; reject(error); return; }
      const store = tx.objectStore(STORE);
      try { result = work(store, tx); } catch (error) { try { tx.abort(); } catch { /* ignore */ } reject(error); return; }
      tx.oncomplete = () => resolve(result.get());
      tx.onerror = () => reject(tx.error || new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error || new Error('indexedDB transaction aborted'));
    });
  };
  return {
    kind: 'indexedDB',
    get: () => run('readonly', (store) => { const r = store.get(RECORD); return { get: () => r.result ?? null }; }),
    clear: () => run('readwrite', (store) => { store.delete(RECORD); return { get: () => true }; }),
    cas: (expectGen, record) => run('readwrite', (store) => {
      const outcome = { applied: false };
      const read = store.get(RECORD);
      read.onsuccess = () => {
        const cur = read.result ?? null;
        if ((cur ? cur.gen : null) === expectGen) { store.put(record, RECORD); outcome.applied = true; }
      };
      return { get: () => outcome.applied };
    }),
  };
}

/** TEST STAND-IN for the IndexedDB record: strongly consistent, optionally failing. `failing.get` / `failing.cas` make that call throw; `failing.casAfter` = apply the CAS then throw (lost reply). */
export function memoryBackend() {
  let rec = null; const failing = { get: false, cas: false, casAfter: false, casCount: null };
  const lag = () => new Promise((r) => setTimeout(r, 0));
  return {
    kind: 'memory-stand-in', failing, log: [],
    get: async () => { await lag(); if (failing.get) throw new Error('coordination store unavailable'); return rec ? JSON.parse(JSON.stringify(rec)) : null; },
    cas: async function (expectGen, record) {
      await lag();
      if (failing.cas) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' });
      if (typeof failing.casCount === 'number') { if (failing.casCount <= 0) throw Object.assign(new Error('quota'), { name: 'QuotaExceededError' }); failing.casCount--; }
      if ((rec ? rec.gen : null) !== expectGen) return false;
      rec = JSON.parse(JSON.stringify(record)); this.log.push({ gen: rec.gen, state: rec.state });
      if (failing.casAfter) throw new Error('reply lost');
      return true;
    },
    clear: async () => { rec = null; },
    peek: () => (rec ? JSON.parse(JSON.stringify(rec)) : null), poke: (r) => { rec = r; },
  };
}

/** TEST STAND-IN (plain Node only, never chosen in a browser): ONE process-local record per storage object. A raw edit of the storage by a test is NOT adopted: an inert synthetic fixture reseeds the authority explicitly with resetStandIn(). */
const standIns = new WeakMap();
export function standInFor(storage, options) {
  if (!storage || typeof storage !== 'object') return null;
  let c = standIns.get(storage);
  if (!c) { const backend = memoryBackend(); c = createCoordination({ backend, freshMs: 20, ...options }); c.backend = backend; standIns.set(storage, c); }
  return c;
}
/** Synthetic setup only (never a production fallback): forget the stand-in's authority so the next hold bootstraps from the fixture. */
export function resetStandIn(storage) { const c = standIns.get(storage); if (c) { c.backend.poke(null); c.reset(); } }

const isDigest = (d) => typeof d === 'string' && (d === '-' || /^[0-9a-f]{64}$/.test(d));
const pairOk = (p, keys) => p && typeof p === 'object' && keys.every((k) => isDigest(p[k]));
const yieldTask = () => new Promise((resolve) => {
  if (typeof MessageChannel === 'function') { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); resolve(); }; c.port2.postMessage(0); } else setTimeout(resolve, 0);
});
const nap = (ms) => new Promise((r) => setTimeout(r, ms));
const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
const MAX = Number.MAX_SAFE_INTEGER - 4;

/**
 * keys: the storage keys of the pair; read(key) -> stored text | null (synchronous, the tab's own view).
 * freshMs: how long a not-yet-matching view is given to show a write that has provably landed. It authorises nothing: when it ends the call refuses.
 */
export function createCoordination({ backend, keys, read, hasIntent = () => false, now = () => Date.now(), freshMs = 2500 } = {}) {
  const doc = Math.random().toString(36).slice(2, 10);
  const cache = new Map();
  let cur = null;
  let own = null;                                 // the op id THIS hold began (its own view then proves what it wrote: read-your-writes)
  let seq = 0;

  async function digestOf(key, raw) { const c = cache.get(key); if (c && c.raw === raw) return c.d; const d = await sha256Hex(raw); cache.set(key, { raw, d }); return d; }
  const raws = () => Object.fromEntries(keys.map((k) => { try { return [k, read(k)]; } catch { return [k, null]; } }));
  async function view() { const r = raws(); const out = {}; for (const k of keys) out[k] = await digestOf(k, r[k]); return out; }
  const same = (a, b) => keys.every((k) => (a[k] ?? '-') === (b[k] ?? '-'));
  const member = (list, v) => list.some((p) => same(p, v));
  const valid = (r) => {
    if (!r || typeof r !== 'object' || r.v !== 1 || !Number.isSafeInteger(r.gen) || r.gen < 0 || !pairOk(r.keys, keys)) return false;
    if (r.state === 'stable') return r.last == null || (typeof r.last.op === 'string' && (r.last.outcome === 'applied' || r.last.outcome === 'rolled-back'));
    if (r.state !== 'open' || typeof r.op !== 'string' || !Array.isArray(r.ph) || r.ph.length < 2 || !r.ph.every((p) => pairOk(p, keys)) || !same(r.ph[0], r.keys)) return false;
    if (!Number.isSafeInteger(r.fw) || r.fw < 1 || r.fw >= r.ph.length) return false;
    if (r.bk != null && (!Number.isSafeInteger(r.bk) || r.bk <= r.fw || r.bk >= r.ph.length)) return false;
    return Array.isArray(r.pos) && r.pos.length > 0 && r.pos.every((p) => pairOk(p, keys));
  };
  // the forward phases ph[0..fw] are pairwise distinct and no key ever returns to an earlier value (consecutive equal values = the key was not written in that phase)
  const forwardOnly = (r) => {
    const seq = r.ph.slice(0, r.fw + 1);
    if (!seq.every((p, i) => seq.findIndex((q) => same(p, q)) === i)) return false;
    return keys.every((k) => { const seen = new Set(); let last; for (const p of seq) { const d = p[k] ?? '-'; if (d === last) continue; if (seen.has(d)) return false; seen.add(d); last = d; } return true; });
  };
  const safeCas = async (expect, record) => {
    try { return (await backend.cas(expect, record)) ? { ok: true } : fail('coordination-conflict', 'The conversation coordination record was changed by another tab, so the result is not confirmed. Try again.'); }
    catch { return fail('coordination-unavailable', UNAVAILABLE); }
  };
  const rec = (state, gen, extra) => ({ v: 1, gen, state, ...extra, at: now(), doc });
  const exhausted = () => cur && cur.gen >= MAX;

  async function acquire() {
    cur = null; own = null;
    let R; try { R = await backend.get(); } catch { return fail('coordination-unavailable', 'This browser could not read the record that keeps saved chats safe across tabs, so nothing was saved. Try again; if it keeps happening, reload the app.'); }
    if (R && R.v > 1) return fail('coordination-newer', 'The coordination record was made by a newer version of the app, so this version saves nothing until it is reloaded.');
    if (R && !valid(R)) return fail('coordination-malformed', 'The record that keeps saved chats safe across tabs is not readable, so nothing was saved.');
    let v = await view();
    if (!R) {
      // first hold ever on this browser: the view is trusted ONCE (single-build data). An interrupted journal with no record behind it cannot be proven: refused, never adopted by age.
      if (hasIntent()) return fail('coordination-absent-journal', 'An interrupted save was left by a version of the app that did not keep the safety record, so this tab does not guess what it stored. Nothing was saved.');
      const made = rec('stable', 1, { keys: v, last: null }); const r = await safeCas(null, made); if (!r.ok) return r; cur = made; return { ok: true, bootstrapped: true };
    }
    if (R.gen >= MAX) return fail('exhausted', 'The coordination counter has used every safe integer; saving is refused.');
    const accepted = (x) => (R.state === 'stable' ? same(x, R.keys) : member(R.pos, x));
    // a write that has provably landed becomes visible: wait for it (bounded). Elapsed time never makes ANY other view acceptable.
    let end = clock() + freshMs, spins = 0;
    while (!accepted(v) && clock() < end) { await (spins++ < 40 ? yieldTask() : nap(5)); v = await view(); }
    if (!accepted(v)) {
      return R.state === 'stable'
        ? fail('stale-view', 'This tab cannot yet see the latest saved chats (another tab just saved). Nothing was saved; try again, or reload the app if it keeps happening.')
        : fail('recovery-unproven', 'An earlier save was interrupted and this tab cannot yet see what it stored. Nothing from this tab was saved; try again in a moment, or reload the app.');
    }
    cur = R;
    // `last`: a read-only copy of the acknowledged operation of the record ALREADY validated above (never a second read of the backend)
    if (R.state === 'stable') return { ok: true, last: R.last ? Object.freeze({ op: R.last.op, outcome: R.last.outcome }) : null };
    return { ok: true, pending: { op: R.op, record: R, viewPair: v, viewIndex: R.ph.findIndex((p) => same(p, v)) } };
  }

  /** BEFORE the first raw write of an operation. patches: ordered { key: text|null }; back: { key: text|null } relative to P0 = the rollback pair (optional). */
  async function begin(patches, { op = null, back = null } = {}) {
    if (!cur || cur.state !== 'stable') return fail('coordination-unavailable', 'No coordination record is held.');
    if (exhausted()) return fail('exhausted', 'The coordination counter has used every safe integer; saving is refused.');
    const ph = [{ ...cur.keys }];
    const text = {};
    for (const patch of patches) { const p = { ...ph[ph.length - 1] }; for (const k of Object.keys(patch)) { p[k] = await digestOf(k, patch[k]); text[k] = patch[k]; } ph.push(p); }
    const fw = ph.length - 1; let bk = null;
    if (back) { const p = { ...ph[0] }; for (const k of Object.keys(back)) p[k] = await digestOf(k, back[k]); ph.push(p); bk = ph.length - 1; }
    const next = rec('open', cur.gen + 1, { op: op || `op-${doc}-${++seq}`, keys: ph[0], ph, fw, bk, pos: [ph[0]] });
    const r = await safeCas(cur.gen, next); if (!r.ok) return r;
    cur = next; own = next.op; return { ok: true, op: next.op, fw, bk };
  }

  /** BEFORE raw write number i: the real storage is then in ph[i-1] (read-your-writes proved it) or ph[i]. */
  async function beforeWrite(i, from = i - 1) {
    if (!cur || cur.state !== 'open' || !cur.ph[i] || !cur.ph[from]) return fail('coordination-unavailable', 'No operation is open.');
    if (exhausted()) return fail('exhausted', 'The coordination counter has used every safe integer; saving is refused.');
    const pos = [cur.ph[from]]; if (!member(pos, cur.ph[i])) pos.push(cur.ph[i]);
    const next = { ...cur, gen: cur.gen + 1, pos, at: now(), doc };    // pos = every pair that can be real; a view never narrows it (repeated identical pairs make a view ambiguous in time)
    const r = await safeCas(cur.gen, next); if (!r.ok) return r;
    cur = next; return { ok: true };
  }

  /**
   * The acknowledgement point. 'applied' = the last forward pair, 'rolled-back' = the rollback pair or the start pair. By default the tab's OWN view must be exactly that pair, which proves it only
   * for an operation THIS hold began (it wrote it: read-your-writes). An operation left by an earlier holder is acknowledged only by resolve(), which has written or proved every key itself.
   */
  async function ack(outcome = 'applied', { pending = false } = {}) {
    if (!cur || cur.state !== 'open') return { ok: true };
    // an operation of an EARLIER holder: a view proves nothing about the physical state (it can lag, and an identical pair can recur), so it may acknowledge only when EVERY pair that can be
    // real is already the last forward pair; never a rollback. Otherwise only resolve(), which wrote or proved every key itself, acknowledges.
    if (own !== cur.op && !(pending && outcome === 'applied' && cur.pos.every((p) => same(p, cur.ph[cur.fw])))) return fail('unknown-outcome', 'The state of an earlier interrupted save is not proven by this tab\'s own view.');
    const v = await view();
    const idx = outcome === 'applied' ? cur.fw : (cur.bk != null && same(v, cur.ph[cur.bk])) ? cur.bk : same(v, cur.ph[0]) ? 0 : cur.bk;
    if (idx == null) return fail('coordination-unavailable', 'No such outcome.');
    if (!same(v, cur.ph[idx])) return fail('unknown-outcome', 'This tab cannot confirm what is stored, so the result is not confirmed.');
    return ackTo(idx, outcome);
  }
  async function ackTo(idx, outcome) {
    if (exhausted()) return fail('exhausted', 'The coordination counter has used every safe integer; saving is refused.');
    const next = rec('stable', cur.gen + 1, { keys: cur.ph[idx], last: { op: cur.op, outcome } });
    const r = await safeCas(cur.gen, next); if (!r.ok) return r;
    cur = next; own = null; return { ok: true };
  }

  /**
   * Finish an interrupted operation. target 'forward' | 'back'; texts = { key: exact text to store | null (remove) } for the keys it may need (each is verified against the recorded digest);
   * order = write order; write(key, text) = the raw write (must read back). Only phase pairs may ever be the real state: if some intermediate is not one, or a needed text is missing,
   * nothing is written ('recovery-unproven').
   */
  async function resolve({ target, texts, order, write }) {
    if (!cur || cur.state !== 'open') return fail('coordination-unavailable', 'No operation is open.');
    const idx = target === 'forward' ? cur.fw : target === 'start' ? 0 : cur.bk;
    if (idx == null) return fail('recovery-unproven', 'No such resolution.');
    // EVERY recorded pair is possible. A view (which may lag, and may equal a pair that is also the start or the rollback pair) narrows the set in ONE sound case only: no recovery write was
    // ever authorised for this operation (`rec` unset) and its forward phases never repeat a value, so the only writer so far is the original holder moving strictly forward and a view equal to
    // the later pair of pos proves nothing earlier can still be real. Once a recovery CAS exists (rec) identical pairs can recur in time and a view proves nothing about the physical state.
    // A key is skipped below only when it already equals the target in every possible pair; otherwise it is written again (idempotent), write-ahead.
    const v0 = await view();
    const strictlyForward = !cur.rec && forwardOnly(cur) && cur.pos.every((p) => cur.ph.slice(0, cur.fw + 1).some((q) => same(p, q)));
    let poss = strictlyForward && cur.pos.length > 1 && same(v0, cur.pos[cur.pos.length - 1]) ? [{ ...cur.pos[cur.pos.length - 1] }] : cur.pos.map((p) => ({ ...p }));
    const T = cur.ph[idx];
    // the texts this tab can supply, by digest (a text is used only if its digest is a RECORDED value of that key; absent = null is always available). `texts[key]` is one text or a list of them.
    const known = {};
    for (const k of keys) {
      const m = new Map([['-', null]]); const t = texts && k in texts ? texts[k] : undefined;
      for (const x of Array.isArray(t) ? t : t === undefined ? [] : [t]) m.set(await digestOf(k, x), x);
      known[k] = m;
    }
    // plan: the SHORTEST sequence of single-key writes that takes EVERY possible pair to the target, where every possible set along the way consists only of recorded phase pairs (so a death after
    // any write leaves a state the next recoverer can resolve). A write may regress a possible later pair to an earlier phase pair; it never creates an unrecorded one.
    const sig = (s) => s.map((p) => keys.map((k) => p[k] ?? '-').join('|')).sort().join('#');
    const dedupe = (s) => { const out = []; for (const p of s) if (!member(out, p)) out.push(p); return out; };
    const steps = [];
    if (!poss.every((p) => same(p, T))) {
      const seen = new Set([sig(poss)]); let frontier = [{ poss, path: [] }], found = null;
      for (let depth = 0; depth < 8 && !found && frontier.length; depth++) {
        const nextFrontier = [];
        for (const node of frontier) {
          for (const k of order) for (const [d, text] of known[k]) {
            if (!cur.ph.some((p) => (p[k] ?? '-') === d)) continue;
            const after = dedupe(node.poss.map((p) => ({ ...p, [k]: d })));
            const s = sig(after); if (seen.has(s) || !after.every((p) => member(cur.ph, p))) continue;
            seen.add(s); const path = [...node.path, { k, text, before: node.poss, after }];
            if (after.every((p) => same(p, T))) { found = path; break; }
            nextFrontier.push({ poss: after, path });
          }
          if (found) break;
        }
        frontier = nextFrontier;
      }
      if (!found) return fail('recovery-unproven', 'The state needed to finish the interrupted save is not available here, or finishing it from this view could leave an unprovable state, so nothing was changed.');
      steps.push(...found);
    }
    for (const s of steps) {
      const pos = [...s.before]; for (const p of s.after) if (!member(pos, p)) pos.push(p);
      const next = { ...cur, gen: cur.gen + 1, pos, rec: true, at: now(), doc };      // rec: a recovery write is now authorised, so a view can never narrow pos again
      const c = await safeCas(cur.gen, next); if (!c.ok) return c;
      cur = next;
      if (!write(s.k, s.text)) return fail('recover-failed', 'An interrupted save could not be finished.');
    }
    // every key is now proven: written by this tab (read back) or equal to the target in every possible real pair
    const outcome = target === 'forward' ? 'applied' : 'rolled-back';
    const a = await ackTo(idx, outcome);
    return a.ok ? { ok: true, outcome } : a;
  }

  async function forget() { cur = null; try { await backend.clear?.(); return true; } catch { return false; } }
  const reset = () => { cur = null; };
  const guarded = (f) => async (...args) => { try { return await f(...args); } catch { return fail('coordination-unavailable', 'This browser could not check that saved chats are up to date (it needs a secure page with IndexedDB), so nothing was saved.'); } };
  return { acquire: guarded(acquire), begin: guarded(begin), beforeWrite: guarded(beforeWrite), ack: guarded(ack), resolve: guarded(resolve), view, forget, reset,
    openOp: () => (cur && cur.state === 'open' ? cur.op : null), kind: backend.kind || 'custom', doc, backend };
}
