/** Pure bounded authored contracts. All I/O and receiver admission belong to callers.
 * The validators are authored-engine.mjs bound to the published content and bundle modules; this module
 * adds the receiver projections (receivingFixture) and keeps the original exports. */
import * as content from '../src/core/content.mjs';
import * as bundles from '../src/core/bundles.mjs';
import {ContentError, validateContent} from '../src/core/content.mjs';
import {projectPLCPreset, projectSonalonDesign} from '../src/core/consumer-projections.mjs';
import {DEFINITIONS} from './definitions.mjs';
import {RECEIVING_DEFINITIONS} from './receiving-definitions.mjs';
import {createAuthoredEngine} from './authored-engine.mjs';
import {same, problem} from './authored-util.mjs';

const {LIMITS, parseDefinitions, loadRegistry, validateAuthored, exportAuthored, openAuthored, requireValid, fail} =
  createAuthoredEngine({content, bundles});
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
freeze(RECEIVING_DEFINITIONS);
export {LIMITS, parseDefinitions, loadRegistry, validateAuthored, exportAuthored, openAuthored};

const consumed = {
  plc: ['core:identity', 'core:dossier', 'core:communication'],
  sonalon: ['core:identity', 'core:voice', 'core:communication', 'sonalon:design-metadata',
    'sonalon:authored-sections', 'sonalon:voice-sections', 'sonalon:start']
};
const accepted = new Map([...RECEIVING_DEFINITIONS.aspectDefinitions,
  ...RECEIVING_DEFINITIONS.profiles].map(d => [d.id, d]));
const compatibleDefinition = d => d && accepted.has(d.id) && same(d, accepted.get(d.id));

/** Preserve the validated transport graph while hiding unsupported meanings from old projectors.
 * Aliases retain IDs, values, scope, claims, schemas and typed links, so expression/context/binding
 * dependencies still resolve. Only the private view's definition names change; no required meaning
 * reaches this function and neither the original package nor its registry is edited.
 */
function projectionView(document, registry, omitted) {
  const view = JSON.parse(JSON.stringify(document));
  const definitions = JSON.parse(JSON.stringify(registry));
  const ids = new Set([...definitions.aspectDefinitions, ...definitions.profiles,
    ...(view.subjects || []).flatMap(s => s.aspects || []).map(a => ({id:a.definition}))]
    .map(d => d.id));
  const aliases = new Map();
  for (const s of view.subjects || []) for (const a of s.aspects || []) if (omitted.has(a.id)) {
    if (!aliases.has(a.definition)) {
      let id = 'projection:omitted';
      while (ids.has(id)) id += '-x';
      ids.add(id); aliases.set(a.definition, id);
      const original = definitions.aspectDefinitions.find(d => d.id === a.definition);
      if (original) definitions.aspectDefinitions.push({...original, id});
    }
    a.definition = aliases.get(a.definition);
  }
  const checked = validateContent(view, definitions);
  if (!checked.valid || !checked.executionReady) throw new ContentError(checked.errors.length ?
    checked.errors : [problem('projection-view', '', 'Projection view requires unsupported meaning.')]);
  return {document:view, registry:definitions};
}

// Provisional PLC T465-c producer compatibility, not acceptance of the receiving implementation.
export const PLC_PROVISIONAL_LIMITS = Object.freeze({name:120,prompt:8000,id:200,
  fileBytes:32768,fragmentChars:12288,fragmentEnvelopeChars:12544});
function plcBounds(value, route) {
  if (!value) return [];
  const limits = PLC_PROVISIONAL_LIMITS;
  const serialized = JSON.stringify(value);
  const bytes = new TextEncoder().encode(serialized).length;
  // Unpadded base64url has ceil(4*n/3) ASCII code units. The receiver measures
  // the envelope without '#'; our canonical fragment has only the 'preset=' key.
  const encodedChars = Math.ceil(bytes * 4 / 3);
  return Object.keys(value).some(k => !['id','name','prompt'].includes(k)) ||
    ['id','name','prompt'].some(k => typeof value[k] !== 'string' || value[k].length > limits[k]) ||
    bytes > limits.fileBytes || (route === 'fragment' &&
      (encodedChars > limits.fragmentChars || encodedChars + 'preset='.length > limits.fragmentEnvelopeChars)) ?
    [problem('plc-provisional-bounds', '',
      `Candidate exceeds provisional T465-c ${route} bounds; no truncation.`)] : [];
}
/** Current target projections; a trusted validator callback can establish shape acceptance only. */
export async function receivingFixture(input, {target, subjectId, purpose = 'fresh-design',
  route = 'file', presetId, validate, crypto, openExternal, hasherFactory} = {}) {
  // Reverify the actual bundle; callers cannot forge a verified-byte Map or stale support report.
  const candidate = await openAuthored(input, {crypto, openExternal, hasherFactory});
  const support = requireValid(candidate.document, candidate.registry, candidate.visibility || 'private');
  const omissions = [], errors = [], resources = [];
  if (!Object.hasOwn(consumed, target)) fail('target', '', 'Unknown target.');
  if (!['file', 'fragment'].includes(route)) fail('route', '', 'Unknown transfer route.');
  if (target !== 'plc' && route !== 'file')
    fail('route', '', 'Fragment compatibility is only defined for the PLC plain preset.');
  const subject = candidate.document.subjects?.find(s => s.id === subjectId);
  if (!subject) fail('subject', '', 'Select an existing subject.');
  if (purpose !== 'fresh-design') errors.push(problem('purpose', '',
    `${purpose} is unsupported here; receiver owns copy/report/attachment/continuation.`));
  if (!support.executionReady) errors.push(problem('required-support', '', 'Required unknown meaning.'));
  const profiles = new Map(candidate.registry.profiles.map(p => [p.id, p]));
  const seen = new Set();
  function profile(id, required) {
    if (seen.has(id + required)) return; seen.add(id + required);
    if (id !== 'profile:character' || !compatibleDefinition(profiles.get(id))) {
      if (required) errors.push(problem('required-profile', id, 'Target does not consume this profile.'));
      else omissions.push({id, reason: 'optional profile transported, not interpreted'});
    }
    for (const parent of profiles.get(id)?.extends || []) profile(parent, required);
  }
  for (const s of candidate.document.subjects || []) {
    for (const id of s.profiles || []) profile(id, false);
    for (const id of s.requires || []) profile(id, true);
    if (s.id !== subjectId) omissions.push({id: s.id, reason: 'dependency subject retained, not projected'});
  }
  const omitFromProjection = new Set();
  for (const a of (candidate.document.subjects || []).flatMap(s => s.aspects || [])) {
    const definition = candidate.registry.aspectDefinitions.find(d => d.id === a.definition);
    const compatible = consumed[target].includes(a.definition) && compatibleDefinition(definition) &&
      !support.unsupported.some(u => u.definition === a.definition);
    if (!compatible) {
      if (a.required) errors.push(problem('required-aspect', a.id, 'Target does not consume this meaning.'));
      else omissions.push({id: a.id, reason: 'optional aspect transported, not interpreted'});
      if (consumed[target].includes(a.definition)) omitFromProjection.add(a.id);
    }
    if (a.definition === 'authored:media-v1') for (const r of a.value.resources || []) {
      const asset = candidate.document.assets.find(x => x.id === r.asset);
      const verified = candidate.inlineBytes?.has(asset.sha256) || candidate.verifiedExternal?.includes(asset.sha256);
      resources.push({asset: r.asset, required: r.required, status: verified ? 'verified-bytes' : 'metadata-only'});
      if (!verified) {
        if (r.required) errors.push(problem('missing-resource', r.asset, 'Required bytes unavailable.'));
        else omissions.push({id: r.asset, reason: 'optional bytes unavailable'});
      }
    }
  }
  if (errors.length) return {target, purpose, value: null, omissions, resources, errors,
    shapeAccepted: false, admissionReady: false, runtimeReady: false};
  const view = projectionView(candidate.document, candidate.registry, omitFromProjection);
  // Check PLC bounds before invoking a receiver callback, so incompatible projections stay atomic.
  const projected = target === 'plc' ? projectPLCPreset(view.document, view.registry,
    {subjectId, presetId}) : projectSonalonDesign(view.document, view.registry,
    {subjectId, ...(validate ? {validate} : {})});
  if (target === 'plc') {
    const bounds = plcBounds(projected.value, route);
    if (bounds.length) return {target, purpose, value:null, omissions, resources, errors:bounds,
      shapeAccepted:false, admissionReady:false, runtimeReady:false};
    if (validate && projected.value) {
      const checked = projectPLCPreset(view.document, view.registry, {subjectId,presetId,validate});
      projected.value = checked.value; projected.report = checked.report;
    }
  }
  return {target, purpose, value: projected.value, omissions, resources, errors: projected.report.errors,
    projection: projected.report, shapeAccepted: projected.report.validation === 'accepted',
    admissionReady: false, runtimeReady: false};
}


export {DEFINITIONS};
