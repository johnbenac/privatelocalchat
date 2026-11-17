// Proof-based freshness and paired-commit recovery of the conversation stores (chat/encounters/coordination.mjs, ledger-store.mjs, thread-commit.mjs). Plan: store-m/safety-plan.md.
// Stand-ins, labelled: localStorage = per-tab Maps whose writes reach the other tabs after a delay (the lag real Chromium showed), Web Locks = an in-process queue, the IndexedDB coordination
// record = memoryBackend (strongly consistent, can be made to fail), the shared-vault exclusive claim = a function. REAL: every chat/encounters/* module, SHA-256 digests, the protocol.
// The real IndexedDB is exercised by the browser suite (tests/e2e/*.e2e.mjs); abrupt process death by tests/encounters-crash.test.mjs.
//
// Invariants (each test states which): an acknowledged state is never lost or rewound (the stable record is only advanced by an acknowledgement or an UNacknowledged operation's rollback to it);
// nothing is written when the view is not provably the recorded one (storage bytes unchanged on a refusal); ok is returned only after the stable record; a failure after durable writes is
// `unknown` (never "unchanged"), retried without duplicates; no torn record (chats and ledger parse, no intent left after recovery); no deadlock; time never authorises adoption.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTab, thread, msg, makeMessage, coordFor } from './helpers/encounters-env.mjs';
import { browser, lockManager, sleep, within } from './helpers/browser-model.mjs';
import { memoryBackend, createCoordination, sha256Hex } from '../chat/encounters/coordination.mjs';

async function world(n, { lag = 8, lagFn, coord = {}, off = false, onPhase } = {}) {
  const b = browser(n, { lag, lagFn }); const locks = lockManager(); const backend = memoryBackend();
  b.tabs[0].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  await sleep(lag + 20);
  const open = (storage, extra = {}, tabOpts = {}) => openTab({ storage, locks, onPhase, ...tabOpts, storeOptions: off ? { unsafeNoCoordination: true } : { coordination: coordFor(storage, backend, { freshMs: 60, ...coord, ...extra }) } });
  return { b, locks, backend, open };
}
const add = (tab, id, text = id) => { const m = makeMessage('user', text); m.id = id; tab.thread('shared').messages.push(m); return m; };
const ids = (b) => JSON.parse(b.truth('chatThreads')).find((t) => t.id === 'shared').messages.map((m) => m.id);
const setOf = (b) => [...ids(b)].sort();
const ackd = (r) => r.ok && !(r.conflicts || []).length;
const snap = (b) => JSON.stringify([b.truth('chatThreads'), b.truth('plc.encounters.v1')]);
const crashAt = (cut, backend) => (p) => { if (p === cut) throw new Error('CRASH'); };

// ---- RED reproduction made a permanent test: a newer document with a stale view must never rewind the acknowledged authority ----------------------------------------------------------------
test('a newer document with a STALE view is refused and the durable acknowledged authority is not rewound (probe i-foreign-adoption, correct assertion)', async () => {
  const backend = memoryBackend(), keys = ['chatThreads', 'plc.encounters.v1'];
  const ledger = { v: 1, rev: 0, epoch: 0, encounters: {}, participants: {}, events: {}, holders: {} }; const th = { id: 't', title: 'Synthetic', systemPrompt: '', messages: [], createdAt: 1, updatedAt: 1 };
  const before = { chatThreads: JSON.stringify([th]), 'plc.encounters.v1': JSON.stringify(ledger) };
  const acknowledged = { chatThreads: JSON.stringify([{ ...th, messages: [{ id: 'A', role: 'user', content: 'A', at: 1 }] }]), 'plc.encounters.v1': JSON.stringify({ ...ledger, rev: 1 }) };
  let viewA = { ...before }; const a = createCoordination({ backend, keys, read: (k) => viewA[k], freshMs: 1 });
  assert.equal((await a.acquire()).ok, true); assert.equal((await a.begin([{ chatThreads: acknowledged.chatThreads, 'plc.encounters.v1': acknowledged['plc.encounters.v1'] }], { op: 'op-A', back: {} })).ok, true);
  assert.equal((await a.beforeWrite(1)).ok, true); viewA = { ...acknowledged }; assert.equal((await a.ack('applied')).ok, true);
  const stable = backend.peek(); assert.equal(stable.keys.chatThreads, await sha256Hex(acknowledged.chatThreads));
  const b = createCoordination({ backend, keys, read: (k) => before[k], freshMs: 1 });
  const out = await b.acquire();
  assert.equal(out.ok, false); assert.equal(out.code, 'stale-view'); assert.deepEqual(backend.peek(), stable, 'the record is untouched');
});

// ---- stale next actor / lag longer than any wait: refused with nothing written, acknowledged state kept, retry works once the view arrived ---------------------------------------------------------
for (const [name, setup] of [
  ['the view lags longer than any wait', async () => world(2, { lag: 300, coord: { freshMs: 40 } })],
  ['no locks.query at all', async () => { const w = await world(2, { lag: 300, coord: { freshMs: 40 } }); delete w.locks.query; return w; }],
]) {
  test(`stale next actor, ${name}: refused (stale-view), nothing written, a1 survives, the retry succeeds once the view arrived`, async () => {
    const w = await setup(); const A = w.open(w.b.tabs[0]), B = w.open(w.b.tabs[1]);
    add(A, 'a1'); assert.equal(ackd(await A.save()), true);
    add(B, 'b1'); const before = snap(w.b); const rec = w.backend.peek();
    const rb = await within(B.save(), 5000, 'the refusal');
    assert.equal(rb.ok, false); assert.equal(rb.code, 'stale-view'); assert.equal(snap(w.b), before); assert.deepEqual(w.backend.peek(), rec, 'authority not rewound');
    assert.ok(B.thread('shared').messages.some((m) => m.id === 'b1'), 'the tab keeps its input');
    await sleep(350);
    assert.equal(ackd(await B.save()), true); assert.deepEqual(setOf(w.b), ['a1', 'b1', 's1']);
  });
}
test('normal multitab: a view that arrives within the wait is simply waited for, both writes succeed in order', async () => {
  const w = await world(2, { lag: 8, coord: { freshMs: 500 } }); const A = w.open(w.b.tabs[0]), B = w.open(w.b.tabs[1]);
  add(A, 'a1'); assert.equal(ackd(await A.save()), true); add(B, 'b1'); assert.equal(ackd(await B.save()), true); add(A, 'a2'); assert.equal(ackd(await A.save()), true);
  assert.deepEqual(setOf(w.b), ['a1', 'a2', 'b1', 's1']);
});
test('the record holds digests only, with the acknowledged op named; no payload, title or id', async () => {
  const w = await world(1); const A = w.open(w.b.tabs[0]); add(A, 'msg-identity', 'SECRET-PAYLOAD-TEXT'); assert.equal(ackd(await A.save()), true);
  const rec = w.backend.peek(); const text = JSON.stringify(rec);
  assert.ok(!text.includes('SECRET-PAYLOAD-TEXT') && !text.includes('shared') && !text.includes('msg-identity'), text);
  assert.equal(rec.state, 'stable'); assert.equal(rec.last.outcome, 'applied'); assert.ok(Object.values(rec.keys).every((d) => /^[0-9a-f]{64}$/.test(d)));
});

// ---- vault: bypass only for an ACTUAL exclusive claim; plain -> vault -> plain lifecycle (the claim is a stand-in function: C6333 app.exclusive) ---------------------------------------------------
test('vault on WITHOUT a verified exclusive claim refuses persistent writes explicitly; vault-on alone is never a bypass', async () => {
  const w = await world(1); const A = openTab({ storage: w.b.tabs[0], locks: w.locks, storeOptions: { coordination: coordFor(w.b.tabs[0], w.backend, {}), vaultOn: () => true, exclusiveWriter: () => false } });
  add(A, 'a1'); const before = snap(w.b); const r = await A.save(); assert.equal(r.ok, false); assert.equal(r.code, 'vault-writer-unverified'); assert.equal(snap(w.b), before); assert.equal(w.backend.peek(), null);
});
test('plain coordinated write -> vault on with a verified claim (no record, no payload digest) -> vault writes -> vault off -> plain coordinated write and reload, no refusal', async () => {
  const w = await world(1); let vault = false, claim = false;
  const mk = (storage) => openTab({ storage, locks: w.locks, storeOptions: { coordination: coordFor(storage, w.backend, { freshMs: 60 }), vaultOn: () => vault, exclusiveWriter: () => claim } });
  const P = mk(w.b.tabs[0]); add(P, 'p1'); assert.equal(ackd(await P.save()), true); assert.equal(w.backend.peek().state, 'stable');
  vault = true; claim = true; add(P, 'v1'); assert.equal(ackd(await P.save()), true); await sleep(10); assert.equal(w.backend.peek(), null, 'plain digests of the plaintext period are gone'); add(P, 'v2'); assert.equal(ackd(await P.save()), true); assert.equal(w.backend.peek(), null);
  vault = false; claim = false; add(P, 'p2'); assert.equal(ackd(await P.save()), true); assert.equal(w.backend.peek().state, 'stable');
  const R = mk(w.b.spawn()); add(R, 'r1'); assert.equal(ackd(await R.save()), true);   // a reload
  assert.deepEqual(setOf(w.b), ['p1', 'p2', 'r1', 's1', 'v1', 'v2']);
});
test('a plain browser without IndexedDB or a record refuses instead of writing unprotected', async () => {
  const b = browser(1); const locks = lockManager(); b.tabs[0].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  globalThis.window = {}; let r; try { const B = openTab({ storage: b.tabs[0], locks }); add(B, 'x'); r = await B.save(); } finally { delete globalThis.window; }
  assert.equal(r.ok, false); assert.equal(r.code, 'coordination-unavailable'); assert.deepEqual(ids(b), ['s1']);
});

// ---- metadata failures at EVERY durable step: definite refusal before any raw write; `unknown` (never ok, never unchanged) after one; the acknowledged state survives; the retry does not duplicate ----
// casCount = how many CASes succeed before the next fails. commit steps: 1 begin, 2 beforeWrite(1), 3 beforeWrite(2), 4 beforeWrite(3), 5 ack.
for (const [step, okCas] of [['begin', 0], ['beforeWrite(1)', 1], ['beforeWrite(2)', 2], ['beforeWrite(3)', 3], ['ack (stable)', 4]]) {
  test(`metadata error at ${step}: never ok; earlier acknowledged e1 intact; a later actor and the retry converge with each message once`, async () => {
    const w = await world(2, { lag: 5, coord: { freshMs: 400 } }); const A = w.open(w.b.tabs[0]), B = w.open(w.b.tabs[1]);
    add(A, 'e1'); assert.equal(ackd(await A.save()), true);
    add(A, 'a1'); w.backend.failing.casCount = okCas; const ra = await A.save(); w.backend.failing.casCount = null;
    assert.equal(ra.ok, false, 'no ok before the stable record: ' + JSON.stringify(ra));
    assert.ok(ids(w.b).includes('e1'), 'acknowledged e1 intact');
    const definite = okCas <= 1; if (!definite) assert.ok(ra.unknown, 'a failure after a durable write is unknown, not "unchanged": ' + JSON.stringify(ra));
    add(B, 'b1'); const rb = await B.save(); assert.equal(ackd(rb), true, JSON.stringify(rb));      // the next actor settles the open op from the record, then saves
    assert.ok(ids(w.b).includes('e1') && ids(w.b).includes('b1'));
    assert.equal(ackd(await A.save()), true, 'the retry converges');                              // a1 is applied (forward) or re-applied (back) exactly once
    const got = ids(w.b); assert.equal(new Set(got).size, got.length, 'no duplicates: ' + got); assert.ok(got.includes('a1'), 'a1 present after the retry');
    assert.equal(w.backend.peek().state, 'stable'); assert.equal(JSON.parse(w.b.truth('plc.encounters.v1')).intent, undefined);
  });
}
test('reply lost on the stable CAS (it applied but the caller saw an error): unknown to the caller; the record is stable; the retry is a no-op duplicate-free', async () => {
  const w = await world(1, { lag: 5, coord: { freshMs: 200 } }); const A = openTab({ storage: w.b.tabs[0], locks: w.locks, onPhase: (p) => { if (p === 'finalized') w.backend.failing.casAfter = true; }, storeOptions: { coordination: coordFor(w.b.tabs[0], w.backend, { freshMs: 200 }) } });
  add(A, 'a1'); const r = await A.save(); w.backend.failing.casAfter = false; assert.equal(r.ok, false); assert.ok(r.unknown); assert.equal(w.backend.peek().state, 'stable');
  assert.equal(ackd(await A.save()), true); assert.deepEqual(setOf(w.b), ['a1', 's1']);
});
test('no SubtleCrypto (a non-secure page): a definite refusal, never a throw and never an unprovable write', async () => {
  const w = await world(1); const A = w.open(w.b.tabs[0]); add(A, 'a1'); const before = snap(w.b);
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto'); Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });
  let r; try { r = await A.save(); } finally { Object.defineProperty(globalThis, 'crypto', saved); }
  assert.equal(r.ok, false); assert.equal(r.code, 'coordination-unavailable'); assert.equal(snap(w.b), before); assert.equal(ackd(await A.save()), true);
});
test('a record from a newer version or a malformed/old-shape one refuses and is left as it is; a gen at the safe-integer limit refuses before any write', async () => {
  const bad = [['newer', { v: 2, gen: 1, state: 'stable', keys: {} }, 'coordination-newer'], ['malformed gen', { v: 1, gen: -3, state: 'stable', keys: {} }, 'coordination-malformed'],
    ['old I shape', { v: 1, gen: 3, state: 'open', keys: {}, final: {} }, 'coordination-malformed']];
  for (const [name, rec, code] of bad) { const w = await world(1); const A = w.open(w.b.tabs[0]); w.backend.poke(rec); add(A, 'a1'); const before = snap(w.b); const r = await A.save(); assert.equal(r.ok, false); assert.equal(r.code, code, name); assert.equal(snap(w.b), before); assert.deepEqual(w.backend.peek(), rec); }
  const w = await world(1); const A = w.open(w.b.tabs[0]); add(A, 'a1'); assert.equal(ackd(await A.save()), true);
  const rec = w.backend.peek(); rec.gen = Number.MAX_SAFE_INTEGER - 1; w.backend.poke(rec); add(A, 'a2'); const before = snap(w.b); const r = await A.save(); assert.equal(r.ok, false); assert.equal(r.code, 'exhausted'); assert.equal(snap(w.b), before);
});

// ---- abrupt death of the lock holder at every cut point ----------------------------------------------------------------------------------------------------------------------------------------
// The holder dies (throws out of its hold: no more metadata, no reply). A lagging next tab sees a view that is not provably a possible state: refused, nothing written. Once its view shows a possible
// state (or a new document), the open op is finished from the record: forward (chats landed) or back (not provable) -- each with e1 untouched.
const CUTS = [['planned', 'back'], ['wal-1', 'back'], ['intent-written', 'back'], ['before-threads', 'back'], ['wal-2', 'back'], ['threads-written', 'forward'], ['wal-3', 'forward'], ['finalized', 'forward']];
for (const [cut, expect] of CUTS) {
  test(`holder dies at "${cut}": earlier acknowledged e1 is never rewound; a lagging actor refuses or recovers; a new tab recovers (${expect}); no duplicate, no intent left`, async () => {
    const w = await world(3, { lag: 250, lagFn: () => 250, coord: { freshMs: 40 } });
    const C0 = w.open(w.b.tabs[2]); add(C0, 'e1'); assert.equal(ackd(await C0.save()), true); await sleep(300);
    const ack = w.backend.peek();
    const A = openTab({ storage: w.b.tabs[0], locks: w.locks, onPhase: crashAt(cut), storeOptions: { coordination: coordFor(w.b.tabs[0], w.backend, { freshMs: 40 }) } });
    await sleep(300); A.load(); add(A, 'a1'); const ra = await A.save(); assert.equal(ra.ok, false, 'a dead holder never reports ok');
    assert.equal(w.backend.peek().state, 'open'); assert.equal(w.backend.peek().keys.chatThreads, ack.keys.chatThreads, 'P0 is the last acknowledged pair');
    const B = w.open(w.b.tabs[1]); add(B, 'b1'); const before = snap(w.b);
    const rb = await B.save();                                         // B's view is up to 250 ms old: refused with nothing written, or recovered when the old view is itself a possible state
    if (!rb.ok) { assert.ok(['recovery-unproven', 'stale-view'].includes(rb.code), rb.code); assert.equal(snap(w.b), before, 'a refused tab writes nothing'); }
    await sleep(400);
    const N = w.open(w.b.spawn()); add(N, 'c1'); const rc = await N.save(); assert.equal(ackd(rc), true, JSON.stringify(rc));
    const got = ids(w.b); assert.ok(got.includes('s1') && got.includes('e1') && got.includes('c1'), 'every acknowledged message: ' + got); assert.equal(new Set(got).size, got.length);
    if (expect === 'forward') assert.ok(got.includes('a1'), 'chats landed: finished forward');
    const ledger = JSON.parse(w.b.truth('plc.encounters.v1')); assert.equal(ledger.intent, undefined);
    assert.ok(['e1', 'c1'].every((id) => Object.values(ledger.events).some((e) => e.message === id)), 'every acknowledged message has its record');
    assert.equal(w.backend.peek().state, 'stable');
    await sleep(300); add(B, 'b2'); assert.equal(ackd(await B.save()) || (await B.save()).ok, true, 'the stale tab recovers by retry, never permanently read-only');
  });
}
test('the last holder closed having acknowledged: the next actor needs no recovery and a tab opened long before just proceeds', async () => {
  const w = await world(2, { lag: 5, coord: { freshMs: 500 } }); const A = w.open(w.b.tabs[0]); add(A, 'a1'); assert.equal(ackd(await A.save()), true);
  const B = w.open(w.b.tabs[1]); add(B, 'b1'); assert.equal(ackd(await B.save()), true); assert.deepEqual(setOf(w.b), ['a1', 'b1', 's1']);
});
test('an older build wrote without the record: ANY tab (even a new document) refuses and never adopts or rewinds; explicit unsupported concurrent-writer boundary', async () => {
  const w = await world(2, { lag: 5, coord: { freshMs: 40 } }); const A = w.open(w.b.tabs[0]); add(A, 'a1'); assert.equal(ackd(await A.save()), true); const rec = w.backend.peek();
  const list = JSON.parse(w.b.truth('chatThreads')); list[0].messages.push(msg('old1', 'user', 'from an old build')); w.b.tabs[1].setItem('chatThreads', JSON.stringify(list)); await sleep(30);
  add(A, 'a2'); const r = await A.save(); assert.equal(r.ok, false); assert.equal(r.code, 'stale-view');
  await sleep(300); const N = w.open(w.b.spawn()); add(N, 'n1'); const rn = await N.save(); assert.equal(rn.ok, false); assert.equal(rn.code, 'stale-view'); assert.deepEqual(w.backend.peek(), rec);
  assert.ok(ids(w.b).includes('old1'), 'the old build\'s message is untouched');
});
test('no record but an interrupted journal in the ledger (written by a build without the record): refused honestly, never adopted by age', async () => {
  const w = await world(2, { lag: 5, coord: { freshMs: 30 } });
  const dead = openTab({ storage: w.b.tabs[0], locks: w.locks, onPhase: crashAt('before-threads'), storeOptions: { unsafeNoCoordination: true } });
  add(dead, 'lost-attempt'); await dead.save().catch(() => {}); assert.ok(JSON.parse(w.b.tabs[0].getItem('plc.encounters.v1')).intent); await sleep(30);
  const B = w.open(w.b.tabs[1]); add(B, 'b1'); const before = snap(w.b); const rb = await B.save(); assert.equal(rb.ok, false); assert.equal(rb.code, 'coordination-absent-journal'); assert.equal(snap(w.b), before);
});

// ---- Clear history: crash at each step, never ok before the stable record, never resurrects --------------------------------------------------------------------------------------------------------
for (const cut of ['clear-intent', 'clear-removed']) {
  test(`Clear history, holder dies at "${cut}": the next holder finishes it forward from the record; the cleared chats do not come back; no ok before the stable record`, async () => {
    const w = await world(2, { lag: 5, coord: { freshMs: 300 } });
    const A = openTab({ storage: w.b.tabs[0], locks: w.locks, onPhase: crashAt(cut), storeOptions: { coordination: coordFor(w.b.tabs[0], w.backend, { freshMs: 300 }) } });
    add(A, 'a1'); const rs = await A.save().catch(() => ({ ok: false })); void rs;
    const r = await A.commit.clearAll().catch((e) => ({ ok: false, code: 'crash' })); assert.equal(r.ok, false);
    const B = w.open(w.b.tabs[1]); await sleep(30); const p = await B.commit.prepare(); assert.equal(p.ok, true, JSON.stringify(p));
    assert.equal(w.b.truth('chatThreads'), null, 'cleared chats stay cleared'); assert.equal(JSON.parse(w.b.truth('plc.encounters.v1')).intent, undefined); assert.equal(w.backend.peek().state, 'stable');
  });
}

// ---- 4 / 8 / 16 participating tabs, lagging views, 20 repeats; the control without coordination loses ----------------------------------------------------------------------------------------
async function round(n, K, off) {
  const w = await world(n, { lag: 8, coord: { freshMs: 3000 }, off }); const tabs = w.b.tabs.map((s) => w.open(s));
  const acked = []; const refused = [];
  await within(Promise.all(tabs.map(async (tab, i) => { for (let k = 0; k < K; k++) { const m = add(tab, `m-${i}-${k}`); const r = await tab.save(); if (ackd(r)) acked.push(m.id); else { refused.push(r.code || 'conflict'); tab.thread('shared').messages.pop(); } } })), 60000, n + ' tabs');
  await sleep(60);
  return { acked, got: ids(w.b), ledger: JSON.parse(w.b.truth('plc.encounters.v1')), refused, record: w.backend.peek() };
}
for (const n of [4, 8, 16]) {
  test(`${n} tabs, lagging views: every acknowledged message survives once, no intent left, no refusal, 20 repeats`, async () => {
    for (let rep = 0; rep < 20; rep++) {
      const { acked, got, ledger, refused, record } = await round(n, 3, false);
      assert.deepEqual(acked.filter((id) => !got.includes(id)), [], `repeat ${rep}: acknowledged messages missing`); assert.equal(new Set(got).size, got.length, `repeat ${rep}: duplicates`);
      assert.equal(ledger.intent, undefined, `repeat ${rep}: intent left`); assert.ok(acked.every((id) => Object.values(ledger.events).some((e) => e.message === id)), `repeat ${rep}: record missing`);
      assert.equal(acked.length, n * 3, `repeat ${rep}: supported multitab works, refused: ${refused.join(',')}`); assert.equal(record.state, 'stable', `repeat ${rep}: settled`);
    }
  });
}
test('control: the SAME run without coordination (the unprotected design) loses acknowledged messages, so the invariants can fail', async () => {
  let lost = 0; for (let rep = 0; rep < 20; rep++) { const { acked, got } = await round(8, 3, true); if (acked.some((id) => !got.includes(id))) lost++; }
  assert.ok(lost > 0, 'the control never lost anything, so the lagging-view model proves nothing');
});
