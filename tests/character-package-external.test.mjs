// External resource retention and the serialisable source of a reviewed package (T222 phase B correction).
// The producer itself (the vendored T415 exportAuthored) writes the external-bytes package; the receiver reviews it with explicit local
// stream adapters; the exact verified bytes must then be HELD by the candidate (never re-fetched), and the whole verified transport must
// survive JSON serialisation and reopen through the same producer validators.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { reviewCharacterPackageFile, reopenCharacterSource, bundleTextFromSource } from '../chat/characters/character-package.mjs';
import { openAuthored, exportAuthored } from '../vendor/authored-profiles/authored-profiles/index.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const text = (name) => readFileSync(new URL(`examples/${name}.bundle.json`, fx), 'utf8');
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };

/** The producer's own external export of a real bundle, plus the byte source a receiving person would hold locally. */
async function externalPackage(name) {
  const opened = await openAuthored(text(name), { crypto: webcrypto });
  const bytes = opened.inlineBytes; // hash -> Uint8Array
  const readAsset = async (hash) => (async function* () { yield bytes.get(hash); })();
  const bundle = await exportAuthored(opened.document, opened.registry, { selection: opened.selection, visibility: opened.visibility, audience: opened.audience, byteMode: 'external', readAsset, hasherFactory, crypto: webcrypto });
  assert.ok(bundle.assets.length > 0 && bundle.assets.every((a) => a.status === 'external' && a.data === undefined));
  return { text: JSON.stringify(bundle), bytes };
}
const counted = (bytes, { mutate } = {}) => {
  const calls = [];
  const openExternal = async (hash) => { calls.push(hash); return (async function* () { const b = mutate ? mutate(hash, bytes.get(hash)) : bytes.get(hash); yield b.subarray(0, 7); yield b.subarray(7); })(); };
  return { openExternal, calls };
};
const review = (t, o = {}) => reviewCharacterPackageFile(t, { crypto: webcrypto, hasherFactory, ...o });

test('genuine Neri external export: both required assets are verified AND their exact bytes are retained', async () => {
  const { text: t, bytes } = await externalPackage('neri');
  const { openExternal, calls } = counted(bytes);
  const r = await review(t, { openExternal });
  assert.equal(r.ok, true, JSON.stringify(r));
  const { candidate } = r;
  assert.equal(candidate.resources.length, 2);
  for (const res of candidate.resources) {
    assert.equal(res.status, 'verified-external');
    assert.equal(res.retained, true);
    assert.deepEqual(candidate.resourceBytes(res.sha256), new Uint8Array(bytes.get(res.sha256)), res.id + ' exact bytes');
    assert.equal(candidate.resourceBytes(res.sha256).length, res.size);
  }
  assert.equal(candidate.resources.find((x) => x.id === 'asset:card').preview.kind, 'text', 'external text is previewable');
  assert.equal(candidate.resources.find((x) => x.id === 'asset:chart').preview.signatureMatches, true);
  // the caller's stream was read exactly once per resource: the second producer pass reads the retained copy, never the caller again
  assert.deepEqual([...calls].sort(), [...bytes.keys()].sort());
  // read consistency: repeated reads give equal, independent copies
  const a = candidate.resourceBytes([...bytes.keys()][0]); a[0] ^= 255;
  assert.deepEqual(candidate.resourceBytes([...bytes.keys()][0]), new Uint8Array(bytes.get([...bytes.keys()][0])));
});

test('external bytes: a source that reuses or mutates its buffer after yielding cannot change what was kept', async () => {
  const { text: t, bytes } = await externalPackage('neri');
  const shared = new Map();
  const openExternal = async (hash) => (async function* () {
    const original = bytes.get(hash); const buffer = new Uint8Array(original.length);
    buffer.set(original); yield buffer.subarray(0, 5);
    const rest = buffer.subarray(5); yield rest;
    buffer.fill(0); shared.set(hash, true); // scribble after the producer has the chunks
  })();
  const r = await review(t, { openExternal });
  assert.equal(r.ok, true, JSON.stringify(r));
  for (const res of r.candidate.resources) assert.deepEqual(r.candidate.resourceBytes(res.sha256), new Uint8Array(bytes.get(res.sha256)));
});

test('external bytes: wrong, truncated, oversized, extra, missing and unreadable streams refuse with no partial candidate', async () => {
  const { text: t, bytes } = await externalPackage('neri');
  const flip = (hash, b) => { const c = new Uint8Array(b); c[3] ^= 1; return c; };
  const wrong = await review(t, { openExternal: counted(bytes, { mutate: flip }).openExternal });
  assert.equal(wrong.ok, false); assert.equal(wrong.code, 'byte-integrity'); assert.equal(wrong.candidate, undefined);
  const truncated = await review(t, { openExternal: counted(bytes, { mutate: (h, b) => b.subarray(0, b.length - 1) }).openExternal });
  assert.equal(truncated.ok, false); assert.equal(truncated.code, 'byte-integrity');
  const oversized = await review(t, { openExternal: counted(bytes, { mutate: (h, b) => { const c = new Uint8Array(b.length + 9); c.set(b); return c; } }).openExternal });
  assert.equal(oversized.ok, false); assert.match(oversized.code, /byte-size/);
  const empty = await review(t, { openExternal: async () => (async function* () {})() });
  assert.equal(empty.ok, false);
  const nonStream = await review(t, { openExternal: async () => null });
  assert.equal(nonStream.ok, false); assert.equal(nonStream.code, 'external-bytes');
  const notBytes = await review(t, { openExternal: async () => (async function* () { yield 'text'; })() });
  assert.equal(notBytes.ok, false);
  const throwing = await review(t, { openExternal: async () => { throw new Error('disk gone'); } });
  assert.equal(throwing.ok, false);
  const noAdapters = await reviewCharacterPackageFile(t, { crypto: webcrypto });
  assert.equal(noAdapters.ok, false); assert.equal(noAdapters.code, 'external-bytes');
  // a hash the package does not name is never asked for: only the manifest's hashes are opened
  const { openExternal, calls } = counted(bytes);
  assert.equal((await review(t, { openExternal })).ok, true);
  assert.ok(calls.every((h) => bytes.has(h)));
});

test('external bytes: a single chunk beyond the producer bound stops being buffered', async () => {
  const { text: t } = await externalPackage('neri');
  let pulled = 0;
  const openExternal = async () => (async function* () { for (let i = 0; i < 64; i++) { pulled++; yield new Uint8Array(65536); } })();
  const r = await review(t, { openExternal });
  assert.equal(r.ok, false);
  assert.ok(pulled < 64, 'reading stopped early (' + pulled + ' chunks)');
});

test('no promised-ready resource lacks bytes: every verified status has retained bytes, missing has none', async () => {
  for (const name of ['neri', 'bex']) {
    const { text: t, bytes } = await externalPackage(name);
    const r = await review(t, { openExternal: counted(bytes).openExternal });
    assert.equal(r.ok, true, name);
    for (const res of r.candidate.resources) {
      assert.ok(['verified-inline', 'verified-external', 'missing'].includes(res.status));
      assert.equal(res.retained, res.status !== 'missing');
      assert.equal(r.candidate.resourceBytes(res.sha256) !== null, res.status !== 'missing');
    }
  }
});

test('the verified transport serialises: JSON round trip reopens through the producer validators with identical meaning (inline and external)', async () => {
  const { text: ext, bytes } = await externalPackage('neri');
  const inputs = [['inline neri', text('neri'), {}], ['external neri', ext, { openExternal: counted(bytes).openExternal }], ['inline bex', text('bex'), {}], ['minimal', text('minimal'), {}]];
  for (const [label, t, opt] of inputs) {
    const r = await review(t, opt);
    assert.equal(r.ok, true, label);
    const c = r.candidate;
    const wire = JSON.parse(JSON.stringify(c.source)); // a function-free, plain JSON value
    assert.equal(wire.root, c.transport.root);
    assert.equal(wire.format, 'cosmogenitor/bundle/0');
    // the record manifest and the asset byte manifest of the original transport are both there
    const original = JSON.parse(t);
    assert.deepEqual(wire.envelope.records, original.records, label + ' record manifest');
    assert.deepEqual(wire.envelope.assets, original.assets.map(({ data, ...d }) => d), label + ' asset manifest');
    assert.deepEqual(wire.envelope.content, original.content);
    assert.deepEqual(wire.envelope.definitions, original.definitions);
    assert.deepEqual(wire.envelope.receipts, original.receipts);
    assert.equal(wire.bytes.length, c.resources.length);
    const again = await reopenCharacterSource(wire, { subjectId: c.subject.id, crypto: webcrypto });
    assert.equal(again.ok, true, label + ' ' + JSON.stringify(again));
    assert.equal(again.candidate.route, 'stored');
    assert.deepEqual(JSON.parse(JSON.stringify(again.candidate.structured)), JSON.parse(JSON.stringify(c.structured)));
    assert.deepEqual(again.candidate.preview, c.preview);
    assert.equal(again.candidate.transport.root, c.transport.root);
    for (const res of c.resources) assert.deepEqual(again.candidate.resourceBytes(res.sha256), c.resourceBytes(res.sha256));
    assert.equal(JSON.stringify(again.candidate.source), JSON.stringify(c.source), label + ' the source is a fixed point');
  }
});

test('a stored source that was altered, truncated or emptied refuses on reopen', async () => {
  const { text: ext, bytes } = await externalPackage('neri');
  for (const [t, opt] of [[text('neri'), {}], [ext, { openExternal: counted(bytes).openExternal }]]) {
    const { candidate } = await review(t, opt);
    const wire = () => JSON.parse(JSON.stringify(candidate.source));
    const opts = { subjectId: candidate.subject.id, crypto: webcrypto };
    const a = wire(); a.bytes[0].data = (a.bytes[0].data[0] === 'A' ? 'B' : 'A') + a.bytes[0].data.slice(1);
    assert.equal((await reopenCharacterSource(a, opts)).ok, false, 'changed bytes');
    const b = wire(); b.bytes.pop();
    assert.equal((await reopenCharacterSource(b, opts)).ok, false, 'missing bytes');
    const c = wire(); c.envelope.content.subjects[0].label = 'Changed';
    assert.equal((await reopenCharacterSource(c, opts)).code, 'root-integrity', 'changed metadata');
    const d = wire(); d.envelope.records.pop();
    assert.equal((await reopenCharacterSource(d, opts)).ok, false, 'changed record manifest');
    const e = wire(); e.envelope.assets[0].size += 1;
    assert.equal((await reopenCharacterSource(e, opts)).ok, false, 'changed asset manifest');
    assert.equal((await reopenCharacterSource({ envelope: {} }, opts)).ok, false);
    assert.equal((await reopenCharacterSource(null, opts)).ok, false);
    assert.throws(() => bundleTextFromSource({}));
    const f = wire(); f.bytes[0].data = '!!!';
    assert.equal((await reopenCharacterSource(f, opts)).ok, false, 'not base64');
  }
});
