/** The shared steps of a consumer projection (selection, mapping, omission report, receiver check), bound to a
 * content engine's validateContent by createProjectionKit. Pure; no receiver writes, I/O or live instance creation. */
export function createProjectionKit(validateContent) {
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
  function aspect(state, definition, {required = false, whole = false} = {}) {
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
    if (whole) {
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

  return {clone, text, record, own, issue, start, aspect, publicField, map, finish};
}
