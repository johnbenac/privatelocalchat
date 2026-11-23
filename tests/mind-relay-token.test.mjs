// SPDX-License-Identifier: AGPL-3.0-only
// The access token of a conversation through a relay (chat/mind/relay-token.mjs, key `plc.mind.relayToken.v1` in session storage) is shared state: several controllers of one tab (the conversation, a
// setup dialog, the prune that follows the list of chats) read and write the same record. Invariants, each checked with parallel actors on a scratch storage, 20 repeats:
//   I1  parallel controllers setting tokens for different chats lose none (every acknowledged token is read back), and a chat's own later token wins
//   I2  a prune racing with the setting of a live chat's token never removes a live chat's token; a chat that is gone loses its token
//   I3  abrupt recovery: a record that is damaged, half-written or of another shape is read as empty without throwing and is healed by the next set; a record of a NEWER format is read as empty and
//       NEVER written over (the newer version's tokens survive); a write that fails (quota, a crash) leaves every earlier token as it was
//   I4  the token is in no other key: the bookkeeping of the chat (plc.mind.v1) and the chat's own record never hold it
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelayTokens, RELAY_TOKEN_KEY } from '../chat/mind/relay-token.mjs';
import { createMindStore, MIND_KEY } from '../chat/mind/mind-store.mjs';
import { memoryStorage } from '../chat/vault/vault-store.mjs';
import { createLockTable } from './helpers/web-locks-fake.mjs';

const rnd = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const yieldSome = async (r) => { for (let i = Math.floor(r() * 4); i > 0; i -= 1) await Promise.resolve(); };
const REPEATS = 20;

test('I1: parallel controllers lose no token, and the later token of one chat wins', async () => {
  for (let rep = 0; rep < REPEATS; rep += 1) {
    const storage = memoryStorage(); const r = rnd(rep + 1);
    const controllers = Array.from({ length: 6 }, () => createRelayTokens({ storage }));
    await Promise.all(controllers.map(async (c, i) => {
      for (let k = 0; k < 5; k += 1) { await yieldSome(r); c.set('chat-' + i + '-' + k, 'tok-' + i + '-' + k); }
      await yieldSome(r); c.set('shared', 'first-' + i);
    }));
    const reader = createRelayTokens({ storage });
    for (let i = 0; i < 6; i += 1) for (let k = 0; k < 5; k += 1) assert.equal(reader.get('chat-' + i + '-' + k), 'tok-' + i + '-' + k, `rep ${rep}: a token was lost`);
    assert.match(reader.get('shared'), /^first-\d$/);
    reader.set('shared', 'later'); assert.equal(createRelayTokens({ storage }).get('shared'), 'later');
  }
});

test('I2: a prune racing with sets never removes a live chat\'s token; a chat that is gone loses its token', async () => {
  for (let rep = 0; rep < REPEATS; rep += 1) {
    const storage = memoryStorage(); const r = rnd(100 + rep);
    const a = createRelayTokens({ storage }), b = createRelayTokens({ storage });
    a.set('gone', 'old'); a.set('live-0', 'x');
    const live = ['live-0', 'live-1', 'live-2', 'live-3'];
    await Promise.all([
      (async () => { for (const id of live) { await yieldSome(r); a.set(id, 'tok-' + id); } })(),
      (async () => { for (let i = 0; i < 6; i += 1) { await yieldSome(r); b.prune(live); } })()
    ]);
    b.prune(live);
    for (const id of live) assert.equal(a.get(id), 'tok-' + id, `rep ${rep}: ${id} lost to a prune`);
    assert.equal(a.get('gone'), '', 'the chat that is gone has no token');
  }
});

test('I3: damaged, half-written and odd records read as empty and heal; a newer format is never written over; a failed write keeps the earlier tokens', () => {
  for (let rep = 0; rep < REPEATS; rep += 1) {
    for (const raw of ['{"v":1,"tokens":{"a":"x"', 'not json', '[]', 'null', '{"v":1,"tokens":[1,2]}', '{"v":1,"tokens":{"a":5,"b":"","c":{}}}', '']) {
      const storage = memoryStorage({ [RELAY_TOKEN_KEY]: raw }); const t = createRelayTokens({ storage });
      assert.doesNotThrow(() => t.get('a')); assert.equal(t.get('a'), '');
      assert.equal(t.set('chat', 'tok'), true); assert.equal(createRelayTokens({ storage }).get('chat'), 'tok', 'the next set heals the record');
    }
    const newer = JSON.stringify({ v: 2, tokens: { keep: 'newer-version-token' }, extra: true });
    const storage = memoryStorage({ [RELAY_TOKEN_KEY]: newer }); const t = createRelayTokens({ storage });
    assert.equal(t.get('keep'), ''); assert.equal(t.set('chat', 'tok'), false); t.prune([]); t.clear('keep');
    assert.equal(storage.getItem(RELAY_TOKEN_KEY), newer, 'a newer version\'s record is left exactly as it was');
    // a write that fails (quota, a tab torn down) leaves the earlier tokens as they were
    const inner = memoryStorage(); const good = createRelayTokens({ storage: inner }); good.set('one', 'tok-1'); good.set('two', 'tok-2');
    let calls = 0;
    const flaky = { getItem: (k) => inner.getItem(k), removeItem: (k) => inner.removeItem(k), setItem: (k, v) => { calls += 1; if (calls === 1) throw new Error('quota'); inner.setItem(k, v); } };
    const f = createRelayTokens({ storage: flaky });
    assert.equal(f.set('three', 'tok-3'), false, 'the failure is reported, never swallowed as a success');
    assert.deepEqual([good.get('one'), good.get('two'), good.get('three')], ['tok-1', 'tok-2', ''], 'every earlier token is intact');
    assert.equal(f.set('three', 'tok-3'), true);
  }
});

test('I3b: clearing the last token removes the key; an empty token is a removal; a token is trimmed', () => {
  const storage = memoryStorage(); const t = createRelayTokens({ storage });
  t.set('a', '  tok  '); assert.equal(t.get('a'), 'tok'); assert.equal(t.has('a'), true);
  t.set('a', '   '); assert.equal(storage.getItem(RELAY_TOKEN_KEY), null); assert.equal(t.has('a'), false);
});

test('I4: the token is in no other key: not in the bookkeeping of the chat, not in the chat\'s record', async () => {
  const local = memoryStorage(), session = memoryStorage(); const locks = createLockTable();
  const thread = { id: 't1', mind: { via: 'relay', address: 'https://relay.example', channel: 'chan-test-0001', resident: 'r', encounter: 'e', participant: 'p' }, messages: [{ id: 'u1', role: 'user', content: 'hello', at: 1 }] };
  const TOKEN = 'tok-never-anywhere-else';
  createRelayTokens({ storage: session }).set('t1', TOKEN);
  const store = createMindStore({ threadId: 't1', source: 'plc:t1', thread: () => thread, storage: local, locks });
  await store.save({ messages: { u1: { id: 'u1', words: 'hello', states: ['accepted'], state: 'accepted', occ: { source: 'plc:t1', id: 'occ:u1', digest: 'd' } } }, order: ['u1'], cursor: 0, lastAccepted: {} });
  assert.ok(local.getItem(MIND_KEY));
  assert.ok(!local.getItem(MIND_KEY).includes(TOKEN) && !JSON.stringify(thread).includes(TOKEN));
  assert.ok(session.getItem(RELAY_TOKEN_KEY).includes(TOKEN));
});
