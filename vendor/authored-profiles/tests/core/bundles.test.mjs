import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash, webcrypto} from 'node:crypto';
import {createRegistry, registerDefinitions, validateSchema} from '../../src/core/content.mjs';
import {BUNDLE_FORMAT, BundleError, selectContent, exportBundle, importBundle, parseBundle, sha256Bytes, validatePortableContent} from '../../src/core/bundles.mjs';
const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const registry = createRegistry({schema: await read('../../content/content.schema.json'), ...await read('../../content/starter-registry.json')});
const source = await read('../../content/examples/mara-library.json');
const extended = registerDefinitions(registry, await read('../../content/examples/beacon-definitions.json'));
const bundleSchema = await read('../../content/bundles/bundle.schema.json');
const hash = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const crypto = webcrypto;
const bytes = Uint8Array.from([0, 1, 7, 127, 128, 250, 255]);
const byteHash = hash(bytes);
const minimal = () => ({format: 'cosmogenitor/content/0', subjects: [{id: 'subject:test', label: 'Test'}]});
const assetDoc = () => ({...minimal(), assets: [{id: 'asset:one', sha256: byteHash, size: bytes.length, mediaType: 'application/octet-stream', availability: 'local'}]});
const factory = () => { const hash = createHash('sha256'); return {update: chunk => hash.update(chunk), digest: () => hash.digest()}; };
const stream = async function* () { yield bytes.subarray(0, 3); yield bytes.subarray(3); };
const code = expected => error => error instanceof BundleError && error.errors.some(x => x.code === expected);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
async function resign(bundle) {
  const clone = structuredClone(bundle); delete clone.root; clone.assets.forEach(x => delete x.data);
  bundle.root = await sha256Bytes(new TextEncoder().encode(JSON.stringify(canonical(clone))), crypto); return bundle;
}

test('granular asset export closes only declared dependencies and is deterministic', () => {
  const doc = assetDoc(); doc.subjects.push({id: 'subject:unrelated', label: 'Unrelated'});
  const chosen = selectContent(doc, registry, {selection: {kind: 'asset', ids: ['asset:one']}});
  assert.deepEqual(chosen.document.assets.map(a => a.id), ['asset:one']); assert.equal(chosen.document.subjects, undefined);
  assert.deepEqual(chosen.records, [{id: 'asset:one', collection: 'assets'}]);
  assert.equal(doc.assets[0].availability, 'local'); assert.equal(chosen.document.assets[0].availability, 'missing');
  assert.deepEqual(chosen, selectContent(doc, registry, {selection: {kind: 'asset', ids: ['asset:one']}}));
});

test('subject/cast/world/aesthetic/relationship/expression/take/library selections close real linked records', () => {
  for (const [kind, ids] of [['subject', ['subject:mara']], ['cast', ['subject:mara', 'subject:ivo']],
    ['world', ['subject:neighborhood']], ['aesthetic', ['subject:coastal-aesthetic']], ['relationship', ['subject:mentorship']],
    ['expression', ['expression:mara-photo']], ['take', ['expression:light-whisper']], ['library', []]]) {
    const selected = selectContent(source, extended, {selection: {kind, ids}});
    for (const id of ids) assert.ok(selected.records.some(x => x.id === id));
    if (kind === 'relationship') for (const id of ['subject:mara', 'subject:ivo']) assert.ok(selected.document.subjects.some(s => s.id === id));
    if (kind === 'world') assert.ok(selected.document.subjects.some(s => s.id === 'subject:beacon'));
  }
  assert.throws(() => selectContent(source, extended, {selection: {kind: 'asset', ids: ['subject:mara']}}), code('selection'));
  assert.throws(() => selectContent(source, extended, {selection: {kind: 'subject', ids: ['subject:missing']}}), code('selection'));
});

test('closure adds owner subjects for aspect evidence and retains linked judgments', () => {
  const doc = minimal(); doc.subjects[0].aspects = [{id: 'aspect:one', definition: 'core:dossier', scope: {kind: 'subject'}, value: {motive: 'Help'}}];
  doc.judgments = [{id: 'judgment:one', target: 'aspect:one', criterion: 'intent', kind: 'human', actor: 'Fixture', evidence: ['aspect:one'], decision: 'unresolved'}];
  const selected = selectContent(doc, registry, {selection: {kind: 'subject', ids: ['subject:test']}});
  assert.ok(selected.document.judgments.some(x => x.id === 'judgment:one'));
});

test('metadata-only bundles retain missing-byte declarations and custom definitions with no invented bytes', async () => {
  const bundle = await exportBundle(source, extended, {crypto});
  assert.equal(bundle.format, BUNDLE_FORMAT); assert.ok(bundle.assets.every(x => x.status === 'missing'));
  const candidate = await importBundle(bundle, {crypto});
  assert.equal(candidate.missing.length, bundle.assets.length); assert.equal(candidate.inlineBytes.size, 0);
  assert.ok(candidate.registry.profiles.some(x => x.id === 'neighborhood:beacon'));
  assert.ok(candidate.registry.aspectDefinitions.some(x => x.id === 'neighborhood:signal'));
  assert.equal(candidate.support.supported, true);
  assert.deepEqual(validateSchema(bundle, bundleSchema).errors, []);
});

test('rich and minimal Emma documents round-trip with their receiver definitions and stable subject identity', async () => {
  const receiving = registerDefinitions(registry, await read('../../content/bundles/consumer-definitions.json'));
  for (const name of ['emma-rich', 'emma-minimal']) {
    const document = await read(`../../content/bundles/${name}.json`);
    const bundle = await exportBundle(document, receiving, {crypto});
    const candidate = await importBundle(bundle, {crypto});
    assert.ok(candidate.document.subjects.some(s => s.id === 'subject:emma'));
    assert.deepEqual(candidate.document.subjects, structuredClone(document.subjects).sort((a, b) => a.id.localeCompare(b.id)));
    assert.equal(candidate.support.valid, true); assert.equal(candidate.support.supported, true);
    if (name === 'emma-rich') {
      assert.ok(candidate.registry.aspectDefinitions.some(d => d.id === 'sonalon:authored-sections'));
      assert.ok(candidate.document.subjects.some(s => s.id === 'subject:emma-home'));
    }
  }
});

test('unknown semantics are retained with honest unsupported diagnostics', async () => {
  const doc = minimal(); doc.subjects[0].aspects = [{id: 'aspect:unknown', definition: 'unknown:meaning', required: true, scope: {kind: 'subject'}, value: {content: 'Kept intact'}}];
  const bundle = await exportBundle(doc, registry, {crypto}); const candidate = await importBundle(bundle, {crypto});
  assert.equal(candidate.support.valid, true); assert.equal(candidate.support.supported, false); assert.equal(candidate.support.executionReady, false);
  assert.deepEqual(candidate.document.subjects[0].aspects[0].value, {content: 'Kept intact'});
});

test('small real bytes are hashed, deduplicated and returned only after complete inline validation', async () => {
  const doc = assetDoc(); doc.assets.push({...doc.assets[0], id: 'asset:same-bytes'});
  const bundle = await exportBundle(doc, registry, {byteMode: 'inline', readAsset: () => bytes, crypto});
  assert.equal(bundle.assets.length, 1); assert.equal(bundle.assets[0].status, 'inline');
  const candidate = await parseBundle(JSON.stringify(bundle), {crypto});
  assert.deepEqual(candidate.inlineBytes.get(byteHash), bytes); assert.deepEqual(candidate.missing, []);
  assert.equal(candidate.document.subjects[0].id, 'subject:test'); assert.equal(candidate.document.assets[0].availability, 'missing');
});

test('metadata hash, corrupt bytes, duplicate assets and undeclared bytes are rejected', async () => {
  const original = await exportBundle(assetDoc(), registry, {byteMode: 'inline', readAsset: () => bytes, crypto});
  const changed = structuredClone(original); changed.content.subjects[0].label = 'Tampered'; await assert.rejects(importBundle(changed, {crypto}), code('root-integrity'));
  const corrupt = structuredClone(original); corrupt.assets[0].data = 'AAAAAAAAAA=='; await assert.rejects(importBundle(corrupt, {crypto}), code('byte-integrity'));
  const duplicate = structuredClone(original); duplicate.assets.push({...duplicate.assets[0]}); await assert.rejects(importBundle(duplicate, {crypto}), code('duplicate-asset'));
  const extra = structuredClone(original); extra.assets.push({hash: 'sha256:' + '0'.repeat(64), size: 0, status: 'missing'}); await resign(extra);
  await assert.rejects(importBundle(extra, {crypto}), code('asset-manifest'));
});

test('dangling dependencies, mismatched record manifests and false placement are rejected even with recomputed roots', async () => {
  const bundle = await exportBundle(assetDoc(), registry, {crypto});
  const bad = structuredClone(bundle); bad.content.references = [{id: 'reference:missing', role: 'identity', target: 'subject:missing'}]; await resign(bad);
  await assert.rejects(importBundle(bad, {crypto}), code('dangling-reference'));
  const manifest = structuredClone(bundle); manifest.records.pop(); await resign(manifest); await assert.rejects(importBundle(manifest, {crypto}), code('record-manifest'));
  const placement = structuredClone(bundle); placement.content.assets[0].availability = 'local'; await resign(placement); await assert.rejects(importBundle(placement, {crypto}), code('availability'));
});

test('inline limits are checked before reading or decoding oversized data', async () => {
  let reads = 0;
  await assert.rejects(exportBundle(assetDoc(), registry, {byteMode: 'inline', readAsset() { reads++; return bytes; }, limits: {maxInlineAssetBytes: 2}, crypto}), code('inline-limit'));
  assert.equal(reads, 0);
  const bundle = await exportBundle(assetDoc(), registry, {byteMode: 'inline', readAsset: () => bytes, crypto});
  await assert.rejects(importBundle(bundle, {limits: {maxInlineTotalBytes: 2}, crypto}), code('inline-limit'));
  await assert.rejects(exportBundle(minimal(), registry, {limits: {maxMetadataBytes: 2}, crypto}), code('metadata-limit'));
  await assert.rejects(exportBundle(minimal(), registry, {limits: {maxEntries: 0}, crypto}), code('metadata-limit'));
});

test('external media uses bounded chunks and an explicit incremental hash without inline buffering', async () => {
  let chunks = 0;
  const hasherFactory = () => { const h = factory(); return {update(chunk) { chunks++; return h.update(chunk); }, digest: () => h.digest()}; };
  const bundle = await exportBundle(assetDoc(), registry, {byteMode: 'external', readAsset: stream, hasherFactory, crypto});
  assert.equal(chunks, 2); assert.equal(bundle.assets[0].status, 'external'); assert.equal(bundle.assets[0].data, undefined);
  const candidate = await importBundle(bundle, {openExternal: stream, hasherFactory, crypto});
  assert.equal(chunks, 4); assert.deepEqual(candidate.verifiedExternal, [byteHash]); assert.equal(candidate.inlineBytes.size, 0);
  await assert.rejects(importBundle(bundle, {crypto}), code('external-bytes'));
  await assert.rejects(importBundle(bundle, {openExternal: async function* () { yield new Uint8Array([1]); }, hasherFactory, crypto}), code('byte-integrity'));
});

test('selection and manifest roots are deterministic across source record ordering', async () => {
  const first = await exportBundle(source, extended, {crypto});
  const reordered = structuredClone(source); for (const value of Object.values(reordered)) if (Array.isArray(value)) value.reverse();
  const second = await exportBundle(reordered, extended, {crypto}); assert.equal(first.root, second.root); assert.deepEqual(first, second);
});

test('credentials and service locators are refused as structure while authored text is preserved', async () => {
  for (const value of [{token: 'private'}, {schema: {credentials: 'private'}}, {endpointUrl: 'https://service.invalid/v1'}, {apiKey: 'private'}]) {
    const doc = minimal(); doc.subjects[0].extensions = {'custom:connection': value};
    await assert.rejects(exportBundle(doc, registry, {crypto}), code('not-portable'));
  }
  const doc = minimal(); doc.subjects[0].summary = 'An author can discuss https://example.invalid/ and write the word token.';
  const bundle = await exportBundle(doc, registry, {crypto}); assert.equal((await importBundle(bundle, {crypto})).document.subjects[0].summary, doc.subjects[0].summary);
});

test('private backups preserve author material; public exports require explicit redaction', async () => {
  const privateBundle = await exportBundle(source, extended, {crypto});
  const restored = await importBundle(privateBundle, {crypto});
  assert.ok(restored.document.subjects.find(x => x.id === 'subject:mara').aspects.find(x => x.id === 'aspect:mara-dossier').value.authorBackstory);
  await assert.rejects(exportBundle(source, extended, {visibility: 'public', crypto}), code('private-content'));
  const publicBundle = await exportBundle(minimal(), registry, {visibility: 'public', audience: ['readers'], crypto});
  assert.equal((await importBundle(publicBundle, {crypto})).visibility, 'public');
});

test('receipt output hashes join expression dependency closure and survive import', async () => {
  const doc = assetDoc(); doc.expressions = [{id: 'expression:result', kind: 'text-result', subjects: ['subject:test']}];
  const receipt = {requestId: 'request:one', stepId: 'step:one', providerId: 'provider:own', kind: 'text', workflow: {id: 'workflow:one', version: '0'}, model: {id: 'fixture:model', revision: '0'}, mode: 'sync', inputs: {}, parameters: {}, source: 'own', startedAt: '2026-11-16T00:00:00Z', completedAt: '2026-11-16T00:00:01Z', outputs: [{kind: 'text', assetHash: byteHash}]};
  const receipts = [{expression: 'expression:result', receipt}];
  const bundle = await exportBundle(doc, registry, {selection: {kind: 'expression', ids: ['expression:result']}, receipts, byteMode: 'inline', readAsset: () => bytes, crypto});
  assert.equal(bundle.content.assets.length, 1); assert.deepEqual((await importBundle(bundle, {crypto})).receipts, receipts);
  const bad = structuredClone(receipts); bad[0].receipt.outputs[0].assetHash = 'sha256:' + '0'.repeat(64);
  await assert.rejects(exportBundle(doc, registry, {receipts: bad, crypto}), code('missing-dependency'));
});
test('receipt identity is an exact expression/request tuple even when both contain slash',()=>{
  const doc=assetDoc();doc.expressions=[{id:'expression:a/b',kind:'result',subjects:['subject:test']},{id:'expression:a',kind:'result',subjects:['subject:test']}];
  const receipt={requestId:'c',stepId:'step:one',providerId:'provider:own',kind:'text',workflow:{id:'workflow:one',version:'0'},model:{id:'fixture:model',revision:'0'},mode:'sync',inputs:{},parameters:{},source:'own',startedAt:'2026-11-16T00:00:00Z',completedAt:'2026-11-16T00:00:01Z',outputs:[{kind:'text',assetHash:byteHash}]};
  const receipts=[{expression:'expression:a/b',receipt},{expression:'expression:a',receipt:{...receipt,requestId:'b/c'}}];
  assert.equal(selectContent(doc,registry,{receipts}).receipts.length,2);
  assert.throws(()=>selectContent(doc,registry,{receipts:[...receipts,structuredClone(receipts[0])]}),code('duplicate-receipt'));
});

test('duplicate JSON fields and unsafe registry shapes do not reach candidate publication', async () => {
  await assert.rejects(parseBundle('{"format":"a","format":"b"}', {crypto}), code('duplicate-key'));
  await assert.rejects(parseBundle('{', {crypto}), code('json'));
  const bundle = await exportBundle(minimal(), registry, {crypto});
  const bad = structuredClone(bundle); bad.definitions.schema.properties.subjects.items = true; await resign(bad);
  await assert.rejects(importBundle(bad, {crypto}), error => error instanceof BundleError);
  await assert.rejects(importBundle(JSON.parse('{"__proto__":{}}'), {crypto}), error => error instanceof BundleError);
  const extra = structuredClone(bundle); extra.unexpected = true;
  assert.ok(validateSchema(extra, bundleSchema).errors.length);
  await assert.rejects(importBundle(extra, {crypto}), code('shape'));
});

test('the validated candidate is a snapshot even if the caller mutates the original during hashing', async () => {
  const bundle = await exportBundle(minimal(), registry, {crypto});
  const delayed = {subtle: {async digest(...args) { bundle.content.subjects[0].label = 'Unverified mutation'; return crypto.subtle.digest(...args); }}};
  const candidate = await importBundle(bundle, {crypto: delayed});
  assert.equal(candidate.document.subjects[0].label, 'Test');
});


test('bounded portability wrapper reuses credential and public privacy rules with strict visibility',()=>{
 assert.equal(validatePortableContent(minimal(),registry),true);
 assert.throws(()=>validatePortableContent(minimal(),registry,[],'publci'),code('visibility'));
 const privateDoc=minimal();privateDoc.subjects[0].aspects=[{id:'aspect:private',definition:'core:dossier',scope:{kind:'subject'},value:{authorBackstory:'Private author guidance'}}];
 assert.throws(()=>validatePortableContent(privateDoc,registry,[],'public'),code('private-content'));
 privateDoc.subjects[0].aspects[0].value={endpoint:'https://service.invalid/v1'};
 assert.throws(()=>validatePortableContent(privateDoc,registry),code('not-portable'));
 assert.throws(()=>validatePortableContent({subjects:[{aspects:{}}]},registry),code('shape'));
});

test('portability wrapper is deliberately not full record validation',()=>{
 assert.equal(validatePortableContent({format:'not-a-content-envelope',subjects:[{label:'Incomplete'}]},registry),true);
 const doc=minimal();doc.subjects[0].aspects=[{definition:'core:dossier',claims:{visibility:'author-only'}}];
 assert.throws(()=>validatePortableContent(doc,registry,[],'public'),code('shape'));
});
