/** Pure, deliberately partial consumer projections. No receiver writes, I/O or live instance creation.
 * The shared steps are in projection-kit.mjs and the plain preset is in plc-projection.mjs; this module adds
 * the receiver-specific projections and keeps the original exports. */
import {validateContent} from './content.mjs';
import {createProjectionKit} from './projection-kit.mjs';
import {createPLCProjection} from './plc-projection.mjs';

const kit = createProjectionKit(validateContent);
const {clone, text, record, own, issue, start, publicField, map, finish} = kit;
// Whole mapped sections of these definitions must not implicitly copy author-only, lived or private material.
const aspect = (state, definition, options = {}) => kit.aspect(state, definition,
  {...options, whole: definition.startsWith('sonalon:') || definition === 'core:place'});

export const {projectPLCPreset} = createPLCProjection(kit);

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
