// T418 CORE correction regressions, against the REAL production modules (chat/encounters/*, chat/threads.mjs) with an in-process storage and Web Lock stand-in
// (tests/helpers/encounters-env.mjs). Every block is one concrete counterexample reproduced on the unchanged c draft first (logs kept beside the evidence), then fixed.
// What this proves: the record/store/transaction boundary. What it does NOT prove: real browser localStorage/Web Locks, the encrypted vault, UI sender/import wiring (later passes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStorage, fakeLocks, openTab, thread, msg } from './helpers/encounters-env.mjs';
import { createLedgerStore } from '../chat/encounters/ledger-store.mjs';
import { createThreadCommit } from '../chat/encounters/thread-commit.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { diffThread, applyDiff } from '../chat/encounters/thread-patch.mjs';
import { normalizeThread } from '../chat/threads.mjs';
import { emptyLedger, parseLedger, recordEvent, ensureEncounter, openExternalEncounter, addParticipant, materializeLegacy, legacyEventId, encounterId, personId, assistantId, digestOf, projectThread } from '../chat/encounters/records.mjs';

const LK = 'plc.encounters.v1', CK = 'chatThreads';
const seed = (storage, list) => storage.setItem(CK, JSON.stringify(list));
const eventsOf = (ledger, mid) => Object.values(ledger.events).filter((e) => e.message === mid);
const ledgerOf = (storage) => JSON.parse(storage.getItem(LK) || 'null');
/** a storage that logs every write/remove so "no shared writes" is checked, not assumed */
function spyStorage(initial = {}) {
  const s = memStorage(initial); const log = [];
  const set = s.setItem, rem = s.removeItem;
  s.setItem = (k, v) => { log.push(['set', k]); set(k, v); };
  s.removeItem = (k) => { log.push(['remove', k]); rem(k); };
  s.log = log; s.writes = (k) => log.filter((x) => x[1] === k).length;
  return s;
}
const ok20 = Number(process.env.CORE_REPEAT || 20);

// ---- 1/2. no unlocked write; supported-ledger intent failure aborts the paired mutation ---------------------------------------------------
test('no Web Locks: request and clearAll refuse explicitly and write nothing to chatThreads or the ledger', async () => {
  const storage = spyStorage();
  seed(storage, [thread('t1', [msg('m0', 'user', 'kept')])]);
  storage.log.length = 0;
  const a = openTab({ storage, locks: null, tabLocks: null });
  a.thread('t1').messages.push(msg('m1', 'user', 'new text the person typed'));
  const r = await a.save();
  assert.equal(r.ok, false); assert.equal(r.code, 'unsupported');
  assert.equal(r.legacy, undefined, 'no legacy direct-save success shape');
  const c = await a.commit.clearAll();
  assert.equal(c.ok, false); assert.equal(c.code, 'unsupported');
  assert.deepEqual(storage.log, [], 'no write or removal of any key');
  assert.equal(a.thread('t1').messages.length, 2, 'the live input stays in the tab');
  assert.equal(a.stored()[0].messages.length, 1);
});

test('supported ledger: an intent write failure aborts the paired mutation (no transcript-only save, no "Nothing was changed" contradiction)', async () => {
  const storage = spyStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks }); a.threads.push(thread('t1')); await a.save();
  const before = { chat: storage.getItem(CK), ledger: storage.getItem(LK) };
  const set = storage.setItem; storage.setItem = (k, v) => { if (k === LK) throw new Error('quota'); set(k, v); };
  storage.log.length = 0;
  a.thread('t1').messages.push(msg('m1', 'user', 'hi'));
  const r = await a.save();
  assert.equal(r.ok, false); assert.equal(r.code, 'records-write-failed'); assert.match(r.message, /nothing from this save was kept/i);
  assert.equal(storage.getItem(CK), before.chat, 'chatThreads untouched'); assert.equal(storage.getItem(LK), before.ledger);
  assert.equal(storage.writes(CK), 0);
  assert.equal(a.thread('t1').messages.length, 1, 'the live message is still in the tab for a retry');
  storage.setItem = set;                                   // storage recovers: the retry saves both
  const r2 = await a.save();
  assert.equal(r2.ok, true, JSON.stringify(r2)); assert.equal(a.stored()[0].messages.length, 1); assert.equal(eventsOf(a.ledger(), 'm1').length, 1);
});

test('ambiguous ledger readback: nothing is written to chatThreads and a fresh unrelated ledger value is never overwritten', async () => {
  const storage = spyStorage(), locks = fakeLocks();
  const a = openTab({ storage, locks }); a.threads.push(thread('t1')); await a.save();
  const fresh = JSON.stringify({ ...a.ledger(), rev: 77, marker: 'someone-else' });
  const set = storage.setItem; storage.setItem = (k, v) => { set(k, k === LK ? fresh : v); };   // the store keeps another writer's newer value instead
  storage.log.length = 0;
  a.thread('t1').messages.push(msg('m1', 'user', 'hi'));
  const r = await a.save();
  assert.equal(r.ok, false); assert.equal(r.code, 'unknown-outcome');
  assert.equal(storage.getItem(LK), fresh, 'the fresh unrelated value was not restored over');
  assert.equal(storage.writes(CK), 0);
  assert.equal(a.stored()[0].messages.length, 0);
});

test('chatThreads write failure: the intent is undone only while the ledger is still exactly what was written', async () => {
  for (const interleave of [false, true]) {
    const storage = spyStorage(), locks = fakeLocks();
    const a = openTab({ storage, locks }); a.threads.push(thread('t1')); await a.save();
    const set = storage.setItem; let fresh = null;
    storage.setItem = (k, v) => { if (k === CK) { if (interleave) { fresh = JSON.stringify({ ...JSON.parse(storage.getItem(LK)), rev: 500, marker: 'fresh-unrelated' }); set(LK, fresh); } throw new Error('quota'); } set(k, v); };
    a.thread('t1').messages.push(msg('m1', 'user', 'hi'));
    const r = await a.save();
    assert.equal(r.ok, false); assert.equal(r.code, 'threads-write-failed');
    if (interleave) { assert.equal(storage.getItem(LK), fresh, 'a fresh unrelated value is not rolled back over'); }
    else { assert.equal(ledgerOf(storage).intent, undefined, 'unchanged ledger: the intent is undone'); assert.equal(eventsOf(ledgerOf(storage), 'm1').length, 0); }
  }
});

test('malformed or unreadable ledger refuses the paired save (only a recognised NEWER ledger lets chat-only saving continue)', async () => {
  const locks = fakeLocks();
  for (const make of [(s) => s.setItem(LK, '{not json'), (s) => s.setItem(LK, JSON.stringify({ v: 1, rev: 1, epoch: 0, events: ['x'], encounters: {}, participants: {}, holders: {} })), (s) => { const g = s.getItem; s.getItem = (k) => { if (k === LK) throw new Error('unreadable'); return g(k); }; }]) {
    const storage = spyStorage(); seed(storage, [thread('t1')]);
    const a = openTab({ storage, locks }); make(storage);
    a.thread('t1').messages.push(msg('m1', 'user', 'hi'));
    storage.log.length = 0;
    const r = await a.save(); assert.equal(r.ok, false, JSON.stringify(r)); assert.ok(['malformed', 'unreadable'].includes(r.code), r.code);
    const c = await a.commit.clearAll(); assert.equal(c.ok, false);
    assert.deepEqual(storage.log, [], 'neither save nor Clear history touched anything');
  }
});

test('recognised newer ledger: LOCKED chat-only save works with attribution unavailable, ledger bytes untouched; a transcript receive is refused', async () => {
  const storage = spyStorage(), locks = fakeLocks();
  const newer = JSON.stringify({ v: 2, rev: 5, future: true }); storage.setItem(LK, newer);
  let lockHeld = 0; const spy = { request: (n, o, f) => { lockHeld++; return locks.request(n, o, f); } };
  const a = openTab({ storage, locks: spy }); a.threads.push(thread('t1', [msg('m1', 'user', 'hi')]));
  const r = await a.save();
  assert.equal(r.ok, true); assert.equal(r.recording, 'newer'); assert.ok(lockHeld >= 1, 'it ran inside the lock');
  assert.equal(storage.getItem(LK), newer); assert.equal(storage.writes(LK), 1, 'only the seed write above: zero ledger mutation');
  assert.equal(a.stored()[0].messages.length, 1);
  a.thread('t1').messages[0].content = 'edited';                // later edit through CAS
  assert.equal((await a.save()).ok, true); assert.equal(a.stored()[0].messages[0].content, 'edited');
  const c = await a.commit.clearAll();
  assert.equal(c.ok, true); assert.equal(storage.getItem(LK), newer); assert.equal(storage.getItem(CK), null);
  // a facade transcript receive needs the ledger: refused with the message taken back out, nothing recorded
  const live = [thread('t2', [msg('x0', 'user', 'a')])];
  const enc = createEncounters({ storage: spyStorage({ [LK]: newer }), locks, threads: () => live, normalizeThread, newId: () => 'rx1', now: () => 5 });
  const rr = await enc.facade.receive({ thread: 't2', speaker: personId('t2'), expression: 'external', modality: 'text', text: 'hello', occurrence: { source: 's', id: 'o' }, transcript: true });
  assert.equal(rr.ok, false); assert.equal(live[0].messages.length, 1);
});

test('read-only tab and blocked chat store: request and clearAll both refuse without any write', async () => {
  const locks = fakeLocks();
  for (const mode of ['read-only', 'blocked']) {
    const storage = spyStorage(); seed(storage, [thread('t1')]);
    const ro = mode === 'read-only';
    const store = createLedgerStore({ storage, locks, isReadOnly: () => ro });
    const commit = createThreadCommit({ storage, store, locks, normalize: normalizeThread, getThreads: () => tabThreads, isBlocked: () => !ro });
    const tabThreads = [thread('t1', [msg('m1', 'user', 'x')])]; commit.init(); storage.log.length = 0;
    const r = await commit.request(); assert.equal(r.ok, false); assert.equal(r.code, ro ? 'read-only' : 'blocked');
    const c = await commit.clearAll(); assert.equal(c.ok, false); assert.equal(c.code, ro ? 'read-only' : 'blocked');
    assert.deepEqual(storage.log, []);
  }
});

// ---- 9. recovery before consumption -------------------------------------------------------------------------------------------------------
test('prepare() finishes an interrupted commit under the lock BEFORE the host reads chatThreads', async () => {
  for (const [phase, back] of [['intent-written', true], ['threads-written', false]]) {
    const storage = spyStorage(), locks = fakeLocks();
    seed(storage, [thread('t1', [msg('m0', 'user', 'kept')])]);
    const dying = openTab({ storage, locks, onPhase: (p) => { if (p === phase) throw new Error('killed'); } });
    dying.thread('t1').messages.push(msg('m1', 'user', 'new')); await dying.save();
    assert.ok(ledgerOf(storage).intent);
    let held = 0; const spy = { request: (n, o, f) => { held++; return locks.request(n, o, f); } };
    const enc = createEncounters({ storage, locks: spy, threads: () => [], normalizeThread, now: () => 9 });
    const p = await enc.prepare();
    assert.equal(p.ok, true, JSON.stringify(p)); assert.equal(p.recovered, back ? 'back' : 'forward'); assert.ok(held >= 1);
    assert.equal(ledgerOf(storage).intent, undefined, 'recovered before any UI read');
    assert.equal(JSON.parse(storage.getItem(CK))[0].messages.length, back ? 1 : 2);
  }
  // two tabs preparing at once: exactly one recovery, both ok
  const storage = spyStorage(), locks = fakeLocks(); seed(storage, [thread('t1')]);
  const dying = openTab({ storage, locks, onPhase: (p) => { if (p === 'intent-written') throw new Error('killed'); } });
  dying.thread('t1').messages.push(msg('m1', 'user', 'n')); await dying.save();
  const mk = () => createEncounters({ storage, locks, threads: () => [], normalizeThread, now: () => 9 });
  const rs = await Promise.all([mk().prepare(), mk().prepare(), mk().prepare()]);
  assert.ok(rs.every((x) => x.ok)); assert.equal(rs.filter((x) => x.recovered).length, 1); assert.equal(ledgerOf(storage).intent, undefined);
});

test('prepare() with no Web Locks reports unsupported and writes nothing', async () => {
  const storage = spyStorage(); const enc = createEncounters({ storage, locks: null, threads: () => [], normalizeThread });
  const p = await enc.prepare(); assert.equal(p.ok, false); assert.equal(p.code, 'unsupported'); assert.deepEqual(storage.log, []);
});

// ---- 7. presence versus null ----------------------------------------------------------------------------------------------------------------
test('diffThread keeps own-key presence and value distinct in both directions; stale presence conflicts', () => {
  const base = { id: 't', messages: [] }, withNull = { id: 't', messages: [], future: null };
  const add = diffThread(base, withNull); assert.ok(add, 'absent -> null is a change'); assert.deepEqual(Object.keys(add.fields), ['future']);
  const del = diffThread(withNull, base); assert.ok(del, 'null -> absent is a change'); assert.equal(del.fields.future.has, false); assert.equal(del.fields.future.had, true);
  assert.equal(diffThread(withNull, structuredClone(withNull)), null);
  assert.equal(diffThread(base, structuredClone(base)), null);
  const a1 = applyDiff(base, add); assert.equal(a1.ok, true); assert.ok(Object.hasOwn(a1.thread, 'future')); assert.equal(a1.thread.future, null);
  const a2 = applyDiff(withNull, del); assert.equal(a2.ok, true); assert.equal(Object.hasOwn(a2.thread, 'future'), false);
  // stale presence: the tab removed `future` but storage meanwhile holds it as a different value; the tab added it but storage meanwhile holds another value
  assert.equal(applyDiff({ ...withNull, future: 3 }, del).ok, false);
  assert.equal(applyDiff({ ...base, future: 'x' }, add).ok, false);
  assert.equal(applyDiff({ ...base, future: null }, add).ok, true, 'already exactly the intended state: idempotent');
  assert.equal(applyDiff(base, del).ok, true, 'removal of a field that is already absent is idempotent (already the intended state)');
  assert.equal(applyDiff({ ...base, future: null }, add).thread.future, null);
});

test('an unknown field going absent <-> null is saved through the real commit and keeps its presence', async () => {
  const storage = memStorage(), locks = fakeLocks();
  seed(storage, [{ id: 't1', title: 'x', messages: [], createdAt: 1, updatedAt: 1, extraNote: null }]);
  const a = openTab({ storage, locks });
  assert.ok(Object.hasOwn(a.stored()[0], 'extraNote'));
  delete a.thread('t1').extraNote;
  const r = await a.save(); assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(Object.hasOwn(a.stored()[0], 'extraNote'), false, 'the removal reached storage');
  a.thread('t1').extraNote = null; await a.save();
  assert.equal(Object.hasOwn(a.stored()[0], 'extraNote'), true); assert.equal(a.stored()[0].extraNote, null);
});

// ---- 13. compound identities --------------------------------------------------------------------------------------------------------------
test('legacy and local ids are collision-free for ("a/b","c") vs ("a","b/c") and bounded for very long source ids', () => {
  assert.notEqual(legacyEventId('a/b', 'c'), legacyEventId('a', 'b/c'));
  assert.notEqual(legacyEventId('a', 'b', 1), legacyEventId('a', 'b'));
  assert.equal(legacyEventId('a', 'b', 0), legacyEventId('a', 'b'), 'version 0 and none are one slot');
  const long = 'L'.repeat(5000);
  for (const id of [legacyEventId(long, long), encounterId(long), personId(long), assistantId(long)]) assert.ok(id.length <= 120, id.length);
  assert.notEqual(encounterId(long), encounterId(long + 'x'));
  assert.notEqual(encounterId('ext:abc'), `enc:ext:abc`, 'a local chat named like an external one never aliases it');
  const l = emptyLedger(); openExternalEncounter(l, 'abc', 1);
  assert.equal(ensureEncounter(l, 'ext:abc', 1).ok, true); assert.equal(Object.keys(l.encounters).length, 2);
  assert.equal(encounterId('t-1_x.y'), 'enc:t-1_x.y', 'ordinary generated ids keep their readable form');
});

test('materializeLegacy reuses an event only for the exact requested thread/message/version; a mismatch is refused, never returned', () => {
  const l = emptyLedger();
  const a = materializeLegacy(l, { thread: 'a/b', message: 'c', text: 'first', role: 'user' });
  const b = materializeLegacy(l, { thread: 'a', message: 'b/c', text: 'second', role: 'user' });
  assert.equal(a.ok && b.ok, true); assert.notEqual(a.event.id, b.event.id);
  assert.equal(a.event.content.text, 'first'); assert.equal(b.event.content.text, 'second');
  assert.equal(a.event.thread, 'a/b'); assert.equal(a.event.message, 'c'); assert.equal(b.event.thread, 'a'); assert.equal(b.event.message, 'b/c');
  const again = materializeLegacy(l, { thread: 'a/b', message: 'c', text: 'ignored', role: 'user' }); assert.equal(again.existing, true); assert.equal(again.event.id, a.event.id);
  // a stored event sitting under the id but describing another occurrence is never aliased
  const bad = emptyLedger(); const id = legacyEventId('x', 'y');
  ensureEncounter(bad, 'other', 1); bad.events[id] = { id, encounter: encounterId('other'), thread: 'other', message: 'm', version: null, occ: { source: 'plc:legacy', id: 'something-else', digest: digestOf('z') }, content: { text: 'z', digest: digestOf('z') } };
  const r = materializeLegacy(bad, { thread: 'x', message: 'y', text: 'real', role: 'user' }); assert.equal(r.ok, false); assert.equal(r.code, 'legacy-id-collision');
});

test('actual commit: edits of two legacy messages whose ids used to alias keep each original, with long and slash-bearing ids', async () => {
  const storage = memStorage(), locks = fakeLocks();
  const longT = 'T'.repeat(700), longM = 'M'.repeat(700);
  seed(storage, [thread('a/b', [msg('c', 'user', 'text one')]), thread('a', [msg('b/c', 'user', 'text two')]), thread(longT, [msg(longM, 'user', 'long text')]), thread('enc:weird', [msg('m', 'user', 'weird')])]);
  const a = openTab({ storage, locks });
  a.thread('a/b').messages[0].content = 'edit one'; a.thread('a').messages[0].content = 'edit two'; a.thread(longT).messages[0].content = 'edit long'; a.thread('enc:weird').messages[0].content = 'edit weird';
  const r = await a.save(); assert.equal(r.ok, true, JSON.stringify(r));
  const l = a.ledger();
  const orig = (t, m) => l.events[legacyEventId(t, m)];
  assert.equal(orig('a/b', 'c').content.text, 'text one'); assert.equal(orig('a', 'b/c').content.text, 'text two');
  assert.equal(orig(longT, longM).content.text, 'long text'); assert.equal(orig(longT, longM).thread, longT, 'the original source handle is kept untruncated'); assert.equal(orig(longT, longM).message, longM);
  assert.equal(orig('enc:weird', 'm').content.text, 'weird');
  for (const [t, m, e] of [['a/b', 'c', 'edit one'], ['a', 'b/c', 'edit two'], [longT, longM, 'edit long'], ['enc:weird', 'm', 'edit weird']]) {
    const fix = Object.values(l.events).find((x) => x.thread === t && x.message === m && x.standing === 'correction');
    assert.equal(fix.content.text, e); assert.equal(fix.corrects, legacyEventId(t, m));
  }
  const ids = Object.keys(l.events); assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every((x) => x.length <= 120));
  const occ = Object.values(l.events).map((e) => e.occ.source + '\0' + e.occ.id); assert.equal(new Set(occ).size, occ.length);
  // the facade resolves a thread called "enc:weird" as a thread, not as an encounter id
  const live = a.threads; const enc = createEncounters({ storage, locks, threads: () => live, normalizeThread, now: () => 1 });
  assert.equal(Object.keys(enc.facade.project('enc:weird')).length, 1);
});

test('new local events of ("a/b","c") and ("a","b/c") are both recorded (they used to collide on one occurrence id and the second was refused)', async () => {
  const storage = memStorage(), locks = fakeLocks(); const a = openTab({ storage, locks });
  a.threads.push(thread('a/b', [msg('c', 'user', 'one')]), thread('a', [msg('b/c', 'user', 'two')]));
  const r = await a.save(); assert.equal(r.ok, true); assert.deepEqual(r.refused, []);
  const l = a.ledger(); assert.equal(Object.values(l.events).length, 2);
  assert.deepEqual(Object.values(l.events).map((e) => e.content.text).sort(), ['one', 'two']);
});

// ---- 17. malformed current-format data ---------------------------------------------------------------------------------------------------
const goodLedger = () => { const l = emptyLedger(); ensureEncounter(l, 't1', 1); return l; };
test('parseLedger refuses malformed recognised current-format state and keeps unknown extensions of valid state', async () => {
  const G = () => JSON.parse(JSON.stringify(goodLedger()));
  const cases = {
    'events is an array': (l) => { l.events = ['synthetic existing event data']; },
    'encounters is an array': (l) => { l.encounters = []; },
    'participants is a string': (l) => { l.participants = 'x'; },
    'holders missing': (l) => { delete l.holders; },
    'events missing': (l) => { delete l.events; },
    'v is zero': (l) => { l.v = 0; }, 'v is negative': (l) => { l.v = -3; }, 'v fractional': (l) => { l.v = 1.5; },
    'rev negative': (l) => { l.rev = -1; }, 'rev fractional': (l) => { l.rev = 1.5; }, 'rev unsafe': (l) => { l.rev = 2 ** 53; }, 'rev missing': (l) => { delete l.rev; }, 'rev string': (l) => { l.rev = '3'; },
    'epoch negative': (l) => { l.epoch = -2; }, 'epoch unsafe': (l) => { l.epoch = 2 ** 60; }, 'epoch missing': (l) => { delete l.epoch; },
    'event not an object': (l) => { l.events['ev:x'] = 'nope'; },
    'event without occurrence': (l) => { l.events['ev:x'] = { id: 'ev:x', encounter: 'enc:t1', speaker: 'p:t1:person', clock: { domain: 'd', position: 1 } }; },
    'event of unknown encounter': (l) => { l.events['ev:x'] = { id: 'ev:x', encounter: 'enc:gone', speaker: 'p:t1:person', occ: { source: 's', id: 'i', digest: null }, clock: { domain: 'd', position: 1 } }; },
    'participant of unknown encounter': (l) => { l.participants['p:z'] = { id: 'p:z', encounter: 'enc:gone', kind: 'human', name: 'Z' }; },
    'encounter msgs to unknown event': (l) => { l.encounters['enc:t1'].msgs.m = 'ev:missing'; },
    'encounter seq unsafe': (l) => { l.encounters['enc:t1'].seq = 2 ** 53; },
    'holder to unknown participant': (l) => { l.holders['enc:t1\u0000h'] = 'p:none'; },
    'intent not an object': (l) => { l.intent = 5; },
  };
  for (const [name, bad] of Object.entries(cases)) {
    const l = G(); bad(l); const raw = JSON.stringify(l);
    assert.equal(parseLedger(raw).ok, false, name); assert.equal(parseLedger(raw).code, 'malformed', name);
    const storage = spyStorage({ [LK]: raw }), locks = fakeLocks(); storage.log.length = 0;
    const store = createLedgerStore({ storage, locks });
    const m = await store.mutate((d) => { ensureEncounter(d, 'other', 1); return { result: 1 }; });
    assert.equal(m.ok, false, name); assert.equal(m.code, 'malformed', name); assert.deepEqual(storage.log, [], name + ': no write'); assert.equal(storage.getItem(LK), raw, name);
  }
  // control: a valid store with unknown fields at every level survives a real mutate untouched in those fields
  const l = G(); l.futureTop = { a: [1] }; l.encounters['enc:t1'].futureEnc = 'k'; recordEvent(l, { thread: 't1', speaker: personId('t1'), expression: 'person', modality: 'text', text: 'hi', occurrence: { source: 's', id: 'i' }, message: 'm1' }, 5);
  l.events[Object.keys(l.events)[0]].futureEv = { n: null };
  const storage = spyStorage({ [LK]: JSON.stringify(l) }); const store = createLedgerStore({ storage, locks: fakeLocks() });
  const m = await store.mutate((d) => { ensureEncounter(d, 'other', 1); return { result: 1 }; }); assert.equal(m.ok, true, JSON.stringify(m));
  const out = ledgerOf(storage); assert.deepEqual(out.futureTop, { a: [1] }); assert.equal(out.encounters['enc:t1'].futureEnc, 'k'); assert.deepEqual(Object.values(out.events)[0].futureEv, { n: null }); assert.ok(out.encounters[encounterId('other')]);
  // an empty/absent value stays an empty ledger; a v2 ledger stays 'newer' even if its other fields are odd
  assert.equal(parseLedger(null).ok, true); assert.equal(parseLedger('').ok, true);
  assert.equal(parseLedger(JSON.stringify({ v: 2, events: [] })).code, 'newer');
});

// ---- 14. counters -------------------------------------------------------------------------------------------------------------------------
test('counters: rev/epoch/seq exhaustion and unsafe clock positions refuse before any write and are never normalised', async () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const storage = spyStorage(), locks = fakeLocks();
  const l = goodLedger(); l.rev = MAX; storage.setItem(LK, JSON.stringify(l)); storage.log.length = 0;
  const store = createLedgerStore({ storage, locks });
  const r = await store.mutate((d) => { ensureEncounter(d, 'z', 1); return {}; });
  assert.equal(r.ok, false); assert.equal(r.code, 'exhausted'); assert.deepEqual(storage.log, []);
  const l2 = goodLedger(); l2.rev = MAX - 1; storage.setItem(LK, JSON.stringify(l2));
  store.coordination.backend.clear();
  store.coordination.reset();
  const r2 = await store.mutate((d) => { ensureEncounter(d, 'z', 1); return {}; }); assert.equal(r2.ok, true); assert.equal(ledgerOf(storage).rev, MAX);
  assert.equal((await store.mutate((d) => { ensureEncounter(d, 'y', 1); return {}; })).code, 'exhausted');
  // epoch at MAX: Clear history refuses and the chats are not removed
  const s3 = spyStorage(); seed(s3, [thread('t1', [msg('m', 'user', 'k')])]); const e = goodLedger(); e.epoch = MAX; s3.setItem(LK, JSON.stringify(e)); s3.log.length = 0;
  const a = openTab({ storage: s3, locks }); const c = await a.commit.clearAll();
  assert.equal(c.ok, false); assert.equal(c.code, 'exhausted'); assert.deepEqual(s3.log, []);
  // seq at MAX
  const q = goodLedger(); q.encounters['enc:t1'].seq = MAX; addParticipant(q, 't1', { id: 'p:a', name: 'A', kind: 'human' }, 1);
  const rr = recordEvent(q, { thread: 't1', speaker: 'p:a', expression: 'external', modality: 'text', text: 'x', occurrence: { source: 's', id: 'i' } }, 1);
  assert.equal(rr.ok, false); assert.equal(rr.code, 'exhausted');
  // explicit clock positions: valid to the declared scope (nonnegative safe integer), otherwise refused rather than replaced by the local seq
  const base = { thread: 't1', speaker: 'p:a', expression: 'external', modality: 'text' };
  for (const [i, pos] of [[1, -1], [2, 1.5], [3, NaN], [4, Infinity], [5, MAX + 1], [6, '7'], [7, null]]) {
    const g = goodLedger(); addParticipant(g, 't1', { id: 'p:a', name: 'A', kind: 'human' }, 1);
    const x = recordEvent(g, { ...base, text: 't' + i, occurrence: { source: 's', id: 'c' + i }, clock: { domain: 'cp:one', position: pos } }, 1);
    assert.equal(x.ok, false, String(pos)); assert.equal(x.code, 'bad-clock', String(pos)); assert.equal(Object.keys(g.events).length, 0);
  }
  const g = goodLedger(); addParticipant(g, 't1', { id: 'p:a', name: 'A', kind: 'human' }, 1);
  const edge = recordEvent(g, { ...base, text: 'edge', occurrence: { source: 's', id: 'edge' }, clock: { domain: 'cp:one', position: MAX } }, 1); assert.equal(edge.ok, true); assert.equal(edge.event.clock.position, MAX);
  assert.equal(recordEvent(g, { ...base, text: 'zero', occurrence: { source: 's', id: 'zero' }, clock: { domain: 'cp:one', position: 0 } }, 1).ok, true);
  assert.equal(recordEvent(g, { ...base, text: 'noPos', occurrence: { source: 's', id: 'np' }, clock: { domain: 'cp:one' } }, 1).event.clock.position, 3, 'no explicit position: the local seq');
});

// ---- 3. source transcript semantics -------------------------------------------------------------------------------------------------------
test('source text is its own field: supplied audio stays null with a transcript line, full text is never capped, derived text is a separate narrower event', async () => {
  const live = [thread('t1', [msg('m0', 'user', 'hi')])]; const storage = memStorage();
  const enc = createEncounters({ storage, locks: fakeLocks(), threads: () => live, normalizeThread, newId: (() => { let n = 0; return () => 'r' + ++n; })(), now: () => 7 }); await enc.prepare(); enc.init(); await enc.saveThreads();
  const f = enc.facade, P = (await f.registerParticipant({ thread: 't1', name: 'Guest', kind: 'human' })).participant, Q = (await f.registerParticipant({ thread: 't1', name: 'Other', kind: 'human' })).participant;
  const dg = 'sha256:' + 'a'.repeat(64);
  const audio = await f.receive({ thread: 't1', speaker: P.id, expression: 'external', modality: 'supplied-audio', text: null, occurrence: { source: 'cp', id: 'a1', digest: dg }, audience: [P.id, Q.id], transcript: true });
  assert.equal(audio.ok, true); assert.equal(audio.event.content.text, null); assert.equal(audio.event.content.digest, null); assert.equal(audio.event.inTranscript, true);
  const big = 'é'.repeat(9000) + '😀';
  const long = await f.receive({ thread: 't1', speaker: P.id, expression: 'model', modality: 'text', text: big, occurrence: { source: 'cp', id: 'l1' }, transcript: true });
  assert.equal(long.event.content.text, big); assert.equal(long.event.content.digest, digestOf(big));
  const derived = await f.receive({ thread: 't1', speaker: P.id, expression: 'external', modality: 'derived-text', standing: 'derived', text: 'heard words', occurrence: { source: 'asr', id: 'd1' }, derivedFrom: [audio.event.id], audience: [P.id] });
  assert.equal(derived.ok, true); assert.deepEqual(derived.event.audience.participants, [P.id]);
  assert.equal(f.events('t1').find((e) => e.id === audio.event.id).content.text, null, 'the original is still null after derivation');
  const stored = JSON.parse(storage.getItem(CK))[0]; assert.equal(stored.messages.find((m) => m.id === audio.messageId).content, '');
  // a later edit of the transcript line of the audio never turns into heard words of the source
  live[0].messages.find((m) => m.id === audio.messageId).content = 'someone typed this'; await enc.saveThreads();
  assert.equal(f.events('t1').find((e) => e.id === audio.event.id).content.text, null);
});

// ---- 19. replay through the actual facade, both stores -----------------------------------------------------------------------------
function app() {
  const storage = spyStorage(), locks = fakeLocks(); const live = [thread('t1', [msg('m0', 'user', 'hello')])]; let n = 0;
  const enc = createEncounters({ storage, locks, threads: () => live, normalizeThread, newId: () => 'rx' + ++n, now: () => 5000 });
  return { storage, locks, live, enc, f: enc.facade };
}
const spec = (P, extra = {}) => ({ thread: 't1', speaker: P, expression: 'external', modality: 'text', text: 'same words', occurrence: { source: 'surface:x', id: 'o1' }, transcript: true, ...extra });
test('transcript:true replay returns the original receipt and mutates nothing; changed bytes conflict without mutation; distinct occurrence stays distinct', async () => {
  const { storage, live, enc, f } = app(); await enc.prepare(); enc.init(); await enc.saveThreads();
  const P = (await f.registerParticipant({ thread: 't1', name: 'Guest', kind: 'human' })).participant.id;
  const first = await f.receive(spec(P)); assert.equal(first.ok, true, JSON.stringify(first));
  const snap = () => ({ chat: storage.getItem(CK), ledger: storage.getItem(LK), tab: live[0].messages.length });
  const before = snap();
  const again = await f.receive(spec(P));
  assert.equal(again.ok, true, JSON.stringify(again)); assert.equal(again.duplicate, true); assert.equal(again.event.id, first.event.id); assert.equal(again.messageId, first.messageId);
  assert.deepEqual(snap(), before, 'replay: not one byte changed in either store or in the open chat');
  const changed = await f.receive(spec(P, { text: 'different words' }));
  assert.equal(changed.ok, false); assert.equal(changed.code, 'occurrence-conflict'); assert.deepEqual(snap(), before);
  const other = await f.receive(spec(P, { occurrence: { source: 'surface:x', id: 'o2' } }));
  assert.equal(other.ok, true); assert.notEqual(other.event.id, first.event.id); assert.equal(live[0].messages.length, before.tab + 1);
  const stored = JSON.parse(storage.getItem(CK))[0]; assert.equal(stored.messages.filter((m) => m.content === 'same words').length, 2, 'two distinct occurrences of equal bytes');
  assert.equal(Object.values(ledgerOf(storage).events).filter((e) => e.occ.id === 'o1').length, 1);
  // an occurrence first recorded WITHOUT a transcript line is replayed with transcript:true: original receipt, no transcript line appears
  const rec = await f.receive({ ...spec(P, { occurrence: { source: 'surface:x', id: 'o3' } }), transcript: false });
  const b2 = snap(); const rep = await f.receive(spec(P, { occurrence: { source: 'surface:x', id: 'o3' } }));
  assert.equal(rep.ok, true); assert.equal(rep.duplicate, true); assert.equal(rep.event.id, rec.event.id); assert.deepEqual(snap(), b2);
});

test('parallel duplicate transcript receives: one message, one event, every caller acknowledged with the same event', async () => {
  for (let rep = 0; rep < ok20; rep++) {
    const { storage, live, enc, f } = app(); await enc.prepare(); enc.init(); await enc.saveThreads();
    const P = (await f.registerParticipant({ thread: 't1', name: 'Guest', kind: 'human' })).participant.id;
    const rs = await Promise.all(Array.from({ length: 8 }, () => f.receive(spec(P))));
    assert.ok(rs.every((r) => r.ok), JSON.stringify(rs.map((r) => r.code || 'ok')));
    assert.equal(new Set(rs.map((r) => r.event.id)).size, 1, 'repeat ' + rep);
    assert.equal(rs.filter((r) => !r.duplicate).length, 1, 'exactly one original');
    const stored = JSON.parse(storage.getItem(CK))[0]; assert.equal(stored.messages.filter((m) => m.content === 'same words').length, 1);
    assert.equal(live[0].messages.filter((m) => m.content === 'same words').length, 1);
    assert.equal(Object.values(ledgerOf(storage).events).filter((e) => e.occ.id === 'o1').length, 1);
    assert.equal(ledgerOf(storage).intent, undefined);
  }
});

// ---- concurrency of the changed transaction boundary -------------------------------------------------------------------------------------
test('concurrency: 8 tabs saving, receiving, registering and a stale fence at once - no lost update, no duplicate, no intent left, all acknowledged (20 repeats)', async () => {
  for (let rep = 0; rep < ok20; rep++) {
    const storage = memStorage(), locks = fakeLocks();
    seed(storage, [thread('t1', [msg('m0', 'user', 'legacy')]), thread('t2', [msg('n0', 'user', 'other')])]);
    const tabs = Array.from({ length: 4 }, () => openTab({ storage, locks, now: () => 1000 + rep }));
    const rx = createEncounters({ storage, locks, threads: () => tabs[0].threads, normalizeThread, newId: () => 'rx-' + rep + Math.random().toString(16).slice(2, 8), now: () => 2000 });
    const p = await rx.facade.registerParticipant({ thread: 't2', name: 'Guest', kind: 'human' });
    tabs.forEach((t, i) => t.thread('t1').messages.push(msg('s' + i, 'user', 'from ' + i)));
    const jobs = tabs.map((t) => t.save());
    jobs.push(rx.facade.receive(spec(p.participant.id, { thread: 't2', transcript: false })), rx.facade.receive(spec(p.participant.id, { thread: 't2', transcript: false })));
    jobs.push(rx.facade.registerParticipant({ thread: 't2', name: 'Other', kind: 'human' }), rx.facade.registerParticipant({ thread: 't2', name: 'Other', kind: 'human' }));
    const rs = await Promise.all(jobs);
    assert.ok(rs.every((r) => r.ok), 'repeat ' + rep + ': ' + JSON.stringify(rs.map((r) => r.ok ? 'ok' : r.code)));
    const stored = JSON.parse(storage.getItem(CK)); const t1 = stored.find((t) => t.id === 't1');
    assert.deepEqual(t1.messages.map((m) => m.id).sort(), ['m0', 's0', 's1', 's2', 's3']);
    const L = ledgerOf(storage); assert.equal(L.intent, undefined);
    for (let i = 0; i < 4; i++) assert.equal(eventsOf(L, 's' + i).length, 1);
    assert.equal(Object.values(L.events).filter((e) => e.occ.id === 'o1').length, 1);
    assert.equal(Object.values(L.participants).filter((x) => x.encounter === encounterId('t2') && x.name === 'Other').length, 2, 'two unnamed-id registrations are two participants, never merged');
    assert.equal(parseLedger(storage.getItem(LK)).ok, true);
  }
});
