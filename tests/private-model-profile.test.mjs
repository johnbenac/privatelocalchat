import './helpers/install-app-config.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { legacyCatalog } from '../runtime/providers/catalog.mjs';
import { createCatalog } from '../runtime/providers/catalog-core.mjs';
import { preparePrivateGguf, privateGgufCatalogOptions, catalogWithPrivateGguf, readPrivateGguf, exportPrivateGgufProfile, importPrivateGgufProfile } from '../chat/models/private-model-profile.mjs';

const runtime = JSON.parse(await readFile(new URL('../runtime/providers/production-runtime.json', import.meta.url)));
const fileBytes = new Uint8Array(24);
fileBytes.set([0x47, 0x47, 0x55, 0x46, 3]);
const hash = async file => createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex');

test('a private GGUF pins user bytes separately from the logical identity and runtime dependencies', async () => {
  const file = new File([fileBytes], 'custom.gguf');
  const result = await preparePrivateGguf(file, { runtime, hash, id:"fixture" });
  const renamed = await preparePrivateGguf(new File([fileBytes], 'other-name.gguf'), { runtime, hash, id:'fixture' });
  assert.equal(result.manifest.descriptor.resource.id, renamed.manifest.descriptor.resource.id);
  assert.equal(result.manifest.descriptor.resource.id, 'resource:model/user-gguf-fixture');
  assert.equal(result.manifest.descriptor.artifacts[0].sha256, await hash(file));
  assert.equal(result.manifest.descriptor.resource.revision, 'gguf-v1');
  assert.equal(result.manifest.descriptor.artifacts[0].bytes, file.size);
  assert.equal(result.provenance.redistribution, 'user-supplied-only');
  assert.match(result.manifest.view.terms.note, /Not verified/);
  assert.equal(result.source.files.get('weights.gguf'), file);
  const catalog = createCatalog(privateGgufCatalogOptions(result.manifest, { runtime, origin:'http://localhost' }));
  const { sources } = catalog.resolveSources();
  const config = catalog.loadConfigFor(catalog.defaultTier, { sources, backend:'cpu' });
  assert.equal(config.files[0].sha256, await hash(file));
  assert.equal(config.modelUrl, 'http://localhost/__plc_private_models/' + await hash(file) + '/weights.gguf');
  assert.equal(config.runtime.buildId, runtime.buildId);
  assert.deepEqual(result.manifest.descriptor.dependencies.map(({sha256}) => sha256), Object.values(runtime.files).map(({sha256}) => sha256));
});

test('a non-GGUF file is refused before hashing', async () => {
  await assert.rejects(preparePrivateGguf(new File(['no'], 'pretend.gguf'), {
    runtime, hash:() => assert.fail('Unsupported bytes were hashed'),
  }), { code:'unsupported-model-format' });
});

test('the private catalogue adds one profile without remapping shipped model files or their default', async () => {
  const {manifest} = await preparePrivateGguf(new File([fileBytes], 'custom.gguf'), {runtime, hash, id:'fixture'});
  const shipped = legacyCatalog();
  const catalog = catalogWithPrivateGguf(shipped, manifest, {runtime, origin:'http://localhost'});
  const {sources} = catalog.resolveSources();
  const tier = catalog.order.at(-1);
  assert.equal(catalog.defaultTier, shipped.defaultTier);
  assert.deepEqual(catalog.tierFiles('nano', sources), shipped.tierFiles('nano', sources));
  assert.equal(catalog.loadConfigFor(tier, {sources, backend:'gpu'}).backend, 'cpu');
  assert.equal(catalog.relFor(tier, catalog.tierFiles(tier, sources)[0]), null);
  assert.ok(catalog.runsOnProcessor(tier));
});

test('persisted private model metadata cannot refer to foreign artifacts', async () => {
  const {manifest} = await preparePrivateGguf(new File([fileBytes], 'custom.gguf'), {runtime, hash, id:'fixture'});
  assert.equal(readPrivateGguf(JSON.stringify(manifest)).view.files[0].name, 'weights.gguf');
  manifest.descriptor.artifacts[0].name = '../unsafe.gguf';
  assert.throws(() => readPrivateGguf(JSON.stringify(manifest)), /unreadable/);
  assert.equal(readPrivateGguf('null'), null);
});

test('the saved private model activates only with the exact runtime closure', async () => {
  const { manifest } = await preparePrivateGguf(new File([fileBytes], 'custom.gguf'), {runtime, hash, id:'fixture'});
  const bind = descriptor => privateGgufCatalogOptions(
    readPrivateGguf(JSON.stringify({...manifest, descriptor})), {runtime, origin:'http://localhost'}
  );
  const {descriptor} = manifest;
  assert.equal(bind(descriptor).loadOptions.buildId, runtime.buildId);
  const [pin, ...otherPins] = descriptor.dependencies;
  assert.throws(() => bind({...descriptor, dependencies:otherPins}), {code:'private-model-runtime-mismatch'});
  assert.throws(() => bind({...descriptor, dependencies:[pin, pin, ...otherPins.slice(1)]}), {
    code:'private-model-runtime-mismatch',
  });
  for (const [field, replacement] of Object.entries({
    id: 'resource:runtime/other', revision: 'different',
    name: 'other.wasm', bytes: pin.bytes + 1, sha256: 'f'.repeat(64),
  })) {
    assert.throws(() => bind({...descriptor, dependencies:[{...pin, [field]:replacement}, ...otherPins]}), {
      code:'private-model-runtime-mismatch',
    }, field);
  }
});

test('a portable GGUF profile preserves identity and refuses conflicting or private metadata', async () => {
  const file = new File([fileBytes], 'do-not-export-this-name.gguf');
  const {manifest} = await preparePrivateGguf(file, {runtime, hash, id:'portable'});
  const profile = exportPrivateGgufProfile(manifest, runtime);
  assert.doesNotMatch(JSON.stringify(profile), /do-not-export|https?:|credential/);
  const received = await importPrivateGgufProfile(JSON.parse(JSON.stringify(profile)), file, {runtime,hash});
  assert.equal(received.manifest.descriptor.resource.id, manifest.descriptor.resource.id);
  assert.equal(received.manifest.descriptor.resource.revision, manifest.descriptor.resource.revision);
  assert.deepEqual(received.manifest.descriptor.artifacts, manifest.descriptor.artifacts);

  const changedBytes = new Uint8Array(fileBytes);
  changedBytes[23] = 1;
  await assert.rejects(importPrivateGgufProfile(profile, new File([changedBytes], file.name), {runtime,hash}),
    {code:'private-model-descriptor-mismatch'});
  await assert.rejects(importPrivateGgufProfile({...profile, locations:[]}, file, {runtime,hash}),
    {code:'private-model-descriptor-mismatch'});
  await assert.rejects(importPrivateGgufProfile({...profile, dependencies:[]}, file, {runtime,hash}),
    {code:'private-model-runtime-mismatch'});
});
