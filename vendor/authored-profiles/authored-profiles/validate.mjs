// Read-only executable check of all committed packages, resources and fixed receiving outputs.
import assert from 'node:assert/strict';
import {packaged, projections, json} from './tests/helpers.mjs';
for (const name of ['minimal', 'neri', 'bex']) {
  const {bundle, candidate} = await packaged(name);
  assert.deepEqual(bundle, await json(`examples/${name}.bundle.json`));
  assert.deepEqual(await projections(bundle, name), await json(`fixtures/${name}.receiving.json`));
  console.log(JSON.stringify({name, valid: true, root: bundle.root,
    records: bundle.records.length, verifiedInlineAssets: candidate.inlineBytes.size,
    admissionReady: false, runtimeReady: false}));
}
