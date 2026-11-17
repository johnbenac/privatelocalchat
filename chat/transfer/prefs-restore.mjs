// What a protected backup's preferences add to the ones stored here (plc.prefs.v1): standing instructions, whether Enter sends, the reading voice and its speed. Pure: no storage, no lock.
// The write itself is chat/assistant/prefs-store.mjs (the one writer of that key, under the Web Lock "plc-prefs").
//
// Additive, like every other part of a backup: a value the person has already chosen here is kept, a value this browser has not set is taken from the backup.
//   instructions  non-blank text, taken only when none are set here                  (kept exactly as exported: the editor's own 4000-character cap already applied when it was written)
//   enterSends    true or false; null/absent means "not chosen" (the page then decides from the device), so a stored false IS a choice and is kept
//   voiceURI      non-blank text (an opaque browser voice id, kept exactly), taken only when no voice is chosen here
//   speechRate    a number from 0.6 to 1.6 (the slider's range), taken only when no speed is chosen here
// A value of the wrong type, or out of range, is skipped, never turned into another value or cut short. Fields this build does not know are not touched. The backup format is unchanged.

const MIN_RATE = 0.6, MAX_RATE = 1.6;
const isText = (v) => typeof v === 'string' && v.trim() !== '';
const isRate = (v) => typeof v === 'number' && Number.isFinite(v) && v >= MIN_RATE && v <= MAX_RATE;

/** Returns { prefs, added, kept }: `added` names the fields taken, `kept` the valid incoming fields left alone because a value is already chosen here. `current` is not changed. */
export function mergeBackupPrefs(current, incoming) {
  const base = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  const prefs = { ...base }, added = [], kept = [];
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return { prefs, added, kept };
  const take = (field, valid, chosen) => { if (!valid) return; if (chosen) kept.push(field); else { prefs[field] = incoming[field]; added.push(field); } };
  take('instructions', isText(incoming.instructions), Boolean(base.instructions));
  take('enterSends', typeof incoming.enterSends === 'boolean', typeof base.enterSends === 'boolean');
  take('voiceURI', isText(incoming.voiceURI), isText(base.voiceURI));
  take('speechRate', isRate(incoming.speechRate), typeof base.speechRate === 'number');
  return { prefs, added, kept };
}
