import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { reviewCharacterPackageFile, reviewCharacterPackageFragment, readCharacterFragment, encodeCharacterFragment, checkPackageFileSize, CHARACTER_PACKAGE_LIMITS, PURPOSES, reopenCharacterSource, bundleTextFromSource } from '../chat/characters/character-package.mjs';
import { openAuthored, exportAuthored } from '../chat/characters/vendor/t415/contracts/authored-profiles/authored.mjs';
import { readPresetFragment, parsePresetCandidate, encodePresetFragment } from '../chat/assistant/preset-candidate.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const read = (p) => readFileSync(new URL(p, fx), 'utf8');
const bytes = (p) => new Uint8Array(readFileSync(new URL(p, fx)));
const bundles = Object.fromEntries(['minimal', 'neri', 'bex'].map((n) => [n, read(`examples/${n}.bundle.json`)]));
const sha = (b) => 'sha256:' + createHash('sha256').update(b).digest('hex');

// The producer's root: SHA-256 of the canonical metadata (everything but the root and the inline data). Recomputing it lets a test
// make a tampered bundle that is internally consistent, so only the real validators can catch it.
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
function reroot(bundle) {
  const { root, assets, ...rest } = bundle;
  const meta = { ...JSON.parse(JSON.stringify(rest)), assets: assets.map(({ data, ...d }) => d) };
  bundle.root = sha(new TextEncoder().encode(JSON.stringify(canonical(meta))));
  return JSON.stringify(bundle);
}
const parsed = (name) => JSON.parse(bundles[name]);
const review = (text, o = {}) => reviewCharacterPackageFile(text, { crypto: webcrypto, ...o });
const aspect = (b, id) => b.content.subjects.flatMap((s) => s.aspects || []).find((a) => a.id === id);

test('the vendored producer closure and fixtures match their recorded checksums', () => {
  const manifest = JSON.parse(readFileSync(new URL('../chat/characters/vendor/t415/SOURCE.json', import.meta.url), 'utf8'));
  assert.equal(manifest.sourceCommit, 'de5e9231730cc2b0d3a6725d006a5d3d48878fd0');
  for (const [rel, info] of Object.entries(manifest.vendored)) {
    const b = readFileSync(new URL('../chat/characters/vendor/t415/' + rel, import.meta.url));
    assert.equal(createHash('sha256').update(b).digest('hex'), info.sha256, rel);
  }
  const A = 'contracts/authored-profiles/';
  for (const [rel, info] of Object.entries(manifest.fixtures)) {
    const b = readFileSync(new URL(rel.slice(A.length), fx));
    assert.equal(createHash('sha256').update(b).digest('hex'), info.sha256, rel);
  }
  const res = JSON.parse(read('resources/manifest.json'));
  for (const r of res.resources) assert.equal(sha(readFileSync(new URL('resources/' + r.file, fx))), r.sha256);
});

test('all three real producer bundles are reviewed and keep the producer plain projection exactly', async () => {
  for (const name of ['minimal', 'neri', 'bex']) {
    const r = await review(bundles[name]);
    assert.equal(r.ok, true, name + ' ' + JSON.stringify(r));
    const expected = JSON.parse(read(`fixtures/${name}.receiving.json`)).plc;
    assert.equal(r.candidate.preview.name, expected.value.name);
    assert.equal(r.candidate.preview.instructions, expected.value.prompt);
    assert.deepEqual(r.candidate.omissions, expected.omissions, 'named omissions equal the producer fixture');
    assert.equal(r.candidate.route, 'file');
    assert.equal(r.candidate.admissionReady, false);
    assert.equal(r.candidate.runtimeReady, false);
    assert.equal(r.candidate.persisted, false);
    assert.equal(r.candidate.transport.root, JSON.parse(bundles[name]).root);
  }
});

test('a name-only package is a complete rich candidate with nothing invented', async () => {
  const { candidate } = await review(bundles.minimal);
  assert.equal(candidate.preview.name, 'Pip');
  assert.equal(candidate.resources.length, 0);
  for (const key of ['lore', 'guidance', 'prepared', 'presentation', 'media', 'evidence']) {
    assert.equal(candidate.capabilities[key].present, false, key);
    assert.deepEqual(candidate.structured[key], []);
  }
  assert.equal(candidate.design.designId, null);
  assert.equal(candidate.individual.individualId, null);
});

test('Neri keeps lore, guidance, prepared, presentation, media and evidence as structured data, not prompt text', async () => {
  const { candidate } = await review(bundles.neri);
  const b = parsed('neri');
  const map = { lore: 'aspect:neri-lore', guidance: 'aspect:neri-guidance', prepared: 'aspect:neri-prepared', presentation: 'aspect:neri-presentation', media: 'aspect:neri-media', evidence: 'aspect:neri-evidence' };
  for (const [key, id] of Object.entries(map)) {
    assert.equal(candidate.capabilities[key].present, true, key);
    assert.equal(candidate.capabilities[key].status, 'retained-structured');
    assert.equal(candidate.capabilities[key].executionReady, false);
    assert.deepEqual(candidate.structured[key][0].value, aspect(b, id).value, key + ' value kept exactly');
  }
  assert.equal(candidate.capabilities.lore.owner, 'T429');
  assert.equal(candidate.capabilities.prepared.owner, 'T455');
  assert.deepEqual(candidate.capabilities.guidance.adapters.length > 0, true);
  const lore = aspect(b, 'aspect:neri-lore').value.entries[0].text;
  assert.ok(!candidate.preview.instructions.includes(lore), 'lore is not silently appended to the prompt');
  // design attribution and the source candidate id are source claims, not local identity
  assert.equal(candidate.design.designId, aspect(b, 'aspect:neri-design-attribution').value.designId);
  assert.equal(candidate.individual.assigned, false);
  assert.match(candidate.design.sourceCandidateId, /^cosmogenitor:subject:/);
  // the dependency closure is retained
  assert.ok(candidate.package.content.subjects.some((s) => s.id === 'subject:harbour'));
  assert.equal(candidate.package.content.assets.length, 2);
  assert.ok(candidate.package.definitions.aspectDefinitions.some((d) => d.id === 'authored:lore-v1'));
});

test('required resource bytes are verified and exactly retained; text is previewable', async () => {
  const { candidate } = await review(bundles.neri);
  const chart = candidate.resources.find((r) => r.id === 'asset:chart');
  const card = candidate.resources.find((r) => r.id === 'asset:card');
  assert.equal(chart.status, 'verified-inline');
  assert.equal(chart.required, true);
  assert.deepEqual(candidate.resourceBytes(chart.sha256), bytes('resources/chart.png'));
  assert.equal(chart.preview.kind, 'image');
  assert.equal(chart.preview.signatureMatches, true);
  assert.equal(card.preview.kind, 'text');
  assert.equal(card.preview.text, read('resources/tide-card.txt'));
  const copy = candidate.resourceBytes(chart.sha256); copy[0] = 0;
  assert.deepEqual(candidate.resourceBytes(chart.sha256), bytes('resources/chart.png'), 'callers get copies');
  assert.equal(candidate.resourceBytes(sha(new Uint8Array([1]))), null);
});

test('Bex keeps the prepared host, optional cue, unfamiliar festival meaning and synthetic reports', async () => {
  const { candidate } = await review(bundles.bex);
  const cue = candidate.resources.find((r) => r.id === 'asset:cue');
  assert.equal(cue.required, false);
  assert.equal(cue.status, 'verified-inline');
  assert.equal(cue.preview.kind, 'audio');
  assert.equal(cue.preview.signatureMatches, true);
  assert.deepEqual(candidate.resourceBytes(cue.sha256), bytes('resources/cue.wav'));
  assert.equal(candidate.capabilities.other.present, true);
  assert.deepEqual(candidate.capabilities.other.aspects, ['aspect:bex-lantern']);
  assert.equal(candidate.capabilities.other.status, 'transported-not-interpreted');
  assert.ok(candidate.omissions.some((o) => o.id === 'aspect:bex-lantern'));
  assert.ok(candidate.omissions.some((o) => o.id === 'festival:lantern'));
  assert.ok(candidate.structured.prepared[0].value.states.length > 0);
});

test('incoming individual, run and participant assertions stay unverified source claims', async () => {
  for (const name of ['neri', 'bex']) {
    const { candidate } = await review(bundles[name]);
    const reports = candidate.unverifiedSourceClaims.filter((c) => c.individual !== null);
    assert.ok(candidate.unverifiedSourceClaims.length > 0, name + ' keeps its evidence entries');
    if (name === 'neri') { assert.equal(reports.length, 0, 'authored seeds carry no firsthand attribution'); continue; }
    assert.ok(reports.length > 0, name + ' has attributed reports');
    for (const c of candidate.unverifiedSourceClaims) { assert.equal(c.verified, false); assert.equal(c.authority, 'none'); }
    assert.equal(candidate.individual.individualId, null);
    assert.equal(candidate.individual.assigned, false);
    assert.ok(!JSON.stringify(candidate.individual).includes(reports[0].individual));
  }
});

test('candidate data is immutable', async () => {
  const { candidate } = await review(bundles.neri);
  assert.throws(() => { candidate.preview.name = 'x'; }, TypeError);
  assert.throws(() => { candidate.structured.lore[0].value.entries.push(1); }, TypeError);
  assert.throws(() => { candidate.capabilities.lore.present = false; }, TypeError);
});

test('byte tamper: changed inline bytes refuse, even when the metadata is untouched', async () => {
  const b = parsed('neri');
  const original = b.assets[0].data;
  b.assets[0].data = (original[0] === 'A' ? 'B' : 'A') + original.slice(1);
  const r = await review(JSON.stringify(b));
  assert.equal(r.ok, false);
  assert.match(r.code, /byte-integrity|base64/);
  const b2 = parsed('neri'); b2.assets[1].data = b2.assets[0].data; // wrong bytes for the digest
  assert.equal((await review(JSON.stringify(b2))).ok, false);
});

test('root tamper: changed metadata without a new root refuses', async () => {
  const b = parsed('neri');
  aspect(b, 'aspect:neri-communication').value.manner = 'changed';
  const r = await review(JSON.stringify(b));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'root-integrity');
  const b2 = parsed('minimal'); b2.root = 'sha256:' + '0'.repeat(64);
  assert.equal((await review(JSON.stringify(b2))).code, 'root-integrity');
});

test('definition tamper: a weakened protected definition with a recomputed root refuses', async () => {
  const b = parsed('neri');
  const d = b.definitions.aspectDefinitions.find((x) => x.id === 'authored:lore-v1');
  d.schema.properties.budgetChars = { type: 'integer', minimum: 0, maximum: 99999999 };
  const r = await review(reroot(b));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'profile-version');
  // a rewritten privacy marker is a definition change too
  const c = parsed('neri');
  c.definitions.aspectDefinitions.find((x) => x.id === 'authored:guidance-v1').privatePaths = [];
  assert.equal((await review(reroot(c))).ok, false);
});

test('unknown or incompatible declared versions refuse', async () => {
  const v = parsed('neri');
  aspect(v, 'aspect:neri-lore').value.version = '2.0.0';
  const r = await review(reroot(v));
  assert.equal(r.ok, false);
  const d = parsed('neri');
  d.definitions.aspectDefinitions.find((x) => x.id === 'authored:prepared-v1').version = '2.0.0';
  assert.equal((await review(reroot(d))).ok, false);
  const f = parsed('neri'); f.format = 'cosmogenitor/bundle/1';
  assert.equal((await review(JSON.stringify(f))).ok, false);
});

test('required unsupported semantics refuse atomically; optional ones are named omissions', async () => {
  for (const id of ['aspect:neri-prepared', 'aspect:neri-lore', 'aspect:neri-presentation']) {
    const b = parsed('neri');
    aspect(b, id).required = true;
    const r = await review(reroot(b));
    assert.equal(r.ok, false, id);
    assert.equal(r.code, 'required-aspect', id);
    assert.equal(r.candidate, undefined, 'no partial candidate');
  }
  const p = parsed('neri');
  p.content.subjects.find((s) => s.id === 'subject:neri').requires = ['authored:character-v1'];
  assert.equal((await review(reroot(p))).code, 'required-profile');
  const q = parsed('bex');
  q.content.subjects.find((s) => s.id === 'subject:bex').requires = ['festival:lantern'];
  assert.equal((await review(reroot(q))).code, 'required-profile');
  const ok = await review(bundles.bex);
  assert.ok(ok.ok && ok.candidate.omissions.some((o) => o.reason === 'optional aspect transported, not interpreted'));
});

test('missing resources: required bytes refuse, optional bytes are a named omission', async () => {
  const strip = (name, index) => { const b = parsed(name); delete b.assets[index].data; b.assets[index].status = 'missing'; return b; };
  const required = await review(reroot(strip('neri', 0)));
  assert.equal(required.ok, false);
  assert.equal(required.code, 'missing-resource');
  const optional = await review(reroot(strip('bex', 0)));
  assert.equal(optional.ok, true);
  assert.equal(optional.candidate.resources[0].status, 'missing');
  assert.equal(optional.candidate.resources[0].preview.kind, 'unavailable');
  assert.deepEqual(optional.candidate.omissions.filter((o) => o.reason === 'optional bytes unavailable').map((o) => o.id), ['asset:cue']);
  assert.equal(optional.candidate.resourceBytes(optional.candidate.resources[0].sha256), null);
});

test('external bytes come only from explicit local adapters and are verified', async () => {
  const b = parsed('bex');
  const cue = bytes('resources/cue.wav');
  delete b.assets[0].data; b.assets[0].status = 'external';
  const text = reroot(b);
  const none = await review(text);
  assert.equal(none.ok, false);
  assert.equal(none.code, 'external-bytes');
  const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };
  const good = await review(text, { openExternal: async function* () { yield cue.subarray(0, 100); yield cue.subarray(100); }, hasherFactory });
  assert.equal(good.ok, true);
  assert.equal(good.candidate.resources[0].status, 'verified-external');
  const bad = new Uint8Array(cue); bad[10] ^= 1;
  const wrong = await review(text, { openExternal: async function* () { yield bad; }, hasherFactory });
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, 'byte-integrity');
});

test('purposes: fresh, copy and update are explicit; continuation-like purposes refuse before any work', async () => {
  assert.deepEqual(Object.keys(PURPOSES).sort(), ['copy', 'fresh', 'update']);
  const fresh = await review(bundles.neri);
  assert.equal(fresh.candidate.individual.mode, 'new');
  assert.equal((await review(bundles.neri, { purpose: 'copy' })).candidate.individual.mode, 'new');
  const upd = await review(bundles.neri, { purpose: 'update', targetIndividualId: 'individual:abc' });
  assert.equal(upd.candidate.individual.mode, 'selected');
  assert.equal(upd.candidate.individual.targetIndividualId, 'individual:abc');
  assert.equal(upd.candidate.individual.individualId, null);
  assert.equal((await review(bundles.neri, { purpose: 'update' })).code, 'target');
  assert.equal((await review(bundles.neri, { purpose: 'update', targetIndividualId: 'bad id!' })).code, 'target');
  assert.equal((await review(bundles.neri, { targetIndividualId: 'individual:abc' })).code, 'target');
  for (const purpose of ['continue', 'continuation', 'attach-existing', 'move-authoritative-host', 'host-movement', 'report-memory', 'reported-experience', 'archive-as-new', 'restore', 'whatever', 42]) {
    const r = await review('not even json', { purpose });
    assert.equal(r.code, 'purpose', String(purpose));
  }
  // an incoming source id, name or design id never selects a local life
  assert.equal(fresh.candidate.individual.targetIndividualId, undefined);
});

test('unknown subject refuses and lists the choices', async () => {
  const r = await review(bundles.neri, { subjectId: 'subject:nobody' });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'subject');
  assert.ok(r.errors.some((e) => e.path === 'subject:neri'));
});

test('unsafe, oversized, deep and duplicate-key input refuses before work', async () => {
  assert.equal((await review(null)).code, 'not-json');
  assert.equal((await review('{')).ok, false);
  assert.equal((await review('[]')).ok, false);
  assert.equal((await review('x'.repeat(CHARACTER_PACKAGE_LIMITS.fileBytes + 1))).code, 'too-large');
  // multi-byte text: few characters, too many bytes
  assert.equal((await review('€'.repeat(Math.ceil(CHARACTER_PACKAGE_LIMITS.fileBytes / 3) + 1))).code, 'too-large');
  assert.equal(checkPackageFileSize(CHARACTER_PACKAGE_LIMITS.fileBytes).ok, true);
  assert.equal(checkPackageFileSize(CHARACTER_PACKAGE_LIMITS.fileBytes + 1).code, 'too-large');
  assert.equal(checkPackageFileSize(-1).ok, false);
  const dup = bundles.minimal.replace('"visibility"', '"visibility": "private", "visibility"');
  assert.equal((await review(dup)).code, 'duplicate-key');
  const proto = bundles.minimal.replace('"format"', '"__proto__": {}, "format"');
  assert.equal((await review(proto)).ok, false);
  let deep = '1'; for (let i = 0; i < 200; i++) deep = '{"a":' + deep + '}';
  assert.equal((await review(deep)).ok, false);
  const extra = parsed('minimal'); extra.token = 'abc';
  assert.equal((await review(JSON.stringify(extra))).ok, false, 'unknown envelope fields refuse');
  const hidden = parsed('neri'); hidden.assets[0].url = 'https://example.invalid/x';
  assert.equal((await review(JSON.stringify(hidden))).ok, false, 'asset descriptors carry no addresses');
});

test('a simple preset file is not a package, and a package is not a simple preset', async () => {
  assert.equal((await review(JSON.stringify({ id: 'x', name: 'A', prompt: 'B' }))).ok, false);
  const simple = parsePresetCandidate(bundles.minimal);
  assert.equal(simple.ok, false);
  assert.match(simple.code, /unsupported|too-large|credential/);
  assert.equal(await reviewCharacterPackageFragment(encodePresetFragment({ name: 'A', prompt: 'B' })), null);
  assert.equal(readPresetFragment(encodeCharacterFragment(bundles.minimal)), null);
});

test('the fragment route carries a small metadata-only package and refuses anything bigger', async () => {
  const hash = encodeCharacterFragment(bundles.minimal);
  assert.ok(hash.length - 1 <= CHARACTER_PACKAGE_LIMITS.fragmentEnvelopeChars);
  const r = await reviewCharacterPackageFragment(hash, { crypto: webcrypto });
  assert.equal(r.ok, true);
  assert.equal(r.candidate.route, 'fragment');
  assert.equal(r.candidate.preview.name, 'Pip');
  assert.equal((await reviewCharacterPackageFragment('#' + 'a=b&' + hash.slice(1) + '&z=1', { crypto: webcrypto })).ok, true, 'other parameters are left alone');
  // bytes never travel in an address
  const neri = await reviewCharacterPackageFragment(encodeCharacterFragment(bundles.neri), { crypto: webcrypto });
  assert.equal(neri.ok, false);
  assert.ok(['fragment-assets', 'too-large'].includes(neri.code));
  const bex = await reviewCharacterPackageFragment(encodeCharacterFragment(bundles.bex), { crypto: webcrypto });
  assert.equal(bex.ok, false);
  // a metadata-only variant of a package whose bytes are required still refuses, by the same rules as a file
  const b = parsed('neri'); b.assets.forEach((a) => { delete a.data; a.status = 'missing'; });
  const metaOnly = reroot(b);
  const viaFragment = await reviewCharacterPackageFragment(encodeCharacterFragment(metaOnly), { crypto: webcrypto });
  assert.equal(viaFragment.ok, false);
  assert.ok(['missing-resource', 'too-large'].includes(viaFragment.code));
  // the same package through the file route gives the same verdict
  assert.equal((await review(metaOnly)).code, 'missing-resource');
});

test('fragment bounds are checked before decoding or parsing', async () => {
  const realAtob = globalThis.atob; let decoded = 0;
  globalThis.atob = (...a) => { decoded++; return realAtob(...a); };
  try {
    const huge = '#character=' + 'A'.repeat(1_000_000);
    assert.equal(readCharacterFragment(huge).code, 'too-large');
    assert.equal(readCharacterFragment('#x=1&' + 'z'.repeat(1_000_000) + '&character=AAAA').code, 'too-large');
    assert.equal(readCharacterFragment('#character=' + 'A'.repeat(CHARACTER_PACKAGE_LIMITS.fragmentValueChars + 1)).code, 'too-large');
    assert.equal(decoded, 0, 'nothing was decoded');
    assert.equal(readCharacterFragment('#' + 'z'.repeat(1_000_000)), null, 'a long fragment that is not ours is left alone');
    assert.equal(readCharacterFragment(''), null);
    assert.equal(readCharacterFragment('#preset=abcd'), null);
    assert.equal(readCharacterFragment('#character=a&character=b').code, 'ambiguous');
    assert.equal(readCharacterFragment('#character=%%%').code, 'not-json');
    assert.equal(readCharacterFragment('#character=A').code, 'not-json');
    assert.equal(readCharacterFragment('#character=' + encodeCharacterFragment('not json').split('=')[1]).code, 'not-json');
    assert.equal(readCharacterFragment(encodeCharacterFragment('[]')).code, 'not-a-package');
    assert.equal(readCharacterFragment(encodeCharacterFragment('{"assets":[{"status":"inline","data":"AA=="}]}')).code, 'fragment-assets');
  } finally { globalThis.atob = realAtob; }
  const r = await reviewCharacterPackageFragment('#character=!!', { crypto: webcrypto });
  assert.equal(r.code, 'not-json');
});

test('reviewing touches no network, storage, timer or eval', async () => {
  const trap = (name) => () => { throw new Error(name + ' was used'); };
  const saved = {};
  for (const k of ['fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB', 'eval', 'Function']) { saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); }
  const originals = { fetch: globalThis.fetch };
  globalThis.fetch = trap('fetch');
  try {
    for (const name of ['minimal', 'neri', 'bex']) assert.equal((await review(bundles[name])).ok, true);
    assert.equal((await reviewCharacterPackageFragment(encodeCharacterFragment(bundles.minimal), { crypto: webcrypto })).ok, true);
  } finally { globalThis.fetch = originals.fetch; }
  const dirs = ['../chat/characters'];
  const files = [];
  // character-store.mjs is the one module of this folder that owns timers, Web Locks and a clock; it has its own source test (character-store.test.mjs).
  const walk = (dir) => { for (const n of readdirSync(new URL(dir + '/', import.meta.url))) { const p = dir + '/' + n; statSync(new URL(p, import.meta.url)).isDirectory() ? walk(p) : /\.mjs$/.test(n) && n !== 'character-store.mjs' && files.push(p); } };
  dirs.forEach(walk);
  assert.ok(files.length >= 9);
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\bfetch\s*\(|\beval\s*\(|new\s+Function\b|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|navigator\.locks|\bimport\s*\(|setTimeout|Date\.now|Math\.random/, f);
  }
});
