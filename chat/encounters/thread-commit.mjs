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
  const hints = { imported: new Set(), branch: new Map(), planned: new Map() };   // planned: messageId -> { thread, spec }
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

  /** Call right after the conversations were loaded: remember what storage held, and the epoch. */
  function init() {
    base.clear();
    const s = readStored();
    if (s.ok) for (const t of s.list) if (t && typeof t.id === 'string' && !t.temporary) { const c = canon(t); if (c) base.set(c.id, c); }
    const l = store.read(); epoch = l.ok ? l.ledger.epoch : null;
    return { threads: base.size, epoch };
  }

  // ---- recovery -------------------------------------------------------------------------------------------------------------------
  function recover(tx, ledger) {
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

  // ---- one commit -----------------------------------------------------------------------------------------------------------------
  function commitStep(tx) {
    onPhase('in-lock');
    const result = { ok: true, conflicts: [], refused: [], duplicates: [], recording: 'ok', wrote: false, recovered: null };
    let s = readStored(); if (!s.ok) return s;
    let L = tx.read();
    if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);   // malformed / unreadable: not a recognised newer store, so nothing is saved without its records
    if (L.ok && L.ledger.intent) {
      const r = recover(tx, L.ledger);
      if (!r.ok) return fail(r.code, r.message);
      result.recovered = r.recovered; L = tx.read(); s = readStored(); if (!s.ok) return s;
      if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);
    }
    if (L.ok && epoch != null && L.ledger.epoch !== epoch) return fail('stale', 'Your chat history was cleared in another tab. Reload this tab to continue; nothing from this tab was saved.', { epoch: L.ledger.epoch });
    const ledger = L.ok ? L.ledger : null;
    if (!L.ok) result.recording = 'newer';
    const storedById = new Map(s.list.filter((t) => t && typeof t.id === 'string').map((t) => [t.id, t]));
    const tabThreads = (getThreads() || []).filter((t) => t && typeof t.id === 'string' && !t.temporary);

    // explicit received messages: check them against the fresh ledger first, so a refused or replayed one never reaches the transcript
    // (a replay of an occurrence already held returns that original record and changes nothing; the same occurrence with other bytes is a conflict)
    if (hints.planned.size) {
      const scratch = ledger ? clone(ledger) : null;
      for (const [mid, p] of [...hints.planned]) {
        const thread = tabThreads.find((t) => t.id === p.thread);
        if (!thread || !thread.messages.some((m) => m.id === mid)) { hints.planned.delete(mid); continue; }
        const drop = () => { thread.messages.splice(thread.messages.findIndex((m) => m.id === mid), 1); hints.planned.delete(mid); };
        if (!scratch) { result.refused.push({ message: mid, thread: p.thread, code: 'attribution-unavailable', detail: 'The saved conversation records were made by a newer version of the app, so an attributed message cannot be recorded here.' }); drop(); continue; }
        const e = ensureEncounter(scratch, p.thread, now());
        p.eventId = p.eventId || 'ev:' + newUuid();     // the same id in this check and in the real record below, so a same-commit replay can name the original
        const r = e.ok ? recordEvent(scratch, { id: p.eventId, thread: p.thread, speaker: p.spec.speaker, expression: p.spec.expression, modality: p.spec.modality, standing: p.spec.standing || 'reported', text: p.spec.text, occurrence: p.spec.occurrence,
          audience: p.spec.audience, outcome: p.spec.outcome || 'received', derivedFrom: p.spec.derivedFrom, corrects: p.spec.corrects, clock: p.spec.clock, message: mid }, now()) : e;
        if (!r.ok) { result.refused.push({ message: mid, thread: p.thread, code: r.code, detail: r.message }); drop(); }
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
      finishBase();
      if (ledger && removals.length) { const d = clone(ledger); if (sweepThreads(d, removals.map((r) => r.id)).removed) { tx.write(d); result.wrote = true; } }  // already gone elsewhere: only the leftover records
      return result;
    }

    // the new list: stored order kept, only this tab's changed conversations replaced, its removals dropped, its new conversations appended
    const patchedById = new Map(changedPlans.map((p) => [p.id, p.patched]));
    const gone = new Set(removedIds);
    const newList = [];
    for (const raw of s.list) { const id = raw?.id; if (gone.has(id)) continue; newList.push(patchedById.has(id) ? patchedById.get(id) : raw); }
    for (const p of changedPlans) if (!p.existed) newList.push(p.patched);

    // the records
    let draft = null, intentLedger = null, intentText = null;
    if (ledger) {
      draft = clone(ledger);
      for (const p of changedPlans) {
        const r = observeThread(draft, { thread: p.patched, stored: p.stored, now: now(), hints: { imported: hints.imported.has(p.id), branch: !p.existed ? hints.branch.get(p.id) : null, planned: plannedFor(p.id) } });
        for (const x of r.refused || []) result.refused.push({ ...x, thread: p.id });
      }
      const undo = diffLedger(ledger, draft);
      const intent = { id: newUuid(), kind: 'commit', startedAt: now(), threads: Object.fromEntries(changedPlans.map((p) => [p.id, { sig: sigOf(p.patched) }])), removed: removedIds, sweep: removals.map((r) => r.id), undo };
      const w = tx.write({ ...draft, intent });
      if (!w.ok) {
        // the paired mutation is all or nothing: without the records' intent the chats are NOT written. Nothing is put back either (if the outcome is unclear a later lock holder settles an intent by what chatThreads holds).
        if (w.code === 'changed') return fail('unknown-outcome', 'The conversation records changed while this was being saved, so the result could not be confirmed. Your chats were not changed; check the chat and try again.', { conflicts: result.conflicts, refused: result.refused });
        return fail(w.code === 'write-failed' ? 'records-write-failed' : w.code, 'The conversation records could not be saved (storage may be full), so nothing from this save was kept: your chats are unchanged and the message is still here to try again.', { conflicts: result.conflicts, refused: result.refused });
      }
      intentLedger = w.ledger; intentText = w.text;
      onPhase('intent-written');
    }
    const text = JSON.stringify(newList);
    onPhase('before-threads');
    try { storage.setItem(key, text); } catch {
      // put the intent back ONLY while the ledger is still exactly the text this commit wrote a moment ago; anything else is someone else's newer value and is left for recovery
      let tidied = true;
      if (intentLedger) {
        const cur = tx.read();
        if (cur.ok && cur.raw === intentText) { const back = clone(intentLedger); delete back.intent; applyUndo(back, intentLedger.intent.undo); tidied = tx.write(back).ok; } else tidied = false;
      }
      return fail('threads-write-failed', 'This browser could not save your chats (its storage may be full or blocked). Nothing from this save was kept; the conversation on screen is unchanged.' + (tidied ? '' : ' The conversation records will be settled the next time the app saves.'));
    }
    // read back: what is stored must be what was written for every conversation this commit touched
    const after = readStored();
    const verified = after.ok && changedPlans.every((p) => sigOf((after.list.find((t) => t?.id === p.id)) ?? null) === sigOf(p.patched)) && removedIds.every((id) => !after.list.some((t) => t?.id === id));
    if (!verified) return fail('changed', 'Your saved chats changed while this was being saved, so the result could not be confirmed.');
    onPhase('threads-written');
    result.wrote = true;
    if (intentLedger) {
      const fin = clone(intentLedger); delete fin.intent; sweepThreads(fin, removals.map((r) => r.id));
      const w2 = tx.write(fin);
      if (!w2.ok) result.warning = 'Records finished later: ' + w2.message;
      onPhase('finalized');
    }
    finishBase();
    for (const p of changedPlans) { hints.imported.delete(p.id); hints.branch.delete(p.id); }
    for (const [mid, pl] of [...hints.planned]) if (changedPlans.some((p) => p.id === pl.thread)) hints.planned.delete(mid);
    return result;
  }
  const plannedFor = (threadId) => { const o = {}; for (const [mid, p] of hints.planned) if (p.thread === threadId) o[mid] = { ...p.spec, id: p.eventId }; return o; };

  const finish = (r) => { lastResult = r; try { onResult(r); } catch { /* a listener must not stop saving */ } return r; };
  async function run() {
    if (isBlocked()) return finish(fail('blocked', BLOCKED));
    return finish(await store.critical((tx) => commitStep(tx)));
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
    return store.critical((tx) => {
      let L = tx.read(); if (!L.ok) return L;
      if (L.ledger.intent) { const r = recover(tx, L.ledger); if (!r.ok) return fail(r.code, r.message); L = tx.read(); if (!L.ok) return L; }
      if (epoch != null && L.ledger.epoch !== epoch) return fail('stale', 'Your chat history was cleared in another tab. Reload this tab to continue; nothing was recorded.', { epoch: L.ledger.epoch });
      if (thread) {
        const s = readStored(); if (!s.ok) return s;
        if (!s.list.some((t) => t?.id === thread)) return fail('no-such-conversation', 'That conversation is not saved (it was deleted, cleared or is temporary), so nothing was recorded.');
      }
      const draft = clone(L.ledger);
      const made = fn(draft) || {};
      if (made.refuse) return fail(made.refuse, made.message || 'Refused.', made.extra || {});
      if (JSON.stringify({ ...draft, rev: 0 }) === JSON.stringify({ ...L.ledger, rev: 0 })) return { ok: true, result: made.result, wrote: false, ledger: L.ledger };
      const w = tx.write(draft); if (!w.ok) return w;
      return { ok: true, result: made.result, wrote: true, ledger: w.ledger };
    });
  }

  /** Clear history: one fenced step in the same lock. Returns { ok } or an explicit refusal; the ledger's epoch moves on so no other tab can write the old history back. */
  async function clearAll() {
    if (isBlocked()) return fail('blocked', BLOCKED);          // same refusals as request(), BEFORE anything is read or removed
    if (!locksOk) return fail('unsupported', NO_LOCKS);
    await tail.catch(() => {});
    return store.critical((tx) => {
      onPhase('in-lock');
      let L = tx.read();
      if (!L.ok && L.code !== 'newer') return fail(L.code, L.message);   // malformed / unreadable records: Clear history refuses rather than deleting chats beside records it cannot judge
      if (L.ok && L.ledger.intent) { const r = recover(tx, L.ledger); if (!r.ok) return fail(r.code, r.message); L = tx.read(); if (!L.ok && L.code !== 'newer') return fail(L.code, L.message); }
      let written = null, nextEpoch = epoch;
      if (L.ok) {
        const curEpoch = L.ledger.epoch || 0;
        if (curEpoch >= Number.MAX_SAFE_INTEGER) return fail('exhausted', 'The conversation records epoch is exhausted; history cannot be cleared further.');
        const fresh = { ...emptyLedger(curEpoch + 1), rev: L.ledger.rev, intent: { id: newUuid(), kind: 'clear', startedAt: now() } };
        written = tx.write(fresh); if (!written.ok) return written;
        nextEpoch = fresh.epoch;
      }
      onPhase('clear-intent');
      try { storage.removeItem(key); storage.removeItem(activeKey); } catch { return fail('clear-failed', 'Chat history could not be removed from storage.'); }
      onPhase('clear-removed');
      if (written) { const fin = clone(written.ledger); delete fin.intent; const w = tx.write(fin); if (!w.ok) return { ok: true, warning: w.message }; }
      base.clear(); epoch = nextEpoch;
      hints.imported.clear(); hints.branch.clear(); hints.planned.clear();
      return { ok: true };
    });
  }

  /**
   * Finish an interrupted earlier commit/clear under the lock, BEFORE the host reads chatThreads for the screen. -> { ok, recovered: null | 'back' | 'forward' | 'clear-forward' } or an explicit refusal
   * (no Web Locks, read-only tab, malformed/unreadable records). A recognised newer ledger needs no recovery of ours: { ok: true, recording: 'newer' }. Call init() right after the host's own read.
   */
  async function prepare() {
    if (!locksOk) return fail('unsupported', NO_LOCKS);
    return store.critical((tx) => {
      const L = tx.read();
      if (!L.ok) return L.code === 'newer' ? { ok: true, recovered: null, recording: 'newer' } : fail(L.code, L.message);
      if (!L.ledger.intent) return { ok: true, recovered: null };
      const r = recover(tx, L.ledger); if (!r.ok) return fail(r.code, r.message);
      return { ok: true, recovered: r.recovered };
    });
  }

  return {
    init, prepare, request, clearAll, mutateLedger, lastResult: () => lastResult, epoch: () => epoch, baseSize: () => base.size,
    /** the next commit records these new conversations as imported (legacy: their messages carry no attribution) */
    markImported: (ids) => { for (const id of ids) hints.imported.add(id); },
    /** the next commit records `id` as a branch of `source`: map is { newMessageId: sourceMessageId } */
    markBranch: (id, source, map) => hints.branch.set(id, { source, map }),
    /** an explicitly attributed message about to enter the transcript: validated and recorded inside the commit that stores it */
    plan: (messageId, thread, spec) => hints.planned.set(messageId, { thread, spec }),
    refreshEpoch: () => { const l = store.read(); epoch = l.ok ? l.ledger.epoch : null; return epoch; },
    defaults: { personId, assistantId },
  };
}
