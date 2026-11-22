// The neutral rich entry (1.2.0): the same receiving results as the full entry for the one target it carries, and nothing of any other project.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {neutralClosure} from '../scripts/neutral-closure.mjs';
import * as rich from '../neutral/rich.mjs';
import * as full from '../authored-profiles/authored.mjs';
import {RECEIVING_DEFINITIONS} from '../authored-profiles/receiving-definitions.mjs';
import {packaged} from '../authored-profiles/tests/helpers.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = {crypto: webcrypto};

test('the closure of the rich entry holds no other project, no web address and none of the full entry\'s receiver files', async () => {
  const files = await neutralClosure('neutral/rich.mjs');
  for (const banned of ['authored-profiles/receiving/sonalon.mjs', 'authored-profiles/receiving-definitions.mjs', 'authored-profiles/authored.mjs',
    'src/core/consumer-projections.mjs', 'src/core/content-schema.mjs', 'src/core/content.mjs', 'src/core/bundles.mjs'])
    assert.equal(files.includes(banned), false, banned);
  for (const file of files) {
    const text = await readFile(root + file, 'utf8');
    assert.doesNotMatch(text, /sonalon|cyberplanetary|aiofourown|json-schema\.org|https?:\/\//i, file);
  }
});

test('the rich entry gives the same receiving results as the full entry for the target plc, on both routes', async () => {
  for (const name of ['minimal', 'neri', 'bex']) {
    const {bundle} = await packaged(name), subjectId = `subject:${name === 'minimal' ? 'pip' : name}`, input = JSON.stringify(bundle);
    for (const route of ['file', 'fragment']) {
      const a = await rich.receivingFixture(input, {target: 'plc', subjectId, route, ...options});
      const b = await full.receivingFixture(input, {target: 'plc', subjectId, route, ...options});
      assert.deepEqual(a, b, `${name} ${route}`);
      assert.ok(a.value && typeof a.value.prompt === 'string', `${name}: a preset is produced`);
    }
    const calls = []; const validate = value => { calls.push(value.id); return {ok: true}; };
    const withValidate = await rich.receivingFixture(input, {target: 'plc', subjectId, validate, ...options});
    assert.deepEqual(withValidate, await full.receivingFixture(input, {target: 'plc', subjectId, validate: v => ({ok: true}), ...options}));
    assert.ok(calls.length >= 1, 'the receiver callback ran');
  }
});

test('the rich entry opens the same bundles as the others and shares their limits', async () => {
  const {bundle} = await packaged('bex'), input = JSON.stringify(bundle);
  const a = await rich.openAuthored(input, options), b = await full.openAuthored(input, options);
  assert.deepEqual(a.document, b.document);
  assert.deepEqual(rich.LIMITS, full.LIMITS);
  assert.deepEqual(rich.PLC_PROVISIONAL_LIMITS, full.PLC_PROVISIONAL_LIMITS);
});

test('another target is unknown to the rich entry, and a fragment is only for the plain preset', async () => {
  const {bundle} = await packaged('minimal'), input = JSON.stringify(bundle);
  await assert.rejects(rich.receivingFixture(input, {target: 'sonalon', subjectId: 'subject:pip', ...options}), e => /Unknown target/.test(e.errors?.[0]?.message || e.message));
  await assert.rejects(rich.receivingFixture(input, {target: 'plc', subjectId: 'subject:pip', route: 'carrier', ...options}), e => /route/i.test(JSON.stringify(e.errors || e.message)));
  assert.equal('exportAuthored' in rich, false, 'the rich entry is for receiving, not for exporting');
});

test('the receiving data is per target and composes to exactly the full set', async () => {
  const {CORE_ASPECTS, CORE_PROFILES} = await import('../authored-profiles/receiving/core.mjs');
  const {PLC_ASPECTS, PLC_CONSUMED} = await import('../authored-profiles/receiving/plc.mjs');
  const {SONALON_ASPECTS} = await import('../authored-profiles/receiving/sonalon.mjs');
  assert.deepEqual(RECEIVING_DEFINITIONS.aspectDefinitions.map(d => d.id), ['core:identity', 'core:dossier', 'core:communication', 'core:voice',
    'sonalon:design-metadata', 'sonalon:authored-sections', 'sonalon:voice-sections', 'sonalon:start']);
  assert.deepEqual(RECEIVING_DEFINITIONS.profiles, CORE_PROFILES);
  assert.deepEqual([...CORE_ASPECTS, ...PLC_ASPECTS].map(d => d.id).sort(), [...PLC_CONSUMED].sort());
  assert.ok(SONALON_ASPECTS.every(d => d.id.startsWith('sonalon:') || d.id === 'core:voice'));
});
