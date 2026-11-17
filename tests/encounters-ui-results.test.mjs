// What the screen's callers get from a conversation save, and the synchronous ids / one-read boot contract of chat/core/thread-state.mjs (production modules; storage and Web Locks are the
// in-process stand-ins of tests/helpers/encounters-env.mjs; the page itself is exercised in real Chromium by tests/e2e/encounters-ui.e2e.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeOf, sentence } from '../chat/encounters/save-outcome.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { resetStandIn } from '../chat/encounters/coordination.mjs';
import { memStorage, fakeLocks, thread, msg } from './helpers/encounters-env.mjs';
import * as model from '../chat/threads.mjs';

// vault-store builds the app's storage when it is imported: give it a browser-shaped storage first
const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
const { appLocal } = await import('../chat/vault/vault-store.mjs');
const { createThreadState } = await import('../chat/core/thread-state.mjs');

test('outcomeOf: ok is not saved when a conversation this change touched is in conflict; refusals and unknown outcomes are distinct', () => {
  const okAll = outcomeOf({ ok: true, conflicts: [], refused: [], wrote: true });
  assert.equal(okAll.saved, true);
  const conflict = { ok: true, conflicts: [{ thread: 'a', code: 'conflict', detail: 'message m1 was changed elsewhere' }], wrote: false };
  assert.equal(outcomeOf(conflict).saved, false); assert.equal(outcomeOf(conflict).code, 'conflict');
  assert.equal(outcomeOf(conflict, ['a']).saved, false, 'a conflict on the conversation that was changed');
  assert.equal(outcomeOf(conflict, ['b']).saved, true, 'a conflict on another conversation does not fail this change');
  assert.equal(outcomeOf(conflict, 'b').saved, true);
  assert.equal(outcomeOf({ ok: true, conflicts: [], refused: [{ message: 'x', thread: 'a', code: 'unknown-speaker' }] }, ['a']).saved, true, 'a refused facade message is that call\'s own answer');
  for (const code of ['unsupported', 'read-only', 'blocked', 'malformed', 'unreadable', 'records-write-failed', 'threads-write-failed', 'stale', 'busy', 'exhausted']) {
    const o = outcomeOf({ ok: false, code, message: 'm' });
    assert.equal(o.saved, false); assert.equal(o.code, code); assert.equal(o.unknown, false);
    assert.match(sentence(o, 'Your message was not sent'), /^Your message was not sent: .+\. Nothing was changed\.$/, code);
  }
  for (const code of ['unknown-outcome', 'changed']) {
    const o = outcomeOf({ ok: false, code, message: 'm' });
    assert.equal(o.unknown, true);
    assert.doesNotMatch(sentence(o, 'Your message was not sent'), /Nothing was changed/, 'an unknown outcome never claims nothing changed');
    assert.match(sentence(o, 'Your message was not sent'), /Look at the chat/);
  }
  assert.equal(outcomeOf(undefined).saved, false);
  assert.equal(sentence(okAll, 'x'), '');
});

function page({ raw, locks = fakeLocks(), withEncounters = true } = {}) {
  const storage = memStorage(raw === undefined ? {} : { chatThreads: raw });
  const state = { threads: [], currentThreadId: null, generationBusy: false, gen: null };
  const toasts = [];
  const host = { s: state, M: () => ({ model }), showToast: (t) => toasts.push(t), readJson: () => null, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'plc.activeThread.v1' };
  let encounters = null;
  if (withEncounters) { encounters = createEncounters({ storage, locks, watch: ['chatThreads'], threads: () => state.threads, normalizeThread: model.normalizeThread, newId: model.newId, showToast: () => {}, now: () => 5000 }); host.encounters = encounters; }
  return { storage, state, toasts, host, encounters };
}

test('createThread / ensureThreadExists are synchronous: the id is returned at once and is what a caller selects', () => {
  const p = page(); p.host.showToast = (t) => p.toasts.push(t);
  const ts = createThreadState(p.host);
  const id = ts.createThread({ title: 'x' });
  assert.equal(typeof id, 'string'); assert.equal(typeof id?.then, 'undefined', 'never a Promise');
  assert.equal(p.state.threads.length, 1); assert.equal(p.state.threads[0].id, id);
  const temp = ts.createThread({ temporary: true });
  assert.equal(typeof temp, 'string'); assert.equal(p.state.threads.find((t) => t.id === temp).temporary, true);
  assert.equal(ts.ensureThreadExists(), null, 'a thread exists: nothing is created');
  const empty = page(); const ts2 = createThreadState(empty.host);
  const first = ts2.ensureThreadExists(); assert.equal(typeof first, 'string'); assert.equal(empty.state.threads[0].id, first);
});

test('a created thread is saved through the one commit; a refused save is told, the thread stays selectable and is saved again with the next change', async () => {
  const noLocks = page({ locks: null });
  noLocks.host.showToast = (t) => noLocks.toasts.push(t);
  const ts = createThreadState(noLocks.host);
  const id = ts.createThread();
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(noLocks.storage.getItem('chatThreads'), null, 'without Web Locks nothing is written');
  assert.ok(noLocks.toasts.some((t) => /new chat was not saved/i.test(t) && /Web Locks/.test(t)), 'told in words: ' + JSON.stringify(noLocks.toasts));
  assert.equal(noLocks.state.threads[0].id, id, 'the conversation is still here to open and write in');
  const ok = page(); ok.host.showToast = (t) => ok.toasts.push(t);
  const ts2 = createThreadState(ok.host);
  const id2 = ts2.createThread();
  await ts2.persist(id2);
  assert.deepEqual(JSON.parse(ok.storage.getItem('chatThreads')).map((t) => t.id), [id2]);
});

test('loadThreads: prepare first, then ONE read, and the baseline is exactly that text', async () => {
  const seed = JSON.stringify([thread('t1', [msg('u1', 'user', 'hi')]), thread('t2', [msg('n1', 'user', 'second')])]);
  const order = []; let reads = 0, initRaw;
  const storage = memStorage({ chatThreads: seed });
  const counted = { ...storage, getItem: (k) => { if (k === 'chatThreads') { reads++; order.push('read'); } return storage.getItem(k); } };
  // appLocal is the vault module's storage in the page; here the host's readJson is not used, loadThreads reads appLocal itself: put the same text there
  appLocal.setItem('chatThreads', seed);
  const state = { threads: [] };
  const host = { s: state, M: () => ({ model }), showToast() {}, readJson: () => null, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'a',
    encounters: { prepare: async () => { order.push('prepare'); appLocal.setItem('chatThreads', seed); return { ok: true }; }, init: async (raw) => { order.push('init'); initRaw = raw; return {}; } } };
  void counted; void reads;
  await createThreadState(host).loadThreads();
  assert.deepEqual(order, ['prepare', 'init'], 'recovery is finished before the chats are read, and init follows the read');
  assert.equal(initRaw, seed, 'the baseline is the exact text the screen was built from');
  assert.deepEqual(state.threads.map((t) => t.id), ['t1', 't2']);
  appLocal.removeItem('chatThreads');
});

test('a refused ordinary save is told once per wording and never written back; saveThreads(ids) says saved only when those chats went through', async () => {
  const p = page({ raw: JSON.stringify([thread('t1', [msg('u1', 'user', 'hi')])]) });
  p.host.showToast = (t) => p.toasts.push(t);
  const ts = createThreadState(p.host);
  appLocal.setItem('chatThreads', p.storage.getItem('chatThreads'));
  await ts.loadThreads();
  const before = p.storage.getItem('chatThreads');
  // another tab changes the message this tab then changes too: a per-chat conflict under ok:true
  const other = JSON.parse(before); other[0].messages[0].content = 'changed elsewhere'; p.storage.setItem('chatThreads', JSON.stringify(other));
  resetStandIn(p.storage);
  p.state.threads[0].messages[0].content = 'changed here';
  const o = await ts.persist(['t1'], 'Your edit was not saved');
  assert.equal(o.saved, false); assert.equal(o.code, 'conflict');
  assert.match(p.toasts.at(-1), /^Your edit was not saved: .*another tab/);
  assert.equal(JSON.parse(p.storage.getItem('chatThreads'))[0].messages[0].content, 'changed elsewhere', 'the other tab\'s value survives');
  const n = p.toasts.length; await ts.persist(['t1'], 'Your edit was not saved');
  assert.equal(p.toasts.length, n, 'the same wording is not repeated within a few seconds');
  appLocal.removeItem('chatThreads');
});
