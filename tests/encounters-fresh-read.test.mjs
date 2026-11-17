// The freshness barrier of the locked writer (chat/encounters/ledger-store.mjs). In real Chromium a tab that has just been given the Web Lock can still read a localStorage value that is a few
// milliseconds old (the previous holder's write is still travelling between renderer processes), and a compare-and-set on that stale read erases the previous holder's work
// (measured: logs/baseline-race-diag4-r12.log). This test models exactly that: every tab has its own view of storage, a write reaches the other views after a random delay, the Web Lock manager is
// strongly consistent (and answers `query()` like the browser's). Invariants over 4, 8 and 16 tabs, 20 repeats each:
//   no lost update   every acknowledged message of every tab is stored, once
//   no corruption    chatThreads and the ledger parse, no intent is left
//   no deadlock      everything finishes inside a timeout, including when a token can never be satisfied
//   the control      with the barrier off the SAME run loses acknowledged messages, so the check can fail
import test from 'node:test';
import assert from 'node:assert/strict';
import { openTab, thread, msg, makeMessage } from './helpers/encounters-env.mjs';

/** A browser's lock manager: exclusive locks queue per name, shared locks are granted at once, query() lists what is held. */
function lockManager({ withQuery = true } = {}) {
  const held = []; const tails = new Map();
  const run = async (entry, fn) => { held.push(entry); try { return await fn({ name: entry.name, mode: entry.mode }); } finally { held.splice(held.indexOf(entry), 1); } };
  const api = {
    request(name, opts, fn) {
      if (typeof opts === 'function') { fn = opts; opts = {}; }
      const entry = { name, mode: opts.mode || 'exclusive' };
      if (entry.mode === 'shared') return run(entry, fn);
      const tail = tails.get(name) || Promise.resolve();
      const p = tail.then(() => run(entry, fn));
      tails.set(name, p.catch(() => {}));
      return p;
    },
  };
  if (withQuery) api.query = async () => ({ held: held.map((h) => ({ name: h.name, mode: h.mode })), pending: [] });
  return api;
}
/** Every tab reads its OWN view; a write is seen at once by its writer and reaches the other views after a few milliseconds (in order per writer). */
function browser(n, { lag = 8 } = {}) {
  const views = Array.from({ length: n }, () => new Map()); let seq = 0;
  const tabs = views.map((view, i) => ({
    getItem: (k) => (view.has(k) ? view.get(k).v : null),
    setItem: (k, v) => { const s = ++seq; view.set(k, { v: String(v), s }); views.forEach((o, j) => { if (j !== i) setTimeout(() => { const cur = o.get(k); if (!cur || cur.s < s) o.set(k, { v: String(v), s }); }, 1 + Math.random() * lag); }); },
    removeItem: (k) => { views.forEach((o) => o.delete(k)); },
  }));
  const truth = (k) => { let best = null; for (const v of views) { const x = v.get(k); if (x && (!best || x.s > best.s)) best = x; } return best ? best.v : null; };
  return { tabs, truth };
}
const within = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('no deadlock: ' + what + ' did not finish in ' + ms + ' ms')), ms))]);

async function round(n, K, storeOptions) {
  const { tabs, truth } = browser(n);
  const locks = lockManager();
  // the stored state every tab starts from
  for (const t of tabs) t.setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  await new Promise((r) => setTimeout(r, 30));
  const open = tabs.map((storage) => openTab({ storage, locks, storeOptions }));
  const acked = [];
  await within(Promise.all(open.map(async (tab, i) => {
    for (let k = 0; k < K; k++) {
      const m = makeMessage('user', `tab ${i} #${k}`); m.id = `m-${i}-${k}`;
      tab.thread('shared').messages.push(m);
      const r = await tab.save();
      if (r.ok && !(r.conflicts || []).length) acked.push(m.id);
      else if (r.ok) { tab.thread('shared').messages.pop(); }   // a reported conflict is a visible outcome, never silent: not counted as acknowledged
    }
  })), 20000, n + ' tabs');
  await new Promise((r) => setTimeout(r, 40));
  const chat = JSON.parse(truth('chatThreads')), ledger = JSON.parse(truth('plc.encounters.v1'));
  const ids = chat.find((t) => t.id === 'shared').messages.map((m) => m.id);
  return { acked, ids, ledger };
}

for (const n of [4, 8, 16]) {
  test(`${n} tabs with stale cross-process reads: every acknowledged message survives, 20 repeats`, async () => {
    for (let r = 0; r < 20; r++) {
      const { acked, ids, ledger } = await round(n, 3);
      const missing = acked.filter((id) => !ids.includes(id));
      assert.deepEqual(missing, [], `repeat ${r}: acknowledged messages missing from storage`);
      assert.equal(new Set(ids).size, ids.length, `repeat ${r}: no duplicate message ids`);
      assert.ok(acked.length >= n * 3 - 0 || acked.length > 0, 'something was acknowledged');
      assert.equal(ledger.intent, undefined, `repeat ${r}: no intent left`);
      assert.ok(acked.every((id) => Object.values(ledger.events).some((e) => e.message === id)), `repeat ${r}: every acknowledged message has its record`);
    }
  });
}

test('control: with the barrier off the same stale-read run loses acknowledged messages', async () => {
  let lost = 0;
  for (let r = 0; r < 20; r++) { const { acked, ids } = await round(8, 3, { fresh: false }); if (acked.some((id) => !ids.includes(id))) lost++; }
  assert.ok(lost > 0, 'the control never lost anything, so the stale-read model proves nothing');
});

test('a token nobody can satisfy (a writer that closed at once) costs one bounded wait, never a deadlock', async () => {
  const { tabs, truth } = browser(2, { lag: 2 });
  const locks = lockManager();
  tabs[0].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  await new Promise((r) => setTimeout(r, 20));
  const a = openTab({ storage: tabs[0], locks, storeOptions: { freshMs: 40 } });
  // a ghost token: highest seq, a digest no view will ever have
  let release; const ghost = new Promise((res) => { release = res; });
  locks.request('plc-enc-seq|ghost|999|0.deadbeef/-', { mode: 'shared' }, () => ghost);
  const m = makeMessage('user', 'after ghost'); m.id = 'g1'; a.thread('shared').messages.push(m);
  const t0 = Date.now();
  const r = await within(a.save(), 5000, 'the save behind a ghost token');
  assert.equal(r.ok, true); assert.ok(Date.now() - t0 < 2000, 'the wait is bounded');
  const m2 = makeMessage('user', 'second'); m2.id = 'g2'; a.thread('shared').messages.push(m2);
  const t1 = Date.now(); assert.equal((await within(a.save(), 5000, 'the second save')).ok, true);
  assert.ok(Date.now() - t1 < 40 + 200, 'the same token is waited for once');
  release();
  assert.deepEqual(JSON.parse(truth('chatThreads')).find((t) => t.id === 'shared').messages.map((x) => x.id), ['s1', 'g1', 'g2']);
});

test('a lock manager without query() still saves exactly as before (no wait, no token)', async () => {
  const { tabs, truth } = browser(1);
  const locks = lockManager({ withQuery: false });
  tabs[0].setItem('chatThreads', JSON.stringify([thread('shared', [msg('s1', 'user', 'seed')])]));
  const a = openTab({ storage: tabs[0], locks });
  const m = makeMessage('user', 'x'); m.id = 'q1'; a.thread('shared').messages.push(m);
  assert.equal((await a.save()).ok, true);
  assert.deepEqual(JSON.parse(truth('chatThreads')).find((t) => t.id === 'shared').messages.map((x) => x.id), ['s1', 'q1']);
});
