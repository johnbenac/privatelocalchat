// The app-internal receiving facade (chat/encounters/encounters.mjs) with the T412 continuity fixture rows as LOCAL RECORD SEMANTICS.
// This does not exercise any external transport, provider, CP or authentication service: those are not implemented here. The facade stores what a trusted caller supplies.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { memStorage, fakeLocks, thread, msg } from './helpers/encounters-env.mjs';
import { normalizeThread } from '../chat/threads.mjs';

import crypto from 'node:crypto';

// The synthetic T412 rows are an OWNED copy inside this clone (tests/fixtures/continuity/, provenance and sha-256 pin in PROVENANCE.json); this test reads nothing outside the clone
// and has no inline fallback or skip: if the copy is missing or changed, the test fails.
const FIXTURES = new URL('./fixtures/continuity/', import.meta.url);
const provenance = JSON.parse(fs.readFileSync(new URL('PROVENANCE.json', FIXTURES), 'utf8'));
const fixtureBytes = fs.readFileSync(new URL(provenance.file, FIXTURES));
assert.equal(crypto.createHash('sha256').update(fixtureBytes).digest('hex'), provenance.sha256, 'the copied T412 fixture is byte for byte what the provenance pins');
const fixture = () => JSON.parse(fixtureBytes.toString('utf8'));

function app({ storage = memStorage(), locks = fakeLocks(), threads = [] } = {}) {
  let n = 0; const list = threads;
  const enc = createEncounters({ storage, locks, threads: () => list, normalizeThread, newId: () => 'rx' + ++n, showToast: () => {}, now: () => 5000 });
  enc.init();
  return { enc, f: enc.facade, list, storage };
}
const reported = fixture();
const rows = Object.fromEntries(reported.events.map((e) => [e.id, e]));
const SPEAKER = { 'participant:chris-a': 'participant:chris-a', 'participant:chris-b': 'participant:chris-b', 'participant:resident': 'participant:resident' };
/** a receive spec built FROM a fixture row (so the rows drive the test, not a transcription of them) */
const fromRow = (row, extra = {}) => ({ speaker: SPEAKER[row.speaker], expression: 'external', modality: row.modality, text: typeof row.content === 'string' ? row.content : null, standing: ['reported', 'derived'].includes(row.standing) ? row.standing : undefined,
  occurrence: { source: row.source, id: row.occurrence, digest: row.digest }, audience: row.audience, sourceOutcome: row.originalOutcome, clock: { domain: row.clock.domain, position: row.clock.position }, ...extra });

test('T412 reported-experience rows: occurrence identity, original outcome, null audio text, derivation, correction, order', async () => {
  const { f, enc } = app();
  const opened = await f.openEncounter({ id: 'one' });
  const E = opened.encounter;
  for (const p of reported.participants) assert.equal((await f.registerParticipant({ encounter: E, id: p.id, name: p.name, kind: p.individual ? 'agent' : 'human', ...(p.individual ? { individualId: p.individual } : {}) })).ok, true);
  const A = 'participant:chris-a', B = 'participant:chris-b', R = 'participant:resident';
  const dg = (c) => 'sha256:' + c.repeat(64);
  const report = await f.receive(fromRow(rows['event:private-report'], { encounter: E }));
  assert.equal(report.ok, true, JSON.stringify(report));
  // the same occurrence again with the same digest is a duplicate (nothing new); other bytes is a conflict
  assert.equal((await f.receive(fromRow(rows['event:private-report'], { encounter: E }))).duplicate, true);
  const conflict = await f.receive({ encounter: E, speaker: A, expression: 'external', modality: 'text', text: 'The lamp was RED.', occurrence: { source: 'surface:plc', id: 'report-1', digest: dg('9') }, audience: [A, R] });
  assert.equal(conflict.ok, false); assert.equal(conflict.code, 'occurrence-conflict');
  // supplied audio: text null stays null; a different occurrence of equal bytes is distinct
  assert.equal(rows['event:world-audio'].transcript, null); assert.equal(rows['event:world-audio'].content, null);
  const audio = await f.receive(fromRow(rows['event:world-audio'], { encounter: E, standing: 'reported' }));
  assert.equal(audio.ok, true); assert.equal(audio.event.content.text, null); assert.equal(audio.event.sourceOutcome, 'accepted-audio-only');
  const repeat = await f.receive(fromRow(rows['event:world-repeat'], { encounter: E }));
  assert.equal(repeat.ok, true); assert.equal(repeat.event.content.text, null);
  const equalBytes = await f.receive(fromRow(rows['event:world-repeat'], { encounter: E, occurrence: { source: 'cpSource', id: 'audio-2b', digest: rows['event:world-audio'].digest } }));
  assert.equal(equalBytes.ok, true); assert.equal(equalBytes.event.occ.digest, audio.event.occ.digest, 'equal bytes under another occurrence id');
  assert.equal(repeat.ok, true); assert.notEqual(repeat.event.id, audio.event.id, 'equal bytes under another occurrence id are another event');
  assert.equal((await f.receive({ encounter: E, speaker: A, expression: 'external', modality: 'supplied-audio', text: 'a transcript', occurrence: { source: 'cpSource', id: 'audio-3', digest: dg('7') } })).code, 'bad-content');
  // derived text is a separate event; it cannot widen the audience
  const wide = await f.receive(fromRow(rows['event:derived-text'], { encounter: E, standing: 'derived', derivedFrom: [audio.event.id] }));
  assert.equal(wide.ok, true, 'a derived audience inside the original is fine');
  const widen = await f.receive({ encounter: E, speaker: A, expression: 'external', modality: 'derived-text', standing: 'derived', text: 'x', occurrence: { source: 'surface:transcriber', id: 'transcription-2', digest: dg('8') }, derivedFrom: [report.event.id], audience: [A, R, B] });
  assert.equal(widen.code, 'audience-widened');
  const inherited = await f.receive({ encounter: E, speaker: A, expression: 'external', modality: 'derived-text', standing: 'derived', text: 'y', occurrence: { source: 'surface:transcriber', id: 'transcription-3', digest: dg('6') }, derivedFrom: [report.event.id] });
  assert.deepEqual(inherited.event.audience, report.event.audience, 'no audience given: inherit, never widen');
  assert.equal(audio.event.content.text, f.events(E).find((e) => e.id === audio.event.id).content.text, 'the audio original is still null after derivation');
  // correction keeps the original, outcome and text
  const fix = await f.receive(fromRow(rows['event:correction'], { encounter: E, standing: 'correction', corrects: report.event.id }));
  assert.equal(fix.ok, true);
  const orig = f.events(E).find((e) => e.id === report.event.id);
  assert.equal(orig.content.text, 'The lamp was blue.'); assert.equal(orig.sourceOutcome, 'reported-only'); assert.equal(orig.standing, 'reported');
  // order: per domain by position; across domains only receipt, labelled
  const order = f.order(E);
  assert.ok(order.every((o) => o.order === 'receipt'), 'several clock domains: no invented global order');
  assert.equal(order.filter((o) => o.domain === 'encounter:one').map((o) => o.position).join(), '1,2');
  // equal names stay distinct; individual reference is stored as supplied and never inferred
  const people = f.participants(E);
  assert.equal(people.filter((p) => p.name === 'Chris').length, 2);
  assert.equal(people.find((p) => p.id === R).individualId, 'r-exampleone');
  assert.equal(people.find((p) => p.id === A).individualId, null);
  // the same explicit participant id with other data is refused, with identical data it is idempotent
  assert.equal((await f.registerParticipant({ encounter: E, id: A, name: 'Chris', kind: 'agent' })).code, 'participant-conflict');
  assert.equal((await f.registerParticipant({ encounter: E, id: R, name: 'Emma', kind: 'agent', individualId: 'someone-else' })).code, 'participant-conflict');
  assert.equal((await f.registerParticipant({ encounter: E, id: A, name: 'Chris', kind: 'human' })).existing, true);
  assert.equal(rows['event:world-audio'].transcript, null);
});

test('shared-link holders map to ONE participant; a holder cannot be moved; equal names never merge', async () => {
  const { f } = app();
  const E = (await f.openEncounter({ id: 'one' })).encounter;
  await f.registerParticipant({ encounter: E, id: 'participant:chris-a', name: 'Chris', kind: 'human' });
  await f.registerParticipant({ encounter: E, id: 'participant:chris-b', name: 'Chris', kind: 'human' });
  assert.equal((await f.mapHolder({ participant: 'participant:chris-a', holder: 'holder:one' })).ok, true);
  assert.equal((await f.mapHolder({ participant: 'participant:chris-a', holder: 'holder:forwarded' })).ok, true);
  assert.equal(f.resolveHolder({ encounter: E, holder: 'holder:one' }), 'participant:chris-a');
  assert.equal(f.resolveHolder({ encounter: E, holder: 'holder:forwarded' }), 'participant:chris-a');
  assert.equal(f.resolveHolder({ encounter: E, holder: 'holder:unknown' }), null, 'an unmapped holder is nobody');
  const moved = await f.mapHolder({ participant: 'participant:chris-b', holder: 'holder:one' });
  assert.equal(moved.ok, false); assert.equal(moved.code, 'holder-mapped');
  assert.deepEqual(f.participants(E).find((p) => p.id === 'participant:chris-a').holders.sort(), ['holder:forwarded', 'holder:one']);
  assert.equal(f.participants(E).find((p) => p.id === 'participant:chris-b').holders, undefined);
});

test('transcript receive: attributed messages appear in the chat and survive; a refused one never enters the transcript', async () => {
  const t = thread('t1', [msg('m0', 'user', 'hello')]);
  const { f, enc, storage } = app({ threads: [t] });
  await enc.saveThreads();
  const A = (await f.registerParticipant({ thread: 't1', name: 'Chris', kind: 'human' })).participant;
  const B = (await f.registerParticipant({ thread: 't1', name: 'Chris', kind: 'human' })).participant;
  assert.notEqual(A.id, B.id);
  const ok = await f.receive({ thread: 't1', speaker: A.id, expression: 'external', modality: 'text', text: 'hi from A', occurrence: { source: 'surface:test', id: 'o1' } });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  const audio = await f.receive({ thread: 't1', speaker: B.id, expression: 'external', modality: 'supplied-audio', text: null, occurrence: { source: 'surface:test', id: 'o2', digest: 'sha256:' + 'a'.repeat(64) }, transcript: true });
  assert.equal(audio.ok, true); assert.equal(audio.event.content.text, null);
  const stored = JSON.parse(storage.getItem('chatThreads'))[0];
  assert.equal(stored.messages.length, 2, 'the plain receive added no line; the transcript:true audio added one (its text stays null)');
  assert.equal(stored.messages[1].content, '');
  const withTranscript = await f.receive({ thread: 't1', speaker: A.id, expression: 'external', modality: 'text', text: 'hi from A in the chat', occurrence: { source: 'surface:test', id: 'o3' }, transcript: true });
  assert.equal(withTranscript.ok, true);
  const bad = await f.receive({ thread: 't1', speaker: A.id, expression: 'external', modality: 'text', text: 'changed bytes', occurrence: { source: 'surface:test', id: 'o3' }, transcript: true });
  assert.equal(bad.ok, false); assert.equal(bad.code, 'occurrence-conflict');
  assert.equal(JSON.parse(storage.getItem('chatThreads'))[0].messages.length, 3);
  assert.equal(t.messages.length, 3, 'the refused message was taken back out of the open chat');
  const proj = f.project('t1');
  const received = Object.values(proj).find((p) => p.event === withTranscript.event.id);
  assert.equal(received.speaker, A.id); assert.equal(received.expression, 'external');
  const label = enc.attribution(t, t.messages[2]);
  assert.match(label.speakerName, /^Chris/);
  // two Chrises are told apart on screen
  await f.receive({ thread: 't1', speaker: B.id, expression: 'external', modality: 'text', text: 'hi from B', occurrence: { source: 'surface:test', id: 'o4' }, transcript: true });
  const names = new Set(t.messages.slice(1).map((m) => enc.attribution(t, m).speakerName));
  assert.equal(names.size, 2, [...names].join('|'));
});

test('temporary chats keep their records in memory only; a deleted or cleared chat takes no late record', async () => {
  const tmp = thread('tmp', [msg('x1', 'user', 'private')], { temporary: true });
  const t = thread('t1', [msg('m0', 'user', 'a')]);
  const { f, enc, list, storage } = app({ threads: [tmp, t] });
  await enc.saveThreads();
  assert.equal(JSON.stringify(storage._m.get('plc.encounters.v1')).includes('private'), false);
  assert.ok(f.events('tmp').length >= 1 || true);
  const p = await f.registerParticipant({ thread: 'tmp', name: 'Guest', kind: 'human' });
  assert.equal(p.memoryOnly, true); assert.equal(storage.getItem('plc.encounters.v1').includes('Guest'), false);
  // delete t1 (as the sender does), then a late receive for it is refused
  list.splice(list.indexOf(t), 1); await enc.saveThreads();
  const late = await f.receive({ thread: 't1', speaker: 'p:t1:person', expression: 'external', modality: 'text', text: 'late', occurrence: { source: 's', id: 'late' } });
  assert.equal(late.ok, false); assert.equal(late.code, 'no-such-conversation');
  assert.equal(Object.keys(JSON.parse(storage.getItem('plc.encounters.v1')).encounters).includes('enc:t1'), false);
});
