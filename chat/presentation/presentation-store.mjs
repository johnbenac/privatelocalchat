// The one place the kept character looks are changed (board T706, docs/PRESENTATION-CHOICE-PLAN.md). The store is a map: preset id -> record (chat/presentation/record.mjs).
// It is built like the preset store (chat/assistant/preset-store.mjs) and keeps its promises:
//
//   every change = take the Web Lock "plc-presentations" -> read the stored map afresh -> apply a SYNCHRONOUS change -> write -> read back to check -> release.
//   The browser frees the lock if a tab dies in the middle; the lock excludes every other tab of the profile. WITHOUT Web Locks there is NO write (answer 'unsupported').
//   A refused or unconfirmed write is reported and NOTHING IS PUT BACK, so a newer successful write by someone else is never erased by an old copy.
//
// What is different from the presets: the map keeps EVERY entry it holds, value for value as JSON, unless a change names that preset. An entry this version cannot read (damaged, or written by a
// newer version) is carried through every write untouched, never dropped, never rewritten, and never overwritten by a keep (a newer one) -- "newer data is left alone"
// (docs/DATA-COMPATIBILITY.md). A look is attached to a preset id, so a change names only ids of the safe form below (never "__proto__" or a path).
//
// createPresentationStore({ storage, key, locks?, isReadOnly?, lockName?, waitMs? }) -> { read(), ready(), mutate(change) }
//   read()  -> { ok: true, map } | { ok: false, code: 'unreadable' | 'malformed', message }     (nothing stored is an empty map)
//   change(map) -> { map, result? } to write, or { result } to write nothing; it must not await and must not change the entries it was given.
//   mutate -> { ok: true, map, result } | { ok: false, code: 'unsupported' | 'read-only' | 'unreadable' | 'malformed' | 'busy' | 'write-failed' | 'changed', message }
// (The storage key belongs to the owner that passes it in: one key has one owner.)
import { checkRecord, withChoice } from "./record.mjs";

/** How many looks are kept. Each is at most about 350 KB (T415's inline picture caps), and the browser's storage is shared with the chats. */
export const MAX_KEPT = 8;
export const PRESET_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const fail = (code, message) => ({ ok: false, code, message });
const has = (map, id) => Object.prototype.hasOwnProperty.call(map, id);
const sameMap = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The look kept for a preset id, or undefined. Own properties only: `map["constructor"]` on a plain object is an inherited function, never a kept look. Use this, not `map[id]`. */
export const lookup = (map, id) => (map && typeof id === "string" && has(map, id) ? map[id] : undefined);

// ---- changes: each returns what the store should write and a result the caller can show ---------------------------------------------------------------
/** Keep a look for a preset: a new one (while fewer than `max` are kept), or replace one that is whole or damaged. Never replaces one a NEWER version wrote. */
export const keepChange = (presetId, record, max = MAX_KEPT) => (map) => {
  if (typeof presetId !== "string" || !PRESET_ID.test(presetId)) return { result: { status: "bad-id" } };
  const made = checkRecord(record); if (!made.ok) return { result: { status: "invalid", reason: made.reason } };
  if (has(map, presetId)) { if (checkRecord(map[presetId]).reason === "newer") return { result: { status: "newer" } }; }
  else if (Object.keys(map).length >= max) return { result: { status: "full", max } };
  map[presetId] = JSON.parse(JSON.stringify(made.record));
  return { map, result: { status: "saved" } };
};
/** Change one choice of a kept look ({ enabled } or { off: { part: boolean } }), applied to what is stored now, so two people turning different parts off both stay. */
export const choiceChange = (presetId, choice) => (map) => {
  if (typeof presetId !== "string" || !PRESET_ID.test(presetId)) return { result: { status: "bad-id" } };
  if (!has(map, presetId)) return { result: { status: "gone" } };
  const stored = checkRecord(map[presetId]);
  if (!stored.ok) return { result: { status: stored.reason === "newer" ? "newer" : "damaged" } };
  const next = withChoice(stored.record, choice);
  if (!next.ok) return { result: { status: "invalid", reason: next.reason } };
  map[presetId] = JSON.parse(JSON.stringify(next.record));
  return { map, result: { status: "saved" } };
};
/** Remove a kept look (a damaged one too; one a newer version wrote is left alone). Removing what is not there is not an error. */
export const removeChange = (presetId) => (map) => {
  if (typeof presetId !== "string" || !PRESET_ID.test(presetId)) return { result: { status: "bad-id" } };
  if (!has(map, presetId)) return { result: { status: "gone" } };
  if (checkRecord(map[presetId]).reason === "newer") return { result: { status: "newer" } };
  delete map[presetId];
  return { map, result: { status: "removed" } };
};
/** Remove the looks of presets that no longer exist ({ ids: the ids of the presets that do }). A newer version's entry is kept even then. */
export const pruneChange = (ids) => (map) => {
  const live = new Set(ids); const removed = [];
  for (const id of Object.keys(map)) if (!live.has(id) && checkRecord(map[id]).reason !== "newer") { delete map[id]; removed.push(id); }
  return removed.length ? { map, result: { status: "pruned", removed } } : { result: { status: "none" } };
};

export function createPresentationStore({ storage, locks = globalThis.navigator?.locks, isReadOnly = () => false, key, lockName = "plc-presentations", waitMs = 10000 } = {}) {
  function read() {
    let raw; try { raw = storage.getItem(key); } catch { return fail("unreadable", "Your kept character looks could not be read from this browser’s storage, so they were left alone and nothing can be kept now."); }
    if (raw == null || raw === "") return { ok: true, map: {} };
    try { const map = JSON.parse(raw); if (map && typeof map === "object" && !Array.isArray(map)) return { ok: true, map }; } catch { /* falls through */ }
    return fail("malformed", "Your kept character looks are not in a form this version can read, so they were left exactly as they are and nothing can be kept now.");
  }
  const writeBlock = () => {
    if (!locks?.request) return fail("unsupported", "This browser cannot change kept character looks safely when the app is open in more than one tab (it lacks Web Locks), so looks can be shown here but not changed. Nothing was changed.");
    if (isReadOnly()) return fail("read-only", "This app is open in another tab, so changes here are not saved.");
    return null;
  };
  const ready = () => writeBlock() || read();

  function step(change) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const current = read(); if (!current.ok) return current;
    const made = change({ ...current.map }) || {};
    if (!made.map) return { ok: true, map: current.map, result: made.result };
    try { storage.setItem(key, JSON.stringify(made.map)); } catch { return fail("write-failed", "The character look could not be saved on this device (its storage may be full). Nothing was changed."); }
    const after = read();
    if (!after.ok || !sameMap(after.map, made.map)) return fail("changed", "The kept character looks changed while this was being saved, so the result could not be confirmed. Check them and try again.");
    return { ok: true, map: made.map, result: made.result };
  }

  async function mutate(change) {
    const blocked = writeBlock(); if (blocked) return blocked;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), waitMs) : null;
    try {
      return await locks.request(lockName, controller ? { signal: controller.signal } : {}, async () => { if (timer) clearTimeout(timer); return step(change); });
    } catch (error) {
      if (error?.name === "AbortError") return fail("busy", "Another tab is changing character looks. Try again in a moment.");
      return fail("write-failed", "The character look could not be saved.");
    } finally { if (timer) clearTimeout(timer); }
  }

  return { read, ready, mutate };
}
