// Local resource files for a package that keeps its bytes outside itself, and the plain wording of what a character holds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { externalResourcesOf, checkResourceFiles, matchResourceFiles } from '../chat/characters/character-resources.mjs';
import { describeCapabilities, describeOmissions, describeResource, BACKUP_LIMIT } from '../chat/characters/character-describe.mjs';
import { reviewCharacterPackageFile, CHARACTER_PACKAGE_LIMITS } from '../chat/characters/character-package.mjs';
import { openAuthored, exportAuthored } from '../vendor/authored-profiles/authored-profiles/index.mjs';

const fx = new URL('./fixtures/characters/', import.meta.url);
const neri = readFileSync(new URL('examples/neri.bundle.json', fx), 'utf8');
const hasherFactory = () => { const h = createHash('sha256'); return { update: (c) => { h.update(c); }, digest: () => new Uint8Array(h.digest()) }; };
async function external() {
  const o = await openAuthored(neri, { crypto: webcrypto });
  const out = await exportAuthored(o.document, o.registry, { selection: o.selection, visibility: o.visibility, audience: o.audience, byteMode: 'external', readAsset: async (h) => (async function* () { yield o.inlineBytes.get(h); })(), hasherFactory, crypto: webcrypto });
  return { text: JSON.stringify(out), bytes: o.inlineBytes };
}

test('declared external resources are read from the manifest only', async () => {
  const { text } = await external();
  const declared = externalResourcesOf(text);
  assert.equal(declared.length, 2);
  assert.deepEqual(declared.map((d) => d.size).sort((a, b) => a - b), [76, 86]);
  assert.deepEqual(externalResourcesOf(neri), []); // inline bytes need no files
  for (const bad of ['', '{', '[]', 'x'.repeat(CHARACTER_PACKAGE_LIMITS.fileBytes + 1)]) assert.deepEqual(externalResourcesOf(bad), []);
});

test('chosen files are bounded by count, size and total before any byte is read', async () => {
  const { text } = await external(); const declared = externalResourcesOf(text);
  assert.equal(checkResourceFiles([], declared).ok, false);
  assert.equal(checkResourceFiles([{ name: 'a', size: 76 }, { name: 'b', size: 86 }, { name: 'c', size: 86 }], declared).code, 'count');
  assert.equal(checkResourceFiles([{ name: 'huge', size: CHARACTER_PACKAGE_LIMITS.producer.maxExternalAssetBytes + 1 }], declared).code, 'too-large');
  assert.equal(checkResourceFiles([{ name: 'odd', size: 77 }], declared).code, 'unknown');
  assert.equal(checkResourceFiles([{ name: 'x', size: -1 }], declared).ok, false);
  assert.equal(checkResourceFiles([{ name: 'a', size: 76 }, { name: 'b', size: 86 }], declared).ok, true);
});

test('files are matched by their own SHA-256 and the producer still verifies every byte', async () => {
  const { text, bytes } = await external(); const declared = externalResourcesOf(text);
  const entries = [...bytes].map(([hash, b], i) => ({ name: 'file' + i, bytes: b }));
  const matched = await matchResourceFiles(entries, declared, webcrypto);
  assert.equal(matched.ok, true); assert.deepEqual(matched.missing, []);
  const reviewed = await reviewCharacterPackageFile(text, { crypto: webcrypto, ...matched.adapters });
  assert.equal(reviewed.ok, true, JSON.stringify(reviewed));
  for (const r of reviewed.candidate.resources) { assert.equal(r.status, 'verified-external'); assert.equal(reviewed.candidate.resourceBytes(r.sha256).length, r.size); }
  const wrong = await matchResourceFiles([{ name: 'w', bytes: new Uint8Array(76).fill(1) }, { name: 'v', bytes: new Uint8Array(86).fill(2) }], declared, webcrypto);
  assert.equal(wrong.ok, false); assert.equal(wrong.unmatched.length, 2); assert.equal(wrong.missing.length, 2);
  const twice = await matchResourceFiles([entries[0], { name: 'again', bytes: entries[0].bytes }], declared, webcrypto);
  assert.deepEqual(twice.unmatched.map((u) => u.reason), ['duplicate']);
  assert.equal((await reviewCharacterPackageFile(text, { crypto: webcrypto, ...wrong.adapters })).ok, false);
});

test('the wording names capabilities plainly, never a task or an owner, and never claims chat can use them', async () => {
  const r = await reviewCharacterPackageFile(neri, { crypto: webcrypto });
  const rows = describeCapabilities(r.candidate.capabilities);
  const joined = JSON.stringify([rows, describeOmissions(r.candidate.omissions), r.candidate.resources.map(describeResource), BACKUP_LIMIT]);
  assert.ok(!/\bT\d{2,3}\b/.test(joined) && !/phase|owner/i.test(joined), joined);
  assert.equal(rows.find((x) => x.key === 'text').state, 'ready');
  for (const k of ['lore', 'guidance', 'prepared', 'presentation', 'media', 'evidence']) assert.match(rows.find((x) => x.key === k).text, /Chat does not use it yet/);
  assert.equal(rows.find((x) => x.key === 'other').state, 'absent');
  assert.match(BACKUP_LIMIT, /not included in protected backups/);
});
