// The durable write scope of the rich character store (board task T1290, docs/CHARACTER-STORE.md "The write scope").
//
// chat/characters/character-store.mjs changes nothing unless it is given `runWriteScope(fn, { guard })`: fn(mode) gets mode.readDurable(keys) -> { key: raw|null }
// (a FRESH read of the authoritative stored value) and mode.putKV(key, expectedRaw, nextRaw, { operationId }) -> { status: 'committed' | 'not-written' | 'unknown', observed }.
// This module makes that capability for the page. It is pure: the storage, the vault handle and the vault's write-mode function are injected, and it names no storage key
// (the key is the one the page already passes to the store).
//
//   vault ON  (vault.active)   the encrypted write mode of chat/vault/vault-store.mjs (`withWriteMode`), exactly as the vault reports it: it needs the unlocked session, the exclusive
//                              writer lease and an attached adapter, and refuses a blocked (newer format) or held key and a read-only tab. Those refusals are checked HERE first and thrown
//                              before anything is written (a code the store already reads as "nothing was written": write-refused). The plain path is NEVER used while the vault is on.
//   vault OFF                  a plain compare-and-swap on the page's storage (the browser's own while the vault is off):
//                                readDurable   a fresh storage read (never a copy the page kept)
//                                putKV         compare `expectedRaw` with a fresh read: a different value is not overwritten (`unknown`, with what is there);
//                                              write; read back. `committed` only when the read-back is exactly what was sent; a thrown write (quota) or an unchanged value after
//                                              the write (a refused or read-only storage) is `not-written`; anything else (another writer's value, an unreadable read-back) is `unknown`.
//   Nothing is swallowed into success: an error the scope cannot place is thrown to the store, which reports it as unconfirmed once a write began.
//
// The Web Lock "plc-characters" the store takes around every change is what orders writers across tabs; the compare-and-swap here is the check that a writer that slipped past it
// (a tab without the lock, another feature, a lost lock) is noticed instead of overwritten.

class RefusedBeforeWrite extends Error {
  constructor(code, message) { super(message); this.name = 'RefusedBeforeWrite'; this.code = code; }
}

const askGuard = (guard) => { if (guard === undefined || guard === null) return true; try { return guard() === true; } catch { return false; } };
const norm = (raw) => (raw === undefined ? null : raw);

/**
 * createCharacterWriteScope({ storage, vault, withWriteMode, key, feature? }) -> runWriteScope(fn, { guard })
 *   storage        the page's vault-aware storage: getItem / setItem. Reads and writes go through it only.
 *   vault          the page's vault handle (app): active, readOnly, exclusive, blocked (list of keys), held (list of { key })
 *   withWriteMode  chat/vault/vault-store.mjs withWriteMode(store, { feature, guard }, run)
 *   key            the one storage key of the characters (the page's)
 */
export function createCharacterWriteScope({ storage, vault, withWriteMode, key, feature = 'plc-characters' } = {}) {
  if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new TypeError('A character write scope needs the page storage.');
  if (typeof key !== 'string' || !key) throw new TypeError('A character write scope needs the storage key.');

  // What the vault says about this key, asked fresh each time. Returns the code of the first thing that forbids a write, or null.
  const forbidden = () => {
    if (!vault) return null;
    try {
      if (vault.readOnly) return 'read-only';
      if (Array.isArray(vault.blocked) && vault.blocked.includes(key)) return 'blocked';
      if (Array.isArray(vault.held) && vault.held.some((h) => h && h.key === key)) return 'held';
      if (vault.active && vault.exclusive !== true) return 'no-exclusive';
    } catch { return 'authority'; }
    return null;
  };

  function plainMode(guard) {
    const read = (k) => { const v = storage.getItem(k); return norm(v); };
    return {
      async readDurable(keys) {
        if (!askGuard(guard)) throw new RefusedBeforeWrite('authority', 'Not authorized to read.');
        const out = {};
        for (const k of [].concat(keys)) out[k] = read(String(k));
        return out;
      },
      async putKV(k, expectedRaw, nextRaw, { operationId } = {}) {
        k = String(k);
        const base = { key: k, operationId };
        const why = forbidden();
        if (why) return { status: 'not-written', reason: why, ...base, observed: null };
        if (!askGuard(guard)) return { status: 'not-written', reason: 'authority', ...base, observed: null };
        const expected = norm(expectedRaw);
        let before;
        try { before = read(k); } catch { return { status: 'not-written', reason: 'unreadable', ...base, observed: null }; }
        // Compare first: a value that is not the one this change was computed from is another writer's and is never overwritten.
        if (before !== expected) return { status: 'unknown', reason: 'target-mismatch', ...base, observed: before };
        try { storage.setItem(k, nextRaw); } catch { return { status: 'not-written', reason: 'write-failed', ...base, observed: before }; }
        let observed;
        try { observed = read(k); } catch { return { status: 'unknown', reason: 'readback-failed', ...base, observed: undefined }; }
        if (observed === nextRaw) return { status: 'committed', ...base, observed };
        // The storage itself proves nothing changed (refused, read-only, blocked): not written. Anything else is somebody else's value.
        if (observed === expected) return { status: 'not-written', reason: 'refused', ...base, observed };
        return { status: 'unknown', reason: 'observed-other', ...base, observed };
      },
    };
  }

  return async function runWriteScope(fn, options = {}) {
    if (typeof fn !== 'function') throw new TypeError('runWriteScope needs a function.');
    const { guard } = options;
    if (vault?.active) {
      if (typeof withWriteMode !== 'function') throw new RefusedBeforeWrite('no-store', 'The vault write mode is not available.');
      const why = forbidden();
      if (why) throw new RefusedBeforeWrite(why, 'The vault does not allow this write (' + why + ').');
      // The caller's guard is composed into the vault's own authority check: asked at every await and at the append.
      return withWriteMode(vault, { feature, guard: () => askGuard(guard) }, fn);
    }
    const why = forbidden();
    if (why) throw new RefusedBeforeWrite(why, 'The storage does not allow this write (' + why + ').');
    return fn(plainMode(guard));
  };
}
