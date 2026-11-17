import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {refreshCompatSymbols} from '../ops/native/native-symbols.mjs';
test('the actual SDK decoder resolves refreshed native indices and preserves unknown gaps',async()=>{
 const original=await readFile('ops/native/base-wllama-v1q.js','utf8');const refreshed=refreshCompatSymbols(original,'188:ggml_abort\n656:__wrap_abort\n7373:create_webgpu_device λ callback\n');
 const sdk=await import('data:text/javascript;base64,'+Buffer.from(refreshed+'\nexport {Debug};').toString('base64'));
 const rows=await sdk.Debug.decodeFuncIds([188,656,7373,500,9999],true);
 assert.deepEqual(rows.map(x=>x.name),['ggml_abort','__wrap_abort','create_webgpu_device λ callback','(unknown)','(unknown)']);
 assert.throws(()=>refreshCompatSymbols(original,'1:a\n1:b'),/Duplicate/);assert.throws(()=>refreshCompatSymbols(original,'malformed'),/Invalid/);
});
