// The operator's tools (scripts/operator.mjs, scripts/plc.mjs, the options of scripts/serve.mjs; docs/RUN-IT.md): install, upgrade, roll back, check and prune an operator
// folder. Releases here are small ones made by tests/helpers/operator-fixtures.mjs, not the real build, except in the one test that says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync, renameSync, lstatSync, readlinkSync, symlinkSync, appendFileSync, copyFileSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {execFileSync, spawn, spawnSync} from 'node:child_process';
import {upgrade, rollback, check, prune, readCurrent, installedReleases, compareVersions, carryHeldBuilds, Refusal} from '../scripts/operator.mjs';
import {packageRelease, writeSums} from '../scripts/package-release.mjs';
import {startServer} from '../scripts/serve.mjs';
import {makeRelease, zipRelease, tree, commitOf, scratchDir, removeDir, sha256} from './helpers/operator-fixtures.mjs';

const scratch = scratchDir();
test.after(() => removeDir(scratch));
let n = 0;
const fresh = (name) => { const dir = path.join(scratch, `${name}-${++n}`); mkdirSync(dir, {recursive: true}); return dir; };

// releases 1..6: versions 0.1.0 .. 0.6.0 of the runkit target, commit n = commitOf(n)
const releases = {};
async function release(i, extra = {}) {
  const key = i + JSON.stringify(extra);
  releases[key] ||= makeRelease({dir: fresh('rel'), version: `0.${i}.0`, target: 'runkit', commit: commitOf(i), ...extra});
  return releases[key];
}
/** A private copy of a release folder, for a test that damages it. */
async function copyOf(i, extra) {
  const src = await release(i, extra);
  const dst = path.join(fresh('copy'), path.basename(src));
  const walk = (a, b) => { mkdirSync(b, {recursive: true}); for (const e of readdirSync(a, {withFileTypes: true})) e.isDirectory() ? walk(path.join(a, e.name), path.join(b, e.name)) : copyFileSync(path.join(a, e.name), path.join(b, e.name)); };
  walk(src, dst);
  return dst;
}
const lines = () => { const out = []; out.log = (l) => out.push(l); return out; };
const rootWith = async (...ids) => { const root = path.join(fresh('root'), 'plc'); for (const i of ids) await upgrade({root, source: await release(i)}); return root; };
const relDir = (root, i, target = 'runkit') => path.join(root, 'releases', `0.${i}.0-${target}`);
const heldOf = (root, i) => JSON.parse(readFileSync(path.join(relDir(root, i), 'app', 'releases', 'index.json'), 'utf8'));
const buildDirIn = (root, i, c) => path.join(relDir(root, i), 'app', 'releases', commitOf(c));
const leftovers = (root) => readdirSync(path.join(root, 'releases')).filter((f) => f.startsWith('.incoming-'));
const refusal = async (promise, pattern) => assert.rejects(promise, (error) => { assert.ok(error instanceof Refusal, 'is a refusal: ' + error); assert.match(error.message, pattern); return true; });

// ---- versions ------------------------------------------------------------------------------------------------------------------------------------------
test('compareVersions orders X.Y.Z and puts a prerelease below the same version', () => {
  const order = ['0.9.0', '0.10.0', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '2.0.0'];
  for (let i = 0; i < order.length; i++) for (let j = 0; j < order.length; j++) assert.equal(Math.sign(compareVersions(order[i], order[j])), Math.sign(i - j), `${order[i]} vs ${order[j]}`);
  assert.throws(() => compareVersions('1.0', '1.0.0'), /not a version/);
});

// ---- first install ---------------------------------------------------------------------------------------------------------------------------------------
function assertFirstInstall(root, i) {
  const current = readCurrent(root);
  assert.deepEqual([current.release, current.version, current.target, current.commit, current.previous], [`0.${i}.0-runkit`, `0.${i}.0`, 'runkit', commitOf(i), null]);
  assert.ok(!Number.isNaN(Date.parse(current.switchedAt)));
  assert.equal(JSON.parse(readFileSync(path.join(root, 'current.json'), 'utf8')).format, 'plc-current/1');
  for (const d of ['releases', 'config', 'pages', 'models']) assert.ok(lstatSync(path.join(root, d)).isDirectory(), d);
  for (const d of ['config', 'pages', 'models']) assert.match(readFileSync(path.join(root, d, 'README.txt'), 'utf8'), /\S/, d + '/README.txt');
  assert.ok(existsSync(path.join(root, 'plc.mjs')), 'the launcher');
  assert.match(readFileSync(path.join(root, 'plc.mjs'), 'utf8'), /^\/\/ launcher-format: 1/);
  assert.deepEqual(JSON.parse(readFileSync(path.join(current.appDir, 'releases', 'index.json'), 'utf8')), {current: commitOf(i), retained: []});
  assert.equal(readlinkSync(path.join(root, 'current')), path.join('releases', `0.${i}.0-runkit`));
  assert.deepEqual(leftovers(root), []);
  assert.deepEqual(installedReleases(root).map((r) => r.release), [`0.${i}.0-runkit`]);
}

test('a first install from an unpacked folder makes the layout, the record, the launcher and the index', async () => {
  const root = path.join(fresh('root'), 'new', 'plc'); // the root does not exist yet
  const out = lines();
  const result = await upgrade({root, source: await release(1), log: out.log});
  assertFirstInstall(root, 1);
  assert.deepEqual(result, {changed: true, release: '0.1.0-runkit', previous: null, kept: [], left_out: []});
  assert.match(out.join('\n'), /Installed 0\.1\.0-runkit/);
  assert.match(out.at(-1), /restart/i, 'the last line says the server may restart');
  assert.deepEqual(tree(path.join(root, 'releases', '0.1.0-runkit')), tree(await release(1)), 'the release is installed byte for byte');
});

test('a first install from a zip with its SHA256SUMS does the same', async () => {
  const root = path.join(fresh('root'), 'plc');
  const zip = await zipRelease(await release(1), path.join(fresh('zip'), 'private-local-chat-0.1.0-runkit.zip'));
  await upgrade({root, source: zip});
  assertFirstInstall(root, 1);
  assert.deepEqual(tree(path.join(root, 'releases', '0.1.0-runkit')), tree(await release(1)));
});

test('an operator\'s own folders are not touched by a later install, and their READMEs are written once', async () => {
  const root = await rootWith(1);
  writeFileSync(path.join(root, 'config', 'README.txt'), 'mine');
  writeFileSync(path.join(root, 'pages', 'notes.txt'), 'mine');
  const before = {config: tree(path.join(root, 'config')), pages: tree(path.join(root, 'pages')), models: tree(path.join(root, 'models'))};
  await upgrade({root, source: await release(2)});
  assert.deepEqual({config: tree(path.join(root, 'config')), pages: tree(path.join(root, 'pages')), models: tree(path.join(root, 'models'))}, before);
});

// ---- upgrade, the carry-over ------------------------------------------------------------------------------------------------------------------------------
test('upgrade 1 to 2 makes 2 current, keeps 1 as previous, carries 1\'s build and leaves 1\'s folder unchanged', async () => {
  const root = await rootWith(1);
  const before = tree(relDir(root, 1));
  const result = await upgrade({root, source: await release(2)});
  const current = readCurrent(root);
  assert.deepEqual([current.release, current.previous, current.commit], ['0.2.0-runkit', '0.1.0-runkit', commitOf(2)]);
  assert.deepEqual(result, {changed: true, release: '0.2.0-runkit', previous: '0.1.0-runkit', kept: [commitOf(1)], left_out: []});
  assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: [commitOf(1)]});
  assert.deepEqual(tree(buildDirIn(root, 2, 1)), tree(buildDirIn(root, 1, 1)), 'the carried build is byte for byte the original');
  assert.deepEqual(tree(relDir(root, 1)), before, 'the first release is unchanged');
  assert.equal(readlinkSync(path.join(root, 'current')), path.join('releases', '0.2.0-runkit'));
});

test('builds are held four at a time: the oldest is dropped when a fifth arrives', async () => {
  const root = await rootWith(1, 2, 3);
  assert.deepEqual(heldOf(root, 3), {current: commitOf(3), retained: [commitOf(2), commitOf(1)]}, 'two earlier builds');
  await upgrade({root, source: await release(4)});
  assert.deepEqual(heldOf(root, 4), {current: commitOf(4), retained: [commitOf(3), commitOf(2), commitOf(1)]}, 'three earlier builds: four held');
  const result = await upgrade({root, source: await release(5)});
  assert.deepEqual(heldOf(root, 5), {current: commitOf(5), retained: [commitOf(4), commitOf(3), commitOf(2)]});
  assert.deepEqual(result.kept, [commitOf(4), commitOf(3), commitOf(2)]);
  assert.deepEqual(result.left_out.map((l) => l.commit), [commitOf(1)]);
  assert.ok(!existsSync(buildDirIn(root, 5, 1)), 'the oldest build was not copied');
  assert.ok(existsSync(buildDirIn(root, 4, 1)), 'and is still in the release that held it');
});

test('carryHeldBuilds refuses a path that escapes in a release.json, and keeps what it can verify', async () => {
  const from = path.join(await copyOf(1), 'app'), toDir = await copyOf(2);
  const manifest = path.join(from, 'releases', commitOf(1), 'release.json');
  const doc = JSON.parse(readFileSync(manifest, 'utf8'));
  doc.files.push({path: '../../../escape.txt', bytes: 1, sha256: sha256('x')});
  writeFileSync(manifest, JSON.stringify(doc));
  const out = lines();
  const result = carryHeldBuilds({fromApp: from, toApp: path.join(toDir, 'app'), toCommit: commitOf(2), log: out.log});
  assert.deepEqual(result.kept, []);
  assert.match(result.left_out[0].reason, /not allowed/);
  assert.ok(!existsSync(path.join(toDir, 'app', 'releases', commitOf(1))));
  assert.ok(!existsSync(path.join(path.dirname(toDir), 'escape.txt')));
  assert.ok(!readdirSync(path.join(toDir, 'app', 'releases')).some((f) => f.startsWith('.tmp-')), 'no temporary folder is left');
});

test('a tampered file in a held build is left out of the carry-over, said so, and the upgrade completes', async () => {
  const root = await rootWith(1);
  appendFileSync(path.join(buildDirIn(root, 1, 1), 'assets', 'main.js'), '// tampered');
  const out = lines();
  const result = await upgrade({root, source: await release(2), log: out.log});
  assert.equal(result.changed, true);
  assert.deepEqual(result.kept, []);
  assert.equal(result.left_out[0].commit, commitOf(1));
  assert.match(out.join('\n'), /Left out build 0101010.*main\.js/);
  assert.ok(!existsSync(buildDirIn(root, 2, 1)));
  assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: []});
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
});

test('a tampered file in the incoming release refuses the upgrade at the check step and changes nothing', async () => {
  const root = await rootWith(1);
  const before = tree(root);
  const bad = await copyOf(2);
  appendFileSync(path.join(bad, 'app', 'releases', commitOf(2), 'assets', 'main.js'), 'x');
  const seen = [];
  const hooks = Object.fromEntries(['start', 'extract', 'verify', 'carry', 'check', 'rename'].map((s) => [s, () => seen.push(s)]));
  await refusal(upgrade({root, source: bad, hooks}), /does not check out.*main\.js/s);
  assert.deepEqual(seen, ['start', 'extract', 'verify', 'carry'], 'it stopped at the check step');
  assert.deepEqual(tree(root), before);
  assert.deepEqual(leftovers(root), [], 'a refusal removes its own incoming folder');
});

test('an incoming release with a removed header rule is refused', async () => {
  const root = await rootWith(1);
  const bad = await copyOf(2);
  const file = path.join(bad, 'app', '_headers');
  writeFileSync(file, readFileSync(file, 'utf8').replace('  Cross-Origin-Embedder-Policy: require-corp\n', ''));
  await refusal(upgrade({root, source: bad}), /_headers lacks "Cross-Origin-Embedder-Policy: require-corp"/);
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
});

// ---- checksum and the zip ---------------------------------------------------------------------------------------------------------------------------------
test('a zip needs its checksum: SHA256SUMS or --sha256; a wrong one is refused, the right one by option is accepted', async () => {
  const dir = fresh('zip');
  const zip = await zipRelease(await release(1), path.join(dir, 'private-local-chat-0.1.0-runkit.zip'));
  const sums = readFileSync(path.join(dir, 'SHA256SUMS'), 'utf8');
  const good = sums.split(' ')[0];
  const root = path.join(fresh('root'), 'plc');
  rmSync(path.join(dir, 'SHA256SUMS'));
  await refusal(upgrade({root, source: zip}), /no checksum.*SHA256SUMS.*--sha256.*sha256sum -c.*docs\/RELEASING\.md/s);
  assert.ok(!existsSync(root), 'a refusal before anything is checked creates nothing');
  await refusal(upgrade({root, source: zip, sha256: 'ab'.repeat(32)}), /does not match its checksum/);
  await refusal(upgrade({root, source: zip, sha256: 'not hex'}), /64 hexadecimal digits/);
  writeFileSync(path.join(dir, 'SHA256SUMS'), `${'cd'.repeat(32)}  private-local-chat-0.1.0-runkit.zip\n`);
  await refusal(upgrade({root, source: zip}), /does not match its checksum/);
  writeFileSync(path.join(dir, 'SHA256SUMS'), `${good}  some-other-file.zip\n`);
  await refusal(upgrade({root, source: zip}), /no checksum/);
  await refusal(upgrade({root, source: zip, sha256: 'ab'.repeat(32), force: true}), /does not match its checksum/); // --force does not skip it
  assert.equal(readCurrent(root), null);
  await upgrade({root, source: zip, sha256: good.toUpperCase()});
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
});

test('a zip with a path that escapes is refused by the reader, and nothing is left behind', async () => {
  const dir = fresh('zip');
  const {makeZip} = await import('../scripts/package-release.mjs');
  const zip = path.join(dir, 'private-local-chat-0.1.0-runkit.zip');
  writeFileSync(zip, makeZip([{name: 'private-local-chat-0.1.0-runkit/../../evil.txt', data: Buffer.from('x'), mode: 0o644}], 1762927272));
  await writeSums(dir, [path.basename(zip)]);
  const root = await rootWith(1);
  const before = tree(root);
  await refusal(upgrade({root, source: zip}), /cannot be installed/);
  assert.deepEqual(tree(root), before);
  assert.deepEqual(leftovers(root), []);
  assert.ok(!existsSync(path.join(dir, '..', 'evil.txt')));
});

test('a zip that holds two folders, or one with another name, is refused', async () => {
  const dir = fresh('zip');
  const {makeZip} = await import('../scripts/package-release.mjs');
  const root = path.join(fresh('root'), 'plc');
  const a = path.join(dir, 'a.zip'), b = path.join(dir, 'b.zip');
  writeFileSync(a, makeZip([{name: 'private-local-chat-0.1.0-runkit/x', data: Buffer.from('x'), mode: 0o644}, {name: 'other/y', data: Buffer.from('y'), mode: 0o644}], 1762927272));
  writeFileSync(b, makeZip([{name: 'something/x', data: Buffer.from('x'), mode: 0o644}], 1762927272));
  await refusal(upgrade({root, source: a, sha256: sha256(readFileSync(a))}), /exactly one folder/);
  await refusal(upgrade({root, source: b, sha256: sha256(readFileSync(b))}), /exactly one folder/);
  assert.deepEqual(leftovers(root), []);
});

// ---- the refusals of the verify step, each with its negative control ------------------------------------------------------------------------------------------
test('a folder whose name, version.json, compat.json or build disagree is refused, and --force does not change that', async () => {
  const root = await rootWith(1);
  const mutate = async (i, change) => { const dir = await copyOf(i); change(dir); return dir; };
  const json = (dir, file, edit) => { const p = path.join(dir, file); const doc = JSON.parse(readFileSync(p, 'utf8')); edit(doc); writeFileSync(p, JSON.stringify(doc)); };
  const cases = [
    ['version.json has another version', (d) => json(d, 'app/version.json', (v) => { v.version = '0.9.9'; }), /named for version 0\.2\.0.*says 0\.9\.9/],
    ['compat.json has another format', (d) => json(d, 'compat.json', (v) => { v.format = 'plc-compat/9'; }), /compat\.json has format/],
    ['compat.json has another version', (d) => json(d, 'compat.json', (v) => { v.version = '0.3.0'; }), /compat\.json names another version or commit/],
    ['compat.json has another commit', (d) => json(d, 'compat.json', (v) => { v.commit = commitOf(77); }), /compat\.json names another version or commit/],
    ['release.json of the build is missing', (d) => rmSync(path.join(d, 'app', 'releases', commitOf(2), 'release.json')), /release\.json is missing/],
    ['compat.json is missing', (d) => rmSync(path.join(d, 'compat.json')), /compat\.json is missing/],
    ['serve.mjs is missing', (d) => rmSync(path.join(d, 'serve.mjs')), /serve\.mjs is missing/]
  ];
  for (const [name, change, pattern] of cases) {
    const bad = await mutate(2, change);
    await refusal(upgrade({root, source: bad}), pattern);
    await refusal(upgrade({root, source: bad, force: true}), pattern); // force overrides only target, downgrade and stepping stone
    assert.equal(readCurrent(root).release, '0.1.0-runkit', name);
    assert.deepEqual(leftovers(root), [], name);
  }
  const wrongName = path.join(fresh('odd'), 'private-local-chat-0.2.0-runkit-extra');
  mkdirSync(wrongName);
  await refusal(upgrade({root, source: wrongName}), /unpacked release is called/);
  await upgrade({root, source: await mutate(2, () => {})}); // control: the same release unharmed installs
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
});

test('another build under a release name that is installed is refused, even with --force', async () => {
  const root = await rootWith(1);
  const other = await makeRelease({dir: fresh('rel'), version: '0.1.0', target: 'runkit', commit: commitOf(50)});
  await refusal(upgrade({root, source: other}), /already installed with another build/);
  await refusal(upgrade({root, source: other, force: true}), /already installed with another build/);
  assert.equal(readCurrent(root).commit, commitOf(1));
});

test('a change of target is refused unless --force', async () => {
  const root = await rootWith(1);
  const app = await makeRelease({dir: fresh('rel'), version: '0.2.0', target: 'app', commit: commitOf(12)});
  await refusal(upgrade({root, source: app}), /app release, and 0\.1\.0-runkit \(the runkit one\) is installed.*--force/s);
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
  await upgrade({root, source: app, force: true});
  assert.deepEqual([readCurrent(root).release, readCurrent(root).previous], ['0.2.0-app', '0.1.0-runkit']);
});

test('an older version is refused (use rollback) unless --force; a prerelease is older than its version', async () => {
  const root = await rootWith(3);
  await refusal(upgrade({root, source: await release(2)}), /older than the installed 0\.3\.0-runkit.*--rollback/s);
  await upgrade({root, source: await release(2), force: true});
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
  const pre = await makeRelease({dir: fresh('rel'), version: '0.2.0-rc.1', target: 'runkit', commit: commitOf(21)});
  await refusal(upgrade({root, source: pre}), /older than the installed 0\.2\.0-runkit/);
  const next = await makeRelease({dir: fresh('rel'), version: '0.3.0-rc.1', target: 'runkit', commit: commitOf(22)}); // control: a newer prerelease is fine
  await upgrade({root, source: next});
  assert.equal(readCurrent(root).release, '0.3.0-rc.1-runkit');
});

test('a release that cannot upgrade from the installed version names the stepping stone, and --force overrides', async () => {
  const root = await rootWith(1);
  const far = await copyOf(5);
  const compatFile = path.join(far, 'compat.json');
  const compat = JSON.parse(readFileSync(compatFile, 'utf8'));
  compat.upgradesFrom.oldest = '0.3.0';
  writeFileSync(compatFile, JSON.stringify(compat));
  await refusal(upgrade({root, source: far}), /0\.3\.0 or newer.*0\.1\.0 is installed.*release between them/s);
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
  await upgrade({root, source: await release(3)}); // the stepping stone
  await upgrade({root, source: far}); // control: from 0.3.0 it is accepted
  assert.equal(readCurrent(root).release, '0.5.0-runkit');
  const root2 = await rootWith(1);
  await upgrade({root: root2, source: far, force: true});
  assert.equal(readCurrent(root2).release, '0.5.0-runkit');
});

test('the operator folder may not be inside the release folder being installed', async () => {
  const folder = await copyOf(1);
  await refusal(upgrade({root: path.join(folder, 'root'), source: folder}), /inside the release folder/);
});

// ---- idempotence and interrupted runs -----------------------------------------------------------------------------------------------------------------------
test('installing the current release again changes nothing and says so', async () => {
  const root = await rootWith(1, 2);
  const before = tree(root);
  const current = readFileSync(path.join(root, 'current.json'), 'utf8');
  const out = lines();
  const result = await upgrade({root, source: await release(2), log: out.log});
  assert.equal(result.changed, false);
  assert.match(out.join('\n'), /already installed and live.*nothing to do/);
  assert.equal(readFileSync(path.join(root, 'current.json'), 'utf8'), current);
  assert.deepEqual(tree(root), before);
});

test('a release installed but never made live (a run stopped after the rename) is completed by the next run', async () => {
  const root = await rootWith(1);
  await assert.rejects(upgrade({root, source: await release(2), hooks: {rename: () => { throw new Error('died'); }}}), /died/);
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
  assert.ok(existsSync(relDir(root, 2)), 'the folder is there');
  const result = await upgrade({root, source: await release(2)});
  assert.equal(result.changed, true);
  assert.deepEqual([readCurrent(root).release, readCurrent(root).previous], ['0.2.0-runkit', '0.1.0-runkit']);
  assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: [commitOf(1)]});
  assert.ok(existsSync(buildDirIn(root, 2, 1)), 'the carry-over was completed');
  assert.deepEqual(leftovers(root), []);
  assert.equal((await check({root})).ok, true);
});

test('a stopped run whose folder does not check out is not switched to', async () => {
  const root = await rootWith(1);
  await assert.rejects(upgrade({root, source: await release(2), hooks: {rename: () => { throw new Error('died'); }}}), /died/);
  appendFileSync(path.join(buildDirIn(root, 2, 2), 'assets', 'main.js'), 'x');
  await refusal(upgrade({root, source: await release(2)}), /installed but does not check out.*Remove that folder/s);
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
});

const UPGRADE_STEPS = ['start', 'extract', 'verify', 'carry', 'carry-copy', 'check', 'rename', 'switch-before', 'switch-after'];
for (const step of UPGRADE_STEPS) {
  test(`a run that dies at "${step}" leaves a root that works, and the next run completes it`, async () => {
    const root = await rootWith(1);
    const live = tree(relDir(root, 1));
    let called = 0;
    const hooks = {[step]: ({root: r, release: rel}) => { called++; assert.equal(r, root); if (step !== 'start' || rel) assert.equal(rel, '0.2.0-runkit'); throw new Error('process died at ' + step); }};
    await assert.rejects(upgrade({root, source: await release(2), hooks}), new RegExp('died at ' + step));
    assert.equal(called, 1, 'the hook ran');
    const switched = step === 'switch-after'; // the record is written just before this point
    const current = readCurrent(root);
    assert.equal(current.release, switched ? '0.2.0-runkit' : '0.1.0-runkit');
    assert.deepEqual(tree(relDir(root, 1)), live, 'the files of the live release are what they were');
    const health = await check({root});
    assert.equal(health.ok, true, health.problems.join('; '));
    const result = await upgrade({root, source: await release(2)});
    assert.equal(result.changed, !switched);
    assert.deepEqual([readCurrent(root).release, readCurrent(root).previous], ['0.2.0-runkit', '0.1.0-runkit']);
    assert.deepEqual(leftovers(root), [], 'a leftover incoming folder is gone');
    assert.ok(existsSync(path.join(root, 'plc.mjs')));
    assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: [commitOf(1)]});
    assert.equal((await check({root})).ok, true);
    assert.deepEqual(tree(relDir(root, 1)), live);
  });
}

test('a first install that dies at each step leaves an empty-looking root that the next run completes', async () => {
  for (const step of ['start', 'extract', 'verify', 'carry', 'check', 'rename', 'switch-before', 'switch-after']) {
    const root = path.join(fresh('root'), 'plc');
    await assert.rejects(upgrade({root, source: await release(1), hooks: {[step]: () => { throw new Error('died'); }}}), /died/);
    assert.equal(readCurrent(root) === null, step !== 'switch-after', step);
    await upgrade({root, source: await release(1)});
    assertFirstInstall(root, 1);
  }
});

// ---- rollback ---------------------------------------------------------------------------------------------------------------------------------------------
test('rollback goes to the previous release, carries the newer one\'s builds into it, and can go forward again', async () => {
  const root = await rootWith(1, 2);
  const newer = tree(relDir(root, 2));
  const result = await rollback({root});
  assert.deepEqual(result, {changed: true, release: '0.1.0-runkit', previous: '0.2.0-runkit', kept: [commitOf(2)], left_out: []});
  const current = readCurrent(root);
  assert.deepEqual([current.release, current.previous, current.commit], ['0.1.0-runkit', '0.2.0-runkit', commitOf(1)]);
  assert.ok(existsSync(buildDirIn(root, 1, 2)), 'the build only the newer release had is now in the older one');
  assert.deepEqual(tree(buildDirIn(root, 1, 2)), tree(buildDirIn(root, 2, 2)));
  assert.deepEqual(heldOf(root, 1), {current: commitOf(1), retained: [commitOf(2)]});
  assert.deepEqual(tree(relDir(root, 2)), newer, 'the release that was left is unchanged');
  assert.equal(readlinkSync(path.join(root, 'current')), path.join('releases', '0.1.0-runkit'));
  assert.equal((await check({root})).ok, true);
  await rollback({root}); // previous is now the newer one
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
});

test('rollback to a named version or release name, and a rollback into a release that already holds builds keeps them', async () => {
  const root = await rootWith(1, 2, 3);
  await rollback({root, to: '0.1.0'});
  assert.equal(readCurrent(root).release, '0.1.0-runkit');
  assert.deepEqual(heldOf(root, 1), {current: commitOf(1), retained: [commitOf(3), commitOf(2)]});
  await rollback({root, to: '0.3.0-runkit'});
  assert.equal(readCurrent(root).release, '0.3.0-runkit');
  await rollback({root, to: '0.2.0'});
  assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: [commitOf(3), commitOf(1)]}, 'its own earlier build stays, the new ones come first');
  assert.equal((await check({root})).ok, true);
});

test('rollback refuses: the current release, one that is not installed, an ambiguous version, nothing to go back to, nothing installed', async () => {
  const root = await rootWith(1);
  await refusal(rollback({root}), /nothing to go back to/);
  await upgrade({root, source: await release(2)});
  await refusal(rollback({root, to: '0.2.0'}), /live already/);
  await refusal(rollback({root, to: '0.2.0-runkit'}), /live already/);
  await refusal(rollback({root, to: '0.9.0'}), /not installed.*0\.1\.0-runkit, 0\.2\.0-runkit/);
  await refusal(rollback({root: path.join(fresh('empty'), 'plc')}), /Nothing is installed/);
  const before = tree(root);
  const app1 = await makeRelease({dir: fresh('rel'), version: '0.1.0', target: 'app', commit: commitOf(31)});
  await upgrade({root, source: app1, force: true});
  const app3 = await makeRelease({dir: fresh('rel'), version: '0.3.0', target: 'app', commit: commitOf(33)});
  await upgrade({root, source: app3});
  await refusal(rollback({root, to: '0.1.0'}), /more than one target.*0\.1\.0-app.*0\.1\.0-runkit|more than one target.*0\.1\.0-runkit.*0\.1\.0-app/);
  await rollback({root, to: '0.1.0-app'}); // control: named in full
  assert.equal(readCurrent(root).release, '0.1.0-app');
  assert.notDeepEqual(tree(root), before);
});

test('rollback refuses a release that does not check out and changes nothing', async () => {
  const root = await rootWith(1, 2);
  appendFileSync(path.join(buildDirIn(root, 1, 1), 'assets', 'main.js'), 'x');
  const before = tree(root);
  await refusal(rollback({root}), /does not check out.*main\.js/s);
  assert.deepEqual(tree(root), before);
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
});

for (const step of ['start', 'verify', 'check', 'carry-copy', 'carry', 'switch-before', 'switch-after']) {
  test(`a rollback that dies at "${step}" leaves a root that works, and the next one completes it`, async () => {
    const root = await rootWith(1, 2);
    await assert.rejects(rollback({root, hooks: {[step]: () => { throw new Error('process died at ' + step); }}}), new RegExp('died at ' + step));
    const switched = step === 'switch-after';
    assert.equal(readCurrent(root).release, switched ? '0.1.0-runkit' : '0.2.0-runkit');
    const health = await check({root});
    assert.equal(health.ok, true, health.problems.join('; '));
    if (!switched) await rollback({root});
    assert.equal(readCurrent(root).release, '0.1.0-runkit');
    assert.equal(readCurrent(root).previous, '0.2.0-runkit');
    assert.ok(existsSync(buildDirIn(root, 1, 2)));
    assert.equal((await check({root})).ok, true);
  });
}

// ---- check ----------------------------------------------------------------------------------------------------------------------------------------------------
test('a healthy root is ok and says what it uses', async () => {
  const root = await rootWith(1, 2);
  const out = lines();
  const result = await check({root, log: out.log});
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.join('\n'), /Live: 0\.2\.0-runkit/);
  assert.match(result.notes.join('\n'), /source this release ships/);
  assert.match(out.at(-1), /Healthy/);
});

const damages = [
  ['a changed file in the current build', (root) => appendFileSync(path.join(buildDirIn(root, 2, 2), 'assets', 'main.js'), 'x'), /build 0202020: assets\/main\.js has a different size/],
  ['a changed file of the same size', (root) => { const f = path.join(buildDirIn(root, 2, 2), 'assets', 'data.bin'); const b = readFileSync(f); b[0] ^= 1; writeFileSync(f, b); }, /assets\/data\.bin has changed/],
  ['a missing file', (root) => unlinkSync(path.join(buildDirIn(root, 2, 2), 'sub', 'dir', 'notes.txt')), /sub\/dir\/notes\.txt is missing/],
  ['a changed file in a held build', (root) => appendFileSync(path.join(buildDirIn(root, 2, 1), 'assets', 'main.js'), 'x'), /build 0101010: assets\/main\.js has a different size/],
  ['a removed held build', (root) => rmSync(buildDirIn(root, 2, 1), {recursive: true}), /build 0101010: its folder .* is missing/],
  ['a removed header rule', (root) => { const f = path.join(relDir(root, 2), 'app', '_headers'); writeFileSync(f, readFileSync(f, 'utf8').replace('  Cross-Origin-Opener-Policy: same-origin\n', '')); }, /_headers lacks "Cross-Origin-Opener-Policy: same-origin" for \/\*/],
  ['a missing _headers', (root) => unlinkSync(path.join(relDir(root, 2), 'app', '_headers')), /_headers cannot be read/],
  ['an invalid config/app-config.json', (root) => writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify({format: 'plc-app-config/1', modelSources: []})), /config\/app-config\.json: modelSources must be a list/],
  ['a config/app-config.json that is not JSON', (root) => writeFileSync(path.join(root, 'config', 'app-config.json'), '{'), /config\/app-config\.json is not valid JSON/],
  ['an invalid config/site.json', (root) => writeFileSync(path.join(root, 'config', 'site.json'), JSON.stringify({format: 'plc-site/1', pages: {nowhere: '/x/'}})), /config\/site\.json: "nowhere" is not a page/],
  ['a page that collides', (root) => { mkdirSync(path.join(root, 'pages', 'brand')); writeFileSync(path.join(root, 'pages', 'brand', 'index.html'), 'x'); }, /pages\/brand has the name of "brand"/],
  ['a page called models', (root) => { mkdirSync(path.join(root, 'pages', 'models')); writeFileSync(path.join(root, 'pages', 'models', 'index.html'), 'x'); }, /pages\/models/],
  ['a changed current.json', (root) => { const f = path.join(root, 'current.json'); writeFileSync(f, readFileSync(f, 'utf8').replace(commitOf(2), commitOf(9))); }, /app\/version\.json says commit 0202020, not 0909090/],
  ['a current.json that names no folder', (root) => { const f = path.join(root, 'current.json'); const d = JSON.parse(readFileSync(f, 'utf8')); d.release = '0.8.0-runkit'; d.version = '0.8.0'; writeFileSync(f, JSON.stringify(d)); }, /releases\/0\.8\.0-runkit does not exist/],
  ['a current.json that is not JSON', (root) => writeFileSync(path.join(root, 'current.json'), 'oops'), /not valid JSON/],
  ['no current.json', (root) => unlinkSync(path.join(root, 'current.json')), /Nothing is installed/],
  ['a release folder without a valid version.json', (root) => writeFileSync(path.join(relDir(root, 2), 'app', 'version.json'), '{}'), /not a valid release/]
];
for (const [name, damage, pattern] of damages) {
  test(`check is not ok with ${name}, and says which`, async () => {
    const healthy = await rootWith(1, 2);
    assert.equal((await check({root: healthy})).ok, true, 'control: the root was healthy before the damage');
    damage(healthy);
    const out = lines();
    const result = await check({root: healthy, log: out.log});
    assert.equal(result.ok, false);
    assert.ok(result.problems.some((p) => pattern.test(p)), `${pattern} in ${JSON.stringify(result.problems)}`);
    assert.match(out.join('\n'), /PROBLEM: /);
    assert.match(out.at(-1), /Not healthy/);
  });
}

test('check reports at most ten problem files per build and the count', async () => {
  const root = await rootWith(1);
  const dir = buildDirIn(root, 1, 1);
  const manifest = path.join(dir, 'release.json');
  const doc = JSON.parse(readFileSync(manifest, 'utf8'));
  for (let i = 0; i < 14; i++) doc.files.push({path: `gone/${i}.txt`, bytes: 1, sha256: sha256('x')});
  writeFileSync(manifest, JSON.stringify(doc));
  const result = await check({root});
  const mine = result.problems.filter((p) => p.startsWith('build 0101010'));
  assert.equal(mine.length, 11);
  assert.match(mine.at(-1), /4 more files/);
});

test('check says which source and links a valid operator file gives, and a page that replaces help is fine', async () => {
  const root = await rootWith(1);
  writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'mine', label: 'My disk', base: '/models/'}]}));
  writeFileSync(path.join(root, 'config', 'site.json'), JSON.stringify({format: 'plc-site/1', pages: {help: '/help/', privacy: '/privacy/'}}));
  for (const name of ['help', 'privacy', 'office']) { mkdirSync(path.join(root, 'pages', name)); writeFileSync(path.join(root, 'pages', name, 'index.html'), name); }
  mkdirSync(path.join(root, 'pages', 'no-index')); // not a page: it has no index.html
  const result = await check({root});
  assert.equal(result.ok, true, result.problems.join('; '));
  const notes = result.notes.join('\n');
  assert.match(notes, /Model files will come from My disk \(\/models\/\)/);
  assert.match(notes, /Links will be those of config\/site\.json: help -> \/help\/, privacy -> \/privacy\//);
  assert.match(notes, /Pages: help, office, privacy\./);
});

test('check counts model files per tier, and --deep checks each SHA-256', async () => {
  const root = await rootWith(1);
  const files = {'a/1/x.bin': Buffer.from('xxxx'), 'a/1/y.bin': Buffer.from('yyyyyy'), 'b/1/z.bin': Buffer.from('zz')};
  const entry = (p) => ({path: p, bytes: files[p].length, sha256: sha256(files[p])});
  writeFileSync(path.join(relDir(root, 1), 'models.json'), JSON.stringify({format: 'plc-models/1', root: '/', tiers: {one: [entry('a/1/x.bin'), entry('a/1/y.bin')], two: [entry('b/1/z.bin')]}, voices: {}, embedding: []}));
  let result = await check({root});
  assert.equal(result.ok, true);
  assert.match(result.notes.join('\n'), /No models\/ folder|0 of 2/);
  mkdirSync(path.join(root, 'models', 'a', '1'), {recursive: true});
  writeFileSync(path.join(root, 'models', 'a', '1', 'x.bin'), files['a/1/x.bin']);
  writeFileSync(path.join(root, 'models', 'a', '1', 'y.bin'), Buffer.from('YYYYYY')); // right size, wrong bytes
  result = await check({root});
  assert.equal(result.ok, true, 'a shallow check looks at sizes');
  assert.match(result.notes.join('\n'), /Models, one: 2 of 2 files present with the right size\./);
  assert.match(result.notes.join('\n'), /Models, two: 0 of 1 files present/);
  result = await check({root, deep: true});
  assert.equal(result.ok, false);
  assert.ok(result.problems.some((p) => /models\/a\/1\/y\.bin has the right size but its SHA-256 differs/.test(p)));
  assert.match(result.notes.join('\n'), /Models, one: 1 of 2 files present and verified/);
  writeFileSync(path.join(root, 'models', 'a', '1', 'y.bin'), files['a/1/y.bin']);
  assert.equal((await check({root, deep: true})).ok, true);
});

test('a leftover incoming folder is a note, not a problem, and the next command removes it', async () => {
  const root = await rootWith(1);
  mkdirSync(path.join(root, 'releases', '.incoming-0.2.0-runkit-1-1'));
  const result = await check({root});
  assert.equal(result.ok, true);
  assert.match(result.notes.join('\n'), /\.incoming-0\.2\.0-runkit-1-1/);
  await upgrade({root, source: await release(2)});
  assert.deepEqual(leftovers(root), []);
});

test('a wrong "current" link is a note, not a problem', async () => {
  const root = await rootWith(1, 2);
  rmSync(path.join(root, 'current'));
  symlinkSync(path.join('releases', '0.1.0-runkit'), path.join(root, 'current'));
  const result = await check({root});
  assert.equal(result.ok, true);
  assert.match(result.notes.join('\n'), /"current" link points to releases\/0\.1\.0-runkit/);
  rmSync(path.join(root, 'current'));
  assert.equal((await check({root})).ok, true, 'no link at all is fine');
});

test('--online makes exactly one request for the release list with one header; offline it never does; a failure is a note', async () => {
  const root = await rootWith(1);
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push([url, options]); return {ok: true, status: 200, json: async () => ({tag_name: 'v0.9.0'})}; };
  let result = await check({root, fetchImpl});
  assert.equal(calls.length, 0, 'not asked for');
  result = await check({root, online: false, fetchImpl});
  assert.equal(calls.length, 0);
  result = await check({root, online: true, fetchImpl});
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'https://api.github.com/repos/johnbenac/privatelocalchat/releases/latest');
  assert.deepEqual(calls[0][1].headers, {'User-Agent': 'private-local-chat-check'});
  assert.equal(result.ok, true);
  assert.match(result.notes.join('\n'), /A newer release exists: 0\.9\.0 \(installed: 0\.1\.0\)/);
  result = await check({root, online: true, fetchImpl: async () => ({ok: true, json: async () => ({tag_name: 'v0.1.0'})})});
  assert.match(result.notes.join('\n'), /newest release/);
  for (const failing of [async () => { throw new Error('network down'); }, async () => ({ok: false, status: 403}), async () => ({ok: true, json: async () => ({})})]) {
    result = await check({root, online: true, fetchImpl: failing});
    assert.equal(result.ok, true, 'a failed request is never a problem');
    assert.match(result.notes.join('\n'), /Could not read the release list/);
  }
});

// ---- prune --------------------------------------------------------------------------------------------------------------------------------------------------
test('prune removes the oldest installed releases, never the live one or the one before it, and nothing else', async () => {
  const root = await rootWith(1, 2, 3, 4, 5);
  mkdirSync(path.join(root, 'releases', 'not-a-release'));
  writeFileSync(path.join(root, 'releases', 'not-a-release', 'keep.txt'), 'x');
  mkdirSync(path.join(root, 'releases', '0.0.1-runkit')); // named like a release but holds none
  writeFileSync(path.join(root, 'releases', '0.0.1-runkit', 'keep.txt'), 'x');
  mkdirSync(path.join(root, 'releases', '.incoming-x'));
  const out = lines();
  const result = await prune({root, keep: 3, log: out.log});
  assert.deepEqual(result.removed, ['0.1.0-runkit', '0.2.0-runkit']);
  assert.deepEqual(installedReleases(root).map((r) => r.release), ['0.3.0-runkit', '0.4.0-runkit', '0.5.0-runkit']);
  for (const kept of ['not-a-release/keep.txt', '0.0.1-runkit/keep.txt']) assert.ok(existsSync(path.join(root, 'releases', kept)), kept);
  assert.match(out.join('\n'), /Removed 0\.1\.0-runkit/);
  const second = await prune({root, keep: 1, log: out.log});
  assert.deepEqual(second.removed, ['0.3.0-runkit'], 'the live and the previous release stay even when keep is lower');
  assert.deepEqual(installedReleases(root).map((r) => r.release), ['0.4.0-runkit', '0.5.0-runkit']);
  assert.equal((await prune({root, keep: 5})).removed.length, 0);
  assert.equal(readCurrent(root).release, '0.5.0-runkit');
  assert.equal((await check({root})).ok, true);
  await rollback({root}); // the previous one still works
  assert.equal(readCurrent(root).release, '0.4.0-runkit');
});

test('prune validates --keep and needs an installed root', async () => {
  const root = await rootWith(1, 2);
  for (const bad of [0, -1, 1.5, NaN, '2', undefined === 1]) await refusal(prune({root, keep: bad}), /--keep must be a whole number/);
  assert.deepEqual(installedReleases(root).length, 2);
  await refusal(prune({root: path.join(fresh('empty'), 'plc'), keep: 2}), /Nothing is installed/);
});

// ---- the launcher ---------------------------------------------------------------------------------------------------------------------------------------------
test('plc.mjs runs the installed release\'s serve.mjs with --root, passes the exit code on, and explains a first install', () => {
  const root = fresh('launcher');
  copyFileSync('scripts/plc.mjs', path.join(root, 'plc.mjs'));
  const empty = spawnSync(process.execPath, [path.join(root, 'plc.mjs')], {encoding: 'utf8'});
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, /No release is installed.*node serve\.mjs --upgrade \. --root /s);
  mkdirSync(path.join(root, 'releases', '1.0.0-app'), {recursive: true});
  writeFileSync(path.join(root, 'current.json'), JSON.stringify({release: '1.0.0-app'}));
  writeFileSync(path.join(root, 'releases', '1.0.0-app', 'serve.mjs'), 'console.log(JSON.stringify(process.argv.slice(2)));\nprocess.exit(process.argv.includes("--fail") ? 7 : 0);\n');
  const ran = spawnSync(process.execPath, [path.join(root, 'plc.mjs'), '--port', '1234'], {encoding: 'utf8'});
  assert.equal(ran.status, 0);
  assert.deepEqual(JSON.parse(ran.stdout), ['--port', '1234', '--root', root]);
  assert.equal(spawnSync(process.execPath, [path.join(root, 'plc.mjs'), '--fail'], {encoding: 'utf8'}).status, 7);
  const own = spawnSync(process.execPath, [path.join(root, 'plc.mjs'), '--root', '/elsewhere'], {encoding: 'utf8'});
  assert.equal(own.status, 1);
  assert.match(own.stderr, /leave out --root/);
  unlinkSync(path.join(root, 'releases', '1.0.0-app', 'serve.mjs'));
  assert.equal(spawnSync(process.execPath, [path.join(root, 'plc.mjs')], {encoding: 'utf8'}).status, 1);
});

test('plc.mjs passes a termination signal on to the server it started', async () => {
  const root = fresh('launcher');
  copyFileSync('scripts/plc.mjs', path.join(root, 'plc.mjs'));
  mkdirSync(path.join(root, 'releases', '1.0.0-app'), {recursive: true});
  writeFileSync(path.join(root, 'current.json'), JSON.stringify({release: '1.0.0-app'}));
  writeFileSync(path.join(root, 'releases', '1.0.0-app', 'serve.mjs'), 'process.on("SIGTERM",()=>{console.log("got term");process.exit(3);});console.log("up");setInterval(()=>{},1000);\n');
  const child = spawn(process.execPath, [path.join(root, 'plc.mjs')], {stdio: ['ignore', 'pipe', 'inherit']});
  let out = '';
  const exited = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  await new Promise((resolve) => child.stdout.on('data', (d) => { out += d; if (out.includes('up')) resolve(); }));
  child.kill('SIGTERM'); // the launcher this test started
  assert.equal(await exited, 3);
  assert.match(out, /got term/);
});

test('an upgrade writes the launcher when there is none, and replaces only one with a lower launcher-format', async () => {
  const root = await rootWith(1);
  const file = path.join(root, 'plc.mjs');
  const shipped = readFileSync('scripts/plc.mjs', 'utf8');
  assert.equal(readFileSync(file, 'utf8'), shipped);
  writeFileSync(file, '// launcher-format: 0\nold');
  await upgrade({root, source: await release(2)});
  assert.equal(readFileSync(file, 'utf8'), shipped, 'a lower format is replaced');
  writeFileSync(file, '// launcher-format: 9\nnewer');
  await upgrade({root, source: await release(3)});
  assert.equal(readFileSync(file, 'utf8'), '// launcher-format: 9\nnewer', 'a higher format is left');
  rmSync(file);
  await rollback({root});
  assert.equal(readFileSync(file, 'utf8'), shipped, 'a rollback restores a missing launcher');
});

// ---- the real release -----------------------------------------------------------------------------------------------------------------------------------------
test('a real release packed from this commit installs from its zip and checks out', async () => {
  const work = path.join(process.cwd(), `.tmp-operator-${process.pid}-${Date.now()}`); // the build writes inside the repository
  mkdirSync(work);
  try {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
    const out = path.join(fresh('real'), 'assets');
    const zip = await packageRelease({target: 'runkit', version: '0.0.1', commit: head, outDir: out, workDir: work});
    await writeSums(out, [path.basename(zip)]);
    const root = path.join(fresh('root'), 'plc');
    const result = await upgrade({root, source: zip});
    assert.equal(result.release, '0.0.1-runkit');
    assert.equal(readCurrent(root).commit, head);
    const health = await check({root, deep: true});
    assert.equal(health.ok, true, health.problems.join('; '));
    // and a real release can be checked against the operator's own settings, with the release's own validators
    writeFileSync(path.join(root, 'config', 'app-config.json'), JSON.stringify({format: 'plc-app-config/1', modelSources: [{id: 'this-host', label: 'This computer', base: '/models/'}]}));
    const again = await check({root});
    assert.equal(again.ok, true, again.problems.join('; '));
    assert.match(again.notes.join('\n'), /Model files will come from This computer/);
  } finally { rmSync(work, {recursive: true, force: true}); }
});

// ---- the command line ----------------------------------------------------------------------------------------------------------------------------------------
const serveJs = path.resolve('scripts/serve.mjs');
const run = (args, options = {}) => spawnSync(process.execPath, [serveJs, ...args], {encoding: 'utf8', ...options});

test('serve.mjs --root with --upgrade, --check, --rollback and --prune: output and exit codes', async () => {
  const root = path.join(fresh('root'), 'plc');
  const r1 = await release(1), r2 = await release(2);
  let r = run(['--root', root, '--upgrade', r1]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Installed 0\.1\.0-runkit/);
  assert.equal(r.stderr, '');
  r = run(['--root', root, '--check']);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Healthy/);
  r = run(['--root', root, '--upgrade', r2]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
  r = run(['--root', root, '--rollback']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rolled back from 0\.2\.0-runkit to 0\.1\.0-runkit/);
  r = run(['--root', root, '--rollback', '0.2.0']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readCurrent(root).release, '0.2.0-runkit');
  r = run(['--root', root, '--prune', '--keep', '1']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Nothing to remove|Removed/);
  // a failed check exits 1
  appendFileSync(path.join(buildDirIn(root, 2, 2), 'assets', 'main.js'), 'x');
  r = run(['--root', root, '--check']);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PROBLEM: build 0202020: assets\/main\.js has a different size/);
  // the installed tool does the installing too
  r = spawnSync(process.execPath, [path.join(root, 'plc.mjs'), '--check'], {encoding: 'utf8'});
  assert.equal(r.status, 1);
});

test('a refusal on the command line is a plain message on standard error and exit 1, with no stack', async () => {
  const root = path.join(fresh('root'), 'plc');
  const refused = (args, pattern) => { const r = run(args); assert.equal(r.status, 1, args.join(' ')); assert.match(r.stderr, pattern, args.join(' ')); assert.ok(!/\n\s+at /.test(r.stderr), 'no stack'); assert.equal(r.stdout, ''); };
  refused(['--root', root, '--upgrade', path.join(root, 'nothing.zip')], /does not exist/);
  const empty = run(['--root', root, '--check']); // a failed check reports on standard output, as every check does
  assert.equal(empty.status, 1);
  assert.match(empty.stdout, /PROBLEM: Nothing is installed/);
  refused(['--root', root, '--rollback'], /Nothing is installed/);
  refused(['--root', root], /Nothing is installed.*node serve\.mjs --upgrade \. --root/s);
  refused(['--root', root, '--upgrade', 'a', '--check'], /one command at a time/);
  refused(['--root', root, '--rollback', '--prune'], /one command at a time/);
  refused(['--upgrade', 'a'], /needs --root/);
  refused(['--check'], /needs --root/);
  refused(['--root', root, '--sha256', 'ab'], /goes with --upgrade only/);
  refused(['--root', root, '--check', '--force'], /goes with --upgrade only/);
  refused(['--root', root, '--upgrade', 'a', '--deep'], /goes with --check only/);
  refused(['--root', root, '--check', '--keep', '2'], /goes with --prune only/);
  refused(['--root', root, '--check', '--port', '99'], /do not go with --check/);
  refused(['--root', root, '--dir', 'x'], /does not go with --root/);
  refused(['--root', root, '--upgrade'], /needs a value|needs a release/);
  refused(['--root', root, '--check', 'extra'], /not an option/);
  refused(['--root', root, '--check', '--check'], /given twice/);
  refused(['--root', root, '--prune', '--keep', '0'], /Nothing is installed|--keep must be/);
});

test('--prune --keep is validated on the command line before anything is removed', async () => {
  const root = await rootWith(1, 2, 3);
  for (const bad of ['0', '-1', '1.5', 'abc', '']) {
    const r = run(['--root', root, '--prune', '--keep', bad]);
    assert.equal(r.status, 1, JSON.stringify(bad));
    assert.match(r.stderr, /--keep/);
  }
  assert.equal(installedReleases(root).length, 3);
  const ok = run(['--root', root, '--prune', '--keep', '2']);
  assert.equal(ok.status, 0);
  assert.equal(installedReleases(root).length, 2);
});

test('serve.mjs --root with no command serves the live release\'s app; without --root it is the server it always was', async () => {
  const root = await rootWith(1);
  const child = spawn(process.execPath, [serveJs, '--root', root, '--port', '0'], {stdio: ['ignore', 'pipe', 'pipe']});
  try {
    let out = '';
    const port = await new Promise((resolve, reject) => { child.stdout.on('data', (d) => { out += d; const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(out); if (m) resolve(Number(m[1])); }); child.on('exit', () => reject(new Error('server exited: ' + out))); });
    assert.match(out, /Live release: 0\.1\.0-runkit/);
    const response = await fetch(`http://127.0.0.1:${port}/version.json`);
    assert.equal(JSON.parse(await response.text()).commit, commitOf(1));
    assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
  } finally { child.kill(); }
  const legacy = run(['--dir', '/nonexistent-folder-for-test', '--port', '0']);
  assert.equal(legacy.status, 1);
  assert.match(legacy.stderr, /is not a build: it has no _headers file/);
});

// ---- a damaged current.json ----------------------------------------------------------------------------------------------------------------------------------
// The file is only a pointer. Installing a release again must recover from it, and every other command must say so instead of looping on the same refusal.
const goodRecord = (root) => JSON.parse(readFileSync(path.join(root, 'current.json'), 'utf8'));
const DAMAGES = {
  'not JSON': () => '{not json',
  'JSON but not an object': () => '[1, 2]\n',
  'a wrong format': (r) => JSON.stringify({...r, format: 'plc-current/9'}),
  'a release that names no folder': (r) => JSON.stringify({...r, release: '0.9.0-runkit', version: '0.9.0'}),
  'a commit that is not 40 hex': (r) => JSON.stringify({...r, commit: 'abc123'})
};
const damage = (root, how) => { const bytes = DAMAGES[how](goodRecord(root)); writeFileSync(path.join(root, 'current.json'), bytes); return bytes; };
const asides = (root) => readdirSync(root).filter((f) => f.startsWith('current.json.unusable-')).sort();
const ADVICE = /Install a release again to recover: unpack a release and run "node serve\.mjs --upgrade \. --root .*" from it \(docs\/RUN-IT\.md\)\. The damaged file is moved aside, not deleted\./;

for (const how of Object.keys(DAMAGES)) {
  test(`upgrade recovers a current.json that is ${how}: the file is moved aside and the held builds of the newest release come across`, async () => {
    const root = await rootWith(1);
    const before = tree(relDir(root, 1));
    const bytes = damage(root, how);
    const out = lines();
    const result = await upgrade({root, source: await release(2), log: out.log});
    assert.equal(result.changed, true);
    assert.equal(result.previous, null);
    const [aside] = asides(root);
    assert.equal(asides(root).length, 1);
    assert.match(aside, /^current\.json\.unusable-\d{8}T\d{6}Z$/);
    assert.equal(readFileSync(path.join(root, aside), 'utf8'), bytes, 'the original bytes');
    const current = readCurrent(root);
    assert.deepEqual([current.release, current.commit, current.previous], ['0.2.0-runkit', commitOf(2), null]);
    assert.deepEqual(tree(relDir(root, 1)), before, 'the old release folder is untouched');
    assert.deepEqual(heldOf(root, 2), {current: commitOf(2), retained: [commitOf(1)]});
    assert.ok(existsSync(buildDirIn(root, 2, 1)));
    assert.match(out.join('\n'), /current\.json cannot be used/);
    assert.match(out.join('\n'), /moved aside/);
    assert.match(out.join('\n'), /0\.1\.0-runkit/, 'says which release the builds came from');
    const health = await check({root});
    assert.equal(health.ok, true, health.problems.join('; '));
  });
}

test('a recovery takes the held builds of the NEWEST installed release', async () => {
  const root = await rootWith(1, 2);
  damage(root, 'not JSON');
  await upgrade({root, source: await release(3)});
  assert.deepEqual(heldOf(root, 3), {current: commitOf(3), retained: [commitOf(2), commitOf(1)]});
  const root2 = await rootWith(1, 2);
  rmSync(path.join(root2, 'releases', '0.2.0-runkit', 'app', 'releases', commitOf(1)), {recursive: true});
  damage(root2, 'not JSON');
  await upgrade({root: root2, source: await release(3)});
  assert.deepEqual(heldOf(root2, 3), {current: commitOf(3), retained: [commitOf(2)]}, 'only what the newest release held, not the older one\'s folder');
});

test('two recoveries in a row leave two distinct unusable files and delete nothing', async () => {
  const root = await rootWith(1);
  const first = damage(root, 'not JSON');
  await upgrade({root, source: await release(2)});
  const second = damage(root, 'a wrong format');
  await upgrade({root, source: await release(3)});
  const found = asides(root);
  assert.equal(found.length, 2);
  assert.deepEqual(found.map((f) => readFileSync(path.join(root, f), 'utf8')).sort(), [first, second].sort());
  assert.equal(readCurrent(root).release, '0.3.0-runkit');
});

test('a recovery whose time stamp name is taken adds -2', async () => {
  const root = await rootWith(1);
  const real = Date;
  const fixed = new real('2026-11-12T10:20:30.000Z');
  globalThis.Date = class extends real { constructor(...a) { return a.length ? new real(...a) : new real(fixed); } static now() { return fixed.getTime(); } };
  try {
    writeFileSync(path.join(root, 'current.json.unusable-20261112T102030Z'), 'earlier');
    damage(root, 'not JSON');
    await upgrade({root, source: await release(2)});
  } finally { globalThis.Date = real; }
  assert.deepEqual(asides(root), ['current.json.unusable-20261112T102030Z', 'current.json.unusable-20261112T102030Z-2']);
  assert.equal(readFileSync(path.join(root, 'current.json.unusable-20261112T102030Z'), 'utf8'), 'earlier');
});

test('upgrade to the release that is already installed, after a damage, finishes by switching to it', async () => {
  const root = await rootWith(1);
  damage(root, 'not JSON');
  const result = await upgrade({root, source: await release(1)});
  assert.equal(result.changed, true);
  const current = readCurrent(root);
  assert.deepEqual([current.release, current.previous], ['0.1.0-runkit', null]);
  assert.equal(asides(root).length, 1);
  assert.equal((await check({root})).ok, true);
});

for (const step of UPGRADE_STEPS) {
  test(`a recovery upgrade that dies at "${step}" leaves every release sound and the next upgrade completes`, async () => {
    const root = await rootWith(1);
    const live = tree(relDir(root, 1));
    damage(root, 'not JSON');
    await assert.rejects(upgrade({root, source: await release(2), hooks: {[step]: () => { throw new Error('process died at ' + step); }}}), new RegExp('died at ' + step));
    assert.deepEqual(tree(relDir(root, 1)), live, 'the installed release is untouched');
    for (const r of installedReleases(root)) assert.deepEqual(checkApp0(r), [], r.release);
    await upgrade({root, source: await release(2)});
    assert.equal(readCurrent(root).release, '0.2.0-runkit');
    assert.deepEqual(leftovers(root), []);
    assert.equal((await check({root})).ok, true);
    assert.ok(asides(root).length <= 1);
  });
}
// the soundness of an installed release: its files against its release.json (a check of the root needs a current.json, which may be absent here)
function checkApp0(r) {
  const problems = [];
  const index = JSON.parse(readFileSync(path.join(r.appDir, 'releases', 'index.json'), 'utf8'));
  for (const c of [index.current, ...index.retained]) {
    const dir = path.join(r.appDir, 'releases', c);
    for (const f of JSON.parse(readFileSync(path.join(dir, 'release.json'), 'utf8')).files) if (sha256(readFileSync(path.join(dir, f.path))) !== f.sha256) problems.push(f.path);
  }
  return problems;
}

test('rollback, prune, check and serving refuse a damaged current.json with the new advice and leave the file alone', async () => {
  const root = await rootWith(1, 2);
  for (const how of Object.keys(DAMAGES)) {
    const bytes = damage(root, how);
    const before = readdirSync(root).sort();
    await assert.rejects(rollback({root}), (e) => { assert.match(e.message, ADVICE); assert.ok(e.message.includes(root)); return true; });
    await assert.rejects(prune({root}), ADVICE);
    await assert.rejects(startServer({root, port: 0, quiet: true}), ADVICE);
    const health = await check({root});
    assert.equal(health.ok, false);
    assert.match(health.problems.join('\n'), ADVICE);
    const cli = run(['--root', root, '--check']);
    assert.equal(cli.status, 1);
    assert.match(cli.stdout, /PROBLEM: .*current\.json cannot be used/);
    const served = run(['--root', root, '--port', '0']);
    assert.equal(served.status, 1);
    assert.match(served.stderr, ADVICE);
    for (const flag of [['--rollback'], ['--prune']]) { const r = run(['--root', root, ...flag]); assert.equal(r.status, 1); assert.match(r.stderr, ADVICE); }
    assert.equal(readFileSync(path.join(root, 'current.json'), 'utf8'), bytes, 'the file is not changed');
    assert.deepEqual(readdirSync(root).sort(), before, 'nothing is moved aside by these');
  }
});

test('upgrade with a good current.json moves nothing aside', async () => {
  const root = await rootWith(1);
  await upgrade({root, source: await release(2)});
  assert.deepEqual(asides(root), []);
  assert.equal(readCurrent(root).previous, '0.1.0-runkit');
});

test('a refused upgrade of a damaged root changes nothing: the file is moved aside only when the install goes ahead', async () => {
  const root = await rootWith(1);
  const bytes = damage(root, 'not JSON');
  const bad = await copyOf(2);
  appendFileSync(path.join(bad, 'app', 'releases', commitOf(2), 'assets', 'main.js'), 'x');
  await refusal(upgrade({root, source: bad}), /does not check out/);
  assert.equal(readFileSync(path.join(root, 'current.json'), 'utf8'), bytes);
  assert.deepEqual(asides(root), []);
});

test('on the command line, --upgrade recovers a damaged current.json, and the launcher works again', async () => {
  const root = await rootWith(1);
  damage(root, 'not JSON');
  const folder = await release(2);
  const r = spawnSync(process.execPath, [path.join(folder, 'serve.mjs'), '--upgrade', folder, '--root', root], {encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Installed 0\.2\.0-runkit/);
  assert.equal(asides(root).length, 1);
  const c = spawnSync(process.execPath, [path.join(root, 'plc.mjs'), '--check'], {encoding: 'utf8'});
  assert.equal(c.status, 0, c.stdout + c.stderr);
  assert.match(c.stdout, /Healthy/);
});

test('plc.mjs with a damaged current.json prints the advice and exits 1', () => {
  const root = fresh('launcher');
  copyFileSync('scripts/plc.mjs', path.join(root, 'plc.mjs'));
  for (const bytes of ['{not json', 'null', JSON.stringify({release: 5})]) {
    writeFileSync(path.join(root, 'current.json'), bytes);
    for (const args of [[], ['--check'], ['--upgrade', '/nowhere']]) {
      const r = spawnSync(process.execPath, [path.join(root, 'plc.mjs'), ...args], {encoding: 'utf8'});
      assert.equal(r.status, 1, bytes + ' ' + args);
      assert.match(r.stderr, /Install a release again to recover: unpack a release and run "node serve\.mjs --upgrade \. --root .*" from it \(docs\/RUN-IT\.md\)/);
      assert.ok(r.stderr.includes(root));
    }
    assert.equal(readFileSync(path.join(root, 'current.json'), 'utf8'), bytes, 'the launcher changes nothing');
  }
});
