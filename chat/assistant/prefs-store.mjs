// The one place the person's preferences (plc.prefs.v1) are written, so a manual change in Settings or the composer, another tab's change and a backup restore cannot overwrite each other.
//
// The page used to keep one `prefs` object, read once at start, and write the WHOLE object on every change (savePrefs). A second tab's choice was erased the next time this tab saved anything, and
// a backup restore that merged into that stale copy could do the same. Now every write, manual or restore, is
//   take the Web Lock "plc-prefs" -> read the stored preferences afresh -> apply only the FIELDS that change -> write -> read back to check -> release.
// The lock is freed by the browser if the tab dies in the middle, and it excludes every other tab of the same browser profile.
//
// A manual change is a PATCH: `savePrefs()` compares this tab's `live` object with what the tab last sent, and only the fields that differ are written (the other fields of the stored object are
// kept exactly as stored, including ones this build does not know). Each field remembers the value this tab last knew to be stored (`known`). Inside the lock, per field:
//   stored value = the value wanted                      nothing to write (another writer already did it)
//   stored value = what this tab knew                    nobody else touched it: the change is written
//   stored value is neither (changed elsewhere meanwhile) a CONFLICT: the stored value is kept, this tab's live value goes back to it, and onConflict(fields) says so. Whoever committed first wins.
// Changes to different fields from different tabs therefore all survive. Several quick saves in one tab queue in the order they were made (the lock is first-in first-out) and each sees the
// result of the one before, so the last value wins in the order the person made them.
//
// WITHOUT Web Locks, in a tab that holds the storage read-only, or when the lock cannot be had within `waitMs`, NOTHING is written and `live` is put back to the last stored values: there is no
// unlocked fallback (a read-change-write across windows is not atomic, so it could silently lose another tab's change). Stored text that cannot be read as an object is never overwritten.
// After a write the key is read back; if what is there is not what was written the outcome is a failure and NOTHING IS PUT BACK to storage (another writer's newer write must not be erased).
//
// createPrefsStore({ storage, key, live, locks?, isReadOnly?, lockName?, waitMs?, onLiveChanged?(fields), onConflict?(conflicts), onRefused?(outcome) })
//   -> { save(), restore(incomingBackupPrefs) }
//   save()    -> { ok: true, applied: [fields], conflicts: [{ field, kept, wanted }] } | { ok: false, code, message }
//   restore() -> { ok: true, added: [fields], kept: [fields] } | { ok: false, code, message }
//   code: 'unsupported' | 'read-only' | 'busy' | 'unreadable' | 'write-failed' | 'changed'
import { mergeBackupPrefs } from '../transfer/prefs-restore.mjs';

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null); // an absent field and null both mean "not chosen"
const fail = (code, message) => ({ ok: false, code, message });
const MESSAGES = {
  unsupported: 'This browser cannot save settings safely when the app is open in more than one tab (it lacks Web Locks), so the change was not saved.',
  'read-only': 'This app is open in another tab, so changes here are not saved.',
  busy: 'Another tab is saving settings. The change was not saved; try again in a moment.',
  unreadable: 'Your saved settings could not be read in a form this version understands, so they were left exactly as they are and the change was not saved.',
  'write-failed': 'Your settings could not be saved on this device (its storage may be full). Nothing was changed.',
  changed: 'The saved settings changed while this was being saved, so the result could not be confirmed. Check your settings and try again.',
};

export function createPrefsStore({ storage, key, live, locks = globalThis.navigator?.locks, isReadOnly = () => false, lockName = 'plc-prefs', waitMs = 10000, onLiveChanged = () => {}, onConflict = () => {}, onRefused = () => {} }) {
  const known = clone({ ...live });      // the value of each field this tab last knew to be stored
  const submitted = clone({ ...live });  // what this tab has already handed to save() (so a second save sends only what changed since)
  const pending = new Map();             // field -> saves of this tab that have not finished
  const pend = (fields, by) => fields.forEach((f) => pending.set(f, (pending.get(f) || 0) + by));
  const idle = (f) => !pending.get(f);
  const keysOf = (...objects) => [...new Set(objects.flatMap((o) => Object.keys(o)))];

  function readStored() {
    let raw; try { raw = storage.getItem(key); } catch { return fail('unreadable', MESSAGES.unreadable); }
    if (raw == null || raw === '') return { ok: true, stored: {} };
    try { const v = JSON.parse(raw); if (v && typeof v === 'object' && !Array.isArray(v)) return { ok: true, stored: v }; } catch { /* falls through */ }
    return fail('unreadable', MESSAGES.unreadable);
  }
  const block = () => (!locks?.request ? fail('unsupported', MESSAGES.unsupported) : isReadOnly() ? fail('read-only', MESSAGES['read-only']) : null);

  function write(next) {
    const text = JSON.stringify(next);
    try { storage.setItem(key, text); } catch { return fail('write-failed', MESSAGES['write-failed']); }
    let back; try { back = storage.getItem(key); } catch { back = null; }
    let ok = false; try { ok = JSON.stringify(JSON.parse(back)) === JSON.stringify(next); } catch { /* not what was written */ }
    return ok ? { ok: true } : fail('changed', MESSAGES.changed);
  }

  /** This tab's `live` follows what is stored, field by field, except fields it has a save in flight for. */
  function level(next, fields) {
    const changed = [];
    for (const k of new Set([...Object.keys(next), ...fields])) {
      known[k] = clone(next[k]);
      if (!idle(k)) continue;
      submitted[k] = clone(next[k]);
      if (!same(live[k], next[k])) { if (next[k] === undefined) delete live[k]; else live[k] = clone(next[k]); changed.push(k); }
    }
    if (changed.length) { try { onLiveChanged(changed); } catch { /* a listener must not break saving */ } }
  }

  // The tab's own bookkeeping (known, submitted, live) is brought up to date INSIDE the lock, in the same synchronous step as the write: the next queued save then starts from what this one stored.
  function finish(outcome, fields, report) {
    pend(fields, -1);
    if (!outcome.ok) {
      const back = []; // nothing was stored: this tab goes back to what it knew was stored
      for (const k of fields) if (idle(k)) { submitted[k] = clone(known[k]); if (!same(live[k], known[k])) { if (known[k] === undefined) delete live[k]; else live[k] = clone(known[k]); back.push(k); } }
      if (back.length) { try { onLiveChanged(back); } catch { /* ignore */ } }
      if (report) { try { onRefused(outcome); } catch { /* ignore */ } }
      return outcome;
    }
    level(outcome.next, fields);
    if (outcome.conflicts?.length) { try { onConflict(outcome.conflicts); } catch { /* ignore */ } }
    const { next, ...result } = outcome; void next;
    return result;
  }

  async function run(fields, work, { report }) {
    let finished = null; const done = (outcome) => (finished ||= finish(outcome, fields, report));
    const gate = block(); if (gate) return done(gate);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => {
        if (timer) clearTimeout(timer);
        const again = block(); if (again) return done(again);
        const read = readStored(); if (!read.ok) return done(read);
        return done(work(read.stored));
      });
    } catch (error) { return done(error?.name === 'AbortError' ? fail('busy', MESSAGES.busy) : fail('write-failed', MESSAGES['write-failed'])); }
    finally { if (timer) clearTimeout(timer); }
  }

  /** Write this tab's changed fields (what `live` differs from what was last sent), as a patch against what is stored now. */
  function save() {
    const patch = {};
    for (const k of keysOf(live, submitted)) if (!same(live[k], submitted[k])) patch[k] = clone(live[k]);
    const fields = Object.keys(patch);
    if (!fields.length) return Promise.resolve({ ok: true, applied: [], conflicts: [] });
    for (const k of fields) submitted[k] = clone(live[k]);
    pend(fields, 1);
    return run(fields, (stored) => {
      const next = { ...stored }, applied = [], conflicts = [];
      for (const k of fields) {
        if (same(stored[k], patch[k])) continue; // already there
        if (same(stored[k], known[k])) { if (patch[k] === undefined) delete next[k]; else next[k] = patch[k]; applied.push(k); }
        else conflicts.push({ field: k, kept: clone(stored[k]), wanted: patch[k] });
      }
      if (applied.length) { const w = write(next); if (!w.ok) return w; }
      return { ok: true, next, applied, conflicts };
    }, { report: true });
  }

  /** Put a backup's preferences back: what is not chosen here is taken, what is chosen here is kept (chat/transfer/prefs-restore.mjs), against the preferences stored now. */
  function restore(incoming) {
    return run([], (stored) => {
      const { prefs, added, kept } = mergeBackupPrefs(stored, incoming);
      if (added.length) { const w = write(prefs); if (!w.ok) return w; }
      return { ok: true, next: prefs, added, kept };
    }, { report: false });
  }

  return { save, restore };
}
