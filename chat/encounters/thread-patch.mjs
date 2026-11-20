// A tab's changes to conversations, as a PATCH against what is stored now, instead of a whole-list overwrite. Pure functions over plain thread objects.
//
//   diffThread(base, tab)  what this tab changed since it last synchronised with storage: { created } | { fields, messages: [add | set | del] } | null (nothing)
//   applyDiff(stored, diff) apply it to the FRESH stored thread: { ok: true, thread } or an explicit { ok: false, code: 'conflict' | 'exists' | 'gone', detail }
//
// Rules (the reason this exists: chat/core/thread-state.mjs used to write the whole list from one tab's memory, so a second tab's saved message could be erased by a stale save):
//   * a field or message this tab did not change is never touched, so everything another tab saved meanwhile survives;
//   * a field/message this tab changed is applied only if storage still holds the value this tab started from (compare-and-set); otherwise the thread is reported as a conflict and not written;
//   * a message added by this tab is inserted after the message it followed (or at the end); adding an id that is already stored with other content is a conflict;
//   * `updatedAt` only moves forward.
export const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const SKIP = new Set(['messages', 'updatedAt']);

export function diffThread(base, tab) {
  if (!base) return { created: true, thread: clone(tab) };
  const fields = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(tab)])) {
    if (SKIP.has(k)) continue;
    const aHas = k in base, bHas = k in tab;
    if (aHas && bHas && same(base[k], tab[k])) continue;
    if (!aHas && !bHas) continue;
    if (aHas && !bHas) fields[k] = { from: clone(base[k]), to: undefined, had: true, has: false };
    else if (!aHas && bHas) fields[k] = { from: undefined, to: clone(tab[k]), had: false, has: true };
    else fields[k] = { from: clone(base[k]), to: clone(tab[k]), had: true, has: true };
  }
  const baseMsgs = new Map((base.messages || []).map((m) => [m.id, m])), tabMsgs = tab.messages || [], tabIds = new Set(tabMsgs.map((m) => m.id));
  const messages = [];
  tabMsgs.forEach((m, i) => {
    const b = baseMsgs.get(m.id);
    if (!b) messages.push({ op: 'add', message: clone(m), after: i > 0 ? tabMsgs[i - 1].id : null });
    else if (!same(b, m)) messages.push({ op: 'set', id: m.id, from: clone(b), to: clone(m) });
  });
  for (const [id, m] of baseMsgs) if (!tabIds.has(id)) messages.push({ op: 'del', id, from: clone(m) });
  const touch = Number.isFinite(tab.updatedAt) && tab.updatedAt !== base.updatedAt ? tab.updatedAt : null;
  if (!Object.keys(fields).length && !messages.length && touch == null) return null;
  return { fields, messages, touch };
}

const conflict = (detail) => ({ ok: false, code: 'conflict', detail });

export function applyDiff(stored, diff) {
  if (diff.created) {
    if (!stored) return { ok: true, thread: clone(diff.thread), changed: true };
    return same(stored, diff.thread) ? { ok: true, thread: clone(stored), changed: false } : { ok: false, code: 'exists', detail: 'a conversation with this id already exists in storage' };
  }
  if (!stored) return { ok: false, code: 'gone', detail: 'the conversation was deleted or cleared elsewhere' };
  const out = clone(stored);
  for (const [k, f] of Object.entries(diff.fields)) {
    const have = k in out, cur = out[k];
    const started = have === f.had && (!f.had || same(cur, f.from));
    if (!started) { if (have === f.has && (!f.has || same(cur, f.to))) continue; return conflict(`${k} was changed elsewhere`); }
    if (f.has) out[k] = clone(f.to); else delete out[k];
  }
  const msgs = out.messages = Array.isArray(out.messages) ? out.messages : [];
  for (const op of diff.messages) {
    const at = msgs.findIndex((m) => m.id === (op.message ? op.message.id : op.id));
    if (op.op === 'add') {
      if (at >= 0) { if (same(msgs[at], op.message)) continue; return conflict(`message ${op.message.id} already exists with other content`); }
      const anchor = op.after == null ? -1 : msgs.findIndex((m) => m.id === op.after);
      msgs.splice(anchor >= 0 ? anchor + 1 : msgs.length, 0, clone(op.message));
    } else if (op.op === 'set') {
      if (at < 0) return conflict(`message ${op.id} was removed elsewhere`);
      if (!same(msgs[at], op.from)) { if (same(msgs[at], op.to)) continue; return conflict(`message ${op.id} was changed elsewhere`); }
      msgs[at] = clone(op.to);
    } else if (op.op === 'del') {
      if (at < 0) continue;
      if (!same(msgs[at], op.from)) return conflict(`message ${op.id} was changed elsewhere`);
      msgs.splice(at, 1);
    }
  }
  if (diff.touch != null && !(Number.isFinite(out.updatedAt) && out.updatedAt > diff.touch)) out.updatedAt = diff.touch;
  return { ok: true, thread: out, changed: !same(out, stored) };
}

/** Removing a conversation: only if storage still holds what this tab last saw (already gone is fine). */
export function applyRemoval(stored, base) {
  if (!stored) return { ok: true, removed: false };
  return same(stored, base) ? { ok: true, removed: true } : conflict('the conversation was changed elsewhere, so it was not deleted');
}
