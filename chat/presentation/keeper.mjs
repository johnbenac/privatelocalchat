// The kept character looks of this browser (board T706, docs/PRESENTATION-CHOICE-PLAN.md): the one owner of the storage key `plc.presentations.v1`
// (a map: preset id -> record, class "user", through appLocal so the vault, a read-only tab and "newer data is left alone" apply). Everything that changes it goes through the lock-protected
// store (presentation-store.mjs); everything that shows it reads through describe(), which checks the record again and gives the default look for anything it cannot use.
//
// createPresentationKeeper({ storage, isReadOnly?, locks?, onChange? }) -> { read, ready, describe, peek, keep, setChoice, remove, prune, has }
//   describe(presetId) -> the description to draw (record.mjs describeRecord): usesDefault with a reason when there is none, it is disabled or it is unusable
//   keep(presetId, record) / setChoice(presetId, choice) / remove(presetId) / prune(presetIds) -> the store's outcome { ok, result? } and, after a change, onChange(map)
import { createPresentationStore, keepChange, choiceChange, removeChange, pruneChange, lookup, MAX_KEPT } from "./presentation-store.mjs";
import { checkRecord, describeRecord } from "./record.mjs";

export const PRESENTATIONS_KEY = "plc.presentations.v1";
export { MAX_KEPT };

export function createPresentationKeeper({ storage, isReadOnly = () => false, locks, onChange } = {}) {
  const store = createPresentationStore({ storage, key: PRESENTATIONS_KEY, isReadOnly, ...(locks ? { locks } : {}) });
  const read = () => store.read();
  const describe = (presetId) => { const r = store.read(); return describeRecord(r.ok ? lookup(r.map, presetId) : undefined); };
  /** The checked record of a preset (its choices and where it came from), or null when there is none or it cannot be used. */
  const peek = (presetId) => { const r = store.read(); if (!r.ok) return null; const raw = lookup(r.map, presetId); if (raw === undefined) return null; const c = checkRecord(raw); return c.ok ? c.record : null; };
  const has = (presetId) => { const r = store.read(); return r.ok && lookup(r.map, presetId) !== undefined; };
  async function change(make) {
    const outcome = await store.mutate(make);
    if (outcome.ok && outcome.map && typeof onChange === "function") { try { onChange(outcome.map); } catch { /* a listener must not undo a saved change */ } }
    return outcome;
  }
  return {
    read, has, peek, describe, ready: () => store.ready(),
    keep: (presetId, record) => change(keepChange(presetId, record)),
    setChoice: (presetId, choice) => change(choiceChange(presetId, choice)),
    remove: (presetId) => change(removeChange(presetId)),
    prune: (presetIds) => change(pruneChange(presetIds)),
  };
}
