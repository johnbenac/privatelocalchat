// A faithful in-memory stand-in for navigator.locks shared by several "pages" (the PROVIDED CONTRACT of the module tests; the real browser is tests/helpers/vault-writer-lease-browser.mjs).
// Faithful where the vault lease depends on it: exclusive per name; ifAvailable answers a null lock when taken; a queued request waits (and can be aborted by its signal); a granted request
// settles ONLY when its callback's promise settles (that is how a lock is released); closing a page frees what it held and drops what it queued, without settling its callbacks.
/**
 * An explicit PROVIDED lease contract for tests that attach a session directly (production has no boolean for exclusive authority: only a live, supported, owned handle makes the app exclusive).
 * { supported: false } is the no-Web-Locks claim; { owned: false } a refused one. release() ends it the way a real handle does.
 */
export function providedLease({ supported = true, owned = true, writer = true } = {}) {
  let live = owned, released = null;
  return { writer, supported, get owned() { return live; }, release() { if (released) return released.then(() => false); const was = live; live = false; released = Promise.resolve(was); return released; }, stopWaiting() {}, waitUntilFree: () => new Promise(() => {}) };
}

export function createLockTable() {
  const held = new Map();   // name -> { owner, entry }
  const queue = new Map();  // name -> [entry]
  const log = [];
  const grant = (name) => {
    if (held.has(name)) return;
    const q = queue.get(name) || [];
    const entry = q.shift(); if (!entry) return;
    runGranted(name, entry);
  };
  const runGranted = (name, entry) => {
    held.set(name, { owner: entry.owner, entry }); log.push({ ev: 'grant', name, owner: entry.owner });
    let result; try { result = Promise.resolve(entry.callback({ name })); } catch (e) { result = Promise.reject(e); }
    result.then((v) => { finish(name, entry); entry.resolve(v); }, (e) => { finish(name, entry); entry.reject(e); });
  };
  const finish = (name, entry) => { const h = held.get(name); if (h && h.entry === entry) { held.delete(name); log.push({ ev: 'free', name, owner: entry.owner }); grant(name); } };
  const table = {
    log,
    heldNames: () => [...held.keys()],
    heldBy: (name) => held.get(name)?.owner ?? null,
    queued: (name) => (queue.get(name) || []).length,
    /** The navigator.locks of one page. */
    page(owner) {
      return {
        request(name, options, callback) {
          if (typeof options === 'function') { callback = options; options = {}; }
          return new Promise((resolve, reject) => {
            const entry = { owner, callback, resolve, reject };
            if (options?.ifAvailable) {
              if (held.has(name)) { try { resolve(callback(null)); } catch (e) { reject(e); } return; }
              runGranted(name, entry); return;
            }
            if (options?.signal?.aborted) { reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); return; }
            const q = queue.get(name) || []; queue.set(name, q); q.push(entry);
            options?.signal?.addEventListener?.('abort', () => { const i = q.indexOf(entry); if (i >= 0) { q.splice(i, 1); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); } });
            grant(name);
          });
        }
      };
    },
    /** The page went away (closed, crashed): its held locks are freed, its queued requests dropped. */
    closePage(owner) {
      for (const [name, q] of queue) queue.set(name, q.filter((e) => e.owner !== owner));
      for (const [name, h] of [...held]) if (h.owner === owner) { held.delete(name); log.push({ ev: 'free-closed', name, owner }); grant(name); }
    }
  };
  return table;
}
