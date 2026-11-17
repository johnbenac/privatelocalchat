// A copy of the app made for others carries nothing of ours (split stage 7, docs/RELEASING.md).
// The rules are in tests/neutrality.config.json; the scan is scripts/neutrality.mjs. Both targets a person can download are built and scanned, and every kind of
// string the config forbids has a negative control: a file that carries it must fail the scan.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadConfig, inventoryHosts, scanDirectory, evaluate, globToRegExp} from '../scripts/neutrality.mjs';
import {packageRelease, folderName} from '../scripts/package-release.mjs';

const CONFIG_FILE = 'tests/neutrality.config.json';
const config = await loadConfig(CONFIG_FILE);
const known = await inventoryHosts(config.inventory);
const scratch = mkdtempSync(path.join(tmpdir(), 'plc-neutrality-'));
test.after(() => rmSync(scratch, {recursive: true, force: true}));

const root = path.resolve('.'); // the build writes only inside the repository
const buildDirs = [];
test.after(() => { for (const d of buildDirs) rmSync(d, {recursive: true, force: true}); });
function build(target) {
  const dir = mkdtempSync(path.join(root, '.tmp-neutrality-'));
  buildDirs.push(dir);
  const e = {...process.env};
  for (const k of ['TARGET', 'SITE_DIR', 'DEPLOY_BRANCH', 'GITHUB_REF_NAME', 'SITE_JSON_PATH', 'RELEASE_VERSION']) delete e[k];
  execFileSync('node', ['scripts/build.mjs'], {stdio: 'pipe', env: {...e, TARGET: target, GITHUB_SHA: 'a'.repeat(40), SOURCE_DATE_EPOCH: '1', BUILD_OUT_DIR: path.relative(root, dir)}});
  return dir;
}
const folderWith = (name, files) => {
  const dir = path.join(scratch, name);
  for (const [file, text] of Object.entries(files)) { mkdirSync(path.dirname(path.join(dir, file)), {recursive: true}); writeFileSync(path.join(dir, file), text); }
  return dir;
};
const scan = async (dir) => scanDirectory(dir, config, known);

// The release zips of scripts/package-release.mjs, unpacked: the build inside app/ is scanned with the same rules as a build, and the files beside it (the server, README.md,
// SOURCE.txt, the licence documents) with the app folder left out.
const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
let zipScans = null;
async function scanZips() {
  zipScans ||= (async () => {
    const results = [];
    for (const target of config.targets) {
      const zip = await packageRelease({target, version: '0.64.0', commit: HEAD, outDir: path.join(scratch, 'zips')});
      const dir = path.join(scratch, 'unzipped-' + target);
      mkdirSync(dir);
      execFileSync('unzip', ['-q', zip, '-d', dir]);
      const folder = path.join(dir, folderName('0.64.0', target));
      results.push(await scan(path.join(folder, 'app')));
      results.push(await scanDirectory(folder, {...config, skipPaths: [...(config.skipPaths || []), 'app/**']}, known));
    }
    return results;
  })();
  return zipScans;
}

// ---- the real outputs ---------------------------------------------------------------------------------------------------------------------------------
const built = {};
for (const target of config.targets) {
  test(`the ${target} output carries nothing of ours`, async () => {
    built[target] = build(target);
    const result = await scan(built[target]);
    assert.ok(result.files > 100, `only ${result.files} text files were scanned`);
    // an allow-list entry that a single target does not use is checked below over all targets together (the neutral pages exist in one target only)
    const unexplained = evaluate([result], config).filter((line) => !/is not used by anything scanned/.test(line));
    assert.deepEqual(unexplained, [], 'These are not in the allow list of ' + CONFIG_FILE + '. Remove them from the app, or allow them there with a reason:\n' + unexplained.join('\n'));
    assert.ok(result.allowedUsed.size > 0 && result.hostsUsed.size > 0, 'the allow list explains nothing in this output');
  });
}

test('the release zips carry nothing of ours', async () => {
  const results = await scanZips();
  assert.ok(results.length === 2 * config.targets.length && results.every((r) => r.files > 0));
  const unexplained = evaluate(results, config).filter((line) => !/is not used by anything scanned/.test(line));
  assert.deepEqual(unexplained, [], unexplained.join('\n'));
});

test('every allowed entry is used by something in the outputs and the zips, so the list cannot outlive what it explains', async () => {
  const results = [...await scanZips()];
  for (const target of config.targets) results.push(await scan(built[target] || build(target)));
  const stale = evaluate(results, config).filter((line) => /is not used by anything scanned/.test(line));
  assert.deepEqual(stale, []);
});

test('the app output has no neutral pages and runkit has them, so the allow list is read per target', async () => {
  const app = await scan(built.app || build('app')), runkit = await scan(built.runkit || build('runkit'));
  assert.ok(runkit.files > app.files);
});

// ---- the sw.js check that was removed ---------------------------------------------------------------------------------------------------------------------
test('negative control: putting the development-site hostname test back into sw.js fails the scan', async () => {
  const sw = readFileSync(path.join(built.app || build('app'), 'sw.js'), 'utf8');
  assert.deepEqual(evaluate([await scan(folderWith('sw-clean', {'sw.js': sw}))], {...config, allowed: [], allowedHosts: []}), []);
  const withCheck = sw.replace('.filter(file=>DEVELOPMENT_NATIVE||', ".filter(file=>location.hostname==='dev.privatelocal.chat'||");
  assert.notEqual(withCheck, sw, 'the line this control replaces is no longer in sw.js');
  const problems = evaluate([await scan(folderWith('sw-dirty', {'sw.js': withCheck}))], {...config, allowed: [], allowedHosts: []});
  assert.ok(problems.some((p) => /sw\.js: "privatelocal\.chat" matches the string "our-domain"/.test(p)), problems.join('\n'));
});

// ---- one control for each kind of string ----------------------------------------------------------------------------------------------------------------
const SAMPLES = {
  'our-domain': 'fetch("https://privatelocal.chat/x")',
  'our-organisations': '// made by Cyberplanetary',
  'other-organisations': 'const base = "https://models.techofourown.example/";',
  'maintainer-infrastructure': 'const host = "registry.benac.dev";',
  'maintainer-account': 'see github.com/johnbenac/other-project',
  'model-hosts': 'const src = "https://huggingface.co/some/model";',
  'analytics': '<script src="https://static.cloudflareinsights.com/beacon.min.js"></script>',
  'our-pages': '<a href="/privacy/">Privacy</a>'
};
test('every string of the config has a negative control', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), config.strings.map((s) => s.id).sort());
});
for (const [id, sample] of Object.entries(SAMPLES)) {
  test(`negative control: a file carrying "${id}" fails the scan`, async () => {
    const dir = folderWith('control-' + id, {'chat/some-file.mjs': 'export const x = 1;\n' + sample + '\n'});
    const problems = evaluate([await scan(dir)], {...config, allowed: [], allowedHosts: []});
    assert.ok(problems.some((p) => p.includes(`matches the string "${id}"`)), `${id} not caught:\n${problems.join('\n')}`);
  });
}
test('the product name PrivateLocal.Chat is not our domain', async () => {
  const problems = evaluate([await scan(folderWith('product-name', {'index.html': '<title>PrivateLocal.Chat</title>'}))], {...config, allowed: [], allowedHosts: []});
  assert.deepEqual(problems, []);
});

// ---- hosts, the allow list and the config -------------------------------------------------------------------------------------------------------------------
test('negative control: a host that is neither in the network inventory nor allowed fails the scan', async () => {
  const problems = evaluate([await scan(folderWith('unknown-host', {'chat/x.mjs': 'fetch("https://telemetry.unknown-host.test/ping")'}))], {...config, allowed: [], allowedHosts: []});
  assert.ok(problems.some((p) => /telemetry\.unknown-host\.test, which is not in the network inventory/.test(p)), problems.join('\n'));
});
test('a host in the network inventory passes', async () => {
  const host = Object.keys(JSON.parse(readFileSync(config.inventory, 'utf8')).appHosts)[0];
  assert.deepEqual(evaluate([await scan(folderWith('known-host', {'chat/x.mjs': `// https://${host}/docs`}))], {...config, allowed: [], allowedHosts: []}), []);
});
test('negative control: an allowed entry that nothing uses fails', async () => {
  const dir = folderWith('stale', {'chat/x.mjs': 'export const x = 1;'});
  const stale = {...config, allowed: [{string: 'our-domain', paths: ['nothing/here'], why: 'no longer true'}], allowedHosts: []};
  assert.ok(evaluate([await scan(dir)], stale).some((p) => /allowed entry 0 .* is not used by anything scanned/.test(p)));
  const staleHost = {...config, allowed: [], allowedHosts: [{hosts: ['gone.example'], paths: ['x'], why: 'no longer true'}]};
  assert.ok(evaluate([await scan(dir)], staleHost).some((p) => /allowed hosts entry 0 .* is not used by anything scanned/.test(p)));
});
test('negative control: an allowed entry only covers its own paths', async () => {
  const dir = folderWith('elsewhere', {'other/index.html': 'https://assets.privatelocal.chat/models/'});
  const problems = evaluate([await scan(dir)], config);
  assert.ok(problems.some((p) => /other\/index\.html: "privatelocal\.chat" matches the string "our-domain"/.test(p)));
  assert.ok(problems.some((p) => /other\/index\.html: names assets\.privatelocal\.chat/.test(p)));
});
test('an empty folder is a problem, not a pass', async () => {
  mkdirSync(path.join(scratch, 'empty'));
  assert.ok(evaluate([await scan(path.join(scratch, 'empty'))], {...config, allowed: [], allowedHosts: []}).some((p) => /no text files were scanned/.test(p)));
});
test('binary files are not scanned and skipPaths are honoured', async () => {
  const dir = folderWith('binary', {'a/model.bin': 'privatelocal.chat\0\0', 'skip/me.txt': 'privatelocal.chat', 'chat/ok.mjs': 'ok'});
  const withSkip = {...config, skipPaths: ['skip/**'], allowed: [], allowedHosts: []};
  assert.deepEqual(evaluate([await scanDirectory(dir, withSkip, known)], withSkip), []);
});
test('a config without a reason for an allowed entry, or with an unknown string, is refused', async () => {
  const write = (name, value) => { const f = path.join(scratch, name); writeFileSync(f, JSON.stringify(value)); return f; };
  await assert.rejects(loadConfig(write('c1.json', {...config, allowed: [{string: 'our-domain', paths: ['x']}]})), /needs paths and a reason/);
  await assert.rejects(loadConfig(write('c2.json', {...config, allowed: [{string: 'nope', paths: ['x'], why: 'y'}]})), /unknown string/);
  await assert.rejects(loadConfig(write('c3.json', {...config, format: 'other'})), /not a neutrality config/);
});
test('globs: * stays in one folder, ** crosses folders', () => {
  assert.ok(globToRegExp('releases/*/chat/x.mjs').test('releases/abc/chat/x.mjs'));
  assert.ok(!globToRegExp('releases/*/chat/x.mjs').test('releases/a/b/chat/x.mjs'));
  assert.ok(globToRegExp('releases/*/vendor/**').test('releases/abc/vendor/a/b/c.js'));
  assert.ok(globToRegExp('LICENSE').test('LICENSE') && !globToRegExp('LICENSE').test('x/LICENSE'));
});
