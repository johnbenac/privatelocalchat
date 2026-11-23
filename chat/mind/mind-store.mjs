// SPDX-License-Identifier: AGPL-3.0-only
// The channel client's `store` for one chat with a mind (chat/channel/client.mjs: load() / save(state)), kept through appLocal in ONE key, `plc.mind.v1`, an object with one entry per chat.
//
// The words are NOT here. Hers and the person's are ordinary messages of the chat (chatThreads), so removing the chat removes them, the encrypted vault compacts them away with the chat
// (chat/vault/compaction-scheduler.mjs) and nothing else holds a copy. What this key holds is bookkeeping with no words in it: the ids of the person's messages, the receipts reached, the
// stream cursor, who the last accepted message was. When the chat is gone its entry is pruned (pruneOrphans), at start and whenever the list of chats changes.
//
// Her words are never "seen" because this store says so: no seen keys are stored at all. The occurrence keys already in the chat's messages are the truth (threadOccKeys), read again on every
// load. So a crash between receiving a word and saving it can lose nothing (a word not in the chat is not seen, and is received again) and a repeated poll or a second tab can duplicate
// nothing (the message id is made from the occurrence). The client calls save() as a whole snapshot; entries of other chats are never touched, and two tabs saving the same chat are merged, not overwritten.
import { appLocal } from '../vault/vault-store.mjs';
import { digestOf } from '../encounters/records.mjs';
import { threadOccKeys } from './mind-model.mjs';

export const MIND_KEY = 'plc.mind.v1';
const KEEP = ['id', 'state', 'states', 'times', 'audience', 'expression', 'after', 'corrects', 'waitingFor', 'refusal', 'worldSeq'];
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function readAll(storage) {
  let raw = null;
  try { raw = storage.getItem(MIND_KEY); } catch { return { v: 1, chats: {} }; }
  if (!raw) return { v: 1, chats: {} };
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && v.chats && typeof v.chats === 'object' ? v : { v: 1, chats: {} }; } catch { return { v: 1, chats: {} }; }
}
const writeAll = (storage, all) => { storage.setItem(MIND_KEY, JSON.stringify(all)); };

/** What leaves the client's state: no words, no digests, no replies. */
export function stripWords(state) {
  const messages = {};
  for (const [id, m] of Object.entries(state?.messages || {})) { const k = {}; for (const f of KEEP) if (m[f] !== undefined) k[f] = clone(m[f]); k.occId = m.occ?.id; messages[id] = k; }
  return { messages, order: [...(state?.order || [])], cursor: state?.cursor ?? 0, lastAccepted: clone(state?.lastAccepted || {}) };
}

/** The union of two copies of one chat's bookkeeping (two tabs): every message either knew, the one with more receipts, the larger cursor, the newer lastAccepted. */
export function mergeEntries(stored, fresh) {
  if (!stored) return fresh;
  const messages = { ...stored.messages };
  for (const [id, m] of Object.entries(fresh.messages)) { const old = messages[id]; messages[id] = !old || (m.states?.length || 0) >= (old.states?.length || 0) ? m : old; }
  const order = [...stored.order.filter((id) => id in messages)];
  for (const id of fresh.order) if (!order.includes(id)) order.push(id);
  return { messages, order, cursor: Math.max(stored.cursor || 0, fresh.cursor || 0), lastAccepted: { ...stored.lastAccepted, ...fresh.lastAccepted } };
}

/**
 * @param {{threadId:string, source:string, thread:()=>object|null, storage?:object, locks?:object|null}} o
 * `thread()` returns the chat as the page holds it now (its messages carry the words and her occurrence keys).
 */
export function createMindStore({ threadId, source, thread, storage = appLocal, locks = globalThis.navigator?.locks } = {}) {
  return {
    load() {
      const t = thread();
      const entry = readAll(storage).chats[threadId];
      const seen = [...threadOccKeys(t)];
      if (!entry) return seen.length ? { messages: {}, order: [], seen, cursor: 0, replies: [], lastAccepted: {} } : null;
      const words = new Map((t?.messages || []).filter((m) => m.role === 'user').map((m) => [m.id, m.content]));
      const messages = {}, order = [];
      for (const id of entry.order || []) {   // a message whose words are gone from the chat cannot be sent again, so it is not carried
        const m = entry.messages?.[id], text = words.get(id);
        if (!m || typeof text !== 'string') continue;
        const { occId, ...rest } = m;
        messages[id] = { ...clone(rest), words: text, occ: { source, id: occId || 'occ:' + id, digest: digestOf(text) } };
        order.push(id);
      }
      return { messages, order, seen, cursor: entry.cursor || 0, replies: [], lastAccepted: clone(entry.lastAccepted || {}) };
    },
    async save(state) {
      const run = () => {
        const fresh = stripWords(state);
        const all = readAll(storage);
        all.chats[threadId] = mergeEntries(all.chats[threadId], fresh);
        writeAll(storage, all);
      };
      if (locks?.request) await locks.request('plc-mind', run); else run();
    }
  };
}

/** Remove the entries of chats that no longer exist. Returns the ids removed. */
export function pruneOrphans(liveThreadIds, { storage = appLocal, locks = globalThis.navigator?.locks } = {}) {
  const live = new Set(liveThreadIds);
  const all = readAll(storage);
  const gone = Object.keys(all.chats).filter((id) => !live.has(id));
  if (!gone.length) return [];
  const run = () => { const again = readAll(storage); for (const id of gone) delete again.chats[id]; if (Object.keys(again.chats).length) writeAll(storage, again); else storage.removeItem(MIND_KEY); };
  if (locks?.request) void locks.request('plc-mind', run); else run();
  return gone;
}
