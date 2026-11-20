// The documented display controls of the app-internal receiving facade (docs/ENCOUNTERS.md): `transcript` is a BOOLEAN display request, `role` names the shown line's role.
// A source text string must never be read as an append command. Invalid types are refused BEFORE any live or shared mutation (the open chat, chatThreads and the ledger stay byte for byte).
// Production modules (chat/encounters/*), the in-process stand-ins of tests/helpers/encounters-env.mjs for storage and Web Locks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { memStorage, fakeLocks, thread, msg } from './helpers/encounters-env.mjs';
import { normalizeThread } from '../chat/threads.mjs';

async function app() {
  const storage = memStorage({ chatThreads: JSON.stringify([thread('t1', [msg('u1', 'user', 'hi'), msg('a1', 'assistant', 'hello')])]) });
  const list = JSON.parse(storage.getItem('chatThreads')).map((t) => normalizeThread(t));
  let n = 0, shown = 0;
  const enc = createEncounters({ storage, locks: fakeLocks(), threads: () => list, normalizeThread, newId: () => 'rx' + ++n, showToast: () => {}, now: () => 5000, onTranscriptChanged: () => { shown++; } });
  await enc.prepare(); enc.init();
  const p = await enc.facade.registerParticipant({ thread: 't1', id: 'p:remote', name: 'Remote', kind: 'human' });
  assert.equal(p.ok, true);
  return { enc, f: enc.facade, list, storage, shown: () => shown };
}
const spec = (extra = {}) => ({ thread: 't1', speaker: 'p:remote', expression: 'external', modality: 'text', text: 'source words', occurrence: { source: 'surface:test', id: 'o1' }, ...extra });
const snap = (a) => JSON.stringify([a.storage.getItem('chatThreads'), a.storage.getItem('plc.encounters.v1'), a.list.map((t) => t.messages.length)]);

test('a string / number / object / null-ish display flag is refused before any mutation (it is never an append command)', async () => {
  for (const bad of ['source words', 'false', 'true', '', 1, 0, {}, [], null, NaN]) {
    const a = await app();
    const before = snap(a);
    const r = await a.f.receive(spec({ transcript: bad, occurrence: { source: 'surface:test', id: 'bad-' + String(bad) } }));
    assert.equal(r.ok, false, 'refused: ' + JSON.stringify(bad));
    assert.equal(r.code, 'bad-transcript', JSON.stringify(bad));
    assert.equal(snap(a), before, 'no live line, no stored chat, no record for ' + JSON.stringify(bad));
    assert.equal(a.shown(), 0, 'the screen was never told to show a line');
  }
});

test('the transcript text a source supplies is content only; the Boolean decides display', async () => {
  const a = await app();
  const shown = await a.f.receive(spec({ transcript: true, occurrence: { source: 'surface:test', id: 'show' } }));
  assert.equal(shown.ok, true, JSON.stringify(shown));
  assert.equal(a.list[0].messages.length, 3, 'true appends exactly one line');
  const quiet = await a.f.receive(spec({ transcript: false, text: 'recorded only', occurrence: { source: 'surface:test', id: 'quiet' } }));
  assert.equal(quiet.ok, true);
  const absent = await a.f.receive(spec({ text: 'also recorded only', occurrence: { source: 'surface:test', id: 'absent' } }));
  assert.equal(absent.ok, true);
  assert.equal(a.list[0].messages.length, 3, 'false and absent add no line');
  assert.equal(a.f.events('t1').filter((e) => e.content?.text === 'recorded only' && !e.inTranscript).length, 1);
});

test('a display request that cannot be honoured is refused, not dropped: no thread, a temporary chat, an unknown role', async () => {
  const a = await app();
  const o = await a.f.openEncounter({ id: 'ext-1' });
  await a.f.registerParticipant({ encounter: o.encounter, id: 'p:x', name: 'X', kind: 'human' });
  const noThread = await a.f.receive({ encounter: o.encounter, speaker: 'p:x', expression: 'external', modality: 'text', text: 'w', occurrence: { source: 's', id: 'n1' }, transcript: true });
  assert.equal(noThread.ok, false); assert.equal(noThread.code, 'bad-transcript');
  assert.equal(a.f.events(o.encounter).length, 0, 'nothing was recorded for the refused display request');
  const before = snap(a);
  const role = await a.f.receive(spec({ transcript: true, role: 'system', occurrence: { source: 'surface:test', id: 'r1' } }));
  assert.equal(role.ok, false); assert.equal(role.code, 'bad-transcript');
  assert.equal(snap(a), before);
  for (const okRole of ['user', 'assistant']) assert.equal((await a.f.receive(spec({ transcript: true, role: okRole, occurrence: { source: 'surface:test', id: 'role-' + okRole } }))).ok, true);
  assert.deepEqual(a.list[0].messages.slice(-2).map((m) => m.role), ['user', 'assistant']);
});

test('temporary chat: a display request is refused honestly (records stay in memory only); a plain receive still works', async () => {
  const storage = memStorage();
  const list = [{ id: 'tmp', title: 'T', systemPrompt: '', messages: [], createdAt: 1, updatedAt: 1, temporary: true }];
  const enc = createEncounters({ storage, locks: fakeLocks(), threads: () => list, normalizeThread, newId: () => 'x', showToast: () => {}, now: () => 5000 });
  enc.init();
  const p = await enc.facade.registerParticipant({ thread: 'tmp', id: 'p:t', name: 'T', kind: 'human' });
  assert.equal(p.ok, true); assert.equal(p.memoryOnly, true);
  const shown = await enc.facade.receive({ thread: 'tmp', speaker: 'p:t', expression: 'external', modality: 'text', text: 'w', occurrence: { source: 's', id: 't1' }, transcript: true });
  assert.equal(shown.ok, false); assert.equal(shown.code, 'bad-transcript');
  const plain = await enc.facade.receive({ thread: 'tmp', speaker: 'p:t', expression: 'external', modality: 'text', text: 'w', occurrence: { source: 's', id: 't2' } });
  assert.equal(plain.ok, true); assert.equal(plain.memoryOnly, true);
  assert.equal(storage.getItem('plc.encounters.v1'), null, 'nothing of a temporary chat is stored');
  assert.equal(storage.getItem('chatThreads'), null);
});
