import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateRequest} from '../../src/core/providers.mjs';
import {CONTENT_FORMAT, CONTENT_SCHEMA, ContentError, createRegistry, registerDefinitions, validateContent,
  validateSchema, parseContent, checkJSON} from '../../src/core/content.mjs';

const schema = JSON.parse(await readFile(new URL('../../content/content.schema.json', import.meta.url)));
const starter = JSON.parse(await readFile(new URL('../../content/starter-registry.json', import.meta.url)));
const registry = createRegistry({schema, ...starter});
const minimal = () => ({format: CONTENT_FORMAT, subjects: [{id: 'subject:mara', label: 'Mara', profiles: ['profile:character']}]});
const aspect = (definition = 'core:dossier', value = {motive: 'Repair things instead of asking for help.'}) =>
  ({id: 'aspect:motive', definition, scope: {kind: 'subject'}, value});
const withAspect = (value = aspect()) => { const doc = minimal(); doc.subjects[0].aspects = [value]; return doc; };
const report = doc => validateContent(doc, registry);
const invalid = (doc, code) => { const r = report(doc); assert.equal(r.valid, false, JSON.stringify(r)); assert.ok(r.errors.some(e => e.code === code), JSON.stringify(r.errors)); };
const humanClaim = (overrides = {}) => ({id: 'claim:motive', path: '/motive', standing: 'authored',
  visibility: 'shared-description', stability: 'fixed', commitment: true, source: {kind: 'human', actor: 'Owner'}, ...overrides});

test('runtime schema module is exactly generated from the single authoritative JSON schema', async () => {
  const generated = execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/print-content-schema.mjs', import.meta.url))], {encoding: 'utf8'});
  assert.equal(generated, await readFile(new URL('../../src/core/content-schema.mjs', import.meta.url), 'utf8'));
});

test('actual starter registry loads: 8 profiles / 12 aspect definitions, with immutable snapshots', () => {
  assert.deepEqual(CONTENT_SCHEMA, schema);
  assert.equal(registry.profiles.length, 8); assert.equal(registry.aspectDefinitions.length, 12);
  assert.equal(new Set([...registry.profiles, ...registry.aspectDefinitions].map(x => x.id)).size, 20);
  assert.ok(Object.isFrozen(registry)); assert.ok(Object.isFrozen(registry.profiles[0]));
  assert.throws(() => registry.profiles.push({}), TypeError);
  assert.equal(report(minimal()).valid, true);
});

test('name-only mentions and empty library have no dossier completeness gate', () => {
  assert.equal(report({format: CONTENT_FORMAT}).valid, true);
  assert.equal(report({format: CONTENT_FORMAT, subjects: [{id: 'subject:ivo', label: 'Ivo'}]}).valid, true);
  assert.equal(report(withAspect(aspect('core:dossier', {}))).valid, true);
});

test('a user profile and aspect register through data without core changes', () => {
  const custom = registerDefinitions(registry, {aspectDefinitions: [{id: 'neighborhood:signal', version: '0',
    label: 'Signal', definition: 'The light pattern of a beacon.', scopes: ['subject', 'context'],
    schema: {type: 'object', properties: {color: {type: 'string'}, pulse: {type: 'number', minimum: 0}}, additionalProperties: false}}],
  profiles: [{id: 'neighborhood:beacon', version: '0', label: 'Beacon', definition: 'A local wayfinding subject.', aspects: ['neighborhood:signal'], extends: ['profile:building']}]});
  const doc = withAspect(aspect('neighborhood:signal', {color: 'blue', pulse: 0.5}));
  doc.subjects[0].profiles = ['neighborhood:beacon'];
  assert.deepEqual(validateContent(doc, custom).errors, []); assert.equal(validateContent(doc, custom).supported, true);
  doc.subjects[0].aspects[0].value.pulse = -1;
  assert.equal(validateContent(doc, custom).valid, false);
  assert.equal(registry.profiles.length, 8);
});

test('unknown semantics remain byte-equivalent transport data but report execution blockers when required', () => {
  const doc = withAspect(aspect('visitor:unknown', {strange: ['retained', 3]})); doc.subjects[0].profiles = ['visitor:profile'];
  const r = report(doc); assert.equal(r.valid, true); assert.equal(r.supported, false); assert.equal(r.executionReady, true);
  assert.ok(r.warnings.length); assert.equal(JSON.stringify(parseContent(JSON.stringify(doc), registry).document), JSON.stringify(doc));
  doc.subjects[0].aspects[0].required = true;
  assert.equal(report(doc).valid, true); assert.equal(report(doc).executionReady, false);
  doc.subjects[0].requires = ['visitor:profile']; assert.equal(report(doc).unsupported.filter(x => x.required).length, 2);
});

test('unknown extension namespace is transport-safe; unnamed extensions are refused', () => {
  const doc = minimal(); doc.subjects[0].extensions = {'visitor:meaning': {value: 3}};
  assert.equal(report(doc).valid, true); assert.equal(report(doc).supported, false);
  doc.subjects[0].extensions = {meaning: 3}; invalid(doc, 'extension-name');
});

test('schema features outside implemented subset are unsupported rather than ignored', () => {
  const r = registerDefinitions(registry, {aspectDefinitions: [{id: 'visitor:conditional', version: '0', label: 'Conditional', definition: 'A conditional meaning.', schema: {type: 'object', if: {required: ['a']}, then: {required: ['b']}}}]});
  const doc = withAspect(aspect('visitor:conditional', {})); doc.subjects[0].aspects[0].required = true;
  const result = validateContent(doc, r); assert.equal(result.valid, true); assert.equal(result.supported, false); assert.equal(result.executionReady, false);
  assert.ok(result.unsupported.some(x => x.code === 'unsupported-schema'));
});

test('unsafe or unimplemented user regex patterns are never run on content', () => {
  for (const pattern of ['a+a+a+a+a+a+b', '(a+)+b', '^[a-z]+$', '^a{100}$']) {
    const r = validateSchema('short-safe-fixture', {type: 'string', pattern});
    assert.equal(r.errors.length, 0); assert.ok(r.unsupported.some(x => x.code === 'unsupported-schema'));
  }
  assert.equal(validateSchema('blue', {pattern: '^blue$'}).unsupported.length, 0);
  assert.equal(validateSchema('red', {pattern: '^blue$'}).errors.length, 1);
});

test('remote schema references never fetch, execute or silently establish support', () => {
  const custom = registerDefinitions(registry, {aspectDefinitions: [{id: 'visitor:remote', version: '0', label: 'Remote', definition: 'An unavailable schema.', schema: {$ref: 'https://example.invalid/schema.json'}}]});
  const doc = withAspect(aspect('visitor:remote', {})); doc.subjects[0].aspects[0].required = true;
  assert.equal(validateContent(doc, custom).executionReady, false);
});

test('malformed registry/schema matrix raises ContentError, not raw implementation exceptions', () => {
  for (const value of [undefined, null, [], 'registry', {}]) assert.throws(() => createRegistry(value), ContentError);
  assert.equal(createRegistry({schema}).profiles.length, 0);
  for (const bad of [null, [], 'schema', {type: 'mystery'}, {required: {}}, {required: 'a'}, {properties: []},
    {items: 3}, {minItems: -1}, {minimum: 'a'}, {uniqueItems: 'yes'}, {required: ['constructor']}]) {
    assert.throws(() => createRegistry({schema: bad, ...starter}), ContentError, JSON.stringify(bad));
  }
  assert.throws(() => createRegistry({schema, profiles: {}, aspectDefinitions: []}), ContentError);
  assert.throws(() => createRegistry({schema: {type: 'object'}}), ContentError);
  assert.throws(() => createRegistry({schema: true}), ContentError);
  for (const path of ['subjects', 'expressions', 'judgments', 'instances']) {
    const weakened = structuredClone(schema); weakened.properties[path].items = true;
    assert.throws(() => createRegistry({schema: weakened, ...starter}), ContentError);
  }
  const nested = structuredClone(schema); nested.$defs.subject.properties.aspects.items = true;
  assert.throws(() => createRegistry({schema: nested, ...starter}), ContentError);
  assert.equal(validateContent({subjects: [{}]}, {schema: {type: 'object'}}).valid, false);
  assert.equal(validateContent(null, {schema: true}).valid, false);
  const forged = structuredClone(registry); forged.schema.properties.subjects.items = true;
  assert.equal(validateContent({format: CONTENT_FORMAT, subjects: [{}]}, forged).valid, false);
  assert.equal(validateSchema({}, {required: {}}).errors[0].code, 'invalid-schema');
  assert.throws(() => registerDefinitions(registry, null), ContentError);
  assert.throws(() => registerDefinitions(registry, {profiles: {}}), ContentError);
  assert.throws(() => registerDefinitions(registry, {profiles: [starter.profiles[0]]}), ContentError);
  assert.throws(() => registerDefinitions(registry, {aspectDefinitions: [{id: 'visitor:bad', label: 'Bad', definition: 'No version/schema.'}]}), ContentError);
});

test('profile inheritance cycles are refused and missing parents are reported as unsupported', () => {
  const p = id => ({id, version: '0', label: id, definition: 'Test profile.', aspects: []});
  assert.throws(() => registerDefinitions(registry, {profiles: [{...p('test:a'), extends: ['test:b']}, {...p('test:b'), extends: ['test:a']}]}), ContentError);
  const r = registerDefinitions(registry, {profiles: [{...p('test:a'), extends: ['missing:b']}]});
  const doc = minimal(); doc.subjects[0].requires = ['test:a']; assert.equal(validateContent(doc, r).executionReady, false);
});

test('global IDs are unambiguous across subjects, expressions and aspects', () => {
  const doc = withAspect(); doc.expressions = [{id: 'subject:mara', kind: 'portrait', subjects: ['subject:mara']}]; invalid(doc, 'duplicate-id');
  const other = withAspect(); other.subjects.push({id: 'aspect:motive', label: 'Wrong namespace collision'}); invalid(other, 'duplicate-id');
});

test('subject identity cannot be a byte fingerprint; asset hashes identify bytes', () => {
  const doc = minimal(); doc.subjects[0].id = 'sha256:' + 'a'.repeat(64); invalid(doc, 'subject-identity');
  const good = minimal(); good.assets = [{id: 'asset:portrait', mediaType: 'image/png', sha256: 'sha256:' + 'a'.repeat(64), size: 10, availability: 'missing'}];
  assert.equal(report(good).valid, true); good.assets[0].sha256 = 'wrong'; invalid(good, 'asset-hash');
  const instance = minimal(); instance.instances = [{id: 'sha256:' + 'b'.repeat(64), design: 'subject:mara', consumer: 'sonalon'}]; invalid(instance, 'subject-identity');
});

test('relationships have real participant roles; missing, duplicate and dangling participants fail', () => {
  const doc = minimal(); doc.subjects.push({id: 'subject:ivo', label: 'Ivo'}, {id: 'subject:mentorship', label: 'Mentorship', profiles: ['profile:relationship'], participants: [{subject: 'subject:mara', role: 'mentor'}, {subject: 'subject:ivo', role: 'apprentice'}]});
  assert.equal(report(doc).valid, true);
  doc.subjects[2].participants[1].subject = 'subject:missing'; invalid(doc, 'dangling-reference');
  doc.subjects[2].participants = [{subject: 'subject:mara', role: 'mentor'}, {subject: 'subject:mara', role: 'mentor'}]; invalid(doc, 'relationship');
  doc.subjects[2].participants = [{subject: 'subject:mara'}]; invalid(doc, 'schema');
});

test('context and instance scopes resolve and are not silently applied to another design', () => {
  const doc = withAspect(); doc.contexts = [{id: 'context:work', label: 'Workshop'}];
  doc.subjects[0].aspects[0].scope = {kind: 'context', id: 'context:work'}; assert.equal(report(doc).valid, true);
  doc.subjects[0].aspects[0].scope.id = 'context:missing'; invalid(doc, 'dangling-reference');
  doc.subjects[0].aspects[0].scope = {kind: 'subject', id: 'subject:mara'}; invalid(doc, 'scope');
  doc.subjects.push({id: 'subject:other', label: 'Other'}); doc.instances = [{id: 'instance:other', design: 'subject:other', consumer: 'test'}];
  doc.subjects[0].aspects[0].scope = {kind: 'instance', id: 'instance:other'}; invalid(doc, 'scope');
});

test('registered scope constraints are respected', () => {
  const custom = registerDefinitions(registry, {aspectDefinitions: [{id: 'test:subject-only', version: '0', label: 'Only', definition: 'Subject scope only.', scopes: ['subject'], schema: true}]});
  const doc = withAspect(aspect('test:subject-only', {})); doc.contexts = [{id: 'context:work', label: 'Work'}]; doc.subjects[0].aspects[0].scope = {kind: 'context', id: 'context:work'};
  assert.ok(validateContent(doc, custom).errors.some(e => e.code === 'scope'));
});

test('unknown and unspecified claims do not invent values; fixed commitments need human authority', () => {
  const doc = withAspect(); doc.subjects[0].aspects[0].claims = [humanClaim()]; assert.equal(report(doc).valid, true);
  doc.subjects[0].aspects[0].claims[0].source = {kind: 'model'}; invalid(doc, 'identity-commitment');
  doc.subjects[0].aspects[0].claims = [humanClaim({path: '/missing', standing: 'unspecified', commitment: false})]; assert.equal(report(doc).valid, true);
  doc.subjects[0].aspects[0].claims[0].path = '/motive'; invalid(doc, 'claim-presence');
  doc.subjects[0].aspects[0].claims[0].path = 'not-a-pointer'; invalid(doc, 'claim-path');
  doc.subjects[0].aspects[0].claims[0].path = '/constructor'; invalid(doc, 'claim-path');
});

test('lived claims need same-instance event evidence; authored claims cannot impersonate it', () => {
  const doc = withAspect(); doc.instances = [{id: 'instance:mara', design: 'subject:mara', consumer: 'sonalon', events: [{id: 'event:work', description: 'Observed work.'}]}];
  doc.subjects[0].aspects[0].claims = [humanClaim({standing: 'lived', commitment: false, instance: 'instance:mara', event: 'event:work'})]; assert.equal(report(doc).valid, true);
  doc.subjects[0].aspects[0].claims[0].event = 'event:missing'; invalid(doc, 'dangling-reference');
  doc.subjects[0].aspects[0].claims[0] = humanClaim({instance: 'instance:mara', event: 'event:work'}); invalid(doc, 'authored-not-lived');
});

test('expression links require subject ownership and explicit portrayal context', () => {
  const doc = withAspect(); doc.contexts = [{id: 'context:work', label: 'Work'}]; doc.subjects[0].aspects[0].scope = {kind: 'context', id: 'context:work'};
  doc.expressions = [{id: 'expression:portrait', kind: 'portrait', subjects: ['subject:mara'], aspects: ['aspect:motive'], contexts: ['context:work']}]; assert.equal(report(doc).valid, true);
  doc.expressions[0].contexts = []; invalid(doc, 'expression-context');
  doc.subjects.push({id: 'subject:ivo', label: 'Ivo'}); doc.expressions[0].subjects = ['subject:ivo']; invalid(doc, 'expression-subject');
});

test('system-prompt projection cannot implicitly carry author-only claims', () => {
  const doc = withAspect(); doc.subjects[0].aspects[0].claims = [humanClaim({visibility: 'author-only'})];
  doc.expressions = [{id: 'expression:prompt', kind: 'system-prompt', subjects: ['subject:mara'], aspects: ['aspect:motive']}]; invalid(doc, 'author-only-projection');
  const secret = withAspect(aspect('core:dossier', {authorBackstory: 'Author-only secret.'}));
  secret.expressions = [{id: 'expression:prompt', kind: 'system-prompt', subjects: ['subject:mara'], aspects: ['aspect:motive']}]; invalid(secret, 'author-only-projection');
  secret.bindings = [{id: 'binding:mara', subject: 'subject:mara', model: {id: 'text-model', revision: '0'}, capability: 'text', mechanism: 'prompt', support: 'declared', aspects: ['aspect:motive']}];
  secret.expressions[0].aspects = []; secret.expressions[0].bindings = ['binding:mara']; invalid(secret, 'author-only-projection');
});

test('expression model bindings must belong to expressed subjects and matching contexts', () => {
  const doc = withAspect(); doc.subjects.push({id: 'subject:ivo', label: 'Ivo'});
  doc.bindings = [{id: 'binding:ivo', subject: 'subject:ivo', model: {id: 'image-model', revision: '0'}, capability: 'image', mechanism: 'reference', support: 'declared'}];
  doc.expressions = [{id: 'expression:portrait', kind: 'portrait', subjects: ['subject:mara'], bindings: ['binding:ivo']}]; invalid(doc, 'expression-subject');
  doc.contexts = [{id: 'context:work', label: 'Work'}]; doc.subjects[0].aspects[0].scope = {kind: 'context', id: 'context:work'};
  doc.bindings[0].subject = 'subject:mara'; doc.bindings[0].aspects = ['aspect:motive']; invalid(doc, 'expression-context');
  doc.expressions[0].contexts = ['context:work']; assert.equal(report(doc).valid, true);
});

test('reference roles are explicit and preserve distinctions between performance and identity', () => {
  const doc = minimal(); doc.references = [{id: 'reference:face', target: 'subject:mara', role: 'visual-identity'}];
  assert.equal(report(doc).valid, true); doc.references[0].target = 'subject:missing'; invalid(doc, 'dangling-reference');
  doc.references[0].target = 'subject:mara'; delete doc.references[0].role; invalid(doc, 'schema');
});

test('data-declared aspect links validate typed references including custom definitions', () => {
  const doc = withAspect(aspect('core:voice', {neutralReference: 'reference:missing'})); invalid(doc, 'dangling-reference');
  doc.references = [{id: 'reference:missing', target: 'subject:mara', role: 'voice-identity'}]; assert.equal(report(doc).valid, true);
  const custom = registerDefinitions(registry, {aspectDefinitions: [{id: 'test:friends', version: '0', label: 'Friends', definition: 'Named friends.', schema: {type: 'object'}, links: [{path: '/friends/*', collection: 'subjects'}]}]});
  const other = withAspect(aspect('test:friends', {friends: ['subject:missing']})); assert.equal(validateContent(other, custom).valid, false);
  other.subjects[0].aspects[0].value.friends = 'subject:missing';
  assert.ok(validateContent(other, custom).errors.some(e => e.code === 'reference-shape'));
});

test('place room connections resolve without requiring geometry', () => {
  const doc = withAspect(aspect('core:place', {rooms: [{id: 'room:kitchen', label: 'Kitchen'}, {id: 'room:workshop', label: 'Workshop'}], connections: [{from: 'room:kitchen', to: 'room:workshop'}]}));
  assert.equal(report(doc).valid, true); doc.subjects[0].aspects[0].value.connections[0].to = 'room:missing'; invalid(doc, 'dangling-reference');
});

test('human acceptance, machine observations and measured identity remain distinct', () => {
  const doc = minimal(); const common = {id: 'judgment:one', target: 'subject:mara', criterion: 'identity', actor: 'Owner', evidence: ['subject:mara']};
  doc.judgments = [{...common, kind: 'human', decision: 'unresolved'}]; assert.equal(report(doc).valid, true);
  doc.judgments[0].score = 0.8; invalid(doc, 'judgment-kind');
  doc.judgments = [{...common, kind: 'observation', observation: 'Face is partly occluded.', decision: 'approved'}]; invalid(doc, 'judgment-kind');
  doc.judgments = [{...common, kind: 'measurement', score: 0.8, instrument: 'fixture', limits: 'Synthetic structural example, not identity proof.'}]; assert.equal(report(doc).valid, true);
  delete doc.judgments[0].limits; invalid(doc, 'measurement');
});

test('model bindings link the subject but never replace its identity; tested claims require evidence', () => {
  const doc = minimal(); doc.bindings = [{id: 'binding:face', subject: 'subject:mara', model: {id: 'image-model', revision: '1'}, capability: 'image', mechanism: 'reference-set', support: 'declared'}];
  assert.equal(report(doc).valid, true); assert.equal(doc.subjects[0].id, 'subject:mara');
  doc.bindings[0].support = 'tested'; invalid(doc, 'binding-evidence');
});

test('content bindings use the exact provider model identity without translating version fields', () => {
  const request = {requestId: 'request:one', stepId: 'step:image', providerId: 'provider:own',
    kind: 'image', workflow: {id: 'workflow:portrait', version: '0'},
    model: {id: 'image-model', revision: 'weights-2026-11'}, mode: 'sync', inputs: {}, parameters: {}};
  assert.deepEqual(validateRequest(request), []);
  const doc = minimal(); doc.bindings = [{id: 'binding:face', subject: 'subject:mara',
    model: request.model, capability: 'image', mechanism: 'reference-set', support: 'declared'}];
  assert.equal(report(doc).valid, true);
  assert.deepEqual(doc.bindings[0].model, request.model);
  doc.bindings[0].model = {id: request.model.id, version: request.model.revision};
  invalid(doc, 'schema');
});

test('unsafe shapes, reserved names, sparse arrays and accessors are rejected without side effects', () => {
  let invoked = false; const accessor = {};
  Object.defineProperty(accessor, 'x', {enumerable: true, get() { invoked = true; return 1; }});
  for (const value of [accessor, new Date(), new Map(), {x: undefined}, {x: Infinity}, {x: 1n}, {x: () => 1}, [, 1], JSON.parse('{"__proto__":{}}')]) assert.ok(checkJSON(value).length);
  assert.equal(invoked, false);
  const cycle = {}; cycle.self = cycle; assert.ok(checkJSON(cycle).length);
  const doc = minimal(); doc.subjects[0].id = 'subject:constructor'; invalid(doc, 'unsafe-id');
});

test('parser rejects malformed, duplicate-key and non-finite JSON without erasing conflicting data', () => {
  for (const text of ['{', '{"format":"a","format":"b"}', '{"format":"a","f\\u006frmat":"b"}', '{"format":"cosmogenitor/content/0","subjects":[{"id":"subject:mara","label":"Mara","extensions":{"test:x":1e400}}]}']) assert.throws(() => parseContent(text, registry), ContentError);
  assert.throws(() => parseContent(JSON.stringify(minimal()), registry, {maxChars: 3}), ContentError);
  assert.equal(parseContent(JSON.stringify(minimal()), registry).report.valid, true);
});

test('schema equality follows JSON object meaning rather than property insertion order', () => {
  assert.equal(validateSchema({b: 2, a: 1}, {const: {a: 1, b: 2}}).errors.length, 0);
  assert.ok(validateSchema([{a: 1, b: 2}, {b: 2, a: 1}], {type: 'array', uniqueItems: true}).errors.length);
});

test('validation is deterministic and leaves input records and definitions unchanged', () => {
  const doc = withAspect(), before = JSON.stringify(doc), definitions = JSON.stringify(registry);
  assert.deepEqual(report(doc), report(doc)); assert.equal(JSON.stringify(doc), before); assert.equal(JSON.stringify(registry), definitions);
});
