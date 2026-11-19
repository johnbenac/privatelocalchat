// The context composer (chat/context/composer.mjs), pure. Synthetic data only: every name, id and text here is made up for the test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { composeContext, inputsDigestOf, MEMORY_PREFACE, PREFERENCES_PREFACE } from '../chat/context/composer.mjs';
import { emptyLedger, ensureEncounter, addParticipant, recordEvent, encounterId, personId } from '../chat/encounters/records.mjs';

const T = 'chat-1';
const EID = encounterId(T);
/** a ledger with the person, two individuals (R1, R2) and a guest, built with the real record rules */
function world() {
  const l = emptyLedger(); ensureEncounter(l, T, 1);
  const R1 = addParticipant(l, { thread: T }, { id: 'p:r1', kind: 'agent', name: 'Rin', individualId: 'ind:rin' }).participant.id;
  const R2 = addParticipant(l, { thread: T }, { id: 'p:r2', kind: 'agent', name: 'Rin', individualId: 'ind:other' }).participant.id;   // same NAME, another individual
  const G = addParticipant(l, { thread: T }, { id: 'p:g', kind: 'human', name: 'Guest' }).participant.id;
  const P = personId(T);
  let n = 0;
  const rec = (spec) => { const r = recordEvent(l, { thread: T, expression: 'person', modality: 'text', occurrence: { source: 'syn', id: 'o' + (++n) }, ...spec }, 10 + n); assert.equal(r.ok, true, JSON.stringify(r)); return r.event; };
  return { l, R1, R2, G, P, rec };
}
const msgs = (list) => list.map(([id, role, content, extra]) => ({ id, role, content, at: 1, ...(extra || {}) }));
// what can reach a provider: items, the view and the options (`excluded` is for the host only and carries ids and reasons, never text)
const providerSide = (r) => JSON.stringify([r.items, r.view, r.options]);
const everything = (r) => JSON.stringify([r.items, r.excluded, r.view, r.options, r.stale]);
const compose = (w, receiver, messages, extra = {}) => composeContext({ receiver, encounter: { id: EID, msgs: w.msgs || {} }, ledger: w.l, thread: { id: T }, messages, ...extra });

test('audience: each receiver gets only what its audience includes, and nothing else of it appears anywhere in the result', async () => {
  const w = world();
  const open = w.rec({ speaker: w.P, text: 'OPEN to all', audience: 'encounter', message: 'm1' });
  const toR2 = w.rec({ speaker: w.P, text: 'SECRET-FOR-R2', audience: [w.R2], message: 'm2' });
  const toR1 = w.rec({ speaker: w.P, text: 'SECRET-FOR-R1', audience: [w.R1], message: 'm3' });
  const report = w.rec({ speaker: w.G, text: 'REPORT-R2-ONLY', audience: [w.R2, w.G], standing: 'reported', expression: 'external' });
  w.msgs = { m1: open.id, m2: toR2.id, m3: toR1.id };
  const messages = msgs([['m1', 'user', 'OPEN to all'], ['m2', 'user', 'SECRET-FOR-R2'], ['m3', 'user', 'SECRET-FOR-R1']]);
  void report;
  const a = await compose(w, w.R1, messages), b = await compose(w, w.R2, messages);
  assert.deepEqual(a.items.map((i) => i.provenance.eventId).filter(Boolean).sort(), [open.id, toR1.id].sort());
  assert.deepEqual(b.items.map((i) => i.provenance.eventId).filter(Boolean).sort(), [open.id, toR2.id, report.id].sort());
  assert.ok(!everything(a).includes('SECRET-FOR-R2') && !everything(a).includes('REPORT-R2-ONLY'), 'R1 result carries no trace of R2 only text');
  assert.ok(!everything(b).includes('SECRET-FOR-R1'), 'R2 result carries no trace of R1 only text');
  assert.ok(a.excluded.some((x) => x.id === toR2.id && x.reason === 'audience'));
  assert.ok(a.excluded.every((x) => !('text' in x)), 'an exclusion keeps id, kind and reason only');
  // every included item says where it came from and why it is here
  for (const i of a.items) { assert.ok(i.reason); assert.ok(i.provenance.source); assert.ok('audience' in i.provenance); assert.ok('standing' in i.provenance); }
  assert.notEqual(a.digest, b.digest);
});

test('legacy transcript lines (no record) have no recorded audience: left out by default, and shown only when the person\'s policy includes them', async () => {
  const w = world();
  const m = msgs([['old1', 'user', 'LEGACY-ONE'], ['old2', 'assistant', 'LEGACY-TWO']]);
  const dflt = await compose(w, w.R1, m);
  assert.equal(dflt.items.length, 0); assert.ok(!everything(dflt).includes('LEGACY-ONE'), 'not told to a receiver by default');
  assert.ok(dflt.excluded.every((x) => x.reason === 'legacy-excluded' && !('text' in x)));
  const inc = await compose(w, w.R1, m, { policy: { legacyTranscript: 'include' } });
  assert.deepEqual(inc.items.map((i) => [i.provenance.standing, i.provenance.attributedTo]), [['legacy', null], ['legacy', null]], 'never attributed to anyone');
  const exc = await compose(w, w.R1, m, { policy: { legacyTranscript: 'exclude' } });
  assert.equal(exc.items.length, 0);
});

test('the standing policy applies to recorded events that are not transcript lines too', async () => {
  const w = world();
  const reported = w.rec({ speaker: w.G, text: 'REPORTED-TEXT', audience: [w.R1, w.G], standing: 'reported', expression: 'external' });
  const other = w.rec({ speaker: w.G, text: 'OTHER-STANDING-TEXT', audience: [w.R1, w.G], standing: 'observed', expression: 'external' });
  const all = await compose(w, w.R1, []);
  assert.ok(everything(all).includes('REPORTED-TEXT') && everything(all).includes('OTHER-STANDING-TEXT'), 'no standing policy: both are told');
  const only = await compose(w, w.R1, [], { policy: { standings: ['reported'] } });
  assert.ok(everything(only).includes('REPORTED-TEXT'));
  assert.ok(!everything(only).includes('OTHER-STANDING-TEXT'), 'an event whose standing the policy does not allow is not told');
  assert.ok(only.excluded.some((x) => x.id === other.id && x.reason === 'standing'));
  void reported;
});

test('fail closed: a participant of ANOTHER conversation is not a receiver of this one', async () => {
  const w = world();
  ensureEncounter(w.l, 'chat-2', 1);
  const foreign = addParticipant(w.l, { thread: 'chat-2' }, { id: 'p:foreign', kind: 'agent', name: 'Rin', individualId: 'ind:rin' }).participant.id;
  const ev = w.rec({ speaker: w.P, text: 'ONLY-IN-CHAT-ONE', audience: 'encounter', message: 'm1' });
  w.msgs = { m1: ev.id };
  const r = await compose(w, foreign, msgs([['m1', 'user', 'ONLY-IN-CHAT-ONE']]));
  assert.equal(r.error?.code, 'unknown-receiver');
  assert.equal(r.items.length, 0); assert.ok(!everything(r).includes('ONLY-IN-CHAT-ONE'));
});

test('a receiver is never found by name: an equal name with another individual id gets nothing of the other', async () => {
  const w = world();
  const ev = w.rec({ speaker: w.P, text: 'TO-THE-OTHER-RIN', audience: [w.R2], message: 'm1' });
  w.msgs = { m1: ev.id };
  const r = await compose(w, w.R1, msgs([['m1', 'user', 'TO-THE-OTHER-RIN']]));
  assert.equal(r.items.length, 0);
  assert.ok(!everything(r).includes('TO-THE-OTHER-RIN'));
});

test('fail closed: a receiver that is not a participant of the encounter composes nothing', async () => {
  const w = world();
  const r = await compose(w, 'p:nobody', msgs([['m1', 'user', 'hello']]));
  assert.equal(r.error.code, 'unknown-receiver');
  assert.deepEqual(r.view.messages, []); assert.equal(r.items.length, 0);
});

test('filter before use: retrieve, embed and summarize are handed only permitted items (spy), and cannot add anything', async () => {
  const w = world();
  const ev = w.rec({ speaker: w.P, text: 'visible line', audience: 'encounter', message: 'm1' });
  w.msgs = { m1: ev.id };
  const seen = [];
  const spy = (name) => async (items) => { seen.push(...items.map((i) => name + ':' + i.id + ':' + i.text)); return name === 'retrieve' ? [...items.map((i) => i.id), 'doc:invented', 'doc:forbidden'] : name === 'summarize' ? 'x' : undefined; };
  const documents = [
    { id: 'doc:ok', name: 'ok.txt', text: 'DOC-FOR-R1', audience: [w.R1] },
    { id: 'doc:forbidden', name: 'no.txt', text: 'DOC-FOR-R2', audience: [w.R2] },
    { id: 'doc:personal', name: 'mine.txt', text: 'DOC-PERSONAL' },
  ];
  const reports = [{ id: 'rep:no', text: 'REPORT-NOBODY-MAPPED', standing: 'reported', audience: ['h:unmapped'] }, { id: 'rep:ok', text: 'REPORT-FOR-R1', standing: 'reported', audience: ['h:r1'] }];
  const r = await compose(w, w.R1, msgs([['m1', 'user', 'visible line']]), { documents, reports, policy: { handleMap: { 'h:r1': w.R1 } }, stages: { embed: spy('embed'), retrieve: spy('retrieve'), summarize: spy('summarize') } });
  assert.deepEqual(seen.filter((s) => s.startsWith('embed')).sort(), ['embed:doc:ok:DOC-FOR-R1', 'embed:rep:ok:REPORT-FOR-R1']);
  assert.deepEqual(seen.filter((s) => s.startsWith('retrieve')).sort(), ['retrieve:doc:ok:DOC-FOR-R1', 'retrieve:rep:ok:REPORT-FOR-R1']);
  for (const s of seen) for (const bad of ['DOC-FOR-R2', 'DOC-PERSONAL', 'REPORT-NOBODY-MAPPED']) assert.ok(!s.includes(bad), s);
  assert.deepEqual(r.items.filter((i) => i.kind === 'document' || i.kind === 'report').map((i) => i.id).sort(), ['doc:ok', 'rep:ok'], 'an id the stage was never given is dropped');
  assert.ok(!everything(r).includes('DOC-FOR-R2') && !everything(r).includes('DOC-PERSONAL'));
});

test('precedence: a correction the receiver may see replaces its original; a correction it may not see changes nothing and leaves no pointer', async () => {
  const w = world();
  const orig = w.rec({ speaker: w.G, text: 'the lamp is red', audience: 'encounter', standing: 'reported', expression: 'external' });
  const fix = w.rec({ speaker: w.G, text: 'the lamp is blue', audience: [w.R1], standing: 'correction', expression: 'external', corrects: orig.id });
  const forR1 = await compose(w, w.R1, []);
  assert.deepEqual(forR1.items.map((i) => i.provenance.eventId), [fix.id]);
  assert.ok(forR1.excluded.some((x) => x.id === orig.id && x.reason === 'superseded-by:' + fix.id));
  assert.equal(forR1.items[0].provenance.corrects, orig.id);
  const forR2 = await compose(w, w.R2, []);
  assert.deepEqual(forR2.items.map((i) => i.provenance.eventId), [orig.id], 'the original stays for one who may not see the correction');
  assert.ok(!everything(forR2).includes('lamp is blue') && !providerSide(forR2).includes(fix.id));
  // a correction whose original is NOT the receiver's to see keeps no pointer to it
  const hidden = w.rec({ speaker: w.G, text: 'secret original', audience: [w.R2], standing: 'reported', expression: 'external' });
  const fix2 = w.rec({ speaker: w.G, text: 'corrected for both', audience: [w.R2], standing: 'correction', expression: 'external', corrects: hidden.id });
  w.l.events[fix2.id].audience = { scope: 'encounter' };   // the record rules never allow a wider correction; a damaged or imported ledger might hold one, and the composer must still not point at the original
  const r1 = await compose(w, w.R1, []);
  const item = r1.items.find((i) => i.text === 'corrected for both');
  assert.equal(item.provenance.corrects, undefined); assert.equal(item.provenance.correctsHidden, true);
  assert.ok(!providerSide(r1).includes(hidden.id) && !everything(r1).includes('secret original'));
});

test('derivation: a derived item never outlives its permitted inputs (also through a chain)', async () => {
  const w = world();
  const base = w.rec({ speaker: w.G, text: 'base report', audience: [w.R2], standing: 'reported', expression: 'external' });
  const d1 = w.rec({ speaker: w.G, text: 'DERIVED-ONE', audience: [w.R2], standing: 'derived', expression: 'external', modality: 'derived-text', derivedFrom: [base.id] });
  const shared = w.rec({ speaker: w.G, text: 'shared base', audience: 'encounter', standing: 'reported', expression: 'external' });
  const d2 = w.rec({ speaker: w.G, text: 'DERIVED-SHARED', audience: 'encounter', standing: 'derived', expression: 'external', modality: 'derived-text', derivedFrom: [shared.id] });
  const r1 = await compose(w, w.R1, []);
  assert.deepEqual(r1.items.map((i) => i.provenance.eventId).sort(), [shared.id, d2.id].sort());
  const r2 = await compose(w, w.R2, []);
  assert.ok(r2.items.some((i) => i.provenance.eventId === d1.id));
  // inputs missing (swept) or no longer permitted: the derived item goes with them
  const gone = structuredClone(w.l); delete gone.events[shared.id];
  const r3 = await composeContext({ receiver: w.R1, encounter: { id: EID, msgs: {} }, ledger: gone, thread: { id: T }, messages: [] });
  assert.deepEqual(r3.items.map((i) => i.provenance.eventId), []);
  assert.ok(r3.excluded.some((x) => x.id === d2.id && x.reason === 'derived-input-missing'));
  const narrowed = structuredClone(w.l); narrowed.events[shared.id].audience = { scope: 'list', participants: [w.R2] };
  const r4 = await composeContext({ receiver: w.R1, encounter: { id: EID, msgs: {} }, ledger: narrowed, thread: { id: T }, messages: [] });
  assert.deepEqual(r4.items.map((i) => i.provenance.eventId), [], 'audience change: the input and the derived item both leave');
  assert.ok(r4.excluded.some((x) => x.id === d2.id && x.reason === 'derived-input-not-permitted'));
});

test('a summary stands on its inputs: permitted, edited standing kept, stale marked, recomputed from permitted inputs only, gone when an input is not permitted', async () => {
  const w = world();
  const e1 = w.rec({ speaker: w.P, text: 'one', audience: 'encounter', message: 'm1' });
  const e2 = w.rec({ speaker: w.P, text: 'two', audience: 'encounter', message: 'm2' });
  const e3 = w.rec({ speaker: w.P, text: 'three', audience: 'encounter', message: 'm3' });
  w.msgs = { m1: e1.id, m2: e2.id, m3: e3.id };
  const messages = msgs([['m1', 'user', 'one'], ['m2', 'assistant', 'two'], ['m3', 'user', 'three']]);
  const digest = inputsDigestOf(messages.slice(0, 2));
  const ok = await compose(w, w.R1, messages, { summary: { text: 'S-TEXT', upTo: 2, inputsDigest: digest } });
  assert.equal(ok.items.find((i) => i.kind === 'summary').provenance.standing, 'derived');
  assert.deepEqual(ok.view.messages.map((m) => m.id), ['m3']); assert.equal(ok.view.summary.text, 'S-TEXT');
  assert.deepEqual(ok.items.find((i) => i.kind === 'summary').provenance.derivedFrom.sort(), [e1.id, e2.id].sort());
  const edited = await compose(w, w.R1, messages, { summary: { text: 'EDITED', upTo: 2, inputsDigest: digest, edited: true } });
  assert.equal(edited.items.find((i) => i.kind === 'summary').provenance.standing, 'edited-by-person');
  assert.equal(edited.items.find((i) => i.kind === 'summary').provenance.edited, true);
  // a legacy summary (no digest) is honest about it
  const legacy = await compose(w, w.R1, messages, { summary: { text: 'OLD', upTo: 2 } });
  assert.equal(legacy.items.find((i) => i.kind === 'summary').provenance.standing, 'legacy-summary');
  // inputs changed after the summary was made: stale, not used, its inputs are shown instead
  const changed = messages.map((m) => (m.id === 'm2' ? { ...m, content: 'two (edited)' } : m));
  const stale = await compose(w, w.R1, changed, { summary: { text: 'EDITED', upTo: 2, inputsDigest: digest, edited: true } });
  assert.deepEqual(stale.stale, [{ id: 'summary', reason: 'inputs-changed', wasEdited: true }]);
  assert.ok(!stale.items.some((i) => i.kind === 'summary'));
  assert.deepEqual(stale.view.messages.map((m) => m.id), ['m1', 'm2', 'm3']); assert.equal(stale.view.summary, undefined);
  // recomputed by a stage that is handed only permitted inputs
  let fed = null;
  const re = await compose(w, w.R1, changed, { summary: { text: 'EDITED', upTo: 2, inputsDigest: digest, edited: true }, stages: { summarize: async (items) => { fed = items; return 'FRESH'; } } });
  assert.deepEqual(fed.map((x) => x.text), ['one', 'two (edited)']);
  const fresh = re.items.find((i) => i.kind === 'summary');
  assert.equal(fresh.text, 'FRESH'); assert.equal(fresh.provenance.standing, 'recomputed'); assert.equal(fresh.provenance.replacedEdited, true); assert.equal(fresh.provenance.edited, false);
  // the audience changes (one input becomes private to someone else): the summary is not the receiver's any more and its text never reaches a stage
  const narrowed = structuredClone(w.l); narrowed.events[e2.id].audience = { scope: 'list', participants: [w.R2] };
  let fedAgain = false;
  const gone = await composeContext({ receiver: w.R1, encounter: { id: EID, msgs: w.msgs }, ledger: narrowed, thread: { id: T }, messages, summary: { text: 'S-TEXT', upTo: 2, inputsDigest: digest }, stages: { summarize: async () => { fedAgain = true; return 'x'; } } });
  assert.ok(!gone.items.some((i) => i.kind === 'summary'));
  assert.ok(gone.excluded.some((x) => x.id === 'summary' && x.reason === 'derived-input-not-permitted'));
  assert.deepEqual(gone.view.messages.map((m) => m.id), ['m1', 'm3'], 'the permitted inputs stand on their own; the private one is gone');
  assert.equal(fedAgain, false);
  assert.ok(!everything(gone).includes('S-TEXT'));
  // a summary offered to a listed audience only
  const aud = await compose(w, w.R1, messages, { summary: { text: 'S-TEXT', upTo: 2, inputsDigest: digest, audience: [w.R2] } });
  assert.ok(!aud.items.some((i) => i.kind === 'summary'));
});

test('legacy global memory and preferences keep honest personal scope: off for a receiver by default, never attributed, never all-agent knowledge, never in a temporary chat', async () => {
  const w = world();
  const memory = { enabled: true, items: [{ text: 'likes tea' }, { text: 'has a cat' }] }, preferences = { instructions: ' be brief ' };
  const none = await compose(w, w.R1, [], { memory, preferences });
  assert.equal(none.items.length, 0); assert.deepEqual(none.options.preamble, []);
  assert.deepEqual(none.excluded.map((x) => [x.id, x.reason]).sort(), [['memory', 'personal-scope'], ['preferences', 'personal-scope']]);
  const chosen = await compose(w, w.R1, [], { memory, preferences, policy: { personal: { memory: true, preferences: true } } });
  assert.deepEqual(chosen.options.preamble, [PREFERENCES_PREFACE + 'be brief', MEMORY_PREFACE + '- likes tea\n- has a cat']);
  for (const i of chosen.items) {
    assert.equal(i.provenance.scope, 'personal'); assert.equal(i.provenance.attributedTo, null); assert.equal(i.provenance.standing, 'legacy'); assert.equal(i.provenance.audience, 'chosen-by-owner');
    assert.ok(!JSON.stringify(i).includes('ind:rin') && !JSON.stringify(i).includes(w.R1), 'no individual is named as its source');
    assert.notEqual(i.provenance.audience, 'encounter'); assert.ok(!/all/i.test(JSON.stringify(i.provenance.audience)));
  }
  const temp = await composeContext({ receiver: w.R1, encounter: { id: EID, msgs: {} }, ledger: w.l, thread: { id: T, temporary: true }, messages: [], memory, preferences, policy: { personal: { memory: true } } });
  assert.ok(temp.excluded.some((x) => x.id === 'memory' && x.reason === 'temporary-chat'));
  assert.ok(!everything(temp).includes('likes tea'));
  const off = await compose(w, w.R1, [], { memory: { enabled: false, items: [{ text: 'x' }] }, policy: { personal: { memory: true } } });
  assert.ok(off.excluded.some((x) => x.reason === 'memory-off'));
});

test('admitted design and lore belong to the individual they were admitted for, never to a name', async () => {
  const w = world();
  const design = [
    { id: 'd:rin', kind: 'design', individualId: 'ind:rin', text: 'DESIGN-OF-RIN' }, { id: 'l:rin', kind: 'lore', individualId: 'ind:rin', text: 'LORE-OF-RIN' },
    { id: 'd:other', kind: 'design', individualId: 'ind:other', text: 'DESIGN-OF-OTHER' }, { id: 'd:none', kind: 'design', individualId: null, text: 'DESIGN-UNASSIGNED' },
  ];
  const r = await compose(w, w.R1, [], { design });
  assert.deepEqual(r.items.map((i) => i.id), ['d:rin', 'l:rin']); assert.deepEqual(r.options.preamble, ['DESIGN-OF-RIN', 'LORE-OF-RIN']);
  assert.ok(r.items.every((i) => i.provenance.attributedTo.authenticated === false));
  assert.ok(!everything(r).includes('OF-OTHER') && !everything(r).includes('UNASSIGNED'));
  const guest = await compose(w, w.G, [], { design });
  assert.equal(guest.items.length, 0, 'a participant with no individual id gets no design');
});

test('reported attribution: handles map to participants only through the explicit map, as supplied; a blank handle names nobody', async () => {
  const w = world();
  const reports = [
    { id: 'r:named', text: 'NAMED-REPORT', standing: 'reported', audience: [' h:rin '], individual: ' ind:x ' },   // spaces are part of the handle
    { id: 'r:trimmed', text: 'TRIMMED-LOOKALIKE', standing: 'reported', audience: ['h:rin'] },
    { id: 'r:blank', text: 'BLANK-REPORT', standing: 'reported', audience: ['   '] },
    { id: 'r:blank-key', text: 'BLANK-KEY', standing: 'reported', audience: [' '] },
  ];
  const r = await compose(w, w.R1, [], { reports, policy: { handleMap: { ' h:rin ': w.R1, ' ': w.R1 } } });
  assert.deepEqual(r.items.map((i) => i.id), ['r:named'], 'a blank handle never matches, even when the map has an entry for it; a trimmed look-alike is a different handle');
  assert.deepEqual(r.excluded.map((x) => [x.id, x.reason]).sort(), [['r:blank', 'audience-unmapped'], ['r:blank-key', 'audience-unmapped'], ['r:trimmed', 'audience-unmapped']]);
  const at = r.items[0].provenance.attributedTo;
  assert.equal(at.individual, ' ind:x ', 'the handle is exactly as supplied'); assert.equal(at.authenticated, false);
  assert.deepEqual(r.items[0].provenance.audience, [' h:rin ']);
  // a blank attribution field next to a usable audience is carried as unnamed, never as a handle
  const mixed = await compose(w, w.R1, [], { reports: [{ id: 'r:mixed', text: 'MIXED', standing: 'reported', audience: ['h:r1'], individual: '   ', run: 'run:1' }], policy: { handleMap: { 'h:r1': w.R1 } } });
  assert.deepEqual(mixed.items[0].provenance.attributedTo, { run: 'run:1', unnamed: ['individual'], authenticated: false });
  assert.equal(r.items[0].provenance.standing, 'reported');
});

test('documents: an attachment follows the message that carried it; a library document is the person\'s own unless its audience says otherwise', async () => {
  const w = world();
  const a = w.rec({ speaker: w.P, text: 'see file', audience: 'encounter', message: 'm1' });
  const b = w.rec({ speaker: w.P, text: 'private file', audience: [w.R2], message: 'm2' });
  w.msgs = { m1: a.id, m2: b.id };
  const documents = [{ id: 'd1', name: 'a.txt', text: 'FILE-A', attachedTo: 'm1' }, { id: 'd2', name: 'b.txt', text: 'FILE-B', attachedTo: 'm2' }, { id: 'd3', name: 'lib.txt', text: 'LIB' }];
  const r = await compose(w, w.R1, msgs([['m1', 'user', 'see file'], ['m2', 'user', 'private file']]), { documents });
  assert.deepEqual(r.options.attachmentText, { d1: 'FILE-A' });
  assert.deepEqual(r.options.sources, [{ docId: 'd1', name: 'a.txt' }]);
  assert.ok(!everything(r).includes('FILE-B') && !everything(r).includes('LIB'));
  assert.deepEqual(r.excluded.filter((x) => x.kind === 'document').map((x) => [x.id, x.reason]).sort(), [['d2', 'carrier-message-not-permitted'], ['d3', 'personal-scope']]);
});

test('the composer changes none of its inputs and is deterministic', async () => {
  const w = world();
  const e = w.rec({ speaker: w.P, text: 'one', audience: 'encounter', message: 'm1' });
  const input = { receiver: w.R1, encounter: { id: EID, msgs: { m1: e.id } }, ledger: w.l, thread: { id: T }, messages: msgs([['m1', 'user', 'one']]), memory: { enabled: true, items: [{ text: 'x' }] }, policy: { personal: { memory: true } } };
  const before = JSON.stringify(input);
  const deepFreeze = (v) => { if (v && typeof v === 'object') { Object.values(v).forEach(deepFreeze); Object.freeze(v); } return v; };
  const x = await composeContext(deepFreeze(structuredClone(input))), y = await composeContext(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(x.digest, y.digest);
});

// ---- concurrency: the composer persists NOTHING and shares no state, so the shared thing is the ledger a caller reads. ----------------------------------------------------------------
// Invariants: (1) a compose over a snapshot equals the compose of that same snapshot made alone, whatever else is being written meanwhile; (2) composing writes nothing to the ledger it was given.
test('parallel: 8 concurrent composes over snapshots while records are being written each equal the compose of their own snapshot (20 repeats)', async () => {
  for (let repeat = 0; repeat < 20; repeat++) {
    const w = world();
    const live = w.l; let n = 0;
    const snapshots = [];
    const writer = async () => { for (let i = 0; i < 40; i++) { w.rec({ speaker: w.G, text: 'live ' + repeat + '-' + i, audience: i % 3 === 0 ? [w.R1] : i % 3 === 1 ? [w.R2] : 'encounter', standing: 'reported', expression: 'external' }); if (i % 5 === 0) snapshots.push(structuredClone(live)); await new Promise((r) => setImmediate(r)); } };
    snapshots.push(structuredClone(live));
    const run = async (snap, receiver) => { const frozen = JSON.stringify(snap); const r = await composeContext({ receiver, encounter: { id: EID, msgs: {} }, ledger: snap, thread: { id: T }, messages: [], stages: { embed: async () => { await new Promise((q) => setImmediate(q)); } }, documents: [{ id: 'd', name: 'd', text: 'D', audience: [receiver] }] }); assert.equal(JSON.stringify(snap), frozen, 'composing wrote nothing'); return r; };
    const pending = writer();
    await new Promise((r) => setImmediate(r));
    const jobs = [];
    for (let k = 0; k < 8; k++) { const snap = snapshots[k % snapshots.length]; const receiver = k % 2 ? w.R1 : w.R2; jobs.push(run(snap, receiver).then((got) => ({ got, snap, receiver }))); n++; }
    const done = await Promise.all(jobs); await pending;
    assert.equal(done.length, n);
    for (const { got, snap, receiver } of done) { const alone = await run(structuredClone(snap), receiver); assert.equal(got.digest, alone.digest); assert.deepEqual(got.items, alone.items); }
  }
});
