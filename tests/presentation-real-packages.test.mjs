// The view model run on Cosmogenitor's REAL first packages (T432), not only on inputs built to the T415 shape.
// The adapter below is test-only: it does the one job the production opener will do later (T444 with the shared validator, T705): find each
// asset's bytes in the bundle, check them against the SHA-256 in the record, and hand the view model only what was verified. The bundle is
// NOT validated here: that is the shared package's job; these files are valid by Cosmogenitor's own validator.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildCharacterPresentation} from '../chat/presentation/view-model.mjs';

const load = (name) => JSON.parse(readFileSync(new URL('./fixtures/presentation/' + name + '.bundle.json', import.meta.url), 'utf8'));
const aspectsOf = (bundle) => {
  const out = {subject: {}, context: {}}, omitted = [];
  for (const subject of bundle.content.subjects || []) for (const aspect of subject.aspects || []) {
    const scope = aspect.scope?.kind === 'context' ? 'context' : 'subject';
    if (aspect.definition === 'authored:presentation-v1') out[scope].presentation = aspect.value;
    else if (aspect.definition === 'authored:media-v1') out[scope].media = aspect.value;
    else if (!/^(core:|authored:identity-v1$)/.test(aspect.definition)) omitted.push(aspect.definition);
  }
  return {aspects: out, omittedAspects: omitted};
};
const verifiedAssets = (bundle) => {
  const byHash = new Map((bundle.assets || []).map((a) => [a.hash, a]));
  const out = {};
  for (const record of bundle.content.assets || []) {
    const entry = byHash.get(record.sha256);
    let verified = false;
    if (entry && entry.status === 'inline' && typeof entry.data === 'string') {
      const bytes = Buffer.from(entry.data, 'base64');
      verified = 'sha256:' + createHash('sha256').update(bytes).digest('hex') === record.sha256 && bytes.length === record.size;
    }
    out[record.id] = {mediaType: record.mediaType, size: record.size, sha256: record.sha256, verified};
  }
  return out;
};

test('lantern-keeper: shows folio, sea, the portrait and the background with attribution; names the chime; the extra aspect is the opener\'s omission', () => {
  const bundle = load('lantern-keeper'), {aspects, omittedAspects} = aspectsOf(bundle);
  const view = buildCharacterPresentation({aspects, assets: verifiedAssets(bundle)}).agent;
  assert.equal(view.refused, null); assert.equal(view.usesDefault, false);
  assert.equal(view.layout, 'folio'); assert.equal(view.palette, 'sea'); assert.equal(view.reducedMotion, true);
  assert.deepEqual(view.images.map((i) => [i.assetId, i.role, i.license]), [['asset:lantern-portrait', 'portrait', 'CC0-1.0'], ['asset:lantern-background', 'background', 'CC0-1.0']]);
  assert.ok(view.images.every((i) => i.alt && i.author && i.mediaType === 'image/png' && i.sha256.startsWith('sha256:')));
  assert.equal(view.images[1].hideFromAssistiveTech, true);
  assert.deepEqual(view.omissions, [{kind: 'asset', id: 'asset:lantern-chime', reason: 'purpose-not-supported-here'}]);
  assert.deepEqual(omittedAspects, ['experimental:presentation-v2'], 'the aspect PLC cannot interpret is left out before the view model, and named by the opener');
});

test('ferry-clerk: the required portrait has no bytes, so the presentation is refused with a named reason and the character is kept', () => {
  const bundle = load('ferry-clerk'), {aspects} = aspectsOf(bundle);
  const assets = verifiedAssets(bundle);
  assert.equal(assets['asset:clerk-portrait'].verified, false);
  const view = buildCharacterPresentation({aspects, assets}).agent;
  assert.equal(view.usesDefault, true); assert.equal(view.layout, null); assert.equal(view.images.length, 0);
  assert.deepEqual(view.refused, {reason: 'required-asset-unavailable:asset-bytes-not-verified', asset: 'asset:clerk-portrait'});
  assert.ok(bundle.content.subjects[0].aspects.some((a) => a.definition === 'core:identity'), 'the character itself is still in the bundle for the plain route');
});

test('a changed byte in a real asset is not shown: the view model only sees what the hash check passed', () => {
  const bundle = load('lantern-keeper');
  const portrait = bundle.assets.find((a) => a.hash === bundle.content.assets.find((r) => r.id === 'asset:lantern-portrait').sha256);
  const bytes = Buffer.from(portrait.data, 'base64'); bytes[bytes.length - 1] ^= 1; portrait.data = bytes.toString('base64');
  const {aspects} = aspectsOf(bundle);
  const view = buildCharacterPresentation({aspects, assets: verifiedAssets(bundle)}).agent;
  assert.deepEqual(view.images.map((i) => i.assetId), ['asset:lantern-background']);
  assert.deepEqual(view.omissions.map((o) => o.id + ':' + o.reason), ['asset:lantern-portrait:asset-bytes-not-verified', 'asset:lantern-chime:purpose-not-supported-here']);
  assert.equal(view.refused, null, 'the portrait is optional in this package, so only that image is dropped');
});
