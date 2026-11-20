// The writer boundary of conversation saves (chat/encounters/thread-commit.mjs) with the real ledger, patch and event modules, against a storage and lock stand-in
// (what the stand-ins are is in tests/helpers/encounters-env.mjs). Each test inspects BOTH the transcript (chatThreads) and the ledger.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStorage, fakeLocks, openTab, thread, msg } from './helpers/encounters-env.mjs';
import { legacyEventId, digestOf, personId, assistantId, projectThread } from '../chat/encounters/records.mjs';

const seed = (storage, list) => storage.setItem('chatThreads', JSON.stringify(list));
const eventsOf = (ledger, mid) => Object.values(ledger.events).filter((e) => e.message === mid);
const ids = (t) => t.messages.map((m) => m.id);

test('a new message is saved once with a final event holding its complete text', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks });
  a.threads.push(thread('t1'));
  await a.save();
  a.thread('t1').messages.push(msg('m1', 'user', 'x'.repeat(9000)));      // far beyond any preview size
  a.thread('t1').messages.push(msg('m2', 'assistant', 'y'.repeat(5000), { model: 'm' }));
  const r = await a.save();
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(ids(a.stored()[0]), ['m1', 'm2']);
  const l = a.ledger(), [e1] = eventsOf(l, 'm1'), [e2] = eventsOf(l, 'm2');
  assert.equal(e1.content.text.length, 9000);
  assert.equal(e2.content.text.length, 5000);          // model text is kept in full too, not only the user's
  assert.equal(e1.content.digest, digestOf('x'.repeat(9000)));
  assert.equal(e1.expression, 'person'); assert.equal(e2.expression, 'model');
  assert.equal(e1.authority, 'local-device'); assert.equal(e1.inTranscript, true);
  assert.equal(l.intent, undefined);
});

test('two tabs that loaded the same chat both keep their messages (the b whole-list overwrite is gone)', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [thread('t1', [msg('m0', 'user', 'hi')])]);
  const a = openTab({ storage, locks }), b = openTab({ storage, locks });
  a.thread('t1').messages.push(msg('m-a', 'user', 'from A'));
  b.thread('t1').messages.push(msg('m-b', 'user', 'from B'));
  const [ra, rb] = await Promise.all([a.save(), b.save()]);
  assert.equal(ra.ok && rb.ok, true);
  assert.deepEqual(ids(a.stored()[0]).sort(), ['m-a', 'm-b', 'm0']);
  const l = a.ledger();
  assert.equal(eventsOf(l, 'm-a').length, 1); assert.equal(eventsOf(l, 'm-b').length, 1);
  assert.equal(eventsOf(l, 'm0').length, 0, 'the legacy message stays unrecorded');
});

test('control: a whole-list writer (draft b) loses the other tab message, the commit does not', async () => {
  const storage = memStorage();
  seed(storage, [thread('t1')]);
  const A = JSON.parse(storage.getItem('chatThreads')), B = JSON.parse(storage.getItem('chatThreads'));
  A[0].messages.push(msg('m-a', 'user', 'a')); B[0].messages.push(msg('m-b', 'user', 'b'));
  storage.setItem('chatThreads', JSON.stringify(A)); storage.setItem('chatThreads', JSON.stringify(B));
  assert.deepEqual(ids(JSON.parse(storage.getItem('chatThreads'))[0]), ['m-b']);   // m-a is gone: what b allowed
});

test('legacy messages keep one stable event id; the first edit writes that id down and corrects it', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [thread('t1', [msg('u1', 'user', 'original words'), msg('a1', 'assistant', 'old answer', { model: 'M' })])]);
  const a = openTab({ storage, locks });
  const before = projectThread({ encounters: {}, participants: {}, events: {}, holders: {} }, a.thread('t1')).get('u1');
  assert.equal(before.event, legacyEventId('t1', 'u1')); assert.equal(before.legacy, true); assert.equal(before.individualId, null);
  a.thread('t1').messages[0].content = 'edited words';
  await a.save();
  const l = a.ledger(), legacy = l.events[legacyEventId('t1', 'u1')];
  assert.ok(legacy, 'the legacy event was materialised under its stable id');
  assert.equal(legacy.standing, 'legacy'); assert.equal(legacy.authority, 'none'); assert.equal(legacy.observed, false);
  assert.equal(legacy.content.text, 'original words');
  const fix = eventsOf(l, 'u1').find((e) => e.standing === 'correction');
  assert.equal(fix.corrects, legacy.id); assert.equal(fix.content.text, 'edited words');
  assert.equal(l.encounters['enc:t1'].msgs.u1, fix.id);
  assert.equal(a.stored()[0].messages[0].content, 'edited words');
  const after = projectThread(l, a.thread('t1')).get('u1');
  assert.equal(after.changed, true);
  assert.equal(eventsOf(l, 'a1').length, 0, 'the untouched legacy answer is still unrecorded');
});

test('a streaming reply is an open event, finalised once; regenerate adds a version event; continue/retry keep the original', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks });
  a.threads.push(thread('t1', [msg('u1', 'user', 'q')]));
  const reply = msg('a1', 'assistant', '', { status: 'streaming' });
  a.thread('t1').messages.push(reply);
  await a.save();
  let ev = eventsOf(a.ledger(), 'a1');
  assert.equal(ev.length, 1); assert.equal(ev[0].state, 'open'); assert.equal(ev[0].content, null);
  reply.content = 'partial'; await a.save();                    // still streaming: nothing claimed
  assert.equal(eventsOf(a.ledger(), 'a1')[0].content, null);
  reply.content = 'first answer'; delete reply.status; reply.model = 'M1'; await a.save();
  ev = eventsOf(a.ledger(), 'a1');
  assert.equal(ev.length, 1); assert.equal(ev[0].state, 'final'); assert.equal(ev[0].content.text, 'first answer'); assert.equal(ev[0].outcome, 'complete');
  // regenerate: versions
  reply.versions = [{ content: 'first answer', at: 1 }, { content: '', at: 2 }]; reply.versionIndex = 1; /* as the page does: the version entry has no status until the first streamed text, msg.status says streaming */ reply.content = ''; reply.status = 'streaming';
  await a.save();
  reply.versions[1].content = 'second answer'; delete reply.versions[1].status; reply.content = 'second answer'; delete reply.status;
  await a.save();
  const evs = eventsOf(a.ledger(), 'a1');
  assert.equal(evs.length, 2);
  assert.ok(evs.some((e) => e.content?.text === 'first answer' && e.state === 'final'), 'the first answer is untouched');
  const v1 = evs.find((e) => e.version === 1); assert.equal(v1.standing, 'regenerated'); assert.equal(v1.content.text, 'second answer'); assert.deepEqual(v1.causes, [eventsOf(a.ledger(), 'u1')[0].id]);
  // stopped answer later continued: the stopped text stays as its own event
  const r2 = msg('a2', 'assistant', 'cut off', { status: 'stopped' });
  a.thread('t1').messages.push(r2); await a.save();
  r2.content = 'cut off and finished'; delete r2.status; await a.save();
  const e2 = eventsOf(a.ledger(), 'a2');
  assert.deepEqual(e2.map((e) => [e.standing, e.outcome, e.content.text]).sort(), [['continued', 'complete', 'cut off and finished'], ['recorded', 'stopped', 'cut off']]);
});

test('edit with a dropped tail then undo: originals stay, presence flags follow the transcript', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks });
  a.threads.push(thread('t1', [msg('u1', 'user', 'one'), msg('a1', 'assistant', 'ans', { model: 'M' })]));
  await a.save();
  const t = a.thread('t1'); const tail = t.messages.splice(1);
  t.messages[0].content = 'one edited'; await a.save();
  let l = a.ledger();
  assert.equal(eventsOf(l, 'a1')[0].inTranscript, false); assert.equal(eventsOf(l, 'a1')[0].content.text, 'ans');
  assert.equal(eventsOf(l, 'u1').length, 2);
  t.messages[0].content = 'one'; t.messages.push(...tail); await a.save();
  l = a.ledger();
  assert.equal(eventsOf(l, 'a1')[0].inTranscript, true);
  assert.equal(eventsOf(l, 'u1').length, 3);
  assert.equal(eventsOf(l, 'u1').find((e) => e.standing === 'recorded').content.text, 'one');
});

test('Clear history fences a stale tab; delete does not resurrect; a conflict is explicit', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [thread('t1', [msg('m0', 'user', 'old')]), thread('t2', [msg('n0', 'user', 'other')])]);
  const a = openTab({ storage, locks }), b = openTab({ storage, locks });
  b.thread('t1').messages.push(msg('m-b', 'user', 'late'));
  const cleared = await a.commit.clearAll();
  assert.equal(cleared.ok, true);
  assert.equal(storage.getItem('chatThreads'), null);
  const rb = await b.save();
  assert.equal(rb.ok, false); assert.equal(rb.code, 'stale');
  assert.equal(storage.getItem('chatThreads'), null, 'nothing was brought back');
  assert.equal(a.ledger().epoch, 1); assert.deepEqual(Object.keys(a.ledger().events), []);
  // delete: tab c deletes t2 while tab d edits t2
  // a fresh browser for the second half: writing chatThreads behind the coordinator's back is exactly what it refuses ('stale-view')
  const storage2 = memStorage(), locks2 = fakeLocks();
  seed(storage2, [thread('t2', [msg('n0', 'user', 'other')])]);
  const c = openTab({ storage: storage2, locks: locks2 }), d = openTab({ storage: storage2, locks: locks2 });
  c.threads.splice(0, 1); d.thread('t2').messages.push(msg('n1', 'user', 'edit'));
  assert.equal((await c.save()).ok, true);
  const rd = await d.save();
  assert.equal(rd.ok, true); assert.equal(rd.conflicts.length, 1); assert.equal(rd.conflicts[0].code, 'gone');
  assert.deepEqual(c.stored(), [], 'the deleted chat did not come back');
});

test('two edits of one message: one wins, the other gets an explicit conflict', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [thread('t1', [msg('u1', 'user', 'v0')])]);
  const a = openTab({ storage, locks }), b = openTab({ storage, locks });
  a.thread('t1').messages[0].content = 'by A'; b.thread('t1').messages[0].content = 'by B';
  const ra = await a.save(), rb = await b.save();
  assert.equal(ra.conflicts.length, 0); assert.equal(rb.conflicts.length, 1);
  assert.equal(a.stored()[0].messages[0].content, 'by A');
});

test('imported chats are legacy; a branch inherits; temporary chats never reach storage or the ledger', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks });
  const imported = thread('imp', [msg('i1', 'user', 'claims', { speaker: 'someone', individualId: 'individual:forged' })]);
  a.commit.markImported(['imp']); a.threads.push(imported);
  const tmp = thread('tmp', [msg('x1', 'user', 'secret')], { temporary: true }); a.threads.push(tmp);
  await a.save();
  assert.equal(a.stored().some((t) => t.id === 'tmp'), false);
  assert.equal(JSON.stringify(a.ledger()).includes('secret'), false);
  assert.equal(eventsOf(a.ledger(), 'i1').length, 0);
  const proj = projectThread(a.ledger(), a.thread('imp')).get('i1');
  assert.equal(proj.legacy, true); assert.equal(proj.individualId, null);
  // branch
  a.threads.push(thread('src', [msg('s1', 'user', 'q')])); await a.save();
  a.thread('src').messages.push(msg('s2', 'assistant', 'a')); await a.save();
  const copy = thread('br', [msg('b1', 'user', 'q'), msg('b2', 'assistant', 'a')]);
  a.commit.markBranch('br', 'src', { b1: 's1', b2: 's2' }); a.threads.push(copy); await a.save();
  const l = a.ledger();
  assert.equal(eventsOf(l, 'b1').length, 0); assert.equal(eventsOf(l, 'b2').length, 0);
  assert.equal(l.encounters['enc:br'].lineage.b2.event, l.encounters['enc:src'].msgs.s2);
  assert.equal(projectThread(l, a.thread('br')).get('b2').standing, 'copied');
});

test('crash between the writes: an interrupted commit is rolled back or forward before anything else runs', async () => {
  for (const [phase, expectBack] of [['intent-written', true], ['threads-written', false]]) {
    const storage = memStorage(), locks = fakeLocks();
    seed(storage, [thread('t1', [msg('m0', 'user', 'kept')])]);
    const dying = openTab({ storage, locks, onPhase: (p) => { if (p === phase) throw new Error('killed at ' + p); } });
    dying.thread('t1').messages.push(msg('m1', 'user', 'new'));
    await dying.save();                                   // the throw stands in for the process dying at that point (the process-kill suite does the real thing)
    assert.ok(dying.ledger().intent, 'the intent is left behind at ' + phase);
    const next = openTab({ storage, locks });
    next.thread('t1').messages.push(msg('m2', 'user', 'after'));
    const r = await next.save();
    assert.equal(r.ok, true); assert.equal(r.recovered, expectBack ? 'back' : 'forward');
    const l = next.ledger();
    assert.equal(l.intent, undefined);
    assert.equal(eventsOf(l, 'm1').length, expectBack ? 0 : 1, 'm1 record ' + phase);
    assert.deepEqual(ids(next.stored()[0]), expectBack ? ['m0', 'm2'] : ['m0', 'm1', 'm2']);
    assert.equal(eventsOf(l, 'm2').length, 1);
  }
});

test('Clear history interrupted after the intent finishes on the next lock holder', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [thread('t1', [msg('m0', 'user', 'x')])]);
  const a = openTab({ storage, locks }); a.thread('t1').messages.push(msg('m1', 'user', 'y')); await a.save();
  const dying = openTab({ storage, locks, onPhase: (p) => { if (p === 'clear-intent') throw new Error('killed'); } });
  await dying.commit.clearAll().catch(() => {});
  assert.equal(dying.ledger().intent.kind, 'clear'); assert.ok(storage.getItem('chatThreads'));
  const next = openTab({ storage, locks });
  assert.equal(next.threads.length, 1);                      // not recovered yet (reads do not write)
  const r = await next.commit.mutateLedger(() => ({ result: 1 }));
  assert.equal(r.ok, true); assert.equal(storage.getItem('chatThreads'), null); assert.equal(next.ledger().intent, undefined);
});

test('a newer ledger is never overwritten but chats still save; no Web Locks means no ledger writes and the old direct save', async () => {
  const storage = memStorage(), locks = fakeLocks();
  storage.setItem('plc.encounters.v1', JSON.stringify({ v: 2, rev: 5, future: true }));
  const a = openTab({ storage, locks }); a.threads.push(thread('t1', [msg('m1', 'user', 'hi')]));
  const r = await a.save();
  assert.equal(r.ok, true); assert.equal(r.recording, 'newer');
  assert.deepEqual(JSON.parse(storage.getItem('plc.encounters.v1')), { v: 2, rev: 5, future: true });
  assert.equal(a.stored().length, 1);
  // no Web Locks: an explicit refusal and NOTHING written (the earlier direct whole-list save is gone: tests/encounters-core-regressions.test.mjs pins the details)
  const s2 = memStorage(); const b = openTab({ storage: s2, locks: null, tabLocks: null }); b.threads.push(thread('t1', [msg('m1', 'user', 'hi')]));
  const rb = await b.save();
  assert.equal(rb.ok, false); assert.equal(rb.code, 'unsupported'); assert.equal(s2.getItem('plc.encounters.v1'), null); assert.equal(s2.getItem('chatThreads'), null);
  const w = await b.store.mutate(() => ({}));
  assert.equal(w.code, 'unsupported');
});

test('storage failure is explicit: a full ledger aborts the paired save; a full chat store keeps the ledger unchanged', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks }); a.threads.push(thread('t1')); await a.save();
  const set = storage.setItem; let failKey = 'plc.encounters.v1';
  storage.setItem = (k, v) => { if (k === failKey) throw new Error('quota'); set(k, v); };
  a.thread('t1').messages.push(msg('m1', 'user', 'hi'));
  const r = await a.save();
  assert.equal(r.ok, false); assert.equal(r.code, 'records-write-failed'); assert.equal(a.stored()[0].messages.length, 0, 'the chat was not saved without its records');
  failKey = 'chatThreads';
  a.thread('t1').messages.push(msg('m2', 'user', 'there'));
  const r2 = await a.save();
  assert.equal(r2.ok, false); assert.equal(r2.code, 'threads-write-failed');
  assert.equal(eventsOf(a.ledger(), 'm2').length, 0); assert.equal(a.ledger().intent, undefined, 'the intent was rolled back');
});

test('the same save repeated writes nothing new (idempotent)', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks }); a.threads.push(thread('t1', [msg('m1', 'user', 'hi')])); await a.save();
  const raw = storage.getItem('plc.encounters.v1'), chat = storage.getItem('chatThreads');
  const r = await a.save();
  assert.equal(r.wrote, false); assert.equal(storage.getItem('plc.encounters.v1'), raw); assert.equal(storage.getItem('chatThreads'), chat);
});
