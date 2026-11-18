// Where the app gets a model, a voice and the embedding set from is the configured model source, and only that (docs/APP-CONFIG.md).
// docs/evidence/split/model-urls-baseline.json is every address the app requested before the configuration existed (scripts/model-urls-snapshot.mjs).
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectModelUrls,BASELINE} from './links/model-urls.mjs';
import {buildAppConfig} from '../runtime/providers/app-config.mjs';

const DEFAULTS=JSON.parse(readFileSync(new URL('../app-config.json',import.meta.url),'utf8'));
const {format,note,...baseline}=JSON.parse(readFileSync(BASELINE,'utf8'));
const ROOT=DEFAULTS.modelSources[0].base;
const isApp=u=>u.startsWith('app:'); // the WebLLM libraries ship in the app (docs/RUNTIMES.md): they are not downloaded from the model source
const strip=(urls,root)=>JSON.parse(JSON.stringify(urls).split(root).join('<root>/'));
const restore=async(config,fresh)=>{const saved=globalThis.APP_CONFIG;globalThis.APP_CONFIG=config;try{const catalog=await import('../runtime/providers/catalog.mjs'+fresh);return await collectModelUrls({effectiveSources:catalog.resolveSources(null).sources,fresh});}finally{globalThis.APP_CONFIG=saved;}};

test('with the shipped configuration the app requests exactly the addresses it did before, each with its pin', async () => {
  const urls=await restore(globalThis.APP_CONFIG,'?default');
  assert.deepEqual(urls,baseline);
});

test('every default address is under the configured root: no other host is named', async () => {
  const urls=await restore(globalThis.APP_CONFIG,'?hosts');
  const all=[...Object.values(urls.tiers).flatMap(t=>Object.values(t)).flat(),...Object.values(urls.voices).flat()].map(f=>f.url);
  assert.ok(all.length>250);
  for(const u of all.filter(u=>!isApp(u)))assert.ok(u.startsWith(ROOT),u);
  assert.equal(all.filter(isApp).length,2,'exactly the two WebLLM libraries are app-served');
  assert.ok(urls.embedding.modelBase.startsWith(ROOT));
  assert.equal(urls.embedding.wasmBase,'app:chat/vendor/embedding/ort/','the ONNX Runtime files are served by the app, not by the model source');
});

test('an operator source changes where files come from and nothing else: same paths, same sizes, same SHA-256', async () => {
  const other='https://models.example.org/m/';
  const urls=await restore(buildAppConfig(DEFAULTS,{modelSources:[{id:'mine',label:'My models',base:other}]}),'?override');
  assert.deepEqual(strip(urls,other),strip(baseline,ROOT));
  const all=[...Object.values(urls.tiers).flatMap(t=>Object.values(t)).flat(),...Object.values(urls.voices).flat()].map(f=>f.url);
  for(const u of all.filter(u=>!isApp(u)))assert.ok(u.startsWith(other)&&!u.includes('privatelocal.chat'),u);
});

test('the catalog says when the source is not the shipped one', async () => {
  const saved=globalThis.APP_CONFIG;
  try{
    globalThis.APP_CONFIG=buildAppConfig(DEFAULTS);
    const shipped=(await import('../runtime/providers/catalog.mjs?label1')).resolveSources(null);
    assert.equal(shipped.overridden,false);assert.equal(shipped.label,'Private Local Chat project CDN');
    globalThis.APP_CONFIG=buildAppConfig(DEFAULTS,{modelSources:[{id:'mine',label:'My models',base:'https://models.example.org/m/'}]});
    const mine=(await import('../runtime/providers/catalog.mjs?label2')).resolveSources(null);
    assert.equal(mine.overridden,true);assert.equal(mine.label,'OVERRIDE: https://models.example.org');
  }finally{globalThis.APP_CONFIG=saved;}
});
