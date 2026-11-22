// Concurrency and crash tests for compaction on delete (the concurrency rule: parallel actors on a scratch copy, stated invariants, repeated).
// Every scenario runs REPEATS times with a different seed (a different interleaving). Invariants checked after the compaction:
//   (1) the deleted chats' key records and records are absent from the stored log
//   (2) every other chat, its content and the settings are still readable and unchanged
//   (3) two tabs deleting different chats at the same time lose nothing
//   (4) a compaction refused as busy or stale is retried and eventually done: never silently skipped, never half done
//   (5) an abrupt stop between the delete and the compaction leaves the vault readable and the deletion pending; the next boot compacts it
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryAdapter, memoryStorage, COMPACTION_MARKER, VaultError, fakeClock, seedVault, createTab, stored, readable, chat, rng, sleep } from './helpers/compaction-rig.mjs';
import { DEBOUNCE_MS, RESUME_MS, BACKOFF_MS } from '../chat/vault/compaction-scheduler.mjs';

const REPEATS = 20;
const ALL = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

/** The invariants (1) and (2): nothing of `gone` is stored, everything of `kept` is readable with the expected text. */
async function check({ adapter, gone, kept, texts, label }) {
  const r = await readable(adapter), st = await stored(adapter, r.session);
  for (const id of gone) {
    assert.ok(!st.keyPuts.includes('c:' + id), label + ': key record of ' + id + ' is still in the log');
    assert.ok(!st.scopes.includes('c:' + id), label + ': records of ' + id + ' are still in the log');
    assert.ok(!r.state.threads.has(id) && !r.state.keys.has('c:' + id), label + ': ' + id + ' is readable');
  }
  assert.deepEqual([...r.state.threads.keys()].sort(), [...kept].sort(), label + ': the kept chats are exactly the expected ones');
  for (const id of kept) assert.equal(r.state.threads.get(id).messages.at(-1).content, texts[id], label + ': ' + id + ' changed');
  assert.equal(r.state.kv.get('l/plc.prefs.v1'), '{"synthetic":true}', label + ': a setting was lost');
  assert.equal(r.damaged.length, 0, label + ': damaged records');
  return st;
}
const fresh = async (chats = ALL) => {
  const adapter = createMemoryAdapter(), realLocal = memoryStorage(), clock = fakeClock();
  await seedVault(adapter, chats, { 'l/plc.prefs.v1': '{"synthetic":true}' });
  const texts = Object.fromEntries(chats.map((id) => [id, chat(id, 'first').messages[0].content]));
  return { adapter, realLocal, clock, texts };
};

test('parallel actors in one tab: deletes, new messages and saves race the compaction; the survivors are intact', async () => {
  for (let rep = 0; rep < REPEATS; rep++) {
    const rand = rng(1000 + rep), { adapter, realLocal, clock, texts } = await fresh();
    const tab = createTab({ adapter, realLocal, clock }); await tab.open();
    const doomed = ALL.filter(() => rand() < 0.5); if (!doomed.length) doomed.push('c1');
    const kept = ALL.filter((id) => !doomed.includes(id));
    const actors = [
      ...doomed.map((id) => (async () => { await sleep(rand() * 6); await tab.remove(id); })()),
      ...kept.map((id) => (async () => { await sleep(rand() * 6); const list = tab.threads(); const t = list.find((x) => x.id === id); t.messages.push({ role: 'assistant', content: 'reply ' + id + ' ' + rep }); texts[id] = 'reply ' + id + ' ' + rep; tab.setThreads(list); })()),
      (async () => { for (let i = 0; i < 4; i++) { await clock.advance(1500 + rand() * 2000); await sleep(rand() * 3); } })()
    ];
    await Promise.all(actors); await tab.settle();
    await clock.advance(DEBOUNCE_MS * 4 + BACKOFF_MS[0]);
    assert.equal(realLocal.getItem(COMPACTION_MARKER), null, 'rep ' + rep + ': done and the marker is cleared');
    await check({ adapter, gone: doomed, kept, texts, label: 'rep ' + rep });
  }
});

test('two tabs delete different chats at the same time: nothing is lost, both are gone, and what was refused is retried', async () => {
  for (let rep = 0; rep < REPEATS; rep++) {
    const rand = rng(2000 + rep), { adapter, realLocal, clock, texts } = await fresh();
    // no Web Locks here: both tabs may write; the engine's exclusive seq add is what keeps them honest
    const A = createTab({ adapter, realLocal, clock }), B = createTab({ adapter, realLocal, clock });
    await A.open(); await B.open();
    await Promise.all([(async () => { await sleep(rand() * 3); await A.remove('c1'); await A.settle(); })(), (async () => { await sleep(rand() * 3); await B.remove('c2'); await B.settle(); })()]);
    await clock.advance(DEBOUNCE_MS + BACKOFF_MS.reduce((a, b) => a + b, 0) * 2);
    // a tab whose store lost the race (its write was refused as a conflict, or its view went stale) is reloaded, which is what the page tells the person; then the delete is done again if needed
    for (const tab of [A, B]) { tab.lock(); }
    const C = createTab({ adapter, realLocal, clock }); await C.open();
    for (const id of ['c1', 'c2']) if (C.threads().some((t) => t.id === id)) await C.remove(id);
    await C.settle(); await clock.advance(RESUME_MS + DEBOUNCE_MS * 2 + BACKOFF_MS[0]);
    assert.equal(realLocal.getItem(COMPACTION_MARKER), null, 'rep ' + rep + ': nothing is left pending');
    await check({ adapter, gone: ['c1', 'c2'], kept: ALL.filter((x) => x !== 'c1' && x !== 'c2'), texts, label: 'two tabs rep ' + rep });
  }
});

test('a read-only tab beside the writer: only the writer compacts, and the writer\'s compaction does not disturb the reader\'s next unlock', async () => {
  for (let rep = 0; rep < REPEATS; rep++) {
    const rand = rng(3000 + rep), { adapter, realLocal, clock, texts } = await fresh();
    const writer = createTab({ adapter, realLocal, clock }), reader = createTab({ adapter, realLocal, clock, writer: false });
    await writer.open(); await reader.open();
    let readerCompacts = 0; reader.session.compact = (o) => { readerCompacts++; return Promise.reject(new Error('must not run')); };
    await writer.remove('c3'); if (rand() < 0.5) await writer.remove('c4');
    const gone = ['c3', ...(writer.threads().some((t) => t.id === 'c4') ? [] : ['c4'])];
    await writer.settle(); await clock.advance(DEBOUNCE_MS * 3);
    assert.equal(readerCompacts, 0); assert.equal(realLocal.getItem(COMPACTION_MARKER), null);
    await check({ adapter, gone, kept: ALL.filter((x) => !gone.includes(x)), texts, label: 'reader rep ' + rep });
  }
});

test('abrupt stop between the delete and the compaction: readable, still pending, and the next boot compacts it', async () => {
  for (let rep = 0; rep < REPEATS; rep++) {
    const rand = rng(4000 + rep), { adapter, realLocal, clock, texts } = await fresh();
    const doomed = rand() < 0.5 ? ['c5'] : ['c5', 'c6'];
    const dying = createTab({ adapter, realLocal, clock }); await dying.open();
    for (const id of doomed) await dying.remove(id);
    // the page is killed at a random point: before the delete is stored, or after it, but always before the timer fired. Its timers and memory simply vanish; the plain marker and the adapter remain.
    if (rand() < 0.7) await dying.settle(); else await sleep(rand() * 2);
    clock.unwatch(dying.sched); dying.sched.detached();            // the killed page's timer never fires
    const mid = await readable(adapter);                           // (5) still readable by a new unlock, and no half-written state
    assert.equal(mid.damaged.length, 0); assert.ok(realLocal.getItem(COMPACTION_MARKER), 'rep ' + rep + ': the deletion is still pending');
    for (const id of ALL.filter((x) => !doomed.includes(x))) assert.equal(mid.state.threads.get(id).messages[0].content, texts[id]);
    const midStored = await stored(adapter, mid.session);
    if (!mid.state.keys.has('c:c5')) assert.ok(midStored.keyPuts.includes('c:c5'), 'the destroyed key\'s sealed record is still in the log until compaction');
    // next boot (a new page, the person unlocks)
    const boot = createTab({ adapter, realLocal, clock }); await boot.open();
    if (boot.threads().some((t) => doomed.includes(t.id))) for (const id of doomed) await boot.remove(id);   // the delete itself had not reached the vault: it is redone, which marks it again
    await boot.settle(); await clock.advance(RESUME_MS + DEBOUNCE_MS * 2);
    assert.equal(realLocal.getItem(COMPACTION_MARKER), null, 'rep ' + rep);
    await check({ adapter, gone: doomed, kept: ALL.filter((x) => !doomed.includes(x)), texts, label: 'abrupt rep ' + rep });
  }
});

test('abrupt stop DURING the compaction: either the old log or the whole new one, never half; the marker is still there; the next boot finishes', async () => {
  for (let rep = 0; rep < REPEATS; rep++) {
    const rand = rng(5000 + rep), { adapter, realLocal, clock, texts } = await fresh();
    const mode = rep % 2 ? 'after-replace' : 'before-replace';   // the replace is one adapter call: the kill is either side of it
    const tab = createTab({ adapter, realLocal, clock, onCompact: async (real, o, session) => {
      if (mode === 'before-replace') throw Object.assign(new Error('killed'), { code: 'timeout' });
      await real(o); throw Object.assign(new Error('killed after the replace'), { code: 'timeout' });
    }, scheduler: { maxAttempts: 1 } });
    await tab.open(); await tab.remove('c2'); await tab.settle();
    const before = JSON.stringify(adapter.raw());
    await clock.advance(DEBOUNCE_MS);
    const raw = JSON.stringify(adapter.raw());
    if (mode === 'before-replace') assert.equal(raw, before, 'nothing was half written');
    assert.ok(realLocal.getItem(COMPACTION_MARKER), 'the marker survives a kill: it is only cleared after a confirmed compaction');
    clock.unwatch(tab.sched); tab.sched.detached();
    const mid = await readable(adapter); assert.equal(mid.damaged.length, 0); assert.equal(mid.state.threads.has('c2'), false);
    const boot = createTab({ adapter, realLocal, clock }); await boot.open(); await clock.advance(RESUME_MS + DEBOUNCE_MS);
    assert.equal(realLocal.getItem(COMPACTION_MARKER), null);
    await check({ adapter, gone: ['c2'], kept: ALL.filter((x) => x !== 'c2'), texts, label: mode + ' rep ' + rep });
  }
});
