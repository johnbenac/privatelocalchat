// T415 follow-up (docs/CONTEXT-COMPOSER.md): a reported attribution handle of only whitespace passes the producer's schema ("a bounded non-empty string"). At LOCAL admission and in the
// review text it is shown as unnamed and names nobody; a useful handle is never trimmed or rewritten; and the lossless transport (candidate.source) still carries exactly what was supplied.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash, webcrypto } from 'node:crypto';
import { reviewCharacterPackageFile, bundleTextFromSource } from '../chat/characters/character-package.mjs';
import { describeSourceClaims } from '../chat/characters/character-describe.mjs';
import { handleState, attributionLabel, reportAttribution } from '../chat/context/attribution.mjs';

const bex = readFileSync(new URL('./fixtures/characters/examples/bex.bundle.json', import.meta.url), 'utf8');
const sha = (b) => 'sha256:' + createHash('sha256').update(b).digest('hex');
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
function reroot(bundle) {
  const { root, assets, ...rest } = bundle;
  const meta = { ...JSON.parse(JSON.stringify(rest)), assets: assets.map(({ data, ...d }) => d) };
  bundle.root = sha(new TextEncoder().encode(JSON.stringify(canonical(meta))));
  return JSON.stringify(bundle);
}
/** the bex bundle with its first evidence entry's handles replaced, re-rooted so only the real validators judge it */
function withEntry(change) {
  const b = JSON.parse(bex);
  const aspect = b.content.subjects.flatMap((s) => s.aspects || []).find((a) => a.id === 'aspect:bex-evidence');
  Object.assign(aspect.value.entries[0], change);
  if (change.audience) aspect.value.entries[1].audience = change.audience;   // the derived summary may not be wider than its original
  return reroot(b);
}
const review = (text) => reviewCharacterPackageFile(text, { crypto: webcrypto });

test('handleState judges, never rewrites', () => {
  for (const [v, want] of [[undefined, 'absent'], [null, 'absent'], [3, 'invalid'], ['', 'blank'], ['   ', 'blank'], ['\t\n', 'blank'], ['​​', 'blank'], [' ', 'blank'], ['x', 'named'], [' x ', 'named'], ['0', 'named']]) assert.equal(handleState(v), want, JSON.stringify(v));
  assert.equal(attributionLabel(' ind:x '), ' ind:x ', 'a named handle is shown exactly as supplied');
  assert.equal(attributionLabel('   '), '(unnamed)');
  const claim = Object.freeze({ individual: ' ind:x ', run: '  ', audience: Object.freeze(['a', ' '] ) });
  const a = reportAttribution(claim);
  assert.deepEqual(a.blank, ['run', 'audience']); assert.equal(a.usable, false); assert.equal(a.authenticated, false);
  assert.equal(a.fields.individual.value, ' ind:x '); assert.equal(a.fields.run.value, null);
  assert.deepEqual(a.audience, { named: ['a'], blank: 1, total: 2 });
  assert.equal(reportAttribution({ individual: 'i', audience: ['a'] }).usable, true);
  assert.equal(reportAttribution({ individual: 'i', audience: [] }).usable, false, 'no audience member is no scope');
});

test('the producer really accepts a whitespace-only handle (the premise), and the lossless source keeps it byte for byte', async () => {
  const text = withEntry({ individual: '   ', participant: '\t', audience: ['  '] });
  const r = await review(text);
  assert.equal(r.ok, true, JSON.stringify(r));
  const claim = r.candidate.unverifiedSourceClaims.find((c) => c.entry === 'report:rehearsal');
  assert.equal(claim.individual, '   ', 'the claim holds what was supplied: nothing is trimmed away or replaced');
  assert.equal(claim.participant, '\t');
  assert.deepEqual([...claim.audience], ['  ']);
  const carried = JSON.parse(bundleTextFromSource(r.candidate.source));
  const entry = carried.content.subjects.flatMap((s) => s.aspects || []).find((a) => a.id === 'aspect:bex-evidence').value.entries[0];
  assert.equal(entry.individual, '   '); assert.equal(entry.participant, '\t'); assert.deepEqual(entry.audience, ['  ']);
  assert.equal(carried.root, JSON.parse(text).root, 'the transported package is the package that was received (same root)');
});

test('local admission and the review words: a blank handle is shown as unnamed and unusable; a useful handle is shown and kept as supplied; nothing is called verified', async () => {
  const blank = (await review(withEntry({ individual: '   ', audience: ['  '] }))).candidate;
  const rows = describeSourceClaims(blank), row = rows.find(([k]) => k === 'Report report:rehearsal');
  assert.ok(row, JSON.stringify(rows));
  assert.ok(row[1].includes('individual (unnamed)') && row[1].includes('for nobody named and 1 unnamed') && row[1].includes('not usable as a scoped report') && row[1].includes('not verified'), row[1]);
  assert.ok(reportAttribution(blank.unverifiedSourceClaims.find((c) => c.entry === 'report:rehearsal')).usable === false);
  const named = (await review(withEntry({ individual: ' ind:handle ', audience: [' part:guest '] }))).candidate;
  const claim = named.unverifiedSourceClaims.find((c) => c.entry === 'report:rehearsal');
  assert.equal(claim.individual, ' ind:handle '); assert.deepEqual([...claim.audience], [' part:guest ']);
  assert.equal(claim.verified, false); assert.equal(claim.authority, 'none');
  const nrow = describeSourceClaims(named).find(([k]) => k === 'Report report:rehearsal');
  assert.ok(nrow[1].includes('individual “ ind:handle ”') && nrow[1].includes('“ part:guest ”') && !nrow[1].includes('not usable'), nrow[1]);
  assert.equal(named.individual.individualId, null, 'a handle never becomes a local identity');
  assert.ok(!JSON.stringify(named.individual).includes('ind:handle'));
  assert.equal(reportAttribution(claim).usable, true); assert.equal(reportAttribution(claim).authenticated, false);
});
