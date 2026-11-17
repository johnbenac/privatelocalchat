// Portable KV write-authority invariants against the actual vault store, crypto and memory backend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createAppStorage, memoryStorage, withWriteMode, readbackState } from '../chat/vault/vault-store.mjs';
import { createVault } from '../chat/vault/vault.mjs';
import { createMemoryAdapter } from '../chat/vault/vault-db.mjs';
const records = [];

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function fixture() {
  const backend = createMemoryAdapter();
  let failedRead = false, calls = 0, cryptoGate = null, readGate = null, appendGate = null;
  const adapter = { ...backend,
    readHeader: async (...args) => {
      if (failedRead) { failedRead = false; throw Error('Labelled initial persisted replay failure'); }
      return backend.readHeader(...args);
    },
    readLog: async (...args) => {
      const value = await backend.readLog(...args);
      if (readGate) { const gate = readGate; readGate = null; gate.entered.resolve(); await gate.release.promise; }
      return value;
    },
    append: async (...args) => {
      calls++; const value = await backend.append(...args);
      if (appendGate) { const gate = appendGate; appendGate = null; gate.entered.resolve(); await gate.release.promise; }
      return value;
    },
  };
  const subtle = new Proxy(webcrypto.subtle, { get(target, name) {
    if (name === 'encrypt') return async (...args) => {
      if (cryptoGate) { const gate = cryptoGate; cryptoGate = null; gate.entered.resolve(); await gate.release.promise; }
      return target.encrypt(...args);
    };
    const value = Reflect.get(target, name, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  const crypto = { subtle, getRandomValues: value => webcrypto.getRandomValues(value) };
  const session = await createVault({ adapter, crypto }).create('synthetic', { iterations: 1000 });
  await session.setKv('l/plc.characters.v1', 'ORIGINAL');
  const app = createAppStorage({ realLocal: memoryStorage(), realSession: memoryStorage() });
  const lease = { supported: true, owned: true };
  app.attach(session, { writer: true, lease, adapter }); calls = 0;
  return { app, lease, session, adapter,
    failRead: () => { failedRead = true; },
    pauseCrypto: () => { const gate = { entered: deferred(), release: deferred() }; cryptoGate = gate; return gate; },
    pauseRead: () => { const gate = { entered: deferred(), release: deferred() }; readGate = gate; return gate; },
    pauseAppend: () => { const gate = { entered: deferred(), release: deferred() }; appendGate = gate; return gate; },
    read: (guard = () => true) => withWriteMode(app, { feature: 'independent-remaining-kv-read', guard },
      mode => mode.readDurable(['plc.characters.v1'])),
    run: (expected, next, guard = () => true) => withWriteMode(app, { feature: 'independent-remaining-kv', guard },
      mode => mode.putKV('plc.characters.v1', expected, next, { operationId: 'same-original-operation' })),
    stored: async () => (await readbackState({ adapter, session })).kv.get('l/plc.characters.v1') ?? null,
    calls: () => calls,
  };
}

test('failed initial persisted read never means absence', { timeout: 5000 }, async () => {
  const f = await fixture(); f.failRead();
  let receipt, refusal;
  try { receipt = await f.run(null, 'OVERWRITE'); } catch (error) { refusal = { code: error.code, message: error.message }; }
  const actual = await f.stored();
  records.push({ name: 'initial-read-failure', actual, attempts: f.calls(), receipt, refusal });
  assert.equal(actual, 'ORIGINAL', 'an unknown initial snapshot cannot authorize overwrite');
  assert.equal(f.calls(), 0, 'must refuse before actual append');
  assert.ok(refusal || receipt?.status !== 'committed');
});

test('lease loss during actual crypto revokes append', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseCrypto();
  let receipt, refusal;
  const pending = f.run('ORIGINAL', 'STALE').then(value => { receipt = value; }, error => { refusal = { code: error.code, message: error.message }; });
  await gate.entered.promise;
  f.lease.owned = false;
  assert.equal(f.app.exclusive, false);
  gate.release.resolve(); await pending;
  const actual = await f.stored();
  records.push({ name: 'lease-lost-at-crypto', reachedCrypto: true, revokedBeforeRelease: true, actual, attempts: f.calls(), receipt, refusal });
  assert.equal(actual, 'ORIGINAL', 'lost lease must revoke the actual append');
  assert.equal(f.calls(), 0);
  assert.ok(refusal || receipt?.status !== 'committed');
});

test('control caller loss during actual crypto revokes append', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseCrypto(); let allowed = true;
  let receipt, refusal;
  const pending = f.run('ORIGINAL', 'STALE', () => allowed).then(value => { receipt = value; }, error => { refusal = { code: error.code, message: error.message }; });
  await gate.entered.promise; allowed = false; gate.release.resolve(); await pending;
  const actual = await f.stored();
  records.push({ name: 'caller-loss-positive-control', reachedCrypto: true, revokedBeforeRelease: true, actual, attempts: f.calls(), receipt, refusal });
  assert.equal(actual, 'ORIGINAL'); assert.equal(f.calls(), 0);
  assert.ok(refusal || receipt?.status !== 'committed');
});

for (const [name, revoke] of [
  ['supported lease', f => { f.lease.supported = false; }],
  ['format permission', f => { f.app.setBlocked(['plc.characters.v1']); }],
  ['held permission', f => { f.app.setHeld([{ key: 'plc.characters.v1', reason: 'labelled held capability' }]); }],
]) test(name+' loss during actual crypto revokes append', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseCrypto();
  let receipt, refusal;
  const pending = f.run('ORIGINAL', 'STALE').then(value => { receipt = value; }, error => { refusal = { code: error.code, message: error.message }; });
  await gate.entered.promise; revoke(f); gate.release.resolve(); await pending;
  const actual = await f.stored();
  records.push({ name: name+'-crypto', reachedCrypto: true, revokedBeforeRelease: true, actual, attempts: f.calls(), receipt, refusal });
  assert.equal(actual, 'ORIGINAL'); assert.equal(f.calls(), 0);
  assert.ok(refusal || receipt?.status !== 'committed');
});

for (const kind of ['lease', 'epoch', 'caller']) test('readDurable '+kind+' loss during actual read refuses result', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseRead(); let caller = true;
  let result, refusal;
  const pending = f.read(() => caller).then(value => { result = value; }, error => { refusal = { code: error.code, message: error.message }; });
  await gate.entered.promise;
  if (kind === 'lease') f.lease.owned = false;
  else if (kind === 'epoch') f.app.detach();
  else caller = false;
  gate.release.resolve(); await pending;
  records.push({ name: 'read-'+kind, reachedRead: true, revokedBeforeRelease: true, result, refusal, attempts: f.calls() });
  assert.equal(f.calls(), 0); assert.equal(result, undefined);
  assert.ok(refusal, 'revoked durable-read authority must refuse the plaintext result');
});

for (const kind of ['lease', 'caller']) test('durable append then '+kind+' loss cannot report committed', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseAppend(); let caller = true;
  let receipt, refusal;
  const pending = f.run('ORIGINAL', 'DURABLE', () => caller).then(value => { receipt = value; }, error => { refusal = { code: error.code, message: error.message, unknown: error.unknown }; });
  await gate.entered.promise;
  // The actual backend append has ALREADY committed; only its completion is held.
  const durableBeforeRelease = await f.stored();
  assert.equal(durableBeforeRelease, 'DURABLE');
  if (kind === 'lease') f.lease.owned = false; else caller = false;
  gate.release.resolve(); await pending;
  const actual = await f.stored();
  records.push({ name: 'after-durable-'+kind, durableBeforeRelease, revokedBeforeCompletion: true, actual, attempts: f.calls(), receipt, refusal, sessionValue: f.session.state.kv.get('l/plc.characters.v1') });
  assert.equal(actual, 'DURABLE'); assert.equal(f.calls(), 1, 'no rollback or retry mutation');
  assert.ok(receipt?.status === 'unknown' || refusal?.unknown === true,
    'durable-but-obsolete outcome must be explicit unknown, never committed/not-written');
  assert.equal(f.session.state.kv.get('l/plc.characters.v1'), 'ORIGINAL', 'obsolete guard must not repopulate the old session');
});

for (const kind of ['lease', 'caller']) test('unchanged target '+kind+' loss during read cannot commit', { timeout: 5000 }, async () => {
  const f = await fixture(); const gate = f.pauseRead(); let caller = true;
  let receipt, refusal;
  const pending = f.run('ORIGINAL', 'ORIGINAL', () => caller).then(value => { receipt = value; }, error => { refusal = { code: error.code, message: error.message }; });
  await gate.entered.promise;
  if (kind === 'lease') f.lease.owned = false; else caller = false;
  gate.release.resolve(); await pending;
  const actual = await f.stored();
  records.push({ name: 'unchanged-'+kind, reachedRead: true, revokedBeforeRelease: true, actual, attempts: f.calls(), receipt, refusal });
  assert.equal(actual, 'ORIGINAL'); assert.equal(f.calls(), 0);
  assert.ok(refusal || receipt?.status !== 'committed', 'unchanged data does not restore lost authority');
});
