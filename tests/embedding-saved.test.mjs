import './helpers/install-app-config.mjs'; // the model sources the build writes into the page (docs/APP-CONFIG.md)
import test from 'node:test';
import assert from 'node:assert/strict';
import {embeddingSaved} from '../chat/embedding/embedding-saved.mjs';
import {EMBEDDING_MODEL_BASE} from '../chat/embedding/embedding-config.mjs';

const storage=(caches)=>({keys:async()=>Object.keys(caches),open:async n=>({keys:async()=>caches[n].map(url=>({url}))})});
test('the matching model counts as saved when its model file is in a cache',async()=>{
  assert.equal(await embeddingSaved(storage({a:['https://x.test/other.onnx'],b:[EMBEDDING_MODEL_BASE+'onnx/model.onnx']})),true);
});
test('only its config files, another site, or nothing at all is "not saved"',async()=>{
  assert.equal(await embeddingSaved(storage({a:[EMBEDDING_MODEL_BASE+'tokenizer_config.json']})),false);
  assert.equal(await embeddingSaved(storage({})),false);
});
test('a browser that cannot say, or a failure, is null and never throws',async()=>{
  assert.equal(await embeddingSaved(undefined),null);
  assert.equal(await embeddingSaved({keys:async()=>{throw new Error('no');}}),null);
});
