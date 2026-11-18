import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROVIDER_CONTRACT, ERROR_CLASSES, validateProvider, checkCompatibility,
  endpointIdentity, validateRequest, validateReceipt, validateResult,
  validateJobUpdate, mapProviderError,
} from '../../src/core/providers.mjs';

const model = {id: 'fixture-film', revision: 'test-1'};
function provider(id = 'my-lan', location = 'lan') {
  return {
    contract: PROVIDER_CONTRACT, id, location,
    ...(location === 'device' ? {} : {endpoint: 'https://fixture.invalid/v1?tenant=own', browserCallable: true}),
    capabilities: [{kind: 'video', model: {...model}, modes: ['job'],
      inputRoles: ['character-identity-image', 'supplied-speech-performance'],
      parameters: {duration_seconds: {min: 1, max: 12}, seed: {integer: true, min: 0}},
      evidence: {status: 'declared'}}],
  };
}
function step() {
  return {id: 'animate', kind: 'video', mode: 'job', inputRoles: ['supplied-speech-performance'],
    models: [{...model}], parameters: {duration: 8, seed: 4},
    parameterBindings: {duration: 'duration_seconds', seed: 'seed'}};
}
function selection(id = 'my-lan') { return {providerId: id, model: {...model}}; }
function request() {
  return {requestId: 'req-fixture', stepId: 'animate', providerId: 'my-lan',
    workflow: {id: 'speaking-film', version: '0'}, kind: 'video', mode: 'job', model: {...model},
    inputs: {speech: {expressionId: 'speech-take', role: 'supplied-speech-performance'},
      identity: {subjectId: 'cora', expressionId: 'portrait'}}, parameters: {duration_seconds: 8}};
}
function receipt() {
  return {...request(), source: 'own', startedAt: '2026-11-16T06:00:00Z',
    completedAt: '2026-11-16T06:01:00Z', outputs: [{kind: 'video', assetHash: `sha256:${'a'.repeat(64)}`}],
    evidence: {type: 'contract-fixture', realGeneration: false}};
}
const has = (issues, code, path) => issues.some(i => i.code === code && (!path || i.path.includes(path)));

test('provider location and model identity are independent; credentials are unnecessary for device/LAN contracts', () => {
  for (const [id, location] of [['my-lan', 'lan'], ['my-browser', 'device'], ['outside', 'external']]) {
    const p = provider(id, location);
    assert.deepEqual(validateProvider(p), []);
    const match = checkCompatibility(step(), p, selection(id));
    assert.equal(match.ok, true);
    assert.equal(match.binding.providerId, id);
    assert.equal(match.binding.model.id, model.id);
    assert.equal(match.binding.location, location);
    assert.equal(match.binding.parameters.duration_seconds, 8);
    assert.equal(Object.hasOwn(match.binding, 'accountId'), false);
  }
});

test('one workflow step supports alternative models only through explicit selection', () => {
  const p = provider();
  p.capabilities.push({...structuredClone(p.capabilities[0]), model: {id: 'fixture-other', revision: '2'}});
  const s = step(); s.models.push({id: 'fixture-other'});
  for (const chosen of p.capabilities.map(c => c.model)) {
    const result = checkCompatibility(s, p, {providerId: p.id, model: chosen});
    assert.equal(result.ok, true); assert.deepEqual(result.binding.model, chosen);
  }
  assert.equal(checkCompatibility(step(), p, {providerId: p.id, model: p.capabilities[1].model}).ok, false);
});

test('one model supports several workflows without workflow IDs in the provider declaration', () => {
  const p = provider();
  for (const id of ['talking-portrait', 'scene-performance']) {
    assert.equal(checkCompatibility({...step(), id}, p, selection()).ok, true);
  }
  assert.equal(JSON.stringify(p).includes('talking-portrait'), false);
});

test('a composed workflow resolves each step to its explicitly chosen capability/model', () => {
  const p = provider();
  p.capabilities.push({kind: 'speech', model: {id: 'fixture-voice', revision: '1'}, modes: ['sync'],
    inputRoles: ['utterance-text', 'voice-identity-reference'], parameters: {}, evidence: {status: 'declared'}});
  const speech = {id: 'speak', kind: 'speech', mode: 'sync',
    inputRoles: ['utterance-text', 'voice-identity-reference'], models: [{id: 'fixture-voice'}],
    parameters: {}, parameterBindings: {}};
  assert.equal(checkCompatibility(speech, p, {providerId: p.id, model: p.capabilities[1].model}).ok, true);
  assert.equal(checkCompatibility(step(), p, selection()).ok, true);
  assert.equal(checkCompatibility(speech, p, selection()).ok, false);
});

test('audio reference acceptance is not supplied-performance preservation', () => {
  const p = provider(); p.capabilities[0].inputRoles = ['voice-style-reference'];
  const match = checkCompatibility(step(), p, selection());
  assert.equal(match.ok, false);
  assert.ok(has(match.issues, 'unsupported', 'supplied-speech-performance'));
});

test('mode, parameter ranges and bindings are checked rather than silently changed', () => {
  for (const value of [0, 13, NaN, '8']) {
    const s = step(); s.parameters.duration = value;
    const result = checkCompatibility(s, provider(), selection());
    assert.equal(result.ok, false); assert.ok(has(result.issues, 'invalid-request'));
  }
  const s = step(); s.parameters.seed = 0.5;
  assert.equal(checkCompatibility(s, provider(), selection()).ok, false);
  s.parameters.seed = 4; s.parameterBindings.duration = 'not_supported';
  assert.ok(has(checkCompatibility(s, provider(), selection()).issues, 'unsupported'));
  s.parameterBindings.duration = 'duration_seconds'; s.mode = 'sync';
  assert.ok(has(checkCompatibility(s, provider(), selection()).issues, 'unsupported', 'mode'));
});

test('parameter aliases cannot overwrite each other and enums are meaningful', () => {
  const p = provider(); p.capabilities[0].parameters.quality = {enum: ['preview', 'final']};
  const s = step(); s.parameters.quality = 'arbitrary'; s.parameterBindings.quality = 'quality';
  assert.equal(checkCompatibility(s, p, selection()).ok, false);
  s.parameters.quality = 'preview'; assert.equal(checkCompatibility(s, p, selection()).ok, true);
  s.parameters.alias = 5; s.parameterBindings.alias = 'seed';
  assert.ok(has(checkCompatibility(s, p, selection()).issues, 'invalid-request', 'parameterBindings'));
});

test('declared support is not called tested; requireTested gives an actionable incompatibility', () => {
  const s = {...step(), requireTested: true};
  const p = provider();
  assert.ok(has(checkCompatibility(s, p, selection()).issues, 'unsupported', 'requireTested'));
  p.capabilities[0].evidence = {status: 'tested'};
  assert.ok(has(validateProvider(p), 'invalid-request', 'evidence'));
  p.capabilities[0].evidence.record = 'fixture-contract-test-not-model-quality';
  assert.equal(checkCompatibility(s, p, selection()).ok, true);
});

test('unknown metadata is carried, unknown required kinds/operators need explicit support', () => {
  const p = provider(); p.extensions = {'x-example': {note: 'opaque metadata'}};
  assert.deepEqual(validateProvider(p), []);
  p.capabilities[0].kind = 'x-transcription';
  assert.ok(has(validateProvider(p), 'unsupported', 'kind'));
  assert.deepEqual(validateProvider(p, {supportedKinds: ['x-transcription']}), []);
  p.capabilities[0].parameters.seed = {inventedOperator: 7};
  assert.ok(has(validateProvider(p, {supportedKinds: ['x-transcription']}), 'unsupported', 'parameters'));
});

test('malformed imported declarations return issues rather than throwing', () => {
  for (const bad of [null, [], false, {}, {id: 'my-lan', capabilities: {}},
    {id: 'my-lan', capabilities: 'video'}, {capabilities: [null]},
    {...provider(), capabilities: [{modes: 'sync'}]},
    {...provider(), capabilities: [{...provider().capabilities[0], parameters: {seed: {min: 8, max: 1}}}]}]) {
    assert.ok(validateProvider(bad).length);
    assert.equal(checkCompatibility(step(), bad, selection()).ok, false);
  }
  assert.equal(checkCompatibility({...step(), models: [null]}, provider(), selection()).ok, false);
});

test('failed local selection never chooses an external substitute or another model', () => {
  const p = provider('my-browser', 'device');
  const result = checkCompatibility(step(), p, selection('outside'));
  assert.equal(result.ok, false); assert.equal(Object.hasOwn(result, 'binding'), false);
  const before = structuredClone(p);
  for (let i = 0; i < 5; i++) checkCompatibility(step(), p, {providerId: p.id, model: {id: 'missing', revision: '1'}});
  assert.deepEqual(p, before);
});

test('endpoint credential identity retains exact destination and refuses embedded authority', () => {
  assert.notEqual(endpointIdentity('https://host.invalid/v1'), endpointIdentity('https://host.invalid/v2'));
  assert.notEqual(endpointIdentity('https://host.invalid/v1?tenant=a'), endpointIdentity('https://host.invalid/v1?tenant=b'));
  assert.notEqual(endpointIdentity('http://host.invalid:8080/v1'), endpointIdentity('https://host.invalid/v1'));
  for (const endpoint of ['https://name:secret@host.invalid/v1', 'https://host.invalid/v1#fragment', 'file:///tmp/api', 'https://host.invalid/v1?api_key=secret'])
    assert.throws(() => endpointIdentity(endpoint), TypeError);
  const p = provider(); p.browserCallable = false;
  assert.ok(has(validateProvider(p), 'unsupported', 'browserCallable'));
});

test('request/receipt record exact identity, inputs, parameters, times and output hashes', () => {
  assert.deepEqual(validateRequest(request()), []); assert.deepEqual(validateReceipt(receipt()), []);
  for (const edit of [r => delete r.workflow, r => delete r.inputs, r => r.outputs[0].assetHash = 'filename.mp4',
    r => r.startedAt = 'tomorrow', r => r.completedAt = '2026-11-16T05:00:00Z', r => r.source = 'unknown']) {
    const r = receipt(); edit(r); assert.ok(validateReceipt(r).length);
  }
});

test('credential fields, cycles and non-JSON values are refused without echoing values', () => {
  const r = request(); r.parameters.apiKey = 'fixture-secret-do-not-echo';
  const errors = validateRequest(r);
  assert.ok(errors.length); assert.equal(JSON.stringify(errors).includes('fixture-secret-do-not-echo'), false);
  const cyclic = request(); cyclic.inputs.self = cyclic.inputs;
  assert.ok(validateRequest(cyclic).length);
  const unusual = request(); unusual.inputs.date = new Date();
  assert.ok(validateRequest(unusual).length);
});

test('result cannot claim a different model/provider, workflow, step or substituted inputs', () => {
  const result = {state: 'succeeded', requestId: 'req-fixture', providerId: 'my-lan', receipt: receipt()};
  assert.deepEqual(validateResult(result, request()), []);
  for (const edit of [r => r.providerId = 'outside', r => r.receipt.model.id = 'other',
    r => r.receipt.workflow.id = 'other', r => r.receipt.inputs.speech.expressionId = 'different-take',
    r => r.receipt.parameters.duration_seconds = 10, r => r.receipt.stepId = 'other']) {
    const r = structuredClone(result); edit(r); assert.ok(validateResult(r, request()).length);
  }
});

test('job uncertainty is reconcilable; cancellation is requested before confirmed', () => {
  const submitted = {requestId: 'req-fixture', providerId: 'my-lan', jobId: 'job-1', state: 'submitted'};
  assert.deepEqual(validateJobUpdate(submitted), []);
  assert.deepEqual(validateJobUpdate({...submitted, state: 'ambiguous', progress: null}, submitted), []);
  const cancel = {...submitted, state: 'cancel-requested'};
  assert.deepEqual(validateJobUpdate(cancel, submitted), []);
  assert.ok(validateJobUpdate({...submitted, state: 'cancelled'}, cancel).length);
  assert.deepEqual(validateJobUpdate({...submitted, state: 'cancelled', confirmed: true}, cancel), []);
  assert.deepEqual(validateJobUpdate({...submitted, state: 'succeeded'}, cancel), []);
  assert.ok(validateJobUpdate({...submitted, providerId: 'outside'}, submitted).length);
  assert.ok(validateJobUpdate({...submitted, jobId: 'different'}, submitted).length);
  assert.ok(validateJobUpdate({...submitted, state: 'running'}, {...submitted, state: 'succeeded'}).length);
  assert.ok(validateJobUpdate({...submitted, progress: 2}).length);
});

test('Sonalon provider faults keep deliberate abort separate from failure and never add a timeout', () => {
  for (const failureClass of ERROR_CLASSES.filter(c => c !== 'aborted'))
    assert.equal(mapProviderError({class: failureClass}).event, 'failed');
  assert.deepEqual(mapProviderError({class: 'aborted', abort: {deliberate: true, by: 'human', reason: 'stop'}}),
    {event: 'cancelled', deliberate: true, by: 'human'});
  assert.deepEqual(mapProviderError({class: 'aborted'}), {event: 'failed', failureClass: 'contract-violation'});
  assert.equal(mapProviderError({class: 'load-failed'}).failureClass, 'provider-unavailable');
  assert.equal(mapProviderError({class: 'timeout'}).failureClass, 'exception');
});

test('imported nested-shape matrix refuses invalid declarations without throwing or mutation', () => {
  const replacements = [null, false, 3, '', 'not-a-list', {}, []];
  for (const replacement of replacements) {
    for (const path of ['capabilities', 'modes', 'inputRoles', 'parameters', 'model', 'evidence']) {
      const p = provider();
      if (path === 'capabilities') p.capabilities = replacement;
      else p.capabilities[0][path] = replacement;
      const before = structuredClone(p);
      assert.doesNotThrow(() => validateProvider(p), path);
      assert.doesNotThrow(() => checkCompatibility(step(), p, selection()), path);
      assert.deepEqual(p, before);
    }
    for (const path of ['models', 'inputRoles', 'parameters', 'parameterBindings']) {
      const s = step(); s[path] = replacement;
      assert.doesNotThrow(() => checkCompatibility(s, provider(), selection()), path);
    }
  }
});
