// Saving conversations: the writer boundary where chatThreads and the encounter ledger change together.
//
// WHY: chatThreads used to be written whole from one tab's memory by every ordinary path (send, edit, regenerate, branch, import, delete, trash, clear...). Two tabs could therefore erase
// each other's saved messages, and a lock on the ledger alone cannot help (the transcript is the ledger's source, and it was already gone). Now every save is one commit, in ONE lock hold:
//   1. take the Web Lock "plc-encounters"; read chatThreads and the ledger FRESH; finish any interrupted earlier commit (recover);
//   2. fence: a tab whose epoch is not the ledger's (history was cleared elsewhere) writes nothing ('stale');
//   3. apply this tab's PATCH (what it changed since it last synchronised) to the fresh stored conversations (chat/encounters/thread-patch.mjs): other tabs' conversations and messages
//      are never touched, an edit of something that changed elsewhere is an explicit per-conversation conflict (not written, reported), a deleted conversation is not resurrected;
//   4. derive the ledger events from the fresh stored copy and the patched copy (chat/encounters/thread-events.mjs);
//   5. write ledger WITH an `intent` (what is about to be written, how to undo the record changes), then chatThreads, then the ledger without the intent (and with the records of removed
//      conversations swept). A crash between the writes leaves the intent; the next lock holder recovers it BEFORE anything is read: the stored conversations decide (all intended
//      conversations present -> roll forward, otherwise the added records are undone).
// chatThreads keeps its array format; only its writer changed. Temporary conversations are never part of base, patch or ledger (memory only).
//
// REFUSALS (nothing in any shared key is written; the tab's own copy and the person's input stay as they are, so a retry is possible):
//   * no Web Locks ('unsupported'), a read-only tab ('read-only'), a chat store held for a newer version ('blocked'): request and clearAll alike;
//   * a ledger that is malformed or unreadable ('malformed' / 'unreadable'): it is NOT a recognised newer store, so it is never treated as "no ledger";
//   * a failed ledger-intent write ('records-write-failed') or one whose readback is not what was written ('unknown-outcome'): the paired chat mutation is not made, and nothing is
//     ever "rolled back" over a value this code did not just write.
// The ONE exception is a recognised NEWER ledger (v above this version): a distinct blocked store. Chat saving continues here, still inside the lock and still as a patch (compare and set),
// with attribution unavailable (recording 'newer') and zero ledger mutation; an explicit transcript receive, which needs the ledger, is refused. Clear history likewise only removes chats.
//
// prepare(): the host calls it (awaited) BEFORE it reads chatThreads for the screen, so an interrupted earlier commit is finished under the lock before anything is consumed.
import { diffThread, applyDiff, applyRemoval, clone } from './thread-patch.mjs';
import { observeThread } from './thread-events.mjs';
import { sigOf, emptyLedger, sweepThreads, diffLedger, applyUndo, ensureEncounter, recordEvent, newUuid, personId, assistantId } from './records.mjs';

const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const LIVE = new Set(['streaming', 'preparing']);
const NO_LOCKS = 'This browser cannot keep chats and conversation records safely when the app is open in more than one tab (it lacks Web Locks), so changes are not saved. Nothing was changed.';
const BLOCKED = 'Your saved chats were made by a newer version of the app, so this version leaves them as they are.';

export function createThreadCommit({ storage, store, key = 'chatThreads', activeKey = 'plc.activeThread.v1', locks = globalThis.navigator?.locks, normalize = (t) => t, getThreads, isBlocked = () => false, now = () => Date.now(), onResult = () => {}, onPhase = () => {} } = {}) {
  const locksOk = Boolean(locks?.request);
  const base = new Map();          // threadId -> canonical copy of what this tab last synchronised with storage
  let epoch = null;                // the ledger epoch this tab started with (null: no usable ledger)
  const hints = { imported: new Map(), branch: new Map(), planned: new Map() };   // imported: threadId -> mark number; planned: messageId -> { thread, spec }
  let hintSeq = 0;
  // MEMORY ONLY, per controller: the frozen effect of every attempt that began (coordination op open) and whose outcome this tab did not see acknowledged. Never stored anywhere.
  const attempts = new Map();      // op id -> { op, items: [{ id, tabCanon, sig, changed, absentBefore }], removals: [id], hints: { imported, branch, planned } }
  let tail = Promise.resolve(), queued = null, lastResult = null;

  // canonical form: the app's own normaliser, but a message still being written keeps its live status (it is not an interrupted one yet)
  function canon(t) {
    const n = normalize(clone(t));
    if (!n) return n;
    const live = new Map((t.messages || []).map((m) => [m.id, m]));
    for (const m of n.messages || []) {
      const raw = live.get(m.id); if (!raw) continue;
      if (LIVE.has(raw.status)) m.status = raw.status;
      if (Array.isArray(m.versions) && Array.isArray(raw.versions)) m.versions.forEach((v, i) => { if (LIVE.has(raw.versions[i]?.status)) v.status = raw.versions[i].status; });
    }
    return n;
  }
  function readStored() {
    let raw; try { raw = storage.getItem(key); } catch { return fail('unreadable', 'Your saved chats could not be read from this browser’s storage, so nothing was changed.'); }
    if (raw == null || raw === '') return { ok: true, list: [] };
    try { const list = JSON.parse(raw); if (Array.isArray(list)) return { ok: true, list }; } catch { /* below */ }
    return fail('malformed', 'Your saved chats are not in a form this version can read, so they were left exactly as they are and nothing was changed.');
  }

  function parseStored(raw) {
    if (raw == null || raw === '') return { ok: true, list: [] };
    try { const list = JSON.parse(raw); if (Array.isArray(list)) return { ok: true, list }; } catch { /* below */ }
    return fail('malformed', 'Your saved chats are not in a form this version can read, so they were left exactly as they are and nothing was changed.');
  }
  /**
   * Call right after the conversations were loaded: remember what storage held, and the epoch. `raw` is the EXACT text the host just read and showed (no second read of storage): the baseline is
   * built from the same bytes the screen was built from. Without `raw` the key is read now (tests, tools).
   */
  function init(raw) {
    base.clear(); attempts.clear();
    const s = raw === undefined ? readStored() : parseStored(raw);
    if (s.ok) for (const t of s.list) if (t && typeof t.id === 'string' && !t.temporary) { const c = canon(t); if (c) base.set(c.id, c); }
    const l = store.read(); epoch = l.ok ? l.ledger.epoch : null;
    return { threads: base.size, epoch };
  }

  // ---- recovery -------------------------------------------------------------------------------------------------------------------
  // WITH coordination an interrupted operation is finished from the durable record (store.settlePending: phase pairs, write-ahead, stable ACK). The decision by the stored chats alone (below) is
  // used ONLY when no coordination protects the hold (an exclusive encrypted writer whose storage cannot lag, or the explicit unprotected test control): a lagging view could mislead it otherwise.
  async function recoverUncoordinated(tx, ledger) {
    const intent = ledger.intent;
    const d = clone(ledger); delete d.intent;
    if (intent.kind === 'clear') {
      try { storage.removeItem(key); storage.removeItem(activeKey); } catch { return fail('recover-failed', 'An interrupted Clear history could not be finished.'); }
      return { ...tx.write(d), recovered: 'clear-forward' };
    }
    const s = readStored(); if (!s.ok) return s;
    const byId = new Map(s.list.map((t) => [t?.id, t]));
    const forward = Object.entries(intent.threads || {}).every(([id, v]) => byId.has(id) && sigOf(byId.get(id)) === v.sig) && (intent.removed || []).every((id) => !byId.has(id));
    if (forward) sweepThreads(d, intent.sweep || intent.removed || []); else applyUndo(d, intent.undo || {});
    return { ...tx.write(d), recovered: forward ? 'forward' : 'back' };
  }
  /** Before anything is decided in a hold: finish what an earlier hold left open. -> { ok, recovered } | refusal */
  async function recover(tx) {
    const L = tx.read();
    if (tx.pending) {
      const wasClear = L.ok && L.ledger.intent?.kind === 'clear';
      const op = tx.pending.op;
      const r = await store.settlePending(tx); if (!r.ok) return r;
      if (wasClear && r.outcome === 'applied') { try { storage.removeItem(activeKey); } catch { /* the chats are gone; the pointer is only a hint */ } }
      return { ok: true, recovered: r.recovered || (r.outcome === 'applied' ? 'forward' : 'back'), settled: { op, outcome: r.outcome } };
    }
    if (L.ok && L.ledger.intent) {
      if (tx.coordinated) return fail('recovery-unproven', 'An interrupted save was left by a version of the app that did not keep the safety record, so this tab does not guess what it stored. Nothing was saved.');
      return recoverUncoordinated(tx, L.ledger);
    }
    return { ok: true, recovered: null };
  }

  // ---- one commit -----------------------------------------------------------------------------------------------------------------
  // `defer(fn)`: what may change this tab's baseline (base, hints) runs ONLY after the stable ACK (run() calls it once store.critical returned ok). An unconfirmed result leaves the baseline
  // untouched, so the next save recomputes the same patch (already stored = no change) and can never erase or duplicate the unconfirmed durable change.
  async function commitStep(tx, defer, attempt = () => {}) {
    onPhase('in-lock');
    const result = { ok: true, conflicts: [], refused: [], duplicates: [], recording: 'ok', wrote: false, recovered: null };
    let L = tx.read(), settled = null;
    if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);   // malformed / unreadable: not a recognised newer store, so nothing is saved without its records
    if (tx.pending || (L.ok && L.ledger.intent)) {
      const r = await recover(tx);
      if (!r.ok) return fail(r.code, r.message, r.unknown ? { unknown: r.unknown } : {});
      result.recovered = r.recovered; settled = r.settled || null; L = tx.read();
      if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);
    }
    let s = readStored(); if (!s.ok) return s;
    if (L.ok && epoch != null && L.ledger.epoch !== epoch) return fail('stale', 'Your chat history was cleared in another tab. Reload this tab to continue; nothing from this tab was saved.', { epoch: L.ledger.epoch });
    const ledger = L.ok ? L.ledger : null;
    if (!L.ok) result.recording = 'newer';
    const storedById = new Map(s.list.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
    const tabThreads = (getThreads() || []).filter((t) => t && typeof t.id === 'string' && !t.temporary);

    // an earlier attempt of THIS tab whose acknowledgement it never saw: settle its frozen effect from validated durable evidence BEFORE hints are checked and the next patch is calculated
    const unproven = reconcile(tx, settled, storedById);

    // explicit received messages: check them against the fresh ledger first, so a refused or replayed one never reaches the transcript
    // (a replay of an occurrence already held returns that original record and changes nothing; the same occurrence with other bytes is a conflict)
    if (hints.planned.size) {
      const scratch = ledger ? clone(ledger) : null;
      for (const [mid, p] of [...hints.planned]) {
        const thread = tabThreads.find((t) => t.id === p.thread);
        if (!thread || !thread.messages.some((m) => m.id === mid)) { hints.planned.delete(mid); continue; }
        const drop = () => { thread.messages.splice(thread.messages.findIndex((m) => m.id === mid), 1); hints.planned.delete(mid); };
        if (!scratch) { result.refused.push({ message: mid, thread: p.thread, code: 'attribution-unavailable', dropped: true, detail: 'The saved conversation records were made by a newer version of the app, so an attributed message cannot be recorded here.' }); drop(); continue; }
        const e = ensureEncounter(scratch, p.thread, now());
        p.eventId = p.eventId || 'ev:' + newUuid();     // the same id in this check and in the real record below, so a same-commit replay can name the original
        const r = e.ok ? recordEvent(scratch, { id: p.eventId, thread: p.thread, speaker: p.spec.speaker, expression: p.spec.expression, modality: p.spec.modality, standing: p.spec.standing || 'reported', text: p.spec.text, occurrence: p.spec.occurrence,
          audience: p.spec.audience, outcome: p.spec.outcome || 'received', derivedFrom: p.spec.derivedFrom, corrects: p.spec.corrects, clock: p.spec.clock, message: mid }, now()) : e;
        if (!r.ok) { result.refused.push({ message: mid, thread: p.thread, code: r.code, dropped: true, detail: r.message }); drop(); }
        else if (r.duplicate) { result.duplicates.push({ message: mid, thread: p.thread, event: clone(r.event) }); drop(); }
      }
    }

    const tabIds = new Set(tabThreads.map((t) => t.id));
    const plans = [], removals = [];
    for (const t of tabThreads) {
      const tabCanon = canon(t); if (!tabCanon) continue;
      const diff = diffThread(base.get(t.id) || null, tabCanon);
      if (!diff) continue;
      const st = storedById.get(t.id);
      // a conversation an earlier attempt may have created, now absent: rolled back, or stored and then deleted? Not provable -> explicit refusal (never recreated, the draft stays)
      if (!st && unproven.has(t.id)) { result.conflicts.push({ thread: t.id, code: 'unproven-baseline', detail: 'An earlier save of this conversation was not confirmed and it is no longer stored, so it is not created again.' }); continue; }
      const applied = applyDiff(st ? canon(st) : null, diff);
      if (!applied.ok) { result.conflicts.push({ thread: t.id, code: applied.code, detail: applied.detail }); continue; }
      plans.push({ id: t.id, stored: st ? canon(st) : null, patched: applied.thread, changed: applied.changed, tabCanon, existed: Boolean(st) });
    }
    for (const [id, b] of base) {
      if (tabIds.has(id)) continue;
      const st = storedById.get(id);
      const r = applyRemoval(st ? canon(st) : null, b);
      if (!r.ok) result.conflicts.push({ thread: id, code: r.code, detail: r.detail }); else removals.push({ id, present: r.removed });
    }

    const changedPlans = plans.filter((p) => p.changed || !p.existed);
    const removedIds = removals.filter((r) => r.present).map((r) => r.id);
    const finishBase = () => { for (const p of plans) base.set(p.id, p.tabCanon); for (const r of removals) base.delete(r.id); };
    if (!changedPlans.length && !removedIds.length) {
      const capNoChange = captureHints(plans);
      defer(() => { finishBase(); releaseHints(capNoChange); });
      if (ledger && removals.length) {   // already gone elsewhere: only the leftover records
        const d = clone(ledger);
        if (sweepThreads(d, removals.map((r) => r.id)).removed) {
          const b = await tx.begin([{ [tx.key]: tx.preview(d) }], { back: { [tx.key]: L.raw } }); if (!b.ok) return fail(b.code, b.message);
          const bw = await tx.beforeWrite(1); if (!bw.ok) return fail(bw.code, bw.message);
          if (tx.write(d).ok) result.wrote = true;
        }
      }
      return result;
    }

    // the new list: stored order kept, only this tab's changed conversations replaced, its removals dropped, its new conversations appended
    const patchedById = new Map(changedPlans.map((p) => [p.id, p.patched]));
    const gone = new Set(removedIds);
    const newList = [];
    for (const raw of s.list) { const id = raw?.id; if (gone.has(id)) continue; newList.push(patchedById.has(id) ? patchedById.get(id) : raw); }
    for (const p of changedPlans) if (!p.existed) newList.push(p.patched);

    // the effect of THIS attempt, frozen (cloned) in the same synchronous step as the plan: exactly the hints it consumes (by identity) and the canonical copies of what it touched.
    // It is bound to the coordination op once that is begun, BEFORE any raw write, and is applied only when that op is known applied (stable ACK, validated recovery or receipt, or evidence).
    const hintCap = captureHints(changedPlans);
    const frozenItems = plans.map((p) => ({ id: p.id, tabCanon: clone(p.tabCanon), sig: sigOf(p.patched), changed: changedPlans.includes(p), absentBefore: !base.has(p.id) }));
    const frozenRemovals = removals.map((r) => r.id);
    let effect = null;
    const freeze = (op) => { effect = { op, items: frozenItems, removals: frozenRemovals, hints: hintCap }; attempt(effect); };

    // the records
    let draft = null, intentLedger = null, intentText = null, opIdx = null, noLedgerOp = false;
    if (ledger) {
      draft = clone(ledger);
      for (const p of changedPlans) {
        const r = observeThread(draft, { thread: p.patched, stored: p.stored, now: now(), hints: { imported: hints.imported.has(p.id), branch: !p.existed ? hints.branch.get(p.id) : null, planned: plannedFor(p.id) } });
        for (const x of r.refused || []) result.refused.push({ ...x, thread: p.id });
      }
      const undo = diffLedger(ledger, draft);
      const intent = { id: newUuid(), kind: 'commit', startedAt: now(), threads: Object.fromEntries(changedPlans.map((p) => [p.id, { sig: sigOf(p.patched) }])), removed: removedIds, sweep: removals.map((r) => r.id), undo };
      // the coherent phase pairs of this operation, recorded durably BEFORE any raw write: P1 = ledger with intent, P2 = + the new chats, P3 = final ledger; B = the rollback ledger (undo applied)
      const intentAfter = { ...draft, intent, rev: draft.rev + 1 };
      const finPre = clone(intentAfter); delete finPre.intent; sweepThreads(finPre, removals.map((r) => r.id));
      const backPre = clone(intentAfter); delete backPre.intent; applyUndo(backPre, undo);
      const begun = await tx.begin([{ [tx.key]: tx.preview({ ...draft, intent }) }, { [key]: JSON.stringify(newList) }, { [tx.key]: tx.preview(finPre) }], { op: intent.id, back: { [tx.key]: tx.preview(backPre) } });
      if (!begun.ok) return fail(begun.code, begun.message, { conflicts: result.conflicts, refused: result.refused });
      opIdx = begun; freeze(begun.op);
      onPhase('planned');
      const bw1 = await tx.beforeWrite(1); if (!bw1.ok) return fail(bw1.code, bw1.message, { conflicts: result.conflicts, refused: result.refused, notStored: true });
      onPhase('wal-1');
      const w = tx.write({ ...draft, intent });
      if (!w.ok) {
        // the paired mutation is all or nothing: without the records' intent the chats are NOT written. Nothing is put back either (if the outcome is unclear a later lock holder settles an intent by what chatThreads holds).
        if (w.code === 'changed') return fail('unknown-outcome', 'The conversation records changed while this was being saved, so the result could not be confirmed. Your chats were not changed; check the chat and try again.', { conflicts: result.conflicts, refused: result.refused, notStored: true });
        return fail(w.code === 'write-failed' ? 'records-write-failed' : w.code, 'The conversation records could not be saved (storage may be full), so nothing from this save was kept: your chats are unchanged and the message is still here to try again.', { conflicts: result.conflicts, refused: result.refused, notStored: true });
      }
      intentLedger = w.ledger; intentText = w.text;
      onPhase('intent-written');
    } else {
      const begun = await tx.begin([{ [key]: JSON.stringify(newList) }], { back: {} });
      if (!begun.ok) return fail(begun.code, begun.message, { conflicts: result.conflicts, refused: result.refused });
      opIdx = begun; noLedgerOp = true; freeze(begun.op);
      onPhase('planned');
    }
    const text = JSON.stringify(newList);
    onPhase('before-threads');
    { const bw = await tx.beforeWrite(noLedgerOp ? 1 : 2); if (!bw.ok) return fail(bw.code, bw.message, { conflicts: result.conflicts, refused: result.refused, notStored: noLedgerOp }); }
    onPhase('wal-2');
    try { storage.setItem(key, text); } catch {
      // put the intent back ONLY while the ledger is still exactly the text this commit wrote a moment ago; anything else is someone else's newer value and is left for recovery
      let tidied = true;
      if (intentLedger) {
        const cur = tx.read();
        if (cur.ok && cur.raw === intentText) {
          const back = clone(intentLedger); delete back.intent; applyUndo(back, intentLedger.intent.undo);
          const bw = await tx.beforeWrite(opIdx.bk, 1);                       // write-ahead: the rollback pair is a recorded phase pair
          tidied = bw.ok && tx.write(back).ok;
        } else tidied = false;
      }
      return fail('threads-write-failed', 'This browser could not save your chats (its storage may be full or blocked). Nothing from this save was kept; the conversation on screen is unchanged.' + (tidied ? '' : ' The conversation records will be settled the next time the app saves.'), { notStored: true });
    }
    // read back: what is stored must be what was written for every conversation this commit touched
    const after = readStored();
    const verified = after.ok && changedPlans.every((p) => sigOf((after.list.find((t) => t?.id === p.id)) ?? null) === sigOf(p.patched)) && removedIds.every((id) => !after.list.some((t) => t?.id === id));
    if (!verified) return fail('changed', 'Your saved chats changed while this was being saved, so the result could not be confirmed.');
    onPhase('threads-written');
    result.wrote = true;
    if (intentLedger) {
      const fin = clone(intentLedger); delete fin.intent; sweepThreads(fin, removals.map((r) => r.id));
      const bw3 = await tx.beforeWrite(3); if (!bw3.ok) return fail(bw3.code, bw3.message, { conflicts: result.conflicts, refused: result.refused });
      onPhase('wal-3');
      const w2 = tx.write(fin);
      // never ok with the records unfinished: the chats are durable, the next holder finishes the records from the open record, and THIS caller is told the outcome is not confirmed
      if (!w2.ok) return fail('records-finish-failed', 'Your chats were saved but the conversation records could not be finished, so the save is not confirmed yet. Try again: it will not duplicate.');
      onPhase('finalized');
    }
    defer(() => applyEffect(effect));
    return result;
  }
  // ---- the frozen effect of an attempt ---------------------------------------------------------------------------------------------
  /** the hint entries (by identity) that exist for these conversations right now: exactly what a plan made in the same synchronous step consumes */
  function captureHints(list) {
    const ids = new Set(list.map((p) => p.id)), cap = { imported: [], branch: [], planned: [] };
    for (const id of ids) { if (hints.imported.has(id)) cap.imported.push([id, hints.imported.get(id)]); if (hints.branch.has(id)) cap.branch.push([id, hints.branch.get(id)]); }
    for (const [mid, pl] of hints.planned) if (ids.has(pl.thread)) cap.planned.push([mid, pl]);
    return cap;
  }
  /** drop only the captured entries, and only while they are still the very same entries: a hint queued after the attempt (a newer mark, a newer plan) is never consumed by it */
  function releaseHints(cap, only = null) {
    for (const [id, g] of cap.imported) if ((only == null || only === id) && hints.imported.get(id) === g) hints.imported.delete(id);
    for (const [id, h] of cap.branch) if ((only == null || only === id) && hints.branch.get(id) === h) hints.branch.delete(id);
    for (const [mid, pl] of cap.planned) if ((only == null || only === pl.thread) && hints.planned.get(mid) === pl) hints.planned.delete(mid);
  }
  /** the attempt is known applied: its frozen baseline becomes this tab's baseline (never the live thread), and an older unresolved attempt can no longer move those conversations back */
  function applyEffect(e) {
    const ids = new Set(e.items.map((i) => i.id));
    for (const i of e.items) base.set(i.id, clone(i.tabCanon));
    for (const id of e.removals) { base.delete(id); ids.add(id); }
    releaseHints(e.hints); attempts.delete(e.op);
    for (const [, o] of attempts) o.items = o.items.filter((i) => !ids.has(i.id));
  }
  /**
   * Settle earlier unresolved attempts from VALIDATED durable evidence only (inside the hold, before the next patch):
   *   * the op this hold just recovered (applied / rolled-back), or the stable record's last acknowledged op as coordination.acquire validated it -> applied: apply the frozen effect; rolled-back: discard it;
   *   * a later operation superseded the record: a touched conversation whose acquired, validated stored copy is exactly the attempt's own target is applied for that conversation alone.
   * Uncertainty never advances the baseline. -> the ids of conversations an unresolved attempt may have created that cannot be proven either way.
   */
  function reconcile(tx, settled, storedById) {
    const verdict = new Map();
    if (tx.receipt?.op) verdict.set(tx.receipt.op, tx.receipt.outcome);
    if (settled?.op) verdict.set(settled.op, settled.outcome);
    const unproven = new Set();
    for (const [op, e] of [...attempts]) {
      const v = verdict.get(op);
      if (v === 'applied') { applyEffect(e); continue; }
      if (v === 'rolled-back') { attempts.delete(op); continue; }
      if (!tx.coordinated) continue;
      e.items = e.items.filter((i) => {
        if (!i.changed) return true;
        const st = storedById.get(i.id);
        if (st && sigOf(st) === i.sig) { base.set(i.id, clone(i.tabCanon)); releaseHints(e.hints, i.id); return false; }
        if (i.absentBefore) unproven.add(i.id);
        return true;
      });
      if (!e.items.length && !e.removals.length) attempts.delete(op);
    }
    return unproven;
  }
  const plannedFor = (threadId) => { const o = {}; for (const [mid, p] of hints.planned) if (p.thread === threadId) o[mid] = { ...p.spec, id: p.eventId }; return o; };

  const finish = (r) => { lastResult = r; try { onResult(r); } catch { /* a listener must not stop saving */ } return r; };
  async function run() {
    if (isBlocked()) return finish(fail('blocked', BLOCKED));
    let after = null, begun = null;
    const r = await store.critical((tx) => commitStep(tx, (fn) => { after = fn; }, (e) => { begun = e; }));
    if (r && r.ok && after) after();               // the stable ACK happened: only now does this tab's baseline move
    // an attempt that began but was not acknowledged keeps its frozen effect (memory only) until its outcome is proven; a definite failure (nothing can have been stored) drops it
    else if (begun && (r?.unknown || r?.code === 'write-failed')) attempts.set(begun.op, begun);
    return finish(r);
  }

  /** Save now (coalesced): resolves with the result of a commit that started after this call. Every refusal is an explicit { ok: false, code } with no shared write. */
  function request() {
    if (isBlocked()) return Promise.resolve(finish(fail('blocked', BLOCKED)));
    if (!locksOk) return Promise.resolve(finish(fail('unsupported', NO_LOCKS)));
    if (queued) return queued;
    queued = tail.then(() => { queued = null; return run(); });
    tail = queued.catch(() => {});
    return queued;
  }

  /**
   * A ledger-only change (an explicit receiver: participants, holders, events with no transcript line) in the same lock, after any interrupted commit is recovered and the epoch fence.
   * `thread`: the change belongs to a stored conversation; refused (nothing recorded) if that conversation is not stored, so a delete or Clear can never be undone by a late record.
   * fn(draft) -> { result } | { refuse, message }
   */
  function mutateLedger(fn, { thread = null } = {}) {
    return store.critical(async (tx) => {
      let L = tx.read(); if (!L.ok) return L;
      if (tx.pending || L.ledger.intent) { const r = await recover(tx); if (!r.ok) return fail(r.code, r.message); L = tx.read(); if (!L.ok) return L; }
      if (epoch != null && L.ledger.epoch !== epoch) return fail('stale', 'Your chat history was cleared in another tab. Reload this tab to continue; nothing was recorded.', { epoch: L.ledger.epoch });
      if (thread) {
        const s = readStored(); if (!s.ok) return s;
        if (!s.list.some((t) => t?.id === thread)) return fail('no-such-conversation', 'That conversation is not saved (it was deleted, cleared or is temporary), so nothing was recorded.');
      }
      const draft = clone(L.ledger);
      const made = fn(draft) || {};
      if (made.refuse) return fail(made.refuse, made.message || 'Refused.', made.extra || {});
      if (JSON.stringify({ ...draft, rev: 0 }) === JSON.stringify({ ...L.ledger, rev: 0 })) return { ok: true, result: made.result, wrote: false, ledger: L.ledger };
      const begun = await tx.begin([{ [tx.key]: tx.preview(draft) }], { back: { [tx.key]: L.raw } }); if (!begun.ok) return begun;
      const bw = await tx.beforeWrite(1); if (!bw.ok) return bw;
      const w = tx.write(draft); if (!w.ok) return w;
      return { ok: true, result: made.result, wrote: true, ledger: w.ledger };
    });
  }

  /** Clear history: one fenced step in the same lock. Returns { ok } or an explicit refusal; the ledger's epoch moves on so no other tab can write the old history back. */
  async function clearAll() {
    if (isBlocked()) return fail('blocked', BLOCKED);          // same refusals as request(), BEFORE anything is read or removed
    if (!locksOk) return fail('unsupported', NO_LOCKS);
    await tail.catch(() => {});
    let after = null;
    const r = await store.critical(async (tx) => {
      onPhase('in-lock');
      let L = tx.read();
      if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);   // malformed / unreadable records: Clear history refuses rather than deleting chats beside records it cannot judge
      if (tx.pending || (L.ok && L.ledger.intent)) { const r = await recover(tx); if (!r.ok) return fail(r.code, r.message); L = tx.read(); if (!L.ok && L.code !== 'newer') return fail(L.code, L.message); }
      let written = null, nextEpoch = epoch, clearOp = null;
      if (L.ok) {
        const curEpoch = L.ledger.epoch || 0;
        if (curEpoch >= Number.MAX_SAFE_INTEGER) return fail('exhausted', 'The conversation records epoch is exhausted; history cannot be cleared further.');
        const fresh = { ...emptyLedger(curEpoch + 1), rev: L.ledger.rev, intent: { id: newUuid(), kind: 'clear', startedAt: now() } };
        const finPre = clone({ ...fresh, rev: fresh.rev + 1 }); delete finPre.intent;
        // phase pairs: P1 = clear intent in the ledger, P2 = chats removed, P3 = final ledger (epoch moved on); rollback = the old ledger text
        const b = await tx.begin([{ [tx.key]: tx.preview(fresh) }, { [key]: null }, { [tx.key]: tx.preview(finPre) }], { op: fresh.intent.id, back: { [tx.key]: L.raw } }); if (!b.ok) return b;
        clearOp = b;
        const bw = await tx.beforeWrite(1); if (!bw.ok) return bw;
        written = tx.write(fresh); if (!written.ok) return written;
        nextEpoch = fresh.epoch;
      } else {
        const b = await tx.begin([{ [key]: null }], { back: {} }); if (!b.ok) return b;
        clearOp = b;
      }
      onPhase('clear-intent');
      { const bw = await tx.beforeWrite(written ? 2 : 1); if (!bw.ok) return bw; }
      try { storage.removeItem(key); storage.removeItem(activeKey); } catch { return fail('clear-failed', 'Chat history could not be removed from storage.'); }
      onPhase('clear-removed');
      if (written) {
        const fin = clone(written.ledger); delete fin.intent;
        const bw = await tx.beforeWrite(3); if (!bw.ok) return bw;
        const w = tx.write(fin); if (!w.ok) return fail('records-finish-failed', 'History was cleared but the conversation records could not be finished, so the result is not confirmed yet. Try again.');
      }
      after = () => { base.clear(); attempts.clear(); epoch = nextEpoch; hints.imported.clear(); hints.branch.clear(); hints.planned.clear(); };   // only after the stable ACK
      return { ok: true };
    });
    if (r && r.ok && after) after();
    return r;
  }

  /**
   * Finish an interrupted earlier commit/clear under the lock, BEFORE the host reads chatThreads for the screen. -> { ok, recovered: null | 'back' | 'forward' | 'clear-forward' } or an explicit refusal
   * (no Web Locks, read-only tab, malformed/unreadable records). A recognised newer ledger needs no recovery of ours: { ok: true, recording: 'newer' }. Call init() right after the host's own read.
   */
  async function prepare() {
    if (!locksOk) return fail('unsupported', NO_LOCKS);
    return store.critical(async (tx) => {
      const L = tx.read();
      if (!L.ok) return L.code === 'newer' ? { ok: true, recovered: null, recording: 'newer' } : fail(L.code, L.message);
      if (!tx.pending && !L.ledger.intent) return { ok: true, recovered: null };
      const r = await recover(tx); if (!r.ok) return fail(r.code, r.message);
      return { ok: true, recovered: r.recovered };
    });
  }

  return {
    init, prepare, request, clearAll, mutateLedger, lastResult: () => lastResult, epoch: () => epoch, baseSize: () => base.size,
    /** the next commit records these new conversations as imported (legacy: their messages carry no attribution) */
    markImported: (ids) => { for (const id of ids) hints.imported.set(id, ++hintSeq); },
    /** the next commit records `id` as a branch of `source`: map is { newMessageId: sourceMessageId } */
    markBranch: (id, source, map) => hints.branch.set(id, { source, map }),
    /** a change that was refused is taken back in this tab's memory: the hints made for it are dropped with it */
    unmarkImported: (ids) => { for (const id of ids) hints.imported.delete(id); },
    unmarkBranch: (id) => { hints.branch.delete(id); },
    /** an explicitly attributed message about to enter the transcript: validated and recorded inside the commit that stores it */
    plan: (messageId, thread, spec) => hints.planned.set(messageId, { thread, spec }),
    refreshEpoch: () => { const l = store.read(); epoch = l.ok ? l.ledger.epoch : null; return epoch; },
    defaults: { personId, assistantId },
  };
}
