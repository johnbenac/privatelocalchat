/** Data-only content contract. No I/O, credential access, model execution or state writes. */
import {CONTENT_SCHEMA} from './content-schema.mjs';
export {CONTENT_SCHEMA} from './content-schema.mjs';
export const CONTENT_FORMAT = 'cosmogenitor/content/0';
export const REGISTRY_FORMAT = 'cosmogenitor/content-registry/0';
const badKeys = new Set(['__proto__', 'constructor', 'prototype']);
const idPattern = /^[a-z][a-z0-9.-]*:[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const collections = ['subjects', 'contexts', 'expressions', 'assets', 'references', 'judgments', 'bindings', 'instances'];
const keywords = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description', 'default', 'examples',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties', 'items', 'minItems', 'maxItems',
  'uniqueItems', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum']);
const issue = (code, path, message) => ({code, path, message});
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const own = (object, key) => Object.hasOwn(object, key);
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? value.map(canonical) :
  Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const supportedPattern = pattern => typeof pattern === 'string' && pattern.length <= 256 &&
  (pattern === '\\S' || pattern === idPattern.source || /^\^?[A-Za-z0-9 _:/-]+\$?$/u.test(pattern));

export class ContentError extends TypeError {
  constructor(errors) { super(errors.map(e => `${e.path}: ${e.message}`).join('\n')); this.name = 'ContentError'; this.errors = errors; }
}

/** Reject active/non-JSON shapes before inspecting their values. Accessors are never invoked. */
export function checkJSON(value) {
  const errors = [], ancestors = new Set(); let nodes = 0;
  function visit(v, path, depth) {
    if (++nodes > 100000 || depth > 64) { errors.push(issue('resource-limit', path, 'JSON exceeds 100000 values or depth 64.')); return; }
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) errors.push(issue('unsafe-json', path, 'Use finite JSON numbers.')); return; }
    if (typeof v !== 'object' || (!Array.isArray(v) && !plain(v))) {
      errors.push(issue('unsafe-json', path, 'Use plain JSON data only.')); return;
    }
    if (ancestors.has(v)) { errors.push(issue('unsafe-json', path, 'Cycles are not JSON.')); return; }
    ancestors.add(v);
    const descriptors = Object.getOwnPropertyDescriptors(v);
    if (Object.getOwnPropertySymbols(v).length) errors.push(issue('unsafe-json', path, 'Symbol properties are not JSON.'));
    if (Array.isArray(v) && Object.keys(v).length !== v.length)
      errors.push(issue('unsafe-json', path, 'Use dense arrays without extra properties.'));
    for (const [key, desc] of Object.entries(descriptors)) {
      if (Array.isArray(v) && key === 'length') continue;
      if (badKeys.has(key)) { errors.push(issue('unsafe-json', `${path}/${key}`, 'Reserved structural key.')); continue; }
      if (!own(desc, 'value') || !desc.enumerable) { errors.push(issue('unsafe-json', `${path}/${key}`, 'Accessors and hidden properties are not JSON.')); continue; }
      visit(desc.value, `${path}/${key}`, depth + 1);
    }
    ancestors.delete(v);
  }
  try { visit(value, '', 0); } catch { errors.push(issue('unsafe-json', '', 'Could not inspect JSON data safely.')); }
  return errors;
}

function freeze(value) {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
}
const copy = value => JSON.parse(JSON.stringify(value));

/** Bounded JSON Schema subset; unimplemented semantics are reported, never fetched/executed. */
export function validateSchema(value, schema, {root = schema, path = '', depth = 0} = {}) {
  const errors = [], unsupported = [];
  if (depth === 0) {
    errors.push(...checkJSON(value), ...checkJSON(schema));
    if (!errors.length) schemaShape(schema, path, errors);
    if (errors.length) return {errors, unsupported};
  }
  const fail = (message, code = 'schema') => errors.push(issue(code, path, message));
  if (depth > 64) return {errors: [], unsupported: [issue('unsupported-schema', path, 'Recursive schema exceeds depth 64.')]};
  if (schema === true) return {errors, unsupported};
  if (schema === false) { fail('Schema does not allow this value.'); return {errors, unsupported}; }
  if (!plain(schema)) { fail('Schema must be a record or boolean.', 'invalid-schema'); return {errors, unsupported}; }
  for (const key of Object.keys(schema)) if (!keywords.has(key)) unsupported.push(issue('unsupported-schema', path, `Unsupported schema keyword: ${key}.`));
  if ('$ref' in schema) {
    if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) {
      unsupported.push(issue('unsupported-schema', path, 'Only local JSON-pointer schema references are supported.'));
    } else {
      let target = root;
      for (const token of schema.$ref.slice(2).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'))) {
        if (!plain(target) || !own(target, token) || badKeys.has(token)) { target = undefined; break; }
        target = target[token];
      }
      if (target === undefined) fail('Schema reference does not resolve.', 'invalid-schema');
      else {
        const r = validateSchema(value, target, {root, path, depth: depth + 1}); errors.push(...r.errors); unsupported.push(...r.unsupported);
      }
    }
  }
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = type => type === 'null' ? value === null : type === 'array' ? Array.isArray(value) :
    type === 'object' ? plain(value) : type === 'integer' ? Number.isInteger(value) : typeof value === type;
  if (types.length && !types.some(matches)) { fail(`Expected ${types.join(' or ')}.`); return {errors, unsupported}; }
  if ('const' in schema && !same(schema.const, value)) fail('Value does not match const.');
  if ('enum' in schema && (!Array.isArray(schema.enum) || !schema.enum.some(x => same(x, value)))) fail('Value is not in enum.');
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && [...value].length < schema.minLength) fail('String is too short.');
    if (schema.maxLength !== undefined && [...value].length > schema.maxLength) fail('String is too long.');
    if (schema.pattern !== undefined) {
      // User packages may not run arbitrary regexes on the UI thread. Literal patterns,
      // the fixed identifier grammar and the fixed nonwhitespace test are the complete grammar.
      if (!supportedPattern(schema.pattern))
        unsupported.push(issue('unsupported-schema', path, 'Pattern syntax requires an explicit implementation.'));
      else { try { if (!new RegExp(schema.pattern, 'u').test(value)) fail('String does not match pattern.'); } catch { fail('Invalid schema pattern.', 'invalid-schema'); } }
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) fail('Number is below minimum.');
    if (schema.maximum !== undefined && value > schema.maximum) fail('Number is above maximum.');
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) fail('Too few items.');
    if (schema.maxItems !== undefined && value.length > schema.maxItems) fail('Too many items.');
    if (schema.uniqueItems && new Set(value.map(x => JSON.stringify(canonical(x)))).size !== value.length) fail('Items must be unique.');
    if ('items' in schema) value.forEach((x, i) => { const r = validateSchema(x, schema.items, {root, path: `${path}/${i}`, depth: depth + 1}); errors.push(...r.errors); unsupported.push(...r.unsupported); });
  }
  if (plain(value)) {
    for (const key of schema.required || []) if (!own(value, key)) errors.push(issue('schema', `${path}/${key}`, 'Required property is missing.'));
    for (const [key, child] of Object.entries(value)) {
      const next = own(schema.properties || {}, key) ? schema.properties[key] : schema.additionalProperties;
      if (next === undefined || next === true) continue;
      const r = validateSchema(child, next, {root, path: `${path}/${key}`, depth: depth + 1}); errors.push(...r.errors); unsupported.push(...r.unsupported);
    }
  }
  return {errors, unsupported};
}

function schemaShape(schema, path, errors, ancestors = new Set()) {
  if (typeof schema === 'boolean') return;
  if (!plain(schema)) { errors.push(issue('invalid-schema', path, 'Use a schema record or boolean.')); return; }
  if (ancestors.has(schema)) return;
  ancestors.add(schema);
  const types = schema.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.some(t => !['object', 'array', 'string', 'number', 'integer', 'boolean', 'null'].includes(t))) errors.push(issue('invalid-schema', path, 'Invalid schema type.'));
  for (const key of ['required', 'enum']) if (key in schema && !Array.isArray(schema[key])) errors.push(issue('invalid-schema', path, `${key} must be an array.`));
  if (Array.isArray(schema.required) && schema.required.some(x => !nonempty(x) || badKeys.has(x))) errors.push(issue('invalid-schema', path, 'required must contain safe names.'));
  for (const key of ['properties', '$defs']) if (key in schema) {
    if (!plain(schema[key])) errors.push(issue('invalid-schema', path, `${key} must be a record.`));
    else for (const [name, child] of Object.entries(schema[key])) schemaShape(child, `${path}/${key}/${name}`, errors, ancestors);
  }
  for (const key of ['items', 'additionalProperties']) if (key in schema) schemaShape(schema[key], `${path}/${key}`, errors, ancestors);
  for (const key of ['minItems', 'maxItems', 'minLength', 'maxLength']) if (key in schema && (!Number.isInteger(schema[key]) || schema[key] < 0)) errors.push(issue('invalid-schema', path, `${key} must be a nonnegative integer.`));
  for (const key of ['minimum', 'maximum']) if (key in schema && !Number.isFinite(schema[key])) errors.push(issue('invalid-schema', path, `${key} must be finite.`));
  if ('uniqueItems' in schema && typeof schema.uniqueItems !== 'boolean') errors.push(issue('invalid-schema', path, 'uniqueItems must be boolean.'));
  if ('pattern' in schema && typeof schema.pattern !== 'string') errors.push(issue('invalid-schema', path, 'pattern must be a string.'));
  ancestors.delete(schema);
}

/** Registry snapshots are immutable JSON data; registration never alters a previous snapshot. */
export function createRegistry(options) {
  const optionErrors = checkJSON(options);
  if (optionErrors.length || !plain(options)) throw new ContentError(optionErrors.length ? optionErrors : [issue('registry', '', 'Supply a registry options record.')]);
  const {schema, aspectDefinitions = [], profiles = []} = options;
  if (options.format !== undefined && options.format !== REGISTRY_FORMAT) throw new ContentError([issue('registry', '/format', 'Unsupported registry format.')]);
  const raw = {schema, aspectDefinitions, profiles}; const errors = checkJSON(raw);
  if (errors.length) throw new ContentError(errors);
  schemaShape(schema, '/schema', errors);
  if (!same(schema, CONTENT_SCHEMA)) errors.push(issue('registry', '/schema', 'Use the exact immutable Cosmogenitor core envelope schema; register custom schemas as aspects.'));
  if (!Array.isArray(aspectDefinitions) || !Array.isArray(profiles)) throw new ContentError([issue('registry', '', 'Definitions and profiles must be arrays.')]);
  const ids = new Set();
  for (const [group, entries] of Object.entries({aspectDefinitions, profiles})) for (const [i, item] of entries.entries()) {
    const path = `/${group}/${i}`;
    if (!plain(item) || !idPattern.test(item.id) || badKeys.has(item.id?.split(':').at(-1)) || !nonempty(item.label) || !nonempty(item.definition) || !nonempty(item.version)) {
      errors.push(issue('registry', path, 'Definition requires a safe namespaced id, version, label and definition.')); continue;
    }
    if (ids.has(item.id)) errors.push(issue('duplicate-id', path, 'Registry IDs must be unique.')); ids.add(item.id);
    if (group === 'aspectDefinitions') {
      schemaShape(item.schema, `${path}/schema`, errors);
      if (item.scopes !== undefined && (!Array.isArray(item.scopes) || item.scopes.some(s => !['subject', 'context', 'instance'].includes(s)))) errors.push(issue('registry', path, 'scopes must list supported scope kinds.'));
      if (item.privatePaths !== undefined && (!Array.isArray(item.privatePaths) || item.privatePaths.some(p => typeof p !== 'string' || (p !== '' && !p.startsWith('/')) || /~(?![01])/u.test(p)))) errors.push(issue('registry', path, 'privatePaths require JSON pointers.'));
      if (item.links !== undefined && (!Array.isArray(item.links) || item.links.some(l => !plain(l) || !nonempty(l.path) || !l.path.startsWith('/') || /~(?![01])/u.test(l.path) || ![...collections, 'aspects', 'events'].includes(l.collection)))) errors.push(issue('registry', path, 'links require a JSON pointer pattern and target collection.'));
      if (item.localReferences !== undefined && (!Array.isArray(item.localReferences) || item.localReferences.some(l => !plain(l) || !nonempty(l.ids) || !l.ids.startsWith('/') || !Array.isArray(l.references) || l.references.some(r => !nonempty(r) || !r.startsWith('/'))))) errors.push(issue('registry', path, 'localReferences require an ids pointer pattern and reference patterns.'));
    }
    else for (const key of ['aspects', 'extends']) if (key in item && (!Array.isArray(item[key]) || item[key].some(x => !idPattern.test(x)))) errors.push(issue('registry', path, `${key} must contain definition IDs.`));
  }
  if (errors.length) throw new ContentError(errors);
  const byProfile = new Map(profiles.map(x => [x.id, x]));
  const states = new Map();
  for (const start of byProfile.keys()) {
    const pending = [{id: start, exit: false}];
    while (pending.length) {
      const {id, exit} = pending.pop();
      if (exit) { states.set(id, 2); continue; }
      if (states.get(id) === 2) continue;
      if (states.get(id) === 1) { errors.push(issue('profile-cycle', id, 'Profile inheritance is cyclic.')); break; }
      states.set(id, 1); pending.push({id, exit: true});
      for (const parent of byProfile.get(id)?.extends || []) if (byProfile.has(parent)) pending.push({id: parent, exit: false});
    }
  }
  if (errors.length) throw new ContentError(errors);
  return freeze(copy({format: REGISTRY_FORMAT, ...raw}));
}

export function registerDefinitions(registry, additions = {}) {
  const errors = checkJSON(additions);
  if (errors.length || !plain(additions) || !plain(registry) || !Array.isArray(registry.aspectDefinitions) || !Array.isArray(registry.profiles)) throw new ContentError(errors.length ? errors : [issue('registry', '', 'Supply a registry and data-only additions.')]);
  const {aspectDefinitions = [], profiles = []} = additions;
  if (!Array.isArray(aspectDefinitions) || !Array.isArray(profiles)) throw new ContentError([issue('registry', '', 'Definition additions must be arrays.')]);
  return createRegistry({schema: registry.schema, aspectDefinitions: [...registry.aspectDefinitions, ...aspectDefinitions], profiles: [...registry.profiles, ...profiles]});
}

function pointer(value, path) {
  if (path === '') return {found: true, value};
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/u.test(path)) return {found: false};
  let current = value;
  for (const part of path.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (badKeys.has(part) || current === null || typeof current !== 'object' || !own(current, part)) return {found: false};
    current = current[part];
  }
  return {found: true, value: current};
}

export function validateContent(document, registry) {
  return validateContentInternal(document, registry, false);
}

/** Device-library records are bounded individually; the library is not a single
 * untrusted JSON allocation. All global semantic checks below remain shared. */
export function validateContentRecords(document, registry) {
  return validateContentInternal(document, registry, true);
}

/** Validate affected device-library records against already admitted neighboring
 * records. The storage layer owns complete global identity/index consistency.
 * Neighbor records supply lookup context, not a bypass for changed-record checks. */
export function validateContentRecordChanges(document, registry, {references = {format: CONTENT_FORMAT}} = {}) {
  return validateContentInternal(document, registry, true, references);
}

function recordEnvelope(document) {
  const errors = [];
  if (!plain(document) || Object.getOwnPropertySymbols(document).length)
    return [issue('unsafe-json', '', 'Use a plain content envelope.')];
  const descriptors = Object.getOwnPropertyDescriptors(document);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!['format', ...collections].includes(key) || !own(descriptor, 'value') || !descriptor.enumerable)
      errors.push(issue('unsafe-json', `/${key}`, 'Use enumerable data fields from the canonical content envelope.'));
  }
  if (errors.length) return errors;
  errors.push(...validateSchema({format: document.format}, CONTENT_SCHEMA).errors);
  for (const group of collections) {
    if (!own(document, group)) continue;
    const rows = document[group];
    if (!Array.isArray(rows) || Object.getOwnPropertySymbols(rows).length || Object.keys(rows).length !== rows.length || Object.getOwnPropertyNames(rows).length !== rows.length + 1) {
      errors.push(issue('unsafe-json', `/${group}`, 'Use a dense array of records.')); continue;
    }
    const fields = Object.getOwnPropertyDescriptors(rows);
    for (let i = 0; i < rows.length; i++) {
      const descriptor = fields[i];
      if (!descriptor || !own(descriptor, 'value') || !descriptor.enumerable) {
        errors.push(issue('unsafe-json', `/${group}/${i}`, 'Use enumerable data records, without accessors.')); continue;
      }
      errors.push(...validateSchema(descriptor.value, CONTENT_SCHEMA.properties[group].items,
        {root: CONTENT_SCHEMA, path: `/${group}/${i}`}).errors);
    }
  }
  return errors;
}

function validateContentInternal(document, registry, recordMode, references) {
  const errors = recordMode ? recordEnvelope(document) : checkJSON(document), warnings = [], unsupported = [];
  if (references) errors.push(...recordEnvelope(references));
  const result = () => ({valid: errors.length === 0, supported: unsupported.length === 0,
    executionReady: errors.length === 0 && !unsupported.some(x => x.required), errors, warnings, unsupported});
  if (errors.length) return result();
  // A caller cannot bypass core validation by supplying a hand-built or weakened registry.
  try { registry = createRegistry(registry); }
  catch (error) { errors.push(...(error instanceof ContentError ? error.errors : [issue('registry', '', 'Invalid registry.')])); return result(); }
  const checked = recordMode ? {errors: [], unsupported: []} : validateSchema(document, CONTENT_SCHEMA);
  errors.push(...checked.errors); unsupported.push(...checked.unsupported.map(x => ({...x, required: true})));
  if (errors.length) return result();
  const index = new Map(), aspects = new Map(), def = new Map(registry.aspectDefinitions.map(x => [x.id, x])), profiles = new Map(registry.profiles.map(x => [x.id, x]));
  const add = (record, kind, path) => {
    if (badKeys.has(record.id.split(':').at(-1))) errors.push(issue('unsafe-id', `${path}/id`, 'Reserved structural ID.'));
    if (kind === 'instances' && record.id.startsWith('sha256:')) errors.push(issue('subject-identity', `${path}/id`, 'An instance identity is not a byte hash.'));
    if (index.has(record.id)) errors.push(issue('duplicate-id', `${path}/id`, 'IDs must be unambiguous across all content collections.'));
    else index.set(record.id, {record, kind, path});
  };
  for (const source of references ? [references, document] : [document])
  for (const group of collections) for (const [i, record] of (source[group] || []).entries()) {
    add(record, group, `/${group}/${i}`);
    if (group === 'subjects') for (const [j, aspect] of (record.aspects || []).entries()) { add(aspect, 'aspects', `/${group}/${i}/aspects/${j}`); aspects.set(aspect.id, aspect); }
    if (group === 'instances') for (const [j, event] of (record.events || []).entries()) add(event, 'events', `/${group}/${i}/events/${j}`);
  }
  const refers = (id, kinds, path) => {
    const target = index.get(id);
    if (!target) errors.push(issue('dangling-reference', path, `Reference does not resolve: ${id}.`));
    else if (!kinds.includes(target.kind)) errors.push(issue('reference-kind', path, `Expected ${kinds.join('/')}, found ${target.kind}.`));
    return target;
  };
  const unknown = (id, path, required, message = 'No loaded definition establishes support.') => {
    const report = {...issue('unsupported-definition', path, `${id}: ${message}`), definition: id, required: Boolean(required)};
    unsupported.push(report); warnings.push(report);
  };
  const profileSeen = new Set();
  function useProfile(id, path, required = false) {
    const pending = [id];
    while (pending.length) {
      const next = pending.pop();
      if (profileSeen.has(`${next}:${required}`)) continue; profileSeen.add(`${next}:${required}`);
      const profile = profiles.get(next);
      if (!profile) { unknown(next, path, required); continue; }
      for (const aspect of profile.aspects || []) if (!def.has(aspect)) unknown(aspect, path, required);
      pending.push(...profile.extends || []);
    }
  }
  function scope(scope, path) {
    if (scope.kind === 'subject') { if (scope.id !== undefined) errors.push(issue('scope', path, 'Subject scope is relative to the containing subject; omit id.')); }
    else refers(scope.id, [scope.kind === 'context' ? 'contexts' : 'instances'], `${path}/id`);
  }
  for (const [i, subject] of (document.subjects || []).entries()) {
    const path = `/subjects/${i}`;
    if (subject.id.startsWith('sha256:')) errors.push(issue('subject-identity', `${path}/id`, 'A subject ID is not a byte hash.'));
    for (const profile of subject.profiles || []) useProfile(profile, `${path}/profiles`);
    for (const profile of subject.requires || []) useProfile(profile, `${path}/requires`, true);
    for (const [j, participant] of (subject.participants || []).entries()) refers(participant.subject, ['subjects'], `${path}/participants/${j}/subject`);
    if (subject.participants && subject.participants.length < 2) errors.push(issue('relationship', `${path}/participants`, 'An authored relationship needs at least two participants.'));
    if (subject.participants && new Set(subject.participants.map(p => `${p.subject}:${p.role}`)).size !== subject.participants.length) errors.push(issue('relationship', `${path}/participants`, 'Participant roles must not be duplicated.'));
    for (const name of Object.keys(subject.extensions || {})) {
      if (!idPattern.test(name)) errors.push(issue('extension-name', `${path}/extensions`, 'Extension names must be namespaced IDs.'));
      else unknown(name, `${path}/extensions/${name}`, false, 'Opaque extension retained for transport only.');
    }
    for (const [j, aspect] of (subject.aspects || []).entries()) {
      const ap = `${path}/aspects/${j}`; scope(aspect.scope, `${ap}/scope`);
      if (aspect.scope.kind === 'instance') {
        const instance = index.get(aspect.scope.id)?.record;
        if (instance?.design !== subject.id) errors.push(issue('scope', `${ap}/scope`, 'Instance-scoped aspect must belong to this subject design.'));
      }
      const definition = def.get(aspect.definition);
      if (!definition) unknown(aspect.definition, `${ap}/definition`, aspect.required);
      else {
        if (definition.scopes && !definition.scopes.includes(aspect.scope.kind)) errors.push(issue('scope', `${ap}/scope`, 'Definition does not support this scope kind.'));
        const r = validateSchema(aspect.value, definition.schema, {path: `${ap}/value`}); errors.push(...r.errors);
        unsupported.push(...r.unsupported.map(x => ({...x, required: Boolean(aspect.required), definition: aspect.definition})));
        function walkLinks(value, tokens, path, inspect) {
          if (!tokens.length) { inspect(value, path); return; }
          const [token, ...rest] = tokens;
          if (token === '*') {
            if (Array.isArray(value)) value.forEach((v, i) => walkLinks(v, rest, `${path}/${i}`, inspect));
            else errors.push(issue('reference-shape', path, 'A wildcard reference path requires an array.'));
          }
          else if (value && typeof value === 'object' && own(value, token)) walkLinks(value[token], rest, `${path}/${token}`, inspect);
        }
        const walk = (pattern, inspect) => walkLinks(aspect.value, pattern.slice(1).split('/').map(x => x.replace(/~1/g, '/').replace(/~0/g, '~')), `${ap}/value`, inspect);
        for (const link of definition.links || []) walk(link.path, (value, path) => refers(value, [link.collection], path));
        for (const group of definition.localReferences || []) {
          const local = new Set();
          walk(group.ids, (id, path) => {
            if (!idPattern.test(id)) errors.push(issue('local-id', path, 'Use a namespaced local identifier.'));
            if (local.has(id)) errors.push(issue('duplicate-id', path, 'Local identifiers must be unique in this aspect.'));
            local.add(id);
          });
          for (const pattern of group.references) walk(pattern, (id, path) => {
            if (!local.has(id)) errors.push(issue('dangling-reference', path, 'Reference does not resolve in this aspect.'));
          });
        }
      }
      const claimIds = new Set();
      for (const [k, claim] of (aspect.claims || []).entries()) {
        const cp = `${ap}/claims/${k}`;
        if (claimIds.has(claim.id)) errors.push(issue('duplicate-id', `${cp}/id`, 'Claim IDs must be unique within an aspect.')); claimIds.add(claim.id);
        if ((claim.path !== '' && !claim.path.startsWith('/')) || /~(?![01])/u.test(claim.path) || claim.path.split('/').some(t => badKeys.has(t.replace(/~1/g, '/').replace(/~0/g, '~')))) errors.push(issue('claim-path', `${cp}/path`, 'Use a safe JSON pointer, including for unknown fields.'));
        const target = pointer(aspect.value, claim.path);
        if (['unknown', 'unspecified'].includes(claim.standing) ? target.found : !target.found)
          errors.push(issue('claim-presence', `${cp}/path`, 'Known claims need a value; unknown/unspecified claims must not assert a value.'));
        if (claim.commitment && (claim.stability !== 'fixed' || claim.source?.kind !== 'human')) errors.push(issue('identity-commitment', cp, 'Identity commitments require fixed stability and an attributed human source.'));
        if (claim.source?.kind === 'human' && !nonempty(claim.source.actor)) errors.push(issue('claim-source', `${cp}/source`, 'Name the human source.'));
        if (claim.standing === 'lived') {
          const instance = refers(claim.instance, ['instances'], `${cp}/instance`);
          refers(claim.event, ['events'], `${cp}/event`);
          if (instance && (instance.record.design !== subject.id || !instance.record.events?.some(e => e.id === claim.event))) errors.push(issue('lived-evidence', cp, 'Lived evidence must name an event of this subject instance.'));
        } else if (claim.instance !== undefined || claim.event !== undefined) errors.push(issue('authored-not-lived', cp, 'Non-lived claims cannot masquerade as instance events.'));
      }
    }
  }
  for (const [i, context] of (document.contexts || []).entries()) {
    for (const id of context.subjects || []) refers(id, ['subjects'], `/contexts/${i}/subjects`);
    for (const id of context.aesthetics || []) refers(id, ['subjects'], `/contexts/${i}/aesthetics`);
  }
  for (const [i, expression] of (document.expressions || []).entries()) {
    const path = `/expressions/${i}`;
    for (const id of expression.subjects) refers(id, ['subjects'], `${path}/subjects`);
    for (const id of expression.contexts || []) refers(id, ['contexts'], `${path}/contexts`);
    for (const id of expression.assets || []) refers(id, ['assets'], `${path}/assets`);
    for (const id of expression.aspects || []) {
      const target = refers(id, ['aspects'], `${path}/aspects`);
      if (target && !expression.subjects.some(subject => index.get(subject)?.record.aspects?.some(a => a.id === id))) errors.push(issue('expression-subject', `${path}/aspects`, 'Selected aspect must belong to an expressed subject.'));
      const ascope = target?.record.scope;
      if (ascope?.kind === 'context' && !(expression.contexts || []).includes(ascope.id)) errors.push(issue('expression-context', `${path}/contexts`, 'Selected contextual aspect requires its context.'));
    }
    for (const id of expression.references || []) refers(id, ['references'], `${path}/references`);
    const selectedAspects = new Set(expression.aspects || []);
    for (const id of expression.bindings || []) {
      const target = refers(id, ['bindings'], `${path}/bindings`);
      if (target && !expression.subjects.includes(target.record.subject)) errors.push(issue('expression-subject', `${path}/bindings`, 'A selected binding must belong to an expressed subject.'));
      for (const aspectId of target?.record.aspects || []) {
        selectedAspects.add(aspectId);
        const ascope = aspects.get(aspectId)?.scope;
        if (ascope?.kind === 'context' && !(expression.contexts || []).includes(ascope.id)) errors.push(issue('expression-context', `${path}/bindings`, 'A bound contextual aspect requires its expression context.'));
      }
    }
    const isPrivate = id => {
      const aspect = aspects.get(id);
      return aspect?.claims?.some(c => c.visibility === 'author-only') ||
        def.get(aspect?.definition)?.privatePaths?.some(p => pointer(aspect.value, p).found);
    };
    if (expression.kind === 'system-prompt' && [...selectedAspects].some(isPrivate))
      errors.push(issue('author-only-projection', path, 'A system-prompt expression must not implicitly include author-only claims. Use an explicitly selected/redacted expression.'));
  }
  for (const [i, asset] of (document.assets || []).entries()) {
    if (!/^sha256:[a-f0-9]{64}$/.test(asset.sha256)) errors.push(issue('asset-hash', `/assets/${i}/sha256`, 'Use an exact lowercase SHA-256 byte hash.'));
    if (asset.source) refers(asset.source, ['assets'], `/assets/${i}/source`);
  }
  for (const [i, instance] of (document.instances || []).entries()) refers(instance.design, ['subjects'], `/instances/${i}/design`);
  for (const [i, reference] of (document.references || []).entries()) refers(reference.target, ['subjects', 'expressions', 'assets'], `/references/${i}/target`);
  for (const [i, judgment] of (document.judgments || []).entries()) {
    const path = `/judgments/${i}`; refers(judgment.target, ['subjects', 'aspects', 'expressions', 'assets', 'references', 'bindings'], `${path}/target`);
    for (const id of judgment.evidence) refers(id, ['subjects', 'aspects', 'expressions', 'assets', 'references', 'bindings'], `${path}/evidence`);
    if (judgment.context) refers(judgment.context, ['contexts'], `${path}/context`);
    if (judgment.kind === 'human') {
      if (!['approved', 'unresolved', 'rejected'].includes(judgment.decision) || judgment.score !== undefined) errors.push(issue('judgment-kind', path, 'Human decisions are separate from measured scores.'));
    } else if (judgment.decision !== undefined) errors.push(issue('judgment-kind', path, 'A machine observation or measurement is not human approval.'));
    if (judgment.kind === 'measurement' && (!Number.isFinite(judgment.score) || !nonempty(judgment.instrument) || !nonempty(judgment.limits))) errors.push(issue('measurement', path, 'Measurements require score, instrument and stated limits.'));
    if (judgment.kind === 'observation' && !nonempty(judgment.observation)) errors.push(issue('observation', path, 'Machine observations require an observation, not a decision.'));
    if (judgment.kind === 'observation' && judgment.score !== undefined) errors.push(issue('judgment-kind', path, 'A scored measurement must use the measurement kind and name its limits.'));
  }
  for (const [i, binding] of (document.bindings || []).entries()) {
    const path = `/bindings/${i}`;
    refers(binding.subject, ['subjects'], `${path}/subject`);
    for (const id of binding.aspects || []) {
      refers(id, ['aspects'], `${path}/aspects`);
      if (!index.get(binding.subject)?.record.aspects?.some(a => a.id === id)) errors.push(issue('binding-subject', `${path}/aspects`, 'Bound aspect must belong to the bound subject.'));
    }
    for (const id of binding.references || []) refers(id, ['references'], `${path}/references`);
    for (const id of binding.evidence || []) refers(id, ['subjects', 'aspects', 'expressions', 'assets', 'references', 'judgments'], `${path}/evidence`);
    if (binding.support === 'tested' && !binding.evidence?.length) errors.push(issue('binding-evidence', path, 'Tested support needs explicit evidence references.'));
  }
  return result();
}

/** Duplicate object names are rejected before JSON.parse can silently erase a claim. */
export function parseContent(text, registry, {maxChars = 16 * 1024 * 1024} = {}) {
  const value = parseContentJSON(text, {maxChars});
  const report = validateContent(value, registry);
  if (!report.valid) throw new ContentError(report.errors);
  return {document: value, report};
}

/** Strict bounded JSON parse shared by content import and generated-content decoding. No validation. */
export function parseContentJSON(text, {maxChars = 16 * 1024 * 1024} = {}) {
  if (typeof text !== 'string' || text.length > maxChars) throw new ContentError([issue('json', '', 'Supply a bounded JSON string.')]);
  let value;
  try { value = JSON.parse(text); } catch { throw new ContentError([issue('json', '', 'Malformed JSON.')]); }
  const stack = [];
  for (const token of text.match(/"(?:\\.|[^"\\])*"|[{}\[\],:]|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g) || []) {
    if (token === '{') stack.push({object: true, key: true, keys: new Set()});
    else if (token === '[') stack.push({object: false});
    else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
    else if (token.startsWith('"') && stack.at(-1)?.object && stack.at(-1).key) {
      const frame = stack.at(-1), key = JSON.parse(token);
      if (frame.keys.has(key)) throw new ContentError([issue('duplicate-key', '', `Duplicate JSON property: ${key}.`)]);
      frame.keys.add(key); frame.key = false;
    }
  }
  return value;
}
