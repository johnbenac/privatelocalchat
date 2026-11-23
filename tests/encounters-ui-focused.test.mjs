// T418 focused UI corrections, through the app's OWN modules (createSender, createThreadState, createConversationList, createEncounters, the real commit) with stand-ins only for the
// browser (a Map storage, an in-process Web Lock, a few plain objects for the DOM). This is a module-level proof; the real page is driven by tests/e2e/encounters-ui-focused.e2e.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { outcomeOf, sentence } from '../chat/encounters/save-outcome.mjs';
const { warningSentence = () => '' } = await import('../chat/encounters/save-outcome.mjs');   // (a missing helper is a failing assertion below, not an import crash)
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { emptyLedger, ensureEncounter } from '../chat/encounters/records.mjs';
import { memStorage, fakeLocks, thread, msg } from './helpers/encounters-env.mjs';
import * as model from '../chat/threads.mjs';

const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
globalThis.Option ??= class { constructor(label, value) { this.label = label; this.value = value; } };
globalThis.document ??= { querySelectorAll: () => [], getElementById: () => ({ hidden: false, textContent: '' }), createElementNS: () => ({ setAttribute() {}, appendChild() {}, innerHTML: '' }) };
const { createThreadState } = await import('../chat/core/thread-state.mjs');
const { createSender } = await import('../chat/core/sender.mjs');
const { createConversationList } = await import('../chat/list/conversation-list.mjs');

const noop = () => {};
const settle = () => new Promise((r) => setTimeout(r, 25));

// ---------------------------------------------------------------------------------------------------------------- composer
function composer({ persist, text = 'alpha', attachments = [] } = {}) {
  const input = { value: text, focus: noop };
  const th = { id: 't', title: 'T', messages: [], updatedAt: 0 };
  const queue = [...attachments]; const restored = [];
  const sender = createSender({ g: {}, messageInput: input, currentThread: () => th, currentThreadId: () => th.id, getThread: () => null, getChatState: () => ({ ready: true }),
    events: { emit: noop, intercept: async () => false, emitAwait: async () => {} },
    docsUi: { attachments: { count: () => queue.length, take: () => queue.splice(0), restore: (a) => { restored.push(...a); } } },
    M: () => ({ model }), threadTitleInput: { value: 'T' }, persistThreads: persist, growComposer: noop, persistDraftNow: noop, renderThreadList: noop, messagesView: { renderMessages: noop } });
  return { input, th, sender, restored, send: () => sender.handleSendMessage({ preventDefault: noop }) };
}
const gate = () => { let release; const wait = new Promise((r) => { release = r; }); return { wait, release }; };

test('composer: Select All + replace while the save is pending keeps the WHOLE replacement (alpha -> alphabet) and stores alpha once', async () => {
  const g = gate(), entered = gate();
  const c = composer({ persist: async () => { entered.release(); await g.wait; return { saved: true }; } });
  const pending = c.send(); await entered.wait;
  c.input.value = 'alphabet'; g.release(); await pending;
  assert.deepEqual(c.th.messages.map((m) => m.content), ['alpha']);
  assert.equal(c.input.value, 'alphabet');
});

test('composer: unchanged text clears after the save; appended text keeps the whole changed composer; both control cases in one place', async () => {
  const same = composer({ persist: async () => ({ saved: true }) });
  await same.send(); assert.equal(same.input.value, '');
  const g = gate(), entered = gate();
  const app = composer({ persist: async () => { entered.release(); await g.wait; return { saved: true }; } });
  const pending = app.send(); await entered.wait; app.input.value = 'alpha and more'; g.release(); await pending;
  assert.equal(app.input.value, 'alpha and more'); assert.equal(app.th.messages.length, 1);
});

test('composer: a refused save keeps the composer, the attachments and does not store the message; a double press during the save sends once', async () => {
  const att = [{ id: 'a1', name: 'f' }];
  const refused = composer({ persist: async () => ({ saved: false }), attachments: att });
  await refused.send();
  assert.equal(refused.input.value, 'alpha'); assert.equal(refused.th.messages.length, 0); assert.deepEqual(refused.restored, att);
  const g = gate(); let calls = 0;
  const dbl = composer({ persist: async () => { calls++; await g.wait; return { saved: true }; } });
  const a = dbl.send(), b = dbl.send(); g.release(); await Promise.all([a, b]);
  assert.equal(calls, 1); assert.equal(dbl.th.messages.length, 1);
});

// ---------------------------------------------------------------------------------------------------------------- partial attribution
function ledgerAtMax() { const l = emptyLedger(); ensureEncounter(l, 't', 0).encounter.seq = Number.MAX_SAFE_INTEGER; return JSON.stringify(l); }
function page() {
  const storage = memStorage({ chatThreads: JSON.stringify([thread('t', [msg('old', 'user', 'old')])]), 'plc.encounters.v1': ledgerAtMax() });
  const state = { threads: [], currentThreadId: 't', generationBusy: false, gen: null }; const toasts = [];
  const host = { s: state, M: () => ({ model }), showToast: (t) => toasts.push(t), readJson: () => null, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'plc.activeThread.v1' };
  const encounters = createEncounters({ storage, locks: fakeLocks(), watch: ['chatThreads'], threads: () => state.threads, normalizeThread: model.normalizeThread, newId: model.newId, now: () => 5000 });
  host.encounters = encounters; state.threads = JSON.parse(storage.getItem('chatThreads')).map((t) => model.normalizeThread(t));
  return { storage, state, toasts, host, encounters, ts: createThreadState(host) };
}

test('outcomeOf/warningSentence: durable transcript with a refused attribution is saved + a truthful partial warning; a dropped planned message is not', () => {
  const o = outcomeOf({ ok: true, conflicts: [], wrote: true, refused: [{ message: 'new', thread: 't', code: 'exhausted', detail: 'x' }] }, ['t']);
  assert.equal(o.saved, true); assert.equal(o.partial, true);
  assert.match(warningSentence(o), /Saved, but not fully recorded: .*every|cannot be advanced/i);
  assert.match(warningSentence(o), /do not send it again/);
  const dropped = outcomeOf({ ok: true, conflicts: [], refused: [{ message: 'p', thread: 't', code: 'unknown-speaker', dropped: true }] }, ['t']);
  assert.equal(dropped.saved, true); assert.equal(dropped.partial, false); assert.equal(warningSentence(dropped), '');
  assert.equal(outcomeOf({ ok: true, refused: [{ message: 'n', thread: 'other', code: 'exhausted' }] }, ['t']).partial, false, 'another conversation\'s refusal is not this change\'s');
  assert.equal(warningSentence(outcomeOf({ ok: false, code: 'unsupported' })), '');
  assert.match(sentence(outcomeOf({ ok: false, code: 'unsupported' }), 'x'), /Nothing was changed/);
});

test('actual commit at the safe maximum: transcript is stored once, persist() warns truthfully, the sender clears and neither restores nor resends', async () => {
  const p = page(); p.encounters.init(p.storage.getItem('chatThreads'));
  const th = p.state.threads[0]; const dispatched = [];
  const input = { value: 'new text', focus: noop };
  const sender = createSender({ g: {}, messageInput: input, currentThread: () => th, currentThreadId: () => th.id, getThread: () => null, getChatState: () => ({ ready: true }),
    events: { emit: noop, intercept: async () => false, emitAwait: async () => {} }, docsUi: { attachments: { count: () => 0, take: () => [], restore: () => dispatched.push('restore') } },
    M: () => ({ model }), threadTitleInput: { value: th.title }, persistThreads: p.ts.persist, growComposer: noop, persistDraftNow: noop, renderThreadList: noop, messagesView: { renderMessages: noop } });
  await sender.handleSendMessage({ preventDefault: noop });
  const stored = JSON.parse(p.storage.getItem('chatThreads'))[0].messages.map((m) => m.content);
  assert.deepEqual(stored, ['old', 'new text'], 'durable exactly once');
  assert.equal(input.value, '', 'the stored text is released from the composer, never restored');
  assert.deepEqual(dispatched, []);
  assert.equal(p.toasts.length, 1); assert.match(p.toasts[0], /Saved, but not fully recorded/); assert.doesNotMatch(p.toasts[0], /was not sent/);
  assert.equal(th.messages.filter((m) => m.content === 'new text').length, 1);
  assert.equal(Object.keys(JSON.parse(p.storage.getItem('plc.encounters.v1')).events).length, 0, 'the records really do lack it');
});

// ---------------------------------------------------------------------------------------------------------------- folders
function fakeEl(tag, cls, text) {
  const n = { tag, cls, text, children: [], listeners: {}, dataset: {}, classList: { add: noop }, value: '', appendChild(c) { n.children.push(c); return c; }, append(...c) { n.children.push(...c); }, addEventListener(t, f) { n.listeners[t] = f; }, setAttribute: noop, replaceChildren: noop };
  return n;
}
function list({ folders, threads, persist, writeOk = () => true }) {
  const toasts = [], writes = []; let menu = null, dialog = null;
  const host = { el: fakeEl, events: { on: noop }, readJson: () => folders, writeJson: (_s, k, v) => { const ok = writeOk(); if (ok) writes.push(JSON.parse(JSON.stringify(v))); return ok; }, getThread: (id) => threads.find((t) => t.id === id), createThread: noop, selectThread: noop,
    renameThread: noop, exportThreadMarkdown: noop, buildPreloadUrl: noop, saveThreads: async () => true, persistThreads: persist, generateThreadId: () => 'id', threads: () => threads, currentThreadId: () => null, clearCurrentThread: noop,
    generation: () => null, threadList: fakeEl('ul'), messageInput: {}, createEmoji: () => fakeEl('i'), actionButton: noop, messageDecorators: [], messageActionHandlers: {}, closeThreadMenu: noop, placeMenu: (m) => { menu = m; },
    openThreadMenu: () => null, updateThreadListMinHeight: noop, promptDialog: async () => null, confirmDialog: async () => true, copyTextDialog: noop, openAppDialog: (d) => { dialog = d; }, showToast: (t) => toasts.push(t),
    M: () => ({ model, shellRegistry: { groupThreadsByDate: () => [] } }) };
  const ui = createConversationList(host);
  return { ui, toasts, writes, deleteProject: async () => { ui.render(); const hd = host.threadList.children.find((c) => c.cls === 'folder-heading'); hd.children[1].listeners.click({ stopPropagation: noop }); const del = menu.children.find((b) => b.children.some((c) => /Delete project/.test(c.text || ''))); del.listeners.click(); await settle(); },
    move: async (id, to) => { await ui.moveToFolder(id); const sel = dialog.content.children[1]; sel.value = to; await dialog.actions[1].run(); } };
}
const realFolder = () => ({ id: 'f1', name: 'Real name', instructions: 'Real instructions', future: { keep: [1, 2] } });

test('moveToFolder: a refused move puts back the EXACT previous folderId (was in f1 -> stays f1; had none -> none); a stored move keeps it', async () => {
  const f = [realFolder(), { id: 'f2', name: 'Two', instructions: '' }];
  const t1 = thread('a', [], { folderId: 'f1' }), t2 = thread('b', []);
  const refuse = list({ folders: f, threads: [t1, t2], persist: async () => ({ saved: false }) });
  await refuse.move('a', 'f2'); assert.equal(t1.folderId, 'f1');
  await refuse.move('b', 'f2'); assert.equal('folderId' in t2, false);
  const ok = list({ folders: f, threads: [t1, t2], persist: async () => ({ saved: true }) });
  await ok.move('a', 'f2'); assert.equal(t1.folderId, 'f2');
});

test('Delete project: a refused chat save leaves the real folder, its unknown fields, the folder store and every chat\'s folderId exactly as they were', async () => {
  const folder = realFolder(); const snap = JSON.stringify(folder);
  const a = thread('a', [], { folderId: 'f1' }), b = thread('b', [], { folderId: 'f1' }), other = thread('c', [], { folderId: 'zz' });
  const L = list({ folders: [folder], threads: [a, b, other], persist: async () => ({ saved: false, ok: false, conflicts: [] }) });
  await L.deleteProject();
  assert.equal(L.writes.length, 0, 'no folder write when the chats were not saved');
  assert.equal(L.ui.folders().length, 1); assert.equal(L.ui.folders()[0], folder); assert.equal(JSON.stringify(folder), snap);
  assert.equal(a.folderId, 'f1'); assert.equal(b.folderId, 'f1'); assert.equal(other.folderId, 'zz');
});

test('Delete project: stored chats then the folder is removed once; a later folder-write failure is reported as partial and keeps the real folder', async () => {
  const folder = realFolder(); const a = thread('a', [], { folderId: 'f1' });
  const ok = list({ folders: [folder], threads: [a], persist: async () => ({ saved: true, ok: true, conflicts: [] }) });
  await ok.deleteProject();
  assert.equal('folderId' in a, false); assert.equal(ok.ui.folders().length, 0); assert.equal(ok.writes.length, 1);
  const f2 = realFolder(); const a2 = thread('a', [], { folderId: 'f1' });
  const bad = list({ folders: [f2], threads: [a2], persist: async () => ({ saved: true, ok: true, conflicts: [] }), writeOk: () => false });
  await bad.deleteProject();
  assert.equal('folderId' in a2, false, 'the chat references were durably removed and are not faked back');
  assert.equal(bad.ui.folders()[0], f2, 'the real folder object stays, unchanged');
  assert.ok(bad.toasts.some((t) => /could not be removed/.test(t)), JSON.stringify(bad.toasts));
});

test('Delete project: a per-chat conflict keeps the project and puts back only the conflicting chat', async () => {
  const folder = realFolder(); const a = thread('a', [], { folderId: 'f1' }), b = thread('b', [], { folderId: 'f1' });
  const L = list({ folders: [folder], threads: [a, b], persist: async () => ({ saved: false, ok: true, conflicts: [{ thread: 'b' }] }) });
  await L.deleteProject();
  assert.equal('folderId' in a, false, 'stored elsewhere-clean chat stays out'); assert.equal(b.folderId, 'f1');
  assert.equal(L.writes.length, 0); assert.equal(L.ui.folders()[0], folder);
  assert.ok(L.toasts.some((t) => /project was kept/.test(t)));
});

// ---------------------------------------------------------------------------------------------------------------- version selection / context toggle
function actions(persist) {
  const th = { id: 't', messages: [], updatedAt: 0 }; const rendered = [];
  const sender = createSender({ g: {}, currentThread: () => th, currentThreadId: () => th.id, getThread: () => th, STATUS: () => model.STATUS, M: () => ({ model }), persistThreads: persist, messagesView: { renderMessages: () => rendered.push(1) }, showToast: noop, events: { emit: noop } });
  return { th, sender, rendered };
}
test('version selection: a refused selection goes back to the exact previous version in this tab; a stored one stays', async () => {
  const mk = () => ({ id: 'm', role: 'assistant', content: 'two', versions: [{ content: 'one' }, { content: 'two' }], versionIndex: 1, at: 1 });
  const bad = actions(async () => ({ saved: false })); const m = mk(); bad.th.messages.push(m);
  await bad.sender.handleMessageAction('prev-version', 'm', null, null);
  assert.equal(m.versionIndex, 1); assert.equal(m.content, 'two');
  const good = actions(async () => ({ saved: true })); const m2 = mk(); good.th.messages.push(m2);
  await good.sender.handleMessageAction('prev-version', 'm', null, null);
  assert.equal(m2.versionIndex, 0); assert.equal(m2.content, 'one');
});

test('context toggle: refused toggle goes back (both directions), stored stays, a second press while storing does nothing', async () => {
  const bad = actions(async () => ({ saved: false })); const m = { id: 'm', role: 'user', content: 'x', at: 1 }, m2 = { id: 'n', role: 'user', content: 'y', at: 1, excluded: true };
  bad.th.messages.push(m, m2);
  await bad.sender.handleMessageAction('toggle-context', 'm', null, null); assert.equal('excluded' in m, false);
  await bad.sender.handleMessageAction('toggle-context', 'n', null, null); assert.equal(m2.excluded, true);
  const g = gate(); let calls = 0;
  const slow = actions(async () => { calls++; await g.wait; return { saved: true }; }); const m3 = { id: 'm', role: 'user', content: 'x', at: 1 }; slow.th.messages.push(m3);
  const a = slow.sender.handleMessageAction('toggle-context', 'm', null, null), b = slow.sender.handleMessageAction('toggle-context', 'm', null, null);
  g.release(); await Promise.all([a, b]);
  assert.equal(calls, 1); assert.equal(m3.excluded, true);
});
