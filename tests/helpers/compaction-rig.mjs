// A scratch rig for the compaction-on-delete tests: real vault engine, real WebCrypto, the memory adapter, the real app storage, a fake clock. Synthetic data only.
import { createVault, fromB64, VaultError } from '../../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../../chat/vault/vault-db.mjs';
import { createAppStorage, memoryStorage, COMPACTION_MARKER } from '../../chat/vault/vault-store.mjs';
import { createCompactionScheduler } from '../../chat/vault/compaction-scheduler.mjs';

export { createMemoryAdapter, memoryStorage, COMPACTION_MARKER, VaultError };
export const PASS = 'synthetic passphrase';
const ITER = 1000;

/** A manual clock: timers fire only when `advance` is called, in time order, and each firing is awaited to the end. */
export function fakeClock() {
  let t = 1_000_000, next = 1; const timers = new Map(); const schedulers = new Set();
  const settle = async () => { for (const s of schedulers) await s.idle(); await Promise.resolve(); };
  return {
    now: () => t,
    timers: { set: (fn, ms) => { const id = next++; timers.set(id, { at: t + ms, fn }); return id; }, clear: (id) => { timers.delete(id); } },
    watch: (s) => schedulers.add(s),
    unwatch: (s) => schedulers.delete(s),
    get pendingTimers() { return timers.size; },
    nextAt: () => Math.min(Infinity, ...[...timers.values()].map((x) => x.at)),
    async advance(ms) {
      const end = t + ms;
      for (;;) {
        const due = [...timers.entries()].filter(([, x]) => x.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        timers.delete(due[0]); t = Math.max(t, due[1].at); due[1].fn(); await settle();
      }
      t = end; await settle();
    }
  };
}

/** The first vault in an adapter, with the given chats. */
export async function seedVault(adapter, chats, extra = {}) {
  const s = await createVault({ adapter }).create(PASS, { iterations: ITER });
  for (const id of chats) await s.putThread(id, chat(id, 'first'));
  await s.setKv('l/chatThreads.order', JSON.stringify(chats));
  for (const [k, v] of Object.entries(extra)) await s.setKv(k, v);
  s.lock();
}
export const chat = (id, text) => ({ id, title: 'chat ' + id, messages: [{ role: 'user', content: 'synthetic ' + id + ' ' + text }] });

/**
 * One browser tab: its own app storage and scheduler over the shared adapter and the shared plain storage (`realLocal`). `open()` unlocks a fresh session and attaches it (a page load or an unlock).
 * Options: writer (false = another tab holds the writer lock), spy (called with every compact() call so tests can count or fail them).
 */
export function createTab({ adapter, realLocal, clock, writer = true, onCompact = null, scheduler: opts = {} }) {
  let events = [];
  const store = createAppStorage({
    realLocal, realSession: memoryStorage(),
    onRemoval: () => sched.removalQueued(), onAttach: () => sched.attached(), onDetach: () => sched.detached(), onWriteError: (e) => { tab.writeErrors.push(e.code || String(e)); }
  });
  const sched = createCompactionScheduler({
    store, timers: clock.timers, now: clock.now, onEvent: (e) => { events.push(e); },
    marker: { read: () => realLocal.getItem(COMPACTION_MARKER), write: (v) => realLocal.setItem(COMPACTION_MARKER, v), clear: () => realLocal.removeItem(COMPACTION_MARKER) }, ...opts
  });
  clock.watch(sched);
  const tab = {
    store, sched, events: () => events, writeErrors: [], session: null,
    async open() {
      const session = await createVault({ adapter }).unlock(PASS);
      if (onCompact) { const real = session.compact; session.compact = (o) => onCompact(real, o, session); }
      tab.session = session; store.attach(session, { writer }); return session;
    },
    lock() { tab.session?.lock(); store.detach(); },
    threads: () => JSON.parse(store.local.getItem('chatThreads') || '[]'),
    setThreads: (list) => store.local.setItem('chatThreads', JSON.stringify(list)),
    async remove(...ids) { tab.setThreads(tab.threads().filter((t) => !ids.includes(t.id))); },
    async settle() { await store.flush(); }
  };
  return tab;
}

const dec = new TextDecoder();
/** What is physically stored: record scopes and, for the vault-key scope, the decoded events (so the test can see a key.put that is still there). */
export async function stored(adapter, session) {
  const { log } = adapter.raw();
  const key = await crypto.subtle.importKey('raw', session.dekBytes(), { name: 'AES-GCM' }, false, ['decrypt']);
  const scopes = log.map((r) => r.keyId), keyPuts = [], keyDestroys = [];
  for (const r of log) {
    if (r.keyId !== 'dek') continue;
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(r.iv), additionalData: new TextEncoder().encode(`plc-vault/1|${r.seq}|dek`) }, key, fromB64(r.data)));
    const event = JSON.parse(dec.decode(plain.subarray(4, 4 + new DataView(plain.buffer, plain.byteOffset).getUint32(0))));
    if (event.t === 'key.put') keyPuts.push(event.id); else if (event.t === 'key.destroy') keyDestroys.push(event.id);
  }
  return { count: log.length, scopes, keyPuts, keyDestroys };
}
/** A fresh unlock of what is stored: its state (the readable truth). */
export async function readable(adapter) { const s = await createVault({ adapter }).unlock(PASS); const out = { state: s.state, damaged: s.damaged, session: s }; return out; }
/** A small deterministic generator (the same seed gives the same interleaving). */
export function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
