// Kept character looks in a full backup (board T706). Pure: no DOM, storage or clock.
// A backup (`plc-backup/1`) gets an optional `looks` section: { "<preset id>": record }, one entry for each of the person's own presets that has a look that can be used (a damaged one, or one a
// newer version wrote, stays in the browser and is not exported). Restoring a backup gives every restored preset a NEW id (and skips a preset whose name the person already has), so a look can
// only follow the preset it belongs to through the id the preset got: idMapForRestore works that out from the lists before and after the merge. A look is never attached to a preset the person
// already had, and a section that is not in the expected shape is ignored. Every record is checked again when it is kept (keepChange -> checkRecord).
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** { id: record } for the given own presets, from peek(id) -> checked record | null. */
export function looksForBackup(presets, peek) {
  const out = {};
  for (const p of Array.isArray(presets) ? presets : []) {
    if (!p || typeof p.id !== "string") continue;
    const record = peek(p.id);
    if (record) out[p.id] = record;
  }
  return out;
}

/**
 * Which backup preset ended up as which new preset. `before` is the list of presets the person had, `after` the list after the merge (mergeBackupPresets), `items` the backup's presets.
 * A backup preset maps only when a preset with its name was ADDED by the merge (its id was not in `before`); names are unique among added presets. Returns Map(oldId -> newId).
 */
export function idMapForRestore(before, after, items) {
  const had = new Set((Array.isArray(before) ? before : []).map((p) => p.id));
  const addedByName = new Map();
  for (const p of Array.isArray(after) ? after : []) if (p && !had.has(p.id)) addedByName.set(p.name, p.id);
  const list = Array.isArray(items) ? items : [];
  const seen = new Map(); // an id used by two presets of the backup is ambiguous (a corrupt file): neither gets a look
  for (const item of list) if (item && typeof item.id === "string") seen.set(item.id, (seen.get(item.id) || 0) + 1);
  const map = new Map();
  for (const item of list) {
    if (!item || typeof item.id !== "string" || typeof item.name !== "string" || seen.get(item.id) !== 1 || !addedByName.has(item.name)) continue;
    map.set(item.id, addedByName.get(item.name));
  }
  return map;
}

/** [newId, rawRecord] to keep, from the backup's `looks` and the id map. Anything not in shape is ignored; the records themselves are checked by the store. */
export function looksToRestore(looks, idMap) {
  if (!isObject(looks) || !(idMap instanceof Map)) return [];
  const out = [];
  for (const [oldId, newId] of idMap) if (hasOwn(looks, oldId)) out.push([newId, looks[oldId]]);
  return out;
}
