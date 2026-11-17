// T418 focused correction N: the two ACTUAL counterexamples of executor M's plan (root review), as regressions through the real modules, plus the possible-state recovery proof.
//   1. producer -> consumer: a durable write whose stable ACK fails must reach the person as UNKNOWN (never "Nothing was changed"), the baseline must not advance before the stable ACK,
//      a real handleSendMessage + real commit must keep the message identity across the retry (no duplicate, no model dispatch before the ACK, no input loss).
//   2. recovery: the record's possible-state set must keep EVERY physical pair that can be real; a lagging view that equals a recorded pair (also a repeated identical pair) never narrows it.
// What is real: chat/encounters/{coordination,ledger-store,thread-commit,encounters}.mjs, chat/core/{sender,thread-state}.mjs, chat/threads.mjs, save-outcome.mjs.
// What is stood in for: localStorage (a Map per tab, with a deliberately LAGGING view), the IndexedDB record (a strongly consistent compare-and-set object), Web Locks (an in-process queue),
// the DOM (plain objects), the model (a spy), process death (an actor whose every later effect is dropped). No browser claim is made here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { memStorage, fakeLocks, openTab, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { memoryBackend, createCoordination, sha256Hex } from '../chat/encounters/coordination.mjs';
import { createLedgerStore } from '../chat/encounters/ledger-store.mjs';
import { createThreadCommit } from '../chat/encounters/thread-commit.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { ensureEncounter } from '../chat/encounters/records.mjs';
import { outcomeOf, sentence } from '../chat/encounters/save-outcome.mjs';
import * as model from '../chat/threads.mjs';

const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
globalThis.Option ??= class { constructor(label, value) { this.label = label; this.value = value; } };
globalThis.document ??= { querySelectorAll: () => [], getElementById: () => ({ hidden: false, textContent: '' }) };
const dispatched = [];
const { createThreadState } = await import('../chat/core/thread-state.mjs');
const { createSender } = await import('../chat/core/sender.mjs');
// `window` is defined only AFTER the app modules are loaded (a defined window makes the vault boot browser-only timers that keep Node alive)
const installWindow = () => { globalThis.window = { localModels: { mode: 'local', ready: true, canPrepare: true, generate: async (messages, o) => { dispatched.push({ last: messages[messages.length - 1]?.content, record: globalThis.window.__recordState?.() }); o?.onFinish?.({ finishReason: 'stop' }); return 'synthetic reply'; } },
  setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) }; };
const noop = () => {};
const log = (label, value) => console.log(JSON.stringify({ label, ...value }));

// ============================================================================================================ 1. ACK failure: producer -> outcome
test('RED1a: a durable write whose stable ACK fails is UNKNOWN to the person; the baseline stays; a retry is acknowledged once', async () => {
  const storage = memStorage({ chatThreads: '[]' }), backend = memoryBackend();
  const coord = createCoordination({ backend, keys: ['chatThreads', 'plc.encounters.v1'], read: (k) => storage.getItem(k), freshMs: 10 });
  const tab = openTab({ storage, locks: fakeLocks(), onPhase: (p) => { if (p === 'finalized') backend.failing.cas = true; }, storeOptions: { coordination: coord } });
  tab.threads.push(thread('t', [msg('m', 'user', 'synthetic pending save')]));
  const result = await tab.save(), outcome = outcomeOf(result, ['t']), words = sentence(outcome, 'Your message was not sent');
  log('ack-failure', { result, outcomeUnknown: outcome.unknown, words, baseSize: tab.commit.baseSize(), stored: tab.stored().length, record: backend.peek().state });
  assert.equal(result.ok, false);
  assert.equal(tab.stored().length, 1, 'the raw thread is durable');
  assert.equal(outcome.unknown, true, 'the actual UI helper must see an unknown outcome');
  assert.doesNotMatch(words, /Nothing was changed/);
  assert.equal(result.cause, 'coordination-unavailable', 'the cause is kept separately from the recognised result code');
  assert.equal(tab.commit.baseSize(), 0, 'no success finalization before the durable ACK');
  backend.failing.cas = false;
  const retry = await tab.save();
  assert.equal(retry.ok, true); assert.equal(tab.stored().length, 1, 'a retry does not duplicate'); assert.equal(tab.commit.baseSize(), 1); assert.equal(backend.peek().state, 'stable');
  assert.equal(backend.peek().last.outcome, 'applied');
});

test('RED1b: a refusal BEFORE any raw write (metadata fails at the first write-ahead) is definite: nothing stored, not unknown, input kept', async () => {
  const storage = memStorage({ chatThreads: '[]' }), backend = memoryBackend();
  const coord = createCoordination({ backend, keys: ['chatThreads', 'plc.encounters.v1'], read: (k) => storage.getItem(k), freshMs: 10 });
  let armed = true;
  const tab = openTab({ storage, locks: fakeLocks(), onPhase: (p) => { if (p === 'planned' && armed) { armed = false; backend.failing.cas = true; } }, storeOptions: { coordination: coord } });
  tab.threads.push(thread('t', [msg('m', 'user', 'x')]));
  const result = await tab.save(), outcome = outcomeOf(result, ['t']);
  log('definite-refusal', { result, outcomeUnknown: outcome.unknown, stored: tab.stored().length, baseSize: tab.commit.baseSize() });
  assert.equal(result.ok, false); assert.equal(tab.stored().length, 0); assert.equal(result.unknown, undefined, 'nothing was written by this hold, so it is NOT reported as unknown');
  assert.equal(outcome.unknown, false); assert.equal(tab.commit.baseSize(), 0);
  backend.failing.cas = false;
  const retry = await tab.save(); log('definite-refusal-retry', { retry, record: backend.peek()?.state }); assert.equal(retry.ok, true, JSON.stringify(retry)); assert.equal(tab.stored().length, 1);
});

// ============================================================================================================ 1c. REAL handleSendMessage + real commit
function page({ failAckOnce = true } = {}) {
  const storage = memStorage({ chatThreads: JSON.stringify([thread('t', [msg('old', 'user', 'old')])]) }), backend = memoryBackend();
  const state = { threads: [], currentThreadId: 't', generationBusy: false, gen: null }; const toasts = []; const flags = { failAck: failAckOnce };
  const host = { s: state, M: () => ({ model }), showToast: (t) => toasts.push(t), readJson: () => null, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'plc.activeThread.v1' };
  const encounters = createEncounters({ storage, locks: fakeLocks(), watch: ['chatThreads'], threads: () => state.threads, normalizeThread: model.normalizeThread, newId: model.newId, now: () => 5000,
    coordination: coordFor(storage, backend, { freshMs: 10 }), onPhase: (p) => { if (p === 'finalized' && flags.failAck) backend.failing.cas = true; } });
  host.encounters = encounters; state.threads = JSON.parse(storage.getItem('chatThreads')).map((t) => model.normalizeThread(t)); encounters.init(storage.getItem('chatThreads'));
  const ts = createThreadState(host); const th = state.threads[0];
  installWindow(); globalThis.window.__recordState = () => backend.peek()?.state;
  const input = { value: 'alpha', focus: noop }; const queue = [{ id: 'att1', name: 'f.txt' }]; const restored = [];
  const sender = createSender({ g: {}, messageInput: input, currentThread: () => th, currentThreadId: () => th.id, getThread: (id) => state.threads.find((t) => t.id === id), getChatState: () => ({ ready: true }),
    STATUS: () => model.STATUS, moduleBase: () => new URL('../', import.meta.url).href, updateChatAvailability: noop, updateSendButtonDisabled: noop, providerName: () => 'x', modelLabel: () => 'm', provider: { authErrors: 0, config: {} },
    updateAuthGuidance: noop, isAuthError: () => false, showToast: noop,
    events: { emit: noop, intercept: async () => false, emitAwait: async () => {}, collect: async () => [] },
    docsUi: { attachments: { count: () => queue.length, take: () => queue.splice(0), restore: (a) => { restored.push(...a); queue.push(...a); } }, apiMessages: async (m) => m },
    M: () => ({ model }), threadTitleInput: { value: th.title }, persistThreads: ts.persist, saveThreads: ts.saveThreads, growComposer: noop, persistDraftNow: noop, renderThreadList: noop,
    messagesView: { renderMessages: noop, prep: null, generatingLabel: () => 'Writing', schedulePaint: noop } });
  const stored = () => JSON.parse(storage.getItem('chatThreads')).find((t) => t.id === 't').messages;
  return { storage, backend, state, th, toasts, input, queue, restored, sender, flags, stored, encounters, send: () => sender.handleSendMessage({ preventDefault: noop }), ledger: () => JSON.parse(storage.getItem('plc.encounters.v1') || 'null') };
}

test('RED1c: REAL handleSendMessage + real commit, ACK fails then the person retries: told unknown, same message identity, stored once, no dispatch before the ACK, input kept', async () => {
  dispatched.length = 0;
  const p = page();
  await p.send();
  const afterFirst = { stored: p.stored().map((m) => [m.id, m.content]), toasts: [...p.toasts], input: p.input.value, restored: p.restored.length, dispatched: dispatched.length, onScreen: p.th.messages.map((m) => m.content) };
  log('send-after-ack-failure', afterFirst);
  assert.equal(p.stored().filter((m) => m.content === 'alpha').length, 1, 'the message is durable');
  assert.ok(p.toasts.length >= 1 && !/Nothing was changed/.test(p.toasts.join('|')), 'told as unknown, never "Nothing was changed": ' + JSON.stringify(p.toasts));
  assert.equal(dispatched.length, 0, 'no model dispatch before the durable ACK');
  assert.equal(p.input.value, 'alpha', 'the composer keeps the words'); assert.equal(p.queue.length, 1, 'the attachment is restored');
  const firstId = p.stored().find((m) => m.content === 'alpha').id;
  p.backend.failing.cas = false; p.flags.failAck = false;
  await p.send();
  const messages = p.stored();
  log('send-retry', { ids: messages.map((m) => [m.id, m.content]), dispatched: dispatched.length, input: p.input.value, events: Object.keys(p.ledger().events).length });
  assert.equal(messages.filter((m) => m.content === 'alpha').length, 1, 'the retry did not duplicate the message');
  assert.equal(messages.find((m) => m.content === 'alpha').id, firstId, 'the message identity is stable across the retry');
  assert.equal(dispatched.length, 1, 'dispatched once, after the ACK'); assert.equal(dispatched[0].record, 'stable', 'the record was stable (acknowledged) at dispatch');
  assert.equal(p.input.value, '');
  assert.equal(Object.values(p.ledger().events).filter((e) => e.message === firstId).length, 1, 'the ledger recorded the message once');
});

test('RED1d: while the unknown save is awaited the person edits the composer: the newer text stays WHOLE, a different text is a different message', async () => {
  dispatched.length = 0;
  const p = page();
  const first = p.send(); p.input.value = 'alpha plus more'; await first;           // typed while the save is awaited
  log('changed-composer-after-first', { stored: p.stored().map((m) => m.content), input: p.input.value, toasts: p.toasts });
  assert.equal(p.input.value, 'alpha plus more', 'newer typing is never overwritten by the failed save');
  p.backend.failing.cas = false; p.flags.failAck = false;
  await p.send();
  const contents = p.stored().map((m) => m.content);
  log('changed-composer', { contents });
  assert.ok(contents.includes('alpha plus more'), 'the changed input is stored as its own message');
  assert.equal(contents.filter((c) => c === 'alpha plus more').length, 1);
  assert.equal(contents.filter((c) => c === 'alpha').length, 1, 'the durable but unconfirmed message is not erased by this tab\'s next save (its baseline never advanced past the ACK)');
  assert.equal(p.input.value, '');
});

// ============================================================================================================ 2. recovery possible pairs (the actual probe)
const L0 = JSON.stringify({ v: 1, rev: 0, epoch: 0, encounters: {}, participants: {}, events: {}, holders: {} });
const L1 = JSON.stringify({ v: 1, rev: 1, epoch: 0, encounters: {}, participants: {}, events: {}, holders: {}, future: 'unacknowledged ledger mutation' });
const KEYS = ['plc.encounters.v1', 'chatThreads'];
async function ledgerOnlyAfterFirstRecoveryCut() {
  const backend = memoryBackend();
  let physical = { 'plc.encounters.v1': L0, chatThreads: '[]' }; const aView = { ...physical };
  const make = (view) => createCoordination({ backend, keys: KEYS, read: (k) => view[k], freshMs: 1 });
  const a = make(aView);
  assert.equal((await a.acquire()).ok, true); assert.equal((await a.begin([{ 'plc.encounters.v1': L1 }], { op: 'op-ledger', back: { 'plc.encounters.v1': L0 } })).ok, true); assert.equal((await a.beforeWrite(1)).ok, true);
  physical['plc.encounters.v1'] = L1; aView['plc.encounters.v1'] = L1;
  const recovery1 = make({ ...physical }); assert.equal((await recovery1.acquire()).ok, true);
  const first = await recovery1.resolve({ target: 'back', texts: { 'plc.encounters.v1': L0, chatThreads: '[]' }, order: KEYS, write: () => { throw new Error('cut after the metadata CAS, before the physical restore'); } });
  return { backend, physical: () => physical, setPhysical: (k, v) => { physical[k] = v; }, make, first };
}
test('RED2a: ledger-only P1, first recoverer cuts before restoring; the next OLD-view (P0) recoverer must restore P0 physically, never ACK a pair that is not real', async () => {
  const w = await ledgerOnlyAfterFirstRecoveryCut();
  const afterFirst = w.backend.peek(); assert.equal(afterFirst.state, 'open'); assert.equal(w.physical()['plc.encounters.v1'], L1);
  const staleView = { 'plc.encounters.v1': L0, chatThreads: '[]' }; const recovery2 = w.make(staleView); assert.equal((await recovery2.acquire()).ok, true);
  let writes = 0;
  const second = await recovery2.resolve({ target: 'back', texts: { 'plc.encounters.v1': L0, chatThreads: '[]' }, order: KEYS, write: (k, v) => { writes++; w.setPhysical(k, v); staleView[k] = v; return true; } });
  const head = w.backend.peek(), actual = await sha256Hex(w.physical()['plc.encounters.v1']);
  const freshResult = await w.make({ ...w.physical() }).acquire();
  log('recovery-possible-pairs', { second, writes, state: head.state, stableLedger: head.keys['plc.encounters.v1'], physicalLedger: actual, freshResult: freshResult.code || 'ok' });
  assert.equal(second.ok, true); assert.ok(writes >= 1, 'the physical restore must be performed because a possible state (P1) disagrees');
  assert.equal(head.state, 'stable'); assert.equal(head.keys['plc.encounters.v1'], actual, 'the acknowledged pair is the physical pair');
  assert.equal(freshResult.ok, true, 'a fresh tab with the real view is not stranded');
});
test('RED2b: after a rollback landed physically (P0) but its ACK was cut, a lagging view equal to the LAST FORWARD pair (P1) must not ACK `applied`', async () => {
  const w = await ledgerOnlyAfterFirstRecoveryCut();
  w.setPhysical('plc.encounters.v1', L0);                                    // the restore of recoverer 1 did land; its ACK did not
  const lagging = w.make({ 'plc.encounters.v1': L1, chatThreads: '[]' }); const acq = await lagging.acquire(); assert.equal(acq.ok, true);
  const ack = await lagging.ack('applied', { pending: true });
  log('lagging-forward-view', { ack, state: w.backend.peek().state });
  assert.equal(ack.ok, false, 'a view equal to the last forward pair does not prove it is real while a rollback pair is also possible');
  assert.equal(w.backend.peek().state, 'open');
});

// ============================================================================================================ 3. every cut x every view x repeated recovery
const dg = (t) => (t == null ? '-' : createHash('sha256').update(String(t)).digest('hex'));
const pairOfMap = (m) => Object.fromEntries(KEYS.map((k) => [k, dg(m.has(k) ? m.get(k) : null)]));
const eqPair = (a, b) => KEYS.every((k) => (a[k] ?? '-') === (b[k] ?? '-'));
const hasPair = (list, p) => (list || []).some((x) => eqPair(x, p));
const snapOf = (m) => Object.fromEntries(KEYS.map((k) => [k, m.has(k) ? m.get(k) : null]));
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
function newWorld(initial) { const w = { phys: new Map(Object.entries(initial)), hist: [], rec: null, violations: [], firstOpen: null, locks: fakeLocks() }; w.hist.push(snapOf(w.phys)); return w; }
function fork(w) { const f = { phys: new Map(w.phys), hist: clone(w.hist), rec: clone(w.rec), violations: [], firstOpen: w.firstOpen, locks: fakeLocks() }; return f; }
function actor(w, { view = null, cutAt = Infinity, threadsFrom = null } = {}) {
  const a = { dead: false, steps: 0, threads: [] }; const v0 = view || snapOf(w.phys); a.view = new Map(KEYS.map((k) => [k, v0[k]]));
  const tick = () => { a.steps++; if (a.steps >= cutAt) a.dead = true; };
  const note = (kind, extra = {}) => w.violations.push({ kind, ...extra });
  const raw = (k, v) => {
    if (!KEYS.includes(k)) { if (v == null) w.phys.delete(k); else w.phys.set(k, v); return; }   // the active-chat pointer is only a hint outside the protected pair
    const before = pairOfMap(w.phys); if (v == null) w.phys.delete(k); else w.phys.set(k, v); a.view.set(k, v ?? null); w.hist.push(snapOf(w.phys)); const after = pairOfMap(w.phys);
    if (!w.rec || w.rec.state !== 'open') note('raw-write-outside-open-operation', { key: k }); else { if (!hasPair(w.rec.pos, before)) note('real-before-write-not-in-pos', { key: k }); if (!hasPair(w.rec.pos, after)) note('real-after-write-not-in-pos', { key: k }); }
  };
  a.storage = { getItem: (k) => (a.view.has(k) ? a.view.get(k) : null), setItem: (k, v) => { if (a.dead) return; tick(); if (a.dead) return; raw(k, String(v)); }, removeItem: (k) => { if (a.dead) return; tick(); if (a.dead) return; raw(k, null); } };
  const unavailable = () => Object.assign(new Error('actor is dead'), { name: 'DeadActor' });
  a.backend = { kind: 'test-strong', get: async () => { if (a.dead) throw unavailable(); return clone(w.rec); },
    cas: async (expect, record) => {
      if (a.dead) throw unavailable(); tick(); if (a.dead) throw unavailable();
      if ((w.rec ? w.rec.gen : null) !== expect) return false;
      const real = pairOfMap(w.phys);
      if (record.state === 'stable' && !eqPair(record.keys, real)) note('ACKED-PAIR-IS-NOT-THE-PHYSICAL-PAIR', { op: record.last?.op, outcome: record.last?.outcome });
      if (record.state === 'open' && !hasPair(record.pos, real)) note('real-not-in-pos-at-cas', { gen: record.gen });
      if (record.state === 'open' && !w.firstOpen) w.firstOpen = clone(record);
      w.rec = clone(record); return true;
    }, clear: async () => { w.rec = null; } };
  a.coord = createCoordination({ backend: a.backend, keys: KEYS, read: (k) => a.storage.getItem(k), hasIntent: () => { try { return Boolean(JSON.parse(a.storage.getItem('plc.encounters.v1') || 'null')?.intent); } catch { return false; } }, freshMs: 2 });
  a.store = createLedgerStore({ storage: a.storage, locks: w.locks, watch: ['chatThreads'], coordination: a.coord });
  a.commit = createThreadCommit({ storage: a.storage, store: a.store, locks: w.locks, normalize: model.normalizeThread, getThreads: () => a.threads, now: () => 1000 });
  a.load = () => { const rawText = a.storage.getItem('chatThreads'); a.threads = (rawText ? JSON.parse(rawText) : []).map((t) => model.normalizeThread(t)).filter(Boolean); a.commit.init(rawText); return a; };
  return a;
}
const SCENARIOS = {
  'commit (new chat + records)': { op: (a) => { a.load(); a.threads.push(thread('new', [msg('n', 'user', 'new text')])); return a.commit.request(); }, expect: (w) => JSON.parse(w.phys.get('chatThreads')).some((t) => t.id === 'new') },
  'ledger-only (P0,P1,P0 repeated pair)': { op: (a) => { a.load(); return a.commit.mutateLedger((d) => { ensureEncounter(d, 'old', 5); return { result: 1 }; }); }, expect: () => true },
  'clear history': { op: (a) => { a.load(); return a.commit.clearAll(); }, expect: (w) => !w.phys.has('chatThreads') },
};
const distinctViews = (w) => { const seen = []; for (const s of w.hist) if (!seen.some((x) => KEYS.every((k) => x[k] === s[k]))) seen.push(s); return seen; };
const where = (...p) => p.join(' / ');
function failIfViolated(w, ctx) { if (w.violations.length) assert.fail(where(...ctx) + ' :: ' + JSON.stringify(w.violations.slice(0, 3))); }

async function explore(name, scenario) {
  const setupWorld = newWorld({ chatThreads: JSON.stringify([thread('old', [msg('o', 'user', 'old')])]) });
  { const a = actor(setupWorld).load(); await a.commit.request(); }               // the first hold bootstraps the record on the clean pair
  failIfViolated(setupWorld, [name, 'setup']);
  const clean = fork(setupWorld); const cleanActor = actor(clean); await scenario.op(cleanActor); failIfViolated(clean, [name, 'uncut']);
  const K = cleanActor.steps; assert.ok(K >= 3, name + ': the original operation has effectful steps to cut at (' + K + ')');
  const p0 = pairOfMap(setupWorld.phys);
  // the digests of an operation's phase pairs differ per run (a random intent id), so the allowed end states come from THIS leaf's own recorded operation
  const endStates = (w) => { const fo = w.firstOpen; return fo ? { finals: [fo.ph[0], fo.ph[fo.fw], ...(fo.bk != null ? [fo.ph[fo.bk]] : [])], fwPair: fo.ph[fo.fw] } : { finals: [p0], fwPair: null }; };
  const describe = (w) => { const fo = w.firstOpen, real = pairOfMap(w.phys); const idx = (p) => (fo ? fo.ph.findIndex((x) => eqPair(x, p)) : -2); return JSON.stringify({ realPhaseIndex: idx(real), record: w.rec && { state: w.rec.state, pos: (w.rec.pos || []).map(idx), last: w.rec.last } }); };
  let leaves = 0, refusedLeaves = 0;
  for (let c = 1; c <= K; c++) {                                                    // process death before effectful step c of the original operation
    const wc = fork(setupWorld); await scenario.op(actor(wc, { cutAt: c })); failIfViolated(wc, [name, 'cut original at ' + c]);
    for (const v1 of distinctViews(wc)) {                                           // first recoverer: any lagging view that ever existed
      const probe = fork(wc); const pa = actor(probe, { view: v1 }); await pa.commit.prepare(); const K1 = pa.steps;
      for (let c1 = 1; c1 <= K1 + 1; c1++) {                                        // process death before effectful step c1 of the recovery itself (K1 + 1 = completes)
        const w1 = fork(wc); const r1 = actor(w1, { view: v1, cutAt: c1 }); await r1.commit.prepare(); failIfViolated(w1, [name, 'cut original at ' + c, 'recoverer1 view#' + distinctViews(wc).indexOf(v1), 'cut recovery at ' + c1]);
        for (const v2 of distinctViews(w1)) {                                       // second recoverer: any lagging view, repeated recovery
          const w2 = fork(w1); const r2 = actor(w2, { view: v2 }); const res2 = await r2.commit.prepare();
          const ctx = [name, 'cut original at ' + c, 'recoverer1 view#' + distinctViews(wc).indexOf(v1) + ' cut at ' + c1, 'recoverer2 view#' + distinctViews(w1).indexOf(v2)];
          failIfViolated(w2, ctx); if (!res2.ok) refusedLeaves++;
          // a tab that sees the real storage settles whatever is left, and a normal save then works (nobody is stranded)
          const r3 = actor(w2).load(); const res3 = await r3.commit.prepare(); failIfViolated(w2, [...ctx, 'fresh recoverer']);
          assert.equal(res3.ok, true, where(...ctx, 'fresh recoverer refused: ' + JSON.stringify(res3) + ' ' + describe(w2)));
          assert.equal(w2.rec.state, 'stable', where(...ctx, 'record settled'));
          const real = pairOfMap(w2.phys); assert.ok(eqPair(w2.rec.keys, real), where(...ctx, 'stable record = physical pair'));
          const { finals, fwPair } = endStates(w2);
          assert.ok(hasPair(finals, real), where(...ctx, 'the settled pair is the start, the rollback or the final pair of the operation ' + describe(w2)));
          if (fwPair && eqPair(real, fwPair)) assert.equal(w2.rec.last.outcome, 'applied', where(...ctx, 'final pair is applied')); else assert.notEqual(w2.rec.last?.outcome, 'applied', where(...ctx, 'not applied unless final ' + describe(w2)));
          assert.equal(JSON.parse(w2.phys.get('plc.encounters.v1') || 'null')?.intent, undefined, where(...ctx, 'no intent left'));
          if (name.startsWith('commit')) { const r4 = actor(w2).load(); r4.threads.push(thread('later', [msg('l', 'user', 'later')])); const saved = await r4.commit.request(); failIfViolated(w2, [...ctx, 'normal save']); assert.equal(saved.ok, true, where(...ctx, 'normal save after settle: ' + JSON.stringify(saved))); assert.equal(JSON.parse(w2.phys.get('chatThreads')).filter((t) => t.id === 'later').length, 1); }
          leaves++;
        }
      }
    }
  }
  log('possible-state-matrix', { scenario: name, originalSteps: K, leaves, refusedByLaggingRecoverer: refusedLeaves });
  return { K, leaves };
}
for (const [name, scenario] of Object.entries(SCENARIOS)) {
  test('possible-state recovery: ' + name + ' - every original cut x every lagging view x every recovery cut x second lagging recoverer; the ACKed pair is always the physical pair', async () => {
    const r = await explore(name, scenario); assert.ok(r.leaves >= 15, 'the matrix ran (' + r.leaves + ' leaves)');
  });
}
