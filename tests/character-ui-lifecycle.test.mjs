// The lifecycle of the rich-characters UI controller (chat/characters/characters-ui.mjs) against the REAL store, producer validators and Web Crypto, with a small stand-in for the page's
// DOM and dialogs. It exists to reach what the whole app cannot reach from its visible controls (a modal covers the controls that would change the vault while a step is open) and to pin the
// reported defect: a result prepared before the vault was locked, unlocked or turned off, or in another temporary chat, is never drawn, said, called back or committed afterwards.
// The whole-app proof is tests/e2e/character-lifecycle.e2e.mjs (real browser, real encrypted vault). Nothing here claims encrypted-vault behaviour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { createEvents } from '../chat/events.mjs';
import { createMemoryLocks } from '../chat/characters/character-store.mjs';
import { createCharactersUi } from '../chat/characters/characters-ui.mjs';
import { plainWriteScope, realKvBackend } from './helpers/character-write-scope.mjs'; // contract-only provided scope; the encrypted real-KV cases are in character-durable-receipts.test.mjs
import { openAuthored, exportAuthored } from '../vendor/authored-profiles/authored-profiles/index.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const bytesOf = (p) => new Uint8Array(readFileSync(new URL(p, fx)));
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };

// ---- the stand-in page ----
class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.parent = null; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.className = ''; this._text = ''; this.value = ''; this.checked = false; this.disabled = false; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parent = null; this.children = []; this._text = String(v); }
  append(...nodes) { for (const n of nodes) { const node = typeof n === 'string' ? Object.assign(new Node_('#text'), { _text: n }) : n; node.parent = this; this.children.push(node); } }
  appendChild(n) { this.append(n); return n; }
  prepend(n) { n.parent = this; this.children.unshift(n); }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; } }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  async fire(t) { for (const f of this.listeners[t] || []) await f({ target: this }); }
  click() { this.clicked = true; }
  get options() { return this.children.filter((c) => c.tag === 'option'); }
  get selectedOptions() { return this.options.filter((o) => o.value === this.value); }
  all(test) { const out = []; const walk = (n) => { for (const c of n.children) { if (test(c)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { const parts = sel.split(' ').map((s) => s.replace(/^\./, '')); const has = (n, cls) => n.className.split(' ').includes(cls);
    const find = (scope, i) => { for (const c of scope.children) { if (has(c, parts[i])) { if (i === parts.length - 1) return c; const r = find(c, i + 1); if (r) return r; } const r2 = find(c, i); if (r2) return r2; } return null; };
    return find(this, 0); }
}
function installPage() {
  const body = new Node_('body'); const created = [];
  globalThis.document = { body, createElement: (t) => new Node_(t), createTextNode: (t) => Object.assign(new Node_('#text'), { _text: t }) };
  const urls = { made: 0, revoked: 0, live: new Set() };
  const makeUrl = URL.createObjectURL.bind(URL); const revokeUrl = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = (b) => { const u = makeUrl(b); urls.made++; urls.live.add(u); return u; };
  URL.revokeObjectURL = (u) => { urls.revoked++; urls.live.delete(u); revokeUrl(u); };
  const navDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  // the page's Web Locks (a first-in first-out stand-in that really excludes), counting requests so a test waits for "queued behind the lock" as a condition
  const inner = createMemoryLocks(); const lockStat = { requests: 0 };
  Object.defineProperty(globalThis, 'navigator', { value: { locks: { request: (...a) => { lockStat.requests += 1; return inner.request(...a); } } }, configurable: true, writable: true });
  const restore = () => { URL.createObjectURL = makeUrl; URL.revokeObjectURL = revokeUrl; delete globalThis.document; if (navDesc) Object.defineProperty(globalThis, 'navigator', navDesc); else delete globalThis.navigator; };
  void created;
  return { body, urls, lockStat, restore };
}
// Waits are on real conditions (an event the code under test makes true), bounded, and fail loudly with what was awaited: never a sleep standing in for completion.
const until = async (condition, what, ms = 10000) => { const end = Date.now() + ms; while (!condition()) { if (Date.now() > end) throw new Error('timed out waiting for ' + what); await new Promise((r) => setTimeout(r, 1)); } };
const yieldTurns = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };
const el = (tag, cls, text) => { const n = new Node_(tag); if (cls) n.className = cls; if (text !== undefined) n._text = String(text); return n; };

function build({ vaultActive = true, temporary = false, threadId = 't1', backend = null } = {}) {
  const page = installPage();
  const events = createEvents(); const vault = { active: vaultActive, readOnly: false };
  const thread = { id: threadId, temporary };
  const dialogs = []; const alerts = []; const toasts = [];
  const openAppDialog = ({ title, content, actions = [] }) => {
    const root = el('div', 'app-dialog'); const bar = el('div', 'dialog-actions'); root.append(content, bar);
    const handle = { root, title, closed: false, close() { if (handle.closed) return; handle.closed = true; handle.onClose?.(); } };
    const buttons = actions.map((a) => { const b = el('button', a.primary ? 'primary' : '', a.label); b.action = a; bar.append(b); return b; });
    handle.press = async (label) => { const b = buttons.find((x) => x.action.label === label); if (b.action.run) await b.action.run(handle, b); if (b.action.close !== false) handle.close(); };
    handle.pressPrimary = async () => { const b = buttons.find((x) => x.action.primary); if (b.action.run) await b.action.run(handle, b); if (b.action.close !== false) handle.close(); };
    dialogs.push(handle); return handle;
  };
  // a digest the test can hold: it is the REAL digest after release
  // `running` counts real digests in progress (not the held one): the completion condition `settle` waits for. A released digest is counted at the moment of release.
  const held = { armed: false, release: [], waiting: 0, running: 0 };
  const subtle = { digest: async (...a) => {
    if (held.armed) { held.armed = false; held.waiting++; await new Promise((r) => held.release.push(r)); } else held.running++;
    try { return await webcrypto.subtle.digest(...a); } finally { held.running--; }
  } };
  const crypto = { subtle, getRandomValues: (a) => webcrypto.getRandomValues(a), randomUUID: () => webcrypto.randomUUID() };
  const backing = new Map(); const storage = backend
    // the real encrypted KV case: display reads come from the live session state (the supplied display contract); writes only ever go through the injected write scope
    ? { getItem: (k) => backend.app.local.getItem(k) ?? backend.mirrorStorage.getItem(k), setItem() { throw new Error('the controller must not write through the mirror'); }, removeItem() { throw new Error('the controller must not remove through the mirror'); } }
    : { getItem: (k) => (backing.has(k) ? backing.get(k) : null), setItem: (k, v) => { backing.set(k, String(v)); }, removeItem: (k) => { backing.delete(k); } };
  const ui = createCharactersUi({ el, openAppDialog, showToast: (t) => toasts.push(t), events, storage, runWriteScope: backend ? backend.runWriteScope : plainWriteScope(storage), vault, crypto, currentThread: () => thread, alert: async (t, m) => { alerts.push({ t, m }); }, confirm: async () => true, location: { hash: '' } });
  const lock = (info) => { vault.active = false; events.emit('vault:locked', info); };
  const unlock = () => { vault.active = true; events.emit('vault:unlocked', {}); };
  const pick = async (text, size = text.length) => { const input = page.body.all((n) => n.tag === 'input' && n.attrs['aria-label'] === 'Character package file').at(-1); input.files = [{ size, text: async () => text }]; await input.fire('change'); return input; };
  // settle: an armed hold has been reached, no real digest is still running, and the turns that continue after one have run. Operations the test started are also awaited by the test itself.
  const settle = async () => { await until(() => !held.armed, 'the armed digest hold to be reached'); await until(() => held.running === 0, 'every real digest to finish'); await yieldTurns(); };
  const holdLock = async () => {
    let releaseLock; let entered = false;
    const done = navigator.locks.request('plc-characters', {}, async () => { entered = true; await new Promise((r) => { releaseLock = r; }); });
    await until(() => entered, 'the characters lock to be held');
    return { release: () => releaseLock(), done };
  };
  const queuedAfter = (before) => until(() => page.lockStat.requests > before, 'the operation to be queued behind the lock');
  return { page, events, vault, thread, dialogs, alerts, toasts, ui, held, backing, lock, unlock, pick, settle, holdLock, queuedAfter, release: () => { held.running += held.release.length; for (const r of held.release.splice(0)) r(); }, open: () => dialogs.filter((d) => !d.closed), stored: () => backing.get('plc.characters.v1') ?? null, setThread: (t) => { Object.assign(thread, t); events.emit('thread:selected', thread); } };
}

test('a package still validating when the vault is locked is never reviewed, even after an unlock (the reported defect)', async () => {
  const c = build();
  try {
    c.ui.chooseFile(); c.held.armed = true;
    const answered = c.pick(bundle('neri')); await c.settle();
    assert.equal(c.held.waiting, 1, 'the real digest is held');
    c.lock(); // vault:locked while validation waits
    c.release(); await answered; await c.settle();
    assert.equal(c.dialogs.length, 0, 'no review dialog was opened after the lock');
    c.unlock(); await c.settle();
    assert.equal(c.dialogs.length, 0, 'and none appears after the unlock');
    assert.equal(c.alerts.length, 0); assert.equal(c.stored(), null);
  } finally { c.page.restore(); }
});

test('the same holds when the vault is locked and unlocked (or turned off and on) before the held digest finishes', async () => {
  for (const info of [{}, { off: true }]) {
    const c = build();
    try {
      c.ui.chooseFile(); c.held.armed = true; const answered = c.pick(bundle('minimal')); await c.settle();
      c.lock(info); c.unlock(); c.release(); await answered; await c.settle();
      assert.equal(c.dialogs.length, 0, 'epoch moved twice: still nothing drawn (' + JSON.stringify(info) + ')');
    } finally { c.page.restore(); }
  }
});

test('control: without a lifecycle change the same held import opens its review', async () => {
  const c = build();
  try {
    c.ui.chooseFile(); c.held.armed = true; const answered = c.pick(bundle('minimal')); await c.settle();
    c.release(); await answered; await c.settle();
    assert.equal(c.open().length, 1); assert.equal(c.open()[0].title, 'Review character');
  } finally { c.page.restore(); }
});

test('a failed validation that finishes after a lock says nothing (no alert is drawn)', async () => {
  const c = build();
  try {
    const bad = JSON.parse(bundle('neri')); bad.root = bad.root.slice(0, -1) + (bad.root.endsWith('0') ? '1' : '0'); // refused only after the real digest
    c.ui.chooseFile(); c.held.armed = true; const answered = c.pick(JSON.stringify(bad)); await c.settle();
    assert.equal(c.held.waiting, 1, 'the digest is held');
    c.lock(); c.release(); await answered; await c.settle();
    assert.equal(c.alerts.length, 0); assert.equal(c.dialogs.length, 0);
  } finally { c.page.restore(); }
});

test('a review that is open is closed by the lock and its preview addresses are revoked; a late Save is refused and writes nothing', async () => {
  const c = build();
  try {
    c.ui.chooseFile(); await c.pick(bundle('neri')); await c.settle();
    const review = c.open()[0]; assert.equal(review.title, 'Review character');
    assert.ok(c.page.urls.made >= 1 && c.page.urls.live.size >= 1, 'the picture preview made an address');
    c.lock();
    assert.equal(review.closed, true); assert.equal(c.page.urls.live.size, 0, 'every address revoked');
    c.unlock();
    await review.pressPrimary().catch(() => {}); await c.settle(); // a stale press after unlock
    assert.equal(c.stored(), null, 'nothing was written by the stale view');
    assert.equal(c.toasts.length, 0);
  } finally { c.page.restore(); }
});

test('Save held in validation when the vault is locked: no toast, no write, no follow-up, even after unlock', async () => {
  const c = build();
  try {
    c.ui.chooseFile(); await c.pick(bundle('minimal')); await c.settle();
    const review = c.open()[0]; c.held.armed = true;
    const pressing = review.pressPrimary(); await c.settle(); assert.equal(c.held.waiting, 1, 'prepare is held');
    c.lock(); c.unlock(); c.release(); await pressing; await c.settle();
    assert.equal(c.stored(), null, 'nothing reached storage'); assert.equal(c.toasts.length, 0, 'no success message');
  } finally { c.page.restore(); }
});

test('Details reopening a saved character when the vault is locked draws nothing', async () => {
  const c = build({ vaultActive: false });
  try {
    c.ui.chooseFile(); await c.pick(bundle('neri')); await c.settle(); await c.open()[0].pressPrimary(); await c.settle();
    assert.equal(JSON.parse(c.stored()).records.length, 1);
    c.ui.openLibrary(); const list = c.open().at(-1); const detailsBtn = list.root.all((n) => n.tag === 'button' && n.textContent === 'Details')[0];
    // The click handler returns the operation's own promise: the controls wait for ITS completion, not for a delay.
    const control = c.dialogs.length; await detailsBtn.listeners.click[0]();
    assert.equal(c.dialogs.length, control + 1, 'control: Details opens when nothing changes ' + JSON.stringify(c.alerts)); c.dialogs.at(-1).close();
    c.held.armed = true; const reopening = detailsBtn.listeners.click[0](); await c.settle(); assert.equal(c.held.waiting, 1, 'reopening is held');
    const before = c.dialogs.length; c.vault.active = true; c.events.emit('vault:unlocked', {}); c.lock(); c.unlock(); c.release();
    await reopening; // the held operation has now really finished (its post-release frames included): nothing it does can come after the assertions below
    await c.settle();
    assert.equal(c.dialogs.length, before, 'no details dialog was added'); assert.equal(c.alerts.length, 0, 'and nothing was said');
  } finally { c.page.restore(); }
});

test('the package-files step is a tracked private view: a lock closes it and a late file-picker answer is ignored', async () => {
  const opened = await openAuthored(bundle('neri'), { crypto: webcrypto });
  const text = JSON.stringify(await exportAuthored(opened.document, opened.registry, { selection: opened.selection, visibility: opened.visibility, audience: opened.audience, byteMode: 'external', readAsset: async (h) => (async function* () { yield opened.inlineBytes.get(h); })(), hasherFactory, crypto: webcrypto }));
  const files = [{ name: 'tide-card.txt', size: 86, arrayBuffer: async () => bytesOf('resources/tide-card.txt').buffer.slice(0) }, { name: 'chart.png', size: 76, arrayBuffer: async () => bytesOf('resources/chart.png').buffer.slice(0) }];
  const picker = (c) => c.page.body.all((n) => n.tag === 'input' && n.attrs['aria-label'] === 'Resource files').at(-1);
  // a. the lock closes the step; the picker the step made is removed; a late answer reaches nothing
  { const c = build({ vaultActive: false }); try {
    c.ui.chooseFile(); await c.pick(text); await c.settle();
    const step = c.open()[0]; assert.equal(step.title, 'Choose the package’s files');
    await step.press('Choose files…'); const input = picker(c); assert.ok(input);
    c.vault.active = true; c.events.emit('vault:unlocked', {}); // epoch moves: the step is closed by the lifecycle
    assert.equal(step.closed, true, 'the step was closed by the lifecycle');
    assert.equal(input.parent, null, 'the picker was removed');
    input.files = files; await input.fire('change'); await c.settle();
    assert.equal(c.dialogs.length, 1, 'a late answer opened nothing');
  } finally { c.page.restore(); } }
  // b. Cancel, then a late answer
  { const c = build({ vaultActive: false }); try {
    c.ui.chooseFile(); await c.pick(text); await c.settle();
    const step = c.open()[0]; await step.press('Choose files…'); const input = picker(c);
    await step.press('Cancel'); input.files = files; await input.fire('change'); await c.settle();
    assert.equal(c.dialogs.length, 1, 'files chosen after Cancel opened nothing');
  } finally { c.page.restore(); } }
  // c. an answer while the matching is held (real digests) and the vault changes: no review
  { const c = build({ vaultActive: false }); try {
    c.ui.chooseFile(); await c.pick(text); await c.settle();
    const step = c.open()[0]; await step.press('Choose files…'); const input = picker(c);
    c.held.armed = true; input.files = files; const answering = input.fire('change'); await c.settle();
    assert.equal(c.held.waiting, 1, 'matching by real hash is held');
    c.vault.active = true; c.events.emit('vault:unlocked', {}); c.release(); await answering; await c.settle();
    assert.equal(c.dialogs.length, 1, 'no review opened from files matched before the change');
  } finally { c.page.restore(); } }
  // d. control: an answer with no change opens the review
  { const c = build({ vaultActive: false }); try {
    c.ui.chooseFile(); await c.pick(text); await c.settle();
    const step = c.open()[0]; await step.press('Choose files…'); const input = picker(c);
    input.files = files; await input.fire('change'); await c.settle();
    assert.ok(c.dialogs.some((d) => d.title === 'Review character'), 'control: the review opens');
  } finally { c.page.restore(); } }
});

test('temporary chats: a result begun in temporary chat A never lands in the normal chat or in temporary chat B, and the epoch ends the memory store', async () => {
  const c = build({ vaultActive: false, temporary: true, threadId: 'tempA' });
  try {
    c.ui.chooseFile(); c.held.armed = true; const answered = c.pick(bundle('minimal')); await c.settle();
    c.setThread({ temporary: false, id: 'normal1' }); // tempA -> normal while the digest is held
    c.release(); await answered; await c.settle();
    assert.equal(c.dialogs.length, 0, 'tempA -> normal: nothing opened');
    c.ui.chooseFile(); c.setThread({ temporary: true, id: 'tempB' }); // tempB is a different session
    const store = c.ui.temporaryStore; assert.equal(store, null, 'the A store is gone when leaving it');
    // a store made for a temporary chat ends when the vault epoch moves, though the chat id is unchanged
    c.ui.chooseFile(); await c.pick(bundle('minimal')); await c.settle();
    const review = c.open().at(-1); const tempStore = c.ui.temporaryStore; assert.ok(tempStore, 'tempB has its memory store');
    assert.equal(tempStore.read().ok, true);
    c.events.emit('vault:unlocked', {}); c.vault.active = true;
    assert.equal(tempStore.read().code, 'scope-changed', 'the old temporary store is ended by the epoch, not only by the chat id');
    assert.equal(review.closed, true); assert.equal(c.ui.temporaryStore, null);
    assert.equal(c.stored(), null, 'nothing was persisted');
  } finally { c.page.restore(); }
});

test('a persistent import begun in a normal chat is dropped when the person moves to a temporary chat meanwhile', async () => {
  const c = build({ vaultActive: false });
  try {
    c.ui.chooseFile(); c.held.armed = true; const answered = c.pick(bundle('minimal')); await c.settle();
    c.setThread({ temporary: true, id: 'tempX' }); c.release(); await answered; await c.settle();
    assert.equal(c.dialogs.length, 0);
  } finally { c.page.restore(); }
});

// ---- the initiating session is fenced INSIDE the writer lock (reported defect: a Save that began in the normal chat wrote a persistent character after the person moved into a temporary chat) ----
// COMPONENT scope: the real controller, store, producer validators and Web Crypto with the stand-in page above; the whole-page transitions are tests/e2e/character-lifecycle.e2e.mjs.
const MOVES = [
  ['into a temporary chat', (c) => c.setThread({ temporary: true, id: 'tempZ' }), false],
  ['into a temporary chat and back (leave and return)', (c) => { c.setThread({ temporary: true, id: 'tempZ' }); c.setThread({ temporary: false, id: 't1' }); }, false],
  ['vault locked and unlocked', (c) => { c.lock(); c.unlock(); }, false],
  ['no change (control: the intended write happens)', () => {}, true],
];
const countOf = (c) => (c.stored() === null ? 0 : JSON.parse(c.stored()).records.length);
async function withSavedOne(body) {
  const c = build({ vaultActive: false });
  try { c.ui.chooseFile(); await c.pick(bundle('minimal')); await c.open()[0].pressPrimary(); assert.equal(countOf(c), 1); c.toasts.length = 0; await body(c); } finally { c.page.restore(); }
}
const buttonOf = (dialog, label) => dialog.root.all((n) => n.tag === 'button' && n.textContent === label)[0];

test('Save held in validation: a session change before it finishes writes nothing; the unchanged control saves', async () => {
  for (const [label, move, writes] of MOVES) {
    const c = build({ vaultActive: false });
    try {
      c.ui.chooseFile(); await c.pick(bundle('minimal')); const review = c.open()[0];
      c.held.armed = true; const pressing = review.pressPrimary(); await c.settle(); assert.equal(c.held.waiting, 1, 'prepare is held (' + label + ')');
      move(c); c.release(); await pressing; await c.settle();
      assert.equal(countOf(c), writes ? 1 : 0, label); assert.equal(c.toasts.some((t) => /saved/.test(t)), writes, 'success message only when saved: ' + label);
    } finally { c.page.restore(); }
  }
});

test('Save queued behind another writer: a session change while it waits for the lock writes nothing; the unchanged control saves after the release', async () => {
  for (const [label, move, writes] of MOVES) {
    const c = build({ vaultActive: false });
    try {
      c.ui.chooseFile(); await c.pick(bundle('minimal')); const review = c.open()[0];
      const held = await c.holdLock(); const before = c.page.lockStat.requests;
      const pressing = review.pressPrimary(); await c.queuedAfter(before); // really queued at the lock, validation done
      assert.equal(c.stored(), null);
      move(c); held.release(); await held.done; await pressing; await c.settle();
      assert.equal(countOf(c), writes ? 1 : 0, label); assert.equal(c.toasts.some((t) => /saved/.test(t)), writes, label);
    } finally { c.page.restore(); }
  }
});

test('Make a copy: held in validation or queued at the lock, a session change adds nothing; the unchanged control adds one', async () => {
  for (const mode of ['validation', 'lock']) for (const [label, move, writes] of MOVES) {
    await withSavedOne(async (c) => {
      c.vault.active = true; c.events.emit('vault:unlocked', {}); // an ordinary state change before the library is opened
      c.ui.openLibrary(); const list = c.open().at(-1); const copy = buttonOf(list, 'Make a copy');
      let held = null; let copying;
      if (mode === 'validation') { c.held.armed = true; copying = copy.listeners.click[0](); await c.settle(); assert.equal(c.held.waiting, 1, 'the copy is held'); }
      else { held = await c.holdLock(); const before = c.page.lockStat.requests; copying = copy.listeners.click[0](); await c.queuedAfter(before); }
      move(c); if (held) { held.release(); await held.done; } else c.release();
      await copying; await c.settle();
      assert.equal(countOf(c), writes ? 2 : 1, mode + ': ' + label);
    });
  }
});

test('Remove confirmed and queued behind another writer: a session or vault change while it waits writes nothing; the unchanged control removes', async () => {
  for (const [label, move, writes] of MOVES) {
    await withSavedOne(async (c) => {
      c.vault.active = true; c.events.emit('vault:unlocked', {});
      c.ui.openLibrary(); const list = c.open().at(-1); const remove = buttonOf(list, 'Remove');
      const held = await c.holdLock(); const before = c.page.lockStat.requests;
      const removing = remove.listeners.click[0](); await c.queuedAfter(before); // confirmed, and the store's request is queued
      const stored = c.stored();
      move(c); held.release(); await held.done; await removing; await c.settle();
      if (writes) assert.equal(countOf(c), 0, 'control: removed after the release'); else assert.equal(c.stored(), stored, label + ': the stored text is byte-for-byte unchanged');
    });
  }
});

test('the exact reported order: Review, Save prepare held on the real digest, temporary session, release persists nothing', async () => {
  const c = build({ vaultActive: false });
  try {
    c.ui.chooseFile(); await c.pick(bundle('minimal')); const review = c.open()[0];
    c.held.armed = true; const pressing = review.pressPrimary(); await c.settle();
    c.setThread({ temporary: true, id: 'tempZ' }); c.release(); await pressing; await c.settle();
    assert.equal(c.stored(), null, 'no persistent character data');
    assert.equal(c.alerts.length, 0); assert.equal(c.toasts.length, 0);
  } finally { c.page.restore(); }
});

// ---- durable receipts through the actual controller (DOM stand-in, actual encrypted KV backend; no host or browser claim) ----
test('Review Save whose reply is lost: nothing is called saved, and Try again reconciles the SAME admission (one character)', async () => {
  const backend = await realKvBackend(); const c = build({ backend });
  try {
    c.ui.chooseFile(); await c.pick(bundle('minimal')); await c.settle();
    const review = c.open()[0]; const status = () => review.root.querySelector('.char-status').textContent;
    backend.control.dropNext = 1;
    await review.pressPrimary(); await c.settle();
    assert.equal(review.closed, false, 'the proposal stays open'); assert.equal(c.toasts.length, 0, 'no saved toast');
    assert.match(status(), /could not be confirmed/); assert.doesNotMatch(status(), /Nothing was changed/);
    const once = JSON.parse(await backend.replay()); assert.equal(once.records.length, 1, 'the append really became durable');
    const button = review.root.all((n) => n.tag === 'button' && n.action?.primary)[0]; assert.equal(button.textContent, 'Try the same save again');
    await backend.reload(); // the session that lost the reply is re-opened (cold)
    await review.pressPrimary(); await c.settle();
    assert.equal(review.closed, true); assert.equal(c.toasts.length, 1); assert.match(c.toasts[0], /saved/);
    const after = JSON.parse(await backend.replay());
    assert.equal(after.records.length, 1, 'still ONE character: the retry did not prepare a new admission'); assert.deepEqual(after.records[0].admissions, once.records[0].admissions); assert.equal(after.revision, 1);
    assert.equal(after.records[0].individualId, once.records[0].individualId);
  } finally { c.page.restore(); }
});

test('Make a copy whose reply is lost: the second click reconciles the SAME copy (one added character)', async () => {
  const backend = await realKvBackend(); const c = build({ backend });
  try {
    c.ui.chooseFile(); await c.pick(bundle('minimal')); await c.settle(); await c.open()[0].pressPrimary(); await c.settle();
    assert.equal(JSON.parse(await backend.replay()).records.length, 1);
    c.ui.openLibrary(); const list = c.open().at(-1); const copyButton = () => list.root.all((n) => n.tag === 'button' && n.textContent === 'Make a copy')[0];
    backend.control.dropNext = 1;
    await copyButton().listeners.click[0](); await c.settle();
    const say = () => list.root.querySelector('.char-status')?.textContent ?? '';
    assert.match(say(), /could not be confirmed/); assert.doesNotMatch(say(), /Copied/);
    assert.equal(JSON.parse(await backend.replay()).records.length, 2, 'the copy became durable');
    await backend.reload();
    await copyButton().listeners.click[0](); await c.settle();
    assert.match(say(), /Copied/);
    const after = JSON.parse(await backend.replay()); assert.equal(after.records.length, 2, 'the retry added nothing: same copy identity'); assert.equal(new Set(after.records.map((r) => r.individualId)).size, 2);
  } finally { c.page.restore(); }
});

test('a controller built WITHOUT a durable capability (the contract, not the page: see the wiring test below) says saving is unavailable, writes nothing, and import preview still works', async () => {
  const page = installPage(); // the page stand-in with NO host.runWriteScope
  try {
    const events = createEvents(); const dialogs = []; const toasts = []; const backing = new Map();
    const storage = { getItem: (k) => (backing.has(k) ? backing.get(k) : null), setItem: (k, v) => { backing.set(k, String(v)); }, removeItem: (k) => { backing.delete(k); } };
    const openAppDialog = ({ title, content, actions = [] }) => { const root = el('div', 'app-dialog'); const bar = el('div', 'dialog-actions'); root.append(content, bar); const handle = { root, title, closed: false, close() { if (handle.closed) return; handle.closed = true; handle.onClose?.(); } }; for (const a of actions) { const b = el('button', a.primary ? 'primary' : '', a.label); b.action = a; bar.append(b); } handle.pressPrimary = async () => { const b = bar.children.find((x) => x.action.primary); await b.action.run?.(handle, b); }; dialogs.push(handle); return handle; };
    const ui = createCharactersUi({ el, openAppDialog, showToast: (t) => toasts.push(t), events, storage, vault: { active: true, readOnly: false }, crypto: webcrypto, currentThread: () => ({ id: 't1', temporary: false }), alert: async () => {}, confirm: async () => true, location: { hash: '' } });
    ui.chooseFile();
    const input = page.body.all((n) => n.tag === 'input' && n.attrs['aria-label'] === 'Character package file').at(-1); input.files = [{ size: bundle('minimal').length, text: async () => bundle('minimal') }]; await input.fire('change'); await yieldTurns(10);
    const review = dialogs.at(-1); assert.equal(review.title, 'Review character', 'preview still opens');
    assert.match(review.root.querySelector('.char-status').textContent, /not available here yet/);
    await review.pressPrimary(); await yieldTurns(5);
    assert.equal(backing.size, 0, 'nothing written'); assert.equal(toasts.length, 0);
  } finally { page.restore(); }
});

test('the shipped page gives the controller a real durable write scope (T1290): it is imported, built from appLocal and the vault, and passed as runWriteScope', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /import\(modulesAt \+ 'chat\/characters\/write-scope\.mjs'\)/, 'the module is loaded by the page');
  assert.match(html, /createCharacterWriteScope\(\{ storage: appLocal, vault: vaultApp, withWriteMode: vaultWriteMode, key: CHARACTERS_KEY \}\)/, 'built from the page storage and the vault');
  const call = html.match(/createCharactersUi\(\{[^\n]*\}\);/)?.[0] ?? '';
  assert.match(call, /runWriteScope: characterWriteScope/, 'passed to the controller');
  assert.match(call, /storage: appLocal/, 'the same page storage');
});
