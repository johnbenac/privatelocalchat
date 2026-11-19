// The encounter ledger (plc.encounters.v1): who said what to whom, in which conversation, with what standing. Pure functions over plain data (no DOM, no storage, no clock of its own).
// docs/ENCOUNTERS.md says what is recorded and what is deliberately not. The ledger LINKS to a conversation's messages by (threadId, messageId); chatThreads itself keeps its format.
//
//   ledger      { v: 1, rev, epoch, encounters, participants, events, holders, intent? }   (unknown fields are kept)
//   Encounter   { id: 'enc:<threadId>' | 'enc:ext:<uuid>', thread|null, createdAt, seq, msgs: {messageId: shownEventId}, origin, lineage?, branchOf? }
//   Participant { id, encounter, kind, name, standing, individualId|null, holders?, origin }
//   Event       { id, encounter, thread, message, version, occ:{source,id,digest}, speaker, audience, expression, modality, standing, state:'open'|'final', outcome,
//                 content:{text,digest}|null, inTranscript, authority, observed, clock, corrects?, supersedes?, derivedFrom?, causes?, runtime? }
//
// The rules the tests pin:
//   * an OCCURRENCE is source + id (+ digest). Equal text alone never identifies an event. Same source+id+digest = duplicate (nothing written); same source+id, other digest = conflict.
//   * content.text is the COMPLETE source text, whatever the expression (person, model, tool, prepared, external); nothing is truncated. text:null means the source supplied none (supplied audio)
//     and stays null: text derived from it is a separate 'derived-text' event. inTranscript says only whether the local transcript currently shows the message, never what the source said.
//   * a correction/continuation/derivation is a NEW event that points at the original; the original keeps digest, audience, outcome and text. A derived audience cannot widen the original's.
//   * an explicit participant id registered again with other data is refused; names never identify anyone; individualId is supplied, opaque and never inferred.
//   * ordering is per clock domain; across domains only receipt time is offered, labelled as such.

export const LEDGER_FORMAT = 1;
export const LOCAL_SOURCE = 'plc:local';
export const EXPRESSIONS = Object.freeze(['person', 'model', 'prepared', 'tool', 'external']);
export const MODALITIES = Object.freeze(['text', 'voice-transcript', 'supplied-audio', 'derived-text']);
export const PARTICIPANT_KINDS = Object.freeze(['human', 'agent', 'tool', 'unknown']);
const STANDINGS = new Set(['recorded', 'reported', 'correction', 'continued', 'revised', 'regenerated', 'retried', 'derived', 'legacy']);
const OUTCOMES = new Set(['complete', 'stopped', 'failed', 'length', 'interrupted', 'received']);
const MAX_NAME = 120, MAX_ID = 300, MAX_LIST = 64;

const ok = (extra = {}) => ({ ok: true, ...extra });
const no = (code, message, extra = {}) => ({ ok: false, code, message, ...extra });
const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
export const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
export const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= MAX_ID && !/[\u0000-\u001f]/.test(v);
export const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

// ---- sha-256 (synchronous, so a change made inside the lock never has to await) ------------------------------------------------------
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const bits = data.length * 8, padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data); padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bits / 0x100000000)); view.setUint32(padded.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0; }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) >>> 0, t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return [...h].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}
export const digestOf = (text) => 'sha256:' + sha256Hex(text);
const DIGEST = /^sha256:[0-9a-f]{64}$/;
/** A cheap non-cryptographic signature of a stored thread, to tell after a crash whether a write landed. Not an identity. */
export function sigOf(value) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + ':' + s.length;
}

export function newUuid() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16); (c?.getRandomValues ? c.getRandomValues(bytes) : bytes.forEach((_, i) => { bytes[i] = Math.floor(Math.random() * 256); }));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---- ids ------------------------------------------------------------------------------------------------------------------------------
// Compound identities (thread + message + version, thread alone) are DERIVED handles: a sha-256 over the canonical JSON TUPLE, so ('a/b','c') and ('a','b/c') can never meet, and a
// very long old source id stays bounded. The ORIGINAL thread/message ids are never altered or truncated: they are kept as given in the `thread`/`message` fields of the records.
// A thread id made only of ordinary characters (every id this app generates) keeps its readable form; any other string (old imports may carry anything) is hashed. A readable form
// has no ':' so it can never equal a derived 'enc:h:...' or an external 'enc:ext:...' handle: local and external encounters are separate namespaces by construction.
/** Any non-empty string a stored conversation or message already carries (old normalisers accepted arbitrary ones): a reference, not an opaque identifier a caller supplies (isId). */
export const isRef = (v) => typeof v === 'string' && v.length > 0;
export const tupleDigest = (...parts) => sha256Hex(JSON.stringify(parts));
const READABLE = /^[A-Za-z0-9._-]{1,128}$/;
const localKey = (threadId) => (READABLE.test(threadId) ? threadId : 'h:' + tupleDigest('plc-thread', String(threadId)));
export const encounterId = (threadId) => `enc:${localKey(threadId)}`;
export const personId = (threadId) => `p:${localKey(threadId)}:person`;
export const assistantId = (threadId) => `p:${localKey(threadId)}:assistant`;
const slot = (version) => (Number.isInteger(version) && version > 0 ? version : null);      // version null and 0 are one slot (a first answer becomes version 0 when a second is made)
export const legacyEventId = (threadId, messageId, version = null) => `ev:legacy:${tupleDigest('plc-legacy-event', String(threadId), String(messageId), slot(version))}`;
/** The occurrence a legacy event stands for: a stable bounded id derived from the tuple; the source handles themselves are in the event's thread/message fields. */
export const legacyOccurrence = (threadId, messageId, version = null) => ({ source: 'plc:legacy', id: 'leg:' + tupleDigest('plc-legacy-occ', String(threadId), String(messageId), slot(version)) });
/** The occurrence of something this app recorded itself: `tail` tells successive events of one message/version apart. */
export const localOccurrence = (threadId, messageId, version = null, tail = null) => ({ source: LOCAL_SOURCE, id: 'loc:' + tupleDigest('plc-local-occ', String(threadId), String(messageId), slot(version), tail) });
export const occurrenceKey = (source, id) => `${source}\u0000${id}`;

// ---- the ledger -----------------------------------------------------------------------------------------------------------------------
export const emptyLedger = (epoch = 0) => ({ v: LEDGER_FORMAT, rev: 0, epoch, encounters: {}, participants: {}, events: {}, holders: {} });
const MALFORMED = 'The saved conversation records are not in a form this version can read, so they were left exactly as they are.';

const counter = (n) => Number.isSafeInteger(n) && n >= 0;
/** The first thing wrong with the SHAPE of a current-format ledger, or null. Only recognised fields are judged; unknown fields at every level are left alone. */
function shapeProblem(l) {
  for (const [id, e] of Object.entries(l.encounters)) {
    if (!isObj(e) || e.id !== id) return `encounter ${id}`;
    if (!counter(e.seq) || !isObj(e.msgs) || !(e.thread === null || typeof e.thread === 'string')) return `encounter ${id} fields`;
    for (const ev of Object.values(e.msgs)) if (typeof ev !== 'string' || !isObj(l.events[ev])) return `encounter ${id} points at a missing event`;
  }
  for (const [id, p] of Object.entries(l.participants)) {
    if (!isObj(p) || p.id !== id || typeof p.name !== 'string' || typeof p.encounter !== 'string') return `participant ${id}`;
    if (!isObj(l.encounters[p.encounter])) return `participant ${id} belongs to a missing encounter`;
  }
  for (const [id, e] of Object.entries(l.events)) {
    if (!isObj(e) || e.id !== id || typeof e.encounter !== 'string' || typeof e.speaker !== 'string') return `event ${id}`;
    if (!isObj(e.occ) || typeof e.occ.source !== 'string' || typeof e.occ.id !== 'string') return `event ${id} occurrence`;
    if (!isObj(e.clock) || typeof e.clock.domain !== 'string' || !counter(e.clock.position)) return `event ${id} clock`;
    if (!isObj(e.audience) || (e.content != null && !isObj(e.content))) return `event ${id} audience or content`;
    if (!isObj(l.encounters[e.encounter]) || !isObj(l.participants[e.speaker])) return `event ${id} points at a missing encounter or speaker`;
  }
  for (const [k, p] of Object.entries(l.holders)) if (typeof p !== 'string' || !isObj(l.participants[p])) return `holder ${k}`;
  if (l.intent !== undefined && (!isObj(l.intent) || typeof l.intent.kind !== 'string')) return 'intent';
  return null;
}

/**
 * Read stored text. Nothing stored is an empty ledger. Text that is not a ledger, or whose recognised header (v, rev, epoch), map containers or record references are malformed, is REFUSED
 * ('malformed'), never normalised into empty or reset data, so it is never written over; a newer format is refused as 'newer'. Counters stay nonnegative safe integers or the store is refused.
 */
export function parseLedger(raw) {
  if (raw == null || raw === '') return ok({ ledger: emptyLedger() });
  let value; try { value = JSON.parse(raw); } catch { return no('malformed', MALFORMED); }
  if (!isObj(value) || !Number.isInteger(value.v)) return no('malformed', MALFORMED);
  if (value.v > LEDGER_FORMAT) return no('newer', 'The saved conversation records were made by a newer version of the app, so this version leaves them exactly as they are.');
  if (value.v < 1 || !counter(value.rev) || !counter(value.epoch)) return no('malformed', MALFORMED);
  for (const k of ['encounters', 'participants', 'events', 'holders']) if (!isObj(value[k])) return no('malformed', MALFORMED);
  const problem = shapeProblem(value);
  if (problem) return no('malformed', MALFORMED, { detail: problem });
  return ok({ ledger: { ...value } });
}

// ---- encounters and participants -------------------------------------------------------------------------------------------------------
function defaultParticipants(threadId) {
  return [
    { id: personId(threadId), encounter: encounterId(threadId), kind: 'human', name: 'You', standing: 'local-device', individualId: null, origin: { kind: 'local' } },
    { id: assistantId(threadId), encounter: encounterId(threadId), kind: 'agent', name: 'Assistant', standing: 'runtime-projection', individualId: null, origin: { kind: 'local' } },
  ];
}
/** Make sure the encounter of a conversation and its two local participants exist. The ids come from the thread id, so a legacy conversation projects the same ids before and after it is first recorded. */
export function ensureEncounter(ledger, threadId, now = 0, origin = 'local') {
  if (!isRef(threadId)) return no('bad-thread', 'A conversation needs an id.');
  const id = encounterId(threadId);
  const have = ledger.encounters[id];
  if (have && have.thread !== threadId) return no('encounter-collision', 'That conversation id maps onto a different conversation or an external encounter; nothing was recorded.');
  if (!have) ledger.encounters[id] = { id, thread: threadId, createdAt: now, seq: 0, msgs: {}, origin };
  for (const p of defaultParticipants(threadId)) if (!ledger.participants[p.id]) ledger.participants[p.id] = p;
  return ok({ encounter: ledger.encounters[id] });
}
/** An encounter with no local conversation (a receiver's own): never swept by deleting a conversation, removed only by Clear history. Its id is always 'enc:ext:' + the caller's handle (a separate namespace from every local one). */
export function openExternalEncounter(ledger, id, now = 0) {
  if (id != null && !isId(id)) return no('bad-encounter', 'An encounter handle must be a short opaque string.');
  const eid = id != null ? `enc:ext:${id}` : `enc:ext:${newUuid()}`;
  const have = ledger.encounters[eid];
  if (have && have.thread !== null) return no('encounter-collision', 'That handle names a local conversation; nothing was changed.');
  if (!have) ledger.encounters[eid] = { id: eid, thread: null, createdAt: now, seq: 0, msgs: {}, origin: 'explicit-input' };
  return ok({ encounter: ledger.encounters[eid] });
}
/** Resolve a reference to an encounter: { encounter: 'enc:...' } (must exist), { thread: id } (made if absent), or a bare string (an existing encounter id, else a thread id: prefer the explicit forms). */
const encounterFor = (ledger, ref, now) => {
  if (isObj(ref)) {
    if (ref.encounter != null) return typeof ref.encounter === 'string' && ledger.encounters[ref.encounter] ? ok({ encounter: ledger.encounters[ref.encounter] }) : no('unknown-encounter', 'No such encounter.');
    return ensureEncounter(ledger, ref.thread, now);
  }
  if (typeof ref === 'string' && ref.startsWith('enc:') && ledger.encounters[ref]) return ok({ encounter: ledger.encounters[ref] });
  if (typeof ref === 'string' && ref.startsWith('enc:ext:')) return no('unknown-encounter', 'No such encounter.');
  return ensureEncounter(ledger, ref, now);
};
/** The encounter id a read-only caller means (never creates anything). */
export const encounterRefId = (ledger, ref) => {
  if (isObj(ref)) return ref.encounter != null ? String(ref.encounter) : encounterId(ref.thread);
  return typeof ref === 'string' && ledger?.encounters?.[ref] ? ref : encounterId(ref);
};
const cleanName = (v) => str(v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_NAME);

/**
 * Add a participant to an encounter from EXPLICIT input. `individualId` (optional) is an opaque reference the caller vouches for; it is stored unchanged.
 * Two participants may share a name; each has its own id. An explicit id that already exists must describe the SAME participant (kind, name, individualId, standing) or it is refused.
 */
export function addParticipant(ledger, ref, spec = {}, now = 0) {
  const enc = encounterFor(ledger, ref, now); if (!enc.ok) return enc;
  const eid = enc.encounter.id;
  const kind = PARTICIPANT_KINDS.includes(spec.kind) ? spec.kind : 'unknown';
  const name = cleanName(spec.name); if (!name) return no('bad-name', 'A participant needs a display name (a label, not an identity).');
  let individualId = null;
  if (spec.individualId != null) { if (!isId(spec.individualId)) return no('bad-individual', 'individualId must be a short opaque string.'); individualId = spec.individualId; }
  const standing = spec.standing === 'asserted' ? 'asserted' : 'local-device';
  if (spec.id != null && !isId(spec.id)) return no('bad-participant-id', 'A participant id must be a short opaque string.');
  const id = spec.id != null ? spec.id : `p:${newUuid()}`;
  const old = ledger.participants[id];
  if (old) {
    if (old.encounter !== eid) return no('participant-conflict', 'That participant id belongs to another conversation.');
    if (old.kind !== kind || old.name !== name || (old.individualId ?? null) !== individualId || old.standing !== standing) return no('participant-conflict', 'That participant id is already used for different data; nothing was changed.', { participant: old });
    return ok({ participant: old, existing: true });
  }
  const participant = { id, encounter: eid, kind, name, standing, individualId, origin: { kind: 'explicit-input', ...(spec.note ? { note: str(spec.note).slice(0, 200) } : {}) } };
  ledger.participants[id] = participant;
  return ok({ participant });
}
const holderKey = (encounter, holderRef) => `${encounter}\u0000${holderRef}`;
/** Many holders (a shared or forwarded link) may stand for one participant. The holderRef is an opaque label, never the secret itself. A holder maps to one participant per conversation. */
export function mapHolder(ledger, participantId, holderRef) {
  const p = ledger.participants[participantId]; if (!p) return no('unknown-participant', 'No such participant.');
  if (!isId(holderRef)) return no('bad-holder', 'A holder reference must be a short opaque label.');
  const key = holderKey(p.encounter, holderRef), current = ledger.holders[key];
  if (current && current !== participantId) return no('holder-mapped', 'That holder already stands for another participant in this conversation.', { participant: current });
  ledger.holders[key] = participantId;
  p.holders = [...new Set([...(p.holders || []), holderRef])].slice(0, MAX_LIST);
  return ok({ participant: participantId });
}
export const resolveHolder = (ledger, encounterRef, holderRef) => ledger.holders[holderKey(encounterRefId(ledger, encounterRef), holderRef)] || null;

// ---- events ---------------------------------------------------------------------------------------------------------------------------
const audienceOf = (a) => {
  if (a == null || a === 'encounter' || a?.scope === 'encounter') return { scope: 'encounter' };
  const list = Array.isArray(a) ? a : Array.isArray(a?.participants) ? a.participants : null;
  if (!list || !list.length || list.length > MAX_LIST) return null;
  const ids = [...new Set(list)];
  return ids.every((id) => isId(id)) ? { scope: 'list', participants: ids } : null;
};
/** is `inner` no wider than `outer`? An encounter-wide audience is the widest. */
export function audienceWithin(inner, outer) {
  if (outer.scope === 'encounter') return true;
  if (inner.scope === 'encounter') return false;
  const allowed = new Set(outer.participants);
  return inner.participants.every((id) => allowed.has(id));
}
export const findOccurrence = (ledger, source, id) => Object.values(ledger.events).find((e) => e.occ.source === source && e.occ.id === id) || null;

/**
 * Record one event. spec: encounter (thread id or 'enc:...'), speaker (participant id), expression, modality, standing, text (string, or null when the source supplied none),
 *   occurrence {source, id, digest?} (digest of the source bytes; defaults to the digest of text), audience?, message?, version?, outcome?, runtime?, state? ('open' records a message that is still being written: no text yet),
 *   inTranscript?, id?, authority?, observed?, clock?: {domain, position, source?}, corrects?, supersedes?, derivedFrom?, causes?, current?
 * -> { ok: true, event, duplicate? } | { ok: false, code }.
 */
export function recordEvent(ledger, spec, now = 0) {
  const enc = encounterFor(ledger, spec.encounter != null ? { encounter: spec.encounter } : { thread: spec.thread }, now); if (!enc.ok) return enc;
  const encounter = enc.encounter;
  const speaker = ledger.participants[spec.speaker];
  if (!speaker || speaker.encounter !== encounter.id) return no('unknown-speaker', 'The speaker is not a participant of this conversation.');
  if (!EXPRESSIONS.includes(spec.expression)) return no('bad-expression', 'Expression must be one of ' + EXPRESSIONS.join(', ') + '.');
  if (!MODALITIES.includes(spec.modality)) return no('bad-modality', 'Modality must be one of ' + MODALITIES.join(', ') + '.');
  const open = spec.state === 'open';
  const standing = STANDINGS.has(spec.standing) ? spec.standing : 'recorded';
  const occ = spec.occurrence || {};
  if (!isId(occ.source) || !isId(occ.id)) return no('bad-occurrence', 'An occurrence needs a source and an id.');
  if (spec.text != null && typeof spec.text !== 'string') return no('bad-content', 'Text must be a string, or null when the source supplied none.');
  const text = open ? null : spec.text == null ? null : spec.text;
  if (spec.modality === 'supplied-audio' && text != null) return no('bad-content', 'Supplied audio carries no text; derive text as a separate event.');
  const textDigest = text == null ? null : digestOf(text);
  const digest = open ? null : occ.digest != null ? occ.digest : textDigest;
  if (!open && (typeof digest !== 'string' || !DIGEST.test(digest))) return no('bad-digest', 'An occurrence needs a sha256 digest of its bytes (or text to digest).');
  const existing = findOccurrence(ledger, occ.source, occ.id);
  if (existing) return existing.occ.digest === digest ? ok({ event: existing, duplicate: true }) : no('occurrence-conflict', 'The same occurrence was received with different bytes; nothing was recorded.', { event: existing });
  if (spec.id != null && ledger.events[spec.id]) return no('event-id-taken', 'That event id is already used.');
  const audience = audienceOf(spec.audience); if (!audience) return no('bad-audience', 'Audience must be the whole encounter or a list of participants.');
  if (audience.scope === 'list' && !audience.participants.every((id) => ledger.participants[id]?.encounter === encounter.id)) return no('unknown-audience', 'Every audience member must be a participant of this conversation.');
  const related = [...(spec.corrects ? [spec.corrects] : []), ...(spec.derivedFrom || [])];
  let finalAudience = audience;
  for (const id of related) {
    const original = ledger.events[id];
    if (!original || original.encounter !== encounter.id) return no('unknown-original', 'A correction or derivation must point at an event of this conversation.');
    if (spec.audience != null && !audienceWithin(audience, original.audience)) return no('audience-widened', 'A correction or derivation cannot be offered to more participants than the original.');
  }
  if (spec.audience == null && related.length) finalAudience = plain(ledger.events[related[0]].audience); // by default inherit, never widen
  if (!counter(encounter.seq) || encounter.seq >= Number.MAX_SAFE_INTEGER) return no('exhausted', 'This conversation has used every safe event position; nothing more can be recorded in it.');
  const seq = encounter.seq + 1;
  let clock;
  if (isObj(spec.clock) && isId(spec.clock.domain)) {
    const position = spec.clock.position;
    if (position !== undefined && !counter(position)) return no('bad-clock', 'A clock position must be a nonnegative safe integer (or absent, to use this conversation’s own order).');
    clock = { domain: spec.clock.domain, position: position === undefined ? seq : position, receivedMs: now, ...(isObj(spec.clock.source) ? { source: plain(spec.clock.source) } : {}) };
  } else clock = { domain: `encounter:${encounter.id}`, position: seq, receivedMs: now };
  const event = {
    id: spec.id != null ? spec.id : `ev:${newUuid()}`, encounter: encounter.id, thread: encounter.thread, message: isRef(spec.message) ? spec.message : null, version: Number.isInteger(spec.version) ? spec.version : null,
    occ: { source: occ.source, id: occ.id, digest }, speaker: speaker.id, audience: finalAudience, expression: spec.expression, modality: spec.modality, standing,
    state: open ? 'open' : 'final', outcome: open ? null : OUTCOMES.has(spec.outcome) ? spec.outcome : 'received',
    content: open ? null : { text, digest: textDigest }, inTranscript: spec.inTranscript != null ? Boolean(spec.inTranscript) : Boolean(spec.message),
    authority: spec.authority === 'none' ? 'none' : 'local-device', observed: spec.observed !== false, clock,
  };
  if (spec.runtime) event.runtime = { label: str(spec.runtime).slice(0, 160) };
  if (spec.sourceOutcome) event.sourceOutcome = str(spec.sourceOutcome).slice(0, 80);   // the source's own word for the original outcome, kept as given
  if (spec.corrects) event.corrects = spec.corrects;
  if (spec.supersedes) event.supersedes = spec.supersedes;
  if (spec.derivedFrom?.length) event.derivedFrom = [...new Set(spec.derivedFrom)];
  if (spec.causes?.length) event.causes = [...new Set(spec.causes)].filter((id) => ledger.events[id]);
  if (spec.note) event.note = str(spec.note).slice(0, 200);
  encounter.seq = seq;
  ledger.events[event.id] = event;
  if (event.message && spec.current !== false) encounter.msgs[event.message] = event.id;
  return ok({ event });
}

/** An open event (a message still being written when first stored) becomes final exactly once: its text and outcome are set, never changed again. */
export function finalizeEvent(ledger, eventId, { text, outcome, runtime }) {
  const e = ledger.events[eventId];
  if (!e) return no('unknown-event', 'No such event.');
  if (e.state !== 'open') return no('already-final', 'A final event is never rewritten; record a correction instead.');
  if (typeof text !== 'string') return no('bad-content', 'Text must be a string.');
  const existing = findOccurrence(ledger, e.occ.source, e.occ.id);
  if (existing && existing !== e) return no('occurrence-conflict', 'Conflicting occurrence.');
  e.content = { text, digest: digestOf(text) };
  e.occ.digest = e.content.digest;
  e.outcome = OUTCOMES.has(outcome) ? outcome : 'complete';
  if (runtime && !e.runtime) e.runtime = { label: str(runtime).slice(0, 160) };   // the answering model is only known when the answer is done
  e.state = 'final';
  return ok({ event: e });
}

/** The stored message a legacy event stands for, written down for the first time when it is rewritten: honest about not having been observed. */
export function materializeLegacy(ledger, { thread, message, text, role, version = null, at = null, now = 0, speaker, expression, modality = 'text', outcome = 'complete', runtime }) {
  if (!isRef(thread) || !isRef(message)) return no('bad-legacy', 'A legacy message needs its conversation and message ids.');
  const id = legacyEventId(thread, message, version), occurrence = legacyOccurrence(thread, message, version);
  const exact = (e) => e && e.thread === thread && e.message === message && slot(e.version) === slot(version) && e.occ?.source === occurrence.source && e.occ?.id === occurrence.id;
  const have = ledger.events[id];
  if (have) return exact(have) ? ok({ event: have, existing: true }) : no('legacy-id-collision', 'A stored record uses this legacy handle for a different message; it was not reused.');
  const held = findOccurrence(ledger, occurrence.source, occurrence.id);
  if (held) return no('legacy-id-collision', 'This legacy occurrence is already held under another record; it was not reused.');
  const enc = ensureEncounter(ledger, thread, now);
  if (!enc.ok) return enc;
  const r = recordEvent(ledger, { thread, id, speaker: speaker || (role === 'user' ? personId(thread) : assistantId(thread)), expression: expression || (role === 'user' ? 'person' : 'model'), modality, standing: 'legacy',
    text, occurrence, message, version, outcome, runtime, authority: 'none', observed: false, current: true,
    note: 'stored before conversation records existed; written down when first rewritten' + (at ? ` (message time ${at})` : '') }, now);
  return r;
}

// ---- following stored conversations (commit support) -----------------------------------------------------------------------------------
/** Remove each encounter (and its events, participants, holders) of the given threads; external encounters (thread null) are not touched. */
export function sweepThreads(ledger, threadIds) {
  const gone = new Set(threadIds.map(encounterId).filter((id) => ledger.encounters[id] && ledger.encounters[id].thread != null));
  if (!gone.size) return { removed: 0 };
  for (const [id, e] of Object.entries(ledger.events)) if (gone.has(e.encounter)) delete ledger.events[id];
  for (const [id, p] of Object.entries(ledger.participants)) if (gone.has(p.encounter)) delete ledger.participants[id];
  for (const key of Object.keys(ledger.holders)) if (gone.has(key.split('\u0000')[0])) delete ledger.holders[key];
  for (const id of gone) delete ledger.encounters[id];
  return { removed: gone.size };
}

const EVENT_UNDO_KEYS = ['inTranscript', 'state', 'outcome', 'content', 'occ'];
/** What changed between two copies of a ledger, in the form needed to put the first back (a roll back after a crash). */
export function diffLedger(before, after) {
  const undo = { events: [], participants: [], holders: [], encounters: {}, eventFields: {} };
  for (const id of Object.keys(after.events)) {
    const b = before.events[id];
    if (!b) { undo.events.push(id); continue; }
    const a = after.events[id], fields = {};
    for (const k of EVENT_UNDO_KEYS) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) fields[k] = b[k] === undefined ? null : plain(b[k]);
    if (Object.keys(fields).length) undo.eventFields[id] = fields;
  }
  for (const id of Object.keys(after.participants)) if (!before.participants[id]) undo.participants.push(id);
  for (const k of Object.keys(after.holders)) if (!before.holders[k]) undo.holders.push(k);
  for (const id of Object.keys(after.encounters)) if (JSON.stringify(after.encounters[id]) !== JSON.stringify(before.encounters[id])) undo.encounters[id] = before.encounters[id] ? plain(before.encounters[id]) : null;
  return undo;
}
export function applyUndo(ledger, undo) {
  for (const id of undo.events || []) delete ledger.events[id];
  for (const id of undo.participants || []) delete ledger.participants[id];
  for (const k of undo.holders || []) delete ledger.holders[k];
  for (const [id, fields] of Object.entries(undo.eventFields || {})) if (ledger.events[id]) for (const [k, v] of Object.entries(fields)) ledger.events[id][k] = v;
  for (const [id, enc] of Object.entries(undo.encounters || {})) { if (enc === null) delete ledger.encounters[id]; else ledger.encounters[id] = enc; }
  return ledger;
}

// ---- reading ---------------------------------------------------------------------------------------------------------------------------
export const eventsOfMessage = (ledger, threadId, messageId) => Object.values(ledger.events).filter((e) => e.thread === threadId && e.message === messageId);

/**
 * The attribution of every message of a conversation: what the screen shows and what a later receiver is told. Messages with no event are legacy (honest, never invented):
 * they carry their stable legacy event id and no individual, no authority.
 */
export function projectThread(ledger, thread) {
  const out = new Map();
  if (!thread) return out;
  const enc = ledger?.encounters?.[encounterId(thread.id)];
  const participantsOf = Object.values(ledger?.participants || {}).filter((p) => p.encounter === encounterId(thread.id));
  const counts = new Map();
  for (const p of participantsOf) counts.set(p.name.toLowerCase(), (counts.get(p.name.toLowerCase()) || 0) + 1);
  const label = (p) => (counts.get(p.name.toLowerCase()) > 1 ? `${p.name} #${p.id.slice(-4)}` : p.name);
  for (const msg of thread.messages || []) {
    if (!msg || msg.notice || msg.role === 'system') continue;
    let ev = enc && enc.msgs[msg.id] && ledger.events[enc.msgs[msg.id]];
    let inherited = false;
    if (!ev && enc?.lineage?.[msg.id]) { const l = enc.lineage[msg.id]; const sev = ledger.events[l.event]; if (sev) { ev = sev; inherited = true; } }
    const person = msg.role === 'user';
    if (!ev) {
      out.set(msg.id, { message: msg.id, event: legacyEventId(thread.id, msg.id), legacy: true, standing: 'legacy', speaker: person ? personId(thread.id) : assistantId(thread.id), speakerName: person ? 'You' : 'Assistant', speakerKind: person ? 'human' : 'agent',
        expression: person ? 'person' : msg.local === true ? 'tool' : 'model', modality: msg.voice ? 'voice-transcript' : 'text', individualId: null, audience: 'encounter', outcome: null, changed: false, authority: 'none', holders: [] });
      continue;
    }
    const p = ledger.participants[ev.speaker];
    const revisions = Object.values(ledger.events).filter((e) => e.thread === ev.thread && e.message === ev.message && e.id !== ev.id).length;
    out.set(msg.id, { message: msg.id, event: ev.id, legacy: false, standing: inherited ? 'copied' : ev.standing, speaker: ev.speaker, speakerName: p ? label(p) : 'Unknown', speakerKind: p?.kind, expression: ev.expression, modality: ev.modality,
      individualId: p?.individualId ?? null, audience: ev.audience.scope === 'encounter' ? 'encounter' : ev.audience.participants.slice(), outcome: ev.outcome, runtime: ev.runtime?.label, changed: revisions > 0, corrects: ev.corrects || null, authority: ev.authority, holders: p?.holders || [] });
  }
  return out;
}

/** Events of one encounter in order. Within a clock domain: by position. Across domains: by receipt time only, and each entry says which kind of order it is. */
export function orderEvents(ledger, encounterRef) {
  const eid = String(encounterRef).startsWith('enc:') ? encounterRef : encounterId(encounterRef);
  const list = Object.values(ledger.events).filter((e) => e.encounter === eid);
  const domains = new Set(list.map((e) => e.clock.domain));
  const sorted = list.slice().sort((a, b) => (a.clock.domain === b.clock.domain ? a.clock.position - b.clock.position : a.clock.receivedMs - b.clock.receivedMs || (a.clock.domain < b.clock.domain ? -1 : 1)));
  return sorted.map((e) => ({ id: e.id, domain: e.clock.domain, position: e.clock.position, order: domains.size > 1 ? 'receipt' : 'source' }));
}
export const ledgerSummary = (ledger) => ({ rev: ledger.rev, epoch: ledger.epoch, encounters: Object.keys(ledger.encounters).length, participants: Object.keys(ledger.participants).length, events: Object.keys(ledger.events).length, intent: ledger.intent ? ledger.intent.kind : null });
