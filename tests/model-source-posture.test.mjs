import assert from 'node:assert/strict';
import test from 'node:test';
import { sourcePosture } from '../chat/models/source-posture.mjs';
import { applyPosture, normalizeSources } from '../runtime/providers/sources-core.mjs';
import { checkSiteConfig, clientConfig } from '../scripts/public-site.mjs';

test('neutral builds accept personal sources and curated builds allow only operator source bases', () => {
  const operator = [{ id: 'official', base: 'https://approved.example/models' }];
  const candidates = normalizeSources([
    { id: 'same-site', base: 'https://approved.example/models/' },
    { id: 'other-path', base: 'https://approved.example/elsewhere/' },
    { id: 'personal', base: 'https://personal.example/models/' },
    { id: 'local', files: new Map() },
  ]);

  const neutral = clientConfig(checkSiteConfig({}));
  assert.deepEqual(applyPosture(candidates, sourcePosture(neutral.modelSourcePosture, operator)).refused, []);
  const curated = clientConfig(checkSiteConfig({ modelSourcePosture: 'curated' }));
  assert.deepEqual(applyPosture(candidates, sourcePosture(curated.modelSourcePosture, operator)).refused, [
    'other-path', 'personal',
  ]);
  assert.throws(() => checkSiteConfig({ modelSourcePosture: 'typo' }), /modelSourcePosture/);
});
