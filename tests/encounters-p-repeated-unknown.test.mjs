// T418 P: minimal clone-owned regression for the repeated-unknown identity fix.
// Three submits: first uncertain, second uncertain (recovery), third stable.
// Verifies: original message ID preserved, no provider dispatch before stable ACK,
// exactly one dispatch after stable ACK, composer cleared only after confirmed save.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memStorage, fakeLocks, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { memoryBackend } from '../chat/encounters/coordination.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { outcomeOf, sentence } from '../chat/encounters/save-outcome.mjs';
import * as model from '../chat/threads.mjs';

const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
globalThis.Option ??= class { constructor(label, value) { this.label = label; this.value = value; } };
globalThis.document ??= { querySelectorAll: () => [], getElementById: () => ({ hidden: false, textContent: '' }) };
const dispatched = [];
const { createThreadState } = await import('../chat/core/thread-state.mjs');
const { createSender } = await import('../chat/core/sender.mjs');
const installWindow = () => { globalThis.window = { localModels: { mode: 'local', ready: true, canPrepare: true, generate: async (messages, o) => { dispatched.push({ last: messages[messages.length - 1]?.content, record: globalThis.window.__recordState?.() }); o?.onFinish?.({ finishReason: 'stop' }); return 'synthetic reply'; } },
  setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) }; };
const noop = () => {};

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

test('P three-submit preserves original unknown ID, no dispatch until stable ACK', async () => {
  dispatched.length = 0;
  const p = page();
  // 1st submit: uncertain (failAck)
  await p.send();
  const first = p.stored().filter(m => m.content === 'alpha');
  assert.equal(first.length, 1, 'first uncertain save reached raw storage once');
  const firstId = first[0].id;
  const firstDispatch = dispatched.length;
  const firstInput = p.input.value;
  // 2nd submit: still uncertain (failAck still true)
  await p.send();
  const second = { input: p.input.value, dispatches: dispatched.length, warning: p.toasts.at(-1), ids: p.stored().filter(m=>m.content==='alpha').map(m=>m.id) };
  // 3rd submit: stable (clear failAck before sending)
  p.backend.failing.cas = false; p.flags.failAck = false;
  await p.send();
  const alphas = p.stored().filter(m => m.content === 'alpha');
  assert.equal(firstDispatch, 0, 'no provider dispatch before first stable ACK');
  assert.equal(firstInput, 'alpha', 'uncertain save preserves composer');
  assert.equal(second.dispatches, 0, 'no provider dispatch while pending recovery still fails');
  assert.equal(second.input, 'alpha', 'second refusal preserves composer');
  assert.doesNotMatch(second.warning || '', /Nothing was changed/, 'earlier unresolved write remains uncertain');
  assert.equal(alphas.length, 1, 'three submits store alpha once');
  assert.equal(alphas[0].id, firstId, 'the original message ID survives both uncertain attempts');
  assert.equal(dispatched.length, 1, 'provider dispatch occurs once after confirmed ACK');
  assert.equal(dispatched[0].record, 'stable', 'stable ACK precedes provider dispatch');
  assert.equal(p.backend.peek()?.state, 'stable');
  assert.equal(p.input.value, '', 'unchanged composer clears only after confirmed save');
  assert.equal(Object.values(p.ledger().events).filter(e=>e.message===firstId).length, 1, 'one original human event');
});
