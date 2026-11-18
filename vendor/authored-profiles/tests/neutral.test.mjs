// The neutral entry (./neutral): it opens and validates authored bundles and makes a plain preset, and its whole
// import closure carries nothing of other projects. These checks run with plain `node --test tests authored-profiles`.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {webcrypto as crypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as neutral from '../neutral/index.mjs';
import * as main from '../index.mjs';
import * as authoredEntry from '../authored-profiles/index.mjs';
import {neutralClosure} from '../scripts/neutral-closure.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = file => readFile(path.join(root, file), 'utf8');
const json = async file => JSON.parse(await read(file));
const manifest = await json('package.json');

// The plain examples (no receiver aspects). `bex` also carries third-party definitions of its own.
const PLAIN = [['minimal', 'subject:pip'], ['neri', 'subject:neri'], ['bex', 'subject:bex']];

// The registry of an example: loaded from the package's data, or (for bex, which adds third-party definitions)
// the registry its own bundle carries. Each entry builds its own.
async function registryOf(entry, name) {
  if (name === 'bex') return (await entry.openAuthored(await read('authored-profiles/examples/bex.bundle.json'), {crypto})).registry;
  return entry.loadRegistry(entry.parseDefinitions(await read('content/starter-registry.json')),
    entry.parseDefinitions(await read('authored-profiles/definitions.v1.json')));
}

test('the neutral entry is exported by package.json and exposes exactly the names the README documents', async () => {
  assert.equal(manifest.exports['./neutral'], './neutral/index.mjs');
  assert.deepEqual(Object.keys(neutral).sort(), ['DEFINITIONS', 'LIMITS', 'loadRegistry', 'openAuthored',
    'parseDefinitions', 'projectPLCPreset', 'validateAuthored']);
  assert.equal(neutral.DEFINITIONS, authoredEntry.DEFINITIONS, 'the neutral aspect definitions are the very same data');
  assert.deepEqual(neutral.LIMITS, authoredEntry.LIMITS);
});

for (const [name, subjectId] of PLAIN) {
  test(`openAuthored on the ${name} example bundle gives the same candidate in the neutral and the main entries`, async () => {
    const text = await read(`authored-profiles/examples/${name}.bundle.json`);
    const expected = await authoredEntry.openAuthored(text, {crypto});
    const actual = await neutral.openAuthored(text, {crypto});
    assert.equal(actual.document.subjects.some(s => s.id === subjectId), true);
    assert.deepEqual(actual, expected);
    assert.equal(actual.support.executionReady, true);
    // The parsed object is accepted as well, exactly as in the main entry.
    assert.deepEqual(await neutral.openAuthored(JSON.parse(text), {crypto}), expected);
  });

  test(`projectPLCPreset on the ${name} character gives the same preset in the neutral and the main entries`, async () => {
    const document = JSON.parse(await read(`authored-profiles/examples/${name}.content.json`));
    const expected = main.projectPLCPreset(document, await registryOf(authoredEntry, name), {subjectId});
    const actual = neutral.projectPLCPreset(document, await registryOf(neutral, name), {subjectId});
    assert.deepEqual(actual, expected);
    assert.equal(actual.value.id, `cosmogenitor:${subjectId}`);
    assert.match(actual.value.prompt, /^Portray /);
    assert.deepEqual(Object.keys(actual.value), ['id', 'name', 'prompt']);
  });
}

test('the neutral entry refuses what the main entry refuses: damaged bytes and a changed registry schema', async () => {
  const bundle = JSON.parse(await read('authored-profiles/examples/minimal.bundle.json'));
  const damaged = structuredClone(bundle); damaged.content.subjects[0].label = 'Not Pip';
  await assert.rejects(authoredEntry.openAuthored(damaged, {crypto}), {name: 'BundleError'});
  await assert.rejects(neutral.openAuthored(damaged, {crypto}), {name: 'BundleError'});
  const retitled = structuredClone(bundle); retitled.definitions.schema.title = 'Another envelope';
  await assert.rejects(neutral.openAuthored(retitled, {crypto}), {name: 'BundleError'});
  await assert.rejects(neutral.openAuthored('{', {crypto}), {name: 'BundleError'});
});

// ---- Receiver (sonalon:*) aspects. The neutral modules cannot name them; they treat them like any aspect that
// is not one of the neutral definitions: the same behaviour as the main entry, never a crash.
const receivers = async () => main.registerDefinitions(main.createRegistry({schema: await json('content/content.schema.json'),
  ...await json('content/starter-registry.json')}), await json('content/bundles/consumer-definitions.json'));
const bare = async () => main.createRegistry({schema: await json('content/content.schema.json'),
  ...await json('content/starter-registry.json')});

test('a bundle whose required sonalon:* aspects have no loaded definition is reported unsupported, not accepted as supported', async () => {
  const document = await json('content/bundles/emma-rich.json');
  for (const s of document.subjects) for (const a of s.aspects || []) if (a.definition.startsWith('sonalon:')) a.required = true;
  const bundle = await main.exportBundle(document, await bare(), {crypto});
  const expected = await authoredEntry.openAuthored(JSON.stringify(bundle), {crypto});
  const actual = await neutral.openAuthored(JSON.stringify(bundle), {crypto});
  assert.deepEqual(actual, expected, 'the same report as the main entry gives for an unknown aspect');
  assert.equal(actual.support.supported, false);
  assert.equal(actual.support.executionReady, false);
  const names = actual.support.unsupported.map(u => u.definition).filter(d => d.startsWith('sonalon:'));
  assert.ok(names.length >= 4, names.join());
  assert.ok(actual.support.unsupported.every(u => u.code === 'unsupported-definition'));
  // A plain preset from it is refused whole, with the same code the main entry uses, and without a crash.
  const refused = neutral.projectPLCPreset(document, await bare(), {subjectId: 'subject:emma'});
  assert.equal(refused.value, null);
  assert.deepEqual(refused.report.errors.map(e => e.code), ['unsupported-required']);
  assert.deepEqual(refused, main.projectPLCPreset(document, await bare(), {subjectId: 'subject:emma'}));
});

test('a bundle that carries its own definitions of sonalon:* aspects is transported, not interpreted, exactly as by the main entry', async () => {
  const document = await json('content/bundles/emma-rich.json');
  const bundle = await main.exportBundle(document, await receivers(), {crypto});
  const expected = await authoredEntry.openAuthored(JSON.stringify(bundle), {crypto});
  const actual = await neutral.openAuthored(JSON.stringify(bundle), {crypto});
  assert.deepEqual(actual, expected);
  // The neutral validators know no definition of them: the bundle's own registry is the only source.
  assert.ok(!neutral.DEFINITIONS.aspectDefinitions.some(d => d.id.startsWith('sonalon:')));
  // The plain preset names every one of them as not mapped (omitted), never as consumed.
  const preset = neutral.projectPLCPreset(document, await receivers(), {subjectId: 'subject:emma'});
  assert.deepEqual(preset, main.projectPLCPreset(document, await receivers(), {subjectId: 'subject:emma'}));
  const omitted = preset.report.omitted.filter(o => o.code === 'unmapped-aspect').map(o => o.source);
  for (const a of document.subjects.find(s => s.id === 'subject:emma').aspects.filter(a => a.definition.startsWith('sonalon:')))
    assert.ok(omitted.includes(a.id), a.id);
  assert.ok(Object.keys(preset.value).every(k => ['id', 'name', 'prompt'].includes(k)));
});

// ---- The neutral schema derivative
test('the neutral schema module is regenerated byte for byte and differs from the published one only by the $schema address', async () => {
  const run = spawnSync(process.execPath, [path.join(root, 'scripts/print-neutral-content-schema.mjs')], {encoding: 'utf8'});
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout, await read('src/core/content-schema.neutral.mjs'));
  const {CONTENT_SCHEMA: neutralSchema} = await import('../src/core/content-schema.neutral.mjs');
  const {$schema, ...rest} = main.CONTENT_SCHEMA;
  assert.match($schema, /^https:\/\/json-schema\.org\//);
  assert.deepEqual(neutralSchema, rest);
  assert.equal(neutralSchema.$id, 'urn:cosmogenitor:content:0');
  assert.ok(!/(?:https?|wss?):\/\//.test(JSON.stringify(neutralSchema)));
  assert.ok(Object.isFrozen(neutralSchema));
});

// ---- The neutral closure
const CLOSURE = await neutralClosure();

test('the neutral closure is exactly these files, and none of them is a receiver module or a main-entry binding', async () => {
  assert.deepEqual(CLOSURE, ['authored-profiles/authored-engine.mjs', 'authored-profiles/authored-util.mjs',
    'authored-profiles/definitions.mjs', 'neutral/index.mjs', 'src/core/bundle-engine.mjs', 'src/core/content-engine.mjs',
    'src/core/content-schema.neutral.mjs', 'src/core/plc-projection.mjs', 'src/core/projection-kit.mjs',
    'src/core/providers.mjs']);
  const OUT = ['authored-profiles/authored.mjs', 'authored-profiles/receiving-definitions.mjs',
    'src/core/consumer-projections.mjs',            // the receiver projections and receiving fixtures
    'src/core/content-schema.mjs', 'src/core/content.mjs', 'src/core/bundles.mjs', // bound to the published schema
    'index.mjs', 'authored-profiles/index.mjs'];
  for (const f of OUT) assert.ok(!CLOSURE.includes(f), f);
  const listed = spawnSync(process.execPath, [path.join(root, 'scripts/neutral-closure.mjs')], {encoding: 'utf8'});
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(listed.stdout.trim().split('\n'), CLOSURE);
  for (const f of CLOSURE) assert.ok(manifest.files.some(p => f === p || f.startsWith(p + '/')), `${f} is not shipped`);
});

// A copy of the neutrality rules that Private Local Chat (PLC) publishes in tests/neutrality.config.json, as of
// 2026-11-18. Every pattern is applied to every text file of the closure, comments and data included. Update this
// list from that file when PLC's rules change. `host` is PLC's own rule for web addresses: no http(s) or ws(s)
// address may appear in any neutral module at all (PLC allows a few addresses by path; the neutral modules need none).
const PLC_RULES = [
  ['our-domain', /privatelocal\.chat/g],
  ['our-organisations', /aiofourown|cyberplanetary|sonalon/gi],
  ['other-organisations', /techofourown|tech of our own/gi],
  ['maintainer-infrastructure', /benac\.dev/g],
  ['maintainer-account', /johnbenac/g],
  ['model-hosts', /huggingface\.co|\bhf\.co\b|raw\.githubusercontent\.com/g],
  ['analytics', /cloudflareinsights|google-analytics|googletagmanager|googleanalytics|plausible\.io/gi],
  ['our-pages', /["'`]\/(?:privacy|updates)\/?["'`]|href=["']\/(?:privacy|updates)/g],
  ['host', /\b(?:https?|wss?):\/\//g],
];

test('no file of the neutral closure matches any of PLC\'s neutrality rules or names a web address', async () => {
  assert.ok(CLOSURE.length >= 8);
  const hits = [];
  for (const file of CLOSURE) {
    const text = await read(file);
    for (const [id, pattern] of PLC_RULES) for (const m of text.matchAll(pattern)) hits.push(`${file}: ${id}: ${m[0]}`);
  }
  assert.deepEqual(hits, []);
});

test('the rules themselves bite: the published schema module and the receiver modules fail them', async () => {
  const bad = {'src/core/content-schema.mjs': 'host', 'src/core/consumer-projections.mjs': 'our-organisations',
    'authored-profiles/receiving-definitions.mjs': 'our-organisations', 'authored-profiles/authored.mjs': 'our-organisations'};
  for (const [file, id] of Object.entries(bad)) {
    const rule = PLC_RULES.find(([name]) => name === id)[1];
    assert.ok((await read(file)).match(rule), `${file} should match ${id}`);
  }
});
