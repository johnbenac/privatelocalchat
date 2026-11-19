// T418 changed-caller concurrency qualification: 4 / 8 / 16 participating controllers x 20 repeats, through the app's OWN modules.
//
// REAL (not mirrored): createSender.handleSendMessage / handleMessageAction, createConversationList (the visible Move and Delete project menu actions), createThreadState.persist and the
// actual encounters commit / ledger store / records over ONE shared chatThreads + plc.encounters.v1.
// PROVIDED CONTRACTS (stand-ins, labelled): storage = one fresh Map shared by every controller (no stale views), Web Locks = an in-process FIFO exclusive lock, the DOM/dialog objects,
// the folder store (one whole-array writer PER controller: its cross-tab protocol is not claimed), and inference (never dispatched: the getThread spy counts how often a reply was
// attempted). This does NOT cure or exercise the real-browser stale-view / freshness barrier (owned elsewhere) and is not a browser run.
//
// Per repeat every controller runs these roles at once, released together behind a held lock and a held save:
//   S1 own send (held save, double press, newer typing)  S2 send to the SHARED thread  S3 durable text with refused attribution + refused facade message  S4 version select (conflicting targets)
//   S5 context toggle  S6 Move to project (two controllers, one chat)  S7 Delete project (normal / per-chat conflict / folder failure / refusal)
// Refusing controllers (index mod 8): 3 no Web Locks, 7 read-only, 5 ledger-intent quota. Their every action must refuse and leave the person's input untouched.
// Negative controls: the ACTUAL pre-G b070013 sender / conversation list run through the SAME scenario and the SAME invariants and must violate them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { outcomeOf } from '../chat/encounters/save-outcome.mjs';
import { createEncounters } from '../chat/encounters/encounters.mjs';
import { emptyLedger, ensureEncounter, encounterId } from '../chat/encounters/records.mjs';
import { memStorage, fakeLocks, thread, msg } from './helpers/encounters-env.mjs';
import * as model from '../chat/threads.mjs';

const shim = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; };
globalThis.localStorage ??= shim(); globalThis.sessionStorage ??= shim();
globalThis.Option ??= class { constructor(label, value) { this.label = label; this.value = value; } };
globalThis.document ??= { querySelectorAll: () => [], getElementById: () => ({ hidden: false, textContent: '' }) };
const { createThreadState } = await import('../chat/core/thread-state.mjs');
const { createSender: realSender } = await import('../chat/core/sender.mjs');
const { createConversationList: realList } = await import('../chat/list/conversation-list.mjs');

const REPEAT = Number(process.env.CONC_REPEAT || 20);
const noop = () => {};
const gate = () => { let release; const wait = new Promise((r) => { release = r; }); return { wait, release }; };
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, rej) => { t = setTimeout(() => rej(new Error('no deadlock: ' + what + ' did not finish in ' + ms + ' ms')), ms); })]).finally(() => clearTimeout(t)); };
const until = async (pred, ms, what) => { const t0 = Date.now(); while (!pred()) { if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what); await new Promise((r) => setTimeout(r, 1)); } };
const clone = (v) => JSON.parse(JSON.stringify(v));
const settle = (ms = 5) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------------------------- negative controls: the ACTUAL pre-G source
// The original b07001370b929044c792cf0b1d1fc591bfdc2ae5 files are pinned byte-for-byte as clone-local fixtures (tests/fixtures/encounters/PROVENANCE.txt): no git, no history, no skip.
// A missing or altered fixture makes this file fail at load. Only the relative import specifiers are rewritten, to the ORIGINAL directory of each file in this clone.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(root, 'tests', 'fixtures', 'encounters');
const PINNED = {
  sender: { fixture: 'b070013-sender.mjs.txt', original: 'chat/core/sender.mjs', sha256: 'd7d06c68282bf0502f1e340b26fcbfc878d5a7f87e6dc079d0f751ad8e66c766' },
  list: { fixture: 'b070013-conversation-list.mjs.txt', original: 'chat/list/conversation-list.mjs', sha256: '345d8a6d51f862de953b5629e874504a4ff8b54d08da0974de1ab82530ae688e' }
};
async function oldModule(pin) {
  const bytes = readFileSync(path.join(FIXTURES, pin.fixture));       // throws when missing: a true failure
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== pin.sha256) throw new Error(`pinned fixture ${pin.fixture} is corrupt: sha256 ${got}, expected ${pin.sha256}`);
  const dir = path.dirname(path.join(root, pin.original));
  const src = bytes.toString('utf8').replace(/(from\s+['"])(\.\.?\/[^'"]+)(['"])/g, (_m, a, rel, c) => a + pathToFileURL(path.resolve(dir, rel)).href + c);
  return import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
}
const OLD = { sender: await oldModule(PINNED.sender), list: await oldModule(PINNED.list) };

// ---------------------------------------------------------------------------------------------------------------- the fake page pieces
function fakeEl(tag, cls, text) {
  const n = { tag, cls, text, children: [], listeners: {}, dataset: {}, classList: { add: noop }, value: '', appendChild(c) { n.children.push(c); return c; }, append(...c) { n.children.push(...c); }, addEventListener(t, f) { n.listeners[t] = f; }, setAttribute: noop, replaceChildren: noop };
  return n;
}
const KIND = (i) => ({ 3: 'unsupported', 7: 'read-only', 5: 'records-write-failed' }[i % 8] || null);   // refusing controllers and the code each must answer

function seed(N) {
  const T = [];
  for (let i = 0; i < N; i++) {
    T.push(thread(`own-${i}`, [msg(`u0-${i}`, 'user', 'first'), msg(`a0-${i}`, 'assistant', 'reply')], { x_future: { keep: [i] } }));
    T.push(thread(`pc-${i}-a`, [], { folderId: `P-${i}` })); T.push(thread(`pc-${i}-b`, [], { folderId: `P-${i}` }));
    if (i % 4 === 0) T.push(thread(`max-${i}`, []));
  }
  for (let k = 0; k < N / 2; k++) T.push(thread(`mv-${k}`, [], { folderId: `F-${k}-a` }));
  T.push(thread('shared', [msg('s1', 'user', 'seed')]));
  T.push(thread('shared2', [{ id: 'a1', role: 'assistant', content: 'two', versions: [{ content: 'one' }, { content: 'two' }, { content: 'three' }], versionIndex: 1, at: 1 }, msg('u1', 'user', 'x')]));
  const ledger = emptyLedger();
  for (let i = 0; i < N; i += 4) ensureEncounter(ledger, `max-${i}`, 0).encounter.seq = Number.MAX_SAFE_INTEGER;
  return { T, ledger };
}

async function openController(i, shared, locks) {
  const kind = i >= 0 ? KIND(i) : null;
  const storage = kind === 'records-write-failed'
    ? { getItem: (k) => shared.getItem(k), removeItem: (k) => shared.removeItem(k), setItem: (k, v) => { if (k === 'plc.encounters.v1') throw new Error('QuotaExceededError (stand-in)'); shared.setItem(k, v); } }
    : shared;
  const c = { i, kind, toasts: [], results: [], log: {}, getThreadCalls: {}, folderWrites: [], folderFail: false, state: { threads: [], currentThreadId: null, generationBusy: false, gen: null } };
  c.enc = createEncounters({ storage, locks: kind === 'unsupported' ? null : locks, watch: ['chatThreads'], threads: () => c.state.threads, normalizeThread: model.normalizeThread, newId: model.newId, now: () => 5000,
    isReadOnly: () => kind === 'read-only', onResult: (r) => c.results.push(r) });
  const raw = shared.getItem('chatThreads');
  c.state.threads = JSON.parse(raw).map((t) => model.normalizeThread(t));
  await c.enc.init(raw);
  const host = { s: c.state, M: () => ({ model }), showToast: (t) => c.toasts.push(t), readJson: () => null, writeJson: () => true, THREAD_KEY: 'chatThreads', ACTIVE_THREAD_KEY: 'plc.activeThread.v1', encounters: c.enc };
  c.ts = createThreadState(host);
  c.thread = (id) => c.state.threads.find((t) => t.id === id);
  return c;
}

// a save that waits at a gate (a save held while the person keeps typing / other writers run), recording what it answered
const tracked = (c, label, hold, entered) => async (ids, what) => {
  if (hold) { entered.n++; await hold.wait; }
  const o = await c.ts.persist(ids, what);
  (c.log[label] ||= []).push(o);
  return o;
};

function composer(impl, c, threadId, text, att, persist, label) {
  const input = { value: text, focus: noop }; const queue = [...att]; const restored = []; let calls = 0;
  const sender = impl.sender({ g: {}, messageInput: input, currentThread: () => c.thread(threadId), currentThreadId: () => threadId, getThread: () => { calls++; return null; }, getChatState: () => ({ ready: true }),
    events: { emit: noop, intercept: async () => false, emitAwait: async () => {} },
    docsUi: { attachments: { count: () => queue.length, take: () => queue.splice(0), restore: (a) => { restored.push(...a); } } },
    M: () => ({ model }), threadTitleInput: { value: '' }, persistThreads: persist, growComposer: noop, persistDraftNow: noop, renderThreadList: noop, messagesView: { renderMessages: noop } });
  return { input, restored, att, calls: () => calls, send: () => sender.handleSendMessage({ preventDefault: noop }), label };
}
function actor(impl, c, threadId, persist) {
  return impl.sender({ g: {}, currentThread: () => c.thread(threadId), currentThreadId: () => threadId, getThread: () => c.thread(threadId), STATUS: () => model.STATUS, M: () => ({ model }), persistThreads: persist, messagesView: { renderMessages: noop }, showToast: noop, events: { emit: noop } });
}
function listFor(impl, c, folders, persist, store) {
  let menu = null, dialog = null;
  const host = { el: fakeEl, events: { on: noop }, readJson: () => folders, writeJson: (_s, _k, v) => { if (store.fail) return false; store.writes.push(clone(v)); return true; }, getThread: (id) => c.thread(id), createThread: noop, selectThread: noop,
    renameThread: noop, exportThreadMarkdown: noop, buildPreloadUrl: noop, saveThreads: async () => true, persistThreads: persist, generateThreadId: () => 'id', threads: () => c.state.threads, currentThreadId: () => null, clearCurrentThread: noop,
    generation: () => null, threadList: fakeEl('ul'), messageInput: {}, createEmoji: () => fakeEl('i'), actionButton: noop, messageDecorators: [], messageActionHandlers: {}, closeThreadMenu: noop, placeMenu: (m) => { menu = m; },
    openThreadMenu: () => null, updateThreadListMinHeight: noop, promptDialog: async () => null, confirmDialog: async () => true, openAppDialog: (d) => { dialog = d; }, copyTextDialog: noop, showToast: (t) => c.toasts.push(t),
    M: () => ({ model, shellRegistry: { groupThreadsByDate: () => [] } }) };
  const ui = impl.list(host);
  return { ui,
    deleteProject: () => { ui.render(); const hd = host.threadList.children.find((x) => x.cls === 'folder-heading'); hd.children[1].listeners.click({ stopPropagation: noop }); const del = menu.children.find((b) => b.children.some((x) => /Delete project/.test(x.text || ''))); del.listeners.click(); },
    move: async (id, to) => { await ui.moveToFolder(id); const sel = dialog.content.children[1]; sel.value = to; await dialog.actions[1].run(); } };
}

// ---------------------------------------------------------------------------------------------------------------- one repeat
async function round(N, impl) {
  const V = [];                                            // every violated invariant, tagged; nothing is thrown mid-way
  const ok = (cond, tag, text) => { if (!cond) V.push(`[${tag}] ${text}`); };
  const { T, ledger } = seed(N);
  const shared = memStorage({ chatThreads: JSON.stringify(T), 'plc.encounters.v1': JSON.stringify(ledger) });
  const locks = fakeLocks();
  const tabs = []; for (let i = 0; i < N; i++) tabs.push(await openController(i, shared, locks));
  // a sibling actor (its own real controller) changes one chat of every conflict-variant project BEFORE the race; the tabs below still hold the older view
  const sib = await openController(-1, shared, locks);
  for (let i = 0; i < N; i++) if (i % 4 === 1) sib.thread(`pc-${i}-b`).folderId = 'zz';
  const pre = await sib.enc.saveThreads(); ok(pre.ok && !pre.conflicts.length, 'setup', 'sibling pre-change was not stored ' + JSON.stringify(pre));

  const entered = { n: 0 }, hold = gate(), lockHold = gate(), EXPECT_HELD = 4 * N;
  const lockHeld = locks.request('plc-encounters', {}, () => lockHold.wait);   // the writer lock is held by someone else while every controller starts its work
  const runs = [];
  const A = tabs.map((c) => {
    const i = c.i, a = {};
    a.s1 = composer(impl, c, `own-${i}`, `msg-${i}`, i % 2 === 0 ? [{ id: `att-${i}`, name: 'f' }] : [], tracked(c, 's1', hold, entered), 's1');
    a.s2 = composer(impl, c, 'shared', `sh-${i}`, [], tracked(c, 's2', null, entered), 's2');
    if (i % 4 === 0) a.s3 = composer(impl, c, `max-${i}`, `mx-${i}`, [], tracked(c, 's3', null, entered), 's3');
    a.s4 = actor(impl, c, 'shared2', tracked(c, 's4', hold, entered)); a.s4action = i % 2 === 0 ? 'prev-version' : 'next-version'; a.s4target = i % 2 === 0 ? 0 : 2;
    a.s5 = actor(impl, c, `own-${i}`, tracked(c, 's5', hold, entered));
    const k = Math.floor(i / 2); a.mvId = `mv-${k}`; a.mvTo = `F-${k}-${i % 2 ? 'c' : 'b'}`;
    a.s6 = listFor(impl, c, [{ id: `F-${k}-a`, name: 'A', instructions: '' }, { id: `F-${k}-b`, name: 'B', instructions: '' }, { id: `F-${k}-c`, name: 'C', instructions: '' }], tracked(c, 's6', hold, entered), { writes: [] });
    a.project = { id: `P-${i}`, name: `Project ${i}`, instructions: `Instructions ${i}`, future: { keep: [i, 'x'] } }; a.projectJson = JSON.stringify(a.project);
    a.store = { fail: i % 4 === 2 && !c.kind, writes: [] };
    let done; a.s7done = new Promise((r) => { done = r; });
    a.s7 = listFor(impl, c, [a.project], async (ids, what) => { try { return await tracked(c, 's7', null, entered)(ids, what); } finally { done(); } }, a.store);
    a.beforeA1 = clone(c.thread('shared2').messages[0]);
    return a;
  });

  // launch everything at once
  tabs.forEach((c, idx) => {
    const a = A[idx], i = c.i;
    runs.push(a.s1.send(), a.s1.send());                                       // the double press
    runs.push(a.s2.send());
    if (a.s3) runs.push((async () => {
      await a.s3.send();
      a.facade = await c.enc.facade.receive({ thread: `max-${i}`, speaker: 'nobody', expression: 'person', modality: 'text', text: 'late', occurrence: { source: 'ui-conc', id: `o-${i}` }, transcript: true });
    })());
    runs.push(a.s4.handleMessageAction(a.s4action, 'a1', null, null));
    runs.push(a.s5.handleMessageAction('toggle-context', `u0-${i}`, null, null));
    runs.push(a.s6.move(a.mvId, a.mvTo));
    a.s7.deleteProject();
    runs.push(Promise.race([a.s7done, settle(5000).then(() => { a.s7never = true; })]));   // the menu action is fire-and-forget: its save is the completion signal (a pre-G action may never save at all)
  });
  const all = Promise.all(runs);
  await within(until(() => entered.n >= EXPECT_HELD, 20000, `${EXPECT_HELD} held saves (have ${entered.n})`), 21000, 'held saves');
  // while every save is held: the person keeps typing, a sibling feature touches fields next to the ones being saved
  tabs.forEach((c, idx) => {
    const a = A[idx], i = c.i, v = i % 4;
    if (v === 1) a.s1.input.value = `msg-${i} and more`; else if (v === 2) a.s1.input.value = `msg-${i}bet`; else if (v === 3) a.s1.input.value = `zzz-${i}`;
    if (c.kind) { c.thread('shared2').messages[0].sib = `s4-${i}`; c.thread(`own-${i}`).messages[0].sib = `s5-${i}`; }
    c.thread(a.mvId).pinned = true;
  });
  lockHold.release(); hold.release();
  await within(all, 60000, `${N} controllers`); await lockHeld; await settle(20);

  // ------------------------------------------------------------------------------------------------ invariants
  const rawT = shared.getItem('chatThreads'), rawL = shared.getItem('plc.encounters.v1');
  let S = null, L = null; try { S = JSON.parse(rawT); L = JSON.parse(rawL); } catch { /* below */ }
  ok(Array.isArray(S) && L && typeof L === 'object', 'corruption', 'chatThreads or the ledger does not parse');
  if (!S || !L) return V;
  const byId = new Map(S.map((t) => [t.id, t]));
  ok(byId.size === S.length, 'corruption', 'duplicate thread ids stored');
  for (const t of T) ok(byId.has(t.id), 'lost', `chat ${t.id} vanished`);
  ok(!L.intent, 'corruption', 'a ledger intent was left behind');
  const count = (t, text) => (t?.messages || []).filter((m) => m.content === text).length;
  const lastOf = (c, label) => (c.log[label] || []).slice(-1)[0];
  const WHY = { unsupported: 'unsupported', 'read-only': 'read-only', 'records-write-failed': 'records-write-failed' };
  // a controller whose records cannot be written may be refused by the coordination first ('stale-view': another tab had just saved, the answer is "try again"): still a refusal that saved nothing, which is what is asserted
  const codeOk = (c, code) => code === WHY[c.kind] || (c.kind === 'records-write-failed' && code === 'stale-view');
  const refusal = (c, o, tag) => { ok(o && !o.saved && codeOk(c, o.code), tag, `${c.kind} controller ${c.i} must be refused with its own code, got ${o && o.code} (saved ${o && o.saved})`); };

  tabs.forEach((c, idx) => {
    const a = A[idx], i = c.i, refused = Boolean(c.kind);
    // --- S1 / S2 sends
    for (const [s, label, tid, text] of [[a.s1, 's1', `own-${i}`, `msg-${i}`], [a.s2, 's2', 'shared', `sh-${i}`]]) {
      const outs = c.log[label] || [], o = outs[0], saved = Boolean(o?.saved);
      ok(outs.length === 1, 'duplicate', `${label} controller ${i}: ${outs.length} saves for one message (double press / retry)`);
      if (refused) refusal(c, o, 'refusal'); else ok(saved, 'lost-ack', `${label} controller ${i}: own send not stored (${o && o.code})`);
      ok(count(byId.get(tid), text) === (saved ? 1 : 0), 'durability', `${label} controller ${i}: stored ${count(byId.get(tid), text)} copies of ${text}, acknowledged=${saved}`);
      ok(count(c.thread(tid), text) === (saved ? 1 : 0), 'duplicate', `${label} controller ${i}: ${count(c.thread(tid), text)} copies in memory, acknowledged=${saved}`);
      ok(s.calls() === (saved ? 1 : 0), 'dispatch', `${label} controller ${i}: ${s.calls()} dispatches, acknowledged=${saved}`);
      const typed = s.label === 's1' ? [text, `${text} and more`, `${text}bet`, `zzz-${i}`][i % 4] : text;
      const want = saved && (s.label === 's2' || i % 4 === 0) ? '' : typed;
      ok(s.input.value === want, 'composer', `${label} controller ${i}: composer ${JSON.stringify(s.input.value)}, want ${JSON.stringify(want)}`);
      ok(s.restored.length === (saved ? 0 : s.att.length) && (saved || JSON.stringify(s.restored) === JSON.stringify(s.att)), 'attachments', `${label} controller ${i}: attachments restored ${s.restored.length}`);
    }
    // --- S3 durable text, refused attribution, refused facade message
    if (a.s3) {
      const o = lastOf(c, 's3');
      ok(o?.saved && o.partial, 'partial', `controller ${i}: stored text at the safe maximum must be saved + partial, got ${JSON.stringify(o && { saved: o.saved, partial: o.partial, code: o.code })}`);
      ok(count(byId.get(`max-${i}`), `mx-${i}`) === 1, 'durability', `controller ${i}: max text stored ${count(byId.get(`max-${i}`), `mx-${i}`)}x`);
      ok(c.toasts.filter((t) => /Saved, but not fully recorded/.test(t)).length === 1 && !c.toasts.some((t) => /was not sent/.test(t)), 'partial', `controller ${i}: partial warning toasts ${JSON.stringify(c.toasts)}`);
      ok(a.s3.input.value === '' && a.s3.restored.length === 0 && a.s3.calls() === 1, 'partial', `controller ${i}: text must be released once and not resent (composer ${JSON.stringify(a.s3.input.value)}, dispatch ${a.s3.calls()})`);
      ok(!Object.values(L.events).some((e) => e.encounter === encounterId(`max-${i}`)), 'partial', `controller ${i}: ledger unexpectedly holds events for the refused attribution`);
      ok(a.facade && a.facade.ok === false, 'facade', `controller ${i}: a refused planned message must answer ok:false, got ${JSON.stringify(a.facade)}`);
      ok((byId.get(`max-${i}`)?.messages || []).length === 1, 'facade', `controller ${i}: the dropped facade message reached the stored transcript`);
      const dropped = c.results.find((r) => (r.refused || []).some((x) => x.dropped && x.thread === `max-${i}`));
      ok(dropped && outcomeOf(dropped, [`max-${i}`]).partial === false && outcomeOf(dropped, [`max-${i}`]).saved, 'facade', `controller ${i}: a planned drop must not count as a durable partial`);
    }
    // --- S4 version selection
    { const o = lastOf(c, 's4'), m = c.thread('shared2').messages[0], saved = Boolean(o?.saved);
      if (refused) { refusal(c, o, 'refusal'); ok(m.versionIndex === 1 && m.content === 'two', 'rollback', `controller ${i}: refused version change not taken back (index ${m.versionIndex})`); ok(m.sib === `s4-${i}`, 'rollback-unrelated', `controller ${i}: the rollback erased a sibling's newer field on the message`); }
      else if (saved) ok(m.versionIndex === a.s4target, 'durability', `controller ${i}: acknowledged version ${a.s4target} but memory has ${m.versionIndex}`);
      else { ok(o?.code === 'conflict', 'conflict', `controller ${i}: a losing version choice must be a per-chat conflict, got ${o && o.code}`); ok(JSON.stringify(m) === JSON.stringify(a.beforeA1), 'rollback', `controller ${i}: the losing version change was not restored exactly`); }
    }
    // --- S5 context toggle (own thread: nobody else writes it)
    { const o = lastOf(c, 's5'), m = c.thread(`own-${i}`).messages[0], st = byId.get(`own-${i}`).messages[0];
      if (refused) { refusal(c, o, 'refusal'); ok(!m.excluded && !st.excluded, 'rollback', `controller ${i}: refused toggle left excluded`); ok(m.sib === `s5-${i}`, 'rollback-unrelated', `controller ${i}: toggle rollback erased a sibling's newer field`); }
      else { ok(o?.saved && m.excluded === true && st.excluded === true, 'lost-ack', `controller ${i}: acknowledged context toggle not stored (${o && o.code}, ${st.excluded})`); }
    }
    ok(JSON.stringify(byId.get(`own-${i}`).x_future) === JSON.stringify({ keep: [i] }), 'unknown-fields', `controller ${i}: an unknown thread field was lost`);
    // --- S7 Delete project
    ok(!a.s7never, 'folder', `controller ${i}: Delete project never saved the chats`);
    { const pa = byId.get(`pc-${i}-a`), pb = byId.get(`pc-${i}-b`), ma = c.thread(`pc-${i}-a`), mb = c.thread(`pc-${i}-b`), folders = a.s7.ui.folders(), P = `P-${i}`;
      const keptReal = () => { ok(folders.length === 1 && folders[0] === a.project && JSON.stringify(a.project) === a.projectJson, 'folder', `controller ${i}: the real project (name, instructions, unknown fields) was not kept as it was`); };
      if (refused) { ok(pa.folderId === P && pb.folderId === (i % 4 === 1 ? 'zz' : P) && ma.folderId === P && mb.folderId === P, 'folder', `controller ${i}: refused delete changed chat refs`); keptReal(); ok(a.store.writes.length === 0, 'folder', `controller ${i}: folder written despite refusal`); refusal(c, lastOf(c, 's7'), 'refusal'); }
      else if (i % 4 === 0) { ok(!pa.folderId && !pb.folderId && !ma.folderId && !mb.folderId, 'folder', `controller ${i}: chat refs not durably removed`); ok(folders.length === 0 && a.store.writes.length === 1 && a.store.writes[0].length === 0, 'folder', `controller ${i}: folder not removed exactly once after the refs`); }
      else if (i % 4 === 1) { ok(!pa.folderId && !ma.folderId && pb.folderId === 'zz' && mb.folderId === P, 'folder', `controller ${i}: per-chat conflict must restore only the conflicting chat (stored b ${pb.folderId}, memory b ${mb.folderId})`); keptReal(); ok(a.store.writes.length === 0, 'folder', `controller ${i}: folder written despite a chat conflict`); ok(c.toasts.some((t) => /project was kept/.test(t)), 'conflict', `controller ${i}: no per-chat conflict notice`); }
      else { ok(!pa.folderId && !pb.folderId && !ma.folderId && !mb.folderId, 'folder', `controller ${i}: durable chat refs must stay removed after a folder failure`); keptReal(); ok(c.toasts.some((t) => /could not be removed/.test(t)), 'partial', `controller ${i}: no honest partial notice`); }
    }
  });
  // --- S6 Move: pairs fight over one chat
  for (let k = 0; k < N / 2; k++) {
    const pair = [tabs[2 * k], tabs[2 * k + 1]], stored = byId.get(`mv-${k}`).folderId;
    const savedOnes = pair.filter((c) => lastOf(c, 's6')?.saved);
    ok(savedOnes.length === 1, 'move', `pair ${k}: exactly one move may be acknowledged, got ${savedOnes.length}`);
    pair.forEach((c) => {
      const a = A[c.i], o = lastOf(c, 's6'), m = c.thread(a.mvId);
      if (o?.saved) ok(stored === a.mvTo && m.folderId === a.mvTo, 'durability', `controller ${c.i}: acknowledged move to ${a.mvTo}, stored ${stored}`);
      else { ok(m.folderId === `F-${k}-a`, 'move-rollback', `controller ${c.i}: refused/conflicting move must restore the exact previous project, memory has ${m.folderId}`); ok(c.kind ? codeOk(c, o?.code) : o?.code === 'conflict', c.kind ? 'refusal' : 'conflict', `controller ${c.i}: move answered ${o && o.code}`); }
      ok(m.pinned === true, 'rollback-unrelated', `controller ${c.i}: move rollback erased the sibling's newer pin`);
    });
  }
  // --- S4 across controllers: one winner target
  const wins = tabs.filter((c) => lastOf(c, 's4')?.saved); const targets = new Set(wins.map((c) => A[c.i].s4target)); const a1 = byId.get('shared2').messages[0];
  ok(wins.length >= 1 && targets.size === 1 && a1.versionIndex === [...targets][0], 'version', `version choices: acknowledged targets ${[...targets]}, stored ${a1.versionIndex}`);
  // the race really collided (a scenario with no conflict would prove nothing about conflicts)
  ok(tabs.some((c) => lastOf(c, 's4')?.code === 'conflict'), 'collision', 'no version choice lost a real compare-and-set');
  ok(tabs.some((c) => lastOf(c, 's6')?.code === 'conflict'), 'collision', 'no move lost a real compare-and-set');
  ok(tabs.some((c) => c.kind) && tabs.some((c) => c.log.s1?.[0]?.saved), 'collision', 'no refusing and no succeeding controller took part');
  return V;
}

// ---------------------------------------------------------------------------------------------------------------- the qualification
const REAL = { sender: realSender, list: realList };
for (const N of [4, 8, 16]) {
  test(`UI concurrency: ${N} real controllers x ${REPEAT} repeats keep every acknowledged write once, refuse honestly and roll back only their own fields`, { timeout: 600000 }, async () => {
    let done = 0;
    for (let r = 0; r < REPEAT; r++) {
      const V = await round(N, REAL);
      assert.deepEqual(V, [], `repeat ${r + 1}/${REPEAT} with ${N} controllers:\n  ` + V.join('\n  '));
      done++;
    }
    assert.equal(done, REPEAT);
    console.log(`# ui-concurrency: ${N} controllers x ${done} repeats, every role (S1-S7) participated in every repeat`);
  });
}

test('negative control: the ACTUAL pre-G sender and conversation list (b070013) violate these invariants in the same scenario', async () => {
  const V = await round(4, { sender: OLD.sender.createSender, list: OLD.list.createConversationList });
  const tags = new Set(V.map((v) => v.match(/^\[([^\]]+)\]/)[1]));
  assert.ok(tags.has('composer'), 'the old prefix-slicing composer must be caught: ' + [...tags]);
  assert.ok(tags.has('folder') || tags.has('move-rollback'), 'the old before-image/fabricated-folder faults must be caught: ' + [...tags]);
  assert.ok(tags.has('rollback') || tags.has('rollback-unrelated'), 'the old missing version/context rollback must be caught: ' + [...tags]);
});
