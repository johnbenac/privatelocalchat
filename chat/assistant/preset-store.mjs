// The one place the person's own presets (plc.presets.v1) are changed, so an import, a manual save, edit or delete and a backup restore cannot overwrite each other.
//
// The list used to be read once at start and written whole, so a second tab's change was lost the next time this tab saved. Now every change is
//   take the Web Lock "plc-presets" -> read the stored list afresh -> apply a SYNCHRONOUS change -> write -> read back to check -> release.
// The lock is released by the browser if the tab dies in the middle (a closed or crashed tab never leaves it held), and it excludes every other tab of the same browser profile,
// which a dialog open in one tab cannot do.
//
// WITHOUT Web Locks there is NO write. Synchronous script in one window is not an atomic step across windows (another tab can write between this tab's read and its write), so
// a read-change-write there could silently lose a change and this module will not claim otherwise: mutate() answers { ok: false, code: 'unsupported' } and stores nothing; reading
// and using saved presets work as before. (Web Locks are in every browser that can run the app's local models; a copy served without a secure context lacks them.)
//
// A change that cannot be made says so and leaves what was stored exactly as it was: stored text that is not a list is never overwritten, a read-only tab does not write, a refused
// write changes nothing. After a write the key is read back; if what is there is not what was written (somebody outside the lock wrote in between, or the storage lies) the
// outcome is reported as a failure and NOTHING IS PUT BACK: a restore of an earlier copy could erase another writer's newer, successful write.
//
// createPresetStore({ storage, key, locks?, isReadOnly?, lockName?, waitMs? }) -> { read(), ready(), mutate(change) }
//   read()  -> { ok: true, list } | { ok: false, code: 'unreadable' | 'malformed', message }   (nothing stored is an empty list)
//   ready() -> { ok: true, list } | { ok: false, code: 'unreadable' | 'malformed' | 'read-only' | 'unsupported', message }   (can a change be made now: read, and the means to write)
//   change(list) -> { list, result? } to write a new list, or { result } to write nothing. It must not await.
//   mutate -> { ok: true, list, result } | { ok: false, code: 'unsupported' | 'read-only' | 'unreadable' | 'malformed' | 'busy' | 'write-failed' | 'changed', message }

// (The storage key is the owner's, chat/assistant/assistant.mjs, which passes it in: one key has one owner.)

const fail = (code, message) => ({ ok: false, code, message });
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The change for the Edit dialog: set a new prompt on the preset the person was looking at, but only if the stored record is still the one the dialog showed.
 * `expected` is that record ({ id, name, prompt }) as the editor read it. Inside the lock the fresh stored record is compared with it:
 *   gone  -> the preset was removed meanwhile; nothing is written
 *   stale -> its name or instructions were changed meanwhile (another tab's edit or import); nothing is written, `current` is the newer record, and the caller keeps the proposal for a retry
 *   saved -> written
 * Whoever commits first wins; the other editor is told and stores nothing.
 */
export function editPresetChange(expected, prompt) {
  return list => {
    const i = list.findIndex(x => x.id === expected.id);
    if (i < 0) return { result: { status: 'gone' } };
    const stored = list[i];
    if (stored.name !== expected.name || stored.prompt !== expected.prompt) return { result: { status: 'stale', current: stored } };
    list[i] = { ...stored, prompt };
    return { list, result: { status: 'saved' } };
  };
}

export function createPresetStore({ storage, locks = globalThis.navigator?.locks, isReadOnly = () => false, key, lockName = 'plc-presets', waitMs = 10000 } = {}) {
  /** The stored list: [] when nothing is stored; { ok: false } when storage cannot be read or what is stored is not a list (it is then never overwritten). */
  function read() {
    let raw; try { raw = storage.getItem(key); } catch { return fail('unreadable', 'Your saved presets could not be read from this browser’s storage, so they were left alone and nothing can be added now.'); }
    if (raw == null || raw === '') return { ok: true, list: [] };
    try { const list = JSON.parse(raw); if (Array.isArray(list)) return { ok: true, list }; } catch { /* falls through */ }
    return fail('malformed', 'Your saved presets are not in a form this version can read, so they were left exactly as they are and nothing can be added now.');
  }

  const writeBlock = () => {
    if (!locks?.request) return fail('unsupported', 'This browser cannot make preset changes safely when the app is open in more than one tab (it lacks Web Locks), so presets can be used here but not changed. Nothing was changed.');
    if (isReadOnly()) return fail('read-only', 'This app is open in another tab, so changes here are not saved.');
    return null;
  };
  const ready = () => writeBlock() || read();

  function step(change) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const current = read(); if (!current.ok) return current;
    const made = change(current.list.slice()) || {};
    if (!made.list) return { ok: true, list: current.list, result: made.result };
    try { storage.setItem(key, JSON.stringify(made.list)); } catch { return fail('write-failed', 'The preset could not be saved on this device (its storage may be full). Nothing was changed.'); }
    const after = read();
    if (!after.ok || !sameList(after.list, made.list)) return fail('changed', 'The saved presets changed while this was being saved, so the result could not be confirmed. Check your presets and try again.');
    return { ok: true, list: made.list, result: made.result };
  }

  async function mutate(change) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => { if (timer) clearTimeout(timer); return step(change); });
    } catch (error) {
      if (error?.name === 'AbortError') return fail('busy', 'Another tab is changing presets. Try again in a moment.');
      return fail('write-failed', 'The preset could not be saved.');
    } finally { if (timer) clearTimeout(timer); }
  }

  return { read, ready, mutate };
}
