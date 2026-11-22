// Compaction after a permanent delete (docs/VAULT-COMPACTION-ON-DELETE.md): the trigger, the debounce, the back-off, the locked and read-only rules, the pending marker.
// Real vault engine and app storage over the memory adapter, fake clock, synthetic data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdapter, memoryStorage, COMPACTION_MARKER, VaultError, fakeClock, seedVault, createTab, stored, readable, chat } from './helpers/compaction-rig.mjs';
import { DEBOUNCE_MS, MAX_WAIT_MS, BACKOFF_MS, MAX_ATTEMPTS, RESUME_MS } from '../chat/vault/compaction-scheduler.mjs';

async function world(chats = ['a', 'b', 'c'], tabOpts = {}) {
  const adapter = createMemoryAdapter(), realLocal = memoryStorage(), clock = fakeClock();
  await seedVault(adapter, chats);
  const tab = createTab({ adapter, realLocal, clock, ...tabOpts });
  await tab.open();
  return { adapter, realLocal, clock, tab };
}
const marker = (realLocal) => realLocal.getItem(COMPACTION_MARKER);

test('a permanent delete marks the deletion pending at once, and compacts only after the debounce', async () => {
  const { adapter, realLocal, clock, tab } = await world();
  let compacts = 0; tab.session.compact = ((real) => (o) => { compacts++; return real(o); })(tab.session.compact);
  await tab.remove('b');
  assert.ok(marker(realLocal), 'the marker is written before the delete is even stored');
  assert.deepEqual(JSON.parse(marker(realLocal)), { v: 1, pending: true, since: clock.now() });
  await tab.settle();
  assert.ok((await stored(adapter, tab.session)).keyPuts.includes('c:b'), 'before compaction the sealed key record is still in the log');
  await clock.advance(DEBOUNCE_MS - 1); assert.equal(compacts, 0, 'not before the debounce');
  await clock.advance(1); assert.equal(compacts, 1);
  const after = await stored(adapter, tab.session);
  assert.ok(!after.keyPuts.includes('c:b') && !after.scopes.includes('c:b'), 'the key record and the chat records are physically gone');
  assert.equal(marker(realLocal), null, 'the marker is cleared once done');
  const r = await readable(adapter);
  assert.deepEqual([...r.state.threads.keys()].sort(), ['a', 'c']); assert.equal(r.state.threads.get('a').messages[0].content, chat('a', 'first').messages[0].content);
  assert.deepEqual(tab.events().map((e) => e.name), ['compacted']);
});

test('a burst of deletes is compacted once, and a steady stream cannot postpone it past the maximum wait', async () => {
  const { clock, tab } = await world(['a', 'b', 'c', 'd', 'e']);
  let compacts = 0; tab.session.compact = ((real) => (o) => { compacts++; return real(o); })(tab.session.compact);
  await tab.remove('a'); await clock.advance(DEBOUNCE_MS - 500); await tab.remove('b'); await clock.advance(DEBOUNCE_MS - 500); await tab.remove('c');
  assert.equal(compacts, 0, 'each delete restarts the wait');
  await clock.advance(DEBOUNCE_MS); assert.equal(compacts, 1, 'three deletes, one compaction');
  // a delete every 2.5 s: the debounce never lapses, the maximum wait does
  const w = await world(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o'].map((x) => x));
  let n = 0; w.tab.session.compact = ((real) => (o) => { n++; return real(o); })(w.tab.session.compact);
  const ids = w.tab.threads().map((t) => t.id);
  let spent = 0, i = 0;
  while (n === 0 && spent <= MAX_WAIT_MS + 5000) { await w.tab.remove(ids[i++]); await w.clock.advance(2500); spent += 2500; }
  assert.equal(n >= 1, true); assert.ok(spent <= MAX_WAIT_MS + 2500, 'compacted by the maximum wait: ' + spent);
});

test('refused as busy or stale: retried on the stated back-off, never skipped, and done in the end', async () => {
  let refusals = 0;
  const { adapter, realLocal, clock, tab } = await world(['a', 'b'], { onCompact: async (real, o) => { if (refusals < 3) { refusals++; throw new VaultError(refusals === 2 ? 'stale-session' : 'busy', 'refused'); } return real(o); } });
  await tab.remove('a');
  await clock.advance(DEBOUNCE_MS); assert.equal(refusals, 1);
  assert.ok(marker(realLocal), 'while refused the deletion stays pending'); assert.ok((await stored(adapter, tab.session)).keyPuts.includes('c:a'));
  await clock.advance(BACKOFF_MS[0] - 1); assert.equal(refusals, 1, 'first retry waits ' + BACKOFF_MS[0] + ' ms'); await clock.advance(1); assert.equal(refusals, 2);
  await clock.advance(BACKOFF_MS[1]); assert.equal(refusals, 3);
  await clock.advance(BACKOFF_MS[2]);
  assert.equal(marker(realLocal), null); assert.ok(!(await stored(adapter, tab.session)).keyPuts.includes('c:a'));
  assert.deepEqual(tab.events().map((e) => e.name), ['retrying', 'retrying', 'retrying', 'compacted']);
});

test('refused for good: it gives up after the stated attempts, says so, keeps the marker, and the next unlock finishes it', async () => {
  const { adapter, realLocal, clock, tab } = await world(['a', 'b'], { onCompact: async () => { throw new VaultError('stale-session', 'always'); } });
  await tab.remove('a'); await tab.settle();
  await clock.advance(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0) * 3);
  const names = tab.events().map((e) => e.name);
  assert.equal(names.at(-1), 'gave-up'); assert.equal(names.filter((n) => n === 'retrying').length, MAX_ATTEMPTS - 1);
  assert.equal(clock.pendingTimers, 0, 'it stopped');
  assert.ok(marker(realLocal)); assert.ok((await stored(adapter, tab.session)).keyPuts.includes('c:a'));
  // the next unlock (a new session, a fresh view of the store) finishes it
  const again = createTab({ adapter, realLocal, clock }); await again.open();
  await clock.advance(RESUME_MS);
  assert.equal(marker(realLocal), null); assert.ok(!(await stored(adapter, again.session)).keyPuts.includes('c:a'));
});

test('never while locked: locking cancels it, nothing is compacted, the marker stays, and unlocking finishes it', async () => {
  const { adapter, realLocal, clock, tab } = await world();
  await tab.remove('b'); await tab.settle();
  const before = JSON.stringify(adapter.raw());
  tab.lock();
  await clock.advance(DEBOUNCE_MS * 10);
  assert.equal(JSON.stringify(adapter.raw()), before, 'a locked vault is never written');
  assert.ok(marker(realLocal)); assert.equal(clock.pendingTimers, 0);
  const unlocked = createTab({ adapter, realLocal, clock }); await unlocked.open();
  assert.equal(clock.pendingTimers, 1, 'the unlock arms the pending compaction'); await clock.advance(RESUME_MS);
  assert.equal(marker(realLocal), null); assert.ok(!(await stored(adapter, unlocked.session)).keyPuts.includes('c:b'));
});

test('a session locked while the timer was due: paused, not compacted, not an error', async () => {
  const { adapter, realLocal, clock, tab } = await world();
  await tab.remove('c'); await tab.settle();
  tab.session.lock();   // locked without the page telling the scheduler (the engine alone knows)
  const before = JSON.stringify(adapter.raw());
  await clock.advance(DEBOUNCE_MS);
  assert.equal(JSON.stringify(adapter.raw()), before); assert.ok(marker(realLocal));
  assert.equal(tab.events().at(-1).name, 'paused');
});

test('a read-only tab (another tab is the writer) never compacts, and leaves the marker alone', async () => {
  const { adapter, realLocal, clock } = await world();
  realLocal.setItem(COMPACTION_MARKER, JSON.stringify({ v: 1, pending: true, since: 1 }));
  const ro = createTab({ adapter, realLocal, clock, writer: false }); await ro.open();
  const before = JSON.stringify(adapter.raw());
  await clock.advance(RESUME_MS * 5);
  assert.equal(JSON.stringify(adapter.raw()), before); assert.ok(marker(realLocal)); assert.equal(clock.pendingTimers, 0);
});

test('data written by a newer version is never compacted away: it stops, tells, and keeps the marker', async () => {
  const { adapter, realLocal, clock, tab } = await world(['a', 'b'], { onCompact: async () => { throw new VaultError('unsupported-event', 'newer'); } });
  await tab.remove('a'); await clock.advance(DEBOUNCE_MS);
  assert.deepEqual(tab.events().map((e) => e.name), ['blocked']); assert.ok(marker(realLocal)); assert.equal(clock.pendingTimers, 0);
  assert.equal((await readable(adapter)).damaged.length, 0);
});

test('a delete that arrives while a compaction runs is not covered by it: the marker stays and another round follows', async () => {
  let release, entered;
  const gate = new Promise((r) => { release = r; }), inside = new Promise((r) => { entered = r; });
  let rounds = 0;
  const { adapter, realLocal, clock, tab } = await world(['a', 'b', 'c'], { onCompact: async (real, o) => { rounds++; if (rounds === 1) { entered(); await gate; } return real(o); } });
  await tab.remove('a');
  const adv = clock.advance(DEBOUNCE_MS);
  await inside; await tab.remove('b');
  release(); await adv;
  assert.ok(marker(realLocal), 'the second delete is still pending after round one');
  await clock.advance(DEBOUNCE_MS * 2);
  assert.equal(rounds >= 2, true); assert.equal(marker(realLocal), null);
  const st = await stored(adapter, tab.session); assert.ok(!st.keyPuts.includes('c:a') && !st.keyPuts.includes('c:b'));
  assert.deepEqual([...(await readable(adapter)).state.threads.keys()], ['c']);
});

test('a deleted document is compacted the same way', async () => {
  const { adapter, realLocal, clock, tab } = await world(['a']);
  await tab.session.putDoc('d1', { id: 'd1', name: 'synthetic doc' });
  await tab.store.docsBackend.remove('d1');
  assert.ok(marker(realLocal)); await clock.advance(DEBOUNCE_MS);
  assert.ok(!(await stored(adapter, tab.session)).keyPuts.includes('d:d1')); assert.equal(marker(realLocal), null);
});

test('nothing is deleted, nothing is compacted: ordinary saves never start the scheduler', async () => {
  const { realLocal, clock, tab } = await world();
  tab.setThreads([...tab.threads(), chat('z', 'new')]); await tab.settle(); await clock.advance(DEBOUNCE_MS * 5);
  assert.equal(marker(realLocal), null); assert.equal(tab.events().length, 0);
});
