// From a conversation's change to ledger events. Pure: given the ledger, the stored copy of a thread (as it was before this commit) and the patched copy (what will be written),
// record what is new. It runs INSIDE the commit's lock on the fresh stored copy (chat/encounters/thread-commit.mjs), never on a tab's stale copy.
//
//   * a message first stored while still being written (streaming) gets an OPEN event (no text claimed yet); it is finalised once, when its status is final;
//   * a message first stored with final text gets a final event with the COMPLETE text;
//   * later text changes never rewrite an event: they add a new one (correction of a prompt, continuation or revision of an answer, regeneration as a new version, retry);
//   * a message that was stored before the ledger knew it is LEGACY: it has no event, projects under its stable legacy id, and is written down (not observed, no authority)
//     only if it is rewritten, from the stored copy read in the same lock hold;
//   * imported conversations are legacy (their metadata grants nothing); a branch inherits the attribution of the messages it copied (lineage).
import { ensureEncounter, recordEvent, finalizeEvent, materializeLegacy, personId, assistantId, legacyEventId, encounterId, localOccurrence, isRef, digestOf } from './records.mjs';

const str = (v, fallback = '') => (typeof v === 'string' ? v : fallback);
const isFinal = (s) => s !== 'streaming' && s !== 'preparing';
const outcomeOf = (s) => (['stopped', 'failed', 'length', 'interrupted'].includes(s) ? s : 'complete');

const entriesOf = (msg, person) => (!person && Array.isArray(msg?.versions) && msg.versions.length > 1
  // the shown version mirrors msg.content/msg.status (the page writes the version entry later); the others use their own entry
  ? msg.versions.map((v, i) => (i === msg.versionIndex ? { text: str(msg.content), status: msg.status, i } : { text: str(v?.content), status: v?.status, i }))
  : [{ text: str(msg?.content), status: msg?.status, i: null }]);
const versionKey = (v) => v ?? 0;

/** The newest event of a message's version (version null and 0 are the same slot: a first answer becomes version 0 when a second is made). */
function headFor(ledger, threadId, messageId, version) {
  let best = null;
  for (const e of Object.values(ledger.events)) {
    if (e.thread !== threadId || e.message !== messageId || versionKey(e.version) !== versionKey(version)) continue;
    if (!best || e.clock.position > best.clock.position) best = e;
  }
  return best;
}

export function observeThread(ledger, { thread, stored = null, hints = {}, now = 0 }) {
  const refused = [];
  if (!thread || thread.temporary || thread.mind || !isRef(thread.id)) return { refused, changed: false };   // a conversation with a mind keeps her words only as messages of the chat (docs/MIND-CONVERSATION.md): no second copy in the ledger
  const tid = thread.id;
  const encResult = ensureEncounter(ledger, tid, now, hints.imported && !stored ? 'imported' : 'local');
  if (!encResult.ok) { refused.push({ message: null, code: encResult.code, detail: encResult.message }); return { refused, changed: false }; }
  const enc = encResult.encounter;
  if (hints.branch && !stored) {
    const srcEnc = ledger.encounters[encounterId(hints.branch.source)];
    enc.branchOf = { encounter: encounterId(hints.branch.source), at: now };
    enc.lineage = enc.lineage || {};
    for (const [mine, theirs] of Object.entries(hints.branch.map || {})) enc.lineage[mine] = { encounter: encounterId(hints.branch.source), message: theirs, event: (srcEnc && srcEnc.msgs[theirs]) || legacyEventId(hints.branch.source, theirs) };
  }
  if (hints.imported) {
    // an import records nothing for its messages (they are legacy: file metadata grants no attribution); events of messages the import replaced just stop being in the transcript
    const ids = new Set((thread.messages || []).map((m) => m?.id));
    for (const e of Object.values(ledger.events)) if (e.thread === tid && e.message && e.inTranscript && !ids.has(e.message)) e.inTranscript = false;
    for (const id of Object.keys(enc.msgs)) if (!ids.has(id)) delete enc.msgs[id];
    return { refused, changed: true };
  }
  const storedMsgs = new Map((stored?.messages || []).map((m) => [m.id, m]));
  const present = new Set();
  let lastPrompt = null;
  for (const msg of thread.messages || []) {
    if (!msg || msg.notice || msg.role === 'system' || !isRef(msg.id)) continue;
    const person = msg.role === 'user';
    const old = storedMsgs.get(msg.id);
    const planned = hints.planned?.[msg.id] || null;
    const oldEntries = old ? entriesOf(old, person) : [];
    const entries = entriesOf(msg, person);
    for (const entry of entries) {
      present.add(`${msg.id}#${versionKey(entry.i)}`);
      const final = isFinal(entry.status);
      const speaker = planned ? planned.speaker : person ? personId(tid) : assistantId(tid);
      const base = {
        thread: tid, message: msg.id, version: entry.i, speaker, inTranscript: true,
        expression: planned ? planned.expression : person ? 'person' : msg.local === true ? 'tool' : 'model',
        modality: planned ? planned.modality : person && msg.voice ? 'voice-transcript' : 'text',
        runtime: person ? undefined : msg.model,
        causes: !person && lastPrompt ? [lastPrompt] : undefined,
      };
      let head = headFor(ledger, tid, msg.id, entry.i);
      if (!head && old) {
        // stored before the ledger knew this message: LEGACY. Nothing to do unless it is being rewritten.
        const before = oldEntries.find((e) => versionKey(e.i) === versionKey(entry.i)) || (entry.i === 0 || entry.i === null ? oldEntries[0] : null);
        if (before) {
          const rewritten = before.text !== entry.text || (!final && isFinal(before.status));
          if (!rewritten) continue;
          const m = materializeLegacy(ledger, { thread: tid, message: msg.id, text: before.text, role: msg.role, version: entry.i, at: old.at, now, speaker: base.speaker, expression: base.expression, modality: base.modality, outcome: outcomeOf(before.status), runtime: base.runtime });
          if (!m.ok) { refused.push({ message: msg.id, code: m.code, detail: m.message }); continue; }
          head = m.event;
        }
      }
      if (!head && !old && enc.lineage?.[msg.id]) continue;   // copied into a branch: it keeps the attribution of what it was copied from
      if (!head) {
        // a message first stored now
        if (!final) {
          const r = recordEvent(ledger, { ...base, standing: entry.i > 0 ? 'regenerated' : 'recorded', state: 'open', occurrence: localOccurrence(tid, msg.id, entry.i) }, now);
          if (!r.ok) refused.push({ message: msg.id, code: r.code, detail: r.message });
        } else if (planned) {
          const r = recordEvent(ledger, { ...base, id: planned.id, standing: planned.standing || 'reported', text: planned.text, occurrence: planned.occurrence, audience: planned.audience, outcome: planned.outcome || 'received', sourceOutcome: planned.sourceOutcome, derivedFrom: planned.derivedFrom,
            corrects: planned.corrects, clock: planned.clock, note: planned.note, causes: planned.causes || base.causes }, now);
          if (!r.ok) refused.push({ message: msg.id, code: r.code, detail: r.message });
        } else {
          const r = recordEvent(ledger, { ...base, standing: entry.i > 0 ? 'regenerated' : 'recorded', text: entry.text, outcome: outcomeOf(entry.status), occurrence: localOccurrence(tid, msg.id, entry.i) }, now);
          if (!r.ok) refused.push({ message: msg.id, code: r.code, detail: r.message });
        }
        continue;
      }
      if (head.state === 'open') {
        if (final) finalizeEvent(ledger, head.id, { text: entry.text, outcome: outcomeOf(entry.status), runtime: base.runtime });
        continue;
      }
      // head is final
      const text = head.content?.text;
      if (!final) {
        const continued = !person && entry.text === text && head.outcome !== 'complete';
        recordEvent(ledger, { ...base, standing: continued ? 'continued' : 'retried', state: 'open', supersedes: head.id, occurrence: localOccurrence(tid, msg.id, entry.i, enc.seq + 1) }, now);
      } else if (text == null || head.content.digest !== digestOf(entry.text)) {
        if (head.modality === 'supplied-audio') continue;     // the transcript line of audio is not its source text
        const standing = person ? 'correction' : (text != null && entry.text.startsWith(text) ? 'continued' : 'revised');
        recordEvent(ledger, { ...base, standing, text: entry.text, outcome: outcomeOf(entry.status), corrects: head.id, supersedes: head.id, occurrence: localOccurrence(tid, msg.id, entry.i, enc.seq + 1) }, now);
      }
    }
    // which event the transcript shows now
    const shownVersion = msg.versions?.length > 1 && Number.isInteger(msg.versionIndex) ? msg.versionIndex : null;
    const shown = headFor(ledger, tid, msg.id, shownVersion);
    if (shown) enc.msgs[msg.id] = shown.id; else delete enc.msgs[msg.id];
    if (person) lastPrompt = shown ? shown.id : legacyEventId(tid, msg.id);
  }
  // presence: events whose message (or answer version) is not in the transcript any more stay, with the flag cleared
  for (const e of Object.values(ledger.events)) {
    if (e.thread !== tid || !e.message) continue;
    const here = present.has(`${e.message}#${versionKey(e.version)}`);
    if (e.inTranscript !== here) e.inTranscript = here;
  }
  return { refused, changed: true };
}
