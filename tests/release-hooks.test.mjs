// What the release job runs (scripts/release-hooks.mjs, called from .releaserc.cjs): the assets of a release and the Upgrading notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync, spawnSync} from 'node:child_process';
import {buildCompat, toJson} from '../scripts/compat.mjs';
import {zipName} from '../scripts/package-release.mjs';

const scratch = mkdtempSync(path.join(tmpdir(), 'plc-hooks-'));
test.after(() => rmSync(scratch, {recursive: true, force: true}));
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const VERSION = '0.64.0';
const hooks = (args, options = {}) => spawnSync('node', ['scripts/release-hooks.mjs', ...args], {encoding: 'utf8', ...options});

// ---- the assets ---------------------------------------------------------------------------------------------------------------------------------------
test('prepare writes the two zips, compat.json and SHA256SUMS, and the checksums verify', async () => {
  const out = path.join(scratch, 'assets');
  const run = hooks(['prepare', '--version', VERSION, '--commit', HEAD, '--out', out]);
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(readdirSync(out).sort(), ['SHA256SUMS', 'compat.json', zipName(VERSION, 'app'), zipName(VERSION, 'runkit')].sort());
  assert.equal(run.stdout, '', 'prepare says nothing on standard output');
  assert.equal(spawnSync('sha256sum', ['-c', 'SHA256SUMS'], {cwd: out, encoding: 'utf8'}).status, 0);
  assert.equal(readFileSync(path.join(out, 'compat.json'), 'utf8'), toJson(await buildCompat({version: VERSION, commit: HEAD})));
  for (const target of ['app', 'runkit']) assert.equal(spawnSync('unzip', ['-tq', path.join(out, zipName(VERSION, target))]).status, 0);
  const sums = readFileSync(path.join(out, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split('  ')[1]);
  assert.deepEqual(sums, ['compat.json', zipName(VERSION, 'app'), zipName(VERSION, 'runkit')]);
});

test('negative control: zips that carry something the rules forbid stop the release before SHA256SUMS exists', () => {
  const config = JSON.parse(readFileSync('tests/neutrality.config.json', 'utf8'));
  config.strings.push({id: 'forbidden-for-this-test', pattern: 'Private Local Chat', why: 'every build says this'});
  const file = path.join(scratch, 'strict.json');
  writeFileSync(file, JSON.stringify(config));
  const out = path.join(scratch, 'assets-refused');
  const run = hooks(['prepare', '--version', VERSION, '--commit', HEAD, '--out', out, '--neutrality-config', file]);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /The release zips are not fit to publish/);
  assert.match(run.stderr, /matches the string "forbidden-for-this-test"/);
  assert.ok(!existsSync(path.join(out, 'SHA256SUMS')), 'nothing is listed as publishable');
});

test('prepare refuses a commit that is not checked out, and a missing version', () => {
  const run = hooks(['prepare', '--version', VERSION, '--commit', 'a'.repeat(40), '--out', path.join(scratch, 'assets-wrong')]);
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /not at aaaa/);
  assert.equal(hooks(['prepare', '--commit', HEAD]).status, 2);
  assert.equal(hooks(['unknown', '--version', VERSION, '--commit', HEAD]).status, 2);
});

// ---- the notes ----------------------------------------------------------------------------------------------------------------------------------------
function fakeGh(name, body) {
  const dir = path.join(scratch, 'bin-' + name);
  mkdirSync(dir);
  const file = path.join(dir, 'gh');
  writeFileSync(file, body);
  chmodSync(file, 0o755);
  return file;
}

test('notes print only the Upgrading section, comparing with the previous release when it has a compat.json', async () => {
  const previous = await buildCompat({version: '0.63.0'});
  previous.storedFormats['plc.voice.v2'] = 1; // something that changed since
  const fixture = path.join(scratch, 'previous-compat.json');
  writeFileSync(fixture, toJson(previous));
  const gh = fakeGh('ok', `#!/bin/sh\n# gh release download TAG --repo R --pattern compat.json --dir DIR\necho "$@" > "${scratch}/gh-args.txt"\nwhile [ $# -gt 0 ]; do [ "$1" = "--dir" ] && dir="$2"; shift; done\ncp "${fixture}" "$dir/compat.json"\n`);
  const run = hooks(['notes', '--version', VERSION, '--commit', HEAD, '--last-tag', 'v0.63.0'], {env: {...process.env, RELEASE_GH: gh}});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^## Upgrading\n/);
  assert.match(run.stdout, /What changed since v0\.63\.0\*\*\n\n- Stored format `plc\.voice\.v2` went from format 1 to format 2\./);
  assert.equal(run.stderr, '', 'nothing but the notes is printed when all goes well');
  assert.match(readFileSync(path.join(scratch, 'gh-args.txt'), 'utf8'), /release download v0\.63\.0 --repo johnbenac\/privatelocalchat --pattern compat\.json --dir /);
});

test('notes say this is the first release with a compat.json when the previous release has none, or there is no previous release', () => {
  const failing = fakeGh('missing', '#!/bin/sh\necho "release asset not found" >&2\nexit 1\n');
  for (const args of [['--last-tag', 'v0.63.0'], []]) {
    const run = hooks(['notes', '--version', VERSION, '--commit', HEAD, ...args], {env: {...process.env, RELEASE_GH: failing}});
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /first release with a `compat\.json`/);
    assert.ok(run.stdout.startsWith('## Upgrading\n'), 'the explanation of the missing file went to standard error, not into the notes');
  }
  const run = hooks(['notes', '--version', VERSION, '--commit', HEAD, '--last-tag', 'v0.63.0'], {env: {...process.env, RELEASE_GH: failing}});
  assert.match(run.stderr, /No compat\.json for v0\.63\.0 \(release asset not found\)/);
});

test('notes ignore a previous compat.json that is not one', () => {
  const gh = fakeGh('garbage', `#!/bin/sh\nwhile [ $# -gt 0 ]; do [ "$1" = "--dir" ] && dir="$2"; shift; done\necho '{"format":"other"}' > "$dir/compat.json"\n`);
  const run = hooks(['notes', '--version', VERSION, '--commit', HEAD, '--last-tag', 'v0.63.0'], {env: {...process.env, RELEASE_GH: gh}});
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /first release with a `compat\.json`/);
});
