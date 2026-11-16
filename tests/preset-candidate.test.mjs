import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePresetCandidate, readPresetFragment, encodePresetFragment, findPresetConflicts, admitPreset, mergeBackupPresets, checkPresetName, PRESET_LIMITS } from '../chat/assistant/preset-candidate.mjs';

const good = { id: 'subject-emma', name: 'Emma', prompt: 'You are Emma. Speak plainly.' };
const text = (value) => JSON.stringify(value);
const ids = () => { let n = 0; return () => 'preset-new-' + (++n); };

test('a plain {id,name,prompt} candidate is read exactly; the incoming id is only a source note', () => {
  const r = parsePresetCandidate(text(good));
  assert.equal(r.ok, true);
  assert.deepEqual(r.candidate, { sourceId: 'subject-emma', name: 'Emma', prompt: good.prompt });
  assert.equal(parsePresetCandidate(text({ name: 'A', prompt: 'b' })).candidate.sourceId, null, 'id is optional');
  const padded = parsePresetCandidate(text({ name: '  Emma  ', prompt: '  keep my spacing\n' }));
  assert.equal(padded.candidate.name, 'Emma'); assert.equal(padded.candidate.prompt, '  keep my spacing\n', 'instructions are kept exactly');
  assert.equal(parsePresetCandidate('﻿' + text(good)).ok, true, 'a byte order mark is tolerated');
});

test('malformed input is refused with a code and a plain message', () => {
  for (const [input, code] of [['', 'not-json'], ['{', 'not-json'], ['null', 'not-a-preset'], ['[]', 'not-a-preset'], ['"x"', 'not-a-preset'], ['7', 'not-a-preset'],
    [text({ name: 'A' }), 'missing'], [text({ prompt: 'x' }), 'missing'], [text({ name: 5, prompt: 'x' }), 'bad-field'], [text({ name: 'A', prompt: ['x'] }), 'bad-field'],
    [text({ name: '   ', prompt: 'x' }), 'missing'], [text({ name: 'A', prompt: '  \n ' }), 'missing'], [text({ name: 'A\nB', prompt: 'x' }), 'bad-field'],
    [text({ id: 7, name: 'A', prompt: 'x' }), 'bad-field'], [text({ name: 'A\u0000', prompt: 'x' }), 'bad-text'], [text({ name: 'A', prompt: 'x‮y' }), 'bad-text']]) {
    const r = parsePresetCandidate(input); assert.equal(r.ok, false, input); assert.equal(r.code, code, input + ' -> ' + r.message); assert.ok(r.message.length > 10);
  }
  assert.equal(parsePresetCandidate(undefined).ok, false);
});

test('size limits are checked before parsing, and at the field level', () => {
  const huge = 'x'.repeat(PRESET_LIMITS.fileBytes + 1);
  let parsed = false; const realParse = JSON.parse; JSON.parse = (...a) => { parsed = true; return realParse(...a); };
  try { assert.equal(parsePresetCandidate(huge).code, 'too-large'); } finally { JSON.parse = realParse; }
  assert.equal(parsed, false, 'an oversized text is never handed to JSON.parse');
  assert.equal(parsePresetCandidate(text({ name: 'n'.repeat(PRESET_LIMITS.nameChars + 1), prompt: 'x' })).code, 'too-large');
  assert.equal(parsePresetCandidate(text({ name: 'n', prompt: 'x'.repeat(PRESET_LIMITS.promptChars + 1) })).code, 'too-large');
  assert.equal(parsePresetCandidate(text({ name: 'n'.repeat(PRESET_LIMITS.nameChars), prompt: 'x'.repeat(PRESET_LIMITS.promptChars) })).ok, true, 'exactly at the limits is fine');
  assert.equal(parsePresetCandidate(text({ id: 'i'.repeat(PRESET_LIMITS.idChars + 1), name: 'n', prompt: 'x' })).code, 'bad-field');
  assert.equal(parsePresetCandidate(text({ name: 'n', prompt: 'é'.repeat(PRESET_LIMITS.fileBytes / 2) })).code, 'too-large', 'bytes, not characters, are counted');
});

test('rich bundles, backups, unknown fields and credential-bearing structures are refused whole, never trimmed down', () => {
  const rich = parsePresetCandidate(text({ schema: 'cosmogenitor/bundle', records: [], name: 'Emma', prompt: 'x' }));
  assert.equal(rich.code, 'unsupported'); assert.match(rich.message, /nothing was added/i);
  assert.equal(parsePresetCandidate(text({ format: 'plc-backup/1', threads: [], presets: [] })).code, 'unsupported');
  assert.equal(parsePresetCandidate(text({ name: 'A', prompt: 'x', memory: { items: [] } })).code, 'unsupported');
  assert.equal(parsePresetCandidate(text({ ...good, extra: 'x' })).code, 'unknown-fields');
  assert.match(parsePresetCandidate(text({ ...good, voice: 'x', mood: 'y' })).message, /“voice”.*“mood”/);
  for (const key of ['apiKey', 'api_key', 'token', 'Authorization', 'secret', 'password', 'passphrase', 'endpoint', 'privateKey', 'bearer', 'cookie', 'credentials']) {
    const r = parsePresetCandidate(text({ ...good, [key]: 'sk-do-not-echo-12345' })); assert.equal(r.code, 'credential', key); assert.ok(!r.message.includes('sk-do-not-echo'), 'the secret value is never repeated');
  }
  assert.equal(parsePresetCandidate('{"__proto__":{"name":"A","prompt":"x"},"name":"A","prompt":"x"}').ok, false);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal(parsePresetCandidate(text({ name: 'A', prompt: 'x', id: { a: 1 } })).code, 'bad-field', 'a nested value is never flattened into text');
  assert.equal(parsePresetCandidate(text({ name: 'A', prompt: 'x', extras: { a: 1 } })).code, 'unsupported', 'an unknown structured field is a richer payload, refused whole');
});

test('a link fragment carries the same candidate, base64url, bounded, and nothing else', () => {
  const hash = encodePresetFragment(good);
  assert.match(hash, /^#preset=[A-Za-z0-9_-]+$/);
  assert.deepEqual(readPresetFragment(hash).candidate, { sourceId: 'subject-emma', name: 'Emma', prompt: good.prompt });
  const unicode = { name: 'Zoë – 北京', prompt: 'Réponds en français 🙂\nLigne deux.' };
  assert.deepEqual(readPresetFragment(encodePresetFragment(unicode)).candidate, { sourceId: null, ...unicode });
  assert.equal(readPresetFragment(''), null); assert.equal(readPresetFragment('#settings=abc'), null); assert.equal(readPresetFragment('#other=1&x=2'), null);
  assert.deepEqual(readPresetFragment('#settings=abc&' + hash.slice(1)).candidate.name, 'Emma', 'other fragment parameters are left alone');
  assert.equal(readPresetFragment(hash + '&' + hash.slice(1)).code, 'ambiguous');
  assert.equal(readPresetFragment('#preset=' + 'A'.repeat(PRESET_LIMITS.fragmentChars + 1)).code, 'too-large');
  for (const bad of ['#preset=', '#preset=!!!', '#preset=A', '#preset=' + btoa('not json'), '#preset=' + btoa(String.fromCharCode(0xff, 0xfe, 0xfd)).replace(/=+$/, '')]) {
    const r = readPresetFragment(bad); assert.equal(r.ok, false, bad); assert.equal(r.code, 'not-json', bad);
  }
  const handmade = '#preset=' + btoa(JSON.stringify({ ...good, apiKey: 'x' })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(readPresetFragment(handmade).code, 'credential', 'the same refusals apply to a link');
});

test('the WHOLE fragment is bounded before it is split, decoded or parsed (a million unrelated characters around a tiny preset)', () => {
  const tiny = 'preset=' + btoa('{}').replace(/=+$/, '');
  for (const hash of ['#x=' + 'a'.repeat(1_000_000) + '&' + tiny, '#' + tiny + '&x=' + 'a'.repeat(1_000_000), '#' + 'a'.repeat(1_000_000) + '&' + tiny]) {
    const calls = { params: 0, atob: 0, decode: 0, parse: 0 };
    const RealParams = globalThis.URLSearchParams, realAtob = globalThis.atob, realParse = JSON.parse;
    globalThis.URLSearchParams = class extends RealParams { constructor(...a) { calls.params++; super(...a); } };
    globalThis.atob = (...a) => { calls.atob++; return realAtob(...a); };
    JSON.parse = (...a) => { calls.parse++; return realParse(...a); };
    let r; try { r = readPresetFragment(hash); } finally { globalThis.URLSearchParams = RealParams; globalThis.atob = realAtob; JSON.parse = realParse; }
    assert.equal(r.ok, false); assert.equal(r.code, 'too-large', 'a size refusal, not "missing fields": ' + r.message);
    assert.deepEqual(calls, { params: 0, atob: 0, decode: 0, parse: 0 }, 'no parameter splitting, base64 or JSON work was done');
  }
  // compatibility: an ordinary fragment that names no preset is somebody else's, however long, and is left alone
  assert.equal(readPresetFragment('#x=' + 'a'.repeat(1_000_000)), null);
  assert.equal(readPresetFragment('#mypreset=' + 'a'.repeat(1_000_000)), null, 'a different parameter that merely ends in "preset" is not ours');
  // exactly at the envelope: a legitimate preset with a few other parameters still opens
  const edge = encodePresetFragment({ name: 'Edge', prompt: 'x'.repeat(5000) });
  assert.ok(edge.length < PRESET_LIMITS.fragmentEnvelopeChars);
  assert.equal(readPresetFragment('#a=1&b=2&' + edge.slice(1)).ok, true);
});

test('names that collide are found without case, spacing or width differences, built-ins included', () => {
  const presets = [{ id: 'builtin-code', name: 'Code helper', prompt: 'a' }, { id: 'preset-1', name: 'Emma', prompt: 'You are Emma.' }];
  assert.equal(findPresetConflicts(presets, ' emma ', 'other').any, true);
  assert.equal(findPresetConflicts(presets, 'ＥＭＭＡ', 'other').any, true, 'full-width letters');
  assert.equal(findPresetConflicts(presets, 'code   HELPER', 'x').any, true);
  assert.equal(findPresetConflicts(presets, 'Emma', 'You are Emma.').identical, true);
  assert.equal(findPresetConflicts(presets, 'Emma', 'different').identical, false);
  assert.equal(findPresetConflicts(presets, 'Emmas', 'x').any, false);
  assert.equal(findPresetConflicts(null, 'x', 'y').any, false);
});

test('admission always makes a fresh id, never replaces, and a collision needs the explicit answer', () => {
  const existing = [{ id: 'preset-1', name: 'Emma', prompt: 'old' }];
  const before = JSON.stringify(existing);
  const made = admitPreset(existing, { name: 'Zed', prompt: 'new', id: 'preset-1', sourceId: 'preset-1' }, { makeId: ids() });
  assert.equal(made.ok, true); assert.equal(made.preset.id, 'preset-new-1', 'the incoming id is never used'); assert.equal(made.list.length, 2);
  assert.equal(JSON.stringify(existing), before, 'the input list is not mutated');
  const clash = admitPreset(existing, { name: 'emma', prompt: 'new' }, { makeId: ids() });
  assert.equal(clash.ok, false); assert.equal(clash.code, 'conflict'); assert.equal(clash.conflicts.sameName.length, 1);
  const again = admitPreset(existing, { name: 'Emma', prompt: 'old' }, { makeId: ids() });
  assert.equal(again.ok, false, 'the same input again is never silently added or ignored'); assert.equal(again.conflicts.identical, true);
  const both = admitPreset(existing, { name: 'Emma', prompt: 'new' }, { makeId: ids(), keepSeparate: true });
  assert.equal(both.ok, true); assert.deepEqual(both.list.map((p) => p.prompt), ['old', 'new']); assert.notEqual(both.list[0].id, both.list[1].id);
  let n = 0; const retried = admitPreset(existing, { name: 'Q', prompt: 'p' }, { makeId: () => (n++ < 3 ? 'preset-1' : 'preset-fresh') });
  assert.equal(retried.ok, true); assert.equal(retried.preset.id, 'preset-fresh', 'a taken id is never reused');
  assert.equal(admitPreset(existing, { name: 'Q', prompt: 'p' }, { makeId: () => 'builtin-x' }).code, 'no-id', 'a built-in-looking id is never made');
  assert.equal(admitPreset(existing, { name: '', prompt: 'p' }, { makeId: ids() }).ok, false);
  assert.equal(admitPreset(existing, { name: 'Q', prompt: ' ' }, { makeId: ids() }).ok, false);
  assert.equal(checkPresetName('x'.repeat(200)).ok, false);
});

test('a backup restore keeps its old rule: a name already among yours is skipped, each added preset gets a new id, nothing is replaced', () => {
  const mine = [{ id: 'preset-own', name: 'Emma', prompt: 'mine' }];
  const before = JSON.stringify(mine);
  const out = mergeBackupPresets(mine, [{ id: 'old-id', name: 'Emma', prompt: 'theirs' }, { id: 'preset-own', name: 'Zed', prompt: 'z' }, { name: '', prompt: 'x' }, { name: 'NoPrompt' }, null, { name: 'Zed', prompt: 'twice' }], ids());
  assert.equal(JSON.stringify(mine), before, 'the input is not mutated');
  assert.deepEqual(out.list.map((p) => [p.id, p.name, p.prompt]), [['preset-own', 'Emma', 'mine'], ['preset-new-1', 'Zed', 'z']]);
  assert.equal(out.added, 1);
  assert.deepEqual(mergeBackupPresets(null, undefined, ids()), { list: [], added: 0 });
});

// the producer's real output, unmodified (tests/fixtures/presets/README.md says which Cosmogenitor revision made it). Never skipped: a missing file fails.
const candidateDir = new URL('./fixtures/presets/', import.meta.url);
test('the actual Cosmogenitor plc-preset candidates (producer output) are admitted unchanged', () => {
  for (const file of ['emma-minimal.plc-preset-candidate.json', 'emma-rich.plc-preset-candidate.json']) {
    const raw = readFileSync(new URL(file, candidateDir), 'utf8');
    const producer = JSON.parse(raw);
    const r = parsePresetCandidate(raw); assert.equal(r.ok, true, file);
    assert.equal(r.candidate.name, producer.name); assert.equal(r.candidate.prompt, producer.prompt, 'exact instructions');
    assert.equal(readPresetFragment(encodePresetFragment(r.candidate)).candidate.prompt, producer.prompt);
    const admitted = admitPreset([], r.candidate, { makeId: ids() }); assert.equal(admitted.ok, true); assert.notEqual(admitted.preset.id, producer.id);
  }
});
