/** Receiving projections, bound to the content module and the targets a consumer carries. Pure.
 * A target is {consumed, routes, project(view, options)}; this module names no target. An entry binds the targets it carries,
 * so one that carries a single target holds no receiving data and no projector of any other. */
import {same, problem} from './authored-util.mjs';

/** Preserve the validated transport graph while hiding unsupported meanings from old projectors.
 * Aliases retain IDs, values, scope, claims, schemas and typed links, so expression/context/binding
 * dependencies still resolve. Only the private view's definition names change; no required meaning
 * reaches this function and neither the original package nor its registry is edited. */
function projectionView(content, document, registry, omitted) {
  const {validateContent, ContentError} = content;
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

/** `authored` is the authored engine ({openAuthored, requireValid, fail}); `content` gives {validateContent, ContentError};
 * `definitions` is the receiving data of the targets carried ({aspectDefinitions, profiles}). */
export function createReceiving({authored: {openAuthored, requireValid, fail}, content, targets, definitions}) {
  const accepted = new Map([...definitions.aspectDefinitions, ...definitions.profiles].map(d => [d.id, d]));
  const compatibleDefinition = d => d && accepted.has(d.id) && same(d, accepted.get(d.id));

  /** Current target projections; a trusted validator callback can establish shape acceptance only. */
  async function receivingFixture(input, {target, subjectId, purpose = 'fresh-design',
    route = 'file', presetId, validate, crypto, openExternal, hasherFactory} = {}) {
    // Reverify the actual bundle; callers cannot forge a verified-byte Map or stale support report.
    const candidate = await openAuthored(input, {crypto, openExternal, hasherFactory});
    const support = requireValid(candidate.document, candidate.registry, candidate.visibility || 'private');
    const omissions = [], errors = [], resources = [];
    if (!Object.hasOwn(targets, target)) fail('target', '', 'Unknown target.');
    if (!['file', 'fragment'].includes(route)) fail('route', '', 'Unknown transfer route.');
    if (!targets[target].routes.includes(route))
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
    const consumed = targets[target].consumed;
    const omitFromProjection = new Set();
    for (const a of (candidate.document.subjects || []).flatMap(s => s.aspects || [])) {
      const definition = candidate.registry.aspectDefinitions.find(d => d.id === a.definition);
      const compatible = consumed.includes(a.definition) && compatibleDefinition(definition) &&
        !support.unsupported.some(u => u.definition === a.definition);
      if (!compatible) {
        if (a.required) errors.push(problem('required-aspect', a.id, 'Target does not consume this meaning.'));
        else omissions.push({id: a.id, reason: 'optional aspect transported, not interpreted'});
        if (consumed.includes(a.definition)) omitFromProjection.add(a.id);
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
    const view = projectionView(content, candidate.document, candidate.registry, omitFromProjection);
    const projected = targets[target].project(view, {subjectId, presetId, validate, route});
    if (projected.bounds) return {target, purpose, value:null, omissions, resources, errors:projected.bounds,
      shapeAccepted:false, admissionReady:false, runtimeReady:false};
    return {target, purpose, value: projected.value, omissions, resources, errors: projected.report.errors,
      projection: projected.report, shapeAccepted: projected.report.validation === 'accepted',
      admissionReady: false, runtimeReady: false};
  }
  return {receivingFixture};
}
