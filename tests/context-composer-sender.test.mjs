// The composer at the provider boundary (chat/core/sender.mjs buildInferenceMessages / runReply with a receiver). Synthetic data only.
// REAL: createSender, the event list, the encounters facade and ledger (memory storage, in-process Web Lock stand-in), the composer and its host glue, the app's thread model.
// STAND-IN (named, not a browser claim): the DOM (a stub), the provider (window.localModels.generate records exactly the messages array it is handed and answers a fixed line), storage (a Map).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { createEvents } from '../chat/events.mjs';
import { createReceiverContext } from '../chat/context/receiver-context.mjs';
import { messagesForInference } from '../conversation-messages.mjs';
import { memStorage, fakeLocks, thread, msg, coordFor } from './helpers/encounters-env.mjs';
import { memoryBackend } from '../chat/encounters/coordination.mjs';
import * as model from '../chat/threads.mjs';
import { assistantId } from '../chat/encounters/records.mjs';

const noop = () => {};
const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
const stub = () => ({ hidden: true, textContent: '', dataset: {}, style: {}, setAttribute: noop });
globalThis.document ??= { getElementById: stub, querySelectorAll: () => [] };
const { createSender } = await import('../chat/core/sender.mjs');
const provider = [];                       // every messages array the (stand-in) provider was handed
globalThis.window = { localModels: { mode: 'local', ready: true, generate: async (messages, o) => { provider.push(JSON.parse(JSON.stringify(messages))); o?.onFinish?.({ finishReason: 'stop' }); return 'fixed reply'; } }, setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) };
const CONTINUE = 'Please continue exactly where your previous reply stopped.';

// ---- the request main builds today, copied verbatim from the commit this work started from (git show 90e9624:chat/core/sender.mjs) ----
async function oldBuild(host, thread, index, mode) {
  const view = { ...thread, messages: thread.messages.slice(0, mode === 'continue' ? index + 1 : index) };
  if (mode === 'continue') view.messages[index] = { ...view.messages[index], status: undefined };
  const out = { preamble: [], attachmentText: {}, sources: [] };
  for (const part of await host.events.collect('context:collect', thread, view)) {
    if (part?.preamble) out.preamble.push(...part.preamble);
    if (part?.attachmentText) Object.assign(out.attachmentText, part.attachmentText);
    if (part?.sources) out.sources.push(...part.sources);
  }
  const messages = messagesForInference(view, out);
  if (mode === 'continue') messages.push({ role: 'user', content: CONTINUE });
  return messages;
}

function rig({ threads = [], memory = { enabled: true, items: [{ text: 'likes tea' }] }, prefs = { instructions: 'be brief' }, withComposer = true, policy = null } = {}) {
  const storage = memStorage(); let n = 0;
  const live = threads;
  const writes = []; const raw = storage.setItem; storage.setItem = (k, v) => { writes.push(k); raw(k, v); };
  const enc = createEncounters({ storage, locks: fakeLocks(), watch: ['chatThreads'], coordination: coordFor(storage, memoryBackend(), { freshMs: 10 }), threads: () => live, normalizeThread: model.normalizeThread, newId: () => 'rx' + ++n, showToast: noop, now: () => 5000 });
  enc.init();
  const events = createEvents();
  // the page's collectors, as the assistant, documents and project modules add them (their wording is theirs; this rig only needs them to speak)
  events.on('context:collect', async (t) => ({ preamble: [...(prefs.instructions ? ['PREFS ' + prefs.instructions] : []), ...(memory.enabled && !t.temporary ? ['MEMORY ' + memory.items.map((i) => i.text).join('|')] : [])] }));
  events.on('context:collect', async (t, view) => { const ids = view.messages.flatMap((m) => (m.attachments || []).map((a) => a.id)); return ids.length ? { preamble: ['DOCS'], attachmentText: Object.fromEntries(ids.map((id) => [id, 'text of ' + id])), sources: ids.map((docId) => ({ docId })) } : {}; });
  events.on('context:collect', async (t) => ({ preamble: [t.folderId ? 'Instructions for the "x" project:\nbe kind' : ''] }));
  const messagesView = { renderMessages: noop, schedulePaint: noop, generatingLabel: () => 'x', prep: null };
  const host = { moduleBase: () => new URL('../', import.meta.url).href, events, CONTINUE_PROMPT: CONTINUE, g: {},
    // the parts runReply needs, with stand-ins: a save that is stored (the encounters commit is exercised by its own suites), a thread lookup, the thread model, no DOM
    persistThreads: async () => ({ saved: true }), saveThreads: async () => ({ ok: true }), getThread: (id) => live.find((t) => t.id === id), STATUS: () => model.STATUS, M: () => ({ model }), currentThreadId: () => null,
    messagesView, updateChatAvailability: noop, updateSendButtonDisabled: noop, providerName: () => 'x', modelLabel: () => 'stand-in', provider: { authErrors: 0, config: {} }, updateAuthGuidance: noop, isAuthError: () => false,
    renderThreadList: noop, renderMessages: noop, offline: null, schedulePaint: noop };
  if (withComposer) host.receiverContext = createReceiverContext({ encounters: enc.facade, memory: () => memory, prefs: () => prefs, ...(policy ? { policy } : {}) });
  const sender = createSender(host);
  return { enc, f: enc.facade, sender, host, storage, writes, live };
}

const conversations = () => [
  thread('plain', [msg('a', 'user', 'hello'), msg('b', 'assistant', 'hi there'), msg('c', 'user', 'what is 2+2?')]),
  thread('sys', [msg('a', 'user', 'hello'), msg('b', 'assistant', 'hi'), msg('c', 'user', 'again')], { systemPrompt: ' Be a pirate. ' }),
  thread('preset', [msg('a', 'user', 'x'), msg('b', 'assistant', 'y'), msg('c', 'user', 'z')], { systemPrompt: 'Preset prompt', presetId: 'p1', folderId: 'f1' }),
  thread('docs', [msg('a', 'user', 'read this', { attachments: [{ id: 'doc1', name: 'a.txt', kind: 'text' }, { id: 'img1', name: 'p.png', kind: 'image' }] }), msg('b', 'assistant', 'ok'), msg('c', 'user', 'and?', { tools: [{ label: '2+2', result: '4' }] })]),
  thread('summary', [msg('a', 'user', 'one'), msg('b', 'assistant', 'two'), msg('c', 'user', 'three'), msg('d', 'assistant', 'four'), msg('e', 'user', 'five')], { summary: { text: 'earlier', upTo: 2 } }),
  thread('excluded', [msg('a', 'user', 'one', { excluded: true }), msg('b', 'assistant', 'two'), msg('n', 'system', 'note', { notice: true }), msg('c', 'user', 'three')]),
  thread('cont', [msg('a', 'user', 'tell a story'), msg('b', 'assistant', 'Once upon a time', { status: 'stopped' })]),
  thread('temp', [msg('a', 'user', 'secret'), msg('b', 'assistant', 'ok'), msg('c', 'user', 'more')], { temporary: true }),
];

test('ordinary chat is byte-identical to main: no receiver, or the default assistant as receiver, builds the request main builds', async () => {
  const r = rig({ threads: conversations() });
  let compared = 0;
  for (const t of r.live) {
    const last = t.messages.length;
    for (const [mode, index] of [['new', last], ['regenerate', last - 1], ['retry', last - 1], ['continue', last - 1]]) {
      const old = await oldBuild(r.host, t, index, mode);
      const bare = await r.sender.buildInferenceMessages(t, index, mode);
      const none = await r.sender.buildInferenceMessages(t, index, mode, {});
      const dflt = await r.sender.buildInferenceMessages(t, index, mode, { receiver: assistantId(t.id) });
      const person = await r.sender.buildInferenceMessages(t, index, mode, { receiver: 'p:' + t.id + ':person' });
      for (const got of [bare, none, dflt, person]) assert.equal(JSON.stringify(got), JSON.stringify(old), t.id + ' ' + mode);
      compared++;
    }
  }
  assert.equal(compared, 32);
  // it did not need the composer at all
  const bare = rig({ threads: conversations(), withComposer: false });
  const t = bare.live[0]; assert.equal(JSON.stringify(await bare.sender.buildInferenceMessages(t, 3, 'new')), JSON.stringify(await oldBuild(bare.host, t, 3, 'new')));
  // the ordinary request really carries the global memory and preferences (so the comparison above is not between two empty things)
  const text = JSON.stringify(await r.sender.buildInferenceMessages(r.live[0], 3, 'new'));
  assert.ok(text.includes('MEMORY likes tea') && text.includes('PREFS be brief'));
});

test('a request for a receiving individual is never built without the composer (fail closed), and never asks the global collectors', async () => {
  const r = rig({ threads: conversations(), withComposer: false });
  await assert.rejects(r.sender.buildInferenceMessages(r.live[0], 3, 'new', { receiver: 'p:r1' }), (e) => e.code === 'composer-unavailable');
  const w = rig({ threads: conversations() });
  let asked = 0; w.host.events.on('context:collect', async () => { asked++; return {}; });
  const reg = await w.f.registerParticipant({ thread: 'plain', id: 'p:r1', name: 'Rin', kind: 'agent', individualId: 'ind:rin' });
  assert.equal(reg.ok, true, JSON.stringify(reg));
  const before = asked;
  const built = await w.sender.buildInferenceMessages(w.live[0], 3, 'new', { receiver: 'p:r1' });
  assert.equal(asked, before, 'the receiver path does not collect the person’s memory, preferences, folder text or documents');
  assert.ok(!JSON.stringify(built).includes('likes tea') && !JSON.stringify(built).includes('be brief'));
  await assert.rejects(w.sender.buildInferenceMessages(w.live[0], 3, 'new', { receiver: 'p:not-in-this-chat' }), (e) => e.code === 'unknown-receiver');
});

test('provider request inspection: the messages array a receiving individual’s provider is handed holds nothing that individual may not see', async () => {
  const live = [thread('room', [msg('m1', 'user', 'to everyone'), msg('m2', 'user', 'LEGACY-LINE-TWO'), msg('m3', 'user', 'LEGACY-LINE-THREE'), msg('m4', 'user', 'what now?')])];
  const r = rig({ threads: live });
  // the records: Rin and Sol are individuals of this conversation; the transcript lines carry their audiences
  for (const [id, name, ind] of [['p:rin', 'Rin', 'ind:rin'], ['p:sol', 'Sol', 'ind:sol']]) assert.equal((await r.f.registerParticipant({ thread: 'room', id, name, kind: 'agent', individualId: ind })).ok, true);
  const person = 'p:room:person';
  // transcript lines recorded with an audience through the facade (the same commit as the chat)
  await r.enc.saveThreads();
  const recv = (m, text, audience) => r.f.receive({ thread: 'room', transcript: true, speaker: person, expression: 'person', modality: 'text', text, role: 'user', audience, occurrence: { source: 'syn', id: m } });
  const a = await recv('o1', 'SHOWN-TO-ALL', 'encounter'), b = await recv('o2', 'SHOWN-ONLY-TO-SOL', ['p:sol']), c = await recv('o3', 'SHOWN-ONLY-TO-RIN', ['p:rin']);
  for (const x of [a, b, c]) assert.equal(x.ok, true, JSON.stringify(x));
  const t = r.live[0];
  const rin = await r.sender.buildInferenceMessages(t, t.messages.length, 'new', { receiver: 'p:rin' });
  const sol = await r.sender.buildInferenceMessages(t, t.messages.length, 'new', { receiver: 'p:sol' });
  const flat = (m) => JSON.stringify(m);
  assert.ok(flat(rin).includes('SHOWN-TO-ALL') && flat(rin).includes('SHOWN-ONLY-TO-RIN') && !flat(rin).includes('SHOWN-ONLY-TO-SOL'));
  assert.ok(flat(sol).includes('SHOWN-TO-ALL') && flat(sol).includes('SHOWN-ONLY-TO-SOL') && !flat(sol).includes('SHOWN-ONLY-TO-RIN'));
  assert.ok(!flat(rin).includes('likes tea') && !flat(rin).includes('be brief'), 'global memory and preferences stay personal');
  // the real send path: runReply (a reply for Rin) hands exactly this array to the provider
  provider.length = 0;
  const done = await r.sender.runReply('room', { receiver: 'p:rin' });
  assert.equal(done.ok, true);
  assert.equal(provider.length, 1);
  assert.deepEqual(provider[0], JSON.parse(flat(rin)), 'the array the provider received is the composed one');
  assert.ok(!flat(provider[0]).includes('SHOWN-ONLY-TO-SOL') && flat(provider[0]).includes('SHOWN-ONLY-TO-RIN'));
  assert.ok(flat(provider[0]).includes('LEGACY-LINE-TWO'), 'saveThreads recorded this line with the default encounter audience, so the receiver is told it (a line with NO record is left out by default: see the composer test)');
  // the same conversation answered for the default assistant is the ordinary request (and does carry the person's memory), so the two are visibly different requests
  provider.length = 0;
  await r.sender.runReply('room');
  assert.ok(flat(provider[0]).includes('MEMORY likes tea'));
});

test('a temporary chat: composing for a receiver writes nothing anywhere, and its records live in memory only', async () => {
  const live = [thread('tmp', [msg('m1', 'user', 'TEMP-LINE')], { temporary: true })];
  const r = rig({ threads: live, policy: () => ({ legacyTranscript: 'include' }) });   // an unrecorded line is told only when the person's policy includes it
  const reg = await r.f.registerParticipant({ thread: 'tmp', id: 'p:rin', name: 'Rin', kind: 'agent', individualId: 'ind:rin' });
  assert.equal(reg.memoryOnly, true);
  const ev = await r.f.receive({ thread: 'tmp', speaker: 'p:rin', expression: 'model', modality: 'text', text: 'TEMP-REPORT', standing: 'reported', occurrence: { source: 's', id: '1' }, audience: 'encounter' });
  assert.equal(ev.memoryOnly, true);
  const writesBefore = r.writes.length, keysBefore = [...r.storage._m.keys()];
  const built = await r.sender.buildInferenceMessages(live[0], 1, 'new', { receiver: 'p:rin' });
  assert.ok(JSON.stringify(built).includes('TEMP-LINE') && JSON.stringify(built).includes('TEMP-REPORT'), 'the receiver sees its own temporary conversation');
  assert.ok(!JSON.stringify(built).includes('likes tea'), 'no memory in a temporary chat');
  assert.equal(r.writes.length, writesBefore, 'composing wrote to no storage key');
  assert.deepEqual([...r.storage._m.keys()], keysBefore);
  for (const [k, v] of r.storage._m) assert.ok(!v.includes('TEMP-LINE') && !v.includes('TEMP-REPORT'), 'nothing of the temporary chat is in ' + k);
  // and the answer for the receiver runs without storing the temporary chat either
  await r.sender.runReply('tmp', { receiver: 'p:rin' });
  for (const [k, v] of r.storage._m) assert.ok(!v.includes('TEMP-LINE'), 'still nothing stored in ' + k);
});

test('the sender wiring is the documented one: receiver is an option of runReply and buildInferenceMessages only, and the page passes the composer', () => {
  const sender = readFileSync(new URL('../chat/core/sender.mjs', import.meta.url), 'utf8');
  assert.ok(sender.includes("async function runReply(threadId, { mode = 'new', message = null, receiver = null } = {})"));
  assert.ok(sender.includes('buildInferenceMessages(thread, index, mode, { receiver })'));
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.ok(page.includes('receiverContext: createReceiverContext({ encounters: encounters.facade'));
});

test('the composer words for legacy memory and preferences are the ones the assistant already sends', async () => {
  const { MEMORY_PREFACE, PREFERENCES_PREFACE } = await import('../chat/context/composer.mjs');
  const src = readFileSync(new URL('../chat/assistant/assistant.mjs', import.meta.url), 'utf8');
  assert.ok(src.includes(PREFERENCES_PREFACE.trimEnd().replace(/\n/g, '\\n')), 'preferences preface');
  assert.ok(src.includes(MEMORY_PREFACE.trimEnd().replace(/\n/g, '\\n')), 'memory preface');
});
