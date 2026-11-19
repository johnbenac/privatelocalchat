// app.transition (chat/vault/vault-store.mjs): ONE encryption action at a time per page. A call made while another is in flight is REFUSED with `busy`; it is NOT queued and never runs later.
// A second call of the same kind may ask to coalesce and then shares the first call's promise. A transition that throws frees the slot. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
import { createAppStorage, memoryStorage } from '../chat/vault/vault-store.mjs';

async function attached() {
  const app = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() });
  app.attach(await createVault({ adapter: createMemoryAdapter() }).create('pw', { iterations: 1000 }));
  return app;
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('a transition started while another is in flight is refused with busy, never started, and never queued', async () => {
  const app = await attached(); const ran = [];
  let release; const gate = new Promise((r) => { release = r; });
  const first = app.transition('enable', async () => { ran.push('first'); await gate; return 'one'; });
  await assert.rejects(() => app.transition('disable', async () => { ran.push('second'); return 'two'; }), (e) => e.code === 'busy' && /enable/.test(e.message));
  assert.deepEqual(ran, ['first'], 'the refused call did not start');
  release(); assert.equal(await first, 'one');
  await settle();
  assert.deepEqual(ran, ['first'], 'and it was NOT queued: it did not run after the first one finished');
  assert.equal(await app.transition('disable', async () => 'free again'), 'free again', 'the slot is free after the first finished');
});

test('coalesce: a second call of the SAME kind shares the first call\'s promise and runs nothing; another kind is still refused', async () => {
  const app = await attached(); let runs = 0, release; const gate = new Promise((r) => { release = r; });
  const first = app.transition('cleanup', async () => { runs += 1; await gate; return 'done'; });
  const shared = app.transition('cleanup', async () => { runs += 10; return 'other'; }, { coalesce: true });
  await assert.rejects(() => app.transition('cleanup', async () => 'x'), (e) => e.code === 'busy', 'the same kind WITHOUT coalesce is refused too');
  release(); assert.equal(await first, 'done'); assert.equal(await shared, 'done'); assert.equal(runs, 1, 'one run for both callers');
});

test('a transition that throws frees the slot, and the refusal while it ran was real', async () => {
  const app = await attached(); let release; const gate = new Promise((r) => { release = r; });
  const failing = app.transition('enable', async () => { await gate; throw new Error('boom'); });
  await assert.rejects(() => app.transition('disable', async () => 1), (e) => e.code === 'busy');
  release(); await assert.rejects(() => failing, /boom/);
  await settle();
  assert.equal(await app.transition('disable', async () => 'after the failure'), 'after the failure');
});
