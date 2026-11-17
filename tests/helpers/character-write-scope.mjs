// Write-scope fixtures for the rich character store's injected `runWriteScope(fn)` capability (T222, chat/characters/character-store.mjs).
//
// Two kinds, and the difference matters:
//
//  1. realKvBackend(): the ACTUAL accepted encrypted same-backend implementation: chat/vault/vault-store.mjs `withWriteMode` / `createWriteMode`, the real engine, real
//     WebCrypto and a custom memory adapter whose append can be HELD, REJECTED, or made to DROP ITS REPLY after the record really became durable. `replay()` reads
//     the STORED log afresh through the same adapter (never a mirror). The supported owned lease is a HARNESS contract (a plain object with supported/owned true); it is not
//     the real global browser authority, which the later shared/host integration owns.
//  2. plainWriteScope(storage): a minimal PROVIDED scope over a localStorage-contract object, for the existing store, bounds, fence, UI-lifecycle and crash tests that exercise
//     other contracts (format, bounds, fences, recovery). It is a CONTRACT-ONLY fixture: no physical stale-cache or mode coverage is claimed from it.
import { webcrypto } from 'node:crypto';
import { createAppStorage, memoryStorage, withWriteMode, readbackState } from '../../chat/vault/vault-store.mjs';
import { createVault } from '../../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../../chat/vault/vault-db.mjs';

export const CHARACTER_KEY = 'plc.characters.v1';

/** A provided plain scope. `cas: false` (the default; crash actors and no-lock controls) writes without comparing the expected raw, so a control that must lose updates still does; `cas: true` compares first. */
export function plainWriteScope(storage, { key = CHARACTER_KEY, cas = false, log = null } = {}) {
  return async function runWriteScope(fn, options = {}) {
    log?.push('scope:enter');
    const mode = {
      async readDurable(keys) { const out = {}; for (const k of [].concat(keys)) out[k] = storage.getItem(k) ?? null; return out; },
      async putKV(k, expectedRaw, nextRaw, { operationId } = {}) {
        if (cas) { const now = storage.getItem(k) ?? null; if (now !== (expectedRaw ?? null)) return { status: 'unknown', key: k, operationId, observed: now, reason: 'target-mismatch' }; }
        try { storage.setItem(k, nextRaw); } catch { return { status: 'not-written', reason: 'write-failed', key: k, operationId, observed: null }; }
        let observed; try { observed = storage.getItem(k) ?? null; } catch { observed = null; }
        if (observed === nextRaw) return { status: 'committed', key: k, operationId, observed };
        // the storage contract itself proves the value is unchanged (a refused or read-only write); anything else is another writer's value: unknown
        if (observed === (expectedRaw ?? null)) return { status: 'not-written', reason: 'refused', key: k, operationId, observed };
        return { status: 'unknown', key: k, operationId, observed };
      },
    };
    try { return await fn(mode); } finally { log?.push('scope:exit'); }
  };
}

/** The actual encrypted same-backend KV with controllable append. */
export async function realKvBackend({ iterations = 1000 } = {}) {
  const adapter = createMemoryAdapter();
  const control = { mode: 'pass', appends: 0, reached: null, release: null, afterAppend: 0, rejectNext: 0, dropNext: 0, holdCrypto: false, cryptoReached: null, cryptoRelease: null };
  const realAppend = adapter.append.bind(adapter);
  const gate = () => { let go; const wait = new Promise((r) => { go = r; }); return { wait, go }; };
  adapter.append = async (record, options) => {
    control.appends += 1;
    if (control.rejectNext > 0) { control.rejectNext -= 1; throw new Error('injected append rejection'); }
    if (control.dropNext > 0) { control.dropNext -= 1; await realAppend(record, options); control.afterAppend += 1; throw new Error('injected: the append happened but its reply was lost'); }
    if (control.mode === 'hold') {
      const g = gate(); control.release = g.go; const reached = control.reached; control.reached = null; reached?.(); await g.wait;
      return realAppend(record, options);
    }
    if (control.mode === 'reject') throw new Error('injected append rejection');
    if (control.mode === 'drop-reply') { await realAppend(record, options); control.afterAppend += 1; throw new Error('injected: the append happened but its reply was lost'); }
    return realAppend(record, options);
  };
  const realLocal = memoryStorage({}); const realSession = memoryStorage({});
  const app = createAppStorage({ realLocal, realSession });
  // The engine's own crypto, with a hold on the REAL subtle.encrypt (so a caller can be lost during real encryption of the append)
  const engineCrypto = { getRandomValues: webcrypto.getRandomValues.bind(webcrypto), subtle: new Proxy(webcrypto.subtle, { get(target, prop) {
    if (prop === 'encrypt') return async (...args) => { if (control.holdCrypto) { control.holdCrypto = false; const reached = control.cryptoReached; control.cryptoReached = null; reached?.(); await new Promise((r) => { control.cryptoRelease = r; }); } return target.encrypt(...args); };
    const v = target[prop]; return typeof v === 'function' ? v.bind(target) : v;
  } }) };
  const vault = createVault({ adapter, crypto: engineCrypto });
  const lease = { supported: true, owned: true, release: async () => false, stopWaiting() {}, waitUntilFree: () => Promise.resolve() };
  let session = await vault.create('pw', { iterations });
  app.attach(session, { writer: true, lease, adapter });
  const scopeLog = [];
  let guard = true;
  const backend = {
    adapter, app, control, scopeLog, lease, get session() { return session; },
    setGuard(v) { guard = v; },
    /** The stored value of the character key, read afresh from the stored log through the same adapter. */
    async replay(key = CHARACTER_KEY) { const s = await readbackState({ adapter, session }); return s.kv.has('l/' + key) ? s.kv.get('l/' + key) : null; },
    /** An independent cold session on the same stored vault: what the next page load would see. */
    async coldRaw(key = CHARACTER_KEY) { const cold = await createVault({ adapter }).unlock('pw'); try { return cold.state.kv.has('l/' + key) ? cold.state.kv.get('l/' + key) : null; } finally { cold.lock(); } },
    // The caller's optional guard is composed INTO the accepted write mode's guard, so it is asked at every await and at the actual append.
    runWriteScope: (fn, options = {}) => { scopeLog.push('scope:enter'); return withWriteMode(app, { feature: 'plc-characters', guard: () => guard && (options.guard === undefined || options.guard() === true) }, async (mode) => { try { return await fn(mode); } finally { scopeLog.push('scope:exit'); } }); },
    /** A reader with the localStorage contract over the live session state (a mirror stand-in for display reads). Writes through it are a test failure. */
    mirrorStorage: { getItem: (k) => { const v = session.state.kv.get('l/' + k); return v === undefined ? null : v; }, setItem() { throw new Error('the store must not write through the mirror'); }, removeItem() { throw new Error('the store must not remove through the mirror'); } },
    /** Reattach a brand new session over the same stored log (a cold reload with the same adapter). */
    async reload() {
      session.lock?.(); session = await createVault({ adapter }).unlock('pw'); app.attach(session, { writer: true, lease, adapter });
    },
  };
  return backend;
}

export const crypto = webcrypto;
