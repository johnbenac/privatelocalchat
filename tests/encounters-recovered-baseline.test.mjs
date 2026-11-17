// W: recovered New chat baseline. A save whose acknowledgement this tab never saw (an unknown outcome) keeps a MEMORY-ONLY frozen effect (the canonical copy of what it touched and the exact hints it
// consumed), bound to its coordination op. The next hold settles that effect from validated durable evidence BEFORE it calculates the next patch, so a conversation the earlier attempt created is not
// mistaken for an unrelated new-thread collision, a rolled-back attempt moves nothing, newer input and newer hints survive, and what cannot be proven is refused with the draft kept.
// Real: chat/encounters/* (createThreadCommit, createLedgerStore, coordination), the app's normaliser. Stand-ins: Storage (maps), Web Locks (queue), the IndexedDB record (memoryBackend).
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStorage, fakeLocks, openTab, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { browser, lockManager, sleep, within } from './helpers/browser-model.mjs';
import { memoryBackend } from '../chat/encounters/coordination.mjs';
import { personId } from '../chat/encounters/records.mjs';

const world = () => {
  const storage = memStorage({ chatThreads: '[]' }), locks = fakeLocks(), backend = memoryBackend();
  const mk = (onPhase) => openTab({ storage, locks, onPhase, storeOptions: { coordination: coordFor(storage, backend, { freshMs: 10 }) } });
  return { storage, locks, backend, mk };
};
const eventsFor = (tab, mid) => Object.values(tab.ledger().events).filter((e) => e.message === mid);
const idsOf = (tab, tid) => (tab.stored().find((t) => t.id === tid)?.messages || []).map((m) => m.id);
const recvSpec = (tid, id) => ({ speaker: personId(tid), expression: 'external', modality: 'text', text: 'received ' + id, occurrence: { source: 's', id } });
// one saved thread first, so the coordination record exists and the next hold does not spend its first CAS bootstrapping it
const prime = async (tab) => { tab.threads.push(thread('seed', [msg('s0', 'user', 'seed')])); const r = await tab.save(); assert.equal(r.ok, true); };

test('W1: stable ACK applied but its reply lost; the next send of the changed input stores once', async () => {
  const w = world(); let fault = true;
  const tab = w.mk((p) => { if (p === 'finalized' && fault) w.backend.failing.casAfter = true; });
  tab.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome', 'the lost reply is an unknown outcome: ' + JSON.stringify(first));
  const rec = w.backend.peek();
  assert.equal(rec.state, 'stable', 'the stable CAS DID apply');
  assert.equal(rec.last.op, first.unknown.op); assert.equal(rec.last.outcome, 'applied');
  assert.deepEqual(idsOf(tab, 'n'), ['alpha'], 'the creation with its message is durable');
  fault = false; w.backend.failing.casAfter = false;
  tab.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const second = await tab.save();
  assert.equal(second.ok, true); assert.deepEqual(second.conflicts, [], 'no new-thread collision'); assert.equal(second.wrote, true);
  assert.deepEqual(idsOf(tab, 'n'), ['alpha', 'beta']);
  assert.equal(eventsFor(tab, 'alpha').length, 1); assert.equal(eventsFor(tab, 'beta').length, 1);
  assert.equal(w.backend.peek().state, 'stable'); assert.equal(tab.ledger().intent, undefined);
});

test('W2: unknown before the transcript was written, then a proven rollback: nothing moves, the draft is created once', async () => {
  const w = world(); const tab = w.mk(); await prime(tab);
  w.backend.failing.casCount = 2;       // begin and the first write-ahead succeed; the write-ahead for the transcript fails
  tab.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome', 'intended fault: ' + JSON.stringify(first));
  assert.equal(tab.stored().some((t) => t.id === 'n'), false, 'the transcript was never written');
  assert.equal(w.backend.peek().state, 'open'); assert.ok(tab.ledger().intent, 'only the records intent reached storage');
  w.backend.failing.casCount = null;
  tab.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const second = await tab.save();
  assert.equal(second.recovered, 'back', 'the earlier attempt was proven rolled back');
  assert.equal(second.ok, true); assert.deepEqual(second.conflicts, []); assert.equal(second.wrote, true);
  assert.deepEqual(idsOf(tab, 'n'), ['alpha', 'beta'], 'the whole draft is stored, once');
  assert.equal(eventsFor(tab, 'alpha').length, 1); assert.equal(eventsFor(tab, 'beta').length, 1);
  assert.equal(w.backend.peek().last.op !== first.unknown.op, true); assert.equal(tab.ledger().intent, undefined);
});

test('W3: transcript durable, final records/ACK unknown, forward recovery: hints captured before the defer are released once', async () => {
  const w = world(); let fault = false;
  const tab = w.mk((p) => { if (p === 'threads-written' && fault) w.backend.failing.cas = true; });
  await prime(tab); fault = true;
  tab.threads.push(thread('n', [msg('alpha', 'user', 'alpha'), msg('r0', 'user', 'received r0')]));
  tab.commit.plan('r0', 'n', recvSpec('n', 'r0'));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome', 'intended fault: ' + JSON.stringify(first));
  assert.deepEqual(idsOf(tab, 'n'), ['alpha', 'r0'], 'the transcript is durable'); assert.ok(tab.ledger().intent, 'the final records were not written');
  fault = false; w.backend.failing.cas = false;
  tab.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const second = await tab.save();
  assert.equal(second.recovered, 'forward'); assert.equal(second.ok, true); assert.deepEqual(second.conflicts, []);
  assert.deepEqual(second.duplicates, [], 'the consumed received message is not replayed'); assert.deepEqual(second.refused, []);
  assert.deepEqual(tab.thread('n').messages.map((m) => m.id), ['alpha', 'r0', 'beta'], 'nothing was dropped from the tab');
  assert.deepEqual(idsOf(tab, 'n'), ['alpha', 'r0', 'beta']);
  assert.equal(eventsFor(tab, 'r0').length, 1); assert.equal(eventsFor(tab, 'r0')[0].occ.id, 'r0');
  assert.equal(eventsFor(tab, 'alpha').length, 1); assert.equal(eventsFor(tab, 'beta').length, 1);
});

test('W4: a peer recovers the earlier operation and commits an unrelated change; the owner keeps its intent and the peer its fields', async () => {
  const w = world(); let fault = true;
  const owner = w.mk((p) => { if (p === 'finalized' && fault) w.backend.failing.cas = true; });
  owner.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  const first = await owner.save();
  assert.equal(first.code, 'unknown-outcome', 'intended fault: ' + JSON.stringify(first)); assert.equal(w.backend.peek().state, 'open');
  fault = false; w.backend.failing.cas = false;
  const peer = w.mk();
  peer.threads.push(thread('p', [msg('p1', 'user', 'peer words')], { title: 'peer title', peerOnly: { keep: true } }));
  const pr = await peer.save();
  assert.equal(pr.ok, true); assert.equal(pr.recovered, 'forward', 'the peer recovered the owner operation');
  assert.notEqual(w.backend.peek().last.op, first.unknown.op, 'a later unrelated ACK superseded the owner receipt');
  owner.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const second = await owner.save();
  assert.equal(second.ok, true); assert.deepEqual(second.conflicts, []); assert.equal(second.wrote, true);
  assert.deepEqual(idsOf(owner, 'n'), ['alpha', 'beta']);
  const p = owner.stored().find((t) => t.id === 'p');
  assert.deepEqual(p.messages.map((m) => m.id), ['p1']); assert.equal(p.title, 'peer title'); assert.deepEqual(p.peerOnly, { keep: true });
  for (const id of ['alpha', 'beta', 'p1']) assert.equal(eventsFor(owner, id).length, 1, id);
  assert.equal(owner.thread('n').messages.length, 2); assert.equal(owner.ledger().intent, undefined); assert.equal(w.backend.peek().state, 'stable');
});

test('W5: a competing delete or Clear gives an explicit refusal; the chat is not resurrected and the draft stays', async () => {
  // delete: stored once by the unknown attempt, then deleted by a peer after it recovered the attempt
  const w = world(); let fault = true;
  const owner = w.mk((p) => { if (p === 'finalized' && fault) w.backend.failing.cas = true; });
  owner.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  assert.equal((await owner.save()).code, 'unknown-outcome'); fault = false; w.backend.failing.cas = false;
  const peer = w.mk(); assert.equal(peer.thread('n').messages.length, 1);
  peer.threads = peer.threads.filter((t) => t.id !== 'n');
  const del = await peer.save(); assert.equal(del.ok, true); assert.equal(del.recovered, 'forward');
  assert.equal(owner.stored().some((t) => t.id === 'n'), false, 'the peer deleted it');
  owner.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const refused = await owner.save();
  assert.equal(refused.ok, true); assert.equal(refused.wrote, false); assert.equal(refused.conflicts.length, 1);
  assert.equal(refused.conflicts[0].code, 'unproven-baseline', 'an explicit, reported refusal');
  assert.equal(owner.stored().some((t) => t.id === 'n'), false, 'never resurrected');
  assert.deepEqual(owner.thread('n').messages.map((m) => m.id), ['alpha', 'beta'], 'the draft is preserved');
  // Clear history in another tab: the epoch fence refuses, nothing comes back
  const c = world(); let fault2 = true;
  const own2 = c.mk((p) => { if (p === 'finalized' && fault2) c.backend.failing.cas = true; });
  own2.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  assert.equal((await own2.save()).code, 'unknown-outcome'); fault2 = false; c.backend.failing.cas = false;
  const clearer = c.mk(); const cleared = await clearer.commit.clearAll(); assert.equal(cleared.ok, true);
  assert.equal(own2.stored().length, 0, 'history is cleared');
  own2.thread('n').messages.push(msg('beta', 'user', 'beta'));
  const stale = await own2.save();
  assert.equal(stale.ok, false); assert.equal(stale.code, 'stale', 'explicit refusal: ' + JSON.stringify(stale));
  assert.equal(own2.stored().length, 0, 'never resurrected'); assert.deepEqual(own2.thread('n').messages.map((m) => m.id), ['alpha', 'beta'], 'the draft is preserved');
});

test('W6: a received message planned after the earlier attempt is not consumed by that attempt cleanup', async () => {
  const w = world(); let fault = true;
  const tab = w.mk((p) => { if (p === 'finalized' && fault) w.backend.failing.cas = true; });
  tab.threads.push(thread('n', [msg('alpha', 'user', 'alpha')]));
  const first = await tab.save();
  assert.equal(first.code, 'unknown-outcome', 'intended fault: ' + JSON.stringify(first));
  // queued AFTER the attempt froze its plan: a newer hint generation for the same conversation
  tab.thread('n').messages.push(msg('r1', 'user', 'received r1'));
  tab.commit.plan('r1', 'n', recvSpec('n', 'r1'));
  fault = false; w.backend.failing.cas = false;
  const second = await tab.save();
  assert.equal(second.ok, true); assert.deepEqual(second.conflicts, []); assert.deepEqual(second.refused, []); assert.deepEqual(second.duplicates, []);
  assert.deepEqual(idsOf(tab, 'n'), ['alpha', 'r1']);
  const ev = eventsFor(tab, 'r1');
  assert.equal(ev.length, 1); assert.equal(ev[0].occ.source, 's', 'recorded with the planned attribution, not as a plain local line'); assert.equal(ev[0].occ.id, 'r1');
  assert.equal(eventsFor(tab, 'alpha').length, 1);
});

// ============================================================================ W affected: four actual actors on one physical model, 20 rounds
test('W affected: owner unknown creation, peer recovery plus unrelated newer ACK, another writer and a reader, 20 rounds', { timeout: 120000 }, async () => {
  for (let r = 0; r < 20; r++) {
    const b = browser(4, { lag: 8 }); const locks = lockManager(); const backend = memoryBackend();
    b.tabs[2].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s0', 'user', 'seed')])]));
    await sleep(8 + 20);
    let fault = false;
    const open = b.tabs.map((storage, i) => openTab({ storage, locks, onPhase: i === 0 ? (p) => { if (p === 'finalized' && fault) backend.failing.cas = true; } : undefined, storeOptions: { coordination: coordFor(storage, backend, { freshMs: 3000 }) } }));
    const [owner, peer, writer, reader] = open;
    // the owner's creation/send: the ACK fails, so the outcome is unknown
    fault = true; owner.threads.push(thread('own', [msg('alpha', 'user', 'alpha')]));
    const first = await owner.save();
    assert.equal(first.code, 'unknown-outcome', 'round ' + r + ' intended fault: ' + JSON.stringify(first));
    fault = false; backend.failing.cas = false;
    // bounded retry of one actor's explicit save until it is acknowledged without a conflict
    const settle = async (tab, label) => { for (let i = 0; i < 60; i++) { const x = await tab.save(); if (x.ok && !(x.conflicts || []).length) return x; await sleep(5); } throw new Error(`round ${r}: ${label} never acknowledged`); };
    let done = false; const readerLog = [];
    owner.thread('own').messages.push(msg('beta', 'user', 'beta'));
    peer.threads.push(thread('peer', [msg('p1', 'user', 'peer words')], { peerOnly: { r } }));
    writer.thread('shared').messages.push(msg('x1', 'user', 'writer words'));
    let go; const barrier = new Promise((res) => { go = res; });
    const readerRun = (async () => { await barrier; while (!done) { const raw = b.truth('chatThreads'); const list = JSON.parse(raw || '[]'); for (const t of list) assert.equal(new Set(t.messages.map((m) => m.id)).size, t.messages.length, 'torn read'); readerLog.push(list.length); await reader.commit.prepare(); await sleep(3); } })();
    const running = Promise.all([owner, peer, writer].map(async (tab, i) => { await barrier; return settle(tab, ['owner', 'peer', 'writer'][i]); }));
    go();
    await within(running, 30000, 'affected round ' + r); done = true; await within(readerRun, 10000, 'reader round ' + r);
    await sleep(40);
    const truth = JSON.parse(b.truth('chatThreads')), ledger = JSON.parse(b.truth('plc.encounters.v1'));
    const ids = (tid) => (truth.find((t) => t.id === tid)?.messages || []).map((m) => m.id);
    assert.deepEqual(ids('own'), ['alpha', 'beta'], 'round ' + r + ': the owner original and new message, once each');
    assert.deepEqual(ids('peer'), ['p1']); assert.deepEqual(truth.find((t) => t.id === 'peer').peerOnly, { r }, 'peer fields preserved');
    assert.deepEqual(ids('shared'), ['s0', 'x1'], 'the other writer and the seed are preserved');
    for (const id of ['alpha', 'beta', 'p1', 'x1']) assert.equal(Object.values(ledger.events).filter((e) => e.message === id).length, 1, `round ${r}: one event for ${id}`);
    assert.equal(ledger.intent, undefined, 'no orphan intent'); assert.equal(backend.peek().state, 'stable', 'record stable');
    // a fresh reader that reopens agrees with the physical truth
    const fresh = openTab({ storage: b.spawn(), locks, storeOptions: { coordination: coordFor(b.tabs[b.tabs.length - 1], backend, { freshMs: 3000 }) } });
    assert.deepEqual(fresh.stored().map((t) => t.id).sort(), truth.map((t) => t.id).sort()); assert.equal((await fresh.save()).ok, true);
    console.log('W_AFFECTED_ROUND', JSON.stringify({ round: r, actors: 4, stable: true, ownIntent: true, peerIntent: true }));
  }
});
