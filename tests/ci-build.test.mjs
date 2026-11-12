// The build a CI job runs chooses its target from what is on disk (scripts/ci-build.mjs). The deploy of privatelocal.chat sets REQUIRE_SITE=1 so that a site layer that
// was not fetched stops it instead of publishing the neutral pages (docs/SITE-LAYER.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {chooseBuild} from '../scripts/ci-build.mjs';

const root = path.resolve('.');
const scratch = mkdtempSync(path.join(tmpdir(), 'plc-cibuild-'));
const outDirs = [];
test.after(() => { rmSync(scratch, {recursive: true, force: true}); for (const d of outDirs) rmSync(d, {recursive: true, force: true}); });
const emptySiteFolder = path.join(scratch, 'empty-site');
mkdirSync(emptySiteFolder);

// ---- the decision -------------------------------------------------------------------------------------------------------------------------------------
test('a folder with a site.json is the site layer: the site target, with that folder', () => {
  const choice = chooseBuild({SITE_DIR: 'tests/fixtures/site', DEPLOY_BRANCH: 'main', REQUIRE_SITE: '1'}, root);
  assert.equal(choice.target, 'site');
  assert.deepEqual([choice.env.TARGET, choice.env.SITE_DIR, choice.env.DEPLOY_BRANCH], ['site', 'tests/fixtures/site', 'main']);
  assert.ok(!('REQUIRE_SITE' in choice.env), 'the build script is not told about the guard');
  assert.equal(chooseBuild({SITE_DIR: path.join(root, 'tests/fixtures/site')}, scratch).target, 'site', 'an absolute folder works from anywhere');
});

test('without a site layer the neutral runkit target is built, and SITE_DIR is not passed on', () => {
  for (const env of [{}, {SITE_DIR: ''}, {SITE_DIR: 'does-not-exist'}, {SITE_DIR: emptySiteFolder}]) {
    const choice = chooseBuild(env, root);
    assert.equal(choice.target, 'runkit', JSON.stringify(env));
    assert.equal(choice.env.TARGET, 'runkit');
    assert.ok(!('SITE_DIR' in choice.env));
  }
});

test('negative control: REQUIRE_SITE=1 without a site layer is refused, whether SITE_DIR is unset, missing, or an empty checkout', () => {
  assert.throws(() => chooseBuild({REQUIRE_SITE: '1'}, root), /SITE_DIR is not set: there is no site layer to build\. Nothing is built, so the live site stays as it is/);
  assert.throws(() => chooseBuild({REQUIRE_SITE: '1', SITE_DIR: 'does-not-exist'}, root), /does-not-exist holds no site\.json: the site layer was not fetched/);
  assert.throws(() => chooseBuild({REQUIRE_SITE: '1', SITE_DIR: emptySiteFolder}, root), /holds no site\.json/);
});

test('only REQUIRE_SITE=1 turns the guard on, and a TARGET from outside is refused', () => {
  for (const value of ['', '0', 'true', 'yes']) assert.equal(chooseBuild({REQUIRE_SITE: value}, root).target, 'runkit', 'REQUIRE_SITE=' + value);
  assert.throws(() => chooseBuild({TARGET: 'app'}, root), /chooses the target from the site layer/);
});

// ---- the whole command, building ---------------------------------------------------------------------------------------------------------------------
function run(env) {
  const dir = mkdtempSync(path.join(root, '.tmp-cibuild-'));
  outDirs.push(dir);
  const clean = {...process.env};
  for (const k of ['TARGET', 'SITE_DIR', 'REQUIRE_SITE', 'DEPLOY_BRANCH', 'GITHUB_REF_NAME', 'SITE_JSON_PATH', 'RELEASE_VERSION']) delete clean[k];
  const result = spawnSync('node', ['scripts/ci-build.mjs'], {cwd: root, encoding: 'utf8', env: {...clean, GITHUB_SHA: 'a'.repeat(40), SOURCE_DATE_EPOCH: '1', BUILD_OUT_DIR: path.relative(root, dir), ...env}});
  return {...result, dir};
}

test('with a site layer the command builds the site target from it', () => {
  const r = run({SITE_DIR: 'tests/fixtures/site', REQUIRE_SITE: '1', DEPLOY_BRANCH: 'main'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Building the site target from tests\/fixtures\/site\./);
  assert.equal(JSON.parse(readFileSync(path.join(r.dir, 'version.json'), 'utf8')).environment, 'production');
  assert.ok(existsSync(path.join(r.dir, 'updates', 'index.html')), 'the pages of the site layer are in the output');
  assert.ok(existsSync(path.join(r.dir, 'privacy', 'index.html')), 'a page only the site layer has (the neutral pages are Help and About)');
});

test('without a site layer the command builds the neutral pages, and says so', () => {
  const r = run({SITE_DIR: 'does-not-exist', DEPLOY_BRANCH: 'main'});
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Building the runkit target \(no site layer here\)\./);
  assert.equal(JSON.parse(readFileSync(path.join(r.dir, 'version.json'), 'utf8')).environment, 'release');
  for (const page of ['help', 'about']) assert.ok(existsSync(path.join(r.dir, page, 'index.html')), page);
  assert.ok(!existsSync(path.join(r.dir, 'updates')));
});

test('negative control: with REQUIRE_SITE=1 and no site layer the command fails and builds nothing', () => {
  for (const env of [{SITE_DIR: 'does-not-exist'}, {SITE_DIR: emptySiteFolder}, {}]) {
    const r = run({REQUIRE_SITE: '1', DEPLOY_BRANCH: 'main', ...env});
    assert.notEqual(r.status, 0, JSON.stringify(env));
    assert.match(r.stderr, /REQUIRE_SITE=1, but/);
    assert.ok(!existsSync(path.join(r.dir, 'index.html')), 'nothing was built');
    assert.ok(!existsSync(path.join(r.dir, 'version.json')));
  }
});
