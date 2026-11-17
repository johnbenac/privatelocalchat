// What a conversation save actually did, for the screen. Pure (no DOM, no storage): it reads the structured result of chat/encounters/thread-commit.mjs.
//
// The commit answers { ok, conflicts, refused, duplicates, wrote, code, message }. `ok: true` does NOT mean "your change is stored": a per-conversation conflict (another tab changed what this tab
// changed) comes back under ok: true with the conversation listed in `conflicts`, and nothing of that conversation was written. So a caller that changed some conversations asks
// `outcomeOf(result, ids)` and gets `saved: true` only when the save went through AND none of THOSE conversations is in conflict. Everything else is an explicit outcome with words:
//   saved      the change is stored (or was already stored: `wrote: false` with ok is a no-op that is also saved)
//   conflict   ok, but a conversation this change touched was changed elsewhere: not written, told, kept in this tab
//   refused    nothing was written: no Web Locks, another tab owns writing, chats held for a newer version, malformed records, records could not be written, stale after Clear, busy
//   unknown    the result could not be confirmed (the write may or may not be there): the person is told to look before sending again
// (A planned facade message that was refused is that facade call's own answer; it never makes an ordinary save fail.)

const WHY = {
  unsupported: 'this browser cannot keep chats safely when the app is open in more than one tab (it lacks Web Locks)',
  'read-only': 'this app is open in another tab, and only that tab can save',
  blocked: 'these chats were saved by a newer version of the app, so this version leaves them as they are',
  stale: 'your chat history was cleared in another tab; reload this tab to continue',
  busy: 'another tab is saving right now; try again in a moment',
  malformed: 'the saved chats or records are in a form this version cannot read, so they were left exactly as they are',
  unreadable: 'the saved chats could not be read from this browser’s storage',
  'records-write-failed': 'the conversation records could not be saved (storage may be full)',
  'threads-write-failed': 'this browser could not save your chats (storage may be full or blocked)',
  exhausted: 'the conversation records cannot be advanced any further',
  conflict: 'this chat was changed in another tab, so this tab did not overwrite it; reload to see the newer version',
  'unknown-outcome': 'the result could not be confirmed. Look at the chat before trying again, so nothing is sent twice',
  changed: 'the result could not be confirmed. Look at the chat before trying again, so nothing is sent twice',
};

export function outcomeOf(result, ids = null) {
  const r = result && typeof result === 'object' ? result : { ok: false, code: 'no-result', message: 'The save gave no answer.' };
  const want = ids == null ? null : new Set(Array.isArray(ids) ? ids : [ids]);
  const conflicts = (r.conflicts || []).filter((c) => !want || want.has(c.thread));
  const ok = Boolean(r.ok);
  const saved = ok && conflicts.length === 0;
  const code = !ok ? (r.code || 'failed') : conflicts.length ? 'conflict' : null;
  return { saved, ok, code, conflicts, refused: r.refused || [], unknown: !ok && (r.code === 'unknown-outcome' || r.code === 'changed'), wrote: Boolean(r.wrote), message: r.message || '', warning: r.warning || null };
}

/** One sentence for the person: what was not done, why, and what is still true. `what`: "Your message was not sent". */
export function sentence(outcome, what) {
  if (outcome.saved) return '';
  const why = WHY[outcome.code] || (outcome.message ? outcome.message.replace(/\.$/, '') : 'it could not be saved');
  const tail = outcome.unknown ? '' : ' Nothing was changed.';
  return `${what}: ${why}.${tail}`;
}
