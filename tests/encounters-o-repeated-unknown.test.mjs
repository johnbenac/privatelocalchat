// T418 P executor: ROOT repeated-unknown proof against the P checkout (fixed source).
// Minimal owned regression: three submits preserve the original unknown message identity.
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
const installWindow = () => { globalThis.window = { localModels: { mode: 'local', ready: true, canPrepare: true, generate: async (messages, o) => { dispatched.push({ last: messages[messages.length - 1]?.content, record: globalThis.window.__recordState?.() }); o?.onFinish?.({ finishReason: 'stop' }); return 'synthetic reply'; } },
  setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) }; };
const noop = () => {};
const log = (label, value) => console.log(JSON.stringify({ label, ...value }));

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

test('O-ROOT repeated uncertain retry preserves identity across a failed pending recovery', async () => {
  dispatched.length = 0;
  const p = page();
  await p.send();
  const firstId = p.stored().find(m => m.content === 'alpha').id;
  assert.equal(dispatched.length, 0, 'no dispatch before ACK');
  await p.send();
  console.log(JSON.stringify({ phase: 'second-uncertain', toasts: p.toasts, input: p.input.value, stored: p.stored().map(m => [m.id, m.content]) }));
  p.backend.failing.cas = false;
  p.flags.failAck = false;
  await p.send();
  const alphas = p.stored().filter(m => m.content === 'alpha');
  console.log(JSON.stringify({ phase: 'third-retry', firstId, alphas: alphas.map(m => m.id), dispatches: dispatched.length }));
  assert.equal(alphas.length, 1, 'a second failed recovery must not discard pending identity and duplicate the durable original on the third retry');
  assert.equal(alphas[0].id, firstId, 'the identity is preserved across retries');
});
