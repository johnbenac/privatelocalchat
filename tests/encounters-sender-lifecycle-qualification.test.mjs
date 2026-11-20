// Standalone synthetic DIAGNOSTIC, test-only (T418 V). Four actual sender changed-input lifecycle cases on accepted T.
// REAL: createSender/handleSendMessage, createThreadState (createThread/selectThread/persist), createConversationList.newThread, encounters commit/store,
// one shared strong memory metadata backend (memoryBackend), the queued fake Web Lock. SYNTHETIC and labelled: DOM, provider (counts only, no inference), localStorage Map,
// and the pending-attachment queue, a faithful model of chat/documents/documents-ui.mjs take/restore (restore PREPENDS taken items in front of items attached meanwhile;
// its source lines are pinned below). Attachment METADATA only: no document bytes or storage proof. No browser claim, no model claim.
// Each case runs a known-success host CONTROL first, so a broken fixture cannot be read as a product failure, then the faulted lifecycle. Failures are diagnostic results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { memStorage, fakeLocks, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { memoryBackend } from '../chat/encounters/coordination.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { outcomeOf } from '../chat/encounters/save-outcome.mjs';
import * as model from '../chat/threads.mjs';
import * as shellRegistry from '../chat/shell/registry.mjs';

const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
globalThis.Option ??= class { constructor(label, value) { this.label = label; this.value = value; } };
globalThis.document ??= { querySelectorAll: () => [], getElementById: () => ({ hidden: false, textContent: '' }) };
const dispatched = [];
const { createThreadState } = await import('../chat/core/thread-state.mjs');
const { createSender } = await import('../chat/core/sender.mjs');
const { createConversationList } = await import('../chat/list/conversation-list.mjs');
// `window` is defined only AFTER the app modules are loaded (a defined window makes the vault boot browser-only timers that keep Node alive)
const installWindow = (recordState) => { globalThis.window = { localModels: { mode: 'local', ready: true, canPrepare: true, generate: async (messages, o) => { dispatched.push({ last: messages[messages.length - 1]?.content, record: recordState() }); o?.onFinish?.({ finishReason: 'stop' }); return 'synthetic reply'; } },
  setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) }; };
const noop = () => {};
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const nap = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(cond, label, ms = 4000) { const end = Date.now() + ms; while (!cond()) { if (Date.now() > end) throw new Error('timed out waiting for: ' + label); await nap(1); } }
const fakeEl = () => { const e = { dataset: {}, style: {}, classList: { add: noop, remove: noop, toggle: noop }, setAttribute: noop, appendChild: noop, append: noop, addEventListener: noop, type: '', title: '', textContent: '' }; return e; };

// ---- source pins: the contracts this diagnostic models are checked in the clone's own bytes --------------------------------------------------------------------------------
const flat = (s) => s.replace(/\s+/g, ' ');
function sourcePins() {
  const sender = flat(read('../chat/core/sender.mjs')), state = flat(read('../chat/core/thread-state.mjs')), list = flat(read('../chat/list/conversation-list.mjs')), docs = flat(read('../chat/documents/documents-ui.mjs'));
  const pins = {
    interceptBeforeTake: sender.indexOf("await events.intercept('send:intercept', text, thread)") > 0 && sender.indexOf("await events.intercept('send:intercept', text, thread)") < sender.indexOf('const taken = docsUi.attachments.count() ? docsUi.attachments.take()'),
    takeBeforePromptReady: sender.indexOf('const taken = docsUi.attachments.count()') < sender.indexOf("await events.emitAwait('prompt:ready', userMessage)"),
    promptReadyBeforePush: sender.indexOf("await events.emitAwait('prompt:ready', userMessage)") < sender.indexOf('thread.messages.push(userMessage)'),
    sameIdentityIncludesAttachments: sender.includes('pendingSend.attachments === attachmentKey(taken)'),
    restoreOnAnyUnsaved: sender.includes('if (taken.length) docsUi.attachments.restore(taken)'),
    composerClearedOnlyIfUnchanged: sender.includes('if (messageInput.value === typed) messageInput.value = \'\''),
    createThreadSynchronousQueued: /function createThread\(.*?\) \{.*persist\(id, 'The new chat was not saved yet'\)\.catch\(\(\) => \{\}\); return id; \}/.test(state),
    selectThreadSynchronous: /function selectThread\(id\) \{/.test(state) && !/async function selectThread/.test(state),
    newThreadCallsCreateRenderSelectFocus: /function newThread\(.*?\) \{ const id = createThread\(\{ temporary \}\); .*renderThreadList\(\); selectThread\(id\); messageInput\.focus\(\); \}/.test(list),
    docsRestorePrepends: docs.includes('restore: list => { pendingAttachments = [...list, ...pendingAttachments];'),
    docsTakeEmptiesQueue: docs.includes('const takePendingAttachments = () => { const out = pendingAttachments; pendingAttachments = [];'),
  };
  return pins;
}

// ---- the page: real controller, supplied host ------------------------------------------------------------------------------------------------------------------------------
// Pending-attachment queue: a model of documents-ui.mjs take/restore (pinned above).
function queueModel(trace) {
  let items = []; const restored = [];
  return { count: () => items.length, take: () => { const out = items; items = []; trace('queue-take', { taken: out.map((a) => a.id) }); return out; },
    restore: (list) => { restored.push(...list.map((a) => a.id)); items = [...list, ...items]; trace('queue-restore', { restored: list.map((a) => a.id), queue: items.map((a) => a.id) }); },
    attach: (a) => { items = [...items, a]; trace('queue-attach', { attached: a.id, queue: items.map((x) => x.id) }); },
    ids: () => items.map((a) => a.id), snapshot: () => structuredClone(items), restored, reset: (list) => { items = structuredClone(list); } };
}

function page({ existing, failAck = false } = {}) {
  const storage = memStorage({ chatThreads: JSON.stringify(existing ? [thread('t', [msg('old', 'user', 'old')])] : []) }), backend = memoryBackend();
  const events = []; const trace = (ev, info = {}) => { events.push({ n: events.length, ev, ...info }); };
  const toasts = [];
  const flags = { failAck }; const gate = { on: false, waiting: 0, promise: null, release: null };
  const summarize = () => JSON.parse(storage.getItem('chatThreads') || '[]').map((t) => ({ id: t.id, messages: t.messages.map((m) => ({ id: m.id, role: m.role, content: m.content, attachments: (m.attachments || []).map((a) => a.id) })) }));
  const rawSet = storage.setItem; storage.setItem = (k, v) => { rawSet(k, v); if (k === 'chatThreads') trace('storage-write', { threads: summarize() }); };
  const casOrig = backend.cas; backend.cas = async function (expect, record) {
    trace('cas-start', { expectGen: expect, state: record?.state, held: gate.on });
    if (gate.on) { gate.waiting++; await gate.promise; }
    try { const r = await casOrig.call(this, expect, record); trace('cas-end', { state: record?.state, applied: r }); return r; } catch (e) { trace('cas-throw', { state: record?.state, message: String(e.message) }); throw e; }
  };
  const state = { threads: [], currentThreadId: null, generationBusy: false, gen: null };
  if (existing) { state.threads = JSON.parse(storage.getItem('chatThreads')).map((t) => model.normalizeThread(t)); state.currentThreadId = 't'; }
  const host = { s: state, M: () => ({ model, shellRegistry }), showToast: (t) => toasts.push(t), readJson: (store, key, dflt) => dflt, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'plc.activeThread.v1', drafts: () => ({}) };
  const encounters = createEncounters({ storage, locks: fakeLocks(), watch: ['chatThreads'], threads: () => state.threads, normalizeThread: model.normalizeThread, newId: model.newId, now: () => 5000,
    coordination: coordFor(storage, backend, { freshMs: 10 }), onPhase: (p) => { trace('phase', { phase: p }); if (p === 'finalized' && flags.failAck) backend.failing.cas = true; } });
  // every save request of every actor (creation, send, reply) is traced with its REAL commit result and the outcome the app derives from it
  const results = []; const realSave = encounters.saveThreads;
  encounters.saveThreads = async () => { trace('save-request'); const r = await realSave(); const o = outcomeOf(r); results.push({ ok: r?.ok, code: r?.code, wrote: r?.wrote, saved: o.saved, unknown: o.unknown }); trace('save-result', results[results.length - 1]); return r; };
  host.encounters = encounters; encounters.init(storage.getItem('chatThreads'));
  const input = { value: '', placeholder: '', disabled: false, focus: () => trace('focus'), setAttribute: noop, removeAttribute: noop };
  const titleInput = { value: '', disabled: false }, systemInput = { value: '', disabled: false };
  const queue = queueModel(trace);
  const renders = [];
  Object.assign(host, { threadTitleInput: titleInput, systemPromptInput: systemInput, messageInput: input, sendBtn: null, chatNotice: null, updateModeBadge: noop, messageForm: { classList: { add: noop, remove: noop }, setAttribute: noop }, closeThreadMenu: noop,
    persistDraftNow: noop, growComposer: noop, events: { emit: noop }, closeSidebar: noop, promptDialog: noop, provider: { authErrors: 0, config: {} }, messagesView: { renderMessages: (t) => renders.push(t.id), prep: null, generatingLabel: () => 'Writing', schedulePaint: noop }, renderThreadList: noop });
  const ts = createThreadState(host);
  installWindow(() => backend.peek()?.state);
  const convo = createConversationList({ el: fakeEl, events: { on: noop, emit: noop }, readJson: host.readJson, writeJson: host.writeJson, getThread: ts.getThread, createThread: ts.createThread, selectThread: ts.selectThread, renameThread: ts.renameThread,
    exportThreadMarkdown: noop, buildPreloadUrl: ts.buildPreloadUrl, saveThreads: ts.saveThreads, persistThreads: ts.persist, generateThreadId: ts.generateThreadId, threadList: { textContent: '', appendChild: noop }, messageInput: input,
    createEmoji: () => fakeEl(), actionButton: noop, messageDecorators: [], messageActionHandlers: {}, closeThreadMenu: noop, placeMenu: noop, updateThreadListMinHeight: noop, promptDialog: noop, confirmDialog: noop, copyTextDialog: noop, openAppDialog: noop,
    showToast: host.showToast, M: host.M, threads: () => state.threads, currentThreadId: () => state.currentThreadId, clearCurrentThread: () => { state.currentThreadId = null; }, generation: () => state.gen, openThreadMenu: () => null });
  host.renderThreadList = convo.render;
  const sender = createSender({ g: {}, messageInput: input, currentThread: ts.currentThread, currentThreadId: () => state.currentThreadId, getThread: ts.getThread, getChatState: ts.getChatState, STATUS: () => model.STATUS,
    moduleBase: () => new URL('../', import.meta.url).href, updateChatAvailability: noop, updateSendButtonDisabled: noop, providerName: () => 'x', modelLabel: () => 'm', provider: host.provider, updateAuthGuidance: noop, isAuthError: () => false, showToast: noop,
    events: { emit: noop, intercept: async () => false, emitAwait: async () => {}, collect: async () => [] },
    docsUi: { attachments: queue, apiMessages: async (m) => m }, M: host.M, threadTitleInput: titleInput, persistThreads: ts.persist, saveThreads: ts.saveThreads, growComposer: noop, persistDraftNow: noop, renderThreadList: convo.render, messagesView: host.messagesView });
  const threadId = () => state.currentThreadId;
  const storedThreads = summarize;
  const storedMessages = (id = threadId()) => storedThreads().find((t) => t.id === id)?.messages || [];
  const ledger = () => JSON.parse(storage.getItem('plc.encounters.v1') || 'null');
  const eventsFor = (messageId) => Object.values(ledger()?.events || {}).filter((e) => e.message === messageId).length;
  const holdOn = () => { gate.on = true; gate.waiting = 0; gate.promise = new Promise((r) => { gate.release = () => { gate.on = false; r(); }; }); };
  // The submit trace: the exact actual outcome, composer and queue at every submit (the old pending operation included).
  const submits = [];
  const submit = async (label) => {
    const before = { input: input.value, queue: queue.ids(), dispatches: dispatched.length, toasts: toasts.length }, from = results.length;
    trace('submit-start', { label, ...before });
    const run = sender.handleSendMessage({ preventDefault: noop });
    return { label, before, run, finish: async () => { await run; const after = { input: input.value, queue: queue.ids(), dispatches: dispatched.length, toast: toasts.slice(before.toasts), saves: results.slice(from), storedIds: storedMessages().map((m) => m.id), records: backend.peek()?.state }; submits.push({ label, before, after }); trace('submit-end', { label, after }); return after; } };
  };
  const send = async (label) => (await submit(label)).finish();
  return { results, storage, backend, state, toasts, input, queue, renders, sender, flags, gate, holdOn, events, trace, submit, send, submits, convo, ts, threadId, storedThreads, storedMessages, ledger, eventsFor, titleInput,
    dump: (label) => console.log('TRACE ' + JSON.stringify({ label, synthetic: true, events, submits, dispatched, toasts })) };
}

const att = (id, name) => ({ id, name, kind: 'text', size: 4, chars: 4, note: 'synthetic metadata only' });
const countOf = (list, content) => list.filter((m) => m.content === content);

// Known-success control: the same page with no fault stores once, dispatches once after the stable record, clears the unchanged composer, and releases its queue.
async function control(p, { queued = [], text = 'alpha' } = {}) {
  dispatched.length = 0;
  p.queue.reset(queued); p.input.value = text;
  const after = await p.send('control-' + text);
  const stored = countOf(p.storedMessages(), text);
  assert.equal(stored.length, 1, 'CONTROL: host fixture stores the message once');
  assert.equal(after.dispatches, 1, 'CONTROL: one synthetic dispatch after the save');
  assert.equal(dispatched[0].record, 'stable', 'CONTROL: stable record precedes dispatch');
  assert.equal(after.input, '', 'CONTROL: unchanged composer clears after confirmed save');
  assert.deepEqual(after.queue, [], 'CONTROL: queue released');
  assert.deepEqual(stored[0].attachments, queued.map((a) => a.id), 'CONTROL: stored attachment metadata ids');
  assert.equal(p.eventsFor(stored[0].id), 1, 'CONTROL: one human ledger event');
}

function assertPins() { const pins = sourcePins(); assert.deepEqual(Object.entries(pins).filter(([, ok]) => !ok).map(([k]) => k), [], 'source pins hold in the clone'); return pins; }

// Faulted lifecycle on an EXISTING stored conversation. `change` runs while the first persistence is held (taken input is off the queue, composer still on screen).
async function existingLifecycle(name, { queued, change, secondText, expectSecondDistinct, expectedFirstQueue, composerAfterFirst }) {
  const pins = assertPins();
  const c = page({ existing: true }); await control(c, { queued }); const controlOk = true;
  const p = page({ existing: true, failAck: true });
  dispatched.length = 0; p.queue.reset(queued); p.input.value = 'alpha';
  p.holdOn();
  const first = await p.submit('first-alpha');
  await until(() => p.gate.waiting > 0, 'first persistence held');
  const heldView = { input: p.input.value, queue: p.queue.ids(), stored: p.storedMessages().map((m) => m.content), dispatches: dispatched.length };
  p.trace('held-view', heldView);
  change(p);
  const changedView = { input: p.input.value, queue: p.queue.ids() };
  p.trace('changed-view', changedView);
  p.gate.release();
  const afterFirst = await first.finish();
  const alphaFirst = countOf(p.storedMessages(), 'alpha');
  const out = { name, pins, controlOk, heldView, changedView, afterFirst, alphaFirstIds: alphaFirst.map((m) => m.id), restored: [...p.queue.restored] };
  // the intended first message reached raw storage under an unknown ACK: identity is fixed from here on
  assert.equal(alphaFirst.length, 1, 'first unknown save reached storage once');
  const firstId = alphaFirst[0].id;
  assert.equal(afterFirst.dispatches, 0, 'no provider dispatch before the first stable acknowledgement');
  assert.equal(p.eventsFor(firstId) <= 1, true, 'at most one human event for the first message');
  assert.equal(afterFirst.input, composerAfterFirst, 'changed composer survives the earlier completion WHOLE');
  assert.deepEqual(afterFirst.queue, expectedFirstQueue, 'queue after the first unknown outcome: restored taken items in front of newer items, nothing lost');
  assert.equal(afterFirst.saves.at(-1)?.unknown, true, 'the first submit reports its unconfirmed write as UNKNOWN (explicit certainty), not a generic or no-write refusal');
  assert.doesNotMatch((afterFirst.toast || []).join(' '), /Nothing was changed/, 'an unconfirmed write is not worded with no-write certainty');
  // second explicit submit of the CHANGED input while the ACK still fails: no clobber, nothing dispatched
  const afterSecond = await p.send('second-changed');
  out.afterSecond = afterSecond; out.secondIds = countOf(p.storedMessages(), secondText).map((m) => m.id);
  assert.equal(afterSecond.dispatches, 0, 'no dispatch while the acknowledgement is still failing');
  assert.equal(afterSecond.input, composerAfterFirst, 'second unconfirmed submit keeps the changed composer');
  assert.deepEqual(countOf(p.storedMessages(), 'alpha').map((m) => m.id).includes(firstId), true, 'the earlier durable message is preserved');
  assert.equal(afterSecond.saves.at(-1)?.unknown, true, 'the second submit, refused while the earlier write is still unconfirmed, keeps explicit UNKNOWN certainty (toast text may be rate-limited, so the outcome is asserted)');
  assert.doesNotMatch((afterSecond.toast || []).join(' '), /Nothing was changed/, 'no no-write wording while an earlier write is unconfirmed');
  // recovery: supported retry makes bounded progress, no read-only ordinary writes
  p.backend.failing.cas = false; p.flags.failAck = false;
  const secondRecoverIds = countOf(p.storedMessages(), secondText).map((m) => m.id);
  const afterRecover = await p.send('recover-changed');
  out.afterRecover = afterRecover;
  const finalAlpha = countOf(p.storedMessages(), 'alpha'), finalSecond = countOf(p.storedMessages(), secondText);
  out.final = { stored: p.storedMessages(), dispatched: structuredClone(dispatched), record: p.backend.peek()?.state };
  p.dump(name); console.log('OUTCOME ' + JSON.stringify(out));
  assert.equal(afterRecover.dispatches, 1, 'exactly one dispatch after the confirmed save');
  assert.equal(dispatched[0].record, 'stable', 'stable acknowledgement precedes the provider dispatch');
  assert.equal(afterRecover.input, '', 'the unchanged changed-composer clears only after its confirmed save');
  assert.deepEqual(afterRecover.queue, [], 'queue released after confirmed save');
  assert.equal(p.backend.peek()?.state, 'stable');
  if (expectSecondDistinct) {
    assert.equal(finalAlpha.length, 2, 'same words with a changed attachment set is a distinct occurrence (not a duplicate by words alone)');
    assert.notEqual(finalAlpha[0].id, finalAlpha[1].id);
    assert.equal(finalAlpha[0].id, firstId, 'the earlier message keeps its identity');
  } else {
    assert.equal(finalAlpha.length, 1, 'the first alpha is stored exactly once');
    assert.equal(finalAlpha[0].id, firstId, 'first alpha identity survives');
    assert.equal(finalSecond.length, 1, 'the changed text is stored exactly once');
    if (secondRecoverIds.length) assert.equal(finalSecond[0].id, secondRecoverIds[0], 'the changed message identity is stable across its own unknown retry');
  }
  return out;
}

test('V1: existing stored conversation, whole text replacement alpha -> beta while persistence is held', { timeout: 60000 }, async () => {
  await existingLifecycle('V1', { queued: [], change: (p) => { p.input.value = 'beta'; }, secondText: 'beta', expectSecondDistinct: false, expectedFirstQueue: [], composerAfterFirst: 'beta' });
});

test('V2: existing stored conversation, a new pending attachment arrives while persistence is held', { timeout: 60000 }, async () => {
  const a1 = att('att1', 'one.txt'), a2 = att('att2', 'two.txt');
  await existingLifecycle('V2', { queued: [a1], change: (p) => { p.queue.attach(a2); }, secondText: 'alpha', expectSecondDistinct: true, expectedFirstQueue: ['att1', 'att2'], composerAfterFirst: 'alpha' });
});

// Actual New chat: conversation-list.newThread -> synchronous createThread (persistence queued, not awaited) -> render -> selectThread (not awaited) -> focus. The sender then awaits
// intercept, takes attachments, awaits prompt-ready and pushes the message. The earlier durable operation may be the empty creation or already contain the intended message: traced, never assumed.
async function newChatLifecycle(name, { queued, change, secondText, expectSecondDistinct, expectedFirstQueue, composerAfterFirst }) {
  const pins = assertPins();
  // CONTROL A (host validity): confirmed-empty creation, then a send.
  const c = page({ existing: false }); c.convo.newThread();
  await until(() => c.storedThreads().some((t) => t.id === c.threadId()) && c.backend.peek()?.state === 'stable', 'control creation durable and stable');
  const creationPayload = c.storedMessages().map((m) => m.content);
  assert.deepEqual(creationPayload, [], 'CONTROL: the confirmed-empty creation holds no message');
  await control(c, { queued });
  // FAULTED: unconfirmed creation in flight when the sender runs.
  const p = page({ existing: false, failAck: true });
  dispatched.length = 0; p.holdOn(); p.convo.newThread();
  const id = p.threadId();
  p.trace('after-newThread', { id, inMemoryMessages: p.state.threads.map((t) => t.messages.length), selected: p.state.currentThreadId === id, stored: p.storedThreads().length });
  p.queue.reset(queued); p.input.value = 'alpha';
  const first = await p.submit('first-alpha');
  await until(() => p.gate.waiting > 0, 'creation persistence held');
  await nap(20);
  const heldView = { input: p.input.value, queue: p.queue.ids(), storedBeforeRelease: p.storedMessages(id).map((m) => m.content), dispatches: dispatched.length };
  p.trace('held-view', heldView);
  change(p);
  p.trace('changed-view', { input: p.input.value, queue: p.queue.ids() });
  p.gate.release();
  const afterFirst = await first.finish();
  // which durable operation first carried alpha: ordered storage writes of this thread
  const writes = p.events.filter((e) => e.ev === 'storage-write').map((e, i) => ({ i, messages: (e.threads.find((t) => t.id === id)?.messages || []).map((m) => m.content) }));
  const firstWriteWithAlpha = writes.findIndex((w) => w.messages.includes('alpha'));
  const out = { name, pins, creationControlPayload: creationPayload, heldView, afterFirst, writes, firstWriteWithAlpha, firstCreationWriteContainsAlpha: firstWriteWithAlpha === 0, restored: [...p.queue.restored] };
  const alphaFirst = countOf(p.storedMessages(id), 'alpha');
  p.dump(name + ':partial'); console.log('OUTCOME-PARTIAL ' + JSON.stringify(out));
  assert.equal(afterFirst.dispatches, 0, 'no provider dispatch before the intended message is stably acknowledged');
  assert.equal(afterFirst.input, composerAfterFirst, 'changed composer survives the earlier creation/send completion WHOLE');
  assert.deepEqual(afterFirst.queue, expectedFirstQueue, 'queue: taken items restored in front of newer items, nothing lost or duplicated');
  assert.doesNotMatch((afterFirst.toast || []).join(' '), /Nothing was changed/, 'an unconfirmed write is not reported with no-write certainty');
  assert.equal(afterFirst.saves.at(-1)?.unknown, true, 'the sender save reports explicit UNKNOWN certainty while the creation operation is unconfirmed');
  assert.ok(alphaFirst.length <= 1, 'at most one durable alpha after the first attempt');
  const firstId = alphaFirst[0]?.id;
  const afterSecond = await p.send('second-changed');
  out.afterSecond = afterSecond;
  assert.equal(afterSecond.dispatches, 0, 'no dispatch while the acknowledgement still fails');
  assert.equal(afterSecond.input, composerAfterFirst, 'second unconfirmed submit keeps the changed composer');
  assert.equal(afterSecond.saves.at(-1)?.unknown, true, 'the second submit keeps explicit UNKNOWN certainty');
  if (firstId) assert.ok(p.storedMessages(id).some((m) => m.id === firstId), 'the earlier durable message is preserved');
  p.backend.failing.cas = false; p.flags.failAck = false;
  const afterRecover = await p.send('recover-changed');
  out.afterRecover = afterRecover;
  // diagnostic only (recorded, not asserted): when the retry made no progress, is the refusal persistent for the next explicit retry too?
  if (afterRecover.dispatches === 0) { const again = await p.send('recover-again'); out.afterRecoverAgain = again; const again2 = await p.send('recover-again-2'); out.afterRecoverAgain2 = again2; }
  const finalAlpha = countOf(p.storedMessages(id), 'alpha'), finalSecond = countOf(p.storedMessages(id), secondText);
  out.final = { stored: p.storedMessages(id), dispatched: structuredClone(dispatched), record: p.backend.peek()?.state };
  p.dump(name); console.log('OUTCOME ' + JSON.stringify(out));
  assert.equal(afterRecover.dispatches, 1, 'bounded progress: an explicit retry after recovery dispatches exactly once');
  assert.equal(dispatched[0].record, 'stable', 'stable acknowledgement precedes the dispatch');
  assert.equal(afterRecover.input, '', 'composer clears only after the confirmed save of the unchanged input');
  assert.deepEqual(afterRecover.queue, [], 'queue released after confirmed save');
  if (expectSecondDistinct) {
    assert.equal(finalAlpha.length, 2, 'same words with a changed attachment set: two distinct occurrences, both durable');
    assert.notEqual(finalAlpha[0].id, finalAlpha[1].id);
    if (firstId) assert.equal(finalAlpha[0].id, firstId, 'the earlier message keeps its identity');
  } else {
    assert.equal(finalAlpha.length, firstId ? 1 : 0, 'alpha is not duplicated');
    if (firstId) assert.equal(finalAlpha[0].id, firstId, 'first alpha identity survives');
    assert.equal(finalSecond.length, 1, 'the changed text is stored exactly once');
  }
  for (const m of p.storedMessages(id).filter((x) => x.role === 'user')) assert.equal(p.eventsFor(m.id) <= 1, true, 'no duplicate human event for ' + m.content);
  return out;
}

test('V3: actual New chat, whole text replacement while creation/send confirmation is pending', { timeout: 60000 }, async () => {
  await newChatLifecycle('V3', { queued: [], change: (p) => { p.input.value = 'beta'; }, secondText: 'beta', expectSecondDistinct: false, expectedFirstQueue: [], composerAfterFirst: 'beta' });
});

test('V4: actual New chat, changed attachment queue while creation/send confirmation is pending', { timeout: 60000 }, async () => {
  const a1 = att('att1', 'one.txt'), a2 = att('att2', 'two.txt');
  await newChatLifecycle('V4', { queued: [a1], change: (p) => { p.queue.attach(a2); }, secondText: 'alpha', expectSecondDistinct: true, expectedFirstQueue: ['att1', 'att2'], composerAfterFirst: 'alpha' });
});
