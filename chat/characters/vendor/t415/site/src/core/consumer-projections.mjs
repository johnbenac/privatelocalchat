/** Pure, deliberately partial consumer projections. No receiver writes, I/O or live instance creation. */
import {validateContent} from './content.mjs';

const clone = value => structuredClone(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const credentials = /^(authorization|password|secret|credential|credentials|apiKey|api_key|accessToken|refreshToken|sessionToken|clientSecret|token|privateKey|signingKey|personKey|residentKey|endpoint|providerUrl)$/i;
const issue = (code, source, message) => ({code, source, message});

function start(document, registry, {subjectId, contextIds = []}, consumer) {
  const report = {consumer, subjectId, ready: false, validation: 'not-run', mapped: [], omitted: [], missing: [], errors: []};
  const checked = validateContent(document, registry);
  if (!checked.valid) report.errors.push(...checked.errors.map(e => issue(e.code, e.path, e.message)));
  if (checked.valid && !checked.executionReady)
    report.errors.push(issue('unsupported-required', '/', 'This selected content envelope requires semantics that are not loaded; narrow the selection or load those definitions before projection.'));
  const definitions = new Map(checked.valid ? registry.aspectDefinitions.map(d => [d.id, d]) : []);
  if (report.errors.length) return {document, definitions, subject: null, contextIds: [], report, consumed: new Set()};
  if (!Array.isArray(contextIds) || contextIds.some(id => !document.contexts?.some(c => c.id === id)))
    report.errors.push(issue('context', 'contextIds', 'Select existing contexts explicitly.'));
  const subject = document.subjects?.find(s => s.id === subjectId);
  if (!subject) report.errors.push(issue('subject', 'subjectId', 'Select an existing subject.'));
  return {document, definitions, subject, contextIds, report, consumed: new Set()};
}
const tokens = path => path === '' ? [] : path.slice(1).split('/').map(t => t.replace(/~1/g, '/').replace(/~0/g, '~'));
function present(value, path) {
  for (const key of tokens(path)) {
    if (value === null || typeof value !== 'object' || !own(value, key)) return false;
    value = value[key];
  }
  return true;
}
function overlaps(left, right) {
  const a = tokens(left), b = tokens(right);
  return a.slice(0, Math.min(a.length, b.length)).every((key, i) => key === b[i]);
}
function privatePaths(state, a) {
  return (state.definitions.get(a.definition)?.privatePaths || []).filter(path => present(a.value, path));
}
function aspect(state, definition, {required = false} = {}) {
  const selected = state.subject?.aspects?.filter(a => a.definition === definition &&
    (a.scope.kind === 'subject' || a.scope.kind === 'context' && state.contextIds.includes(a.scope.id))) || [];
  if (selected.length > 1) {
    state.report.errors.push(issue('ambiguous-aspect', definition, 'Select content with one applicable aspect of this definition; conflicting scopes are not merged.'));
    return null;
  }
  if (!selected.length) {
    if (required) state.report.missing.push(issue('missing-aspect', definition, 'Supply this consumer-required aspect explicitly.'));
    return null;
  }
  state.consumed.add(selected[0].id);
  if (definition.startsWith('sonalon:') || definition === 'core:place') {
    if (selected[0].claims?.some(c => c.visibility === 'author-only' || c.standing === 'lived'))
      state.report.errors.push(issue('private-or-lived', selected[0].id, 'A whole mapped section cannot implicitly copy author-only or lived-instance claims.'));
    if (privatePaths(state, selected[0]).length)
      state.report.errors.push(issue('declared-private', selected[0].id, 'A whole mapped section contains data-declared private material; explicitly redact the source before projection.'));
  }
  return selected[0];
}
function publicField(state, a, key) {
  if (!a || !record(a.value) || !own(a.value, key)) return undefined;
  const path = `/${key}`;
  const declaredPrivate = privatePaths(state, a).some(p => overlaps(path, p));
  const blocked = a.claims?.some(c => overlaps(path, c.path) &&
    (c.visibility === 'author-only' || c.standing === 'lived'));
  if (blocked || declaredPrivate) {
    state.report.omitted.push(issue(declaredPrivate ? 'declared-private' : 'private-or-lived', `${a.id}${path}`, 'Private or lived-instance material, including descendants, is not projected as authored character description.'));
    return undefined;
  }
  return clone(a.value[key]);
}
function map(state, source, target) { state.report.mapped.push({source, target}); }
function omitted(state) {
  for (const a of state.subject?.aspects || []) if (!state.consumed.has(a.id))
    state.report.omitted.push(issue('unmapped-aspect', a.id, a.scope.kind === 'instance'
      ? 'Lived-instance state is not an authored consumer design or preset.'
      : 'This aspect is retained in the source library but has no mapping in this projection.'));
  if (state.document.instances?.some(i => i.design === state.subject?.id))
    state.report.omitted.push(issue('not-continuation', 'instances', 'No lived history, signing key, host authority or continuation checkpoint is transferred.'));
}
function cleanOutput(value, errors, path = '') {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (credentials.test(key)) errors.push(issue('forbidden-export', `${path}/${key}`, 'Credentials, provider endpoints and authority do not belong in consumer projections.'));
    else cleanOutput(child, errors, `${path}/${key}`);
  }
}
function finish(state, value, validate) {
  omitted(state);
  if (value) cleanOutput(value, state.report.errors);
  if (state.report.errors.length || state.report.missing.length) return {value: null, report: state.report};
  if (validate) {
    try {
      const result = validate(clone(value));
      if (result?.ok === true) { state.report.validation = 'accepted'; state.report.ready = true; }
      else {
        state.report.validation = 'rejected';
        state.report.errors.push(...(Array.isArray(result?.errors) && result.errors.length ? result.errors :
          [{path: '/', message: 'The receiving validator did not accept the projection.'}]).map(e =>
          issue('receiver-rejected', e.path || '/', e.message || 'Receiving requirement is not satisfied.')));
      }
    } catch { state.report.validation = 'rejected'; state.report.errors.push(issue('receiver-validator', '/', 'The receiving validator could not validate this candidate.')); }
  }
  return {value: state.report.errors.length ? null : value, report: state.report};
}

/** A PLC preset is {id,name,prompt}; this does not install it in PLC or invent a bundle import route. */
export function projectPLCPreset(document, registry, options = {}) {
  const state = start(document, registry, options, 'privatelocalchat/preset');
  if (state.report.errors.length) return {value: null, report: state.report};
  const identity = aspect(state, 'core:identity'), dossier = aspect(state, 'core:dossier');
  const communication = aspect(state, 'core:communication');
  const lines = [`Portray ${state.subject.label}.`];
  map(state, `${state.subject.id}/label`, 'name and prompt');
  if (text(state.subject.summary)) { lines.push(state.subject.summary); map(state, `${state.subject.id}/summary`, 'prompt'); }
  for (const [a, key, label] of [[identity, 'premise', 'Premise'], [dossier, 'motive', 'Motive'],
    [dossier, 'contradiction', 'Central contradiction'], [dossier, 'actsOnOthers', 'How you act on others'],
    [communication, 'manner', 'Communication'], [communication, 'signatureLine', 'Authored sample line'],
    [communication, 'neverSoundsLike', 'Avoid this manner']]) {
    const value = publicField(state, a, key);
    if (text(value)) { lines.push(`${label}: ${value}`); map(state, `${a.id}/${key}`, 'prompt'); }
  }
  lines.push('The description and sample line above are authored character material, not memories of events with the user.');
  const id = options.presetId ?? `cosmogenitor:${state.subject.id}`;
  if (!text(id)) state.report.errors.push(issue('preset-id', 'presetId', 'Supply a stable nonempty preset identifier.'));
  // Shape is grounded in PLC assistant.mjs/backups.mjs; actual restore helper is exercised in tests.
  return finish(state, {id, name: state.subject.label, prompt: lines.join('\n\n')}, options.validate);
}

/** Explicit Sonalon-specific authored material complements common aspects; no generic life history is invented. */
export function projectSonalonDesign(document, registry, options = {}) {
  const state = start(document, registry, options, 'cognitive-fabric/resident-design');
  if (state.report.errors.length) return {value: null, report: state.report};
  const identity = aspect(state, 'core:identity', {required: true});
  const voice = aspect(state, 'core:voice', {required: true});
  const communication = aspect(state, 'core:communication');
  const metadata = aspect(state, 'sonalon:design-metadata', {required: true});
  const authored = aspect(state, 'sonalon:authored-sections', {required: true});
  const performance = aspect(state, 'sonalon:voice-sections', {required: true});
  const seed = aspect(state, 'sonalon:start', {required: true});
  const premise = publicField(state, identity, 'premise');
  const description = publicField(state, voice, 'description');
  if (!text(premise)) state.report.missing.push(issue('missing-field', 'core:identity/premise', 'Sonalon requires an explicit authored premise.'));
  if (!text(description)) state.report.missing.push(issue('missing-field', 'core:voice/description', 'Sonalon requires an explicit voice description.'));
  if (state.report.missing.length || state.report.errors.length) return finish(state, null, options.validate);
  const meta = clone(metadata.value), background = clone(authored.value), voiceSections = clone(performance.value);
  if (!record(meta.identity) || !text(meta.designId) || !text(meta.designVersion) || !text(meta.schemaVersion))
    state.report.missing.push(issue('missing-field', metadata.id, 'Supply designId, designVersion, schemaVersion and receiver-specific identity fields (including age and presentation).'));
  if (record(meta.identity) && ['name', 'premise'].some(k => own(meta.identity, k)))
    state.report.errors.push(issue('overlapping-seed', metadata.id, 'Receiver metadata must not override the name and premise mapped from common content.'));
  if (['identity', 'voice'].some(k => own(background, k)))
    state.report.errors.push(issue('overlapping-seed', authored.id, 'Common mapped identity and voice cannot be overridden by the remaining authored sections.'));
  if (['description', 'rhythm', 'diction'].some(k => own(voiceSections, k)))
    state.report.errors.push(issue('overlapping-seed', performance.id, 'Voice description/rhythm/diction must be supplied through the mapped common aspects.'));
  const mappedVoice = {...voiceSections, description};
  const rhythm = publicField(state, voice, 'pace'), diction = publicField(state, communication, 'manner');
  if (text(rhythm)) { mappedVoice.rhythm = rhythm; map(state, `${voice.id}/pace`, '/authored/voice/rhythm'); }
  if (text(diction)) { mappedVoice.diction = diction; map(state, `${communication.id}/manner`, '/authored/voice/diction'); }
  const value = {schema: 'cognitive-fabric/resident-design', schemaVersion: meta.schemaVersion,
    design: {designId: meta.designId, name: state.subject.label, designVersion: meta.designVersion,
      ...(text(state.subject.summary) ? {summary: state.subject.summary} : {})},
    authored: {...background, identity: {...meta.identity, name: state.subject.label, premise}, voice: mappedVoice},
    start: clone(seed.value)};
  map(state, `${state.subject.id}/label`, '/design/name and /authored/identity/name');
  if (text(state.subject.summary)) map(state, `${state.subject.id}/summary`, '/design/summary');
  map(state, `${identity.id}/premise`, '/authored/identity/premise');
  map(state, `${voice.id}/description`, '/authored/voice/description');
  map(state, metadata.id, '/design identifiers, schemaVersion and receiver-specific identity');
  map(state, authored.id, '/authored remaining explicit receiver sections');
  map(state, performance.id, '/authored/voice remaining explicit samples and habits');
  map(state, seed.id, '/start (explicit authored seeds, not lived history)');
  return finish(state, value, options.validate);
}

/** Semantic place projection: common room labels/connections plus explicit receiver geometry/affordance metadata. */
export function projectSonalonPlace(document, registry, options = {}) {
  const state = start(document, registry, options, 'world-sidecar/1');
  if (state.report.errors.length) return {value: null, report: state.report};
  const place = aspect(state, 'core:place', {required: true});
  const metadata = aspect(state, 'sonalon:place-metadata', {required: true});
  if (state.report.missing.length || state.report.errors.length) return finish(state, null, options.validate);
  const common = clone(place.value), meta = clone(metadata.value);
  if (!record(meta.location) || !Array.isArray(meta.levels) || !Array.isArray(meta.roomMap) || !Array.isArray(meta.items))
    state.report.missing.push(issue('missing-field', metadata.id, 'Supply location/frame, levels, roomMap and items for the receiving world contract.'));
  if (state.report.missing.length) return finish(state, null, options.validate);
  const mappedRooms = new Map();
  const rooms = (common.rooms || []).map(room => {
    const matches = meta.roomMap.filter(m => record(m) && m.subjectRoomId === room.id);
    const mapping = matches[0];
    if (matches.length !== 1 || !text(mapping.id)) {
      state.report.missing.push(issue('room-mapping', `${place.id}/rooms/${room.id}`, 'Supply an explicit consumer room ID, kind and level; identifiers are not guessed.'));
      return null;
    }
    mappedRooms.set(room.id, mapping.id);
    const {subjectRoomId, ...fields} = mapping;
    map(state, `${place.id}/rooms/${room.id}/label`, `/rooms/${mapping.id}/designation/name`);
    return {...fields, designation: {...fields.designation, name: room.label}};
  }).filter(Boolean);
  const connections = (common.connections || []).map((connection, i) => {
    const matches = Array.isArray(meta.connections) ? meta.connections.filter(m => record(m) &&
      m.subjectFrom === connection.from && m.subjectTo === connection.to) : [];
    if (matches.length !== 1) {
      state.report.missing.push(issue('connection-mapping', `${place.id}/connections/${i}`, 'Supply one explicit connection mapping by subjectFrom/subjectTo, including kind and consumer metadata.'));
      return null;
    }
    const {subjectFrom, subjectTo, ...fields} = matches[0];
    map(state, `${place.id}/connections/${i}`, `/connections/${fields.id}`);
    return {...fields, between: [mappedRooms.get(connection.from), mappedRooms.get(connection.to)]};
  }).filter(Boolean);
  if (meta.extraConnections !== undefined && !Array.isArray(meta.extraConnections))
    state.report.missing.push(issue('connection-mapping', metadata.id, 'Extra receiver-specific connections must be an explicit array.'));
  const value = {format: 'world-sidecar/1', contractVersion: meta.contractVersion,
    location: {...meta.location, name: state.subject.label,
      ...(text(common.description) ? {description: common.description} : {})},
    levels: meta.levels, rooms, connections: [...connections, ...(Array.isArray(meta.extraConnections) ? meta.extraConnections : [])], items: meta.items};
  for (const field of ['affordances', 'phenomena', 'sensing', 'anchors', 'cameras']) if (meta[field] !== undefined) value[field] = meta[field];
  if (common.geometry?.length) state.report.omitted.push(issue('geometry-not-copied', `${place.id}/geometry`, 'Geometry bytes are transferred as assets; this semantic projection does not pretend they were delivered.'));
  map(state, `${state.subject.id}/label`, '/location/name');
  map(state, metadata.id, '/location, levels, item/affordance details and explicit ID mappings');
  return finish(state, value, options.validate);
}
