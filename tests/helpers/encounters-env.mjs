// Shared test setup for the encounter ledger: a storage, a Web Lock stand-in and "tabs" that run the app's REAL commit and ledger modules against them.
// What is real: chat/encounters/* and chat/threads.mjs (the app's own normaliser). What is stood in for: localStorage (a Map) and Web Locks (an in-process first-come queue).
import { createLedgerStore } from '../../chat/encounters/ledger-store.mjs';
import { createThreadCommit } from '../../chat/encounters/thread-commit.mjs';
import { normalizeThread, makeMessage } from '../../chat/threads.mjs';

export const memStorage = (initial = {}) => {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, _m: m };
};
export const fakeLocks = () => {
  let tail = Promise.resolve();
  return { request: (name, opts, fn) => { if (typeof opts === 'function') fn = opts; const run = tail.then(() => fn({ name })); tail = run.catch(() => {}); return run; } };
};
export const thread = (id, messages = [], extra = {}) => ({ id, title: 'T ' + id, systemPrompt: '', messages, createdAt: 1, updatedAt: 1, ...extra });
export const msg = (id, role, content, extra = {}) => ({ id, role, content, at: 1, ...extra });

/** One tab: loads the stored chats like loadThreads does, saves through the real commit. */
export function openTab({ storage, locks, now = () => 1000, onPhase, isBlocked, tabLocks = locks, storeOptions = {} } = {}) {
  const tab = { threads: [] };
  const store = createLedgerStore({ storage, locks: tabLocks, watch: ['chatThreads'], ...storeOptions });
  const commit = createThreadCommit({ storage, store, locks: tabLocks, normalize: normalizeThread, getThreads: () => tab.threads, now, onPhase, isBlocked });
  tab.store = store; tab.commit = commit;
  tab.load = () => { const raw = storage.getItem('chatThreads'); tab.threads = (raw ? JSON.parse(raw) : []).map((t) => normalizeThread(t)).filter(Boolean); commit.init(); return tab; };
  tab.save = () => commit.request();
  tab.stored = () => JSON.parse(storage.getItem('chatThreads') || '[]');
  tab.ledger = () => JSON.parse(storage.getItem('plc.encounters.v1') || 'null');
  tab.thread = (id) => tab.threads.find((t) => t.id === id);
  return tab.load();
}
export { makeMessage, normalizeThread };
