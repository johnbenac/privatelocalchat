// changePassphrase, addWrap and removeWrap rewrite the stored header after awaiting crypto. They must never overwrite a NEWER header (T895 finding 2): a typed commit that lands in between
// sets the semantic header plc-vault/2, and a stale plc-vault/1 header written over it makes the typed records unreadable while that commit reported success. Synthetic data only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';

const ITER = 1000;
const V = (E, T) => ({ format: 1, encounter: { id: E, thread: T }, participants: { p1: { id: 'p1', encounter: E, label: 'secret ' + E } }, events: { ev1: { id: 'ev1', encounter: E, text: 'secret words' } }, holders: { [E + '\u0000h1']: 'p1' } });
const plan = (base, E) => ({ base, operationId: 'op', threads: { put: [], create: [], remove: [], order: undefined }, encounters: { put: [{ id: E, owner: { type: 'thread', id: 't1' }, value: V(E, 't1') }], remove: [] }, standalone: { create: [], destroy: [] }, logical: { v: 1, rev: 1, epoch: 1 } });
const G = () => true;
async function setup() {
  const real = createMemoryAdapter();
  const session = await createVault({ adapter: real }).create('pw', { iterations: ITER });
  await session.putThread('t1', { id: 't1', title: 'one', messages: [{ role: 'user', content: 'x' }] }); await session.setKv('l/chatThreads.order', '["t1"]');
  return { real, session };
}
/** An adapter that runs `hook` once, right before the first header rewrite (a projection that adds no records): the typed commit lands while the rewriter is between its read and its write. */
function hooked(real, hook) {
  let pending = hook;
  return { ...real, async replaceLog(a) { if (pending && a.expected && a.add.length === 0) { const h = pending; pending = null; await h(); } return real.replaceLog(a); } };
}
const commitTyped = async (real, E) => { const s = await createVault({ adapter: real }).unlock('pw'); const r = await s.readChatProjection({ guard: G }); const out = await s.commitChatProjection(plan(r.base, E), { guard: G }); assert.equal(out.status, 'committed', JSON.stringify(out)); };
const state = async (real) => { const s = await createVault({ adapter: real }).unlock('pw'); return { header: (await real.readHeader()).format, entities: [...s.state.encounters.keys()].sort(), damaged: s.damaged.length }; };

for (const [name, run] of [
  ['changePassphrase', (s) => s.changePassphrase('pw', 'pw2', { iterations: ITER })],
  ['addWrap', (s) => s.addWrap({ id: 'k1', type: 'passkey', iv: 'AA==', data: 'AA==' })],
  ['removeWrap', (s) => s.removeWrap('none')]
]) {
  test(`${name} racing a typed commit cannot downgrade the header or make typed data unreadable`, async () => {
    const { real, session } = await setup();
    const racing = createVault({ adapter: hooked(real, () => commitTyped(real, 'E1')) });
    const mine = await racing.unlock('pw');
    const out = await run(mine).then(() => 'ok', (e) => e.code);
    assert.ok(out === 'busy' || out === 'ok', name + ' answered ' + out);
    const st = await state(real);
    assert.equal(st.header, 'plc-vault/2', 'the semantic header is still there'); assert.deepEqual(st.entities, ['E1'], 'the typed record is readable'); assert.equal(st.damaged, 0);
    assert.equal(out, 'busy', 'the stale rewrite was refused, not applied over the newer header');
    void session;
  });
}

test('a rewrite with nothing racing still works, keeps typed data and the new passphrase unlocks', async () => {
  const { real, session } = await setup();
  await commitTyped(real, 'E1');
  const fresh = await createVault({ adapter: real }).unlock('pw');
  await fresh.changePassphrase('pw', 'pw2', { iterations: ITER });
  const again = await createVault({ adapter: real }).unlock('pw2');
  assert.deepEqual([...again.state.encounters.keys()], ['E1']); assert.equal((await real.readHeader()).format, 'plc-vault/2');
  await assert.rejects(() => createVault({ adapter: real }).unlock('pw'), 'the old passphrase no longer opens it');
  void session;
});

test('storage that cannot compare must not rewrite the header of a vault with typed records', async () => {
  const { real } = await setup();
  await commitTyped(real, 'E1');
  const blind = { ...real, atomicProjection: false };
  const s = await createVault({ adapter: blind }).unlock('pw');
  const before = JSON.stringify(real.raw());
  await assert.rejects(() => s.changePassphrase('pw', 'pw2', { iterations: ITER }), (e) => e.code === 'unsupported-adapter');
  assert.equal(JSON.stringify(real.raw()), before, 'nothing was written');
});

test('control: a vault with no typed records may still be rewritten by storage that cannot compare (the old behaviour)', async () => {
  const { real } = await setup();
  const blind = { ...real, atomicProjection: false };
  const s = await createVault({ adapter: blind }).unlock('pw');
  await s.changePassphrase('pw', 'pw3', { iterations: ITER });
  await createVault({ adapter: real }).unlock('pw3');
});
