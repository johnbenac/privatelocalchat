// models.json (scripts/models-manifest.mjs): every model file the app can download, with the size and SHA-256 the app checks it against.
// docs/evidence/split/model-urls-baseline.json is the record of every address; the manifest must agree with it exactly.
import './helpers/install-app-config.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildModelsManifest, modelsManifestText, MODELS_FORMAT} from '../scripts/models-manifest.mjs';
import {BASELINE} from './links/model-urls.mjs';

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
const baselineFiles = () => [...Object.values(baseline.tiers).flatMap((t) => Object.values(t)).flat(), ...Object.values(baseline.voices).flat()];
const manifestFiles = (m) => [...Object.values(m.tiers).flat(), ...Object.values(m.voices).flat(), ...m.embedding];
const key = (f, root) => `${f.url ?? root + f.path} ${f.bytes} ${f.sha256}`;

/** Why the manifest and the baseline disagree, or null: every baseline address present with the same pin, and nothing else. */
function disagreement(manifest, base = baselineFiles()) {
  const want = new Set(base.map((f) => key(f)));
  const got = new Set(manifestFiles(manifest).map((f) => key(f, manifest.root)));
  for (const k of want) if (!got.has(k)) return 'missing or different in the manifest: ' + k;
  for (const k of got) if (!want.has(k)) return 'not in the baseline: ' + k;
  return null;
}

test('every address and pin of the baseline is in the manifest, and the manifest has nothing else', async () => {
  const manifest = await buildModelsManifest();
  assert.equal(manifest.format, MODELS_FORMAT);
  assert.equal(manifest.root, 'https://assets.privatelocal.chat/models/');
  assert.equal(disagreement(manifest), null);
  const distinct = new Set(baselineFiles().map((f) => f.url)).size;
  assert.equal(distinct, 310, 'the baseline names 310 distinct addresses');
  assert.equal(manifestFiles(manifest).length, distinct);
  assert.deepEqual(Object.keys(manifest.tiers), Object.keys(baseline.tiers));
  assert.deepEqual(Object.keys(manifest.voices), Object.keys(baseline.voices));
});

test('every path is relative and clean, each is listed once per list, and every list is sorted', async () => {
  const manifest = await buildModelsManifest();
  const lists = [...Object.values(manifest.tiers), ...Object.values(manifest.voices), manifest.embedding];
  for (const list of lists) {
    const paths = list.map((f) => f.path);
    assert.deepEqual(paths, [...paths].sort(), 'sorted');
    assert.equal(new Set(paths).size, paths.length, 'no duplicates');
    for (const f of list) {
      assert.ok(!f.path.startsWith('/') && !f.path.split('/').includes('..') && !f.path.includes('\\'), f.path);
      assert.deepEqual(Object.keys(f), ['path', 'bytes', 'sha256']);
      assert.ok(Number.isSafeInteger(f.bytes) && f.bytes > 0, f.path);
      assert.match(f.sha256, /^[0-9a-f]{64}$/, f.path);
    }
  }
  assert.ok(manifest.root.endsWith('/'));
});

test('the embedding set is empty because the code pins no file of it, only the folder it is served from', async () => {
  const manifest = await buildModelsManifest();
  assert.deepEqual(manifest.embedding, []);
  const config = readFileSync(new URL('../chat/embedding/embedding-config.mjs', import.meta.url), 'utf8');
  assert.ok(!/sha256|bytes/i.test(config), 'if the configuration gains pins, models-manifest.mjs must list them');
});

test('building twice gives the same text, and the app configuration of the caller is left as it was', async () => {
  const before = globalThis.APP_CONFIG;
  const a = modelsManifestText(await buildModelsManifest()), b = modelsManifestText(await buildModelsManifest());
  assert.equal(a, b);
  assert.equal(globalThis.APP_CONFIG, before);
  assert.ok(a.endsWith('}\n') && a.startsWith('{\n  "format"'), '2-space indent and a trailing newline');
});

test('the command prints the manifest, and writes it with --out', async () => {
  const expected = modelsManifestText(await buildModelsManifest());
  assert.equal(execFileSync('node', ['scripts/models-manifest.mjs'], {encoding: 'utf8', maxBuffer: 1 << 26}), expected);
  const dir = mkdtempSync(path.join(tmpdir(), 'plc-models-'));
  try {
    const out = path.join(dir, 'models.json');
    execFileSync('node', ['scripts/models-manifest.mjs', '--out', out]);
    assert.equal(readFileSync(out, 'utf8'), expected);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('negative control: the command refuses arguments it does not know', () => {
  assert.throws(() => execFileSync('node', ['scripts/models-manifest.mjs', '--bogus'], {stdio: 'pipe'}), (e) => e.status === 2 && /Usage/.test(String(e.stderr)));
});

test('negative control: one changed byte count is a different manifest, and the baseline comparison notices it', async () => {
  const manifest = await buildModelsManifest();
  const changed = structuredClone(manifest);
  changed.tiers.nano[0].bytes += 1;
  assert.notEqual(modelsManifestText(changed), modelsManifestText(manifest));
  assert.match(disagreement(changed), /missing or different/);
  const wrongHash = structuredClone(manifest);
  wrongHash.voices['kokoro-82m-v1.0-q8'][0].sha256 = '0'.repeat(64);
  assert.match(disagreement(wrongHash), /missing or different/);
});

test('negative control: the baseline comparison fails when one entry is removed from either side', async () => {
  const manifest = await buildModelsManifest();
  const fewer = structuredClone(manifest);
  fewer.tiers.mini.pop();
  assert.match(disagreement(fewer), /missing or different in the manifest/);
  assert.match(disagreement(manifest, baselineFiles().slice(1)), /not in the baseline/);
});
