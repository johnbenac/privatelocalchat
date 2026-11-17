/** Pure bounded authored contracts. All I/O and receiver admission belong to callers. */
import {CONTENT_SCHEMA, checkJSON, createRegistry, registerDefinitions, validateContent,
  parseContent, validateSchema, ContentError} from '../../site/src/core/content.mjs';
import {exportBundle, parseBundle, importBundle} from '../../site/src/core/bundles.mjs';
import {projectPLCPreset, projectSonalonDesign} from '../../site/src/core/consumer-projections.mjs';
import {DEFINITIONS} from './definitions.mjs';
import {RECEIVING_DEFINITIONS} from './receiving-definitions.mjs';

function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
freeze(DEFINITIONS);
freeze(RECEIVING_DEFINITIONS);

export const LIMITS = Object.freeze({maxMetadataBytes: 1048576, maxInlineAssetBytes: 65536,
  maxInlineTotalBytes: 262144, maxEntries: 2048,
  maxExternalAssetBytes: 1048576, maxExternalTotalBytes: 4194304});
const sorted = x => x && typeof x === 'object' ? Array.isArray(x) ? x.map(sorted) :
  Object.fromEntries(Object.keys(x).sort().map(k => [k, sorted(x[k])])) : x;
const same = (x, y) => JSON.stringify(sorted(x)) === JSON.stringify(sorted(y));
const problem = (code, path, message) => ({code, path, message});
const fail = (code, path, message) => { throw new ContentError([problem(code, path, message)]); };
const safe = x => { const errors = checkJSON(x); if (errors.length) throw new ContentError(errors); };
const bounded = x => {
  safe(x);
  if (new TextEncoder().encode(JSON.stringify(x)).length > LIMITS.maxMetadataBytes)
    fail('resource-limit', '', 'Authored metadata exceeds 1 MiB.');
};
const known = new Map([...DEFINITIONS.aspectDefinitions, ...DEFINITIONS.profiles].map(d => [d.id, d]));

/** Uses the accepted duplicate-key reader, with a transport-only content extension. */
export function parseDefinitions(text) {
  if (typeof text !== 'string' || text.length > LIMITS.maxMetadataBytes ||
      new TextEncoder().encode(text).length > LIMITS.maxMetadataBytes)
    fail('resource-limit', '', 'Supply at most 1 MiB of definition JSON.');
  // Establish one complete standalone JSON value before placing its original text in
  // the duplicate-key-aware reader. Otherwise a sibling can escape the wrapper value.
  try { JSON.parse(text); }
  catch { fail('json', '', 'Supply one complete definition JSON value.'); }
  const registry = createRegistry({schema: CONTENT_SCHEMA});
  const wrapped = '{"format":"cosmogenitor/content/0","subjects":[{"id":"resource:definitions",' +
    '"label":"Definitions","extensions":{"resource:definitions":' + text + '}}]}';
  return parseContent(wrapped, registry, {maxChars: LIMITS.maxMetadataBytes + 256})
    .document.subjects[0].extensions['resource:definitions'];
}

/** Inputs are data resources, never plugins. Registration validates both snapshots. */
export function loadRegistry(starter, additions = DEFINITIONS) {
  bounded(starter); bounded(additions);
  if (!starter || typeof starter !== 'object' || Array.isArray(starter))
    fail('registry', '', 'Supply a registry resource object.');
  if (additions?.format !== undefined && additions.format !== 'cosmogenitor/content-registry/0')
    fail('profile-version', '/format', 'Unsupported definition resource format.');
  const base = createRegistry({schema: CONTENT_SCHEMA, ...starter});
  const registry = registerDefinitions(base, additions);
  for (const d of [...registry.aspectDefinitions, ...registry.profiles]) {
    if (known.has(d.id) && !same(d, known.get(d.id)))
      fail('profile-version', d.id, 'Protected authored definition is incompatible.');
  }
  return registry;
}

export function validateAuthored(document, registry, {visibility = 'private'} = {}) {
  // Never inspect document fields before accepted safe JSON/content validation.
  const report = validateContent(document, registry);
  const errors = [...report.errors];
  if (!report.valid) return {...report, errors};
  try { bounded(document); } catch (e) { errors.push(...e.errors); }
  for (const subject of document.subjects || []) for (const a of subject.aspects || []) {
    if (known.has(a.definition)) errors.push(...validateSchema(a.value,
      known.get(a.definition).schema, {path: a.id}).errors);
  }
  if (errors.length) return {...report, valid: false, executionReady: false, errors};
  const error = (code, path, message) => errors.push(problem(code, path, message));
  if (!['private', 'public'].includes(visibility)) error('visibility', '', 'Unknown visibility.');
  if (visibility === 'public' && report.unsupported.length)
    error('privacy', '', 'Explicitly select public content without opaque unsupported meanings.');
  for (const [group, rows] of Object.entries(document)) {
    if (Array.isArray(rows) && rows.length > 256) error('resource-limit', group, 'At most 256 records per collection.');
  }
  const definitions = new Map([...registry.aspectDefinitions, ...registry.profiles].map(d => [d.id, d]));
  // Used protected definitions must match the shipped resource, not an untrusted weakened schema.
  const inspected = new Set();
  const inspect = id => {
    if (inspected.has(id)) return;
    inspected.add(id);
    if (known.has(id) && definitions.has(id) && !same(definitions.get(id), known.get(id)))
      error('profile-version', id, 'Incompatible protected authored definition.');
    const definition = definitions.get(id);
    for (const parent of definition?.extends || []) inspect(parent);
    for (const aspect of definition?.aspects || []) inspect(aspect);
  };
  for (const subject of document.subjects || []) {
    for (const id of [...subject.profiles || [], ...subject.requires || []]) inspect(id);
    if ((subject.aspects || []).length > 64) error('resource-limit', subject.id, 'At most 64 aspects per subject.');
    for (const aspect of subject.aspects || []) {
      inspect(aspect.definition);
      if (!known.has(aspect.definition)) continue;
      const v = aspect.value, path = aspect.id;
      if (v.version !== '1.0.0') error('profile-version', path, 'Unsupported authored value version.');
      if (aspect.claims?.some(c => c.standing === 'lived'))
        error('standing', path, 'Authored resources cannot assert firsthand lived standing.');
      if (visibility === 'public' && (v.privateNote !== undefined ||
          aspect.claims?.some(c => c.visibility === 'author-only')))
        error('privacy', path, 'Explicitly redact private author material before public export.');
      if (aspect.definition === 'authored:lore-v1') {
        for (const e of v.entries || []) {
          if (visibility === 'public' && e.audience.some(a => a !== 'public'))
            error('privacy', path, 'Public lore requires a public audience.');
          if (!e.audience.length) error('audience', path, 'Lore requires an explicit audience.');
        }
      }
      if (aspect.definition === 'authored:prepared-v1') {
        if ((v.states || []).reduce((n, s) => n + (s.variants || []).length, 0) > 128)
          error('resource-limit', path, 'At most 128 variants across the prepared aspect.');
        const variables = new Map();
        for (const variable of v.variables || []) {
          if (variables.has(variable.key) || !variable.values.length ||
              new Set(variable.values).size !== variable.values.length)
            error('condition', path, 'Variable declarations must be unique with nonempty unique values.');
          variables.set(variable.key, variable.values);
        }
        const variantIds = new Set();
        for (const state of v.states || []) {
          const keys = new Set();
          for (const condition of state.when || []) {
            if (keys.has(condition.key) || !variables.get(condition.key)?.includes(condition.equals))
              error('condition', path, 'Conditions need declared keys/values and no conflicting duplicate key.');
            keys.add(condition.key);
          }
          for (const variant of state.variants || []) {
            if (variantIds.has(variant.id)) error('variant', path, 'Variant IDs must be unique in this aspect.');
            variantIds.add(variant.id);
          }
        }
      }
      if (aspect.definition === 'authored:media-v1') {
        const assets = new Set();
        for (const resource of v.resources || []) {
          if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(resource.license))
            error('rights', path, 'Rights declarations cannot contain control characters.');
          if (assets.has(resource.asset)) error('resource', path, 'Each resource has one requirement declaration.');
          assets.add(resource.asset);
        }
      }
      if (aspect.definition === 'authored:evidence-v1') {
        const entries = new Map((v.entries || []).map(e => [e.id, e]));
        for (const e of entries.values()) {
          if (new Set(e.audience).size !== e.audience.length ||
              new Set(e.derivedFrom || []).size !== (e.derivedFrom || []).length)
            error('provenance', path, 'Audience and derivation links cannot contain duplicates.');
          if (e.design !== subject.id) error('identity', path, 'Evidence design must name its containing subject.');
          if (!e.audience.length) error('audience', path, 'Evidence requires an explicit audience.');
          if (visibility === 'public' && e.audience.some(a => a !== 'public'))
            error('privacy', path, 'Public evidence requires a public audience.');
          if (['authored-seed', 'derived'].includes(e.standing) &&
              [e.individual, e.run, e.participant, e.source, e.occurrence].some(x => x !== undefined))
            error('standing', path, 'Seeds and derivatives cannot introduce firsthand attribution; follow source links.');
          if (['reported', 'synthetic-report'].includes(e.standing) &&
              ![e.individual, e.run, e.participant, e.source, e.occurrence].every(x => typeof x === 'string' && x.length))
            error('provenance', path, 'Reports require source, occurrence, individual, run and participant.');
          if (e.standing === 'derived' ? !e.derivedFrom?.length : e.derivedFrom !== undefined)
            error('provenance', path, 'Only derived entries have nonempty derivation links.');
          for (const id of e.derivedFrom || []) {
            const original = entries.get(id);
            if (!original || e.audience.some(a => !original.audience.includes(a)))
              error('audience', path, 'Derivation must resolve and cannot widen audience.');
          }
        }
        const visiting = new Set(), visited = new Set();
        function walk(id) {
          if (visiting.has(id)) { error('provenance', path, 'Derivation cycle.'); return; }
          if (visited.has(id)) return;
          visiting.add(id);
          for (const parent of entries.get(id)?.derivedFrom || []) walk(parent);
          visiting.delete(id); visited.add(id);
        }
        for (const id of entries.keys()) walk(id);
      }
    }
    // All media references consumed by known prepared/presentation aspects must be declared.
    const declared = new Set((subject.aspects || []).filter(a => a.definition === 'authored:media-v1')
      .flatMap(a => (a.value.resources || []).map(r => r.asset)));
    for (const a of subject.aspects || []) {
      const used = a.definition === 'authored:presentation-v1' ? a.value.assets || [] :
        a.definition === 'authored:prepared-v1' ? (a.value.states || []).flatMap(s =>
          (s.variants || []).flatMap(v => v.assets || [])) : [];
      for (const id of used) if (!declared.has(id)) error('undeclared-resource', a.id, id);
    }
  }
  return {...report, valid: errors.length === 0,
    executionReady: errors.length === 0 && report.executionReady, errors};
}

function requireValid(document, registry, visibility) {
  const report = validateAuthored(document, registry, {visibility});
  if (!report.valid) throw new ContentError(report.errors);
  return report;
}

export async function exportAuthored(document, registry, options = {}) {
  requireValid(document, registry, options.visibility || 'private');
  return exportBundle(document, registry, {...options, limits: LIMITS});
}

/** parseBundle checks duplicate keys, safe JSON, closure and exact bytes before returning. */
export async function openAuthored(input, options = {}) {
  const candidate = typeof input === 'string' ?
    await parseBundle(input, {...options, limits: LIMITS}) :
    await importBundle(input, {...options, limits: LIMITS});
  requireValid(candidate.document, candidate.registry, candidate.visibility);
  return candidate;
}

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
