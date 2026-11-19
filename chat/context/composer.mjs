// The context composer: what ONE receiving individual may be told, composed from admitted design and lore, the transcript, scoped reports, documents, a summary, and the person's
// own preferences and memory (docs/CONTEXT-COMPOSER.md). Pure and in-memory: no DOM, no storage, no network, no clock (time is never read), and it WRITES NOTHING (derive per request;
// nothing it returns is meant to be kept). The input is never changed.
//
//   composeContext(input) -> Promise<{ receiver, items, excluded, view, options, stale, digest }>
//
//   input.receiver      participant id of the receiving individual (a participant of the encounter; never matched by name)
//   input.encounter     { id, msgs }  msgs: messageId -> the event id the transcript shows (what the ledger's encounter holds, or the facade's project())
//   input.ledger        { participants, events }  read only
//   input.thread        { id?, temporary?, systemPrompt? }
//   input.messages      the transcript the sender would use (stored messages)
//   input.summary       { text, upTo, inputsDigest?, edited?, audience? } | null          (what the person may have edited; its inputs are messages [0, upTo))
//   input.documents     [{ id, name, text, audience?, attachedTo? }]      audience: 'encounter' | [participant ids]; none = the person's own (personal)
//   input.design        [{ id, kind: 'design'|'lore', individualId, text, audience? }]       an admitted design is the receiver's only when individualId equals the receiver's
//   input.reports       [{ id, text, standing, audience: [handles], individual?, run?, participant?, source?, occurrence?, derivedFrom? }]   package evidence; handles map to participants ONLY through policy.handleMap
//   input.memory        { enabled, items: [{ text }] }         legacy global memory: personal scope, never an individual's knowledge
//   input.preferences   { instructions }                       legacy global preferences: personal scope
//   input.policy        { personal: { memory, preferences, systemPrompt } (all false by default for a receiver), legacyTranscript: 'include'|'exclude' ('include'), standings?: [..],
//                         handleMap?: { handle: participantId }, maxMemoryChars?, query? }
//   input.stages        { retrieve?(items, ctx), embed?(items, ctx), summarize?(items, ctx) }   each is handed ONLY items that passed the filter; whatever it returns that was not handed to it is dropped
//
// THE ORDER (the filter-before-use rule): 1 admit (audience, scope, standing, input present) -> 2 derivation (a derived item needs every input permitted) -> 3 precedence (a permitted correction
// replaces what it corrects) -> 4 later stages (retrieve, embed, summarize) over the survivors only -> 5 projection to the provider's view. An item that fails 1 to 3 is never passed to 4 or 5
// and its text is not carried in `excluded` (only its id, kind and reason).
import { sha256Hex } from '../encounters/records.mjs';
import { handleState, reportAttribution, ATTRIBUTION_FIELDS } from './attribution.mjs';

export const MEMORY_PREFACE = 'Things the user asked you to remember (use them when relevant; do not bring them up otherwise):\n';
export const PREFERENCES_PREFACE = 'The user’s standing preferences for how you respond (follow them unless the conversation says otherwise):\n';
const KIND_ORDER = { design: 0, lore: 0, preferences: 1, memory: 2, summary: 3, document: 4, report: 5, event: 5, message: 6 };

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v) => (typeof v === 'string' ? v : '');
const inAudience = (audience, id) => audience?.scope === 'encounter' || (audience?.scope === 'list' && Array.isArray(audience.participants) && audience.participants.includes(id));
const listAudience = (a, id) => a === 'encounter' || (Array.isArray(a) && a.includes(id));
/** digest of the inputs a summary stands on: ids and exact content, in order */
export const inputsDigestOf = (messages) => 'sha256:' + sha256Hex(JSON.stringify(messages.map((m) => [m.id, m.content])));

/** who a package report says it is from: named handles exactly as supplied, blank ones listed as unnamed (never carried as if they named someone), never authenticated */
function reportedTo(r) {
  const a = reportAttribution(r), named = {};
  for (const f of ATTRIBUTION_FIELDS) if (a.fields[f].state === 'named') named[f] = a.fields[f].value;
  const unnamed = a.blank.filter((f) => f !== 'audience');
  return { ...named, ...(unnamed.length ? { unnamed } : {}), authenticated: false };
}

export async function composeContext(input = {}) {
  const { receiver, encounter, ledger, thread = {}, messages = [], summary = null, documents = [], design = [], reports = [], memory = null, preferences = null, policy = {}, stages = {} } = input;
  const personal = { memory: false, preferences: false, systemPrompt: false, ...(policy.personal || {}) };
  const out = { receiver, items: [], excluded: [], stale: [], view: null, options: { preamble: [], attachmentText: {}, sources: [] }, digest: null };
  const participant = ledger?.participants?.[receiver];
  if (!isObj(encounter) || !participant || participant.encounter !== encounter.id) {
    // no receiver of this encounter: nothing is composed (fail closed; the caller must not send an unfiltered request instead)
    out.error = { code: 'unknown-receiver', message: 'The receiving individual is not a participant of this conversation, so nothing was composed.' };
    out.view = { messages: [], systemPrompt: '' };
    return out;
  }
  const events = ledger.events || {};
  const allowedStandings = Array.isArray(policy.standings) ? new Set(policy.standings) : null;
  const exclude = (id, kind, reason) => out.excluded.push({ id, kind, reason });
  const attributed = (p) => (p ? { participant: p.id, name: p.name, individualId: p.individualId ?? null, authenticated: false } : null);

  // ---- 1 admit ----------------------------------------------------------------------------------------------------------------------
  const permitted = [];       // internal candidates that passed; carry their text
  const refusedEvent = new Map();   // event id -> reason, for derivation checks
  const eventDecision = (e, needText = true) => {
    if (e.encounter !== encounter.id) return 'foreign-encounter';
    if (!inAudience(e.audience, receiver)) return 'audience';
    if (allowedStandings && !allowedStandings.has(e.standing)) return 'standing';
    if (needText && (e.state !== 'final' || e.content?.text == null)) return 'no-text';
    return null;
  };

  // design and lore: only the receiver's own individual, never by name
  for (const d of design) {
    if (!isObj(d) || typeof d.id !== 'string') continue;
    if (participant.individualId == null || d.individualId !== participant.individualId) { exclude(d.id, d.kind === 'lore' ? 'lore' : 'design', 'not-this-individual'); continue; }
    if (d.audience !== undefined && !listAudience(d.audience, receiver)) { exclude(d.id, d.kind === 'lore' ? 'lore' : 'design', 'audience'); continue; }
    permitted.push({ id: d.id, kind: d.kind === 'lore' ? 'lore' : 'design', text: text(d.text), role: null, order: 0,
      provenance: { source: 'admitted-' + (d.kind === 'lore' ? 'lore' : 'design'), documentId: d.id, scope: 'individual', audience: d.audience === undefined ? [receiver] : d.audience, standing: 'admitted', attributedTo: { individualId: d.individualId, authenticated: false } }, reason: 'the receiver’s own admitted ' + (d.kind === 'lore' ? 'lore' : 'design') });
  }
  // legacy preferences and memory: personal scope; for a receiver other than the person's default assistant only when the person's policy says so
  if (preferences && text(preferences.instructions).trim()) {
    if (!personal.preferences) exclude('preferences', 'preferences', 'personal-scope');
    else permitted.push({ id: 'preferences', kind: 'preferences', text: PREFERENCES_PREFACE + preferences.instructions.trim(), role: null, order: 0,
      provenance: { source: 'legacy-preferences', scope: 'personal', audience: 'chosen-by-owner', standing: 'legacy', attributedTo: null }, reason: 'the person chose to share preferences with this receiver' });
  }
  if (memory && Array.isArray(memory.items) && memory.items.length) {
    if (thread.temporary) exclude('memory', 'memory', 'temporary-chat');
    else if (memory.enabled === false) exclude('memory', 'memory', 'memory-off');
    else if (!personal.memory) exclude('memory', 'memory', 'personal-scope');
    else {
      const lines = []; let used = 0; const cap = Number.isSafeInteger(policy.maxMemoryChars) ? policy.maxMemoryChars : 2000;
      for (const item of [...memory.items].reverse()) { const t = text(item?.text); if (used + t.length > cap || lines.length >= 40) break; lines.push('- ' + t); used += t.length; }
      if (lines.length) permitted.push({ id: 'memory', kind: 'memory', text: MEMORY_PREFACE + lines.reverse().join('\n'), role: null, order: 0,
        provenance: { source: 'legacy-memory', scope: 'personal', audience: 'chosen-by-owner', standing: 'legacy', attributedTo: null, items: lines.length }, reason: 'the person chose to share memory with this receiver' });
    }
  }

  // the transcript: each message through the event the transcript shows
  const shown = new Set();
  const msgInfo = [];   // { m, i, item|null, why }
  messages.forEach((m, i) => {
    if (!isObj(m)) return;
    if (m.notice || m.excluded) { msgInfo.push({ m, i, skip: true }); exclude(m.id, 'message', m.notice ? 'notice' : 'excluded-by-person'); return; }
    const eid = encounter.msgs?.[m.id], ev = eid ? events[eid] : null;
    let item = null, why = null;
    if (!ev) {
      if ((policy.legacyTranscript || 'include') === 'include') item = { id: 'msg:' + m.id, kind: 'message', text: text(m.content), role: m.role, order: 0, message: m,
        provenance: { source: 'transcript', messageId: m.id, scope: 'encounter', audience: 'encounter', standing: 'legacy', attributedTo: null }, reason: 'legacy message of the shared transcript (no recorded audience or speaker)' };
      else why = 'legacy-excluded';
    } else {
      shown.add(ev.id);
      why = eventDecision(ev, false);
      if (!why) {
        const sp = ledger.participants?.[ev.speaker];
        const role = ev.speaker === receiver ? 'assistant' : (m.role === 'assistant' ? 'user' : m.role);   // what others say reaches the receiver as input; its own words as its own
        item = { id: ev.id, kind: 'message', text: text(m.content), role, order: 0, message: m, eventId: ev.id,
          provenance: { source: 'transcript', eventId: ev.id, messageId: m.id, scope: 'encounter', audience: ev.audience, standing: ev.standing, attributedTo: attributed(sp), ...(ev.corrects ? { corrects: ev.corrects } : {}), ...(ev.derivedFrom ? { derivedFrom: ev.derivedFrom } : {}), ...(role !== m.role ? { roleProjection: m.role + '->' + role } : {}) }, reason: 'the transcript shows it and its audience includes the receiver' };
      }
    }
    msgInfo.push({ m, i, item, why });
    if (item) permitted.push(item); else exclude(ev?.id || 'msg:' + m.id, 'message', why);
  });

  // events that are not a transcript message (received reports and the like)
  for (const e of Object.values(events)) {
    if (e.encounter !== encounter.id || shown.has(e.id) || e.message != null) continue;
    const why = eventDecision(e);
    if (why) { refusedEvent.set(e.id, why); exclude(e.id, 'event', why); continue; }
    const sp = ledger.participants?.[e.speaker];
    const mine = e.audience.scope === 'list' && e.audience.participants.length === 1 && e.audience.participants[0] === receiver;
    permitted.push({ id: e.id, kind: 'event', text: text(e.content.text), role: null, order: 0, eventId: e.id, clock: e.clock,
      provenance: { source: 'ledger-event', eventId: e.id, scope: mine ? 'private' : 'encounter', audience: e.audience, standing: e.standing, attributedTo: attributed(sp), ...(e.corrects ? { corrects: e.corrects } : {}), ...(e.derivedFrom ? { derivedFrom: e.derivedFrom } : {}) },
      reason: mine ? 'addressed to the receiver alone' : 'its audience includes the receiver' });
  }

  // package reports: a handle names a participant only through the person's explicit map; a blank or unmapped one names nobody
  for (const r of reports) {
    if (!isObj(r) || typeof r.id !== 'string') continue;
    const map = policy.handleMap || {};
    const who = (Array.isArray(r.audience) ? r.audience : []).map((h) => (handleState(h) === 'named' && Object.hasOwn(map, h) ? map[h] : null));
    if (!who.includes(receiver)) { exclude(r.id, 'report', who.some(Boolean) ? 'audience' : 'audience-unmapped'); continue; }
    if (allowedStandings && !allowedStandings.has(r.standing)) { exclude(r.id, 'report', 'standing'); continue; }
    permitted.push({ id: r.id, kind: 'report', text: text(r.text), role: null, order: 0, derivedFromReports: r.derivedFrom,
      provenance: { source: 'package-report', documentId: r.id, scope: 'scoped', audience: r.audience.slice(), standing: r.standing, attributedTo: reportedTo(r), ...(r.derivedFrom ? { derivedFrom: r.derivedFrom.slice() } : {}) },
      reason: 'its audience names the receiver (through the person’s handle map)' });
  }

  // documents: attached ones follow the message that carried them; others need their own audience (none = the person's own)
  const permittedMsgIds = new Set(permitted.filter((p) => p.kind === 'message').map((p) => p.message.id));
  for (const d of documents) {
    if (!isObj(d) || typeof d.id !== 'string') continue;
    const viaMessage = d.attachedTo != null && permittedMsgIds.has(d.attachedTo);
    const viaAudience = d.audience !== undefined && listAudience(d.audience, receiver);
    if (!viaMessage && !viaAudience) { exclude(d.id, 'document', d.attachedTo != null && d.audience === undefined ? 'carrier-message-not-permitted' : d.audience === undefined ? 'personal-scope' : 'audience'); continue; }
    permitted.push({ id: d.id, kind: 'document', text: text(d.text), role: null, order: 0, name: d.name, attachedTo: d.attachedTo ?? null,
      provenance: { source: 'document', documentId: d.id, scope: viaAudience ? 'scoped' : 'attachment', audience: d.audience === undefined ? 'follows-message' : d.audience, standing: 'original', attributedTo: null },
      reason: viaAudience ? 'its audience includes the receiver' : 'attached to a message the receiver may see' });
  }

  // ---- 2 derivation: a derived item never outlives its permitted inputs --------------------------------------------------------------
  const drop = (item, reason) => { const k = permitted.indexOf(item); if (k >= 0) permitted.splice(k, 1); exclude(item.id, item.kind, reason); };
  for (let changed = true; changed;) {
    changed = false;
    for (const item of permitted.slice()) {
      const from = item.provenance.derivedFrom; if (!from?.length) continue;
      const missing = from.some((id) => !events[id] && !reports.some((r) => r.id === id));
      const forbidden = from.some((id) => !permitted.some((p) => p.id === id));
      if (missing) { drop(item, 'derived-input-missing'); changed = true; }
      else if (forbidden) { drop(item, 'derived-input-not-permitted'); changed = true; }
    }
  }
  // ---- 3 precedence: a permitted correction replaces what it corrects; the original stays when the correction is not the receiver's to see -----
  for (const item of permitted.slice()) {
    const target = item.provenance.corrects ?? events[item.eventId]?.supersedes;
    const victim = target && permitted.find((p) => p.id === target);
    if (victim && victim !== item) drop(victim, 'superseded-by:' + item.id);
  }
  // a correction whose original the receiver may not see keeps no pointer to it
  for (const item of permitted) {
    const c = item.provenance.corrects;
    if (c && !(events[c] && inAudience(events[c].audience, receiver))) { delete item.provenance.corrects; item.provenance.correctsHidden = true; }
  }

  // ---- the summary: derived from messages [0, upTo); permitted only if every input message is ----------------------------------------------
  let summaryItem = null, dropped = new Set();
  if (summary && text(summary.text).trim()) {
    const upTo = Number.isSafeInteger(summary.upTo) && summary.upTo >= 0 ? summary.upTo : 0;
    const inputs = msgInfo.filter((x) => x.i < upTo && !x.skip);
    const live = new Set(permitted.map((p) => p.id));
    const forbidden = inputs.find((x) => !x.item || !live.has(x.item.id));
    const sid = 'summary';
    if (summary.audience !== undefined && !listAudience(summary.audience, receiver)) exclude(sid, 'summary', 'audience');
    else if (forbidden) exclude(sid, 'summary', 'derived-input-not-permitted');
    else {
      const inMsgs = inputs.map((x) => x.m), digest = inputsDigestOf(inMsgs);
      let body = summary.text.trim(), standing = summary.edited ? 'edited-by-person' : summary.inputsDigest ? 'derived' : 'legacy-summary', recomputed = false, ok = true;
      if (summary.inputsDigest && summary.inputsDigest !== digest) {
        out.stale.push({ id: sid, reason: 'inputs-changed', wasEdited: Boolean(summary.edited) });
        if (typeof stages.summarize === 'function' && inputs.length) {
          const fed = inputs.map((x) => ({ id: x.item.id, kind: 'message', text: x.item.text, role: x.item.role }));
          const r = await stages.summarize(fed, { receiver });
          if (typeof r === 'string' && r.trim()) { body = r.trim(); standing = 'recomputed'; recomputed = true; } else ok = false;
        } else ok = false;
        if (!ok) exclude(sid, 'summary', 'stale');
      }
      if (ok) summaryItem = { id: sid, kind: 'summary', text: body, role: null, order: 0, upTo,
        provenance: { source: 'summary', scope: 'derived', audience: summary.audience === undefined ? 'encounter' : summary.audience, standing, attributedTo: null, derivedFrom: inputs.map((x) => x.item.id), edited: Boolean(summary.edited) && !recomputed, inputsDigest: digest, ...(recomputed ? { replacedEdited: Boolean(summary.edited) } : {}) },
        reason: recomputed ? 'recomputed from the inputs the receiver may see' : 'every input it stands on is permitted' };
      if (summaryItem) { permitted.push(summaryItem); for (const x of inputs) if (x.item) { dropped.add(x.item.id); } }
    }
  }
  // covered-by-summary messages leave the context (they are represented by the summary)
  for (const id of dropped) { const it = permitted.find((p) => p.id === id); if (it) drop(it, 'covered-by-summary'); }

  // ---- 4 later stages: only survivors are handed on -------------------------------------------------------------------------------------
  const survivors = new Set(permitted.map((p) => p.id));
  const handOn = (list) => list.filter((p) => survivors.has(p.id)).map((p) => ({ id: p.id, kind: p.kind, text: p.text, audience: p.provenance.audience, standing: p.provenance.standing }));
  const searchable = permitted.filter((p) => p.kind === 'document' || p.kind === 'report');
  if (typeof stages.embed === 'function' && searchable.length) await stages.embed(handOn(searchable), { receiver });
  if (typeof stages.retrieve === 'function' && searchable.length) {
    const kept = await stages.retrieve(handOn(searchable), { receiver, query: policy.query ?? '' });
    const keep = new Set(Array.isArray(kept) ? kept.map((k) => (typeof k === 'string' ? k : k?.id)) : []);
    for (const p of searchable.slice()) if (!keep.has(p.id)) drop(p, 'not-retrieved');
  }

  // ---- 5 projection ------------------------------------------------------------------------------------------------------------------
  for (const p of permitted) p.order = (KIND_ORDER[p.kind] ?? 9);
  const byOrder = (a, b) => a.order - b.order || (a.kind === 'message' ? messages.indexOf(a.message) - messages.indexOf(b.message) : a.clock && b.clock && a.clock.domain === b.clock.domain ? a.clock.position - b.clock.position : 0);
  const ordered = permitted.map((p, n) => ({ p, n })).sort((a, b) => byOrder(a.p, b.p) || a.n - b.n).map((x) => x.p);
  for (const p of ordered) {
    const { message, derivedFromReports, clock, eventId, ...item } = p; void derivedFromReports; void clock; void eventId;
    out.items.push({ ...item, ...(p.kind === 'message' ? { messageId: message.id } : {}) });
  }
  const pre = out.options.preamble;
  for (const p of ordered) {
    if (p.kind === 'design' || p.kind === 'lore' || p.kind === 'preferences' || p.kind === 'memory') pre.push(p.text);
    else if (p.kind === 'document') { if (p.attachedTo != null) out.options.attachmentText[p.id] = p.text; else pre.push('[Document: ' + (p.name || p.id) + ']\n' + p.text); out.options.sources.push({ docId: p.id, name: p.name }); }
    else if (p.kind === 'report' || p.kind === 'event') pre.push('Report (standing: ' + p.provenance.standing + '):\n' + p.text);
  }
  const msgs = ordered.filter((p) => p.kind === 'message').map((p) => (p.role === p.message.role ? p.message : { ...p.message, role: p.role }));
  out.view = { ...(thread.id != null ? { id: thread.id } : {}), systemPrompt: personal.systemPrompt ? text(thread.systemPrompt) : '', messages: msgs, ...(summaryItem ? { summary: { text: summaryItem.text, upTo: 0 } } : {}) };
  out.digest = 'sha256:' + sha256Hex(JSON.stringify([receiver, out.items.map((i) => [i.id, i.text, i.role]), out.excluded.map((x) => [x.id, x.reason])]));
  return out;
}

/** The ledger-shaped pieces the composer needs, from a stored ledger (tests and hosts that hold the whole ledger). */
export const encounterOf = (ledger, encounterId) => ({ id: encounterId, msgs: ledger.encounters?.[encounterId]?.msgs || {} });
