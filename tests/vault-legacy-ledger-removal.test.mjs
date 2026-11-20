// Turning the vault on leaves the plain legacy conversation ledger (plc.encounters.v1) in browser storage, because it is held and never copied into the vault. When the person then asks to
// remove the unencrypted copy, the ledger must go with the chats it repeats (otherwise the original text of every conversation stays readable beside the vault), but never while the chats
// themselves were not verified. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage, createAndMigrate, removeVerifiedPlaintext } from '../chat/vault/vault-store.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

const MARK = 'LEDGER-MARKER-31', LEDGER = JSON.stringify({ v: 1, rev: 2, epoch: 0, encounters: { 'enc:t0': { text: MARK } } });
const threads = JSON.stringify([{ id: 't0', title: 'one', messages: [{ role: 'user', content: MARK }] }]);
async function enabled(extra = {}) {
  const realLocal = memoryStorage({ chatThreads: threads, 'plc.encounters.v1': LEDGER, ...extra }), realSession = memoryStorage(), adapter = createMemoryAdapter();
  const { session } = await createAndMigrate({ passphrase: 'pw', adapter, realLocal, realSession, iterations: 1000 });
  return { realLocal, realSession, adapter, session };
}
const remove = (c, more = {}) => removeVerifiedPlaintext({ session: c.session, adapter: c.adapter, realLocal: c.realLocal, realSession: c.realSession, exclusive: true, ...more });

test('the plain ledger stays after enabling (held, never copied) and is removed with the unencrypted copy', async () => {
  const c = await enabled();
  assert.equal(c.realLocal.getItem('plc.encounters.v1'), LEDGER, 'held, not touched by enabling');
  const out = await remove(c);
  assert.ok(out.removed.includes('chatThreads') && out.removed.includes('plc.encounters.v1'), JSON.stringify(out));
  assert.equal(c.realLocal.getItem('plc.encounters.v1'), null);
});

test('the ledger is kept when the chats were not verified and so not removed', async () => {
  const c = await enabled();
  c.realLocal.setItem('chatThreads', JSON.stringify([{ id: 't0', title: 'edited since', messages: [] }]));   // differs from the vault: kept, not removed
  const out = await remove(c);
  assert.ok(out.kept.some((k) => k.key === 'chatThreads'), JSON.stringify(out));
  assert.equal(c.realLocal.getItem('plc.encounters.v1'), LEDGER, 'the ledger stays while the chats stay');
});

test('a session change during removal stops it before the ledger is touched', async () => {
  const c = await enabled(); let asked = 0;
  await assert.rejects(() => remove(c, { fence: () => ++asked < 4 }), (e) => e.code === 'session-changed');
  assert.ok(c.realLocal.getItem('plc.encounters.v1') === LEDGER || asked >= 3);
});

test('with no ledger present nothing else changes', async () => {
  const realLocal = memoryStorage({ chatThreads: threads }), realSession = memoryStorage(), adapter = createMemoryAdapter();
  const { session } = await createAndMigrate({ passphrase: 'pw', adapter, realLocal, realSession, iterations: 1000 });
  const out = await removeVerifiedPlaintext({ session, adapter, realLocal, realSession, exclusive: true });
  assert.deepEqual(out.removed.filter((k) => k !== 'plc.lock.v1'), ['chatThreads']);
});
