import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createRegistry, registerDefinitions, validateContent} from '../../src/core/content.mjs';
import {projectPLCPreset, projectSonalonDesign, projectSonalonPlace} from '../../src/core/consumer-projections.mjs';
import {existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
// Receiver cross-checks need the owning Sonalon and PLC code on this machine. They are optional:
// they run only when AUTHORED_PROFILES_RECEIVERS=1 and the trees exist; otherwise they are reported as skipped.
const SONALON = '/cosmoshot/sonalon/contracts', PLC = '/cosmoshot/privatelocalchat/chat/transfer';
const HAVE_RECEIVERS = process.env.AUTHORED_PROFILES_RECEIVERS === '1' && [`${SONALON}/resident/lib/schema.mjs`, `${PLC}/backups.mjs`].every(existsSync);
const SKIP = HAVE_RECEIVERS ? false : 'optional receiver lane: set AUTHORED_PROFILES_RECEIVERS=1 with /cosmoshot/sonalon and /cosmoshot/privatelocalchat present';
const ext = async path => HAVE_RECEIVERS ? import(pathToFileURL(path)) : {};
const {validateDesignSchema} = await ext(`${SONALON}/resident/lib/schema.mjs`);
const {createInstance} = await ext(`${SONALON}/resident/lib/operations.mjs`);
const {validateDocument: validateSidecar} = await ext(`${SONALON}/world-sidecar/validate.mjs`);
const {createBackups} = await ext(`${PLC}/backups.mjs`);
const {checkFormat} = await ext(`${PLC}/file-formats.mjs`);

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url)));
const registry = registerDefinitions(createRegistry({schema: await load('../../content/content.schema.json'),
  ...await load('../../content/starter-registry.json')}), await load('../../content/bundles/consumer-definitions.json'));
const rich = await load('../../content/bundles/emma-rich.json');
const minimal = await load('../../content/bundles/emma-minimal.json');
const options = {subjectId: 'subject:emma'};
const find = (doc, definition, subjectId = 'subject:emma') => doc.subjects.find(s => s.id === subjectId).aspects.find(a => a.definition === definition);
function receiverDesign(value) {
  const shape = validateDesignSchema(value);
  if (!shape.ok) return shape;
  try {
    createInstance(value, {residentId: 'r-consumer-projection-test', now: '2026-01-01T00:00:00Z'});
    return {ok: true, errors: []};
  } catch (error) { return {ok: false, errors: error.errors || [{path: '/', message: error.message}]}; }
}
function receiverPlace(value) {
  const result = validateSidecar(value);
  return {ok: result.errors === 0, errors: result.findings.filter(f => f.level === 'error')};
}

test('rich and minimal Emma are real valid extensible content documents', () => {
  for (const doc of [rich, minimal]) {
    const report = validateContent(doc, registry);
    assert.equal(report.valid, true, JSON.stringify(report));
    assert.equal(report.executionReady, true);
  }
});

test('minimal PLC projection uses receiver preset fields and actual restoreExtras accepts it', {skip: SKIP}, async () => {
  const result = projectPLCPreset(minimal, registry, options);
  assert.deepEqual(Object.keys(result.value).sort(), ['id', 'name', 'prompt']);
  assert.equal(result.value.name, 'Emma');
  assert.match(result.value.prompt, /coastal neighbourhood/);
  assert.equal(result.report.validation, 'not-run');
  const assistant = {customPresets: []}; let counter = 0;
  const receiver = createBackups({assistant, folders: () => [], saveFolders() {},
    prefs: {}, savePrefs() {}, savePresets() {}, addMemory: () => false,
    generateThreadId: () => `fixture-${++counter}`});
  const envelope = {format: 'plc-backup/1', presets: [result.value]};
  assert.equal(checkFormat(envelope).state, 'current');
  assert.equal(await receiver.restoreExtras(envelope, {skip: new Set(['folders', 'memory', 'prefs', 'docs'])}), 1);
  assert.deepEqual(assistant.customPresets[0], {id: 'preset-fixture-1', name: result.value.name, prompt: result.value.prompt});
  assert.equal(await receiver.restoreExtras(envelope, {skip: new Set(['folders', 'memory', 'prefs', 'docs'])}), 0);
});

test('name-only subject still produces a usable preset without inventing a dossier', () => {
  const doc = {format: 'cosmogenitor/content/0', subjects: [{id: 'subject:mention', label: 'A visitor'}]};
  const result = projectPLCPreset(doc, registry, {subjectId: 'subject:mention'});
  assert.equal(result.value.name, 'A visitor'); assert.match(result.value.prompt, /Portray A visitor/);
  assert.equal(result.report.missing.length, 0);
});

test('minimal character reports exact missing Sonalon authoring rather than claiming complete resident', {skip: SKIP}, () => {
  const result = projectSonalonDesign(minimal, registry, {...options, validate: receiverDesign});
  assert.equal(result.value, null); assert.equal(result.report.ready, false);
  assert.ok(result.report.missing.some(e => e.source === 'sonalon:authored-sections'));
  assert.ok(result.report.missing.some(e => e.source === 'sonalon:start'));
  assert.equal(result.report.validation, 'not-run');
});

test('rich projection is accepted by actual Sonalon design schema and fresh-instance semantic operation', {skip: SKIP}, () => {
  const result = projectSonalonDesign(rich, registry, {...options, validate: receiverDesign});
  assert.equal(result.report.ready, true, JSON.stringify(result.report));
  assert.equal(result.value.schema, 'cognitive-fabric/resident-design');
  assert.equal(result.value.design.designId, 'design:emma');
  assert.equal(result.value.authored.identity.name, 'Emma');
  assert.equal(result.report.validation, 'accepted');
  assert.ok(result.report.omitted.some(e => e.source === 'aspect:emma-dossier'));
  assert.equal(result.value.events, undefined); assert.equal(result.value.instance, undefined);
});

test('common character/aspect edits materially alter mapped design, not an unchanged receiver example wrapper', {skip: SKIP}, () => {
  const doc = structuredClone(rich);
  doc.subjects[0].label = 'Emma at the bench'; doc.subjects[0].summary = 'An explicitly edited description.';
  find(doc, 'core:identity').value.premise = 'Emma works at a quiet coastal bench.';
  find(doc, 'core:voice').value.description = 'A plain, careful voice with a dry aside.';
  find(doc, 'core:voice').value.pace = 'Unhurried short sentences.';
  find(doc, 'core:communication').value.manner = 'Concrete nouns and patient questions.';
  const result = projectSonalonDesign(doc, registry, {...options, validate: receiverDesign});
  assert.equal(result.report.ready, true, JSON.stringify(result.report));
  assert.equal(result.value.design.name, doc.subjects[0].label);
  assert.equal(result.value.authored.identity.name, doc.subjects[0].label);
  assert.equal(result.value.design.summary, doc.subjects[0].summary);
  assert.equal(result.value.authored.identity.premise, find(doc, 'core:identity').value.premise);
  assert.equal(result.value.authored.voice.description, find(doc, 'core:voice').value.description);
  assert.equal(result.value.authored.voice.rhythm, find(doc, 'core:voice').value.pace);
  assert.equal(result.value.authored.voice.diction, find(doc, 'core:communication').value.manner);
  assert.ok(result.report.mapped.length >= 8);
});

test('receiver-specific sections remain subject to actual receiver requirements', {skip: SKIP}, () => {
  const doc = structuredClone(rich);
  find(doc, 'sonalon:design-metadata').value.identity.age.years = 17;
  const result = projectSonalonDesign(doc, registry, {...options, validate: receiverDesign});
  assert.equal(result.value, null); assert.equal(result.report.validation, 'rejected');
  assert.ok(result.report.errors.some(e => e.source.includes('age')));
  const other = structuredClone(rich); find(other, 'sonalon:voice-sections').value.samples = [];
  assert.equal(projectSonalonDesign(other, registry, {...options, validate: receiverDesign}).report.ready, false);
});

test('no validation callback means candidate only; receiving validation is never invented', () => {
  const result = projectSonalonDesign(rich, registry, options);
  assert.ok(result.value); assert.equal(result.report.ready, false); assert.equal(result.report.validation, 'not-run');
  assert.equal(projectSonalonDesign(rich, registry, {...options, validate: () => {throw Error('fixture');}}).value, null);
});

test('author-only and lived-instance facts are omitted rather than turned into a prompt', () => {
  const doc = structuredClone(rich);
  const dossier = find(doc, 'core:dossier'); dossier.value.authorBackstory = 'The author knows something Emma does not.';
  dossier.claims = [{id: 'claim:motive', path: '/motive', standing: 'authored', visibility: 'author-only', source: {kind: 'human', actor: 'Fixture author'}}];
  const result = projectPLCPreset(doc, registry, options);
  assert.ok(result.value); assert.doesNotMatch(result.value.prompt, /author knows|depending on her/);
  assert.ok(result.report.omitted.some(e => e.code === 'private-or-lived'));
  doc.instances = [{id: 'instance:emma', design: 'subject:emma', consumer: 'fixture', events: [{id: 'event:one', description: 'A fixture lived event.'}]}];
  dossier.claims[0] = {...dossier.claims[0], standing: 'lived', visibility: 'character-known', instance: 'instance:emma', event: 'event:one'};
  const lived = projectPLCPreset(doc, registry, options);
  assert.doesNotMatch(lived.value.prompt, /depending on her/);
  assert.ok(lived.report.omitted.some(e => e.code === 'not-continuation'));
});

test('whole consumer-specific private/lived sections cannot silently become authored seed', {skip: SKIP}, () => {
  const doc = structuredClone(rich); const a = find(doc, 'sonalon:authored-sections');
  a.claims = [{id: 'claim:private', path: '', standing: 'authored', visibility: 'author-only', source: {kind: 'human', actor: 'Author'}}];
  const result = projectSonalonDesign(doc, registry, {...options, validate: receiverDesign});
  assert.equal(result.value, null); assert.ok(result.report.errors.some(e => e.code === 'private-or-lived'));
});

function withPrivatePaths(definition, paths) {
  const modified = structuredClone(registry);
  modified.aspectDefinitions.find(d => d.id === definition).privatePaths = paths;
  return createRegistry(modified);
}

test('data-defined private fields and private roots never enter PLC or mapped Sonalon voice', () => {
  const manner = find(rich, 'core:communication').value.manner;
  for (const path of ['/manner', '']) {
    const privateRegistry = withPrivatePaths('core:communication', [path]);
    assert.equal(validateContent(rich, privateRegistry).valid, true);
    const preset = projectPLCPreset(rich, privateRegistry, options);
    assert.ok(preset.value);
    assert.ok(!preset.value.prompt.includes(manner));
    assert.ok(preset.report.omitted.some(e => e.code === 'declared-private'));
    const design = projectSonalonDesign(rich, privateRegistry, options);
    assert.ok(design.value);
    assert.equal(Object.hasOwn(design.value.authored.voice, 'diction'), false);
    assert.ok(design.report.omitted.some(e => e.code === 'declared-private'));
  }
  const absent = projectPLCPreset(rich, withPrivatePaths('core:communication', ['/absent']), options);
  assert.ok(absent.value.prompt.includes(manner));
});

test('whole receiver sections and nested common place material enforce declared private paths', () => {
  for (const [definition, path, project, subjectId] of [
    ['sonalon:design-metadata', '/identity/age', projectSonalonDesign, 'subject:emma'],
    ['sonalon:authored-sections', '/temperament', projectSonalonDesign, 'subject:emma'],
    ['sonalon:voice-sections', '/samples/0', projectSonalonDesign, 'subject:emma'],
    ['sonalon:start', '/state', projectSonalonDesign, 'subject:emma'],
    ['core:place', '/rooms/0/label', projectSonalonPlace, 'subject:emma-home'],
    ['sonalon:place-metadata', '/roomMap/0', projectSonalonPlace, 'subject:emma-home']
  ]) {
    const result = project(rich, withPrivatePaths(definition, [path]), {subjectId});
    assert.equal(result.value, null, `${definition}${path}`);
    assert.ok(result.report.errors.some(e => e.code === 'declared-private'), `${definition}${path}`);
  }
});

test('private JSON pointers decode escaped keys and use segment boundaries', () => {
  const doc = structuredClone(rich);
  find(doc, 'sonalon:start').value['private/key~'] = {note: 'fixture private'};
  const result = projectSonalonDesign(doc, withPrivatePaths('sonalon:start', ['/private~1key~0/note']), options);
  assert.equal(result.value, null);
  assert.ok(result.report.errors.some(e => e.code === 'declared-private'));
  const publicSibling = projectPLCPreset(rich, withPrivatePaths('core:communication', ['/mann']), options);
  assert.ok(publicSibling.value.prompt.includes(find(rich, 'core:communication').value.manner));
});

test('conflicting scoped aspects require deliberate selection instead of a silent override', {skip: SKIP}, () => {
  const doc = structuredClone(rich); doc.contexts = [{id: 'context:alternate', label: 'Alternate'}];
  const a = structuredClone(find(doc, 'core:voice')); a.id = 'aspect:alternate-voice'; a.scope = {kind: 'context', id: 'context:alternate'};
  doc.subjects[0].aspects.push(a);
  const result = projectSonalonDesign(doc, registry, {...options, contextIds: ['context:alternate'], validate: receiverDesign});
  assert.equal(result.value, null); assert.ok(result.report.errors.some(e => e.code === 'ambiguous-aspect'));
});

test('credential-like receiver fields and overlapping identity/voice seeds refuse export', () => {
  const doc = structuredClone(rich); find(doc, 'sonalon:authored-sections').value.token = 'fixture-not-a-real-key';
  const result = projectSonalonDesign(doc, registry, options);
  assert.equal(result.value, null); assert.ok(result.report.errors.some(e => e.code === 'forbidden-export'));
  const overlap = structuredClone(rich); find(overlap, 'sonalon:authored-sections').value.identity = {name: 'Someone else'};
  assert.ok(projectSonalonDesign(overlap, registry, options).report.errors.some(e => e.code === 'overlapping-seed'));
  const identity = structuredClone(rich); find(identity, 'sonalon:design-metadata').value.identity.name = 'Someone else';
  assert.ok(projectSonalonDesign(identity, registry, options).report.errors.some(e => e.code === 'overlapping-seed'));
});

test('common meaningful place structure maps to a real valid Sonalon sidecar without requiring a mesh', {skip: SKIP}, () => {
  const result = projectSonalonPlace(rich, registry, {subjectId: 'subject:emma-home', validate: receiverPlace});
  assert.equal(result.report.ready, true, JSON.stringify(result.report));
  assert.equal(result.value.location.namespace, 'private-commons-bungalow');
  assert.equal(result.value.rooms.length, 3); assert.equal(result.value.location.glb, undefined);
  assert.equal(result.value.connections[0].between[0], 'kitchen');
  assert.ok(result.value.affordances.length > 0);
});

test('place label and room edits map from content and bad sidecar details fail real validator', {skip: SKIP}, () => {
  const doc = structuredClone(rich); const home = doc.subjects.find(s => s.id === 'subject:emma-home');
  home.label = 'Emma\'s authored home'; find(doc, 'core:place', home.id).value.rooms[0].label = 'The kitchen table room';
  const result = projectSonalonPlace(doc, registry, {subjectId: home.id, validate: receiverPlace});
  assert.equal(result.report.ready, true, JSON.stringify(result.report));
  assert.equal(result.value.location.name, home.label); assert.equal(result.value.rooms[0].designation.name, 'The kitchen table room');
  find(doc, 'sonalon:place-metadata', home.id).value.roomMap[0].level = 'missing-level';
  assert.equal(projectSonalonPlace(doc, registry, {subjectId: home.id, validate: receiverPlace}).report.ready, false);
});

test('missing place mappings are actionable and cannot silently retarget rooms', {skip: SKIP}, () => {
  const doc = structuredClone(rich); find(doc, 'sonalon:place-metadata', 'subject:emma-home').value.roomMap = [];
  const result = projectSonalonPlace(doc, registry, {subjectId: 'subject:emma-home', validate: receiverPlace});
  assert.equal(result.value, null); assert.ok(result.report.missing.some(e => e.code === 'room-mapping'));
});

test('connection mappings follow explicit source endpoints rather than array position', {skip: SKIP}, () => {
  const doc = structuredClone(rich);
  const place = find(doc, 'core:place', 'subject:emma-home');
  place.value.connections.reverse();
  const result = projectSonalonPlace(doc, registry, {subjectId: 'subject:emma-home', validate: receiverPlace});
  assert.equal(result.report.ready, true, JSON.stringify(result.report));
  assert.equal(result.value.connections[0].id, 'conn.kitchen-bedroom');
  assert.deepEqual(result.value.connections[0].between, ['kitchen', 'bedroom']);
  find(doc, 'sonalon:place-metadata', 'subject:emma-home').value.connections[0].subjectFrom = 'room:missing';
  assert.equal(projectSonalonPlace(doc, registry, {subjectId: 'subject:emma-home'}).value, null);
});

test('invalid content, missing subject and unknown context do not yield successful projection', () => {
  for (const fn of [projectPLCPreset, projectSonalonDesign, projectSonalonPlace]) {
    assert.equal(fn(null, registry, options).value, null);
    assert.equal(fn(rich, registry, {subjectId: 'subject:missing'}).value, null);
    assert.equal(fn(rich, registry, {...options, contextIds: ['context:missing']}).value, null);
  }
});

test('projections are deterministic and do not mutate source content', () => {
  const before = JSON.stringify(rich);
  assert.deepEqual(projectSonalonDesign(rich, registry, options), projectSonalonDesign(rich, registry, options));
  assert.equal(JSON.stringify(rich), before);
});

test('explicit required unfamiliar semantics block projection; optional data is retained in source', () => {
  const doc = structuredClone(minimal);
  doc.subjects[0].aspects.push({id: 'aspect:unknown', definition: 'custom:unknown', scope: {kind: 'subject'}, value: {kept: 'yes'}});
  assert.ok(projectPLCPreset(doc, registry, options).value);
  assert.deepEqual(doc.subjects[0].aspects.at(-1).value, {kept: 'yes'});
  doc.subjects[0].aspects.at(-1).required = true;
  const result = projectPLCPreset(doc, registry, options);
  assert.equal(result.value, null); assert.ok(result.report.errors.some(e => e.code === 'unsupported-required'));
});

test('actual receiver command-line validators accept projected design/place and reject invalid design', {skip: SKIP}, async () => {
  const design = projectSonalonDesign(rich, registry, options).value;
  const designPath = new URL('../../content/bundles/emma.sonalon-design.json', import.meta.url);
  const placePath = new URL('../../content/bundles/emma.sonalon-place.json', import.meta.url);
  const accepted = spawnSync(process.execPath, ['/cosmoshot/sonalon/contracts/resident/validate.mjs', designPath.pathname],
    {encoding: 'utf8'});
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr); assert.match(accepted.stdout, /OK/);
  const sidecar = projectSonalonPlace(rich, registry, {subjectId: 'subject:emma-home'}).value;
  assert.deepEqual(JSON.parse(await readFile(designPath, 'utf8')), design);
  assert.deepEqual(JSON.parse(await readFile(placePath, 'utf8')), sidecar);
  const place = spawnSync(process.execPath, ['/cosmoshot/sonalon/contracts/world-sidecar/validate.mjs', placePath.pathname, '--json'],
    {encoding: 'utf8'});
  assert.equal(place.status, 0, place.stdout + place.stderr); assert.equal(JSON.parse(place.stdout).errors, 0);
  const rejected = spawnSync(process.execPath, ['/cosmoshot/sonalon/contracts/resident/validate.mjs',
    new URL('../../content/bundles/emma-minimal.json', import.meta.url).pathname], {encoding: 'utf8'});
  assert.equal(rejected.status, 1); assert.match(rejected.stdout, /INVALID/);
});
