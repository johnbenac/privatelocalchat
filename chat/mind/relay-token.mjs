// SPDX-License-Identifier: AGPL-3.0-only
// The access token for a conversation with a mind through a relay (docs/MIND-CONVERSATION.md), kept in session storage through appSession in ONE key, `plc.mind.relayToken.v1`:
// an object `{ v: 1, tokens: { <chat id>: <token> } }`. Session storage is gone when the tab closes, so the token is asked for again in a new session and a stolen copy of the chat history
// never carries it: the chat itself (chatThreads) names only the relay's address and the channel. A token is NEVER put in an address, a frame, a log or a file the person saves.
//
// Every change reads the whole record and writes it back in one synchronous step, so two controllers of one tab (or a controller and the prune) cannot lose each other's entries; a record
// that cannot be read (damage, a newer format) is treated as empty and never thrown on, and a newer format is not written over.
import { appSession } from '../vault/vault-store.mjs';

export const RELAY_TOKEN_KEY = 'plc.mind.relayToken.v1';

function readAll(storage) {
  let raw = null;
  try { raw = storage.getItem(RELAY_TOKEN_KEY); } catch { return { newer: false, tokens: {} }; }
  if (!raw) return { newer: false, tokens: {} };
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { newer: false, tokens: {} };
    if (Number(v.v) > 1) return { newer: true, tokens: {} };   // written by a newer version: read as empty, never overwritten
    const tokens = {};
    if (v.tokens && typeof v.tokens === 'object' && !Array.isArray(v.tokens)) for (const [k, t] of Object.entries(v.tokens)) if (typeof t === 'string' && t) tokens[k] = t;
    return { newer: false, tokens };
  } catch { return { newer: false, tokens: {} }; }
}

export function createRelayTokens({ storage = appSession } = {}) {
  const write = (all) => {
    if (all.newer) return false;
    try {
      if (Object.keys(all.tokens).length) storage.setItem(RELAY_TOKEN_KEY, JSON.stringify({ v: 1, tokens: all.tokens }));
      else storage.removeItem(RELAY_TOKEN_KEY);
      return true;
    } catch { return false; }
  };
  return {
    get(chatId) { return readAll(storage).tokens[chatId] || ''; },
    has(chatId) { return Boolean(readAll(storage).tokens[chatId]); },
    /** Keep a token for a chat; an empty token removes it. Returns whether it was written. */
    set(chatId, token) {
      const all = readAll(storage);
      const text = String(token || '').trim();
      if (text) all.tokens[chatId] = text; else delete all.tokens[chatId];
      return write(all);
    },
    clear(chatId) { return this.set(chatId, ''); },
    /** Remove the tokens of chats that no longer exist. Returns the ids removed. */
    prune(liveChatIds) {
      const live = new Set(liveChatIds);
      const all = readAll(storage);
      const gone = Object.keys(all.tokens).filter((id) => !live.has(id));
      if (!gone.length) return [];
      for (const id of gone) delete all.tokens[id];
      write(all);
      return gone;
    }
  };
}
