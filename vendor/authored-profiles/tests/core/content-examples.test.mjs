import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {createRegistry, registerDefinitions, validateContent, parseContent} from '../../src/core/content.mjs';

const load = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const schema = await load('../../content/content.schema.json');
const starter = await load('../../content/starter-registry.json');
const additions = await load('../../content/examples/beacon-definitions.json');
const base = createRegistry({schema, ...starter});
const registry = registerDefinitions(base, additions);
const library = await load('../../content/examples/mara-library.json');
const lookup = (collection, id, doc = library) => doc[collection].find(x => x.id === id);
const aspect = (subject, id, doc = library) => lookup('subjects', subject, doc).aspects.find(x => x.id === id);
const expression = id => lookup('expressions', id);
const reference = id => lookup('references', id);

test('every supplied JSON fixture either registers data definitions or validates as a complete envelope', async () => {
  const files = (await readdir(new URL('../../content/examples/', import.meta.url))).filter(x => x.endsWith('.json'));
  assert.deepEqual(files.sort(), ['beacon-definitions.json', 'mara-library.json', 'minimal-mention.json']);
  for (const file of files.filter(x => x !== 'beacon-definitions.json')) {
    const text = await readFile(new URL(`../../content/examples/${file}`, import.meta.url), 'utf8');
    const result = parseContent(text, registry);
    assert.equal(result.report.valid, true, JSON.stringify(result.report));
    assert.equal(result.report.supported, true, JSON.stringify(result.report));
    assert.equal(result.report.executionReady, true);
    assert.deepEqual(result.document, JSON.parse(text));
  }
});

test('two portrayals preserve one subject link while selecting different scoped looks and aesthetics', () => {
  const photo = expression('expression:mara-photo'), ink = expression('expression:mara-ink');
  assert.deepEqual(photo.subjects, ['subject:mara']); assert.deepEqual(ink.subjects, photo.subjects);
  assert.notDeepEqual(photo.contexts, ink.contexts); assert.notDeepEqual(photo.aspects, ink.aspects);
  assert.equal(aspect('subject:mara', 'aspect:mara-photo-look').scope.id, photo.contexts[0]);
  assert.equal(aspect('subject:mara', 'aspect:mara-ink-look').scope.id, ink.contexts[0]);
  assert.notDeepEqual(lookup('contexts', photo.contexts[0]).aesthetics, lookup('contexts', ink.contexts[0]).aesthetics);
  const commitment = aspect('subject:mara', 'aspect:mara-identity');
  assert.ok(photo.aspects.includes(commitment.id)); assert.ok(ink.aspects.includes(commitment.id));
  const broken = structuredClone(library); lookup('expressions', ink.id, broken).contexts = photo.contexts;
  assert.ok(validateContent(broken, registry).errors.some(x => x.code === 'expression-context'));
});

test('the relationship is an authored subject with participants, roles, tensions and situation context', () => {
  const relationship = lookup('subjects', 'subject:mentorship');
  assert.deepEqual(relationship.participants, [{subject: 'subject:mara', role: 'mentor'}, {subject: 'subject:ivo', role: 'apprentice'}]);
  const pattern = relationship.aspects[0].value;
  assert.ok(pattern.pattern); assert.equal(pattern.tensions.length, 1); assert.equal(pattern.situations[0].name, 'Workshop');
  assert.ok(lookup('contexts', 'context:workshop').subjects.includes(relationship.id));
  assert.ok(expression('expression:workshop-film').subjects.includes(relationship.id));
});

test('one utterance has multiple takes with an explicit selected performance and typed delivery references', () => {
  const utterance = aspect('subject:keep-light', 'aspect:light-utterance').value;
  const performance = aspect('subject:light-performance', 'aspect:light-performance').value;
  const takes = [performance.take, ...performance.alternatives].map(expression);
  assert.equal(new Set(takes.map(x => x.id)).size, 3);
  assert.ok(takes.every(x => x.subjects.includes('subject:keep-light') && x.subjects.includes(utterance.speaker)));
  assert.ok(takes.every(x => x.text === utterance.words));
  assert.equal(reference('reference:mara-neutral').role, 'voice-identity');
  assert.equal(reference('reference:mara-whisper').role, 'vocal-delivery');
  assert.equal(reference('reference:mara-whisper').target, performance.take);
  const deliveries = ['subject:light-neutral-performance', 'subject:light-performance', 'subject:light-call-performance']
    .map(id => lookup('subjects', id).aspects[0].value);
  assert.equal(new Set(deliveries.map(x => x.direction)).size, 3);
  assert.ok(deliveries.every(x => x.utterance === 'subject:keep-light' && x.speaker === utterance.speaker));
  assert.deepEqual(new Set(deliveries.map(x => x.take)), new Set(takes.map(x => x.id)));
  const neutral = expression('expression:light-neutral');
  assert.deepEqual(lookup('bindings', neutral.bindings[0]).references, []);
  const broken = structuredClone(library); aspect('subject:light-performance', 'aspect:light-performance', broken).value.take = 'expression:missing';
  assert.ok(validateContent(broken, registry).errors.some(x => x.code === 'dangling-reference'));
});

test('the residence has connected rooms, meaningful affordances and a resident without needing geometry', () => {
  const place = aspect('subject:mara-home', 'aspect:home-place').value;
  assert.deepEqual(place.residents, ['subject:mara']); assert.equal(place.rooms.length, 2);
  assert.deepEqual(place.connections, [{from: 'room:kitchen', to: 'room:workshop'}]);
  assert.equal(place.geometry, undefined);
  const chair = aspect('subject:mara-home', 'aspect:home-affordances').value.items.find(x => x.id === 'item:workshop-chair');
  assert.equal(chair.uses[0].label, 'Sit'); assert.ok(chair.uses[0].requires.length); assert.ok(chair.uses[0].effects.length);
  const broken = structuredClone(library); aspect('subject:mara-home', 'aspect:home-place', broken).value.connections[0].to = 'room:missing';
  assert.ok(validateContent(broken, registry).errors.some(x => x.code === 'dangling-reference'));
});

test('film composition uses a portrayal and the selected exact speech take, not a neutral or style substitute', () => {
  const film = expression('expression:workshop-film'), binding = lookup('bindings', film.bindings[0]);
  const inputs = binding.references.map(reference);
  assert.deepEqual(new Set(film.references), new Set(binding.references));
  assert.equal(inputs.find(x => x.role === 'start-frame').target, 'expression:mara-photo');
  assert.equal(inputs.find(x => x.role === 'environment').target, 'subject:mara-home');
  const speech = inputs.find(x => x.role === 'supplied-performance');
  assert.equal(speech.target, aspect('subject:light-performance', 'aspect:light-performance').value.take);
  assert.notEqual(speech.role, 'vocal-delivery'); assert.notEqual(speech.target, reference('reference:mara-neutral').target);
  assert.equal(binding.model.revision, 'synthetic-contract-0'); assert.equal(binding.support, 'declared');
});

test('custom profiles, aspects and aesthetic domains load entirely through data', () => {
  const before = validateContent(library, base);
  assert.equal(before.valid, true); assert.equal(before.supported, false);
  assert.ok(before.unsupported.some(x => x.definition === 'neighborhood:beacon'));
  assert.ok(before.unsupported.some(x => x.definition === 'neighborhood:signal'));
  assert.equal(validateContent(library, registry).supported, true);
  const beacon = lookup('subjects', 'subject:beacon'); assert.deepEqual(beacon.profiles, ['neighborhood:beacon']);
  const signal = beacon.aspects[0]; assert.equal(signal.definition, 'neighborhood:signal'); assert.equal(signal.value.keeper, 'subject:mara');
  const domain = aspect('subject:coastal-aesthetic', 'aspect:coastal-aesthetic').value.domains.find(x => x.id === 'domain:tideglass');
  assert.ok(domain.definition); assert.ok(domain.principles.length); assert.ok(domain.hypothesis);
  const broken = structuredClone(library); lookup('subjects', 'subject:beacon', broken).aspects[0].value.keeper = 'subject:missing';
  assert.ok(validateContent(broken, registry).errors.some(x => x.code === 'dangling-reference'));
});

test('fixed/default/varies and author-only claims remain explicitly scoped and separate from projections', () => {
  const mara = lookup('subjects', 'subject:mara');
  assert.deepEqual(new Set(mara.aspects.flatMap(x => x.claims || []).map(x => x.stability)), new Set(['fixed', 'default', 'varies']));
  assert.ok(aspect('subject:mara', 'aspect:mara-identity').claims.some(x => x.commitment && x.stability === 'fixed'));
  assert.ok(aspect('subject:mara', 'aspect:mara-identity').value.freedoms.length);
  const dossier = aspect('subject:mara', 'aspect:mara-dossier'); assert.ok(dossier.value.authorBackstory);
  assert.ok(dossier.claims.some(x => x.path === '/authorBackstory' && x.visibility === 'author-only'));
  const prompt = expression('expression:mara-prompt'); assert.ok(!prompt.aspects.includes(dossier.id));
  assert.ok(!lookup('bindings', prompt.bindings[0]).aspects.includes(dossier.id));
  assert.ok(!prompt.text.includes(dossier.value.authorBackstory));
  const broken = structuredClone(library); lookup('expressions', prompt.id, broken).aspects.push(dossier.id);
  assert.ok(validateContent(broken, registry).errors.some(x => x.code === 'author-only-projection'));
});

test('judgment fixture distinguishes unresolved human judgment, model observation and limited measurement', () => {
  const byKind = Object.fromEntries(library.judgments.map(x => [x.kind, x]));
  assert.equal(byKind.human.decision, 'unresolved'); assert.equal(byKind.human.score, undefined);
  assert.equal(byKind.observation.decision, undefined); assert.ok(byKind.observation.observation);
  assert.equal(byKind.measurement.decision, undefined); assert.ok(Number.isFinite(byKind.measurement.score));
  assert.match(byKind.measurement.limits, /No face, voice or behavior comparison performed/);
  assert.notEqual(byKind.human.criterion, byKind.measurement.criterion);
  assert.ok(library.bindings.every(x => x.support === 'declared' && x.model.id.startsWith('fixture:') && x.model.revision && !('version' in x.model)));
});

test('unavailable placeholder media never masquerades as local files or real generation evidence', () => {
  assert.equal(library.assets.length, 7);
  assert.ok(library.assets.every(x => x.availability === 'missing'));
  assert.ok(library.assets.every(x => x.representation.includes('no media bytes')));
  assert.ok(library.expressions.filter(x => x.assets?.length).every(x => /synthetic/i.test(x.description)));
  assert.ok(library.expressions.every(x => !x.text || !/generated by/.test(x.text)));
  assert.equal(library.instances, undefined);
});

test('a minimal mention remains usable without profiles, aspects, media or a running resident', async () => {
  const mention = await load('../../content/examples/minimal-mention.json');
  assert.equal(mention.subjects.length, 1); assert.ok(mention.subjects[0].label); assert.ok(mention.subjects[0].summary);
  assert.equal(mention.subjects[0].aspects, undefined); assert.equal(mention.assets, undefined); assert.equal(mention.instances, undefined);
  assert.equal(validateContent(mention, base).executionReady, true);
  assert.ok(lookup('subjects', 'subject:offstage-neighbor').summary);
});
