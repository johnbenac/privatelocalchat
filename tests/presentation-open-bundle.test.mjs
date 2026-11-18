// Opening Cosmogenitor's real packages through the REAL shared validator (vendor/authored-profiles, board T705) and the view model (T444).
// Nothing here is a copy of the validator's rules: the package refuses or accepts, and these tests check what PLC then shows.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {openAuthored} from '../vendor/authored-profiles/authored-profiles/index.mjs';
import {openPresentationBundle, MAX_PACKAGE_CHARS, MAX_CHARACTERS} from '../chat/presentation/open-bundle.mjs';

const raw = (name) => readFileSync(new URL('./fixtures/presentation/' + name + '.bundle.json', import.meta.url), 'utf8');
const open = (text) => openPresentationBundle(text, {openAuthored});

test('lantern-keeper: one character, folio and sea, a portrait and a background drawn from verified bytes, the chime named, other parts listed', async () => {
  const r = await open(raw('lantern-keeper'));
  assert.equal(r.ok, true); assert.equal(r.characters.length, 1);
  const c = r.characters[0];
  assert.deepEqual([c.id, c.label], ['subject:lantern-keeper', 'Lantern Keeper']);
  assert.equal(c.view.refused, null); assert.equal(c.view.layout, 'folio'); assert.equal(c.view.palette, 'sea');
  assert.deepEqual(c.view.images.map((i) => [i.assetId, i.role]), [['asset:lantern-portrait', 'portrait'], ['asset:lantern-background', 'background']]);
  assert.deepEqual(c.view.omissions, [{kind: 'asset', id: 'asset:lantern-chime', reason: 'purpose-not-supported-here'}]);
  assert.ok(c.otherAspects.includes('experimental:presentation-v2') && c.otherAspects.includes('core:identity'), 'what is not used is named, not hidden: ' + c.otherAspects);
  assert.ok(!c.otherAspects.includes('authored:presentation-v1') && !c.otherAspects.includes('authored:media-v1'));
  assert.deepEqual([...r.assetBytes.keys()], ['asset:lantern-portrait', 'asset:lantern-background'], 'only the images that are shown, not the chime');
  for (const [id, bytes] of r.assetBytes) {
    assert.ok(bytes instanceof Uint8Array && bytes.length > 0);
    const image = c.view.images.find((i) => i.assetId === id);
    assert.equal('sha256:' + createHash('sha256').update(bytes).digest('hex'), image.sha256, 'the drawn bytes are exactly the ones the record names');
    assert.equal(bytes.length, image.size); assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], 'a PNG');
  }
});

test('ferry-clerk: the package opens, the character is listed, and its presentation is refused with the reason (required portrait has no bytes)', async () => {
  const r = await open(raw('ferry-clerk'));
  assert.equal(r.ok, true); assert.equal(r.characters.length, 1);
  const c = r.characters[0];
  assert.equal(c.label, 'Ferry Clerk');
  assert.equal(c.view.usesDefault, true); assert.equal(c.view.layout, null); assert.equal(c.view.images.length, 0);
  assert.deepEqual(c.view.refused, {reason: 'required-asset-unavailable:asset-bytes-not-verified', asset: 'asset:clerk-portrait'});
  assert.equal(r.assetBytes.size, 0);
});

test('one changed byte in a real asset refuses the whole package: the validator checks exact bytes and PLC shows nothing of it', async () => {
  const bundle = JSON.parse(raw('lantern-keeper'));
  const asset = bundle.assets.find((a) => a.data); const bytes = Buffer.from(asset.data, 'base64'); bytes[bytes.length - 1] ^= 1; asset.data = bytes.toString('base64');
  const r = await open(JSON.stringify(bundle));
  assert.equal(r.ok, false); assert.equal(r.reason, 'refused-by-validator'); assert.equal(r.code, 'byte-integrity');
  assert.ok(!('characters' in r), 'no partial result');
});

test('input that is not a package is refused with a reason and no exception', async () => {
  for (const [input, reason] of [['', 'not-a-package'], ['   ', 'not-a-package'], [null, 'not-a-package'], [{}, 'not-a-package'], ['not json', 'refused-by-validator'], ['{}', 'refused-by-validator'], ['[]', 'refused-by-validator'], ['x'.repeat(MAX_PACKAGE_CHARS + 1), 'too-large']]) {
    const r = await open(input);
    assert.equal(r.ok, false, JSON.stringify(input).slice(0, 30)); assert.equal(r.reason, reason, JSON.stringify(input).slice(0, 30)); assert.ok(r.message);
  }
});

test('a validator that throws something odd, or returns something unexpected, is a refusal and not a crash', async () => {
  assert.equal((await openPresentationBundle('{}', {openAuthored: async () => { throw 'boom'; }})).reason, 'refused-by-validator');
  assert.equal((await openPresentationBundle('{}', {openAuthored: async () => { throw Object.assign(new Error('x'), {errors: [{code: 'c'.repeat(500)}]}); }})).code.length, 64);
  assert.equal((await openPresentationBundle('{}', {openAuthored: async () => null})).reason, 'unexpected-result');
  assert.equal((await openPresentationBundle('{}', {openAuthored: async () => ({document: {subjects: []}, inlineBytes: {}})})).reason, 'unexpected-result');
  await assert.rejects(() => openPresentationBundle('{}'), /needs the validator/);
});

test('bytes the validator did not verify, or of the wrong size, are never given to the view model', async () => {
  const fake = (bytes, size) => async () => ({
    document: {subjects: [{id: 's', label: 'S', aspects: [
      {definition: 'authored:presentation-v1', scope: {kind: 'subject'}, value: {version: '1.0.0', layout: 'dialogue', assets: ['a']}},
      {definition: 'authored:media-v1', scope: {kind: 'subject'}, value: {version: '1.0.0', resources: [{asset: 'a', required: true, purpose: 'illustration', alt: 'x', author: 'y', license: 'CC0-1.0'}]}}]}],
    assets: [{id: 'a', mediaType: 'image/png', sha256: 'sha256:' + 'a'.repeat(64), size}]},
    inlineBytes: new Map(bytes ? [['sha256:' + 'a'.repeat(64), bytes]] : [])
  });
  const good = await openPresentationBundle('{}', {openAuthored: fake(new Uint8Array(10), 10)});
  assert.equal(good.characters[0].view.refused, null); assert.equal(good.assetBytes.get('a').length, 10);
  assert.equal((await openPresentationBundle('{}', {openAuthored: fake(null, 10)})).characters[0].view.refused.reason, 'required-asset-unavailable:asset-bytes-not-verified');
  assert.equal((await openPresentationBundle('{}', {openAuthored: fake(new Uint8Array(9), 10)})).characters[0].view.refused.reason, 'required-asset-unavailable:asset-bytes-not-verified');
});

test('a context-scope presentation is not taken as the character\'s own, and a package with many characters is cut at a bound, said plainly', async () => {
  const many = async () => ({
    document: {subjects: Array.from({length: MAX_CHARACTERS + 3}, (_, i) => ({id: 's' + i, label: 'S' + i, aspects: [
      {definition: 'authored:presentation-v1', scope: {kind: 'context'}, value: {version: '1.0.0', layout: 'folio'}}]})), assets: []},
    inlineBytes: new Map()
  });
  const r = await openPresentationBundle('{}', {openAuthored: many});
  assert.equal(r.characters.length, MAX_CHARACTERS);
  assert.ok(r.characters.every((c) => c.view.usesDefault && c.view.layout === null), 'a context-scope value is the scene, not this character');
  assert.deepEqual(r.omissions, [{kind: 'characters', id: '3', reason: 'more-than-shown'}]);
});

test('the result is frozen and opening does not change the input', async () => {
  const text = raw('lantern-keeper'); const before = text.slice();
  const r = await open(text);
  assert.equal(text, before);
  assert.ok(Object.isFrozen(r) && Object.isFrozen(r.characters) && Object.isFrozen(r.characters[0]) && Object.isFrozen(r.characters[0].otherAspects));
});
