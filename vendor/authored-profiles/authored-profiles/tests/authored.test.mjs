import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, webcrypto} from 'node:crypto';
import {CONTENT_SCHEMA, createRegistry, registerDefinitions, parseContent}
  from '../../src/core/content.mjs';
import {exportBundle} from '../../src/core/bundles.mjs';
import {DEFINITIONS, LIMITS, loadRegistry, parseDefinitions, validateAuthored, exportAuthored,
  openAuthored, receivingFixture} from '../authored.mjs';
import {example, packaged, projections, json, read, root} from './helpers.mjs';
const clone = structuredClone;
const options = {crypto: webcrypto};
const values = {minimal: ['subject:pip'], neri: ['asset:card','asset:chart','context:archive',
  'subject:harbour','subject:neri','subject:neri-harbour'], bex: ['asset:cue','subject:bex']};
const roots = {minimal: 'sha256:1166f778b0384194de981571c3b6c615f249a25fb6c3f364a8f46f0727464e8d',
  neri: 'sha256:f1dfe5b54eb3eb084684dba9d1d19b66cb6f950489378428052093e5196fecaf',
  bex: 'sha256:eec3a4bac6b3fbec047b7f67659b5ab69b6cedec1cbcbf0542c2cab53d346555'};
const find = (d, id) => d.subjects[0].aspects.find(a => a.definition === id);
const hasCode = code => e => e.errors?.some(x => x.code === code);
const make = async (source, extra = {}) => exportAuthored(source.document, source.registry, {
  selection: {kind: 'subject', ids: [source.document.subjects[0].id]}, ...options, ...extra});

test('versioned JSON resource equals runtime data and safe parser loads custom snapshots', async () => {
  assert.deepEqual(parseDefinitions(await read('definitions.v1.json')), DEFINITIONS);
  assert.equal(DEFINITIONS.aspectDefinitions.length, 7);
  const base = await example('minimal');
  assert.ok(Object.isFrozen(base.registry));
  assert.equal(base.document.subjects[0].aspects, undefined);
  assert.throws(()=>loadRegistry('invalid'),hasCode('registry'));
  const starter=parseDefinitions(await read('../content/starter-registry.json'));
  assert.throws(()=>loadRegistry(starter,{format:'future/2'}),hasCode('profile-version'));
});

test('reported standing records a source assertion without authenticating it or granting firsthand standing', async () => {
  const s=await example('bex');
  find(s.document,'authored:evidence-v1').value.entries[0].standing='reported';
  assert.equal(validateAuthored(s.document,s.registry).valid,true);
  const bundle=await make(s);
  const r=await receivingFixture(bundle,{target:'plc',subjectId:'subject:bex',...options});
  assert.ok(r.value); assert.ok(!r.value.prompt.includes('fabricated rehearsal'));
  assert.ok(r.omissions.some(x=>x.id==='aspect:bex-evidence'));
  delete find(s.document,'authored:evidence-v1').value.entries[0].occurrence;
  assert.ok(validateAuthored(s.document,s.registry).errors.some(x=>x.code==='provenance'));
});

for (const name of ['minimal','neri','bex']) test(`${name}: actual dependency-closed bundle and fixed projection/bytes`, async () => {
  const {document, registry, bytes, bundle, candidate} = await packaged(name);
  assert.equal(validateAuthored(document, registry).valid, true);
  assert.equal(bundle.format, 'cosmogenitor/bundle/0');
  assert.equal(bundle.root, roots[name]);
  assert.deepEqual(bundle, await json(`examples/${name}.bundle.json`));
  assert.deepEqual(bundle.records.map(r => r.id).sort(), values[name]);
  assert.deepEqual(candidate.document, bundle.content);
  assert.equal(candidate.missing.length, 0);
  assert.equal(candidate.inlineBytes.size, name === 'minimal' ? 0 : name === 'neri' ? 2 : 1);
  for (const asset of candidate.document.assets || []) {
    assert.equal(asset.availability, 'missing');
    assert.deepEqual(candidate.inlineBytes.get(asset.sha256), bytes.get(asset.sha256));
    assert.equal('sha256:' + createHash('sha256').update(bytes.get(asset.sha256)).digest('hex'), asset.sha256);
    assert.equal(bytes.get(asset.sha256).length, asset.size);
  }
  const reports = await projections(bundle, name);
  assert.deepEqual(reports, await json(`fixtures/${name}.receiving.json`));
  assert.equal(reports.plc.value.name, name === 'minimal' ? 'Pip' : name === 'neri' ? 'Neri' : 'Bex');
  assert.equal(reports.plc.value.id, `cosmogenitor:subject:${name === 'minimal' ? 'pip' : name}`);
  assert.equal(reports.plc.admissionReady, false);
  assert.equal(reports.sonalon.value, null);
  assert.ok(reports.sonalon.projection.missing.some(x => x.source === 'sonalon:design-metadata'));
  assert.equal(reports.sonalon.runtimeReady, false);
  assert.deepEqual((await exportAuthored(candidate.document, candidate.registry, {
    ...options, selection: candidate.selection, visibility: candidate.visibility, audience: candidate.audience,
    byteMode: 'inline', readAsset: async h => candidate.inlineBytes.get(h)})), bundle);
});

test('custom local festival profile is data-only, retained and explicitly omitted by targets', async () => {
  const {bundle,candidate} = await packaged('bex');
  const signal = find(candidate.document, 'festival:signal');
  assert.deepEqual(signal.value, {colour: 'amber', beats: 3});
  assert.equal(candidate.registry.profiles.find(p => p.id === 'festival:lantern').version, '1');
  const result = await receivingFixture(bundle, {target: 'plc', subjectId: 'subject:bex', ...options});
  assert.ok(result.omissions.some(x => x.id === 'festival:lantern'));
  assert.ok(result.omissions.some(x => x.id === 'aspect:bex-lantern'));
  assert.ok(!result.value.prompt.includes('amber'));
});

for (const fixture of await json('fixtures/negative-cases.json')) test(`negative: ${fixture.name}`, async () => {
  const {document,registry} = await example(fixture.example);
  const value = find(document, fixture.aspect).value;
  let parent = value;
  for (const key of fixture.path.slice(0,-1)) parent = parent[key];
  if (fixture.delete) delete parent[fixture.path.at(-1)];
  else parent[fixture.path.at(-1)] = fixture.value;
  const report = validateAuthored(document,registry);
  assert.equal(report.valid, false);
  assert.ok(report.errors.some(e => e.code === fixture.code), JSON.stringify(report));
  await assert.rejects(exportAuthored(document,registry,options));
});

for (const c of await json('fixtures/receiving-cases.json')) test(`receiving: ${c.id}`, async () => {
  const s = await example(c.example);
  if (c.mode === 'required-prepared') find(s.document, 'authored:prepared-v1').required = true;
  if (c.mode === 'required-festival') s.document.subjects[0].requires = ['festival:lantern'];
  const bundle = await make(s, c.mode === 'metadata' ? {byteMode: 'metadata'} :
    {byteMode: 'inline', readAsset: async h => s.bytes.get(h)});
  let calls = 0;
  const result = await receivingFixture(bundle, {target: c.target,
    subjectId: s.document.subjects[0].id, purpose: c.purpose,
    validate: () => { calls++; return {ok:true}; }, ...options});
  if (c.expectedError) {
    assert.equal(result.value,null);
    assert.ok(result.errors.some(e => e.code === c.expectedError));
    assert.equal(calls,0, 'refuse before receiver callback and any candidate');
  } else {
    assert.ok(result.omissions.some(x => x.id === 'asset:cue' && x.reason === 'optional bytes unavailable'));
    assert.equal(result.resources[0].status, 'metadata-only');
    assert.equal(result.value === null, c.target === 'sonalon');
  }
  assert.equal(result.admissionReady,false);
});

test('unknown optional aspect survives actual bundle; required refuses without partial result', async () => {
  const s = await example('minimal');
  s.document.subjects[0].aspects = [{id:'aspect:future',definition:'future:meaning',
    scope:{kind:'subject'},value:{payload:['unfamiliar',3]}}];
  const bundle = await make(s);
  const opened = await openAuthored(bundle, options);
  assert.deepEqual(opened.document.subjects[0].aspects[0].value,{payload:['unfamiliar',3]});
  assert.equal(opened.support.supported,false);
  assert.equal(opened.support.executionReady,true);
  assert.ok((await receivingFixture(bundle,{target:'plc',subjectId:'subject:pip',...options})).value);
  s.document.subjects[0].aspects[0].required = true;
  const required = await receivingFixture(await make(s),{target:'plc',subjectId:'subject:pip',...options});
  assert.equal(required.value,null);
  assert.ok(required.errors.some(e => e.code === 'required-support'));
});

test('a required incompatible aspect on a dependency refuses the whole receiver candidate', async () => {
  const s = await example('neri');
  s.document.subjects[1].aspects = [{id:'aspect:harbour-guidance',definition:'authored:guidance-v1',
    required:true,scope:{kind:'subject'},value:{version:'1.0.0'}}];
  const result = await receivingFixture(await make(s), {target:'plc',subjectId:'subject:neri',...options});
  assert.equal(result.value,null);
  assert.ok(result.errors.some(e => e.code === 'required-aspect'));
});

test('an unfamiliar future major uses the same registry without weakening known v1 meanings', async () => {
  const s=await example('minimal');
  const registry=registerDefinitions(s.registry,{aspectDefinitions:[{
    id:'authored:future-v2',version:'2.0.0',label:'Future',definition:'Unfamiliar meaning.',
    schema:{type:'object'}}]});
  s.document.subjects[0].aspects=[{id:'aspect:future',definition:'authored:future-v2',
    scope:{kind:'subject'},value:{version:'2.0.0',newMeaning:'retained'}}];
  const bundle=await make({...s,registry});
  const r=await receivingFixture(bundle,{target:'plc',subjectId:'subject:pip',...options});
  assert.ok(r.value); assert.ok(r.omissions.some(x=>x.id==='aspect:future'));
  s.document.subjects[0].aspects[0].required=true;
  const refused=await receivingFixture(await make({...s,registry}),
    {target:'plc',subjectId:'subject:pip',...options});
  assert.equal(refused.value,null);
  assert.ok(refused.errors.some(x=>x.code==='required-aspect'));
});

for (const kind of ['new-version','remote-schema']) test(`optional consumed ${kind} is omitted before projection; required refuses`, async () => {
  const s=await example('bex');
  const registry=clone(s.registry);
  const d=registry.aspectDefinitions.find(x=>x.id==='core:identity');
  if(kind==='new-version') d.version='2';
  else d.schema={$ref:'https://invalid.example/core'};
  find(s.document,'core:identity').value.premise='INCOMPATIBLE PREMISE MUST BE OMITTED';
  let bundle=await make({...s,registry});
  const r=await receivingFixture(bundle,{target:'plc',subjectId:'subject:bex',...options});
  assert.ok(r.value);
  assert.ok(r.omissions.some(x=>x.id==='aspect:bex-identity'));
  assert.ok(!r.value.prompt.includes('INCOMPATIBLE'));
  find(s.document,'core:identity').required=true;
  bundle=await make({...s,registry});
  let calls=0;
  const required=await receivingFixture(bundle,{target:'plc',subjectId:'subject:bex',...options,
    validate:()=>{calls++;return {ok:true};}});
  assert.equal(required.value,null); assert.equal(calls,0);
});

test('registry substitution and newer protected definition cannot weaken schema or version checks', async () => {
  const s = await example('bex');
  const forged = clone(s.registry);
  forged.aspectDefinitions.find(d => d.id === 'authored:prepared-v1').schema = true;
  assert.equal(validateAuthored(s.document,forged).valid,false);
  find(s.document,'authored:prepared-v1').value.states = 'invalid';
  assert.equal(validateAuthored(s.document,forged).valid,false);
  const v = clone(DEFINITIONS); v.aspectDefinitions[0].version = '2.0.0';
  const starter = parseDefinitions(await read('../content/starter-registry.json'));
  assert.throws(() => loadRegistry(starter,v),hasCode('profile-version'));
});

test('T15-valid data with authored semantic defects is refused on actual import too', async () => {
  const s = await example('bex');
  find(s.document,'authored:prepared-v1').value.states[0].when[0].equals='undeclared';
  const raw = await exportBundle(s.document,s.registry,{...options});
  await assert.rejects(openAuthored(JSON.stringify(raw),options),hasCode('condition'));
  const weakened=clone(s.registry);
  weakened.aspectDefinitions.find(d=>d.id==='authored:evidence-v1').schema={type:'object'};
  find(s.document,'authored:prepared-v1').value.states[0].when[0].equals='play';
  find(s.document,'authored:evidence-v1').value.entries[0].standing='firsthand';
  const forged=await exportBundle(s.document,weakened,options);
  await assert.rejects(openAuthored(forged,options),hasCode('schema'));
});

test('public export refuses private fields and audiences; explicit redaction succeeds', async () => {
  const s = await example('neri');
  await assert.rejects(make(s,{visibility:'public'}));
  for (const a of s.document.subjects[0].aspects) {
    delete a.value.privateNote; delete a.value.authorBackstory;
    for (const e of a.value.entries || []) e.audience = ['public'];
  }
  const bundle = await make(s,{visibility:'public'});
  assert.equal(bundle.visibility,'public');
  assert.ok(!JSON.stringify(bundle).includes('Private drafting'));
  const privateSource = await packaged('neri');
  const report = await receivingFixture(privateSource.bundle,{target:'plc',subjectId:'subject:neri',...options});
  assert.ok(!report.value.prompt.includes('abandon the archive'));
  assert.ok(!report.value.prompt.includes('lost ledger'));
});

test('missing/corrupt/undeclared resources fail at the actual boundaries', async () => {
  const s = await example('bex');
  const broken = clone(s.document); delete broken.assets;
  assert.equal(validateAuthored(broken,s.registry).valid,false);
  find(s.document,'authored:media-v1').value.resources = [];
  assert.ok(validateAuthored(s.document,s.registry).errors.some(e => e.code === 'undeclared-resource'));
  const {bundle} = await packaged('bex');
  bundle.assets[0].data = 'AAAA'; // inline bytes are not part of metadata root, must fail byte verification
  await assert.rejects(openAuthored(bundle,options),hasCode('byte-integrity'));
  const n = await example('neri');
  await assert.rejects(make(n,{byteMode:'inline',readAsset:async () => new Uint8Array([1,2])}));
  const missing = await make(n,{byteMode:'metadata'});
  assert.equal((await openAuthored(missing,options)).missing.length,2);
});

test('metadata tampering, duplicate JSON keys, malformed and oversized imports reject', async () => {
  const {bundle} = await packaged('minimal');
  const text = JSON.stringify(bundle);
  await assert.rejects(openAuthored(text.replace('"visibility":"private"',
    '"visibility":"private","visibility":"private"'),options),hasCode('duplicate-key'));
  await assert.rejects(openAuthored('{',options),hasCode('json'));
  await assert.rejects(openAuthored(' '.repeat(1500000),options),hasCode('file-limit'));
  bundle.content.subjects[0].label = 'Tampered';
  await assert.rejects(openAuthored(bundle,options),hasCode('root-integrity'));
  assert.throws(() => parseDefinitions('{"profiles":[],"profiles":[]}'),hasCode('duplicate-key'));
  assert.throws(() => parseDefinitions('"'+'x'.repeat(1048576)+'"'),hasCode('resource-limit'));
});

test('unsafe active JSON inputs are rejected without invoking accessors', async () => {
  const s = await example('minimal'); let calls=0;
  const active = {};
  Object.defineProperty(active,'subjects',{enumerable:true,get(){ calls++; throw Error('must not run'); }});
  assert.equal(validateAuthored(active,s.registry).valid,false);
  await assert.rejects(openAuthored(active,options));
  assert.throws(() => loadRegistry(active));
  const badRegistry = {};
  Object.defineProperty(badRegistry,'schema',{enumerable:true,get(){ calls++; return CONTENT_SCHEMA; }});
  assert.equal(validateAuthored(s.document,badRegistry).valid,false);
  assert.equal(calls,0);
  const cyclic={}; cyclic.self=cyclic;
  for (const value of [cyclic, new Date(), {bad:NaN}, {bad:()=>1}, {bad:Symbol('x')},
    {bad:new Array(3)}, JSON.parse('{"__proto__":{}}')]) {
    assert.equal(validateAuthored(value,s.registry).valid,false);
  }
});

test('safe definition registration never fetches remote schemas or executes custom code', async () => {
  const s = await example('minimal');
  const extension = {aspectDefinitions:[{id:'remote:aspect',version:'1',label:'Remote',
    definition:'Unsupported schema retained only.',schema:{$ref:'https://invalid.example/schema'}}]};
  const registry = registerDefinitions(s.registry,extension);
  s.document.subjects[0].aspects=[{id:'aspect:remote',definition:'remote:aspect',
    scope:{kind:'subject'},required:true,value:{arbitrary:'data'}}];
  const previous=globalThis.fetch;
  globalThis.fetch=()=>{throw Error('network forbidden');};
  try {
    const r = validateAuthored(s.document,registry);
    assert.equal(r.valid,true); assert.equal(r.executionReady,false);
    assert.ok(r.unsupported.some(e=>e.code==='unsupported-schema'));
    const result = await receivingFixture(await make({document:s.document,registry}),
      {target:'plc',subjectId:'subject:pip',...options});
    assert.equal(result.value,null);
  } finally { globalThis.fetch=previous; }
});

test('metadata/asset quotas apply before reader; no mutation during async export/import', async () => {
  const s=await example('neri'); const before=clone(s.document), reg=clone(s.registry);
  let calls=0;
  const oversized=clone(s.document); oversized.assets[0].size=LIMITS.maxInlineAssetBytes+1;
  await assert.rejects(make({...s,document:oversized},{byteMode:'inline',readAsset:async()=>{calls++;}}));
  assert.equal(calls,0);
  await make(s);
  assert.deepEqual(s.document,before); assert.deepEqual(s.registry,reg);
  const bundle = await make(s,{byteMode:'inline',readAsset:async h=>s.bytes.get(h)});
  const saved=clone(bundle); await openAuthored(bundle,options); assert.deepEqual(bundle,saved);
  const tooMany={format:'cosmogenitor/content/0',subjects:Array.from({length:257},(_,i)=>({id:`s:x${i}`,label:'x'}))};
  assert.ok(validateAuthored(tooMany,s.registry).errors.some(e=>e.code==='resource-limit'));
});

test('pure production module has no I/O, eval, dynamic imports, code loaders or writer', async () => {
  const source=await read('authored.mjs');
  assert.doesNotMatch(source,/\b(?:fetch|eval|Function|localStorage|indexedDB|writeFile|WebSocket)\s*\(/);
  assert.doesNotMatch(source,/import\s*\(|from ['"]node:/);
});
