// Stage 0 of the app/site split: the build is reproducible, so its output can be snapshotted and compared, and the hosts the app
// names are an inventory that only changes on purpose. See docs/SPLIT-SNAPSHOT.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildTo, manifestOf, diffManifests, isClean, formatReport, FORMAT, TARGETS} from '../scripts/snapshot.mjs';
import {scan, compareInventories, INVENTORY_FILE} from '../scripts/network-inventory.mjs';

const DIRS = ['work/snapshot/test-a', 'work/snapshot/test-b'];
test.after(() => { for (const dir of DIRS) fs.rmSync(dir, {recursive: true, force: true}); });

test('two builds of the same sources give the same manifest', async () => {
  const [a, b] = DIRS.map((dir) => buildTo(dir));
  const first = await manifestOf(a), second = await manifestOf(b);
  assert.equal(first.format, FORMAT);
  assert.deepEqual(first, second, formatReport(diffManifests(first, second)));
});

test('the build is fixed to the snapshot commit, branch and clock', async () => {
  const dir = buildTo(DIRS[0]);
  const version = JSON.parse(fs.readFileSync(dir + '/version.json', 'utf8'));
  assert.equal(version.commit, TARGETS.runkit.GITHUB_SHA);
  assert.equal(version.branch, 'main');
  assert.equal(version.builtAt, '1970-01-01T00:00:00.000Z');
  const manifest = await manifestOf(dir);
  for (const file of ['index.html', 'version.json', 'sw.js', '_headers', 'help/index.html', 'releases/' + TARGETS.runkit.GITHUB_SHA + '/chat/shell/shell.mjs']) assert.ok(manifest.files[file], file + ' is in the manifest');
  for (const entry of Object.values(manifest.files)) assert.match(entry.sha256, /^[0-9a-f]{64}$/);
});

test('diffManifests reports added, removed and changed files and honours allow globs', () => {
  const m = (files) => ({files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, {bytes: 1, sha256: v}]))});
  const baseline = m({'a.js': '1', 'b.js': '2', 'chat/x.mjs': '3', 'old.txt': '4'});
  const current = m({'a.js': '1', 'b.js': '9', 'chat/x.mjs': '8', 'new.txt': '5'});
  assert.deepEqual(diffManifests(baseline, baseline), {added: [], removed: [], changed: [], allowed: []});
  assert.deepEqual(diffManifests(baseline, current), {added: ['new.txt'], removed: ['old.txt'], changed: ['b.js', 'chat/x.mjs'], allowed: []});
  const allowed = diffManifests(baseline, current, ['chat/*', 'new.txt']);
  assert.deepEqual(allowed, {added: [], removed: ['old.txt'], changed: ['b.js'], allowed: ['chat/x.mjs', 'new.txt']});
  assert.equal(isClean(allowed), false);
  assert.equal(isClean(diffManifests(baseline, current, ['**'])), true);
  assert.match(formatReport(allowed), /Removed \(1\)[\s\S]*old\.txt[\s\S]*Changed, but allowed \(2\)/);
});

test('the committed baselines are well-formed manifests, one per target', () => {
  for (const target of ['runkit', 'site']) {
    const baseline = JSON.parse(fs.readFileSync('docs/evidence/split/' + target + '-baseline.json', 'utf8'));
    assert.equal(baseline.format, FORMAT);
    assert.equal(baseline.target, target);
    assert.deepEqual(baseline.environment, TARGETS[target]);
    assert.equal(baseline.fileCount, Object.keys(baseline.files).length);
    assert.ok(baseline.files['index.html'] && baseline.files['version.json'], target);
  }
});

test('the site target cannot be built without a site directory, and says so', () => {
  const saved = process.env.SITE_DIR; delete process.env.SITE_DIR;
  try { assert.throws(() => buildTo(DIRS[0], {target: 'site'}), /needs SITE_DIR/); } finally { if (saved !== undefined) process.env.SITE_DIR = saved; }
});

test('the network inventory matches the source; a change to it is made on purpose', async () => {
  const committed = JSON.parse(fs.readFileSync(INVENTORY_FILE, 'utf8'));
  const differences = compareInventories(committed, await scan());
  assert.deepEqual(differences, [], 'The hosts or own-origin paths named by the source changed. If that is intended, run: node scripts/network-inventory.mjs write');
});

test('compareInventories names new, moved and removed entries', () => {
  const before = {appHosts: {'a.example': ['x.mjs'], 'b.example': ['y.mjs']}, vendorHosts: {}, ownFetchPaths: {}};
  const after = {appHosts: {'a.example': ['x.mjs', 'z.mjs'], 'c.example': ['y.mjs']}, vendorHosts: {}, ownFetchPaths: {'/version.json': ['i.html']}};
  assert.deepEqual(compareInventories(before, after), [
    'appHosts: a.example moved from [x.mjs] to [x.mjs, z.mjs]',
    'appHosts: b.example is no longer named',
    'appHosts: new entry c.example in y.mjs',
    'ownFetchPaths: new entry /version.json in i.html'
  ]);
});
