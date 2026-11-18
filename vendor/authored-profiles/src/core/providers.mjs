/** Cosmogenitor provider/model contract v0. Pure validation; no I/O or implicit routing. */
export const PROVIDER_CONTRACT = 'cosmogenitor/provider/0';
export const CAPABILITY_KINDS = Object.freeze(['text', 'speech', 'image', 'video']);
export const ERROR_CLASSES = Object.freeze([
  'provider-unavailable', 'load-failed', 'out-of-memory', 'context-overflow',
  'output-invalid', 'output-truncated', 'unsupported', 'runtime-fault',
  'invalid-request', 'aborted',
]);
const locations = ['device', 'lan', 'own-endpoint', 'external', 'platform', 'peer'];
const states = ['submitted', 'queued', 'running', 'cancel-requested', 'ambiguous',
  'succeeded', 'failed', 'cancelled'];
const terminal = ['succeeded', 'failed', 'cancelled'];
const credentials = /^(authorization|apiKey|api_key|password|secret|credential|credentials|accessToken|refreshToken|token)$/i;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const issue = (code, path, message) => ({code, path, message});
const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/.test(value);
function required(errors, value, path) {
  if (!text(value)) errors.push(issue('invalid-request', path, 'Supply a nonempty string.'));
}
function strings(errors, value, path) {
  if (!Array.isArray(value) || value.some(v => !text(v)) || new Set(value).size !== value.length)
    errors.push(issue('invalid-request', path, 'Supply a list of distinct nonempty strings.'));
}
function jsonSafe(value, path, errors, seen = new Set()) {
  if (typeof value === 'number' && !Number.isFinite(value))
    errors.push(issue('invalid-request', path, 'Use a finite JSON number.'));
  if (value === undefined || ['function', 'symbol', 'bigint'].includes(typeof value))
    errors.push(issue('invalid-request', path, 'Use JSON data only.'));
  if (value && typeof value === 'object') {
    if (seen.has(value)) { errors.push(issue('invalid-request', path, 'Remove cyclic data.')); return; }
    seen.add(value);
    if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype &&
        Object.getPrototypeOf(value) !== null)
      errors.push(issue('invalid-request', path, 'Use plain JSON records.'));
    for (const [key, item] of Object.entries(value)) {
      if (credentials.test(key)) errors.push(issue('invalid-request', path, 'Keep credentials in the endpoint credential store.'));
      else jsonSafe(item, `${path}.${key}`, errors, seen);
    }
    seen.delete(value);
  }
}
/** Endpoint identity includes scheme/host/port/path/query. Never strips a destination path. */
export function endpointIdentity(endpoint) {
  const url = new URL(endpoint);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash)
    throw new TypeError('Use an HTTP(S) endpoint without user information or a fragment.');
  for (const key of url.searchParams.keys())
    if (/^(key|api[_-]?key|access[_-]?(token|key)|refresh[_-]?token|id[_-]?token|token|jwt|password|secret|authorization|auth|signature|sig|x-amz-.+|x-goog-.+)$/i.test(key))
      throw new TypeError('Keep endpoint credentials outside the endpoint URL.');
  return url.href;
}
function ruleProblems(rule, path) {
  const errors = [];
  if (!object(rule)) return [issue('invalid-request', path, 'Supply a constraint record.')];
  const known = ['min', 'max', 'integer', 'enum'];
  if (Object.keys(rule).some(key => !known.includes(key)))
    errors.push(issue('unsupported', path, 'This constraint operator needs an explicit implementation.'));
  for (const field of ['min', 'max'])
    if (field in rule && !Number.isFinite(rule[field]))
      errors.push(issue('invalid-request', path, 'Constraint bounds must be finite numbers.'));
  if ('integer' in rule && typeof rule.integer !== 'boolean')
    errors.push(issue('invalid-request', path, 'The integer constraint must be boolean.'));
  if (rule.min > rule.max) errors.push(issue('invalid-request', path, 'Minimum exceeds maximum.'));
  if ('enum' in rule && (!Array.isArray(rule.enum) || !rule.enum.length ||
      rule.enum.some(v => v === null || !['string', 'number', 'boolean'].includes(typeof v))))
    errors.push(issue('invalid-request', path, 'Enumerate supported scalar values.'));
  return errors;
}
function constrained(value, rule) {
  return (!('min' in rule) || (typeof value === 'number' && value >= rule.min)) &&
    (!('max' in rule) || (typeof value === 'number' && value <= rule.max)) &&
    (!rule.integer || Number.isInteger(value)) &&
    (!rule.enum || rule.enum.includes(value));
}
/** Optional metadata/extensions may be carried; required capability semantics must be understood. */
export function validateProvider(provider, {supportedKinds = CAPABILITY_KINDS} = {}) {
  const errors = [];
  if (!object(provider)) return [issue('invalid-request', 'provider', 'Supply a provider declaration.')];
  jsonSafe(provider, 'provider', errors);
  required(errors, provider.id, 'provider.id');
  if (provider.contract !== PROVIDER_CONTRACT)
    errors.push(issue('unsupported', 'provider.contract', 'Use the supported provider contract version.'));
  if (!locations.includes(provider.location)) errors.push(issue('invalid-request', 'provider.location', 'Declare where work executes.'));
  if (provider.location !== 'device') {
    try { endpointIdentity(provider.endpoint); } catch {
      errors.push(issue('invalid-request', 'provider.endpoint', 'Supply the exact destination without credentials or fragment.'));
    }
    if (provider.browserCallable !== true)
      errors.push(issue('unsupported', 'provider.browserCallable', 'Verify browser CORS access for this destination and app origin.'));
  }
  if (!Array.isArray(provider.capabilities) || !provider.capabilities.length)
    return [...errors, issue('invalid-request', 'provider.capabilities', 'Declare at least one capability.')];
  const keys = new Set();
  provider.capabilities.forEach((cap, index) => {
    const path = `provider.capabilities.${index}`;
    if (!object(cap)) { errors.push(issue('invalid-request', path, 'Supply a capability record.')); return; }
    if (!supportedKinds.includes(cap.kind)) errors.push(issue('unsupported', `${path}.kind`, 'Install an adapter for this capability kind.'));
    required(errors, cap.model?.id, `${path}.model.id`);
    required(errors, cap.model?.revision, `${path}.model.revision`);
    strings(errors, cap.inputRoles, `${path}.inputRoles`);
    strings(errors, cap.modes, `${path}.modes`);
    if (!Array.isArray(cap.modes) || !cap.modes.length || cap.modes.some(m => !['sync', 'job'].includes(m)))
      errors.push(issue('unsupported', `${path}.modes`, 'Declare sync and/or job execution.'));
    if (!['declared', 'tested'].includes(cap.evidence?.status) ||
        (cap.evidence?.status === 'tested' && !text(cap.evidence.record)))
      errors.push(issue('invalid-request', `${path}.evidence`, 'Declare support or identify its actual test evidence.'));
    if (!object(cap.parameters)) errors.push(issue('invalid-request', `${path}.parameters`, 'Declare supported parameter names and constraints.'));
    else for (const [name, rule] of Object.entries(cap.parameters)) errors.push(...ruleProblems(rule, `${path}.parameters.${name}`));
    const key = `${cap.kind}/${cap.model?.id}/${cap.model?.revision}`;
    if (keys.has(key)) errors.push(issue('invalid-request', path, 'Merge duplicate capability declarations.'));
    keys.add(key);
  });
  return errors;
}
/** Check one explicitly selected provider/model per step; never find a substitute. */
export function checkCompatibility(step, provider, selection, options) {
  const errors = validateProvider(provider, options);
  if (!object(step) || !object(selection)) return [...errors, issue('invalid-request', 'step', 'Supply a step and explicit selection.')];
  jsonSafe(step, 'step', errors); jsonSafe(selection, 'selection', errors);
  required(errors, step.id, 'step.id');
  strings(errors, step.inputRoles, 'step.inputRoles');
  if (errors.length) return {ok: false, issues: errors};
  if (selection.providerId !== provider?.id)
    errors.push(issue('invalid-request', 'selection.providerId', 'Use the provider explicitly selected by the person.'));
  const cap = provider?.capabilities?.find(c => c?.kind === step.kind &&
    c?.model?.id === selection.model?.id && c?.model?.revision === selection.model?.revision);
  if (!cap) errors.push(issue('unsupported', 'selection.model', 'The selected provider does not declare this model, revision and capability.'));
  if (!Array.isArray(step.models) || !step.models.some(m => object(m) && m.id === selection.model?.id &&
      (!m.revision || m.revision === selection.model?.revision)))
    errors.push(issue('unsupported', 'step.models', 'This workflow step does not declare the selected model compatible.'));
  if (!['sync', 'job'].includes(step.mode)) errors.push(issue('invalid-request', 'step.mode', 'Choose sync or job execution.'));
  if (!object(step.parameters) || !object(step.parameterBindings))
    errors.push(issue('invalid-request', 'step.parameters', 'Supply parameters and their explicit provider-name bindings.'));
  if (!cap || errors.length) return {ok: false, issues: errors};
  if (!cap.modes.includes(step.mode)) errors.push(issue('unsupported', 'step.mode', 'The selected model does not support this execution mode.'));
  for (const role of step.inputRoles)
    if (!cap.inputRoles.includes(role)) errors.push(issue('unsupported', `step.inputRoles.${role}`, 'This semantic input role is not supported; choose an explicitly compatible model.'));
  const mapped = Object.create(null);
  for (const [name, value] of Object.entries(step.parameters)) {
    const target = step.parameterBindings[name];
    if (!text(target) || !Object.hasOwn(cap.parameters, target)) {
      errors.push(issue('unsupported', `step.parameters.${name}`, 'Declare a binding to a parameter this model supports.')); continue;
    }
    if (Object.hasOwn(mapped, target)) errors.push(issue('invalid-request', `step.parameterBindings.${name}`, 'Two parameters cannot overwrite the same provider parameter.'));
    if (!constrained(value, cap.parameters[target])) errors.push(issue('invalid-request', `step.parameters.${name}`, 'Use a value within the selected model constraint.'));
    mapped[target] = value;
  }
  if (step.requireTested && cap.evidence.status !== 'tested')
    errors.push(issue('unsupported', 'step.requireTested', 'This binding is declared only; select tested support or explicitly relax this requirement.'));
  return errors.length ? {ok: false, issues: errors} : {ok: true, issues: [], binding: {
    providerId: provider.id, model: {...cap.model}, kind: step.kind, mode: step.mode,
    inputRoles: [...step.inputRoles], parameters: mapped, evidence: {...cap.evidence},
    location: provider.location,
  }};
}
export function validateRequest(request) {
  const errors = [];
  if (!object(request)) return [issue('invalid-request', 'request', 'Supply a generation request.')];
  jsonSafe(request, 'request', errors);
  for (const key of ['requestId', 'stepId', 'providerId', 'kind']) required(errors, request[key], `request.${key}`);
  for (const key of ['id', 'version']) required(errors, request.workflow?.[key], `request.workflow.${key}`);
  for (const key of ['id', 'revision']) required(errors, request.model?.[key], `request.model.${key}`);
  if (!['sync', 'job'].includes(request.mode)) errors.push(issue('invalid-request', 'request.mode', 'Choose sync or job execution.'));
  if (!object(request.inputs) || !object(request.parameters)) errors.push(issue('invalid-request', 'request', 'Supply exact named inputs and parameters.'));
  return errors;
}
export function validateReceipt(receipt) {
  const errors = validateRequest(receipt);
  if (!object(receipt)) return errors;
  if (!['own', 'outside'].includes(receipt.source)) errors.push(issue('invalid-request', 'receipt.source', 'Record own or outside origin.'));
  for (const key of ['startedAt', 'completedAt'])
    if (!text(receipt[key]) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(receipt[key]) || !Number.isFinite(Date.parse(receipt[key])))
      errors.push(issue('invalid-request', `receipt.${key}`, 'Record an ISO timestamp.'));
  if (Date.parse(receipt.completedAt) < Date.parse(receipt.startedAt)) errors.push(issue('invalid-request', 'receipt.completedAt', 'Completion precedes start.'));
  if (!Array.isArray(receipt.outputs) || !receipt.outputs.length)
    errors.push(issue('invalid-request', 'receipt.outputs', 'Record produced output hashes and kinds.'));
  else for (const [i, out] of receipt.outputs.entries())
    if (!object(out) || !text(out.kind) || !hash(out.assetHash)) errors.push(issue('invalid-request', `receipt.outputs.${i}`, 'Record an output kind and SHA-256 asset hash.'));
  return errors;
}
/** Result envelopes retain outputs and the exact receipt rather than only a transport URL. */
export function validateResult(result, request) {
  if (!object(result)) return [issue('output-invalid', 'result', 'Supply a result envelope.')];
  const errors = validateReceipt(result.receipt);
  jsonSafe(result, 'result', errors);
  if (result.state !== 'succeeded') errors.push(issue('output-invalid', 'result.state', 'Successful results use succeeded; faults use typed errors.'));
  for (const key of ['requestId', 'providerId']) {
    if (result[key] !== request?.[key] || result.receipt?.[key] !== request?.[key])
      errors.push(issue('output-invalid', `result.${key}`, 'The result must belong to this exact request and selected provider.'));
  }
  for (const key of ['id', 'revision'])
    if (result.receipt?.model?.[key] !== request?.model?.[key]) errors.push(issue('output-invalid', 'result.receipt.model', 'Do not substitute another model or revision.'));
  for (const key of ['id', 'version'])
    if (result.receipt?.workflow?.[key] !== request?.workflow?.[key]) errors.push(issue('output-invalid', 'result.receipt.workflow', 'Record the requested workflow identity.'));
  if (result.receipt?.stepId !== request?.stepId || result.receipt?.kind !== request?.kind || result.receipt?.mode !== request?.mode)
    errors.push(issue('output-invalid', 'result.receipt', 'Retain the requested step, kind and execution mode.'));
  if (!errors.length && (!sameJSON(result.receipt?.inputs, request?.inputs) || !sameJSON(result.receipt?.parameters, request?.parameters)))
    errors.push(issue('output-invalid', 'result.receipt', 'Record the exact inputs and parameters used.'));
  return errors;
}
function sameJSON(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => sameJSON(v, b[i]));
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameJSON(a[k], b[k]));
  }
  return false;
}
export function validateJobUpdate(update, previous) {
  const errors = [];
  if (!object(update)) return [issue('invalid-request', 'job', 'Supply a job observation.')];
  jsonSafe(update, 'job', errors);
  for (const key of ['requestId', 'providerId']) required(errors, update[key], `job.${key}`);
  if (!states.includes(update.state)) errors.push(issue('invalid-request', 'job.state', 'Use a declared job state.'));
  if (!['ambiguous'].includes(update.state)) required(errors, update.jobId, 'job.jobId');
  if (update.progress !== undefined && update.progress !== null &&
      (!Number.isFinite(update.progress) || update.progress < 0 || update.progress > 1))
    errors.push(issue('invalid-request', 'job.progress', 'Report progress from zero to one, or null when unknown.'));
  if (update.state === 'failed' && (!object(update.error) || !ERROR_CLASSES.includes(update.error.class)))
    errors.push(issue('invalid-request', 'job.error', 'Report a typed provider error.'));
  if (update.state === 'cancelled' && update.confirmed !== true)
    errors.push(issue('invalid-request', 'job.confirmed', 'Cancellation needs provider confirmation; a stop request alone is not cancellation.'));
  if (previous) {
    if (update.requestId !== previous.requestId || update.providerId !== previous.providerId ||
        (previous.jobId && update.jobId !== previous.jobId))
      errors.push(issue('invalid-request', 'job', 'Reconciliation must keep the original request, provider and known job identity.'));
    if (terminal.includes(previous.state) && update.state !== previous.state)
      errors.push(issue('invalid-request', 'job.state', 'A terminal observation cannot become another state.'));
  }
  return errors;
}
/** Sonalon-compatible error taxonomy; no timeout, retry or routing behavior. */
export function mapProviderError(error) {
  if (!object(error) || !ERROR_CLASSES.includes(error.class)) return {event: 'failed', failureClass: 'exception'};
  if (error.class === 'aborted') return error.abort?.deliberate === true &&
      ['human', 'mind', 'supervisor'].includes(error.abort.by) && text(error.abort.reason)
    ? {event: 'cancelled', deliberate: true, by: error.abort.by}
    : {event: 'failed', failureClass: 'contract-violation'};
  const classes = {'load-failed': 'provider-unavailable', 'runtime-fault': 'provider-fault', 'invalid-request': 'contract-violation'};
  return {event: 'failed', failureClass: classes[error.class] || error.class};
}
