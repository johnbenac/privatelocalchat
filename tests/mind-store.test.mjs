// The bookkeeping of a conversation with a mind (chat/mind/mind-store.mjs) and the channel client on top of it: no words in the key, a chat's removal leaves nothing, and the concurrency and recovery
// invariants of the shared state (SCRATCH parallel actors and abrupt recovery, 20 repeats each).
//   I1  two tabs saving one chat at once never lose a message either knew, and never let the cursor go back (union, larger cursor)
//   I2  a crash between receiving a word and keeping it loses nothing and duplicates nothing: the word is received again, once; a word already kept is never shown again
//   I3  two tabs that receive the same occurrence write ONE message id, and the key holds no word, ever
//   I4  removing the chat removes its entry; entries of other chats are never touched
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMindStore, pruneOrphans, mergeEntries, stripWords, MIND_KEY } from '../chat/mind/mind-store.mjs';
import { createChannelClient } from '../chat/channel/client.mjs';
import { replyMessageId, replyToMessage, threadOccKeys, occKey } from '../chat/mind/mind-model.mjs';
import { memoryStorage } from '../chat/vault/vault-store.mjs';
import { createLockTable } from './helpers/web-locks-fake.mjs';

const uuid = (n) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const mkThread = () => ({ id: 't1', mind: { address: 'http://x' }, messages: [] });
const rnd = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

function tab(storage, locks, thread, ids) {
  let n = ids.start;
  const store = createMindStore({ threadId: 't1', source: 'plc:t1', thread: () => thread, storage, locks });
  const replies = [];
  let onFrame = null;
  const transport = { async request(frame) { return frame.kind === 'message' ? [{ kind: 'receipt', state: 'accepted', messageId: frame.id, encounter: 'enc:1' }] : []; },
    subscribe(_o, f) { onFrame = f; return { close() {} }; } };
  const client = createChannelClient({ transport, store, source: 'plc:t1', encounter: 'enc:1', resident: { individualId: 'i', host: { kind: 'own-computer', address: 'x' } }, participant: { id: 'p', kind: 'human', name: 'P', standing: 'guest', individualId: null },
    newId: () => uuid(n++), onReply: (r) => replies.push(r) });
  client.connect();
  const feed = (occId, text) => onFrame({ kind: 'reply', id: 'r-' + occId, encounter: 'enc:1', causes: [uuid(1)], occ: { source: 'host', id: occId, digest: 'd' }, delivered: text, status: 'completed' }, undefined);
  return { store, client, replies, feed, thread };
}

test('the key holds receipts and ids but never a word, and loading brings the words back from the chat', async () => {
  const storage = memoryStorage(); const thread = mkThread();
  const t = tab(storage, null, thread, { start: 1 });
  const id = uuid(1);
  thread.messages.push({ id, role: 'user', content: 'SECRET-person-words', at: 1 });
  await t.client.send('SECRET-person-words');
  await t.client.flush();
  const raw = storage.getItem(MIND_KEY);
  assert.ok(raw.includes(id) && raw.includes('accepted'));
  assert.ok(!raw.includes('SECRET'), 'no words in the key');
  assert.ok(!raw.includes('sha256'), 'no digest of the words either');
  const again = tab(storage, null, thread, { start: 50 });
  const view = again.client.view().messages[0];
  assert.equal(view.words, 'SECRET-person-words'); assert.deepEqual(view.states, ['accepted']);
});

test('I1 parallel tabs saving one chat: nothing either knew is lost, the cursor only grows (20 repeats)', async () => {
  for (let rep = 0; rep < 20; rep += 1) {
    const storage = memoryStorage(); const table = createLockTable(); const r = rnd(rep + 1);
    const stores = [0, 1, 2, 3].map((i) => createMindStore({ threadId: 't1', source: 'plc:t1', thread: () => mkThread(), storage, locks: table.page('tab' + i) }));
    const states = [0, 1, 2, 3].map((i) => ({ messages: { ['m' + i]: { id: 'm' + i, words: 'W' + i, state: 'accepted', states: ['accepted'], occ: { source: 's', id: 'o' + i, digest: 'x' } } }, order: ['m' + i], cursor: Math.floor(r() * 50), lastAccepted: { p: 'm' + i } }));
    await Promise.all(stores.map(async (s, i) => { for (let k = 0; k < 3; k += 1) { await new Promise((res) => setTimeout(res, Math.floor(r() * 3))); await s.save(states[i]); } }));
    const entry = JSON.parse(storage.getItem(MIND_KEY)).chats.t1;
    assert.deepEqual(Object.keys(entry.messages).sort(), ['m0', 'm1', 'm2', 'm3'], 'rep ' + rep);
    assert.equal(entry.cursor, Math.max(...states.map((s) => s.cursor)));
    assert.ok(!storage.getItem(MIND_KEY).includes('W0'));
  }
});

test('I2 a crash between receiving a word and keeping it: it is received again once; a kept word is never shown again (20 repeats)', async () => {
  for (let rep = 0; rep < 20; rep += 1) {
    const storage = memoryStorage(); const thread = mkThread(); const r = rnd(rep + 7);
    const words = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ occId: 'occ-' + x, text: 'WORD-' + x }));
    const kept = new Set(); let crashAt = Math.floor(r() * words.length);
    const first = tab(storage, null, thread, { start: 1 });
    first.client.disconnect();
    for (const [i, w] of words.entries()) {
      first.feed(w.occId, w.text);
      const got = first.replies.find((x) => x.occ.id === w.occId);
      assert.ok(got, 'received');
      if (i === crashAt) break;                       // the tab dies HERE: this word was received, not kept
      thread.messages.push(replyToMessage(got, { speaker: 'Ada', at: i, unasked: false })); kept.add(w.occId);
      await first.client.flush();
    }
    // a new tab: the host replays EVERYTHING it ever said
    const second = tab(storage, null, thread, { start: 100 });
    for (const w of words) { second.feed(w.occId, w.text); second.feed(w.occId, w.text); }
    const receivedAgain = second.replies.map((x) => x.occ.id).sort();
    assert.deepEqual(receivedAgain, words.map((w) => w.occId).filter((id) => !kept.has(id)).sort(), 'only what was not kept, once each (rep ' + rep + ')');
    for (const x of second.replies) thread.messages.push(replyToMessage(x, { speaker: 'Ada', at: 9, unasked: false }));
    assert.deepEqual(thread.messages.map((m) => m.mind.occ.id).sort(), words.map((w) => w.occId).sort(), 'every word exactly once in the chat');
    assert.equal(new Set(thread.messages.map((m) => m.id)).size, words.length);
  }
});

test('I3 two tabs that receive the same occurrence make the same message id (the second write is the same message)', () => {
  const occ = { source: 'host', id: 'same' };
  const a = replyToMessage({ occ, text: 'x', causes: [] }, { speaker: 'Ada', at: 1 }), b = replyToMessage({ occ, text: 'x', causes: [] }, { speaker: 'Ada', at: 2 });
  assert.equal(a.id, b.id); assert.equal(occKey(a.mind.occ), occKey(b.mind.occ));
  assert.equal(replyMessageId(occ), a.id);
  assert.deepEqual([...threadOccKeys({ messages: [a, b] })], [occKey(occ)]);
});

test('I4 removing the chat removes its entry and no other', () => {
  const storage = memoryStorage();
  storage.setItem(MIND_KEY, JSON.stringify({ v: 1, chats: { t1: { messages: {}, order: [], cursor: 3, lastAccepted: {} }, t2: { messages: {}, order: [], cursor: 1, lastAccepted: {} } } }));
  assert.deepEqual(pruneOrphans(['t2'], { storage, locks: null }), ['t1']);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem(MIND_KEY)).chats), ['t2']);
  assert.deepEqual(pruneOrphans([], { storage, locks: null }), ['t2']);
  assert.equal(storage.getItem(MIND_KEY), null, 'the last entry takes the key with it');
  assert.deepEqual(pruneOrphans([], { storage, locks: null }), []);
});

test('merging two copies of one chat keeps every message, the one with more receipts, and the larger cursor', () => {
  const a = { messages: { x: { states: ['accepted'] } }, order: ['x'], cursor: 2, lastAccepted: { p: 'x' } };
  const b = { messages: { x: { states: ['accepted', 'delivered'] }, y: { states: [] } }, order: ['x', 'y'], cursor: 1, lastAccepted: { p: 'y' } };
  const m = mergeEntries(a, b);
  assert.deepEqual(m.messages.x.states, ['accepted', 'delivered']); assert.deepEqual(m.order, ['x', 'y']); assert.equal(m.cursor, 2);
  assert.deepEqual(stripWords({ messages: { q: { id: 'q', words: 'W', state: 'accepted', states: [], occ: { source: 's', id: 'o', digest: 'd' } } }, order: ['q'] }).messages.q, { id: 'q', state: 'accepted', states: [], occId: 'o' });
});
