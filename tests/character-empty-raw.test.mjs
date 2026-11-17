// The empty-string CAS parser bug regression (T536): empty string is an accepted empty state AND exact raw CAS value; null means actual absence only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createCharacterStore, createMemoryLocks, CHARACTER_STORE_FORMAT, CHARACTER_STORE_LIMITS } from '../chat/characters/character-store.mjs';
import { realKvBackend, CHARACTER_KEY } from './helpers/character-write-scope.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const bundle = (n) => readFileSync(new URL(`examples/${n}.bundle.json`, fx), 'utf8');
const KEY = CHARACTER_KEY;

function emptyState() {
  return { format: CHARACTER_STORE_FORMAT, revision: 0, records: [] };
}

/** One independent real backend seeded with empty string, one fresh save, cold replay proves one exact admission. */
test('CH existing empty string is an actual CAS value', async () => {
  const b = await realKvBackend();
  await b.session.setKv('l/' + KEY, '');
  const raw0 = await b.replay();
  assert.equal(raw0, '', 'fresh replay returns the empty string seed');

  const storage = {
    getItem: (k) => b.app.local.getItem(k) ?? b.mirrorStorage.getItem(k),
    setItem: (k, v) => b.app.local.setItem(k, v),
    removeItem: (k) => b.app.local.removeItem(k),
  };
  const store = createCharacterStore({ storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: b.runWriteScope });

  const p = await store.prepare({ text: bundle('minimal') });
  assert.equal(p.ok, true, JSON.stringify(p));
  const c = await store.commit(p.preparation);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.status, 'admitted');

  const raw1 = await b.replay();
  const state = JSON.parse(raw1);
  assert.equal(state.format, CHARACTER_STORE_FORMAT);
  assert.equal(state.revision, 1);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].individualId, c.individualId);
  assert.equal(state.records[0].recordVersion, 1);
  assert.deepEqual(state.records[0].admissions, [p.preparation.admissionId]);

  const coldRaw = await b.coldRaw();
  assert.equal(coldRaw, raw1, 'cold session sees identical raw');
});

/** 20 independent real backends, each seeded empty; 4 concurrent stores each 2 saves at default wait; all 8 ACKs exactly once, unique ids, revision 8, cold replay/no loss/no mirror. */
test('CH empty string start: 4 actors x2 saves across 20 rounds', async () => {
  const REPEATS = 20;
  const ACTORS = 4;
  const OPS_PER = 2;
  const TOTAL_PER_ROUND = ACTORS * OPS_PER;

  for (let round = 0; round < REPEATS; round++) {
    const b = await realKvBackend();
    await b.session.setKv('l/' + KEY, '');

    const mirrorStats = { sets: 0, removes: 0 };
    const storage = {
      getItem: (k) => b.app.local.getItem(k) ?? b.mirrorStorage.getItem(k),
      setItem: (k, v) => { mirrorStats.sets += 1; b.app.local.setItem(k, v); },
      removeItem: (k) => { mirrorStats.removes += 1; b.app.local.removeItem(k); },
    };
    const locks = createMemoryLocks();
    const stores = Array.from({ length: ACTORS }, () =>
      createCharacterStore({ storage, key: KEY, locks, crypto: webcrypto, runWriteScope: b.runWriteScope })
    );

    const preps = await Promise.all(
      stores.flatMap((store) =>
        Array.from({ length: OPS_PER }, async () => {
          const p = await store.prepare({ text: bundle('minimal') });
          assert.equal(p.ok, true, JSON.stringify(p));
          return { store, preparation: p.preparation };
        })
      )
    );

    const acked = [];

    await Promise.all(
      preps.map(async ({ store, preparation }) => {
        for (let attempt = 0; attempt < 80; attempt++) {
          const out = await store.commit(preparation);
          if (out.ok) {
            acked.push({ out, admissionId: preparation.admissionId });
            return;
          }
          // Only a proven pre-put busy (lock wait exceeded) is retryable with the SAME preparation.
          // changed/unconfirmed/unreadable/write-refused must fail immediately.
          if (out.code !== 'busy') {
            assert.fail(`unexpected non-busy failure: ${JSON.stringify(out)}`);
          }
        }
        assert.fail('an intended save was never acknowledged');
      })
    );

    assert.equal(acked.length, TOTAL_PER_ROUND, `every intended save acknowledged exactly once in round ${round}`);

    const state = JSON.parse(await b.replay());
    assert.equal(state.records.length, TOTAL_PER_ROUND, `no loss, no duplicate in round ${round}`);
    assert.equal(new Set(state.records.map((x) => x.individualId)).size, TOTAL_PER_ROUND, `unique local ids in round ${round}`);

    for (const a of acked) {
      const rec = state.records.find((x) => x.individualId === a.out.individualId);
      assert.ok(rec, 'acknowledged record present');
      assert.deepEqual(rec.admissions, [a.admissionId]);
      assert.equal(rec.recordVersion, 1);
    }
    assert.equal(new Set(acked.map((a) => a.out.individualId)).size, TOTAL_PER_ROUND);
    assert.equal(state.revision, TOTAL_PER_ROUND, `one revision per admission in round ${round}`);

    assert.equal(await b.coldRaw(), await b.replay(), `cold session sees same raw in round ${round}`);

    assert.equal(mirrorStats.sets, 0, `mirror was never written (sets) in round ${round}`);
    assert.equal(mirrorStats.removes, 0, `mirror was never written (removes) in round ${round}`);
  }
});

/** Actual absence (null) also saves; fresh replay shows admission. */
test('CH absent raw remains actual absence', async () => {
  const b = await realKvBackend();
  const raw0 = await b.replay();
  assert.equal(raw0, null, 'fresh replay returns null for absent key');

  const storage = {
    getItem: (k) => b.app.local.getItem(k) ?? b.mirrorStorage.getItem(k),
    setItem: (k, v) => b.app.local.setItem(k, v),
    removeItem: (k) => b.app.local.removeItem(k),
  };
  const store = createCharacterStore({ storage, key: KEY, locks: createMemoryLocks(), crypto: webcrypto, runWriteScope: b.runWriteScope });

  const p = await store.prepare({ text: bundle('minimal') });
  assert.equal(p.ok, true, JSON.stringify(p));
  const c = await store.commit(p.preparation);
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.equal(c.status, 'admitted');

  const raw1 = await b.replay();
  const state = JSON.parse(raw1);
  assert.equal(state.format, CHARACTER_STORE_FORMAT);
  assert.equal(state.revision, 1);
  assert.equal(state.records.length, 1);
  assert.equal(state.records[0].individualId, c.individualId);
  assert.equal(state.records[0].recordVersion, 1);
  assert.deepEqual(state.records[0].admissions, [p.preparation.admissionId]);

  const coldRaw = await b.coldRaw();
  assert.equal(coldRaw, raw1, 'cold session sees identical raw');
});