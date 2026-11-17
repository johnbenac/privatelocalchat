// Attributed conversation records for the app: the saving of conversations (every ordinary writer calls saveThreads, which is one commit, chat/encounters/thread-commit.mjs), the
// ledger (plc.encounters.v1, chat/encounters/records.mjs), what the messages view shows, and the app-internal facade a later receiver (T429/T442/T458) can call.
// createEncounters(host) returns { saveThreads, init, clearAll, markImported, markBranch, attribution, project, facade }.
//
// host: storage (appLocal), threads() (the live list), normalizeThread, newId, showToast, isBlocked(), isReadOnly(), locks?, now?
//
// NOT here: hosted invitations or authentication, package admission, context composition, agent scheduling, backup/transfer of the ledger (T428). The facade stores what a trusted
// caller supplies; a source assertion, a name, a preset id or a link holder is never treated as a verified person.
import { createLedgerStore } from './ledger-store.mjs';
import { createThreadCommit } from './thread-commit.mjs';
import { parseLedger, ensureEncounter, openExternalEncounter, addParticipant, mapHolder as mapHolderOp, resolveHolder, recordEvent, projectThread, orderEvents, ledgerSummary, personId, assistantId, emptyLedger, encounterId, encounterRefId } from './records.mjs';
import { observeThread } from './thread-events.mjs';
import { clone } from './thread-patch.mjs';

export const LEDGER_KEY = 'plc.encounters.v1';

export function createEncounters(host) {
  const { storage, threads, normalizeThread = (t) => t, newId = () => `m-${Math.random().toString(16).slice(2, 10)}`, showToast = () => {}, isBlocked = () => false, isReadOnly = () => false } = host;
  const now = host.now || (() => Date.now());
  const locks = host.locks === undefined ? globalThis.navigator?.locks : host.locks;
  const store = createLedgerStore({ storage, key: LEDGER_KEY, locks, isReadOnly, isNewer: host.isLedgerBlocked || (() => false) });
  const told = new Set();
  const tell = (key, text) => { if (told.has(key)) return; told.add(key); try { showToast(text, 9000); } catch { /* no UI */ } };
  const commit = createThreadCommit({
    storage, store, locks, normalize: normalizeThread, getThreads: () => threads(), isBlocked, now, onPhase: host.onPhase,
    onResult: (r) => {
      if (host.onResult) host.onResult(r);
      if (r.ok && r.wrote && host.onCommitted) { try { snapshot(); host.onCommitted(r); } catch { /* the screen must not stop saving */ } }
      if (!r.ok) {
        if (r.code === 'read-only' || r.code === 'unsupported' || r.code === 'blocked') return;
        tell(r.code + (r.epoch ?? ''), r.message);
        return;
      }
      for (const c of r.conflicts || []) tell('c:' + c.thread + c.detail, `A chat changed in another tab (${c.detail}), so this tab did not overwrite it. Reload to see the newer version.`);
      if (r.recording === 'failed') tell('rec-failed', 'Your chat was saved, but its conversation records could not be (storage may be full).');
    }
  });

  // ---- memory-only records for temporary conversations (never stored; gone with the page) ----
  let memory = emptyLedger(); const memBase = new Map();
  function observeTemporary() {
    for (const t of threads() || []) {
      if (!t?.temporary || typeof t.id !== 'string') continue;
      const copy = clone(t); delete copy.temporary;   // observeThread refuses temporary chats on purpose: this copy goes only to the in-memory ledger below
      observeThread(memory, { thread: copy, stored: memBase.get(t.id) || null, now: now() });
      memBase.set(t.id, copy);
    }
    for (const id of [...memBase.keys()]) if (!(threads() || []).some((t) => t?.id === id)) { memBase.delete(id); const e = encounterId(id); delete memory.encounters[e]; for (const [k, v] of Object.entries(memory.events)) if (v.encounter === e) delete memory.events[k]; for (const [k, v] of Object.entries(memory.participants)) if (v.encounter === e) delete memory.participants[k]; }
  }

  // ---- reading (synchronous; parsed again only when the stored text changes) ----
  let cache = { raw: undefined, ledger: emptyLedger(), ok: true };
  function snapshot() {
    let raw = null; try { raw = storage.getItem(LEDGER_KEY); } catch { return cache; }
    if (raw !== cache.raw) { const p = parseLedger(raw); cache = { raw, ledger: p.ok ? p.ledger : emptyLedger(), ok: p.ok, code: p.code }; projections.clear(); }
    return cache;
  }
  const projections = new Map();
  function project(thread) {
    if (!thread) return new Map();
    if (thread.temporary) return projectThread(memory, thread);
    const snap = snapshot();
    const key = thread.id + ':' + (thread.messages?.length || 0) + ':' + (thread.messages?.[thread.messages.length - 1]?.id || '');
    let p = projections.get(key);
    if (!p) { p = projectThread(snap.ledger, thread); projections.set(key, p); }
    return p;
  }
  /** What the messages view shows for one message: { info, label, notable, data } or null. */
  function attribution(thread, msg) {
    const info = project(thread).get(msg.id); if (!info) return null;
    const isDefault = info.speaker === personId(thread.id) || info.speaker === assistantId(thread.id);
    const notable = !isDefault || info.changed || info.modality === 'supplied-audio' || info.modality === 'derived-text' || ['prepared', 'external', 'tool'].includes(info.expression) || info.standing === 'copied';
    const bits = [];
    if (!isDefault) bits.push(info.speakerName + (info.individualId ? ' (individual ' + info.individualId + ')' : ''));
    if (info.expression !== 'person' && info.expression !== 'model') bits.push(info.expression);
    if (info.modality === 'supplied-audio') bits.push('supplied audio, no text');
    if (info.modality === 'derived-text') bits.push('text derived from audio');
    if (info.changed) bits.push('has earlier versions kept in the record');
    if (info.standing === 'copied') bits.push('copied from another chat');
    return { info, speakerName: info.speakerName, isDefault, notable, text: bits.join(' · '),
      data: { speaker: info.speaker, event: info.event || '', standing: info.standing, expression: info.expression, modality: info.modality, legacy: String(info.legacy), changed: String(info.changed), individual: info.individualId || '' } };
  }

  function saveThreads() { observeTemporary(); return commit.request(); }
  /**
   * HOST CONTRACT (T418 core, for the next UI pass): `await prepare()` BEFORE reading chatThreads for the screen, then read, then call init() with no await between that read and init().
   * prepare finishes an interrupted earlier commit under the Web Lock first, so the UI never consumes a half-finished state. -> { ok, recovered } | { ok: false, code } (a refusal does not
   * stop the app from showing what is stored; saving then refuses the same way).
   */
  async function prepare() { const r = await commit.prepare(); snapshot(); return r; }
  async function init() {
    const r = commit.init();
    // an interrupted earlier commit (a tab killed between the two stores) is finished here, in the lock, before this tab shows or records anything more
    if (snapshot().ledger.intent) { const x = await commit.mutateLedger(() => ({})); snapshot(); if (!x.ok && host.onResult) host.onResult(x); }
    return r;
  }

  async function clearAll() { const r = await commit.clearAll(); memory = emptyLedger(); memBase.clear(); projections.clear(); return r; }

  // ---- the facade a later receiver calls (app-internal; nothing here is a hosted service) ----
  const failed = (r) => ({ ok: false, code: r.code, message: r.message });
  const threadOf = (id) => (threads() || []).find((t) => t?.id === id) || null;
  const isTemp = (id) => Boolean(threadOf(typeof id === 'object' && id ? id.thread : id)?.temporary);
  const ledgerFor = (ref) => (isTemp(ref) ? memory : snapshot().ledger);

  async function registerParticipant(spec = {}) {
    const tref = spec.thread ?? null, eref = spec.encounter ?? null;
    if (tref && isTemp(tref)) {
      const r = addParticipant(memory, { thread: tref }, spec, now()); return r.ok ? { ok: true, participant: clone(r.participant), existing: Boolean(r.existing), memoryOnly: true } : failed(r);
    }
    if (tref) await commit.request();
    const r = await commit.mutateLedger((l) => { const x = addParticipant(l, eref != null ? { encounter: eref } : { thread: tref }, spec, now()); return x.ok ? { result: x } : { refuse: x.code, message: x.message }; }, { thread: tref });
    return r.ok ? { ok: true, participant: clone(r.result.participant), existing: Boolean(r.result.existing) } : failed(r);
  }
  async function mapHolder({ participant, holder }) {
    const r = await commit.mutateLedger((l) => { const x = mapHolderOp(l, participant, holder); return x.ok ? { result: x } : { refuse: x.code, message: x.message, extra: { participant: x.participant } }; });
    return r.ok ? { ok: true, participant } : { ...failed(r), participant: r.participant };
  }
  const holderOf = ({ thread, encounter, holder }) => resolveHolder(snapshot().ledger, encounter != null ? { encounter } : { thread }, holder);
  async function openEncounter({ id } = {}) {
    const r = await commit.mutateLedger((l) => { const x = openExternalEncounter(l, id, now()); return { result: x }; });
    return r.ok ? { ok: true, encounter: r.result.encounter.id } : failed(r);
  }

  /**
   * Receive one explicitly attributed expression. spec: thread | encounter, speaker (participant id), expression, modality, standing?, text (string, or null when the source supplied none),
   * occurrence { source, id, digest? }, audience?, outcome?, derivedFrom?, corrects?, clock?, transcript (true: also show it in the conversation), role?
   * -> { ok: true, event, duplicate? } | { ok: false, code, message }. Same occurrence + other bytes = refusal 'occurrence-conflict'; nothing is written then.
   */
  async function receive(spec = {}) {
    const tref = spec.thread ?? null;
    if (tref && isTemp(tref)) {                                                    // temporary: memory only, never stored
      ensureEncounter(memory, tref, now());
      const r = recordEvent(memory, { ...spec, thread: tref, encounter: undefined, message: null, inTranscript: false }, now());
      return r.ok ? { ok: true, event: clone(r.event), duplicate: Boolean(r.duplicate), memoryOnly: true } : failed(r);
    }
    if (spec.transcript && tref) {
      const thread = threadOf(tref); if (!thread) return failed({ code: 'no-such-conversation', message: 'That conversation is not open in this tab.' });
      const snap = snapshot().ledger, sp = snap.participants[spec.speaker];
      const role = spec.role || (sp && sp.kind === 'human' ? 'user' : 'assistant');
      const message = { id: newId(), role, content: spec.text == null ? '' : spec.text, at: now() };
      thread.messages.push(message); thread.updatedAt = now();
      const shown = () => { try { host.onTranscriptChanged?.(thread); } catch { /* the screen must not stop receiving */ } };
      commit.plan(message.id, tref, { speaker: spec.speaker, expression: spec.expression, modality: spec.modality, standing: spec.standing || 'reported', text: spec.text == null ? null : spec.text, occurrence: spec.occurrence, audience: spec.audience,
        outcome: spec.outcome, sourceOutcome: spec.sourceOutcome, derivedFrom: spec.derivedFrom, corrects: spec.corrects, clock: spec.clock });
      shown();
      const res = await commit.request();
      if (!res.ok) { const i = thread.messages.indexOf(message); if (i >= 0) thread.messages.splice(i, 1); shown(); return failed(res); }
      shown();
      const refused = (res.refused || []).find((x) => x.message === message.id);
      if (refused) return { ok: false, code: refused.code, message: refused.detail || 'Refused.' };
      // a replay of an occurrence already held: decided inside the commit lock BEFORE the line was stored, so nothing was appended; the original receipt comes back
      const dup = (res.duplicates || []).find((x) => x.message === message.id);
      if (dup) return { ok: true, duplicate: true, event: dup.event, messageId: dup.event.message ?? null };
      const ev = Object.values(snapshot().ledger.events).find((e) => e.message === message.id && e.occ.source === spec.occurrence.source && e.occ.id === spec.occurrence.id);
      return ev ? { ok: true, event: clone(ev), messageId: message.id } : { ok: false, code: 'not-recorded', message: 'The message was saved but its record could not be confirmed.' };
    }
    if (tref) await commit.request();
    const r = await commit.mutateLedger((l) => {
      const enc = spec.encounter ? l.encounters[spec.encounter] : null;
      if (spec.encounter && !enc) return { refuse: 'unknown-encounter', message: 'No such encounter.' };
      const x = recordEvent(l, { ...spec, encounter: spec.encounter ?? undefined, thread: tref ?? undefined, message: null, inTranscript: false }, now());
      return x.ok ? { result: x } : { refuse: x.code, message: x.message, extra: { event: x.event } };
    }, { thread: tref });
    return r.ok ? { ok: true, event: clone(r.result.event), duplicate: Boolean(r.result.duplicate) } : failed(r);
  }

  const facade = {
    registerParticipant, mapHolder, resolveHolder: holderOf, openEncounter, receive,
    project: (threadId) => { const t = threadOf(threadId); return t ? Object.fromEntries(project(t)) : {}; },
    // ref: an existing encounter id ('enc:...'), else a thread id; or explicitly { encounter } / { thread } (use these when a thread id could look like an encounter id)
    participants: (ref) => { const l = ledgerFor(ref), eid = encounterRefId(l, ref); return Object.values(l.participants).filter((p) => p.encounter === eid).map(clone); },
    events: (ref) => { const l = ledgerFor(ref), eid = encounterRefId(l, ref); return Object.values(l.events).filter((e) => e.encounter === eid).map(clone); },
    order: (ref) => { const l = ledgerFor(ref); return orderEvents(l, encounterRefId(l, ref)); },
    summary: () => ledgerSummary(snapshot().ledger),
    ledgerState: () => { const s = snapshot(); return { ok: s.ok, code: s.code || null, epoch: s.ledger.epoch }; },
    lastResult: () => commit.lastResult(),
  };
  return { saveThreads, prepare, init, clearAll, markImported: commit.markImported, markBranch: commit.markBranch, attribution, project, facade, commit, store, snapshot };
}
