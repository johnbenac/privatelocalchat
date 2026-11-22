// Package-shape checks: nothing leaves the package, and both entry points expose what the README documents.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {builtinModules} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
async function walk(entry) {
  const full = path.join(root, entry);
  const info = await readdir(full, {withFileTypes: true}).catch(() => null);
  if (!info) return [entry];
  return (await Promise.all(info.map(d => walk(path.join(entry, d.name))))).flat();
}
const shipped = (await Promise.all(manifest.files.map(walk))).flat().sort();
const code = shipped.filter(f => f.endsWith('.mjs'));
// The optional receiver lane names live files of other repositories by absolute path on purpose.
const RECEIVER_LANE = new Set(['authored-profiles/receiving-sources.json',
  'authored-profiles/tests/receiving.test.mjs', 'tests/core/consumer-projections.test.mjs']);

test('every shipped file exists and the package ships what package.json lists', () => {
  assert.ok(shipped.length > 40);
  for (const f of ['LICENSE', 'README.md', 'index.mjs', 'authored-profiles/index.mjs', 'neutral/index.mjs']) assert.ok(shipped.includes(f), f);
  assert.ok(!shipped.some(f => /(^|\/)(\.git|node_modules|dist-src)(\/|$)/.test(f)));
});

test('no shipped module imports anything that leaves the package', async () => {
  const specifiers = /(?:^\s*(?:import|export)\b[^;'"]*?\bfrom\s*|^\s*import\s*|\bimport\(\s*)(['"])([^'"]+)\1/gm;
  let checked = 0;
  for (const file of code) {
    const text = await readFile(path.join(root, file), 'utf8');
    for (const [, , spec] of text.matchAll(specifiers)) {
      checked++;
      if (spec.startsWith('node:')) { assert.ok(builtinModules.includes(spec.slice(5)) || spec === 'node:test', `${file}: ${spec}`); continue; }
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${file}: non-relative import ${spec}`);
      const target = path.resolve(root, path.dirname(file), spec);
      assert.ok(target.startsWith(root + path.sep), `${file}: ${spec} leaves the package`);
      assert.ok(existsSync(target), `${file}: ${spec} does not exist`);
      assert.ok(shipped.includes(path.relative(root, target)), `${file}: ${spec} is not shipped`);
    }
    for (const [, , spec] of text.matchAll(/new URL\((['"`])([^'"`$]+)\1\s*,\s*import\.meta\.url/g)) {
      const target = path.resolve(root, path.dirname(file), spec);
      assert.ok(target.startsWith(root), `${file}: URL ${spec} leaves the package`);
    }
    if (!RECEIVER_LANE.has(file)) assert.ok(!/['"`]\/(cosmoshot|var|srv|root|home|opt)\//.test(text), `${file}: absolute path`);
  }
  assert.ok(checked > 40);
  for (const f of ['authored-profiles/receiving-sources.json']) assert.ok(shipped.includes(f));
});

test('no shipped module names the Cosmogenitor tree layout it was extracted from', async () => {
  for (const file of code) {
    const text = await readFile(path.join(root, file), 'utf8');
    assert.ok(!/site\/(src|content|tests|scripts)\//.test(text.replace(/\n/g, ' ')) || file === 'tests/package.test.mjs', file);
  }
});

const readme = await readFile(path.join(root, 'README.md'), 'utf8');
const EXPECTED = {
  '.': ['CONTENT_FORMAT', 'REGISTRY_FORMAT', 'ContentError', 'checkJSON', 'validateSchema', 'createRegistry',
    'registerDefinitions', 'validateContent', 'validateContentRecords', 'validateContentRecordChanges', 'parseContent',
    'parseContentJSON', 'CONTENT_SCHEMA', 'BUNDLE_FORMAT', 'DEFAULT_BUNDLE_LIMITS', 'BundleError', 'validatePortableContent',
    'selectContent', 'sha256Bytes', 'exportBundle', 'importBundle', 'parseBundle', 'projectPLCPreset',
    'projectSonalonDesign', 'projectSonalonPlace'],
  './authored-profiles': ['LIMITS', 'PLC_PROVISIONAL_LIMITS', 'DEFINITIONS', 'RECEIVING_DEFINITIONS', 'parseDefinitions',
    'loadRegistry', 'validateAuthored', 'exportAuthored', 'openAuthored', 'receivingFixture'],
  './neutral': ['LIMITS', 'DEFINITIONS', 'parseDefinitions', 'loadRegistry', 'validateAuthored', 'openAuthored',
    'projectPLCPreset'],
  './neutral-rich': ['LIMITS', 'PLC_PROVISIONAL_LIMITS', 'DEFINITIONS', 'parseDefinitions', 'loadRegistry', 'validateAuthored',
    'openAuthored', 'receivingFixture', 'projectPLCPreset'],
};

for (const [key, names] of Object.entries(EXPECTED)) {
  test(`entry point ${key} loads through package.json exports and exposes exactly the documented names`, async () => {
    const mod = await import(path.join(root, manifest.exports[key]));
    assert.deepEqual(Object.keys(mod).sort(), [...names].sort());
    for (const name of names) assert.ok(readme.includes('`' + name + '`'), `README does not document ${name}`);
    for (const name of names) assert.notEqual(mod[name], undefined, name);
  });
}

test('the entry points work together: authored registry validates and exports a bundle without I/O', async () => {
  const {createRegistry, parseContent, BUNDLE_FORMAT} = await import(path.join(root, manifest.exports['.']));
  const {loadRegistry, parseDefinitions} = await import(path.join(root, manifest.exports['./authored-profiles']));
  const read = async p => readFile(path.join(root, p), 'utf8');
  const registry = loadRegistry(parseDefinitions(await read('content/starter-registry.json')),
    parseDefinitions(await read('authored-profiles/definitions.v1.json')));
  assert.ok(registry.aspectDefinitions.length > 12);
  assert.equal(parseContent(await read('authored-profiles/examples/minimal.content.json'), registry).document.format,
    'cosmogenitor/content/0');
  assert.equal(BUNDLE_FORMAT, 'cosmogenitor/bundle/0');
  assert.equal(typeof createRegistry, 'function');
});

test('package metadata: name, version, license and the license text are as released', async () => {
  assert.equal(manifest.name, 'authored-profiles');
  assert.equal(manifest.version, '1.2.0');
  assert.equal(manifest.license, 'AGPL-3.0-only');
  assert.equal(manifest.type, 'module');
  assert.match(await readFile(path.join(root, 'LICENSE'), 'utf8'), /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.match(readme, /Version \*\*1\.1\.0\*\*/);
});
